#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEV046_STAGING_PRINCIPAL_BOOTSTRAP_PACKAGE_VERSION =
  "dev-046-staging-principal-bootstrap/v1";

const root = process.cwd();
const defaultOutputDir = path.join(root, "output", "dev-046-staging-principal-bootstrap");
const canonicalSchemaPath = "db/schema.sql";

const target = Object.freeze({
  projectId: "jenfu-ai-pdm-stg-361825",
  region: "asia-east1",
  cloudSqlInstance: "ai-pdm-stg-postgres",
  connectionName: "jenfu-ai-pdm-stg-361825:asia-east1:ai-pdm-stg-postgres",
  databaseName: "ai_pdm",
  migrationIamDatabaseUser: "pdm-migration-stg@jenfu-ai-pdm-stg-361825.iam",
  environment: "staging"
});

const principal = Object.freeze({
  firebaseUid: "qxEv2napjvMEmiqIUqwhTCf6gjg2",
  email: "jedchang0308@jenfu.com.tw",
  displayName: "[鉦富]張仕杰 Jed",
  pdmUserId: "stg-pdm-admin-001",
  platformPrincipalId: "iam:principal:stg-pdm-admin-001",
  authIdentityId: "auth-google-stg-pdm-admin-001",
  role: "Admin",
  requiresPrivilegedAssurance: true
});

const company = Object.freeze({
  id: "company-jenfu",
  code: "JENFU",
  displayName: "鉦富",
  platformOrganizationId: "iam:organization:jenfu",
  externalOrganizationKey: "jenfu"
});

