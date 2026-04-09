# Project Memory

Earned learnings from implementation and debugging work on AutoFiller.

Update this file only with observations backed by real changes, bugs, or verification.

## Execution and Runtime

- `Wait` UI state cannot be restored safely from status alone. Countdown restore must be deadline-based, and visible status should derive from active deadlines when they still exist.
- `GroupExecuter` behavior must match main-flow semantics for error propagation and progress reporting. Silent failure inside groups creates misleading execution results.
- Runtime progress UI is more actionable when it shows current position and child step states during group execution.

## Selector and Picker Behavior

- Selector-related work must consider same-document, same-origin iframe, and cross-origin iframe cases separately.
- Ping or selector execution across frames should route through a single authoritative frame to avoid response races.
- Cross-frame delegation is safer than sending the same selector request to every frame and accepting the first response.
- Dynamic IDs and dynamic attribute values are common in target apps; selector generation must prefer stable attributes, readable text hints, and fallback strategies over raw volatile identifiers.
- Transient classes such as hover/active state classes should not be trusted as selector anchors.

## Popup and Status UI

- Long selector/debug strings in the popup status area can cause width expansion. Status output should be truncated and overflow-controlled.
- Selector capture and selector ping messaging should use short summaries in the popup and keep the full text in a tooltip or title if needed.

## Extension Update Workflow

- Unpacked extension refresh is intentionally manual-by-command. Implementation work may be complete while the loaded extension is still stale.
- When validating a behavior change that affects runtime scripts, remember that `g` / `güncelle` is required before browser-side confirmation.

## Future-Proofing Themes

- Prefer explicit separation between static knowledge, learned memory, and active priorities.
- Favor reusable bridge/message patterns for future cross-frame or cross-context features.
- Favor workspace-level draft vs published state separation when editor features can create incomplete intermediate states.

