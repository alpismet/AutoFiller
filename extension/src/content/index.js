// content.js — sayfa içinde çalışır; background'dan gelen adımları uygular

let __audioUnlocked = false;
let __selectorPicker = null;
const FRAME_BRIDGE_SOURCE = "__AF_FRAME_BRIDGE__";
const FRAME_BRIDGE_TIMEOUT_MS = 10000;
const __frameBridgePending = new Map();

const cssEscape = (value) => {
    if (typeof value !== "string") return "";
    if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
    }
    return value.replace(/[\0-\x1F\x7F"\'\\]/g, "\\$&");
};

function shouldReadInsideIframes(step) {
    return step?.readInsideIframes !== false;
}

function createBridgeRequestId(prefix = "af") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function postBridgeMessage(targetWindow, payload) {
    if (!targetWindow || typeof targetWindow.postMessage !== "function") return;
    targetWindow.postMessage({ ...payload, __afBridge: FRAME_BRIDGE_SOURCE }, "*");
}

function isBridgeMessage(data) {
    return !!(data && typeof data === "object" && data.__afBridge === FRAME_BRIDGE_SOURCE && typeof data.type === "string");
}

function findDirectChildFrameElementByWindow(sourceWindow, rootDocument = document) {
    if (!sourceWindow) return null;
    let frames = [];
    try {
        frames = Array.from(rootDocument.querySelectorAll("iframe,frame"));
    } catch {}
    for (const frame of frames) {
        try {
            if (frame.contentWindow === sourceWindow) return frame;
        } catch {}
    }
    return null;
}

function broadcastBridgeMessageToChildFrames(payload, rootDocument = document) {
    let frames = [];
    try {
        frames = Array.from(rootDocument.querySelectorAll("iframe,frame"));
    } catch {}
    frames.forEach((frame) => {
        try {
            if (frame.contentWindow) postBridgeMessage(frame.contentWindow, payload);
        } catch {}
    });
}

function sendBridgeRequest(targetWindow, payload, timeoutMs = FRAME_BRIDGE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        if (!targetWindow || typeof targetWindow.postMessage !== "function") {
            reject(new Error("frame_unavailable"));
            return;
        }
        const requestId = createBridgeRequestId("bridge");
        const timeoutId = setTimeout(() => {
            __frameBridgePending.delete(requestId);
            reject(new Error("frame_bridge_timeout"));
        }, timeoutMs);
        __frameBridgePending.set(requestId, { resolve, reject, timeoutId });
        postBridgeMessage(targetWindow, { ...payload, requestId });
    });
}

function getAccessibleFrameDocument(frame) {
    const isIFrame = typeof HTMLIFrameElement !== "undefined" && frame instanceof HTMLIFrameElement;
    const isFrame = typeof HTMLFrameElement !== "undefined" && frame instanceof HTMLFrameElement;
    if (!isIFrame && !isFrame) return null;
    try {
        const doc = frame.contentDocument;
        if (!doc?.documentElement) return null;
        void doc.defaultView?.location?.href;
        return doc;
    } catch {
        return null;
    }
}

function collectSearchDocuments({ includeIframes = true, rootDocument = document } = {}) {
    const docs = [rootDocument];
    if (!includeIframes) return docs;

    const queue = [rootDocument];
    const seen = new Set([rootDocument]);
    while (queue.length) {
        const currentDoc = queue.shift();
        let frames = [];
        try {
            frames = Array.from(currentDoc.querySelectorAll("iframe,frame"));
        } catch {}
        frames.forEach((frame) => {
            const frameDoc = getAccessibleFrameDocument(frame);
            if (!frameDoc || seen.has(frameDoc)) return;
            seen.add(frameDoc);
            docs.push(frameDoc);
            queue.push(frameDoc);
        });
    }
    return docs;
}

function querySelectorAcrossDocuments(selector, options = {}) {
    if (!selector || typeof selector !== "string") return null;
    const scoped = resolveScopedSelectorContext(selector, options);
    if (scoped?.scoped) {
        try {
            return scoped.document.querySelector(scoped.finalSelector);
        } catch {
            return null;
        }
    }
    const docs = collectSearchDocuments(options);
    for (const doc of docs) {
        try {
            const el = doc.querySelector(scoped?.finalSelector || selector);
            if (el) return el;
        } catch {}
    }
    return null;
}

function querySelectorAllAcrossDocuments(selector, options = {}) {
    if (!selector || typeof selector !== "string") return [];
    const scoped = resolveScopedSelectorContext(selector, options);
    if (scoped?.scoped) {
        try {
            return Array.from(scoped.document.querySelectorAll(scoped.finalSelector));
        } catch {
            return [];
        }
    }
    const docs = collectSearchDocuments(options);
    const matches = [];
    for (const doc of docs) {
        try {
            matches.push(...Array.from(doc.querySelectorAll(scoped?.finalSelector || selector)));
        } catch {}
    }
    return matches;
}

function findElementByIdAcrossDocuments(id, options = {}) {
    if (!id || typeof id !== "string") return null;
    const docs = collectSearchDocuments(options);
    for (const doc of docs) {
        try {
            const el = doc.getElementById(id);
            if (el) return el;
        } catch {}
    }
    return null;
}

function getOwnerWindow(el) {
    return el?.ownerDocument?.defaultView || window;
}

function scrollIntoViewAcrossFrames(el) {
    let current = el instanceof Element ? el : null;
    while (current) {
        try {
            current.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
        } catch {}
        const ownerWindow = current.ownerDocument?.defaultView;
        const frameElement = ownerWindow?.frameElement;
        current = frameElement instanceof Element ? frameElement : null;
    }
}

function getElementRectInTopViewport(el) {
    const rect = el.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top;
    let currentWindow = el.ownerDocument?.defaultView;

    while (currentWindow && currentWindow !== window && currentWindow.frameElement instanceof Element) {
        const frameRect = currentWindow.frameElement.getBoundingClientRect();
        left += frameRect.left;
        top += frameRect.top;
        currentWindow = currentWindow.parent;
    }

    return {
        left,
        top,
        width: rect.width,
        height: rect.height
    };
}

