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
  useNativeClick: false,
  readInsideIframes: true,
  autoSave: true
});

const RUN_STATUS_META = {
  idle: { icon: "○", label: "Idle", className: "status-idle" },
  pending: { icon: "⏳", label: "Pending", className: "status-pending" },
  running: { icon: "▶", label: "Running", className: "status-running" },
  success: { icon: "✅", label: "Complete", className: "status-success" },
  error: { icon: "⚠️", label: "Error", className: "status-error" }
};

const STEP_LIBRARY_BASE = [
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
        { value: "visible", label: "Element visible" },
        { value: "text", label: "Text matches" }
      ], default: "exists" },
      { key: "selector", label: "Target selector", type: "text", required: true, placeholder: "#panel, .modal, [data-open]", supportsPicker: true },
      { key: "timeoutMs", label: "Wait up to (ms)", type: "number", min: 0, step: 100, default: 0 },
      { key: "textMatch", label: "Text condition", type: "select", options: [
        { value: "any", label: "Ignore text" },
        { value: "contains", label: "Contains" },
        { value: "equals", label: "Equals" },
        { value: "startsWith", label: "Starts with" },
        { value: "endsWith", label: "Ends with" },
        { value: "empty", label: "Is empty" },
        { value: "notEmpty", label: "Is not empty" }
      ], default: "any" },
      { key: "textValue", label: "Text value", type: "text", placeholder: "Success" },
      { key: "textCaseSensitive", label: "Case sensitive", type: "checkbox", default: false }
    ]
  },
  {
    type: "Restart",
    label: "Restart",
    description: "Jump execution to Flow start or a specific If step.",
    fields: [
      { key: "mode", label: "Target", type: "select", required: true, options: [
        { value: "flow", label: "Flow start" },
        { value: "if", label: "If step" }
      ], default: "flow" },
      { key: "ifIndex", label: "If step", type: "select" },
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
    type: "KeyPress",
    label: "Press keys",
    description: "Send one or more key presses or shortcuts to the page.",
    fields: [
      { key: "keys", label: "Key sequence", type: "keysequence", required: true, default: [] },
      { key: "repeat", label: "Repeat count", type: "number", min: 1, step: 1, default: 1 },
      { key: "repeatDelayMs", label: "Delay between repeats (ms)", type: "number", min: 0, step: 10, default: 120 },
      { key: "keyDelayMs", label: "Delay between keys (ms)", type: "number", min: 0, step: 10, default: 60 },
      { key: "holdMs", label: "Hold key combo (ms)", type: "number", min: 0, step: 10, default: 0 }
    ]
  },
  {
    type: "GroupExecuter",
    label: "Group Executer",
    description: "Execute a reusable group inline at this point in the flow.",
    fields: [
      { key: "groupId", label: "Group", type: "select", required: true, options: [] }
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
  },
  {
    type: "Complete",
    label: "Complete flow",
    description: "Stop execution immediately and mark the flow outcome.",
    fields: [
      { key: "status", label: "Outcome", type: "select", required: true, options: [
        { value: "success", label: "Success" },
        { value: "failure", label: "Failure" }
      ], default: "success" },
      { key: "message", label: "Message (optional)", type: "text", placeholder: "Optional note" }
    ]
  }
];

const STEP_LIBRARY_PREFERRED_ORDER = [
  "Click",
  "FillText",
  "KeyPress",
  "GroupExecuter",
  "SelectDropdown",
  "Wait",
  "GoToURL",
  "If",
  "SelectFiles",
  "WaitForEmailGmail",
  "EnsureAudio",
  "PlaySound",
  "Restart",
  "Complete"
];

const STEP_LIBRARY_PRIORITY = new Map(
  STEP_LIBRARY_PREFERRED_ORDER.map((type, index) => [type, index])
);

const STEP_LIBRARY = STEP_LIBRARY_BASE.slice().sort((left, right) => {
  const leftPriority = STEP_LIBRARY_PRIORITY.get(left.type);
  const rightPriority = STEP_LIBRARY_PRIORITY.get(right.type);
  const leftRank = Number.isFinite(leftPriority) ? leftPriority : Number.MAX_SAFE_INTEGER;
  const rightRank = Number.isFinite(rightPriority) ? rightPriority : Number.MAX_SAFE_INTEGER;
  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.label.localeCompare(right.label);
});

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
  // stopFlow removed; runFlow toggles
  runCounter: document.getElementById("runCounter"),
  status: document.getElementById("status"),
  stepTemplate: document.getElementById("step-template"),
  flowName: document.getElementById("flowName"),
  flowNameWrap: document.getElementById("flowNameWrap"),
  topBar: document.getElementById("topBar"),
  // tabs
  tabFlowBtn: document.getElementById("tabFlowBtn"),
  tabGroupsBtn: document.getElementById("tabGroupsBtn"),
  tabSettingsBtn: document.getElementById("tabSettingsBtn"),
  tabLibraryBtn: document.getElementById("tabLibraryBtn"),
  tabsNav: document.getElementById("tabsNav"),
  tabFlow: document.getElementById("tab-flow"),
  tabGroups: document.getElementById("tab-groups"),
  tabSettings: document.getElementById("tab-settings"),
  tabLibrary: document.getElementById("tab-library"),
  groupsListView: document.getElementById("groupsListView"),
  groupsContainer: document.getElementById("groupsContainer"),
  groupsEmptyState: document.getElementById("groupsEmptyState"),
  createGroupBtn: document.getElementById("createGroupBtn"),
  groupEditorView: document.getElementById("groupEditorView"),
  closeGroupEditorBtn: document.getElementById("closeGroupEditorBtn"),
  groupNameInput: document.getElementById("groupNameInput"),
  groupMeta: document.getElementById("groupMeta"),
  openTransferModalBtn: document.getElementById("openTransferModalBtn"),
  groupStepsContainer: document.getElementById("groupStepsContainer"),
  groupEmptyState: document.getElementById("groupEmptyState"),
  groupAddStep: document.getElementById("groupAddStep"),
  // settings controls
  stepDelayMs: document.getElementById("stepDelayMs"),
  selectorWaitMs: document.getElementById("selectorWaitMs"),
  useNativeClick: document.getElementById("useNativeClick"),
  readInsideIframes: document.getElementById("readInsideIframes"),
  autoSave: document.getElementById("autoSave"),
  gmailClientId: document.getElementById("gmailClientId"),
  connectGmailBtn: document.getElementById("connectGmailBtn"),
  testWaitForEmailGmailBtn: document.getElementById("testWaitForEmailGmailBtn"),
  gmailStatus: document.getElementById("gmailStatus"),
  versionLabel: document.getElementById("versionLabel"),
  // library controls
  saveAsNewBtn: document.getElementById("saveAsNewBtn"),
  savedFlowsContainer: document.getElementById("savedFlowsContainer"),
  savedEmptyState: document.getElementById("savedEmptyState"),
  // menu
  moreMenuBtn: document.getElementById("moreMenuBtn"),
  moreMenu: document.getElementById("moreMenu"),
  menuReset: document.getElementById("menuReset"),
  menuExport: document.getElementById("menuExport"),
  menuImport: document.getElementById("menuImport"),
  menuClear: document.getElementById("menuClear"),
  transferModal: document.getElementById("transferModal"),
  closeTransferModalBtn: document.getElementById("closeTransferModalBtn"),
  transferSourceSelect: document.getElementById("transferSourceSelect"),
  transferModeCopyBtn: document.getElementById("transferModeCopyBtn"),
  transferModeCutBtn: document.getElementById("transferModeCutBtn"),
  transferSelectionSummary: document.getElementById("transferSelectionSummary"),
  transferSelectAllBtn: document.getElementById("transferSelectAllBtn"),
  transferClearSelectionBtn: document.getElementById("transferClearSelectionBtn"),
  transferSourceList: document.getElementById("transferSourceList"),
  executeTransferBtn: document.getElementById("executeTransferBtn")
};

const state = {
  steps: [],
  mainSteps: [],
  flowName: DEFAULT_FLOW_NAME,
  groups: [],
  dirty: false,
  lastSaved: { steps: [], flowName: DEFAULT_FLOW_NAME, groups: [] },
  statusTimer: null,
  pendingPicker: null,
  settings: { ...DEFAULT_SETTINGS },
  stepStatuses: [], /* array of 'idle|pending|running|success|error' per step */
  nestedStatuses: {}, /* key "parentIndex|branch|childIndex" -> status */
  ifResults: {}, /* index -> 'then'|'else' */
  groupExecStates: {}, /* top-level GroupExecuter index -> runtime details */
  waitCountdowns: {}, /* index -> seconds */
  waitDeadlines: {}, /* index -> epoch ms */
  nestedWaitCountdowns: {} /* "parent|branch|child" -> seconds */,
  nestedWaitDeadlines: {}, /* "parent|branch|child" -> epoch ms */
  runCount: 0,
  savedFlows: [],
  lastRunIncremented: false,
  stopSuppressUntil: 0,
  inlineInsertActive: false,
  activeTab: "flow",
  selectedGroupId: null,
  transferModal: {
    open: false,
    mode: "copy",
    source: "main",
    selectedIndices: []
  },
  groupStepJumpTarget: null,
  autosaveTimer: null,
  countdownTicker: null
};

const PICKER_STATUS_TEXT = "Element picker active – click the target element or press Esc to cancel.";
let activeKeyCapture = null;

const KEY_PRESS_DROPDOWN_OPTIONS = (() => {
  const options = [];
  for (let i = 65; i <= 90; i += 1) {
    const letter = String.fromCharCode(i);
    options.push({ label: letter, key: letter.toLowerCase(), code: `Key${letter}` });
  }
  for (let i = 0; i <= 9; i += 1) {
    options.push({ label: String(i), key: String(i), code: `Digit${i}` });
  }
  [
    ["Enter", "Enter", "Enter"],
    ["Tab", "Tab", "Tab"],
    ["Escape", "Escape", "Escape"],
    ["Space", " ", "Space"],
    ["Backspace", "Backspace", "Backspace"],
    ["Delete", "Delete", "Delete"],
    ["Insert", "Insert", "Insert"],
    ["Home", "Home", "Home"],
    ["End", "End", "End"],
    ["Page Up", "PageUp", "PageUp"],
    ["Page Down", "PageDown", "PageDown"],
    ["Arrow Up", "ArrowUp", "ArrowUp"],
    ["Arrow Down", "ArrowDown", "ArrowDown"],
    ["Arrow Left", "ArrowLeft", "ArrowLeft"],
    ["Arrow Right", "ArrowRight", "ArrowRight"],
    ["Caps Lock", "CapsLock", "CapsLock"],
    ["Num Lock", "NumLock", "NumLock"],
    ["Scroll Lock", "ScrollLock", "ScrollLock"],
    ["Pause", "Pause", "Pause"],
    ["Print Screen", "PrintScreen", "PrintScreen"],
    ["Menu", "ContextMenu", "ContextMenu"],
    ["Minus (-)", "-", "Minus"],
    ["Equal (=)", "=", "Equal"],
    ["Comma (,)", ",", "Comma"],
    ["Period (.)", ".", "Period"],
    ["Slash (/)", "/", "Slash"],
    ["Semicolon (;)", ";", "Semicolon"],
    ["Quote (')", "'", "Quote"],
    ["Backquote (`)", "`", "Backquote"],
    ["Backslash (\\)", "\\", "Backslash"],
    ["Left Bracket ([)", "[", "BracketLeft"],
    ["Right Bracket (])", "]", "BracketRight"],
    ["Numpad 0", "0", "Numpad0"],
    ["Numpad 1", "1", "Numpad1"],
    ["Numpad 2", "2", "Numpad2"],
    ["Numpad 3", "3", "Numpad3"],
    ["Numpad 4", "4", "Numpad4"],
    ["Numpad 5", "5", "Numpad5"],
    ["Numpad 6", "6", "Numpad6"],
    ["Numpad 7", "7", "Numpad7"],
    ["Numpad 8", "8", "Numpad8"],
    ["Numpad 9", "9", "Numpad9"],
    ["Numpad +", "+", "NumpadAdd"],
    ["Numpad -", "-", "NumpadSubtract"],
    ["Numpad *", "*", "NumpadMultiply"],
    ["Numpad /", "/", "NumpadDivide"],
    ["Numpad .", ".", "NumpadDecimal"],
    ["Numpad Enter", "Enter", "NumpadEnter"],
    ["Shift", "Shift", "ShiftLeft"],
    ["Control", "Control", "ControlLeft"],
    ["Alt", "Alt", "AltLeft"],
    ["Meta / Command", "Meta", "MetaLeft"]
  ].forEach(([label, key, code]) => options.push({ label, key, code }));
  for (let i = 1; i <= 12; i += 1) {
    options.push({ label: `F${i}`, key: `F${i}`, code: `F${i}` });
  }
  return options;
})();

const KEY_OPTION_MAP = new Map(KEY_PRESS_DROPDOWN_OPTIONS.map((item) => [item.code, item]));

function isModifierKeyValue(value) {
  return ["Shift", "Control", "Alt", "Meta"].includes(value);
}

function normalizeKeyCombo(combo) {
  if (!combo || typeof combo !== "object") return null;
  const key = typeof combo.key === "string" ? combo.key : "";
  const code = typeof combo.code === "string" ? combo.code : "";
  if (!key && !code) return null;
  const normalized = {
    key: key || code,
    code: code || key,
    ctrlKey: Boolean(combo.ctrlKey),
    altKey: Boolean(combo.altKey),
    shiftKey: Boolean(combo.shiftKey),
    metaKey: Boolean(combo.metaKey)
  };
  if (normalized.key === "Control") normalized.ctrlKey = false;
  if (normalized.key === "Alt") normalized.altKey = false;
  if (normalized.key === "Shift") normalized.shiftKey = false;
  if (normalized.key === "Meta") normalized.metaKey = false;
  return normalized;
}

function normalizeKeySequence(value) {
  if (!Array.isArray(value)) return [];
  return value.map((combo) => normalizeKeyCombo(combo)).filter(Boolean);
}

function formatKeyCombo(combo) {
  const normalized = normalizeKeyCombo(combo);
  if (!normalized) return "";
  const parts = [];
  if (normalized.ctrlKey) parts.push("Ctrl");
  if (normalized.altKey) parts.push("Alt");
  if (normalized.shiftKey) parts.push("Shift");
  if (normalized.metaKey) parts.push("Meta");
  const option = KEY_OPTION_MAP.get(normalized.code);
  let primary = option?.label || normalized.key || normalized.code;
  if (primary === " ") primary = "Space";
  if (primary.length === 1) primary = primary.toUpperCase();
  parts.push(primary);
  return parts.filter(Boolean).join(" + ");
}

function stopActiveKeyCapture() {
  if (!activeKeyCapture) return;
  try { window.removeEventListener("keydown", activeKeyCapture.keydown, true); } catch {}
  try { window.removeEventListener("blur", activeKeyCapture.blur, true); } catch {}
  const { button } = activeKeyCapture;
  if (button?.isConnected) {
    button.classList.remove("active");
    button.textContent = "Capture";
  }
  activeKeyCapture = null;
}

function beginKeyCapture(button, onCaptured) {
  stopActiveKeyCapture();
  if (!button) return;
  button.classList.add("active");
  button.textContent = "Press key…";
  const keydown = (event) => {
    if (event.repeat) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const combo = normalizeKeyCombo({
      key: event.key,
      code: event.code || event.key,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey
    });
    stopActiveKeyCapture();
    if (combo) onCaptured(combo);
  };
  const blur = () => stopActiveKeyCapture();
  activeKeyCapture = { button, keydown, blur };
  window.addEventListener("keydown", keydown, true);
  window.addEventListener("blur", blur, true);
}

function getExtensionVersion() {
  try {
    return chrome.runtime.getManifest()?.version || "";
  } catch {
    return "";
  }
}

function deepClone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {}
  }
  return JSON.parse(JSON.stringify(value));
}

function cloneFlow(flow) {
  return Array.isArray(flow) ? deepClone(flow) : [];
}

function sanitizeGroups(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((group, index) => {
      if (!group || typeof group !== "object") return null;
      const id = typeof group.id === "string" && group.id.trim() ? group.id.trim() : `grp_import_${index}_${Math.random().toString(16).slice(2, 8)}`;
      const name = typeof group.name === "string" && group.name.trim() ? group.name.trim() : `Group ${index + 1}`;
      return {
        id,
        name,
        steps: sanitizeFlowArray(group.steps)
      };
    })
    .filter(Boolean);
}

