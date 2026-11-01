# Contributing

Thanks for taking the time to improve AI Selection Assistant. This repository is the unpacked
extension itself: there is no bundler and no build output to regenerate, so the source you edit is
the code that runs.

## Before you start

- Chrome or Microsoft Edge 102+ to load the extension.
- Node.js 20+ for the tests and the packaging script.
- Python 3 with Pillow and NumPy only if you regenerate the icons or the site cover.

## Load it locally

1. Open `chrome://extensions` and turn on Developer mode.
2. Choose **Load unpacked** and select this repository root.
3. Open the extension options, enter a Base URL and model. The API key is optional.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Markdown parsing, rendering and streaming parity tests |
| `npm run check` | Manifest, icon, locale and version consistency |
| `npm run verify` | `check` followed by `test` |
| `npm run package` | Builds `dist/ai-selection-assistant-<version>.zip` |
| `npm run icons` | Regenerates the icon set from `scripts/make-icons.py` |

Run `npm run verify` before opening a pull request.

## Project layout

| Path | Purpose |
| --- | --- |
| `manifest.json` | Manifest V3 entry point |
| `background.js` | Service worker: settings, requests, SSE parsing |
| `content.js` | Shortcut handling, selection, panel, render scheduling |
| `markdown.js` | Markdown/LaTeX parser, DOM renderer, incremental stream renderer |
| `options.*` | Settings page |
| `_locales/` | English and Simplified Chinese strings |
| `vendor/katex/` | Bundled KaTeX build and license |
| `test/` | Node test suite with a minimal DOM shim |
| `scripts/` | Manifest check, ZIP packaging, icon generation |
| `docs/ARCHITECTURE.md` | Runtime design and streaming commit algorithm |

## Code guidelines

- Vanilla ES2020, no runtime dependencies. Extension files stay classic scripts loaded by the
  manifest; do not add a build step.
- All model output is written with `textContent` or created nodes. Never build markup from model
  text with `innerHTML`; KaTeX is the only allowed exception and runs with `trust: false`.
- Links and images go through the protocol allowlist in `markdown.js`.
- Add or change strings in both `_locales/en` and `_locales/zh_CN`; `npm run check` enforces parity.
- Keep the renderer independent from Chrome APIs so it stays testable in Node.
- Two-space indentation, double quotes, semicolons. Comments explain why, not what.

## Commits and pull requests

- Use conventional prefixes: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- Keep one logical change per commit; describe user-visible behaviour in the body when it is not
  obvious from the title.
- Add a test for renderer changes and run `npm run verify`.
- If you change the icon, run `npm run icons` and commit the regenerated PNG files.

## Reporting security issues

Please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
