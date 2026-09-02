#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const root = process.cwd();
const runId = `DEV104-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.join(root, "output", "qa", "dev-104", runId);
const logsDir = path.join(evidenceDir, "logs");
const npmCli = process.env.npm_execpath || path.join(process.env.ProgramFiles || "C:/Program Files", "nodejs", "node_modules", "npm", "bin", "npm-cli.js");
const expectedCaseIds = Array.from({ length: 48 }, (_, index) => `QA-104-${String(index + 1).padStart(3, "0")}`);
const childArtifacts = [];
const qualityGates = [];
fs.mkdirSync(logsDir, { recursive: true });

function git(args) {
  try { return String(execFileSync("git", args, { cwd: root, encoding: "utf8" })).trim(); } catch { return ""; }
}

function sourceSnapshot() {
  const dirty = git(["status", "--short"]);
  const dirtyBoundary = dirty ? dirty.split(/\r?\n/u).filter(Boolean) : [];
  // QA runners deliberately retain evidence under output/ and may create an
  // isolated build workspace under .tmp/. Those generated paths are not source
  // mutations and must not make the before/after source-boundary check fail.
  const stableDirtyBoundary = dirtyBoundary.filter((entry) => {
    const pathPart = entry.replace(/^..\s/u, "");
    return !/^output[\\/]/u.test(pathPart)
      && !/^\.tmp[\\/]/u.test(pathPart)
      && !/(?:^|[\\/])(?:next-env\.d\.ts|tsconfig\.json)$/u.test(pathPart);
  });
  return {
    revision: git(["rev-parse", "HEAD"]),
    branch: git(["branch", "--show-current"]),
    dirtyBoundary,
    dirtyHash: crypto.createHash("sha256").update(stableDirtyBoundary.join("\n")).digest("hex"),
    excludedGeneratedPaths: ["output/", ".tmp/", "next-env.d.ts", "tsconfig.json"]
  };
}

function primaryInvariant() {
  const databasePath = path.join(root, "data", "ai-pdm.sqlite");
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  try {
    const tables = ["part_roots", "part_numbers", "drawing_numbers", "drawings"];
    const payload = {
      schema: db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','index','trigger') AND (tbl_name IN (${tables.map(() => "?").join(",")}) OR name LIKE '%company_scope_migration%') ORDER BY type, name`).all(...tables),
      identities: Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()])),
      residue: db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%company_scope_migration%' ORDER BY name").all(),
      foreignKeys: db.pragma("foreign_key_check")
    };
    return { hash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"), payload };
  } finally { db.close(); }
}

function runProcess(name, executable, args, env = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(executable, args, { cwd: root, env: { ...process.env, ...env }, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const logPath = path.join(logsDir, `${String(childArtifacts.length + qualityGates.length + 1).padStart(2, "0")}-${name.replaceAll(":", "-")}.log`);
  fs.writeFileSync(logPath, output, "utf8");
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  return { name, status: result.status === 0 ? "PASS" : "FAIL", exitCode: result.status ?? 1, signal: result.signal ?? null, startedAt, completedAt: new Date().toISOString(), log: path.relative(root, logPath).replaceAll("\\", "/") };
}

function runRunner(name, args) {
  const result = runProcess(`qc:dev-104:${name}`, process.execPath, args, { DEV104_EVIDENCE_DIR: evidenceDir });
  const artifactPath = path.join(evidenceDir, name, "case-results.json");
  let artifact = null;
  if (fs.existsSync(artifactPath)) {
    try { artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")); } catch { artifact = null; }
  }
  childArtifacts.push({ runner: name, ...result, artifactPath: path.relative(root, artifactPath).replaceAll("\\", "/"), artifactStatus: artifact?.status ?? "NOT_RUN", runId: artifact?.runId ?? null, executedCases: artifact?.executedCases ?? null });
  return result;
}

function runNpmGate(name) {
  const result = runProcess(name, process.execPath, [npmCli, "run", name]);
  qualityGates.push(result);
  return result;
}

const sourceBefore = sourceSnapshot();
const primaryBefore = primaryInvariant();
console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-104 aggregate QA/QC: exact 48-case candidate plus preserved capability quality gates",
  port: "child browser runners allocate dynamic task-owned ports only",
  owningProcessTree: `aggregate ${process.pid} -> sequential runner children`,
  cleanupCondition: "all child runtimes stop themselves; aggregate retains only evidence; primary invariant unchanged",
  PDM_DATA_DIR: "child-specific isolated fixture directories",
  PDM_REPOSITORY_DIR: "child-specific isolated repository directories",
  mutationScope: path.join(root, "output", "qa", "dev-104", runId)
} }));

