#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  oracleAffectedParts,
  oracleObsoleteFingerprint,
  oracleTaskOrder,
  oracleGroupedCursor
} from "./qc-dev-087-reference-oracles.mjs";
import {
  artifactReference,
  DEV087_MANIFEST_SCHEMA_VERSION,
  DEV087_SOURCE_FINGERPRINT_VERSION,
  hashFile,
  manifestBase,
  readJson,
  safeArtifactPath,
  sha256,
  sourceInfo,
  validateArtifactReferences,
  validateBasicManifest,
  validateLaneRosterAndEvidence,
  writeCapabilityManifest
} from "./dev-087-evidence-lib.mjs";
import {
  DEV100_CASE_IDS,
  DEV100_REQUIRED_RUNNERS,
  selectDev100Child,
  validateDev100ManifestEnvelope
} from "./dev-100-evidence-lib.mjs";

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, ".ai-doc", "qa", "dev-087-current-case-registry.json");
const ROSTER_SUPERSESSION_PATH = path.join(ROOT, ".ai-doc", "qa", "dev-087-case-roster-supersession.json");
const ORACLE_PATH = path.join(ROOT, "scripts", "qc-dev-087-reference-oracles.mjs");
const RUNNER_PATH = path.join(ROOT, "scripts", "qc-dev-087-qa-integrity.mjs");
const MANIFEST_SCHEMA_PATH = path.join(ROOT, ".ai-doc", "qa", "dev-087-capability-manifest.schema.json");
const OUTPUT_ROOT = path.join("output", "qa", "dev-087-capability");
const EXPECTED_DENOMINATOR_HASH = "e38178c338c11f56189895645dd80176dc13cb2fcb52e6d186612f842412593d";
const EXPECTED_RUNNER_COVERAGE_HASH = "87d84e49140d829aecaf09b22681b499d45a8228319e98e9cd24a4e2fa44ea1f";
const EXPECTED_INTEGRITY_COVERAGE_HASH = "108d3761daf5f41535295f097448698d1dbb521f362273e4de49bf7f0bd7f85a";
const EXPECTED_G4_REQUIREMENTS_HASH = "bf1873c4e03a20a4065c646713488cf94b984c3f31c969503d5d9535f6f4a245";

const MUTANTS = [
  ["M01", "CASE_ID_DUPLICATE", (registry) => ({ ...registry, cases: [...registry.cases, registry.cases[0]] })],
  ["M02", "CASE_ROSTER_OR_TRACE_INCOMPLETE", (registry) => ({ ...registry, currentDenominator: registry.currentDenominator.slice(1) })],
  ["M03", "FIXTURE_PROVENANCE_INVALID", (registry) => ({ ...registry, cases: registry.cases.map((item) => item.caseId === "QA-087-221" ? { ...item, fixtureOrigin: "ui_created", allowedClaims: ["full_lifecycle"] } : item) })],
  ["M04", "ORACLE_NOT_INDEPENDENT_OR_INSENSITIVE", () => ({ oracleImport: "src/lib/pdm-canonical-workbench.ts", knownWrongAccepted: true })],
  ["M05", "CURRENT_EVIDENCE_INCOMPLETE", (registry) => ({ ...registry, runnerCoverage: registry.runnerCoverage.map((coverage, index) => index === 0 ? { ...coverage, caseIds: coverage.caseIds.slice(1) } : coverage) })],
  ["M06", "CHILD_ARTIFACT_HASH_MISMATCH", () => ({ artifactHash: "0".repeat(64), actualHash: "f".repeat(64) })],
  ["M07", "PROHIBITED_MUTATION", () => ({ prohibitedMutationAudit: { directApiWrites: 1, sqlWrites: 0, pageEvaluateWrites: 0, unprovenancedWrites: 0 } })],
  ["M08", "PROVIDER_EVIDENCE_MISMATCH", () => ({ manifestProvider: "postgresql", receiptProvider: "sqlite" })],
  ["M09", "ACTION_URL_NOT_SAME_ORIGIN", () => ({ actionUrl: "https://evil.example/redirect" })],
  ["M10", "VISIBLE_EVIDENCE_INCOMPLETE", () => ({ visibleEvidence: { fullPage: true, viewport: null, geometry: null, accessibility: null } })],
  ["M11", "EVIDENCE_PROVENANCE_MISMATCH", () => ({ checkpoint: { sourceFingerprint: "a", fixtureId: "one" }, reused: { sourceFingerprint: "b", fixtureId: "two" } })],
  ["M12", "CLEANUP_INCOMPLETE", () => ({ cleanupReceipt: { status: "missing", taskOwnedRuntime: true, portsReleased: false } })]
];

