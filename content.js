(() => {
  if (globalThis.__aiInlineAssistantLoaded) {
    return;
  }
  globalThis.__aiInlineAssistantLoaded = true;

  const t = AIInlineI18n.t;
  const DEFAULT_SETTINGS = {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    modifier: "alt",
    prompts: AIInlineI18n.defaultPrompts()
  };

  const PANEL_MARGIN = 8;
  const MIN_PANEL_WIDTH = 320;
  const MAX_PANEL_WIDTH = 720;
  const MAX_SELECTION_LENGTH = 100000;
  const NO_SELECTION_HINT_INTERVAL = 6000;
  const TOAST_DURATION = 3200;

  let currentSettings = {
    ...DEFAULT_SETTINGS,
    prompts: [...DEFAULT_SETTINGS.prompts]
  };
  let activePanel = null;
  let activePort = null;
  let lastHintAt = 0;

  /* ------------------------------------------------------------------ */
  /* Settings                                                            */
  /* ------------------------------------------------------------------ */

  function mergeSettings(raw = {}) {
    const prompts =
      Array.isArray(raw.prompts) && raw.prompts.length
        ? raw.prompts
        : DEFAULT_SETTINGS.prompts;
    return {
      ...DEFAULT_SETTINGS,
      ...raw,
      prompts: prompts.map((prompt) => ({
        ...prompt,
        enabled: prompt && prompt.enabled !== false
      }))
    };
  }

  async function loadSettings() {
    const stored = await chrome.storage.local.get("settings");
    currentSettings = mergeSettings(stored.settings || {});
  }

  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes.settings) {
        currentSettings = mergeSettings(changes.settings.newValue || {});
      }
    });
  } catch {
    // The extension context can be invalidated while the page stays open.
  }

  /* ------------------------------------------------------------------ */
  /* Shortcuts and selection                                             */
  /* ------------------------------------------------------------------ */

  function matchesModifier(event, modifier) {
    switch (modifier) {
      case "ctrl":
        return event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
      case "ctrl+alt":
        return event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey;
      case "ctrl+shift":
        return event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
      case "alt+shift":
        return event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey;
      case "meta":
        return event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
      case "alt":
      default:
        return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    }
  }

  function digitFromEvent(event) {
    const code = typeof event.code === "string" ? event.code : "";
    if (code.startsWith("Digit") && code.length === 6) {
      return Number.parseInt(code.slice(5), 10);
    }
    if (code.startsWith("Numpad") && code.length === 7) {
      return Number.parseInt(code.slice(6), 10);
    }
    return null;
  }

  function getPageSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const text = selection.toString().replace(/\u00a0/g, " ").trim();
    if (!text) {
      return null;
    }

    return { text, range };
  }

  function getInputSelection() {
    const active = document.activeElement;
    if (!active) {
      return null;
    }

    const tagName = active.tagName;
    const isInput = tagName === "INPUT" || tagName === "TEXTAREA";
    if (
      !isInput ||
      active.selectionStart === null ||
      active.selectionStart === undefined
    ) {
      return null;
    }

    const start = active.selectionStart;
    const end = active.selectionEnd;
    if (start === end) {
      return null;
    }

    const text = String(active.value || "")
      .slice(start, end)
      .replace(/\u00a0/g, " ")
      .trim();
    if (!text) {
      return null;
    }

    const rect = active.getBoundingClientRect();
    const fakeRange = document.createRange();
    try {
      fakeRange.setStart(active, 0);
      fakeRange.setEnd(active, 0);
    } catch {
      // Some controls reject range boundaries; the rect is all we need.
    }
    fakeRange.getBoundingClientRect = () => rect;
    return { text, range: fakeRange };
  }

  function getSelectionData() {
    return getPageSelection() || getInputSelection();
  }

  /* ------------------------------------------------------------------ */
  /* Panel                                                               */
  /* ------------------------------------------------------------------ */

  function createButton(label, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ai-inline-button ${className}`;
    button.textContent = label;
    button.title = label;
    return button;
  }

  function createPanel(promptName, range) {
    closePanel();

    if (!document.documentElement) {
      throw new Error(t("pageNotReady"));
    }

    const panel = document.createElement("section");
    panel.className = "ai-inline-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-label", promptName || t("assistantTitle"));

    const header = document.createElement("header");
    header.className = "ai-inline-header";

    const title = document.createElement("div");
    title.className = "ai-inline-title";
    title.textContent = promptName || t("assistantTitle");

    const actions = document.createElement("div");
    actions.className = "ai-inline-actions";

    const stopButton = createButton(t("stopGenerating"), "ai-inline-stop");
    const copyButton = createButton(t("copyReply"), "ai-inline-copy");
    const closeButton = createButton("×", "ai-inline-close");
    closeButton.setAttribute("aria-label", t("closePanel"));
    closeButton.title = t("closePanel");

    actions.append(stopButton, copyButton, closeButton);
    header.append(title, actions);

    const body = document.createElement("div");
    body.className = "ai-inline-body ai-inline-loading";
    body.dataset.loadingText = t("waitingForReply");

    const contentEl = document.createElement("div");
    contentEl.className =
      "ai-inline-content ai-inline-markdown ai-inline-streaming";
    body.append(contentEl);
    panel.append(header, body);
    document.documentElement.append(panel);

    stopButton.hidden = false;

    const state = {
      panel,
      header,
      title,
      body,
      contentEl,
      stopButton,
      copyButton,
      closeButton,
      baseTitle: title.textContent,
      rawText: "",
      renderer: AIInlineMarkdown.createStreamRenderer(contentEl),
      range,
      anchorRect: null,
      placeBelow: true,
      stickToBottom: true,
      renderFrame: null,
      placeFrame: null,
      finished: false,
      stopped: false,
      port: null,
      cleanup: () => {}
    };

    stopButton.addEventListener("click", () => stopStreaming(state));
    copyButton.addEventListener("click", () => {
      copyText(state.rawText, copyButton);
    });
    closeButton.addEventListener("click", () => closePanel());

    const anchorRect = measureAnchor(range);
    state.anchorRect = anchorRect;
    const viewportHeight = getViewportHeight();
    const panelHeight = panel.offsetHeight || 160;
    if (anchorRect) {
      const fitsBelow =
        anchorRect.bottom + PANEL_MARGIN + panelHeight <=
        viewportHeight - PANEL_MARGIN;
      const fitsAbove = anchorRect.top - panelHeight - PANEL_MARGIN >= PANEL_MARGIN;
      state.placeBelow = fitsBelow || !fitsAbove;
    }
    placePanel(state);

    const onScroll = () => {
      if (activePanel !== state) {
        return;
      }
      const rect = measureAnchor(state.range);
      if (!rect) {
        return;
      }
      if (
        rect.bottom < -PANEL_MARGIN ||
        rect.top > getViewportHeight() + PANEL_MARGIN
      ) {
        closePanel();
        return;
      }
      state.anchorRect = rect;
      schedulePlacement(state);
    };

    const onResize = () => {
      if (activePanel !== state) {
        return;
      }
      const rect = measureAnchor(state.range);
      if (rect) {
        state.anchorRect = rect;
      }
      schedulePlacement(state);
    };

    const onBodyScroll = () => {
      state.stickToBottom =
        state.body.scrollTop + state.body.clientHeight >=
        state.body.scrollHeight - 24;
    };

    const observer = new ResizeObserver(() => schedulePlacement(state));
    observer.observe(panel);

    body.addEventListener("scroll", onBodyScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    state.cleanup = () => {
      observer.disconnect();
      body.removeEventListener("scroll", onBodyScroll);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      if (state.renderFrame !== null) {
        window.cancelAnimationFrame(state.renderFrame);
        state.renderFrame = null;
      }
      if (state.placeFrame !== null) {
        window.cancelAnimationFrame(state.placeFrame);
        state.placeFrame = null;
      }
    };

    activePanel = state;
    return state;
  }

  function getViewportHeight() {
    return document.documentElement.clientHeight || window.innerHeight;
  }

  function getViewportWidth() {
    return document.documentElement.clientWidth || window.innerWidth;
  }

  function measureAnchor(range) {
    try {
      return range.getBoundingClientRect();
    } catch {
      return null;
    }
  }

  function placePanel(state) {
    const rect = state.anchorRect;
    if (!rect) {
      return;
    }

    const viewportWidth = getViewportWidth();
    const viewportHeight = getViewportHeight();
    const availableWidth = Math.max(240, viewportWidth - PANEL_MARGIN * 2);
    const width = Math.min(
      Math.max(rect.width, MIN_PANEL_WIDTH),
      MAX_PANEL_WIDTH,
      availableWidth
    );
    state.panel.style.width = `${Math.round(width)}px`;

    const height = state.panel.offsetHeight || 160;
    const maxTop = Math.max(PANEL_MARGIN, viewportHeight - height - PANEL_MARGIN);

    let top = state.placeBelow
      ? rect.bottom + PANEL_MARGIN
      : rect.top - height - PANEL_MARGIN;
    if (top < PANEL_MARGIN) {
      top = rect.bottom + PANEL_MARGIN;
    }
    top = Math.min(Math.max(PANEL_MARGIN, top), maxTop);

    let left = rect.left;
    left = Math.min(
      Math.max(PANEL_MARGIN, left),
      Math.max(PANEL_MARGIN, viewportWidth - width - PANEL_MARGIN)
    );

    state.panel.style.top = `${Math.round(top)}px`;
    state.panel.style.left = `${Math.round(left)}px`;
  }

  function schedulePlacement(state) {
    if (state.placeFrame !== null) {
      return;
    }
    state.placeFrame = window.requestAnimationFrame(() => {
      state.placeFrame = null;
      if (activePanel === state) {
        placePanel(state);
      }
    });
  }

  function closePanel() {
    const state = activePanel;
    if (!state) {
      return;
    }
    activePanel = null;
    releasePort(state);
    state.cleanup();
    state.panel.remove();
  }

  /* ------------------------------------------------------------------ */
  /* Streaming                                                           */
  /* ------------------------------------------------------------------ */

  function releasePort(state) {
    const port = state.port;
    state.port = null;
    if (activePort === port) {
      activePort = null;
    }
    if (port) {
      try {
        port.disconnect();
      } catch {
        // Already disconnected.
      }
    }
  }

  function scheduleRender(state) {
    if (state.renderFrame !== null) {
      return;
    }
    state.renderFrame = window.requestAnimationFrame(() => {
      state.renderFrame = null;
      if (activePanel !== state) {
        return;
      }
      state.renderer.update(state.rawText);
      if (state.stickToBottom) {
        state.body.scrollTop = state.body.scrollHeight;
      }
    });
  }

  function settlePanel(state) {
    if (state.renderFrame !== null) {
      window.cancelAnimationFrame(state.renderFrame);
      state.renderFrame = null;
    }
    state.renderer.finish(state.rawText);
    state.body.classList.remove("ai-inline-loading");
    state.contentEl.classList.remove("ai-inline-streaming");
    state.stopButton.hidden = true;
    if (state.stickToBottom) {
      state.body.scrollTop = state.body.scrollHeight;
    }
  }

  function showPanelMessage(state, message, isError) {
    state.renderer.finish(state.rawText);
    state.contentEl.className = "ai-inline-content ai-inline-plain";
    state.contentEl.textContent = message;
    state.contentEl.classList.remove("ai-inline-streaming");
    state.body.classList.remove("ai-inline-loading");
    if (isError) {
      state.body.classList.add("ai-inline-error");
    }
  }

  function appendErrorNote(state, message) {
    const note = document.createElement("p");
    note.className = "ai-inline-error-note";
    note.textContent = message;
    state.contentEl.append(note);
    state.body.classList.add("ai-inline-error");
  }

  function stopStreaming(state) {
    if (state.finished) {
      return;
    }
    state.stopped = true;
    state.finished = true;
    settlePanel(state);
    releasePort(state);
    state.title.textContent = `${state.baseTitle} · ${t("stopped")}`;
  }

  function copyText(text, button) {
    if (!text) {
      return;
    }

    const fallback = () => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      textarea.style.opacity = "0";
      document.documentElement.append(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        // Nothing else we can do.
      }
      textarea.remove();
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(fallback);
    } else {
      fallback();
    }

    button.textContent = t("copied");
    window.setTimeout(() => {
      button.textContent = t("copyReply");
    }, 1200);
  }

  async function runPrompt(promptIndex, selectionData) {
    const prompts = Array.isArray(currentSettings.prompts)
      ? currentSettings.prompts
      : [];
    const promptConfig = prompts[promptIndex];

    if (!promptConfig || !String(promptConfig.prompt || "").trim()) {
      showToast(t("promptNotConfigured", [String(promptIndex + 1)]));
      return;
    }
    if (promptConfig.enabled === false) {
      showToast(t("shortcutDisabled", [String(promptIndex + 1)]));
      return;
    }
    if (!currentSettings.baseUrl || !currentSettings.baseUrl.trim()) {
      showToast(t("configureBaseUrl"));
      return;
    }
    if (!currentSettings.model || !currentSettings.model.trim()) {
      showToast(t("configureModel"));
      return;
    }

    let selection = selectionData.text;
    if (selection.length > MAX_SELECTION_LENGTH) {
      selection = selection.slice(0, MAX_SELECTION_LENGTH);
    }

    const state = createPanel(
      promptConfig.name || t("promptFallback", [String(promptIndex + 1)]),
      selectionData.range
    );

    let port;
    try {
      port = chrome.runtime.connect({ name: "ai-inline-stream" });
    } catch {
      showPanelMessage(state, t("operationFailed"), true);
      return;
    }

    state.port = port;
    activePort = port;
    let receivedChunk = false;

    const finish = () => {
      if (state.finished) {
        return;
      }
      state.finished = true;
      settlePanel(state);
      releasePort(state);
    };

    port.onMessage.addListener((message) => {
      if (!message || activePanel !== state) {
        return;
      }

      if (message.type === "chunk") {
        if (!receivedChunk) {
          receivedChunk = true;
          state.body.classList.remove("ai-inline-loading");
        }
        state.rawText += message.text;
        scheduleRender(state);
        return;
      }

      if (message.type === "done") {
        finish();
        if (!state.rawText) {
          showPanelMessage(state, t("emptyResponse"), false);
        }
        return;
      }

      if (message.type === "error") {
        finish();
        if (state.rawText) {
          appendErrorNote(state, message.message || t("requestFailed"));
        } else {
          showPanelMessage(state, message.message || t("requestFailed"), true);
        }
      }
    });

    port.onDisconnect.addListener(() => {
      if (activePanel !== state || state.finished) {
        return;
      }
      state.finished = true;
      settlePanel(state);
      state.port = null;
      if (activePort === port) {
        activePort = null;
      }
      if (state.rawText) {
        appendErrorNote(state, t("connectionInterrupted"));
      } else {
        showPanelMessage(state, t("connectionInterrupted"), true);
      }
    });

    port.postMessage({
      type: "start",
      request: {
        promptIndex,
        selection
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Toast                                                               */
  /* ------------------------------------------------------------------ */

  function showToast(message) {
    if (!document.body) {
      return;
    }
    const existing = document.querySelector(".ai-inline-toast");
    if (existing) {
      existing.remove();
    }

    const toast = document.createElement("div");
    toast.className = "ai-inline-toast";
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.append(toast);

    const dismiss = () => toast.remove();
    toast.addEventListener("click", dismiss);
    window.setTimeout(dismiss, TOAST_DURATION);
  }

  function hintNoSelection() {
    const now = Date.now();
    if (now - lastHintAt < NO_SELECTION_HINT_INTERVAL) {
      return;
    }
    lastHintAt = now;
    showToast(t("noSelection"));
  }

  /* ------------------------------------------------------------------ */
  /* Global listeners                                                    */
  /* ------------------------------------------------------------------ */

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      const number = digitFromEvent(event);
      if (number === null || number < 1 || number > 9) {
        return;
      }
      if (!matchesModifier(event, currentSettings.modifier)) {
        return;
      }

      const promptIndex = number - 1;
      const prompts = Array.isArray(currentSettings.prompts)
        ? currentSettings.prompts
        : [];
      const promptConfig = prompts[promptIndex];
      if (
        !promptConfig ||
        !String(promptConfig.prompt || "").trim() ||
        promptConfig.enabled === false
      ) {
        return;
      }

      const selectionData = getSelectionData();
      if (!selectionData) {
        // Never swallow a key the page may own when there is nothing to act on.
        hintNoSelection();
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      if (event.repeat) {
        return;
      }

      runPrompt(promptIndex, selectionData).catch(() => {
        showToast(t("operationFailed"));
      });
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !activePanel) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closePanel();
    },
    true
  );

  document.addEventListener(
    "mousedown",
    (event) => {
      if (event.button !== 0 || !activePanel) {
        return;
      }
      if (event.target && activePanel.panel.contains(event.target)) {
        return;
      }
      closePanel();
    },
    true
  );

  loadSettings().catch(() => {
    // Storage can be unavailable in rare cases; the defaults remain usable.
  });
})();
