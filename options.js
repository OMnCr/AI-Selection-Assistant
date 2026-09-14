const DEFAULT_SETTINGS = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  modifier: "alt",
  stream: true,
  temperature: "",
  topP: "",
  maxTokens: "",
  reasoningEffort: "none",
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

const promptList = document.getElementById("prompt-list");
const saveStatus = document.getElementById("save-status");
const testResult = document.getElementById("test-result");

function cloneSettings(value) {
  return JSON.parse(JSON.stringify(value));
}

let settings = cloneSettings(DEFAULT_SETTINGS);

function modifierLabel(modifier) {
  const labels = {
    alt: "Alt",
    ctrl: "Ctrl",
    "ctrl+alt": "Ctrl+Alt",
    "ctrl+shift": "Ctrl+Shift",
    "alt+shift": "Alt+Shift",
    meta: "Meta"
  };
  return labels[modifier] || "Alt";
}

async function loadSettings() {
  const stored = await chrome.storage.local.get("settings");
  const raw = stored.settings || {};
  settings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    prompts: Array.isArray(raw.prompts) && raw.prompts.length
      ? raw.prompts
      : cloneSettings(DEFAULT_SETTINGS.prompts)
  };

  while (settings.prompts.length < 9) {
    const index = settings.prompts.length;
    settings.prompts.push({
      id: `prompt-${index + 1}`,
      name: `提示词 ${index + 1}`,
      prompt: "{{selection}}"
    });
  }

  settings.prompts = settings.prompts.slice(0, 9).map((prompt) => ({
    ...prompt,
    enabled: prompt && prompt.enabled !== false
  }));
  render();
}

function render() {
  const shortcutLabel = modifierLabel(settings.modifier);
  document.getElementById("baseUrl").value = settings.baseUrl;
  document.getElementById("apiKey").value = settings.apiKey;
  document.getElementById("model").value = settings.model;
  document.getElementById("modifier").value = settings.modifier;
  document.getElementById("stream").checked = settings.stream !== false;
  document.getElementById("temperature").value = settings.temperature || "";
  document.getElementById("topP").value = settings.topP || "";
  document.getElementById("maxTokens").value = settings.maxTokens || "";
  document.getElementById("reasoningEffort").value = settings.reasoningEffort || "none";

  promptList.replaceChildren();
  settings.prompts.forEach((prompt, index) => {
    const item = document.createElement("div");
    item.className = "prompt-item";

    const indexBadge = document.createElement("span");
    indexBadge.className = "prompt-index";
    indexBadge.textContent = `${shortcutLabel}+${index + 1}`;

    const controlColumn = document.createElement("div");
    controlColumn.className = "prompt-control";

    const enabledLabel = document.createElement("label");
    enabledLabel.className = "prompt-enabled-label";
    const enabledInput = document.createElement("input");
    enabledInput.type = "checkbox";
    enabledInput.className = "prompt-enabled-input";
    enabledInput.checked = prompt.enabled !== false;
    enabledInput.dataset.index = String(index);
    enabledLabel.append(enabledInput, document.createTextNode("启用"));
    controlColumn.append(indexBadge, enabledLabel);

    const fields = document.createElement("div");
    fields.className = "prompt-fields";

    const nameField = document.createElement("div");
    nameField.className = "field";
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "名称";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "prompt-name-input";
    nameInput.value = prompt.name || "";
    nameInput.dataset.index = String(index);
    nameField.append(nameLabel, nameInput);

    const promptField = document.createElement("div");
    promptField.className = "field";
    const promptLabel = document.createElement("label");
    promptLabel.textContent = "提示词模板";
    const promptInput = document.createElement("textarea");
    promptInput.className = "prompt-prompt-input";
    promptInput.value = prompt.prompt || "";
    promptInput.dataset.index = String(index);
    promptField.append(promptLabel, promptInput);

    fields.append(nameField, promptField);
    item.append(controlColumn, fields);
    promptList.append(item);
  });
}