function assertRegistry(registry) {
  if (registry.schemaVersion !== 2 || registry.registryId !== "DEV-087-current-case-registry") throw new Error("REGISTRY_SCHEMA_INVALID");
  if (sha256(JSON.stringify(registry.currentDenominator)) !== EXPECTED_DENOMINATOR_HASH) throw new Error("CASE_ROSTER_OR_TRACE_INCOMPLETE");
  if (sha256(JSON.stringify(registry.runnerCoverage)) !== EXPECTED_RUNNER_COVERAGE_HASH) throw new Error("RUNNER_COVERAGE_CHANGED");
  if (sha256(JSON.stringify(registry.integrityCoverage)) !== EXPECTED_INTEGRITY_COVERAGE_HASH) throw new Error("INTEGRITY_COVERAGE_CHANGED");
  if (sha256(JSON.stringify(registry.g4EvidenceRunner)) !== EXPECTED_G4_REQUIREMENTS_HASH) throw new Error("G4_REQUIREMENTS_CHANGED");
  const ids = registry.cases.map((item) => item.caseId);
  if (new Set(ids).size !== ids.length) throw new Error("CASE_ID_DUPLICATE");
  const byId = new Map(registry.cases.map((item) => [item.caseId, item]));
  const rosterSupersession = readJson(ROSTER_SUPERSESSION_PATH);
  const expectedRosterMappings = Array.from({ length: 14 }, (_, index) => ({
    sourceCaseId: `R${String(index + 1).padStart(2, "0")}`,
    targetCaseId: `I${String(index + 1).padStart(2, "0")}`
  }));
  if (
    rosterSupersession?.authority !== "DEV-090 Intentional replacement"
    || rosterSupersession?.currentDenominatorDelta !== 0
    || rosterSupersession?.browserDenominatorDelta !== 0
    || JSON.stringify(rosterSupersession?.mappings) !== JSON.stringify(expectedRosterMappings)
  ) throw new Error("CASE_ROSTER_OR_TRACE_INCOMPLETE");
  if (!registry.generatedFrom.includes(".ai-doc/qa/dev-087-case-roster-supersession.json")) throw new Error("CASE_ROSTER_OR_TRACE_INCOMPLETE");
  for (const mapping of expectedRosterMappings) {
    if (byId.get(mapping.sourceCaseId)?.classification !== "historical_supporting") throw new Error("CASE_ROSTER_OR_TRACE_INCOMPLETE");
    if (byId.get(mapping.targetCaseId)?.classification !== "current_required") throw new Error("CASE_ROSTER_OR_TRACE_INCOMPLETE");
    if (registry.currentDenominator.includes(mapping.sourceCaseId) || !registry.currentDenominator.includes(mapping.targetCaseId)) throw new Error("CASE_ROSTER_OR_TRACE_INCOMPLETE");
  }
  for (const caseId of registry.currentDenominator) {
    const item = byId.get(caseId);
    if (!item || item.classification !== "current_required") throw new Error("CASE_ROSTER_OR_TRACE_INCOMPLETE");
  }
  for (const item of registry.cases) {
    if (!/^[a-f0-9]{64}$/u.test(item.definitionHash)) throw new Error("REGISTRY_DEFINITION_HASH_INVALID");
    const sourcePath = safeArtifactPath(ROOT, item.source?.path);
    if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error(`REGISTRY_SOURCE_MISSING:${item.caseId}`);
    const line = fs.readFileSync(sourcePath, "utf8").replace(/\r/gu, "").split("\n")[item.source.line - 1];
    if (!line || sha256(line) !== item.definitionHash) throw new Error(`REGISTRY_DEFINITION_HASH_MISMATCH:${item.caseId}`);
  }
  const productCases = registry.currentDenominator.filter((caseId) => byId.get(caseId)?.gateStage === "product");
  const coveredProductCases = new Set(registry.runnerCoverage.flatMap((coverage) => coverage.caseIds));
  if (productCases.some((caseId) => !coveredProductCases.has(caseId))) throw new Error("CURRENT_EVIDENCE_INCOMPLETE");
  for (const coverage of registry.runnerCoverage) {
    if (new Set(coverage.caseIds).size !== coverage.caseIds.length) throw new Error(`RUNNER_CASE_DUPLICATE:${coverage.runner}`);
    for (const caseId of coverage.caseIds) {
      if (!productCases.includes(caseId)) throw new Error(`RUNNER_CASE_OUT_OF_SCOPE:${coverage.runner}:${caseId}`);
    }
  }
  const browserCases = registry.runnerCoverage.find((coverage) => coverage.runner === "qc-dev-087-capability-browser")?.caseIds ?? [];
  if (expectedRosterMappings.some((mapping) => browserCases.includes(mapping.sourceCaseId) || !browserCases.includes(mapping.targetCaseId))) throw new Error("CASE_ROSTER_OR_TRACE_INCOMPLETE");
  const g0 = registry.integrityCoverage.find((coverage) => coverage.gateStage === "G0-A")?.caseIds ?? [];
  const g4 = registry.integrityCoverage.find((coverage) => coverage.gateStage === "G4")?.caseIds ?? [];
  if (JSON.stringify(g0) !== JSON.stringify(["QA-087-219", "QA-087-220", "QA-087-221", "QA-087-222", "QA-087-223", "QA-087-224"])) throw new Error("G0_STAGE_INVALID");
  if (JSON.stringify(g4) !== JSON.stringify(["QA-087-225", "QA-087-226", "QA-087-227", "QA-087-228"])) throw new Error("G4_STAGE_INVALID");
  return byId;
}

