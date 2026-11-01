# Changelog

## 1.5.0

### Added

- Extension icon set (16/32/48/128 PNG, SVG source) and icon generator script.
- Stop generation button; `Esc` and explicit close button; clicking outside the panel no longer closes it while selecting text inside.
- Optional API key (local or unauthenticated endpoints work without `Authorization`).
- Generation request timeout and idle watchdog with a dedicated error message.
- Options page validation for Base URL and numeric parameters, API key visibility toggle, version badge, GitHub link.
- Dark mode for the in-page panel and reduced-motion support.
- Unit tests for Markdown parsing/rendering and streaming parity, manifest/locale checks, dependency-free ZIP packaging, and a GitHub Actions workflow.

### Changed

- Markdown pipeline rewritten as a parser (plain descriptors) plus a DOM renderer, with an incremental streaming renderer that only re-parses the uncommitted tail.
- Panel positioning moved to `position: fixed` with viewport clamping, resize observation and scroll tracking.
- Shortcuts are only swallowed when a selection and a runnable prompt exist.
- Content script now runs on `http`/`https` pages only; manifest drops the unrecognized `author` key and gains `minimum_chrome_version`.
- API requests validate the Base URL protocol and surface non-JSON error bodies.
- README/README.en rewritten; privacy policy and architecture notes added.

### Fixed

- Panel entrance animation reused the toast keyframes and shifted the panel horizontally for 120 ms; toast keyframes lost their horizontal centering.
- Panel height was measured once, so responses near the viewport edge could overflow.
- Raw `<...>` text was auto-linked as a relative URL; only absolute `http(s)`/`mailto` autolinks are rendered now.

## 1.4.0

- English localization and offline KaTeX math rendering (previous release line).
