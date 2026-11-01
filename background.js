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

async function getSettings() {
  const stored = await chrome.storage.local.get("settings");
  const settings = stored.settings || {};
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    prompts: Array.isArray(settings.prompts) && settings.prompts.length
      ? settings.prompts
      : DEFAULT_SETTINGS.prompts
  };
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim();
  if (!trimmed) {
    throw new Error(t("baseUrlRequired"));
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(t("baseUrlInvalid"));
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname.endsWith("/chat/completions")
    ? pathname
    : `${pathname}/chat/completions`;

  return url.toString();
}

function normalizeModelsUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim();
  if (!trimmed) {
    throw new Error(t("baseUrlFill"));
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(t("baseUrlInvalid"));
  }

  let pathname = url.pathname.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(pathname)) {
    pathname = pathname.replace(/\/chat\/completions$/i, "");
  }
  url.pathname = `${pathname}/models`;
  return url.toString();
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

async function handleStream(port, request) {
  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  try {
    const settings = await getSettings();
    if (!settings.apiKey.trim()) {
      throw new Error(t("apiKeyRequired"));
    }
    if (!settings.model.trim()) {
      throw new Error(t("modelRequired"));
    }

    const promptConfig = settings.prompts[request.promptIndex];
    if (!promptConfig || !String(promptConfig.prompt || "").trim()) {
      throw new Error(t("promptNotConfigured", [String(request.promptIndex + 1)]));
    }

    const url = normalizeBaseUrl(settings.baseUrl);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${settings.apiKey.trim()}`
      },
      body: JSON.stringify(
        buildRequestBody(settings, buildMessages(promptConfig, request.selection))
      ),
      signal: controller.signal
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errorBody = await response.text();
        const parsed = JSON.parse(errorBody);
        detail = parsed.error && (parsed.error.message || JSON.stringify(parsed.error));
      } catch {
        detail = "";
      }
      throw new Error(
        t("requestFailedHttp", [
          `${response.status}${detail ? ` - ${detail}` : ""}`
        ])
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
        port.postMessage({ type: "chunk", text: content });
      }
      port.postMessage({ type: "done" });
      return;
    }

    if (!response.body) {
      throw new Error(t("streamUnavailable"));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    const sendChunk = (text) => {
      try {
        port.postMessage({ type: "chunk", text });
      } catch {
        controller.abort();
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        parseSseLine(line, sendChunk);
      }
    }

    if (buffer) {
      parseSseLine(buffer, sendChunk);
    }

    port.postMessage({ type: "done" });
  } catch (error) {
    if (error.name !== "AbortError") {
      try {
        port.postMessage({
          type: "error",
          message: error.message || String(error)
        });
      } catch {
        // The content script may already be gone.
      }
    }
  }
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

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
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

async function listModels(request) {
  const url = normalizeModelsUrl(request.baseUrl);
  const headers = {
    "Content-Type": "application/json"
  };
  if (request.apiKey && request.apiKey.trim()) {
    headers.Authorization = `Bearer ${request.apiKey.trim()}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.text();
      const parsed = JSON.parse(body);
      detail = parsed.error && (parsed.error.message || JSON.stringify(parsed.error));
    } catch {
      detail = "";
    }
    throw new Error(
      t("modelsRequestFailed", [
        `${response.status}${detail ? ` - ${detail}` : ""}`
      ])
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
  const url = normalizeBaseUrl(request.baseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${request.apiKey}`
    },
    body: JSON.stringify({
      model: request.model,
      stream: false,
      messages: [
        {
          role: "user",
          content: t("testPrompt")
        }
      ]
    })
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.text();
      const parsed = JSON.parse(body);
      detail = parsed.error && (parsed.error.message || JSON.stringify(parsed.error));
    } catch {
      detail = "";
    }
    throw new Error(`HTTP ${response.status}${detail ? ` - ${detail}` : ""}`);
  }

  const data = await response.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return {
    ok: true,
    message:
      typeof content === "string"
        ? t("connectionSuccess", [content.slice(0, 80)])
        : t("connectionSuccessShort")
  };
}
