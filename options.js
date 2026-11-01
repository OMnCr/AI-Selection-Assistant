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
const baseUrlInput = document.getElementById("baseUrl");
const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const toggleApiKey = document.getElementById("toggle-api-key");

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

function showVersion() {
  const version = document.getElementById("version");
  if (!version) {
    return;
  }
  try {
    version.textContent = `v${chrome.runtime.getManifest().version}`;
  } catch {
    version.textContent = "";
  }
}

async function loadSettings() {
  const stored = await chrome.storage.local.get("settings");
  const raw = stored.settings || {};
  settings = {
    ...DEFAULT_SETTINGS,
    ...raw,
    prompts:
      Array.isArray(raw.prompts) && raw.prompts.length
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
  baseUrlInput.value = settings.baseUrl;
  apiKeyInput.value = settings.apiKey;
  modelInput.value = settings.model;
  document.getElementById("modifier").value = settings.modifier;
  document.getElementById("stream").checked = settings.stream !== false;
  document.getElementById("temperature").value = settings.temperature || "";
  document.getElementById("topP").value = settings.topP || "";
  document.getElementById("maxTokens").value = settings.maxTokens || "";
  document.getElementById("reasoningEffort").value =
    settings.reasoningEffort || "none";

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
    const nameInput = promptList.querySelector(
      `.prompt-name-input[data-index="${index}"]`
    );
    const promptInput = promptList.querySelector(
      `.prompt-prompt-input[data-index="${index}"]`
    );
    const enabledInput = promptList.querySelector(
      `.prompt-enabled-input[data-index="${index}"]`
    );
    return {
      id: prompt.id || `prompt-${index + 1}`,
      name: nameInput ? nameInput.value.trim() : prompt.name,
      enabled: enabledInput ? enabledInput.checked : prompt.enabled !== false,
      prompt: promptInput ? promptInput.value : prompt.prompt
    };
  });

  return {
    baseUrl: baseUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
    modifier: document.getElementById("modifier").value,
    stream: document.getElementById("stream").checked,
    temperature: document.getElementById("temperature").value.trim(),
    topP: document.getElementById("topP").value.trim(),
    maxTokens: document.getElementById("maxTokens").value.trim(),
    reasoningEffort: document.getElementById("reasoningEffort").value,
    prompts
  };
}

function clearFieldErrors() {
  document.querySelectorAll(".field.has-error").forEach((field) => {
    field.classList.remove("has-error");
  });
  document.querySelectorAll("[aria-invalid='true']").forEach((element) => {
    element.removeAttribute("aria-invalid");
  });
}

function markFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (field) {
    field.setAttribute("aria-invalid", "true");
    const wrapper = field.closest(".field");
    if (wrapper) {
      wrapper.classList.add("has-error");
    }
    field.focus();
  }
  setStatus(saveStatus, message, true);
}

function setStatus(element, message, isError) {
  if (!element) {
    return;
  }
  element.textContent = message;
  element.classList.toggle("error", Boolean(isError));
  element.classList.toggle("ok", !isError && Boolean(message));
}

