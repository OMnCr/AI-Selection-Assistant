# 隐私说明 / Privacy Policy

本扩展不收集、不存储、不上传任何使用数据或分析信息。

## 本机保存的数据

- 扩展设置：Base URL、模型名称、提示词、界面参数。
- API Key（可选）：保存在扩展的 `chrome.storage.local` 中，仅用于向你自己配置的接口发起请求。数据不会离开本机浏览器配置文件。

你可以在扩展设置页清空 API Key，或在 `chrome://extensions/` 中移除扩展，对应的本地数据会随之删除。

## 发送到第三方的数据

当你主动使用划词功能时，扩展会把以下内容发送到**你在设置中填写的 Base URL**：

- 选中的文字；
- 该快捷键对应的提示词模板渲染后的文本。

请求由扩展的 Service Worker 直接发往该地址，不经过任何中转服务器，也不包含扩展的遥测数据。目标接口的隐私政策由其提供方负责。

## 权限说明

- `storage`：保存上述设置。
- `http://*/*`、`https://*/*`：允许向任意 OpenAI 兼容 Base URL 发起请求，并在网页中注入回复面板与样式。

扩展不读取浏览历史、书签、标签页内容或其他扩展数据；注入的脚本只在页面内处理你主动选中的文本。

---

This extension collects no usage data, analytics or telemetry.

## Data stored locally

- Settings: Base URL, model name, prompts and generation parameters.
- Optional API key, stored in `chrome.storage.local` and used only to authorize requests to the endpoint you configure.

You can clear the API key in the options page, or remove the extension to delete its local data.

## Data sent to third parties

When you explicitly trigger a selection action, the extension sends the selected text and the rendered prompt to **the Base URL you configured**. Requests go directly from the extension service worker to that endpoint; there is no intermediary server and no telemetry. The privacy practices of that endpoint are governed by its provider.

## Permission rationale

- `storage`: persist the settings above.
- `http://*/*`, `https://*/*`: reach any OpenAI-compatible endpoint and render the reply panel in pages.

The extension does not read browsing history, bookmarks, other tabs or other extensions.