function createGroup(name = "New Group") {
  return {
    id: `grp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    name,
    steps: []
  };
}

function buildGroupOptions({ includePlaceholder = false } = {}) {
  const options = state.groups.map((group) => ({ value: group.id, label: group.name }));
  if (includePlaceholder && !options.length) {
    return [{ value: "", label: "(no groups available)" }];
  }
  return options;
}

function summarizeStep(step, index) {
  const schema = STEP_LIBRARY_MAP.get(step?.type);
  const label = schema?.label || step?.type || "Step";
  const parts = [`${index + 1}. ${label}`];
  if (step?.type === "Click" && step.selector) parts.push(step.selector);
  if (step?.type === "FillText" && step.selector) parts.push(step.selector);
  if (step?.type === "GoToURL" && step.url) parts.push(step.url);
  if (step?.type === "KeyPress" && Array.isArray(step.keys) && step.keys.length) {
    parts.push(step.keys.map(formatKeyCombo).join(" → "));
  }
  if (step?.type === "GroupExecuter") {
    const group = state.groups.find((item) => item.id === step.groupId);
    parts.push(group?.name || "Unassigned group");
  }
  return parts.filter(Boolean).join(" — ");
}

function sanitizeSavedFlows(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : `Flow ${index + 1}`;
      const flowName = typeof item.flowName === "string" && item.flowName.trim()
        ? item.flowName.trim()
        : name;
      return {
        id: typeof item.id === "string" && item.id.trim() ? item.id : `sf_${Date.now()}_${index}`,
        name,
        flowName,
        steps: sanitizeFlowArray(item.steps),
        groups: sanitizeGroups(item.groups),
        updatedAt: Number(item.updatedAt) || Date.now()
      };
    })
    .filter(Boolean);
}

function getSelectedGroup() {
  return state.groups.find((group) => group.id === state.selectedGroupId) || null;
}

function isEditingGroup() {
  return state.activeTab === "groups" && Boolean(state.selectedGroupId);
}

function syncEditorSteps() {
  const group = getSelectedGroup();
  if (isEditingGroup() && group) {
    state.steps = group.steps;
    return;
  }
  state.steps = state.mainSteps;
}

function buildDraftWorkspacePayload() {
  return {
    flowName: state.flowName,
    steps: cloneFlow(state.mainSteps),
    groups: deepClone(state.groups),
    selectedTab: state.activeTab || "flow",
    selectedGroupId: state.selectedGroupId || null
  };
}

function snapshotAsSaved() {
  state.lastSaved = {
    steps: cloneFlow(state.mainSteps),
    flowName: state.flowName,
    groups: deepClone(state.groups)
  };
}

function restoreLastSaved() {
  state.mainSteps = cloneFlow(state.lastSaved.steps);
  state.groups = deepClone(state.lastSaved.groups || []);
  state.flowName = state.lastSaved.flowName;
  if (state.selectedGroupId && !getSelectedGroup()) {
    state.selectedGroupId = null;
  }
  syncEditorSteps();
}

function markWorkspaceDirty(flag, { silent } = {}) {
  state.dirty = flag;
  if (!flag && state.autosaveTimer) {
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = null;
  }
  if (flag && state.settings.autoSave !== false) {
    scheduleWorkspaceDraftSave();
  }
  if (flag && !silent) {
    showStatus("Unsaved changes.");
  }
}

async function saveWorkspaceDraft({ silent } = {}) {
  const payload = buildDraftWorkspacePayload();
  try {
    await chrome.storage.local.set({
      workspaceDraft: payload,
      settings: state.settings
    });
    if (!silent) showStatus("Draft saved.");
    return true;
  } catch (err) {
    console.error("[options] Failed to save workspace draft:", err);
    return false;
  }
}

function scheduleWorkspaceDraftSave() {
  if (state.settings.autoSave === false) return;
  if (state.autosaveTimer) clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(() => {
    state.autosaveTimer = null;
    saveWorkspaceDraft({ silent: true });
  }, 800);
}

function buildKeyPressEditor({ stepGetter, requestRender }) {
  const step = stepGetter();
  if (!step) return document.createElement("div");
  const root = document.createElement("div");
  root.className = "keypress-editor";

  const sequenceWrap = document.createElement("div");
  sequenceWrap.className = "field";
  const sequenceLabel = document.createElement("label");
  sequenceLabel.textContent = "Key sequence";
  sequenceWrap.appendChild(sequenceLabel);

  const hint = document.createElement("div");
  hint.className = "info-text";
  hint.textContent = "Capture usually works for most keys. Browser or OS reserved shortcuts may not be capturable; use the manual picker below for those.";
  sequenceWrap.appendChild(hint);

  const captureRow = document.createElement("div");
  captureRow.className = "input-row keypress-capture-row";
  captureRow.style.gridTemplateColumns = "1fr auto";

  const preview = document.createElement("input");
  preview.type = "text";
  preview.readOnly = true;
  const sequence = normalizeKeySequence(step.keys);
  preview.value = sequence.length ? sequence.map(formatKeyCombo).join(" → ") : "";
  preview.placeholder = "No keys captured yet";

  const captureBtn = document.createElement("button");
  captureBtn.type = "button";
  captureBtn.className = "toggle";
  captureBtn.textContent = "Capture";
  captureBtn.addEventListener("click", () => {
    if (activeKeyCapture?.button === captureBtn) {
      stopActiveKeyCapture();
      return;
    }
    beginKeyCapture(captureBtn, (combo) => {
      const current = stepGetter();
      if (!current) return;
      current.keys = normalizeKeySequence([...(Array.isArray(current.keys) ? current.keys : []), combo]);
      setDirty(true, { silent: true });
      requestRender();
    });
  });

  captureRow.appendChild(preview);
  captureRow.appendChild(captureBtn);
  sequenceWrap.appendChild(captureRow);

  const sequenceList = document.createElement("div");
  sequenceList.className = "keypress-sequence-list";
  if (!sequence.length) {
    const empty = document.createElement("div");
    empty.className = "info-text";
    empty.textContent = "Add at least one key combo.";
    sequenceList.appendChild(empty);
  } else {
    sequence.forEach((combo, index) => {
      const item = document.createElement("div");
      item.className = "keypress-sequence-item";
      const text = document.createElement("div");
      text.className = "keypress-sequence-label";
      text.textContent = `${index + 1}. ${formatKeyCombo(combo)}`;
      const actions = document.createElement("div");
      actions.className = "keypress-sequence-actions";

      const moveUp = document.createElement("button");
      moveUp.type = "button";
      moveUp.className = "icon";
      moveUp.title = "Move up";
      moveUp.textContent = "↑";
      moveUp.disabled = index === 0;
      moveUp.addEventListener("click", () => {
        const current = stepGetter();
        if (!current) return;
        const list = normalizeKeySequence(current.keys);
        const [entry] = list.splice(index, 1);
        list.splice(index - 1, 0, entry);
        current.keys = list;
        setDirty(true, { silent: true });
        requestRender();
      });

      const moveDown = document.createElement("button");
      moveDown.type = "button";
      moveDown.className = "icon";
      moveDown.title = "Move down";
      moveDown.textContent = "↓";
      moveDown.disabled = index === sequence.length - 1;
      moveDown.addEventListener("click", () => {
        const current = stepGetter();
        if (!current) return;
        const list = normalizeKeySequence(current.keys);
        const [entry] = list.splice(index, 1);
        list.splice(index + 1, 0, entry);
        current.keys = list;
        setDirty(true, { silent: true });
        requestRender();
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon danger";
      remove.title = "Remove";
      remove.textContent = "✕";
      remove.addEventListener("click", () => {
        const current = stepGetter();
        if (!current) return;
        const list = normalizeKeySequence(current.keys);
        list.splice(index, 1);
        current.keys = list;
        setDirty(true, { silent: true });
        requestRender();
      });

      actions.appendChild(moveUp);
      actions.appendChild(moveDown);
      actions.appendChild(remove);
      item.appendChild(text);
      item.appendChild(actions);
      sequenceList.appendChild(item);
    });
  }
  sequenceWrap.appendChild(sequenceList);

  const manualWrap = document.createElement("div");
  manualWrap.className = "field";
  const manualLabel = document.createElement("label");
  manualLabel.textContent = "Manual key picker";
  manualWrap.appendChild(manualLabel);

  const modifierRow = document.createElement("div");
  modifierRow.className = "keypress-modifiers";
  const modifierState = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
  [
    ["ctrlKey", "Ctrl"],
    ["altKey", "Alt"],
    ["shiftKey", "Shift"],
    ["metaKey", "Meta"]
  ].forEach(([key, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toggle";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      modifierState[key] = !modifierState[key];
      btn.classList.toggle("active", modifierState[key]);
    });
    modifierRow.appendChild(btn);
  });
  manualWrap.appendChild(modifierRow);

  const manualRow = document.createElement("div");
  manualRow.className = "input-row keypress-manual-row";
  manualRow.style.gridTemplateColumns = "1fr auto";

  const keySelect = document.createElement("select");
  KEY_PRESS_DROPDOWN_OPTIONS.forEach((option) => {
    const el = document.createElement("option");
    el.value = option.code;
    el.textContent = option.label;
    keySelect.appendChild(el);
  });

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "Add";
  addBtn.addEventListener("click", () => {
    const option = KEY_OPTION_MAP.get(keySelect.value);
    if (!option) return;
    const current = stepGetter();
    if (!current) return;
    current.keys = normalizeKeySequence([
      ...(Array.isArray(current.keys) ? current.keys : []),
      {
        key: option.key,
        code: option.code,
        ...modifierState
      }
    ]);
    setDirty(true, { silent: true });
    requestRender();
  });

  manualRow.appendChild(keySelect);
  manualRow.appendChild(addBtn);
  manualWrap.appendChild(manualRow);

  const advancedWrap = document.createElement("div");
  advancedWrap.className = "field";
  const details = document.createElement("details");
  details.className = "advanced-section";
  const summary = document.createElement("summary");
  summary.textContent = "Advanced";
  details.appendChild(summary);

  const advancedGrid = document.createElement("div");
  advancedGrid.className = "advanced-grid";

  const makeNumberField = (labelText, key, fallback) => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "10";
    if (key === "repeat") {
      input.min = "1";
      input.step = "1";
    }
    const currentValue = Number(step[key]);
    input.value = String(Number.isFinite(currentValue) && currentValue >= Number(input.min) ? currentValue : fallback);
    input.addEventListener("input", (event) => {
      const current = stepGetter();
      if (!current) return;
      const numeric = Number(event.target.value);
      if (!Number.isFinite(numeric)) return;
      current[key] = numeric;
      setDirty(true, { silent: true });
    });
    wrap.appendChild(label);
    wrap.appendChild(input);
    return wrap;
  };

  advancedGrid.appendChild(makeNumberField("Repeat count", "repeat", 1));
  advancedGrid.appendChild(makeNumberField("Delay between repeats (ms)", "repeatDelayMs", 120));
  advancedGrid.appendChild(makeNumberField("Delay between keys (ms)", "keyDelayMs", 60));
  advancedGrid.appendChild(makeNumberField("Hold key combo (ms)", "holdMs", 0));
  details.appendChild(advancedGrid);
  advancedWrap.appendChild(details);

  root.appendChild(sequenceWrap);
  root.appendChild(manualWrap);
  root.appendChild(advancedWrap);
  return root;
}

function isInlineInsertComboActive(event) {
  if (!event) return false;
  if (typeof event.getModifierState === 'function') {
    return event.getModifierState('Shift') && (event.getModifierState('Control') || event.getModifierState('Meta'));
  }
  return event.shiftKey && (event.ctrlKey || event.metaKey);
}

function captureViewportAnchor() {
  const info = { scrollX: window.scrollX, scrollY: window.scrollY };
  const cx = Math.max(0, Math.min(window.innerWidth - 1, Math.floor(window.innerWidth / 2)));
  const cy = Math.max(0, Math.min(window.innerHeight - 1, Math.floor(window.innerHeight / 2)));
  let el = document.elementFromPoint(cx, cy);
  while (el && !(el instanceof HTMLElement && el.classList.contains('step-card'))) {
    el = el.parentElement;
  }
  if (el && el.dataset?.path) {
    const rect = el.getBoundingClientRect();
    info.path = el.dataset.path;
    info.offset = rect.top;
  }
  return info;
}

function restoreViewportAnchor(anchor) {
  if (!anchor) return;
  const { path, offset, scrollX, scrollY } = anchor;
  if (path) {
    const card = Array.from(document.querySelectorAll('.step-card')).find((el) => el.dataset?.path === path);
    if (card) {
      const rect = card.getBoundingClientRect();
      const targetTop = typeof offset === 'number' ? offset : rect.top;
      const delta = rect.top - targetTop;
      window.scrollTo(scrollX, scrollY + delta);
      return;
    }
  }
  window.scrollTo(scrollX, scrollY);
}

function setInlineInsertActive(active) {
  const desired = Boolean(active) && !state.pendingPicker;
  if (state.inlineInsertActive === desired) return;
  const anchor = captureViewportAnchor();
  state.inlineInsertActive = desired;
  render();
  restoreViewportAnchor(anchor);
}

const gmailPromptUI = {
  el: null,
  requestId: null,
  messageEl: null,
  errorEl: null,
  connectBtn: null,
  cancelBtn: null,
  timeoutId: null,
  setLoading(loading) {
    if (!this.connectBtn || !this.cancelBtn) return;
    this.connectBtn.disabled = loading;
    this.cancelBtn.disabled = loading;
    this.connectBtn.textContent = loading ? 'Bağlanıyor...' : 'Bağlan';
  }
};

// Modern drag & drop state (supports nested If branches)
const DND_MIME = "application/x-autofiller-step";
const dndState = {
  active: false,
  srcPath: null,
  srcCtx: null,
  dragCard: null,
  indicator: (() => {
    const el = document.createElement('div');
    el.className = 'drop-indicator';
    return el;
  })(),
  targetList: null,
  targetCtx: null,
  targetIndex: -1,
  targetValid: false
};

function ensureGmailPromptElement() {
  if (gmailPromptUI.el) return gmailPromptUI.el;
  const overlay = document.createElement('div');
  overlay.id = 'gmail-connect-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(15,23,42,0.55)',
    backdropFilter: 'blur(1.5px)',
    display: 'none',
    placeItems: 'center',
    padding: '24px',
    zIndex: '2147483647'
  });

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    background: '#0f172a',
    color: '#e2e8f0',
    border: '1px solid rgba(148,163,184,0.3)',
    borderRadius: '12px',
    boxShadow: '0 20px 55px rgba(15,23,42,0.45)',
    padding: '24px',
    width: 'min(360px, 90vw)',
    display: 'grid',
    gap: '16px'
  });

  const title = document.createElement('h2');
  title.textContent = 'Gmail bağlantısı gerekli';
  Object.assign(title.style, {
    margin: '0',
    fontSize: '18px',
    fontWeight: '600'
  });

  const message = document.createElement('p');
  Object.assign(message.style, {
    margin: '0',
    fontSize: '14px',
    lineHeight: '1.5'
  });

  const error = document.createElement('p');
  Object.assign(error.style, {
    margin: '0',
    fontSize: '13px',
    color: '#f87171',
    minHeight: '16px'
  });

  const actions = document.createElement('div');
  Object.assign(actions.style, {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end'
  });

  const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.textContent = 'Kapat';
  Object.assign(cancelBtn.style, {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid rgba(148,163,184,0.4)',
    background: 'transparent',
    color: '#e2e8f0',
    cursor: 'pointer'
  });

  const connectBtn = document.createElement('button'); connectBtn.type = 'button'; connectBtn.textContent = 'Bağlan';
  Object.assign(connectBtn.style, {
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
    color: '#f8fafc',
    fontWeight: '600',
    cursor: 'pointer'
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(connectBtn);
  panel.appendChild(title);
  panel.appendChild(message);
  panel.appendChild(error);
  panel.appendChild(actions);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      if (!gmailPromptUI.requestId) {
        overlay.style.display = 'none';
      }
    }
  });

  cancelBtn.addEventListener('click', async () => {
    if (!gmailPromptUI.requestId) {
      hideGmailConnectPrompt();
      return;
    }
    gmailPromptUI.setLoading(true);
    try { await chrome.runtime.sendMessage({ type: 'GMAIL_CONNECT_PROMPT_DECISION', action: 'cancel', requestId: gmailPromptUI.requestId }); } catch {}
    hideGmailConnectPrompt();
    showStatus('Gmail bağlantısı iptal edildi.');
  });

  connectBtn.addEventListener('click', async () => {
    if (!gmailPromptUI.requestId) {
      hideGmailConnectPrompt();
      return;
    }
    gmailPromptUI.errorEl.textContent = '';
    gmailPromptUI.setLoading(true);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GMAIL_CONNECT_PROMPT_DECISION', action: 'connect', requestId: gmailPromptUI.requestId });
      if (!res?.ok) {
        gmailPromptUI.errorEl.textContent = res?.error || 'Bağlantı kurulamadı.';
        gmailPromptUI.setLoading(false);
        return;
      }
      await refreshGmailSettingsFromStorage();
      hideGmailConnectPrompt();
      showStatus('Gmail connected.');
    } catch (err) {
      gmailPromptUI.errorEl.textContent = err?.message || String(err);
      gmailPromptUI.setLoading(false);
    }
  });

  gmailPromptUI.el = overlay;
  gmailPromptUI.messageEl = message;
  gmailPromptUI.errorEl = error;
  gmailPromptUI.connectBtn = connectBtn;
  gmailPromptUI.cancelBtn = cancelBtn;
  gmailPromptUI.timeoutId = null;
  return overlay;
}

function showGmailConnectPrompt(reason, requestId) {
  ensureGmailPromptElement();
  const overlay = gmailPromptUI.el;
  const reasonText = reason === 'expired'
    ? 'Gmail bağlantı süresi dolmuş. Devam etmek için hesabınızı yeniden bağlayın.'
    : 'Bu adımı çalıştırmak için Gmail bağlantısı gerekiyor. Bağlanmak ister misiniz?';
  gmailPromptUI.requestId = requestId;
  gmailPromptUI.messageEl.textContent = reasonText;
  gmailPromptUI.errorEl.textContent = '';
  gmailPromptUI.setLoading(false);
  if (gmailPromptUI.timeoutId) {
    clearTimeout(gmailPromptUI.timeoutId);
    gmailPromptUI.timeoutId = null;
  }
  gmailPromptUI.timeoutId = window.setTimeout(() => {
    if (gmailPromptUI.requestId === requestId) {
      try {
        const maybe = chrome.runtime.sendMessage({ type: 'GMAIL_CONNECT_PROMPT_DECISION', action: 'cancel', requestId });
        if (maybe && typeof maybe.catch === 'function') maybe.catch(() => {});
      } catch {}
      hideGmailConnectPrompt();
      showStatus('Gmail connection request timed out.');
    }
  }, 60000);
  overlay.style.display = 'grid';
}

function hideGmailConnectPrompt() {
  if (gmailPromptUI.timeoutId) {
    clearTimeout(gmailPromptUI.timeoutId);
    gmailPromptUI.timeoutId = null;
  }
  if (gmailPromptUI.el) {
    gmailPromptUI.el.style.display = 'none';
  }
  gmailPromptUI.setLoading(false);
  if (gmailPromptUI.errorEl) gmailPromptUI.errorEl.textContent = '';
  gmailPromptUI.requestId = null;
}
let dndHandlersBound = false;

const DND_DEBUG = (() => {
  try {
    if (typeof localStorage === 'undefined') return false;
    const stored = localStorage.getItem('autofiller:dndDebug');
    if (stored === '0' || stored === 'false') return false;
    if (stored === '1' || stored === 'true') return true;
  } catch {}
  return false;
})();

const dndDebugState = { lastCtxSig: null };

function dndLog(event, detail) {
  if (!DND_DEBUG) return;
  if (detail !== undefined) console.log(`[DND] ${event}`, detail);
  else console.log(`[DND] ${event}`);
}

function describeCtx(ctx) {
  if (!ctx) return { type: 'none' };
  if (ctx.type === 'root') return { type: 'root' };
  return {
    type: ctx.type,
    branch: ctx.branch,
    hostPath: Array.isArray(ctx.hostPath) ? ctx.hostPath : []
  };
}

function logTargetChange(ctx, index, valid) {
  if (!DND_DEBUG) return;
  const host = ctx?.type === 'branch' ? JSON.stringify(ctx.hostPath || []) : '';
  const signature = `${ctx?.type || 'none'}|${ctx?.branch || ''}|${host}|${valid ? 1 : 0}`;
  if (dndDebugState.lastCtxSig === signature) return;
  dndDebugState.lastCtxSig = signature;
  dndLog(valid ? 'target' : 'target-denied', { ctx: describeCtx(ctx), index });
}

function markListDroppable(listEl, hostPath = [], branch = 'root') {
  if (!listEl) return;
  try {
    listEl.dataset.hostPath = JSON.stringify(hostPath || []);
  } catch {
    listEl.dataset.hostPath = '[]';
  }
  listEl.dataset.branch = branch;
  bindDropZoneHandlers(listEl);
}

function bindDropZoneHandlers(listEl) {
  if (!listEl || listEl.__dndBound) return;
  const handleDragOver = (event) => {
    if (!dndState.active) return;
    event.preventDefault();
    event.stopPropagation();
    const ctx = getContextFromList(listEl);
    if (!ctx) return;
    const invalid = isDropIntoOwnSubtree(dndState.srcPath, ctx);
    if (invalid) {
      setCurrentDropTarget(listEl, ctx, -1, false);
      try { event.dataTransfer.dropEffect = 'none'; } catch {}
      return;
    }
    const index = computeDropIndex(listEl, event.clientY);
    setCurrentDropTarget(listEl, ctx, index, true);
    try { event.dataTransfer.dropEffect = 'move'; } catch {}
  };
  const handleDrop = (event) => {
    if (!dndState.active) return;
    event.preventDefault();
    event.stopPropagation();
    const ctx = getContextFromList(listEl);
    if (!ctx) return;
    const invalid = isDropIntoOwnSubtree(dndState.srcPath, ctx);
    if (invalid) {
      setCurrentDropTarget(listEl, ctx, -1, false);
      return;
    }
    const index = computeDropIndex(listEl, event.clientY);
    setCurrentDropTarget(listEl, ctx, index, true);
    finalizeDrop(event, { ctx, index, listEl });
  };
  const handleDragLeave = (event) => {
    if (!dndState.active) return;
    const related = event.relatedTarget;
    if (related && (related === listEl || (related instanceof Element && listEl.contains(related)))) {
      return;
    }
    if (dndState.targetList === listEl) {
      clearCurrentDropTarget();
      removeDropIndicator();
    }
  };
  listEl.addEventListener('dragover', handleDragOver);
  listEl.addEventListener('drop', handleDrop);
  listEl.addEventListener('dragleave', handleDragLeave);
  listEl.__dndBound = { handleDragOver, handleDrop, handleDragLeave };
}

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
  if (msg.type === "GROUP_EXEC_STATUS") {
    handleGroupExecStatus(msg);
    return;
  }
  if (msg.type === "FLOW_COMPLETE") {
    handleFlowComplete(msg);
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
  if (msg.type === "GMAIL_CONNECT_REQUIRED") {
    showGmailConnectPrompt(msg.reason || 'not_connected', msg.requestId);
    return;
  }
  if (msg.type === "FLOW_ABORT") {
    state.isRunning = false;
    state.stopSuppressUntil = 0;
    state.waitCountdowns = {};
    state.waitDeadlines = {};
    state.nestedWaitCountdowns = {};
    state.nestedWaitDeadlines = {};
    syncCountdownTicker();
    updateRunButton();
    render();
    return;
  }
  if (msg.type === "FLOW_ITER") {
    handleFlowIter(msg);
    return;
  }
});

init().catch((err) => {
  console.error("[options] Failed to initialise:", err);
  alert("Flow editor failed to load. Check the console for details.");
});

async function init() {
  wireEvents();
  setupGlobalDnDHandlers();
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
  try {
    const q = await chrome.runtime.sendMessage({ type: 'QUERY_FLOW_STATE' });
    if (q && q.ok) { state.isRunning = Boolean(q.running); updateRunButton(); }
  } catch {}
  initTabs();
  render();
}

function wireEvents() {
  els.addStep?.addEventListener("click", () => {
    if (addStep()) {
      render();
      markWorkspaceDirty(true);
    }
  });

  els.groupAddStep?.addEventListener("click", () => {
    if (addStep()) {
      render();
      markWorkspaceDirty(true);
    }
  });

  const inlineKeyDown = (event) => {
    if (event.repeat && state.inlineInsertActive) return;
    if (!isInlineInsertComboActive(event)) return;
    setInlineInsertActive(true);
  };
  const inlineKeyUp = (event) => {
    if (isInlineInsertComboActive(event)) return;
    setInlineInsertActive(false);
  };
  document.addEventListener('keydown', inlineKeyDown);
  document.addEventListener('keyup', inlineKeyUp);
  window.addEventListener('blur', () => setInlineInsertActive(false));

  els.saveFlow?.addEventListener("click", async () => {
    const saved = await persistFlow();
    if (saved) showStatus("Flow saved to storage.");
  });

  els.discardChanges?.addEventListener("click", () => {
    restoreLastSaved();
    render();
    saveWorkspaceDraft({ silent: true });
    markWorkspaceDirty(false);
    showStatus("Changes discarded.");
  });

  els.loadDefault?.addEventListener("click", () => {
    if (!confirm("Replace the current steps with the default example flow?")) return;
    state.mainSteps = cloneFlow(DEFAULT_FLOW);
    syncEditorSteps();
    state.flowName = DEFAULT_FLOW_NAME;
    state.stepStatuses = state.mainSteps.map(() => "idle");
    state.nestedStatuses = {};
    state.ifResults = {};
    state.groupExecStates = {};
    state.waitCountdowns = {};
    state.waitDeadlines = {};
    state.nestedWaitCountdowns = {};
    state.nestedWaitDeadlines = {};
    render();
    markWorkspaceDirty(true);
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
      markWorkspaceDirty(true);
      showStatus("Imported flow. Save to persist.");
    } catch (err) {
      console.error("[options] Import failed:", err);
      alert("Invalid flow JSON. Details in the console.");
    } finally {
      event.target.value = "";
    }
  });

  els.runFlow?.addEventListener("click", async () => {
    if (state.isRunning) {
      try { await chrome.runtime.sendMessage({ type: "STOP_FLOW" }); showStatus("Stop requested."); } catch {}
      // reflect immediately
      state.isRunning = false; updateRunButton();
      // suppress transient running states for a short window to avoid flicker
      state.stopSuppressUntil = Date.now() + 2000;
      return;
    }
    const prepared = validateAndPrepare(); if (!prepared) return;
    await persistFlow({ steps: prepared.steps, flowName: prepared.flowName, groups: prepared.groups, silent: true });
    // Reset runs counter when starting a new run (both total and UI snapshot)
    state.runCount = 0;
    try {
      const cur = await chrome.storage.local.get(["flowUiState"]);
      const ui = { ...(cur?.flowUiState || {}), iterCount: 0 };
      await chrome.storage.local.set({ runCountTotal: 0, flowUiState: ui });
    } catch {}
    state.isRunning = true; updateRunButton(); render();
    const ok = await triggerRunFlow();
    if (ok) { showStatus("Flow dispatched to active tab."); } else { state.isRunning = false; updateRunButton(); }
  });

  // menu events
  els.moreMenuBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    els.moreMenu?.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!els.moreMenu || els.moreMenu.classList.contains("hidden")) return;
    const inside = e.target === els.moreMenu || els.moreMenu.contains(e.target) || e.target === els.moreMenuBtn;
    if (!inside) els.moreMenu.classList.add("hidden");
  });
  els.menuReset?.addEventListener("click", () => { els.moreMenu?.classList.add("hidden"); els.loadDefault?.click(); });
  els.menuExport?.addEventListener("click", () => { els.moreMenu?.classList.add("hidden"); exportFlow(); });
  els.menuImport?.addEventListener("click", () => { els.moreMenu?.classList.add("hidden"); els.importFlow?.click(); });
  els.menuClear?.addEventListener("click", () => {
    els.moreMenu?.classList.add("hidden");
    if (!confirm("Clear all steps and start with an empty flow?")) return;
    state.mainSteps = [];
    syncEditorSteps();
    state.stepStatuses = [];
    state.nestedStatuses = {};
    state.ifResults = {};
    state.groupExecStates = {};
    state.waitCountdowns = {};
    state.waitDeadlines = {};
    state.nestedWaitCountdowns = {};
    state.nestedWaitDeadlines = {};
    markWorkspaceDirty(true);
    render();
    showStatus("Flow cleared. Add steps to start building.");
  });

  // removed duplicate message listener; handled centrally

  els.flowName?.addEventListener("input", (event) => {
    state.flowName = event.target.value;
    markWorkspaceDirty(true, { silent: true });
  });

  els.groupNameInput?.addEventListener("input", (event) => {
    const group = getSelectedGroup();
    if (!group) return;
    group.name = event.target.value;
    markWorkspaceDirty(true, { silent: true });
    renderGroupsList();
    renderTransferModal();
  });

  // tabs
  els.tabFlowBtn?.addEventListener("click", () => selectTab("flow"));
  els.tabGroupsBtn?.addEventListener("click", () => selectTab("groups"));
  els.tabSettingsBtn?.addEventListener("click", () => selectTab("settings"));
  els.tabLibraryBtn?.addEventListener("click", () => selectTab("library"));

  // settings inputs
  els.stepDelayMs?.addEventListener("input", (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v >= 0) {
      state.settings.stepDelayMs = v;
      markWorkspaceDirty(true, { silent: true });
    }
  });
  els.selectorWaitMs?.addEventListener("input", (e) => {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v >= 0) {
      state.settings.selectorWaitMs = v;
      markWorkspaceDirty(true, { silent: true });
    }
  });

  els.useNativeClick?.addEventListener("change", (e) => {
    state.settings.useNativeClick = Boolean(e.target.checked);
    markWorkspaceDirty(true, { silent: true });
  });

  els.readInsideIframes?.addEventListener("change", (e) => {
    state.settings.readInsideIframes = Boolean(e.target.checked);
    markWorkspaceDirty(true, { silent: true });
  });

  els.autoSave?.addEventListener("change", async (e) => {
    state.settings.autoSave = Boolean(e.target.checked);
    markWorkspaceDirty(true, { silent: true });
    if (state.settings.autoSave) {
      await saveWorkspaceDraft({ silent: true });
    } else if (state.autosaveTimer) {
      clearTimeout(state.autosaveTimer);
      state.autosaveTimer = null;
    }
  });

  els.gmailClientId?.addEventListener("input", (e) => {
    const v = e.target.value.trim();
    state.settings.gmailClientId = v;
    markWorkspaceDirty(true, { silent: true });
  });

  // library events
  els.saveAsNewBtn?.addEventListener("click", () => {
    saveCurrentAsNew();
  });

  els.connectGmailBtn?.addEventListener("click", async () => {
    try {
      const clientId = state.settings.gmailClientId?.trim();
      if (!clientId) { alert("Enter Gmail OAuth Client ID in Settings"); return; }
      const res = await chrome.runtime.sendMessage({ type: "GMAIL_CONNECT", clientId });
      if (!res?.ok) { alert("Gmail connect failed: " + (res?.error || "unknown")); return; }
      await refreshGmailSettingsFromStorage();
      hideGmailConnectPrompt();
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

  els.createGroupBtn?.addEventListener("click", () => {
    const group = createGroup();
    state.groups.unshift(group);
    state.selectedGroupId = group.id;
    selectTab("groups");
    markWorkspaceDirty(true);
    render();
    showStatus("Group created.");
  });

  els.closeGroupEditorBtn?.addEventListener("click", () => {
    state.selectedGroupId = null;
    selectTab("groups");
    render();
  });

  els.openTransferModalBtn?.addEventListener("click", () => {
    if (!getSelectedGroup()) return;
    state.transferModal = {
      open: true,
      mode: "copy",
      source: "main",
      selectedIndices: []
    };
    renderTransferModal();
  });

  els.closeTransferModalBtn?.addEventListener("click", closeTransferModal);
  els.transferModeCopyBtn?.addEventListener("click", () => {
    state.transferModal.mode = "copy";
    renderTransferModal();
  });
  els.transferModeCutBtn?.addEventListener("click", () => {
    state.transferModal.mode = "cut";
    renderTransferModal();
  });
  els.transferSourceSelect?.addEventListener("change", (event) => {
    state.transferModal.source = event.target.value;
    state.transferModal.selectedIndices = [];
    renderTransferModal();
  });
  els.transferSelectAllBtn?.addEventListener("click", () => {
    state.transferModal.selectedIndices = getTransferSourceSteps().map((_, index) => index);
    renderTransferModal();
  });
  els.transferClearSelectionBtn?.addEventListener("click", () => {
    state.transferModal.selectedIndices = [];
    renderTransferModal();
  });
  els.executeTransferBtn?.addEventListener("click", executeTransferSelection);

}

async function loadFromStorage() {
  try {
    const stored = await chrome.storage.local.get([
      "activeFlow",
      "flowName",
      "groups",
      "workspaceDraft",
      "settings",
      "flowUiState",
      "savedFlows",
      "runCountTotal"
    ]);
    const publishedSteps = sanitizeFlowArray(stored.activeFlow);
    const publishedGroups = sanitizeGroups(stored.groups);
    const publishedFlowName = typeof stored.flowName === "string" && stored.flowName.trim() ? stored.flowName : DEFAULT_FLOW_NAME;
    const draft = stored.workspaceDraft && typeof stored.workspaceDraft === "object" ? stored.workspaceDraft : null;
    const draftSteps = sanitizeFlowArray(draft?.steps);
    const draftGroups = sanitizeGroups(draft?.groups);
    state.mainSteps = draft
      ? (draftSteps.length ? draftSteps : cloneFlow(DEFAULT_FLOW))
      : (publishedSteps.length ? publishedSteps : cloneFlow(DEFAULT_FLOW));
    state.groups = draft ? draftGroups : publishedGroups;
    state.flowName = draft?.flowName && String(draft.flowName).trim() ? String(draft.flowName).trim() : publishedFlowName;
    state.settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
    state.activeTab = draft?.selectedTab === "groups" || draft?.selectedTab === "settings" || draft?.selectedTab === "library"
      ? draft.selectedTab
      : "flow";
    state.selectedGroupId = typeof draft?.selectedGroupId === "string" ? draft.selectedGroupId : null;
    if (state.selectedGroupId && !state.groups.some((group) => group.id === state.selectedGroupId)) {
      state.selectedGroupId = null;
    }
    syncEditorSteps();
    // restore statuses if available
    const ui = stored.flowUiState || {};
    const baseStatuses = Array.isArray(ui.stepStatuses) ? ui.stepStatuses.slice() : [];
    // ensure length matches steps
    state.stepStatuses = state.mainSteps.map((_, i) => baseStatuses[i] || "idle");
    state.nestedStatuses = typeof ui.nestedStatuses === 'object' && ui.nestedStatuses ? ui.nestedStatuses : {};
    state.ifResults = typeof ui.ifResults === 'object' && ui.ifResults ? ui.ifResults : {};
    state.waitCountdowns = typeof ui.waitCountdowns === 'object' && ui.waitCountdowns ? ui.waitCountdowns : {};
    state.waitDeadlines = typeof ui.waitDeadlines === 'object' && ui.waitDeadlines ? ui.waitDeadlines : {};
    state.nestedWaitCountdowns = typeof ui.nestedWaitCountdowns === 'object' && ui.nestedWaitCountdowns ? ui.nestedWaitCountdowns : {};
    state.nestedWaitDeadlines = typeof ui.nestedWaitDeadlines === 'object' && ui.nestedWaitDeadlines ? ui.nestedWaitDeadlines : {};
    const hasTotal = stored.runCountTotal !== undefined && stored.runCountTotal !== null;
    state.runCount = hasTotal ? (Number(stored.runCountTotal) || 0) : (Number(ui.iterCount) || 0);
    state.savedFlows = sanitizeSavedFlows(stored.savedFlows);
    const hasPublishedWorkspace = publishedSteps.length > 0 || publishedGroups.length > 0;
    state.lastSaved = {
      steps: hasPublishedWorkspace ? publishedSteps : cloneFlow(state.mainSteps),
      flowName: hasPublishedWorkspace ? publishedFlowName : state.flowName,
      groups: hasPublishedWorkspace ? publishedGroups : deepClone(state.groups)
    };
    markWorkspaceDirty(false, { silent: true });
    refreshCountdownState();
    // restore running state (treat stale UI state as not running unless live waits prove otherwise)
    try {
      const uiRunning = stored.flowUiState?.isRunning === true;
      const last = Number(stored.flowUiState?.lastUpdatedAt) || 0;
      const stale = !last || (Date.now() - last > 5000);
      const anyActive = state.stepStatuses.some(s => s === 'pending' || s === 'running')
        || Object.values(state.waitDeadlines || {}).some((until) => {
          const remaining = computeRemainingSeconds(until);
          return Number.isFinite(remaining) && remaining > 0;
        })
        || Object.values(state.nestedWaitDeadlines || {}).some((until) => {
          const remaining = computeRemainingSeconds(until);
          return Number.isFinite(remaining) && remaining > 0;
        });
      state.isRunning = (uiRunning && !stale) || anyActive;
      updateRunButton();
    } catch {}
    syncCountdownTicker();
  } catch (err) {
    console.warn("[options] Failed to load stored flow, using defaults:", err);
    state.mainSteps = cloneFlow(DEFAULT_FLOW);
    state.groups = [];
    state.flowName = DEFAULT_FLOW_NAME;
    state.activeTab = "flow";
    state.selectedGroupId = null;
    state.settings = { ...DEFAULT_SETTINGS };
    syncEditorSteps();
    state.stepStatuses = state.mainSteps.map(() => "idle");
    state.nestedStatuses = {};
    state.ifResults = {};
    state.groupExecStates = {};
    state.waitCountdowns = {};
    state.waitDeadlines = {};
    state.nestedWaitCountdowns = {};
    state.nestedWaitDeadlines = {};
    state.runCount = 0;
    state.savedFlows = [];
    snapshotAsSaved();
    markWorkspaceDirty(false, { silent: true });
    syncCountdownTicker();
  }
}

function render() {
  syncEditorSteps();
  renderSteps();
  renderGroupsView();
  els.flowName.value = state.flowName;
  if (els.runCounter) els.runCounter.textContent = `Runs: ${state.runCount || 0}`;
  if (els.runCounter) els.runCounter.style.display = (state.runCount && state.runCount > 0) ? '' : 'none';
  // settings reflect
  if (els.stepDelayMs) els.stepDelayMs.value = String(state.settings.stepDelayMs ?? DEFAULT_SETTINGS.stepDelayMs);
  if (els.selectorWaitMs) els.selectorWaitMs.value = String(state.settings.selectorWaitMs ?? DEFAULT_SETTINGS.selectorWaitMs);
  if (els.useNativeClick) els.useNativeClick.checked = Boolean(state.settings.useNativeClick ?? DEFAULT_SETTINGS.useNativeClick);
  if (els.readInsideIframes) els.readInsideIframes.checked = Boolean(state.settings.readInsideIframes ?? DEFAULT_SETTINGS.readInsideIframes);
  if (els.autoSave) els.autoSave.checked = Boolean(state.settings.autoSave ?? DEFAULT_SETTINGS.autoSave);
  if (els.gmailClientId) els.gmailClientId.value = String(state.settings.gmailClientId ?? "");
  if (els.versionLabel) {
    const version = getExtensionVersion();
    els.versionLabel.textContent = version ? `Version ${version}` : "Version unavailable";
  }
  updateGmailStatusLabel();
  updateEmptyState();
  setControlsDisabled(Boolean(state.pendingPicker));
  updateControlsForTab();
  renderTransferModal();
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
  renderStepsInto(container);
}

function renderStepsInto(container) {
  if (!container) return;
  container.innerHTML = "";
  markListDroppable(container, [], 'root');
  const showInlineSlots = Boolean(state.inlineInsertActive);
  if (showInlineSlots) {
    container.appendChild(createInlineAddSlot(0));
  }

  state.steps.forEach((step, index) => {
    const card = createStepCard(step, index);
    container.appendChild(card);
    if (showInlineSlots) {
      container.appendChild(createInlineAddSlot(index + 1));
    }
  });

  if (state.steps.length === 0 && !showInlineSlots) {
    // nothing extra; empty state handles messaging
  }
}

function renderGroupsView() {
  const isGroupOpen = isEditingGroup();
  if (els.groupsListView) els.groupsListView.classList.toggle("hidden", isGroupOpen);
  if (els.groupEditorView) els.groupEditorView.classList.toggle("hidden", !isGroupOpen);
  renderGroupsList();
  renderGroupEditor();
}

function renderGroupsList() {
  const container = els.groupsContainer;
  if (!container) return;
  container.innerHTML = "";
  if (!state.groups.length) {
    els.groupsEmptyState?.classList.remove("hidden");
    return;
  }
  els.groupsEmptyState?.classList.add("hidden");
  state.groups.forEach((group, index) => {
    const card = document.createElement("article");
    card.className = "step-card group-list-item";
    const header = document.createElement("div");
    header.className = "step-header";
    const title = document.createElement("span");
    title.className = "step-title";
    title.textContent = group.name;
    const actions = document.createElement("div");
    actions.className = "step-actions";
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "icon";
    openBtn.title = "Open group";
    openBtn.textContent = "↗";
    openBtn.addEventListener("click", () => {
      state.selectedGroupId = group.id;
      selectTab("groups");
      render();
    });
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon danger";
    deleteBtn.title = "Delete group";
    deleteBtn.textContent = "✕";
    deleteBtn.addEventListener("click", () => {
      if (!confirm(`Delete group “${group.name}”?`)) return;
      state.groups = state.groups.filter((item) => item.id !== group.id);
      if (state.selectedGroupId === group.id) state.selectedGroupId = null;
      syncEditorSteps();
      markWorkspaceDirty(true);
      render();
      showStatus("Group deleted.");
    });
    actions.appendChild(openBtn);
    actions.appendChild(deleteBtn);
    header.appendChild(title);
    header.appendChild(actions);
    const meta = document.createElement("div");
    meta.className = "group-meta";
    meta.textContent = `${group.steps.length} step${group.steps.length === 1 ? "" : "s"} · Group ${index + 1}`;
    card.appendChild(header);
    card.appendChild(meta);
    container.appendChild(card);
  });
}

function renderGroupEditor() {
  const group = getSelectedGroup();
  if (!group) {
    if (els.groupStepsContainer) els.groupStepsContainer.innerHTML = "";
    if (els.groupEmptyState) els.groupEmptyState.classList.add("hidden");
    if (els.groupNameInput) els.groupNameInput.value = "";
    if (els.groupMeta) els.groupMeta.textContent = "";
    return;
  }
  if (els.groupNameInput && document.activeElement !== els.groupNameInput) {
    els.groupNameInput.value = group.name;
  }
  if (els.groupMeta) {
    els.groupMeta.textContent = `${group.steps.length} step${group.steps.length === 1 ? "" : "s"} in this group`;
  }
  renderStepsInto(els.groupStepsContainer);
  if (els.groupEmptyState) {
    els.groupEmptyState.classList.toggle("hidden", group.steps.length > 0);
  }
  performPendingGroupStepJump();
}

function closeTransferModal() {
  const active = document.activeElement;
  if (els.transferModal && active instanceof HTMLElement && els.transferModal.contains(active)) {
    const fallback = els.openTransferModalBtn || els.groupNameInput || els.closeGroupEditorBtn || els.tabGroupsBtn;
    if (fallback instanceof HTMLElement) {
      fallback.focus({ preventScroll: true });
    } else {
      active.blur();
    }
  }
  state.transferModal.open = false;
  renderTransferModal();
}

function getTransferSourceOptions() {
  const destinationGroupId = state.selectedGroupId;
  const options = [{ value: "main", label: "Main Flow" }];
  state.groups.forEach((group) => {
    if (group.id === destinationGroupId) return;
    options.push({ value: group.id, label: group.name });
  });
  return options;
}

function getTransferSourceSteps() {
  const source = state.transferModal.source;
  if (source === "main") return state.mainSteps;
  const group = state.groups.find((item) => item.id === source);
  return Array.isArray(group?.steps) ? group.steps : [];
}

function renderTransferModal() {
  if (!els.transferModal) return;
  const open = Boolean(state.transferModal.open) && Boolean(getSelectedGroup());
  els.transferModal.classList.toggle("hidden", !open);
  els.transferModal.setAttribute("aria-hidden", String(!open));
  if (!open) {
    els.transferModal.setAttribute("inert", "");
  } else {
    els.transferModal.removeAttribute("inert");
  }
  if (!open) return;

  const options = getTransferSourceOptions();
  if (!options.some((option) => option.value === state.transferModal.source)) {
    state.transferModal.source = options[0]?.value || "main";
    state.transferModal.selectedIndices = [];
  }
  if (els.transferSourceSelect) {
    els.transferSourceSelect.innerHTML = "";
    options.forEach((option) => {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      els.transferSourceSelect.appendChild(el);
    });
    els.transferSourceSelect.value = state.transferModal.source;
  }
  els.transferModeCopyBtn?.classList.toggle("active", state.transferModal.mode === "copy");
  els.transferModeCutBtn?.classList.toggle("active", state.transferModal.mode === "cut");

  const list = els.transferSourceList;
  if (!list) return;
  const steps = getTransferSourceSteps();
  const selected = new Set(state.transferModal.selectedIndices);
  list.innerHTML = "";
  if (!steps.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "This source has no top-level steps to transfer.";
    list.appendChild(empty);
  } else {
    steps.forEach((step, index) => {
      const row = document.createElement("label");
      row.className = "transfer-item";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected.has(index);
      checkbox.addEventListener("change", (event) => {
        const next = new Set(state.transferModal.selectedIndices);
        if (event.target.checked) next.add(index);
        else next.delete(index);
        state.transferModal.selectedIndices = Array.from(next).sort((left, right) => left - right);
        renderTransferModal();
      });
      const info = document.createElement("div");
      const title = document.createElement("div");
      title.textContent = summarizeStep(step, index);
      const meta = document.createElement("div");
      meta.className = "transfer-item-copy";
      meta.textContent = step?.type === "If"
        ? `${Array.isArray(step.then) ? step.then.length : 0} then / ${Array.isArray(step.else) ? step.else.length : 0} else nested steps`
        : "Top-level step";
      info.appendChild(title);
      info.appendChild(meta);
      row.appendChild(checkbox);
      row.appendChild(info);
      list.appendChild(row);
    });
  }
  if (els.transferSelectionSummary) {
    const count = state.transferModal.selectedIndices.length;
    els.transferSelectionSummary.textContent = count
      ? `${count} step${count === 1 ? "" : "s"} selected for ${state.transferModal.mode}.`
      : "Select top-level steps to transfer.";
  }
}

async function executeTransferSelection() {
  const destinationGroup = getSelectedGroup();
  if (!destinationGroup) return;
  const sourceId = state.transferModal.source;
  const sourceSteps = getTransferSourceSteps();
  const selected = Array.from(new Set(state.transferModal.selectedIndices)).sort((left, right) => left - right);
  if (!selected.length) {
    alert("Select at least one step to transfer.");
    return;
  }
  const clones = selected.map((index) => deepClone(sourceSteps[index])).filter(Boolean);
  destinationGroup.steps.push(...clones);
  if (state.transferModal.mode === "cut") {
    const remaining = sourceSteps.filter((_, index) => !selected.includes(index));
    if (sourceId === "main") {
      state.mainSteps = remaining;
      state.stepStatuses = state.mainSteps.map(() => "idle");
      state.nestedStatuses = {};
      state.ifResults = {};
      state.groupExecStates = {};
      state.waitCountdowns = {};
      state.waitDeadlines = {};
      state.nestedWaitCountdowns = {};
      state.nestedWaitDeadlines = {};
    } else {
      const sourceGroup = state.groups.find((group) => group.id === sourceId);
      if (sourceGroup) sourceGroup.steps = remaining;
    }
  }
  syncEditorSteps();
  markWorkspaceDirty(true);
  closeTransferModal();
  render();
  showStatus(`Transferred ${clones.length} step${clones.length === 1 ? "" : "s"} to group.`);
}

function getDisplayedStepStatus(index) {
  if (isEditingGroup()) return "idle";
  const step = state.mainSteps[index];
  if (step?.type === "Wait") {
    const remaining = computeRemainingSeconds(state.waitDeadlines?.[index]);
    if (Number.isFinite(remaining) && remaining > 0) {
      return "running";
    }
  }
  return state.stepStatuses[index] || "idle";
}

function getDisplayedNestedStatus(key, stepType) {
  if (isEditingGroup()) return "idle";
  if (stepType === "Wait") {
    const remaining = computeRemainingSeconds(state.nestedWaitDeadlines?.[key]);
    if (Number.isFinite(remaining) && remaining > 0) {
      return "running";
    }
  }
  return state.nestedStatuses[key] || "idle";
}

function getGroupExecState(index) {
  return state.groupExecStates[index] || null;
}

function queueGroupStepJump(groupId, stepIndex) {
  state.groupStepJumpTarget = {
    groupId,
    stepIndex: Number(stepIndex)
  };
}

function performPendingGroupStepJump() {
  const jump = state.groupStepJumpTarget;
  if (!jump || !els.groupStepsContainer || state.selectedGroupId !== jump.groupId) return;
  const card = els.groupStepsContainer.querySelector(`.step-card[data-step-index="${jump.stepIndex}"]`);
  if (!card) return;
  state.groupStepJumpTarget = null;
  requestAnimationFrame(() => {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("drop-target-highlight");
    setTimeout(() => card.classList.remove("drop-target-highlight"), 1800);
  });
}

function computeRemainingSeconds(until) {
  const deadline = Number(until);
  if (!Number.isFinite(deadline)) return null;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

function refreshCountdownState() {
  let changed = false;

  Object.keys(state.waitDeadlines || {}).forEach((key) => {
    const next = computeRemainingSeconds(state.waitDeadlines[key]);
    if (next == null) return;
    if (state.waitCountdowns[key] !== next) {
      state.waitCountdowns[key] = next;
      changed = true;
    }
  });

  Object.keys(state.nestedWaitDeadlines || {}).forEach((key) => {
    const next = computeRemainingSeconds(state.nestedWaitDeadlines[key]);
    if (next == null) return;
    if (state.nestedWaitCountdowns[key] !== next) {
      state.nestedWaitCountdowns[key] = next;
      changed = true;
    }
  });

  Object.entries(state.waitDeadlines || {}).forEach(([key, until]) => {
    const remaining = computeRemainingSeconds(until);
    if (remaining != null && remaining > 0 && state.stepStatuses[key] !== 'running') {
      state.stepStatuses[key] = 'running';
      changed = true;
    }
  });

  Object.entries(state.nestedWaitDeadlines || {}).forEach(([key, until]) => {
    const remaining = computeRemainingSeconds(until);
    if (remaining != null && remaining > 0 && state.nestedStatuses[key] !== 'running') {
      state.nestedStatuses[key] = 'running';
      changed = true;
    }
  });

  if (changed) render();
}

function syncCountdownTicker() {
  const hasActiveWaits = Object.keys(state.waitDeadlines || {}).length > 0 || Object.keys(state.nestedWaitDeadlines || {}).length > 0;
  if (!hasActiveWaits) {
    if (state.countdownTicker) {
      clearInterval(state.countdownTicker);
      state.countdownTicker = null;
    }
    return;
  }
  if (!state.countdownTicker) {
    state.countdownTicker = setInterval(refreshCountdownState, 250);
  }
}

function getDisplayedWaitSeconds(index) {
  const live = computeRemainingSeconds(state.waitDeadlines?.[index]);
  if (live != null) return live;
  const stored = Number(state.waitCountdowns?.[index]);
  return Number.isFinite(stored) ? Math.max(0, stored) : null;
}

function getDisplayedNestedWaitSeconds(key) {
  const live = computeRemainingSeconds(state.nestedWaitDeadlines?.[key]);
  if (live != null) return live;
  const stored = Number(state.nestedWaitCountdowns?.[key]);
  return Number.isFinite(stored) ? Math.max(0, stored) : null;
}

function buildGroupExecLabel(index, fallbackLabel) {
  const runtime = getGroupExecState(index);
  if (!runtime) return fallbackLabel;
  const total = Number(runtime.total) || 0;
  const current = Math.max(0, Math.min(Number(runtime.current) || 0, total || 0));
  const prefix = runtime.status === "error"
    ? "Error"
    : (runtime.status === "success" ? "Complete" : (runtime.status === "pending" ? "Pending" : "Running"));
  return total > 0 ? `${prefix} ${current}/${total}` : prefix;
}

function createGroupExecRuntime(index) {
  const runtime = getGroupExecState(index);
  if (!runtime) return null;
  const wrap = document.createElement("div");
  wrap.className = "group-runtime";

  const title = document.createElement("div");
  title.className = "group-runtime-title";
  title.textContent = runtime.groupName ? `Group: ${runtime.groupName}` : "Group runtime";
  wrap.appendChild(title);

  const list = document.createElement("div");
  list.className = "group-runtime-list";
  (Array.isArray(runtime.items) ? runtime.items : []).forEach((item) => {
    const row = document.createElement("div");
    row.className = "group-runtime-item";
    const status = RUN_STATUS_META[item?.status] || RUN_STATUS_META.idle;
    const dot = document.createElement("span");
    dot.className = `group-runtime-dot ${status.className}`;
    dot.textContent = status.icon;
    const label = document.createElement("span");
    label.className = "group-runtime-item-label";
    label.textContent = item?.label || "Step";
    const action = document.createElement("button");
    action.type = "button";
    action.className = "icon group-runtime-jump";
    action.title = "Go to node";
    action.textContent = "↗";
    action.addEventListener("click", () => {
      if (!runtime.groupId || !Number.isFinite(Number(item?.index))) return;
      state.selectedGroupId = runtime.groupId;
      queueGroupStepJump(runtime.groupId, Number(item.index));
      state.activeTab = "groups";
      selectTab("groups");
      render();
    });
    row.appendChild(dot);
    row.appendChild(label);
    row.appendChild(action);
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

function createInlineAddSlot(position) {
  const slot = document.createElement('div');
  slot.className = 'inline-add-slot';
  slot.dataset.insertIndex = String(position);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'inline-add-btn';
  btn.textContent = '＋ Add Step';
  btn.addEventListener('click', () => {
    if (!insertStepAt(position)) return;
    render();
    setDirty(true);
  });
  slot.appendChild(btn);
  return slot;
}

function createStepCard(step, index) {
  const template = els.stepTemplate;
  const schema = STEP_LIBRARY_MAP.get(step.type) || STEP_LIBRARY[0];
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector(".step-card");
  card.dataset.stepIndex = String(index);
  const title = card.querySelector(".step-title");
  const typeSelect = card.querySelector(".step-type");
  const fieldsContainer = card.querySelector(".step-fields");
  // status chip (now in its own row)
  const chip = card.querySelector(".step-status .status-chip");
  const chipIcon = card.querySelector(".chip-icon");
  const chipLabel = card.querySelector(".chip-label");

  title.textContent = `Step ${index + 1} — ${schema?.label || step.type}`;

  // set status
  const st = RUN_STATUS_META[getDisplayedStepStatus(index)] || RUN_STATUS_META.idle;
  chipIcon.textContent = st.icon;
  let label = st.label;
  if (schema.type === 'If') {
    const res = state.ifResults[index];
    if (res) label = `${label} (${res === 'then' ? 'Then' : 'Else'})`;
  }
  if (schema.type === "GroupExecuter") {
    label = buildGroupExecLabel(index, label);
  }
  if (schema.type === 'Wait' && (getDisplayedStepStatus(index) === 'running')) {
    const sec = getDisplayedWaitSeconds(index);
    if (Number.isFinite(sec)) label = `Running — ${sec}s`;
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
    const action = btn.dataset.action;
    btn.disabled = Boolean(state.pendingPicker) || (isEditingGroup() && action === "run");
    btn.addEventListener("click", () => {
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

  buildFields(fieldsContainer, schema, step, index, { path: [index] });

  if (schema.type === "If") {
    renderIfBranches(fieldsContainer, step, index);
  }

  if (schema.type === "GroupExecuter") {
    const runtime = createGroupExecRuntime(index);
    if (runtime) {
      card.appendChild(runtime);
    }
  }

  setupStepCardDnD(card, [index]);
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
    const prepChild = (child) => {
      const s = STEP_LIBRARY_MAP.get(child.type);
      if (!s) return null;
      const c = { type: child.type };
      s.fields.forEach((f) => {
        const v = child[f.key];
        if (v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')) {
          c[f.key] = f.type === 'number' ? Number(v) : (typeof v === 'string' ? v.trim() : v);
        }
      });
      if (child.type === 'Click' && child.forceClick !== undefined) c.forceClick = Boolean(child.forceClick);
      if (child.type === 'If') {
        c.then = (Array.isArray(child.then) ? child.then : []).map(prepChild).filter(Boolean);
        c.else = (Array.isArray(child.else) ? child.else : []).map(prepChild).filter(Boolean);
      }
      return c;
    };
    prepared.then = (Array.isArray(state.steps[index]?.then) ? state.steps[index].then : []).map(prepChild).filter(Boolean);
    prepared.else = (Array.isArray(state.steps[index]?.else) ? state.steps[index].else : []).map(prepChild).filter(Boolean);
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
    const res = await chrome.runtime.sendMessage({
      type: "RUN_SINGLE_STEP",
      tabId: tab.id,
      step: prepared,
      index,
      groups: deepClone(state.groups)
    });
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

function buildFields(container, schema, step, stepIndex, ctx = {}) {
  container.innerHTML = "";
  if (!schema) return;
  const ifTextRefs = schema.type === 'If' ? { modeWrap: null, valueWrap: null, valueInput: null, caseWrap: null } : null;
  const applyIfTextVisibility = () => {
    if (!ifTextRefs) return;
    const isTextMode = (step.mode || 'exists') === 'text';
    if (isTextMode && (!step.textMatch || step.textMatch === 'any')) {
      step.textMatch = 'contains';
    }
    const match = typeof step.textMatch === 'string' ? step.textMatch : 'any';
    const needsValue = isTextMode && !['any', 'empty', 'notEmpty'].includes(match);

    if (ifTextRefs.modeWrap) ifTextRefs.modeWrap.style.display = isTextMode ? '' : 'none';
    if (ifTextRefs.caseWrap) ifTextRefs.caseWrap.style.display = isTextMode ? '' : 'none';
    if (ifTextRefs.valueWrap) ifTextRefs.valueWrap.style.display = needsValue ? '' : 'none';
    if (ifTextRefs.valueInput) {
      ifTextRefs.valueInput.required = needsValue;
      if (!needsValue && typeof ifTextRefs.valueInput.setCustomValidity === 'function') {
        ifTextRefs.valueInput.setCustomValidity('');
      }
      if (!needsValue && ifTextRefs.valueInput.value !== '') {
        ifTextRefs.valueInput.value = '';
      }
    }

    if (!needsValue) {
      step.textValue = '';
    }
    if (!isTextMode) {
      step.textCaseSensitive = false;
      step.textMatch = 'any';
      step.textValue = '';
    }
  };

  schema.fields.forEach((field) => {
    if (schema.type === "GroupExecuter" && field.key === "groupId" && !state.groups.length) {
      step.groupId = "";
    }
    // Dynamic options for Restart.ifIndex and mode-dependent visibility
    if (schema.type === 'Restart' && field.key === 'ifIndex') {
      const path = Array.isArray(ctx?.path) ? ctx.path.slice() : [stepIndex];
      const ancestors = collectAncestorIfs(path);
      const wrap = document.createElement('div'); wrap.className = 'field';
      const label = document.createElement('label'); wrap.appendChild(label);

      const applyVis = () => {
        const m = (step.mode || 'flow');
        wrap.style.display = m === 'if' ? '' : 'none';
      };

      const ensureValue = (val) => {
        if (step[field.key] !== val) {
          step[field.key] = val;
        }
      };

      if (ancestors.length > 0) {
        label.textContent = 'If node';
        const current = Number(step[field.key]);
        if (!Number.isFinite(current) || current >= 0 || Math.abs(current) > ancestors.length) {
          ensureValue(-ancestors[0].depth);
        }
        if (ancestors.length === 1) {
          const info = document.createElement('div');
          info.className = 'info-text';
          info.textContent = ancestors[0].label;
          info.style.fontSize = '13px';
          info.style.color = 'var(--text-light)';
          wrap.appendChild(info);
        } else {
          const sel = document.createElement('select');
          ancestors.forEach((opt) => {
            const option = document.createElement('option');
            option.value = String(-opt.depth);
            option.textContent = opt.label;
            sel.appendChild(option);
          });
          sel.value = String(step[field.key]);
          sel.addEventListener('change', (e) => {
            const val = Number(e.target.value);
            updateFieldValue(stepIndex, field, val);
            setDirty(true, { silent: true });
          });
          wrap.appendChild(sel);
        }
      } else {
        label.textContent = field.label;
        const sel = document.createElement('select');
        const list = listTopLevelIfs();
        if (list.length === 0) {
          const o = document.createElement('option'); o.value = ''; o.textContent = '(no If steps found)'; sel.appendChild(o); sel.disabled = true;
        } else {
          list.forEach((opt) => {
            const option = document.createElement('option');
            option.value = String(opt.value);
            option.textContent = opt.label;
            sel.appendChild(option);
          });
          const existing = step[field.key];
          if (existing === undefined || existing === null || existing === '') {
            step[field.key] = list[0].value;
            sel.value = String(list[0].value);
          } else {
            sel.value = String(existing);
          }
          sel.addEventListener('change', (e) => {
            const val = Number(e.target.value);
            updateFieldValue(stepIndex, field, val);
            setDirty(true, { silent: true });
          });
        }
        wrap.appendChild(sel);
      }

      applyVis();
      container.appendChild(wrap);
      return;
    }
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
    if (schema.type === "KeyPress") {
      if (field.key === "keys") {
        const editor = buildKeyPressEditor({
          stepGetter: () => state.steps[stepIndex] || null,
          requestRender: () => render()
        });
        container.appendChild(editor);
        return;
      }
      if (["repeat", "repeatDelayMs", "keyDelayMs", "holdMs"].includes(field.key)) return;
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
      const selectOptions = schema.type === "GroupExecuter" && field.key === "groupId"
        ? buildGroupOptions({ includePlaceholder: true })
        : (field.options || []);
      selectOptions.forEach((opt) => {
        const option = document.createElement("option");
        option.value = String(opt.value);
        option.textContent = String(opt.label ?? opt.value);
        input.appendChild(option);
      });
      if (schema.type === "GroupExecuter" && field.key === "groupId" && !state.groups.length) {
        input.disabled = true;
      }
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
      } else if (schema.type === "GroupExecuter" && field.key === "groupId" && state.groups[0]) {
        input.value = state.groups[0].id;
        step.groupId = state.groups[0].id;
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
        if (schema.type === 'If' && field.key === 'mode') {
          if (rawValue === 'text') {
            if (!step.textMatch || step.textMatch === 'any') step.textMatch = 'contains';
          } else {
            step.textMatch = 'any';
            step.textValue = '';
            step.textCaseSensitive = false;
          }
          render();
          return;
        }
        // If changing Restart mode, re-render to show If select
        if (schema.type === 'Restart' && field.key === 'mode') {
          render();
        }
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
      row.appendChild(createSelectorPingButton(input));
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
    if (ifTextRefs) {
      if (field.key === 'textMatch') {
        ifTextRefs.modeInput = input;
        ifTextRefs.modeWrap = fieldWrapper;
        input.addEventListener('change', applyIfTextVisibility);
      } else if (field.key === 'textValue') {
        ifTextRefs.valueWrap = fieldWrapper;
        ifTextRefs.valueInput = input;
      } else if (field.key === 'textCaseSensitive') {
        ifTextRefs.caseWrap = fieldWrapper;
      }
    }
  });
  applyIfTextVisibility();
}

function renderIfBranches(container, step, stepIndex) {
  const makeBranch = (key, labelText) => {
    const section = document.createElement("div");
    section.className = "field";
    const label = document.createElement("label");
    label.textContent = labelText;
    section.appendChild(label);

    const list = document.createElement("div");
    list.className = "flows branch-list";
    markListDroppable(list, [stepIndex], key);
    section.appendChild(list);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    const add = document.createElement("button");
    add.className = 'wide-add';
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
  const key = [parentIndex, branchKey, childIndex].map(String).join('|');
  const stName = getDisplayedNestedStatus(key, schema.type);
  const meta = RUN_STATUS_META[stName] || RUN_STATUS_META.idle;
  chipIcon.textContent = meta.icon;
  let label = meta.label;
  if (schema.type === 'Wait' && stName === 'running') {
    const sec = getDisplayedNestedWaitSeconds(key);
    if (Number.isFinite(sec)) label = `Running — ${sec}s`;
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

  buildFieldsNested(fieldsContainer, schema, step, { parentIndex, branchKey, childIndex, path: [parentIndex, branchKey, childIndex] });
  setupStepCardDnD(card, [parentIndex, branchKey, childIndex]);
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
  const stepPath = Array.isArray(ctx.path) ? ctx.path.slice() : [ctx.parentIndex, ctx.branchKey, ctx.childIndex];
  const ifTextRefs = schema.type === 'If' ? { modeWrap: null, valueWrap: null, valueInput: null, caseWrap: null } : null;
  const applyIfTextVisibility = () => {
    if (!ifTextRefs) return;
    const current = stepRef() || step;
    const isTextMode = (current?.mode || 'exists') === 'text';
    if (isTextMode && current && (!current.textMatch || current.textMatch === 'any')) {
      current.textMatch = 'contains';
    }
    const match = typeof current?.textMatch === 'string' ? current.textMatch : 'any';
    const needsValue = isTextMode && !['any', 'empty', 'notEmpty'].includes(match);

    if (ifTextRefs.modeWrap) ifTextRefs.modeWrap.style.display = isTextMode ? '' : 'none';
    if (ifTextRefs.caseWrap) ifTextRefs.caseWrap.style.display = isTextMode ? '' : 'none';
    if (ifTextRefs.valueWrap) ifTextRefs.valueWrap.style.display = needsValue ? '' : 'none';
    if (ifTextRefs.valueInput) {
      ifTextRefs.valueInput.required = needsValue;
      if (!needsValue && typeof ifTextRefs.valueInput.setCustomValidity === 'function') {
        ifTextRefs.valueInput.setCustomValidity('');
      }
      if (!needsValue && ifTextRefs.valueInput.value !== '') {
        ifTextRefs.valueInput.value = '';
      }
    }
    if (current) {
      if (!needsValue) current.textValue = '';
      if (!isTextMode) {
        current.textCaseSensitive = false;
        current.textMatch = 'any';
        current.textValue = '';
      }
    }
  };

  schema.fields.forEach((field) => {
    if (schema.type === 'Restart' && field.key === 'ifIndex') {
      const ancestors = collectAncestorIfs(stepPath);
      const wrap = document.createElement('div'); wrap.className = 'field';
      const label = document.createElement('label'); wrap.appendChild(label);

      const applyVis = () => {
        const m = (step.mode || 'flow');
        wrap.style.display = m === 'if' ? '' : 'none';
      };

      const ensureValue = (val) => {
        if (step[field.key] !== val) {
          step[field.key] = val;
        }
      };

      if (ancestors.length > 0) {
        label.textContent = 'If node';
        const current = Number(step[field.key]);
        if (!Number.isFinite(current) || current >= 0 || Math.abs(current) > ancestors.length) {
          ensureValue(-ancestors[0].depth);
        }
        if (ancestors.length === 1) {
          const info = document.createElement('div');
          info.className = 'info-text';
          info.textContent = ancestors[0].label;
          info.style.fontSize = '13px';
          info.style.color = 'var(--text-light)';
          wrap.appendChild(info);
        } else {
          const sel = document.createElement('select');
          ancestors.forEach((opt) => {
            const option = document.createElement('option');
            option.value = String(-opt.depth);
            option.textContent = opt.label;
            sel.appendChild(option);
          });
          sel.value = String(step[field.key]);
          sel.addEventListener('change', (e) => {
            const val = Number(e.target.value);
            updateNestedFieldValue(ctx.parentIndex, ctx.branchKey, ctx.childIndex, field, val);
            setDirty(true, { silent: true });
          });
          wrap.appendChild(sel);
        }
      } else {
        label.textContent = field.label;
        const sel = document.createElement('select');
        const list = listTopLevelIfs();
        if (list.length === 0) {
          const o = document.createElement('option'); o.value = ''; o.textContent = '(no If steps found)'; sel.appendChild(o); sel.disabled = true;
        } else {
          list.forEach((opt) => {
            const option = document.createElement('option');
            option.value = String(opt.value);
            option.textContent = opt.label;
            sel.appendChild(option);
          });
          const existing = step[field.key];
          if (existing === undefined || existing === null || existing === '') {
            step[field.key] = list[0].value;
            sel.value = String(list[0].value);
          } else {
            sel.value = String(existing);
          }
          sel.addEventListener('change', (e) => {
            const val = Number(e.target.value);
            updateNestedFieldValue(ctx.parentIndex, ctx.branchKey, ctx.childIndex, field, val);
            setDirty(true, { silent: true });
          });
        }
        wrap.appendChild(sel);
      }

      applyVis();
      container.appendChild(wrap);
      return;
    }
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
    if (schema.type === "KeyPress") {
      if (field.key === "keys") {
        const editor = buildKeyPressEditor({
          stepGetter: stepRef,
          requestRender: () => render()
        });
        container.appendChild(editor);
        return;
      }
      if (["repeat", "repeatDelayMs", "keyDelayMs", "holdMs"].includes(field.key)) return;
    }

    // Hide FillText's built-in toggles (custom UI renders these)
    if (schema.type === "FillText" && (field.key === "splitAcrossInputs" || field.key === "slowType" || field.key === "slowTypeDelayMs")) {
      return;
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
    else if (field.type === "select") {
      input = document.createElement("select");
      const selectOptions = schema.type === "GroupExecuter" && field.key === "groupId"
        ? buildGroupOptions({ includePlaceholder: true })
        : (field.options || []);
      selectOptions.forEach((opt) => {
        const option = document.createElement("option");
        option.value = String(opt.value);
        option.textContent = String(opt.label ?? opt.value);
        input.appendChild(option);
      });
      if (schema.type === "GroupExecuter" && field.key === "groupId" && !state.groups.length) {
        input.disabled = true;
      }
    }
    else if (field.type === "checkbox") { input = document.createElement("input"); input.type = "checkbox"; }
    else if (field.type === "filelist") { input = document.createElement("div"); input.textContent = "Unsupported field type"; }
    else { input = document.createElement("input"); input.type = field.type === "number" ? "number" : field.type === "url" ? "url" : "text"; }
    input.placeholder = field.placeholder || "";
    if (field.type === "number") { if (typeof field.min !== "undefined") input.min = String(field.min); if (typeof field.max !== "undefined") input.max = String(field.max); if (typeof field.step !== "undefined") input.step = String(field.step); }
    const existing = step[field.key];
    if (field.type === "checkbox") { if (existing !== undefined && existing !== null) input.checked = Boolean(existing); else if (field.default !== undefined) input.checked = Boolean(field.default); }
    else if (field.type === "select") {
      if (existing !== undefined && existing !== null) input.value = String(existing);
      else if (field.default !== undefined) input.value = String(field.default);
      else if (schema.type === "GroupExecuter" && field.key === "groupId" && state.groups[0]) input.value = state.groups[0].id;
    }
    else { if (existing !== undefined && existing !== null) input.value = String(existing); else if (field.default !== undefined) input.value = String(field.default); }
    if (field.type === "checkbox") { input.addEventListener("change", (e) => { setDirty(true, { silent: true }); updateNestedFieldValue(ctx.parentIndex, ctx.branchKey, ctx.childIndex, field, Boolean(e.target.checked)); }); }
    else if (field.type === "select") {
      input.addEventListener("change", (e) => {
        const val = e.target.value;
        setDirty(true, { silent: true });
        updateNestedFieldValue(ctx.parentIndex, ctx.branchKey, ctx.childIndex, field, val);
        if (schema.type === 'If' && field.key === 'mode') {
          const target = stepRef();
          if (target) {
            if (val === 'text') {
              if (!target.textMatch || target.textMatch === 'any') target.textMatch = 'contains';
            } else {
              target.textMatch = 'any';
              target.textValue = '';
              target.textCaseSensitive = false;
            }
          }
          render();
        }
      });
    }
    else { input.addEventListener("input", (e) => { setDirty(true, { silent: true }); updateNestedFieldValue(ctx.parentIndex, ctx.branchKey, ctx.childIndex, field, e.target.value); }); }

    let inputHost = input;
    if (field.supportsPicker && !(ctx && ctx.depth > 0)) {
      const row = document.createElement("div"); row.className = "input-row";
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "icon picker-btn"; btn.title = "Pick element from active tab"; btn.textContent = "🎯";
      const isActive = isPickerContext(undefined, field.key, ctx);
      btn.classList.toggle("active", isActive);
      btn.disabled = Boolean(state.pendingPicker) && !isActive;
      btn.addEventListener("click", () => { requestSelectorPick({ stepIndex: undefined, field, ctx }); });
      row.appendChild(input); row.appendChild(createSelectorPingButton(input)); row.appendChild(btn);

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
    if (ifTextRefs) {
      if (field.key === 'textMatch') {
        ifTextRefs.modeInput = input;
        ifTextRefs.modeWrap = fieldWrapper;
        input.addEventListener('change', applyIfTextVisibility);
      } else if (field.key === 'textValue') {
        ifTextRefs.valueWrap = fieldWrapper;
        ifTextRefs.valueInput = input;
      } else if (field.key === 'textCaseSensitive') {
        ifTextRefs.caseWrap = fieldWrapper;
      }
    }
  });
  applyIfTextVisibility();

  // If this nested step is an If, render its Then/Else branches as deep-nested lists
  if (schema.type === 'If') {
    const host = document.createElement('div');
    host.style.display = 'grid';
    host.style.gap = '8px';
    container.appendChild(host);
    const basePath = Array.isArray(ctx.path) ? ctx.path.slice() : [ctx.parentIndex, ctx.branchKey, ctx.childIndex];
    renderIfBranchesDeep(host, { ...ctx, path: basePath });
  }
}

function renderIfBranchesDeep(container, ctx) {
  const stepRef = () => {
    if (Array.isArray(ctx.path)) {
      const s = getStepAtPath(ctx.path);
      return s || null;
    }
    const p = state.steps[ctx.parentIndex];
    if (!p) return null;
    const arr = Array.isArray(p[ctx.branchKey]) ? p[ctx.branchKey] : [];
    return arr[ctx.childIndex] || null; // fallback: direct nested If
  };

  const makeBranch = (key, labelText) => {
    const section = document.createElement('div');
    section.className = 'field';
    const label = document.createElement('label'); label.textContent = labelText; section.appendChild(label);
    const list = document.createElement('div'); list.className = 'flows branch-list';
    const hostPath = Array.isArray(ctx.path) ? ctx.path.slice() : [ctx.parentIndex, ctx.branchKey, ctx.childIndex];
    markListDroppable(list, hostPath, key);
    section.appendChild(list);
    const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.gap = '8px';
    const add = document.createElement('button'); add.type = 'button'; add.textContent = '＋ Add Step'; add.className = 'wide-add';
    add.addEventListener('click', () => {
      const st = stepRef(); if (!st) return;
      const arr = Array.isArray(st[key]) ? st[key] : [];
      const defType = STEP_LIBRARY[0].type;
      const schema = STEP_LIBRARY_MAP.get(defType) || STEP_LIBRARY[0];
      const s = createStepFromSchema(schema);
      arr.push(s);
      st[key] = arr;
      setDirty(true, { silent: true });
      render();
    });
    actions.appendChild(add); section.appendChild(actions);

    const st = stepRef();
    const branch = Array.isArray(st?.[key]) ? st[key] : [];
    branch.forEach((child, idx) => {
      const card = createDeepNestedStepCard(ctx, key, idx, child, labelText);
      list.appendChild(card);
    });
    return section;
  };

  container.appendChild(makeBranch('then', 'Then'));
  container.appendChild(makeBranch('else', 'Else'));
}

function getStepAtPath(path) {
  try {
    if (!Array.isArray(path) || path.length < 3) return null;
    const top = Number(path[0]);
    let cur = state.steps[top];
    for (let i = 1; i < path.length; i += 2) {
      const key = path[i];
      const idx = path[i + 1];
      if (!cur || (key !== 'then' && key !== 'else')) return null;
      const arr = Array.isArray(cur[key]) ? cur[key] : [];
      cur = arr[idx];
      if (!cur) return null;
    }
    return cur;
  } catch { return null; }
}

function createDeepNestedStepCard(parentCtx, nestedKey, childIndex, step, branchLabel) {
  const template = els.stepTemplate;
  const schema = STEP_LIBRARY_MAP.get(step.type) || STEP_LIBRARY[0];
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector('.step-card');
  const title = card.querySelector('.step-title');
  const typeSelect = card.querySelector('.step-type');
  const fieldsContainer = card.querySelector('.step-fields');
  // status chip for deep-nested with path-based status
  const chip = card.querySelector('.step-status .status-chip');
  const chipIcon = card.querySelector('.chip-icon');
  const chipLabel = card.querySelector('.chip-label');
  const key = [...(Array.isArray(parentCtx.path) ? parentCtx.path : [parentCtx.parentIndex, parentCtx.branchKey, parentCtx.childIndex]), nestedKey, childIndex].map(String).join('|');
  const stName = getDisplayedNestedStatus(key, schema.type);
  const meta = RUN_STATUS_META[stName] || RUN_STATUS_META.idle;
  chipIcon.textContent = meta.icon;
  let label = meta.label;
  if (schema.type === 'Wait' && stName === 'running') {
    const sec = getDisplayedNestedWaitSeconds(key);
    if (Number.isFinite(sec)) label = `Running — ${sec}s`;
  }
  chipLabel.textContent = label;
  chip.className = `status-chip ${meta.className}`;

  title.textContent = `${branchLabel} ${childIndex + 1} — ${schema?.label || step.type}`;

  STEP_LIBRARY.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.type; option.textContent = item.label; option.selected = item.type === step.type;
    typeSelect.appendChild(option);
  });
  typeSelect.addEventListener('change', (e) => {
    updateDeepNestedStepType(parentCtx, nestedKey, childIndex, e.target.value);
    render(); setDirty(true);
  });

  const actions = card.querySelectorAll('.step-actions [data-action]');
  actions.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      if (action === 'delete') deleteDeepNestedStep(parentCtx, nestedKey, childIndex);
      else if (action === 'up') moveDeepNestedStep(parentCtx, nestedKey, childIndex, -1);
      else if (action === 'down') moveDeepNestedStep(parentCtx, nestedKey, childIndex, +1);
      else if (action === 'run') await runDeepNestedStep(parentCtx, nestedKey, childIndex);
    });
  });

  buildFieldsDeep(fieldsContainer, schema, step, parentCtx, nestedKey, childIndex);
  const basePath = Array.isArray(parentCtx.path) ? parentCtx.path.slice() : [parentCtx.parentIndex, parentCtx.branchKey, parentCtx.childIndex];
  const path = [...basePath, nestedKey, childIndex];
  setupStepCardDnD(card, path);
  return card;
}

function buildFieldsDeep(container, schema, step, parentCtx, nestedKey, childIndex) {
  container.innerHTML = '';
  const pathBase = Array.isArray(parentCtx.path)
    ? parentCtx.path.slice()
    : (typeof parentCtx.parentIndex === 'number'
      ? [parentCtx.parentIndex, parentCtx.branchKey, parentCtx.childIndex]
      : null);
  const deepPath = Array.isArray(pathBase) ? [...pathBase, nestedKey, childIndex] : null;
  const pickerCtx = deepPath ? { path: deepPath } : null;
  const stepPath = Array.isArray(deepPath) ? deepPath.slice() : [];
  const ifTextRefs = schema.type === 'If' ? { modeWrap: null, valueWrap: null, valueInput: null, caseWrap: null } : null;
  const applyIfTextVisibility = () => {
    if (!ifTextRefs) return;
    const isTextMode = (step.mode || 'exists') === 'text';
    if (isTextMode && (!step.textMatch || step.textMatch === 'any')) {
      step.textMatch = 'contains';
    }
    const match = typeof step.textMatch === 'string' ? step.textMatch : 'any';
    const needsValue = isTextMode && !['any', 'empty', 'notEmpty'].includes(match);

    if (ifTextRefs.modeWrap) ifTextRefs.modeWrap.style.display = isTextMode ? '' : 'none';
    if (ifTextRefs.caseWrap) ifTextRefs.caseWrap.style.display = isTextMode ? '' : 'none';
    if (ifTextRefs.valueWrap) ifTextRefs.valueWrap.style.display = needsValue ? '' : 'none';
    if (ifTextRefs.valueInput) {
      ifTextRefs.valueInput.required = needsValue;
      if (!needsValue && typeof ifTextRefs.valueInput.setCustomValidity === 'function') {
        ifTextRefs.valueInput.setCustomValidity('');
      }
      if (!needsValue && ifTextRefs.valueInput.value !== '') {
        ifTextRefs.valueInput.value = '';
      }
    }

    if (!needsValue) step.textValue = '';
    if (!isTextMode && step.textCaseSensitive) {
      step.textCaseSensitive = false;
      step.textMatch = 'any';
      step.textValue = '';
    }
  };
  schema.fields.forEach((field) => {
    if (schema.type === 'Restart' && field.key === 'ifIndex') {
      const ancestors = collectAncestorIfs(stepPath);
      const wrap = document.createElement('div'); wrap.className = 'field';
      const label = document.createElement('label'); wrap.appendChild(label);

      const applyVis = () => {
        const m = (step.mode || 'flow');
        wrap.style.display = m === 'if' ? '' : 'none';
      };

      const ensureValue = (val) => {
        if (step[field.key] !== val) step[field.key] = val;
      };

      if (ancestors.length > 0) {
        label.textContent = 'If node';
        const current = Number(step[field.key]);
        if (!Number.isFinite(current) || current >= 0 || Math.abs(current) > ancestors.length) {
          ensureValue(-ancestors[0].depth);
        }
        if (ancestors.length === 1) {
          const info = document.createElement('div'); info.className = 'info-text'; info.textContent = ancestors[0].label; info.style.fontSize = '13px'; info.style.color = 'var(--text-light)'; wrap.appendChild(info);
        } else {
          const sel = document.createElement('select');
          ancestors.forEach((opt) => {
            const option = document.createElement('option'); option.value = String(-opt.depth); option.textContent = opt.label; sel.appendChild(option);
          });
          sel.value = String(step[field.key]);
          sel.addEventListener('change', (e) => {
            const val = Number(e.target.value);
            updateDeepNestedFieldValue(parentCtx, nestedKey, childIndex, field, val);
            setDirty(true, { silent: true });
          });
          wrap.appendChild(sel);
        }
      } else {
        label.textContent = field.label;
        const sel = document.createElement('select');
        const list = listTopLevelIfs();
        if (list.length === 0) {
          const o = document.createElement('option'); o.value = ''; o.textContent = '(no If steps found)'; sel.appendChild(o); sel.disabled = true;
        } else {
          list.forEach((opt) => {
            const option = document.createElement('option'); option.value = String(opt.value); option.textContent = opt.label; sel.appendChild(option);
          });
          const existing = step[field.key];
          if (existing === undefined || existing === null || existing === '') {
            step[field.key] = list[0].value;
            sel.value = String(list[0].value);
          } else {
            sel.value = String(existing);
          }
          sel.addEventListener('change', (e) => {
            const val = Number(e.target.value);
            updateDeepNestedFieldValue(parentCtx, nestedKey, childIndex, field, val);
            setDirty(true, { silent: true });
          });
        }
        wrap.appendChild(sel);
      }

      applyVis();
      container.appendChild(wrap);
      return;
    }
    // Hide FillText toggles duplicated by custom UI
    if (schema.type === 'FillText' && (field.key === 'splitAcrossInputs' || field.key === 'slowType' || field.key === 'slowTypeDelayMs')) {
      return;
    }
    if (schema.type === 'KeyPress') {
      if (field.key === 'keys') {
        const editor = buildKeyPressEditor({
          stepGetter: () => getDeepNestedStep(parentCtx, nestedKey, childIndex),
          requestRender: () => render()
        });
        container.appendChild(editor);
        return;
      }
      if (['repeat', 'repeatDelayMs', 'keyDelayMs', 'holdMs'].includes(field.key)) {
        return;
      }
    }

    // For deep nested, keep it simple (no picker)
    const wrap = document.createElement('div'); wrap.className = 'field';
    const label = document.createElement('label'); label.textContent = field.label; wrap.appendChild(label);

    // Special FillText extras
    if (schema.type === 'FillText' && field.key === 'value') {
      const inputSection = document.createElement('div'); inputSection.className = 'field';
      const secLabel = document.createElement('label'); secLabel.textContent = 'Input';
      const row = document.createElement('div'); row.className = 'input-row'; row.style.justifyContent = 'flex-start'; row.style.gap = '8px';
      const splitBtn = document.createElement('button'); splitBtn.type = 'button'; splitBtn.className = 'toggle'; splitBtn.title = 'Split across multiple inputs (OTP)'; splitBtn.textContent = '🔢';
      const applySplitState = () => { const st = getDeepNestedStep(parentCtx, nestedKey, childIndex); const active = Boolean(st?.splitAcrossInputs); splitBtn.classList.toggle('active', active); };
      applySplitState();
      splitBtn.addEventListener('click', () => { const st = getDeepNestedStep(parentCtx, nestedKey, childIndex); st.splitAcrossInputs = !Boolean(st?.splitAcrossInputs); applySplitState(); setDirty(true, { silent: true }); });
      row.appendChild(splitBtn);
      const slowBtn = document.createElement('button'); slowBtn.type = 'button'; slowBtn.className = 'toggle'; slowBtn.title = 'Slow typing'; slowBtn.textContent = '🐢';
      const delayInput = document.createElement('input'); delayInput.type = 'number'; delayInput.min = '0'; delayInput.step = '10'; delayInput.placeholder = '100'; delayInput.style.marginLeft = '8px';
      const applySlowState = () => { const st = getDeepNestedStep(parentCtx, nestedKey, childIndex); const active = Boolean(st?.slowType); slowBtn.classList.toggle('active', active); delayInput.style.display = active ? '' : 'none'; const cur = st?.slowTypeDelayMs; delayInput.value = String(Number.isFinite(cur) ? cur : 100); };
      applySlowState();
      slowBtn.addEventListener('click', () => { const st = getDeepNestedStep(parentCtx, nestedKey, childIndex); st.slowType = !Boolean(st?.slowType); applySlowState(); setDirty(true, { silent: true }); });
      delayInput.addEventListener('input', (e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) { const st = getDeepNestedStep(parentCtx, nestedKey, childIndex); st.slowTypeDelayMs = v; setDirty(true, { silent: true }); } });
      row.appendChild(slowBtn);
      row.appendChild(delayInput);
      inputSection.appendChild(secLabel); inputSection.appendChild(row); container.appendChild(inputSection);
    }

    let input;
    if (field.type === 'textarea') input = document.createElement('textarea');
    else if (field.type === 'select') { input = document.createElement('select'); (field.options || []).forEach((opt) => { const o = document.createElement('option'); o.value = String(opt.value); o.textContent = String(opt.label ?? opt.value); input.appendChild(o); }); }
    else if (field.type === 'checkbox') { input = document.createElement('input'); input.type = 'checkbox'; }
    else if (field.type === 'filelist') { input = document.createElement('div'); input.textContent = 'Unsupported field type'; }
    else { input = document.createElement('input'); input.type = field.type === 'number' ? 'number' : (field.type === 'url' ? 'url' : 'text'); }
    input.placeholder = field.placeholder || '';
    if (field.type === 'number') { if (typeof field.min !== 'undefined') input.min = String(field.min); if (typeof field.max !== 'undefined') input.max = String(field.max); if (typeof field.step !== 'undefined') input.step = String(field.step); }
    const existing = step[field.key];
    if (field.type === 'checkbox') { if (existing !== undefined && existing !== null) input.checked = Boolean(existing); else if (field.default !== undefined) input.checked = Boolean(field.default); }
    else if (field.type === 'select') { if (existing !== undefined && existing !== null) input.value = String(existing); else if (field.default !== undefined) input.value = String(field.default); }
    else { if (existing !== undefined && existing !== null) input.value = String(existing); else if (field.default !== undefined) input.value = String(field.default); }
    if (field.type === 'checkbox') {
      input.addEventListener('change', (e) => { setDirty(true, { silent: true }); updateDeepNestedFieldValue(parentCtx, nestedKey, childIndex, field, Boolean(e.target.checked)); });
    } else if (field.type === 'select') {
      input.addEventListener('change', (e) => {
        const val = e.target.value;
        setDirty(true, { silent: true });
        updateDeepNestedFieldValue(parentCtx, nestedKey, childIndex, field, val);
        if (schema.type === 'If' && field.key === 'mode') {
          if (val === 'text') {
            if (!step.textMatch || step.textMatch === 'any') step.textMatch = 'contains';
          } else {
            step.textMatch = 'any';
            step.textValue = '';
            step.textCaseSensitive = false;
          }
          render();
        }
      });
    } else {
      input.addEventListener('input', (e) => { setDirty(true, { silent: true }); updateDeepNestedFieldValue(parentCtx, nestedKey, childIndex, field, e.target.value); });
    }

    let inputHost = input;
    if (field.supportsPicker && pickerCtx) {
      const row = document.createElement('div'); row.className = 'input-row';
      row.appendChild(input);
      row.appendChild(createSelectorPingButton(input));
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'icon picker-btn'; btn.title = 'Pick element from active tab'; btn.textContent = '🎯';
      const isActive = isPickerContext(undefined, field.key, pickerCtx);
      btn.classList.toggle('active', isActive);
      btn.disabled = Boolean(state.pendingPicker) && !isActive;
      btn.addEventListener('click', () => { requestSelectorPick({ stepIndex: undefined, field, ctx: pickerCtx }); });
      row.appendChild(btn);

      const targetStep = getDeepNestedStep(parentCtx, nestedKey, childIndex);
      const isClickSelector = targetStep?.type === 'Click' && field.key === 'selector';
      if (isClickSelector) {
        const forceBtn = document.createElement('button'); forceBtn.type = 'button'; forceBtn.className = 'toggle'; forceBtn.title = 'Force'; forceBtn.setAttribute('aria-label', 'Force click (native)'); forceBtn.textContent = '⚡';
        const applyForceState = () => { const st = getDeepNestedStep(parentCtx, nestedKey, childIndex); const active = Boolean(st?.forceClick); forceBtn.classList.toggle('active', active); forceBtn.setAttribute('aria-pressed', String(active)); };
        applyForceState();
        forceBtn.addEventListener('click', () => { const st = getDeepNestedStep(parentCtx, nestedKey, childIndex); st.forceClick = !Boolean(st?.forceClick); applyForceState(); setDirty(true, { silent: true }); });
        row.appendChild(forceBtn);
      }

      inputHost = row;
      if (isActive) wrap.classList.add('picking'); else wrap.classList.remove('picking');
    }

    wrap.appendChild(inputHost);
    container.appendChild(wrap);
    if (ifTextRefs) {
      if (field.key === 'textMatch') {
        ifTextRefs.modeInput = input;
        ifTextRefs.modeWrap = wrap;
        input.addEventListener('change', applyIfTextVisibility);
      } else if (field.key === 'textValue') {
        ifTextRefs.valueWrap = wrap;
        ifTextRefs.valueInput = input;
      } else if (field.key === 'textCaseSensitive') {
        ifTextRefs.caseWrap = wrap;
      }
    }
  });
  applyIfTextVisibility();

  // If this deep-nested step is an If, render its own Then/Else recursively
  if (schema.type === 'If') {
    const host = document.createElement('div');
    host.style.display = 'grid';
    host.style.gap = '8px';
    container.appendChild(host);
    const basePath = [...(Array.isArray(parentCtx.path) ? parentCtx.path : [parentCtx.parentIndex, parentCtx.branchKey, parentCtx.childIndex]), nestedKey, childIndex];
    renderIfBranchesDeep(host, { parentIndex: parentCtx.parentIndex, branchKey: parentCtx.branchKey, childIndex: parentCtx.childIndex, path: basePath });
  }
}

function getDeepNestedStep(parentCtx, nestedKey, childIndex) {
  const p = state.steps[parentCtx.parentIndex]; if (!p) return null;
  const arr = Array.isArray(p[parentCtx.branchKey]) ? p[parentCtx.branchKey] : [];
  const nestedIf = arr[parentCtx.childIndex]; if (!nestedIf) return null;
  const branch = Array.isArray(nestedIf[nestedKey]) ? nestedIf[nestedKey] : [];
  return branch[childIndex] || null;
}

function moveDeepNestedStep(parentCtx, nestedKey, index, delta) {
  const p = state.steps[parentCtx.parentIndex]; if (!p) return;
  const arr = Array.isArray(p[parentCtx.branchKey]) ? p[parentCtx.branchKey] : [];
  const nestedIf = arr[parentCtx.childIndex]; if (!nestedIf) return;
  const branch = Array.isArray(nestedIf[nestedKey]) ? nestedIf[nestedKey] : [];
  const ni = index + delta; if (ni < 0 || ni >= branch.length) return;
  const [s] = branch.splice(index, 1); branch.splice(ni, 0, s);
  nestedIf[nestedKey] = branch; setDirty(true, { silent: true }); render();
}
function deleteDeepNestedStep(parentCtx, nestedKey, index) {
  const p = state.steps[parentCtx.parentIndex]; if (!p) return;
  const arr = Array.isArray(p[parentCtx.branchKey]) ? p[parentCtx.branchKey] : [];
  const nestedIf = arr[parentCtx.childIndex]; if (!nestedIf) return;
  const branch = Array.isArray(nestedIf[nestedKey]) ? nestedIf[nestedKey] : [];
  branch.splice(index, 1); nestedIf[nestedKey] = branch; setDirty(true, { silent: true }); render();
}
function updateDeepNestedStepType(parentCtx, nestedKey, index, newType) {
  const p = state.steps[parentCtx.parentIndex]; if (!p) return;
  const arr = Array.isArray(p[parentCtx.branchKey]) ? p[parentCtx.branchKey] : [];
  const nestedIf = arr[parentCtx.childIndex]; if (!nestedIf) return;
  const branch = Array.isArray(nestedIf[nestedKey]) ? nestedIf[nestedKey] : [];
  const cur = branch[index] || {};
  const schema = STEP_LIBRARY_MAP.get(newType); if (!schema) return;
  const next = createStepFromSchema(schema);
  schema.fields.forEach((f) => { if (cur[f.key] !== undefined && cur[f.key] !== null) next[f.key] = cur[f.key]; });
  next.type = newType;
  branch[index] = next; nestedIf[nestedKey] = branch; setDirty(true, { silent: true }); render();
}
function updateDeepNestedFieldValue(parentCtx, nestedKey, index, field, rawValue) {
  const p = state.steps[parentCtx.parentIndex]; if (!p) return;
  const arr = Array.isArray(p[parentCtx.branchKey]) ? p[parentCtx.branchKey] : [];
  const nestedIf = arr[parentCtx.childIndex]; if (!nestedIf) return;
  const branch = Array.isArray(nestedIf[nestedKey]) ? nestedIf[nestedKey] : [];
  if (!branch[index]) return;
  branch[index][field.key] = rawValue;
}
async function runDeepNestedStep(parentCtx, nestedKey, index) {
  if (state.pendingPicker) { alert('Finish the element picker before running a step.'); return; }
  const st = getDeepNestedStep(parentCtx, nestedKey, index); if (!st) return;
  const schema = STEP_LIBRARY_MAP.get(st.type); if (!schema) { alert('Unknown step type'); return; }
  const prepared = { type: st.type };
  for (const field of schema.fields) {
    const value = st[field.key];
    const isEmpty = value == null || (typeof value === 'string' && value.trim() === '');
    if (field.required && isEmpty) { alert(`${schema.label}: ${field.label} is required.`); return; }
    if (!isEmpty) prepared[field.key] = field.type === 'number' ? Number(value) : (typeof value === 'string' ? value.trim() : value);
  }
  if (prepared.type === 'Click') prepared.forceClick = Boolean(st?.forceClick);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { alert('No active tab found.'); return; }
    const res = await chrome.runtime.sendMessage({ type: 'RUN_SINGLE_STEP', tabId: tab.id, step: prepared });
    if (!res?.ok) { alert('Step failed: ' + (res?.error || 'unknown error')); return; }
  } catch (err) {
    console.error('[options] Deep nested step run failed:', err);
    alert('Error running step: ' + err.message);
  }
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

function shiftIndexedMap(map, pivot, delta) {
  if (!map) return {};
  const next = {};
  Object.keys(map).forEach((key) => {
    const num = Number(key);
    if (Number.isFinite(num)) {
      const newKey = num >= pivot ? num + delta : num;
      next[newKey] = map[key];
    } else {
      next[key] = map[key];
    }
  });
  return next;
}

function shiftNestedMap(map, pivot, delta) {
  if (!map) return {};
  const next = {};
  Object.keys(map).forEach((key) => {
    const parts = key.split('|');
    const first = Number(parts[0]);
    if (Number.isFinite(first) && first >= pivot) {
      parts[0] = String(first + delta);
      next[parts.join('|')] = map[key];
    } else {
      next[key] = map[key];
    }
  });
  return next;
}

function insertStepAt(index, type = STEP_LIBRARY[0].type) {
  if (state.pendingPicker) {
    alert("Finish the element picker first.");
    return false;
  }
  const schema = STEP_LIBRARY_MAP.get(type) || STEP_LIBRARY[0];
  const newStep = createStepFromSchema(schema);
  const insertIndex = Math.max(0, Math.min(Number(index) || 0, state.steps.length));
  state.steps.splice(insertIndex, 0, newStep);
  if (!isEditingGroup()) {
    state.stepStatuses.splice(insertIndex, 0, "idle");
    state.ifResults = shiftIndexedMap(state.ifResults, insertIndex, 1);
    state.waitCountdowns = shiftIndexedMap(state.waitCountdowns, insertIndex, 1);
    state.nestedStatuses = shiftNestedMap(state.nestedStatuses, insertIndex, 1);
    state.nestedWaitCountdowns = shiftNestedMap(state.nestedWaitCountdowns, insertIndex, 1);
  }
  updateEmptyState();
  return true;
}

function addStep(type = STEP_LIBRARY[0].type) {
  return insertStepAt(state.steps.length, type);
}

function deleteStep(index) {
  if (state.pendingPicker) {
    alert("Finish the element picker first.");
    return;
  }
  state.steps.splice(index, 1);
  if (!isEditingGroup()) {
    state.stepStatuses.splice(index, 1);
  }
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
  if (!isEditingGroup()) {
    const [st] = state.stepStatuses.splice(index, 1);
    state.stepStatuses.splice(newIndex, 0, st || "idle");
  }
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
      if (field.type === "filelist" || field.type === "keysequence") base[field.key] = [];
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
  if (schema.type === 'Restart') {
    if (base.mode == null) base.mode = 'flow';
    if (base.ifIndex == null) base.ifIndex = '';
  }
  if (schema.type === "GroupExecuter") {
    base.groupId = state.groups[0]?.id || "";
  }
  return base;
}

function updateEmptyState() {
  if (!els.emptyState) return;
  if (state.mainSteps.length === 0) {
    els.emptyState.classList.remove("hidden");
  } else {
    els.emptyState.classList.add("hidden");
  }
}

// =============== Drag & Drop ===============
function setupStepCardDnD(card, path) {
  if (!card) return;
  card.draggable = true;
  card.dataset.path = JSON.stringify(path);
  card.addEventListener('dragstart', onCardDragStart);
  card.addEventListener('dragend', onCardDragEnd);
  card.addEventListener('dragover', onCardDragOverWithinCard);
}

function onCardDragOverWithinCard(event) {
  if (!dndState.active || event.currentTarget !== dndState.dragCard) return;
  event.preventDefault();
}

function setupGlobalDnDHandlers() {
  if (dndHandlersBound) return;
  document.addEventListener('dragover', onDocumentDragOver, true);
  document.addEventListener('drop', onDocumentDrop, false);
  window.addEventListener('blur', resetDndState, true);
  dndHandlersBound = true;
}

function finalizeDrop(event, overrides = {}) {
  if (!dndState.active) return false;
  const srcPath = Array.isArray(dndState.srcPath) ? dndState.srcPath.slice() : null;
  let targetCtx = overrides.ctx ?? (dndState.targetValid ? dndState.targetCtx : null);
  let targetIndex = overrides.index ?? (dndState.targetValid ? dndState.targetIndex : -1);
  let listEl = overrides.listEl ?? dndState.targetList;
  if (!targetCtx || !listEl) {
    const fallbackList = findListElement(event?.target);
    if (!targetCtx && fallbackList) targetCtx = getContextFromList(fallbackList);
    if (!listEl && fallbackList) listEl = fallbackList;
  }
  if (targetCtx && targetIndex < 0 && listEl) {
    targetIndex = computeDropIndex(listEl, event?.clientY ?? 0);
  }
  const payload = { srcPath, targetCtx: describeCtx(targetCtx), targetIndex };
  if (!srcPath || !targetCtx) {
    dndLog('drop-abort', payload);
    resetDndState();
    return false;
  }
  const changed = applyMoveStep(srcPath, targetCtx, targetIndex);
  dndLog('drop-finalized', { ...payload, changed });
  resetDndState();
  render();
  if (changed) setDirty(true, { silent: true });
  return changed;
}

function onCardDragStart(event) {
  if (event?.stopPropagation) {
    event.stopPropagation();
  }
  dndLog('drag-start');
  if (state.pendingPicker) {
    event.preventDefault();
    return;
  }
  const card = event.currentTarget;
  const path = parsePath(card?.dataset?.path);
  dndLog('drag-path', path);
  if (!Array.isArray(path)) {
    event.preventDefault();
    return;
  }
  const srcCtx = getContainerContextForPath(path);
  if (!srcCtx) {
    event.preventDefault();
    return;
  }
  dndState.active = true;
  dndState.srcPath = path.slice();
  dndState.srcCtx = srcCtx;
  dndState.dragCard = card;
  dndState.targetList = null;
  dndState.targetCtx = null;
  dndState.targetIndex = -1;
  dndState.targetValid = false;
  card.classList.add('dragging');
  document.body.classList.add('dragging-active');
  dndDebugState.lastCtxSig = null;
  try {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DND_MIME, JSON.stringify(path));
    event.dataTransfer.setData('text/plain', 'drag');
  } catch {}
}

function onCardDragEnd(event) {
  if (event?.stopPropagation) {
    event.stopPropagation();
  }
  resetDndState();
}

function onDocumentDragOver(event) {
  if (!dndState.active) return;
  let originalPointerEvents = null;
  if (dndState.dragCard) {
    originalPointerEvents = dndState.dragCard.style.pointerEvents;
    dndState.dragCard.style.pointerEvents = 'none';
  }
  const elementUnder = document.elementFromPoint(event.clientX, event.clientY);
  if (dndState.dragCard && originalPointerEvents !== null) {
    dndState.dragCard.style.pointerEvents = originalPointerEvents;
  }
  const listEl = findListElement(elementUnder);
  if (!listEl) {
    clearCurrentDropTarget();
    try { event.dataTransfer.dropEffect = 'none'; } catch {}
    return;
  }
  const ctx = getContextFromList(listEl);
  if (!ctx) {
    clearCurrentDropTarget();
    return;
  }
  const invalid = isDropIntoOwnSubtree(dndState.srcPath, ctx);
  if (invalid) {
    event.preventDefault();
    setCurrentDropTarget(listEl, ctx, -1, false);
    try { event.dataTransfer.dropEffect = 'none'; } catch {}
    return;
  }
  event.preventDefault();
  try { event.dataTransfer.dropEffect = 'move'; } catch {}
  const index = computeDropIndex(listEl, event.clientY);
  setCurrentDropTarget(listEl, ctx, index, true);
}

function onDocumentDrop(event) {
  if (!dndState.active) return;
  event.preventDefault();
  finalizeDrop(event);
}

function resetDndState() {
  if (!dndState.active) return;
  if (dndState.dragCard) dndState.dragCard.classList.remove('dragging');
  clearCurrentDropTarget();
  removeDropIndicator();
  dndState.active = false;
  dndState.srcPath = null;
  dndState.srcCtx = null;
  dndState.dragCard = null;
  dndState.targetList = null;
  dndState.targetCtx = null;
  dndState.targetIndex = -1;
  dndState.targetValid = false;
  document.body.classList.remove('dragging-active');
}

function clearCurrentDropTarget() {
  if (dndState.targetList) {
    dndState.targetList.classList.remove('drop-target-highlight', 'drop-denied-highlight');
  }
  if (dndState.targetList) {
    Array.from(dndState.targetList.children).forEach((child) => child.classList?.remove('drop-hover'));
  }
  dndState.targetList = null;
  dndState.targetCtx = null;
  dndState.targetIndex = -1;
  dndState.targetValid = false;
  if (dndDebugState.lastCtxSig !== null) {
    dndLog('target-clear');
    dndDebugState.lastCtxSig = null;
  }
}

function setCurrentDropTarget(listEl, ctx, index, valid) {
  if (dndState.targetList && dndState.targetList !== listEl) {
    dndState.targetList.classList.remove('drop-target-highlight', 'drop-denied-highlight');
    Array.from(dndState.targetList.children).forEach((child) => child.classList?.remove('drop-hover'));
  }
  if (!valid) {
    listEl.classList.remove('drop-target-highlight');
    listEl.classList.add('drop-denied-highlight');
    removeDropIndicator();
    Array.from(listEl.children).forEach((child) => child.classList?.remove('drop-hover'));
    logTargetChange(ctx, index, false);
    dndState.targetList = listEl;
    dndState.targetCtx = null;
    dndState.targetIndex = -1;
    dndState.targetValid = false;
    return;
  }
  listEl.classList.remove('drop-denied-highlight');
  listEl.classList.add('drop-target-highlight');
  positionDropIndicator(listEl, index);
  highlightHoverCards(listEl, index);
  dndState.targetList = listEl;
  dndState.targetCtx = ctx;
  dndState.targetIndex = index;
  dndState.targetValid = true;
  logTargetChange(ctx, index, true);
}

function positionDropIndicator(listEl, index) {
  const indicator = dndState.indicator;
  const cards = getChildCards(listEl, true);
  if (index <= 0) {
    listEl.insertBefore(indicator, cards[0] || null);
  } else if (index >= cards.length) {
    listEl.appendChild(indicator);
  } else {
    listEl.insertBefore(indicator, cards[index]);
  }
}

function removeDropIndicator() {
  const indicator = dndState.indicator;
  if (indicator && indicator.parentElement) {
    indicator.parentElement.removeChild(indicator);
  }
}

function highlightHoverCards(listEl, index) {
  const cards = getChildCards(listEl, true);
  cards.forEach((card, idx) => {
    if (idx === index || idx === index - 1) card.classList.add('drop-hover');
    else card.classList.remove('drop-hover');
  });
}

function computeDropIndex(listEl, clientY) {
  const cards = getChildCards(listEl, true);
  if (cards.length === 0) return 0;
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    if (clientY < midpoint) return i;
  }
  return cards.length;
}

function getChildCards(listEl, excludeDragging = false) {
  return Array.from(listEl.children).filter((child) => {
    if (!child.classList || !child.classList.contains('step-card')) return false;
    if (excludeDragging && child === dndState.dragCard) return false;
    return true;
  });
}

function findListElement(target) {
  if (!target || !(target instanceof Element)) return null;
  
  // Start from the target and go up the DOM tree
  let current = target;
  let depth = 0;
  const maxDepth = 50;
  
  while (current && depth < maxDepth) {
    // Check if this element has the 'flows' class
    if (current.classList && current.classList.contains('flows')) {
      return current;
    }
    
    current = current.parentElement;
    depth++;
  }
  
  return null;
}

function getContextFromList(listEl) {
  if (!listEl) return null;
  const branch = listEl.dataset?.branch;
  const hostPath = parsePath(listEl.dataset?.hostPath);
  if (branch === 'root') return { type: 'root' };
  if (branch === 'then' || branch === 'else') {
    return { type: 'branch', hostPath, branch };
  }
  return null;
}

function parsePath(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function containersFromPath(path) {
  if (!Array.isArray(path) || path.length === 0) return [];
  const containers = [{ branch: 'root', index: path[0] }];
  for (let i = 1; i < path.length; i += 2) {
    const branch = path[i];
    const index = path[i + 1];
    if (typeof index === 'number') {
      containers.push({ branch, index });
    }
  }
  return containers;
}

function containersToPath(containers) {
  if (!Array.isArray(containers) || containers.length === 0) return [];
  const path = [];
  containers.forEach((container, idx) => {
    if (idx === 0) {
      path.push(container.index);
    } else {
      path.push(container.branch);
      path.push(container.index);
    }
  });
  return path;
}

function describeIfPath(path) {
  if (!Array.isArray(path) || path.length === 0) return "If";
  const parts = [];
  const rootIndex = path[0];
  if (typeof rootIndex === "number") {
    parts.push(`Step ${rootIndex + 1}`);
  }
  for (let i = 1; i < path.length; i += 2) {
    const branch = path[i];
    const idx = path[i + 1];
    if ((branch === "then" || branch === "else") && typeof idx === "number") {
      parts.push(`${branch} ${idx + 1}`);
    } else {
      break;
    }
  }
  return parts.join(" → ") || "If";
}

function collectAncestorIfs(path) {
  const result = [];
  if (!Array.isArray(path) || path.length === 0) return result;
  if (typeof path[0] !== "number") return result;
  const prefixes = [];
  let prefix = [path[0]];
  prefixes.push(prefix.slice());
  for (let i = 1; i < path.length; i += 2) {
    const branch = path[i];
    const idx = path[i + 1];
    if ((branch !== "then" && branch !== "else") || typeof idx !== "number") break;
    prefix = prefix.concat([branch, idx]);
    prefixes.push(prefix.slice());
  }
  prefixes.pop(); // remove current step path
  let depth = 1;
  for (let i = prefixes.length - 1; i >= 0; i -= 1) {
    const ancestorPath = prefixes[i];
    const step = resolveStepByPath(ancestorPath);
    if (step?.type === "If") {
      result.push({
        depth,
        path: ancestorPath,
        label: describeIfPath(ancestorPath)
      });
      depth += 1;
    }
  }
  return result;
}

function adjustContextForRemoval(targetCtx, srcPath) {
  if (!targetCtx || targetCtx.type !== 'branch') return targetCtx;
  const hostPath = Array.isArray(targetCtx.hostPath) ? targetCtx.hostPath : [];
  const adjustedPath = adjustHostPathForRemoval(hostPath, srcPath);
  if (!adjustedPath) return targetCtx;
  if (arraysEqual(hostPath, adjustedPath)) return targetCtx;
  return { ...targetCtx, hostPath: adjustedPath };
}

function adjustHostPathForRemoval(hostPath, srcPath) {
  if (!Array.isArray(hostPath) || !Array.isArray(srcPath)) return hostPath;
  const hostContainers = containersFromPath(hostPath).map((c) => ({ ...c }));
  const srcContainers = containersFromPath(srcPath);
  if (!hostContainers.length || !srcContainers.length) return hostPath;
  const max = Math.min(hostContainers.length, srcContainers.length);
  for (let level = 0; level < max; level++) {
    let matches = true;
    for (let parent = 0; parent < level; parent++) {
      const hc = hostContainers[parent];
      const sc = srcContainers[parent];
      if (!hc || !sc || hc.branch !== sc.branch || hc.index !== sc.index) {
        matches = false;
        break;
      }
    }
    if (!matches) break;
    const hc = hostContainers[level];
    const sc = srcContainers[level];
    if (!hc || !sc) break;
    if (hc.branch === sc.branch && hc.index > sc.index) {
      hc.index -= 1;
    }
  }
  return containersToPath(hostContainers);
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function isDropIntoOwnSubtree(srcPath, targetCtx) {
  if (!Array.isArray(srcPath) || !targetCtx) return true;
  if (targetCtx.type !== 'branch') return false;
  
  const host = Array.isArray(targetCtx.hostPath) ? targetCtx.hostPath : [];
  
  // The check: we're dropping INTO our own subtree if the target's hostPath
  // starts with our srcPath AND is longer (meaning it's a descendant)
  // 
  // Example: srcPath=[19] hostPath=[19] -> OK! (dropping into direct child branch)
  // Example: srcPath=[19] hostPath=[19, "then", 0] -> NOT OK! (dropping into grandchild)
  // Example: srcPath=[19, "then", 0] hostPath=[19] -> OK! (moving out)
  
  if (host.length <= srcPath.length) {
    // hostPath is same length or shorter than srcPath
    // This means target is NOT a descendant of source
    return false;
  }
  
  // hostPath is longer - check if it starts with srcPath
  for (let i = 0; i < srcPath.length; i++) {
    if (host[i] !== srcPath[i]) return false;
  }
  
  // hostPath starts with srcPath and is longer - this IS a descendant
  dndLog('blocked-descendant', { srcPath, targetCtx: describeCtx(targetCtx) });
  return true;
}

function getContainerContextForPath(path) {
  if (!Array.isArray(path) || path.length === 0) return { type: 'root' };
  if (path.length === 1) return { type: 'root' };
  const branch = path[path.length - 2];
  const hostPath = path.slice(0, -2);
  return { type: 'branch', hostPath, branch };
}

function getParentContainerForPath(path) {
  if (!Array.isArray(path) || path.length === 0) return null;
  if (path.length === 1) {
    return { array: state.steps, index: path[0], ctx: { type: 'root' } };
  }
  if (path.length < 3) return null;
  const branch = path[path.length - 2];
  const idx = path[path.length - 1];
  const hostPath = path.slice(0, -2);
  const hostStep = resolveStepByPath(hostPath);
  if (!hostStep) return null;
  const arr = Array.isArray(hostStep[branch]) ? hostStep[branch] : null;
  if (!arr) return null;
  return { array: arr, index: idx, ctx: { type: 'branch', hostPath, branch } };
}

function resolveStepByPath(path) {
  if (!Array.isArray(path) || path.length === 0) return null;
  let current = state.steps;
  let step = null;
  let i = 0;
  while (i < path.length) {
    const index = path[i];
    if (typeof index !== 'number' || !current) return null;
    step = current[index];
    if (!step) return null;
    i += 1;
    if (i >= path.length) return step;
    const branch = path[i];
    if (branch !== 'then' && branch !== 'else') return null;
    current = Array.isArray(step[branch]) ? step[branch] : null;
    i += 1;
  }
  return step;
}

function getArrayForContext(ctx) {
  if (!ctx || ctx.type === 'root') return state.steps;
  const hostStep = resolveStepByPath(ctx.hostPath);
  if (!hostStep) return null;
  const branch = ctx.branch === 'else' ? 'else' : 'then';
  if (!Array.isArray(hostStep[branch])) hostStep[branch] = [];
  return hostStep[branch];
}

function removeStepAtPath(path) {
  const parent = getParentContainerForPath(path);
  if (!parent) return null;
  const { array, index, ctx } = parent;
  if (index < 0 || index >= array.length) return null;
  const [step] = array.splice(index, 1);
  let removedStatus = 'idle';
  if (ctx.type === 'root' && !isEditingGroup()) {
    const [status] = state.stepStatuses.splice(index, 1);
    removedStatus = status || 'idle';
  }
  return { step, status: removedStatus, ctx, index };
}

function insertStepIntoContext(step, targetCtx, index, status = 'idle') {
  const array = getArrayForContext(targetCtx);
  if (!array) return;
  const insertAt = Math.max(0, Math.min(index, array.length));
  array.splice(insertAt, 0, step);
  if (targetCtx.type === 'root' && !isEditingGroup()) {
    state.stepStatuses.splice(insertAt, 0, status || 'idle');
  }
}

function contextsMatch(a, b) {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'root') return true;
  if (a.branch !== b.branch) return false;
  const ap = Array.isArray(a.hostPath) ? a.hostPath : [];
  const bp = Array.isArray(b.hostPath) ? b.hostPath : [];
  if (ap.length !== bp.length) return false;
  for (let i = 0; i < ap.length; i++) {
    if (ap[i] !== bp[i]) return false;
  }
  return true;
}

function resetFlowStatuses() {
  state.stepStatuses = state.mainSteps.map(() => 'idle');
  state.nestedStatuses = {};
  state.ifResults = {};
  state.groupExecStates = {};
  state.waitCountdowns = {};
  state.waitDeadlines = {};
  state.nestedWaitCountdowns = {};
  state.nestedWaitDeadlines = {};
  state.lastRunIncremented = false;
}

function applyMoveStep(srcPath, targetCtx, rawIndex) {
  if (!Array.isArray(srcPath) || !targetCtx) return false;
  const adjustedCtx = adjustContextForRemoval(targetCtx, srcPath);
  const removal = removeStepAtPath(srcPath);
  if (!removal) return false;
  const { step, status, ctx: srcCtx, index: originalIndex } = removal;
  let insertIndex = Number.isInteger(rawIndex) ? rawIndex : 0;
  insertIndex = Math.max(0, insertIndex);
  const sameContainer = contextsMatch(srcCtx, adjustedCtx);

  dndLog('apply-move', {
    srcPath,
    originalIndex,
    insertIndex,
    rawIndex,
    sameContainer,
    srcCtx: describeCtx(srcCtx),
    adjustedCtx: describeCtx(adjustedCtx)
  });

  insertStepIntoContext(step, adjustedCtx, insertIndex, status);
  const noChange = sameContainer && originalIndex === insertIndex;
  if (!noChange) {
    resetFlowStatuses();
  }
  dndLog('apply-move-result', { noChange, changed: !noChange });
  return !noChange;
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
  toggle(els.createGroupBtn);
  toggle(els.groupAddStep);
  toggle(els.groupNameInput);
  toggle(els.openTransferModalBtn);
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
  markWorkspaceDirty(flag, { silent });
}

function showStatus(message, { persistent = false } = {}) {
  if (!els.status) return;
  if (state.statusTimer) {
    clearTimeout(state.statusTimer);
    state.statusTimer = null;
  }
  els.status.textContent = message || "";
  els.status.title = message || "";
  if (message && !persistent) {
    state.statusTimer = setTimeout(() => {
      if (!state.pendingPicker) {
        els.status.textContent = "";
        els.status.title = "";
      }
    }, 3200);
  }
}

function summarizeStatusDetail(value, max = 72) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function persistFlow({ steps, flowName, groups, silent } = {}) {
  const prepared = steps && flowName ? { steps, flowName, groups: sanitizeGroups(groups ?? state.groups) } : validateAndPrepare();
  if (!prepared) return false;
  try {
    await chrome.storage.local.set({
      activeFlow: prepared.steps,
      flowName: prepared.flowName,
      groups: prepared.groups,
      workspaceDraft: {
        flowName: prepared.flowName,
        steps: prepared.steps,
        groups: prepared.groups,
        selectedTab: state.activeTab || "flow",
        selectedGroupId: state.selectedGroupId || null
      },
      settings: state.settings
    });
    state.mainSteps = sanitizeFlowArray(prepared.steps);
    state.groups = sanitizeGroups(prepared.groups);
    if (state.selectedGroupId && !state.groups.some((group) => group.id === state.selectedGroupId)) {
      state.selectedGroupId = null;
    }
    syncEditorSteps();
    state.flowName = prepared.flowName;
    state.stepStatuses = state.mainSteps.map(() => "idle");
    state.nestedStatuses = {};
    state.ifResults = {};
    state.groupExecStates = {};
    state.waitCountdowns = {};
    state.waitDeadlines = {};
    state.nestedWaitCountdowns = {};
    state.nestedWaitDeadlines = {};
    snapshotAsSaved();
    markWorkspaceDirty(false, { silent: true });
    if (!silent) showStatus("Flow saved to storage.");
    render();
    return true;
  } catch (err) {
    console.error("[options] Failed to save flow:", err);
    alert("Failed to save flow. See console for details.");
    return false;
  }
}

function updateGmailStatusLabel() {
  if (!els.gmailStatus) return;
  const email = state.settings?.gmailConnection?.email;
  if (email) {
    const text = `Connected as ${email}`;
    els.gmailStatus.textContent = text;
    els.gmailStatus.title = text;
  } else {
    els.gmailStatus.textContent = "Not connected";
    els.gmailStatus.title = "Not connected";
  }
}

async function refreshGmailSettingsFromStorage() {
  try {
    const { settings } = await chrome.storage.local.get(["settings"]);
    if (settings) {
      state.settings = { ...state.settings, ...(settings || {}) };
      updateGmailStatusLabel();
    }
  } catch (err) {
    console.error("[options] Failed to refresh Gmail settings:", err);
  }
}

// -------- Saved Flows (Library) --------
function renderLibrary() {
  const list = els.savedFlowsContainer;
  if (!list) return;
  list.innerHTML = "";
  const flows = Array.isArray(state.savedFlows) ? state.savedFlows : [];
  if (!flows.length) {
    els.savedEmptyState?.classList.remove("hidden");
    return;
  }
  els.savedEmptyState?.classList.add("hidden");
  flows.forEach((f) => {
    const card = document.createElement("article");
    card.className = "step-card";
    const header = document.createElement("div"); header.className = "step-header";
    const title = document.createElement("span"); title.className = "step-title"; title.textContent = f.name || "Flow";
    const actions = document.createElement("div"); actions.className = "step-actions";
    const loadBtn = document.createElement("button"); loadBtn.type = "button"; loadBtn.className = "icon"; loadBtn.title = "Load into editor"; loadBtn.textContent = "⤴";
    const exportBtn = document.createElement("button"); exportBtn.type = "button"; exportBtn.className = "icon"; exportBtn.title = "Export JSON"; exportBtn.textContent = "⇩";
    const updateBtn = document.createElement("button"); updateBtn.type = "button"; updateBtn.className = "icon"; updateBtn.title = "Update with current"; updateBtn.textContent = "⟳";
    const renameBtn = document.createElement("button"); renameBtn.type = "button"; renameBtn.className = "icon"; renameBtn.title = "Rename"; renameBtn.textContent = "✎";
    const delBtn = document.createElement("button"); delBtn.type = "button"; delBtn.className = "icon danger"; delBtn.title = "Delete"; delBtn.textContent = "✕";
    actions.appendChild(loadBtn); actions.appendChild(exportBtn); actions.appendChild(updateBtn); actions.appendChild(renameBtn); actions.appendChild(delBtn);
    header.appendChild(title); header.appendChild(actions);
    card.appendChild(header);
    const meta = document.createElement("div"); meta.style.fontSize = "12px"; meta.style.color = "var(--text-light)"; meta.textContent = new Date(f.updatedAt || Date.now()).toLocaleString();
    card.appendChild(meta);
    list.appendChild(card);

    loadBtn.addEventListener("click", () => loadSavedFlow(f.id));
    exportBtn.addEventListener("click", () => exportFlowData({
      name: f.name || "flow",
      flowName: f.flowName || f.name || "flow",
      steps: f.steps || [],
      groups: f.groups || []
    }));
    updateBtn.addEventListener("click", async () => { await updateSavedFlowWithCurrent(f.id); });
    renameBtn.addEventListener("click", async () => {
      const nn = prompt("New name", f.name || "");
      if (nn == null) return; const name = nn.trim(); if (!name) return;
      await renameSavedFlow(f.id, name);
      renderLibrary();
    });
    delBtn.addEventListener("click", async () => {
      if (!confirm(`Delete saved flow “${f.name}”?`)) return;
      await deleteSavedFlow(f.id);
      renderLibrary();
    });
  });
}

async function saveCurrentAsNew(name) {
  const nm = (state.flowName || name || "").trim();
  if (!nm) { alert("Enter a flow name"); return; }
  const prepared = validateAndPrepare(); if (!prepared) return;
  const item = {
    id: `sf_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: nm,
    flowName: prepared.flowName,
    steps: prepared.steps,
    groups: prepared.groups,
    updatedAt: Date.now()
  };
  const cur = Array.isArray(state.savedFlows) ? state.savedFlows.slice() : [];
  cur.unshift(item);
  state.savedFlows = cur;
  await chrome.storage.local.set({ savedFlows: cur });
  if (els.saveAsName) els.saveAsName.value = "";
  showStatus("Saved current flow to library.");
  renderLibrary();
}