function validateMutant(id, value) {
  switch (id) {
    case "M01": if (new Set(value.cases.map((item) => item.caseId)).size !== value.cases.length) return "CASE_ID_DUPLICATE"; break;
    case "M02": if (sha256(JSON.stringify(value.currentDenominator)) !== EXPECTED_DENOMINATOR_HASH) return "CASE_ROSTER_OR_TRACE_INCOMPLETE"; break;
    case "M03": if (value.cases.some((item) => item.caseId === "QA-087-221" && (item.fixtureOrigin !== "fault_profile" || !item.allowedClaims.includes("harness_readiness")))) return "FIXTURE_PROVENANCE_INVALID"; break;
    case "M04": if (value.oracleImport || value.knownWrongAccepted) return "ORACLE_NOT_INDEPENDENT_OR_INSENSITIVE"; break;
    case "M05": if (sha256(JSON.stringify(value.runnerCoverage)) !== EXPECTED_RUNNER_COVERAGE_HASH) return "CURRENT_EVIDENCE_INCOMPLETE"; break;
    case "M06": if (value.artifactHash !== value.actualHash) return "CHILD_ARTIFACT_HASH_MISMATCH"; break;
    case "M07": if (Object.values(value.prohibitedMutationAudit ?? {}).some((count) => count > 0)) return "PROHIBITED_MUTATION"; break;
    case "M08": if (value.manifestProvider !== value.receiptProvider) return "PROVIDER_EVIDENCE_MISMATCH"; break;
    case "M09": if (!/^\/(?!\/)/u.test(value.actionUrl ?? "")) return "ACTION_URL_NOT_SAME_ORIGIN"; break;
    case "M10": if (!value.visibleEvidence?.viewport || !value.visibleEvidence?.geometry || !value.visibleEvidence?.accessibility) return "VISIBLE_EVIDENCE_INCOMPLETE"; break;
    case "M11": if (value.checkpoint?.sourceFingerprint !== value.reused?.sourceFingerprint || value.checkpoint?.fixtureId !== value.reused?.fixtureId) return "EVIDENCE_PROVENANCE_MISMATCH"; break;
    case "M12": if (value.cleanupReceipt?.status !== "complete" || !value.cleanupReceipt?.portsReleased) return "CLEANUP_INCOMPLETE"; break;
    default: throw new Error(`UNKNOWN_MUTANT:${id}`);
  }
  return null;
}

function verifyOracles() {
  const affected = oracleAffectedParts({ companyId: "c1", drawingId: "d1", revisionId: "r1", relationTuples: [["c1", "d1", "r1", "p2"], ["c2", "d1", "r1", "bad"]] });
  if (JSON.stringify(affected.partIds) !== JSON.stringify(["p2"])) throw new Error("ORACLE_NOT_INDEPENDENT_OR_INSENSITIVE:affected");
  const left = oracleObsoleteFingerprint({ entityType: "part_number", entityCode: "P1", status: "Released", dependencyTuples: [["drawing", "D1"]] });
  const right = oracleObsoleteFingerprint({ entityType: "part_number", entityCode: "P1", status: "Released", dependencyTuples: [["drawing", "D2"]] });
  if (left.fingerprint === right.fingerprint) throw new Error("ORACLE_NOT_INDEPENDENT_OR_INSENSITIVE:fingerprint");
  const ordered = oracleTaskOrder([{ id: "info", severity: "info" }, { id: "critical", severity: "critical" }]);
  if (ordered[0]?.id !== "critical") throw new Error("ORACLE_NOT_INDEPENDENT_OR_INSENSITIVE:task");
  const first = oracleGroupedCursor({ rows: [{ id: "a", groupKey: "g1" }, { id: "b", groupKey: "g2" }], limit: 1 });
  const second = oracleGroupedCursor({ rows: [{ id: "a", groupKey: "g1" }, { id: "b", groupKey: "g2" }], filters: { missing: "x" }, limit: 1 });
  if (first.filterFingerprint === second.filterFingerprint) throw new Error("ORACLE_NOT_INDEPENDENT_OR_INSENSITIVE:cursor");
}

