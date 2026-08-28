#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

import {
  artifactReference,
  deriveAggregateCaseResults,
  DEV101_REGISTRY_PATH,
  hashFile,
  loadDev101Registry,
  scanProhibitedOracleImports,
  sha256,
  sourceInfo,
  validateIndependentChild,
  validateRegistry
} from "./dev-101-evidence-lib.mjs";

const root = process.cwd();
const runner = "qc-dev-101-independent-gate";
const runId = `DEV101-INDEPENDENT-GATE-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const parentRunId = process.env.DEV101_PARENT_RUN_ID?.trim() || runId;
const outputDir = path.resolve(process.env.DEV101_EVIDENCE_DIR?.trim() || path.join(root, "output", "qa", "dev-101-independent-gate", runId));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev101-independent-gate-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const primaryDbPath = path.join(root, "data", "ai-pdm.sqlite");
const registry = validateRegistry(root, loadDev101Registry(root));
const coverage = registry.runnerCoverage.find((item) => item.runner === runner);
if (!coverage) throw new Error("DEV101_GATE_COVERAGE_MISSING");

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

function execute(id, args, extraEnv = {}) {
  console.log(`RUN ${id}`);
  const execution = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 96 * 1024 * 1024,
    env: {
      ...process.env,
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      ...extraEnv
    }
  });
  process.stdout.write(execution.stdout || "");
  process.stderr.write(execution.stderr || "");
  const receipt = {
    id,
    command: [process.execPath, ...args],
    exitCode: execution.status,
    signal: execution.signal,
    stdout: execution.stdout || "",
    stderr: execution.stderr || "",
    stdoutSha256: sha256(execution.stdout || ""),
    stderrSha256: sha256(execution.stderr || "")
  };
  commandLog.push(receipt);
  return receipt;
}

function commandPassed(id, marker = null) {
  const receipt = commandLog.find((item) => item.id === id);
  return receipt?.exitCode === 0 && (!marker || receipt.stdout.includes(marker));
}

fs.mkdirSync(repositoryDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });
console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-101 independent regression, source, build, aggregate and anti-false-PASS gate",
  port: "none; isolated build has no listening server",
  owningProcessTree: `gate ${process.pid} -> one sequential command/build child at a time`,
  cleanupCondition: "all command children exit, isolated build removes its runtime project, gate removes its exact OS temp root",
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir,
  mutationScope: `${tempRoot}, ${outputDir}, and the build runner's declared task-owned runtime project; primary SQLite is query_only fingerprint source`
} }));

