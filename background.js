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
    {
      id: "prompt-1",
      name: "总结",
      enabled: true,
      prompt: "请用简洁的中文总结下面的内容：\n\n{{selection}}"
    },
    {
      id: "prompt-2",
      name: "翻译",
      enabled: true,
      prompt: "请把下面的内容翻译成中文：\n\n{{selection}}"
    },
    {
      id: "prompt-3",
      name: "解释",
      enabled: true,
      prompt: "请解释下面这段内容，尽量通俗易懂：\n\n{{selection}}"
    },
    {
      id: "prompt-4",
      name: "润色",
      enabled: true,
      prompt: "请在不改变原意的前提下润色下面的文字：\n\n{{selection}}"
    },
    {
      id: "prompt-5",
      name: "提取要点",
      enabled: true,
      prompt: "请提取下面内容的关键要点，并使用无序列表输出：\n\n{{selection}}"
    },
    {
      id: "prompt-6",
      name: "改写",
      enabled: true,
      prompt: "请用另一种表达方式改写下面的内容：\n\n{{selection}}"
    },
    {
      id: "prompt-7",
      name: "回答问题",
      enabled: true,
      prompt: "请基于下面的内容回答问题：\n\n{{selection}}"
    },
    {
      id: "prompt-8",
      name: "生成标题",
      enabled: true,
      prompt: "请为下面的内容生成 3 个吸引人的标题：\n\n{{selection}}"
    },
    {
      id: "prompt-9",
      name: "自定义",
      enabled: true,
      prompt: "{{selection}}"
    }
  ]
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
    throw new Error("请先在扩展选项中配置 Base URL。");
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Base URL 格式无效，请填写完整地址，例如 https://api.openai.com/v1。");
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
    throw new Error("请先填写 Base URL。");
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Base URL 格式无效，请填写完整地址，例如 https://api.openai.com/v1。");
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
      throw new Error("请先在扩展选项中配置 API Key。");
    }
    if (!settings.model.trim()) {
      throw new Error("请先在扩展选项中配置模型名称。");
    }

    const promptConfig = settings.prompts[request.promptIndex];
    if (!promptConfig || !String(promptConfig.prompt || "").trim()) {
      throw new Error(`第 ${request.promptIndex + 1} 个提示词尚未配置。`);
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
      throw new Error(`请求失败：HTTP ${response.status}${detail ? ` - ${detail}` : ""}`);
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
      throw new Error("接口没有返回可读取的流式响应。");
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
    throw new Error(`获取模型列表失败：HTTP ${response.status}${detail ? ` - ${detail}` : ""}`);
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
          content: "请只回复 OK。"
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
    message: typeof content === "string" ? `连接成功：${content.slice(0, 80)}` : "连接成功"
  };
}
