// background.js — flow runner (MV3 service worker)

// Demo flow (storage boşsa fallback olarak kullanılır)
const DEFAULT_FLOW = [
  { type: "GoToURL", url: "https://example.com" },
  { type: "Wait", ms: 800 },
  { type: "EnsureAudio", timeoutMs: 60000 },
  { type: "PlaySound" }
];

const OFFSCREEN_DOCUMENT_URL = "offscreen.html";
let offscreenCreationPromise = null;
let activePicker = null;
const STEP_SANITIZERS = {
  GoToURL(step) {
    const url = typeof step.url === "string" ? step.url.trim() : "";
    if (!url) return null;
    return { type: "GoToURL", url };
  },
  Wait(step) {
    const ms = Number(step.ms);
    return { type: "Wait", ms: Number.isFinite(ms) && ms >= 0 ? ms : 1000 };
  },
  Click(step) {
    const selector = typeof step.selector === "string" ? step.selector.trim() : "";
    if (!selector) return null;
    return { type: "Click", selector };
  },
  FillText(step) {
    const selector = typeof step.selector === "string" ? step.selector.trim() : "";
    if (!selector) return null;
    const value = step.value != null ? String(step.value) : "";
    return { type: "FillText", selector, value };
  },
  EnsureAudio(step) {
    const timeout = Number(step.timeoutMs);
    const normalized = { type: "EnsureAudio" };
    if (Number.isFinite(timeout) && timeout > 0) normalized.timeoutMs = timeout;
    return normalized;
  },
  PlaySound() {
    return { type: "PlaySound" };
  }
};

