#!/usr/bin/env node

import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildDev046StagingPrincipalBootstrapPackage } from "./dev-046-staging-principal-bootstrap-package.mjs";

export const DEV032_PRODUCTION_PRINCIPAL_BOOTSTRAP_PACKAGE_VERSION =
  "dev-032-production-principal-bootstrap/v1";
export const DEV032_PRODUCTION_FIREBASE_UID_TEMPLATE =
  "__VERIFIED_PRODUCTION_FIREBASE_UID__";

const root = process.cwd();
const defaultOutputDir = path.join(root, "output", "dev-032-production-principal-bootstrap");

const target = Object.freeze({
  projectId: "jenfu-ai-pdm-prod",
  region: "asia-east1",
  cloudSqlInstance: "ai-pdm-prod-postgres",
  connectionName: "jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-postgres",
  databaseName: "ai_pdm",
  migrationIamDatabaseUser: "ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam",
  environment: "production"
});

const principalTemplate = Object.freeze({
  firebaseUid: DEV032_PRODUCTION_FIREBASE_UID_TEMPLATE,
  email: "jedchang0308@jenfu.com.tw",
  displayName: "[鉦富]張仕杰 Jed",
  pdmUserId: "prod-pdm-admin-001",
  platformPrincipalId: "iam:principal:prod-pdm-admin-001",
  authIdentityId: "auth-google-prod-pdm-admin-001",
  role: "Admin",
  requiresPrivilegedAssurance: true
});

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

function assertFirebaseUid(firebaseUid, allowTemplate) {
  if (allowTemplate && firebaseUid === DEV032_PRODUCTION_FIREBASE_UID_TEMPLATE) return;
  if (!/^[A-Za-z0-9_-]{6,128}$/u.test(firebaseUid)) {
    throw new Error("DEV032_PRODUCTION_FIREBASE_UID_INVALID");
  }
}

function transformSql(source, firebaseUid) {
  const replacements = [
    ["jenfu-ai-pdm-stg-361825:asia-east1:ai-pdm-stg-postgres", target.connectionName],
    ["pdm-migration-stg@jenfu-ai-pdm-stg-361825.iam", target.migrationIamDatabaseUser],
    ["jenfu-ai-pdm-stg-361825", target.projectId],
    ["ai-pdm-stg-postgres", target.cloudSqlInstance],
    ["qxEv2napjvMEmiqIUqwhTCf6gjg2", firebaseUid],
    ["stg-pdm-admin-001", principalTemplate.pdmUserId],
    ["iam:principal:stg-pdm-admin-001", principalTemplate.platformPrincipalId],
    ["auth-google-stg-pdm-admin-001", principalTemplate.authIdentityId],
    ["DEV-046", "DEV-032"],
    ["Phase 2B", "Gate C"],
    ["staging", "production"],
    ["Staging", "Production"]
  ];
  let transformed = source;
  for (const [from, to] of replacements) transformed = transformed.replaceAll(from, to);
  if (/jenfu-ai-pdm-stg|ai-pdm-stg|stg-pdm|DEV-046|\bstaging\b/iu.test(transformed)) {
    throw new Error("DEV032_PRODUCTION_BOOTSTRAP_STAGING_IDENTIFIER_REMAINS");
  }
  return transformed;
}

function buildReportMarkdown(report) {
  return `# DEV-032 Production Principal Bootstrap Review Package

Status: ${report.status}

## Scope

- Target: ${report.target.projectId} / ${report.target.cloudSqlInstance} / ${report.target.databaseName}
- Company: ${report.company.code} (${report.company.id})
- PDM user: ${report.principal.pdmUserId}
- Google email: ${report.principal.email}
- Firebase UID: ${report.principal.firebaseUid}
- Application password: forbidden and stored as NULL
- Privileged assurance: production remains fail-closed until verified Workspace MFA or an explicitly approved residual-risk exception exists

## Package

- Canonical roles: ${report.canonicalMatrix.roleCount}
- Canonical permissions: ${report.canonicalMatrix.permissionCount}
- Bootstrap: transactional, idempotent and collision-fail-closed
- Readback: identity, membership, mapping and full permission-count verification
- Rollback: access revocation only; no business, audit, company or role deletion

This package does not create a Firebase user and cannot execute while the Firebase UID is the template value.
`;
}

export function buildDev032ProductionPrincipalBootstrapPackage({
  firebaseUid = DEV032_PRODUCTION_FIREBASE_UID_TEMPLATE
} = {}) {
  assertFirebaseUid(firebaseUid, true);
  const base = buildDev046StagingPrincipalBootstrapPackage();
  const principal = Object.freeze({ ...principalTemplate, firebaseUid });
  const bootstrapSql = transformSql(base.bootstrapSql, firebaseUid);
  const readbackSql = transformSql(base.readbackSql, firebaseUid);
  const rollbackSql = transformSql(base.rollbackSql, firebaseUid);
  const identityVerified = firebaseUid !== DEV032_PRODUCTION_FIREBASE_UID_TEMPLATE;
  const status = identityVerified
    ? "proposal_only_not_approved_for_live_apply"
    : "template_waiting_for_verified_firebase_uid";

  const report = {
    ...structuredClone(base.report),
    packageVersion: DEV032_PRODUCTION_PRINCIPAL_BOOTSTRAP_PACKAGE_VERSION,
    generatedAt: new Date().toISOString(),
    dev: "DEV-032",
    phase: "Gate-C-production-principal-bootstrap",
    status,
    target,
    principal,
    observedIdentityEvidence: {
      provider: "google.com",
      emailVerified: identityVerified,
      identityRecordObserved: identityVerified,
      workspaceMfaTrusted: false,
      workspaceAal1PilotAllowed: false,
      applicationTotpEnrolled: false
    },
    approvalBoundary: {
      principalMappingApproved: false,
      liveSqlApplyAllowed: false,
      applicationDeploymentApproved: false,
      productionApproved: false
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
  return {
    report,
    manifest,
    bootstrapSql,
    readbackSql,
    rollbackSql,
    reportMarkdown: buildReportMarkdown(report)
  };
}

export async function writeDev032ProductionPrincipalBootstrapPackage(packageData, outputDir = defaultOutputDir) {
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
  const uidArg = process.argv.slice(2).find((arg) => arg.startsWith("--firebase-uid="));
  const firebaseUid = uidArg?.slice("--firebase-uid=".length) || process.env.DEV032_PRODUCTION_FIREBASE_UID || DEV032_PRODUCTION_FIREBASE_UID_TEMPLATE;
  const packageData = buildDev032ProductionPrincipalBootstrapPackage({ firebaseUid });
  const outputs = await writeDev032ProductionPrincipalBootstrapPackage(packageData);
  console.log(JSON.stringify({ status: packageData.report.status, outputs }, null, 2));
}
