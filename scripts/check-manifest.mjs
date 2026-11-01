#!/usr/bin/env node
/**
 * Static verification for the unpacked extension:
 * - manifest/package version agree and every referenced file exists
 * - icons are valid PNGs of the advertised size
 * - locales define the same keys and placeholders
 * - every translation key used by JS/HTML/manifest exists in the default locale
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_LOCALE = "en";
const errors = [];
const warnings = [];

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function checkFile(relativePath, label) {
  if (!existsSync(path.join(ROOT, relativePath))) {
    fail(`${label}: missing file ${relativePath}`);
    return false;
  }
  return true;
}

function pngSize(relativePath) {
  const file = path.join(ROOT, relativePath);
  const buffer = readFileSync(file);
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const manifest = readJson("manifest.json");
const pkg = readJson("package.json");

if (manifest.version !== pkg.version) {
  fail(`version mismatch: manifest ${manifest.version} vs package.json ${pkg.version}`);
}
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  fail(`manifest.version is not semver: ${manifest.version}`);
}

checkFile("background.js", "background");
if (manifest.options_page) {
  checkFile(manifest.options_page, "options_page");
}

for (const [size, relativePath] of Object.entries(manifest.icons || {})) {
  if (!checkFile(relativePath, "icons")) {
    continue;
  }
  const dimensions = pngSize(relativePath);
  if (!dimensions) {
    fail(`icons: ${relativePath} is not a PNG`);
    continue;
  }
  if (dimensions.width !== Number(size) || dimensions.height !== Number(size)) {
    fail(
      `icons: ${relativePath} is ${dimensions.width}x${dimensions.height}, expected ${size}x${size}`
    );
  }
}

for (const [size, relativePath] of Object.entries(
  (manifest.action && manifest.action.default_icon) || {}
)) {
  checkFile(relativePath, `action.${size}`);
}

for (const script of manifest.content_scripts || []) {
  for (const file of script.js || []) {
    checkFile(file, "content_scripts.js");
  }
  for (const file of script.css || []) {
    checkFile(file, "content_scripts.css");
  }
}

const locales = {};
for (const directory of readdirSync(path.join(ROOT, "_locales"))) {
  const file = path.join(ROOT, "_locales", directory, "messages.json");
  if (!existsSync(file)) {
    continue;
  }
  try {
    locales[directory] = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`_locales/${directory}/messages.json is not valid JSON: ${error.message}`);
  }
}

if (!locales[DEFAULT_LOCALE]) {
  fail(`default locale ${DEFAULT_LOCALE} is missing`);
}

const defaultKeys = new Set(Object.keys(locales[DEFAULT_LOCALE] || {}));
for (const [locale, messages] of Object.entries(locales)) {
  const keys = new Set(Object.keys(messages));
  for (const key of defaultKeys) {
    if (!keys.has(key)) {
      fail(`locale ${locale} is missing key "${key}"`);
    }
  }
  for (const key of keys) {
    if (!defaultKeys.has(key)) {
      fail(`locale ${locale} has a key "${key}" that the default locale does not`);
    }
  }
  for (const key of keys) {
    const message = messages[key];
    if (!message || typeof message.message !== "string") {
      fail(`locale ${locale} key "${key}" has no message string`);
      continue;
    }
    const placeholders = Object.keys(message.placeholders || {}).sort().join(",");
    const defaultPlaceholders = Object.keys(
      (locales[DEFAULT_LOCALE] && locales[DEFAULT_LOCALE][key] && locales[DEFAULT_LOCALE][key].placeholders) ||
        {}
    )
      .sort()
      .join(",");
    if (placeholders !== defaultPlaceholders) {
      fail(
        `locale ${locale} key "${key}" placeholders differ from ${DEFAULT_LOCALE}: "${placeholders}" vs "${defaultPlaceholders}"`
      );
    }
  }
}

function listSourceFiles() {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(path.join(ROOT, directory), { withFileTypes: true })) {
      if (entry.name === "vendor" || entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      const relative = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(relative);
      } else if (/\.(?:js|html)$/.test(entry.name)) {
        files.push(relative);
      }
    }
  };
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isFile() && /\.(?:js|html)$/.test(entry.name)) {
      files.push(entry.name);
    }
  }
  visit("_locales");
  return files;
}

const usedKeys = new Set();
for (const file of listSourceFiles()) {
  const source = readFileSync(path.join(ROOT, file), "utf8");
  for (const match of source.matchAll(/\bt\(\s*["']([A-Za-z0-9_]+)["']/g)) {
    usedKeys.add(match[1]);
  }
  for (const match of source.matchAll(/data-i18n(?:-placeholder)?="([A-Za-z0-9_]+)"/g)) {
    usedKeys.add(match[1]);
  }
}

for (const match of JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) {
  usedKeys.add(match[1]);
}

for (const key of usedKeys) {
  if (!defaultKeys.has(key)) {
    fail(`translation key "${key}" is used but not defined in ${DEFAULT_LOCALE}`);
  }
}

for (const key of defaultKeys) {
  if (!usedKeys.has(key)) {
    warn(`translation key "${key}" is defined but never used`);
  }
}

if (manifest.permissions?.includes("<all_urls>")) {
  warn("manifest uses <all_urls> in permissions");
}

const report = (label, entries) => {
  for (const entry of entries) {
    console.log(`${label} ${entry}`);
  }
};

if (warnings.length > 0) {
  report("WARN", warnings);
}
if (errors.length > 0) {
  report("FAIL", errors);
  console.error(`\ncheck-manifest: ${errors.length} problem(s)`);
  process.exit(1);
}

console.log(
  `check-manifest: ok (${defaultKeys.size} keys, ${Object.keys(locales).length} locales, version ${manifest.version})`
);
