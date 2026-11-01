# AI Selection Assistant

A Chrome and Edge Manifest V3 extension for selected-text AI actions. Select text on a page, press a configurable shortcut plus a number, and stream a response below the selection.

![Extension icon](icons/icon128.png)

## Features

- Inline response panel anchored below the selection; no popup and no focus stealing.
- Streaming output (SSE with `stream: true`) with a **Stop** button while generating.
- **Incremental rendering**: only newly arrived Markdown is parsed, so committed blocks are never rebuilt and long answers stay smooth.
- Markdown rendering for headings, lists, task lists, tables, quotes, links, images and fenced code.
- LaTeX rendering for `$...$`, `$$...$$`, `\(...\)`, `\[...\]` and `\begin{...}` environments, powered by a locally bundled KaTeX (no remote code).
- Copy the raw Markdown reply; close the panel with `Esc` or a click outside it.
- Panel follows the system dark mode, scrolls long answers and repositions itself to stay inside the viewport.
- English and Simplified Chinese UI selected automatically from the browser language.
- Configurable Base URL, API Key and model; the **API Key is optional** for local or unauthenticated endpoints.
- Fetch available models from OpenAI-compatible `/models` endpoints.
- Nine prompt slots with individual enable/disable controls.
- `{{selection}}` placeholder in prompt templates; without it the selection is appended to the end.
- Configurable shortcut modifier (`Alt`, `Ctrl`, `Ctrl+Alt`, `Ctrl+Shift`, `Alt+Shift`, `Meta`) and generation parameters, validated before saving.
- Shortcuts are only intercepted when there is something to act on, so pages keep their own key bindings.

## Install

1. Open `chrome://extensions/` in Chrome or `edge://extensions/` in Edge.
2. Enable Developer mode.
3. Choose “Load unpacked”.
4. Select the repository root (the directory containing `manifest.json`).
5. Open the extension options and configure the endpoint.

## Usage

1. Select text in a page (regular text or text inside an input).
2. Press `Alt + 1` through `Alt + 9` by default.
3. Read the streamed response below the selection; press **Stop** to interrupt, or `Esc` / click outside to close.
4. **Copy** puts the raw Markdown into the clipboard.

## Configuration

| Option | Notes |
| --- | --- |
| Base URL | Enter the URL through `/v1`, or paste a full `/chat/completions` endpoint |
| API Key | Optional; when blank no `Authorization` header is sent |
| Model | Type a name or fetch the list from `/models` |
| Shortcut modifier | Selects `Alt+1`, `Ctrl+1`, `Ctrl+Alt+1`, … |
| Streaming | Disable to request a single non-streamed response |
| Reasoning level | Maps to `reasoning_effort`; “None” omits it |
| Temperature / Top P / Max tokens | Empty values use the API default |

## API compatibility

The extension sends OpenAI-compatible Chat Completions requests:

```http
POST {Base URL}/chat/completions
Authorization: Bearer {API Key}
Content-Type: application/json

{
  "model": "{model}",
  "stream": true,
  "messages": [
    { "role": "user", "content": "{prompt with selection}" }
  ]
}
```

Optional request parameters are sent only when configured: `temperature`, `top_p`, `max_tokens`, and `reasoning_effort`. The `none` reasoning level omits `reasoning_effort`.

## Development

No runtime dependencies; the source is the extension. Scripts cover verification, packaging and icon generation.

```bash
npm test          # unit tests (Markdown parsing, rendering, streaming parity)
npm run check     # manifest, icon sizes, i18n keys and placeholders
npm run verify    # check + test
npm run package   # dist/ai-selection-assistant-<version>.zip
npm run icons     # regenerate icons (requires Python 3 and Pillow)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design notes.

## Privacy and permissions

- `storage`: keeps settings and the API key on this device.
- `http://*/*`, `https://*/*`: call the user-configured Base URL and render the reply in the page.
- No telemetry. Selected text is only sent to the endpoint you configure.
- Details in [PRIVACY.md](PRIVACY.md).

## Known limitations

- Selections inside an iframe render the panel inside that iframe; very narrow frames can clip it.
- The API key is stored in plain text in `chrome.storage.local`, as is normal for extensions.
- The Markdown subset excludes raw HTML, reference links and footnotes.
- Some key combinations belong to the browser or the page (for example `Ctrl + number` for tabs).
- Selected text is capped at 100,000 characters per request.

## Contributing

- Development, tests and packaging are described in [CONTRIBUTING.md](CONTRIBUTING.md).
- Report security issues privately as described in [SECURITY.md](SECURITY.md).

## Author and license

- Author: OMnCr
- License: [GNU Affero General Public License v3.0](LICENSE)
- Formula rendering: [KaTeX](https://katex.org/), MIT licensed; see [vendor/katex/LICENSE](vendor/katex/LICENSE).

The bundled KaTeX code is loaded locally and does not execute remote code.
