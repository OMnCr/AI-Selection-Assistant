# AI 划词助手

[English README](README.en.md)

一个 Chrome / Edge Manifest V3 扩展：在网页中选中文字后，按下 `Alt + 1/2/3…`，把选中内容和对应提示词发送到可配置的 OpenAI 兼容接口，并在选区下方流式展示回复。

![扩展图标](icons/icon128.png)

## 功能

- 划词触发，回复面板直接显示在网页选区下方，不弹出新窗口，焦点保持在当前页面。
- 流式输出（SSE，`chat/completions` 的 `stream: true`），生成过程中可随时点「停止」。
- **增量渲染**：流式过程中只解析新增内容，已渲染的段落不会重复重建，长回复也保持流畅。
- Markdown 渲染：标题、列表、任务列表、表格、引用、链接、图片、代码块。
- 数学公式渲染：`$...$`、`$$...$$`、`\(...\)`、`\[...\]` 和 `\begin{...}` 环境，KaTeX 随扩展本地打包（不加载远程代码）。
- 一键复制回复原文；`Esc` 或点击面板外部即可关闭。
- 面板支持深色模式（跟随系统）、长内容滚动、自动贴边定位。
- 界面跟随浏览器语言：默认英文，支持简体中文。
- Base URL、API Key、模型名称均可自定义；**API Key 可以留空**，用于本地或免鉴权接口。
- 填写 Base URL 后可获取该接口支持的模型列表。
- 提供 9 个提示词槽位，对应 `快捷键 + 1` 到 `快捷键 + 9`，每个槽位可单独启用/禁用。
- 提示词支持 `{{selection}}` 占位符；没有占位符时，选中内容会自动追加到提示词末尾。
- 快捷键修饰键可配置：`Alt`、`Ctrl`、`Ctrl+Alt`、`Ctrl+Shift`、`Alt+Shift`、`Meta`。
- 可配置流式传输、思考等级（含“无”）、温度、Top P、最大 Token 数等参数，并在保存时校验取值。
- 只有在确实要执行动作时才拦截快捷键；没有选中文字时不会吞掉页面自己的快捷键。

## 安装

1. 打开 Chrome 的 `chrome://extensions/`（Edge 为 `edge://extensions/`）。
2. 打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择本仓库根目录（包含 `manifest.json` 的目录）。
5. 点击扩展图标，或在扩展详情中打开「扩展程序选项」，填写 Base URL、模型，以及需要时的 API Key。

## 使用

1. 在网页中选中一段文字（普通文本或输入框中的文字都可以）。
2. 按 `Alt + 1` 到 `Alt + 9`（默认修饰键为 Alt）。
3. 回复会流式出现在选区下方；可点击「停止」中断，或按 `Esc` / 点击面板外部关闭。
4. 点击「复制」可把回复的 Markdown 原文放入剪贴板。

## 配置

| 选项 | 说明 |
| --- | --- |
| Base URL | 填到 `/v1` 即可；填完整的 `/chat/completions` 地址也可以 |
| API Key | 可选；留空时请求不携带 `Authorization` 头 |
| 模型 | 可手动填写，也可用「获取模型列表」从 `/models` 拉取 |
| 快捷键修饰键 | 决定 `Alt+1` / `Ctrl+1` / `Ctrl+Alt+1` 等组合 |
| 流式传输 | 关闭后使用一次性响应 |
| 思考等级 | 对应 `reasoning_effort`；选择「无」时不发送 |
| 温度 / Top P / 最大 Token | 留空表示使用接口默认值 |

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

其中 `temperature`、`top_p`、`max_tokens`、`reasoning_effort` 为可选参数，留空或选择「无」时不会发送。

常见 Base URL 示例：

- OpenAI：`https://api.openai.com/v1`
- DeepSeek：`https://api.deepseek.com/v1`
- 本地 Ollama / LM Studio 等 OpenAI 兼容网关：填写到 `/v1`，API Key 可留空

## 开发

项目零运行时依赖，源码即扩展；开发脚本只用于校验、打包和生成图标。

```bash
npm test          # 单元测试（Markdown 解析、渲染与增量流式一致性）
npm run check     # 校验 manifest、图标尺寸、i18n 键与占位符
npm run verify    # check + test
npm run package   # 生成 dist/ai-selection-assistant-<version>.zip
npm run icons     # 重新生成图标（需要 Python 3 与 Pillow）
```

目录结构：

```
manifest.json        扩展清单
background.js        Service Worker：读取设置、请求接口、解析 SSE
content.js           内容脚本：快捷键、选区、面板、增量渲染调度
markdown.js          Markdown/LaTeX 解析器 + 渲染器 + 流式渲染器
i18n.js              chrome.i18n 封装与默认提示词
options.*            设置页
content.css          注入页面的面板与 Toast 样式
icons/               图标（SVG 源 + 16/32/48/128 PNG）
vendor/katex/        本地 KaTeX
test/                单元测试
scripts/             图标生成、清单校验、ZIP 打包
```

更细的设计说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 权限与隐私

- `storage`：在本机保存设置与 API Key。
- `http://*/*`、`https://*/*`：向用户自定义的 Base URL 发起请求，并在网页中显示回复。
- 扩展不收集、不上报任何使用数据；选中文字只会发送到你自己配置的接口。
- 详细说明见 [PRIVACY.md](PRIVACY.md)。

## 已知限制

- 如果选区位于 iframe 内，面板会渲染在该 iframe 内；极窄的 iframe 可能裁切面板。
- API Key 以明文保存在扩展的 `chrome.storage.local` 中，这也是 Chrome 扩展的常规做法；请勿在共享电脑上保存长期密钥。
- Markdown 支持常用子集：不支持原始 HTML、引用式链接、脚注；嵌套强调遵循常见写法而非完整 CommonMark 规范。
- 部分组合键会被浏览器或网页占用（例如 `Ctrl+数字` 切换标签页），可在设置中更换修饰键。
- 单次发送的选中文本上限为 100,000 字符。

## 参与贡献

- 开发、测试与打包方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 安全问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要开公开 issue。

## 作者与许可证

- 作者：OMnCr
- 许可证：[GNU Affero General Public License v3.0](LICENSE)
- 公式渲染使用本地打包的 [KaTeX](https://katex.org/)，许可证见 [vendor/katex/LICENSE](vendor/katex/LICENSE)。

本扩展适用于 Chrome 和 Microsoft Edge（Chromium）应用商店。
