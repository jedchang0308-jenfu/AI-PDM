#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import {
  artifactReference,
  canonicalHash,
  canonicalJson,
  DEV101_REGISTRY_PATH,
  DEV101_SCHEMA_PATH,
  hashFile,
  loadDev101Registry,
  readJson,
  sha256,
  sourceInfo,
  validateIndependentChild,
  validateRegistry
} from "./dev-101-evidence-lib.mjs";

const root = process.cwd();
const runId = `DEV101-QA-INTEGRITY-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-101-qa-integrity", runId);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev101-qa-integrity-"));
const syntheticRoot = path.join(tempRoot, "synthetic-project");
const registryPath = path.join(root, DEV101_REGISTRY_PATH);
const schemaPath = path.join(root, DEV101_SCHEMA_PATH);
const primaryDbPath = path.join(root, "data", "ai-pdm.sqlite");

function clone(value) {
  return structuredClone(value);
}

function primaryFingerprint() {
  if (!fs.existsSync(primaryDbPath)) return { hash: sha256("DEV101_PRIMARY_SQLITE_ABSENT"), foreignKeys: [] };
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

function expectFailure(id, expectedCode, execute, detections) {
  try {
    execute();
    detections.push({ id, status: "FAIL", expectedCode, actualCode: null });
  } catch (error) {
    const actualCode = error instanceof Error ? error.message : String(error);
    detections.push({ id, status: actualCode.startsWith(expectedCode) ? "PASS" : "FAIL", expectedCode, actualCode });
  }
}

function validateSchemaContract(schema) {
  const required = new Set(schema?.required ?? []);
  for (const key of [
    "schemaVersion", "devId", "runId", "parentRunId", "runner", "independentQc", "source", "environment", "registryHash",
    "runnerHash", "caseResults", "caseEvidence", "artifacts", "prohibitedOracleImports", "primaryInvariant", "cleanupReceipt",
    "visibleErrorAudit", "result", "firstFailure"
  ]) if (!required.has(key)) throw new Error(`DEV101_SCHEMA_REQUIRED_FIELD_MISSING:${key}`);
  if (schema.properties?.prohibitedOracleImports?.maxItems !== 0) throw new Error("DEV101_SCHEMA_ORACLE_IMPORT_GATE_MISSING");
  if (schema.properties?.environment?.properties?.dataScope?.const !== "task-owned-isolated") throw new Error("DEV101_SCHEMA_DATA_SCOPE_GATE_MISSING");
  if (schema.properties?.cleanupReceipt?.properties?.complete?.const !== true) throw new Error("DEV101_SCHEMA_CLEANUP_GATE_MISSING");
  return true;
}

function prepareSyntheticProject(registry) {
  fs.mkdirSync(path.join(syntheticRoot, ".ai-doc", "qa"), { recursive: true });
  fs.mkdirSync(path.join(syntheticRoot, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(syntheticRoot, "artifacts"), { recursive: true });
  for (const relative of registry.sourceBoundary) {
    const target = path.join(syntheticRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, relative), target);
  }
  for (const coverage of registry.runnerCoverage) {
    fs.writeFileSync(path.join(syntheticRoot, "scripts", `${coverage.runner}.mjs`), `export const runner = ${JSON.stringify(coverage.runner)};\n`, "utf8");
  }
}

function buildSyntheticManifest(registry, coverage, parentRunId, source) {
  const evidencePath = path.join(syntheticRoot, "artifacts", `${coverage.runner}.json`);
  fs.writeFileSync(evidencePath, `${JSON.stringify({ syntheticValidatorFixture: true, runner: coverage.runner, caseIds: coverage.caseIds }, null, 2)}\n`, "utf8");
  const artifact = artifactReference(syntheticRoot, evidencePath, coverage.caseIds, coverage.requiredEvidence);
  return {
    schemaVersion: 1,
    devId: "DEV-101",
    runId: `synthetic-${coverage.runner}`,
    parentRunId,
    runner: coverage.runner,
    independentQc: true,
    source,
    environment: { provider: coverage.provider, dataScope: "task-owned-isolated" },
    registryHash: hashFile(path.join(syntheticRoot, DEV101_REGISTRY_PATH)),
    runnerHash: hashFile(path.join(syntheticRoot, "scripts", `${coverage.runner}.mjs`)),
    caseResults: coverage.caseIds.map((caseId) => ({ caseId, result: "PASS", assertionIds: [`${caseId}-A01`], firstFailurePointer: null })),
    caseEvidence: Object.fromEntries(coverage.caseIds.map((caseId) => [caseId, { evidenceTypes: [...coverage.requiredEvidence], artifactPaths: [artifact.path] }])),
    artifacts: [artifact],
    prohibitedOracleImports: [],
    primaryInvariant: { before: "a".repeat(64), after: "a".repeat(64), unchanged: true },
    cleanupReceipt: { complete: true, portsReleased: true, processesStopped: true, tempRemoved: true },
    visibleErrorAudit: { required: coverage.runner === "qc-dev-101-independent-browser", consoleErrors: 0, pageErrors: 0, requestFailures: 0, unexpectedRequestFailures: 0, visibleErrorCount: 0 },
    result: "PASS",
    firstFailure: null
  };
}

const primaryBefore = primaryFingerprint();
const sourceBefore = sourceInfo(root, loadDev101Registry(root).sourceBoundary);
const detections = [];
let registry = null;
let schema = null;
let runError = null;
let syntheticManifests = [];

console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-101 QA evidence-contract and anti-false-PASS integrity test",
  port: "none",
  owningProcessTree: `single Node process ${process.pid}; no child app, browser, database server or worker`,
  cleanupCondition: "synthetic task-owned temp project removed; process exits; primary/source fingerprints unchanged",
  PDM_DATA_DIR: "none; primary SQLite is fingerprinted query_only when present, otherwise absence is fingerprinted",
  PDM_REPOSITORY_DIR: "none; repository is not read or mutated",
  mutationScope: `${outputDir} plus task-owned synthetic temp ${tempRoot}`
} }));

try {
  registry = validateRegistry(root, loadDev101Registry(root));
  schema = readJson(schemaPath);
  validateSchemaContract(schema);
  const canonicalChecks = [
    canonicalJson({ b: 2, a: 1 }) === canonicalJson({ a: 1, b: 2 }),
    canonicalJson({ at: new Date("2026-08-27T00:00:00.000Z") }) === "{\"at\":\"2026-08-27T00:00:00.000Z\"}",
    canonicalHash({ recognition: { fields: [{ value: "A" }] } }) !== canonicalHash({ recognition: { fields: [{ value: "B" }] } })
  ];
  if (!canonicalChecks.every(Boolean)) throw new Error("DEV101_INDEPENDENT_CANONICAL_ORACLE_INVALID");

  prepareSyntheticProject(registry);
  const syntheticSource = { head: "synthetic-head", branch: "synthetic", dirtyBoundaryHash: "b".repeat(64) };
  const parentRunId = "synthetic-parent";
  syntheticManifests = registry.runnerCoverage.map((coverage) => buildSyntheticManifest(registry, coverage, parentRunId, syntheticSource));
  for (const manifest of syntheticManifests) {
    validateIndependentChild({ root: syntheticRoot, registry, manifest, expectedRunner: manifest.runner, expectedParentRunId: parentRunId, expectedSource: syntheticSource });
  }

  const dataBase = syntheticManifests.find((item) => item.runner === "qc-dev-101-independent-data");
  const browserBase = syntheticManifests.find((item) => item.runner === "qc-dev-101-independent-browser");
  const postgresBase = syntheticManifests.find((item) => item.runner === "qc-dev-101-independent-postgres");

  const duplicateRegistry = clone(registry); duplicateRegistry.cases.push(clone(duplicateRegistry.cases[0]));
  expectFailure("CASE_DUPLICATE", "DEV101_CASE_REGISTRY_INVALID", () => validateRegistry(syntheticRoot, duplicateRegistry), detections);
  const missingRegistry = clone(registry); missingRegistry.fixedDenominator = missingRegistry.fixedDenominator.slice(1);
  expectFailure("CASE_MISSING", "DEV101_FIXED_DENOMINATOR_INVALID", () => validateRegistry(syntheticRoot, missingRegistry), detections);
  const extraRegistry = clone(registry); extraRegistry.cases.push({ caseId: "QA-101-049", title: "extra", risk: "P1", requiredRunners: [extraRegistry.runnerCoverage[0].runner] });
  expectFailure("CASE_EXTRA", "DEV101_CASE_REGISTRY_INVALID", () => validateRegistry(syntheticRoot, extraRegistry), detections);
  const coverageGap = clone(registry); coverageGap.runnerCoverage[0].caseIds = coverageGap.runnerCoverage[0].caseIds.filter((caseId) => caseId !== "QA-101-001");
  expectFailure("RUNNER_COVERAGE_GAP", "DEV101_CASE_RUNNER_TRACE_MISSING", () => validateRegistry(syntheticRoot, coverageGap), detections);

  const selfLabelled = clone(dataBase); selfLabelled.caseEvidence = {};
  expectFailure("SELF_LABELLED_PASS", "DEV101_CASE_EVIDENCE_MISSING", () => validateIndependentChild({ root: syntheticRoot, registry, manifest: selfLabelled, expectedRunner: selfLabelled.runner, expectedParentRunId: parentRunId, expectedSource: syntheticSource }), detections);
  const wrongSource = clone(dataBase); wrongSource.source.dirtyBoundaryHash = "c".repeat(64);
  expectFailure("SOURCE_FINGERPRINT_MISMATCH", "DEV101_SOURCE_FINGERPRINT_MISMATCH", () => validateIndependentChild({ root: syntheticRoot, registry, manifest: wrongSource, expectedRunner: wrongSource.runner, expectedParentRunId: parentRunId, expectedSource: syntheticSource }), detections);
  const wrongParent = clone(dataBase); wrongParent.parentRunId = "stale-parent";
  expectFailure("PARENT_RUN_MISMATCH", "DEV101_PARENT_RUN_MISMATCH", () => validateIndependentChild({ root: syntheticRoot, registry, manifest: wrongParent, expectedRunner: wrongParent.runner, expectedParentRunId: parentRunId, expectedSource: syntheticSource }), detections);
  const badArtifactHash = clone(dataBase); badArtifactHash.artifacts[0].sha256 = "0".repeat(64);
  expectFailure("ARTIFACT_HASH_MISMATCH", "DEV101_ARTIFACT_HASH_MISMATCH", () => validateIndependentChild({ root: syntheticRoot, registry, manifest: badArtifactHash, expectedRunner: badArtifactHash.runner, expectedParentRunId: parentRunId, expectedSource: syntheticSource }), detections);

  const directUrlOnly = clone(browserBase);
  directUrlOnly.caseEvidence["QA-101-037"].evidenceTypes = directUrlOnly.caseEvidence["QA-101-037"].evidenceTypes.filter((item) => item !== "normal_entry");
  expectFailure("DIRECT_URL_ONLY", "DEV101_CASE_EVIDENCE_TYPE_MISSING", () => validateIndependentChild({ root: syntheticRoot, registry, manifest: directUrlOnly, expectedRunner: directUrlOnly.runner, expectedParentRunId: parentRunId, expectedSource: syntheticSource }), detections);
  const sqliteAsPostgres = clone(postgresBase); sqliteAsPostgres.environment.provider = "sqlite";
  expectFailure("SQLITE_AS_POSTGRES", "DEV101_PROVIDER_OR_DATA_SCOPE_MISMATCH", () => validateIndependentChild({ root: syntheticRoot, registry, manifest: sqliteAsPostgres, expectedRunner: sqliteAsPostgres.runner, expectedParentRunId: parentRunId, expectedSource: syntheticSource }), detections);
  const noGeometry = clone(browserBase); noGeometry.caseEvidence["QA-101-031"].evidenceTypes = noGeometry.caseEvidence["QA-101-031"].evidenceTypes.filter((item) => item !== "geometry");
  expectFailure("VISIBLE_EVIDENCE_INCOMPLETE", "DEV101_CASE_EVIDENCE_TYPE_MISSING", () => validateIndependentChild({ root: syntheticRoot, registry, manifest: noGeometry, expectedRunner: noGeometry.runner, expectedParentRunId: parentRunId, expectedSource: syntheticSource }), detections);
  const sutImport = clone(dataBase); sutImport.prohibitedOracleImports = ["src/lib/pdm-review-package.ts"];
  expectFailure("SUT_ORACLE_IMPORT", "DEV101_SUT_ORACLE_IMPORT", () => validateIndependentChild({ root: syntheticRoot, registry, manifest: sutImport, expectedRunner: sutImport.runner, expectedParentRunId: parentRunId, expectedSource: syntheticSource }), detections);
  const noCleanup = clone(dataBase); noCleanup.cleanupReceipt.tempRemoved = false;
  expectFailure("CLEANUP_INCOMPLETE", "DEV101_CLEANUP_INCOMPLETE", () => validateIndependentChild({ root: syntheticRoot, registry, manifest: noCleanup, expectedRunner: noCleanup.runner, expectedParentRunId: parentRunId, expectedSource: syntheticSource }), detections);
  const visibleError = clone(browserBase); visibleError.visibleErrorAudit.visibleErrorCount = 1;
  expectFailure("VISIBLE_ERROR_MASKED", "DEV101_VISIBLE_ERROR_AUDIT_FAILED", () => validateIndependentChild({ root: syntheticRoot, registry, manifest: visibleError, expectedRunner: visibleError.runner, expectedParentRunId: parentRunId, expectedSource: syntheticSource }), detections);
  const shrunken = clone(registry); shrunken.fixedDenominator = shrunken.fixedDenominator.slice(0, 47); shrunken.cases = shrunken.cases.slice(0, 47);
  expectFailure("FIXED_DENOMINATOR_SHRUNK", "DEV101_FIXED_DENOMINATOR_INVALID", () => validateRegistry(syntheticRoot, shrunken), detections);
  const provenanceMismatch = clone(dataBase);
  const firstCaseId = provenanceMismatch.caseResults[0].caseId;
  provenanceMismatch.artifacts[0].caseIds = provenanceMismatch.artifacts[0].caseIds.filter((caseId) => caseId !== firstCaseId);
  expectFailure("EVIDENCE_PROVENANCE_MISMATCH", "DEV101_CASE_ARTIFACT_TRACE_MISSING", () => validateIndependentChild({ root: syntheticRoot, registry, manifest: provenanceMismatch, expectedRunner: provenanceMismatch.runner, expectedParentRunId: parentRunId, expectedSource: syntheticSource }), detections);
} catch (error) {
  runError = error;
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 12, retryDelay: 200 });
}

const primaryAfter = primaryFingerprint();
const sourceAfter = sourceInfo(root, registry?.sourceBoundary ?? loadDev101Registry(root).sourceBoundary);
const primaryUnchanged = primaryBefore.hash === primaryAfter.hash && primaryBefore.foreignKeys.length === 0 && primaryAfter.foreignKeys.length === 0;
const sourceUnchanged = sourceBefore.head === sourceAfter.head && sourceBefore.branch === sourceAfter.branch && sourceBefore.dirtyBoundaryHash === sourceAfter.dirtyBoundaryHash;
const tempRemoved = !fs.existsSync(tempRoot);
const allMutantsDetected = detections.length === 16 && detections.every((item) => item.status === "PASS");
const result = !runError && allMutantsDetected && primaryUnchanged && sourceUnchanged && tempRemoved ? "PASS" : "FAIL";
const manifest = {
  schemaVersion: 1,
  devId: "DEV-101",
  runId,
  runner: "qc-dev-101-qa-integrity",
  evidenceClass: "QA_INFRASTRUCTURE_ONLY_NO_FIXED_CASE_PASS",
  fixedCaseClaims: 0,
  result,
  registry: registry ? { path: DEV101_REGISTRY_PATH, sha256: hashFile(registryPath), caseCount: registry.fixedDenominator.length } : null,
  schema: schema ? { path: DEV101_SCHEMA_PATH, sha256: hashFile(schemaPath), validated: true } : null,
  canonicalOracle: { independentModule: "scripts/dev-101-evidence-lib.mjs", prohibitedProductHelperImports: true },
  syntheticChildContractChecks: syntheticManifests.map((item) => ({ runner: item.runner, caseCount: item.caseResults.length, status: "PASS" })),
  mutantDetections: detections,
  primaryInvariant: { before: primaryBefore.hash, after: primaryAfter.hash, unchanged: primaryUnchanged, foreignKeysBefore: primaryBefore.foreignKeys.length, foreignKeysAfter: primaryAfter.foreignKeys.length },
  sourceInvariant: { before: sourceBefore, after: sourceAfter, unchanged: sourceUnchanged },
  cleanupReceipt: { complete: tempRemoved, portsReleased: true, processesStopped: true, tempRemoved },
  productionWrites: false,
  firstFailure: runError instanceof Error ? runError.message : runError ? String(runError) : detections.find((item) => item.status !== "PASS")?.id ?? null,
  completedAt: new Date().toISOString()
};
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
for (const item of detections) console.log(`${item.status} DEV101-QA-INTEGRITY-${item.id} ${item.actualCode ?? "not detected"}`);
console.log(JSON.stringify({ runId, result, registryCases: registry?.fixedDenominator.length ?? 0, mutants: `${detections.filter((item) => item.status === "PASS").length}/${detections.length}`, fixedCaseClaims: 0, manifest: path.relative(root, path.join(outputDir, "manifest.json")).replaceAll(path.sep, "/") }, null, 2));
if (result !== "PASS") process.exitCode = 1;