async function deleteSavedFlow(id) {
  const cur = Array.isArray(state.savedFlows) ? state.savedFlows.slice() : [];
  const next = cur.filter((f) => f.id !== id);
  state.savedFlows = next;
  await chrome.storage.local.set({ savedFlows: next });
  showStatus("Deleted saved flow.");
}

async function renameSavedFlow(id, name) {
  const cur = Array.isArray(state.savedFlows) ? state.savedFlows.slice() : [];
  const idx = cur.findIndex((f) => f.id === id);
  if (idx < 0) return;
  cur[idx] = { ...cur[idx], name: name.trim(), updatedAt: Date.now() };
  state.savedFlows = cur;
  await chrome.storage.local.set({ savedFlows: cur });
  showStatus("Renamed.");
}

function loadSavedFlow(id) {
  const f = (state.savedFlows || []).find((x) => x.id === id);
  if (!f) return;
  state.mainSteps = sanitizeFlowArray(f.steps);
  state.groups = sanitizeGroups(f.groups);
  state.flowName = f.flowName || f.name || state.flowName;
  state.selectedGroupId = null;
  state.activeTab = "flow";
  syncEditorSteps();
  state.stepStatuses = state.mainSteps.map(() => "idle");
  state.nestedStatuses = {}; state.ifResults = {}; state.groupExecStates = {}; state.waitCountdowns = {}; state.waitDeadlines = {}; state.nestedWaitCountdowns = {}; state.nestedWaitDeadlines = {};
  markWorkspaceDirty(true);
  selectTab("flow");
  render();
  showStatus("Loaded flow from library. Save to persist.");
}

