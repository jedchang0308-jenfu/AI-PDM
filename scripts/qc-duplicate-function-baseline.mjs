#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const BASELINE_MAX_DUPLICATE_FUNCTION_GROUPS = 62;
const BASELINE_MAX_DUPLICATE_FUNCTION_PAIRS = 60;
const MIN_BODY_LENGTH = 240;
const results = [];

function record(id, passed, detail = "") {
  results.push({ id, passed: Boolean(passed), detail });
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(entryPath);
    return /\.(ts|tsx)$/u.test(entry.name) ? [entryPath] : [];
  });
}

function normalizeBody(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/\/\/[^\n]*/gu, " ")
    .replace(/(['"`])(?:\\.|(?!\1).)*\1/gu, "<str>")
    .replace(/\b\d+(?:\.\d+)?\b/gu, "<num>")
    .replace(/\s+/gu, " ")
    .trim();
}

function isFunctionLike(node) {
  return ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
    ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

const files = walk(srcRoot);
const duplicateGroupsByHash = new Map();
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  function visit(node) {
    if (isFunctionLike(node) && node.body) {
      const body = normalizeBody(node.body.getText(sourceFile));
      if (body.length >= MIN_BODY_LENGTH && body.split(";").length >= 3) {
        const hash = crypto.createHash("sha1").update(body).digest("hex");
        const group = duplicateGroupsByHash.get(hash) ?? { files: new Set(), sample: body.slice(0, 500) };
        group.files.add(path.relative(root, file).replaceAll(path.sep, "/"));
        duplicateGroupsByHash.set(hash, group);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

const groups = [...duplicateGroupsByHash.values()]
  .filter((group) => group.files.size >= 2)
  .map((group) => ({ ...group, files: [...group.files].sort() }))
  .sort((left, right) => right.files.length - left.files.length || left.files[0].localeCompare(right.files[0]));
const filePairs = new Set();
for (const group of groups) {
  for (let left = 0; left < group.files.length; left += 1) {
    for (let right = left + 1; right < group.files.length; right += 1) {
      filePairs.add(`${group.files[left]}\u0000${group.files[right]}`);
    }
  }
}

const duplicateFunctionGroupCount = groups.length;
const duplicateFunctionPairCount = filePairs.size;
record(
  "ARCH-BASELINE-004 duplicate function baseline scans source AST bodies",
  files.length > 0 && duplicateFunctionGroupCount >= 0 && duplicateFunctionPairCount >= 0,
  JSON.stringify({ files: files.length, duplicateFunctionGroupCount, duplicateFunctionPairCount })
);
record(
  "ARCH-BASELINE-005 duplicate function groups and file pairs do not exceed baseline",
  duplicateFunctionGroupCount <= BASELINE_MAX_DUPLICATE_FUNCTION_GROUPS &&
    duplicateFunctionPairCount <= BASELINE_MAX_DUPLICATE_FUNCTION_PAIRS,
  JSON.stringify({
    baselineMaxDuplicateFunctionGroups: BASELINE_MAX_DUPLICATE_FUNCTION_GROUPS,
    baselineMaxDuplicateFunctionPairs: BASELINE_MAX_DUPLICATE_FUNCTION_PAIRS,
    duplicateFunctionGroupCount,
    duplicateFunctionPairCount
  })
);

const report = {
  checkedAt: new Date().toISOString(),
  files: files.length,
  minBodyLength: MIN_BODY_LENGTH,
  baselineMaxDuplicateFunctionGroups: BASELINE_MAX_DUPLICATE_FUNCTION_GROUPS,
  baselineMaxDuplicateFunctionPairs: BASELINE_MAX_DUPLICATE_FUNCTION_PAIRS,
  duplicateFunctionGroupCount,
  duplicateFunctionPairCount,
  topGroups: groups.slice(0, 12),
  total: results.length,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  results
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed === 0 ? 0 : 1;
