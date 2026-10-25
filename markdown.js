(() => {
  const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
  const SAFE_IMAGE_PROTOCOLS = new Set(["http:", "https:"]);

  function render(markdown) {
    const fragment = document.createDocumentFragment();
    const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
    renderBlocks(lines, fragment, 0);
    return fragment;
  }

  function renderBlocks(lines, parent) {
    let index = 0;

    while (index < lines.length) {
      if (isBlank(lines[index])) {
        index += 1;
        continue;
      }

      const fence = matchFence(lines[index]);
      if (fence) {
        const codeLines = [];
        index += 1;
        while (index < lines.length && !isFenceClose(lines[index], fence.marker)) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) {
          index += 1;
        }

        const pre = document.createElement("pre");
        const code = document.createElement("code");
        const language = fence.info.split(/\s+/)[0];
        if (language) {
          pre.dataset.language = language;
        }
        code.textContent = codeLines.join("\n");
        pre.append(code);
        parent.append(pre);
        continue;
      }

      const heading = matchHeading(lines[index]);
      if (heading) {
        const element = document.createElement(`h${heading.level}`);
        renderInline(heading.text, element);
        parent.append(element);
        index += 1;
        continue;
      }

      if (matchHorizontalRule(lines[index])) {
        parent.append(document.createElement("hr"));
        index += 1;
        continue;
      }

      if (/^ {0,3}>/.test(lines[index])) {
        const quoteLines = [];
        while (index < lines.length && /^ {0,3}>/.test(lines[index])) {
          quoteLines.push(lines[index].replace(/^ {0,3}> ?/, ""));
          index += 1;
        }
        const quote = document.createElement("blockquote");
        renderBlocks(quoteLines, quote);
        parent.append(quote);
        continue;
      }

      const table = tryParseTable(lines, index);
      if (table) {
        parent.append(table.node);
        index = table.next;
        continue;
      }

      const list = matchListLine(lines[index]);
      if (list) {
        const parsed = parseList(lines, index);
        parent.append(parsed.node);
        index = parsed.next;
        continue;
      }

      if (/^ {4}\S/.test(lines[index])) {
        const codeLines = [];
        while (index < lines.length && (/^ {4}/.test(lines[index]) || isBlank(lines[index]))) {
          codeLines.push(lines[index].replace(/^ {4}/, ""));
          index += 1;
        }
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = trimBlankLines(codeLines).join("\n");
        pre.append(code);
        parent.append(pre);
        continue;
      }

      const paragraphLines = [];
      while (index < lines.length && !isBlank(lines[index])) {
        if (paragraphLines.length > 0 && isBlockStart(lines, index)) {
          break;
        }
        paragraphLines.push(lines[index]);
        index += 1;
      }

      const paragraph = document.createElement("p");
      renderInline(paragraphLines.join("\n"), paragraph);
      parent.append(paragraph);
    }
  }

  function parseList(lines, start) {
    const first = matchListLine(lines[start]);
    const root = document.createElement(first.ordered ? "ol" : "ul");
    if (first.ordered && first.number !== 1) {
      root.start = String(first.number);
    }
    const baseIndent = first.indent;
    let index = start;

    while (index < lines.length) {
      const item = matchListLine(lines[index]);
      if (!item || item.indent !== baseIndent || item.ordered !== first.ordered) {
        break;
      }

      let itemLines = [item.content];
      let nextIndex = index + 1;

      while (nextIndex < lines.length) {
        if (isBlank(lines[nextIndex])) {
          let lookahead = nextIndex;
          while (lookahead < lines.length && isBlank(lines[lookahead])) {
            lookahead += 1;
          }
          if (lookahead >= lines.length) {
            nextIndex = lookahead;
            break;
          }
          const nextItem = matchListLine(lines[lookahead]);
          if (nextItem && nextItem.indent <= baseIndent) {
            nextIndex = lookahead;
            break;
          }
          if (!nextItem && leadingSpaces(lines[lookahead]) <= baseIndent) {
            nextIndex = lookahead;
            break;
          }
          itemLines.push("");
          nextIndex += 1;
          continue;
        }

        const nextItem = matchListLine(lines[nextIndex]);
        if (nextItem && nextItem.indent <= baseIndent) {
          break;
        }
        if (
          !nextItem &&
          leadingSpaces(lines[nextIndex]) <= baseIndent &&
          isBlockStart(lines, nextIndex)
        ) {
          break;
        }

        itemLines.push(removeIndent(lines[nextIndex], baseIndent + 2));
        nextIndex += 1;
      }

      const listItem = document.createElement("li");
      const task = itemLines[0].match(/^\[([ xX])\]\s+(.*)$/);
      if (task) {
        listItem.classList.add("ai-inline-task-item");
        itemLines[0] = task[2];
      }

      renderBlocks(trimBlankLines(itemLines), listItem);

      if (task) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.disabled = true;
        checkbox.checked = task[1].toLowerCase() === "x";
        const container = listItem.querySelector("p") || listItem;
        container.prepend(checkbox);
      }

      root.append(listItem);
      index = nextIndex;
    }

    return { node: root, next: index };
  }

  function tryParseTable(lines, start) {
    if (start + 1 >= lines.length || !lines[start].includes("|")) {
      return null;
    }

    const headerCells = splitTableRow(lines[start]);
    const separatorCells = splitTableRow(lines[start + 1]);
    if (
      headerCells.length === 0 ||
      separatorCells.length !== headerCells.length ||
      !separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      return null;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "ai-inline-table-wrap";
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
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

    headerCells.forEach((cell, cellIndex) => {
      const th = document.createElement("th");
      if (alignments[cellIndex]) {
        th.style.textAlign = alignments[cellIndex];
      }
      renderInline(cell, th);
      headerRow.append(th);
    });

    thead.append(headerRow);
    table.append(thead);
    const tbody = document.createElement("tbody");
    let index = start + 2;

    while (index < lines.length && !isBlank(lines[index]) && lines[index].includes("|")) {
      const cells = splitTableRow(lines[index]);
      const row = document.createElement("tr");
      for (let cellIndex = 0; cellIndex < headerCells.length; cellIndex += 1) {
        const td = document.createElement("td");
        if (alignments[cellIndex]) {
          td.style.textAlign = alignments[cellIndex];
        }
        renderInline(cells[cellIndex] || "", td);
        row.append(td);
      }
      tbody.append(row);
      index += 1;
    }

    if (tbody.children.length > 0) {
      table.append(tbody);
    }
    wrapper.append(table);
    return { node: wrapper, next: index };
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

  function renderInline(text, parent) {
    let index = 0;
    let buffer = "";

    const flush = () => {
      if (buffer) {
        parent.append(document.createTextNode(buffer));
        buffer = "";
      }
    };

    while (index < text.length) {
      const char = text[index];

      if (char === "\\" && index + 1 < text.length) {
        buffer += text[index + 1];
        index += 2;
        continue;
      }

      if (char === "`") {
        let runLength = 1;
        while (text[index + runLength] === "`") {
          runLength += 1;
        }
        const marker = "`".repeat(runLength);
        const end = text.indexOf(marker, index + runLength);
        if (end >= 0) {
          flush();
          const code = document.createElement("code");
          code.className = "ai-inline-inline-code";
          code.textContent = text.slice(index + runLength, end).replace(/\n/g, " ");
          parent.append(code);
          index = end + runLength;
          continue;
        }
        buffer += marker;
        index += runLength;
        continue;
      }

      if ((char === "!" && text[index + 1] === "[") || char === "[") {
        const link = parseLinkOrImage(text, index);
        if (link) {
          flush();
          parent.append(link.node);
          index = link.next;
          continue;
        }
      }

      if (text.startsWith("**", index) || text.startsWith("__", index)) {
        const marker = text.slice(index, index + 2);
        const end = text.indexOf(marker, index + 2);
        if (end > index + 2) {
          flush();
          const strong = document.createElement("strong");
          renderInline(text.slice(index + 2, end), strong);
          parent.append(strong);
          index = end + 2;
          continue;
        }
        buffer += marker;
        index += 2;
        continue;
      }

      if (text.startsWith("~~", index)) {
        const end = text.indexOf("~~", index + 2);
        if (end > index + 2) {
          flush();
          const strikethrough = document.createElement("del");
          renderInline(text.slice(index + 2, end), strikethrough);
          parent.append(strikethrough);
          index = end + 2;
          continue;
        }
        buffer += "~~";
        index += 2;
        continue;
      }

      if (char === "*" || char === "_") {
        const end = text.indexOf(char, index + 1);
        if (end > index + 1) {
          flush();
          const emphasis = document.createElement("em");
          renderInline(text.slice(index + 1, end), emphasis);
          parent.append(emphasis);
          index = end + 1;
          continue;
        }
      }

      if (char === "<") {
        const end = text.indexOf(">", index + 1);
        if (end > index + 1) {
          const href = toSafeUrl(text.slice(index + 1, end), false);
          if (href) {
            flush();
            const anchor = createLink(href);
            anchor.textContent = text.slice(index + 1, end);
            parent.append(anchor);
            index = end + 1;
            continue;
          }
        }
      }

      if (char === "\n") {
        flush();
        parent.append(document.createElement("br"));
        index += 1;
        continue;
      }

      buffer += char;
      index += 1;
    }

    flush();
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
      const image = document.createElement("img");
      image.className = "ai-inline-md-image";
      image.src = href;
      image.alt = label.replace(/[*_~`]/g, "");
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      return { node: image, next: destinationEnd + 1 };
    }

    const anchor = createLink(href);
    renderInline(label, anchor);
    return { node: anchor, next: destinationEnd + 1 };
  }

  function createLink(href) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer nofollow";
    return anchor;
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

  function matchFence(line) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    return match ? { marker: match[1], info: match[2].trim() } : null;
  }

  function isFenceClose(line, marker) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
    return Boolean(
      match &&
        match[1][0] === marker[0] &&
        match[1].length >= marker.length
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
    const match = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    if (!match) {
      return null;
    }
    const ordered = /^\d/.test(match[2]);
    return {
      indent: match[1].replace(/\t/g, "    ").length,
      ordered,
      number: ordered ? Number.parseInt(match[2], 10) : null,
      content: match[3]
    };
  }

  function isBlockStart(lines, index) {
    const line = lines[index];
    if (isBlank(line)) {
      return true;
    }
    return Boolean(
      matchFence(line) ||
        matchHeading(line) ||
        matchHorizontalRule(line) ||
        /^ {0,3}>/.test(line) ||
        matchListLine(line) ||
        /^ {4}\S/.test(line) ||
        isTableStart(lines, index)
    );
  }

  function isTableStart(lines, index) {
    if (index + 1 >= lines.length || !lines[index].includes("|")) {
      return false;
    }
    const cells = splitTableRow(lines[index + 1]);
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function leadingSpaces(line) {
    const match = line.match(/^\s*/);
    return match ? match[0].replace(/\t/g, "    ").length : 0;
  }

  function removeIndent(line, count) {
    let removed = 0;
    let index = 0;
    while (index < line.length && removed < count && (line[index] === " " || line[index] === "\t")) {
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

  function isBlank(line) {
    return !line.trim();
  }

  globalThis.AIInlineMarkdown = { render };
})();