function exportFlowData({ name, flowName, steps, groups }) {
  const payload = {
    version: 2,
    name: name || flowName || "flow",
    flowName: flowName || name || "flow",
    steps: sanitizeFlowArray(steps),
    groups: sanitizeGroups(groups)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = `${slugify(flowName || name || 'flow')}.json`;
  document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
}

async function updateSavedFlowWithCurrent(id) {
  const prepared = validateAndPrepare(); if (!prepared) return;
  const cur = Array.isArray(state.savedFlows) ? state.savedFlows.slice() : [];
  const idx = cur.findIndex((f) => f.id === id);
  if (idx < 0) return;
  cur[idx] = { ...cur[idx], flowName: prepared.flowName, steps: prepared.steps, groups: prepared.groups, updatedAt: Date.now() };
  state.savedFlows = cur;
  await chrome.storage.local.set({ savedFlows: cur });
  showStatus("Saved flow updated.");
  renderLibrary();
}

function validateAndPrepare() {
  const errors = [];

  function validateStepCollection(inputSteps, pathPrefix = "Step") {
    const preparedSteps = [];
    inputSteps.forEach((step, index) => {
      const schema = STEP_LIBRARY_MAP.get(step?.type);
      const labelPrefix = `${pathPrefix} ${index + 1}`;
      if (!schema) {
        errors.push(`${labelPrefix}: Unknown type "${step?.type}".`);
        return;
      }
      const prepared = { type: step.type };
      schema.fields.forEach((field) => {
        const value = step[field.key];
        const isEmpty = value === null || value === undefined || (typeof value === "string" && value.trim() === "") || ((field.type === "filelist" || field.type === "keysequence") && Array.isArray(value) && value.length === 0);
        if (field.required && isEmpty) {
          errors.push(`${labelPrefix}: ${field.label} is required.`);
          return;
        }
        if (field.type === "number") {
          if (isEmpty) return;
          const numeric = Number(value);
          if (!Number.isFinite(numeric)) {
            errors.push(`${labelPrefix}: ${field.label} must be a number.`);
            return;
          }
          if (typeof field.min === "number" && numeric < field.min) {
            errors.push(`${labelPrefix}: ${field.label} must be ≥ ${field.min}.`);
            return;
          }
          prepared[field.key] = numeric;
        } else if (field.type === "keysequence") {
          if (!isEmpty) prepared[field.key] = normalizeKeySequence(value);
        } else if (!isEmpty) {
          prepared[field.key] = typeof value === "string" ? value.trim() : value;
        }
      });

      if (step.type === "Click" && step.forceClick !== undefined) {
        prepared.forceClick = Boolean(step.forceClick);
      }

      if (step.type === "Complete") {
        const outcome = step.status === "failure" ? "failure" : "success";
        prepared.status = outcome;
        if (typeof step.message === "string" && step.message.trim()) {
          prepared.message = step.message.trim();
        }
      }

      if (step.type === "GroupExecuter") {
        const groupId = typeof step.groupId === "string" ? step.groupId : "";
        const group = state.groups.find((item) => item.id === groupId);
        if (!group) {
          errors.push(`${labelPrefix}: Group selection is required.`);
        } else {
          prepared.groupId = group.id;
        }
      }

      if (step.type === "If") {
        const thenArr = Array.isArray(step.then) ? step.then : [];
        const elseArr = Array.isArray(step.else) ? step.else : [];
        prepared.then = validateStepCollection(thenArr, `${labelPrefix} > Then`);
        prepared.else = validateStepCollection(elseArr, `${labelPrefix} > Else`);
        if ((step.mode || "exists") === "text") {
          const match = step.textMatch || "contains";
          const val = typeof step.textValue === "string" ? step.textValue.trim() : "";
          if (!["any", "empty", "notEmpty"].includes(match)) {
            if (!val) errors.push(`${labelPrefix}: Text value is required when using a text condition.`);
            else prepared.textValue = val;
          }
          prepared.textMatch = match;
          prepared.textCaseSensitive = Boolean(step.textCaseSensitive);
        }
      }

      if (step.type === "Restart") {
        if (prepared.ifIndex === "" || prepared.ifIndex === null) {
          delete prepared.ifIndex;
        } else if (prepared.ifIndex !== undefined) {
          const asNumber = Number(prepared.ifIndex);
          if (Number.isFinite(asNumber)) prepared.ifIndex = asNumber;
          else delete prepared.ifIndex;
        }
      }
      preparedSteps.push(prepared);
    });
    return preparedSteps;
  }

  const flowName = state.flowName && state.flowName.trim() ? state.flowName.trim() : DEFAULT_FLOW_NAME;
  const preparedSteps = validateStepCollection(state.mainSteps, "Main flow step");
  const preparedGroups = state.groups.map((group, groupIndex) => ({
    id: group.id,
    name: typeof group.name === "string" && group.name.trim() ? group.name.trim() : `Group ${groupIndex + 1}`,
    steps: validateStepCollection(group.steps || [], `Group "${typeof group.name === "string" && group.name.trim() ? group.name.trim() : `Group ${groupIndex + 1}`}" step`)
  }));

  if (!preparedSteps.length) {
    errors.push("Add at least one step to the main flow before saving or running.");
  }

  if (errors.length) {
    alert("Fix the following issues before saving:\n\n" + errors.join("\n"));
    return null;
  }

  return { steps: preparedSteps, flowName, groups: preparedGroups };
}

function listTopLevelIfs() {
  const res = [];
  for (let i = 0; i < state.steps.length; i++) {
    if (state.steps[i]?.type === 'If') {
      res.push({ value: i, label: `Step ${i + 1} — If` });
    }
  }
  return res;
}

function createSelectorPingButton(input) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon ping-btn";
  btn.title = "Ping selector target in active tab";
  btn.setAttribute("aria-label", "Ping selector target in active tab");
  btn.textContent = "📍";

  const syncState = () => {
    btn.disabled = Boolean(state.pendingPicker) || !String(input?.value || "").trim();
  };
  syncState();

  input.addEventListener("input", syncState);
  input.addEventListener("change", syncState);
  btn.addEventListener("click", async () => {
    await pingSelectorValue(String(input?.value || "").trim());
    syncState();
  });
  return btn;
}

