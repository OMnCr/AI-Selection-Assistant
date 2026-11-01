# Security policy

## Supported versions

The latest release on `main` (currently 1.5.x) receives security fixes. Older versions are not
maintained.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting: open the **Security** tab of this repository
and choose **Report a vulnerability**. Do not open a public issue for a suspected vulnerability.

Include what you can:

- the affected file or behaviour;
- steps to reproduce, ideally with the page type involved;
- the impact you expect;
- the extension version and browser version.

You can expect an acknowledgement within seven days. Because this is a small volunteer project,
please allow time for a fix before disclosing details publicly.

## Scope

In scope:

- content-script injection and escaping of model output;
- Markdown or KaTeX handling that could execute script or load unexpected resources;
- request handling in the service worker, including endpoint validation and error parsing;
- anything that could leak the stored API key or selected text to a third party.

Out of scope:

- the security of the endpoint you configure — that is your provider's responsibility;
- API keys stored in `chrome.storage.local` by design (documented in [PRIVACY.md](PRIVACY.md));
- browser-reserved shortcuts or pages where the browser blocks content scripts.

## Design notes

- The extension has no backend and no telemetry.
- Selected text and the rendered prompt go only to the Base URL configured in the options page.
- KaTeX is bundled locally and renders with `trust: false` and MathML output.
- Remote HTML is never injected; model output is written as text nodes.
