/**
 * Minimal DOM used by the Markdown renderer tests.
 *
 * Only the surface that ai-inline-assistant/markdown.js touches is
 * implemented, which keeps the test suite dependency free.
 */

class FakeNode {
  constructor(nodeType, tagName = null) {
    this.nodeType = nodeType;
    this.tagName = tagName ? tagName.toUpperCase() : null;
    this.children = [];
    this.parentNode = null;
    this.attributes = Object.create(null);
    this._text = "";
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node === null || node === undefined) {
        continue;
      }
      node.parentNode = this;
      this.children.push(node);
    }
  }

  prepend(node) {
    node.parentNode = this;
    this.children.unshift(node);
  }

  remove() {
    if (!this.parentNode) {
      return;
    }
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) {
      this.parentNode.children.splice(index, 1);
    }
    this.parentNode = null;
  }

  get textContent() {
    if (this.children.length === 0) {
      return this._text;
    }
    return this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this.children = [];
    this._text = String(value);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return name in this.attributes ? this.attributes[name] : null;
  }
}

class FakeText extends FakeNode {
  constructor(value) {
    super(3);
    this._text = String(value);
  }

  get textContent() {
    return this._text;
  }

  set textContent(value) {
    this._text = String(value);
  }
}

class FakeElement extends FakeNode {
  constructor(tagName) {
    super(1, tagName);
    this.dataset = Object.create(null);
    this.style = Object.create(null);
    this._classes = new Set();
    const element = this;
    this.classList = {
      add(...names) {
        for (const name of names) {
          element._classes.add(name);
        }
      },
      remove(...names) {
        for (const name of names) {
          element._classes.delete(name);
        }
      },
      contains(name) {
        return element._classes.has(name);
      },
      toggle(name, force) {
        const shouldAdd = force === undefined ? !element._classes.has(name) : Boolean(force);
        if (shouldAdd) {
          element._classes.add(name);
        } else {
          element._classes.delete(name);
        }
        return shouldAdd;
      }
    };
  }

  get className() {
    return [...this._classes].join(" ");
  }

  set className(value) {
    this._classes = new Set(
      String(value)
        .split(/\s+/)
        .filter(Boolean)
    );
  }

  set innerHTML(value) {
    this.children = [];
    this._text = String(value);
  }
}

export function createDocument() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    createTextNode(value) {
      return new FakeText(value);
    },
    createDocumentFragment() {
      return new FakeNode(11);
    }
  };
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const VOID_TAGS = new Set(["br", "hr", "img", "input"]);

function kebabCase(value) {
  return String(value).replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

export function serialize(node) {
  if (node.nodeType === 3) {
    return escapeText(node.textContent);
  }

  if (node.nodeType === 11) {
    return node.children.map(serialize).join("");
  }

  const tag = node.tagName.toLowerCase();
  const attributes = [];

  if (node._classes && node._classes.size > 0) {
    attributes.push(`class="${escapeAttribute([...node._classes].join(" "))}"`);
  }
  for (const [name, value] of Object.entries(node.attributes)) {
    attributes.push(`${name}="${escapeAttribute(value)}"`);
  }
  for (const [name, value] of Object.entries(node.dataset)) {
    attributes.push(`data-${name}="${escapeAttribute(value)}"`);
  }
  if (node.style && Object.keys(node.style).length > 0) {
    const declarations = Object.entries(node.style).map(
      ([name, value]) => `${kebabCase(name)}: ${value}`
    );
    attributes.push(`style="${escapeAttribute(declarations.join("; "))}"`);
  }
  if (tag === "input") {
    if (node.type) {
      attributes.push(`type="${escapeAttribute(node.type)}"`);
    }
    if (node.checked) {
      attributes.push("checked");
    }
    if (node.disabled) {
      attributes.push("disabled");
    }
  }
  if (tag === "a") {
    for (const name of ["href", "target", "rel"]) {
      if (node[name]) {
        attributes.push(`${name}="${escapeAttribute(node[name])}"`);
      }
    }
  }
  if (tag === "img") {
    for (const name of ["src", "alt", "loading", "decoding"]) {
      if (node[name]) {
        attributes.push(`${name}="${escapeAttribute(node[name])}"`);
      }
    }
    if (node.referrerPolicy) {
      attributes.push(`referrerpolicy="${escapeAttribute(node.referrerPolicy)}"`);
    }
  }

  const opening = `<${tag}${attributes.length ? ` ${attributes.join(" ")}` : ""}>`;
  if (VOID_TAGS.has(tag)) {
    return opening;
  }
  const inner = node.children.length
    ? node.children.map(serialize).join("")
    : escapeText(node._text || "");
  return `${opening}${inner}</${tag}>`;
}
