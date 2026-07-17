#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const taskPath = ".ai-doc/dev_task.md";
const mapPath = ".ai-doc/documentation_map.md";
const coldStartPath = ".ai-doc/cold-start.md";
const completedIndexPath = ".ai-doc/archived/completed-dev-index-2026-07.md";
const baselinePath = "scripts/fixtures/ai-doc-dev-task-status-baseline.json";
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replaceAll("\r\n", "\n");
}

function readRaw(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function bytes(text) {
  return Buffer.byteLength(text, "utf8");
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function parseEntries(markdown) {
  const lines = markdown.split("\n");
  const starts = [];
  lines.forEach((line, index) => {
    const match = line.match(/^-\s*([✓○☐◐◇!↷×])\s+(DEV-\d{3})\b/u);
    if (match) starts.push({ index, symbol: match[1], id: match[2], header: line });
  });

  return starts.map((entry, index) => {
    let end = starts[index + 1]?.index ?? lines.length;
    for (let cursor = entry.index + 1; cursor < end; cursor += 1) {
      if (/^##\s+/u.test(lines[cursor])) {
        end = cursor;
        break;
      }
    }
    const blockLines = lines.slice(entry.index, end);
    while (blockLines.at(-1) === "") blockLines.pop();
    return { ...entry, lines: blockLines, raw: `${blockLines.join("\n")}\n` };
  });
}

function fieldNames(entry) {
  const fields = [];
  for (const line of entry.lines) {
    for (const match of line.matchAll(/(?:^  - |；)([^：；\n]+)：/gu)) fields.push(match[1]);
  }
  return fields;
}

function sectionForDev(documentationMap, id) {
  const match = new RegExp(`^### ${id}\\b`, "mu").exec(documentationMap);
  if (!match) return "";
  const rest = documentationMap.slice(match.index + match[0].length);
  const next = /\n##{2,3}\s+/u.exec(rest);
  return rest.slice(0, next?.index ?? rest.length);
}

function localReferenceFailures(documentName, markdown) {
  const failures = [];
  const pattern = /`((?:\.ai-doc|output|data|config|scripts)\/[^`\r\n]+)`/gu;
  for (const match of markdown.matchAll(pattern)) {
    const relativePath = match[1];
    if (!fs.existsSync(path.join(root, relativePath))) {
      failures.push(`${documentName}: ${relativePath}`);
    }
  }
  return failures;
}

const taskRaw = readRaw(taskPath);
const documentationMapRaw = readRaw(mapPath);
const coldStartRaw = readRaw(coldStartPath);
const task = taskRaw.replaceAll("\r\n", "\n");
const documentationMap = documentationMapRaw.replaceAll("\r\n", "\n");
const coldStart = coldStartRaw.replaceAll("\r\n", "\n");
const completedIndex = read(completedIndexPath);
const baseline = JSON.parse(read(baselinePath));
const taskLines = task.split("\n");
const entries = parseEntries(task);
const ids = entries.map((entry) => entry.id);
const uniqueIds = new Set(ids);
const baselineIds = Object.keys(baseline.statuses);
const protectedEntry = entries.find((entry) => entry.id === "DEV-046");
const protectedBytes = protectedEntry ? bytes(protectedEntry.raw) : 0;
const effectiveTaskBytes = bytes(task) - protectedBytes;
const indexLine = taskLines.findIndex((line) => /^## 總任務清單\s*$/u.test(line)) + 1;
const h2Count = taskLines.filter((line) => /^##\s+/u.test(line)).length;

record("AIDOC-001 total DEV count remains 49", entries.length === baseline.devCount, String(entries.length));
record("AIDOC-002 DEV IDs are unique", uniqueIds.size === entries.length, `${uniqueIds.size}/${entries.length}`);
record(
  "AIDOC-003 DEV ID set matches baseline",
  baselineIds.every((id) => uniqueIds.has(id)) && ids.every((id) => baseline.statuses[id]),
  JSON.stringify({ missing: baselineIds.filter((id) => !uniqueIds.has(id)), extra: ids.filter((id) => !baseline.statuses[id]) })
);
record(
  "AIDOC-004 status symbols match baseline",
  entries.every((entry) => baseline.statuses[entry.id] === entry.symbol),
  JSON.stringify(entries.filter((entry) => baseline.statuses[entry.id] !== entry.symbol).map((entry) => ({ id: entry.id, actual: entry.symbol, expected: baseline.statuses[entry.id] })))
);
record(
  "AIDOC-005 total index is in first third",
  indexLine > 0 && indexLine <= Math.ceil(taskLines.length / 3),
  `${indexLine}/${taskLines.length}`
);
record("AIDOC-006 dev_task has at most three H2 sections", h2Count <= 3, String(h2Count));
record("AIDOC-007 dev_task has at most 300 lines", taskLines.length <= 300, String(taskLines.length));
record("AIDOC-008 cold-start is at most 8 KiB", bytes(coldStartRaw) <= 8 * 1024, String(bytes(coldStartRaw)));
record("AIDOC-009 documentation_map is at most 50 KiB", bytes(documentationMapRaw) <= 50 * 1024, String(bytes(documentationMapRaw)));
record(
  "AIDOC-010 effective dev_task excluding protected DEV-046 is at most 30 KiB",
  effectiveTaskBytes <= 30 * 1024,
  JSON.stringify({ physical: bytes(taskRaw), protectedNormalized: protectedBytes, effectiveNormalized: effectiveTaskBytes })
);
record("AIDOC-011 physical dev_task is at most 30 KiB", bytes(taskRaw) <= 30 * 1024, String(bytes(taskRaw)));
record(
  "AIDOC-012 three core documents total at most 88 KiB",
  bytes(taskRaw) + bytes(documentationMapRaw) + bytes(coldStartRaw) <= 88 * 1024,
  String(bytes(taskRaw) + bytes(documentationMapRaw) + bytes(coldStartRaw))
);

const protectedHash = protectedEntry
  ? crypto.createHash("sha256").update(protectedEntry.raw, "utf8").digest("hex").toUpperCase()
  : "";
record("AIDOC-013 DEV-046 protected content is stable after newline normalization", protectedHash === baseline.dev046Sha256, protectedHash);

const fieldOrder = new Map([
  ["摘要", 0],
  ["來源 ID", 1],
  ["父任務", 2],
  ["下一步", 3],
  ["阻塞 / 恢復條件", 4],
  ["阻塞", 4],
  ["恢復條件", 4],
  ["證據", 5],
  ["歸檔", 6],
  ["批次發版", 7],
  ["計入交付", 8]
]);
const fieldFailures = [];
for (const entry of entries.filter((item) => item.id !== "DEV-046")) {
  const fields = fieldNames(entry);
  const unknown = fields.filter((field) => !fieldOrder.has(field));
  const indexes = fields.filter((field) => fieldOrder.has(field)).map((field) => fieldOrder.get(field));
  const ordered = indexes.every((value, index) => index === 0 || value >= indexes[index - 1]);
  const hasEvidence = fields.includes("證據") || fields.includes("歸檔");
  const completedShape = entry.symbol !== "✓" || fields.includes("歸檔");
  const activeShape = entry.symbol === "✓" || (fields.includes("來源 ID") && fields.includes("證據"));
  if (unknown.length || !ordered || !fields.includes("摘要") || !fields.includes("計入交付") || !hasEvidence || !completedShape || !activeShape) {
    fieldFailures.push({ id: entry.id, fields, unknown, ordered, hasEvidence, completedShape, activeShape });
  }
}
record("AIDOC-014 canonical field order and minimum fields pass", fieldFailures.length === 0, JSON.stringify(fieldFailures));

const longLineFailures = [];
for (const entry of entries.filter((item) => item.id !== "DEV-046")) {
  entry.lines.forEach((line, index) => {
    const limit = index === 0 ? 160 : 110;
    if (line.length > limit) longLineFailures.push({ id: entry.id, chars: line.length, line });
  });
}
record("AIDOC-015 non-protected entries respect line budget", longLineFailures.length === 0, JSON.stringify(longLineFailures));

const incompleteEntries = entries.filter((entry) => entry.symbol !== "✓");
record(
  "AIDOC-016 every non-completed DEV is locatable in documentation_map",
  incompleteEntries.every((entry) => documentationMap.includes(`DEV-${entry.id.slice(4)}`)),
  JSON.stringify(incompleteEntries.filter((entry) => !documentationMap.includes(entry.id)).map((entry) => entry.id))
);
const codeCandidateIds = entries.filter((entry) => ["○", "☐", "◐", "◇"].includes(entry.symbol)).map((entry) => entry.id);
const missingContracts = codeCandidateIds.filter((id) => {
  const section = sectionForDev(documentationMap, id);
  return !section.includes(".ai-doc/specs/") && !section.includes("No active spec found");
});
record("AIDOC-017 active code candidates expose a spec decision", missingContracts.length === 0, JSON.stringify(missingContracts));
record(
  "AIDOC-018 map and cold-start do not duplicate canonical status lines",
  !/^-\s*[✓○☐◐◇!↷×]\s+DEV-\d{3}\b/mu.test(documentationMap) && !/^-\s*[✓○☐◐◇!↷×]\s+DEV-\d{3}\b/mu.test(coldStart)
);

const completedMissing = entries
  .filter((entry) => entry.symbol === "✓")
  .filter((entry) => !new RegExp(`^### ${entry.id}\\b`, "mu").test(completedIndex))
  .map((entry) => entry.id);
record("AIDOC-019 every completed DEV has an archive index entry", completedMissing.length === 0, JSON.stringify(completedMissing));

const taskWithoutProtected = protectedEntry ? task.replace(protectedEntry.raw, "") : task;
const referenceFailures = [
  ...localReferenceFailures(taskPath, taskWithoutProtected),
  ...localReferenceFailures(mapPath, documentationMap),
  ...localReferenceFailures(coldStartPath, coldStart)
];
record("AIDOC-020 core local references exist", referenceFailures.length === 0, JSON.stringify(referenceFailures));
record("AIDOC-021 map keeps single documentation center contract", documentationMap.includes("single project documentation center"));

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  passed: results.length - failed.length,
  failed: failed.length,
  metrics: {
    taskLines: taskLines.length,
    taskBytes: bytes(taskRaw),
    protectedDev046Bytes: protectedBytes,
    effectiveTaskBytes,
    mapBytes: bytes(documentationMapRaw),
    coldStartBytes: bytes(coldStartRaw),
    coreBytes: bytes(taskRaw) + bytes(documentationMapRaw) + bytes(coldStartRaw)
  },
  results
}, null, 2));

if (failed.length > 0) process.exitCode = 1;
