// options.js — Flow Editor UI
const DEFAULT_FLOW_NAME = "Example Flow";
const DEFAULT_FLOW = [
  { type: "GoToURL", url: "https://www.google.com/" },
  { type: "FillText", selector: "textarea[name=\"q\"]", value: "hello" },
  { type: "PlaySound" }
];

const DEFAULT_SETTINGS = Object.freeze({
  stepDelayMs: 300,
  selectorWaitMs: 5000,
  useNativeClick: false
});

const RUN_STATUS_META = {
  idle: { icon: "○", label: "Idle", className: "status-idle" },
  pending: { icon: "⏳", label: "Pending", className: "status-pending" },
  running: { icon: "▶", label: "Running", className: "status-running" },
  success: { icon: "✅", label: "Complete", className: "status-success" },
  error: { icon: "⚠️", label: "Error", className: "status-error" }
};

const STEP_LIBRARY = [
  {
    type: "GoToURL",
    label: "Go to URL",
    description: "Navigate the target tab to a specific URL.",
    fields: [
      { key: "url", label: "URL", type: "url", required: true, placeholder: "https://www.google.com" }
    ]
  },
  {
    type: "Click",
    label: "Click element",
    description: "Click the first element matching the selector.",
    fields: [
      { key: "selector", label: "CSS Selector", type: "text", required: true, placeholder: "#submit", supportsPicker: true }
    ]
  },
  {
    type: "FillText",
    label: "Fill text",
    description: "Type into an input matching the selector.",
    fields: [
      { key: "selector", label: "CSS Selector", type: "text", required: true, placeholder: "input[name='email']", supportsPicker: true },
      { key: "value", label: "Value", type: "textarea", required: true, placeholder: "hello@example.com" },
      { key: "splitAcrossInputs", label: "Split value across multiple inputs", type: "checkbox", default: false }
    ]
  },
  {
    type: "Wait",
    label: "Wait",
    description: "Pause the flow for a number of milliseconds.",
    fields: [
      { key: "ms", label: "Milliseconds", type: "number", required: true, placeholder: "1000", min: 0, step: 100, default: 1000 }
    ]
  },
  {
    type: "EnsureAudio",
    label: "Ensure audio",
    description: "Prompt the tab to allow audio playback if necessary.",
    fields: [
      { key: "timeoutMs", label: "Timeout (ms)", type: "number", placeholder: "60000", min: 1000, step: 500, default: 60000 }
    ]
  },
  {
    type: "PlaySound",
    label: "Play sound",
    description: "Play the completion chime (requires audio permission).",
    fields: []
  }
  ,
  {
    type: "SelectDropdown",
    label: "Select from dropdown",
    description: "Open a dropdown and select an option by text.",
    fields: [
      { key: "controlSelector", label: "Control selector", type: "text", required: true, placeholder: ".agora-input-select-control", supportsPicker: true },
      { key: "optionText", label: "Option text contains", type: "text", required: true, placeholder: "Turquia" },
      { key: "optionItemSelector", label: "Option items selector (optional)", type: "text", required: false, placeholder: "li,[role='option'],.dropdown-item,.agora-dropdown-option" },
      { key: "timeoutMs", label: "Timeout (ms)", type: "number", placeholder: "10000", min: 500, step: 500, default: 10000 }
    ]
  }
  ,
  {
    type: "WaitForEmailGmail",
    label: "Wait for Email (Gmail)",
    description: "Poll Gmail with a search query and extract a 6-digit code.",
    fields: [
      { key: "subject", label: "Email subject contains", type: "text", required: true, placeholder: "code" },
      { key: "timeoutMs", label: "Timeout (ms)", type: "number", placeholder: "120000", min: 1000, step: 500, default: 120000 },
      { key: "pollMs", label: "Poll interval (ms)", type: "number", placeholder: "5000", min: 500, step: 500, default: 5000 },
      { key: "variable", label: "Save as variable", type: "text", required: true, placeholder: "otp", default: "otp" }
    ]
  }
];

const STEP_LIBRARY_MAP = new Map(STEP_LIBRARY.map((step) => [step.type, step]));