function buildSelectorInDocument(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return "";
    const nodeDoc = node.ownerDocument || document;
    if (node.id) return `#${cssEscape(node.id)}`;

    const segments = [];
    let current = node;
    let depth = 0;

    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 10) {
        let segment = current.tagName.toLowerCase();
        if (current.classList.length) {
            const classNames = Array.from(current.classList)
                .filter(Boolean)
                .slice(0, 2)
                .map((cls) => `.${cssEscape(cls)}`)
                .join("");
            segment += classNames;
        }

        const parent = current.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                segment += `:nth-of-type(${index})`;
            }
        }

        segments.unshift(segment);
        const candidate = segments.join(" > ");
        try {
            const matches = nodeDoc.querySelectorAll(candidate);
            if (matches.length === 1 && matches[0] === node) {
                return candidate;
            }
        } catch {}

        current = parent;
        depth += 1;
    }

    return segments.join(" > ") || node.tagName.toLowerCase();
}

function splitScopedSelector(selector) {
    return String(selector)
        .split(/\s*>>>\s*/g)
        .map((part) => part.trim())
        .filter(Boolean);
}

function resolveScopedSelectorContext(selector, { rootDocument = document } = {}) {
    const parts = splitScopedSelector(selector);
    if (!parts.length) return null;
    if (parts.length === 1) {
        return {
            document: rootDocument,
            finalSelector: parts[0],
            scoped: false
        };
    }

    let currentDoc = rootDocument;
    for (const frameSelector of parts.slice(0, -1)) {
        let frame = null;
        try {
            frame = currentDoc.querySelector(frameSelector);
        } catch {
            return null;
        }
        const frameDoc = getAccessibleFrameDocument(frame);
        if (!frameDoc) return null;
        currentDoc = frameDoc;
    }

    return {
        document: currentDoc,
        finalSelector: parts[parts.length - 1],
        scoped: true
    };
}

function startSelectorPicker(requestId, { broadcast = false } = {}) {
    if (!document.body) return false;
    if (__selectorPicker) stopSelectorPicker(false, { notify: false, broadcast: false });
    const showTooltip = window === window.top;

    const highlight = document.createElement("div");
    highlight.id = "__af-picker-highlight";
    Object.assign(highlight.style, {
        position: "fixed",
        zIndex: "2147483646",
        pointerEvents: "none",
        border: "2px solid #2563eb",
        background: "rgba(37, 99, 235, 0.2)",
        borderRadius: "6px",
        transition: "all 0.08s ease",
        display: "none"
    });

    const tooltip = showTooltip ? document.createElement("div") : null;
    if (tooltip) {
        tooltip.id = "__af-picker-tooltip";
        tooltip.innerText = "Click element to capture selector • Esc to cancel";
        Object.assign(tooltip.style, {
            position: "fixed",
            left: "50%",
            bottom: "28px",
            transform: "translateX(-50%)",
            padding: "8px 14px",
            borderRadius: "999px",
            fontSize: "13px",
            fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
            background: "#1f2937",
            color: "#f8fafc",
            boxShadow: "0 8px 20px rgba(15,23,42,0.35)",
            pointerEvents: "none",
            zIndex: "2147483647"
        });
    }

    document.body.appendChild(highlight);
    if (tooltip) document.body.appendChild(tooltip);

    const pickerState = {
        requestId,
        highlight,
        tooltip,
        currentTarget: null,
        handlers: {},
        registrations: []
    };

    const updateTooltip = (target) => {
        if (!pickerState.tooltip) return;
        const ownerDoc = target?.ownerDocument || document;
        if (!target || target === ownerDoc.body || target === ownerDoc.documentElement) {
            pickerState.tooltip.innerText = "Click element to capture selector • Esc to cancel";
            return;
        }
        const descriptor = describeElement(target);
        pickerState.tooltip.innerText = `Click: ${descriptor} • Esc to cancel`;
    };

    const moveHandler = (event) => {
        const target = resolvePickerTarget(event.target);
        pickerState.currentTarget = target;
        positionHighlight(target, pickerState.highlight);
        updateTooltip(target);
    };

    const preventHandler = (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
    };

    const clickHandler = (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const target = pickerState.currentTarget || resolvePickerTarget(event.target);
        if (!target) return;
        const selector = buildSelectorInDocument(target);
        if (selector) {
            if (window === window.top) {
                stopSelectorPicker(true, { selector, broadcast: true });
            } else {
                stopPickerLocally();
                postBridgeMessage(window.parent, {
                    type: "AF_PICKER_RESULT",
                    requestId,
                    selector
                });
            }
        } else {
            if (window === window.top) {
                stopSelectorPicker(false, { reason: "selector_not_found", broadcast: true });
            } else {
                stopPickerLocally();
                postBridgeMessage(window.parent, {
                    type: "AF_PICKER_CANCEL",
                    requestId,
                    reason: "selector_not_found"
                });
            }
        }
    };

    const keyHandler = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            if (window === window.top) {
                stopSelectorPicker(false, { reason: "cancelled", broadcast: true });
            } else {
                stopPickerLocally();
                postBridgeMessage(window.parent, {
                    type: "AF_PICKER_CANCEL",
                    requestId,
                    reason: "cancelled"
                });
            }
        }
    };

    const scrollHandler = () => {
        if (!pickerState.currentTarget) return;
        positionHighlight(pickerState.currentTarget, pickerState.highlight);
        updateTooltip(pickerState.currentTarget);
    };

    const contextHandler = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    pickerState.handlers = {
        moveHandler,
        clickHandler,
        keyHandler,
        scrollHandler,
        contextHandler,
        preventHandler
    };

    const docs = broadcast ? [document] : collectSearchDocuments({ includeIframes: true });
    docs.forEach((doc) => {
        doc.addEventListener("mousemove", moveHandler, true);
        doc.addEventListener("mousedown", preventHandler, true);
        doc.addEventListener("mouseup", preventHandler, true);
        doc.addEventListener("click", clickHandler, true);
        doc.addEventListener("keydown", keyHandler, true);
        doc.addEventListener("contextmenu", contextHandler, true);
        doc.defaultView?.addEventListener("scroll", scrollHandler, true);
        pickerState.registrations.push({ doc, win: doc.defaultView || null });
    });

    __selectorPicker = pickerState;
    if (broadcast) {
        broadcastBridgeMessageToChildFrames({ type: "AF_PICKER_START", requestId });
    }
    return true;
}

