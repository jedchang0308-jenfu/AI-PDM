import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const DEV087_MANIFEST_SCHEMA_VERSION = 2;
export const DEV087_SOURCE_FINGERPRINT_VERSION = "git-content-v4-dev087-execution-scope";

const SOURCE_EXCLUDED_FILES = new Set([
  // Cross-task governance receipt. It is neither loaded by the product runtime nor
  // consumed by a DEV-087 runner, so concurrent CAPA bookkeeping must not
  // invalidate a rendered UI run. Product/platform config remains in scope.
  "config/dev-079-dev-101-capa-release-boundary.json"
]);

const SOURCE_INCLUDED_PREFIXES = [
  ".external-assets/",
  "config/",
  "db/",
  "public/",
  "src/"
];

const SOURCE_INCLUDED_ROOT_FILES = new Set([
  "Dockerfile",
  "eslint.config.mjs",
  "next.config.mjs",
  "package-lock.json",
  "package.json",
  "tsconfig.app.json",
  "tsconfig.json",
  "tsconfig.next.json"
]);

const SOURCE_INCLUDED_SCRIPT_PREFIXES = [
  "scripts/dev-087-",
  "scripts/dev-090-",
  "scripts/dev-092-",
  "scripts/dev-094-",
  "scripts/dev-100-",
  "scripts/migrate-dev-087-",
  "scripts/migrate-dev-090-",
  "scripts/qc-dev-087-",
  "scripts/qc-dev-090-",
  "scripts/qc-dev-092-",
  "scripts/qc-dev-094-",
  "scripts/qc-dev-100-",
  "scripts/qc-next-"
];

const SOURCE_INCLUDED_SCRIPT_FILES = new Set([
  "scripts/clean-next.mjs",
  "scripts/prepare-dev-082-ocr-assets.mjs",
  "scripts/qc-node-listener-budget.cjs",
  "scripts/qc-process-warning-guard.mjs",
  "scripts/qc-ts-path-loader.mjs"
]);

function sourceFileInScope(relative) {
  if (SOURCE_EXCLUDED_FILES.has(relative)) return false;
  if (SOURCE_INCLUDED_ROOT_FILES.has(relative)) return true;
  if (SOURCE_INCLUDED_PREFIXES.some((prefix) => relative.startsWith(prefix))) return true;
  if (SOURCE_INCLUDED_SCRIPT_FILES.has(relative) || SOURCE_INCLUDED_SCRIPT_PREFIXES.some((prefix) => relative.startsWith(prefix))) return true;
  if (relative.startsWith(".ai-doc/qa/dev-087-") || relative.startsWith(".ai-doc/qa/qa-dev-087-")) return true;
  return relative.startsWith(".ai-doc/specs/SPEC-PDM-STATUS-DATA-REBUILD-001-");
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hashFile(filePath) {
  return sha256(fs.readFileSync(filePath));
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function git(root, args, options = {}) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: options.encoding ?? "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024
  });
}

function normalizeRelative(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function sourceFileList(root) {
  const raw = git(root, ["ls-files", "-co", "--exclude-standard", "-z"], { encoding: "buffer" });
  return raw.toString("utf8").split("\0")
    .map(normalizeRelative)
    .filter(Boolean)
    .filter(sourceFileInScope)
    .filter((relative) => {
      const absolute = path.resolve(root, relative);
      return absolute.startsWith(path.resolve(root) + path.sep) && fs.existsSync(absolute) && fs.statSync(absolute).isFile();
    })
    .sort((left, right) => left.localeCompare(right));
}

export function sourceInfo(root) {
  const files = sourceFileList(root);
  const records = files.map((relative) => {
    const absolute = path.resolve(root, relative);
    return `${relative}\0${fs.statSync(absolute).size}\0${hashFile(absolute)}`;
  });
  const status = git(root, ["-c", "core.quotepath=false", "status", "--porcelain=v1", "--untracked-files=all"])
    .split(/\r?\n/u)
    .filter(Boolean)
    .filter((entry) => entry.slice(3).split(" -> ").some((candidate) => {
      const relative = normalizeRelative(candidate.replace(/^"|"$/gu, ""));
      return sourceFileInScope(relative);
    }))
    .sort((left, right) => left.localeCompare(right));
  return {
    repository: path.basename(root),
    branch: git(root, ["branch", "--show-current"]).trim(),
    head: git(root, ["rev-parse", "HEAD"]).trim(),
    fingerprintVersion: DEV087_SOURCE_FINGERPRINT_VERSION,
    dirtyBoundaryHash: sha256(JSON.stringify({ records, status }))
  };
}

export function safeArtifactPath(root, artifactPath) {
  if (typeof artifactPath !== "string" || !artifactPath.trim()) return null;
  const absolute = path.resolve(root, artifactPath);
  const boundary = path.resolve(root) + path.sep;
  return absolute.startsWith(boundary) ? absolute : null;
}

export function artifactReference(root, filePath, runner, caseIds, result = "PASS") {
  const absolute = path.resolve(filePath);
  const boundary = path.resolve(root) + path.sep;
  if (!absolute.startsWith(boundary) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`DEV087_ARTIFACT_INVALID:${filePath}`);
  }
  return {
    path: normalizeRelative(path.relative(root, absolute)),
    sha256: hashFile(absolute),
    runner,
    caseIds: [...caseIds],
    result
  };
}