async function pingSelectorValue(selector) {
  if (state.pendingPicker) {
    alert("Finish the element picker first.");
    return;
  }
  const normalizedSelector = typeof selector === "string" ? selector.trim() : "";
  if (!normalizedSelector) {
    alert("Enter a selector first.");
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      alert("No active tab found. Open a regular webpage and try again.");
      return;
    }
    const res = await chrome.runtime.sendMessage({
      type: "PING_SELECTOR_IN_TAB",
      tabId: tab.id,
      selector: normalizedSelector,
      readInsideIframes: state.settings.readInsideIframes !== false
    });
    if (res && res.ok === false) {
      alert(res?.error || "Selector target could not be found.");
      return;
    }
    const summary = summarizeStatusDetail(normalizedSelector, 56);
    showStatus(summary ? `Pinged ${summary}` : `Pinged ${res?.description || "selector target"}.`);
  } catch (err) {
    console.error("[options] Failed to ping selector:", err);
    alert(err?.message || "Failed to ping selector.");
  }
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
    state.inlineInsertActive = false;
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
        const summary = summarizeStatusDetail(msg.selector, 56);
        showStatus(summary ? `Selector captured: ${summary}` : "Selector captured.");
        return;
      }
    } else if (typeof stepIndex === 'number' && state.steps[stepIndex]) {
      state.steps[stepIndex][fieldKey] = msg.selector;
      setDirty(true, { silent: true });
      render();
      const summary = summarizeStatusDetail(msg.selector, 56);
      showStatus(summary ? `Selector captured: ${summary}` : "Selector captured.");
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
        } else if (field.type === "keysequence") {
          normalized[field.key] = normalizeKeySequence(step[field.key]);
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
    if (step.type === 'Restart' && normalized.ifIndex !== undefined) {
      const idx = Number(normalized.ifIndex);
      if (Number.isFinite(idx)) normalized.ifIndex = idx;
      else delete normalized.ifIndex;
    }
    sanitized.push(normalized);
  });
  return sanitized;
}