function expectFailure(expected, action) {
  try {
    action();
  } catch (error) {
    const actual = error instanceof Error ? error.message : String(error);
    if (actual === expected || actual.startsWith(`${expected}:`)) return actual;
    throw new Error(`HARDENING_PROBE_WRONG_FAILURE:${expected}:${actual}`);
  }
  throw new Error(`HARDENING_PROBE_FALSE_PASS:${expected}`);
}

function verifyDev100ChildHardening() {
  const expectedSource = { head: "head", branch: "branch", dirtyBoundaryHash: "dirty" };
  const base = {
    schemaVersion: 1,
    runner: "qc-dev-100-aggregate",
    devId: "DEV-100",
    parentRunId: "parent",
    status: "PASS",
    completionCandidate: true,
    source: expectedSource,
    caseResults: DEV100_CASE_IDS.map((caseId) => ({ caseId, result: "PASS" })),
    currentDenominator: { expected: 18, pass: 18, blocked: 0, notRun: 0, fail: 0 },
    artifactResults: DEV100_REQUIRED_RUNNERS.map((runner) => ({ runner, status: "PASS" })),
    commands: [{ status: "PASS" }],
    primaryInvariant: { unchanged: true },
    cleanup: { complete: true }
  };
  expectFailure("DEV100_CHILD_CARDINALITY:0", () => selectDev100Child([], "parent"));
  expectFailure("DEV100_CHILD_CARDINALITY:0", () => selectDev100Child([{ ...base, parentRunId: "wrong" }], "parent"));
  expectFailure("DEV100_SOURCE_FINGERPRINT_MISMATCH", () => validateDev100ManifestEnvelope({ ...base, source: { ...expectedSource, dirtyBoundaryHash: "stale" } }, { expectedParentRunId: "parent", expectedSource }));
  expectFailure("DEV100_SELF_LABELLED_PASS", () => validateDev100ManifestEnvelope({ ...base, artifactResults: base.artifactResults.map((entry, index) => index === 0 ? { ...entry, status: "FAIL" } : entry) }, { expectedParentRunId: "parent", expectedSource }));
}

