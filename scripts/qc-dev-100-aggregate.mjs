#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import Database from "better-sqlite3";

import { hashFile, sha256, sourceInfo } from "./dev-087-evidence-lib.mjs";
import { DEV100_CASE_IDS, DEV100_REQUIRED_RUNNERS, validateDev100AggregateManifest } from "./dev-100-evidence-lib.mjs";

const root = process.cwd();
const runId = `DEV100-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const parentRunId = process.env.DEV087_AGGREGATE_RUN_ID?.trim() || null;
const evidenceDir = path.join(root, "output", "qa", "dev-100", runId);
const logsDir = path.join(evidenceDir, "logs");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("DEV100_NPM_EXEC_PATH_MISSING");
fs.mkdirSync(logsDir, { recursive: true });

const sourceAtStart = sourceInfo(root);
const commands = [];
const artifacts = new Map();
let firstFailure = null;

function protectedPrimarySnapshot() {
  const dbPath = path.join(root, "data", "ai-pdm.sqlite");
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  try {
    const payload = {
      schema: db.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') AND tbl_name IN ('part_roots','part_numbers','drawing_numbers','drawings','drawing_revisions','drawing_revision_files','drawing_revision_works','drawing_revision_work_files','canonical_workbench_states') ORDER BY type,name`).all(),
      identities: {
        roots: db.prepare("SELECT id,company_id,root_code,record_status FROM part_roots ORDER BY id").all(),
        parts: db.prepare("SELECT id,company_id,part_root_id,part_number,record_status FROM part_numbers ORDER BY id").all(),
        drawingNumbers: db.prepare("SELECT id,company_id,part_root_id,drawing_number,record_status FROM drawing_numbers ORDER BY id").all(),
        drawings: db.prepare("SELECT id,company_id,part_root_id,formal_drawing_number_id,drawing_number,lifecycle_state FROM drawings ORDER BY id").all()
      },
      rootReferences: {
        parts: db.prepare("SELECT COUNT(*) count FROM part_numbers part LEFT JOIN part_roots root ON root.id=part.part_root_id AND root.company_id=part.company_id WHERE part.part_root_id IS NOT NULL AND root.id IS NULL").get().count,
        drawingNumbers: db.prepare("SELECT COUNT(*) count FROM drawing_numbers drawing LEFT JOIN part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id WHERE drawing.part_root_id IS NOT NULL AND root.id IS NULL").get().count,
        drawings: db.prepare("SELECT COUNT(*) count FROM drawings drawing LEFT JOIN part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id WHERE drawing.part_root_id IS NOT NULL AND root.id IS NULL").get().count,
        formalNumbers: db.prepare("SELECT COUNT(*) count FROM drawings drawing LEFT JOIN drawing_numbers number ON number.id=drawing.formal_drawing_number_id AND number.company_id=drawing.company_id WHERE drawing.formal_drawing_number_id IS NOT NULL AND number.id IS NULL").get().count
      },
      residue: db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%migration%' ORDER BY name").all(),
      foreignKeys: db.pragma("foreign_key_check")
    };
    return { hash: sha256(JSON.stringify(payload)), payload };
  } finally { db.close(); }
}

function runProcess(name, executable, args, options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, ...options.env }
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const logPath = path.join(logsDir, `${String(commands.length + 1).padStart(2, "0")}-${name.replaceAll(":", "-")}.log`);
  fs.writeFileSync(logPath, output, "utf8");
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  const entry = { name, status: result.status === 0 ? "PASS" : "FAIL", exitCode: result.status, startedAt, completedAt: new Date().toISOString(), log: path.relative(root, logPath).replaceAll("\\", "/") };
  commands.push(entry);
  if (entry.status !== "PASS" && !firstFailure) firstFailure = `${name}:exit=${result.status}`;
  return entry;
}

function runChild(runner, script, args, artifactName, extraEnv = {}) {
  const childDir = path.join(evidenceDir, runner);
  fs.mkdirSync(childDir, { recursive: true });
  const entry = runProcess(`qc:dev-100:${runner}`, process.execPath, args.length ? args : [script], { env: { DEV100_EVIDENCE_DIR: childDir, ...extraEnv } });
  const artifactPath = path.join(childDir, artifactName);
  if (entry.status === "PASS" && fs.existsSync(artifactPath)) {
    const parsed = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    artifacts.set(runner, { runner, status: parsed.status, path: path.relative(root, artifactPath).replaceAll("\\", "/"), sha256: hashFile(artifactPath), runId: parsed.runId ?? null });
  } else {
    artifacts.set(runner, { runner, status: "FAIL", path: path.relative(root, artifactPath).replaceAll("\\", "/"), sha256: fs.existsSync(artifactPath) ? hashFile(artifactPath) : null, runId: null });
  }
  return entry;
}

