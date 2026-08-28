#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { collectDrawingWorkFileSnapshotAnomalies } from "../src/lib/drawing-work-file-snapshot-invariant.ts";
import { DEV100_CASE_IDS, DEV100_REQUIRED_RUNNERS, selectDev100Child, validateDev100ManifestEnvelope } from "./dev-100-evidence-lib.mjs";

const root = process.cwd();
const runId = `DEV100-negative-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV100_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-100", runId));
const checks = [];
let firstFailure = null;
fs.mkdirSync(evidenceDir, { recursive: true });

function check(label, action) {
  try { const detail = action(); checks.push({ label, status: "PASS", detail: detail ?? null }); }
  catch (error) { checks.push({ label, status: "FAIL", message: error instanceof Error ? error.message : String(error) }); throw error; }
}
function expectCode(code, action) {
  try { action(); } catch (error) { assert.equal(error instanceof Error ? error.message : String(error), code); return; }
  throw new Error(`EXPECTED_FAILURE_NOT_THROWN:${code}`);
}

try {
  const scope = { id: "work", companyId: "company", drawingId: "drawing", revisionId: "revision", migrated: true };
  const source = { id: "file", company_id: "company", drawing_id: "drawing", drawing_revision_id: "revision", source_file_asset_id: "asset", sort_order: 0, removed_at: null, removed_by: null, asset_id: "asset", content_hash: "hash", deleted_at: null, deleted_by: null, deleted_reason: null };
  const actual = { work_id: "work", file_binding_id: "file", ordinal: 0, content_hash: "hash", company_id: "company", drawing_id: "drawing", drawing_revision_id: "revision", source_file_asset_id: "asset", removed_at: null, asset_id: "asset", asset_content_hash: "hash", deleted_at: null };
  const matrix = [
    ["active asset missing", [{ ...source, asset_id: null }], [actual], "source_asset_invalid"],
    ["active asset deleted", [{ ...source, deleted_at: "now", deleted_by: "actor" }], [{ ...actual, deleted_at: "now" }], "active_source_asset_deleted"],
    ["missing binding", [source], [], "missing_binding"],
    ["extra binding", [source], [actual, { ...actual, file_binding_id: "extra", ordinal: 1 }], "extra_binding"],
    ["hash drift", [source], [{ ...actual, content_hash: "drift" }], "content_hash_mismatch"],
    ["scope drift", [source], [{ ...actual, company_id: "other" }], "scope_mismatch"],
    ["ordinal drift", [source], [{ ...actual, ordinal: 2 }], "ordinal_mismatch"]
  ];
  for (const [label, sourceRows, actualRows, expected] of matrix) check(label, () => {
    const anomalies = collectDrawingWorkFileSnapshotAnomalies({ scope, sourceRows, actualRows });
    assert.ok(anomalies.includes(expected), `${label}: ${anomalies.join(",")}`);
    return anomalies;
  });
  check("allowlisted replacement tombstone remains legal", () => {
    const retired = { ...source, id: "old", source_file_asset_id: "old-asset", asset_id: "old-asset", removed_at: "now", removed_by: "actor", deleted_at: "now", deleted_by: "actor", deleted_reason: "drawing_revision_work_file_replaced" };
    assert.deepEqual(collectDrawingWorkFileSnapshotAnomalies({ scope, sourceRows: [retired, source], actualRows: [actual] }), []);
  });

  const sourceFingerprint = { head: "head", branch: "branch", dirtyBoundaryHash: "dirty" };
  const baseManifest = {
    schemaVersion: 1,
    runner: "qc-dev-100-aggregate",
    devId: "DEV-100",
    parentRunId: "parent",
    status: "PASS",
    completionCandidate: true,
    source: sourceFingerprint,
    caseResults: DEV100_CASE_IDS.map((caseId) => ({ caseId, result: "PASS" })),
    currentDenominator: { expected: 18, pass: 18, blocked: 0, notRun: 0, fail: 0 },
    artifactResults: DEV100_REQUIRED_RUNNERS.map((runner) => ({ runner, status: "PASS" })),
    commands: [{ status: "PASS" }],
    primaryInvariant: { unchanged: true },
    cleanup: { complete: true }
  };
  check("DEV-097 rejects missing DEV-100 child", () => expectCode("DEV100_CHILD_CARDINALITY:0", () => selectDev100Child([], "parent")));
  check("DEV-097 rejects wrong parent run", () => expectCode("DEV100_CHILD_CARDINALITY:0", () => selectDev100Child([{ ...baseManifest, parentRunId: "other" }], "parent")));
  check("DEV-097 rejects stale DEV-100 source", () => expectCode("DEV100_SOURCE_FINGERPRINT_MISMATCH", () => validateDev100ManifestEnvelope({ ...baseManifest, source: { ...sourceFingerprint, dirtyBoundaryHash: "stale" } }, { expectedParentRunId: "parent", expectedSource: sourceFingerprint })));
  check("DEV-097 rejects self-labelled PASS with failed child", () => expectCode("DEV100_SELF_LABELLED_PASS", () => validateDev100ManifestEnvelope({ ...baseManifest, artifactResults: baseManifest.artifactResults.map((entry, index) => index === 0 ? { ...entry, status: "FAIL" } : entry) }, { expectedParentRunId: "parent", expectedSource: sourceFingerprint })));
} catch (error) { firstFailure = error instanceof Error ? error.stack ?? error.message : String(error); }

const manifest = { runner: "negative", runId, status: !firstFailure && checks.every((entry) => entry.status === "PASS") ? "PASS" : "FAIL", productionWrites: false, checks, firstFailure };
fs.writeFileSync(path.join(evidenceDir, "negative.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runner: manifest.runner, status: manifest.status, passed: checks.filter((entry) => entry.status === "PASS").length, total: checks.length }));
if (manifest.status !== "PASS") process.exitCode = 1;
