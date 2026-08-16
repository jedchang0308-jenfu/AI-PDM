#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const BASELINE_MAX_CYCLE_COUNT = 1;
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

const files = walk(srcRoot).map(path.normalize);
const fileSet = new Set(files);

function runtimeModuleSpecifiers(source, file) {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const specifiers = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      if (!clause) {
        specifiers.push(statement.moduleSpecifier.text);
        continue;
      }
      if (clause.isTypeOnly) continue;
      if (clause.name || ts.isNamespaceImport(clause.namedBindings)) {
        specifiers.push(statement.moduleSpecifier.text);
        continue;
      }
      if (ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.some((element) => !element.isTypeOnly)) {
        specifiers.push(statement.moduleSpecifier.text);
      }
      continue;
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (statement.isTypeOnly) continue;
      if (!statement.exportClause || ts.isNamespaceExport(statement.exportClause)) {
        specifiers.push(statement.moduleSpecifier.text);
        continue;
      }
      if (statement.exportClause.elements.some((element) => !element.isTypeOnly)) {
        specifiers.push(statement.moduleSpecifier.text);
      }
    }
  }
  return specifiers;
}

const parserCharacterization = runtimeModuleSpecifiers([
  'import type { A } from "./type-import";',
  'import { type B } from "./inline-type-import";',
  'import { runtimeValue, type RuntimeType } from "./mixed-import";',
  'import "./side-effect-import";',
  'export type { C } from "./type-export";',
  'export { type D } from "./inline-type-export";',
  'export { runtimeExport, type ExportType } from "./mixed-export";'
].join("\n"), "cycle-parser-characterization.ts");
record(
  "ARCH-BASELINE-000 dependency parser excludes erased type-only edges",
  JSON.stringify(parserCharacterization) === JSON.stringify([
    "./mixed-import",
    "./side-effect-import",
    "./mixed-export"
  ]),
  JSON.stringify(parserCharacterization)
);

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const base = specifier.startsWith("@/")
    ? path.join(srcRoot, specifier.slice(2))
    : path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx")
  ].map(path.normalize);
  return candidates.find((candidate) => fileSet.has(candidate)) ?? null;
}

const graph = new Map(files.map((file) => [file, []]));
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const specifiers = runtimeModuleSpecifiers(source, file);
  for (const specifier of specifiers) {
    const target = resolveImport(file, specifier);
    if (target) graph.get(file).push(target);
  }
}

let index = 0;
const indices = new Map();
const lowLinks = new Map();
const stack = [];
const onStack = new Set();
const components = [];

function visit(node) {
  indices.set(node, index);
  lowLinks.set(node, index);
  index += 1;
  stack.push(node);
  onStack.add(node);
  for (const next of graph.get(node) ?? []) {
    if (!indices.has(next)) {
      visit(next);
      lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(next)));
    } else if (onStack.has(next)) {
      lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(next)));
    }
  }
  if (lowLinks.get(node) !== indices.get(node)) return;
  const component = [];
  let current;
  do {
    current = stack.pop();
    onStack.delete(current);
    component.push(current);
  } while (current !== node);
  components.push(component);
}

for (const file of graph.keys()) if (!indices.has(file)) visit(file);

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

const cycles = components
  .filter((component) => component.length > 1 || (graph.get(component[0]) ?? []).includes(component[0]))
  .map((component) => {
    const members = new Set(component);
    const edges = [];
    for (const from of component) {
      for (const to of graph.get(from) ?? []) {
        if (members.has(to)) edges.push(`${relative(from)} -> ${relative(to)}`);
      }
    }
    return {
      nodeCount: component.length,
      files: component.map(relative).sort(),
      edges: edges.sort()
    };
  })
  .sort((left, right) => right.nodeCount - left.nodeCount || left.files[0].localeCompare(right.files[0]));

record(
  "ARCH-BASELINE-001 source graph is non-empty and import resolution is reproducible",
  files.length > 0 && graph.size === files.length,
  JSON.stringify({ files: files.length, edges: [...graph.values()].reduce((sum, targets) => sum + targets.length, 0) })
);
record(
  "ARCH-BASELINE-002 dependency cycle count does not exceed established baseline",
  cycles.length <= BASELINE_MAX_CYCLE_COUNT,
  JSON.stringify({ baselineMaxCycleCount: BASELINE_MAX_CYCLE_COUNT, cycleCount: cycles.length })
);

const report = {
  checkedAt: new Date().toISOString(),
  files: files.length,
  edges: [...graph.values()].reduce((sum, targets) => sum + targets.length, 0),
  baselineMaxCycleCount: BASELINE_MAX_CYCLE_COUNT,
  cycleCount: cycles.length,
  cycles,
  total: results.length,
  passed: results.filter((result) => result.passed).length,
  failed: results.filter((result) => !result.passed).length,
  results
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed === 0 ? 0 : 1;
