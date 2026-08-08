#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const baselineMode = process.argv.includes("--baseline");
const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const bomPath = "src/lib/repositories/bom-workbench-async-repository.ts";
const clipboardTargets = [
  "src/app/numbering/drawings/page.tsx",
  "src/app/numbering/search/page.tsx",
  "src/app/parts/page.tsx",
  "src/components/use-list-keyboard-shortcuts.ts"
];
const byteFormatTargets = [
  "src/app/numbering/revisions/page.tsx",
  "src/components/file-dropzone.tsx",
  "src/components/master-attachment-panel.tsx"
];

const bomSource = read(bomPath);
const saveFileBlock = bomSource.match(/(?:async )?function saveBomImportOriginalFile\([\s\S]*?(?=\nfunction parseSolidWorksBomImport)/u)?.[0] ?? "";
assert(saveFileBlock, "BOM import original-file helper exists");

if (baselineMode) {
  assert.match(saveFileBlock, /fs\.mkdirSync/u, "BOM async path sync mkdir baseline");
  assert.match(saveFileBlock, /fs\.writeFileSync/u, "BOM async path sync write baseline");
  assert.equal(clipboardTargets.filter((file) => /async function copyTextToClipboard/u.test(read(file))).length, 4, "four clipboard duplicate baselines");
  assert.equal(byteFormatTargets.filter((file) => /function formatBytes/u.test(read(file))).length, 3, "three byte formatter duplicate baselines");
  console.log("QC System Health Phase 7 characterization: PASS (sync BOM write, 4 clipboard copies, 3 byte formatters)");
  process.exit(0);
}

assert.match(bomSource, /const asset = await saveBomImportOriginalFile\(/u, "BOM request flow awaits original-file persistence");
assert.match(saveFileBlock, /^async function saveBomImportOriginalFile/u, "BOM original-file helper is asynchronous");
assert.match(saveFileBlock, /await fs\.promises\.mkdir/u, "BOM directory creation is non-blocking");
assert.match(saveFileBlock, /await fs\.promises\.writeFile/u, "BOM buffer persistence is non-blocking");
assert.doesNotMatch(saveFileBlock, /mkdirSync|writeFileSync/u, "BOM async helper has no synchronous filesystem operation");

for (const file of clipboardTargets) {
  const source = read(file);
  assert.match(source, /copyTextToClipboardBestEffort/u, `${file} uses shared best-effort clipboard helper`);
  assert.doesNotMatch(source, /async function copyTextToClipboard/u, `${file} removes local clipboard implementation`);
}

for (const file of byteFormatTargets) {
  const source = read(file);
  assert.match(source, /import \{ formatBytes \} from "@\/lib\/format-file-size"/u, `${file} uses shared byte formatter`);
  assert.doesNotMatch(source, /function formatBytes/u, `${file} removes local byte formatter`);
}

const { formatBytes } = await import(pathToFileURL(path.join(root, "src", "lib", "format-file-size.ts")).href);
assert.deepEqual(
  [Number.NaN, -1, 0, 1, 1023, 1024, 10 * 1024, 1.5 * 1024 * 1024, 2 * 1024 ** 4].map(formatBytes),
  ["0 B", "0 B", "0 B", "1 B", "1023 B", "1.0 KB", "10 KB", "1.5 MB", "2048 GB"],
  "shared byte formatter preserves boundary and rounding behavior"
);

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
try {
  class FakeElement {
    constructor() {
      this.style = {};
      this.attributes = new Map();
      this.value = "";
      this.removed = false;
      this.focused = false;
      this.selected = false;
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    focus() { this.focused = true; }
    select() { this.selected = true; }
    setSelectionRange() {}
    remove() { this.removed = true; }
  }
  let modernText = null;
  let appended = null;
  let legacyText = null;
  const activeElement = new FakeElement();
  Object.defineProperty(globalThis, "HTMLElement", { configurable: true, value: FakeElement });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      activeElement,
      createElement: () => new FakeElement(),
      body: { appendChild: (element) => { appended = element; } },
      execCommand: () => { legacyText = appended?.value ?? null; return false; }
    }
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: async (text) => { modernText = text; } } }
  });

  const { copyTextToClipboardBestEffort } = await import(pathToFileURL(path.join(root, "src", "lib", "client-clipboard.ts")).href);
  await copyTextToClipboardBestEffort("modern-copy");
  assert.equal(modernText, "modern-copy", "best-effort helper prefers Clipboard API");
  assert.equal(appended, null, "successful Clipboard API does not create fallback textarea");

  globalThis.navigator.clipboard.writeText = async () => { throw new Error("clipboard denied"); };
  await copyTextToClipboardBestEffort("legacy-copy");
  assert.equal(legacyText, "legacy-copy", "best-effort helper copies through legacy command after Clipboard API rejection");
  assert.equal(appended.removed, true, "legacy textarea is removed");
  assert.equal(activeElement.focused, true, "legacy copy restores focus");
} finally {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else delete globalThis.navigator;
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else delete globalThis.document;
  if (originalHTMLElement) Object.defineProperty(globalThis, "HTMLElement", originalHTMLElement);
  else delete globalThis.HTMLElement;
}

console.log("QC System Health Phase 7: PASS (async BOM I/O and shared UI utility parity)");