function collectSettings() {
  const prompts = settings.prompts.map((prompt, index) => {
    const nameInput = promptList.querySelector(`.prompt-name-input[data-index="${index}"]`);
    const promptInput = promptList.querySelector(`.prompt-prompt-input[data-index="${index}"]`);
    const enabledInput = promptList.querySelector(`.prompt-enabled-input[data-index="${index}"]`);
    return {
      id: prompt.id || `prompt-${index + 1}`,
      name: nameInput ? nameInput.value.trim() : prompt.name,
      enabled: enabledInput ? enabledInput.checked : prompt.enabled !== false,
      prompt: promptInput ? promptInput.value : prompt.prompt
    };
  });

  return {
    baseUrl: document.getElementById("baseUrl").value.trim(),
    apiKey: document.getElementById("apiKey").value.trim(),
    model: document.getElementById("model").value.trim(),
    modifier: document.getElementById("modifier").value,
    stream: document.getElementById("stream").checked,
    temperature: document.getElementById("temperature").value.trim(),
    topP: document.getElementById("topP").value.trim(),
    maxTokens: document.getElementById("maxTokens").value.trim(),
    reasoningEffort: document.getElementById("reasoningEffort").value,
    prompts
  };
}

async function saveSettings() {
  settings = collectSettings();
  await chrome.storage.local.set({ settings });
  saveStatus.textContent = "已保存";
  window.setTimeout(() => {
    saveStatus.textContent = "";
  }, 1800);
}

async function restoreDefaults() {
  settings.prompts = cloneSettings(DEFAULT_SETTINGS.prompts);
  render();
  await saveSettings();
  saveStatus.textContent = "已恢复默认设置";
  window.setTimeout(() => {
    saveStatus.textContent = "";
  }, 1800);
}

async function testConnection() {
  const current = collectSettings();
  if (!current.baseUrl || !current.apiKey || !current.model) {
    testResult.className = "error";
    testResult.textContent = "请先填写 Base URL、API Key 和模型名称";
    return;
  }

  testResult.className = "";
  testResult.textContent = "正在测试…";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "ai-inline-test-connection",
      request: current
    });
    testResult.className = response.ok ? "ok" : "error";
    testResult.textContent = response.message;
  } catch (error) {
    testResult.className = "error";
    testResult.textContent = error.message || String(error);
  }
}

async function fetchModels() {
  const result = document.getElementById("model-list-result");
  const baseUrl = document.getElementById("baseUrl").value.trim();
  const apiKey = document.getElementById("apiKey").value.trim();

  if (!baseUrl) {
    result.className = "error";
    result.textContent = "请先填写 Base URL";
    return;
  }

  result.className = "";
  result.textContent = "正在获取模型列表…";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "ai-inline-list-models",
      request: { baseUrl, apiKey }
    });

    if (!response.ok) {
      result.className = "error";
      result.textContent = response.message;
      return;
    }

    const datalist = document.getElementById("model-list");
    datalist.replaceChildren();
    for (const modelId of response.models) {
      const option = document.createElement("option");
      option.value = modelId;
      datalist.append(option);
    }

    result.className = "ok";
    result.textContent = response.models.length
      ? `已获取 ${response.models.length} 个模型，可点击模型输入框选择。`
      : "接口没有返回模型列表。";
  } catch (error) {
    result.className = "error";
    result.textContent = error.message || String(error);
  }
}

document.getElementById("save-top").addEventListener("click", saveSettings);
document.getElementById("save-bottom").addEventListener("click", saveSettings);
document.getElementById("restore-defaults").addEventListener("click", restoreDefaults);
document.getElementById("test-connection").addEventListener("click", testConnection);
document.getElementById("fetch-models").addEventListener("click", fetchModels);
document.getElementById("modifier").addEventListener("change", () => {
  settings.modifier = document.getElementById("modifier").value;
  const shortcutLabel = modifierLabel(settings.modifier);
  promptList.querySelectorAll(".prompt-index").forEach((badge, index) => {
    badge.textContent = `${shortcutLabel}+${index + 1}`;
  });
});

const baseUrlInput = document.getElementById("baseUrl");
let lastBaseUrl = baseUrlInput.value;
baseUrlInput.addEventListener("blur", () => {
  const nextBaseUrl = baseUrlInput.value.trim();
  if (nextBaseUrl && nextBaseUrl !== lastBaseUrl && document.getElementById("apiKey").value.trim()) {
    fetchModels();
  }
  lastBaseUrl = nextBaseUrl;
});

loadSettings().catch(() => {
  saveStatus.textContent = "读取设置失败";
});