function exportFlow() {
  exportFlowData({
    name: state.flowName,
    flowName: state.flowName,
    steps: state.mainSteps,
    groups: state.groups
  });
  showStatus("Flow exported as JSON.");
}

function applyImportedFlow(payload) {
  const importedSteps = Array.isArray(payload) ? payload : Array.isArray(payload?.steps) ? payload.steps : null;
  if (!importedSteps) throw new Error("Missing steps array.");
  const importedName = typeof payload?.flowName === "string" && payload.flowName.trim()
    ? payload.flowName.trim()
    : (typeof payload?.name === "string" && payload.name.trim() ? payload.name.trim() : DEFAULT_FLOW_NAME);
  const sanitized = sanitizeFlowArray(importedSteps);
  if (!sanitized.length) throw new Error("No valid steps in file.");
  state.mainSteps = sanitized;
  state.groups = sanitizeGroups(payload?.groups);
  state.flowName = importedName;
  state.activeTab = "flow";
  state.selectedGroupId = null;
  syncEditorSteps();
  state.stepStatuses = state.mainSteps.map(() => "idle");
  state.nestedStatuses = {};
  state.ifResults = {};
  state.groupExecStates = {};
  state.waitCountdowns = {};
  state.waitDeadlines = {};
  state.nestedWaitCountdowns = {};
  state.nestedWaitDeadlines = {};
  selectTab("flow");
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
  state.stepStatuses = state.mainSteps.map(() => "pending");
  state.nestedStatuses = {};
  state.ifResults = {};
  state.groupExecStates = {};
  state.waitCountdowns = {};
  state.waitDeadlines = {};
  state.nestedWaitCountdowns = {};
  state.nestedWaitDeadlines = {};
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
function initTabs() { selectTab(state.activeTab || "flow"); }

function selectTab(name) {
  const isFlow = name === "flow";
  const isGroups = name === "groups";
  const isSettings = name === "settings";
  const isLibrary = name === "library";
  state.activeTab = name;
  if (name !== "groups") state.transferModal.open = false;
  if (isGroups && state.selectedGroupId && !getSelectedGroup()) {
    state.selectedGroupId = null;
  }
  syncEditorSteps();
  // toggle buttons
  els.tabFlowBtn?.classList.toggle("active", isFlow);
  els.tabGroupsBtn?.classList.toggle("active", isGroups);
  els.tabSettingsBtn?.classList.toggle("active", isSettings);
  els.tabLibraryBtn?.classList.toggle("active", isLibrary);
  // toggle panels
  els.tabFlow?.classList.toggle("hidden", !isFlow);
  els.tabGroups?.classList.toggle("hidden", !isGroups);
  els.tabSettings?.classList.toggle("hidden", !isSettings);
  els.tabLibrary?.classList.toggle("hidden", !isLibrary);
  if (isLibrary) {
    try { renderLibrary(); } catch {}
  }
  scheduleWorkspaceDraftSave();
  updateControlsForTab();
}

function updateControlsForTab() {
  const tab = state.activeTab || 'flow';
  const showFlowControls = tab === 'flow';
  const showGroupsControls = tab === 'groups' && Boolean(state.selectedGroupId);
  const showSaveBar = tab !== 'library'; // show Save/Discard on flow + groups + settings
  // top
  if (els.addStep) els.addStep.style.display = showFlowControls ? '' : 'none';
  if (els.runFlow) els.runFlow.style.display = showFlowControls ? '' : 'none';
  if (els.runCounter) els.runCounter.style.display = showFlowControls ? '' : 'none';
  if (els.flowNameWrap) els.flowNameWrap.style.display = showFlowControls ? '' : 'none';
  if (els.topBar) els.topBar.style.display = (showFlowControls || tab === 'settings' || tab === 'library') ? '' : '';
  if (els.moreMenuBtn) els.moreMenuBtn.style.display = showFlowControls ? '' : 'none';
  if (els.groupAddStep) els.groupAddStep.style.display = showGroupsControls ? '' : 'none';
  // bottom save/discard
  const saveBtn = els.saveFlow; const discardBtn = els.discardChanges;
  if (saveBtn) saveBtn.style.display = showSaveBar ? '' : 'none';
  if (discardBtn) discardBtn.style.display = showSaveBar ? '' : 'none';
}

function updateRunButton() {
  if (!els.runFlow) return;
  if (state.isRunning) {
    els.runFlow.innerHTML = '⏹ Stop <span class="hg"></span>';
    els.runFlow.classList.remove('primary');
  } else {
    els.runFlow.textContent = '▶ Run Flow';
    els.runFlow.classList.add('primary');
  }
}

// pin logic removed

// Flow status handling messages from background
function handleFlowStatus(msg) {
  if (msg.kind === "FLOW_RESET") {
    state.stepStatuses = state.mainSteps.map(() => "pending");
    state.nestedStatuses = {};
    state.ifResults = {};
    state.groupExecStates = {};
    state.waitCountdowns = {};
    state.waitDeadlines = {};
    state.nestedWaitCountdowns = {};
    state.nestedWaitDeadlines = {};
    state.isRunning = true;
    state.lastRunIncremented = false;
    state.stopSuppressUntil = 0;
    state.inlineInsertActive = false;
    syncCountdownTicker();
    updateRunButton();
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
      delete state.waitDeadlines[idx];
    }
    if (status === 'error' && msg.error) {
      const raw = typeof msg.error === 'string' ? msg.error : '';
      const cleaned = raw.replace(/^Error:\s*/, '').trim();
      const stepLabel = state.mainSteps[idx]?.type ? `${state.mainSteps[idx].type} failed` : 'Step failed';
      const message = cleaned ? `${stepLabel}: ${cleaned}` : stepLabel;
      showStatus(message, { persistent: true });
    }
    // update running state: if any step pending/running -> running; else -> stopped
    const anyActive = state.stepStatuses.some(s => s === 'pending' || s === 'running');
    // If final step just marked success and nothing active, ensure counter increments once
    const isFinalSuccess = (idx === state.mainSteps.length - 1) && (status === 'success') && !anyActive;
    if (isFinalSuccess && !state.lastRunIncremented) {
      state.runCount = (Number(state.runCount) || 0) + 1;
      state.lastRunIncremented = true;
    }
    // Suppress transient running flips right after STOP was requested
    const suppress = state.stopSuppressUntil && Date.now() < state.stopSuppressUntil;
    state.isRunning = suppress ? false : anyActive;
    syncCountdownTicker();
    updateRunButton();
    render();
  }
}

