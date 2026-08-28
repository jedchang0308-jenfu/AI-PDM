#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("DEV098_NPM_EXEC_PATH_MISSING");

const runId = `DEV098-aggregate-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.join(root, "output", "qa", "dev-098", runId);
const childrenDir = path.join(evidenceDir, "children");
const logsDir = path.join(evidenceDir, "logs");
fs.mkdirSync(childrenDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });

const fixedCaseIds = Array.from({ length: 31 }, (_, index) => `QA-098-${String(index + 1).padStart(3, "0")}`);
const childDefinitions = [
  { id: "contract", script: "qc:dev-098:contract", envKey: "DEV098_CONTRACT_EVIDENCE_DIR", cases: fixedCaseIds.slice(0, 5) },
  { id: "repository", script: "qc:dev-098:repository", envKey: "DEV098_REPOSITORY_EVIDENCE_DIR", cases: [...fixedCaseIds.slice(5, 16), fixedCaseIds[26], fixedCaseIds[27], fixedCaseIds[29]] },
  { id: "browser", script: "qc:dev-098:browser", envKey: "DEV098_BROWSER_EVIDENCE_DIR", cases: [...fixedCaseIds.slice(16, 24), fixedCaseIds[28]] },
  { id: "postgres", script: "qc:dev-098:postgres", envKey: "DEV098_POSTGRES_EVIDENCE_DIR", cases: [fixedCaseIds[30]] }
];
const dev098SourceFiles = [
  "src/lib/drawing-revision-target-contract.ts",
  "src/lib/drawing-revision-target-token.server.ts",
  "src/lib/drawing-revision-lifecycle-policy.ts",
  "src/lib/drawing-revision-work.ts",
  "src/lib/drawing-revision-work-file.ts",
  "src/lib/repositories/drawing-revision-work-async-repository.ts",
  "src/lib/drawing-recognition.ts",
  "src/app/api/pdm/drawings/[drawingId]/revision-works/route.ts",
  "src/app/api/pdm/drawings/[drawingId]/revision-targets/route.ts",
  "src/app/api/pdm/review-requests/[requestId]/route.ts",
  "src/lib/pdm-canonical-workbench-contract.ts",
  "src/lib/repositories/pdm-canonical-workbench-async-repository.ts",
  "src/lib/pdm-canonical-workbench-state.ts",
  "src/components/canonical-pdm-workbench.tsx",
  "src/components/canonical-drawing-change-workspace.tsx",
  "src/app/globals.css",
  "scripts/qc-dev-087-commands.mjs",
  "scripts/qc-dev-087-ui-only.mjs",
  "scripts/qc-dev-098-contract.mjs",
  "scripts/qc-dev-098-repository.mjs",
  "scripts/qc-dev-098-browser.mjs",
  "scripts/qc-dev-098-postgres.mjs",
  "scripts/qc-dev-098-aggregate.mjs",
  "package.json"
];
const lintFiles = dev098SourceFiles.filter((file) => !file.endsWith(".css") && file !== "package.json");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileInventory(files) {
  return files.map((relative) => {
    const absolute = path.join(root, relative);
    return { path: relative.replaceAll("\\", "/"), exists: fs.existsSync(absolute), sha256: fs.existsSync(absolute) ? sha256(fs.readFileSync(absolute)) : null };
  });
}

function inventoryHash(files) {
  return sha256(JSON.stringify(fileInventory(files)));
}

function schemaBoundary() {
  const postgresDir = path.join(root, "db", "postgres");
  const postgresFiles = fs.existsSync(postgresDir)
    ? fs.readdirSync(postgresDir).filter((name) => name.endsWith(".sql")).sort().map((name) => `db/postgres/${name}`)
    : [];
  const files = ["db/schema.sql", "src/lib/db.ts", ...postgresFiles];
  return { classification: "none", dev098OwnedSchemaFiles: [], files: fileInventory(files), hash: inventoryHash(files) };
}

function primarySnapshot() {
  const command = spawnSync(process.execPath, [path.join(root, "scripts", "dev-087-primary-snapshot.mjs"), `--db=${path.join(root, "data", "ai-pdm.sqlite")}`], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024
  });
  if (command.status !== 0) throw new Error(`PRIMARY_SNAPSHOT_FAILED:${command.stderr || command.stdout}`);
  return JSON.parse(command.stdout.trim());
}

function primarySafe(snapshot) {
  return snapshot
    && Object.values(snapshot.counts ?? {}).every((count) => Number(count) > 0)
    && Number(snapshot.migrationResidue?.unresolved ?? -1) === 0
    && Object.values(snapshot.rootReferenceViolations ?? {}).every((count) => Number(count) === 0)
    && Number(snapshot.foreignKeyViolations ?? -1) === 0;
}

const commands = [];
const childManifests = [];
let firstFailure = null;

function npmRun(script, extraEnv = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, [npmCli, "run", script], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 96 * 1024 * 1024,
    env: { ...process.env, DEV098_PARENT_RUN_ID: runId, ...extraEnv }
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const logPath = path.join(logsDir, `${String(commands.length + 1).padStart(2, "0")}-${script.replaceAll(":", "-")}.log`);
  fs.writeFileSync(logPath, output, "utf8");
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  const entry = {
    script,
    status: result.status === 0 ? "PASS" : "FAIL",
    exitCode: result.status,
    startedAt,
    completedAt: new Date().toISOString(),
    log: path.relative(root, logPath).replaceAll("\\", "/"),
    outputSha256: sha256(output)
  };
  commands.push(entry);
  if (entry.status !== "PASS" && !firstFailure) firstFailure = `${script}:exit=${result.status}`;
  return entry;
}

function directRun(id, args) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 96 * 1024 * 1024, env: { ...process.env, DEV098_PARENT_RUN_ID: runId } });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const logPath = path.join(logsDir, `${String(commands.length + 1).padStart(2, "0")}-${id}.log`);
  fs.writeFileSync(logPath, output, "utf8");
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  const entry = { script: id, status: result.status === 0 ? "PASS" : "FAIL", exitCode: result.status, startedAt, completedAt: new Date().toISOString(), log: path.relative(root, logPath).replaceAll("\\", "/"), outputSha256: sha256(output) };
  commands.push(entry);
  if (entry.status !== "PASS" && !firstFailure) firstFailure = `${id}:exit=${result.status}`;
  return entry;
}

function validateChild(definition, manifestPath) {
  if (!fs.existsSync(manifestPath)) throw new Error(`${definition.id.toUpperCase()}_MANIFEST_MISSING`);
  const body = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const actualIds = Array.isArray(body.fixedCaseIds) ? body.fixedCaseIds : [];
  const caseEntries = Array.isArray(body.caseResults) ? body.caseResults : [];
  const postgresChecksPass = definition.id === "postgres" && Array.isArray(body.checks) && body.checks.length > 0 && body.checks.every((item) => item.id === "QA-098-031" && item.status === "PASS");
  const resultIds = caseEntries.length > 0 ? caseEntries.map((item) => item.id) : postgresChecksPass ? actualIds : [];
  if (body.status !== "PASS") throw new Error(`${definition.id.toUpperCase()}_MANIFEST_NOT_PASS`);
  if (JSON.stringify(actualIds) !== JSON.stringify(definition.cases) || JSON.stringify(resultIds) !== JSON.stringify(definition.cases)) throw new Error(`${definition.id.toUpperCase()}_CASE_ROSTER_MISMATCH`);
  if (body.expected !== definition.cases.length || body.passed !== definition.cases.length || caseEntries.some((item) => item.status !== "PASS") || definition.id === "postgres" && !postgresChecksPass) throw new Error(`${definition.id.toUpperCase()}_CASE_RESULT_INVALID`);
  if (definition.id === "contract" && (body.primaryInvariants?.unchanged !== true || (body.foreignKeyCheck ?? []).length !== 0)) throw new Error("CONTRACT_INVARIANT_INVALID");
  if (definition.id === "repository" && body.cleanup?.status !== "PASS") throw new Error("REPOSITORY_CLEANUP_INVALID");
  if (definition.id === "browser") {
    if (body.dataBoundary?.primaryUnchanged !== true || body.cleanup?.taskRootRemoved !== true || body.cleanup?.runtimeProjectRemoved !== true || body.cleanup?.portReleased !== true) throw new Error("BROWSER_BOUNDARY_INVALID");
    if ((body.telemetry?.unexpectedConsoleErrors ?? []).length || (body.telemetry?.pageErrors ?? []).length || (body.telemetry?.unexpectedRequestFailures ?? []).length || (body.telemetry?.unexpectedHttp ?? []).length) throw new Error("BROWSER_TELEMETRY_INVALID");
  }
  if (definition.id === "postgres" && (body.dataBoundary?.primaryUnchanged !== true || body.cleanup?.taskRootRemoved !== true || body.cleanup?.portReleased !== true || body.provider !== "postgres")) throw new Error("POSTGRES_BOUNDARY_INVALID");
  return body;
}

function taskOwnedResidue() {
  const workspaceTemp = path.join(root, ".tmp");
  const workspace = fs.existsSync(workspaceTemp)
    ? fs.readdirSync(workspaceTemp).filter((name) => name.startsWith("qc-dev098-") || name === "dev-098-repository").map((name) => path.join(workspaceTemp, name))
    : [];
  const systemTemp = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("ai-pdm-dev098-")).map((name) => path.join(os.tmpdir(), name));
  return [...workspace, ...systemTemp].filter((target) => fs.existsSync(target));
}

const sourceBefore = inventoryHash(dev098SourceFiles);
const primaryBefore = primarySnapshot();
const schemaBefore = schemaBoundary();

console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-098 fresh 31-case aggregate, parent regression and isolated build gate",
  port: "child-specific dynamic ports only",
  owningProcessTree: `aggregate ${process.pid} -> one sequential task-owned child at a time`,
  cleanupCondition: "all child runtimes stop, ports release, task temp roots disappear, primary/source/schema boundaries remain unchanged",
  PDM_DATA_DIR: "child-specific task-owned isolated directories",
  PDM_REPOSITORY_DIR: "child-specific task-owned isolated directories",
  mutationScope: `${evidenceDir} plus child task-owned temporary roots; primary data is read-only fingerprinted`
} }));

for (const definition of childDefinitions.slice(0, 2)) {
  if (firstFailure) break;
  const childDir = path.join(childrenDir, definition.id);
  fs.mkdirSync(childDir, { recursive: true });
  const command = npmRun(definition.script, { [definition.envKey]: childDir });
  const manifestPath = path.join(childDir, "manifest.json");
  try {
    if (command.status === "PASS") {
      const body = validateChild(definition, manifestPath);
      childManifests.push({ runner: definition.id, runId: body.runId, path: path.relative(root, manifestPath).replaceAll("\\", "/"), sha256: sha256(fs.readFileSync(manifestPath)), status: body.status, caseIds: definition.cases });
    }
  } catch (error) { firstFailure = error instanceof Error ? error.message : String(error); }
}

if (!firstFailure) npmRun("typecheck:app");

for (const definition of childDefinitions.slice(2)) {
  if (firstFailure) break;
  const childDir = path.join(childrenDir, definition.id);
  fs.mkdirSync(childDir, { recursive: true });
  const command = npmRun(definition.script, { [definition.envKey]: childDir });
  const manifestPath = path.join(childDir, "manifest.json");
  try {
    if (command.status === "PASS") {
      const body = validateChild(definition, manifestPath);
      childManifests.push({ runner: definition.id, runId: body.runId, path: path.relative(root, manifestPath).replaceAll("\\", "/"), sha256: sha256(fs.readFileSync(manifestPath)), status: body.status, caseIds: definition.cases });
    }
  } catch (error) { firstFailure = error instanceof Error ? error.message : String(error); }
}

if (!firstFailure) npmRun("qc:dev-087:commands");
if (!firstFailure) npmRun("qc:dev-087:contract");
if (!firstFailure) directRun("lint-dev-098-affected", ["node_modules/eslint/bin/eslint.js", ...lintFiles]);
if (!firstFailure) npmRun("build:isolated");

const sourceAfter = inventoryHash(dev098SourceFiles);
const primaryAfter = primarySnapshot();
const schemaAfter = schemaBoundary();
const residue = taskOwnedResidue();
const primaryUnchanged = JSON.stringify(primaryBefore) === JSON.stringify(primaryAfter) && primarySafe(primaryAfter);
const sourceUnchanged = sourceBefore === sourceAfter;
const schemaBoundaryUnchanged = schemaBefore.hash === schemaAfter.hash;
const cleanupComplete = residue.length === 0;
const childById = new Map(childManifests.map((item) => [item.runner, item]));
const commandByName = new Map(commands.map((item) => [item.script, item]));
const caseResults = fixedCaseIds.map((caseId) => {
  const child = childDefinitions.find((definition) => definition.cases.includes(caseId));
  if (child) return { id: caseId, status: childById.get(child.id)?.status === "PASS" ? "PASS" : "FAIL", evidence: childById.get(child.id)?.path ?? null };
  if (caseId === "QA-098-025") {
    const pass = ["typecheck:app", "qc:dev-087:commands", "qc:dev-087:contract"].every((name) => commandByName.get(name)?.status === "PASS");
    return { id: caseId, status: pass ? "PASS" : "FAIL", evidence: ["typecheck:app", "qc:dev-087:commands", "qc:dev-087:contract"] };
  }
  return { id: caseId, status: "FAIL", evidence: "aggregate-final-gate" };
});
const qa026 = caseResults.find((item) => item.id === "QA-098-026");
const qa026Pass = !firstFailure
  && commands.length === 9
  && commands.every((item) => item.status === "PASS")
  && childManifests.length === childDefinitions.length
  && childManifests.every((item) => item.status === "PASS" && /^[a-f0-9]{64}$/u.test(item.sha256))
  && caseResults.filter((item) => item.id !== "QA-098-026").every((item) => item.status === "PASS")
  && primaryUnchanged && sourceUnchanged && schemaBoundaryUnchanged && cleanupComplete;
qa026.status = qa026Pass ? "PASS" : "FAIL";

const passed = caseResults.filter((item) => item.status === "PASS").length;
const status = passed === fixedCaseIds.length ? "PASS" : "FAIL";
if (status !== "PASS" && !firstFailure) firstFailure = "QA-098-026:aggregate-final-gate";
const manifest = {
  schemaVersion: 1,
  devId: "DEV-098",
  suite: "aggregate",
  runner: "aggregate",
  runId,
  generatedAt: new Date().toISOString(),
  status,
  completionCandidate: status === "PASS",
  fixedCaseIds,
  expected: fixedCaseIds.length,
  executed: caseResults.length,
  passed,
  currentDenominator: { expected: fixedCaseIds.length, pass: passed, fail: fixedCaseIds.length - passed, blocked: 0, notRun: 0 },
  caseResults,
  commands,
  childManifests,
  sourceBoundary: { files: fileInventory(dev098SourceFiles), before: sourceBefore, after: sourceAfter, unchanged: sourceUnchanged },
  schemaBoundary: { classification: "none", dev098OwnedSchemaFiles: [], before: schemaBefore.hash, after: schemaAfter.hash, unchanged: schemaBoundaryUnchanged },
  primaryInvariant: { before: primaryBefore, after: primaryAfter, unchanged: primaryUnchanged },
  cleanup: { status: cleanupComplete ? "PASS" : "FAIL", residue },
  defects: { p0: 0, p1: status === "PASS" ? 0 : 1 },
  productionWrites: false,
  productionMigrationExecuted: false,
  productionDeployExecuted: false,
  firstFailure
};
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runner: manifest.runner, runId, status, denominator: manifest.currentDenominator, commands: commands.length, childManifests: childManifests.length, primaryUnchanged, sourceUnchanged, schemaBoundaryUnchanged, cleanup: manifest.cleanup, firstFailure }, null, 2));
if (status !== "PASS") process.exitCode = 1;
