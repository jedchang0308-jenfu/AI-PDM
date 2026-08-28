import fs from "node:fs";
import path from "node:path";

import { hashFile } from "./dev-087-evidence-lib.mjs";

export const DEV100_MANIFEST_SCHEMA_VERSION = 1;
export const DEV100_CASE_IDS = Array.from({ length: 18 }, (_, index) => `QA-100-${String(index + 1).padStart(3, "0")}`);
export const DEV100_REQUIRED_RUNNERS = ["contract", "repository", "negative", "postgres", "browser", "primary-dry-run"];

export function selectDev100Child(manifests, parentRunId) {
  const selected = manifests.filter((manifest) => manifest?.runner === "qc-dev-100-aggregate" && manifest?.parentRunId === parentRunId);
  if (selected.length !== 1) throw new Error(`DEV100_CHILD_CARDINALITY:${selected.length}`);
  return selected[0];
}

export function validateDev100ManifestEnvelope(manifest, options = {}) {
  if (manifest?.schemaVersion !== DEV100_MANIFEST_SCHEMA_VERSION || manifest?.runner !== "qc-dev-100-aggregate" || manifest?.devId !== "DEV-100") throw new Error("DEV100_MANIFEST_SCHEMA_INVALID");
  if (options.expectedParentRunId !== undefined && manifest.parentRunId !== options.expectedParentRunId) throw new Error("DEV100_PARENT_RUN_MISMATCH");
  if (options.expectedSource && (manifest.source?.head !== options.expectedSource.head || manifest.source?.branch !== options.expectedSource.branch || manifest.source?.dirtyBoundaryHash !== options.expectedSource.dirtyBoundaryHash)) throw new Error("DEV100_SOURCE_FINGERPRINT_MISMATCH");
  if (manifest.status !== "PASS" || manifest.completionCandidate !== true) throw new Error("DEV100_NOT_CLEAN_PASS");
  const caseIds = manifest.caseResults?.map((entry) => entry.caseId) ?? [];
  if (JSON.stringify(caseIds) !== JSON.stringify(DEV100_CASE_IDS) || manifest.caseResults.some((entry) => entry.result !== "PASS")) throw new Error("DEV100_CASE_ROSTER_INCOMPLETE");
  if (manifest.currentDenominator?.expected !== 18 || manifest.currentDenominator?.pass !== 18 || manifest.currentDenominator?.blocked !== 0 || manifest.currentDenominator?.notRun !== 0 || manifest.currentDenominator?.fail !== 0) throw new Error("DEV100_DENOMINATOR_INCOMPLETE");
  const runners = manifest.artifactResults?.map((entry) => entry.runner) ?? [];
  if (JSON.stringify(runners) !== JSON.stringify(DEV100_REQUIRED_RUNNERS)) throw new Error("DEV100_ARTIFACT_ROSTER_INCOMPLETE");
  if (manifest.artifactResults.some((entry) => entry.status !== "PASS")) throw new Error("DEV100_SELF_LABELLED_PASS");
  if (manifest.commands?.some((entry) => entry.status !== "PASS")) throw new Error("DEV100_COMMAND_GATE_FAILED");
  if (manifest.primaryInvariant?.unchanged !== true || manifest.cleanup?.complete !== true) throw new Error("DEV100_INVARIANT_OR_CLEANUP_INCOMPLETE");
  return manifest;
}

export function validateDev100AggregateManifest(root, manifest, options = {}) {
  validateDev100ManifestEnvelope(manifest, options);
  for (const artifact of manifest.artifactResults) {
    const artifactPath = path.resolve(root, artifact.path);
    const relative = path.relative(root, artifactPath);
    if (relative.startsWith("..") || path.isAbsolute(relative) || !fs.existsSync(artifactPath)) throw new Error(`DEV100_ARTIFACT_MISSING:${artifact.runner}`);
    if (hashFile(artifactPath) !== artifact.sha256) throw new Error(`DEV100_ARTIFACT_HASH_MISMATCH:${artifact.runner}`);
    const parsed = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    if (parsed.status !== "PASS") throw new Error(`DEV100_CHILD_NOT_PASS:${artifact.runner}`);
    if (parsed.productionWrites !== false) throw new Error(`DEV100_PRODUCTION_WRITE_EVIDENCE_INVALID:${artifact.runner}`);
    if (artifact.runner === "browser" && parsed.headed !== true) throw new Error("DEV100_BROWSER_NOT_HEADED");
    if (artifact.runner === "primary-dry-run" && (parsed.applyCount !== 0 || parsed.readOnly !== true)) throw new Error("DEV100_PRIMARY_DRY_RUN_BOUNDARY_INVALID");
    if (artifact.runner === "repository" && parsed.cleanup?.removed !== true) throw new Error("DEV100_REPOSITORY_CLEANUP_INCOMPLETE");
    if (artifact.runner === "postgres" && (!parsed.cleanup?.taskRootRemoved || !parsed.cleanup?.portReleased)) throw new Error("DEV100_POSTGRES_CLEANUP_INCOMPLETE");
  }
  return manifest;
}
