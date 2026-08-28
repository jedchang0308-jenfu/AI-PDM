#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

import {
  deriveAggregateCaseResults,
  hashFile,
  loadDev101Registry,
  sha256,
  sourceInfo,
  validateIndependentChild,
  validateRegistry
} from "./dev-101-evidence-lib.mjs";

const root = process.cwd();
const runId = `DEV101-INDEPENDENT-AGGREGATE-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-101-independent-aggregate", runId);
const childrenDir = path.join(outputDir, "children");
const primaryDbPath = path.join(root, "data", "ai-pdm.sqlite");
const registry = validateRegistry(root, loadDev101Registry(root));

function primaryFingerprint() {
  const database = new Database(primaryDbPath, { readonly: true, fileMustExist: true });
  database.pragma("query_only = ON");
  try {
    const payload = {
      schema: database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all(),
      identities: {
        roots: database.prepare("SELECT id,company_id,root_code FROM part_roots ORDER BY company_id,id").all(),
        parts: database.prepare("SELECT id,company_id,part_root_id,part_number FROM part_numbers ORDER BY company_id,id").all(),
        drawings: database.prepare("SELECT id,company_id,drawing_number,formal_drawing_number_id FROM drawings ORDER BY company_id,id").all()
      },
      residue: database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all(),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return { hash: sha256(JSON.stringify(payload)), foreignKeys: payload.foreignKeys };
  } finally {
    database.close();
  }
}

fs.mkdirSync(childrenDir, { recursive: true });
console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-101 independent four-lane completion aggregate",
  port: "child-specific; browser and PostgreSQL children declare exact ports before start",
  owningProcessTree: `aggregate ${process.pid} -> one sequential independent child at a time`,
  cleanupCondition: "every child manifest proves its exact processes, ports and temp paths cleaned; aggregate verifies primary/source unchanged",
  PDM_DATA_DIR: "each child declares its own task-owned isolated directory",
  PDM_REPOSITORY_DIR: "each child declares its own task-owned isolated directory",
  mutationScope: `${outputDir} plus each child's declared task-owned temp/runtime paths; primary SQLite is query_only fingerprint source`
} }));

const expectedSource = sourceInfo(root, registry.sourceBoundary);
const primaryBefore = primaryFingerprint();
const loader = ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs"];
const laneDefinitions = [
  { runner: "qc-dev-101-independent-data", args: [...loader, "scripts/qc-dev-101-independent-data.mjs"] },
  { runner: "qc-dev-101-independent-browser", args: ["scripts/qc-dev-101-independent-browser.mjs"] },
  { runner: "qc-dev-101-independent-postgres", args: ["scripts/qc-dev-101-independent-postgres.mjs"] }
];
const childManifests = [];
const laneReceipts = [];
let firstFailure = null;

function runLane(definition, priorPaths = []) {
  const childDir = path.join(childrenDir, definition.runner);
  fs.mkdirSync(childDir, { recursive: true });
  console.log(`RUN ${definition.runner}`);
  const execution = spawnSync(process.execPath, definition.args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
    env: {
      ...process.env,
      DEV101_PARENT_RUN_ID: runId,
      DEV101_EVIDENCE_DIR: childDir,
      DEV101_PRIOR_MANIFESTS_JSON: JSON.stringify(priorPaths)
    }
  });
  process.stdout.write(execution.stdout || "");
  process.stderr.write(execution.stderr || "");
  const manifestPath = path.join(childDir, "manifest.json");
  const receipt = {
    runner: definition.runner,
    command: [process.execPath, ...definition.args],
    exitCode: execution.status,
    stdoutSha256: sha256(execution.stdout || ""),
    stderrSha256: sha256(execution.stderr || ""),
    manifestPath: path.relative(root, manifestPath).replaceAll(path.sep, "/"),
    manifestSha256: fs.existsSync(manifestPath) ? hashFile(manifestPath) : null,
    validation: "NOT_RUN"
  };
  try {
    if (execution.status !== 0) throw new Error(`CHILD_EXIT_${execution.status}`);
    if (!fs.existsSync(manifestPath)) throw new Error("CHILD_MANIFEST_MISSING");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    validateIndependentChild({ root, registry, manifest, expectedRunner: definition.runner, expectedParentRunId: runId, expectedSource });
    childManifests.push(manifest);
    receipt.validation = "PASS";
  } catch (error) {
    receipt.validation = "FAIL";
    receipt.error = error instanceof Error ? error.message : String(error);
    firstFailure ??= `${definition.runner}:${receipt.error}`;
  }
  laneReceipts.push(receipt);
  return receipt;
}

for (const definition of laneDefinitions) {
  const receipt = runLane(definition);
  if (receipt.validation !== "PASS") break;
}
if (!firstFailure && childManifests.length === 3) {
  runLane(
    { runner: "qc-dev-101-independent-gate", args: ["scripts/qc-dev-101-independent-gate.mjs"] },
    laneReceipts.map((item) => item.manifestPath)
  );
}

const caseResults = deriveAggregateCaseResults(registry, childManifests);
const denominator = {
  expected: registry.fixedDenominator.length,
  pass: caseResults.filter((item) => item.result === "PASS").length,
  fail: caseResults.filter((item) => item.result === "FAIL").length,
  blocked: caseResults.filter((item) => item.result === "BLOCKED").length,
  notRun: caseResults.filter((item) => item.result === "NOT_RUN").length
};
const primaryAfter = primaryFingerprint();
const sourceAfter = sourceInfo(root, registry.sourceBoundary);
const primaryUnchanged = primaryBefore.hash === primaryAfter.hash
  && primaryBefore.foreignKeys.length === 0
  && primaryAfter.foreignKeys.length === 0;
const sourceUnchanged = JSON.stringify(expectedSource) === JSON.stringify(sourceAfter);
const allChildrenPass = laneReceipts.length === 4
  && laneReceipts.every((item) => item.validation === "PASS")
  && childManifests.length === 4;
const result = allChildrenPass
  && denominator.pass === denominator.expected
  && denominator.fail === 0
  && denominator.blocked === 0
  && denominator.notRun === 0
  && primaryUnchanged
  && sourceUnchanged
  ? "PASS"
  : "FAIL";
firstFailure ??= caseResults.find((item) => item.result !== "PASS")?.caseId ?? (!primaryUnchanged ? "PRIMARY_INVARIANT_CHANGED" : !sourceUnchanged ? "SOURCE_CHANGED" : null);
const manifest = {
  schemaVersion: 1,
  devId: "DEV-101",
  runId,
  independentQc: true,
  evidenceClass: "INDEPENDENT_COMPLETION_GATE",
  result,
  completionCandidate: result === "PASS",
  source: { before: expectedSource, after: sourceAfter, unchanged: sourceUnchanged },
  primaryInvariant: { before: primaryBefore, after: primaryAfter, unchanged: primaryUnchanged },
  fixedDenominator: denominator,
  caseResults,
  childManifests: laneReceipts,
  firstFailure,
  generatedAt: new Date().toISOString()
};
const manifestPath = path.join(outputDir, "manifest.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runId, result, completionCandidate: manifest.completionCandidate, denominator, childCount: childManifests.length, firstFailure, manifest: path.relative(root, manifestPath).replaceAll(path.sep, "/") }, null, 2));
if (result !== "PASS") process.exitCode = 1;
