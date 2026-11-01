# AI Selection Assistant

A Chrome and Edge Manifest V3 extension for selected-text AI actions. Select text on a page, press a configurable shortcut plus a number, and stream a response below the selection.

## Features

- Inline response panel with streaming and Markdown rendering.
- Local LaTeX-to-MathML rendering for `$...$`, `$$...$$`, `\(...\)`, `\[...\]`, and `\begin{...}` environments.
- Configurable Base URL, API Key, model, streaming, reasoning level, temperature, Top P, and max tokens.
- Fetch available models from OpenAI-compatible `/models` endpoints.
- Nine prompt slots with individual enable/disable controls.
- English and Simplified Chinese UI selected automatically from the browser language.
- `{{selection}}` placeholder in prompt templates.

## Install

1. Open `chrome://extensions/` in Chrome or `edge://extensions/` in Edge.
2. Enable Developer mode.
3. Choose “Load unpacked”.
4. Select the `projects/ai-inline-assistant` directory.
5. Open the extension options and configure the API endpoint.

## Usage

1. Select text in a page.
2. Press `Alt + 1` through `Alt + 9` by default.
3. Read the streamed response below the selection.
4. Left-click anywhere to close the response panel.

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

## Author and license

- Author: OMnCr
- License: [GNU Affero General Public License v3.0](LICENSE)
- Formula rendering: [KaTeX](https://katex.org/), licensed under MIT; see [vendor/katex/LICENSE](vendor/katex/LICENSE).

The bundled KaTeX code is loaded locally and does not execute remote code.