export function manifestBase({ root, runId, gateStage, runner, provider, dataScope, baseUrl = null, parentRunId = null }) {
  const registryPath = path.join(root, ".ai-doc", "qa", "dev-087-current-case-registry.json");
  const manifestSchemaPath = path.join(root, ".ai-doc", "qa", "dev-087-capability-manifest.schema.json");
  const oraclePath = path.join(root, "scripts", "qc-dev-087-reference-oracles.mjs");
  const runnerPath = path.join(root, "scripts", `${runner}.mjs`);
  return {
    schemaVersion: DEV087_MANIFEST_SCHEMA_VERSION,
    runId,
    parentRunId,
    gateStage,
    runner,
    source: sourceInfo(root),
    environment: { provider, dataScope, baseUrl },
    registryHash: hashFile(registryPath),
    schemaHash: hashFile(manifestSchemaPath),
    oracleHash: hashFile(oraclePath),
    runnerHash: fs.existsSync(runnerPath) ? hashFile(runnerPath) : "0".repeat(64),
    caseResults: [],
    caseEvidence: {},
    childManifests: [],
    prohibitedMutationAudit: { directApiWrites: 0, sqlWrites: 0, pageEvaluateWrites: 0, unprovenancedWrites: 0 },
    primaryInvariant: { status: "not_applicable", delta: null },
    firstFailure: null,
    cleanupReceipt: { status: "not_applicable", taskOwnedRuntime: false, portsReleased: true },
    result: "PASS",
    errorCode: null
  };
}

