#!/usr/bin/env node
/**
 * Build a store-ready ZIP of the unpacked extension without any dependency.
 *
 * Usage: node scripts/package.mjs [--out <directory>]
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const INCLUDE_FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "content.css",
  "i18n.js",
  "markdown.js",
  "options.html",
  "options.js",
  "options.css",
  "LICENSE"
];
const INCLUDE_DIRECTORIES = ["_locales", "vendor", "icons"];
const EXCLUDE_FILES = new Set(["icons/icon-master.png"]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date) {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() / 2) & 0x1f);
  const day =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time, day };
}

function walk(relative) {
  const absolute = path.join(ROOT, relative);
  if (statSync(absolute).isFile()) {
    return [relative];
  }
  return readdirSync(absolute).flatMap((name) => walk(`${relative}/${name}`));
}

function collectFiles() {
  const files = [...INCLUDE_FILES];
  for (const directory of INCLUDE_DIRECTORIES) {
    if (existsSync(path.join(ROOT, directory))) {
      files.push(...walk(directory));
    }
  }
  return [...new Set(files)]
    .filter((file) => !EXCLUDE_FILES.has(file))
    .filter((file) => existsSync(path.join(ROOT, file)))
    .sort();
}

function createZip(entries, timestamp) {
  const { time, day } = dosTimestamp(timestamp);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const data = entry.data;
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--out");
const outputDirectory =
  outputIndex >= 0 && args[outputIndex + 1]
    ? path.resolve(process.cwd(), args[outputIndex + 1])
    : path.join(ROOT, "dist");

const manifest = JSON.parse(readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
const files = collectFiles();
const entries = files.map((name) => ({
  name,
  data: readFileSync(path.join(ROOT, name))
}));

const archive = createZip(entries, new Date());
mkdirSync(outputDirectory, { recursive: true });
const outputFile = path.join(
  outputDirectory,
  `ai-selection-assistant-${manifest.version}.zip`
);
writeFileSync(outputFile, archive);

console.log(
  `package: wrote ${path.relative(ROOT, outputFile)} (${files.length} files, ${(
    archive.length / 1024
  ).toFixed(1)} KiB)`
);