function projectPath(relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

function read(relativePath) {
  return fs.readFileSync(projectPath(relativePath), "utf8");
}

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function decodeSqlString(value) {
  return value.replaceAll("''", "'");
}

function extractCanonicalRoles(schema) {
  const block = schema.match(
    /INSERT OR IGNORE INTO roles\s*\(id, role_code, title, system_defined\)\s*VALUES([\s\S]*?);/iu
  );
  if (!block) throw new Error("DEV046_CANONICAL_ROLE_BLOCK_NOT_FOUND");
  const roles = [];
  const tuple = /\(\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*(\d+)\s*\)/gu;
  for (const match of block[1].matchAll(tuple)) {
    roles.push({
      id: decodeSqlString(match[1]),
      roleCode: decodeSqlString(match[2]),
      title: decodeSqlString(match[3]),
      systemDefined: Number(match[4])
    });
  }
  if (roles.length === 0) throw new Error("DEV046_CANONICAL_ROLES_EMPTY");
  return roles;
}

function extractCanonicalPermissions(schema) {
  const blocks = [
    { name: "default_role_permissions", columns: 4 },
    { name: "number_state_flow_permissions", columns: 2 },
    { name: "transfer_phase1d_permissions", columns: 2 }
  ];
  const permissions = [];

  for (const definition of blocks) {
    const blockPattern = new RegExp(
      `WITH\\s+${definition.name}\\s*\\([^)]*\\)\\s+AS\\s*\\(\\s*VALUES([\\s\\S]*?)\\)\\s*INSERT OR IGNORE INTO role_permissions[\\s\\S]*?;`,
      "iu"
    );
    const block = schema.match(blockPattern);
    if (!block) throw new Error(`DEV046_CANONICAL_PERMISSION_BLOCK_NOT_FOUND:${definition.name}`);

    if (definition.columns === 4) {
      const tuple = /\(\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*(\d+)\s*\)/gu;
      for (const match of block[1].matchAll(tuple)) {
        permissions.push({
          source: definition.name,
          roleCode: decodeSqlString(match[1]),
          permissionKind: decodeSqlString(match[2]),
          permissionCode: decodeSqlString(match[3]),
          allowed: Number(match[4])
        });
      }
    } else {
      const tuple = /\(\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*\)/gu;
      for (const match of block[1].matchAll(tuple)) {
        permissions.push({
          source: definition.name,
          roleCode: decodeSqlString(match[1]),
          permissionKind: "action",
          permissionCode: decodeSqlString(match[2]),
          allowed: 1
        });
      }
    }
  }

  const unique = new Map();
  for (const permission of permissions) {
    const key = `${permission.roleCode}:${permission.permissionKind}:${permission.permissionCode}`;
    unique.set(key, permission);
  }
  if (unique.size === 0) throw new Error("DEV046_CANONICAL_PERMISSIONS_EMPTY");
  return [...unique.values()];
}

export function buildDev046CanonicalAccessMatrix() {
  const schema = read(canonicalSchemaPath);
  const roles = extractCanonicalRoles(schema);
  const permissions = extractCanonicalPermissions(schema);
  const roleCodes = new Set(roles.map((role) => role.roleCode));
  const unknownPermissionRoles = permissions.filter((permission) => !roleCodes.has(permission.roleCode));
  if (unknownPermissionRoles.length > 0) {
    throw new Error(`DEV046_PERMISSION_ROLE_MISSING:${unknownPermissionRoles.map((item) => item.roleCode).join(",")}`);
  }
  return {
    canonicalSchemaSha256: sha256(schema),
    roles,
    permissions
  };
}

function permissionId(permission) {
  const normalizedCode = permission.permissionCode.replace(/[._]/gu, "-");
  return `default-perm-${permission.roleCode}-${permission.permissionKind}-${normalizedCode}`;
}

function valuesSql(rows) {
  return rows.map((row) => `    (${row.map(sqlString).join(", ")})`).join(",\n");
}

function buildBootstrapSql({ roles, permissions, canonicalSchemaSha256 }) {
  const roleValues = valuesSql(
    roles.map((role) => [role.id, role.roleCode, role.title, String(role.systemDefined)])
  ).replaceAll("'1'", "1").replaceAll("'0'", "0");
  const permissionValues = valuesSql(
    permissions.map((permission) => [
      permissionId(permission),
      permission.roleCode,
      permission.permissionKind,
      permission.permissionCode,
      String(permission.allowed)
    ])
  ).replaceAll("'1'", "1").replaceAll("'0'", "0");

  return `-- DEV-046 staging initial principal bootstrap
-- Status: proposal_only_not_approved_for_live_apply
-- Canonical role/permission source: ${canonicalSchemaPath}
-- Canonical source SHA-256: ${canonicalSchemaSha256}
-- This package never stores a password, MFA secret, recovery code or Google credential.

BEGIN;
SET LOCAL search_path = public;
SELECT pg_advisory_xact_lock(7104604602);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM companies
    WHERE (id = ${sqlString(company.id)} OR company_code = ${sqlString(company.code)})
      AND (id IS DISTINCT FROM ${sqlString(company.id)} OR company_code IS DISTINCT FROM ${sqlString(company.code)})
  ) THEN RAISE EXCEPTION 'DEV046_COMPANY_IDENTITY_COLLISION'; END IF;

  IF EXISTS (
    SELECT 1 FROM users
    WHERE (id = ${sqlString(principal.pdmUserId)} OR lower(email) = ${sqlString(principal.email)})
      AND (id IS DISTINCT FROM ${sqlString(principal.pdmUserId)} OR lower(email) IS DISTINCT FROM ${sqlString(principal.email)})
  ) THEN RAISE EXCEPTION 'DEV046_USER_IDENTITY_COLLISION'; END IF;

  IF EXISTS (
    SELECT 1 FROM platform_principal_mappings
    WHERE (platform_principal_id = ${sqlString(principal.platformPrincipalId)}
        OR pdm_user_id = ${sqlString(principal.pdmUserId)}
        OR (mapping_source = 'shared_iam' AND external_subject = ${sqlString(principal.firebaseUid)}))
      AND (platform_principal_id, pdm_user_id, mapping_source, external_subject)
        IS DISTINCT FROM (${sqlString(principal.platformPrincipalId)}, ${sqlString(principal.pdmUserId)}, 'shared_iam', ${sqlString(principal.firebaseUid)})
  ) THEN RAISE EXCEPTION 'DEV046_PRINCIPAL_MAPPING_COLLISION'; END IF;

  IF EXISTS (
    SELECT 1 FROM auth_identities
    WHERE (id = ${sqlString(principal.authIdentityId)}
        OR (provider = 'google_oauth' AND provider_subject = ${sqlString(principal.firebaseUid)})
        OR (user_id = ${sqlString(principal.pdmUserId)} AND provider = 'google_oauth'))
      AND (id, user_id, provider, provider_subject)
        IS DISTINCT FROM (${sqlString(principal.authIdentityId)}, ${sqlString(principal.pdmUserId)}, 'google_oauth', ${sqlString(principal.firebaseUid)})
  ) THEN RAISE EXCEPTION 'DEV046_AUTH_IDENTITY_COLLISION'; END IF;

  IF EXISTS (
    SELECT 1 FROM platform_organization_mappings
    WHERE (platform_organization_id = ${sqlString(company.platformOrganizationId)}
        OR pdm_company_id = ${sqlString(company.id)}
        OR (mapping_source = 'shared_core' AND external_organization_key = ${sqlString(company.externalOrganizationKey)}))
      AND (platform_organization_id, pdm_company_id, mapping_source, external_organization_key)
        IS DISTINCT FROM (${sqlString(company.platformOrganizationId)}, ${sqlString(company.id)}, 'shared_core', ${sqlString(company.externalOrganizationKey)})
  ) THEN RAISE EXCEPTION 'DEV046_ORGANIZATION_MAPPING_COLLISION'; END IF;

  IF EXISTS (
    SELECT 1
    FROM roles r
    JOIN (VALUES
${roleValues}
    ) AS expected(id, role_code, title, system_defined)
      ON r.id = expected.id OR r.role_code = expected.role_code
    WHERE r.id IS DISTINCT FROM expected.id OR r.role_code IS DISTINCT FROM expected.role_code
  ) THEN RAISE EXCEPTION 'DEV046_CANONICAL_ROLE_COLLISION'; END IF;
END
$$;

INSERT INTO companies (id, company_code, display_name, created_at, updated_at)
VALUES (${sqlString(company.id)}, ${sqlString(company.code)}, ${sqlString(company.displayName)}, now(), now())
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  updated_at = now();

WITH canonical_roles(id, role_code, title, system_defined) AS (
  VALUES
${roleValues}
)
INSERT INTO roles (id, role_code, title, system_defined, enabled, created_at, updated_at)
SELECT id, role_code, title, system_defined, 1, now(), now()
FROM canonical_roles
ON CONFLICT (role_code) DO UPDATE SET
  title = EXCLUDED.title,
  system_defined = 1,
  enabled = 1,
  updated_at = now();

WITH canonical_permissions(id, role_code, permission_kind, permission_code, allowed) AS (
  VALUES
${permissionValues}
)
INSERT INTO role_permissions (
  id, role_id, permission_kind, permission_code, allowed, created_at, updated_at
)
SELECT p.id, r.id, p.permission_kind, p.permission_code, p.allowed, now(), now()
FROM canonical_permissions p
JOIN roles r ON r.role_code = p.role_code
ON CONFLICT (role_id, permission_kind, permission_code) DO UPDATE SET
  allowed = EXCLUDED.allowed,
  updated_at = now();

INSERT INTO users (
  id, display_name, email, password_hash, role, company_id,
  account_status, account_lifecycle_version, system_role_enabled,
  account_status_changed_at, account_status_changed_by, account_status_reason,
  created_at, updated_at
)
VALUES (
  ${sqlString(principal.pdmUserId)}, ${sqlString(principal.displayName)}, ${sqlString(principal.email)}, NULL,
  ${sqlString(principal.role)}, ${sqlString(company.id)}, 'active', 1, 1,
  now(), NULL, 'DEV-046 staging initial Google Admin bootstrap', now(), now()
)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  email = EXCLUDED.email,
  password_hash = NULL,
  role = EXCLUDED.role,
  company_id = EXCLUDED.company_id,
  account_status = 'active',
  system_role_enabled = 1,
  account_status_changed_at = now(),
  account_status_changed_by = NULL,
  account_status_reason = EXCLUDED.account_status_reason,
  updated_at = now();

INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
VALUES (${sqlString(principal.pdmUserId)}, ${sqlString(company.id)}, 1, now())
ON CONFLICT (user_id, company_id) DO UPDATE SET is_default = 1;

INSERT INTO auth_identities (
  id, user_id, provider, provider_subject, login_identifier, email_normalized,
  verified_at, status, identity_lifecycle_version, created_at, updated_at
)
VALUES (
  ${sqlString(principal.authIdentityId)}, ${sqlString(principal.pdmUserId)}, 'google_oauth',
  ${sqlString(principal.firebaseUid)}, ${sqlString(principal.email)}, ${sqlString(principal.email)},
  now(), 'active', 1, now(), now()
)
ON CONFLICT (provider, provider_subject) DO UPDATE SET
  login_identifier = EXCLUDED.login_identifier,
  email_normalized = EXCLUDED.email_normalized,
  verified_at = EXCLUDED.verified_at,
  status = 'active',
  updated_at = now();

INSERT INTO platform_organization_mappings (
  platform_organization_id, pdm_company_id, mapping_source, mapping_status,
  external_organization_key, created_at, updated_at
)
VALUES (
  ${sqlString(company.platformOrganizationId)}, ${sqlString(company.id)},
  'shared_core', 'active', ${sqlString(company.externalOrganizationKey)}, now(), now()
)
ON CONFLICT (pdm_company_id) DO UPDATE SET
  platform_organization_id = EXCLUDED.platform_organization_id,
  mapping_source = 'shared_core',
  mapping_status = 'active',
  external_organization_key = EXCLUDED.external_organization_key,
  updated_at = now();

INSERT INTO platform_principal_mappings (
  platform_principal_id, pdm_user_id, mapping_source, mapping_status,
  external_subject, created_at, updated_at
)
VALUES (
  ${sqlString(principal.platformPrincipalId)}, ${sqlString(principal.pdmUserId)},
  'shared_iam', 'active', ${sqlString(principal.firebaseUid)}, now(), now()
)
ON CONFLICT (pdm_user_id) DO UPDATE SET
  platform_principal_id = EXCLUDED.platform_principal_id,
  mapping_source = 'shared_iam',
  mapping_status = 'active',
  external_subject = EXCLUDED.external_subject,
  updated_at = now();

COMMIT;
`;
}

function buildReadbackSql({ roles, permissions }) {
  const roleValues = valuesSql(roles.map((role) => [role.id, role.roleCode]));
  const permissionValues = valuesSql(
    permissions.map((permission) => [permission.roleCode, permission.permissionKind, permission.permissionCode])
  );
  return `-- DEV-046 staging principal bootstrap readback
-- Read-only. Expected final row: all boolean columns true and counts equal expected counts.
SET search_path = public;

WITH expected_roles(id, role_code) AS (
  VALUES
${roleValues}
),
expected_permissions(role_code, permission_kind, permission_code) AS (
  VALUES
${permissionValues}
),
principal_state AS (
  SELECT
    u.id = ${sqlString(principal.pdmUserId)} AS user_id_ok,
    lower(u.email) = ${sqlString(principal.email)} AS email_ok,
    u.password_hash IS NULL AS no_application_password,
    u.role = 'Admin' AND u.account_status = 'active' AND u.system_role_enabled = 1 AS admin_active,
    m.mapping_source = 'shared_iam' AND m.mapping_status = 'active'
      AND m.external_subject = ${sqlString(principal.firebaseUid)} AS firebase_mapping_ok
  FROM users u
  JOIN platform_principal_mappings m ON m.pdm_user_id = u.id
  WHERE u.id = ${sqlString(principal.pdmUserId)}
),
role_state AS (
  SELECT count(*)::integer AS actual_count
  FROM expected_roles expected
  JOIN roles actual ON actual.id = expected.id AND actual.role_code = expected.role_code AND actual.enabled = 1
),
permission_state AS (
  SELECT count(*)::integer AS actual_count
  FROM expected_permissions expected
  JOIN roles role_row ON role_row.role_code = expected.role_code
  JOIN role_permissions actual
    ON actual.role_id = role_row.id
   AND actual.permission_kind = expected.permission_kind
   AND actual.permission_code = expected.permission_code
   AND actual.allowed = 1
)
SELECT
  p.user_id_ok,
  p.email_ok,
  p.no_application_password,
  p.admin_active,
  p.firebase_mapping_ok,
  EXISTS (
    SELECT 1 FROM user_company_memberships
    WHERE user_id = ${sqlString(principal.pdmUserId)} AND company_id = ${sqlString(company.id)} AND is_default = 1
  ) AS default_membership_ok,
  EXISTS (
    SELECT 1 FROM platform_organization_mappings
    WHERE pdm_company_id = ${sqlString(company.id)} AND mapping_source = 'shared_core'
      AND mapping_status = 'active' AND external_organization_key = ${sqlString(company.externalOrganizationKey)}
  ) AS organization_mapping_ok,
  r.actual_count AS canonical_role_count,
  ${roles.length} AS expected_role_count,
  rp.actual_count AS canonical_permission_count,
  ${permissions.length} AS expected_permission_count,
  r.actual_count = ${roles.length} AS canonical_roles_ok,
  rp.actual_count = ${permissions.length} AS canonical_permissions_ok
FROM principal_state p
CROSS JOIN role_state r
CROSS JOIN permission_state rp;
`;
}

function buildRollbackSql() {
  return `-- DEV-046 staging principal access rollback
-- This preserves business/audit history and only revokes the bootstrapped principal's access.
-- It intentionally does not delete the company, roles, permissions, user or prior evidence.

BEGIN;
SET LOCAL search_path = public;

UPDATE platform_principal_mappings
SET mapping_status = 'retired', updated_at = now()
WHERE platform_principal_id = ${sqlString(principal.platformPrincipalId)}
  AND pdm_user_id = ${sqlString(principal.pdmUserId)}
  AND mapping_source = 'shared_iam'
  AND external_subject = ${sqlString(principal.firebaseUid)};

UPDATE auth_identities
SET status = 'disabled', identity_lifecycle_version = identity_lifecycle_version + 1, updated_at = now()
WHERE id = ${sqlString(principal.authIdentityId)}
  AND user_id = ${sqlString(principal.pdmUserId)}
  AND provider = 'google_oauth'
  AND provider_subject = ${sqlString(principal.firebaseUid)};

UPDATE users
SET account_status = 'suspended',
    system_role_enabled = 0,
    session_invalid_before = now(),
    account_lifecycle_version = account_lifecycle_version + 1,
    account_status_changed_at = now(),
    account_status_changed_by = NULL,
    account_status_reason = 'DEV-046 staging principal bootstrap rollback',
    updated_at = now()
WHERE id = ${sqlString(principal.pdmUserId)}
  AND lower(email) = ${sqlString(principal.email)};

COMMIT;
`;
}

function buildReportMarkdown(report) {
  return `# DEV-046 Staging Principal Bootstrap Review Package

Status: ${report.status}

## Scope

- Target: ${report.target.projectId} / ${report.target.cloudSqlInstance} / ${report.target.databaseName}
- Company: ${report.company.code} (${report.company.id})
- PDM user: ${report.principal.pdmUserId}
- Google email: ${report.principal.email}
- Firebase UID: ${report.principal.firebaseUid}
- Application password: forbidden and stored as NULL
- Privileged-role pilot access: verified ${report.principal.email.split("@").at(-1)} Google sign-ins are temporarily allowed at AAL1; AI_PDM TOTP enrollment is not used and this is not MFA-backed AAL2

## Package

- Canonical roles: ${report.canonicalMatrix.roleCount}
- Canonical permissions: ${report.canonicalMatrix.permissionCount}
- Bootstrap: transactional, idempotent and collision-fail-closed
- Readback: read-only identity, membership, mapping and full permission-count verification
- Rollback: access revocation only; no business, audit, company or role deletion

## Approval Boundary

- Principal mapping approved: ${report.approvalBoundary.principalMappingApproved}
- Live SQL apply allowed: ${report.approvalBoundary.liveSqlApplyAllowed}
- Deployment approved: ${report.approvalBoundary.applicationDeploymentApproved}
- Production approved: ${report.approvalBoundary.productionApproved}

This local package does not connect to Cloud SQL, mutate Firebase, run Terraform, deploy Cloud Run or apply SQL.
`;
}

export function buildDev046StagingPrincipalBootstrapPackage() {
  const { canonicalSchemaSha256, roles, permissions } = buildDev046CanonicalAccessMatrix();
  const bootstrapSql = buildBootstrapSql({ roles, permissions, canonicalSchemaSha256 });
  const readbackSql = buildReadbackSql({ roles, permissions });
  const rollbackSql = buildRollbackSql();

  const report = {
    schemaVersion: 1,
    packageVersion: DEV046_STAGING_PRINCIPAL_BOOTSTRAP_PACKAGE_VERSION,
    generatedAt: new Date().toISOString(),
    dev: "DEV-046",
    phase: "Phase-2B-staging-principal-bootstrap",
    status: "proposal_only_not_approved_for_live_apply",
    target,
    company,
    principal,
    observedIdentityEvidence: {
      provider: "google.com",
      emailVerified: true,
      identityRecordObserved: true,
      workspaceMfaTrusted: false,
      workspaceAal1PilotAllowed: true,
      applicationTotpEnrolled: false,
      liveBffResultBeforeBootstrap: "403 principal_not_active"
    },
    canonicalMatrix: {
      source: canonicalSchemaPath,
      sourceSha256: canonicalSchemaSha256,
      roleCount: roles.length,
      permissionCount: permissions.length,
      requiredAdminRoles: ["system_admin", "pdm_admin"],
      roles: roles.map(({ id, roleCode }) => ({ id, roleCode }))
    },
    approvalBoundary: {
      principalMappingApproved: false,
      liveSqlApplyAllowed: false,
      applicationDeploymentApproved: false,
      productionApproved: false
    },
    executionBoundary: {
      localPackageGenerationOnly: true,
      cloudSqlConnectionAttempted: false,
      sqlApplied: false,
      firebaseMutationPerformed: false,
      terraformActionPerformed: false,
      cloudRunDeploymentPerformed: false
    },
    safety: {
      transactionWrapped: true,
      collisionFailClosed: true,
      idempotentUpserts: true,
      applicationPasswordStored: false,
      mfaSecretStored: false,
      rollbackDeletesBusinessData: false
    }
  };

  const manifest = {
    ...report,
    artifacts: [
      { path: "bootstrap.sql", sha256: sha256(bootstrapSql), kind: "credentialled_mutation_requires_approval" },
      { path: "readback.sql", sha256: sha256(readbackSql), kind: "read_only_verification" },
      { path: "rollback.sql", sha256: sha256(rollbackSql), kind: "access_revocation_requires_approval" }
    ]
  };
  const reportMarkdown = buildReportMarkdown(report);

  return { report, manifest, bootstrapSql, readbackSql, rollbackSql, reportMarkdown };
}

export async function writeDev046StagingPrincipalBootstrapPackage(packageData, outputDir = defaultOutputDir) {
  await mkdir(outputDir, { recursive: true });
  const files = {
    manifest: path.join(outputDir, "manifest.json"),
    report: path.join(outputDir, "report.md"),
    bootstrap: path.join(outputDir, "bootstrap.sql"),
    readback: path.join(outputDir, "readback.sql"),
    rollback: path.join(outputDir, "rollback.sql")
  };
  await Promise.all([
    writeFile(files.manifest, `${JSON.stringify(packageData.manifest, null, 2)}\n`, "utf8"),
    writeFile(files.report, packageData.reportMarkdown, "utf8"),
    writeFile(files.bootstrap, packageData.bootstrapSql, "utf8"),
    writeFile(files.readback, packageData.readbackSql, "utf8"),
    writeFile(files.rollback, packageData.rollbackSql, "utf8")
  ]);
  return files;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const packageData = buildDev046StagingPrincipalBootstrapPackage();
  const outputs = await writeDev046StagingPrincipalBootstrapPackage(packageData);
  console.log(JSON.stringify({ status: packageData.report.status, outputs }, null, 2));
}
