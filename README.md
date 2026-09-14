# AI 划词助手

一个 Chrome Manifest V3 扩展：在网页中选中文字后，按下 `Alt + 1/2/3…`，把选中内容和对应提示词发送到可配置的 OpenAI 兼容接口，并在选区下方流式展示回复。

## 功能

- 划词触发，回复面板直接显示在网页选区下方，不弹出新窗口，焦点保持在当前页面。
- 支持流式输出（SSE，`chat/completions` 的 `stream: true`）。
- Base URL、API Key、模型名称均可自定义。
- 填写 Base URL 后可获取该接口支持的模型列表。
- 提供 9 个提示词槽位，分别对应 `快捷键 + 1` 到 `快捷键 + 9`。
- 每个数字快捷键可单独启用或禁用。
- 提示词支持 `{{selection}}` 占位符；没有占位符时，选中内容会自动追加到提示词末尾。
- 快捷键修饰键可配置：`Alt`、`Ctrl`、`Ctrl+Alt`、`Ctrl+Shift`、`Alt+Shift`、`Meta`。
- 可配置流式传输、思考等级（含“无”）、温度、Top P、最大 Token 数等参数。
- 回复结束后，鼠标左键点击面板或页面任意位置即可直接关闭回复面板。

## 安装

1. 打开 Chrome 的 `chrome://extensions/`。
2. 打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择本目录：`projects/ai-inline-assistant`。
5. 点击扩展图标，或在扩展详情中打开「扩展程序选项」，填写 Base URL、API Key 和模型。

## 使用

1. 在网页中选中一段文字。
2. 按 `Alt + 1` 到 `Alt + 9`（默认修饰键为 Alt）。
3. 回复会流式出现在选区下方。

## 接口格式

扩展发送的请求与 OpenAI Chat Completions 兼容：

```http
POST {Base URL}/chat/completions
Authorization: Bearer {API Key}
Content-Type: application/json

{
  "model": "{model}",
  "stream": true,
  "messages": [
    { "role": "user", "content": "{prompt with selection}" }
  ],
  "temperature": 0.7,
  "top_p": 0.9,
  "max_tokens": 1000,
  "reasoning_effort": "medium"
}
```

其中 `temperature`、`top_p`、`max_tokens`、`reasoning_effort` 为可选参数，留空时不会发送。

常见 Base URL 示例：

- OpenAI：`https://api.openai.com/v1`
- DeepSeek：`https://api.deepseek.com/v1`
- 其他 OpenAI 兼容网关：填写到 `/v1` 或直接填写完整 `/chat/completions` 地址。

## 注意事项

- Manifest 使用 `<all_urls>` 主机权限，以便向任意自定义 Base URL 发起请求。
- 如果网页本身占用了所选快捷键，浏览器或网页可能会先处理该快捷键。可到扩展选项里换一组修饰键，或更换数字。
- API Key 保存在 `chrome.storage.local`，仅用于本机扩展请求。

## 作者与许可证

- 作者：OMnCr
- 许可证：[GNU Affero General Public License v3.0](LICENSE)

本扩展适用于 Chrome 和 Microsoft Edge（Chromium）应用商店。发布前请在对应商店后台完成隐私说明、截图和商店描述等审核材料。
