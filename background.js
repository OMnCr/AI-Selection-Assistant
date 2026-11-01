importScripts("i18n.js");

const t = AIInlineI18n.t;

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

const IDLE_TIMEOUT_MS = 90000;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_SELECTION_LENGTH = 100000;

async function getSettings() {
  const stored = await chrome.storage.local.get("settings");
  const settings = stored.settings || {};
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    prompts:
      Array.isArray(settings.prompts) && settings.prompts.length
        ? settings.prompts
        : DEFAULT_SETTINGS.prompts
  };
}

function toHttpUrl(value, message) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error(message);
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(t("baseUrlInvalid"));
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(t("baseUrlInvalid"));
  }
  return url;
}

function normalizeBaseUrl(baseUrl) {
  const url = toHttpUrl(baseUrl, t("baseUrlRequired"));
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname.endsWith("/chat/completions")
    ? pathname
    : `${pathname}/chat/completions`;
  return url.toString();
}

function normalizeModelsUrl(baseUrl) {
  const url = toHttpUrl(baseUrl, t("baseUrlFill"));
  let pathname = url.pathname.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(pathname)) {
    pathname = pathname.replace(/\/chat\/completions$/i, "");
  }
  url.pathname = `${pathname}/models`;
  return url.toString();
}

function authHeaders(apiKey) {
  const headers = { "Content-Type": "application/json" };
  const trimmed = String(apiKey || "").trim();
  if (trimmed) {
    headers.Authorization = `Bearer ${trimmed}`;
  }
  return headers;
}

function buildMessages(promptConfig, selection) {
  const template = String(promptConfig.prompt || "").trim();
  const promptText = template.includes("{{selection}}")
    ? template.split("{{selection}}").join(selection)
    : `${template}\n\n${selection}`;

  return [
    {
      role: "user",
      content: promptText
    }
  ];
}

function parseNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseInteger(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function buildRequestBody(settings, messages) {
  const body = {
    model: settings.model.trim(),
    stream: settings.stream !== false,
    messages
  };

  const temperature = parseNumber(settings.temperature);
  if (temperature !== null) {
    body.temperature = temperature;
  }

  const topP = parseNumber(settings.topP);
  if (topP !== null) {
    body.top_p = topP;
  }

  const maxTokens = parseInteger(settings.maxTokens);
  if (maxTokens !== null) {
    body.max_tokens = maxTokens;
  }

  if (
    settings.reasoningEffort &&
    settings.reasoningEffort !== "none" &&
    settings.reasoningEffort !== "default"
  ) {
    body.reasoning_effort = settings.reasoningEffort;
  }

  return body;
}

function parseSseLine(line, send) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(":")) {
    return;
  }
  if (!trimmed.startsWith("data:")) {
    return;
  }

  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(data);
  } catch {
    return;
  }

  const choice = payload.choices && payload.choices[0];
  const text = choice
    ? (choice.delta && choice.delta.content) ||
      (choice.message && choice.message.content) ||
      choice.text
    : payload.output_text;

  if (typeof text === "string" && text.length > 0) {
    send(text);
  }
}

async function readErrorDetail(response) {
  try {
    const body = await response.text();
    if (!body) {
      return "";
    }
    try {
      const parsed = JSON.parse(body);
      const error = parsed && parsed.error;
      if (typeof error === "string") {
        return error;
      }
      if (error && error.message) {
        return error.message;
      }
      if (parsed && typeof parsed.message === "string") {
        return parsed.message;
      }
    } catch {
      // Not JSON, fall through to a short excerpt.
    }
    return body.replace(/\s+/g, " ").trim().slice(0, 200);
  } catch {
    return "";
  }
}