// Mesaj yönlendirici
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "RUN_FLOW") {
    (async () => {
      try {
        console.log("[background] Starting flow...");
        const flow = await fetchActiveFlow();
        if (!flow.length) {
          throw new Error("Flow is empty. Configure steps in the options page.");
        }

        const targetTabId = msg.tabId || (await getActiveTabId());
        if (!targetTabId) {
          sendResponse({ ok: false, error: "No active tab" });
          return;
        }
        await runFlow(flow, targetTabId);
        sendResponse({ ok: true });
      } catch (e) {
        console.error("[background] RUN_FLOW error:", e);
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // async sendResponse için kanalı açık tut
  }

  if (msg.type === "SHOW_NOTIFICATION") {
    // Şimdilik bildirim API'sini çağırmıyoruz (ikon hataları yüzünden)
    try { sendResponse({ ok: true }); } catch {}
    return true;
  }

  if (msg.type === "ENSURE_OFFSCREEN_AUDIO") {
    (async () => {
      const ok = await ensureOffscreenDocument();
      sendResponse({ ok });
    })();
    return true;
  }

  if (msg.type === "PLAY_SOUND_OFFSCREEN") {
    (async () => {
      const ready = await ensureOffscreenDocument();
      if (!ready) {
        sendResponse({ ok: false });
        return;
      }
      try {
        const response = await sendMessageToOffscreen({ type: "OFFSCREEN_PLAY_SOUND", url: chrome.runtime.getURL("assets/done.wav") });
        sendResponse(response ?? { ok: false });
      } catch (err) {
        console.warn("[background] Failed to delegate audio playback:", err);
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }

  if (msg.type === "START_SELECTOR_PICKER") {
    (async () => {
      try {
        const targetTabId = msg.tabId || (await getActiveTabId());
        if (!targetTabId) {
          sendResponse({ ok: false, error: "No active tab" });
          return;
        }
        const url = await getTabUrl(targetTabId);
        if (isForbiddenUrl(url)) {
          sendResponse({ ok: false, error: "Cannot inspect this tab." });
          return;
        }
        await ensureContentScript(targetTabId);
        if (activePicker && activePicker.tabId !== targetTabId) {
          try {
            await chrome.tabs.sendMessage(activePicker.tabId, { type: "CANCEL_PICKER" });
          } catch {}
        }
        const pickerResponse = await chrome.tabs.sendMessage(targetTabId, { type: "START_PICKER", requestId: msg.requestId });
        if (!pickerResponse || pickerResponse.ok === false) {
          sendResponse({ ok: false, error: "Unable to activate picker on this page." });
          return;
        }
        activePicker = { tabId: targetTabId, requestId: msg.requestId || null };
        sendResponse({ ok: true, tabId: targetTabId });
      } catch (err) {
        console.warn("[background] Failed to start selector picker:", err);
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (msg.type === "CANCEL_SELECTOR_PICKER") {
    (async () => {
      try {
        const targetTabId = msg.tabId || activePicker?.tabId || (await getActiveTabId());
        if (!targetTabId) {
          sendResponse({ ok: false, error: "No active tab" });
          return;
        }
        try {
          await chrome.tabs.sendMessage(targetTabId, { type: "CANCEL_PICKER" });
        } catch (err) {
          console.warn("[background] Failed to send cancel picker message:", err);
        }
        if (activePicker && activePicker.tabId === targetTabId) activePicker = null;
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (msg.type === "PICKER_RESULT") {
    if (activePicker && (!msg.requestId || msg.requestId === activePicker.requestId)) {
      activePicker = null;
    }
    try { sendResponse({ ok: true }); } catch {}
    return;
  }
});

async function getActiveTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id || null;
}

async function getTabUrl(tabId) {
  const tab = await chrome.tabs.get(tabId);
  return tab?.url || "";
}

function isForbiddenUrl(url) {
  return /^chrome(|-extension|-error):\/\//i.test(url)
      || /^edge:\/\//i.test(url)
      || /chromewebstore\.google\.com/i.test(url);
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" }); // içerik hazır mı?
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      await wait(100);
      return true;
    } catch (e) {
      console.warn("[background] Failed to inject content.js:", e);
      throw e;
    }
  }
}

async function runFlow(flow, tabId) {
  // read settings
  let settings = { stepDelayMs: 300, selectorWaitMs: 5000 };
  try {
    const s = await chrome.storage.local.get(["settings"]);
    settings = { ...settings, ...(s?.settings || {}) };
  } catch {}

  // notify options to reset statuses
  broadcastToOptions({ type: "FLOW_STATUS", kind: "FLOW_RESET" });

  for (let i = 0; i < flow.length; i++) {
    const step = flow[i];
    console.log("→ Running step:", step.type);
    broadcastToOptions({ type: "FLOW_STATUS", index: i, status: "running" });
    try {
      if (step.type === "GoToURL") {
        await chrome.tabs.update(tabId, { url: step.url });
        await waitForTabLoad(tabId);
        const url = await getTabUrl(tabId);
        if (isForbiddenUrl(url)) throw new Error("Target page is not scriptable: " + url);
        await ensureContentScript(tabId);
      } else {
        await ensureContentScript(tabId);
        const res = await chrome.tabs.sendMessage(tabId, { type: "RUN_STEP", step: { ...step, selectorWaitMs: settings.selectorWaitMs } });
        // optional: evaluate res
      }
      broadcastToOptions({ type: "FLOW_STATUS", index: i, status: "success" });
    } catch (err) {
      console.warn("[background] Step failed:", err);
      broadcastToOptions({ type: "FLOW_STATUS", index: i, status: "error", error: String(err) });
      // stop on error or continue? For now, stop
      throw err;
    }
    const delay = Math.max(0, Number(settings.stepDelayMs) || 0);
    if (delay) await wait(delay);
  }
}

function broadcastToOptions(payload) {
  try {
    chrome.runtime.sendMessage(payload, () => {});
  } catch {}
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function fetchActiveFlow() {
  try {
    const { activeFlow } = await chrome.storage.local.get("activeFlow");
    const sanitized = sanitizeFlowArray(activeFlow);
    if (sanitized.length) return sanitized;
  } catch (err) {
    console.warn("[background] Failed to load stored flow, falling back to default:", err);
  }
  return [...DEFAULT_FLOW];
}

function sanitizeFlowArray(value) {
  if (!Array.isArray(value)) return [];
  const sanitizedSteps = [];
  for (const rawStep of value) {
    const normalized = sanitizeStep(rawStep);
    if (normalized) sanitizedSteps.push(normalized);
  }
  return sanitizedSteps;
}

function sanitizeStep(step) {
  if (!step || typeof step !== "object") return null;
  const type = typeof step.type === "string" ? step.type : "";
  const factory = STEP_SANITIZERS[type];
  if (!factory) return null;
  try {
    return factory(step);
  } catch (err) {
    console.warn("[background] Failed to sanitize step, skipping:", step, err);
    return null;
  }
}

async function ensureOffscreenDocument() {
  const offscreenApi = chrome.offscreen;
  if (!offscreenApi?.createDocument) return false;

  try {
    if (typeof offscreenApi.hasDocument === "function") {
      const hasDoc = await offscreenApi.hasDocument();
      if (hasDoc) return true;
    }
  } catch (err) {
    console.warn("[background] hasDocument check failed:", err);
  }

  if (offscreenCreationPromise) return offscreenCreationPromise;

  offscreenCreationPromise = (async () => {
    try {
      const reasons = offscreenApi.Reasons?.AUDIO_PLAYBACK || "AUDIO_PLAYBACK";
      await offscreenApi.createDocument({
        url: OFFSCREEN_DOCUMENT_URL,
        reasons: [reasons],
        justification: "Play AutoFiller notification sounds."
      });
      return true;
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (msg.toLowerCase().includes("already exists") || msg.toLowerCase().includes("only one offscreen document")) {
        return true;
      }
      console.warn("[background] Unable to create offscreen document:", err);
      return false;
    } finally {
      offscreenCreationPromise = null;
    }
  })();

  return offscreenCreationPromise;
}

function sendMessageToOffscreen(payload) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
