# Project Knowledge

Static truths and durable conventions for AutoFiller.

## Repository Model

- This is a long-lived Chrome Extension product workspace, not a demo repo.
- Manifest V3 compatibility must be preserved.
- Source of truth lives in `extension/src/`.
- Static packaged files live in `extension/public/`.
- Build output lives in `extension/dist/`.
- `extension/dist/` is generated output and must not be treated as hand-edited source.

## Main Runtime Entry Points

- `extension/src/background/index.js`
- `extension/src/content/index.js`
- `extension/src/options/index.js`
- `extension/src/offscreen/index.js`
- `extension/public/manifest.json`
- `extension/scripts/build.mjs`

## Operating Conventions

- Read first, write second.
- Prefer local evidence over assumptions.
- Keep behavior stable unless change is explicitly requested.
- Verify before declaring success.
- When a code change is made, bump the patch version in:
  - `package.json`
  - `extension/public/manifest.json`
- Keep `package.json`, `extension/public/manifest.json`, and built `extension/dist/manifest.json` aligned after build.

## User-Specific Workflow Rules

- Do not refresh the unpacked extension automatically.
- Refresh only when the user explicitly says `g` or `güncelle`.
- Use `g` as the short form for extension refresh requests.

## Sensitive Areas

- Gmail integration
- identity flows
- storage schema changes
- manifest permissions
- flow and step schema compatibility

## UI / UX Expectations

- The popup/editor should avoid layout jumps caused by long debug or selector text.
- User-facing controls should preserve current mental models rather than introduce hidden automation.
- New reusable features should behave like infrastructure, not one-off patches.

## Documentation Rules

- Put stable rules here.
- Put earned implementation lessons in `docs/PROJECT_MEMORY.md`.
- Keep `docs/CODEX_FIRST_PROMPT.md` as a compact bootstrap that points here.