export function writeCapabilityManifest(root, outputRoot, manifest) {
  const runDir = path.join(root, outputRoot, manifest.runId);
  fs.mkdirSync(runDir, { recursive: true });
  const manifestPath = path.join(runDir, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestPath;
}

export function runnerCoverage(registry, runner) {
  const coverage = registry.runnerCoverage?.find((item) => item.runner === runner);
  if (!coverage) throw new Error(`RUNNER_COVERAGE_MISSING:${runner}`);
  return coverage;
}

export function validateArtifactReferences(root, manifest) {
  for (const child of manifest.childManifests ?? []) {
    if (!/^[a-f0-9]{64}$/u.test(child.sha256 ?? "")) throw new Error("CHILD_ARTIFACT_HASH_INVALID");
    const absolute = safeArtifactPath(root, child.path);
    if (!absolute || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error("CHILD_ARTIFACT_MISSING");
    if (hashFile(absolute) !== child.sha256) throw new Error("CHILD_ARTIFACT_HASH_MISMATCH");
  }
}

export function validateBasicManifest({ root, registry, manifest, expectedRunner, expectedParentRunId = null, expectedSource = null }) {
  if (manifest?.schemaVersion !== DEV087_MANIFEST_SCHEMA_VERSION) throw new Error("MANIFEST_SCHEMA_INVALID");
  if (manifest.gateStage !== "product") throw new Error("PRODUCT_GATE_STAGE_INVALID");
  if (manifest.runner !== expectedRunner) throw new Error("RUNNER_OWNERSHIP_MISMATCH");
  if (expectedParentRunId !== null && manifest.parentRunId !== expectedParentRunId) throw new Error("AGGREGATE_RUN_MISMATCH");
  const registryPath = path.join(root, ".ai-doc", "qa", "dev-087-current-case-registry.json");
  const manifestSchemaPath = path.join(root, ".ai-doc", "qa", "dev-087-capability-manifest.schema.json");
  const oraclePath = path.join(root, "scripts", "qc-dev-087-reference-oracles.mjs");
  const runnerPath = path.join(root, "scripts", `${expectedRunner}.mjs`);
  if (manifest.registryHash !== hashFile(registryPath)) throw new Error("REGISTRY_HASH_MISMATCH");
  if (manifest.schemaHash !== hashFile(manifestSchemaPath)) throw new Error("MANIFEST_SCHEMA_HASH_MISMATCH");
  if (manifest.oracleHash !== hashFile(oraclePath)) throw new Error("ORACLE_HASH_MISMATCH");
  if (!fs.existsSync(runnerPath) || manifest.runnerHash !== hashFile(runnerPath)) throw new Error("RUNNER_HASH_MISMATCH");
  if (manifest.source?.fingerprintVersion !== DEV087_SOURCE_FINGERPRINT_VERSION) throw new Error("SOURCE_FINGERPRINT_VERSION_INVALID");
  const currentSource = expectedSource ?? sourceInfo(root);
  if (manifest.source?.head !== currentSource.head || manifest.source?.branch !== currentSource.branch || manifest.source?.dirtyBoundaryHash !== currentSource.dirtyBoundaryHash) {
    throw new Error("SOURCE_FINGERPRINT_MISMATCH");
  }
  if (manifest.result !== "PASS") throw new Error("PRODUCT_CHILD_NOT_PASS");
  if (manifest.cleanupReceipt?.status !== "complete" || manifest.cleanupReceipt?.portsReleased !== true) throw new Error("CLEANUP_INCOMPLETE");
  if ((manifest.primaryInvariant?.delta ?? 0) !== 0) throw new Error("PRIMARY_INVARIANT_CHANGED");
  if (Object.values(manifest.prohibitedMutationAudit ?? {}).some((count) => count !== 0)) throw new Error("PROHIBITED_MUTATION");
  validateArtifactReferences(root, manifest);

  return validateLaneRosterAndEvidence(registry, manifest, expectedRunner);
}

export function validateLaneRosterAndEvidence(registry, manifest, expectedRunner) {
  if (manifest.runner !== expectedRunner) throw new Error("RUNNER_OWNERSHIP_MISMATCH");
  const coverage = runnerCoverage(registry, expectedRunner);
  const expectedCases = [...coverage.caseIds].sort();
  const actualCases = (manifest.caseResults ?? []).map((item) => item.caseId).sort();
  if (JSON.stringify(actualCases) !== JSON.stringify(expectedCases)) throw new Error("RUNNER_CASE_ROSTER_MISMATCH");
  const duplicateCount = actualCases.length - new Set(actualCases).size;
  if (duplicateCount !== 0) throw new Error("RUNNER_CASE_DUPLICATE");
  for (const item of manifest.caseResults) {
    if (item.result !== "PASS" || item.firstFailurePointer !== null || !Array.isArray(item.assertionIds) || item.assertionIds.length === 0) {
      throw new Error(`CASE_RESULT_NOT_CLEAN_PASS:${item.caseId}`);
    }
    const evidence = manifest.caseEvidence?.[item.caseId];
    if (!evidence || !Array.isArray(evidence.evidenceTypes) || !Array.isArray(evidence.artifactPaths)) {
      throw new Error(`CASE_EVIDENCE_MISSING:${item.caseId}`);
    }
    for (const evidenceType of coverage.requiredEvidence) {
      if (!evidence.evidenceTypes.includes(evidenceType)) throw new Error(`CASE_EVIDENCE_TYPE_MISSING:${item.caseId}:${evidenceType}`);
    }
    if (evidence.artifactPaths.length === 0) throw new Error(`CASE_ARTIFACT_POINTER_MISSING:${item.caseId}`);
    for (const artifactPath of evidence.artifactPaths) {
      const reference = manifest.childManifests.find((child) => child.path === artifactPath && child.caseIds.includes(item.caseId));
      if (!reference) throw new Error(`CASE_ARTIFACT_REFERENCE_MISSING:${item.caseId}:${artifactPath}`);
    }
  }
  return coverage;
}

export function summarizeCaseResults(registry, laneManifests) {
  const laneByName = new Map(laneManifests.map((item) => [item.runner, item]));
  return registry.currentDenominator.map((caseId) => {
    const requiredRunners = (registry.runnerCoverage ?? [])
      .filter((coverage) => coverage.caseIds.includes(caseId))
      .map((coverage) => coverage.runner);
    const passedRunners = requiredRunners.filter((runner) => laneByName.get(runner)?.caseResults?.some((item) => item.caseId === caseId && item.result === "PASS"));
    return {
      caseId,
      result: requiredRunners.length > 0 && passedRunners.length === requiredRunners.length ? "PASS" : "NOT_RUN",
      requiredRunners,
      passedRunners
    };
  });
}
