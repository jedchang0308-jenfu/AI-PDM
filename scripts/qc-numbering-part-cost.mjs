#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";

const root = process.cwd();
const helperPath = path.join(root, "src", "lib", "numbering-part-cost.ts");
const syncRepositoryPath = path.join(root, "src", "lib", "repositories", "numbering-repository.ts");
const asyncRepositoryPath = path.join(root, "src", "lib", "repositories", "numbering-async-repository.ts");
const helperSource = fs.readFileSync(helperPath, "utf8");
const syncSource = fs.readFileSync(syncRepositoryPath, "utf8");
const asyncSource = fs.readFileSync(asyncRepositoryPath, "utf8");
const helperAst = ts.createSourceFile(helperPath, helperSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const syncAst = ts.createSourceFile(syncRepositoryPath, syncSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const asyncAst = ts.createSourceFile(asyncRepositoryPath, asyncSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

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
      const expression = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : "";
      if (names.has(expression)) found = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function hasSharedHelperImport(sourceFile) {
  return sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.getText(sourceFile) !== '"@/lib/numbering-part-cost"') return false;
    const clause = statement.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return false;
    const importedNames = new Set(
      clause.namedBindings.elements.map((specifier) => specifier.propertyName?.text ?? specifier.name.text)
    );
    return importedNames.has("normalizePartCostTiers") && importedNames.has("normalizePositiveInteger");
  });
}

const tiersFunction = findFunction(helperAst, "normalizePartCostTiers");
const positiveIntegerFunction = findFunction(helperAst, "normalizePositiveInteger");
assert.ok(tiersFunction && hasExportModifier(tiersFunction), "helper exports normalizePartCostTiers via AST");
assert.ok(positiveIntegerFunction && hasExportModifier(positiveIntegerFunction), "helper exports normalizePositiveInteger via AST");
assert.equal(hasForbiddenCall(helperAst, new Set(["getDb", "query", "fetch"])), false, "helper remains DB/network free via AST");
assert.equal(hasSharedHelperImport(syncAst), true, "sync repository imports shared tier helpers via AST");
assert.equal(hasSharedHelperImport(asyncAst), true, "async repository imports shared tier helpers via AST");
assert.equal(findFunction(syncAst, "normalizePartCostTiers"), null, "sync repository has no local duplicate function via AST");
assert.equal(findFunction(asyncAst, "normalizePartCostTiers"), null, "async repository has no local duplicate function via AST");

function legacyNormalizePositiveInteger(value, fallback, errorCode) {
  const normalized = Math.floor(value ?? fallback);
  if (!Number.isFinite(normalized) || normalized < 1) throw new Error(errorCode);
  return normalized;
}

function legacyNormalizePartCostTiers(input) {
  if (input.length === 0) throw new Error("PART_COST_PROFILE_REQUIRES_TIER");
  const tiers = input
    .map((tier, index) => {
      const minQty = legacyNormalizePositiveInteger(tier.minQty, index === 0 ? 1 : index + 1, "INVALID_PART_COST_TIER_MIN_QTY");
      const maxQty = tier.maxQty === null || tier.maxQty === undefined ? null : legacyNormalizePositiveInteger(tier.maxQty, minQty, "INVALID_PART_COST_TIER_MAX_QTY");
      if (maxQty !== null && maxQty < minQty) throw new Error("INVALID_PART_COST_TIER_RANGE");
      if (!Number.isFinite(tier.unitCost) || tier.unitCost < 0) throw new Error("INVALID_PART_COST_TIER_UNIT_COST");
      const setupCost = tier.setupCost ?? 0;
      if (!Number.isFinite(setupCost) || setupCost < 0) throw new Error("INVALID_PART_COST_TIER_SETUP_COST");
      const leadTimeDays = tier.leadTimeDays === null || tier.leadTimeDays === undefined ? null : Math.floor(tier.leadTimeDays);
      if (leadTimeDays !== null && (!Number.isFinite(leadTimeDays) || leadTimeDays < 0)) throw new Error("INVALID_PART_COST_TIER_LEAD_TIME");
      return { minQty, maxQty, unitCost: tier.unitCost, setupCost, leadTimeDays, note: tier.note };
    })
    .sort((a, b) => a.minQty - b.minQty);

  let previousMax = null;
  for (const tier of tiers) {
    if (previousMax === "open") throw new Error("PART_COST_TIER_RANGE_OVERLAP");
    if (previousMax !== null && tier.minQty <= previousMax) throw new Error("PART_COST_TIER_RANGE_OVERLAP");
    if (tier.maxQty === null) previousMax = "open";
    else previousMax = tier.maxQty;
  }
  return tiers;
}

const { normalizePartCostTiers, normalizePositiveInteger } = await import(pathToFileURL(helperPath).href);

function assertParity(name, input) {
  const inputBefore = structuredClone(input);
  assert.deepEqual(normalizePartCostTiers(input), legacyNormalizePartCostTiers(input), name);
  assert.deepEqual(input, inputBefore, `${name}: input immutability`);
}

assertParity("sorted tiers and defaults", [
  { minQty: 11, maxQty: null, unitCost: 9.5, note: "late" },
  { minQty: 1, maxQty: 10, unitCost: 12, setupCost: 2, leadTimeDays: 3, note: null }
]);
assertParity("fractional values preserve legacy flooring", [
  { minQty: 1.9, maxQty: 4.8, unitCost: 0, setupCost: 0.5, leadTimeDays: 2.9 }
]);

for (const [name, input, errorCode] of [
  ["empty tiers", [], "PART_COST_PROFILE_REQUIRES_TIER"],
  ["invalid min qty", [{ minQty: 0, unitCost: 1 }], "INVALID_PART_COST_TIER_MIN_QTY"],
  ["invalid max qty", [{ minQty: 1, maxQty: 0, unitCost: 1 }], "INVALID_PART_COST_TIER_MAX_QTY"],
  ["invalid range", [{ minQty: 4, maxQty: 3, unitCost: 1 }], "INVALID_PART_COST_TIER_RANGE"],
  ["invalid unit cost", [{ minQty: 1, unitCost: -1 }], "INVALID_PART_COST_TIER_UNIT_COST"],
  ["invalid setup cost", [{ minQty: 1, unitCost: 1, setupCost: -1 }], "INVALID_PART_COST_TIER_SETUP_COST"],
  ["invalid lead time", [{ minQty: 1, unitCost: 1, leadTimeDays: -1 }], "INVALID_PART_COST_TIER_LEAD_TIME"],
  ["closed overlap", [{ minQty: 1, maxQty: 3, unitCost: 1 }, { minQty: 3, maxQty: 5, unitCost: 1 }], "PART_COST_TIER_RANGE_OVERLAP"],
  ["open overlap", [{ minQty: 1, maxQty: null, unitCost: 1 }, { minQty: 4, unitCost: 1 }], "PART_COST_TIER_RANGE_OVERLAP"]
]) {
  assert.throws(() => normalizePartCostTiers(input), new RegExp(errorCode));
  assert.throws(() => legacyNormalizePartCostTiers(input), new RegExp(errorCode));
}

assert.equal(normalizePositiveInteger(undefined, 1, "unused"), 1);
assert.equal(normalizePositiveInteger(3.9, 1, "unused"), 3);
assert.throws(() => normalizePositiveInteger(0, 1, "INVALID"), /INVALID/);
console.log("QC numbering part cost: PASS (shared helper + legacy parity + validation + immutability)");
