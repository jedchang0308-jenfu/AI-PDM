#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { buildDev032ReleaseSourceManifest, DEV032_RELEASE_SOURCE_OUTPUT } from "./dev-032-release-source-manifest-utils.mjs";

const root = process.cwd();
const results = [];
const record = (name, passed, detail = "") => results.push({ name, passed: Boolean(passed), detail });
const manifestPath = path.join(root, ...DEV032_RELEASE_SOURCE_OUTPUT.split("/"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const rebuilt = buildDev032ReleaseSourceManifest(root);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

record("DEV032-SOURCE-001 manifest has DEV-032 schema", manifest.schemaVersion === 1 && manifest.dev === "DEV-032");
record("DEV032-SOURCE-002 manifest is not release-ready evidence", ["source_snapshot_manifested_not_release_ready", "release_source_committed_production_gate_blocked"].includes(manifest.status) && manifest.productionActionPerformed === false && manifest.releaseDecision.safeToBuildForProduction === false);
record("DEV032-SOURCE-003 source snapshot hash is reproducible", manifest.releaseDecision.sourceSnapshotSha256 === rebuilt.releaseDecision.sourceSnapshotSha256);
record("DEV032-SOURCE-004 classification hash is reproducible excluding generated evidence output", manifest.releaseDecision.classificationSha256 === rebuilt.releaseDecision.classificationSha256);
record("DEV032-SOURCE-005 every dirty entry is classified", manifest.summary.unknownRiskEntries === 0, JSON.stringify(manifest.summary.byBucket));
const expectedDirtySnapshotBuckets = ["included_application_source", "included_release_tooling", "included_schema_migration_source", "included_platform_contract", "included_release_governance", "included_build_runtime_config"];
const includedBucketEntries = Object.entries(manifest.summary.byBucket).filter(([bucket]) => bucket.startsWith("included_"));
record(
  "DEV032-SOURCE-006 included source state matches manifest mode",
  manifest.releaseDecision.exactReleaseCommitExists
    ? manifest.summary.includedProductionSourceEntries === 0 && expectedDirtySnapshotBuckets.every((bucket) => (manifest.summary.byBucket[bucket] ?? 0) === 0)
    : manifest.summary.includedProductionSourceEntries > 0 &&
      includedBucketEntries.length > 0 &&
      includedBucketEntries.every(([bucket, count]) => expectedDirtySnapshotBuckets.includes(bucket) && count > 0)
);
record("DEV032-SOURCE-007 generated evidence is excluded from production source", manifest.files.filter((file) => file.path.startsWith("output/") || file.path.startsWith(".firebase/")).every((file) => file.bucket === "generated_evidence_excluded" && file.includedInProductionSource === false));
record("DEV032-SOURCE-008 staging provider inputs are excluded from production config", [".firebaserc", "firebase.json", "firebase-hosting/", "infra/google-cloud/staging/", "config/platform/staging-preflight.template.json"].every((prefix) => manifest.files.filter((file) => file.path === prefix || file.path.startsWith(prefix)).every((file) => file.bucket === "staging_only_excluded_from_production_config" && file.includedInProductionSource === false)));
record("DEV032-SOURCE-009 file records expose hashes without contents", manifest.files.every((file) => !("content" in file) && (file.exists === false || /^[a-f0-9]{64}$/u.test(file.sha256 ?? ""))));
record("DEV032-SOURCE-010 stop conditions preserve release gate blockers", manifest.stopConditions.some((item) => item.includes("production target")) && manifest.stopConditions.some((item) => item.includes("Level 3/4")));
record("DEV032-SOURCE-011 package exposes generator and QC scripts", packageJson.scripts["dev-032:release-source-manifest"] === "node scripts/generate-dev-032-release-source-manifest.mjs" && packageJson.scripts["qc:dev-032-release-source-manifest"] === "node scripts/qc-dev-032-release-source-manifest.mjs");
record("DEV032-SOURCE-012 exact commit state matches remaining included source", manifest.releaseDecision.exactReleaseCommitExists === (manifest.summary.includedProductionSourceEntries === 0 && manifest.summary.unknownRiskEntries === 0));

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-032 release source manifest QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
