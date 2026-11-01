(() => {
  "use strict";

  const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
  const SAFE_IMAGE_PROTOCOLS = new Set(["http:", "https:"]);

  /* ------------------------------------------------------------------ */
  /* Line helpers                                                        */
  /* ------------------------------------------------------------------ */

  function normalizeNewlines(value) {
    return String(value == null ? "" : value).replace(/\r\n?/g, "\n");
  }

  function isBlank(line) {
    return !line.trim();
  }

  function leadingSpaces(line) {
    const match = /^[ \t]*/.exec(line);
    if (!match) {
      return 0;
    }
    let count = 0;
    for (const character of match[0]) {
      count += character === "\t" ? 4 : 1;
    }
    return count;
  }

  function removeIndent(line, count) {
    let removed = 0;
    let index = 0;
    while (
      index < line.length &&
      removed < count &&
      (line[index] === " " || line[index] === "\t")
    ) {
      removed += line[index] === "\t" ? 4 : 1;
      index += 1;
    }
    return line.slice(index);
  }

  function trimBlankLines(lines) {
    let start = 0;
    let end = lines.length;
    while (start < end && isBlank(lines[start])) {
      start += 1;
    }
    while (end > start && isBlank(lines[end - 1])) {
      end -= 1;
    }
    return lines.slice(start, end);
  }

  /* ------------------------------------------------------------------ */
  /* Block markers                                                       */
  /* ------------------------------------------------------------------ */

  function matchFence(line) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    return match ? { marker: match[1], info: match[2].trim() } : null;
  }

  function isFenceClose(line, marker) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
    return Boolean(
      match && match[1][0] === marker[0] && match[1].length >= marker.length
    );
  }

  function matchHeading(line) {
    const match = line.match(/^ {0,3}(#{1,6})\s+(.*)$/);
    if (!match) {
      return null;
    }
    return {
      level: match[1].length,
      text: match[2].replace(/\s+#+\s*$/, "")
    };
  }

  function matchHorizontalRule(line) {
    return /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line);
  }

  function matchListLine(line) {
    const match = line.match(/^([ \t]*)([-*+]|\d{1,9}[.)])\s+(.*)$/);
    if (!match) {
      return null;
    }
    const ordered = /^\d/.test(match[2]);
    return {
      indent: leadingSpaces(match[1]),
      ordered,
      number: ordered ? Number.parseInt(match[2], 10) : null,
      content: match[3]
    };
  }

  function matchBlockMathStart(line) {
    const trimmed = line.trim();
    if (trimmed.startsWith("$$")) {
      return { kind: "dollars" };
    }
    if (trimmed.startsWith("\\[")) {
      return { kind: "brackets" };
    }
    const environment = /^\\begin\{([A-Za-z*]+)\}/.exec(trimmed);
    if (environment) {
      return { kind: "environment", name: environment[1] };
    }
    return null;
  }

  function splitTableRow(line) {
    let value = line.trim();
    if (value.startsWith("|")) {
      value = value.slice(1);
    }
    if (value.endsWith("|")) {
      value = value.slice(0, -1);
    }
    return value.split("|").map((cell) => cell.trim());
  }

  function isTableStart(lines, index) {
    if (index + 1 >= lines.length || !lines[index].includes("|")) {
      return false;
    }
    const cells = splitTableRow(lines[index + 1]);
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function isBlockStart(lines, index) {
    const line = lines[index];
    if (isBlank(line)) {
      return true;
    }
    return Boolean(
      matchFence(line) ||
        matchBlockMathStart(line) ||
        matchHeading(line) ||
        matchHorizontalRule(line) ||
        /^ {0,3}>/.test(line) ||
        matchListLine(line) ||
        /^ {4}\S/.test(line) ||
        isTableStart(lines, index)
    );
  }

  /* ------------------------------------------------------------------ */
  /* Inline parsing (produces plain descriptors, never DOM)              */
  /* ------------------------------------------------------------------ */

  function findInlineMathEnd(text, start) {
    if (!text[start + 1] || /\s/.test(text[start + 1])) {
      return -1;
    }

    for (let index = start + 1; index < text.length; index += 1) {
      if (text[index] === "\\") {
        index += 1;
        continue;
      }
      if (text[index] === "\n") {
        return -1;
      }
      if (text[index] === "$") {
        if (index === start + 1) {
          return -1;
        }
        const body = text.slice(start + 1, index);
        const after = text[index + 1] || "";
        if (
          /^[\d.,\s]+$/.test(body) ||
          (/\d/.test(text[start + 1]) && /\d/.test(after))
        ) {
          return -1;
        }
        return index;
      }
    }
    return -1;
  }

  function findMatching(text, start, openChar, closeChar) {
    let depth = 0;
    for (let index = start; index < text.length; index += 1) {
      if (text[index] === "\\") {
        index += 1;
        continue;
      }
      if (text[index] === openChar) {
        depth += 1;
      } else if (text[index] === closeChar) {
        if (depth === 0) {
          return index;
        }
        depth -= 1;
      }
    }
    return -1;
  }

  function toSafeUrl(value, isImage) {
    if (!value || /^javascript:/i.test(value) || /^data:/i.test(value)) {
      return null;
    }
    try {
      const url = new URL(value, window.location.href);
      const allowed = isImage ? SAFE_IMAGE_PROTOCOLS : SAFE_LINK_PROTOCOLS;
      return allowed.has(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function parseLinkOrImage(text, start) {
    const isImage = text[start] === "!";
    const bracketStart = isImage ? start + 1 : start;
    if (text[bracketStart] !== "[") {
      return null;
    }

    const bracketEnd = findMatching(text, bracketStart + 1, "[", "]");
    if (bracketEnd < 0 || text[bracketEnd + 1] !== "(") {
      return null;
    }

    const destinationEnd = findMatching(text, bracketEnd + 2, "(", ")");
    if (destinationEnd < 0) {
      return null;
    }

    const label = text.slice(bracketStart + 1, bracketEnd);
    const rawDestination = text.slice(bracketEnd + 2, destinationEnd).trim();
    let destination = rawDestination;
    if (destination.startsWith("<")) {
      const angleEnd = destination.indexOf(">");
      destination = angleEnd >= 0 ? destination.slice(1, angleEnd) : destination;
    } else {
      destination = destination.split(/\s+/)[0];
    }

    const href = toSafeUrl(destination, isImage);
    if (!href) {
      return null;
    }

    if (isImage) {
      return {
        node: {
          type: "image",
          src: href,
          alt: label.replace(/[*_~`]/g, "")
        },
        next: destinationEnd + 1
      };
    }

    return {
      node: { type: "link", href, children: parseInline(label) },
      next: destinationEnd + 1
    };
  }

  function isWordCharacter(character) {
    return Boolean(character) && /[0-9A-Za-z]/.test(character);
  }

  function parseInline(text) {
    const nodes = [];
    let buffer = "";
    let index = 0;

    const flush = () => {
      if (buffer) {
        nodes.push({ type: "text", value: buffer });
        buffer = "";
      }
    };

    while (index < text.length) {
      const character = text[index];

      if (character === "\\") {
        const next = text[index + 1];
        if (next === "(") {
          const end = text.indexOf("\\)", index + 2);
          if (end > index + 2) {
            flush();
            nodes.push({
              type: "math",
              tex: text.slice(index + 2, end),
              display: false
            });
            index = end + 2;
            continue;
          }
        }
        if (next === "[") {
          const end = text.indexOf("\\]", index + 2);
          if (end > index + 2) {
            flush();
            nodes.push({
              type: "math",
              tex: text.slice(index + 2, end),
              display: true
            });
            index = end + 2;
            continue;
          }
        }
        if (next !== undefined) {
          buffer += next;
          index += 2;
          continue;
        }
      }

      if (character === "`") {
        let runLength = 1;
        while (text[index + runLength] === "`") {
          runLength += 1;
        }
        const marker = "`".repeat(runLength);
        const end = text.indexOf(marker, index + runLength);
        if (end >= 0) {
          flush();
          nodes.push({
            type: "code",
            value: text.slice(index + runLength, end).replace(/\n/g, " ")
          });
          index = end + runLength;
          continue;
        }
        buffer += marker;
        index += runLength;
        continue;
      }

      if (character === "$" && text[index + 1] === "$") {
        const end = text.indexOf("$$", index + 2);
        if (end > index + 2) {
          flush();
          nodes.push({
            type: "math",
            tex: text.slice(index + 2, end),
            display: true
          });
          index = end + 2;
          continue;
        }
      }

      if (character === "$") {
        const end = findInlineMathEnd(text, index);
        if (end > index) {
          flush();
          nodes.push({
            type: "math",
            tex: text.slice(index + 1, end),
            display: false
          });
          index = end + 1;
          continue;
        }
      }

      if ((character === "!" && text[index + 1] === "[") || character === "[") {
        const link = parseLinkOrImage(text, index);
        if (link) {
          flush();
          nodes.push(link.node);
          index = link.next;
          continue;
        }
      }

      if (character === "~" && text[index + 1] === "~") {
        const end = text.indexOf("~~", index + 2);
        if (end > index + 2) {
          flush();
          nodes.push({
            type: "del",
            children: parseInline(text.slice(index + 2, end))
          });
          index = end + 2;
          continue;
        }
      }

      if (character === "*" || character === "_") {
        const double = text[index + 1] === character;
        const marker = double ? character + character : character;
        const after = text[index + marker.length];
        const opens =
          after !== undefined &&
          !/\s/.test(after) &&
          !(character === "_" && isWordCharacter(text[index - 1]) && isWordCharacter(after));

        if (opens) {
          let search = index + marker.length;
          let end = -1;
          while (search < text.length) {
            const found = text.indexOf(marker, search);
            if (found < 0) {
              break;
            }
            const before = text[found - 1];
            const closingAfter = text[found + marker.length];
            const closes =
              before !== undefined &&
              !/\s/.test(before) &&
              !(
                character === "_" &&
                isWordCharacter(before) &&
                isWordCharacter(closingAfter)
              );
            if (closes && found > index + marker.length) {
              end = found;
              break;
            }
            search = found + marker.length;
          }
          if (end > 0) {
            flush();
            nodes.push({
              type: double ? "strong" : "em",
              children: parseInline(text.slice(index + marker.length, end))
            });
            index = end + marker.length;
            continue;
          }
        }

        buffer += marker;
        index += marker.length;
        continue;
      }

      if (character === "<") {
        const end = text.indexOf(">", index + 1);
        if (end > index + 1) {
          const candidate = text.slice(index + 1, end);
          // Only absolute autolinks become anchors; a bare "<tag ...>" must
          // stay literal text instead of resolving as a relative URL.
          if (/^(?:https?:|mailto:)/i.test(candidate)) {
            const href = toSafeUrl(candidate, false);
            if (href) {
              flush();
              nodes.push({
                type: "link",
                href,
                children: [{ type: "text", value: candidate }]
              });
              index = end + 1;
              continue;
            }
          }
        }
      }

      if (character === "\n") {
        flush();
        nodes.push({ type: "br" });
        index += 1;
        continue;
      }

      buffer += character;
      index += 1;
    }

    flush();
    return nodes;
  }

  /* ------------------------------------------------------------------ */
  /* Block parsing                                                       */
  /* ------------------------------------------------------------------ */

  function collectBlockMath(lines, start, specification, allowIncomplete) {
    const first = lines[start].trim();

    if (specification.kind === "dollars" || specification.kind === "brackets") {
      const closing = specification.kind === "dollars" ? "$$" : "\\]";
      const openingLength = 2;
      const sameLine = first.indexOf(closing, openingLength);
      if (sameLine >= 0) {
        return {
          tex: first.slice(openingLength, sameLine).trim(),
          next: start + 1,
          open: false
        };
      }

      const tex = [first.slice(openingLength)];
      for (let index = start + 1; index < lines.length; index += 1) {
        const end = lines[index].indexOf(closing);
        if (end >= 0) {
          tex.push(lines[index].slice(0, end));
          return { tex: tex.join("\n").trim(), next: index + 1, open: false };
        }
        tex.push(lines[index]);
      }

      if (!allowIncomplete) {
        return null;
      }
      return { tex: tex.join("\n").trim(), next: lines.length, open: true };
    }

    const endMarker = `\\end{${specification.name}}`;
    const tex = [first];
    if (first.indexOf(endMarker) > 0) {
      return { tex: first.trim(), next: start + 1, open: false };
    }
    for (let index = start + 1; index < lines.length; index += 1) {
      tex.push(lines[index]);
      if (lines[index].includes(endMarker)) {
        return { tex: tex.join("\n").trim(), next: index + 1, open: false };
      }
    }
    if (!allowIncomplete) {
      return null;
    }
    return { tex: tex.join("\n").trim(), next: lines.length, open: true };
  }

  function parseTable(lines, start) {
    const headerCells = splitTableRow(lines[start]);
    const separatorCells = splitTableRow(lines[start + 1]);
    const alignments = separatorCells.map((cell) => {
      if (cell.startsWith(":") && cell.endsWith(":")) {
        return "center";
      }
      if (cell.endsWith(":")) {
        return "right";
      }
      if (cell.startsWith(":")) {
        return "left";
      }
      return "";
    });

    const header = headerCells.map((cell) => parseInline(cell));
    const rows = [];
    let index = start + 2;
    while (index < lines.length && !isBlank(lines[index]) && lines[index].includes("|")) {
      const cells = splitTableRow(lines[index]);
      rows.push(
        headerCells.map((_, column) => parseInline(cells[column] || ""))
      );
      index += 1;
    }

    return {
      block: { type: "table", alignments, header, rows },
      next: index
    };
  }

  function parseList(lines, start, allowIncomplete) {
    const first = matchListLine(lines[start]);
    const baseIndent = first.indent;
    const ordered = first.ordered;
    const items = [];
    let index = start;
    let open = false;

    while (index < lines.length) {
      const item = matchListLine(lines[index]);
      if (!item || item.indent !== baseIndent || item.ordered !== ordered) {
        break;
      }

      const itemLines = [item.content];
      let cursor = index + 1;

      while (cursor < lines.length) {
        if (isBlank(lines[cursor])) {
          let lookahead = cursor;
          while (lookahead < lines.length && isBlank(lines[lookahead])) {
            lookahead += 1;
          }
          if (lookahead >= lines.length) {
            cursor = lookahead;
            break;
          }
          const nextItem = matchListLine(lines[lookahead]);
          if (nextItem && nextItem.indent <= baseIndent) {
            cursor = lookahead;
            break;
          }
          if (!nextItem && leadingSpaces(lines[lookahead]) <= baseIndent) {
            cursor = lookahead;
            break;
          }
          itemLines.push("");
          cursor += 1;
          continue;
        }

        const nextItem = matchListLine(lines[cursor]);
        if (nextItem && nextItem.indent <= baseIndent) {
          break;
        }
        if (
          !nextItem &&
          leadingSpaces(lines[cursor]) <= baseIndent &&
          isBlockStart(lines, cursor)
        ) {
          break;
        }

        itemLines.push(removeIndent(lines[cursor], baseIndent + 2));
        cursor += 1;
      }

      let task = null;
      const taskMatch = itemLines[0].match(/^\[([ xX])\]\s+(.*)$/);
      if (taskMatch) {
        task = { checked: taskMatch[1].toLowerCase() === "x" };
        itemLines[0] = taskMatch[2];
      }

      const inner = parseBlocks(trimBlankLines(itemLines), 0, allowIncomplete);
      if (inner.open) {
        open = true;
        if (!allowIncomplete) {
          break;
        }
      }

      items.push({
        blocks: inner.blocks,
        task: Boolean(task),
        checked: Boolean(task && task.checked)
      });
      index = cursor;
    }

    return {
      block: {
        type: "list",
        ordered,
        indent: baseIndent,
        number: first.number,
        items
      },
      next: index,
      open
    };
  }

  function parseBlocks(lines, start, allowIncomplete) {
    const blocks = [];
    let index = start;
    let open = false;

    while (index < lines.length) {
      if (isBlank(lines[index])) {
        index += 1;
        continue;
      }

      const startLine = index;

      const fence = matchFence(lines[index]);
      if (fence) {
        const codeLines = [];
        let cursor = index + 1;
        let closed = false;
        while (cursor < lines.length) {
          if (isFenceClose(lines[cursor], fence.marker)) {
            closed = true;
            cursor += 1;
            break;
          }
          codeLines.push(lines[cursor]);
          cursor += 1;
        }
        if (!closed && !allowIncomplete) {
          open = true;
          break;
        }
        blocks.push({
          type: "fence",
          lang: fence.info.split(/\s+/)[0] || "",
          value: codeLines.join("\n"),
          startLine,
          endLine: cursor,
          open: !closed
        });
        index = cursor;
        continue;
      }

      const mathStart = matchBlockMathStart(lines[index]);
      if (mathStart) {
        const collected = collectBlockMath(
          lines,
          index,
          mathStart,
          allowIncomplete
        );
        if (!collected) {
          open = true;
          break;
        }
        blocks.push({
          type: "math",
          tex: collected.tex,
          display: true,
          startLine,
          endLine: collected.next,
          open: collected.open
        });
        index = collected.next;
        continue;
      }

      const heading = matchHeading(lines[index]);
      if (heading) {
        blocks.push({
          type: "heading",
          level: heading.level,
          inlines: parseInline(heading.text),
          startLine,
          endLine: index + 1
        });
        index += 1;
        continue;
      }

      if (matchHorizontalRule(lines[index])) {
        blocks.push({ type: "hr", startLine, endLine: index + 1 });
        index += 1;
        continue;
      }

      if (/^ {0,3}>/.test(lines[index])) {
        const quoteLines = [];
        let cursor = index;
        while (cursor < lines.length && /^ {0,3}>/.test(lines[cursor])) {
          quoteLines.push(lines[cursor].replace(/^ {0,3}> ?/, ""));
          cursor += 1;
        }
        const inner = parseBlocks(quoteLines, 0, allowIncomplete);
        if (inner.open) {
          open = true;
          if (!allowIncomplete) {
            break;
          }
        }
        blocks.push({
          type: "blockquote",
          blocks: inner.blocks,
          startLine,
          endLine: cursor,
          open: inner.open
        });
        index = cursor;
        continue;
      }

      if (isTableStart(lines, index)) {
        const table = parseTable(lines, index);
        blocks.push({
          ...table.block,
          startLine,
          endLine: table.next
        });
        index = table.next;
        continue;
      }

      if (matchListLine(lines[index])) {
        const parsed = parseList(lines, index, allowIncomplete);
        if (parsed.open) {
          open = true;
          if (!allowIncomplete) {
            break;
          }
        }
        blocks.push({
          ...parsed.block,
          startLine,
          endLine: parsed.next,
          open: parsed.open
        });
        index = parsed.next;
        continue;
      }

      if (/^ {4}\S/.test(lines[index])) {
        const codeLines = [];
        let cursor = index;
        while (
          cursor < lines.length &&
          (/^ {4}/.test(lines[cursor]) || isBlank(lines[cursor]))
        ) {
          codeLines.push(lines[cursor].replace(/^ {4}/, ""));
          cursor += 1;
        }
        blocks.push({
          type: "code",
          value: trimBlankLines(codeLines).join("\n"),
          startLine,
          endLine: cursor
        });
        index = cursor;
        continue;
      }

      const paragraphLines = [];
      let cursor = index;
      while (cursor < lines.length && !isBlank(lines[cursor])) {
        if (cursor > index && isBlockStart(lines, cursor)) {
          break;
        }
        paragraphLines.push(lines[cursor]);
        cursor += 1;
      }
      if (cursor === index) {
        paragraphLines.push(lines[index]);
        cursor += 1;
      }
      blocks.push({
        type: "paragraph",
        inlines: parseInline(paragraphLines.join("\n")),
        startLine,
        endLine: cursor
      });
      index = cursor;
    }

    return { blocks, next: index, open };
  }

  /* ------------------------------------------------------------------ */
  /* DOM rendering                                                       */
  /* ------------------------------------------------------------------ */

  function createMathElement(tex, displayMode) {
    const wrapper = document.createElement("span");
    wrapper.className = displayMode
      ? "ai-inline-math-block"
      : "ai-inline-math-inline";

    const target = document.createElement("span");
    target.className = "ai-inline-math";
    const katexLib = globalThis.katex;

    if (katexLib && typeof katexLib.renderToString === "function") {
      try {
        target.innerHTML = katexLib.renderToString(tex, {
          displayMode,
          output: "mathml",
          throwOnError: false,
          strict: "ignore",
          trust: false
        });
        wrapper.append(target);
        return wrapper;
      } catch {
        // Fall back to readable TeX below.
      }
    }

    target.textContent = displayMode ? `$$${tex}$$` : `$${tex}$`;
    wrapper.append(target);
    return wrapper;
  }

  function createLink(href) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer nofollow";
    return anchor;
  }

  function renderInlines(parent, nodes) {
    for (const node of nodes) {
      switch (node.type) {
        case "text":
          parent.append(document.createTextNode(node.value));
          break;
        case "strong": {
          const element = document.createElement("strong");
          renderInlines(element, node.children);
          parent.append(element);
          break;
        }
        case "em": {
          const element = document.createElement("em");
          renderInlines(element, node.children);
          parent.append(element);
          break;
        }
        case "del": {
          const element = document.createElement("del");
          renderInlines(element, node.children);
          parent.append(element);
          break;
        }
        case "code": {
          const code = document.createElement("code");
          code.className = "ai-inline-inline-code";
          code.textContent = node.value;
          parent.append(code);
          break;
        }
        case "link": {
          const anchor = createLink(node.href);
          renderInlines(anchor, node.children);
          parent.append(anchor);
          break;
        }
        case "image": {
          const image = document.createElement("img");
          image.className = "ai-inline-md-image";
          image.src = node.src;
          image.alt = node.alt;
          image.loading = "lazy";
          image.decoding = "async";
          image.referrerPolicy = "no-referrer";
          parent.append(image);
          break;
        }
        case "math":
          parent.append(createMathElement(node.tex, node.display));
          break;
        case "br":
          parent.append(document.createElement("br"));
          break;
        default:
          break;
      }
    }
  }

  function renderBlock(block) {
    switch (block.type) {
      case "heading": {
        const element = document.createElement(`h${block.level}`);
        renderInlines(element, block.inlines);
        return element;
      }
      case "paragraph": {
        const element = document.createElement("p");
        renderInlines(element, block.inlines);
        return element;
      }
      case "fence": {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        if (block.lang) {
          pre.dataset.language = block.lang;
        }
        code.textContent = block.value;
        pre.append(code);
        return pre;
      }
      case "code": {
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = block.value;
        pre.append(code);
        return pre;
      }
      case "hr":
        return document.createElement("hr");
      case "blockquote": {
        const quote = document.createElement("blockquote");
        appendBlocksTo(quote, block.blocks);
        return quote;
      }
      case "math":
        return createMathElement(block.tex, true);
      case "table": {
        const wrapper = document.createElement("div");
        wrapper.className = "ai-inline-table-wrap";
        const table = document.createElement("table");
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        block.header.forEach((cell, column) => {
          const th = document.createElement("th");
          if (block.alignments[column]) {
            th.style.textAlign = block.alignments[column];
          }
          renderInlines(th, cell);
          headerRow.append(th);
        });

        thead.append(headerRow);
        table.append(thead);

        if (block.rows.length > 0) {
          const tbody = document.createElement("tbody");
          for (const row of block.rows) {
            const tr = document.createElement("tr");
            row.forEach((cell, column) => {
              const td = document.createElement("td");
              if (block.alignments[column]) {
                td.style.textAlign = block.alignments[column];
              }
              renderInlines(td, cell);
              tr.append(td);
            });
            tbody.append(tr);
          }
          table.append(tbody);
        }

        wrapper.append(table);
        return wrapper;
      }
      case "list":
        return renderList(block);
      default:
        return document.createElement("span");
    }
  }

  function appendListItems(root, block) {
    for (const item of block.items) {
      const li = document.createElement("li");
      if (item.task) {
        li.classList.add("ai-inline-task-item");
      }

      let checkboxTarget = null;
      for (const child of item.blocks) {
        const element = renderBlock(child);
        if (!checkboxTarget && element.tagName === "P") {
          checkboxTarget = element;
        }
        li.append(element);
      }

      if (item.task) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.disabled = true;
        checkbox.checked = item.checked === true;
        (checkboxTarget || li).prepend(checkbox);
      }

      root.append(li);
    }
  }

  function renderList(block) {
    const root = document.createElement(block.ordered ? "ol" : "ul");
    if (block.ordered && block.number !== 1) {
      root.setAttribute("start", String(block.number));
    }
    appendListItems(root, block);
    return root;
  }

  function appendBlocksTo(parent, blocks) {
    createBlockSink((node) => parent.append(node)).append(blocks);
  }

  /**
   * A sink keeps the "loose list" behaviour: two lists separated by a blank
   * line render as one list, which matches CommonMark and avoids a visual seam
   * when a list is committed incrementally.
   */
  function createBlockSink(appendNode) {
    let lastList = null;
    return {
      append(blocks) {
        for (const block of blocks) {
          if (block.type === "list") {
            if (
              lastList &&
              lastList.ordered === block.ordered &&
              lastList.indent === 0 &&
              block.indent === 0
            ) {
              appendListItems(lastList.el, block);
              continue;
            }
            const element = renderList(block);
            appendNode(element);
            lastList = {
              ordered: block.ordered,
              indent: block.indent,
              el: element
            };
            continue;
          }

          lastList = null;
          appendNode(renderBlock(block));
        }
      }
    };
  }

  function render(markdown) {
    const lines = normalizeNewlines(markdown).split("\n");
    const parsed = parseBlocks(lines, 0, true);
    const fragment = document.createDocumentFragment();
    appendBlocksTo(fragment, parsed.blocks);
    return fragment;
  }

  /* ------------------------------------------------------------------ */
  /* Incremental streaming renderer                                      */
  /* ------------------------------------------------------------------ */

  /**
   * A list block is only committed once the following non-blank line is
   * flush left. Otherwise an indented continuation could still belong to the
   * list and would be flattened by re-parsing it from scratch.
   */
  function isListCommitSafe(lines, block) {
    for (let index = block.endLine + 1; index < lines.length; index += 1) {
      if (isBlank(lines[index])) {
        continue;
      }
      return leadingSpaces(lines[index]) === 0;
    }
    return false;
  }

  function createStreamRenderer(container) {
    let committedLines = 0;
    let tailNodes = [];
    let finished = false;
    const sink = createBlockSink((node) => container.append(node));

    function clearTail() {
      for (const node of tailNodes) {
        node.remove();
      }
      tailNodes = [];
    }

    function update(text) {
      if (finished) {
        return;
      }

      const lines = normalizeNewlines(text).split("\n");
      const completeLines = lines.slice(0, -1);

      // Committed nodes must stay before the re-rendered tail, so drop the tail
      // first and append it again afterwards.
      clearTail();

      const parsed = parseBlocks(completeLines, committedLines, false);
      for (const block of parsed.blocks) {
        if (block.open) {
          break;
        }
        if (block.endLine >= completeLines.length) {
          break;
        }
        if (block.type === "list" && !isListCommitSafe(completeLines, block)) {
          break;
        }
        sink.append([block]);
        committedLines = block.endLine;
      }

      const tail = parseBlocks(lines, committedLines, true);
      const tailSink = createBlockSink((node) => {
        container.append(node);
        tailNodes.push(node);
      });
      tailSink.append(tail.blocks);
    }

    function finish(text) {
      update(text);
      finished = true;
    }

    return { update, finish };
  }

  globalThis.AIInlineMarkdown = {
    render,
    renderBlocks(blocks) {
      const fragment = document.createDocumentFragment();
      appendBlocksTo(fragment, blocks);
      return fragment;
    },
    parse(markdown) {
      return parseBlocks(normalizeNewlines(markdown).split("\n"), 0, true).blocks;
    },
    parseInline,
    createStreamRenderer
  };
})();