function runNpm(name) {
  return runProcess(name, process.execPath, [npmCli, "run", name]);
}

function cleanupHistoricalTaskRoots() {
  const removed = [];
  const retained = [];
  const tempRoot = path.resolve(os.tmpdir());
  for (const entry of fs.readdirSync(tempRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("ai-pdm-dev100-")) continue;
    const target = path.resolve(tempRoot, entry.name);
    if (path.dirname(target) !== tempRoot || !path.basename(target).startsWith("ai-pdm-dev100-")) { retained.push({ target, reason: "unsafe" }); continue; }
    try { fs.rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); } catch (error) { retained.push({ target, reason: error instanceof Error ? error.message : String(error) }); continue; }
    if (fs.existsSync(target)) retained.push({ target, reason: "still-exists" }); else removed.push(target);
  }
  const workspaceTemp = path.join(root, ".tmp");
  if (fs.existsSync(workspaceTemp)) {
    for (const entry of fs.readdirSync(workspaceTemp, { withFileTypes: true })) {
      if (!entry.name.startsWith("qc-dev100-")) continue;
      const target = path.resolve(workspaceTemp, entry.name);
      if (path.dirname(target) !== path.resolve(workspaceTemp)) { retained.push({ target, reason: "unsafe" }); continue; }
      try { fs.rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); } catch (error) { retained.push({ target, reason: error instanceof Error ? error.message : String(error) }); continue; }
      if (fs.existsSync(target)) retained.push({ target, reason: "still-exists" }); else removed.push(target);
    }
  }
  return { removed, retained, complete: retained.length === 0 };
}

const primaryBefore = protectedPrimarySnapshot();
console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-100 fresh parent aggregate and independent QC",
  port: "child runners allocate task-owned ports only",
  owningProcessTree: "this aggregate -> sequential child runners",
  cleanupCondition: "all child runtimes stopped; temp roots removed; primary protected invariant unchanged",
  PDM_DATA_DIR: "child-specific isolated data except read-only primary inventory",
  PDM_REPOSITORY_DIR: "child-specific isolated repository except read-only primary inventory",
  mutationScope: "task-owned fixtures/evidence only"
} }));

