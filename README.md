# AutoFiller

Reusable browser automation flows for repetitive web workflows.

AutoFiller is a Chrome extension built around a visual flow editor. It lets you compose repeatable browser actions like navigation, text entry, conditional branches, dropdown selection, file upload, Gmail OTP polling, and completion alerts without wiring up a separate automation stack.

Project-level agent instructions and Codex docs live at the repository root. The packageable extension itself lives under `extension/`.

Maintainer-facing project memory is split across:

- [docs/MAINTAINER_SYSTEM.md](docs/MAINTAINER_SYSTEM.md)
- [docs/PROJECT_KNOWLEDGE.md](docs/PROJECT_KNOWLEDGE.md)
- [docs/PROJECT_MEMORY.md](docs/PROJECT_MEMORY.md)
- [docs/PROJECT_PRIORITIES.md](docs/PROJECT_PRIORITIES.md)

## Highlights

- Chrome Extension Manifest V3 architecture
- Visual flow editor with nested `If` branches and a saved flow library
- Selector picker for capturing targets directly from the active page
- Flow actions for navigation, clicking, typing, waits, dropdowns, file uploads, audio alerts, and Gmail-based OTP retrieval
- Local-first storage for flows and extension settings
- Clean source/build split with `extension/src/`, `extension/public/`, and `extension/dist/`

## Project Structure

```text
.
├── AGENTS.md            # Root-level agent instructions for the repo
├── docs/                # Codex / maintainer docs kept at the root
└── extension/
    ├── public/          # Static extension files copied as-is to dist
    │   ├── assets/
    │   ├── manifest.json
    │   ├── offscreen.html
    │   └── options.html
    ├── scripts/
    │   └── build.mjs    # Build pipeline for Chrome extension output
    ├── src/
    │   ├── background/  # Service worker source
    │   ├── content/     # Content script source
    │   ├── offscreen/   # Offscreen audio logic
    │   └── options/     # Flow editor UI logic
    └── dist/            # Generated unpacked extension output
```

## Development

```bash
npm install
npm run build
```

Then open `chrome://extensions`, enable Developer mode, choose `Load unpacked`, and select the generated `extension/dist/` directory.

## Notes on Security

- Do not commit personal Google OAuth credentials or any other secrets.
- Gmail access is initiated with your own OAuth Client ID and stored in extension-local storage.
- Review the requested permissions in `extension/public/manifest.json` before loading the extension in a primary browser profile.

## Current Direction

- Reduce the size of the editor and runtime files by extracting step handlers into smaller modules
- Add flow templates for common repetitive workflows
- Improve test coverage around flow sanitization and nested execution behavior

## Maintainer

Built and maintained by [@alpismet](https://github.com/alpismet).