function stopSelectorPicker(success, detail = {}) {
    if (!__selectorPicker) return;
    const { requestId } = __selectorPicker;
    stopPickerLocally();
    __selectorPicker = null;

    if (detail.broadcast) {
        broadcastBridgeMessageToChildFrames({ type: "AF_PICKER_STOP", requestId });
    }

    if (!requestId) return;
    if (success && detail.selector) {
        chrome.runtime.sendMessage({ type: "PICKER_RESULT", success: true, requestId, selector: detail.selector });
    } else if (!success && detail.notify !== false) {
        chrome.runtime.sendMessage({
            type: "PICKER_RESULT",
            success: false,
            requestId,
            reason: detail.reason || "cancelled"
        });
    }
}

function resolvePickerTarget(node) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) return node.parentElement;
    if (node instanceof Element) return node;
    return null;
}

function positionHighlight(target, highlight) {
    if (!highlight) return;
    const ownerDoc = target?.ownerDocument || document;
    if (!target || target === ownerDoc.body || target === ownerDoc.documentElement) {
        highlight.style.display = "none";
        return;
    }
    const rect = getElementRectInTopViewport(target);
    highlight.style.display = "block";
    highlight.style.left = `${rect.left}px`;
    highlight.style.top = `${rect.top}px`;
    highlight.style.width = `${Math.max(rect.width, 0)}px`;
    highlight.style.height = `${Math.max(rect.height, 0)}px`;
}

function describeElement(el) {
    if (!el || !el.tagName) return "element";
    let desc = el.tagName.toLowerCase();
    if (el.id) desc += `#${el.id}`;
    else if (el.classList.length) desc += "." + Array.from(el.classList).slice(0, 2).join(".");
    return desc;
}

function computeUniqueSelector(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return "";
    const scopeDoc = element.ownerDocument || document;
    const targetSelector = buildSelectorInDocument(element);
    const frameSelectors = [];
    let currentWindow = scopeDoc.defaultView;
    while (currentWindow && currentWindow !== window && currentWindow.frameElement instanceof Element) {
        const frameSelector = buildSelectorInDocument(currentWindow.frameElement);
        if (!frameSelector) break;
        frameSelectors.unshift(frameSelector);
        currentWindow = currentWindow.parent;
    }

    return frameSelectors.length ? [...frameSelectors, targetSelector].join(" >>> ") : targetSelector;
}

function stopPickerLocally() {
    if (!__selectorPicker) return;
    const { highlight, tooltip, handlers, registrations } = __selectorPicker;
    if (highlight?.parentNode) highlight.parentNode.removeChild(highlight);
    if (tooltip?.parentNode) tooltip.parentNode.removeChild(tooltip);
    if (handlers) {
        (registrations || []).forEach(({ doc, win }) => {
            doc?.removeEventListener("mousemove", handlers.moveHandler, true);
            doc?.removeEventListener("mousedown", handlers.preventHandler, true);
            doc?.removeEventListener("mouseup", handlers.preventHandler, true);
            doc?.removeEventListener("click", handlers.clickHandler, true);
            doc?.removeEventListener("keydown", handlers.keyHandler, true);
            doc?.removeEventListener("contextmenu", handlers.contextHandler, true);
            win?.removeEventListener("scroll", handlers.scrollHandler, true);
        });
    }
    __selectorPicker = null;
}

function extractCrossOriginFrameContext(selector) {
    const parts = splitScopedSelector(selector);
    if (parts.length < 2) return null;
    let currentDoc = document;
    for (let i = 0; i < parts.length - 1; i += 1) {
        let frame = null;
        try {
            frame = currentDoc.querySelector(parts[i]);
        } catch {
            return null;
        }
        if (!frame) return null;
        const frameDoc = getAccessibleFrameDocument(frame);
        if (frameDoc) {
            currentDoc = frameDoc;
            continue;
        }
        return {
            frameElement: frame,
            remainingSelector: parts.slice(i + 1).join(" >>> ")
        };
    }
    return null;
}

async function maybeDelegateStepToChildFrame(step) {
    const selector = typeof step?.selector === "string" ? step.selector : "";
    if (!selector.includes(">>>")) return null;
    const frameContext = extractCrossOriginFrameContext(selector);
    if (!frameContext?.frameElement?.contentWindow) return null;
    const childStep = { ...step, selector: frameContext.remainingSelector };
    return sendBridgeRequest(frameContext.frameElement.contentWindow, {
        type: "AF_RUN_STEP_REQUEST",
        step: childStep
    });
}

function sendRuntimeMessage(payload) {
    return new Promise((resolve) => {
        if (!chrome?.runtime?.sendMessage) {
            resolve(null);
            return;
        }
        try {
            chrome.runtime.sendMessage(payload, (response) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                } else {
                    resolve(response);
                }
            });
        } catch (err) {
            console.warn("[content] sendMessage failed:", err);
            resolve(null);
        }
    });
}

function getSharedAudioContext(allowCreate = false) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const existing = window.__afCtx;
    if (existing && typeof existing.resume === "function") return existing;
    if (!allowCreate) return null;
    try {
        const ctx = new Ctx();
        window.__afCtx = ctx;
        return ctx;
    } catch (err) {
        console.warn("[content] Failed to create AudioContext:", err);
        return null;
    }
}