const els = {
  stepsContainer: document.getElementById("stepsContainer"),
  emptyState: document.getElementById("emptyState"),
  addStep: document.getElementById("addStep"),
  saveFlow: document.getElementById("saveFlow"),
  discardChanges: document.getElementById("discardChanges"),
  loadDefault: document.getElementById("loadDefault"),
  exportFlow: document.getElementById("exportFlow"),
  importFlow: document.getElementById("importFlow"),
  runFlow: document.getElementById("runFlow"),
  status: document.getElementById("status"),
  stepTemplate: document.getElementById("step-template"),
  flowName: document.getElementById("flowName"),
  // tabs
  tabFlowBtn: document.getElementById("tabFlowBtn"),
  tabSettingsBtn: document.getElementById("tabSettingsBtn"),
  tabFlow: document.getElementById("tab-flow"),
  tabSettings: document.getElementById("tab-settings"),
  // settings controls
  stepDelayMs: document.getElementById("stepDelayMs"),
  selectorWaitMs: document.getElementById("selectorWaitMs"),
  useNativeClick: document.getElementById("useNativeClick"),
  gmailClientId: document.getElementById("gmailClientId"),
  connectGmailBtn: document.getElementById("connectGmailBtn"),
  testWaitForEmailGmailBtn: document.getElementById("testWaitForEmailGmailBtn"),
  gmailStatus: document.getElementById("gmailStatus")
};

const state = {
  steps: [],
  flowName: DEFAULT_FLOW_NAME,
  dirty: false,
  lastSaved: { steps: [], flowName: DEFAULT_FLOW_NAME },
  statusTimer: null,
  pendingPicker: null,
  settings: { ...DEFAULT_SETTINGS },
  stepStatuses: [] /* array of 'idle|pending|running|success|error' per step */
};

const PICKER_STATUS_TEXT = "Element picker active – click the target element or press Esc to cancel.";

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "PICKER_RESULT") {
    handlePickerResult(msg);
    return;
  }
  if (msg.type === "FLOW_STATUS") {
    handleFlowStatus(msg);
  }
});

init().catch((err) => {
  console.error("[options] Failed to initialise:", err);
  alert("Flow editor failed to load. Check the console for details.");
});

async function init() {
  wireEvents();
  window.addEventListener("beforeunload", () => {
    if (state.pendingPicker) {
      try {
        chrome.runtime.sendMessage({
          type: "CANCEL_SELECTOR_PICKER",
          requestId: state.pendingPicker.requestId,
          tabId: state.pendingPicker.tabId
        });
      } catch {}
    }
  });
  await loadFromStorage();
  initTabs();
  render();
}

function wireEvents() {
  els.addStep?.addEventListener("click", () => {
    addStep();
    render();
    setDirty(true);
  });

  els.saveFlow?.addEventListener("click", async () => {
    const saved = await persistFlow();
    if (saved) showStatus("Flow saved to storage.");
  });

  els.discardChanges?.addEventListener("click", () => {
    restoreLastSaved();
    render();
    setDirty(false);
    showStatus("Changes discarded.");
  });

  els.loadDefault?.addEventListener("click", () => {
    if (!confirm("Replace the current steps with the default example flow?")) return;
    state.steps = cloneFlow(DEFAULT_FLOW);
    state.flowName = DEFAULT_FLOW_NAME;
    state.stepStatuses = state.steps.map(() => "idle");
    render();
    setDirty(true);
    showStatus("Loaded default flow. Save to persist.");
  });

  els.exportFlow?.addEventListener("click", () => {
    exportFlow();
  });

  els.importFlow?.addEventListener("change", async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      applyImportedFlow(payload);
      render();
      setDirty(true);
      showStatus("Imported flow. Save to persist.");
    } catch (err) {
      console.error("[options] Import failed:", err);
      alert("Invalid flow JSON. Details in the console.");
    } finally {
      event.target.value = "";
    }
  });

  els.runFlow?.addEventListener("click", async () => {
    const prepared = validateAndPrepare();
    if (!prepared) return;
    await persistFlow({ steps: prepared.steps, flowName: prepared.flowName, silent: true });
    const ok = await triggerRunFlow();
    if (ok) {
      showStatus("Flow dispatched to active tab.");
    }
  });

  els.flowName?.addEventListener("input", (event) => {
    state.flowName = event.target.value;
    setDirty(true, { silent: true });
  });

  // tabs
  els.tabFlowBtn?.addEventListener("click", () => selectTab("flow"));
  els.tabSettingsBtn?.addEventListener("click", () => selectTab("settings"));

  // settings inputs
  els.stepDelayMs?.addEventListener("input", (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v >= 0) {
      state.settings.stepDelayMs = v;
      setDirty(true, { silent: true });
    }
  });
  els.selectorWaitMs?.addEventListener("input", (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v >= 0) {
      state.settings.selectorWaitMs = v;
      setDirty(true, { silent: true });
    }
  });

  els.useNativeClick?.addEventListener("change", (e) => {
    state.settings.useNativeClick = Boolean(e.target.checked);
    setDirty(true, { silent: true });
  });

  els.gmailClientId?.addEventListener("input", (e) => {
    const v = e.target.value.trim();
    state.settings.gmailClientId = v;
    setDirty(true, { silent: true });
  });

  els.connectGmailBtn?.addEventListener("click", async () => {
    try {
      const clientId = state.settings.gmailClientId?.trim();
      if (!clientId) { alert("Enter Gmail OAuth Client ID in Settings"); return; }
      const res = await chrome.runtime.sendMessage({ type: "GMAIL_CONNECT", clientId });
      if (!res?.ok) { alert("Gmail connect failed: " + (res?.error || "unknown")); return; }
      els.gmailStatus.textContent = `Connected as ${res.email || 'account'}`;
      showStatus("Gmail connected.");
    } catch (err) {
      console.error("[options] Gmail connect error:", err);
      alert("Gmail connect error: " + err.message);
    }
  });

  els.testWaitForEmailGmailBtn?.addEventListener("click", async () => {
    try {
      const subject = prompt("Email subject contains", "code");
      if (subject == null) return;
      const res = await chrome.runtime.sendMessage({ type: "TEST_WAIT_FOR_EMAIL_GMAIL", subject, timeoutMs: 60000, pollMs: 5000 });
      if (res?.ok) {
        console.log("[Test] Gmail code:", res.value);
        alert("Code: " + res.value);
      } else {
        alert("No code found: " + (res?.error || "unknown"));
      }
    } catch (err) {
      console.error("[options] Test WaitForEmailGmail error:", err);
      alert("Test error: " + err.message);
    }
  });

  // removed: mailslurp API key

}