const sourceBefore = sourceInfo(root, registry.sourceBoundary);
const primaryBefore = primaryFingerprint();
const commandLog = [];
const loader = ["--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs"];
const priorManifestPaths = (() => {
  try {
    const parsed = JSON.parse(process.env.DEV101_PRIOR_MANIFESTS_JSON?.trim() || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
})();
const expectedPriorRunners = ["qc-dev-101-independent-data", "qc-dev-101-independent-browser", "qc-dev-101-independent-postgres"];
const priorManifests = [];
const childValidation = [];
for (let index = 0; index < expectedPriorRunners.length; index += 1) {
  const manifestPath = priorManifestPaths[index] ? path.resolve(root, priorManifestPaths[index]) : null;
  try {
    if (!manifestPath || !fs.existsSync(manifestPath)) throw new Error("MANIFEST_MISSING");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    validateIndependentChild({ root, registry, manifest, expectedRunner: expectedPriorRunners[index], expectedParentRunId: parentRunId, expectedSource: sourceBefore });
    priorManifests.push(manifest);
    childValidation.push({ runner: expectedPriorRunners[index], path: path.relative(root, manifestPath).replaceAll(path.sep, "/"), sha256: hashFile(manifestPath), status: "PASS" });
  } catch (error) {
    childValidation.push({ runner: expectedPriorRunners[index], path: manifestPath ? path.relative(root, manifestPath).replaceAll(path.sep, "/") : null, sha256: null, status: "FAIL", error: error instanceof Error ? error.message : String(error) });
  }
}

execute("dev101-contract", ["scripts/qc-dev-101-contract.mjs"]);
execute("dev090-contract", ["scripts/qc-dev-090-contract.mjs"]);
execute("dev090-repository", ["scripts/qc-dev-090-repository.mjs"]);
execute("typecheck-app", ["node_modules/typescript/bin/tsc", "-p", "tsconfig.app.json", "--noEmit", "--pretty", "false"]);
const lintFiles = registry.sourceBoundary.filter((relative) => /\.(?:mjs|ts|tsx)$/u.test(relative));
execute("affected-lint", ["node_modules/eslint/bin/eslint.js", ...lintFiles]);
execute("qa-integrity", ["scripts/qc-dev-101-qa-integrity.mjs"]);

const flagProbe = "const { reviewPackageV2WriteEnabled } = await import('./src/lib/pdm-review-package.ts'); console.log(JSON.stringify({ enabled: reviewPackageV2WriteEnabled(), raw: process.env.PDM_REVIEW_PACKAGE_V2_WRITE }));";
execute("flag-off-readback", [...loader, "--input-type=module", "--eval", flagProbe], { PDM_REVIEW_PACKAGE_V2_WRITE: "false" });
execute("flag-on-readback", [...loader, "--input-type=module", "--eval", flagProbe], { PDM_REVIEW_PACKAGE_V2_WRITE: "true" });

const buildOutputDir = path.join(outputDir, "supporting-build");
execute("isolated-build", ["scripts/qc-dev-101-build.mjs"], {
  DEV101_SUPPORT_RUN_ID: `${runId}-BUILD`,
  DEV101_SUPPORT_EVIDENCE_DIR: buildOutputDir
});
const buildReceiptPath = path.join(buildOutputDir, "receipt.json");
const buildReceipt = fs.existsSync(buildReceiptPath) ? JSON.parse(fs.readFileSync(buildReceiptPath, "utf8")) : null;

const reviewShell = fs.readFileSync(path.join(root, "src", "components", "canonical-review-package-workspace.tsx"), "utf8");
const targetAdapter = fs.readFileSync(path.join(root, "src", "components", "canonical-review-target-workspace.tsx"), "utf8");
const duplicationDetector = {
  shellHasDrawingRenderer: reviewShell.includes("CanonicalDrawingChangeWorkspace"),
  shellHasPartRenderer: reviewShell.includes("CanonicalChangeWorkspace"),
  targetDrawingImports: (targetAdapter.match(/CanonicalDrawingChangeWorkspace/gu) ?? []).length,
  targetPartImports: (targetAdapter.match(/CanonicalChangeWorkspace/gu) ?? []).length
};
const duplicationPass = !duplicationDetector.shellHasDrawingRenderer
  && !duplicationDetector.shellHasPartRenderer
  && duplicationDetector.targetDrawingImports >= 2
  && duplicationDetector.targetPartImports >= 2;

function parseFlag(id, expected) {
  const receipt = commandLog.find((item) => item.id === id);
  if (receipt?.exitCode !== 0) return false;
  try {
    const line = receipt.stdout.trim().split(/\r?\n/u).findLast((item) => item.startsWith("{"));
    const value = JSON.parse(line);
    return value.enabled === expected && value.raw === String(expected);
  } catch {
    return false;
  }
}

const browserManifest = priorManifests.find((item) => item.runner === "qc-dev-101-independent-browser");
const browserCase = (caseId) => browserManifest?.caseResults?.find((item) => item.caseId === caseId);
const browser033Pass = browserCase("QA-101-033")?.result === "PASS";
const browser041 = browserCase("QA-101-041");
const browser041Pass = browser041?.result === "PASS"
  && browser041.detail?.runtimeLedger?.length === 2
  && browser041.detail.runtimeLedger.every((item) => item.portReleased === true);
const browser042 = browserCase("QA-101-042");
const browser042Pass = browser042?.result === "PASS"
  && browser042.detail?.mutantDetected === true
  && browser042.detail?.directStillWorks === true;

const intendedGateManifest = {
  runner,
  caseResults: coverage.caseIds.map((caseId) => ({ caseId, result: "PASS" }))
};
const restoredAggregate = deriveAggregateCaseResults(registry, [...priorManifests, intendedGateManifest]);
let mutantAggregate = [];
if (browserManifest) {
  const mutantBrowser = structuredClone(browserManifest);
  const mutantCase = mutantBrowser.caseResults.find((item) => item.caseId === "QA-101-042");
  if (mutantCase) mutantCase.result = "FAIL";
  mutantAggregate = deriveAggregateCaseResults(registry, [...priorManifests.filter((item) => item.runner !== mutantBrowser.runner), mutantBrowser, intendedGateManifest]);
}
const aggregateRestoredPass = restoredAggregate.length === 48 && restoredAggregate.every((item) => item.result === "PASS");
const aggregateMutantFails = mutantAggregate.find((item) => item.caseId === "QA-101-042")?.result === "FAIL"
  && !mutantAggregate.every((item) => item.result === "PASS");

const tempPath = path.resolve(tempRoot);
const expectedTempPrefix = `${path.resolve(os.tmpdir())}${path.sep}`;
if (!tempPath.startsWith(expectedTempPrefix) || !path.basename(tempPath).startsWith("ai-pdm-dev101-independent-gate-")) {
  throw new Error(`DEV101_GATE_TEMP_PATH_UNSAFE:${tempPath}`);
}
fs.rmSync(tempPath, { recursive: true, force: true, maxRetries: 12, retryDelay: 200 });
const tempRemoved = !fs.existsSync(tempPath);
const primaryAfter = primaryFingerprint();
const sourceAfter = sourceInfo(root, registry.sourceBoundary);
const primaryUnchanged = primaryBefore.hash === primaryAfter.hash
  && primaryBefore.foreignKeys.length === 0
  && primaryAfter.foreignKeys.length === 0;
const sourceUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter);
const priorValidationPass = childValidation.length === 3 && childValidation.every((item) => item.status === "PASS");
const flagPass = parseFlag("flag-off-readback", false) && parseFlag("flag-on-readback", true) && browser041Pass;
const regressionPass = commandPassed("dev101-contract", "DEV-101 contract summary: 23/23 PASS")
  && commandPassed("dev090-contract", "PASS DEV-090 contract")
  && commandPassed("dev090-repository", "PASS DEV-090 repository")
  && browser033Pass;
const staticPass = commandPassed("typecheck-app")
  && commandPassed("affected-lint")
  && commandPassed("dev101-contract", "DEV101-CONTRACT-009")
  && duplicationPass;
const buildPass = commandPassed("isolated-build", "DEV-101 isolated build: PASS")
  && buildReceipt?.result === "PASS"
  && buildReceipt?.primaryInvariant?.unchanged === true
  && buildReceipt?.cleanup?.removed === true;
const integrityPass = commandPassed("qa-integrity") && priorValidationPass && aggregateRestoredPass;
const mutantPass = browser042Pass && aggregateMutantFails && aggregateRestoredPass;

const caseResults = [
  { caseId: "QA-101-033", result: regressionPass ? "PASS" : "FAIL", assertionIds: ["GENERIC-V1-RELATION-REGRESSION", "DEV090-OWNER-MATRIX-REGRESSION", "BROWSER-REGRESSION-CHILD-VERIFIED"], detail: { browser033Pass } },
  { caseId: "QA-101-034", result: staticPass ? "PASS" : "FAIL", assertionIds: ["TYPECHECK-ZERO", "AFFECTED-LINT-ZERO", "SHARED-RENDERER-DUPLICATION-DETECTOR"], detail: { duplicationDetector } },
  { caseId: "QA-101-036", result: buildPass && integrityPass && primaryUnchanged && sourceUnchanged && tempRemoved ? "PASS" : "FAIL", assertionIds: ["ISOLATED-BUILD", "CHILD-MANIFEST-HASH", "ANTI-FALSE-PASS-MUTANTS", "PRIMARY-SOURCE-INVARIANTS", "TASK-CLEANUP"], detail: { childValidation, buildReceipt } },
  { caseId: "QA-101-041", result: flagPass ? "PASS" : "FAIL", assertionIds: ["ACTUAL-FLAG-OFF-READBACK", "ACTUAL-FLAG-ON-READBACK", "PERSISTED-SCHEMA-BROWSER-CHILD"], detail: { browser041: browser041?.detail ?? null } },
  { caseId: "QA-101-042", result: mutantPass ? "PASS" : "FAIL", assertionIds: ["MISSING-ADAPTER-MUTANT-DETECTED", "MUTANT-AGGREGATE-FAILS", "RESTORED-AGGREGATE-PASSES"], detail: { browser042: browser042?.detail ?? null, mutantAggregateResult: mutantAggregate.find((item) => item.caseId === "QA-101-042")?.result ?? null } }
].map((item) => ({ ...item, firstFailurePointer: item.result === "PASS" ? null : `gate-evidence.json#/${item.caseId}` }));

const evidenceTypes = [...coverage.requiredEvidence];
const prohibitedOracleImports = scanProhibitedOracleImports(root, runner);
const evidencePath = path.join(outputDir, "gate-evidence.json");
const evidence = {
  source: { before: sourceBefore, after: sourceAfter, unchanged: sourceUnchanged },
  primary: { before: primaryBefore, after: primaryAfter, unchanged: primaryUnchanged },
  childValidation,
  commandLog,
  duplicationDetector,
  buildReceipt,
  runtimeFlag: { off: parseFlag("flag-off-readback", false), on: parseFlag("flag-on-readback", true), browser041Pass },
  mutantReceipt: { browser042Pass, aggregateMutantFails, aggregateRestoredPass, mutantCase: mutantAggregate.find((item) => item.caseId === "QA-101-042") ?? null },
  cleanup: { tempRoot, tempRemoved }
};
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
const artifact = artifactReference(root, evidencePath, coverage.caseIds, evidenceTypes);
const caseEvidence = Object.fromEntries(coverage.caseIds.map((caseId) => [caseId, { evidenceTypes, artifactPaths: [artifact.path] }]));
const result = caseResults.every((item) => item.result === "PASS") && prohibitedOracleImports.length === 0 ? "PASS" : "FAIL";
const firstFailure = caseResults.find((item) => item.result !== "PASS")?.firstFailurePointer
  ?? (prohibitedOracleImports.length ? "prohibitedOracleImports" : null);
const manifest = {
  schemaVersion: 1,
  devId: "DEV-101",
  runId,
  parentRunId,
  runner,
  independentQc: true,
  source: sourceBefore,
  environment: { provider: "mixed", dataScope: "task-owned-isolated", priorManifestCount: priorManifests.length },
  registryHash: hashFile(path.join(root, DEV101_REGISTRY_PATH)),
  runnerHash: hashFile(path.join(root, "scripts", `${runner}.mjs`)),
  caseResults,
  caseEvidence,
  artifacts: [artifact],
  prohibitedOracleImports,
  primaryInvariant: { before: primaryBefore.hash, after: primaryAfter.hash, unchanged: primaryUnchanged },
  cleanupReceipt: { complete: tempRemoved, portsReleased: true, processesStopped: true, tempRemoved },
  visibleErrorAudit: { required: false, consoleErrors: 0, pageErrors: 0, requestFailures: 0, unexpectedRequestFailures: 0, visibleErrorCount: 0 },
  result,
  firstFailure
};
const manifestPath = path.join(outputDir, "manifest.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
for (const item of caseResults) console.log(`${item.result} ${item.caseId}`);
console.log(JSON.stringify({ runId, result, denominator: { expected: 5, pass: caseResults.filter((item) => item.result === "PASS").length, fail: caseResults.filter((item) => item.result === "FAIL").length, blocked: 0, notRun: 0 }, firstFailure, manifest: path.relative(root, manifestPath).replaceAll(path.sep, "/") }, null, 2));
if (result !== "PASS") process.exitCode = 1;
