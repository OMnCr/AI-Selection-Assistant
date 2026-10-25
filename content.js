(() => {
  const DEFAULT_SETTINGS = {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    modifier: "alt",
    prompts: [
      { id: "prompt-1", name: "总结", enabled: true, prompt: "请用简洁的中文总结下面的内容：\n\n{{selection}}" },
      { id: "prompt-2", name: "翻译", enabled: true, prompt: "请把下面的内容翻译成中文：\n\n{{selection}}" },
      { id: "prompt-3", name: "解释", enabled: true, prompt: "请解释下面这段内容，尽量通俗易懂：\n\n{{selection}}" },
      { id: "prompt-4", name: "润色", enabled: true, prompt: "请在不改变原意的前提下润色下面的文字：\n\n{{selection}}" },
      { id: "prompt-5", name: "提取要点", enabled: true, prompt: "请提取下面内容的关键要点，并使用无序列表输出：\n\n{{selection}}" },
      { id: "prompt-6", name: "改写", enabled: true, prompt: "请用另一种表达方式改写下面的内容：\n\n{{selection}}" },
      { id: "prompt-7", name: "回答问题", enabled: true, prompt: "请基于下面的内容回答问题：\n\n{{selection}}" },
      { id: "prompt-8", name: "生成标题", enabled: true, prompt: "请为下面的内容生成 3 个吸引人的标题：\n\n{{selection}}" },
      { id: "prompt-9", name: "自定义", enabled: true, prompt: "{{selection}}" }
    ]
  };

  let currentSettings = { ...DEFAULT_SETTINGS, prompts: [...DEFAULT_SETTINGS.prompts] };
  let activePanel = null;
  let activePort = null;

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

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.settings) {
      currentSettings = mergeSettings(changes.settings.newValue || {});
    }
  });

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
    if (event.code.startsWith("Digit") && event.code.length === 6) {
      return Number.parseInt(event.code.slice(5), 10);
    }
    if (event.code.startsWith("Numpad") && event.code.length === 7) {
      return Number.parseInt(event.code.slice(6), 10);
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
    if (!isInput || active.selectionStart === null || active.selectionStart === undefined) {
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
    fakeRange.setStart(active, 0);
    fakeRange.setEnd(active, 0);
    fakeRange.getBoundingClientRect = () => rect;
    return { text, range: fakeRange };
  }

  function getSelectionData() {
    return getPageSelection() || getInputSelection();
  }

  function createPanel(promptName, range) {
    closePanel();

    if (!document.body) {
      throw new Error("页面尚未准备好");
    }

    const panel = document.createElement("section");
    panel.className = "ai-inline-panel";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");

    const header = document.createElement("header");
    header.className = "ai-inline-header";

    const title = document.createElement("div");
    title.className = "ai-inline-title";
    title.textContent = promptName || "AI 助手";

    const actions = document.createElement("div");
    actions.className = "ai-inline-actions";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "ai-inline-button";
    copyButton.textContent = "复制";
    copyButton.title = "复制回复";

    actions.append(copyButton);
    header.append(title, actions);

    const body = document.createElement("div");
    body.className = "ai-inline-body";
    body.classList.add("ai-inline-loading");

    const contentEl = document.createElement("div");
    contentEl.className = "ai-inline-content ai-inline-markdown ai-inline-streaming";
    body.append(contentEl);
    panel.append(header, body);
    document.body.appendChild(panel);

    positionPanel(panel, range);

    const state = {
      panel,
      contentEl,
      body,
      copyButton,
      rawText: "",
      renderFrame: null
    };

    copyButton.addEventListener("click", () => {
      const finalText = state.rawText;
      if (!finalText) {
        return;
      }
      const fallbackCopy = () => {
        const fallback = document.createElement("textarea");
        fallback.value = finalText;
        fallback.style.position = "fixed";
        fallback.style.opacity = "0";
        document.body.appendChild(fallback);
        fallback.select();
        document.execCommand("copy");
        fallback.remove();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(finalText).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
      copyButton.textContent = "已复制";
      window.setTimeout(() => {
        copyButton.textContent = "复制";
      }, 1200);
    });

    activePanel = state;

    return activePanel;
  }

  function renderPanelMarkdown(panel) {
    const renderer = globalThis.AIInlineMarkdown;
    try {
      if (renderer && typeof renderer.render === "function") {
        panel.contentEl.replaceChildren(renderer.render(panel.rawText));
      } else {
        panel.contentEl.classList.add("ai-inline-plain");
        panel.contentEl.textContent = panel.rawText;
      }
    } catch {
      panel.contentEl.classList.add("ai-inline-plain");
      panel.contentEl.textContent = panel.rawText;
    }
    panel.body.scrollTop = panel.body.scrollHeight;
  }

  function schedulePanelRender(panel) {
    if (panel.renderFrame !== null) {
      return;
    }
    panel.renderFrame = window.requestAnimationFrame(() => {
      panel.renderFrame = null;
      if (activePanel === panel) {
        renderPanelMarkdown(panel);
      }
    });
  }

  function flushPanelRender(panel) {
    if (panel.renderFrame !== null) {
      window.cancelAnimationFrame(panel.renderFrame);
      panel.renderFrame = null;
    }
    renderPanelMarkdown(panel);
  }

  function showPanelError(panel, message) {
    if (panel.renderFrame !== null) {
      window.cancelAnimationFrame(panel.renderFrame);
      panel.renderFrame = null;
    }
    panel.rawText = message || "请求失败";
    panel.contentEl.classList.remove("ai-inline-streaming");
    panel.contentEl.classList.add("ai-inline-plain");
    panel.contentEl.textContent = panel.rawText;
    panel.body.scrollTop = panel.body.scrollHeight;
  }

  function positionPanel(panel, range) {
    const rect = range.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 340), 720);
    panel.style.width = `${width}px`;

    const panelHeight = panel.offsetHeight || 180;
    const panelWidth = panel.offsetWidth || width;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;

    let top = scrollY + rect.bottom + 8;
    if (rect.bottom + 8 + panelHeight > viewportHeight && rect.top - 8 - panelHeight > 0) {
      top = scrollY + rect.top - panelHeight - 8;
    }

    const leftRaw = scrollX + rect.left;
    const maxLeft = Math.max(8, document.documentElement.scrollWidth - panelWidth - 8);
    const left = Math.min(Math.max(8, leftRaw), maxLeft);

    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
  }

  function closePanel() {
    if (activePort) {
      try {
        activePort.disconnect();
      } catch {
        // Ignore disconnection errors.
      }
      activePort = null;
    }
    if (activePanel) {
      if (activePanel.renderFrame !== null) {
        window.cancelAnimationFrame(activePanel.renderFrame);
      }
      activePanel.panel.remove();
      activePanel = null;
    }
  }

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
    toast.textContent = message;
    document.body.appendChild(toast);
    toast.addEventListener("click", () => toast.remove());
  }

  async function runPrompt(promptIndex, selectionData) {
    const prompts = Array.isArray(currentSettings.prompts) ? currentSettings.prompts : [];
    const promptConfig = prompts[promptIndex];
    if (!promptConfig || !String(promptConfig.prompt || "").trim()) {
      showToast(`第 ${promptIndex + 1} 个提示词尚未配置`);
      return;
    }
    if (promptConfig.enabled === false) {
      showToast(`第 ${promptIndex + 1} 个快捷键已禁用`);
      return;
    }
    if (!currentSettings.baseUrl || !currentSettings.baseUrl.trim()) {
      showToast("请先在扩展选项中配置 Base URL");
      return;
    }
    if (!currentSettings.apiKey || !currentSettings.apiKey.trim()) {
      showToast("请先在扩展选项中配置 API Key");
      return;
    }
    if (!currentSettings.model || !currentSettings.model.trim()) {
      showToast("请先在扩展选项中配置模型名称");
      return;
    }

    const panel = createPanel(promptConfig.name || `提示词 ${promptIndex + 1}`, selectionData.range);

    const port = chrome.runtime.connect({ name: "ai-inline-stream" });
    activePort = port;

    let receivedChunk = false;
    let finished = false;

    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      panel.body.classList.remove("ai-inline-loading");
      panel.contentEl.classList.remove("ai-inline-streaming");
      if (activePort === port) {
        activePort = null;
      }
      try {
        port.disconnect();
      } catch {
        // Ignore disconnection errors.
      }
    };

    port.onMessage.addListener((message) => {
      if (!message) {
        return;
      }

      if (message.type === "chunk") {
        if (!receivedChunk) {
          receivedChunk = true;
          panel.body.classList.remove("ai-inline-loading");
        }
        panel.rawText += message.text;
        schedulePanelRender(panel);
      } else if (message.type === "done") {
        flushPanelRender(panel);
        finish();
      } else if (message.type === "error") {
        panel.body.classList.remove("ai-inline-loading");
        panel.body.classList.add("ai-inline-error");
        showPanelError(panel, message.message || "请求失败");
        finish();
      }
    });

    port.onDisconnect.addListener(() => {
      if (!finished && activePort === port) {
        panel.body.classList.remove("ai-inline-loading");
        panel.body.classList.add("ai-inline-error");
        if (!panel.rawText) {
          showPanelError(panel, "连接已中断，请重试。");
        } else {
          flushPanelRender(panel);
          panel.contentEl.classList.remove("ai-inline-streaming");
        }
        finish();
      }
    });

    port.postMessage({
      type: "start",
      request: {
        promptIndex,
        selection: selectionData.text
      }
    });
  }

  window.addEventListener(
    "keydown",
    (event) => {
      const number = digitFromEvent(event);
      if (number === null || number < 1 || number > 9) {
        return;
      }
      if (!matchesModifier(event, currentSettings.modifier)) {
        return;
      }
      if (event.repeat) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const selectionData = getSelectionData();
      if (!selectionData) {
        showToast("请先选中网页中的文字");
        return;
      }

      runPrompt(number - 1, selectionData).catch(() => {
        showToast("操作失败，请重试");
      });
    },
    true
  );

  document.addEventListener(
    "mousedown",
    (event) => {
      if (
        event.button === 0 &&
        activePanel &&
        !(event.target && event.target.closest && event.target.closest(".ai-inline-actions"))
      ) {
        closePanel();
      }
    },
    true
  );

  loadSettings().catch(() => {
    // Storage access can fail in rare cases; keep defaults.
  });
})();
