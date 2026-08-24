#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";

const root = process.cwd();
const helperPath = path.join(root, "src", "lib", "numbering-hard-approval-rules.ts");
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
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.getText(sourceFile) !== '"@/lib/numbering-hard-approval-rules"') return false;
    const clause = statement.importClause;
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings)) return false;
    return clause.namedBindings.elements.some(
      (specifier) => specifier.propertyName?.text === "evaluateHardApprovalRules" && specifier.name.text === "evaluateHardApprovalRulesShared"
    );
  });
}

const helperFunction = findFunction(helperAst, "evaluateHardApprovalRules");
assert.ok(helperFunction && hasExportModifier(helperFunction), "helper exports evaluateHardApprovalRules via AST");
assert.equal(hasForbiddenCall(helperAst, new Set(["getDb", "query", "fetch"])), false, "helper remains DB/network free via AST");
assert.equal(hasSharedHelperImport(syncAst), true, "sync repository imports shared helper alias via AST");
assert.equal(hasSharedHelperImport(asyncAst), true, "async repository imports shared helper alias via AST");
assert.equal(findFunction(syncAst, "evaluateHardApprovalRules"), null, "sync repository has no local duplicate function via AST");
assert.equal(findFunction(asyncAst, "evaluateHardApprovalRules"), null, "async repository has no local duplicate function via AST");

function legacyEvaluateHardApprovalRules(input, riskFlags) {
  const hardRules = [];
  const addHardRule = (rule) => hardRules.push(rule);

  if (riskFlags.has("duplicate_code")) {
    addHardRule({
      code: "DUPLICATE_CODE_HARD_BLOCK",
      message: "Root code, part number, and drawing number uniqueness cannot be overridden.",
      requiresApproval: false,
      blocksUsage: true,
      blocksRelease: true,
      showsWarning: true,
      exportMarker: true
    });
  }
  if (riskFlags.has("multiple_primary_ma")) {
    addHardRule({
      code: "PRIMARY_MA_UNIQUENESS_HARD_BLOCK",
      message: "A part number can have only one primary MA drawing.",
      requiresApproval: false,
      blocksUsage: true,
      blocksRelease: true,
      showsWarning: true,
      exportMarker: true
    });
  }
  if (riskFlags.has("released_document_unrevised") || riskFlags.has("released_document_blocker")) {
    addHardRule({
      code: "RELEASED_DOCUMENT_REVISION_REQUIRED",
      message: "Released affected documents must be revised before this action can be released.",
      requiresApproval: false,
      blocksUsage: true,
      blocksRelease: true,
      showsWarning: true,
      exportMarker: true
    });
  }
  if (riskFlags.has("main_drawing_invalid")) {
    addHardRule({
      code: "MAIN_DRAWING_INVALID_REVIEW_REQUIRED",
      message: "A MainDrawingInvalid part must pass restore approval before it becomes usable.",
      requiresApproval: true,
      blocksUsage: true,
      blocksRelease: true,
      showsWarning: true,
      exportMarker: true
    });
  }
  if (riskFlags.has("missing_primary_ma") && input.itemKind === "manufactured") {
    addHardRule({
      code: "PRIMARY_MA_REQUIRED_FOR_CONTROLLED_HANDOFF",
      message: "Technical transfer or release of drawing-made items requires a primary manufacturing drawing.",
      requiresApproval: true,
      blocksUsage: true,
      blocksRelease: true,
      showsWarning: true,
      exportMarker: true
    });
  }
  if (input.actionCode.includes("override") || riskFlags.has("has_override")) {
    addHardRule({
      code: "OVERRIDE_AUDIT_MARKER_REQUIRED",
      message: "Every override must be audited and marked in UI/export output.",
      requiresApproval: input.actionCode.includes("override"),
      blocksUsage: false,
      blocksRelease: false,
      showsWarning: true,
      exportMarker: true
    });
  }
  if (riskFlags.has("high_similarity")) {
    addHardRule({
      code: "HIGH_SIMILARITY_WARNING_ONLY",
      message: "High-similarity numbering matches should warn users but not block numbering.",
      requiresApproval: false,
      blocksUsage: false,
      blocksRelease: false,
      showsWarning: true,
      exportMarker: false
    });
  }
  return hardRules;
}

const { evaluateHardApprovalRules } = await import(pathToFileURL(helperPath).href);
const cases = [
  {
    name: "all hard blockers and override",
    input: { actionCode: "numbering.override-release", itemKind: "manufactured" },
    riskFlags: new Set([
      "duplicate_code",
      "multiple_primary_ma",
      "released_document_unrevised",
      "main_drawing_invalid",
      "missing_primary_ma",
      "has_override",
      "high_similarity"
    ])
  },
  {
    name: "purchased item missing primary drawing",
    input: { actionCode: "numbering.create", itemKind: "purchased" },
    riskFlags: new Set(["missing_primary_ma"])
  },
  {
    name: "released document alternate blocker",
    input: { actionCode: "numbering.release", itemKind: "manufactured" },
    riskFlags: new Set(["released_document_blocker"])
  },
  {
    name: "empty risk set",
    input: { actionCode: "numbering.create" },
    riskFlags: new Set()
  }
];

for (const testCase of cases) {
  const inputBefore = structuredClone(testCase.input);
  const flagsBefore = [...testCase.riskFlags];
  assert.deepEqual(evaluateHardApprovalRules(testCase.input, testCase.riskFlags), legacyEvaluateHardApprovalRules(testCase.input, testCase.riskFlags), testCase.name);
  assert.deepEqual(testCase.input, inputBefore, `${testCase.name}: input immutability`);
  assert.deepEqual([...testCase.riskFlags], flagsBefore, `${testCase.name}: risk flag immutability`);
}

console.log("QC numbering hard approval rules: PASS (shared helper + legacy parity + immutability)");