async function loadFromStorage() {
  try {
    const { activeFlow, flowName, settings } = await chrome.storage.local.get(["activeFlow", "flowName", "settings"]);
    const sanitized = sanitizeFlowArray(activeFlow);
    state.steps = sanitized.length ? sanitized : cloneFlow(DEFAULT_FLOW);
    state.flowName = typeof flowName === "string" && flowName.trim() ? flowName : DEFAULT_FLOW_NAME;
    state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    // initialize statuses
    state.stepStatuses = state.steps.map(() => "idle");
    snapshotAsSaved();
    setDirty(false, { silent: true });
  } catch (err) {
    console.warn("[options] Failed to load stored flow, using defaults:", err);
    state.steps = cloneFlow(DEFAULT_FLOW);
    state.flowName = DEFAULT_FLOW_NAME;
    state.settings = { ...DEFAULT_SETTINGS };
    state.stepStatuses = state.steps.map(() => "idle");
    snapshotAsSaved();
    setDirty(false, { silent: true });
  }
}

function render() {
  renderSteps();
  els.flowName.value = state.flowName;
  // settings reflect
  if (els.stepDelayMs) els.stepDelayMs.value = String(state.settings.stepDelayMs ?? DEFAULT_SETTINGS.stepDelayMs);
  if (els.selectorWaitMs) els.selectorWaitMs.value = String(state.settings.selectorWaitMs ?? DEFAULT_SETTINGS.selectorWaitMs);
  if (els.useNativeClick) els.useNativeClick.checked = Boolean(state.settings.useNativeClick ?? DEFAULT_SETTINGS.useNativeClick);
  if (els.gmailClientId) els.gmailClientId.value = String(state.settings.gmailClientId ?? "");
  if (els.gmailStatus) {
    const conn = state.settings.gmailConnection?.email;
    if (conn) {
      const text = `Connected as ${conn}`;
      els.gmailStatus.textContent = text;
      els.gmailStatus.title = text;
    } else {
      els.gmailStatus.textContent = "Not connected";
      els.gmailStatus.title = "Not connected";
    }
  }
  updateEmptyState();
  setControlsDisabled(Boolean(state.pendingPicker));
  if (state.pendingPicker) {
    showStatus(PICKER_STATUS_TEXT, { persistent: true });
  } else if (state.dirty) {
    if (!els.status.textContent) {
      showStatus("Unsaved changes.");
    }
  }
}

function renderSteps() {
  const container = els.stepsContainer;
  if (!container) return;
  container.innerHTML = "";

  state.steps.forEach((step, index) => {
    const card = createStepCard(step, index);
    container.appendChild(card);
  });
}

