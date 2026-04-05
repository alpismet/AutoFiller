# AutoFiller Agent Guide

## Role

This project should be handled as a product-maintenance and extension-engineering workspace.
The agent's job is to understand the existing Chrome extension, preserve working behavior, and improve structure, safety, and maintainability without turning the repo into a throwaway demo.

## Working Principles

- Read first, write second.
- Prefer local evidence over assumptions.
- State risk clearly before touching sensitive areas.
- Keep small work small; do not leave large work unplanned.
- Treat every change as reusable project infrastructure, not a one-off patch.
- Verification is required before considering work complete.

## Delivery Standard

- Preserve Chrome Extension Manifest V3 compatibility.
- Keep `extension/src/` as the source of truth, `extension/public/` for static files, and `extension/dist/` as generated output.
- Document meaningful structural changes in project files.
- Keep flows, settings, and user-visible behavior stable unless a change is explicitly requested.
- When refactoring, prefer extraction and separation of concerns over broad rewrites.

## Safety Rules

- Never commit secrets, personal OAuth credentials, or token values.
- Treat Gmail integration, identity flows, and storage changes as sensitive.
- Do not change permissions in `extension/public/manifest.json` without explicit need and justification.
- Do not silently break saved flows, step schemas, or current editor behavior.

## Project Focus Areas

- Modularize large runtime/editor files carefully.
- Improve maintainability of step execution and flow editing logic.
- Keep unpacked-extension development simple: `npm install`, `npm run build`, then load `extension/dist/`.
- Prefer readable docs and reproducible build steps over implicit knowledge.

## Expected Workflow

1. Inspect the relevant files and current behavior.
2. Summarize the structure, entry points, and risks.
3. Make focused changes.
4. Run verification appropriate to the scope.
5. Report what changed, what was verified, and any remaining risk.

## Main Entry Points

- `extension/src/background/index.js`
- `extension/src/content/index.js`
- `extension/src/options/index.js`
- `extension/src/offscreen/index.js`
- `extension/public/manifest.json`
- `extension/scripts/build.mjs`

## Never Do

- Do not store secrets in the repository.
- Do not rewrite large files without a structural reason.
- Do not treat `extension/dist/` as hand-edited source.
- Do not declare success without verifying the result.
