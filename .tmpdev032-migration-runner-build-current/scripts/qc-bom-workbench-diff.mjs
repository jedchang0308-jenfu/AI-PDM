#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const root = process.cwd();
const helperPath = path.join(root, "src", "lib", "bom-workbench-diff.ts");
const repositoryPaths = [
  path.join(root, "src", "lib", "repositories", "bom-repository.ts"),
  path.join(root, "src", "lib", "repositories", "bom-workbench-async-repository.ts")
];
const helperSource = fs.readFileSync(helperPath, "utf8");
const repositorySources = repositoryPaths.map((filePath) => fs.readFileSync(filePath, "utf8"));
const helperAst = ts.createSourceFile(helperPath, helperSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const repositoryAsts = repositorySources.map((source, index) => ts.createSourceFile(repositoryPaths[index], source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
const { diffBomWorkbenchLines } = await import("@/lib/bom-workbench-diff");

assert.equal(typeof diffBomWorkbenchLines, "function");

function hasExportModifier(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function findFunction(sourceFile, name) {
  let match = null;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) match = node;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return match;
}

function hasForbiddenCall(sourceFile, names) {
  let found = false;
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
      if (names.has(expression)) found = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function hasSharedHelperImport(sourceFile) {
  return sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.getText(sourceFile) !== '"@/lib/bom-workbench-diff"') return false;
    const clause = statement.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return false;
    return clause.namedBindings.elements.some(
      (specifier) => specifier.propertyName?.text === "diffBomWorkbenchLines" && specifier.name.text === "diffBomWorkbenchLinesShared"
    );
  });
}

const helperFunction = findFunction(helperAst, "diffBomWorkbenchLines");
assert.ok(helperFunction && hasExportModifier(helperFunction), "helper exports diffBomWorkbenchLines via AST");
assert.equal(hasForbiddenCall(helperAst, new Set(["getDb", "query", "prepare", "fetch"])), false, "helper remains DB/network free via AST");
for (const repositoryAst of repositoryAsts) {
  assert.equal(hasSharedHelperImport(repositoryAst), true, "repository imports shared helper alias via AST");
  assert.equal(findFunction(repositoryAst, "diffBomWorkbenchLines"), null, "repository has no local duplicate function via AST");
}

function legacyDiffBomWorkbenchLines(baseLines, targetLines) {
  const before = legacyComparableLineMap(baseLines);
  const after = legacyComparableLineMap(targetLines);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const changes = [];

  for (const key of keys) {
    const previous = before.get(key) ?? null;
    const next = after.get(key) ?? null;
    if (!previous && next) {
      changes.push({ key, change_type: "added", label: next.label, before: null, after: next, changed_fields: ["line"] });
      continue;
    }
    if (previous && !next) {
      changes.push({ key, change_type: "removed", label: previous.label, before: previous, after: null, changed_fields: ["line"] });
      continue;
    }
    if (!previous || !next) continue;
    const changedFields = legacyChangedComparableFields(previous, next);
    changes.push({
      key,
      change_type: changedFields.length > 0 ? "changed" : "unchanged",
      label: next.label,
      before: previous,
      after: next,
      changed_fields: changedFields
    });
  }

  return changes.sort((a, b) => legacyDiffSortWeight(a.change_type) - legacyDiffSortWeight(b.change_type) || a.label.localeCompare(b.label));
}

function legacyComparableLineMap(lines) {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const occurrence = new Map();
  const comparable = new Map();
  const sorted = [...lines].sort((a, b) => a.sequence_no - b.sequence_no);

  for (const line of sorted) {
    const baseKey =
      line.node_type === "group"
        ? `group:${(line.group_name ?? "").trim().toUpperCase()}`
        : `item:${(line.part_number ?? "").trim().toUpperCase()}`;
    const count = (occurrence.get(baseKey) ?? 0) + 1;
    occurrence.set(baseKey, count);
    const key = `${baseKey}#${count}`;
    const parentPath = legacyBuildParentPath(line, byId);
    comparable.set(key, {
      key,
      node_type: line.node_type,
      label: line.node_type === "group" ? line.group_name || "Group" : `${line.part_number ?? "-"} Rev ${line.revision ?? "-"}`,
      part_number: line.part_number,
      revision: line.revision,
      group_name: line.group_name,
      quantity: line.quantity,
      parent_path: parentPath.path,
      level: parentPath.level,
      sequence_no: line.sequence_no
    });
  }
  return comparable;
}

function legacyBuildParentPath(line, byId) {
  const labels = [];
  const visited = new Set();
  let currentParentId = line.parent_line_id;
  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const parent = byId.get(currentParentId);
    if (!parent) break;
    labels.unshift(parent.node_type === "group" ? parent.group_name || "Group" : `${parent.part_number ?? "-"} Rev ${parent.revision ?? "-"}`);
    currentParentId = parent.parent_line_id;
  }
  return { path: labels.length > 0 ? labels.join(" / ") : "ROOT", level: labels.length };
}

function legacyChangedComparableFields(before, after) {
  const fields = [];
  if ((before.revision ?? "") !== (after.revision ?? "")) fields.push("revision");
  if ((before.quantity ?? null) !== (after.quantity ?? null)) fields.push("quantity");
  if (before.parent_path !== after.parent_path || before.level !== after.level) fields.push("hierarchy");
  if (before.sequence_no !== after.sequence_no) fields.push("sequence");
  return fields;
}

function legacyDiffSortWeight(changeType) {
  if (changeType === "added") return 1;
  if (changeType === "removed") return 2;
  if (changeType === "changed") return 3;
  return 4;
}

const line = (input) => ({
  id: input.id,
  parent_line_id: input.parent_line_id ?? null,
  node_type: input.node_type ?? "item",
  part_number: input.part_number ?? null,
  revision: input.revision ?? null,
  group_name: input.group_name ?? null,
  quantity: input.quantity ?? null,
  sequence_no: input.sequence_no
});
const baseLines = [
  line({ id: "item-1", parent_line_id: "group-1", part_number: "P-100", revision: "A", quantity: 1, sequence_no: 1 }),
  line({ id: "group-1", node_type: "group", group_name: "Main", sequence_no: 2 }),
  line({ id: "item-2", parent_line_id: "group-1", part_number: "P-100", revision: "A", quantity: 2, sequence_no: 3 })
];
const targetLines = [
  line({ id: "item-1", parent_line_id: "group-1", part_number: "P-100", revision: "B", quantity: 3, sequence_no: 1 }),
  line({ id: "group-1", node_type: "group", group_name: "Main", sequence_no: 2 }),
  line({ id: "item-3", parent_line_id: "group-1", part_number: "P-200", revision: "A", quantity: 1, sequence_no: 4 })
];
const baseSnapshot = structuredClone(baseLines);
const targetSnapshot = structuredClone(targetLines);
assert.deepEqual(diffBomWorkbenchLines(baseLines, targetLines), legacyDiffBomWorkbenchLines(baseSnapshot, targetSnapshot));
assert.deepEqual(baseLines, baseSnapshot);
assert.deepEqual(targetLines, targetSnapshot);

console.log("QC BOM workbench diff: PASS (shared helper + legacy parity + immutability)");
