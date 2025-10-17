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
    type: "SelectFiles",
    label: "Select files",
    description: "Attach files to an input or dropzone (supports multiple).",
    fields: [
      { key: "selector", label: "Target selector", type: "text", required: true, placeholder: "input[type='file'], .dropzone", supportsPicker: true },
      // files is a custom UI field handled by buildFields (type: filelist)
      { key: "files", label: "Files", type: "filelist", required: true, default: [] }
    ]
  },
  {
    type: "If",
    label: "If",
    description: "Conditionally run different steps based on a check.",
    fields: [
      { key: "mode", label: "Condition", type: "select", required: true, options: [
        { value: "exists", label: "Element exists" },
        { value: "visible", label: "Element visible" }
      ], default: "exists" },
      { key: "selector", label: "Target selector", type: "text", required: true, placeholder: "#panel, .modal, [data-open]", supportsPicker: true },
      { key: "timeoutMs", label: "Wait up to (ms)", type: "number", min: 0, step: 100, default: 0 }
    ]
  },
  {
    type: "Restart",
    label: "Restart flow",
    description: "Restart execution from the first step. Prevent loops with Max restarts.",
    fields: [
      { key: "max", label: "Max restarts (-1 = infinite)", type: "number", min: -1, step: 1, default: 1 }
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
      { key: "splitAcrossInputs", label: "Split value across multiple inputs", type: "checkbox", default: false },
      { key: "slowType", label: "Slow typing", type: "checkbox", default: false },
      { key: "slowTypeDelayMs", label: "Slow typing delay (ms)", type: "number", min: 0, step: 10, default: 100 }
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
  stepStatuses: [], /* array of 'idle|pending|running|success|error' per step */
  nestedStatuses: {}, /* key "parentIndex|branch|childIndex" -> status */
  ifResults: {}, /* index -> 'then'|'else' */
  waitCountdowns: {}, /* index -> seconds */
  nestedWaitCountdowns: {} /* "parent|branch|child" -> seconds */
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
    return;
  }
  if (msg.type === "FLOW_NESTED_STATUS") {
    handleFlowNestedStatus(msg);
    return;
  }
  if (msg.type === "IF_RESULT") {
    handleIfResult(msg);
    return;
  }
  if (msg.type === "WAIT_COUNTDOWN") {
    handleWaitCountdown(msg);
    return;
  }
  if (msg.type === "WAIT_NESTED_COUNTDOWN") {
    handleWaitNestedCountdown(msg);
    return;
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
    state.nestedStatuses = {};
    state.ifResults = {};
    state.waitCountdowns = {};
    state.nestedWaitCountdowns = {};
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
  let label = st.label;
  if (schema.type === 'If') {
    const res = state.ifResults[index];
    if (res) label = `${label} (${res === 'then' ? 'Then' : 'Else'})`;
  }
  if (schema.type === 'Wait' && (state.stepStatuses[index] === 'running')) {
    const sec = state.waitCountdowns?.[index];
    if (Number.isFinite(sec) && sec > 0) label = `Running — ${sec}s`;
  }
  chipLabel.textContent = label;
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

  if (schema.type === "If") {
    renderIfBranches(fieldsContainer, step, index);
  }

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
  if (prepared.type === 'If') {
    const prepBranch = (arr) => {
      const out = [];
      (Array.isArray(arr) ? arr : []).forEach((child) => {
        const s = STEP_LIBRARY_MAP.get(child.type);
        if (!s) return;
        const c = { type: child.type };
        s.fields.forEach((f) => {
          const v = child[f.key];
          if (v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')) {
            c[f.key] = f.type === 'number' ? Number(v) : (typeof v === 'string' ? v.trim() : v);
          }
        });
        if (child.type === 'Click' && child.forceClick !== undefined) c.forceClick = Boolean(child.forceClick);
        out.push(c);
      });
      return out;
    };
    prepared.then = prepBranch(state.steps[index]?.then);
    prepared.else = prepBranch(state.steps[index]?.else);
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
    // Custom renderer for SelectFiles.files
    if (schema.type === "SelectFiles" && field.key === "files") {
      const wrapper = document.createElement("div");
      wrapper.className = "field";

      const label = document.createElement("label");
      label.textContent = field.label;
      wrapper.appendChild(label);

      const row = document.createElement("div");
      row.className = "input-row";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.textContent = "＋ Add files";
      addBtn.className = "";

      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.multiple = true;
      fileInput.accept = "*/*";
      fileInput.style.display = "none";

      const list = document.createElement("div");
      list.style.display = "grid";
      list.style.gap = "6px";
      list.style.marginTop = "8px";

      const note = document.createElement("div");
      note.style.fontSize = "12px";
      note.style.color = "var(--text-light)";
      note.textContent = "Files are stored in the flow JSON; large files increase storage size.";

      const renderList = () => {
        list.innerHTML = "";
        const items = Array.isArray(state.steps[stepIndex]?.files) ? state.steps[stepIndex].files : [];
        let total = 0;
        items.forEach((f, idx) => {
          const row = document.createElement("div");
          row.style.display = "grid";
          row.style.gridTemplateColumns = "1fr auto";
          row.style.alignItems = "center";
          row.style.gap = "8px";
          const name = document.createElement("div");
          name.textContent = `${f?.name || 'file'} (${formatBytes(f?.size || estimateSizeFromDataUrl(f?.dataUrl))})`;
          const del = document.createElement("button");
          del.type = "button";
          del.className = "icon danger";
          del.title = "Remove";
          del.textContent = "✕";
          del.addEventListener("click", () => {
            const arr = Array.isArray(state.steps[stepIndex]?.files) ? state.steps[stepIndex].files.slice() : [];
            arr.splice(idx, 1);
            state.steps[stepIndex].files = arr;
            setDirty(true, { silent: true });
            render();
          });
          row.appendChild(name);
          row.appendChild(del);
          list.appendChild(row);
          total += Number(f?.size || estimateSizeFromDataUrl(f?.dataUrl) || 0);
        });
        if (!items.length) {
          const empty = document.createElement("div");
          empty.textContent = "No files attached.";
          empty.style.opacity = "0.7";
          list.appendChild(empty);
        }
        note.textContent = `Total: ${formatBytes(total)} stored in flow JSON.`;
      };

      addBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        try {
          const encoded = await Promise.all(files.map(readFileAsDataUrlWithMeta));
          const prev = Array.isArray(state.steps[stepIndex]?.files) ? state.steps[stepIndex].files : [];
          state.steps[stepIndex].files = prev.concat(encoded);
          setDirty(true, { silent: true });
          render();
        } catch (err) {
          console.error("[options] Failed to read files:", err);
          alert("Failed to read selected files.");
        } finally {
          e.target.value = "";
        }
      });

      row.appendChild(addBtn);
      row.appendChild(fileInput);
      wrapper.appendChild(row);
      wrapper.appendChild(list);
      wrapper.appendChild(note);
      container.appendChild(wrapper);
      // initial list
      renderList();
      return; // handled custom field; continue next
    }
    // Hide the dedicated checkbox field for FillText split since we expose an inline toggle next to selector
      // Removed old Split toggle next to selector for FillText; Input section renders this now
      if (schema.type === "FillText" && field.key === "splitAcrossInputs") return;
      // Always hide slowTypeDelayMs; custom Input section renders its control
      if (schema.type === "FillText" && field.key === "slowTypeDelayMs") return;
    // Hide slowType base field; we'll render a custom combined UI block instead
    if (schema.type === "FillText" && field.key === "slowType") {
      return;
    }

    // For FillText, inject a custom "Input" section just before the Value field
    if (schema.type === "FillText" && field.key === "value") {
      const inputSection = document.createElement("div");
      inputSection.className = "field";
      const secLabel = document.createElement("label");
      secLabel.textContent = "Input";
  const row = document.createElement("div");
  row.className = "input-row";
  row.style.justifyContent = "flex-start";
  row.style.gap = "8px";

      // Split toggle (OTP)
      const splitBtn = document.createElement("button");
      splitBtn.type = "button";
  splitBtn.className = "toggle";
  splitBtn.style.marginRight = "4px";
      splitBtn.title = "Split across multiple inputs (OTP)";
      splitBtn.setAttribute("aria-label", "Split across multiple inputs");
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

      // Slow typing toggle
      const slowBtn = document.createElement("button");
      slowBtn.type = "button";
  slowBtn.className = "toggle";
  slowBtn.style.marginLeft = "4px";
      slowBtn.title = "Slow typing";
      slowBtn.setAttribute("aria-label", "Slow typing");
      slowBtn.textContent = "🐢";
      const delayInput = document.createElement("input");
      delayInput.type = "number";
      delayInput.min = "0";
      delayInput.step = "10";
      delayInput.placeholder = "100";
      delayInput.style.marginLeft = "8px";
      const applySlowState = () => {
        const active = Boolean(state.steps[stepIndex]?.slowType);
        slowBtn.classList.toggle("active", active);
        slowBtn.setAttribute("aria-pressed", String(active));
        delayInput.style.display = active ? "" : "none";
        const cur = state.steps[stepIndex]?.slowTypeDelayMs;
        delayInput.value = String(Number.isFinite(cur) ? cur : 100);
      };
      applySlowState();
      slowBtn.addEventListener("click", () => {
        const cur = Boolean(state.steps[stepIndex]?.slowType);
        state.steps[stepIndex].slowType = !cur;
        applySlowState();
        setDirty(true, { silent: true });
      });
      delayInput.addEventListener("input", (e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v) && v >= 0) {
          state.steps[stepIndex].slowTypeDelayMs = v;
          setDirty(true, { silent: true });
        }
      });
      row.appendChild(slowBtn);
      row.appendChild(delayInput);

      inputSection.appendChild(secLabel);
      inputSection.appendChild(row);
      container.appendChild(inputSection);
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
    } else if (field.type === "filelist") {
      // Should be handled above for SelectFiles
      input = document.createElement("div");
      input.textContent = "Unsupported field type";
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
        // Removed old Split toggle next to selector for FillText; Input section renders this now
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

function renderIfBranches(container, step, stepIndex) {
  const makeBranch = (key, labelText) => {
    const section = document.createElement("div");
    section.className = "field";
    const label = document.createElement("label");
    label.textContent = labelText;
    section.appendChild(label);

    const list = document.createElement("div");
    list.className = "flows";
    section.appendChild(list);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "＋ Add Step";
    add.addEventListener("click", () => {
      const arr = Array.isArray(step[key]) ? step[key] : [];
      const defType = STEP_LIBRARY[0].type;
      const schema = STEP_LIBRARY_MAP.get(defType) || STEP_LIBRARY[0];
      const s = createStepFromSchema(schema);
      arr.push(s);
      step[key] = arr;
      setDirty(true, { silent: true });
      render();
    });
    actions.appendChild(add);
    section.appendChild(actions);

    const branch = Array.isArray(step[key]) ? step[key] : [];
    branch.forEach((child, idx) => {
      const card = createNestedStepCard(stepIndex, key, idx, child, labelText);
      list.appendChild(card);
    });

    return section;
  };

  container.appendChild(makeBranch('then', 'Then'));
  container.appendChild(makeBranch('else', 'Else'));
}

function createNestedStepCard(parentIndex, branchKey, childIndex, step, branchLabel) {
  const template = els.stepTemplate;
  const schema = STEP_LIBRARY_MAP.get(step.type) || STEP_LIBRARY[0];
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".step-card");
  const title = card.querySelector(".step-title");
  const typeSelect = card.querySelector(".step-type");
  const fieldsContainer = card.querySelector(".step-fields");

  // status chip stays idle for nested
  const chip = card.querySelector(".step-status .status-chip");
  const chipIcon = card.querySelector(".chip-icon");
  const chipLabel = card.querySelector(".chip-label");
  const key = `${parentIndex}|${branchKey}|${childIndex}`;
  const stName = state.nestedStatuses[key] || 'idle';
  const meta = RUN_STATUS_META[stName] || RUN_STATUS_META.idle;
  chipIcon.textContent = meta.icon;
  let label = meta.label;
  if (schema.type === 'Wait' && stName === 'running') {
    const sec = state.nestedWaitCountdowns?.[key];
    if (Number.isFinite(sec) && sec > 0) label = `Running — ${sec}s`;
  }
  chipLabel.textContent = label;
  chip.className = `status-chip ${meta.className}`;

  title.textContent = `${branchLabel} ${childIndex + 1} — ${schema?.label || step.type}`;

  STEP_LIBRARY.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.type;
    option.textContent = item.label;
    option.selected = item.type === step.type;
    typeSelect.appendChild(option);
  });

  typeSelect.addEventListener("change", (event) => {
    const newType = event.target.value;
    updateNestedStepType(parentIndex, branchKey, childIndex, newType);
    render();
    setDirty(true);
  });
  typeSelect.disabled = Boolean(state.pendingPicker);

  const actions = card.querySelectorAll(".step-actions [data-action]");
  actions.forEach((btn) => {
    btn.disabled = Boolean(state.pendingPicker);
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      if (action === "delete") {
        deleteNestedStep(parentIndex, branchKey, childIndex);
      } else if (action === "up") {
        moveNestedStep(parentIndex, branchKey, childIndex, -1);
      } else if (action === "down") {
        moveNestedStep(parentIndex, branchKey, childIndex, +1);
      } else if (action === "run") {
        await runNestedStep(parentIndex, branchKey, childIndex);
      }
    });
  });

  buildFieldsNested(fieldsContainer, schema, step, { parentIndex, branchKey, childIndex });
  return card;
}