function verifyContentFingerprint() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dev087-source-fingerprint-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: tempRoot, windowsHide: true });
    execFileSync("git", ["config", "user.email", "dev087@example.test"], { cwd: tempRoot, windowsHide: true });
    execFileSync("git", ["config", "user.name", "DEV087"], { cwd: tempRoot, windowsHide: true });
    fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, "src", "source.txt"), "baseline\n", "utf8");
    execFileSync("git", ["add", "src/source.txt"], { cwd: tempRoot, windowsHide: true });
    execFileSync("git", ["commit", "--quiet", "-m", "baseline"], { cwd: tempRoot, windowsHide: true });
    fs.writeFileSync(path.join(tempRoot, "src", "source.txt"), "dirty-one\n", "utf8");
    const first = sourceInfo(tempRoot);
    fs.writeFileSync(path.join(tempRoot, "src", "source.txt"), "dirty-two\n", "utf8");
    const second = sourceInfo(tempRoot);
    if (first.dirtyBoundaryHash === second.dirtyBoundaryHash) throw new Error("SOURCE_CONTENT_CHANGE_NOT_DETECTED");

    fs.mkdirSync(path.join(tempRoot, "config"), { recursive: true });
    const beforeGovernanceReceipt = sourceInfo(tempRoot);
    fs.writeFileSync(path.join(tempRoot, "config", "dev-079-dev-101-capa-release-boundary.json"), "{}\n", "utf8");
    const afterGovernanceReceipt = sourceInfo(tempRoot);
    if (beforeGovernanceReceipt.dirtyBoundaryHash !== afterGovernanceReceipt.dirtyBoundaryHash) throw new Error("UNRELATED_GOVERNANCE_RECEIPT_NOT_EXCLUDED");

    fs.mkdirSync(path.join(tempRoot, "config", "platform"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, "config", "platform", "runtime-support.json"), "{\"enabled\":true}\n", "utf8");
    const beforeProductConfigChange = sourceInfo(tempRoot);
    fs.writeFileSync(path.join(tempRoot, "config", "platform", "runtime-support.json"), "{\"enabled\":false}\n", "utf8");
    const afterProductConfigChange = sourceInfo(tempRoot);
    if (beforeProductConfigChange.dirtyBoundaryHash === afterProductConfigChange.dirtyBoundaryHash) throw new Error("PRODUCT_CONFIG_CHANGE_NOT_DETECTED");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runHardeningProbes(registry) {
  const coverage = registry.runnerCoverage[0];
  const artifactPath = "output/qa/dev-087-capability/synthetic/evidence.json";
  const base = {
    runner: coverage.runner,
    caseResults: coverage.caseIds.map((caseId) => ({ caseId, result: "PASS", assertionIds: [`${caseId}:${coverage.runner}`], firstFailurePointer: null })),
    caseEvidence: Object.fromEntries(coverage.caseIds.map((caseId) => [caseId, { evidenceTypes: [...coverage.requiredEvidence], artifactPaths: [artifactPath] }])),
    childManifests: [{ path: artifactPath, sha256: "a".repeat(64), runner: "synthetic", caseIds: [...coverage.caseIds], result: "PASS" }]
  };
  validateLaneRosterAndEvidence(registry, base, coverage.runner);
  expectFailure("RUNNER_OWNERSHIP_MISMATCH", () => validateLaneRosterAndEvidence(registry, { ...base, runner: "wrong-runner" }, coverage.runner));
  expectFailure("RUNNER_CASE_ROSTER_MISMATCH", () => validateLaneRosterAndEvidence(registry, { ...base, caseResults: base.caseResults.slice(1) }, coverage.runner));
  expectFailure("RUNNER_CASE_ROSTER_MISMATCH", () => validateLaneRosterAndEvidence(registry, { ...base, caseResults: [...base.caseResults, { caseId: "QA-087-999", result: "PASS", assertionIds: ["x"], firstFailurePointer: null }] }, coverage.runner));
  const missingEvidence = structuredClone(base);
  missingEvidence.caseEvidence[coverage.caseIds[0]].evidenceTypes = missingEvidence.caseEvidence[coverage.caseIds[0]].evidenceTypes.slice(1);
  expectFailure("CASE_EVIDENCE_TYPE_MISSING", () => validateLaneRosterAndEvidence(registry, missingEvidence, coverage.runner));
  const missingPointer = structuredClone(base);
  missingPointer.caseEvidence[coverage.caseIds[0]].artifactPaths = [];
  expectFailure("CASE_ARTIFACT_POINTER_MISSING", () => validateLaneRosterAndEvidence(registry, missingPointer, coverage.runner));
  const requirement = registry.g4EvidenceRunner;
  const completeG4 = {
    mutationLedger: Array.from({ length: requirement.minimumMutationBijections }, (_, index) => ({ uiAction: `action-${index}`, networkInitiator: `request-${index}`, correlationId: `correlation-${index}`, serverRoute: `/api/test/${index}`, dbWriter: `writer-${index}`, successfulWrite: true })),
    postgresCaseReceipts: requirement.requiredPostgresCases.map((caseId) => ({ caseId, provider: "postgresql", result: "PASS", transactionId: `tx-${caseId}` })),
    negativeEvidence: requirement.requiredSecurityNegatives.map((kind) => ({ kind, result: "PASS", zeroWrite: true })),
    visibleEvidence: requirement.requiredUiFamilies.flatMap((family) => requirement.requiredViewports.map((viewport) => ({ family, viewport, screenshot: `${family}-${viewport}.png`, geometry: { overflow: 0 }, focus: { order: "captured" }, accessibilityTree: `${family}-${viewport}.json`, headed: requirement.requiredHeadedViewports.includes(viewport) }))),
    assistiveTechnologyEvidence: [{ actual: true, result: "PASS", technology: "screen-reader" }]
  };
  const completeOutcomes = g4EvidenceOutcomes(requirement, completeG4);
  if (Object.values(completeOutcomes).some((value) => value !== true)) throw new Error("G4_COMPLETE_PAYLOAD_FALSE_NEGATIVE");
  const missingMutation = structuredClone(completeG4); missingMutation.mutationLedger.pop();
  if (g4EvidenceOutcomes(requirement, missingMutation).mutationPass) throw new Error("G4_MUTATION_GAP_FALSE_PASS");
  const missingProvider = structuredClone(completeG4); missingProvider.postgresCaseReceipts.pop();
  if (g4EvidenceOutcomes(requirement, missingProvider).providerPass) throw new Error("G4_PROVIDER_GAP_FALSE_PASS");
  const missingSecurity = structuredClone(completeG4); missingSecurity.negativeEvidence.pop();
  if (g4EvidenceOutcomes(requirement, missingSecurity).securityPass) throw new Error("G4_SECURITY_GAP_FALSE_PASS");
  const missingVisible = structuredClone(completeG4); missingVisible.assistiveTechnologyEvidence = [];
  if (g4EvidenceOutcomes(requirement, missingVisible).visiblePass) throw new Error("G4_VISIBLE_GAP_FALSE_PASS");
  verifyContentFingerprint();
  verifyDev100ChildHardening();
  return [
    "runner ownership mismatch rejected",
    "missing and extra case roster rejected",
    "required evidence type rejected",
    "missing artifact pointer rejected",
    "incomplete G4 mutation/provider/security/visible payloads rejected",
    "dirty content and product config changes alter fingerprint while the explicit unrelated governance receipt does not",
    "DEV-100 missing child, wrong run, stale source and self-labelled PASS rejected"
  ];
}

