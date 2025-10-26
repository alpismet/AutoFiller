// content.js — sayfa içinde çalışır; background'dan gelen adımları uygular

let __audioUnlocked = false;
let __selectorPicker = null;

const cssEscape = (value) => {
    if (typeof value !== "string") return "";
    if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
    }
    return value.replace(/[\0-\x1F\x7F"\'\\]/g, "\\$&");
};

function startSelectorPicker(requestId) {
    if (!document.body) return false;
    if (__selectorPicker) stopSelectorPicker(false, { notify: false });

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

    const tooltip = document.createElement("div");
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

    document.body.appendChild(highlight);
    document.body.appendChild(tooltip);

    const pickerState = {
        requestId,
        highlight,
        tooltip,
        currentTarget: null,
        handlers: {}
    };

    const updateTooltip = (target) => {
        if (!pickerState.tooltip) return;
        if (!target || target === document.body || target === document.documentElement) {
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
        const selector = computeUniqueSelector(target);
        if (selector) {
            stopSelectorPicker(true, { selector });
        } else {
            stopSelectorPicker(false, { reason: "selector_not_found" });
        }
    };

    const keyHandler = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            stopSelectorPicker(false, { reason: "cancelled" });
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

    document.addEventListener("mousemove", moveHandler, true);
    document.addEventListener("mousedown", preventHandler, true);
    document.addEventListener("mouseup", preventHandler, true);
    document.addEventListener("click", clickHandler, true);
    document.addEventListener("keydown", keyHandler, true);
    document.addEventListener("contextmenu", contextHandler, true);
    window.addEventListener("scroll", scrollHandler, true);

    __selectorPicker = pickerState;
    return true;
}

function stopSelectorPicker(success, detail = {}) {
    if (!__selectorPicker) return;
    const { highlight, tooltip, handlers, requestId } = __selectorPicker;
    if (highlight?.parentNode) highlight.parentNode.removeChild(highlight);
    if (tooltip?.parentNode) tooltip.parentNode.removeChild(tooltip);

    if (handlers) {
        document.removeEventListener("mousemove", handlers.moveHandler, true);
        document.removeEventListener("mousedown", handlers.preventHandler, true);
        document.removeEventListener("mouseup", handlers.preventHandler, true);
        document.removeEventListener("click", handlers.clickHandler, true);
        document.removeEventListener("keydown", handlers.keyHandler, true);
        document.removeEventListener("contextmenu", handlers.contextHandler, true);
        window.removeEventListener("scroll", handlers.scrollHandler, true);
    }

    __selectorPicker = null;

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
    if (!target || target === document.body || target === document.documentElement) {
        highlight.style.display = "none";
        return;
    }
    const rect = target.getBoundingClientRect();
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
    if (element.id) return `#${cssEscape(element.id)}`;

    const segments = [];
    let current = element;
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
            const matches = document.querySelectorAll(candidate);
            if (matches.length === 1 && matches[0] === element) {
                return candidate;
            }
        } catch {}

        current = parent;
        depth += 1;
    }

    return segments.join(" > ") || element.tagName.toLowerCase();
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
        const ok = startSelectorPicker(msg.requestId || null);
        sendResponse?.({ ok });
        return;
    }
    if (msg.type === "CANCEL_PICKER") {
        stopSelectorPicker(false, { reason: "cancelled" });
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

async function handleRunStep(step) {
    if (!step || typeof step.type !== "string") return { ok: false, error: "invalid_step" };
    try {
        switch (step.type) {
            case "CheckElement": {
                const selector = typeof step.selector === 'string' ? step.selector : '';
                const mode = (typeof step.mode === 'string' && step.mode.toLowerCase() === 'visible') ? 'visible' : 'exists';
                const timeout = Number(step.timeoutMs) || 0;
                const cond = await checkElementCondition(selector, mode, timeout);
                return { ok: true, value: cond };
            }
            case "PromptForCode": {
                const val = window.prompt(step.message || "Enter code");
                if (val && val.trim()) return { ok: true, value: val.trim() };
                return { ok: false, error: "cancelled" };
            }
            case "Click": {
                const timeout = Number(step.selectorWaitMs) || 5000;
                const base = await waitForSelectorSafe(step.selector, timeout);
                if (!base) return { ok: false, error: "selector_not_found" };
                const el = findClickable(base);
                // Respond first, then perform click respecting per-step forceClick or global setting
                setTimeout(() => {
                    try {
                        const rect = el.getBoundingClientRect();
                        const cx = rect.left + Math.max(1, rect.width) / 2;
                        const cy = rect.top + Math.max(1, rect.height) / 2;
                        const useNative = Boolean(step.forceClick || step.useNativeClick);
                        // When forcing/native allowed, robustClick attempts native first and falls back to synthetic
                        // Otherwise, still use the hardened synthetic sequence
                        if (useNative) robustClick(el); else syntheticClick(el, cx, cy);
                    } catch {}
                }, 0);
                return { ok: true };
            }

            case "FillText": {
                const timeout = Number(step.selectorWaitMs) || 5000;
                const value = await resolveVariablesInText(step.value);
                if (step.splitAcrossInputs) {
                    const start = Date.now();
                    const delay = step.slowType ? Math.max(0, Number(step.slowTypeDelayMs) || 100) : 0;
                    const onlyDigits = String(value).match(/\d/g);
                    const chars = onlyDigits && onlyDigits.length ? onlyDigits : Array.from(String(value));

                    const collectInputs = () => {
                        const base = (() => {
                            try { return document.querySelectorAll(step.selector); } catch { return []; }
                        })();
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
                                const base = await waitForSelectorSafe(step.selector, timeout);
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
                                        const byId = document.getElementById(forId);
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
                                const control = await waitForSelectorSafe(step.controlSelector, timeout);
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
                                        items = Array.from(document.querySelectorAll(itemSel));
                                        if (items.length) break;
                                        // Try looking within likely container elements (dropdowns near control)
                                        const root = control.closest('[aria-controls]') || control.parentElement || document.body;
                                        items = Array.from((root || document).querySelectorAll(itemSel));
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
                // Find primary element from selector
                let baseEl = await waitForSelectorSafe(step.selector, timeout);
                if (!baseEl) return { ok: false, error: "selector_not_found" };

                // Resolve input and drop target
                const asInput = (el) => el && el.tagName && el.tagName.toLowerCase() === 'input' && ((el.getAttribute('type')||'').toLowerCase() === 'file');
                let input = asInput(baseEl) ? baseEl : (baseEl.querySelector ? baseEl.querySelector("input[type='file']") : null);
                if (!input) {
                    try { input = document.querySelector(step.selector + " input[type='file']"); } catch {}
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

async function waitForSelectorSafe(selector, timeoutMs) {
    if (!selector || typeof selector !== "string") return null;
    const start = Date.now();
    const poll = 100;
    let el = null;
    while (Date.now() - start <= timeoutMs) {
        try {
            el = document.querySelector(selector);
            if (el) return el;
        } catch {}
        await sleep(poll);
    }
    return null;
}

async function waitForAllSelectors(selector, timeoutMs) {
    if (!selector || typeof selector !== "string") return [];
    const start = Date.now();
    const poll = 100;
    while (Date.now() - start <= timeoutMs) {
        try {
            const list = document.querySelectorAll(selector);
            if (list && list.length) return list;
        } catch {}
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
    try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch {}
    const rect = el.getBoundingClientRect();
    const x = rect.left + Math.max(1, rect.width) / 2;
    const y = rect.top + Math.max(1, rect.height) / 2;
    // Try native click first via background (isTrusted). If it fails, fallback to synthetic.
    try {
        chrome.runtime.sendMessage({ type: 'NATIVE_CLICK', x, y }, (res) => {
            if (chrome.runtime.lastError) {
                // cannot use native; fallback
                syntheticClick(el, x, y);
                return;
            }
            if (!res || res.ok !== true) {
                syntheticClick(el, x, y);
            }
        });
    } catch {
        syntheticClick(el, x, y);
    }
}

function syntheticClick(el, x, y) {
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
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

async function checkElementCondition(selector, mode, timeoutMs) {
    const start = Date.now();
    const poll = 100;
    const test = () => {
        let el = null;
        try { el = document.querySelector(selector); } catch {}
        if (!el) return false;
        if (mode === 'exists') return true;
        return isVisible(el);
    };
    if (!selector || typeof selector !== 'string') return false;
    if (!timeoutMs || timeoutMs <= 0) return test();
    while (Date.now() - start <= timeoutMs) {
        if (test()) return true;
        await sleep(poll);
    }
    return false;
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
