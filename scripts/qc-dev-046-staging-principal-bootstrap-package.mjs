#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEV046_STAGING_PRINCIPAL_BOOTSTRAP_PACKAGE_VERSION,
  buildDev046StagingPrincipalBootstrapPackage,
  writeDev046StagingPrincipalBootstrapPackage
} from "./dev-046-staging-principal-bootstrap-package.mjs";

const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

let tempRoot;
try {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-dev046-principal-bootstrap-qc-"));
  const packageData = buildDev046StagingPrincipalBootstrapPackage();
  const outputs = await writeDev046StagingPrincipalBootstrapPackage(packageData, tempRoot);
  const { report, manifest, bootstrapSql, readbackSql, rollbackSql } = packageData;

  record(
    "DEV046-PRINCIPAL-001 package version and approval boundary are explicit",
    report.packageVersion === DEV046_STAGING_PRINCIPAL_BOOTSTRAP_PACKAGE_VERSION &&
      report.status === "proposal_only_not_approved_for_live_apply" &&
      report.approvalBoundary.principalMappingApproved === false &&
      report.approvalBoundary.liveSqlApplyAllowed === false &&
      report.approvalBoundary.applicationDeploymentApproved === false
  );
  record(
    "DEV046-PRINCIPAL-002 package targets only the approved staging database",
    report.target.projectId === "jenfu-ai-pdm-stg-361825" &&
      report.target.cloudSqlInstance === "ai-pdm-stg-postgres" &&
      report.target.databaseName === "ai_pdm" &&
      report.target.environment === "staging"
  );
  record(
    "DEV046-PRINCIPAL-003 exact observed Firebase identity is mapped to a stable PDM ID",
    report.principal.firebaseUid === "qxEv2napjvMEmiqIUqwhTCf6gjg2" &&
      report.principal.email === "jedchang0308@jenfu.com.tw" &&
      report.principal.pdmUserId === "stg-pdm-admin-001" &&
      report.principal.platformPrincipalId === "iam:principal:stg-pdm-admin-001"
  );
  record(
    "DEV046-PRINCIPAL-004 canonical role and permission matrix is complete enough for Admin numbering",
    report.canonicalMatrix.roleCount === 9 &&
      report.canonicalMatrix.permissionCount > 150 &&
      report.canonicalMatrix.roles.some((role) => role.roleCode === "system_admin") &&
      report.canonicalMatrix.roles.some((role) => role.roleCode === "pdm_admin") &&
      bootstrapSql.includes("'numbering.create'") &&
      bootstrapSql.includes("'numbering.draft.update'") &&
      bootstrapSql.includes("'numbering.workspace.create'") &&
      bootstrapSql.includes("'numbering.publish'")
  );
  record(
    "DEV046-PRINCIPAL-005 bootstrap is transactional, idempotent and collision fail-closed",
    bootstrapSql.includes("BEGIN;") &&
      bootstrapSql.includes("COMMIT;") &&
      bootstrapSql.includes("DEV046_USER_IDENTITY_COLLISION") &&
      bootstrapSql.includes("DEV046_PRINCIPAL_MAPPING_COLLISION") &&
      bootstrapSql.includes("DEV046_AUTH_IDENTITY_COLLISION") &&
      bootstrapSql.includes("DEV046_CANONICAL_ROLE_COLLISION") &&
      (bootstrapSql.match(/IS DISTINCT FROM/gu) ?? []).length >= 6 &&
      (bootstrapSql.match(/ON CONFLICT/gu) ?? []).length >= 7
  );
  record(
    "DEV046-PRINCIPAL-006 application password and MFA secrets are absent",
    bootstrapSql.includes("password_hash = NULL") &&
      bootstrapSql.includes(", NULL,\n  'Admin'") &&
      !/password\s*=\s*['"][^'"]+['"]/iu.test(bootstrapSql) &&
      !/(?:totp|mfa)[_-]?(?:secret|seed)\s*=/iu.test(bootstrapSql)
  );
  record(
    "DEV046-PRINCIPAL-007 authorization uses UID mapping and not email-only lookup",
    bootstrapSql.includes("mapping_source = 'shared_iam'") &&
      bootstrapSql.includes("external_subject = 'qxEv2napjvMEmiqIUqwhTCf6gjg2'") &&
      bootstrapSql.includes("provider_subject = 'qxEv2napjvMEmiqIUqwhTCf6gjg2'")
  );
  record(
    "DEV046-PRINCIPAL-008 bootstrap contains no destructive DDL or business-row deletion",
    !/\b(?:DROP|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE)\b/iu.test(bootstrapSql)
  );
  record(
    "DEV046-PRINCIPAL-009 readback verifies identity, membership, organization and full canonical counts",
    readbackSql.includes("no_application_password") &&
      readbackSql.includes("firebase_mapping_ok") &&
      readbackSql.includes("default_membership_ok") &&
      readbackSql.includes("organization_mapping_ok") &&
      readbackSql.includes("canonical_roles_ok") &&
      readbackSql.includes("canonical_permissions_ok")
  );
  record(
    "DEV046-PRINCIPAL-010 rollback revokes access without deleting evidence",
    rollbackSql.includes("mapping_status = 'retired'") &&
      rollbackSql.includes("status = 'disabled'") &&
      rollbackSql.includes("account_status = 'suspended'") &&
      rollbackSql.includes("session_invalid_before = now()") &&
      !/\b(?:DELETE\s+FROM|DROP|TRUNCATE)\b/iu.test(rollbackSql)
  );
  record(
    "DEV046-PRINCIPAL-011 manifest hashes match generated SQL artifacts",
    manifest.artifacts.every((artifact) => {
      const sourceByPath = {
        "bootstrap.sql": bootstrapSql,
        "readback.sql": readbackSql,
        "rollback.sql": rollbackSql
      };
      return artifact.sha256 === sha256(sourceByPath[artifact.path]);
    })
  );
  record(
    "DEV046-PRINCIPAL-012 all package files are written",
    Object.values(outputs).every((file) => fs.existsSync(file))
  );

  console.log(JSON.stringify({ passed: results.length, total: results.length, results }, null, 2));
} finally {
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true });
}
