#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const runId = `DEV104-contract-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceRoot = path.resolve(process.env.DEV104_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-104", runId));
const evidenceDir = path.join(evidenceRoot, "contract");
fs.mkdirSync(evidenceDir, { recursive: true });
const checks = [];
const sourceRevision = (() => { try { return String(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" })).trim(); } catch { return null; } })();
const dirtyBoundary = (() => { try { return String(execFileSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" })).trim().split(/\r?\n/u).filter(Boolean); } catch { return []; } })();

function source(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function check(id, label, action) {
  try { action(); checks.push({ caseId: id, runner: "contract", id, label, status: "PASS", sourceRevision, dirtyBoundary, artifactId: `${runId}/contract/${id}.json`, environment: "source-tree static contract; no app/database/runtime", actor: "any authenticated actor", route: "/bom/workbench", viewport: null, fixtureId: null, preconditions: "DEV-104 implementation source present", actions: label, expected: "implementation contract holds", actual: { assertion: "verified", status: "PASS" }, evidencePaths: [], consoleErrors: [], httpFailures: [], visibleErrors: [], dataSanity: { productionConnected: false, productionWrites: false, primaryWrites: false }, primaryInvariantBefore: null, primaryInvariantAfter: null, fixtureMutationLedger: [], failureCode: null, blockedReason: null, recoveryCondition: null, supersedesRunId: null, runtimeOwnership: null, cleanup: { status: "not-applicable", condition: "static source runner" } }); }
  catch (error) { checks.push({ caseId: id, runner: "contract", id, label, status: "FAIL", sourceRevision, dirtyBoundary, artifactId: `${runId}/contract/${id}.json`, environment: "source-tree static contract; no app/database/runtime", actor: "any authenticated actor", route: "/bom/workbench", viewport: null, fixtureId: null, preconditions: "DEV-104 implementation source present", actions: label, expected: "implementation contract holds", actual: { assertion: "failed", status: "FAIL", error: error instanceof Error ? error.message : String(error) }, evidencePaths: [], consoleErrors: [], httpFailures: [], visibleErrors: [], dataSanity: { productionConnected: false, productionWrites: false, primaryWrites: false }, primaryInvariantBefore: null, primaryInvariantAfter: null, fixtureMutationLedger: [], failureCode: "CONTRACT_ASSERTION_FAILED", blockedReason: null, recoveryCondition: null, supersedesRunId: null, runtimeOwnership: null, cleanup: { status: "not-applicable", condition: "static source runner" } }); }
}

const list = source("src/components/bom-workbench-list-page.tsx");
const detailRoute = source("src/app/bom/workbench/[draftId]/page.tsx");
const detail = source("src/components/bom-workbench-detail.tsx");
const editor = source("src/components/bom-editor/bom-structured-editor.tsx");
const map = source("src/components/bom-editor/bom-map-view.tsx");
const globals = source("src/app/globals.css");

check("QA-104-001", "list route is list-only", () => { assert.match(list, /surface: "work_list"/u); assert.doesNotMatch(list, /BomStructuredEditor|ReactFlow|PATCH|submit-review/u); });
check("QA-104-002", "detail route owns params boundary", () => { assert.match(detailRoute, /await params/u); assert.match(detailRoute, /BomWorkbenchDetail/u); assert.doesNotMatch(detailRoute, /surface: "work_list"/u); });
check("QA-104-003", "one structured editor serializer", () => { assert.equal((editor.match(/method: "PATCH"/gu) ?? []).length, 1); assert.match(editor, /expectedEditorVersion/u); assert.match(editor, /floatingTopics/u); assert.match(editor, /components/u); });
check("QA-104-004", "Outliner is the default view", () => { assert.match(editor, /useState<"outliner" \| "map">\("outliner"\)/u); assert.match(editor, /BomOutliner/u); });
check("QA-104-005", "Map is read-only projection", () => { assert.doesNotMatch(map, /component\.replace|line\.insert|line\.remove|line\.quantity|line\.reparent|PATCH|onAdd/u); assert.match(map, /onToggleCollapse|onLocateFloating/u); });
check("QA-104-006", "narrow and Map mutation controls are conditionally absent", () => { assert.match(editor, /desktop\s*&&\s*viewMode === "outliner"[\s\S]{0,500}history\.undo/u); assert.match(editor, /desktop\s*&&\s*viewMode === "outliner"[\s\S]{0,500}插入料件/u); assert.match(editor, /desktop\s*&&\s*viewMode === "outliner"[\s\S]{0,500}新增群組/u); });
check("QA-104-007", "lifecycle primary action is capability and state driven", () => { assert.match(editor, /const primaryAction = mutable && controller\.dirty \? "save"/u); assert.match(editor, /floatingCount === 0 && unresolvedMappings\.length === 0 && !hasReplacementFlags/u); assert.match(editor, /onSubmitReview|onSetActive|onClone|onRestore|onDelete/u); assert.match(editor, /releasedReadOnly/u); });
check("QA-104-008", "legacy production graph retired", () => { for (const relative of ["src/components/bom-editor/bom-xmind-editor.tsx", "src/components/bom-editor/xmind-bom-node.tsx", "src/components/bom-editor/xmind-bom-toolbar.tsx"]) assert.equal(fs.existsSync(path.join(root, relative)), false); assert.doesNotMatch(editor, /ReactFlow|xmind-bom/u); assert.doesNotMatch(globals, /xmind-bom|bom-flow/u); });
check("QA-104-009", "no new schema or route", () => { assert.equal(fs.existsSync(path.join(root, "src/app/bom/workbench-v3")), false); assert.doesNotMatch(detail, /CREATE TABLE|migration/u); });
check("QA-104-010", "legacy selectors absent", () => { assert.doesNotMatch(globals, /xmind-bom|bom-flow/u); });
check("QA-104-011", "flag-off PATCH fail closed", () => { const route = source("src/app/api/bom/drafts/[draftId]/route.ts"); assert.match(route, /BOM_EDITOR_V2_REQUIRED/u); assert.match(route, /if \(!editorEnabled\)/u); });
check("QA-104-012", "serializer includes canonical document only", () => { assert.match(editor, /lines: snapshot\.lines\.map\(toPatchLine\)/u); assert.match(editor, /floatingTopics: snapshot\.floatingTopics\.map\(toPatchFloatingTopic\)/u); assert.match(editor, /components: snapshot\.components\.map\(toPatchComponent\)/u); });

const passed = checks.filter((entry) => entry.status === "PASS").length;
for (const checkResult of checks) {
  const evidenceFile = path.join(evidenceDir, `${checkResult.caseId}.json`);
  fs.writeFileSync(evidenceFile, `${JSON.stringify(checkResult, null, 2)}\n`, "utf8");
  checkResult.evidencePaths = [path.relative(root, evidenceFile).replaceAll("\\", "/")];
}
const manifest = { schemaVersion: 1, runner: "contract", runId, status: passed === checks.length && checks.length === 12 ? "PASS" : "FAIL", completionCandidate: false, productionWrites: false, primaryDataMutated: false, fixedDenominator: 48, executedCases: checks.length, checks, caseIds: checks.map((entry) => entry.caseId), sourceRevision, dirtyBoundary, note: "Static implementation contract slice; reducer state, authenticated browser, approval and release lanes are separate QA evidence." };
fs.writeFileSync(path.join(evidenceDir, "case-results.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(evidenceDir, "contract.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runner: manifest.runner, status: manifest.status, passed, total: checks.length, evidenceDir }));
if (manifest.status !== "PASS") process.exitCode = 1;