function createEnableSoundButton() {
    if (document.getElementById("__af-enable-sound")) return;
    const btn = document.createElement("button");
    btn.id = "__af-enable-sound";
    btn.textContent = "Enable sound";
    Object.assign(btn.style, {
        position: "fixed",
        bottom: "16px",
        right: "16px",
        zIndex: 2147483647,
        padding: "10px 14px",
        borderRadius: "8px",
        border: "1px solid #888",
        background: "#fff",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        cursor: "pointer"
    });
    btn.addEventListener("click", async () => {
        try {
            const ctx = getSharedAudioContext(true);
            if (ctx) {
                await ctx.resume();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                gain.gain.value = 0.001; // çok kısık kısa bip
                osc.connect(gain).connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.05);
                // bazı platformlar için <audio> ile de tetikle
                try {
                    const unlockAudio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==");
                    unlockAudio.volume = 0.01;
                    await unlockAudio.play();
                    unlockAudio.pause();
                    unlockAudio.currentTime = 0;
                } catch {}
            } else {
                const silent = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==");
                silent.volume = 0.01;
                try { await silent.play(); } catch {}
            }
            btn.textContent = "Sound enabled ✓";
            __audioUnlocked = true;
            setTimeout(() => btn.remove(), 600);
            console.log("[content] Audio unlocked.");
        } catch (e) {
            console.warn("[content] Audio unlock failed:", e);
        }
    });
    document.body.appendChild(btn);
}
function ensureAudioPermissionPrompt() { if (!__audioUnlocked) createEnableSoundButton(); }

function waitForCondition(fn, timeoutMs = 60000, pollMs = 100) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const id = setInterval(() => {
            if (fn()) { clearInterval(id); resolve(true); }
            else if (Date.now() - start > timeoutMs) { clearInterval(id); reject(new Error("Timed out waiting for condition")); }
        }, pollMs);
    });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;
    if (msg.type === "PING") { try { sendResponse?.({ ok: true, alive: true }); } catch {} return; }
    if (msg.type === "START_PICKER") {
        const ok = startSelectorPicker(msg.requestId || null, { broadcast: true });
        sendResponse?.({ ok });
        return;
    }
    if (msg.type === "CANCEL_PICKER") {
        stopSelectorPicker(false, { reason: "cancelled", broadcast: true });
        sendResponse?.({ ok: true });
        return;
    }
    if (msg.type === "RUN_STEP") {
        (async () => {
            const res = await handleRunStep(msg.step || {});
            try { sendResponse?.(res); } catch {}
        })();
        return true;
    }
});

window.addEventListener("message", (event) => {
    if (!isBridgeMessage(event.data)) return;
    const data = event.data;

    if (data.type === "AF_PICKER_START") {
        startSelectorPicker(data.requestId || null, { broadcast: true });
        return;
    }

    if (data.type === "AF_PICKER_STOP") {
        stopSelectorPicker(false, { notify: false, broadcast: true });
        return;
    }

    if (data.type === "AF_PICKER_RESULT") {
        const frameElement = findDirectChildFrameElementByWindow(event.source, document);
        const frameSelector = buildSelectorInDocument(frameElement);
        const combinedSelector = frameSelector && data.selector ? `${frameSelector} >>> ${data.selector}` : data.selector || frameSelector;
        if (window === window.top) {
            stopSelectorPicker(true, { selector: combinedSelector, broadcast: true });
        } else {
            stopPickerLocally();
            postBridgeMessage(window.parent, {
                type: "AF_PICKER_RESULT",
                requestId: data.requestId || null,
                selector: combinedSelector
            });
        }
        return;
    }

    if (data.type === "AF_PICKER_CANCEL") {
        if (window === window.top) {
            stopSelectorPicker(false, { reason: data.reason || "cancelled", broadcast: true });
        } else {
            stopPickerLocally();
            postBridgeMessage(window.parent, {
                type: "AF_PICKER_CANCEL",
                requestId: data.requestId || null,
                reason: data.reason || "cancelled"
            });
        }
        return;
    }

    if (data.type === "AF_RUN_STEP_REQUEST") {
        (async () => {
            const result = await handleRunStep(data.step || {});
            postBridgeMessage(event.source, {
                type: "AF_RUN_STEP_RESPONSE",
                requestId: data.requestId,
                result
            });
        })();
        return;
    }

    if (data.type === "AF_RUN_STEP_RESPONSE") {
        const pending = __frameBridgePending.get(data.requestId);
        if (!pending) return;
        clearTimeout(pending.timeoutId);
        __frameBridgePending.delete(data.requestId);
        pending.resolve(data.result);
    }
});