function parseOptionalNumber(value) {
  if (value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function validate(draft) {
  if (!draft.baseUrl) {
    return { fieldId: "baseUrl", message: t("baseUrlRequiredShort") };
  }
  try {
    const url = new URL(draft.baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    return { fieldId: "baseUrl", message: t("baseUrlInvalidShort") };
  }
  if (!draft.model) {
    return { fieldId: "model", message: t("modelRequired") };
  }

  const temperature = parseOptionalNumber(draft.temperature);
  if (Number.isNaN(temperature) || (temperature !== null && (temperature < 0 || temperature > 2))) {
    return { fieldId: "temperature", message: t("invalidTemperature") };
  }

  const topP = parseOptionalNumber(draft.topP);
  if (Number.isNaN(topP) || (topP !== null && (topP < 0 || topP > 1))) {
    return { fieldId: "topP", message: t("invalidTopP") };
  }

  const maxTokens = parseOptionalNumber(draft.maxTokens);
  if (
    Number.isNaN(maxTokens) ||
    (maxTokens !== null && (!Number.isInteger(maxTokens) || maxTokens < 1))
  ) {
    return { fieldId: "maxTokens", message: t("invalidMaxTokens") };
  }

  return null;
}

async function saveSettings() {
  clearFieldErrors();
  const draft = collectSettings();
  const problem = validate(draft);
  if (problem) {
    markFieldError(problem.fieldId, problem.message);
    return;
  }

  settings = draft;
  try {
    await chrome.storage.local.set({ settings });
    setStatus(saveStatus, t("saved"), false);
    window.setTimeout(() => setStatus(saveStatus, "", false), 1800);
  } catch (error) {
    setStatus(saveStatus, error.message || t("saveFailed"), true);
  }
}

async function restoreDefaults() {
  settings.prompts = cloneSettings(DEFAULT_SETTINGS.prompts);
  render();
  await chrome.storage.local.set({ settings: collectSettings() });
  setStatus(saveStatus, t("defaultsRestored"), false);
  window.setTimeout(() => setStatus(saveStatus, "", false), 1800);
}

async function testConnection() {
  const current = collectSettings();
  if (!current.baseUrl || !current.model) {
    setStatus(testResult, t("fillBaseUrlKeyModel"), true);
    return;
  }

  setStatus(testResult, t("testing"), false);
  try {
    const response = await chrome.runtime.sendMessage({
      type: "ai-inline-test-connection",
      request: current
    });
    setStatus(testResult, response.message, !response.ok);
  } catch (error) {
    setStatus(testResult, error.message || String(error), true);
  }
}

async function fetchModels() {
  const result = document.getElementById("model-list-result");
  const baseUrl = baseUrlInput.value.trim();
  const apiKey = apiKeyInput.value.trim();

  if (!baseUrl) {
    setStatus(result, t("baseUrlRequiredShort"), true);
    return;
  }

  setStatus(result, t("fetchingModels"), false);
  try {
    const response = await chrome.runtime.sendMessage({
      type: "ai-inline-list-models",
      request: { baseUrl, apiKey }
    });

    if (!response.ok) {
      setStatus(result, response.message, true);
      return;
    }

    const datalist = document.getElementById("model-list");
    datalist.replaceChildren();
    for (const modelId of response.models) {
      const option = document.createElement("option");
      option.value = modelId;
      datalist.append(option);
    }

    setStatus(
      result,
      response.models.length
        ? t("modelsFetched", [String(response.models.length)])
        : t("noModelsReturned"),
      false
    );
  } catch (error) {
    setStatus(result, error.message || String(error), true);
  }
}

document.getElementById("save-top").addEventListener("click", saveSettings);
document.getElementById("save-bottom").addEventListener("click", saveSettings);
document
  .getElementById("restore-defaults")
  .addEventListener("click", restoreDefaults);
document
  .getElementById("test-connection")
  .addEventListener("click", testConnection);
document.getElementById("fetch-models").addEventListener("click", fetchModels);
document.getElementById("modifier").addEventListener("change", () => {
  settings.modifier = document.getElementById("modifier").value;
  const shortcutLabel = modifierLabel(settings.modifier);
  promptList.querySelectorAll(".prompt-index").forEach((badge, index) => {
    badge.textContent = `${shortcutLabel}+${index + 1}`;
  });
});

toggleApiKey.addEventListener("click", () => {
  const revealed = apiKeyInput.type === "text";
  apiKeyInput.type = revealed ? "password" : "text";
  toggleApiKey.textContent = revealed ? t("showApiKey") : t("hideApiKey");
});

let lastBaseUrl = baseUrlInput.value;
baseUrlInput.addEventListener("blur", () => {
  const nextBaseUrl = baseUrlInput.value.trim();
  if (nextBaseUrl && nextBaseUrl !== lastBaseUrl && apiKeyInput.value.trim()) {
    fetchModels();
  }
  lastBaseUrl = nextBaseUrl;
});

[baseUrlInput, modelInput].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveSettings();
    }
  });
});

showVersion();
loadSettings().catch(() => {
  setStatus(saveStatus, t("readSettingsFailed"), true);
});