function buildFieldsNested(container, schema, step, ctx) {
  container.innerHTML = "";
  if (!schema) return;
  const stepRef = () => {
    const p = state.steps[ctx.parentIndex];
    if (!p) return null;
    const arr = Array.isArray(p[ctx.branchKey]) ? p[ctx.branchKey] : [];
    return arr[ctx.childIndex] || null;
  };

  schema.fields.forEach((field) => {
    // Custom renderer for SelectFiles.files
    if (schema.type === "SelectFiles" && field.key === "files") {
      const wrapper = document.createElement("div");
      wrapper.className = "field";
      const label = document.createElement("label");
      label.textContent = field.label;
      wrapper.appendChild(label);
      const row = document.createElement("div");
      row.className = "input-row";
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.textContent = "＋ Add files";
      const fileInput = document.createElement("input");
      fileInput.type = "file"; fileInput.multiple = true; fileInput.accept = "*/*"; fileInput.style.display = "none";
      const list = document.createElement("div");
      list.style.display = "grid"; list.style.gap = "6px"; list.style.marginTop = "8px";
      const note = document.createElement("div");
      note.style.fontSize = "12px"; note.style.color = "var(--text-light)"; note.textContent = "Files are stored in the flow JSON; large files increase storage size.";

      const renderList = () => {
        list.innerHTML = "";
        const st = stepRef();
        const items = Array.isArray(st?.files) ? st.files : [];
        let total = 0;
        items.forEach((f, idx) => {
          const row = document.createElement("div");
          row.style.display = "grid"; row.style.gridTemplateColumns = "1fr auto"; row.style.alignItems = "center"; row.style.gap = "8px";
          const name = document.createElement("div");
          name.textContent = `${f?.name || 'file'} (${formatBytes(f?.size || estimateSizeFromDataUrl(f?.dataUrl))})`;
          const del = document.createElement("button"); del.type = "button"; del.className = "icon danger"; del.title = "Remove"; del.textContent = "✕";
          del.addEventListener("click", () => {
            const st2 = stepRef();
            const arr = Array.isArray(st2?.files) ? st2.files.slice() : [];
            arr.splice(idx, 1);
            st2.files = arr;
            setDirty(true, { silent: true });
            render();
          });
          row.appendChild(name); row.appendChild(del); list.appendChild(row);
          total += Number(f?.size || estimateSizeFromDataUrl(f?.dataUrl) || 0);
        });
        if (!items.length) { const empty = document.createElement("div"); empty.textContent = "No files attached."; empty.style.opacity = "0.7"; list.appendChild(empty); }
        note.textContent = `Total: ${formatBytes(total)} stored in flow JSON.`;
      };
      addBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        try {
          const encoded = await Promise.all(files.map(readFileAsDataUrlWithMeta));
          const st = stepRef();
          const prev = Array.isArray(st?.files) ? st.files : [];
          st.files = prev.concat(encoded);
          setDirty(true, { silent: true });
          render();
        } catch (err) {
          console.error("[options] Failed to read files:", err);
          alert("Failed to read selected files.");
        } finally { e.target.value = ""; }
      });
      row.appendChild(addBtn); row.appendChild(fileInput);
      wrapper.appendChild(row); wrapper.appendChild(list); wrapper.appendChild(note);
      container.appendChild(wrapper); renderList(); return;
    }

    // FillText custom section
    if (schema.type === "FillText" && field.key === "value") {
      const inputSection = document.createElement("div"); inputSection.className = "field";
      const secLabel = document.createElement("label"); secLabel.textContent = "Input";
      const row = document.createElement("div"); row.className = "input-row"; row.style.justifyContent = "flex-start"; row.style.gap = "8px";
      const splitBtn = document.createElement("button"); splitBtn.type = "button"; splitBtn.className = "toggle"; splitBtn.style.marginRight = "4px"; splitBtn.title = "Split across multiple inputs (OTP)"; splitBtn.setAttribute("aria-label", "Split across multiple inputs"); splitBtn.textContent = "🔢";
      const applySplitState = () => { const st = stepRef(); const active = Boolean(st?.splitAcrossInputs); splitBtn.classList.toggle("active", active); splitBtn.setAttribute("aria-pressed", String(active)); };
      applySplitState();
      splitBtn.addEventListener("click", () => { const st = stepRef(); st.splitAcrossInputs = !Boolean(st?.splitAcrossInputs); applySplitState(); setDirty(true, { silent: true }); });
      row.appendChild(splitBtn);
      const slowBtn = document.createElement("button"); slowBtn.type = "button"; slowBtn.className = "toggle"; slowBtn.style.marginLeft = "4px"; slowBtn.title = "Slow typing"; slowBtn.setAttribute("aria-label", "Slow typing"); slowBtn.textContent = "🐢";
      const delayInput = document.createElement("input"); delayInput.type = "number"; delayInput.min = "0"; delayInput.step = "10"; delayInput.placeholder = "100"; delayInput.style.marginLeft = "8px";
      const applySlowState = () => { const st = stepRef(); const active = Boolean(st?.slowType); slowBtn.classList.toggle("active", active); slowBtn.setAttribute("aria-pressed", String(active)); delayInput.style.display = active ? "" : "none"; const cur = st?.slowTypeDelayMs; delayInput.value = String(Number.isFinite(cur) ? cur : 100); };
      applySlowState();
      slowBtn.addEventListener("click", () => { const st = stepRef(); st.slowType = !Boolean(st?.slowType); applySlowState(); setDirty(true, { silent: true }); });
      delayInput.addEventListener("input", (e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) { const st = stepRef(); st.slowTypeDelayMs = v; setDirty(true, { silent: true }); } });
      row.appendChild(slowBtn); row.appendChild(delayInput);
      inputSection.appendChild(secLabel); inputSection.appendChild(row); container.appendChild(inputSection);
    }

    const fieldWrapper = document.createElement("div"); fieldWrapper.className = "field";
    const label = document.createElement("label"); label.textContent = field.label;
    let input;
    if (field.type === "textarea") input = document.createElement("textarea");
    else if (field.type === "select") { input = document.createElement("select"); (field.options || []).forEach((opt) => { const option = document.createElement("option"); option.value = String(opt.value); option.textContent = String(opt.label ?? opt.value); input.appendChild(option); }); }
    else if (field.type === "checkbox") { input = document.createElement("input"); input.type = "checkbox"; }
    else if (field.type === "filelist") { input = document.createElement("div"); input.textContent = "Unsupported field type"; }
    else { input = document.createElement("input"); input.type = field.type === "number" ? "number" : field.type === "url" ? "url" : "text"; }
    input.placeholder = field.placeholder || "";
    if (field.type === "number") { if (typeof field.min !== "undefined") input.min = String(field.min); if (typeof field.max !== "undefined") input.max = String(field.max); if (typeof field.step !== "undefined") input.step = String(field.step); }
    const existing = step[field.key];
    if (field.type === "checkbox") { if (existing !== undefined && existing !== null) input.checked = Boolean(existing); else if (field.default !== undefined) input.checked = Boolean(field.default); }
    else if (field.type === "select") { if (existing !== undefined && existing !== null) input.value = String(existing); else if (field.default !== undefined) input.value = String(field.default); }
    else { if (existing !== undefined && existing !== null) input.value = String(existing); else if (field.default !== undefined) input.value = String(field.default); }
    if (field.type === "checkbox") { input.addEventListener("change", (e) => { setDirty(true, { silent: true }); updateNestedFieldValue(ctx.parentIndex, ctx.branchKey, ctx.childIndex, field, Boolean(e.target.checked)); }); }
    else if (field.type === "select") { input.addEventListener("change", (e) => { setDirty(true, { silent: true }); updateNestedFieldValue(ctx.parentIndex, ctx.branchKey, ctx.childIndex, field, e.target.value); }); }
    else { input.addEventListener("input", (e) => { setDirty(true, { silent: true }); updateNestedFieldValue(ctx.parentIndex, ctx.branchKey, ctx.childIndex, field, e.target.value); }); }

    let inputHost = input;
    if (field.supportsPicker) {
      const row = document.createElement("div"); row.className = "input-row";
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "icon picker-btn"; btn.title = "Pick element from active tab"; btn.textContent = "🎯";
      const isActive = isPickerContext(undefined, field.key, ctx);
      btn.classList.toggle("active", isActive);
      btn.disabled = Boolean(state.pendingPicker) && !isActive;
      btn.addEventListener("click", () => { requestSelectorPick({ stepIndex: undefined, field, ctx }); });
      row.appendChild(input); row.appendChild(btn);

      const st = stepRef();
      const isClickSelector = st?.type === "Click" && field.key === "selector";
      if (isClickSelector) {
        const forceBtn = document.createElement("button"); forceBtn.type = "button"; forceBtn.className = "toggle"; forceBtn.title = "Force"; forceBtn.setAttribute("aria-label", "Force click (native)"); forceBtn.textContent = "⚡";
        const applyForceState = () => { const st2 = stepRef(); const active = Boolean(st2?.forceClick); forceBtn.classList.toggle("active", active); forceBtn.setAttribute("aria-pressed", String(active)); };
        applyForceState();
        forceBtn.addEventListener("click", () => { const st2 = stepRef(); st2.forceClick = !Boolean(st2?.forceClick); applyForceState(); setDirty(true, { silent: true }); });
        row.appendChild(forceBtn);
      }

      inputHost = row;
      if (isActive) fieldWrapper.classList.add("picking"); else fieldWrapper.classList.remove("picking");
    }

    if (schema.type === "WaitForEmailGmail" && field.key === "variable") {
      const row = document.createElement("div"); row.className = "input-row"; row.appendChild(inputHost);
      const badge = document.createElement("span"); badge.className = "mini-badge"; badge.title = "Current variable value";
      const applyBadge = async () => {
        try {
          const st = stepRef();
          const key = (st?.variable || "otp").trim() || "otp";
          const data = await chrome.storage.local.get(["variables"]);
          const v = data?.variables?.[key];
          if (v == null || String(v) === "") { badge.textContent = "(empty)"; badge.style.opacity = "0.6"; }
          else { badge.textContent = String(v); badge.style.opacity = "1"; }
        } catch { badge.textContent = "(n/a)"; badge.style.opacity = "0.6"; }
      };
      applyBadge();
      const inputEl = (inputHost instanceof HTMLElement ? inputHost.querySelector("input,textarea,select") || inputHost : inputHost);
      if (inputEl && inputEl.addEventListener) { inputEl.addEventListener("input", () => { setTimeout(applyBadge, 0); }); }
      const onChanged = (changes, area) => { if (area !== "local" || !changes.variables) return; applyBadge(); };
      try { chrome.storage.onChanged.addListener(onChanged); } catch {}
      row.appendChild(badge);
      fieldWrapper.appendChild(label); fieldWrapper.appendChild(row);
    } else {
      fieldWrapper.appendChild(label); fieldWrapper.appendChild(inputHost);
    }
    container.appendChild(fieldWrapper);
  });
}

