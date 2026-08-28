#!/usr/bin/env node

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

import {
  artifactReference,
  canonicalHash,
  DEV101_REGISTRY_PATH,
  hashFile,
  loadDev101Registry,
  scanProhibitedOracleImports,
  sha256,
  sourceInfo,
  validateRegistry
} from "./dev-101-evidence-lib.mjs";

const root = process.cwd();
const runner = "qc-dev-101-independent-postgres";
const runId = `DEV101-INDEPENDENT-POSTGRES-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const parentRunId = process.env.DEV101_PARENT_RUN_ID?.trim() || runId;
const outputDir = path.resolve(process.env.DEV101_EVIDENCE_DIR?.trim() || path.join(root, "output", "qa", "dev-101-independent-postgres", runId));
const supportOutputDir = path.join(outputDir, "supporting-postgres");
const primaryDbPath = path.join(root, "data", "ai-pdm.sqlite");
const registry = validateRegistry(root, loadDev101Registry(root));
const coverage = registry.runnerCoverage.find((item) => item.runner === runner);
if (!coverage) throw new Error("DEV101_POSTGRES_COVERAGE_MISSING");

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

function portAccepting(port) {
  return new Promise((resolve) => {
    if (!Number.isInteger(port) || port <= 0) return resolve(false);
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const done = (value) => { socket.destroy(); resolve(value); };
    socket.setTimeout(1_000, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

function commandReceipt(command, args, execution) {
  return {
    command: [command, ...args],
    exitCode: execution.status,
    signal: execution.signal,
    stdoutSha256: sha256(execution.stdout || ""),
    stderrSha256: sha256(execution.stderr || "")
  };
}

fs.mkdirSync(outputDir, { recursive: true });
const sourceBefore = sourceInfo(root, registry.sourceBoundary);
const primaryBefore = primaryFingerprint();
const postgresBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
const postgresExe = path.join(postgresBin, "postgres.exe");
const versionExecution = spawnSync(postgresExe, ["--version"], { cwd: root, encoding: "utf8", windowsHide: true });

console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-101 independent PostgreSQL provider, projection hash and concurrency oracle",
  port: "allocated and declared by the child before PostgreSQL starts; exact port is independently checked after stop",
  owningProcessTree: `independent runner ${process.pid} -> qc-dev-101-postgres -> task-owned PostgreSQL cluster`,
  cleanupCondition: "child clients close, pg_ctl stops the exact task cluster, its port is released and task root is removed",
  PDM_DATA_DIR: "child-declared task-owned isolated data directory",
  PDM_REPOSITORY_DIR: "child-declared task-owned isolated repository directory",
  mutationScope: `${supportOutputDir} plus child-declared OS temp root; primary SQLite is query_only fingerprint source`
} }));

const childArgs = [
  "--experimental-transform-types",
  "--experimental-loader",
  "./scripts/qc-ts-path-loader.mjs",
  "scripts/qc-dev-101-postgres.mjs"
];
const childExecution = spawnSync(process.execPath, childArgs, {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 96 * 1024 * 1024,
  env: {
    ...process.env,
    DEV101_SUPPORT_RUN_ID: `${runId}-SUPPORT`,
    DEV101_SUPPORT_EVIDENCE_DIR: supportOutputDir
  }
});
process.stdout.write(childExecution.stdout || "");
process.stderr.write(childExecution.stderr || "");

const supportReceiptPath = path.join(supportOutputDir, "receipt.json");
const supportReceipt = fs.existsSync(supportReceiptPath) ? JSON.parse(fs.readFileSync(supportReceiptPath, "utf8")) : null;
const checks = Array.isArray(supportReceipt?.checks) ? supportReceipt.checks : [];
const checkMap = new Map(checks.map((item) => [item.id, item]));
const expectedCheckIds = Array.from({ length: 10 }, (_, index) => `DEV101-PG-${String(index).padStart(3, "0")}`);
const exactChecksPass = checks.length === expectedCheckIds.length
  && expectedCheckIds.every((id, index) => checks[index]?.id === id && checks[index]?.status === "PASS");
const version = `${versionExecution.stdout || ""}${versionExecution.stderr || ""}`.trim();
const providerPass = versionExecution.status === 0 && /^postgres \(PostgreSQL\) \d+/u.test(version);
const projection = checkMap.get("DEV101-PG-005")?.detail?.recognitionProjection;
const projectionBody = projection && typeof projection === "object"
  ? Object.fromEntries(Object.entries(projection).filter(([key]) => key !== "projectionHash"))
  : null;
const independentProjectionHash = projectionBody ? canonicalHash(projectionBody) : null;
const projectionHashPass = Boolean(projection?.projectionHash) && projection.projectionHash === independentProjectionHash;
const concurrencyCounts = checkMap.get("DEV101-PG-006")?.detail?.counts;
const concurrencyPass = checkMap.get("DEV101-PG-006")?.status === "PASS"
  && JSON.stringify(concurrencyCounts) === JSON.stringify({ active_request: 0, terminal_receipt: 1, trace: 1, approved_snapshot: 1, work: 0 });
const childPort = Number(supportReceipt?.runtime?.port);
const portReleased = Number.isInteger(childPort) && childPort > 0 && !(await portAccepting(childPort));
const childTempRoot = supportReceipt?.runtime?.taskRoot;
const tempRemoved = typeof childTempRoot === "string" && childTempRoot.length > 0 && !fs.existsSync(childTempRoot);
const primaryAfter = primaryFingerprint();
const sourceAfter = sourceInfo(root, registry.sourceBoundary);
const primaryUnchanged = primaryBefore.hash === primaryAfter.hash
  && primaryBefore.foreignKeys.length === 0
  && primaryAfter.foreignKeys.length === 0;
const sourceUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter);
const prohibitedOracleImports = scanProhibitedOracleImports(root, runner);

const caseResults = [
  {
    caseId: "QA-101-035",
    result: providerPass && exactChecksPass && primaryUnchanged && sourceUnchanged && portReleased && tempRemoved && childExecution.status === 0 ? "PASS" : "FAIL",
    assertionIds: ["REAL-POSTGRES-PROVIDER", "FULL-SCHEMA-RESTORE", "INBOX-SEMANTIC-PARITY", "PRODUCT-JOURNEY", "POSTGRES-FK-CLEAN", "TASK-RUNTIME-CLEANUP"],
    firstFailurePointer: null,
    detail: { version, childExitCode: childExecution.status, expectedCheckIds, actualChecks: checks.map((item) => ({ id: item.id, status: item.status })), childPort, childTempRoot }
  },
  {
    caseId: "QA-101-048",
    result: projectionHashPass && concurrencyPass && exactChecksPass ? "PASS" : "FAIL",
    assertionIds: ["POSTGRES-CANONICAL-PROJECTION", "POSTGRES-INNER-HASH-INDEPENDENT", "POSTGRES-CONCURRENCY-ONE-EFFECT"],
    firstFailurePointer: null,
    detail: { projectionHash: projection?.projectionHash ?? null, independentProjectionHash, concurrencyCounts }
  }
];
for (const item of caseResults) {
  if (item.result !== "PASS") item.firstFailurePointer = `postgres-evidence.json#/${item.caseId}`;
}

