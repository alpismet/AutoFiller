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
let isFlowRunning = false;
let stopRequested = false;
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
    const out = { type: "Click", selector };
    if (step.forceClick !== undefined) out.forceClick = Boolean(step.forceClick);
    return out;
  },
  FillText(step) {
    const selector = typeof step.selector === "string" ? step.selector.trim() : "";
    if (!selector) return null;
    const value = step.value != null ? String(step.value) : "";
    const out = { type: "FillText", selector, value };
    if (step.splitAcrossInputs !== undefined) out.splitAcrossInputs = Boolean(step.splitAcrossInputs);
    if (step.slowType !== undefined) out.slowType = Boolean(step.slowType);
    const d = Number(step.slowTypeDelayMs);
    if (Number.isFinite(d) && d >= 0) out.slowTypeDelayMs = d;
    return out;
  },
  EnsureAudio(step) {
    const timeout = Number(step.timeoutMs);
    const normalized = { type: "EnsureAudio" };
    if (Number.isFinite(timeout) && timeout > 0) normalized.timeoutMs = timeout;
    return normalized;
  },
  PlaySound() {
    return { type: "PlaySound" };
  },
  Restart(step) {
    const m = Number(step.max);
    let max = 1;
    if (Number.isFinite(m)) {
      if (m === -1) max = -1; // infinite
      else if (m > 0) max = Math.floor(m);
    }
    const mode = (typeof step.mode === 'string' && step.mode.toLowerCase() === 'if') ? 'if' : 'flow';
    const idx = Number(step.ifIndex);
    const ifIndex = Number.isFinite(idx) && idx >= 0 ? idx : -1;
    return { type: 'Restart', max, mode, ifIndex };
  },
  SelectFiles(step) {
    const selector = typeof step.selector === "string" ? step.selector.trim() : "";
    if (!selector) return null;
    const out = { type: "SelectFiles", selector };
    const list = Array.isArray(step.files) ? step.files : [];
    out.files = list
      .map((f) => ({
        name: typeof f?.name === "string" ? f.name : "file",
        type: typeof f?.type === "string" ? f.type : "application/octet-stream",
        size: Number(f?.size) || 0,
        dataUrl: typeof f?.dataUrl === "string" && f.dataUrl.startsWith("data:") ? f.dataUrl : ""
      }))
      .filter(f => f.dataUrl);
    if (!out.files.length) return null;
    return out;
  },
  SelectDropdown(step) {
    const controlSelector = typeof step.controlSelector === "string" ? step.controlSelector.trim() : "";
    const optionText = typeof step.optionText === "string" ? step.optionText.trim() : "";
    if (!controlSelector || !optionText) return null;
    const out = { type: "SelectDropdown", controlSelector, optionText };
    if (typeof step.optionItemSelector === "string" && step.optionItemSelector.trim()) out.optionItemSelector = step.optionItemSelector.trim();
    const t = Number(step.timeoutMs);
    if (Number.isFinite(t) && t > 0) out.timeoutMs = t; else out.timeoutMs = 10000;
    return out;
  },
  If(step) {
    const mode = (typeof step.mode === 'string' && step.mode.toLowerCase() === 'visible') ? 'visible' : 'exists';
    const selector = typeof step.selector === 'string' ? step.selector.trim() : '';
    if (!selector) return null;
    const t = Number(step.timeoutMs); const timeoutMs = Number.isFinite(t) && t >= 0 ? t : 0;
    const thenArr = sanitizeFlowArray(Array.isArray(step.then) ? step.then : []);
    const elseArr = sanitizeFlowArray(Array.isArray(step.else) ? step.else : []);
    return { type: 'If', mode, selector, timeoutMs, then: thenArr, else: elseArr };
  },
  
  WaitForEmailGmail(step) {
    const out = { type: "WaitForEmailGmail" };
    out.subject = typeof step.subject === "string" ? step.subject : "";
    const t = Number(step.timeoutMs); out.timeoutMs = Number.isFinite(t) && t > 0 ? t : 120000;
    const p = Number(step.pollMs); out.pollMs = Number.isFinite(p) && p >= 500 ? p : 5000;
    out.variable = typeof step.variable === "string" && step.variable.trim() ? step.variable.trim() : "otp";
    return out;
  }
};