async function handleRunStep(step) {
    if (!step || typeof step.type !== "string") return { ok: false, error: "invalid_step" };
    try {
        if (["CheckElement", "Click", "FillText", "SelectDropdown"].includes(step.type)) {
            const delegated = await maybeDelegateStepToChildFrame(step);
            if (delegated) return delegated;
        }
        switch (step.type) {
            case "CheckElement": {
                const selector = typeof step.selector === 'string' ? step.selector : '';
                let mode = 'exists';
                if (typeof step.mode === 'string') {
                    const normalizedMode = step.mode.toLowerCase();
                    if (normalizedMode === 'visible') mode = 'visible';
                    else if (normalizedMode === 'text') mode = 'text';
                }
                const timeout = Number(step.timeoutMs) || 0;
                const cond = await checkElementCondition({
                    selector,
                    mode,
                    timeoutMs: timeout,
                    textMatch: typeof step.textMatch === 'string' ? step.textMatch : 'any',
                    textValue: typeof step.textValue === 'string' ? step.textValue : '',
                    caseSensitive: Boolean(step.textCaseSensitive),
                    includeIframes: shouldReadInsideIframes(step)
                });
                return { ok: true, value: cond };
            }
            case "PromptForCode": {
                const val = window.prompt(step.message || "Enter code");
                if (val && val.trim()) return { ok: true, value: val.trim() };
                return { ok: false, error: "cancelled" };
            }
            case "Click": {
                const timeout = Number(step.selectorWaitMs) || 5000;
                const base = await waitForSelectorSafe(step.selector, timeout, { includeIframes: shouldReadInsideIframes(step) });
                if (!base) return { ok: false, error: "selector_not_found" };
                const el = findClickable(base);
                // Respond first, then perform click respecting per-step forceClick or global setting
                setTimeout(() => {
                    try {
                        const useNative = Boolean(step.forceClick || step.useNativeClick);
                        // When forcing/native allowed, robustClick attempts native first and falls back to synthetic
                        // Otherwise, still use the hardened synthetic sequence
                        if (useNative) {
                            robustClick(el);
                        } else {
                            scrollIntoViewAcrossFrames(el);
                            const rect = el.getBoundingClientRect();
                            const cx = rect.left + Math.max(1, rect.width) / 2;
                            const cy = rect.top + Math.max(1, rect.height) / 2;
                            syntheticClick(el, cx, cy);
                        }
                    } catch {}
                }, 0);
                return { ok: true };
            }

            case "FillText": {
                const timeout = Number(step.selectorWaitMs) || 5000;
                const includeIframes = shouldReadInsideIframes(step);
                const value = await resolveVariablesInText(step.value);
                if (step.splitAcrossInputs) {
                    const start = Date.now();
                    const delay = step.slowType ? Math.max(0, Number(step.slowTypeDelayMs) || 100) : 0;
                    const onlyDigits = String(value).match(/\d/g);
                    const chars = onlyDigits && onlyDigits.length ? onlyDigits : Array.from(String(value));

                    const collectInputs = () => {
                        const base = querySelectorAllAcrossDocuments(step.selector, { includeIframes });
                        let list = Array.from(base).filter(n => n && n.nodeType === Node.ELEMENT_NODE && (n.matches?.('input,textarea,[contenteditable="true"]') || 'value' in n));
                        if (!list.length) {
                            const descendant = [];
                            Array.from(base).forEach((container) => {
                                try {
                                    const found = container.querySelectorAll('input,textarea,[contenteditable="true"]');
                                    descendant.push(...Array.from(found));
                                } catch {}
                            });
                            list = descendant.filter(n => n && n.nodeType === Node.ELEMENT_NODE);
                        }
                        if (list.length) {
                            list.sort((a, b) => {
                                const aMax = Number(a.getAttribute?.('maxlength')) || 0;
                                const bMax = Number(b.getAttribute?.('maxlength')) || 0;
                                const aScore = aMax === 1 ? 0 : 1;
                                const bScore = bMax === 1 ? 0 : 1;
                                return aScore - bScore;
                            });
                        }
                        return list;
                    };

                    let inputs = collectInputs();
                    if (!inputs.length) {
                        // Wait until at least one input appears
                        while (!inputs.length && (Date.now() - start) <= timeout) {
                            await sleep(100);
                            inputs = collectInputs();
                        }
                        if (!inputs.length) return { ok: false, error: "selector_not_found" };
                    }

                    let i = 0;
                    while (i < chars.length) {
                        // Ensure there are enough inputs; if not, wait/poll for more (e.g., lazy render)
                        while (inputs.length <= i && (Date.now() - start) <= timeout) {
                            await sleep(100);
                            inputs = collectInputs();
                        }
                        if (inputs.length <= i) return { ok: false, error: "insufficient_inputs" };
                        const node = inputs[i];
                        const ch = chars[i] ?? "";
                                    if (step.slowType && ch) {
                            try { node.focus(); } catch {}
                            simulateKey(node, 'keydown', ch);
                            simulateKey(node, 'keypress', ch);
                                        dispatchBeforeInput(node, 'insertText', ch);
                            setNativeValue(node, (node.value ?? "") + ch);
                            try { node.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
                            simulateKey(node, 'keyup', ch);
                        } else {
                            focusAndSetValue(node, ch);
                        }
                        // auto-advance focus to next slot if available
                        if (ch && inputs[i + 1]) { try { inputs[i + 1].focus(); } catch {} }
                        i += 1;
                        if (delay) await sleep(delay);
                    }
                    return { ok: true };
                            } else {
                                // Resolve actual editable target: selector may point to a wrapper (e.g., date-picker)
                                const base = await waitForSelectorSafe(step.selector, timeout, { includeIframes });
                                if (!base) return { ok: false, error: "selector_not_found" };
                                const isEditable = (n) => !!(n && (n.matches?.('input,textarea,[contenteditable="true"]') || 'value' in n));
                                let el = isEditable(base) ? base : null;

                                const findDescendant = (root) => {
                                    try { return root.querySelector('input,textarea,[contenteditable="true"]'); } catch { return null; }
                                };
                                
                                if (!el) {
                                    // Try descendant input
                                    el = findDescendant(base);
                                }
                                if (!el) {
                                    // Try label[for] -> document.getElementById(for)
                                    let lbl = null;
                                    try { lbl = base.querySelector('label[for]'); } catch {}
                                    if (!lbl && base.previousElementSibling && base.previousElementSibling.matches?.('label[for]')) {
                                        lbl = base.previousElementSibling;
                                    }
                                    const forId = lbl?.getAttribute?.('for');
                                    if (forId) {
                                        const byId = base.ownerDocument?.getElementById(forId) || findElementByIdAcrossDocuments(forId, { includeIframes, rootDocument: base.ownerDocument || document });
                                        if (isEditable(byId)) el = byId;
                                    }
                                }
                                if (!el) {
                                    // Click wrapper to reveal input, then poll for descendant
                                    try { base.click?.(); } catch {}
                                    const startReveal = Date.now();
                                    while (!el && (Date.now() - startReveal) <= 2000) {
                                        await sleep(100);
                                        el = findDescendant(base);
                                    }
                                }
                                if (!el) return { ok: false, error: "selector_not_editable" };

                                if (step.slowType) {
                                    // Key-by-key typing without pre-clearing (to avoid breaking masks)
                                    try { el.focus?.(); } catch {}
                                    // Select all to replace existing content cleanly (if supported)
                                    try {
                                        if (typeof el.select === 'function') el.select();
                                        else if (Number.isFinite(el.selectionStart) && Number.isFinite(el.selectionEnd)) {
                                            el.selectionStart = 0; el.selectionEnd = String(el.value ?? '').length;
                                        }
                                    } catch {}
                                    const chars = Array.from(String(value));
                                    const delay = Math.max(0, Number(step.slowTypeDelayMs) || 100);
                                    for (const ch of chars) {
                                        try { el.focus?.(); } catch {}
                                        simulateKey(el, 'keydown', ch);
                                        simulateKey(el, 'keypress', ch);
                                        dispatchBeforeInput(el, 'insertText', ch);
                                        const cur = String(el.value ?? "");
                                        const start = Number.isFinite(el.selectionStart) ? el.selectionStart : cur.length;
                                        const end = Number.isFinite(el.selectionEnd) ? el.selectionEnd : cur.length;
                                        const next = cur.slice(0, start) + ch + cur.slice(end);
                                        setNativeValue(el, next);
                                        // advance caret
                                        try { el.setSelectionRange?.(start + 1, start + 1); } catch {}
                                        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
                                        simulateKey(el, 'keyup', ch);
                                        if (delay) await sleep(delay);
                                    }
                                    // Fire change at the end for frameworks listening to it
                                    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
                                } else {
                                    focusAndSetValue(el, value);
                                }
                                return { ok: true };
                            }
            }

                        case "SelectDropdown": {
                                const timeout = Number(step.timeoutMs) || 10000;
                                const includeIframes = shouldReadInsideIframes(step);
                                const control = await waitForSelectorSafe(step.controlSelector, timeout, { includeIframes });
                                if (!control) return { ok: false, error: "control_not_found" };
                                // Open the dropdown (click or Enter)
                                try { control.focus(); } catch {}
                                try { control.click(); } catch {}
                                try { control.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch {}
                                try { control.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' })); } catch {}

                                const itemSel = (typeof step.optionItemSelector === 'string' && step.optionItemSelector.trim())
                                    ? step.optionItemSelector.trim()
                                    : "li,[role='option'],.dropdown-item,.agora-dropdown-option";

                                // Wait for list items to appear near the control: first query globally, if not, search in siblings/ancestors
                                let items = [];
                                const start = Date.now();
                                while (Date.now() - start <= timeout) {
                                    try {
                                        items = Array.from(control.ownerDocument?.querySelectorAll(itemSel) || []);
                                        if (items.length) break;
                                        // Try looking within likely container elements (dropdowns near control)
                                        const root = control.closest('[aria-controls]') || control.parentElement || control.ownerDocument?.body;
                                        items = Array.from((root || control.ownerDocument || document).querySelectorAll(itemSel));
                                        if (items.length) break;
                                        items = querySelectorAllAcrossDocuments(itemSel, { includeIframes, rootDocument: control.ownerDocument || document });
                                        if (items.length) break;
                                    } catch {}
                                    await sleep(100);
                                }
                                if (!items.length) return { ok: false, error: "options_not_found" };

                                // Match by text content contains (case-insensitive)
                                const want = String(step.optionText || '').trim().toLowerCase();
                                const getText = (el) => (el?.textContent || '').trim().toLowerCase();
                                let target = items.find(el => getText(el).includes(want));
                                // Some UIs wrap the label in inner span.option-content; try a deeper scan if needed
                                if (!target) {
                                    for (const el of items) {
                                        const inner = el.querySelector('.option-content, span, div');
                                        if (inner && getText(inner).includes(want)) { target = el; break; }
                                    }
                                }
                                if (!target) return { ok: false, error: "option_not_found" };

                                // Scroll into view and select
                                try { target.scrollIntoView({ block: 'nearest' }); } catch {}
                                try { target.focus(); } catch {}
                                try { target.click(); } catch {}
                                try { target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch {}
                                // Also try Enter in case the option is keyboard activated
                                try { target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' })); } catch {}

                                return { ok: true };
            }

            case "SelectFiles": {
                const timeout = Number(step.selectorWaitMs) || 5000;
                const includeIframes = shouldReadInsideIframes(step);
                // Find primary element from selector
                let baseEl = await waitForSelectorSafe(step.selector, timeout, { includeIframes });
                if (!baseEl) return { ok: false, error: "selector_not_found" };

                // Resolve input and drop target
                const asInput = (el) => el && el.tagName && el.tagName.toLowerCase() === 'input' && ((el.getAttribute('type')||'').toLowerCase() === 'file');
                let input = asInput(baseEl) ? baseEl : (baseEl.querySelector ? baseEl.querySelector("input[type='file']") : null);
                if (!input) {
                    input = querySelectorAcrossDocuments(step.selector + " input[type='file']", { includeIframes, rootDocument: baseEl.ownerDocument || document });
                }

                let dropEl = findDropTarget(baseEl) || baseEl;

                const list = Array.isArray(step.files) ? step.files : [];
                if (!list.length) return { ok: false, error: "no_files" };
                // Build File objects from data URLs
                const files = [];
                for (const f of list) {
                    if (!f?.dataUrl) continue;
                    try {
                        const file = dataUrlToFile(f.dataUrl, f.name || 'file', f.type || 'application/octet-stream');
                        files.push(file);
                    } catch {}
                }
                if (!files.length) return { ok: false, error: "files_decode_failed" };

                // Create DataTransfer payload
                const dt = new DataTransfer();
                files.forEach(file => { try { dt.items.add(file); } catch {} });

                let assigned = false;
                if (input && asInput(input)) {
                    try { input.focus(); } catch {}
                    try {
                        input.files = dt.files; // may throw or be ignored
                        assigned = input.files && input.files.length === dt.files.length;
                    } catch {}
                    try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
                    try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
                }

                if (!assigned && dropEl) {
                    // Drag-drop fallback on drop zone
                    try { simulateDragDrop(dropEl, dt); assigned = true; } catch {}
                }

                return { ok: true };
            }

            case "Wait":
                await sleep(step.ms || 1000);
                return { ok: true };

            case "EnsureAudio": {
                const resp = await sendRuntimeMessage({ type: "ENSURE_OFFSCREEN_AUDIO" });
                if (resp && resp.ok) {
                    __audioUnlocked = true;
                    return { ok: true };
                }
                ensureAudioPermissionPrompt();
                try {
                    await waitForCondition(() => __audioUnlocked === true, step.timeoutMs || 60000, 100);
                } catch {
                    console.warn("[content] EnsureAudio timeout, continuing without sound.");
                }
                return { ok: true };
            }

            case "PlaySound": {
                const offscreenResp = await sendRuntimeMessage({ type: "PLAY_SOUND_OFFSCREEN" });
                if (offscreenResp && offscreenResp.ok) {
                    __audioUnlocked = true;
                    return { ok: true };
                }
                if (!__audioUnlocked) {
                    ensureAudioPermissionPrompt();
                    alert("Flow completed ✅");
                    return { ok: true };
                }
                try {
                    try {
                        const ctx2 = getSharedAudioContext(true);
                        if (ctx2) {
                            if (ctx2.state === "suspended") {
                                await ctx2.resume();
                            }
                            let buffer = window.__afCachedBuffer;
                            if (!buffer) {
                                const res = await fetch(chrome.runtime.getURL("assets/done.wav"));
                                const arr = await res.arrayBuffer();
                                buffer = await ctx2.decodeAudioData(arr);
                                window.__afCachedBuffer = buffer;
                            }
                            const source = ctx2.createBufferSource();
                            source.buffer = buffer;
                            source.connect(ctx2.destination);
                            source.start();
                            __audioUnlocked = true;
                            try { chrome.runtime.sendMessage({ type: "SHOW_NOTIFICATION", title: "AutoFiller", message: "Flow completed." }); } catch {}
                            return { ok: true };
                        }
                    } catch {}
                    const audio = new Audio(chrome.runtime.getURL("assets/done.wav"));
                    await audio.play();
                    __audioUnlocked = true;
                    try { chrome.runtime.sendMessage({ type: "SHOW_NOTIFICATION", title: "AutoFiller", message: "Flow completed." }); } catch {}
                    return { ok: true };
                } catch (err) {
                    console.warn("[content] Audio play blocked, falling back to alert.", err);
                    ensureAudioPermissionPrompt();
                    alert("Flow completed ✅");
                    return { ok: true };
                }
            }

            default:
                return { ok: true };
        }
    } catch (err) {
        console.error("[content] Step failed:", step, err);
        return { ok: false, error: String(err?.message || err) };
    }
    return { ok: true };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function resolveVariablesInText(text) {
    if (!text || typeof text !== "string") return text;
    const m = text.match(/\{\{([^}]+)\}\}/g);
    if (!m) return text;
    let vars = {};
    try { const res = await chrome.storage.local.get(["variables"]); vars = res?.variables || {}; } catch {}
    let out = text;
    m.forEach((tpl) => {
        const key = tpl.slice(2, -2).trim();
        if (key && Object.prototype.hasOwnProperty.call(vars, key)) {
            out = out.replaceAll(tpl, String(vars[key]));
        }
    });
    return out;
}

async function waitForSelectorSafe(selector, timeoutMs, options = {}) {
    if (!selector || typeof selector !== "string") return null;
    const start = Date.now();
    const poll = 100;
    let el = null;
    while (Date.now() - start <= timeoutMs) {
        el = querySelectorAcrossDocuments(selector, options);
        if (el) return el;
        await sleep(poll);
    }
    return null;
}

async function waitForAllSelectors(selector, timeoutMs, options = {}) {
    if (!selector || typeof selector !== "string") return [];
    const start = Date.now();
    const poll = 100;
    while (Date.now() - start <= timeoutMs) {
        const list = querySelectorAllAcrossDocuments(selector, options);
        if (list && list.length) return list;
        await sleep(poll);
    }
    return [];
}

function focusAndSetValue(el, value) {
    if (!(el instanceof Element)) return;
    try { el.focus(); } catch {}
    const tag = el.tagName?.toLowerCase();
    const type = (el.getAttribute && el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
        // Notify frameworks that text will change
        dispatchBeforeInput(el, 'insertReplacementText', String(value ?? ''));
        setNativeValue(el, value);
    } else if ('value' in el) {
        // Fallback for custom elements
        try { el.value = value; } catch {}
    } else {
        el.textContent = value;
    }
    // Try to simulate key events for single-character inputs (common in OTP)
    const ch = String(value || '');
    if (ch.length === 1 && (tag === 'input' || tag === 'textarea')) {
        const key = ch;
        const code = /\d/.test(ch) ? `Digit${ch}` : undefined;
        try { el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, code })); } catch {}
        try { el.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key, code })); } catch {}
        try { el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key, code })); } catch {}
    }
    try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
}

