#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PRODUCTION_AUTHORITY_REPAIR_APPROVAL,
  PRODUCTION_AUTHORITY_TARGET,
  assertAuthorityProjection,
  assertAuthorityRepairEnvironment,
  normalizeExpectedCommit,
  repairAuthorityControlWithClient
} from "./run-production-authority-control-repair.mjs";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
const results = [];
const record = async (name, check) => {
  try {
    await check();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
};

const sourceRevision = "301b70bcac2aa90cee498c387f2db9b102f3c3a2";
const validEnv = {
  PDM_PRODUCTION_AUTHORITY_REPAIR_APPROVAL: PRODUCTION_AUTHORITY_REPAIR_APPROVAL,
  PDM_PRODUCTION_PROJECT_ID: PRODUCTION_AUTHORITY_TARGET.project,
  PDM_PRODUCTION_REGION: PRODUCTION_AUTHORITY_TARGET.region,
  CLOUD_RUN_JOB: PRODUCTION_AUTHORITY_TARGET.job,
  PDM_DB_PROVIDER: "cloud_sql_postgres",
  PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: PRODUCTION_AUTHORITY_TARGET.connectionName,
  PDM_CLOUD_SQL_HOST: "127.0.0.1",
  PDM_CLOUD_SQL_DATABASE: PRODUCTION_AUTHORITY_TARGET.database,
  PDM_CLOUD_SQL_USER: PRODUCTION_AUTHORITY_TARGET.databaseUser,
  PDM_SOURCE_REVISION: sourceRevision,
  PDM_AUTHORITY_NEW_COMMIT: sourceRevision,
  PDM_AUTHORITY_EXPECTED_CURRENT_COMMIT: "__EMPTY__",
  PDM_AUTHORITY_EXPECTED_ROW_VERSION: "2"
};

await record("PROD-AUTH-001 target and approval are production-pinned", () => {
  assert.deepEqual(PRODUCTION_AUTHORITY_TARGET, {
    project: "jenfu-ai-pdm-prod",
    region: "asia-east1",
    job: "ai-pdm-prod-migration-runner",
    connectionName: "jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-postgres",
    database: "ai_pdm",
    databaseUser: "ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam",
    mode: "canonical_only",
    schemaHash: "dev090-v1"
  });
  assert.equal(PRODUCTION_AUTHORITY_REPAIR_APPROVAL, "AI-PDM-PRODUCTION-AUTHORITY-REPAIR-APPROVED");
});

await record("PROD-AUTH-002 environment requires exact source, database and CAS inputs", () => {
  assert.deepEqual(assertAuthorityRepairEnvironment(validEnv), {
    sourceRevision,
    newCommit: sourceRevision,
    expectedCommit: "",
    expectedRowVersion: 2
  });
  assert.throws(() => assertAuthorityRepairEnvironment({ ...validEnv, PDM_PRODUCTION_PROJECT_ID: "wrong" }), /TARGET_MISMATCH/u);
  assert.throws(() => assertAuthorityRepairEnvironment({ ...validEnv, PDM_CLOUD_SQL_PASSWORD: "forbidden" }), /STATIC_DATABASE_SECRET_FORBIDDEN/u);
  assert.throws(() => assertAuthorityRepairEnvironment({ ...validEnv, PDM_AUTHORITY_NEW_COMMIT: "0".repeat(40) }), /SOURCE_REVISION_MISMATCH/u);
});

await record("PROD-AUTH-003 empty expected commit uses an explicit sentinel", () => {
  assert.equal(normalizeExpectedCommit("__EMPTY__"), "");
  assert.equal(normalizeExpectedCommit(sourceRevision), sourceRevision);
  assert.throws(() => normalizeExpectedCommit(""), /EXPECTED_COMMIT_INVALID/u);
});

await record("PROD-AUTH-004 compare projection rejects mode, schema, commit and row-version drift", () => {
  const row = { id: 1, mode: "canonical_only", expected_commit: "", schema_hash: "dev090-v1", row_version: 2, switched_at: "2026-08-29T00:00:00Z" };
  assert.equal(assertAuthorityProjection(row, { expectedCommit: "", expectedRowVersion: 2 }).rowVersion, 2);
  assert.throws(() => assertAuthorityProjection({ ...row, row_version: 3 }, { expectedCommit: "", expectedRowVersion: 2 }), /COMPARE_AND_SWAP_MISMATCH/u);
  assert.throws(() => assertAuthorityProjection({ ...row, schema_hash: "wrong" }, { expectedCommit: "", expectedRowVersion: 2 }), /COMPARE_AND_SWAP_MISMATCH/u);
});

await record("PROD-AUTH-005 runner updates only expected_commit, row_version and switched_at", async () => {
  const beforeRow = { id: 1, mode: "canonical_only", expected_commit: "", schema_hash: "dev090-v1", row_version: 2, switched_at: "2026-08-29T00:00:00Z" };
  const afterRow = { ...beforeRow, expected_commit: sourceRevision, row_version: 3, switched_at: "2026-08-29T01:00:00Z" };
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/^SELECT/iu.test(sql.trim())) return { rows: [beforeRow], rowCount: 1 };
      if (/^UPDATE/iu.test(sql.trim())) return { rows: [afterRow], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }
  };
  const result = await repairAuthorityControlWithClient(client, {
    sourceRevision,
    newCommit: sourceRevision,
    expectedCommit: "",
    expectedRowVersion: 2
  });
  assert.equal(result.before.expectedCommit, "");
  assert.equal(result.after.expectedCommit, sourceRevision);
  assert.equal(result.after.rowVersion, 3);
  const update = calls.find((call) => /^UPDATE/iu.test(call.sql.trim()));
  assert.ok(update);
  assert.doesNotMatch(update.sql, /SET\s+(?:mode|schema_hash)\s*=/iu);
  assert.deepEqual(update.params, [sourceRevision, "canonical_only", "dev090-v1", "", 2]);
  assert.equal(calls.at(-1).sql, "COMMIT");
});

await record("PROD-AUTH-006 failed CAS rolls back", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (/^SELECT/iu.test(sql.trim())) return { rows: [{ id: 1, mode: "canonical_only", expected_commit: "", schema_hash: "dev090-v1", row_version: 9, switched_at: "2026-08-29T00:00:00Z" }] };
      return { rows: [], rowCount: 0 };
    }
  };
  await assert.rejects(
    repairAuthorityControlWithClient(client, { newCommit: sourceRevision, expectedCommit: "", expectedRowVersion: 2 }),
    /COMPARE_AND_SWAP_MISMATCH/u
  );
  assert.equal(calls.at(-1), "ROLLBACK");
});

await record("PROD-AUTH-007 package and runbook expose the guarded repair", () => {
  const packageJson = JSON.parse(read("package.json"));
  const runbook = read(".ai-doc/runbooks/runbook-dev-032-production-activation-2026-07-15.md");
  assert.equal(packageJson.scripts?.["production:authority-repair"], "node scripts/run-production-authority-control-repair.mjs");
  assert.equal(packageJson.scripts?.["qc:production-authority-repair"], "node scripts/qc-production-authority-control-repair.mjs");
  assert.match(runbook, /compare-and-swap/iu);
  assert.match(runbook, /PDM_BUILD_COMMIT/u);
  assert.match(runbook, /料號.*圖號.*200/u);
});

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}
const failures = results.filter((result) => !result.passed);
console.log(`\nProduction authority repair QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