function handleGroupExecStatus(msg) {
  if (typeof msg.parentIndex !== "number") return;
  const index = msg.parentIndex;
  const current = state.groupExecStates[index] || {
    groupId: msg.groupId || "",
    groupName: msg.groupName || "",
    total: Number(msg.total) || 0,
    current: 0,
    status: "idle",
    items: []
  };
  if (msg.action === "start") {
    state.groupExecStates[index] = {
      groupId: msg.groupId || current.groupId,
      groupName: msg.groupName || current.groupName,
      total: Number(msg.total) || 0,
      current: Number(msg.current) || 0,
      status: "running",
      items: Array.isArray(msg.items)
        ? msg.items.map((item) => ({
            index: Number.isFinite(Number(item?.index)) ? Number(item.index) : -1,
            label: item?.label || "Step",
            status: RUN_STATUS_META[item?.status] ? item.status : "idle"
          }))
        : []
    };
    render();
    return;
  }
  if (msg.action === "item") {
    const next = {
      ...current,
      current: Number.isFinite(Number(msg.current)) ? Number(msg.current) : current.current,
      total: Number.isFinite(Number(msg.total)) ? Number(msg.total) : current.total,
      status: msg.status === "error" ? "error" : "running",
      items: Array.isArray(current.items) ? current.items.slice() : []
    };
    const itemIndex = Number(msg.itemIndex);
    if (Number.isFinite(itemIndex) && next.items[itemIndex]) {
      next.items[itemIndex] = {
        ...next.items[itemIndex],
        status: RUN_STATUS_META[msg.status] ? msg.status : next.items[itemIndex].status
      };
    }
    state.groupExecStates[index] = next;
    render();
    return;
  }
  if (msg.action === "finish") {
    state.groupExecStates[index] = {
      ...current,
      current: Number.isFinite(Number(msg.current)) ? Number(msg.current) : current.current,
      total: Number.isFinite(Number(msg.total)) ? Number(msg.total) : current.total,
      status: RUN_STATUS_META[msg.status] ? msg.status : current.status
    };
    render();
  }
}