async function runNestedStep(parentIndex, branchKey, childIndex) {
  if (state.pendingPicker) { alert("Finish the element picker before running a step."); return; }
  const parent = state.steps[parentIndex]; if (!parent) return;
  const arr = Array.isArray(parent[branchKey]) ? parent[branchKey] : [];
  const step = arr[childIndex]; if (!step) return;
  const schema = STEP_LIBRARY_MAP.get(step.type);
  if (!schema) { alert("Unknown step type"); return; }
  const prepared = { type: step.type };
  for (const field of schema.fields) {
    const value = step[field.key];
    const isEmpty = value == null || (typeof value === "string" && value.trim() === "");
    if (field.required && isEmpty) { alert(`${schema.label}: ${field.label} is required.`); return; }
    if (!isEmpty) prepared[field.key] = field.type === "number" ? Number(value) : (typeof value === "string" ? value.trim() : value);
  }
  if (prepared.type === "Click") { prepared.forceClick = Boolean(step?.forceClick); }
  try {
    const key = `${parentIndex}|${branchKey}|${childIndex}`;
    state.nestedStatuses[key] = 'pending';
    render();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { alert("No active tab found."); return; }
    const res = await chrome.runtime.sendMessage({ type: "RUN_SINGLE_STEP", tabId: tab.id, step: prepared });
    if (!res?.ok) { state.nestedStatuses[key] = 'error'; render(); alert("Step failed: " + (res?.error || "unknown error")); return; }
    state.nestedStatuses[key] = 'success';
    render();
  } catch (err) {
    console.error("[options] Nested step run failed:", err);
    const key = `${parentIndex}|${branchKey}|${childIndex}`;
    state.nestedStatuses[key] = 'error';
    render();
    alert("Error running step: " + err.message);
  }
}