// Helper to safely access TextAreaElement prototype across browsers
function TextAreaElementPrototype() {
    try { return HTMLTextAreaElement?.prototype || HTMLElement.prototype; } catch { return HTMLElement.prototype; }
}

function setNativeValue(element, v) {
    try {
        const proto = element.tagName?.toLowerCase() === 'textarea' ? TextAreaElementPrototype() : HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && typeof desc.set === 'function') {
            desc.set.call(element, v);
            return true;
        }
    } catch {}
    try { element.value = v; return true; } catch {}
    return false;
}

function simulateKey(el, type, ch) {
    const key = ch;
    const upper = String(ch || '').toUpperCase();
    const code = /\d/.test(ch) ? `Digit${ch}` : (/^[A-Z]$/.test(upper) ? `Key${upper}` : (ch === ' ' ? 'Space' : undefined));
    try { el.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key, code })); } catch {}
}

function dispatchBeforeInput(el, inputType, data) {
    try {
        const evt = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: inputType || 'insertText', data: data ?? '' });
        el.dispatchEvent(evt);
    } catch {}
}

function findClickable(node) {
    let el = node;
    const isClickable = (e) => {
        if (!e || e.nodeType !== Node.ELEMENT_NODE) return false;
        const tag = e.tagName?.toLowerCase();
        if (tag === 'button' || tag === 'a' || tag === 'summary') return true;
        if (tag === 'input') {
            const t = (e.getAttribute('type') || 'text').toLowerCase();
            return ['button','submit','checkbox','radio','file','image','reset'].includes(t);
        }
        const role = e.getAttribute('role');
        if (role && role.toLowerCase() === 'button') return true;
        if (e.classList && (
          e.classList.contains('btn') ||
          e.classList.contains('button') ||
          e.classList.contains('agora-btn')
        )) return true;
        // Has click handler
        // eslint-disable-next-line no-underscore-dangle
        if (typeof e.onclick === 'function') return true;
        return false;
    };
    let cur = el;
    for (let i = 0; i < 5 && cur; i++) {
        if (isClickable(cur)) return cur;
        cur = cur.parentElement;
    }
    return el;
}

