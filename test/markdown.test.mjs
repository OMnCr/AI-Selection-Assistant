import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import { createDocument, serialize } from "./helpers/dom.mjs";

const SOURCE = readFileSync(
  new URL("../markdown.js", import.meta.url),
  "utf8"
);

function loadMarkdown() {
  const sandbox = {
    document: createDocument(),
    window: { location: { href: "https://example.com/article" } },
    URL,
    console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: "markdown.js" });
  return sandbox.AIInlineMarkdown;
}

const markdown = loadMarkdown();

function toHtml(source) {
  return serialize(markdown.render(source));
}

function streamedHtml(source, chunkSize = 7) {
  const container = createDocument().createElement("div");
  const renderer = markdown.createStreamRenderer(container);
  let offset = 0;
  while (offset < source.length) {
    offset = Math.min(source.length, offset + chunkSize);
    renderer.update(source.slice(0, offset));
  }
  renderer.finish(source);
  return container.children.map(serialize).join("");
}

test("renders headings, paragraphs and horizontal rules", () => {
  const html = toHtml("# Title\n\nHello **world**.\n\n---");
  assert.equal(
    html,
    "<h1>Title</h1><p>Hello <strong>world</strong>.</p><hr>"
  );
});

test("keeps line breaks inside a paragraph", () => {
  assert.equal(toHtml("line one\nline two"), "<p>line one<br>line two</p>");
});

test("renders unordered, ordered and nested lists", () => {
  assert.equal(
    toHtml("- a\n- b"),
    "<ul><li><p>a</p></li><li><p>b</p></li></ul>"
  );
  assert.equal(
    toHtml("3. three\n4. four"),
    '<ol start="3"><li><p>three</p></li><li><p>four</p></li></ol>'
  );
  assert.equal(
    toHtml("- parent\n  - child"),
    "<ul><li><p>parent</p><ul><li><p>child</p></li></ul></li></ul>"
  );
});

test("renders task list items with a disabled checkbox", () => {
  const html = toHtml("- [x] done\n- [ ] todo");
  assert.match(html, /class="ai-inline-task-item"/);
  assert.match(html, /<input type="checkbox" checked disabled>/);
  assert.match(html, /<input type="checkbox" disabled>/);
});

test("merges a loose list separated by a blank line", () => {
  const html = toHtml("1. one\n\n2. two");
  assert.equal(html.match(/<ol/g)?.length, 1);
  assert.equal(html.match(/<li>/g)?.length, 2);
});

test("renders fenced code with a language label", () => {
  const html = toHtml("```js\nconst a = 1;\n```");
  assert.equal(
    html,
    '<pre data-language="js"><code>const a = 1;</code></pre>'
  );
});

test("renders indented code blocks", () => {
  assert.equal(toHtml("    indented"), "<pre><code>indented</code></pre>");
});

test("renders tables with alignment", () => {
  const html = toHtml("| a | b |\n| --- | ---: |\n| 1 | 2 |");
  assert.match(html, /<div class="ai-inline-table-wrap">/);
  assert.match(html, /<th>a<\/th><th style="text-align: right">b<\/th>/);
  assert.match(html, /<td>1<\/td><td style="text-align: right">2<\/td>/);
});

test("renders inline code, emphasis, strikethrough and links", () => {
  const html = toHtml(
    "**bold** *em* `code` ~~gone~~ [site](https://example.com/docs)"
  );
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>em<\/em>/);
  assert.match(html, /<del>gone<\/del>/);
  assert.match(html, /<code class="ai-inline-inline-code">code<\/code>/);
  assert.match(html, /<a href="https:\/\/example.com\/docs"/);
});

test("keeps link attributes safe", () => {
  const html = toHtml("[site](https://example.com)");
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer nofollow"/);
});

test("renders images with a safe source", () => {
  const html = toHtml("![alt text](https://example.com/a.png)");
  assert.match(html, /class="ai-inline-md-image"/);
  assert.match(html, /src="https:\/\/example.com\/a.png"/);
  assert.match(html, /referrerpolicy="no-referrer"/);
});

test("refuses javascript and data URLs", () => {
  assert.equal(
    toHtml("[x](javascript:alert(1))"),
    "<p>[x](javascript:alert(1))</p>"
  );
  assert.equal(
    toHtml("![x](data:image/png;base64,AAAA)"),
    "<p>![x](data:image/png;base64,AAAA)</p>"
  );
});

test("does not turn raw HTML into elements", () => {
  const html = toHtml('<img src=x onerror="alert(1)">');
  assert.equal(html, "<p>&lt;img src=x onerror=\"alert(1)\"&gt;</p>");
});

test("renders block math with $$, \\[ and environments", () => {
  assert.match(
    toHtml("$$\na + b\n$$"),
    /<span class="ai-inline-math-block"><span class="ai-inline-math">\$\$a \+ b\$\$<\/span><\/span>/
  );
  assert.match(
    toHtml("\\[\nx = 1\n\\]"),
    /ai-inline-math-block/
  );
  assert.match(
    toHtml("\\begin{aligned}\na &= b\n\\end{aligned}"),
    /ai-inline-math-block/
  );
});

test("distinguishes inline math from currency", () => {
  assert.match(
    toHtml("formula $x^2$ here"),
    /ai-inline-math-inline/
  );
  assert.equal(toHtml("It costs $5 and $10 today."), "<p>It costs $5 and $10 today.</p>");
});

test("parses nested block quotes", () => {
  const html = toHtml("> quote\n>\n> - item");
  assert.match(html, /<blockquote><p>quote<\/p><ul><li><p>item<\/p><\/li><\/ul><\/blockquote>/);
});

test("streaming output matches one-shot rendering", () => {
  const source = [
    "# Response",
    "",
    "A paragraph with **bold** text and `inline code`.",
    "",
    "1. first",
    "2. second",
    "",
    "```js",
    "const value = 1;",
    "```",
    "",
    "> quoted line",
    "",
    "| a | b |",
    "| --- | --- |",
    "| 1 | 2 |",
    ""
  ].join("\n");

  assert.equal(streamedHtml(source, 3), toHtml(source));
  assert.equal(streamedHtml(source, 17), toHtml(source));
});

test("streaming keeps committed nodes stable", () => {
  const container = createDocument().createElement("div");
  const renderer = markdown.createStreamRenderer(container);

  renderer.update("First paragraph.\n\nSecond");
  const first = container.children[0];
  assert.equal(serialize(first), "<p>First paragraph.</p>");

  renderer.update("First paragraph.\n\nSecond paragraph.");
  assert.equal(container.children[0], first);

  renderer.finish("First paragraph.\n\nSecond paragraph.");
  assert.equal(container.children[0], first);
  assert.equal(
    container.children.map(serialize).join(""),
    "<p>First paragraph.</p><p>Second paragraph.</p>"
  );
});

test("streaming renders an unterminated code fence while it grows", () => {
  const container = createDocument().createElement("div");
  const renderer = markdown.createStreamRenderer(container);
  renderer.update("```js\nconst a");
  assert.match(
    container.children.map(serialize).join(""),
    /<pre data-language="js"><code>const a<\/code><\/pre>/
  );

  renderer.update("```js\nconst a = 1;");
  assert.match(
    container.children.map(serialize).join(""),
    /const a = 1;/
  );

  renderer.finish("```js\nconst a = 1;\n```");
  assert.equal(
    container.children.map(serialize).join(""),
    '<pre data-language="js"><code>const a = 1;</code></pre>'
  );
});
