#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

const baselineMode = process.argv.includes("--baseline");
const file = path.join(process.cwd(), "src", "app", "bom", "workbench", "page.tsx");
const source = fs.readFileSync(file, "utf8");
const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function findFunction(name) {
  let result = null;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return result;
}

function metrics(node) {
  const calls = new Map();
  const nestedFunctions = [];
  function visit(current) {
    if (ts.isCallExpression(current)) {
      const name = current.expression.getText(sourceFile);
      calls.set(name, (calls.get(name) ?? 0) + 1);
    }
    if (current !== node && ts.isFunctionDeclaration(current) && current.name) nestedFunctions.push(current.name.text);
    ts.forEachChild(current, visit);
  }
  visit(node);
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  const end = sourceFile.getLineAndCharacterOfPosition(node.end).line + 1;
  return { lines: end - start + 1, calls, nestedFunctions };
}

const controller = findFunction("BomWorkbenchPage");
assert(controller, "BomWorkbenchPage exists");
const controllerMetrics = metrics(controller);
const expectedCalls = { useState: 22, useEffect: 2, useMemo: 4, useCallback: 7, fetch: 1, requestJson: 18 };
for (const [name, count] of Object.entries(expectedCalls)) {
  assert.equal(controllerMetrics.calls.get(name) ?? 0, count, `BomWorkbenchPage preserves ${name} ownership`);
}

const ownedHandlers = [
  "runSearch",
  "pushLines",
  "restoreHistory",
  "addGroup",
  "addSubmissionAsLine",
  "updateLine",
  "deleteLine",
  "moveLine",
  "indentLine",
  "outdentLine",
  "openLineDetail",
  "moveLineToParent",
  "reorderLineByPosition",
  "handleFlowDrop",
  "handleFlowDragOver",
  "startSubmissionDrag",
  "createCadDraft",
  "importXlsFile",
  "importXlsText",
  "saveDraft",
  "setActiveDraft",
  "deleteDraft",
  "restoreDeletedDraft",
  "cloneDraft",
  "submitReview",
  "requestObsolete",
  "reconfirmReplacementFlags",
  "loadCompareDraft"
];
assert.deepEqual(controllerMetrics.nestedFunctions, ownedHandlers, "controller retains edit, request, lifecycle, and drag/drop handlers");

if (baselineMode) {
  assert.equal(controllerMetrics.lines, 1136, "pre-extraction controller line baseline");
  assert.equal(findFunction("BomWorkbenchPresentation"), null, "presentation block does not exist before extraction");
  console.log("QC System Health Phase 8 characterization: PASS (BomWorkbenchPage 1136 lines; hooks, requests, and handlers owned by controller)");
  process.exit(0);
}

assert(controllerMetrics.lines < 900, `BomWorkbenchPage is below 900 lines (actual ${controllerMetrics.lines})`);
const presentation = findFunction("BomWorkbenchPresentation");
assert(presentation, "BomWorkbenchPresentation exists");
const presentationMetrics = metrics(presentation);
assert(presentationMetrics.lines >= 300, "one cohesive presentation block owns the render tree");
for (const call of ["useState", "useEffect", "useMemo", "useCallback", "fetch", "requestJson"]) {
  assert.equal(presentationMetrics.calls.get(call) ?? 0, 0, `presentation block does not own ${call}`);
}
assert.match(controller.body.getText(sourceFile), /<BomWorkbenchPresentation/u, "controller delegates rendering to presentation block");
assert.match(presentation.body.getText(sourceFile), /<PdmDetailDrawer/u, "presentation block retains detail drawer rendering");
assert.match(presentation.body.getText(sourceFile), /<ReactFlow/u, "presentation block retains BOM canvas rendering");

console.log(`QC System Health Phase 8: PASS (BomWorkbenchPage ${controllerMetrics.lines} lines; ${presentationMetrics.lines}-line pure presentation block)`);