const evidenceTypes = [...coverage.requiredEvidence];
const evidencePath = path.join(outputDir, "postgres-evidence.json");
const evidence = {
  provider: { binary: postgresExe, version, command: commandReceipt(postgresExe, ["--version"], versionExecution) },
  child: commandReceipt(process.execPath, childArgs, childExecution),
  supportReceipt,
  independentOracle: { projectionHashPass, independentProjectionHash, concurrencyPass, exactChecksPass },
  primary: { before: primaryBefore, after: primaryAfter, unchanged: primaryUnchanged },
  source: { before: sourceBefore, after: sourceAfter, unchanged: sourceUnchanged },
  cleanup: { portReleased, childPort, tempRemoved, childTempRoot }
};
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
const artifact = artifactReference(root, evidencePath, coverage.caseIds, evidenceTypes);
const caseEvidence = Object.fromEntries(coverage.caseIds.map((caseId) => [caseId, { evidenceTypes, artifactPaths: [artifact.path] }]));
const result = caseResults.every((item) => item.result === "PASS") && prohibitedOracleImports.length === 0 ? "PASS" : "FAIL";
const firstFailure = caseResults.find((item) => item.result !== "PASS")?.firstFailurePointer
  ?? (prohibitedOracleImports.length ? "prohibitedOracleImports" : null);
const cleanupReceipt = {
  complete: portReleased && tempRemoved,
  portsReleased: portReleased,
  processesStopped: portReleased,
  tempRemoved
};
const manifest = {
  schemaVersion: 1,
  devId: "DEV-101",
  runId,
  parentRunId,
  runner,
  independentQc: true,
  source: sourceBefore,
  environment: { provider: "postgresql", dataScope: "task-owned-isolated", postgresVersion: version },
  registryHash: hashFile(path.join(root, DEV101_REGISTRY_PATH)),
  runnerHash: hashFile(path.join(root, "scripts", `${runner}.mjs`)),
  caseResults,
  caseEvidence,
  artifacts: [artifact],
  prohibitedOracleImports,
  primaryInvariant: { before: primaryBefore.hash, after: primaryAfter.hash, unchanged: primaryUnchanged },
  cleanupReceipt,
  visibleErrorAudit: { required: false, consoleErrors: 0, pageErrors: 0, requestFailures: 0, unexpectedRequestFailures: 0, visibleErrorCount: 0 },
  result,
  firstFailure
};
const manifestPath = path.join(outputDir, "manifest.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
for (const item of caseResults) console.log(`${item.result} ${item.caseId}`);
console.log(JSON.stringify({ runId, result, denominator: { expected: 2, pass: caseResults.filter((item) => item.result === "PASS").length, fail: caseResults.filter((item) => item.result === "FAIL").length, blocked: 0, notRun: 0 }, firstFailure, manifest: path.relative(root, manifestPath).replaceAll(path.sep, "/") }, null, 2));
if (result !== "PASS") process.exitCode = 1;