function robustClick(el) {
    if (!el || !(el instanceof Element)) return;
    scrollIntoViewAcrossFrames(el);
    const localRect = el.getBoundingClientRect();
    const topRect = getElementRectInTopViewport(el);
    const localX = localRect.left + Math.max(1, localRect.width) / 2;
    const localY = localRect.top + Math.max(1, localRect.height) / 2;
    const topX = topRect.left + Math.max(1, topRect.width) / 2;
    const topY = topRect.top + Math.max(1, topRect.height) / 2;
    // Try native click first via background (isTrusted). If it fails, fallback to synthetic.
    try {
        chrome.runtime.sendMessage({ type: 'NATIVE_CLICK', x: topX, y: topY }, (res) => {
            if (chrome.runtime.lastError) {
                // cannot use native; fallback
                syntheticClick(el, localX, localY);
                return;
            }
            if (!res || res.ok !== true) {
                syntheticClick(el, localX, localY);
            }
        });
    } catch {
        syntheticClick(el, localX, localY);
    }
}

function syntheticClick(el, x, y) {
    const opts = { bubbles: true, cancelable: true, view: getOwnerWindow(el), clientX: x, clientY: y, button: 0 };
    try {
        el.dispatchEvent(new PointerEvent('pointerover', opts));
        el.dispatchEvent(new PointerEvent('pointerenter', opts));
        el.dispatchEvent(new MouseEvent('mouseover', opts));
        el.dispatchEvent(new MouseEvent('mouseenter', opts));
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        if (typeof el.focus === 'function') try { el.focus({ preventScroll: true }); } catch {}
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
    } catch (e) {
        try { el.click(); } catch {}
    }
}