function createStepCard(step, index) {
  const template = els.stepTemplate;
  const schema = STEP_LIBRARY_MAP.get(step.type) || STEP_LIBRARY[0];
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".step-card");
  const title = card.querySelector(".step-title");
  const typeSelect = card.querySelector(".step-type");
  const fieldsContainer = card.querySelector(".step-fields");
  // status chip (now in its own row)
  const chip = card.querySelector(".step-status .status-chip");
  const chipIcon = card.querySelector(".chip-icon");
  const chipLabel = card.querySelector(".chip-label");

  title.textContent = `Step ${index + 1} — ${schema?.label || step.type}`;

  // set status
  const st = RUN_STATUS_META[state.stepStatuses[index] || "idle"] || RUN_STATUS_META.idle;
  chipIcon.textContent = st.icon;
  chipLabel.textContent = st.label;
  chip.className = `status-chip ${st.className}`;

  STEP_LIBRARY.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.type;
    option.textContent = item.label;
    option.selected = item.type === step.type;
    typeSelect.appendChild(option);
  });

  typeSelect.addEventListener("change", (event) => {
    const newType = event.target.value;
    updateStepType(index, newType);
    render();
    setDirty(true);
  });

  typeSelect.disabled = Boolean(state.pendingPicker);

  const actions = card.querySelectorAll(".step-actions [data-action]");
  actions.forEach((btn) => {
    btn.disabled = Boolean(state.pendingPicker);
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (action === "delete") {
        deleteStep(index);
      } else if (action === "up") {
        moveStep(index, -1);
      } else if (action === "down") {
        moveStep(index, +1);
      } else if (action === "run") {
        runSingleStep(index);
      }
    });
  });

  buildFields(fieldsContainer, schema, step, index);

  return card;
}

async function runSingleStep(index) {
  if (state.pendingPicker) {
    alert("Finish the element picker before running a step.");
    return;
  }
  // Prepare just this step
  const step = state.steps[index];
  if (!step) return;
  // Validate minimal required fields based on schema
  const schema = STEP_LIBRARY_MAP.get(step.type);
  if (!schema) { alert(`Unknown step type at #${index + 1}`); return; }
  const prepared = { type: step.type };
  for (const field of schema.fields) {
    const value = step[field.key];
    const isEmpty = value == null || (typeof value === "string" && value.trim() === "");
    if (field.required && isEmpty) {
      alert(`Step ${index + 1}: ${field.label} is required.`);
      return;
    }
    if (!isEmpty) prepared[field.key] = field.type === "number" ? Number(value) : (typeof value === "string" ? value.trim() : value);
  }
  // Send to background to run single step
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { alert("No active tab found."); return; }
    // mark status pending for this step
    state.stepStatuses[index] = "pending";
    render();
    // carry forceClick for Click steps
    if (prepared.type === "Click") {
      prepared.forceClick = Boolean(state.steps[index]?.forceClick);
    }
    const res = await chrome.runtime.sendMessage({ type: "RUN_SINGLE_STEP", tabId: tab.id, step: prepared, index });
    if (!res?.ok) {
      state.stepStatuses[index] = "error";
      render();
      alert("Step failed: " + (res?.error || "unknown error"));
      return;
    }
    // Background will also broadcast success/error, but we update optimistically
    state.stepStatuses[index] = "success";
    render();
  } catch (err) {
    console.error("[options] Single step run failed:", err);
    state.stepStatuses[index] = "error";
    render();
    alert("Error running step: " + err.message);
  }
}

