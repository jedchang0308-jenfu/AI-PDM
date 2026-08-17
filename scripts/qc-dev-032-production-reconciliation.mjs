#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildDev032ProductionReconciliationPackage } from "./dev-032-production-reconciliation-package.mjs";
import { buildDev046CloudSqlMigrationRunPlan } from "./run-dev-046-cloudsql-migrations.mjs";
import {
  assertDev032ProductionReconciliationEnvironment,
  assertDev032ProductionReconciliationReadback,
  buildDev032ProductionReconciliationRunPlan,
  DEV032_PRODUCTION_RECONCILIATION_APPROVAL
} from "./run-dev-032-production-reconciliation.mjs";

const results = [];

function record(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

const packageData = buildDev032ProductionReconciliationPackage();
const plan = buildDev032ProductionReconciliationRunPlan();
const migrationPlan = buildDev046CloudSqlMigrationRunPlan("output/dev-032-cloudsql-migration-package/cloudsql-migration-manifest.json");
const zeroColumns = {
  missing_migration_count: 0,
  extra_migration_count: 0,
  checksum_mismatch_count: 0,
  duplicate_root_count: 0,
  duplicate_part_count: 0,
  duplicate_drawing_count: 0,
  active_number_reuse_count: 0,
  duplicate_active_candidate_count: 0,
  sequence_regression_count: 0,
  orphan_candidate_count: 0,
  orphan_promoted_target_count: 0,
  stale_processing_receipt_count: 0,
  gcs_evidence_count: 0
};
const cleanRow = {
  ...zeroColumns,
  expected_migration_count: migrationPlan.schemaMigrationCount,
  actual_migration_count: migrationPlan.schemaMigrationCount,
  company_count: 1,
  active_admin_count: 1,
  role_count: 9,
  permission_count: 237,
  root_count: 0,
  part_count: 0,
  drawing_count: 0,
  legacy_draft_count: 0,
  workspace_count: 0,
  numbering_snapshot: { sequences: [], official: [], reservations: [], recovery: [], drafts: [] }
};

record("DEV032-RECON-001 package is production-only and read-only", () => {
  assert.equal(packageData.report.target.projectId, "jenfu-ai-pdm-prod");
  assert.equal(packageData.report.expectedMigrationCount, migrationPlan.schemaMigrationCount);
  assert.equal(plan.expectedMigrationCount, migrationPlan.schemaMigrationCount);
  assert.equal(packageData.report.mutationAllowed, false);
  assert.doesNotMatch(packageData.readbackSql, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE)\b/iu);
});

record("DEV032-RECON-002 manifest hash matches SQL", () => {
  assert.equal(packageData.manifest.readbackSqlSha256, crypto.createHash("sha256").update(packageData.readbackSql).digest("hex"));
});

record("DEV032-RECON-003 SQL covers migration and numbering invariants", () => {
  for (const needle of [
    "checksum_mismatch_count",
    "active_number_reuse_count",
    "sequence_regression_count",
    "orphan_candidate_count",
    "orphan_promoted_target_count",
    "stale_processing_receipt_count",
    "gcs_evidence_count",
    "numbering_snapshot"
  ]) assert.match(packageData.readbackSql, new RegExp(needle, "u"));
});

record("DEV032-RECON-004 clean pre-canary row passes with stable snapshot hash", () => {
  const first = assertDev032ProductionReconciliationReadback(plan, "pre_canary", cleanRow);
  const second = assertDev032ProductionReconciliationReadback(plan, "restore", cleanRow);
  assert.equal(first.allChecksPassed, true);
  assert.equal(first.numberingSnapshotSha256, second.numberingSnapshotSha256);
});

record("DEV032-RECON-005 any collision, regression or orphan fails closed", () => {
  for (const column of ["duplicate_part_count", "active_number_reuse_count", "sequence_regression_count", "orphan_candidate_count"]) {
    assert.throws(() => assertDev032ProductionReconciliationReadback(plan, "post_smoke", { ...cleanRow, [column]: 1 }), new RegExp(column, "u"));
  }
});

