#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import {
  artifactReference,
  DEV087_MANIFEST_SCHEMA_VERSION,
  hashFile,
  readJson,
  sha256,
  sourceInfo
} from "./dev-087-evidence-lib.mjs";
import { selectDev100Child, validateDev100AggregateManifest } from "./dev-100-evidence-lib.mjs";

const root = process.cwd();
const registryPath = path.join(root, ".ai-doc", "qa", "dev-087-current-case-registry.json");
const manifestSchemaPath = path.join(root, ".ai-doc", "qa", "dev-087-capability-manifest.schema.json");
const oraclePath = path.join(root, "scripts", "qc-dev-087-reference-oracles.mjs");
const capabilityRoot = path.join(root, "output", "qa", "dev-087-capability");
const dev094BrowserRoot = path.join(root, "output", "qa", "dev-094-browser");
const runId = `DEV087-aggregate-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.join(root, "output", "qa", "dev-087-aggregate", runId);
const regressionAttemptDir = path.join(evidenceDir, "regression-attempts");
const registry = readJson(registryPath);
const sourceAtStart = sourceInfo(root);
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("DEV087_NPM_EXEC_PATH_MISSING");

const regressionScripts = [
  "qc:dev-094:capa",
  "qc:dev-094:browser",
  "qc:dev-087:contract",
  "qc:dev-087:repository",
  "qc:dev-087:commands",
  "qc:dev-087:migration",
  "qc:dev-092:work-file-snapshot",
  "qc:dev-092:runtime-invariant",
  "qc:dev-092:recognition-context",
  "qc:dev-092:browser",
  "qc:dev-087:zero-loss",
  "qc:dev-087:retirement",
  "qc:dev-087:file-read-retirement",
  "typecheck:app",
  "build:isolated"
];

function primarySnapshot() {
  const databasePath = path.resolve(process.env.PDM_PRIMARY_DB_PATH?.trim() || path.join(root, "data", "ai-pdm.sqlite"));
  if (!fs.existsSync(databasePath)) return { status: "missing", databasePath, rawHash: null };
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const tableExists = (name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
    const scalar = (sql) => Number(db.prepare(sql).get().count ?? 0);
    const columns = (name) => new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((row) => String(row.name)));
    const identityRows = {
      roots: tableExists("part_roots") ? db.prepare("SELECT id, company_id, root_code, record_status FROM part_roots ORDER BY company_id, root_code, id").all() : [],
      parts: tableExists("part_numbers") ? db.prepare("SELECT id, company_id, part_root_id, part_number, record_status FROM part_numbers ORDER BY company_id, part_number, id").all() : [],
      drawingNumbers: tableExists("drawing_numbers") ? db.prepare("SELECT id, company_id, part_root_id, drawing_number, record_status FROM drawing_numbers ORDER BY company_id, drawing_number, id").all() : [],
      drawings: tableExists("drawings") ? db.prepare("SELECT id, company_id, part_root_id, formal_drawing_number_id, drawing_number, lifecycle_state FROM drawings ORDER BY company_id, drawing_number, id").all() : []
    };
    const schemaRows = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') ORDER BY type, name").all();
    const quarantineColumns = tableExists("pdm_workbench_migration_quarantine") ? columns("pdm_workbench_migration_quarantine") : new Set();
    const unresolvedQuarantine = !tableExists("pdm_workbench_migration_quarantine")
      ? null
      : quarantineColumns.has("resolution_status")
        ? scalar("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine WHERE resolution_status='unresolved'")
        : quarantineColumns.has("resolution")
          ? scalar("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine WHERE resolution IS NULL OR TRIM(resolution)='' OR resolution='unresolved'")
          : scalar("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine");
    const rootReferenceViolations = {
      partNumbers: tableExists("part_numbers") && tableExists("part_roots") ? scalar("SELECT COUNT(*) AS count FROM part_numbers part LEFT JOIN part_roots root ON root.id=part.part_root_id AND root.company_id=part.company_id WHERE part.part_root_id IS NOT NULL AND root.id IS NULL") : null,
      drawingNumbers: tableExists("drawing_numbers") && tableExists("part_roots") ? scalar("SELECT COUNT(*) AS count FROM drawing_numbers drawing LEFT JOIN part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id WHERE drawing.part_root_id IS NOT NULL AND root.id IS NULL") : null,
      drawings: tableExists("drawings") && tableExists("part_roots") ? scalar("SELECT COUNT(*) AS count FROM drawings drawing LEFT JOIN part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id WHERE drawing.part_root_id IS NOT NULL AND root.id IS NULL") : null,
      formalDrawingNumbers: tableExists("drawings") && tableExists("drawing_numbers") ? scalar("SELECT COUNT(*) AS count FROM drawings drawing LEFT JOIN drawing_numbers number ON number.id=drawing.formal_drawing_number_id AND number.company_id=drawing.company_id WHERE drawing.formal_drawing_number_id IS NOT NULL AND number.id IS NULL") : null
    };
    return {
      status: "captured",
      databasePath: path.relative(root, databasePath).replaceAll(path.sep, "/"),
      rawHash: hashFile(databasePath),
      schemaHash: sha256(JSON.stringify(schemaRows)),
      canonicalIdentityHash: sha256(JSON.stringify(identityRows)),
      foreignKeyViolations: db.pragma("foreign_key_check").length,
      rootReferenceViolations,
      partRoots: tableExists("part_roots") ? scalar("SELECT COUNT(*) AS count FROM part_roots") : null,
      partNumbers: tableExists("part_numbers") ? scalar("SELECT COUNT(*) AS count FROM part_numbers") : null,
      drawings: tableExists("drawings") ? scalar("SELECT COUNT(*) AS count FROM drawings") : null,
      canonicalStates: tableExists("canonical_workbench_states") ? scalar("SELECT COUNT(*) AS count FROM canonical_workbench_states") : null,
      migrationResidue: {
        totalQuarantine: tableExists("pdm_workbench_migration_quarantine") ? scalar("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine") : null,
        unresolvedQuarantine
      }
    };
  } finally {
    db.close();
  }
}

function protectedPrimaryInvariant(snapshot) {
  return {
    status: snapshot.status,
    databasePath: snapshot.databasePath,
    schemaHash: snapshot.schemaHash,
    canonicalIdentityHash: snapshot.canonicalIdentityHash,
    foreignKeyViolations: snapshot.foreignKeyViolations,
    rootReferenceViolations: snapshot.rootReferenceViolations,
    partRoots: snapshot.partRoots,
    partNumbers: snapshot.partNumbers,
    drawings: snapshot.drawings,
    canonicalStates: snapshot.canonicalStates,
    migrationResidue: snapshot.migrationResidue
  };
}

function runNpm(script) {
  const result = spawnSync(process.execPath, [npmCli, "run", script], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, DEV087_AGGREGATE_RUN_ID: runId }
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  return { script, status: result.status === 0 ? "PASS" : "FAIL", exitCode: result.status, error: result.error?.message ?? null };
}

function dev094BrowserManifestPaths() {
  if (!fs.existsSync(dev094BrowserRoot)) return new Set();
  return new Set(fs.readdirSync(dev094BrowserRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const manifestPath = path.join(dev094BrowserRoot, entry.name, "manifest.json");
    return fs.existsSync(manifestPath) ? [manifestPath] : [];
  }));
}

function exactDev094SocketFailure(manifest) {
  const exactConsoleError = /^Failed to load resource: net::ERR_(?:NO_BUFFER_SPACE|NETWORK_CHANGED)$/u;
  const exactRequestFailure = /^net::ERR_(?:NO_BUFFER_SPACE|NETWORK_CHANGED)$/u;
  const failedChecks = (manifest?.checks ?? []).filter((item) => item.pass !== true);
  const consoleErrors = manifest?.consoleErrors ?? [];
  const failures = manifest?.failures ?? [];
  const requestFailures = failures.filter((item) => item.kind === "requestfailed");
  const executionFailures = failures.filter((item) => item.kind === "execution");
  const expectedExecutionMessage = `browser console errors absent:${JSON.stringify(consoleErrors)}`;
  const cleanupChecksPass = (manifest?.checks ?? []).some((item) => item.name === "temporary runtime port released" && item.pass === true)
    && (manifest?.checks ?? []).some((item) => item.name === "temporary runtime dist removed" && item.pass === true);
  return manifest?.status === "FAIL"
    && manifest.total === 27
    && manifest.passed === 26
    && manifest.failed === 1
    && failedChecks.length === 1
    && failedChecks[0]?.name === "browser console errors absent"
    && consoleErrors.length === 1
    && consoleErrors.every((message) => exactConsoleError.test(String(message)))
    && failures.length === 2
    && requestFailures.length === 1
    && requestFailures.every((item) => exactRequestFailure.test(String(item.message ?? "")))
    && executionFailures.length === 1
    && executionFailures[0]?.message === expectedExecutionMessage
    && manifest.cleanupStatus === "removed"
    && manifest.productionConnected === false
    && manifest.productionMutation === false
    && cleanupChecksPass;
}

function relativeArtifact(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function runDev094BrowserWithStrictRetry() {
  const script = "qc:dev-094:browser";
  const attempts = [];
  fs.mkdirSync(regressionAttemptDir, { recursive: true });
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const manifestsBefore = dev094BrowserManifestPaths();
    const primaryAtAttemptStart = primarySnapshot();
    const sourceAtAttemptStart = sourceInfo(root);
    const startedAt = new Date().toISOString();
    const result = spawnSync(process.execPath, [npmCli, "run", script], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, DEV087_AGGREGATE_RUN_ID: runId }
    });
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    const stdoutPath = path.join(regressionAttemptDir, `qc-dev-094-browser-attempt-${attempt}.stdout.log`);
    const stderrPath = path.join(regressionAttemptDir, `qc-dev-094-browser-attempt-${attempt}.stderr.log`);
    fs.writeFileSync(stdoutPath, result.stdout || "", "utf8");
    fs.writeFileSync(stderrPath, result.stderr || "", "utf8");
    const newManifestPaths = [...dev094BrowserManifestPaths()].filter((manifestPath) => !manifestsBefore.has(manifestPath));
    const manifestPath = newManifestPaths.length === 1 ? newManifestPaths[0] : null;
    let childManifest = null;
    try { childManifest = manifestPath ? readJson(manifestPath) : null; } catch {}
    const primaryAtAttemptEnd = primarySnapshot();
    const sourceAtAttemptEnd = sourceInfo(root);
    const primaryUnchanged = JSON.stringify(protectedPrimaryInvariant(primaryAtAttemptStart)) === JSON.stringify(protectedPrimaryInvariant(primaryAtAttemptEnd));
    const sourceUnchanged = JSON.stringify(sourceAtAttemptStart) === JSON.stringify(sourceAtAttemptEnd);
    const retryEligible = result.status !== 0
      && newManifestPaths.length === 1
      && exactDev094SocketFailure(childManifest)
      && primaryUnchanged
      && sourceUnchanged;
    attempts.push({
      attempt,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: result.status === 0 && childManifest?.status === "PASS" ? "PASS" : "FAIL",
      exitCode: result.status,
      error: result.error?.message ?? null,
      manifestCardinality: newManifestPaths.length,
      manifest: manifestPath ? { path: relativeArtifact(manifestPath), sha256: hashFile(manifestPath), status: childManifest?.status ?? null } : null,
      stdout: { path: relativeArtifact(stdoutPath), sha256: hashFile(stdoutPath) },
      stderr: { path: relativeArtifact(stderrPath), sha256: hashFile(stderrPath) },
      primaryProtectedUnchanged: primaryUnchanged,
      sourceUnchanged,
      retryEligible
    });
    const ledgerPath = path.join(regressionAttemptDir, "qc-dev-094-browser.json");
    fs.writeFileSync(ledgerPath, `${JSON.stringify({ script, maximumAttempts: 2, exactInfrastructureWhitelist: ["ERR_NO_BUFFER_SPACE", "ERR_NETWORK_CHANGED"], retryDelayMs: 30_000, attempts }, null, 2)}\n`, "utf8");
    if (attempts.at(-1)?.status === "PASS") {
      return { script, status: "PASS", exitCode: 0, error: null, attempts, attemptLedger: relativeArtifact(ledgerPath) };
    }
    if (!retryEligible || attempt === 2) {
      return { script, status: "FAIL", exitCode: result.status, error: result.error?.message ?? null, attempts, attemptLedger: relativeArtifact(ledgerPath) };
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
  }
  throw new Error("DEV094_RETRY_LOOP_UNREACHABLE");
}

function manifestsForParent() {
  if (!fs.existsSync(capabilityRoot)) return [];
  return fs.readdirSync(capabilityRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const manifestPath = path.join(capabilityRoot, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) return [];
    try {
      const parsed = readJson(manifestPath);
      return parsed.parentRunId === runId ? [{ path: manifestPath, parsed }] : [];
    } catch {
      return [];
    }
  });
}

function dev100ManifestsForParent() {
  const dev100Root = path.join(root, "output", "qa", "dev-100");
  if (!fs.existsSync(dev100Root)) return [];
  return fs.readdirSync(dev100Root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const manifestPath = path.join(dev100Root, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) return [];
    try {
      const parsed = readJson(manifestPath);
      return parsed.parentRunId === runId ? [{ path: manifestPath, parsed }] : [];
    } catch { return []; }
  });
}

function validateTrustedSoloProductLane(manifest, coverage) {
  if (manifest?.schemaVersion !== DEV087_MANIFEST_SCHEMA_VERSION || manifest.gateStage !== "product" || manifest.runner !== coverage.runner) throw new Error(`PRODUCT_LANE_INVALID:${coverage.runner}`);
  if (manifest.parentRunId !== runId) throw new Error(`PRODUCT_LANE_NOT_FRESH:${coverage.runner}`);
  if (manifest.result !== "PASS" || manifest.cleanupReceipt?.status !== "complete" || manifest.cleanupReceipt?.portsReleased !== true || (manifest.primaryInvariant?.delta ?? 0) !== 0) throw new Error(`PRODUCT_LANE_NOT_CLEAN_PASS:${coverage.runner}`);
  const expectedCases = [...coverage.caseIds].sort();
  const actualCases = (manifest.caseResults ?? []).map((item) => item.caseId).sort();
  if (JSON.stringify(actualCases) !== JSON.stringify(expectedCases) || manifest.caseResults.some((item) => item.result !== "PASS")) throw new Error(`PRODUCT_LANE_CASES_INCOMPLETE:${coverage.runner}`);
}

function validateQualityGateManifest(manifest) {
  if (manifest?.schemaVersion !== DEV087_MANIFEST_SCHEMA_VERSION || manifest.gateStage !== "product" || manifest.runner !== registry.qualityGateRunner.runner) throw new Error("QUALITY_GATE_MANIFEST_INVALID");
  if (manifest.parentRunId !== runId) throw new Error("QUALITY_GATE_NOT_FRESH");
  if (manifest.result !== "PASS" || manifest.cleanupReceipt?.status !== "complete" || manifest.cleanupReceipt?.portsReleased !== true || (manifest.primaryInvariant?.delta ?? 0) !== 0) throw new Error("QUALITY_GATE_NOT_CLEAN_PASS");
  const expected = registry.qualityGateCoverage.map((item) => item.gateId).sort();
  const actual = (manifest.qualityGateResults ?? []).map((item) => item.gateId).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected) || manifest.qualityGateResults.some((item) => item.result !== "PASS")) throw new Error("QUALITY_GATE_INCOMPLETE");
  return manifest.qualityGateResults;
}

const primaryBefore = primarySnapshot();
const results = [];
fs.mkdirSync(evidenceDir, { recursive: true });
const executionOrder = [
  // DEV-100 remains a product CAPA child; DEV-097 anti-cheat integrity lanes
  // are historical and intentionally absent from trusted-solo completion.
  "qc:dev-100",
  ...registry.runnerCoverage.map((coverage) => coverage.npmScript),
  registry.qualityGateRunner.npmScript,
  ...regressionScripts
];

for (const script of executionOrder) {
  const result = script === "qc:dev-094:browser" ? runDev094BrowserWithStrictRetry() : runNpm(script);
  results.push(result);
  if (result.status !== "PASS") break;
}

const primaryAfter = primarySnapshot();
const primaryProtectedUnchanged = JSON.stringify(protectedPrimaryInvariant(primaryBefore)) === JSON.stringify(protectedPrimaryInvariant(primaryAfter));
const sourceAtEnd = sourceInfo(root);
const selectedChildren = manifestsForParent();
const selectedDev100Children = dev100ManifestsForParent();
let evidenceError = null;
let finalCaseResults = registry.currentDenominator.map((caseId) => ({ caseId, result: "NOT_RUN", requiredRunners: [], passedRunners: [] }));
let completionCandidate = false;
let dev100Validation = { status: "NOT_RUN", errorCode: null };
let qualityGateResults = registry.qualityGateCoverage.map((item) => ({ gateId: item.gateId, result: "NOT_RUN", detail: {} }));

try {
  if (sourceAtStart.dirtyBoundaryHash !== sourceAtEnd.dirtyBoundaryHash || sourceAtStart.head !== sourceAtEnd.head || sourceAtStart.branch !== sourceAtEnd.branch) throw new Error("SOURCE_CHANGED_DURING_AGGREGATE");
  if (!primaryProtectedUnchanged || primaryAfter.foreignKeyViolations !== 0 || Object.values(primaryAfter.rootReferenceViolations ?? {}).some((count) => count !== null && count !== 0)) throw new Error("PRIMARY_INVARIANT_CHANGED");
  const dev100 = selectDev100Child(selectedDev100Children.map((child) => child.parsed), runId);
  validateDev100AggregateManifest(root, dev100, { expectedParentRunId: runId, expectedSource: sourceAtEnd });
  dev100Validation = { status: "PASS", errorCode: null };
  if (results.length !== executionOrder.length || results.some((item) => item.status !== "PASS")) throw new Error("COMMAND_EXECUTION_INCOMPLETE");

  const laneManifests = [];
  for (const coverage of registry.runnerCoverage) {
    const lane = selectedChildren.filter((child) => child.parsed.runner === coverage.runner && child.parsed.gateStage === "product");
    if (lane.length !== 1) throw new Error(`PRODUCT_LANE_CARDINALITY:${coverage.runner}:${lane.length}`);
    validateTrustedSoloProductLane(lane[0].parsed, coverage);
    laneManifests.push(lane[0].parsed);
  }

  const qualityGateChildren = selectedChildren.filter((child) => child.parsed.runner === registry.qualityGateRunner.runner && child.parsed.gateStage === "product");
  if (qualityGateChildren.length !== 1) throw new Error(`QUALITY_GATE_CARDINALITY:${qualityGateChildren.length}`);
  qualityGateResults = validateQualityGateManifest(qualityGateChildren[0].parsed);

  finalCaseResults = registry.currentDenominator.map((caseId) => {
    const requiredRunners = registry.runnerCoverage.filter((coverage) => coverage.caseIds.includes(caseId)).map((coverage) => coverage.runner);
    const passedRunners = requiredRunners.filter((runner) => laneManifests.find((manifest) => manifest.runner === runner)?.caseResults.some((item) => item.caseId === caseId && item.result === "PASS"));
    return { caseId, result: requiredRunners.length > 0 && passedRunners.length === requiredRunners.length ? "PASS" : "NOT_RUN", requiredRunners, passedRunners };
  });
  if (finalCaseResults.some((item) => item.result !== "PASS")) throw new Error("CURRENT_DENOMINATOR_INCOMPLETE");
  completionCandidate = true;
} catch (error) {
  evidenceError = error instanceof Error ? error.message : String(error);
  if (dev100Validation.status !== "PASS" && evidenceError.startsWith("DEV100_")) {
    dev100Validation = { status: "FAIL", errorCode: evidenceError };
  }
}

const manifest = {
  schemaVersion: 2,
  devId: "DEV-087",
  historicalSupportingDevId: "DEV-097",
  runId,
  generatedAt: new Date().toISOString(),
  source: sourceAtEnd,
  registryHash: hashFile(registryPath),
  schemaHash: hashFile(manifestSchemaPath),
  oracleHash: hashFile(oraclePath),
  productionConnected: false,
  productionMigrationExecuted: false,
  status: completionCandidate ? "PASS" : "FAIL",
  completionCandidate,
  errorCode: completionCandidate ? null : (evidenceError ?? results.find((item) => item.status === "FAIL")?.script ?? "CURRENT_EVIDENCE_INCOMPLETE"),
  commandPlan: executionOrder,
  executed: results.length,
  results,
  currentDenominator: { expected: registry.currentDenominator.length, pass: finalCaseResults.filter((item) => item.result === "PASS").length, blocked: finalCaseResults.filter((item) => item.result === "BLOCKED").length, notRun: finalCaseResults.filter((item) => item.result === "NOT_RUN").length, fail: finalCaseResults.filter((item) => item.result === "FAIL").length },
  caseResults: finalCaseResults,
  qualityGates: { expected: 3, pass: qualityGateResults.filter((item) => item.result === "PASS").length, fail: qualityGateResults.filter((item) => item.result === "FAIL").length, notRun: qualityGateResults.filter((item) => item.result === "NOT_RUN").length, results: qualityGateResults },
  childManifests: selectedChildren.map((child) => artifactReference(root, child.path, child.parsed.runner ?? "unknown", child.parsed.caseResults?.map((item) => item.caseId) ?? [], child.parsed.result ?? "FAIL")),
  dev100Validation,
  dev100ChildManifest: selectedDev100Children.length === 1
    ? artifactReference(root, selectedDev100Children[0].path, "qc-dev-100-aggregate", selectedDev100Children[0].parsed.caseResults?.map((item) => item.caseId) ?? [], selectedDev100Children[0].parsed.status ?? "FAIL")
    : null,
  primaryInvariant: {
    before: primaryBefore,
    after: primaryAfter,
    unchanged: primaryProtectedUnchanged,
    rawHashUnchanged: primaryBefore.rawHash === primaryAfter.rawHash,
    rawHashDisposition: primaryBefore.rawHash === primaryAfter.rawHash ? "unchanged" : "observed_only_external_runtime_may_write"
  }
};
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runId, status: manifest.status, completionCandidate, errorCode: manifest.errorCode, executed: manifest.executed, expectedCommands: executionOrder.length, denominator: manifest.currentDenominator, manifest: path.join(evidenceDir, "manifest.json") }, null, 2));
if (!completionCandidate) process.exitCode = 1;
