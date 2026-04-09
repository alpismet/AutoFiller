# Project Priorities

## Current Focus

1. Keep flow execution stable while groups, nested execution, and richer selector tooling expand.
2. Reduce regressions caused by iframe handling, dynamic selectors, and popup/editor state restore.
3. Improve maintainability of large editor/runtime files without broad rewrites.

## Active Quality Themes

- Runtime correctness before polish
- Selector resilience across dynamic apps
- Draft vs published state safety
- Popup/editor UX stability

## Parked / Not Now

- Large-scale modular rewrites without a clear boundary
- Permission expansion without explicit need
- Broad UI redesign not tied to a concrete workflow issue

## Useful Future Capability Areas

- More formal test coverage around step sanitization, nested execution, and selector resolution
- Better diagnostics for runtime failures and step-level verification
- Further modular extraction from `background/index.js`, `content/index.js`, and `options/index.js`
- Safer tooling around storage migrations and flow schema evolution