async function handleStream(port, request) {
  const controller = new AbortController();
  let idleTimer = null;
  let timedOut = false;
  let closed = false;

  const clearIdleTimer = () => {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };

  const armIdleTimer = () => {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, IDLE_TIMEOUT_MS);
  };

  const post = (message) => {
    if (closed) {
      return false;
    }
    try {
      port.postMessage(message);
      return true;
    } catch {
      closed = true;
      return false;
    }
  };

  port.onDisconnect.addListener(() => {
    closed = true;
    clearIdleTimer();
    controller.abort();
  });

  try {
    if (
      !request ||
      typeof request.selection !== "string" ||
      !request.selection.trim()
    ) {
      throw new Error(t("noSelection"));
    }

    const promptIndex = Number(request.promptIndex);
    const settings = await getSettings();
    if (!settings.model || !settings.model.trim()) {
      throw new Error(t("modelRequired"));
    }

    const promptConfig = settings.prompts[promptIndex];
    if (!promptConfig || !String(promptConfig.prompt || "").trim()) {
      throw new Error(
        t("promptNotConfigured", [String(Number.isInteger(promptIndex) ? promptIndex + 1 : "?")])
      );
    }

    const selection = String(request.selection).slice(0, MAX_SELECTION_LENGTH);
    const url = normalizeBaseUrl(settings.baseUrl);

    armIdleTimer();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(settings.apiKey),
        Accept: settings.stream === false ? "application/json" : "text/event-stream"
      },
      body: JSON.stringify(
        buildRequestBody(settings, buildMessages(promptConfig, selection))
      ),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new Error(
        t("requestFailedHttp", [`${response.status}${detail ? ` - ${detail}` : ""}`])
      );
    }

    if (settings.stream === false) {
      const data = await response.json();
      const content =
        data.choices &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content;
      if (typeof content === "string" && content.length > 0) {
        post({ type: "chunk", text: content });
      }
      post({ type: "done" });
      return;
    }

    if (!response.body) {
      throw new Error(t("streamUnavailable"));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      armIdleTimer();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        parseSseLine(line, (text) => post({ type: "chunk", text }));
      }
    }

    if (buffer) {
      parseSseLine(buffer, (text) => post({ type: "chunk", text }));
    }

    post({ type: "done" });
  } catch (error) {
    if (closed) {
      return;
    }
    if (timedOut) {
      post({ type: "error", message: t("requestTimeout") });
      return;
    }
    if (error.name !== "AbortError") {
      post({ type: "error", message: error.message || String(error) });
    }
  } finally {
    clearIdleTimer();
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function listModels(request) {
  const url = normalizeModelsUrl(request && request.baseUrl);
  const headers = authHeaders(request && request.apiKey);
  delete headers["Content-Type"];

  let response;
  try {
    response = await fetchWithTimeout(url, { headers }, REQUEST_TIMEOUT_MS);
  } catch (error) {
    throw new Error(
      error.name === "AbortError" ? t("requestTimeout") : error.message || String(error)
    );
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(
      t("modelsRequestFailed", [`${response.status}${detail ? ` - ${detail}` : ""}`])
    );
  }

  const data = await response.json();
  const rawModels = Array.isArray(data) ? data : data.data || data.models;
  const models = Array.isArray(rawModels)
    ? rawModels
        .map((item) => (typeof item === "string" ? item : item && item.id))
        .filter((id) => typeof id === "string" && id.trim())
        .sort((a, b) => a.localeCompare(b))
    : [];

  return {
    ok: true,
    models
  };
}

async function testConnection(request) {
  const url = normalizeBaseUrl(request && request.baseUrl);
  const model = String((request && request.model) || "").trim();
  if (!model) {
    throw new Error(t("modelRequired"));
  }

  let response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: authHeaders(request && request.apiKey),
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            {
              role: "user",
              content: t("testPrompt")
            }
          ]
        })
      },
      REQUEST_TIMEOUT_MS
    );
  } catch (error) {
    throw new Error(
      error.name === "AbortError" ? t("requestTimeout") : error.message || String(error)
    );
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(`HTTP ${response.status}${detail ? ` - ${detail}` : ""}`);
  }

  const data = await response.json();
  const content =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;
  return {
    ok: true,
    message:
      typeof content === "string"
        ? t("connectionSuccess", [content.slice(0, 80)])
        : t("connectionSuccessShort")
  };
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ai-inline-stream") {
    return;
  }

  port.onMessage.addListener((message) => {
    if (message && message.type === "start") {
      handleStream(port, message.request);
    }
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "ai-inline-test-connection") {
    testConnection(message.request)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          ok: false,
          message: error.message || String(error)
        });
      });
    return true;
  }
  if (message && message.type === "ai-inline-list-models") {
    listModels(message.request)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          ok: false,
          message: error.message || String(error)
        });
      });
    return true;
  }
  return false;
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.runtime.openOptionsPage();
  }
  chrome.storage.local.get("settings").then((stored) => {
    if (!stored.settings) {
      return chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
    return undefined;
  });
});
