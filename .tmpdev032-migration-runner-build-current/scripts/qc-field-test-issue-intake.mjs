#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const tmpRoot = path.join(root, ".tmp", "qc-field-test-issue-intake");
const qualityDir = path.join(tmpRoot, "quality");
const registerPath = path.join(qualityDir, "defect-register.json");
const validIssuePath = path.join(tmpRoot, "field-issues-valid.json");
const invalidIssuePath = path.join(tmpRoot, "field-issues-invalid.json");
const dryRunIssuePath = path.join(tmpRoot, "field-issues-dry-run.json");
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function runNode(script, args = [], env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
    windowsHide: true
  });
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function readRegister() {
  return readProjectJson(root, path.relative(root, registerPath).replaceAll(path.sep, "/"));
}

function cleanupTmpRoot() {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

process.once("exit", cleanupTmpRoot);

cleanupTmpRoot();
fs.mkdirSync(qualityDir, { recursive: true });
writeJson(registerPath, {
  schemaVersion: "1.0",
  updatedAt: "2026-06-02T00:00:00.000Z",
  releaseTarget: "AI PDM MVP production readiness",
  defects: []
});

writeJson(validIssuePath, {
  schemaVersion: "1.0",
  fieldTestId: "FIELD-QC-20260602",
  source: "QC fixture field execution",
  issues: [
    {
      id: "FIELD-QC-001",
      defectId: "DEF-FIELD-QC-001",
      title: "SolidWorks add-in cannot submit a drawing package from CAD workstation",
      priority: "P1",
      status: "open",
      owner: "RD",
      evidence: "QC fixture reproduces field issue import for active P1 defect.",
      reproductionSteps: [
        "Open SolidWorks on the field workstation.",
        "Load the AI PDM add-in.",
        "Submit a drawing package."
      ],
      expected: "The drawing package is submitted and a submission ID is returned.",
      actual: "The add-in fails before submission is created.",
      environment: "Windows 11 / SolidWorks field workstation",
      relatedEvidence: ["data/field-test-handoffs/FIELD-QC/reports/sw-addin-report.json"]
    },
    {
      id: "FIELD-QC-002",
      defectId: "DEF-FIELD-QC-002",
      title: "Field operator found a cosmetic wording issue in handoff README",
      priority: "P3",
      status: "verified",
      owner: "PM",
      evidence: "QC fixture verifies non-blocking closed field issue import."
    }
  ]
});

writeJson(dryRunIssuePath, {
  schemaVersion: "1.0",
  fieldTestId: "FIELD-QC-20260602",
  source: "QC fixture dry-run",
  issues: [
    {
      id: "FIELD-QC-DRY-001",
      defectId: "DEF-FIELD-QC-DRY-001",
      title: "Dry-run issue must not be written",
      priority: "P2",
      status: "open",
      owner: "QC",
      evidence: "Dry-run fixture evidence."
    }
  ]
});

writeJson(invalidIssuePath, {
  schemaVersion: "1.0",
  fieldTestId: "FIELD-QC-20260602",
  source: "QC invalid fixture",
  issues: [
    {
      id: "FIELD-QC-BAD-001",
      title: "Missing owner and evidence must fail",
      priority: "P1",
      status: "open",
      reproductionSteps: ["Reproduce missing required fields."],
      expected: "Importer rejects incomplete active blocking field issue.",
      actual: "Importer should fail validation."
    }
  ]
});

const dryRun = runNode("scripts/import-field-test-issues.mjs", [
  "--issues", dryRunIssuePath,
  "--register", registerPath
]);
const dryRunReport = parseJson(dryRun.stdout);
record("FIELD-ISSUE-001 dry-run exits successfully", dryRun.status === 0, dryRun.stderr);
record("FIELD-ISSUE-002 dry-run reports candidate import", dryRunReport?.imported?.includes("DEF-FIELD-QC-DRY-001"), JSON.stringify(dryRunReport?.imported ?? []));
record("FIELD-ISSUE-003 dry-run does not mutate register", readRegister().defects.length === 0, JSON.stringify(readRegister().defects));

const writeRun = runNode("scripts/import-field-test-issues.mjs", [
  "--issues", validIssuePath,
  "--register", registerPath,
  "--write"
]);
const writeReport = parseJson(writeRun.stdout);
const afterWrite = readRegister();
record("FIELD-ISSUE-004 write exits successfully with active P1 allowed", writeRun.status === 0, writeRun.stderr);
record("FIELD-ISSUE-005 write imports both defects", afterWrite.defects.length === 2, JSON.stringify(afterWrite.defects.map((defect) => defect.id)));
record("FIELD-ISSUE-006 active P1 is visible in readiness issues", writeReport?.issues?.some((issue) => issue.type === "active_blocking_defect" && issue.id === "DEF-FIELD-QC-001"), JSON.stringify(writeReport?.issues ?? []));
record("FIELD-ISSUE-007 imported defect keeps reproduction evidence", Array.isArray(afterWrite.defects[0]?.reproductionSteps) && afterWrite.defects[0].reproductionSteps.length === 3, JSON.stringify(afterWrite.defects[0] ?? null));

const defectsZero = runNode("scripts/qc-defects-zero.mjs", [], { PDM_QUALITY_DIR: qualityDir });
const defectsZeroReport = parseJson(defectsZero.stdout);
record("FIELD-ISSUE-008 defects-zero blocks active P1 after import", defectsZero.status !== 0 && defectsZeroReport?.summary?.activeP0P1 === 1, defectsZero.stdout);

const secondWrite = runNode("scripts/import-field-test-issues.mjs", [
  "--issues", validIssuePath,
  "--register", registerPath,
  "--write"
]);
const secondReport = parseJson(secondWrite.stdout);
record("FIELD-ISSUE-009 repeated import is idempotent", secondWrite.status === 0 && secondReport?.unchanged?.length === 2, secondWrite.stdout);

const invalidRun = runNode("scripts/import-field-test-issues.mjs", [
  "--issues", invalidIssuePath,
  "--register", registerPath
]);
const invalidReport = parseJson(invalidRun.stdout);
record("FIELD-ISSUE-010 invalid active field issue fails", invalidRun.status !== 0, invalidRun.stdout);
record("FIELD-ISSUE-011 invalid report names missing owner/evidence", invalidReport?.issues?.some((issue) => issue.field?.endsWith(".owner")) && invalidReport?.issues?.some((issue) => issue.field?.endsWith(".evidence")), JSON.stringify(invalidReport?.issues ?? []));

const failed = results.filter((result) => !result.passed);
cleanupTmpRoot();
console.log(JSON.stringify({
  passed: results.length - failed.length,
  failed: failed.length,
  results
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
