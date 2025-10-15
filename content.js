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
            case "Click": {
                const timeout = Number(step.selectorWaitMs) || 5000;
                const el = await waitForSelectorSafe(step.selector, timeout);
                if (!el) return { ok: false, error: "selector_not_found" };
                // Respond first, then perform the click to avoid losing the port on navigation
                setTimeout(() => { try { el.click(); } catch {} }, 0);
                return { ok: true };
            }

            case "FillText": {
                const timeout = Number(step.selectorWaitMs) || 5000;
                const el = await waitForSelectorSafe(step.selector, timeout);
                if (!el) return { ok: false, error: "selector_not_found" };
                el.focus();
                el.value = step.value;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
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