// Mesaj yönlendirici
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "RUN_FLOW") {
    (async () => {
      try {
        console.log("[background] Starting flow...");
        if (isFlowRunning) {
          sendResponse({ ok: false, error: "Flow is already running" });
          return;
        }
        isFlowRunning = true;
        stopRequested = false;
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
      finally {
        isFlowRunning = false;
      }
    })();
    return true; // async sendResponse için kanalı açık tut
  }

  if (msg.type === "QUERY_FLOW_STATE") {
    try { sendResponse({ ok: true, running: Boolean(isFlowRunning) }); } catch {}
    return true;
  }

  if (msg.type === "RUN_SINGLE_STEP") {
    (async () => {
      try {
        const targetTabId = msg.tabId || (await getActiveTabId());
        if (!targetTabId) { sendResponse({ ok: false, error: "No active tab" }); return; }
        const url = await getTabUrl(targetTabId);
        if (isForbiddenUrl(url)) { sendResponse({ ok: false, error: "Forbidden URL" }); return; }
        await ensureContentScript(targetTabId);

        // settings
  let settings = { selectorWaitMs: 5000, useNativeClick: false };
        try { const s = await chrome.storage.local.get(["settings"]); settings = { ...settings, ...(s?.settings || {}) }; } catch {}

        const index = typeof msg.index === "number" ? msg.index : -1;
        if (index >= 0) broadcastToOptions({ type: "FLOW_STATUS", index, status: "running" });
  const step = sanitizeStep(msg.step) || msg.step;
        if (!step) { sendResponse({ ok: false, error: "Invalid step" }); if (index >= 0) broadcastToOptions({ type: "FLOW_STATUS", index, status: "error" }); return; }

        if (step.type === "GoToURL") {
          await chrome.tabs.update(targetTabId, { url: step.url });
          await waitForTabLoad(targetTabId);
          const cur = await getTabUrl(targetTabId);
          if (isForbiddenUrl(cur)) throw new Error("Target page is not scriptable: " + cur);
          await ensureContentScript(targetTabId);
        } else if (step.type === 'Wait') {
          const total = Math.max(0, Number(step.ms) || 1000);
          const until = Date.now() + total;
          let last = -1;
          if (index >= 0) { try { broadcastToOptions({ type: 'FLOW_STATUS', index, status: 'running' }); } catch {} }
          while (Date.now() < until) {
            const remain = Math.ceil((until - Date.now()) / 1000);
            if (remain !== last) {
              last = remain;
              if (index >= 0) {
                try { broadcastToOptions({ type: 'WAIT_COUNTDOWN', index, seconds: Math.max(0, remain) }); } catch {}
              }
            }
            await wait(250);
          }
        } else if (step.type === 'Restart') {
          // Running a single Restart step does not make sense; no-op
          // Respond ok to avoid errors in UI
          sendResponse({ ok: true });
          return;
        } else if (step.type === 'If') {
          await ensureContentScript(targetTabId);
          const res = await chrome.tabs.sendMessage(targetTabId, { type: 'RUN_STEP', step: { type: 'CheckElement', selector: step.selector, mode: step.mode || 'exists', timeoutMs: step.timeoutMs || 0 } });
          const cond = Boolean(res && (res.value === true || res.ok === true && res.value !== false));
          try { if (index >= 0) broadcastToOptions({ type: 'IF_RESULT', index, result: cond ? 'then' : 'else' }); } catch {}
          const branch = cond ? (Array.isArray(step.then) ? step.then : []) : (Array.isArray(step.else) ? step.else : []);
          if (Array.isArray(branch) && branch.length) {
            await runStepsInline(branch, targetTabId, { parentIndex: index, branchKey: cond ? 'then' : 'else', path: [index, (cond ? 'then' : 'else')] });
          }
        } else if (step.type === "WaitForEmailGmail") {
          const res = await waitForEmailGmail(step);
          if (!res?.ok) throw new Error(res?.error || "step_failed");
        } else {
          await ensureContentScript(targetTabId);
          const res = await chrome.tabs.sendMessage(targetTabId, { type: "RUN_STEP", step: { ...step, selectorWaitMs: settings.selectorWaitMs, useNativeClick: settings.useNativeClick, forceClick: Boolean(msg?.step?.forceClick) } });
          if (res && res.ok === false) throw new Error(res.error || "step_failed");
        }
        if (index >= 0) broadcastToOptions({ type: "FLOW_STATUS", index, status: "success" });
        sendResponse({ ok: true });
      } catch (e) {
        console.warn("[background] RUN_SINGLE_STEP error:", e);
        try { if (typeof msg.index === "number") broadcastToOptions({ type: "FLOW_STATUS", index: msg.index, status: "error", error: String(e) }); } catch {}
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
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

  if (msg.type === "STOP_FLOW") {
    (async () => {
      try {
        stopRequested = true;
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
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

  if (msg.type === "GMAIL_CONNECT") {
    (async () => {
      try {
        const res = await gmailConnect(msg.clientId);
        sendResponse(res);
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  if (msg.type === "TEST_WAIT_FOR_EMAIL_GMAIL") {
    (async () => {
      try {
        const out = await waitForEmailGmail({ subject: msg.subject || msg.query || "", timeoutMs: msg.timeoutMs || 60000, pollMs: msg.pollMs || 5000, variable: "otp" });
        sendResponse(out);
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }
});

// Native click fallback via Chrome DevTools Protocol (requires debugger permission)
async function nativeClick(tabId, x, y) {
  // Attach to debugger, dispatch mouse events, then detach
  const target = { tabId };
  try {
    await chrome.debugger.attach(target, "1.3");
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, x: Math.round(x), y: Math.round(y) });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, x: Math.round(x), y: Math.round(y) });
  } catch (err) {
    console.warn("[background] nativeClick failed:", err);
  } finally {
    try { await chrome.debugger.detach(target); } catch {}
  }
}

// Handle native click requests from content
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "NATIVE_CLICK" && sender?.tab?.id && typeof msg.x === "number" && typeof msg.y === "number") {
    (async () => {
      try {
        await nativeClick(sender.tab.id, msg.x, msg.y);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
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
      // try ping again but swallow errors
      try { await chrome.tabs.sendMessage(tabId, { type: "PING" }); } catch {}
      return true;
    } catch (e) {
      console.warn("[background] Failed to inject content.js:", e);
      throw e;
    }
  }
}

async function runFlow(flow, tabId) {
  // read settings
  let settings = { stepDelayMs: 300, selectorWaitMs: 5000, useNativeClick: false };
  try {
    const s = await chrome.storage.local.get(["settings"]);
    settings = { ...settings, ...(s?.settings || {}) };
  } catch {}

  // notify options to reset statuses
  broadcastToOptions({ type: "FLOW_STATUS", kind: "FLOW_RESET" });
  // iteration counter (only broadcast on completion)
  let iterCount = 0;
  let aborted = false;

  for (let i = 0; i < flow.length; i++) {
    const step = flow[i];
    console.log("→ Running step:", step.type);
    broadcastToOptions({ type: "FLOW_STATUS", index: i, status: "running" });
    try {
      if (stopRequested) throw new Error('aborted');
      if (step.type === "GoToURL") {
        await chrome.tabs.update(tabId, { url: step.url });
        await waitForTabLoad(tabId);
        const url = await getTabUrl(tabId);
        if (isForbiddenUrl(url)) throw new Error("Target page is not scriptable: " + url);
        await ensureContentScript(tabId);
      } else if (step.type === 'Wait') {
        const total = Math.max(0, Number(step.ms) || 1000);
        const until = Date.now() + total;
        let last = -1;
        while (Date.now() < until) {
          const remain = Math.ceil((until - Date.now()) / 1000);
          if (remain !== last) {
            last = remain;
            try { broadcastToOptions({ type: 'WAIT_COUNTDOWN', index: i, seconds: Math.max(0, remain) }); } catch {}
          }
          if (stopRequested) throw new Error('aborted');
          await wait(250);
        }
      } else if (step.type === 'Restart') {
        // initialize remaining budget if needed
        if (typeof step._remaining !== 'number') step._remaining = (step.max === -1) ? Infinity : (Number(step.max) || 1);
        if (step._remaining === Infinity || step._remaining > 0) {
          if (step._remaining !== Infinity) step._remaining -= 1;
          // reset statuses and restart from the beginning
          broadcastToOptions({ type: 'FLOW_STATUS', kind: 'FLOW_RESET' });
          if (step.mode === 'if' && Number.isFinite(step.ifIndex) && step.ifIndex >= 0 && step.ifIndex < flow.length && flow[step.ifIndex]?.type === 'If') {
            i = step.ifIndex - 1; // jump to selected If (next loop increments)
          } else {
            i = -1; // flow start
          }
        }
      } else if (step.type === 'If') {
        await ensureContentScript(tabId);
        const res = await chrome.tabs.sendMessage(tabId, { type: 'RUN_STEP', step: { type: 'CheckElement', selector: step.selector, mode: step.mode || 'exists', timeoutMs: step.timeoutMs || 0 } });
        const cond = Boolean(res && (res.value === true || (res.ok === true && res.value !== false)));
        try { broadcastToOptions({ type: 'IF_RESULT', index: i, result: cond ? 'then' : 'else' }); } catch {}
        const branch = cond ? (Array.isArray(step.then) ? step.then : []) : (Array.isArray(step.else) ? step.else : []);
        if (Array.isArray(branch) && branch.length) {
          const outcome = await runStepsInline(branch, tabId, { parentIndex: i, branchKey: cond ? 'then' : 'else', path: [i, (cond ? 'then' : 'else')] });
          if (outcome && outcome.restartRequested) {
            broadcastToOptions({ type: 'FLOW_STATUS', kind: 'FLOW_RESET' });
            if (Number.isFinite(outcome.jumpToIfIndex) && outcome.jumpToIfIndex >= 0 && outcome.jumpToIfIndex < flow.length && flow[outcome.jumpToIfIndex]?.type === 'If') {
              i = outcome.jumpToIfIndex - 1;
            } else {
              i = -1;
            }
          }
        }
      } else {
        await ensureContentScript(tabId);
        let res = null;
        if (step.type === "WaitForEmailGmail") {
          res = await waitForEmailGmail(step);
        } else {
          res = await chrome.tabs.sendMessage(tabId, { type: "RUN_STEP", step: { ...step, selectorWaitMs: settings.selectorWaitMs, useNativeClick: settings.useNativeClick, forceClick: Boolean(step.forceClick) } });
        }
        // optional: evaluate res
      }
      broadcastToOptions({ type: "FLOW_STATUS", index: i, status: "success" });
    } catch (err) {
      console.warn("[background] Step failed:", err);
      broadcastToOptions({ type: "FLOW_STATUS", index: i, status: "error", error: String(err) });
      // stop on error or continue? For now, stop
      aborted = true;
      break;
    }
    const delay = Math.max(0, Number(settings.stepDelayMs) || 0);
    if (delay) await wait(delay);
  }
  if (!aborted) {
    iterCount += 1; try { broadcastToOptions({ type: 'FLOW_ITER', count: iterCount }); } catch {}
  } else {
    try { broadcastToOptions({ type: 'FLOW_ABORT' }); } catch {}
  }
}

async function runStepsInline(steps, tabId, ctx) {
  if (!Array.isArray(steps) || !steps.length) return;
  // read settings
  let settings = { stepDelayMs: 300, selectorWaitMs: 5000, useNativeClick: false };
  try {
    const s = await chrome.storage.local.get(["settings"]);
    settings = { ...settings, ...(s?.settings || {}) };
  } catch {}
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    try {
      if (stopRequested) throw new Error('aborted');
      if (ctx && (typeof ctx.parentIndex === 'number' || Array.isArray(ctx.path))) {
        const path = Array.isArray(ctx.path) ? ctx.path.concat(i) : [ctx.parentIndex, ctx.branchKey || 'then', i];
        try { broadcastToOptions({ type: 'FLOW_NESTED_STATUS', parentIndex: ctx.parentIndex, branch: ctx.branchKey || 'then', childIndex: i, path, status: 'running' }); } catch {}
      }
      if (step.type === 'GoToURL') {
        await chrome.tabs.update(tabId, { url: step.url });
        await waitForTabLoad(tabId);
        const url = await getTabUrl(tabId);
        if (isForbiddenUrl(url)) throw new Error('Target page is not scriptable: ' + url);
        await ensureContentScript(tabId);
      } else if (step.type === 'Wait') {
        const total = Math.max(0, Number(step.ms) || 1000);
        const until = Date.now() + total;
        let last = -1;
        while (Date.now() < until) {
          const remain = Math.ceil((until - Date.now()) / 1000);
          if (remain !== last) {
            last = remain;
            if (ctx && (typeof ctx.parentIndex === 'number' || Array.isArray(ctx.path))) {
              const path = Array.isArray(ctx.path) ? ctx.path.concat(i) : [ctx.parentIndex, ctx.branchKey || 'then', i];
              try { broadcastToOptions({ type: 'WAIT_NESTED_COUNTDOWN', parentIndex: ctx.parentIndex, branch: ctx.branchKey || 'then', childIndex: i, path, seconds: Math.max(0, remain) }); } catch {}
            }
          }
          if (stopRequested) throw new Error('aborted');
          await wait(250);
        }
      } else if (step.type === 'Restart') {
        if (typeof step._remaining !== 'number') step._remaining = (step.max === -1) ? Infinity : (Number(step.max) || 1);
        if (step._remaining === Infinity || step._remaining > 0) {
          if (step._remaining !== Infinity) step._remaining -= 1;
          const jump = (step.mode === 'if' && Number.isFinite(step.ifIndex) && step.ifIndex >= 0) ? step.ifIndex : null;
          if (ctx && (typeof ctx.parentIndex === 'number' || Array.isArray(ctx.path))) {
            const path = Array.isArray(ctx.path) ? ctx.path.concat(i) : [ctx.parentIndex, ctx.branchKey || 'then', i];
            try { broadcastToOptions({ type: 'FLOW_NESTED_STATUS', parentIndex: ctx.parentIndex, branch: ctx.branchKey || 'then', childIndex: i, path, status: 'success' }); } catch {}
          }
          return { restartRequested: true, jumpToIfIndex: jump };
        }
      } else if (step.type === 'If') {
        await ensureContentScript(tabId);
        const res = await chrome.tabs.sendMessage(tabId, { type: 'RUN_STEP', step: { type: 'CheckElement', selector: step.selector, mode: step.mode || 'exists', timeoutMs: step.timeoutMs || 0 } });
        const cond = Boolean(res && (res.value === true || res.ok === true && res.value !== false));
        const branch = cond ? (Array.isArray(step.then) ? step.then : []) : (Array.isArray(step.else) ? step.else : []);
        if (Array.isArray(branch) && branch.length) {
          const path = Array.isArray(ctx.path) ? ctx.path.concat(i, (cond ? 'then' : 'else')) : [ctx.parentIndex, ctx.branchKey || 'then', i, (cond ? 'then' : 'else')];
          const outcome = await runStepsInline(branch, tabId, { ...ctx, path });
          if (outcome && outcome.restartRequested) return { restartRequested: true };
        }
      } else {
        await ensureContentScript(tabId);
        let res = null;
        if (step.type === 'WaitForEmailGmail') {
          res = await waitForEmailGmail(step);
        } else {
          res = await chrome.tabs.sendMessage(tabId, { type: 'RUN_STEP', step: { ...step, selectorWaitMs: settings.selectorWaitMs, useNativeClick: settings.useNativeClick, forceClick: Boolean(step.forceClick) } });
        }
      }
      if (ctx && (typeof ctx.parentIndex === 'number' || Array.isArray(ctx.path))) {
        const path = Array.isArray(ctx.path) ? ctx.path.concat(i) : [ctx.parentIndex, ctx.branchKey || 'then', i];
        try { broadcastToOptions({ type: 'FLOW_NESTED_STATUS', parentIndex: ctx.parentIndex, branch: ctx.branchKey || 'then', childIndex: i, path, status: 'success' }); } catch {}
      }
      const delay = Number(settings.stepDelayMs) || 0;
      if (delay > 0) await wait(delay);
    } catch (err) {
      console.warn('[background] runStepsInline step failed:', err);
      if (ctx && (typeof ctx.parentIndex === 'number' || Array.isArray(ctx.path))) {
        const path = Array.isArray(ctx.path) ? ctx.path.concat(i) : [ctx.parentIndex, ctx.branchKey || 'then', i];
        try { broadcastToOptions({ type: 'FLOW_NESTED_STATUS', parentIndex: ctx.parentIndex, branch: ctx.branchKey || 'then', childIndex: i, path, status: 'error' }); } catch {}
      }
      // continue or break? We mimic main runFlow behavior: continue
      const delay = Number(settings.stepDelayMs) || 0;
      if (delay > 0) await wait(delay);
    }
  }
}

async function gmailConnect(clientId) {
  // Use pathless redirect URI per Google recommendation for extensions
  const REDIRECT_URI = `https://${chrome.runtime.id}.chromiumapp.org/`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "token",
  redirect_uri: REDIRECT_URI,
    scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email openid",
    include_granted_scopes: "true",
    prompt: "consent"
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  const respUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  const hash = new URL(respUrl).hash.replace(/^#/, "");
  const data = new URLSearchParams(hash);
  const access_token = data.get("access_token");
  const expires_in = Number(data.get("expires_in")) || 3600;
  if (!access_token) throw new Error("No access_token");
  const who = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${access_token}` } }).then(r => r.json()).catch(() => ({}));
  const email = who?.email || "unknown";
  const expires_at = Date.now() + expires_in * 1000 - 5000;
  const gmail = { access_token, expires_at, email, client_id: clientId };
  const { settings } = await chrome.storage.local.get(["settings"]);
  const next = { ...(settings || {}), gmailClientId: clientId, gmailConnection: gmail };
  await chrome.storage.local.set({ settings: next });
  return { ok: true, email };
}

async function ensureGmailToken() {
  const { settings } = await chrome.storage.local.get(["settings"]);
  const conn = settings?.gmailConnection;
  if (!conn?.access_token) throw new Error("Gmail not connected");
  if (Date.now() < (conn.expires_at || 0)) return conn.access_token;
  // token expired: require reconnect (or implement refresh if using code flow)
  throw new Error("Gmail token expired. Reconnect.");
}

async function waitForEmailGmail(step) {
  const token = await ensureGmailToken();
  const timeoutMs = Number(step.timeoutMs) || 120000;
  const pollMs = Number(step.pollMs) || 5000;
  const until = Date.now() + timeoutMs;
  const re = /(\d{6})/; // default 6-digit OTP
  const startedAt = Date.now();
  let attempts = 0;
  while (Date.now() < until) {
    attempts++;
    const msg = await gmailFetchLatestByQuery(token, { subject: step.subject || "", newerThanMs: startedAt });
    if (msg) {
      const combined = [msg.snippet || "", msg.body || ""].join("\n");
      const normalized = normalizeTextForOtp(combined);
      // Try several patterns: exact 6 digits, common keywords around code, optional separators, then 4-8 digits fallback
      const patterns = [
        /(\b\d{6}\b)/, // pure 6 digits
        /(?:code|kod|otp|verification|doğrulama|guvenlik)\D{0,20}(\d{6})/i,
        /(\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d)/,
        /(\b\d{4,8}\b)/ // broader fallback
      ];
      let found = null;
      for (const pat of patterns) {
        const m = pat.exec(normalized);
        if (m && m[1]) { found = m[1]; break; }
      }
      if (found) {
        const digits = String(found).replace(/\D/g, "");
        let code = digits.length >= 6 ? digits.slice(-6) : digits;
        await saveVariable(step.variable || "otp", code);
        return { ok: true, value: code };
      }
    }
    await wait(pollMs);
  }
  return { ok: false, error: "code_not_found" };
}

async function gmailFetchLatestByQuery(token, { subject = "", newerThanMs = 0 } = {}) {
  const base = "https://gmail.googleapis.com/gmail/v1/users/me";
  const afterSeconds = newerThanMs ? Math.floor(newerThanMs / 1000) : 0;
  const minutes = Math.max(1, Math.ceil((Date.now() - newerThanMs) / 60000));

  const buildQuery = (includeInbox, mode) => {
    const parts = [];
    if (subject && subject.trim()) parts.push(`subject:(${subject.trim()})`);
    if (mode === 'after' && afterSeconds) parts.push(`after:${afterSeconds}`);
    if (mode === 'newer') parts.push(`newer_than:${minutes}m`);
    if (includeInbox) parts.push(`in:inbox`); else parts.push(`in:anywhere`);
    return parts.join(" ");
  };

  const SKEW_MS = 2000; // allow up to 2s negative skew for provider clock differences
  async function fetchByQuery(q) {
    const listUrl = `${base}/messages?q=${encodeURIComponent(q)}&maxResults=5&includeSpamTrash=true`;
    const list = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    const items = Array.isArray(list?.messages) ? list.messages : [];
    if (!items.length) return [];
    const details = await Promise.all(items.slice(0, 5).map(async (m) => {
      const msg = await fetch(`${base}/messages/${m.id}?format=full`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      const text = extractMessageText(msg);
      const internalDate = Number(msg?.internalDate) || 0;
      const headers = Array.isArray(msg?.payload?.headers) ? msg.payload.headers : [];
      const subj = headers.find(h => (h.name || "").toLowerCase() === "subject")?.value || "";
      const subjectOk = !subject || subj.toLowerCase().includes(subject.toLowerCase());
      const timeOkStrict = !newerThanMs || internalDate >= newerThanMs;
      const timeOkSkew = !newerThanMs || internalDate >= (newerThanMs - SKEW_MS);
      return { id: m.id, snippet: msg?.snippet || "", text, internalDate, subjectOk, timeOkStrict, timeOkSkew };
    }));
    const strict = details.filter(d => d.subjectOk && d.timeOkStrict && (d.text || d.snippet));
    strict.sort((a, b) => b.internalDate - a.internalDate);
    if (strict.length) return strict;
    // As a last resort, allow tiny skew
    const skew = details.filter(d => d.subjectOk && d.timeOkSkew && (d.text || d.snippet));
    skew.sort((a, b) => b.internalDate - a.internalDate);
    return skew;
  }

  // Try high-precision search first with after:SECONDS, prioritizing anywhere (includes trash/spam)
  for (const includeInbox of [false, true]) {
    const qAfter = buildQuery(includeInbox, 'after');
    const res = await fetchByQuery(qAfter);
    if (res.length) {
      const top = res[0];
      return { id: top.id, snippet: top?.snippet || "", body: top?.text || "" };
    }
  }
  // Fallback to minute-based
  for (const includeInbox of [false, true]) {
    const qNewer = buildQuery(includeInbox, 'newer');
    const res = await fetchByQuery(qNewer);
    if (res.length) {
      const top = res[0];
      return { id: top.id, snippet: top?.snippet || "", body: top?.text || "" };
    }
  }
  return null;
}

function extractMessageText(msg) {
  const payload = msg?.payload;
  if (!payload) return "";
  const texts = [];
  const htmls = [];
  const collect = (part) => {
    if (!part) return;
    if (part.parts && Array.isArray(part.parts)) {
      part.parts.forEach(collect);
    }
    const mt = part.mimeType || "";
    const data = part?.body?.data;
    if (!data && !part?.body?.attachmentId) return; // skip empty
    const decoded = data ? decodeBase64UrlToString(data) : ""; // attachments skipped for now
    if (mt.startsWith("text/plain")) {
      texts.push(decoded);
    } else if (mt.startsWith("text/html")) {
      htmls.push(decoded);
    } else if (!mt && decoded) {
      // Some providers put raw body at root without mimeType
      texts.push(decoded);
    }
  };
  collect(payload);
  const htmlText = htmls.map(htmlToText).join("\n");
  return [texts.join("\n"), htmlText].filter(Boolean).join("\n");
}

function decodeBase64UrlToString(data) {
  try {
    const s = data.replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
    const b64 = s + "=".repeat(pad);
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder("utf-8").decode(bytes);
    }
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    return out;
  } catch (e) {
    console.warn("[background] base64url decode failed", e);
    return "";
  }
}

function htmlToText(html) {
  if (!html) return "";
  // strip scripts/styles and tags
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return cleaned;
}

function normalizeTextForOtp(text) {
  if (!text) return "";
  return String(text)
    // remove zero-width and non-printing characters
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    // collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

// Removed handleWaitForEmailCode function as it is no longer needed.

async function saveVariable(name, value) {
  const key = "variables";
  const data = await chrome.storage.local.get([key]);
  const next = { ...(data?.[key] || {}), [name]: value };
  await chrome.storage.local.set({ [key]: next });
}

function broadcastToOptions(payload) {
  try {
    // Fire-and-forget without a callback to avoid Unchecked runtime.lastError
    chrome.runtime.sendMessage(payload);
  } catch {}
  try { mirrorUiStateToStorage(payload); } catch {}
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

async function mirrorUiStateToStorage(payload) {
  const key = 'flowUiState';
  try {
    const cur = await chrome.storage.local.get([key]);
    const ui = { ...(cur?.[key] || {}), lastUpdatedAt: Date.now() };
    if (payload?.type === 'FLOW_STATUS') {
      if (payload.kind === 'FLOW_RESET') {
        ui.stepStatuses = [];
        ui.nestedStatuses = {};
        ui.ifResults = {};
        ui.waitCountdowns = {};
        ui.nestedWaitCountdowns = {};
        ui.isRunning = true;
      } else if (typeof payload.index === 'number' && payload.status) {
        const arr = Array.isArray(ui.stepStatuses) ? ui.stepStatuses.slice() : [];
        arr[payload.index] = payload.status;
        ui.stepStatuses = arr;
        if (payload.status === 'success' || payload.status === 'error') {
          if (ui.waitCountdowns) delete ui.waitCountdowns[payload.index];
        }
      }
    } else if (payload?.type === 'FLOW_NESTED_STATUS') {
      const key = Array.isArray(payload.path) ? payload.path.map(String).join('|') : (typeof payload.parentIndex === 'number' && typeof payload.childIndex === 'number' && typeof payload.branch === 'string' ? `${payload.parentIndex}|${payload.branch}|${payload.childIndex}` : null);
      if (key && payload.status) {
        const map = { ...(ui.nestedStatuses || {}) };
        map[key] = payload.status;
        ui.nestedStatuses = map;
        if (payload.status === 'success' || payload.status === 'error') {
          if (ui.nestedWaitCountdowns) delete ui.nestedWaitCountdowns[key];
        }
      }
    } else if (payload?.type === 'IF_RESULT') {
      if (typeof payload.index === 'number') {
        const map = { ...(ui.ifResults || {}) };
        map[payload.index] = payload.result === 'then' ? 'then' : 'else';
        ui.ifResults = map;
      }
    } else if (payload?.type === 'WAIT_COUNTDOWN') {
      if (typeof payload.index === 'number') {
        const map = { ...(ui.waitCountdowns || {}) };
        map[payload.index] = Math.max(0, Number(payload.seconds) || 0);
        ui.waitCountdowns = map;
      }
    } else if (payload?.type === 'WAIT_NESTED_COUNTDOWN') {
      const key = Array.isArray(payload.path) ? payload.path.map(String).join('|') : (typeof payload.parentIndex === 'number' && typeof payload.childIndex === 'number' && typeof payload.branch === 'string' ? `${payload.parentIndex}|${payload.branch}|${payload.childIndex}` : null);
      if (key) {
        const map = { ...(ui.nestedWaitCountdowns || {}) };
        map[key] = Math.max(0, Number(payload.seconds) || 0);
        ui.nestedWaitCountdowns = map;
      }
    } else if (payload?.type === 'FLOW_ITER') {
      ui.iterCount = Number(payload.count) || 0;
      ui.isRunning = false;
    } else if (payload?.type === 'FLOW_ABORT') {
      ui.isRunning = false;
    }
    await chrome.storage.local.set({ [key]: ui });
  } catch (err) {
    // best-effort
  }
}