function buildFields(container, schema, step, stepIndex) {
  container.innerHTML = "";
  if (!schema) return;

  schema.fields.forEach((field) => {
    // Hide the dedicated checkbox field for FillText split since we expose an inline toggle next to selector
    if (schema.type === "FillText" && field.key === "splitAcrossInputs") {
      // Ensure the value remains in the step object via defaults/sanitization, but don't render a separate UI control
      return;
    }
    const fieldWrapper = document.createElement("div");
    fieldWrapper.className = "field";

    const label = document.createElement("label");
    label.textContent = field.label;

    let input;
    if (field.type === "textarea") {
      input = document.createElement("textarea");
    } else if (field.type === "select") {
      input = document.createElement("select");
      (field.options || []).forEach((opt) => {
        const option = document.createElement("option");
        option.value = String(opt.value);
        option.textContent = String(opt.label ?? opt.value);
        input.appendChild(option);
      });
    } else if (field.type === "checkbox") {
      input = document.createElement("input");
      input.type = "checkbox";
    } else {
      input = document.createElement("input");
      input.type = field.type === "number" ? "number" : field.type === "url" ? "url" : "text";
    }

    input.placeholder = field.placeholder || "";
    if (field.type === "number") {
      if (typeof field.min !== "undefined") input.min = String(field.min);
      if (typeof field.max !== "undefined") input.max = String(field.max);
      if (typeof field.step !== "undefined") input.step = String(field.step);
    }

    const existing = step[field.key];
    if (field.type === "checkbox") {
      if (existing !== undefined && existing !== null) {
        input.checked = Boolean(existing);
      } else if (field.default !== undefined) {
        input.checked = Boolean(field.default);
      }
    } else if (field.type === "select") {
      if (existing !== undefined && existing !== null) {
        input.value = String(existing);
      } else if (field.default !== undefined) {
        input.value = String(field.default);
      }
    } else {
      if (existing !== undefined && existing !== null) {
        input.value = String(existing);
      } else if (field.default !== undefined) {
        input.value = String(field.default);
      }
    }

    if (field.type === "checkbox") {
      input.addEventListener("change", (event) => {
        const rawValue = Boolean(event.target.checked);
        setDirty(true, { silent: true });
        updateFieldValue(stepIndex, field, rawValue);
      });
    } else if (field.type === "select") {
      input.addEventListener("change", (event) => {
        const rawValue = event.target.value;
        setDirty(true, { silent: true });
        updateFieldValue(stepIndex, field, rawValue);
      });
    } else {
      input.addEventListener("input", (event) => {
        const rawValue = event.target.value;
        setDirty(true, { silent: true });
        updateFieldValue(stepIndex, field, rawValue);
      });
    }

    let inputHost = input;
    if (field.supportsPicker) {
      const row = document.createElement("div");
      row.className = "input-row";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "icon picker-btn";
      btn.title = "Pick element from active tab";
      btn.textContent = "🎯";
      const isActive = isPickerContext(stepIndex, field.key);
      btn.classList.toggle("active", isActive);
      btn.disabled = Boolean(state.pendingPicker) && !isActive;
      btn.addEventListener("click", () => {
        requestSelectorPick({ stepIndex, field });
      });
      row.appendChild(input);
      row.appendChild(btn);

      // Add Force toggle next to selector for Click steps
      const stepObj = state.steps[stepIndex];
      const isClickSelector = stepObj?.type === "Click" && field.key === "selector";
      if (isClickSelector) {
        const forceBtn = document.createElement("button");
        forceBtn.type = "button";
        forceBtn.className = "toggle";
        forceBtn.title = "Force";
        forceBtn.setAttribute("aria-label", "Force click (native)");
        forceBtn.textContent = "⚡";
        const applyForceState = () => {
          const active = Boolean(state.steps[stepIndex]?.forceClick);
          forceBtn.classList.toggle("active", active);
          forceBtn.setAttribute("aria-pressed", String(active));
        };
        applyForceState();
        forceBtn.addEventListener("click", () => {
          const cur = Boolean(state.steps[stepIndex]?.forceClick);
          state.steps[stepIndex].forceClick = !cur;
          applyForceState();
          setDirty(true, { silent: true });
        });
        row.appendChild(forceBtn);
      }

      // Add Split toggle next to selector for FillText steps (one char per input)
      const isFillTextSelector = stepObj?.type === "FillText" && field.key === "selector";
      if (isFillTextSelector) {
        const splitBtn = document.createElement("button");
        splitBtn.type = "button";
        splitBtn.className = "toggle";
        splitBtn.title = "Split across multiple inputs";
        splitBtn.setAttribute("aria-label", "Split value across multiple inputs");
        splitBtn.textContent = "🔢";
        const applySplitState = () => {
          const active = Boolean(state.steps[stepIndex]?.splitAcrossInputs);
          splitBtn.classList.toggle("active", active);
          splitBtn.setAttribute("aria-pressed", String(active));
        };
        applySplitState();
        splitBtn.addEventListener("click", () => {
          const cur = Boolean(state.steps[stepIndex]?.splitAcrossInputs);
          state.steps[stepIndex].splitAcrossInputs = !cur;
          applySplitState();
          setDirty(true, { silent: true });
        });
        row.appendChild(splitBtn);
      }
      inputHost = row;
      if (isActive) {
        fieldWrapper.classList.add("picking");
      } else {
        fieldWrapper.classList.remove("picking");
      }
    }

    // If this is the Gmail step's variable field, append a small badge with the current stored value
    if (schema.type === "WaitForEmailGmail" && field.key === "variable") {
      const row = document.createElement("div");
      row.className = "input-row";
      row.appendChild(inputHost);
      const badge = document.createElement("span");
      badge.className = "mini-badge"; // relies on existing styles; otherwise minimal inline
      badge.title = "Current variable value";
      const applyBadge = async () => {
        try {
          const key = (state.steps[stepIndex]?.variable || "otp").trim() || "otp";
          const data = await chrome.storage.local.get(["variables"]);
          const v = data?.variables?.[key];
          if (v == null || String(v) === "") {
            badge.textContent = "(empty)";
            badge.style.opacity = "0.6";
          } else {
            badge.textContent = String(v);
            badge.style.opacity = "1";
          }
        } catch {
          badge.textContent = "(n/a)";
          badge.style.opacity = "0.6";
        }
      };
      // initial value
      applyBadge();
      // update when input changes (variable name changed)
      const baseSet = inputHost;
      const inputEl = baseSet instanceof HTMLElement ? baseSet.querySelector("input,textarea,select") || baseSet : baseSet;
      if (inputEl && inputEl.addEventListener) {
        inputEl.addEventListener("input", () => {
          // defer to allow state update
          setTimeout(applyBadge, 0);
        });
      }
      // listen storage changes to refresh live
      const onChanged = (changes, area) => {
        if (area !== "local" || !changes.variables) return;
        applyBadge();
      };
      try { chrome.storage.onChanged.addListener(onChanged); } catch {}
      // best-effort cleanup when re-rendering: rely on re-render to replace nodes
      row.appendChild(badge);
      fieldWrapper.appendChild(label);
      fieldWrapper.appendChild(row);
    } else {
      fieldWrapper.appendChild(label);
      fieldWrapper.appendChild(inputHost);
    }
    container.appendChild(fieldWrapper);
  });
}