function writeIntegrityManifest(manifest, evidencePayload) {
  const runDir = path.join(ROOT, OUTPUT_ROOT, manifest.runId);
  fs.mkdirSync(runDir, { recursive: true });
  const evidencePath = path.join(runDir, "integrity-evidence.json");
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidencePayload, null, 2)}\n`, "utf8");
  const caseIds = manifest.caseResults.map((item) => item.caseId);
  manifest.childManifests = [artifactReference(ROOT, evidencePath, "qa-integrity-evidence", caseIds, manifest.result)];
  const artifactPath = manifest.childManifests[0].path;
  manifest.caseEvidence = Object.fromEntries(caseIds.map((caseId) => [caseId, {
    evidenceTypes: manifest.gateStage === "G0-A"
      ? ["registry", "oracle", "mutant_manifest", "source_fingerprint", "artifact_hash"]
      : ["validated_child_manifests", "actual_g4_evidence", "artifact_hash"],
    artifactPaths: [artifactPath]
  }]));
  return writeCapabilityManifest(ROOT, OUTPUT_ROOT, manifest);
}

function runPreflight(registry, parentRunId) {
  const runId = `DEV087-G0-A-${new Date().toISOString().replace(/[-:.TZ]/gu, "")}`;
  const manifest = manifestBase({ root: ROOT, runId, gateStage: "G0-A", runner: "qc-dev-087-qa-integrity", provider: "not_applicable", dataScope: "read_only_registry_oracle_and_synthetic_manifests", parentRunId });
  const mutantResults = [];
  const hardeningResults = [];
  try {
    const byId = assertRegistry(registry);
    verifyOracles();
    for (const [id, expected, mutate] of MUTANTS) {
      const failure = validateMutant(id, mutate(registry));
      if (failure !== expected) throw new Error(`MUTANT_NOT_CAUGHT:${id}:${failure ?? "none"}`);
      mutantResults.push({ id, expected, actual: failure, result: "PASS" });
    }
    hardeningResults.push(...runHardeningProbes(registry));
    const coverage = registry.integrityCoverage.find((item) => item.gateStage === "G0-A");
    manifest.caseResults = coverage.caseIds.map((caseId) => ({ caseId, result: "PASS", assertionIds: byId.get(caseId).assertionIds, firstFailurePointer: null }));
    manifest.cleanupReceipt = { status: "complete", taskOwnedRuntime: false, portsReleased: true };
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    const coverage = registry.integrityCoverage?.find((item) => item.gateStage === "G0-A");
    manifest.result = "FAIL";
    manifest.errorCode = code;
    manifest.caseResults = (coverage?.caseIds ?? ["QA-087-224"]).map((caseId) => ({ caseId, result: "FAIL", assertionIds: [caseId], firstFailurePointer: "integrity-evidence.json" }));
    manifest.firstFailure = { code, caseId: manifest.caseResults[0].caseId, pointer: "integrity-evidence.json" };
    manifest.cleanupReceipt = { status: "complete", taskOwnedRuntime: false, portsReleased: true };
  }
  const manifestPath = writeIntegrityManifest(manifest, {
    manifestSchemaVersion: DEV087_MANIFEST_SCHEMA_VERSION,
    sourceFingerprintVersion: DEV087_SOURCE_FINGERPRINT_VERSION,
    registryHash: hashFile(REGISTRY_PATH),
    schemaHash: hashFile(MANIFEST_SCHEMA_PATH),
    oracleHash: hashFile(ORACLE_PATH),
    runnerHash: hashFile(RUNNER_PATH),
    mutantResults,
    hardeningResults
  });
  return { manifest, manifestPath, exitCode: manifest.result === "PASS" ? 0 : 1 };
}

function productManifestsForParent(parentRunId) {
  const root = path.join(ROOT, OUTPUT_ROOT);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
    const manifestPath = path.join(root, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) return [];
    try {
      const parsed = readJson(manifestPath);
      return parsed.gateStage === "product" && parsed.parentRunId === parentRunId ? [{ path: manifestPath, parsed }] : [];
    } catch {
      return [];
    }
  });
}

function g4EvidenceOutcomes(requirement, manifest) {
  const mutationPass = Array.isArray(manifest.mutationLedger)
    && manifest.mutationLedger.length >= requirement.minimumMutationBijections
    && manifest.mutationLedger.every((item) => item.uiAction && item.networkInitiator && item.correlationId && item.serverRoute && item.dbWriter && item.successfulWrite === true);
  const providerPass = requirement.requiredPostgresCases.every((caseId) => manifest.postgresCaseReceipts?.some((item) => item.caseId === caseId && item.provider === "postgresql" && item.result === "PASS" && item.transactionId));
  const securityPass = requirement.requiredSecurityNegatives.every((kind) => manifest.negativeEvidence?.some((item) => item.kind === kind && item.result === "PASS" && item.zeroWrite === true));
  const visiblePass = requirement.requiredUiFamilies.every((family) => requirement.requiredViewports.every((viewport) => manifest.visibleEvidence?.some((item) => item.family === family && item.viewport === viewport && item.screenshot && item.geometry && item.focus && item.accessibilityTree && (!requirement.requiredHeadedViewports.includes(viewport) || item.headed === true))))
    && (!requirement.requireActualAssistiveTechnology || manifest.assistiveTechnologyEvidence?.some((item) => item.actual === true && item.result === "PASS" && item.technology));
  return { mutationPass, providerPass, securityPass, visiblePass };
}

function validateG4RawManifest(registry, child, parentRunId, expectedSource) {
  const manifest = child.parsed;
  const requirement = registry.g4EvidenceRunner;
  if (manifest.schemaVersion !== DEV087_MANIFEST_SCHEMA_VERSION || manifest.gateStage !== "product") throw new Error("G4_PRODUCT_SCHEMA_INVALID");
  if (manifest.runner !== requirement.runner) throw new Error("G4_PRODUCT_RUNNER_MISMATCH");
  if (manifest.parentRunId !== parentRunId) throw new Error("AGGREGATE_RUN_MISMATCH");
  if (manifest.registryHash !== hashFile(REGISTRY_PATH) || manifest.schemaHash !== hashFile(MANIFEST_SCHEMA_PATH) || manifest.oracleHash !== hashFile(ORACLE_PATH)) throw new Error("G4_PRODUCT_CONTRACT_HASH_MISMATCH");
  const runnerPath = path.join(ROOT, "scripts", `${requirement.runner}.mjs`);
  if (manifest.runnerHash !== hashFile(runnerPath)) throw new Error("G4_PRODUCT_RUNNER_HASH_MISMATCH");
  if (manifest.source?.fingerprintVersion !== DEV087_SOURCE_FINGERPRINT_VERSION || manifest.source?.dirtyBoundaryHash !== expectedSource.dirtyBoundaryHash || manifest.source?.head !== expectedSource.head || manifest.source?.branch !== expectedSource.branch) throw new Error("SOURCE_FINGERPRINT_MISMATCH");
  if (manifest.environment?.provider !== "postgresql") throw new Error("PROVIDER_EVIDENCE_MISMATCH");
  if (manifest.result !== "PASS") throw new Error("G4_PRODUCT_NOT_PASS");
  if ((manifest.caseResults ?? []).length !== 0) throw new Error("G4_PRODUCT_SELF_LABELLED_CASE_RESULT");
  if (manifest.cleanupReceipt?.status !== "complete" || manifest.cleanupReceipt?.portsReleased !== true) throw new Error("CLEANUP_INCOMPLETE");
  if ((manifest.primaryInvariant?.delta ?? 0) !== 0) throw new Error("PRIMARY_INVARIANT_CHANGED");
  if (Object.values(manifest.prohibitedMutationAudit ?? {}).some((count) => count !== 0)) throw new Error("PROHIBITED_MUTATION");
  validateArtifactReferences(ROOT, manifest);

  return g4EvidenceOutcomes(requirement, manifest);
}

function runEvidence(registry, parentRunId) {
  if (!parentRunId) throw new Error("AGGREGATE_RUN_ID_REQUIRED");
  const runId = `DEV087-G4-${new Date().toISOString().replace(/[-:.TZ]/gu, "")}`;
  const manifest = manifestBase({ root: ROOT, runId, gateStage: "G4", runner: "qc-dev-087-qa-integrity", provider: "not_applicable", dataScope: "read_only_current_aggregate_evidence", parentRunId });
  const evidencePayload = { parentRunId, laneValidation: [], g4Validation: null };
  let selectedChildren = [];
  try {
    const byId = assertRegistry(registry);
    const expectedSource = sourceInfo(ROOT);
    const candidates = productManifestsForParent(parentRunId);
    for (const coverage of registry.runnerCoverage) {
      const lane = candidates.filter((child) => child.parsed.runner === coverage.runner);
      if (lane.length !== 1) throw new Error(`PRODUCT_LANE_CARDINALITY:${coverage.runner}:${lane.length}`);
      validateBasicManifest({ root: ROOT, registry, manifest: lane[0].parsed, expectedRunner: coverage.runner, expectedParentRunId: parentRunId, expectedSource });
      selectedChildren.push(lane[0]);
      evidencePayload.laneValidation.push({ runner: coverage.runner, result: "PASS", cases: coverage.caseIds.length });
    }
    const raw = candidates.filter((child) => child.parsed.runner === registry.g4EvidenceRunner.runner);
    if (raw.length !== 1) throw new Error(`G4_PRODUCT_LANE_CARDINALITY:${raw.length}`);
    const outcomes = validateG4RawManifest(registry, raw[0], parentRunId, expectedSource);
    selectedChildren.push(raw[0]);
    evidencePayload.g4Validation = outcomes;
    const resultByCase = {
      "QA-087-225": outcomes.mutationPass,
      "QA-087-226": outcomes.providerPass,
      "QA-087-227": outcomes.securityPass,
      "QA-087-228": outcomes.visiblePass
    };
    manifest.caseResults = registry.integrityCoverage.find((item) => item.gateStage === "G4").caseIds.map((caseId) => ({
      caseId,
      result: resultByCase[caseId] ? "PASS" : "FAIL",
      assertionIds: byId.get(caseId).assertionIds,
      firstFailurePointer: resultByCase[caseId] ? null : "integrity-evidence.json"
    }));
    if (manifest.caseResults.some((item) => item.result !== "PASS")) throw new Error("G4_ACTUAL_EVIDENCE_INCOMPLETE");
    manifest.cleanupReceipt = { status: "complete", taskOwnedRuntime: false, portsReleased: true };
    manifest.primaryInvariant = { status: "pass", delta: 0 };
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    manifest.result = "FAIL";
    manifest.errorCode = code;
    const g4Cases = registry.integrityCoverage?.find((item) => item.gateStage === "G4")?.caseIds ?? ["QA-087-225", "QA-087-226", "QA-087-227", "QA-087-228"];
    if (manifest.caseResults.length === 0) manifest.caseResults = g4Cases.map((caseId) => ({ caseId, result: "FAIL", assertionIds: [caseId], firstFailurePointer: "integrity-evidence.json" }));
    manifest.firstFailure = { code, caseId: manifest.caseResults.find((item) => item.result !== "PASS")?.caseId ?? g4Cases[0], pointer: "integrity-evidence.json" };
    manifest.cleanupReceipt = { status: "complete", taskOwnedRuntime: false, portsReleased: true };
  }
  const manifestPath = writeIntegrityManifest(manifest, evidencePayload);
  const integrityEvidencePath = manifest.childManifests[0].path;
  manifest.childManifests.push(...selectedChildren.map((child) => artifactReference(ROOT, child.path, child.parsed.runner, child.parsed.caseResults?.map((item) => item.caseId) ?? [], child.parsed.result)));
  for (const item of manifest.caseResults) manifest.caseEvidence[item.caseId] = { evidenceTypes: ["validated_child_manifests", "actual_g4_evidence", "artifact_hash"], artifactPaths: [integrityEvidencePath, ...manifest.childManifests.slice(1).map((child) => child.path)] };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, manifestPath, exitCode: manifest.result === "PASS" ? 0 : 1 };
}

const stageArgIndex = process.argv.indexOf("--stage");
const parentArgIndex = process.argv.indexOf("--parent-run-id");
const stage = stageArgIndex >= 0 ? process.argv[stageArgIndex + 1] : "preflight";
const parentRunId = parentArgIndex >= 0 ? process.argv[parentArgIndex + 1] : (process.env.DEV087_AGGREGATE_RUN_ID ?? null);
if (!["preflight", "evidence"].includes(stage)) {
  console.error("usage: node scripts/qc-dev-087-qa-integrity.mjs --stage preflight|evidence [--parent-run-id <run-id>]");
  process.exitCode = 2;
} else {
  try {
    const registry = readJson(REGISTRY_PATH);
    const result = stage === "preflight" ? runPreflight(registry, parentRunId) : runEvidence(registry, parentRunId);
    console.log(JSON.stringify({ stage, result: result.manifest.result, errorCode: result.manifest.errorCode, manifest: result.manifestPath }));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
}