if (!firstFailure) runChild("contract", "scripts/qc-dev-100-contract.mjs", ["scripts/qc-dev-100-contract.mjs"], "contract.json");
if (!firstFailure) runChild("repository", "scripts/qc-dev-100-repository.mjs", ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-100-repository.mjs"], "repository.json");
if (!firstFailure) runChild("negative", "scripts/qc-dev-100-negative.mjs", ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-100-negative.mjs"], "negative.json");
if (!firstFailure) runChild("postgres", "scripts/qc-dev-100-postgres.mjs", ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-100-postgres.mjs"], "postgres.json");
if (!firstFailure) runChild("browser", "scripts/qc-dev-100-browser.mjs", ["scripts/qc-dev-100-browser.mjs"], "browser.json", { DEV100_HEADLESS: "0" });
if (!firstFailure) runChild("primary-dry-run", "scripts/qc-dev-100-primary-dry-run.mjs", ["scripts/qc-dev-100-primary-dry-run.mjs"], "primary-dry-run.json");

for (const command of ["qc:dev-092:work-file-snapshot", "qc:dev-092:runtime-invariant", "qc:dev-087:commands", "qc:dev-090:migration", "typecheck:app"]) {
  if (firstFailure) break;
  runNpm(command);
}
if (!firstFailure) runProcess("lint:dev-100-affected", process.execPath, [
  "node_modules/eslint/bin/eslint.js",
  "src/lib/drawing-work-file-snapshot-invariant.ts",
  "src/lib/repositories/drawing-revision-work-async-repository.ts",
  "src/lib/drawing-revision-work-file.ts",
  "src/lib/drawing-revision-work.ts",
  "src/components/canonical-drawing-change-workspace.tsx",
  "scripts/dev-100-evidence-lib.mjs",
  "scripts/qc-dev-100-contract.mjs",
  "scripts/qc-dev-100-negative.mjs",
  "scripts/qc-dev-100-repository.mjs",
  "scripts/qc-dev-100-postgres.mjs",
  "scripts/qc-dev-100-primary-dry-run.mjs",
  "scripts/qc-dev-100-browser.mjs",
  "scripts/qc-dev-100-aggregate.mjs"
]);
if (!firstFailure) runNpm("build:isolated");

const primaryAfter = protectedPrimarySnapshot();
const sourceAtEnd = sourceInfo(root);
const cleanup = cleanupHistoricalTaskRoots();
const primaryUnchanged = primaryBefore.hash === primaryAfter.hash
  && primaryAfter.payload.foreignKeys.length === 0
  && Object.values(primaryAfter.payload.rootReferences).every((value) => value === 0);
const sourceUnchanged = sourceAtStart.head === sourceAtEnd.head && sourceAtStart.branch === sourceAtEnd.branch && sourceAtStart.dirtyBoundaryHash === sourceAtEnd.dirtyBoundaryHash;
for (const runner of DEV100_REQUIRED_RUNNERS) if (!artifacts.has(runner)) artifacts.set(runner, { runner, status: "NOT_RUN", path: null, sha256: null, runId: null });
const artifactResults = DEV100_REQUIRED_RUNNERS.map((runner) => artifacts.get(runner));
const allCommandsPass = commands.length === 13 && commands.every((entry) => entry.status === "PASS");
const allArtifactsPass = artifactResults.every((entry) => entry.status === "PASS");

const caseRunners = new Map([
  ["QA-100-001", ["primary-dry-run"]],
  ...Array.from({ length: 11 }, (_, index) => [`QA-100-${String(index + 2).padStart(3, "0")}`, ["repository"]]),
  ["QA-100-013", ["postgres"]],
  ["QA-100-014", ["browser"]],
  ["QA-100-015", ["browser"]],
  ["QA-100-016", ["repository", "negative"]],
  ["QA-100-017", ["primary-dry-run"]]
]);
const gateReady = !firstFailure && allCommandsPass && allArtifactsPass && primaryUnchanged && sourceUnchanged && cleanup.complete;
const caseResults = DEV100_CASE_IDS.map((caseId) => {
  if (caseId === "QA-100-018") return { caseId, result: gateReady ? "PASS" : "FAIL", evidenceRunners: ["qc-dev-100-aggregate"] };
  const evidenceRunners = caseRunners.get(caseId) ?? [];
  const result = evidenceRunners.length > 0 && evidenceRunners.every((runner) => artifacts.get(runner)?.status === "PASS") ? "PASS" : "FAIL";
  return { caseId, result, evidenceRunners };
});
const completionCandidate = gateReady && caseResults.every((entry) => entry.result === "PASS");
const implementationFiles = [
  "src/lib/drawing-work-file-snapshot-invariant.ts",
  "src/lib/repositories/drawing-revision-work-async-repository.ts",
  "src/lib/drawing-revision-work-file.ts",
  "src/lib/drawing-revision-work.ts",
  "src/components/canonical-drawing-change-workspace.tsx",
  "src/app/globals.css",
  "db/postgres/043_inline_relation_matrix.sql",
  "scripts/dev-100-evidence-lib.mjs",
  "scripts/qc-dev-087-qa-integrity.mjs",
  "scripts/qc-dev-087-aggregate.mjs"
];
const manifest = {
  schemaVersion: 1,
  runner: "qc-dev-100-aggregate",
  devId: "DEV-100",
  runId,
  parentRunId,
  generatedAt: new Date().toISOString(),
  status: completionCandidate ? "PASS" : "FAIL",
  completionCandidate,
  source: sourceAtEnd,
  sourceUnchanged,
  implementationArtifacts: implementationFiles.map((file) => ({ path: file, sha256: hashFile(path.join(root, file)) })),
  commands,
  artifactResults,
  currentDenominator: { expected: 18, pass: caseResults.filter((entry) => entry.result === "PASS").length, blocked: 0, notRun: 0, fail: caseResults.filter((entry) => entry.result === "FAIL").length },
  caseResults,
  defects: { p0: 0, p1: completionCandidate ? 0 : 1 },
  primaryInvariant: { before: primaryBefore.hash, after: primaryAfter.hash, unchanged: primaryUnchanged, foreignKeys: primaryAfter.payload.foreignKeys.length, rootReferences: primaryAfter.payload.rootReferences },
  cleanup,
  productionWrites: false,
  productionMigrationExecuted: false,
  productionDeployExecuted: false,
  a0044DataRepair: { status: "Human-Gated", applyCount: 0 },
  firstFailure
};
if (completionCandidate) {
  try { validateDev100AggregateManifest(root, manifest, { expectedParentRunId: parentRunId, expectedSource: sourceAtEnd }); }
  catch (error) {
    manifest.status = "FAIL";
    manifest.completionCandidate = false;
    manifest.currentDenominator.pass = 17;
    manifest.currentDenominator.fail = 1;
    manifest.caseResults[17].result = "FAIL";
    manifest.defects.p1 = 1;
    manifest.firstFailure = error instanceof Error ? error.message : String(error);
  }
}
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runId, status: manifest.status, completionCandidate: manifest.completionCandidate, denominator: manifest.currentDenominator, commands: commands.length, expectedCommands: 13, evidenceDir, firstFailure: manifest.firstFailure }));
if (manifest.status !== "PASS") process.exitCode = 1;