function handleFlowNestedStatus(msg) {
  const key = Array.isArray(msg.path) ? msg.path.map(String).join('|') : (typeof msg.parentIndex === 'number' && typeof msg.childIndex === 'number' && typeof msg.branch === 'string' ? `${msg.parentIndex}|${msg.branch}|${msg.childIndex}` : null);
  if (!key) return;
  let status = msg.status;
  if (!RUN_STATUS_META[status]) status = 'idle';
  state.nestedStatuses[key] = status;
  if (status === 'success' || status === 'error') {
    delete state.nestedWaitCountdowns[key];
    delete state.nestedWaitDeadlines[key];
  }
  syncCountdownTicker();
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
  if (Number.isFinite(Number(msg.until))) {
    state.waitDeadlines[idx] = Number(msg.until);
  }
  syncCountdownTicker();
  render();
}

function handleWaitNestedCountdown(msg) {
  const key = Array.isArray(msg.path) ? msg.path.map(String).join('|') : (typeof msg.parentIndex === 'number' && typeof msg.childIndex === 'number' && typeof msg.branch === 'string' ? `${msg.parentIndex}|${msg.branch}|${msg.childIndex}` : null);
  if (!key) return;
  const sec = Number(msg.seconds);
  if (!Number.isFinite(sec)) return;
  state.nestedWaitCountdowns[key] = Math.max(0, sec);
  if (Number.isFinite(Number(msg.until))) {
    state.nestedWaitDeadlines[key] = Number(msg.until);
  }
  syncCountdownTicker();
  render();
}

function handleFlowIter(msg) {
  state.runCount = (Number(state.runCount) || 0) + 1;
  state.lastRunIncremented = true;
  render();
}

function handleFlowComplete(msg) {
  state.isRunning = false;
  state.stopSuppressUntil = 0;
  const idx = typeof msg.index === 'number' ? msg.index : null;
  if (idx != null) {
    const status = msg.outcome === 'failure' ? 'error' : 'success';
    state.stepStatuses[idx] = status;
    for (let j = idx + 1; j < state.stepStatuses.length; j += 1) {
      if (state.stepStatuses[j] === 'pending' || state.stepStatuses[j] === 'running') {
        state.stepStatuses[j] = 'idle';
      }
    }
  }
  state.waitCountdowns = {};
  state.waitDeadlines = {};
  state.nestedWaitCountdowns = {};
  state.nestedWaitDeadlines = {};
  syncCountdownTicker();
  if (msg.outcome !== 'success') {
    state.lastRunIncremented = false;
  }
  state.inlineInsertActive = false;
  hideGmailConnectPrompt();
  updateRunButton();
  render();
  const baseMessage = (typeof msg.message === 'string' && msg.message.trim())
    ? msg.message.trim()
    : (msg.outcome === 'success' ? 'Flow completed.' : 'Flow marked as failed.');
  showStatus(baseMessage, { persistent: true });
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
