const t = AIInlineI18n.t;

function applyStaticTranslations() {
  document.documentElement.lang = AIInlineI18n.locale;
  document.title = t("optionsTitle");
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
}

applyStaticTranslations();

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
  prompts: AIInlineI18n.defaultPrompts()
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
      name: t("promptFallback", [String(index + 1)]),
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
    enabledLabel.append(enabledInput, document.createTextNode(t("enable")));
    controlColumn.append(indexBadge, enabledLabel);

    const fields = document.createElement("div");
    fields.className = "prompt-fields";

    const nameField = document.createElement("div");
    nameField.className = "field";
    const nameLabel = document.createElement("label");
    nameLabel.textContent = t("nameLabel");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "prompt-name-input";
    nameInput.value = prompt.name || "";
    nameInput.dataset.index = String(index);
    nameField.append(nameLabel, nameInput);

    const promptField = document.createElement("div");
    promptField.className = "field";
    const promptLabel = document.createElement("label");
    promptLabel.textContent = t("promptTemplate");
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
  saveStatus.textContent = t("saved");
  window.setTimeout(() => {
    saveStatus.textContent = "";
  }, 1800);
}

async function restoreDefaults() {
  settings.prompts = cloneSettings(DEFAULT_SETTINGS.prompts);
  render();
  await saveSettings();
  saveStatus.textContent = t("defaultsRestored");
  window.setTimeout(() => {
    saveStatus.textContent = "";
  }, 1800);
}

async function testConnection() {
  const current = collectSettings();
  if (!current.baseUrl || !current.apiKey || !current.model) {
    testResult.className = "error";
    testResult.textContent = t("fillBaseUrlKeyModel");
    return;
  }

  testResult.className = "";
  testResult.textContent = t("testing");

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
    result.textContent = t("baseUrlRequiredShort");
    return;
  }

  result.className = "";
  result.textContent = t("fetchingModels");

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
      ? t("modelsFetched", [String(response.models.length)])
      : t("noModelsReturned");
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
  saveStatus.textContent = t("readSettingsFailed");
});