function addStep(type = STEP_LIBRARY[0].type) {
  if (state.pendingPicker) {
    alert("Finish the element picker first.");
    return;
  }
  const schema = STEP_LIBRARY_MAP.get(type) || STEP_LIBRARY[0];
  const newStep = createStepFromSchema(schema);
  state.steps.push(newStep);
  state.stepStatuses.push("idle");
  updateEmptyState();
}

function deleteStep(index) {
  if (state.pendingPicker) {
    alert("Finish the element picker first.");
    return;
  }
  state.steps.splice(index, 1);
  state.stepStatuses.splice(index, 1);
  render();
  setDirty(true);
  showStatus("Step removed.");
}

function moveStep(index, delta) {
  if (state.pendingPicker) {
    alert("Finish the element picker first.");
    return;
  }
  const newIndex = index + delta;
  if (newIndex < 0 || newIndex >= state.steps.length) return;
  const [step] = state.steps.splice(index, 1);
  state.steps.splice(newIndex, 0, step);
  const [st] = state.stepStatuses.splice(index, 1);
  state.stepStatuses.splice(newIndex, 0, st || "idle");
  render();
  setDirty(true);
}

function updateStepType(index, newType) {
  if (state.pendingPicker) return;
  const schema = STEP_LIBRARY_MAP.get(newType);
  if (!schema) return;
  const current = state.steps[index] || {};
  const next = createStepFromSchema(schema);
  schema.fields.forEach((field) => {
    if (current[field.key] !== undefined && current[field.key] !== null) {
      next[field.key] = current[field.key];
    }
  });
  next.type = newType;
  if (newType === "Click" && current.forceClick !== undefined) {
    next.forceClick = current.forceClick;
  }
  state.steps[index] = next;
}

function updateFieldValue(stepIndex, field, rawValue) {
  const step = state.steps[stepIndex];
  if (!step) return;
  step[field.key] = rawValue;
}

function createStepFromSchema(schema) {
  const base = { type: schema.type };
  schema.fields.forEach((field) => {
    if (field.default !== undefined) {
      base[field.key] = field.type === "number" ? field.default : field.default;
    } else {
      base[field.key] = field.type === "number" ? "" : "";
    }
  });
  if (schema.type === "Click") {
    base.forceClick = false;
  }
  return base;
}

function updateEmptyState() {
  if (!els.emptyState) return;
  if (state.steps.length === 0) {
    els.emptyState.classList.remove("hidden");
  } else {
    els.emptyState.classList.add("hidden");
  }
}

function setControlsDisabled(disabled) {
  const toggle = (el) => {
    if (!el) return;
    el.disabled = disabled;
  };
  toggle(els.addStep);
  toggle(els.saveFlow);
  toggle(els.discardChanges);
  toggle(els.loadDefault);
  toggle(els.exportFlow);
  toggle(els.runFlow);
  if (els.importFlow) {
    els.importFlow.disabled = disabled;
    const label = els.importFlow.closest(".import-btn");
    if (label) label.classList.toggle("disabled", disabled);
  }
}

function isPickerContext(stepIndex, fieldKey) {
  const pending = state.pendingPicker;
  if (!pending) return false;
  return pending.stepIndex === stepIndex && pending.fieldKey === fieldKey;
}

function setDirty(flag, { silent } = {}) {
  state.dirty = flag;
  if (flag && !silent) {
    showStatus("Unsaved changes.");
  }
}