function moveNestedStep(parentIndex, branchKey, index, delta) {
  const parent = state.steps[parentIndex]; if (!parent) return;
  const arr = Array.isArray(parent[branchKey]) ? parent[branchKey] : []; const ni = index + delta;
  if (ni < 0 || ni >= arr.length) return;
  const [s] = arr.splice(index, 1); arr.splice(ni, 0, s); parent[branchKey] = arr; setDirty(true, { silent: true }); render();
}
function deleteNestedStep(parentIndex, branchKey, index) {
  const parent = state.steps[parentIndex]; if (!parent) return;
  const arr = Array.isArray(parent[branchKey]) ? parent[branchKey] : []; arr.splice(index, 1); parent[branchKey] = arr; setDirty(true, { silent: true }); render();
}
function updateNestedStepType(parentIndex, branchKey, index, newType) {
  const parent = state.steps[parentIndex]; if (!parent) return;
  const arr = Array.isArray(parent[branchKey]) ? parent[branchKey] : [];
  const cur = arr[index] || {};
  const schema = STEP_LIBRARY_MAP.get(newType); if (!schema) return;
  const next = createStepFromSchema(schema);
  schema.fields.forEach((f) => { if (cur[f.key] !== undefined && cur[f.key] !== null) next[f.key] = cur[f.key]; });
  next.type = newType;
  arr[index] = next; parent[branchKey] = arr; setDirty(true, { silent: true }); render();
}
function updateNestedFieldValue(parentIndex, branchKey, index, field, rawValue) {
  const parent = state.steps[parentIndex]; if (!parent) return;
  const arr = Array.isArray(parent[branchKey]) ? parent[branchKey] : [];
  if (!arr[index]) return; arr[index][field.key] = rawValue;
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
      if (field.type === "filelist") base[field.key] = [];
      else base[field.key] = field.type === "number" ? "" : "";
    }
  });
  if (schema.type === "Click") {
    base.forceClick = false;
  }
  if (schema.type === "If") {
    base.then = [];
    base.else = [];
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

function isPickerContext(stepIndex, fieldKey, ctx) {
  const pending = state.pendingPicker;
  if (!pending) return false;
  if (ctx && pending.nested) {
    return pending.fieldKey === fieldKey && pending.nested.parentIndex === ctx.parentIndex && pending.nested.branchKey === ctx.branchKey && pending.nested.childIndex === ctx.childIndex;
  }
  if (!ctx && typeof stepIndex === 'number') {
    return pending.stepIndex === stepIndex && pending.fieldKey === fieldKey && !pending.nested;
  }
  return false;
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
    state.nestedStatuses = {};
    state.ifResults = {};
    state.waitCountdowns = {};
    state.nestedWaitCountdowns = {};
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
      const isEmpty = value === null || value === undefined || (typeof value === "string" && value.trim() === "") || (field.type === "filelist" && Array.isArray(value) && value.length === 0);
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
    if (step.type === "If") {
      const prepBranch = (arr, which) => {
        const out = [];
        (Array.isArray(arr) ? arr : []).forEach((child, cidx) => {
          const cs = STEP_LIBRARY_MAP.get(child.type);
          if (!cs) { errors.push(`Step ${index + 1} (${which} ${cidx + 1}): Unknown type "${child.type}".`); return; }
          const cprep = { type: child.type };
          cs.fields.forEach((f) => {
            const v = child[f.key];
            const empty = v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
            if (f.required && empty) { errors.push(`Step ${index + 1} (${which} ${cidx + 1}): ${f.label} is required.`); return; }
            if (f.type === 'number') {
              if (empty) return;
              const num = Number(v);
              if (!Number.isFinite(num)) { errors.push(`Step ${index + 1} (${which} ${cidx + 1}): ${f.label} must be a number.`); return; }
              if (typeof f.min === 'number' && num < f.min) { errors.push(`Step ${index + 1} (${which} ${cidx + 1}): ${f.label} must be ≥ ${f.min}.`); return; }
              cprep[f.key] = num;
            } else if (!empty) {
              cprep[f.key] = typeof v === 'string' ? v.trim() : v;
            }
          });
          if (child.type === 'Click' && child.forceClick !== undefined) cprep.forceClick = Boolean(child.forceClick);
          out.push(cprep);
        });
        return out;
      };
      prepared.then = prepBranch(step.then, 'Then');
      prepared.else = prepBranch(step.else, 'Else');
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

async function requestSelectorPick({ stepIndex, field, ctx }) {
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
    state.pendingPicker = { requestId, stepIndex, fieldKey: field.key, tabId: tab.id };
    if (ctx && typeof ctx === 'object') {
      state.pendingPicker.nested = { parentIndex: ctx.parentIndex, branchKey: ctx.branchKey, childIndex: ctx.childIndex };
    }
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
    if (pending.nested && typeof pending.nested.parentIndex === 'number') {
      const p = state.steps[pending.nested.parentIndex];
      const arr = Array.isArray(p?.[pending.nested.branchKey]) ? p[pending.nested.branchKey] : [];
      if (arr[pending.nested.childIndex]) {
        arr[pending.nested.childIndex][fieldKey] = msg.selector;
        setDirty(true, { silent: true });
        render();
        showStatus(`Selector captured: ${msg.selector}`);
        return;
      }
    } else if (typeof stepIndex === 'number' && state.steps[stepIndex]) {
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
        if (field.type === "filelist") {
          // sanitize files array
          const list = Array.isArray(step[field.key]) ? step[field.key] : [];
          normalized[field.key] = list
            .map((f) => ({
              name: typeof f?.name === "string" ? f.name : "file",
              type: typeof f?.type === "string" ? f.type : "application/octet-stream",
              size: Number(f?.size) || estimateSizeFromDataUrl(f?.dataUrl) || 0,
              dataUrl: typeof f?.dataUrl === "string" && f.dataUrl.startsWith("data:") ? f.dataUrl : ""
            }))
            .filter((f) => f.dataUrl);
        } else {
          normalized[field.key] = step[field.key];
        }
      } else if (field.default !== undefined) {
        normalized[field.key] = field.default;
      }
    });
    // carry non-schema extras
    if (step.type === "Click" && step.forceClick !== undefined) {
      normalized.forceClick = Boolean(step.forceClick);
    }
    if (step.type === "If") {
      const thenArr = Array.isArray(step.then) ? step.then : Array.isArray(step.thenSteps) ? step.thenSteps : [];
      const elseArr = Array.isArray(step.else) ? step.else : Array.isArray(step.elseSteps) ? step.elseSteps : [];
      normalized.then = sanitizeFlowArray(thenArr);
      normalized.else = sanitizeFlowArray(elseArr);
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
  state.nestedStatuses = {};
  state.ifResults = {};
  state.waitCountdowns = {};
  state.nestedWaitCountdowns = {};
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
  state.nestedStatuses = {};
  state.ifResults = {};
  state.waitCountdowns = {};
  state.nestedWaitCountdowns = {};
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
    state.nestedStatuses = {};
    state.ifResults = {};
    state.waitCountdowns = {};
    state.nestedWaitCountdowns = {};
    render();
    return;
  }
  if (typeof msg.index === "number") {
    const idx = msg.index;
    if (!state.stepStatuses[idx]) return;
    let status = msg.status; // running|success|error
    if (!RUN_STATUS_META[status]) status = "idle";
    state.stepStatuses[idx] = status;
    if (status === 'success' || status === 'error') {
      delete state.waitCountdowns[idx];
    }
    render();
  }
}

function handleFlowNestedStatus(msg) {
  const p = typeof msg.parentIndex === 'number' ? msg.parentIndex : null;
  const b = typeof msg.branch === 'string' ? msg.branch : null;
  const c = typeof msg.childIndex === 'number' ? msg.childIndex : null;
  if (p == null || b == null || c == null) return;
  const key = `${p}|${b}|${c}`;
  let status = msg.status;
  if (!RUN_STATUS_META[status]) status = 'idle';
  state.nestedStatuses[key] = status;
  if (status === 'success' || status === 'error') {
    delete state.nestedWaitCountdowns[key];
  }
  render();
}

function handleIfResult(msg) {
  const idx = typeof msg.index === 'number' ? msg.index : null;
  if (idx == null) return;
  const r = msg.result === 'then' ? 'then' : 'else';
  state.ifResults[idx] = r;
  render();
}

function handleWaitCountdown(msg) {
  const idx = typeof msg.index === 'number' ? msg.index : null;
  if (idx == null) return;
  const sec = Number(msg.seconds);
  if (!Number.isFinite(sec)) return;
  state.waitCountdowns[idx] = Math.max(0, sec);
  render();
}

function handleWaitNestedCountdown(msg) {
  const p = typeof msg.parentIndex === 'number' ? msg.parentIndex : null;
  const b = typeof msg.branch === 'string' ? msg.branch : null;
  const c = typeof msg.childIndex === 'number' ? msg.childIndex : null;
  if (p == null || b == null || c == null) return;
  const key = `${p}|${b}|${c}`;
  const sec = Number(msg.seconds);
  if (!Number.isFinite(sec)) return;
  state.nestedWaitCountdowns[key] = Math.max(0, sec);
  render();
}

// ---- utils for SelectFiles field ----
function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function estimateSizeFromDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return 0;
  const i = dataUrl.indexOf('base64,');
  if (i === -1) return 0;
  const b64 = dataUrl.slice(i + 7);
  // Approx base64 -> bytes; 4 chars ~= 3 bytes
  return Math.floor((b64.length * 3) / 4);
}

function readFileAsDataUrlWithMeta(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = String(reader.result || '');
        resolve({ name: file.name || 'file', type: file.type || 'application/octet-stream', size: file.size || estimateSizeFromDataUrl(dataUrl), dataUrl });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(reader.error || new Error('read_error'));
    try { reader.readAsDataURL(file); } catch (err) { reject(err); }
  });
}
