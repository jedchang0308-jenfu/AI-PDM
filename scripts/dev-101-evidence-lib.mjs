import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const DEV101_MANIFEST_SCHEMA_VERSION = 1;
export const DEV101_REGISTRY_PATH = ".ai-doc/qa/dev-101-current-case-registry.json";
export const DEV101_SCHEMA_PATH = ".ai-doc/qa/dev-101-independent-manifest.schema.json";

const SOURCE_EXCLUDED_PREFIXES = [
  ".next/",
  ".tmp/",
  "data/",
  "node_modules/",
  "output/"
];

const PROHIBITED_ORACLE_IMPORT_PATTERNS = [
  /import\s*\{[^}]*\b(?:reviewPackageHash|reviewPackageWorkspaceEvidenceHash|compareReviewTarget)\b[^}]*\}\s*from\s*["'][^"']*\/pdm-review-package(?:-contract)?(?:\.ts)?["']/su,
  /(?:const|let|var)\s*\{[^}]*\b(?:reviewPackageHash|reviewPackageWorkspaceEvidenceHash|compareReviewTarget)\b[^}]*\}\s*=\s*await\s+import\s*\(["'][^"']*\/pdm-review-package(?:-contract)?(?:\.ts)?["']\s*\)/su,
  /(?:from\s+|import\s*\()["'][^"']*\/drawing-recognition-review-(?:projection|snapshot)(?:\.ts)?["']/u,
  /(?:from\s+|import\s*\()["'][^"']*\/(?:review-target-marker-slots|review-snapshot-compare)(?:\.tsx)?["']/u
];

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function hashFile(filePath) {
  return sha256(fs.readFileSync(filePath));
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  if (value === undefined || typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    throw new TypeError(`DEV101_CANONICAL_JSON_UNSUPPORTED:${typeof value}`);
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function canonicalHash(value) {
  return sha256(canonicalJson(value));
}

function git(root, args, encoding = "utf8") {
  return execFileSync("git", args, { cwd: root, encoding, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
}

function normalizeRelative(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function sourceFileList(root) {
  const raw = git(root, ["ls-files", "-co", "--exclude-standard", "-z"], "buffer");
  const boundary = `${path.resolve(root)}${path.sep}`;
  return raw.toString("utf8").split("\0")
    .map(normalizeRelative)
    .filter(Boolean)
    .filter((relative) => !SOURCE_EXCLUDED_PREFIXES.some((prefix) => relative.startsWith(prefix)))
    .filter((relative) => {
      const absolute = path.resolve(root, relative);
      return absolute.startsWith(boundary) && fs.existsSync(absolute) && fs.statSync(absolute).isFile();
    })
    .sort((left, right) => left.localeCompare(right));
}

export function sourceInfo(root, boundaryFiles = null) {
  const files = Array.isArray(boundaryFiles)
    ? [...new Set(boundaryFiles.map(normalizeRelative))].sort((left, right) => left.localeCompare(right))
    : sourceFileList(root);
  const records = files.map((relative) => {
    const absolute = path.resolve(root, relative);
    return fs.existsSync(absolute) && fs.statSync(absolute).isFile()
      ? `${relative}\0${fs.statSync(absolute).size}\0${hashFile(absolute)}`
      : `${relative}\0MISSING`;
  });
  const status = Array.isArray(boundaryFiles) ? [] : git(root, ["-c", "core.quotepath=false", "status", "--porcelain=v1", "--untracked-files=all"])
    .split(/\r?\n/u)
    .filter(Boolean)
    .filter((entry) => entry.slice(3).split(" -> ").some((candidate) => {
      const relative = normalizeRelative(candidate.replace(/^"|"$/gu, ""));
      return !SOURCE_EXCLUDED_PREFIXES.some((prefix) => relative.startsWith(prefix));
    }))
    .sort((left, right) => left.localeCompare(right));
  return {
    head: git(root, ["rev-parse", "HEAD"]).trim(),
    branch: git(root, ["branch", "--show-current"]).trim(),
    dirtyBoundaryHash: sha256(JSON.stringify({ records, status }))
  };
}

export function safeArtifactPath(root, artifactPath) {
  if (typeof artifactPath !== "string" || !artifactPath.trim()) return null;
  const absolute = path.resolve(root, artifactPath);
  const boundary = `${path.resolve(root)}${path.sep}`;
  return absolute.startsWith(boundary) ? absolute : null;
}

export function artifactReference(root, filePath, caseIds, evidenceTypes) {
  const absolute = path.resolve(filePath);
  const boundary = `${path.resolve(root)}${path.sep}`;
  if (!absolute.startsWith(boundary) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`DEV101_ARTIFACT_INVALID:${filePath}`);
  }
  return {
    path: normalizeRelative(path.relative(root, absolute)),
    sha256: hashFile(absolute),
    caseIds: [...caseIds],
    evidenceTypes: [...evidenceTypes]
  };
}

export function loadDev101Registry(root) {
  return readJson(path.join(root, DEV101_REGISTRY_PATH));
}

export function validateRegistry(root, registry) {
  if (registry?.schemaVersion !== 1 || registry.registryId !== "DEV-101-current-case-registry" || registry.devId !== "DEV-101") {
    throw new Error("DEV101_REGISTRY_SCHEMA_INVALID");
  }
  const expected = Array.from({ length: 48 }, (_, index) => `QA-101-${String(index + 1).padStart(3, "0")}`);
  if (JSON.stringify(registry.fixedDenominator) !== JSON.stringify(expected)) throw new Error("DEV101_FIXED_DENOMINATOR_INVALID");
  const caseIds = (registry.cases ?? []).map((item) => item.caseId);
  if (caseIds.length !== 48 || new Set(caseIds).size !== 48 || JSON.stringify(caseIds) !== JSON.stringify(expected)) {
    throw new Error("DEV101_CASE_REGISTRY_INVALID");
  }
  const coverageByRunner = new Map((registry.runnerCoverage ?? []).map((coverage) => [coverage.runner, coverage]));
  if (coverageByRunner.size !== 4) throw new Error("DEV101_RUNNER_ROSTER_INVALID");
  const caseMap = new Map(registry.cases.map((item) => [item.caseId, item]));
  for (const coverage of registry.runnerCoverage) {
    if (!coverage.runner?.startsWith("qc-dev-101-independent-") || !Array.isArray(coverage.caseIds) || coverage.caseIds.length === 0) {
      throw new Error(`DEV101_RUNNER_COVERAGE_INVALID:${coverage.runner ?? "unknown"}`);
    }
    if (new Set(coverage.caseIds).size !== coverage.caseIds.length) throw new Error(`DEV101_RUNNER_CASE_DUPLICATE:${coverage.runner}`);
    if (!Array.isArray(coverage.requiredEvidence) || coverage.requiredEvidence.length === 0) throw new Error(`DEV101_RUNNER_EVIDENCE_EMPTY:${coverage.runner}`);
    for (const caseId of coverage.caseIds) if (!caseMap.has(caseId)) throw new Error(`DEV101_RUNNER_CASE_UNKNOWN:${coverage.runner}:${caseId}`);
  }
  for (const item of registry.cases) {
    if (!/^QA-101-\d{3}$/u.test(item.caseId) || !["P0", "P1"].includes(item.risk) || !item.title) throw new Error(`DEV101_CASE_DEFINITION_INVALID:${item.caseId}`);
    if (!Array.isArray(item.requiredRunners) || item.requiredRunners.length === 0 || new Set(item.requiredRunners).size !== item.requiredRunners.length) {
      throw new Error(`DEV101_CASE_RUNNERS_INVALID:${item.caseId}`);
    }
    for (const runner of item.requiredRunners) {
      const coverage = coverageByRunner.get(runner);
      if (!coverage || !coverage.caseIds.includes(item.caseId)) throw new Error(`DEV101_CASE_RUNNER_TRACE_MISSING:${item.caseId}:${runner}`);
    }
    const reverse = registry.runnerCoverage.filter((coverage) => coverage.caseIds.includes(item.caseId)).map((coverage) => coverage.runner).sort();
    if (JSON.stringify(reverse) !== JSON.stringify([...item.requiredRunners].sort())) throw new Error(`DEV101_CASE_RUNNER_TRACE_EXTRA:${item.caseId}`);
  }
  const postgresCoverage = coverageByRunner.get("qc-dev-101-independent-postgres");
  if (postgresCoverage?.provider !== "postgresql" || JSON.stringify(postgresCoverage.caseIds) !== JSON.stringify(registry.requiredPostgresCases)) {
    throw new Error("DEV101_POSTGRES_COVERAGE_INVALID");
  }
  const browserCoverage = coverageByRunner.get("qc-dev-101-independent-browser");
  for (const caseId of registry.requiredNormalEntryCases ?? []) {
    if (!browserCoverage?.caseIds.includes(caseId) || !browserCoverage.requiredEvidence.includes("normal_entry")) {
      throw new Error(`DEV101_NORMAL_ENTRY_COVERAGE_MISSING:${caseId}`);
    }
  }
  const authorityPath = safeArtifactPath(root, registry.authorityPlan);
  if (!authorityPath || !fs.existsSync(authorityPath)) throw new Error("DEV101_AUTHORITY_PLAN_MISSING");
  const authority = fs.readFileSync(authorityPath, "utf8");
  const tableIds = [...authority.matchAll(/^\| `(?<caseId>QA-101-\d{3})` \|/gmu)].map((match) => match.groups.caseId);
  if (JSON.stringify(tableIds) !== JSON.stringify(expected)) throw new Error("DEV101_AUTHORITY_CASE_TABLE_MISMATCH");
  if (!Array.isArray(registry.integrityMutants) || registry.integrityMutants.length !== 16 || new Set(registry.integrityMutants).size !== 16) {
    throw new Error("DEV101_INTEGRITY_MUTANT_ROSTER_INVALID");
  }
  if (!Array.isArray(registry.sourceBoundary) || registry.sourceBoundary.length < 20 || new Set(registry.sourceBoundary).size !== registry.sourceBoundary.length) {
    throw new Error("DEV101_SOURCE_BOUNDARY_INVALID");
  }
  for (const relative of registry.sourceBoundary) {
    const absolute = safeArtifactPath(root, relative);
    if (!absolute || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`DEV101_SOURCE_BOUNDARY_MISSING:${relative}`);
  }
  return registry;
}

export function scanProhibitedOracleImports(root, runner) {
  const runnerPath = path.join(root, "scripts", `${runner}.mjs`);
  if (!fs.existsSync(runnerPath)) return [];
  const source = fs.readFileSync(runnerPath, "utf8");
  return PROHIBITED_ORACLE_IMPORT_PATTERNS.filter((pattern) => pattern.test(source)).map((pattern) => pattern.source);
}

function assertSource(actual, expected) {
  if (!actual || actual.head !== expected.head || actual.branch !== expected.branch || actual.dirtyBoundaryHash !== expected.dirtyBoundaryHash) {
    throw new Error("DEV101_SOURCE_FINGERPRINT_MISMATCH");
  }
}

function validateArtifactReferences(root, manifest) {
  for (const artifact of manifest.artifacts ?? []) {
    const absolute = safeArtifactPath(root, artifact.path);
    if (!absolute || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`DEV101_ARTIFACT_MISSING:${artifact.path}`);
    if (!/^[a-f0-9]{64}$/u.test(artifact.sha256 ?? "") || hashFile(absolute) !== artifact.sha256) throw new Error(`DEV101_ARTIFACT_HASH_MISMATCH:${artifact.path}`);
    if (!Array.isArray(artifact.caseIds) || artifact.caseIds.length === 0 || !Array.isArray(artifact.evidenceTypes) || artifact.evidenceTypes.length === 0) {
      throw new Error(`DEV101_ARTIFACT_TRACE_INVALID:${artifact.path}`);
    }
  }
}

export function validateIndependentChild({ root, registry, manifest, expectedRunner, expectedParentRunId, expectedSource }) {
  validateRegistry(root, registry);
  if (manifest?.schemaVersion !== DEV101_MANIFEST_SCHEMA_VERSION || manifest.devId !== "DEV-101" || manifest.independentQc !== true) throw new Error("DEV101_MANIFEST_SCHEMA_INVALID");
  if (manifest.runner !== expectedRunner) throw new Error("DEV101_RUNNER_OWNERSHIP_MISMATCH");
  if (manifest.parentRunId !== expectedParentRunId) throw new Error("DEV101_PARENT_RUN_MISMATCH");
  assertSource(manifest.source, expectedSource);
  if (manifest.registryHash !== hashFile(path.join(root, DEV101_REGISTRY_PATH))) throw new Error("DEV101_REGISTRY_HASH_MISMATCH");
  const runnerPath = path.join(root, "scripts", `${expectedRunner}.mjs`);
  if (!fs.existsSync(runnerPath) || manifest.runnerHash !== hashFile(runnerPath)) throw new Error("DEV101_RUNNER_HASH_MISMATCH");
  const coverage = registry.runnerCoverage.find((item) => item.runner === expectedRunner);
  if (!coverage) throw new Error("DEV101_RUNNER_NOT_REGISTERED");
  if (manifest.environment?.provider !== coverage.provider || manifest.environment?.dataScope !== "task-owned-isolated") throw new Error("DEV101_PROVIDER_OR_DATA_SCOPE_MISMATCH");
  const expectedCases = [...coverage.caseIds].sort();
  const actualCases = (manifest.caseResults ?? []).map((item) => item.caseId).sort();
  if (JSON.stringify(actualCases) !== JSON.stringify(expectedCases) || new Set(actualCases).size !== actualCases.length) throw new Error("DEV101_CHILD_CASE_ROSTER_MISMATCH");
  if (manifest.result !== "PASS" || manifest.firstFailure !== null) throw new Error("DEV101_CHILD_NOT_CLEAN_PASS");
  if ((manifest.prohibitedOracleImports ?? []).length !== 0 || scanProhibitedOracleImports(root, expectedRunner).length !== 0) throw new Error("DEV101_SUT_ORACLE_IMPORT");
  if (manifest.primaryInvariant?.unchanged !== true || manifest.primaryInvariant.before !== manifest.primaryInvariant.after) throw new Error("DEV101_PRIMARY_INVARIANT_CHANGED");
  const cleanup = manifest.cleanupReceipt;
  if (!cleanup?.complete || !cleanup.portsReleased || !cleanup.processesStopped || !cleanup.tempRemoved) throw new Error("DEV101_CLEANUP_INCOMPLETE");
  if (expectedRunner === "qc-dev-101-independent-browser") {
    const visible = manifest.visibleErrorAudit;
    if (!visible?.required || visible.consoleErrors !== 0 || visible.pageErrors !== 0 || visible.unexpectedRequestFailures !== 0 || visible.visibleErrorCount !== 0) {
      throw new Error("DEV101_VISIBLE_ERROR_AUDIT_FAILED");
    }
  }
  validateArtifactReferences(root, manifest);
  for (const item of manifest.caseResults) {
    if (item.result !== "PASS" || !Array.isArray(item.assertionIds) || item.assertionIds.length === 0 || item.firstFailurePointer !== null) {
      throw new Error(`DEV101_CASE_NOT_CLEAN_PASS:${item.caseId}`);
    }
    const evidence = manifest.caseEvidence?.[item.caseId];
    if (!evidence || !Array.isArray(evidence.evidenceTypes) || !Array.isArray(evidence.artifactPaths) || evidence.artifactPaths.length === 0) {
      throw new Error(`DEV101_CASE_EVIDENCE_MISSING:${item.caseId}`);
    }
    for (const evidenceType of coverage.requiredEvidence) {
      if (!evidence.evidenceTypes.includes(evidenceType)) throw new Error(`DEV101_CASE_EVIDENCE_TYPE_MISSING:${item.caseId}:${evidenceType}`);
    }
    for (const artifactPath of evidence.artifactPaths) {
      const artifact = manifest.artifacts.find((entry) => entry.path === artifactPath && entry.caseIds.includes(item.caseId));
      if (!artifact) throw new Error(`DEV101_CASE_ARTIFACT_TRACE_MISSING:${item.caseId}:${artifactPath}`);
      for (const evidenceType of evidence.evidenceTypes) if (!artifact.evidenceTypes.includes(evidenceType)) throw new Error(`DEV101_ARTIFACT_EVIDENCE_TYPE_MISSING:${item.caseId}:${evidenceType}`);
    }
  }
  return coverage;
}

export function deriveAggregateCaseResults(registry, childManifests) {
  const byRunner = new Map(childManifests.map((manifest) => [manifest.runner, manifest]));
  return registry.cases.map((item) => {
    const runnerResults = item.requiredRunners.map((runner) => ({
      runner,
      result: byRunner.get(runner)?.caseResults?.find((entry) => entry.caseId === item.caseId)?.result ?? "NOT_RUN"
    }));
    const result = runnerResults.every((entry) => entry.result === "PASS") ? "PASS" : runnerResults.some((entry) => entry.result === "FAIL") ? "FAIL" : runnerResults.some((entry) => entry.result === "BLOCKED") ? "BLOCKED" : "NOT_RUN";
    return { caseId: item.caseId, result, requiredRunners: [...item.requiredRunners], runnerResults };
  });
}