record("DEV032-RECON-006 pre-canary rejects business rows while post-smoke permits valid rows", () => {
  assert.throws(() => assertDev032ProductionReconciliationReadback(plan, "pre_canary", { ...cleanRow, part_count: 1 }), /PRECANARY_NOT_CLEAN/u);
  assert.equal(assertDev032ProductionReconciliationReadback(plan, "post_smoke", { ...cleanRow, part_count: 1 }).allChecksPassed, true);
});

record("DEV032-RECON-007 environment guard accepts source and isolated restore only", () => {
  const base = {
    DEV032_PRODUCTION_RECONCILIATION_APPROVAL,
    DEV032_PRODUCTION_PROJECT_ID: "jenfu-ai-pdm-prod",
    DEV032_PRODUCTION_REGION: "asia-east1",
    DEV032_EXPECTED_SOURCE_REVISION: "a".repeat(40),
    PDM_SOURCE_REVISION: "a".repeat(40),
    CLOUD_RUN_JOB: "ai-pdm-prod-migration-runner",
    PDM_DB_PROVIDER: "cloud_sql_postgres",
    PDM_CLOUD_SQL_HOST: "127.0.0.1",
    PDM_CLOUD_SQL_DATABASE: "ai_pdm",
    PDM_CLOUD_SQL_USER: "ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam"
  };
  assert.doesNotThrow(() => assertDev032ProductionReconciliationEnvironment(plan, { ...base, DEV032_RECONCILIATION_MODE: "pre_canary", PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: "jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-postgres" }));
  assert.doesNotThrow(() => assertDev032ProductionReconciliationEnvironment(plan, { ...base, DEV032_RECONCILIATION_MODE: "restore", PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: "jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-restore-20260716-a1b2c3" }));
  assert.throws(() => assertDev032ProductionReconciliationEnvironment(plan, { ...base, DEV032_RECONCILIATION_MODE: "restore", PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: "jenfu-ai-pdm-stg-361825:asia-east1:ai-pdm-stg-postgres" }), /CONNECTION_TARGET_MISMATCH/u);
});

record("DEV032-RECON-008 static database secrets and source drift are forbidden", () => {
  const env = {
    DEV032_PRODUCTION_RECONCILIATION_APPROVAL,
    DEV032_RECONCILIATION_MODE: "post_smoke",
    DEV032_PRODUCTION_PROJECT_ID: "jenfu-ai-pdm-prod",
    DEV032_PRODUCTION_REGION: "asia-east1",
    DEV032_EXPECTED_SOURCE_REVISION: "a".repeat(40),
    PDM_SOURCE_REVISION: "a".repeat(40),
    CLOUD_RUN_JOB: "ai-pdm-prod-migration-runner",
    PDM_DB_PROVIDER: "cloud_sql_postgres",
    PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: "jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-postgres",
    PDM_CLOUD_SQL_HOST: "127.0.0.1",
    PDM_CLOUD_SQL_DATABASE: "ai_pdm",
    PDM_CLOUD_SQL_USER: "ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam"
  };
  assert.throws(() => assertDev032ProductionReconciliationEnvironment(plan, { ...env, PDM_CLOUD_SQL_PASSWORD: "forbidden" }), /STATIC_DATABASE_SECRET_FORBIDDEN/u);
  assert.throws(() => assertDev032ProductionReconciliationEnvironment(plan, { ...env, DEV032_EXPECTED_SOURCE_REVISION: "b".repeat(40) }), /SOURCE_REVISION_MISMATCH/u);
});

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
console.log(`\nDEV-032 production reconciliation QC: ${results.filter((item) => item.passed).length}/${results.length} passed`);
if (results.some((item) => !item.passed)) process.exitCode = 1;