function showStatus(message, { persistent = false } = {}) {
  if (!els.status) return;
  if (state.statusTimer) {
    clearTimeout(state.statusTimer);
    state.statusTimer = null;
  }
  els.status.textContent = message || "";
  if (message && !persistent) {
    state.statusTimer = setTimeout(() => {
      if (!state.pendingPicker) {
        els.status.textContent = "";
      }
    }, 3200);
  }
}

async function persistFlow({ steps, flowName, silent } = {}) {
  const prepared = steps && flowName ? { steps, flowName } : validateAndPrepare();
  if (!prepared) return false;
  try {
    await chrome.storage.local.set({
      activeFlow: prepared.steps,
      flowName: prepared.flowName,
      settings: state.settings
    });
    state.steps = sanitizeFlowArray(prepared.steps);
    state.flowName = prepared.flowName;
    state.stepStatuses = state.steps.map(() => "idle");
    snapshotAsSaved();
    state.dirty = false;
    if (!silent) showStatus("Flow saved to storage.");
    render();
    return true;
  } catch (err) {
    console.error("[options] Failed to save flow:", err);
    alert("Failed to save flow. See console for details.");
    return false;
  }
}

function restoreLastSaved() {
  state.steps = cloneFlow(state.lastSaved.steps);
  state.flowName = state.lastSaved.flowName;
}

function snapshotAsSaved() {
  state.lastSaved = {
    steps: cloneFlow(state.steps),
    flowName: state.flowName
  };
}

function validateAndPrepare() {
  const errors = [];
  const preparedSteps = [];

  state.steps.forEach((step, index) => {
    const schema = STEP_LIBRARY_MAP.get(step.type);
    if (!schema) {
      errors.push(`Step ${index + 1}: Unknown type "${step.type}".`);
      return;
    }
    const prepared = { type: step.type };
    schema.fields.forEach((field) => {
      const value = step[field.key];
      const isEmpty = value === null || value === undefined || (typeof value === "string" && value.trim() === "");
      if (field.required && isEmpty) {
        errors.push(`Step ${index + 1}: ${field.label} is required.`);
        return;
      }
      if (field.type === "number") {
        if (isEmpty) return;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
          errors.push(`Step ${index + 1}: ${field.label} must be a number.`);
          return;
        }
        if (typeof field.min === "number" && numeric < field.min) {
          errors.push(`Step ${index + 1}: ${field.label} must be ≥ ${field.min}.`);
          return;
        }
        prepared[field.key] = numeric;
      } else if (!isEmpty) {
        prepared[field.key] = typeof value === "string" ? value.trim() : value;
      }
    });
    // carry per-step extras
    if (step.type === "Click" && step.forceClick !== undefined) {
      prepared.forceClick = Boolean(step.forceClick);
    }
    preparedSteps.push(prepared);
  });

  if (errors.length) {
    alert("Fix the following issues before saving:\n\n" + errors.join("\n"));
    return null;
  }

  const flowName = state.flowName && state.flowName.trim() ? state.flowName.trim() : DEFAULT_FLOW_NAME;

  if (!preparedSteps.length) {
    alert("Add at least one step before saving or running the flow.");
    return null;
  }

  return { steps: preparedSteps, flowName };
}

