#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildDev032ProductionPrincipalBootstrapPackage,
  DEV032_PRODUCTION_FIREBASE_UID_TEMPLATE
} from "./dev-032-production-principal-bootstrap-package.mjs";
import { buildDev046CanonicalAccessMatrix } from "./dev-046-staging-principal-bootstrap-package.mjs";
import {
  assertDev032ProductionPrincipalBootstrapEnvironment,
  buildDev032ProductionPrincipalBootstrapRunPlan,
  DEV032_PRODUCTION_PRINCIPAL_BOOTSTRAP_APPROVAL
} from "./run-dev-032-production-principal-bootstrap.mjs";

const results = [];

function record(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

const verifiedUid = "prodFirebaseUidTest_001";
const template = buildDev032ProductionPrincipalBootstrapPackage();
const candidate = buildDev032ProductionPrincipalBootstrapPackage({ firebaseUid: verifiedUid });
const plan = buildDev032ProductionPrincipalBootstrapRunPlan(verifiedUid);
const canonicalAccessMatrix = buildDev046CanonicalAccessMatrix();

record("DEV032-PRINCIPAL-001 template cannot be treated as live candidate", () => {
  assert.equal(template.report.status, "template_waiting_for_verified_firebase_uid");
  assert.equal(template.report.principal.firebaseUid, DEV032_PRODUCTION_FIREBASE_UID_TEMPLATE);
  assert.throws(() => assertDev032ProductionPrincipalBootstrapEnvironment(buildDev032ProductionPrincipalBootstrapRunPlan()), /VERIFIED_UID_REQUIRED/u);
});

record("DEV032-PRINCIPAL-002 target and principal use new production identities", () => {
  assert.equal(candidate.report.target.projectId, "jenfu-ai-pdm-prod");
  assert.equal(candidate.report.target.region, "asia-east1");
  assert.equal(candidate.report.target.cloudSqlInstance, "ai-pdm-prod-postgres");
  assert.equal(candidate.report.principal.pdmUserId, "prod-pdm-admin-001");
  assert.equal(candidate.report.principal.email, "jedchang0308@jenfu.com.tw");
  assert.equal(candidate.report.principal.firebaseUid, verifiedUid);
});

record("DEV032-PRINCIPAL-003 staging identities are absent", () => {
  const serialized = JSON.stringify(candidate);
  assert.doesNotMatch(serialized, /jenfu-ai-pdm-stg|ai-pdm-stg|stg-pdm|DEV-046|\bstaging\b/iu);
});

record("DEV032-PRINCIPAL-004 canonical role and permission matrix is complete", () => {
  assert.equal(candidate.report.canonicalMatrix.roleCount, canonicalAccessMatrix.roles.length);
  assert.equal(candidate.report.canonicalMatrix.permissionCount, canonicalAccessMatrix.permissions.length);
  assert.ok(candidate.report.canonicalMatrix.roleCount > 0);
  assert.ok(candidate.report.canonicalMatrix.permissionCount > 0);
  assert.deepEqual(candidate.report.canonicalMatrix.requiredAdminRoles, ["system_admin", "pdm_admin"]);
});

record("DEV032-PRINCIPAL-005 bootstrap is transactional, idempotent and passwordless", () => {
  assert.match(candidate.bootstrapSql, /\nBEGIN;\n/u);
  assert.match(candidate.bootstrapSql, /\nCOMMIT;\n/u);
  assert.match(candidate.bootstrapSql, /ON CONFLICT/u);
  assert.match(candidate.bootstrapSql, /password_hash[\s\S]*NULL/iu);
  assert.doesNotMatch(candidate.bootstrapSql, /1655|password\s*=/iu);
});

record("DEV032-PRINCIPAL-006 collision guards and access-only rollback remain present", () => {
  assert.match(candidate.bootstrapSql, /collision/iu);
  assert.match(candidate.bootstrapSql, /RAISE EXCEPTION/iu);
  assert.doesNotMatch(candidate.rollbackSql, /DELETE\s+FROM/iu);
  assert.match(candidate.rollbackSql, /mapping_status\s*=\s*'retired'/iu);
});

record("DEV032-PRINCIPAL-007 manifest hashes match generated SQL", () => {
  for (const [path, source] of [["bootstrap.sql", candidate.bootstrapSql], ["readback.sql", candidate.readbackSql], ["rollback.sql", candidate.rollbackSql]]) {
    assert.equal(candidate.manifest.artifacts.find((item) => item.path === path)?.sha256, sha256(source));
  }
});

record("DEV032-PRINCIPAL-008 runner rejects wrong environment and accepts exact guarded contract", () => {
  const env = {
    DEV032_PRODUCTION_PRINCIPAL_BOOTSTRAP_APPROVAL,
    DEV032_PRODUCTION_FIREBASE_UID: verifiedUid,
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
  assert.doesNotThrow(() => assertDev032ProductionPrincipalBootstrapEnvironment(plan, env));
  assert.throws(() => assertDev032ProductionPrincipalBootstrapEnvironment(plan, { ...env, DEV032_PRODUCTION_FIREBASE_UID: "wrongUid" }), /UID_MISMATCH/u);
  assert.throws(() => assertDev032ProductionPrincipalBootstrapEnvironment(plan, { ...env, PDM_CLOUD_SQL_PASSWORD: "forbidden" }), /STATIC_DATABASE_SECRET_FORBIDDEN/u);
});

record("DEV032-PRINCIPAL-009 production AAL1 is not silently approved", () => {
  assert.equal(candidate.report.observedIdentityEvidence.workspaceAal1PilotAllowed, false);
  assert.equal(candidate.report.observedIdentityEvidence.workspaceMfaTrusted, false);
  assert.match(candidate.reportMarkdown, /remains fail-closed/iu);
});

for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
}
console.log(`\nDEV-032 production principal bootstrap QC: ${results.filter((item) => item.passed).length}/${results.length} passed`);
if (results.some((item) => !item.passed)) process.exitCode = 1;