async function checkElementCondition({ selector, mode, timeoutMs, textMatch = 'any', textValue = '', caseSensitive = false, includeIframes = true }) {
    const normalizedMode = typeof mode === 'string' ? mode.toLowerCase() : 'exists';
    const isTextMode = normalizedMode === 'text';
    const isVisibleMode = normalizedMode === 'visible';
    const normalizedMatch = isTextMode ? ((typeof textMatch === 'string' && textMatch) ? textMatch : 'contains') : 'any';
    const expectedValue = typeof textValue === 'string' ? textValue : '';
    const start = Date.now();
    const poll = 100;
    const test = () => {
        const el = querySelectorAcrossDocuments(selector, { includeIframes });
        if (!el) {
            if (isTextMode && normalizedMatch === 'empty') return true;
            return false;
        }
        if (isVisibleMode && !isVisible(el)) return false;
        if (isTextMode) {
            const textOk = evaluateTextCondition(el, normalizedMatch, expectedValue, caseSensitive);
            if (!textOk) return false;
        }
        return true;
    };
    if (!selector || typeof selector !== 'string') return false;
    if (!timeoutMs || timeoutMs <= 0) return test();
    while (Date.now() - start <= timeoutMs) {
        if (test()) return true;
        await sleep(poll);
    }
    return false;
}

function evaluateTextCondition(el, mode, expectedRaw, caseSensitive) {
    if (mode === 'any') return true;
    const expected = (expectedRaw || '').toString();
    if (!expected.trim()) return false;
    let actual = getElementText(el);
    if (!caseSensitive) {
        actual = actual.toLowerCase();
    }
    const normalizedActual = actual.trim();
    const normalizedExpected = caseSensitive ? expected.trim() : expected.trim().toLowerCase();
    switch (mode) {
        case 'contains':
            return normalizedActual.includes(normalizedExpected);
        case 'equals':
            return normalizedActual === normalizedExpected;
        case 'startsWith':
            return normalizedActual.startsWith(normalizedExpected);
        case 'endsWith':
            return normalizedActual.endsWith(normalizedExpected);
        case 'empty':
            return normalizedActual.length === 0;
        case 'notEmpty':
            return normalizedActual.length > 0;
        default:
            return true;
    }
}

function getElementText(el) {
    if (!el) return '';
    if (typeof el.value === 'string') return el.value;
    if (typeof el.innerText === 'string' && el.innerText.trim() !== '') return el.innerText;
    if (typeof el.textContent === 'string') return el.textContent;
    return '';
}

function isVisible(el) {
    try {
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    } catch { return false; }
    try {
        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    } catch {}
    // Also ensure within viewport area
    return el.getClientRects().length > 0;
}

// ---- SelectFiles helpers ----
function dataUrlToFile(dataUrl, name, type) {
    const i = String(dataUrl).indexOf('base64,');
    if (i === -1) throw new Error('invalid_data_url');
    const b64 = dataUrl.slice(i + 7);
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let j = 0; j < len; j++) bytes[j] = binary.charCodeAt(j);
    return new File([bytes], name || 'file', { type: type || 'application/octet-stream' });
}

function simulateDragDrop(target, dataTransfer) {
    if (!target) return;
    const fire = (type, extra = {}) => {
        try {
            const evt = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, ...extra });
            target.dispatchEvent(evt);
        } catch (err) {
            // Fallback createEvent for environments not supporting DragEvent init with dataTransfer
            const evt = document.createEvent('CustomEvent');
            evt.initCustomEvent(type, true, true, null);
            evt.dataTransfer = dataTransfer;
            target.dispatchEvent(evt);
        }
    };
    fire('dragenter');
    fire('dragover');
    fire('drop');
    fire('dragleave');
}

function findDropTarget(base) {
    if (!(base instanceof Element)) return null;
    const isDropZone = (el) => {
        if (!el || el.nodeType !== 1) return false;
        if (el.hasAttribute('dropzone') || el.getAttribute('data-dropzone') != null) return true;
        const cls = (el.className || '').toString().toLowerCase();
        return /(dropzone|drop-zone|file-drop|uploader|upload[-_ ]area|dz-clickable|drag[- ]?and[- ]?drop|dragdrop)/.test(cls);
    };
    let cur = base;
    for (let i = 0; i < 5 && cur; i++) {
        if (isDropZone(cur)) return cur;
        const within = cur.querySelector && cur.querySelector('[dropzone],[data-dropzone],.dropzone,.drop-zone,.file-drop,.uploader,.upload-area,.dz-clickable,[class*="drag"]');
        if (within) return within;
        cur = cur.parentElement;
    }
    return null;
}