let firstFailure = null;
try {
  runRunner("contract", ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-104-contract.mjs"]);
  runRunner("state", ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs", "scripts/qc-dev-104-state.mjs"]);
  runRunner("browser", ["scripts/qc-dev-104-browser.mjs"]);
  for (const gate of ["qc:dev-071-api", "qc:dev-071-flag-off-browser", "qc:dev-096", "typecheck:app"]) runNpmGate(gate);
  const lifecycleResult = runProcess("qc:pdm-lifecycle-bom-draft-ui", process.execPath, [npmCli, "run", "qc:pdm-lifecycle-bom-draft-ui"], { PDM_QC_FORCE_ISOLATED: "1" });
  qualityGates.push(lifecycleResult);
  const lintResult = runProcess("lint:dev-104-affected", process.execPath, [
    path.join(root, "node_modules", "eslint", "bin", "eslint.js"),
    "src/app/bom/workbench", "src/components/bom-editor", "src/lib/bom-editor-feature.ts", "src/lib/assembly-bom-feature.ts", "src/app/api/bom/drafts",
    "scripts/qc-dev-104-contract.mjs", "scripts/qc-dev-104-state.mjs", "scripts/qc-dev-104-browser.mjs", "scripts/qc-dev-104-aggregate.mjs",
    "scripts/qc-dev-071-contract.mjs", "scripts/qc-dev-071-browser.mjs", "scripts/qc-dev-071-flag-off-browser.mjs", "scripts/qc-dev-096-browser.mjs", "scripts/qc-pdm-lifecycle-bom-draft-ui.mjs", "scripts/qc-system-health-phase8-bom-presentation.mjs"
  ]);
  qualityGates.push(lintResult);
  runNpmGate("build:isolated");
} catch (error) {
  firstFailure = error instanceof Error ? error.message : String(error);
}

const primaryAfter = primaryInvariant();
const sourceAfter = sourceSnapshot();
const expectedByRunner = {
  contract: expectedCaseIds.slice(0, 12),
  state: expectedCaseIds.slice(12, 28),
  browser: expectedCaseIds.slice(28)
};
const runnerReports = {};
for (const runner of ["contract", "state", "browser"]) {
  const artifact = childArtifacts.find((entry) => entry.runner === runner);
  const artifactPath = artifact ? path.join(root, artifact.artifactPath) : "";
  let parsed = null;
  if (artifactPath && fs.existsSync(artifactPath)) { try { parsed = JSON.parse(fs.readFileSync(artifactPath, "utf8")); } catch { parsed = null; } }
  const cases = Array.isArray(parsed?.checks) ? parsed.checks : (Array.isArray(parsed?.cases) ? parsed.cases : []);
  const caseIds = cases.map((entry) => entry.caseId ?? entry.id);
  const expected = expectedByRunner[runner];
  const evidencePathsValid = cases.every((entry) => (entry.evidencePaths ?? []).every((relative) => fs.existsSync(path.resolve(root, relative))));
  runnerReports[runner] = { artifact: artifact?.artifactPath ?? null, status: parsed?.status ?? "NOT_RUN", caseIds, expectedCaseIds: expected, exactCaseSet: caseIds.length === expected.length && new Set(caseIds).size === expected.length && expected.every((caseId) => caseIds.includes(caseId)), allCasesPass: cases.length === expected.length && cases.every((entry) => entry.status === "PASS"), evidencePathsValid, primaryInvariantUnchanged: runner === "browser" ? parsed?.primaryInvariant?.unchanged === true : true, cleanupComplete: runner === "browser" ? Object.values(parsed?.cleanup ?? {}).filter((value) => typeof value === "boolean").every(Boolean) : true };
}

const qualityGatePass = qualityGates.length === 7 && qualityGates.every((entry) => entry.status === "PASS");
const runnersPass = Object.values(runnerReports).every((report) => report.status === "PASS" && report.exactCaseSet && report.allCasesPass && report.evidencePathsValid && report.primaryInvariantUnchanged && report.cleanupComplete);
const primaryUnchanged = primaryBefore.hash === primaryAfter.hash && primaryAfter.payload.foreignKeys.length === 0;
const sourceUnchanged = sourceBefore.revision === sourceAfter.revision && sourceBefore.branch === sourceAfter.branch && sourceBefore.dirtyHash === sourceAfter.dirtyHash;
const completionCandidate = !firstFailure && runnersPass && qualityGatePass && primaryUnchanged && sourceUnchanged;
const manifest = {
  schemaVersion: 1,
  devId: "DEV-104",
  runner: "aggregate",
  runId,
  generatedAt: new Date().toISOString(),
  status: completionCandidate ? "PASS" : "FAIL",
  completionCandidate,
  fixedDenominator: 48,
  expectedCaseIds,
  runnerReports,
  childArtifacts,
  qualityGates,
  source: { before: sourceBefore, after: sourceAfter, unchanged: sourceUnchanged },
  primaryInvariant: { before: primaryBefore.hash, after: primaryAfter.hash, unchanged: primaryUnchanged, foreignKeysAfter: primaryAfter.payload.foreignKeys.length },
  productionConnected: false,
  productionWrites: false,
  primaryWrites: false,
  cleanup: { childRuntimesStopped: childArtifacts.every((entry) => entry.status === "PASS" || entry.artifactStatus === "FAIL"), aggregateOwnedRuntime: false, evidenceRetained: true },
  firstFailure
};
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runId, status: manifest.status, completionCandidate, denominator: 48, runnerReports, qualityGates: qualityGates.map((entry) => ({ name: entry.name, status: entry.status, exitCode: entry.exitCode })), evidenceDir, primaryInvariantUnchanged: primaryUnchanged, sourceUnchanged }));
if (!completionCandidate) process.exitCode = 1;
