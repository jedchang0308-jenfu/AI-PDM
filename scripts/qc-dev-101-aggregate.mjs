#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const root = process.cwd();
const stage = process.argv.includes("--stage=rd") ? "rd" : "candidate";
const runId = `DEV101-AGGREGATE-${stage.toUpperCase()}-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-101-aggregate", runId);
const sourceDbPath = path.join(root, "data", "ai-pdm.sqlite");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev101-aggregate-"));
const mutationDataDir = path.join(tempRoot, "data");
const mutationRepositoryDir = path.join(mutationDataDir, "repository");
fs.mkdirSync(mutationRepositoryDir, { recursive: true });
fs.copyFileSync(sourceDbPath, path.join(mutationDataDir, "ai-pdm.sqlite"));
if (fs.existsSync(path.join(root, "data", "repository"))) fs.cpSync(path.join(root, "data", "repository"), mutationRepositoryDir, { recursive: true, force: true });
const loader = ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs"];
const fixedCaseCount = 48;
const affectedLintFiles = [
  "src/lib/pdm-review-package.ts", "src/lib/pdm-review-package-contract.ts", "src/lib/pdm-work-review.ts", "src/lib/part-change-work.ts",
  "src/lib/drawing-revision-work.ts", "src/lib/repositories/part-change-work-async-repository.ts", "src/lib/repositories/approval-platform-async-repository.ts",
  "src/components/canonical-review-package-workspace.tsx", "src/components/canonical-review-target-workspace.tsx", "src/components/review-target-marker-slots.tsx",
  "src/components/review-snapshot-compare.tsx", "src/components/relation-matrix-table.tsx", "src/components/approval-request-workspace.tsx",
  "src/components/canonical-drawing-change-workspace.tsx", "src/components/canonical-change-workspace.tsx", "src/app/approvals/page.tsx",
  "src/components/drawing-recognition-workspace-panel.tsx", "src/lib/drawing-recognition-review-projection.ts", "src/lib/drawing-recognition-review-snapshot.ts",
  "src/app/api/numbering/recognition-sessions/[sessionId]/route.ts", "src/lib/repositories/drawing-recognition-async-repository.ts",
  "src/app/approvals/[requestId]/page.tsx", "src/lib/pdm-canonical-workbench-contract.ts",
  "src/app/api/pdm/review-requests/[requestId]/route.ts", "src/app/api/pdm/review-requests/[requestId]/decisions/route.ts",
  "src/app/api/pdm/review-requests/[requestId]/targets/[entityType]/[entityId]/route.ts",
  "src/app/api/pdm/review-requests/[requestId]/targets/[entityType]/[entityId]/comparison/route.ts", "src/app/api/pdm/file-assets/[fileAssetId]/route.ts",
  "scripts/qc-dev-101-owner-flow-browser.mjs", "scripts/qc-dev-101-postgres.mjs", "scripts/qc-dev-101-api.mjs", "scripts/qc-dev-101-repository.mjs", "scripts/qc-dev-101-build.mjs",
  "scripts/dev-101-evidence-lib.mjs", "scripts/qc-dev-101-qa-integrity.mjs", "scripts/qc-dev-101-independent-data.mjs"
];
const sourceFiles = [...new Set([
  ...affectedLintFiles,
  "src/app/globals.css",
  "src/lib/repositories/pdm-work-review-async-repository.ts", "src/lib/pdm-approval-owner-route.ts", "src/app/api/approvals/inbox/route.ts",
  "scripts/qc-dev-101-contract.mjs", "scripts/qc-dev-101-package-builder.mjs", "scripts/qc-dev-101-inbox-repository.mjs",
  "scripts/qc-dev-101-aggregate.mjs", "package.json",
  ".ai-doc/qa/dev-101-current-case-registry.json", ".ai-doc/qa/dev-101-independent-manifest.schema.json"
])];
const lanes = [
  { id: "contract", args: ["scripts/qc-dev-101-contract.mjs"], marker: "DEV-101 contract summary: 23/23 PASS" },
  { id: "repository", args: ["scripts/qc-dev-101-repository.mjs"], marker: "PASS DEV-101 repository supporting lane" },
  { id: "api-and-v2-browser", args: ["scripts/qc-dev-101-api.mjs"], marker: "PASS DEV-101 API supporting lane" },
  { id: "legacy-v1-normal-entry", args: ["scripts/qc-dev-101-owner-flow-browser.mjs", "--schema=v1"], marker: "DEV-101 owner v1 browser summary: 16/16 PASS" },
  { id: "postgresql-provider", args: [...loader, "scripts/qc-dev-101-postgres.mjs"], marker: "DEV-101 PostgreSQL summary: 10/10 PASS" },
  { id: "dev090-contract", args: ["scripts/qc-dev-090-contract.mjs"], marker: "PASS DEV-090 contract" },
  { id: "dev090-repository", args: ["scripts/qc-dev-090-repository.mjs"], marker: "PASS DEV-090 repository" },
  { id: "dev090-mutation", args: [...loader, "scripts/qc-dev-090-mutation.ts"], marker: "\"status\":\"PASS\"", env: { PDM_DB_PROVIDER: "sqlite", PDM_DATA_DIR: mutationDataDir, PDM_REPOSITORY_DIR: mutationRepositoryDir } },
  { id: "typecheck", args: ["node_modules/typescript/bin/tsc", "-p", "tsconfig.app.json", "--noEmit", "--pretty", "false"], marker: null },
  { id: "affected-lint", args: ["node_modules/eslint/bin/eslint.js", ...affectedLintFiles], marker: null },
  { id: "isolated-build", args: ["scripts/qc-dev-101-build.mjs"], marker: "DEV-101 isolated build: PASS" }
];

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function sourceHash() {
  return sha256(JSON.stringify(sourceFiles.map((file) => ({ file, hash: fs.existsSync(path.join(root, file)) ? sha256(fs.readFileSync(path.join(root, file))) : null }))));
}
function primaryFingerprint() {
  const database = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
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
  } finally { database.close(); }
}

console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: `DEV-101 ${stage === "rd" ? "RD implementation-ready" : "independent completion-candidate"} aggregate`,
  port: "child-specific; every runtime child declares and releases its own port",
  owningProcessTree: `aggregate ${process.pid} -> one sequential child lane at a time`,
  cleanupCondition: "every child exits with cleanup receipt; aggregate verifies primary/source invariants",
  PDM_DATA_DIR: "task-owned child paths",
  PDM_REPOSITORY_DIR: "task-owned child paths",
  mutationScope: `child temp/output paths, isolated DEV-090 mutation copy ${tempRoot}, plus aggregate manifest; primary is fingerprinted read-only`
} }));

const before = { source: sourceHash(), primary: primaryFingerprint() };
const results = [];
for (const lane of lanes) {
  const execution = spawnSync(process.execPath, lane.args, { cwd: root, encoding: "utf8", stdio: "pipe", maxBuffer: 96 * 1024 * 1024, env: { ...process.env, DEV101_PARENT_RUN_ID: runId, ...(lane.env ?? {}) } });
  process.stdout.write(execution.stdout || "");
  process.stderr.write(execution.stderr || "");
  const output = `${execution.stdout || ""}\n${execution.stderr || ""}`;
  const pass = execution.status === 0 && (!lane.marker || output.includes(lane.marker));
  results.push({ lane: lane.id, status: pass ? "PASS" : "FAIL", exitCode: execution.status, marker: lane.marker, outputSha256: sha256(output) });
  if (!pass) break;
}
const after = { source: sourceHash(), primary: primaryFingerprint() };
fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 12, retryDelay: 200 });
const aggregateTempRemoved = !fs.existsSync(tempRoot);
const invariantsPass = before.source === after.source && before.primary.hash === after.primary.hash && before.primary.foreignKeys.length === 0 && after.primary.foreignKeys.length === 0;
const rdReady = results.length === lanes.length && results.every((item) => item.status === "PASS") && invariantsPass && aggregateTempRemoved;
const fixedCases = Array.from({ length: fixedCaseCount }, (_, index) => ({ caseId: `QA-101-${String(index + 1).padStart(3, "0")}`, result: stage === "rd" ? "NOT_RUN" : "BLOCKED", evidenceClass: "INDEPENDENT_QC_REQUIRED" }));
let completionCandidate = false;
let independentQc = { status: "NOT_RUN", manifest: null, error: "INDEPENDENT_QC_MANIFEST_REQUIRED" };
const independentPath = process.env.DEV101_INDEPENDENT_QC_MANIFEST?.trim();
if (stage === "candidate" && independentPath) {
  try {
    const resolved = path.resolve(root, independentPath);
    const receipt = JSON.parse(fs.readFileSync(resolved, "utf8"));
    const cases = Array.isArray(receipt.caseResults) ? receipt.caseResults : [];
    const exactRoster = cases.length === fixedCaseCount && fixedCases.every((expected, index) => cases[index]?.caseId === expected.caseId && cases[index]?.result === "PASS");
    if (receipt.independentQc === true && receipt.result === "PASS" && exactRoster) {
      independentQc = { status: "PASS", manifest: path.relative(root, resolved).replaceAll(path.sep, "/"), sha256: sha256(fs.readFileSync(resolved)), error: null };
      completionCandidate = rdReady;
    } else independentQc = { status: "FAIL", manifest: path.relative(root, resolved).replaceAll(path.sep, "/"), error: "INDEPENDENT_QC_MANIFEST_INVALID" };
  } catch (error) { independentQc = { status: "FAIL", manifest: independentPath, error: error instanceof Error ? error.message : String(error) }; }
}
const status = !rdReady ? "FAIL" : stage === "rd" ? "RD_IMPLEMENTATION_READY" : completionCandidate ? "COMPLETION_CANDIDATE" : "BLOCKED_INDEPENDENT_QC";
const manifest = {
  schemaVersion: 1, devId: "DEV-101", runId, stage, generatedAt: new Date().toISOString(),
  evidenceClass: stage === "rd" ? "RD_SUPPORTING_ONLY_NOT_INDEPENDENT_QC" : "INDEPENDENT_COMPLETION_GATE",
  status, rdReady, completionCandidate, results,
  fixedDenominator: { expected: fixedCaseCount, pass: completionCandidate ? fixedCaseCount : 0, fail: 0, blocked: stage === "candidate" && !completionCandidate ? fixedCaseCount : 0, notRun: stage === "rd" ? fixedCaseCount : 0 },
  caseResults: completionCandidate ? fixedCases.map((item) => ({ ...item, result: "PASS", evidenceClass: "INDEPENDENT_QC" })) : fixedCases,
  independentQc,
  invariants: { sourceBefore: before.source, sourceAfter: after.source, primaryBefore: before.primary, primaryAfter: after.primary, unchanged: invariantsPass },
  cleanup: { aggregateTempRoot: tempRoot, removed: aggregateTempRemoved }
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runId, status, rdReady, completionCandidate, executed: results.length, expectedLanes: lanes.length, manifest: path.relative(root, path.join(outputDir, "manifest.json")).replaceAll(path.sep, "/") }, null, 2));
if (!rdReady) process.exitCode = 1;
else if (stage === "candidate" && !completionCandidate) process.exitCode = 2;