async function requestSelectorPick({ stepIndex, field }) {
  if (state.pendingPicker) {
    const proceed = confirm("Cancel the current element picker?");
    if (!proceed) return;
    await cancelPicker({ silent: true });
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      alert("No active tab found. Open a regular webpage and try again.");
      return;
    }

    const requestId = `pick_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    state.pendingPicker = {
      requestId,
      stepIndex,
      fieldKey: field.key,
      tabId: tab.id
    };
    render();
    showStatus(PICKER_STATUS_TEXT, { persistent: true });

    const res = await chrome.runtime.sendMessage({
      type: "START_SELECTOR_PICKER",
      requestId,
      tabId: tab.id
    });
    if (!res || !res.ok) {
      throw new Error(res?.error || "Unable to start picker on the active tab.");
    }
  } catch (err) {
    console.error("[options] Failed to start element picker:", err);
    alert(err?.message || "Unable to start element picker.");
    state.pendingPicker = null;
    render();
    showStatus(err?.message || "Unable to start element picker.");
  }
}

async function cancelPicker({ silent } = {}) {
  if (!state.pendingPicker) return;
  const { requestId, tabId } = state.pendingPicker;
  state.pendingPicker = null;
  render();
  try {
    await chrome.runtime.sendMessage({
      type: "CANCEL_SELECTOR_PICKER",
      requestId,
      tabId
    });
  } catch (err) {
    console.warn("[options] Failed to cancel picker:", err);
  }
  if (!silent) {
    showStatus("Element picker cancelled.");
  }
}

function handlePickerResult(msg) {
  const pending = state.pendingPicker;
  if (!pending || msg.requestId !== pending.requestId) return;
  state.pendingPicker = null;
  if (msg.success && msg.selector) {
    const { stepIndex, fieldKey } = pending;
    if (state.steps[stepIndex]) {
      state.steps[stepIndex][fieldKey] = msg.selector;
      setDirty(true, { silent: true });
      render();
      showStatus(`Selector captured: ${msg.selector}`);
      return;
    }
    render();
    showStatus("Selector captured, but the step no longer exists.");
  } else {
    render();
    if (msg.reason === "selector_not_found") {
      showStatus("Could not determine a unique selector. Try a different element.");
    } else {
      showStatus("Element picker cancelled.");
    }
  }
}

function sanitizeFlowArray(value) {
  if (!Array.isArray(value)) return [];
  const sanitized = [];
  value.forEach((step) => {
    const schema = STEP_LIBRARY_MAP.get(step?.type);
    if (!schema) return;
    const normalized = { type: schema.type };
    schema.fields.forEach((field) => {
      if (step[field.key] !== undefined && step[field.key] !== null) {
        normalized[field.key] = step[field.key];
      } else if (field.default !== undefined) {
        normalized[field.key] = field.default;
      }
    });
    // carry non-schema extras
    if (step.type === "Click" && step.forceClick !== undefined) {
      normalized.forceClick = Boolean(step.forceClick);
    }
    sanitized.push(normalized);
  });
  return sanitized;
}

function cloneFlow(flow) {
  return Array.isArray(flow) ? flow.map((step) => ({ ...step })) : [];
}

function exportFlow() {
  const prepared = validateAndPrepare();
  if (!prepared) return;
  const stepsOut = prepared.steps.map((s, i) => {
    const src = state.steps[i] || {};
    return s.type === "Click" && src.forceClick !== undefined ? { ...s, forceClick: Boolean(src.forceClick) } : s;
  });
  const payload = { name: prepared.flowName, steps: stepsOut };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(prepared.flowName)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showStatus("Flow exported as JSON.");
}

function applyImportedFlow(payload) {
  const importedSteps = Array.isArray(payload) ? payload : Array.isArray(payload?.steps) ? payload.steps : null;
  if (!importedSteps) throw new Error("Missing steps array.");
  const importedName = typeof payload?.name === "string" ? payload.name : DEFAULT_FLOW_NAME;
  const sanitized = sanitizeFlowArray(importedSteps);
  if (!sanitized.length) throw new Error("No valid steps in file.");
  state.steps = sanitized;
  state.flowName = importedName;
  state.stepStatuses = state.steps.map(() => "idle");
}

function slugify(text) {
  const fallback = "flow";
  if (!text) return fallback;
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50) || fallback;
}

async function triggerRunFlow() {
  if (state.pendingPicker) {
    alert("Finish the element picker before running the flow.");
    return false;
  }
  // reset statuses to pending
  state.stepStatuses = state.steps.map(() => "pending");
  render();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      alert("No active tab found. Open a regular webpage and try again.");
      return false;
    }
    const res = await chrome.runtime.sendMessage({ type: "RUN_FLOW", tabId: tab.id });
    if (!res) {
      alert("Background service worker did not respond. Try reloading the extension.");
      return false;
    }
    if (!res.ok) {
      alert("Failed to start flow: " + (res.error || "unknown error"));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[options] Failed to start flow:", err);
    alert("Error starting flow: " + err.message);
    return false;
  }
}

// tabs helpers
function initTabs() { selectTab("flow"); }

function selectTab(name) {
  const flow = name === "flow";
  els.tabFlowBtn?.classList.toggle("active", flow);
  els.tabSettingsBtn?.classList.toggle("active", !flow);
  els.tabFlow?.classList.toggle("hidden", !flow);
  els.tabSettings?.classList.toggle("hidden", flow);
}

// pin logic removed

// Flow status handling messages from background
function handleFlowStatus(msg) {
  if (msg.kind === "FLOW_RESET") {
    state.stepStatuses = state.steps.map(() => "pending");
    render();
    return;
  }
  if (typeof msg.index === "number") {
    const idx = msg.index;
    if (!state.stepStatuses[idx]) return;
    let status = msg.status; // running|success|error
    if (!RUN_STATUS_META[status]) status = "idle";
    state.stepStatuses[idx] = status;
    render();
  }
}
