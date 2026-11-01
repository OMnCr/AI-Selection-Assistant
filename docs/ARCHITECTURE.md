# 架构说明

## 运行角色

| 角色 | 文件 | 职责 |
| --- | --- | --- |
| Service Worker | `background.js` | 读取设置、拼装请求、调用 OpenAI 兼容接口、解析 SSE、拉取模型列表、连接测试 |
| 内容脚本 | `content.js` | 捕获快捷键、提取选区、创建/定位面板、调度增量渲染、处理停止/关闭/复制 |
| 解析与渲染 | `markdown.js` | 把 Markdown 解析成纯数据描述符，再生成 DOM；提供增量流式渲染器 |
| 设置页 | `options.html/js/css` | 编辑设置、校验、模型列表、连接测试 |
| 国际化 | `i18n.js` + `_locales/` | `chrome.i18n` 封装；默认提示词随界面语言生成 |

内容脚本与 Service Worker 之间使用长连接 Port（`ai-inline-stream`）：内容脚本发 `{type:"start", request}`，Service Worker 回 `chunk` / `done` / `error`。断开 Port 即触发 `AbortController`，所以「停止」和关闭面板都能真正中断网络请求。

## 请求链路

```
keydown(capture) → 选区 → Port.start
  → SW: settings → /chat/completions (stream:true)
    → SSE 逐行解析 → Port.chunk
      → content.js: rawText += chunk → rAF 调度 → 增量渲染
```

## 增量渲染

一次性把整段回复重新解析并重建 DOM 的复杂度是 O(n²)。现在的做法是把文档切成「已提交」和「尾部」两部分：

1. 只有以换行结尾的完整行才参与提交；最后一个不完整行始终留在尾部。
2. 从上次提交位置开始解析，满足下列条件的块会被提交并追加到容器：
   - 不是未闭合结构（代码围栏、块级公式）；
   - 结束后还有后续行（即不是文件末尾的块）；
   - 若是列表，则其后第一个非空行必须顶格（避免把缩进续行误判为新块）。
3. 其余内容（通常是最后一段、未闭合的代码块）作为尾部整体重渲染。

已提交的节点不会再次创建，因此长回复的渲染成本近似线性；只有正在增长的那一块会重复解析。列表在跨提交边界时由渲染器的 sink 合并到前一个列表，避免出现被拆成两个列表的视觉接缝。

## Markdown 解析器

`parseBlocks` / `parseInline` 只产出普通对象（`{type:"paragraph", inlines:[...]}`），不接触 DOM，便于在 Node 中测试。渲染阶段再根据描述符创建元素：

- 所有模型文本都通过 `textContent` / `createTextNode` 写入，从不拼接 `innerHTML`；唯一使用 `innerHTML` 的地方是 KaTeX 的 `renderToString` 输出，且固定 `trust: false`、`output: "mathml"`。
- 链接与图片走协议白名单（`http`、`https`、`mailto`，图片仅 `http`/`https`），拒绝 `javascript:` 与 `data:`；外链固定 `rel="noopener noreferrer nofollow"`，图片 `referrerpolicy="no-referrer"`。
- 自动链接只接受绝对 `http(s)`/`mailto`，避免把 `<img src=...>` 之类的文本解析成相对地址链接。

## 面板定位

面板挂载到 `document.documentElement`，使用 `position: fixed` 并按视口坐标计算位置：

- 创建时决定优先显示在选区下方还是上方（哪边放得下选哪边）；
- `ResizeObserver` 监听面板尺寸变化，滚动时跟随选区，选区完全离开视口则自动关闭；
- 左右与上下都做视口夹取，`max-height` 限制面板高度，内容超出时面板内部滚动。

## 设置模型

设置保存在 `chrome.storage.local` 的单个 `settings` 键中。内容脚本与设置页都按「默认值 + 已保存值」合并，因此旧版本数据或缺失字段不会导致崩溃；`chrome.storage.onChanged` 让已打开的页面即时生效。

## 测试与校验

- `test/markdown.test.mjs`：用 Node `vm` 加载扩展脚本，配合最小 DOM 桩（`test/helpers/dom.mjs`）验证解析、渲染与流式输出一致性；覆盖 XSS、危险协议、公式与货币符号歧义等边界。
- `scripts/check-manifest.mjs`：版本一致性、引用文件存在性、PNG 图标尺寸、i18n 键/占位符对齐、代码中使用的翻译键是否存在。
- `scripts/package.mjs`：零依赖 ZIP 打包，产物在 `dist/`。
- `.github/workflows/ci.yml`：推送与 PR 时执行上述校验、测试与打包。

## 已知约束

- iframe 内的选区由该 iframe 的内容脚本体处理，面板也渲染在 iframe 内，极窄的 iframe 可能裁切面板。
- 代码围栏、长列表在生成过程中仍属于「尾部」，其内部是重复解析的；这是正确性与实现复杂度的折中。
- Markdown 支持常用子集，不实现原始 HTML、引用式链接与脚注。
