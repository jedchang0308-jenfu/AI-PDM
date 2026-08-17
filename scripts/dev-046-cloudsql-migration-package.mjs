#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEV046_CLOUDSQL_MIGRATION_PACKAGE_VERSION = "dev-046-cloudsql-migration-package/v1";

const root = process.cwd();
const defaultOutputDir = path.join(root, "output", "dev-046-cloudsql-migration-package");
const candidateSqlDirectory = "sql";
const liveExecutionEvidencePath = "output/dev-046-live-migration/execution-summary.json";

function projectPath(relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

function read(relativePath) {
  return fs.readFileSync(projectPath(relativePath), "utf8");
}

function json(relativePath) {
  return JSON.parse(read(relativePath));
}

function sha256(source) {
  return crypto.createHash("sha256").update(source).digest("hex");
}

function listSqlFiles(relativeDirectory) {
  const directory = projectPath(relativeDirectory);
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }))
    .map((name) => `${relativeDirectory}/${name}`);
}

function collectLineFindings({ file, source, pattern, type, classify }) {
  const findings = [];
  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!pattern.test(line)) continue;
    const roles = [...new Set([...line.matchAll(/\b(anon|authenticated|service_role)\b/giu)].map((match) => match[1].toLowerCase()))];
    findings.push({
      file,
      line: index + 1,
      type,
      severity: classify ? classify(line) : "review_required",
      roles,
      snippet: line.trim().slice(0, 180)
    });
  }
  return findings;
}

function classifyDdlRisk(line) {
  if (/\b(?:DROP\s+(?:TABLE|SCHEMA|DATABASE)|TRUNCATE|DELETE\s+FROM)\b/iu.test(line)) return "blocking_destructive";
  if (/\bDROP\s+(?:TRIGGER|CONSTRAINT)\s+IF\s+EXISTS\b/iu.test(line)) return "review_required_idempotent_ddl";
  if (/\bDROP\s+(?:TRIGGER|CONSTRAINT)\b/iu.test(line)) return "review_required_ddl";
  return "review_required";
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function migrationName(file) {
  return path.basename(file).replace(/\.sql$/u, "");
}

function cloudSqlOutputName(file) {
  return `${migrationName(file)}.cloudsql.sql`;
}

function shouldExcludeFromCurrentSlice(file) {
  if (file.endsWith("002_supabase_rls_plan.sql")) {
    return {
      excluded: true,
      reason: "supabase_rls_baseline_excluded_for_cloud_sql_bff_runtime",
      detail: "Cloud SQL runtime uses private server-side BFF access and database grants; the Supabase RLS/Data API baseline would force RLS without Cloud SQL runtime policies."
    };
  }
  if (file.endsWith("011_gcs_pointer_numbering_continuity.sql")) {
    return {
      excluded: true,
      reason: "phase_3b_file_authority_deferred",
      detail: "Direct GCS file-pointer continuity belongs to DEV-046 Phase 3B and must not be pulled into the no-file internal-pilot slice."
    };
  }
  return { excluded: false, reason: "", detail: "" };
}

function sanitizeSqlForCloudSql({ file, source }) {
  const transformations = {
    removedTransactionWrappers: 0,
    removedRlsStatements: 0,
    rewrittenSupabaseRoleReferences: 0
  };
  const lines = source.split(/\r?\n/u);
  const outputLines = [
    `-- DEV-046 Cloud SQL candidate generated from ${file}`,
    "-- Proposal only. Review before any live apply.",
    "-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.",
    ""
  ];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(?:BEGIN|COMMIT)\s*;\s*$/iu.test(line)) {
      transformations.removedTransactionWrappers += 1;
      outputLines.push(`-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:${index + 1}`);
      continue;
    }
    if (/\b(?:ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/iu.test(line)) {
      transformations.removedRlsStatements += 1;
      outputLines.push(`-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:${index + 1}`);
      continue;
    }
    let nextLine = line;
    if (/\b(?:anon|authenticated|service_role)\b/iu.test(nextLine)) {
      transformations.rewrittenSupabaseRoleReferences += 1;
      nextLine = nextLine
        .replace(/\bPUBLIC\s*,\s*anon\s*,\s*authenticated\b/giu, "PUBLIC")
        .replace(/\banon\s*,\s*authenticated\b/giu, "PUBLIC")
        .replace(/\bservice_role\b/giu, "pdm_runtime");
      outputLines.push(`-- CLOUDSQL_REWROTE_SUPABASE_ROLE_SOURCE_LINE:${index + 1}`);
    }
    outputLines.push(nextLine);
  }

  const sql = `${outputLines.join("\n").trimEnd()}\n`;
  return {
    sql,
    transformations,
    remainingSupabaseRoleReferences: (sql.match(/\b(?:anon|authenticated|service_role)\b/giu) ?? []).length,
    remainingRlsStatements: (sql.match(/\b(?:ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/giu) ?? []).length,
    remainingTransactionWrappers: (sql.match(/^\s*(?:BEGIN|COMMIT)\s*;\s*$/gimu) ?? []).length
  };
}

function buildAdminBootstrapSql({ target, grantSql }) {
  const production = target.projectId === "jenfu-ai-pdm-prod";
  const sql = `${[
    `-- ${production ? "DEV-032 production" : "DEV-046 staging"} Cloud SQL admin bootstrap candidate`,
    "-- Proposal only. Execute only through the approved privileged database bootstrap path.",
    "-- No secret values are present.",
    ""
  ].join("\n")}${grantSql
    .replaceAll(':"database_name"', quoteIdentifier(target.databaseName))
    .replaceAll(':"runtime_iam_user"', quoteIdentifier(target.runtimeIamDatabaseUser))
    .replaceAll(':"migration_iam_user"', quoteIdentifier(target.migrationIamDatabaseUser))
    .trimEnd()}\n`;
  return production
    ? sql.replaceAll("DEV-046 Phase 1 contract", "DEV-032 Gate C production contract")
    : sql;
}

function buildRuntimeGrantRefreshSql(target) {
  const label = target.projectId === "jenfu-ai-pdm-prod" ? "DEV-032 production" : "DEV-046 staging";
  return `-- ${label} Cloud SQL runtime grant refresh candidate
-- Proposal only. Execute after schema migrations and before runtime smoke.

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO pdm_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pdm_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO pdm_runtime;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM pdm_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM pdm_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO pdm_migration;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
`;
}

function buildRunnerContractMarkdown(report) {
  const production = report.target.projectId === "jenfu-ai-pdm-prod";
  return `${[
    `# ${production ? "DEV-032 Production" : "DEV-046 Staging"} Cloud SQL Migration Runner Contract`,
    "",
    "Status: proposal_only_not_approved_for_live_apply",
    "",
    "## Execution Boundary",
    "",
    "- Runner must execute inside a VPC path that can reach the private Cloud SQL IP.",
    "- Runner must use Cloud SQL Auth Proxy or equivalent connector with automatic IAM database authentication.",
    "- Static database passwords, service-account keys, public IP enablement and browser-direct database access are forbidden.",
    "- Admin bootstrap and schema migration are separate phases; runtime smoke must not run before both complete.",
    "",
    "## Proposed Order",
    "",
    "1. Execute `sql/000_admin_bootstrap_grants.sql` through the approved privileged database bootstrap path.",
    "2. Execute ordered schema files in `cloudsql-migration-manifest.json` through the migration identity.",
    "3. Execute `sql/999_runtime_grants_refresh.sql`.",
    "4. Run runtime database smoke through the Cloud Run runtime service account.",
    `5. Only after runtime smoke passes, create/verify real ${production ? "production" : "staging"} principal mappings.`,
    "",
    "## Current Blockers",
    "",
    ...report.readiness.blockers.map((blocker) => `- ${blocker}`),
    ""
  ].join("\n")}\n`;
}

function buildCandidatePackage({ target, grantSql, postgresFiles }) {
  const excludedFiles = [];
  const schemaFiles = [];
  let removedTransactionWrappers = 0;
  let removedRlsStatements = 0;
  let rewrittenSupabaseRoleReferences = 0;
  let remainingSupabaseRoleReferences = 0;
  let remainingRlsStatements = 0;
  let remainingTransactionWrappers = 0;

  for (const file of postgresFiles) {
    const exclusion = shouldExcludeFromCurrentSlice(file);
    if (exclusion.excluded) {
      excludedFiles.push({ file, reason: exclusion.reason, detail: exclusion.detail, sourceSha256: sha256(read(file)) });
      continue;
    }
    const source = read(file);
    const sanitized = sanitizeSqlForCloudSql({ file, source });
    removedTransactionWrappers += sanitized.transformations.removedTransactionWrappers;
    removedRlsStatements += sanitized.transformations.removedRlsStatements;
    rewrittenSupabaseRoleReferences += sanitized.transformations.rewrittenSupabaseRoleReferences;
    remainingSupabaseRoleReferences += sanitized.remainingSupabaseRoleReferences;
    remainingRlsStatements += sanitized.remainingRlsStatements;
    remainingTransactionWrappers += sanitized.remainingTransactionWrappers;
    schemaFiles.push({
      source: file,
      output: `${candidateSqlDirectory}/${cloudSqlOutputName(file)}`,
      version: migrationName(file).split("_")[0],
      name: migrationName(file),
      sourceSha256: sha256(source),
      outputSha256: sha256(sanitized.sql),
      bytes: Buffer.byteLength(sanitized.sql, "utf8"),
      transformations: sanitized.transformations,
      sql: sanitized.sql
    });
  }

  const adminBootstrapSql = buildAdminBootstrapSql({ target, grantSql });
  const grantRefreshSql = buildRuntimeGrantRefreshSql(target);
  const supportFiles = [
    {
      output: `${candidateSqlDirectory}/000_admin_bootstrap_grants.sql`,
      kind: "admin_bootstrap",
      outputSha256: sha256(adminBootstrapSql),
      bytes: Buffer.byteLength(adminBootstrapSql, "utf8"),
      sql: adminBootstrapSql
    },
    {
      output: `${candidateSqlDirectory}/999_runtime_grants_refresh.sql`,
      kind: "runtime_grant_refresh",
      outputSha256: sha256(grantRefreshSql),
      bytes: Buffer.byteLength(grantRefreshSql, "utf8"),
      sql: grantRefreshSql
    }
  ];

  const historyCompatibility = json("config/platform/cloudsql-migration-history-compatibility.json");
  const compatibilityEntries = historyCompatibility.entries
    .filter((entry) => entry.targetProjectId === target.projectId)
    .map((entry) => ({ ...entry, acceptedExistingChecksums: [...entry.acceptedExistingChecksums] }));
  const compatibilityByVersion = new Map(compatibilityEntries.map((entry) => [entry.version, entry]));
  const orderedSchemaMigrations = schemaFiles.map((file) => {
    const compatibility = compatibilityByVersion.get(file.version);
    return compatibility
      ? { ...file, acceptedExistingChecksums: compatibility.acceptedExistingChecksums }
      : file;
  });

  const orderedManifest = {
    schemaVersion: 1,
    packageVersion: DEV046_CLOUDSQL_MIGRATION_PACKAGE_VERSION,
    status: "proposal_only_not_approved_for_live_apply",
    target,
    executionBoundary: {
      liveApplyAllowed: false,
      requiresVpcAttachedRunner: true,
      requiresReviewedAdminBootstrap: true,
      excludesStaticDbPasswords: true,
      excludesServiceAccountKeys: true,
      excludesPublicIpDatabaseAccess: true
    },
    supportFiles: supportFiles.map(({ sql: _sql, ...file }) => file),
    orderedSchemaMigrations: orderedSchemaMigrations.map(({ sql: _sql, ...file }) => file),
    migrationHistoryCompatibility: {
      policy: historyCompatibility.policy,
      entries: compatibilityEntries
    },
    excludedFiles,
    transformations: {
      removedTransactionWrappers,
      removedRlsStatements,
      rewrittenSupabaseRoleReferences,
      remainingSupabaseRoleReferences,
      remainingRlsStatements,
      remainingTransactionWrappers
    }
  };

  return {
    status: "proposal_generated_not_reviewed",
    readyForPackageReview: true,
    liveApplyAllowed: false,
    supportFiles,
    schemaFiles: orderedSchemaMigrations,
    historyCompatibility: orderedManifest.migrationHistoryCompatibility,
    orderedManifest,
    excludedFiles,
    transformations: orderedManifest.transformations
  };
}

function buildMarkdown(report) {
  const lines = [
    "# DEV-046 Cloud SQL Migration Package Preflight",
    "",
    `Generated at: ${report.generatedAt}`,
    `Package version: ${report.packageVersion}`,
    `Status: ${report.readiness.status}`,
    "",
    "## Boundary",
    "",
    "- This report is local-only and output-only.",
    "- No Cloud SQL connection, psql command, Terraform action, gcloud mutation or credential lookup is executed.",
    "- The current result blocks live migration apply until a Cloud SQL-specific migration package and VPC-attached runner are reviewed.",
    "",
    "## Target",
    "",
    `- Project: ${report.target.projectId}`,
    `- Region: ${report.target.region}`,
    `- Instance: ${report.target.cloudSqlInstance}`,
    `- Database: ${report.target.databaseName}`,
    `- Connection: ${report.target.connectionName}`,
    `- Private IP only: ${report.target.privateIpOnly}`,
    "",
    "## Findings",
    "",
    `- PostgreSQL SQL files scanned: ${report.sourceInventory.postgresSqlFileCount}`,
    `- Supabase role-reference lines: ${report.supabaseCompatibility.totalRoleReferenceLines}`,
    `- DDL review lines: ${report.ddlRisk.totalReviewLines}`,
    `- Blocking destructive lines: ${report.ddlRisk.blockingDestructiveLines}`,
    `- Admin bootstrap required: ${report.adminBootstrap.required}`,
    `- VPC-attached runner required: ${report.executionEnvironment.vpcAttachedRunnerRequired}`,
    `- Candidate package status: ${report.candidatePackage.status}`,
    `- Candidate schema files: ${report.candidatePackage.orderedSchemaMigrationCount}`,
    `- Candidate excluded files: ${report.candidatePackage.excludedFiles.length}`,
    `- Candidate remaining Supabase role references: ${report.candidatePackage.transformations.remainingSupabaseRoleReferences}`,
    `- Candidate remaining RLS statements: ${report.candidatePackage.transformations.remainingRlsStatements}`,
    "",
    "## Current Blockers",
    ""
  ];

  for (const blocker of report.readiness.blockers) {
    lines.push(`- ${blocker}`);
  }

  lines.push("", "## Required Next Work", "");
  for (const item of report.requiredNextWork) {
    lines.push(`- ${item}`);
  }

  lines.push("", "## Supabase Role References By File", "");
  for (const item of report.supabaseCompatibility.byFile) {
    lines.push(`- ${item.file}: ${item.count}`);
  }

  lines.push("", "## Candidate Exclusions", "");
  for (const item of report.candidatePackage.excludedFiles) {
    lines.push(`- ${item.file}: ${item.reason}`);
  }

  lines.push("", "## Notes", "");
  for (const note of report.notes) {
    lines.push(`- ${note}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function buildDev046CloudSqlMigrationPackage(options = {}) {
  const targetMode = options.target ?? process.env.PDM_MIGRATION_PACKAGE_TARGET ?? "staging";
  if (!new Set(["staging", "production"]).has(targetMode)) throw new Error(`UNSUPPORTED_MIGRATION_PACKAGE_TARGET:${targetMode}`);
  const production = targetMode === "production";
  const manifest = production ? null : json("config/platform/staging-preflight.template.json");
  const productionTarget = production ? json("config/platform/production-target.template.json") : null;
  const executionEvidencePath = production ? "output/dev-032-live-migration/execution-summary.json" : liveExecutionEvidencePath;
  const liveExecutionEvidence = fs.existsSync(projectPath(executionEvidencePath))
    ? json(executionEvidencePath)
    : null;
  const cloudSqlAccess = json("config/platform/cloud-sql-access.json");
  const terraformDirectory = production ? "infra/google-cloud/production" : "infra/google-cloud/staging";
  const runtimeTf = read(`${terraformDirectory}/runtime.tf`);
  const databaseTf = read(`${terraformDirectory}/database.tf`);
  const grantsFile = "db/cloud-sql/pdm_runtime_grants.sql";
  const grantSql = read(grantsFile);
  const postgresFiles = listSqlFiles("db/postgres");

  const migrations = postgresFiles.map((file) => {
    const source = read(file);
    const supabaseRoleFindings = collectLineFindings({
      file,
      source,
      pattern: /\b(?:anon|authenticated|service_role)\b/iu,
      type: "supabase_role_reference"
    });
    const ddlFindings = collectLineFindings({
      file,
      source,
      pattern: /\b(?:DROP\s+(?:TABLE|SCHEMA|DATABASE|TRIGGER|CONSTRAINT)|TRUNCATE|DELETE\s+FROM)\b/iu,
      type: "ddl_review",
      classify: classifyDdlRisk
    });
    let phaseBoundary = "review_required";
    if (file.endsWith("011_gcs_pointer_numbering_continuity.sql")) phaseBoundary = "deferred_phase_3b_file_authority";
    else if (/\/(?:001|003|004|005|006|007|008|009|012|013|014|015|016|017|018|019|020)_/u.test(file)) phaseBoundary = "candidate_requires_cloudsql_review";

    return {
      file,
      sha256: sha256(source),
      bytes: Buffer.byteLength(source, "utf8"),
      phaseBoundary,
      hasSupabaseRoleReferences: supabaseRoleFindings.length > 0,
      supabaseRoleReferenceLines: supabaseRoleFindings.length,
      ddlReviewLines: ddlFindings.length
    };
  });

  const supabaseRoleFindings = migrations.flatMap((migration) => {
    const source = read(migration.file);
    return collectLineFindings({
      file: migration.file,
      source,
      pattern: /\b(?:anon|authenticated|service_role)\b/iu,
      type: "supabase_role_reference"
    });
  });
  const ddlFindings = migrations.flatMap((migration) => {
    const source = read(migration.file);
    return collectLineFindings({
      file: migration.file,
      source,
      pattern: /\b(?:DROP\s+(?:TABLE|SCHEMA|DATABASE|TRIGGER|CONSTRAINT)|TRUNCATE|DELETE\s+FROM)\b/iu,
      type: "ddl_review",
      classify: classifyDdlRisk
    });
  });
  const roleReferencesByFile = [...new Set(supabaseRoleFindings.map((finding) => finding.file))]
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }))
    .map((file) => ({
      file,
      count: supabaseRoleFindings.filter((finding) => finding.file === file).length,
      roles: [...new Set(supabaseRoleFindings.filter((finding) => finding.file === file).flatMap((finding) => finding.roles))].sort()
    }));

  const blockingDestructiveLines = ddlFindings.filter((finding) => finding.severity === "blocking_destructive").length;
  const liveMigrationCompleted =
    liveExecutionEvidence?.migrationResult?.status === "succeeded" &&
    liveExecutionEvidence?.migrationResult?.idempotenceVerified === true &&
    liveExecutionEvidence?.adminBootstrap?.status === "succeeded";
  const runtimeSmokeExecuted = production ? false : manifest.phase2Bootstrap?.runtimeSmoke?.status === "passed";
  const currentAcceptanceBlockers = !production && Array.isArray(manifest.knownApplicationBlockers)
    ? manifest.knownApplicationBlockers
    : [];
  const cloudSqlPackageReady = production ? true : liveMigrationCompleted;
  const vpcAttachedRunnerRequired =
    (production || manifest.phase2Bootstrap?.cloudSql?.privateIp !== undefined) &&
    runtimeTf.includes("--private-ip") &&
    runtimeTf.includes("--auto-iam-authn") &&
    databaseTf.includes("ipv4_enabled                                  = false");
  const migrationRunnerPreflight = production ? {} : (manifest.phase2Bootstrap?.cloudSqlMigrationRunnerPreflight ?? {});
  const reviewedVpcAttachedRunnerPresent =
    migrationRunnerPreflight.cloudRunJobIacPresent === true &&
    migrationRunnerPreflight.cloudRunJobApplyExecuted === true &&
    migrationRunnerPreflight.cloudRunJobExistsAfterApply === true;

  const targetProjectId = production ? productionTarget.target.projectId : manifest.target.stagingProjectId;
  const targetRegion = production ? productionTarget.target.region : manifest.target.region;
  const targetInstance = production ? productionTarget.target.cloudSqlInstance : (manifest.phase2Bootstrap?.cloudSql?.instance ?? "");
  const target = {
    projectId: targetProjectId,
    region: targetRegion,
    cloudSqlInstance: targetInstance,
    connectionName: production ? `${targetProjectId}:${targetRegion}:${targetInstance}` : (manifest.phase2Bootstrap?.cloudSql?.connectionName ?? ""),
    databaseName: "ai_pdm",
    privateIpOnly: true,
    privateIpObserved: production ? "" : (manifest.phase2Bootstrap?.cloudSql?.privateIp ?? ""),
    runtimeServiceAccount: production ? "ai-pdm-prod-runtime@jenfu-ai-pdm-prod.iam.gserviceaccount.com" : "pdm-runtime-stg@jenfu-ai-pdm-stg-361825.iam.gserviceaccount.com",
    runtimeIamDatabaseUser: production ? "ai-pdm-prod-runtime@jenfu-ai-pdm-prod.iam" : "pdm-runtime-stg@jenfu-ai-pdm-stg-361825.iam",
    migrationIamDatabaseUser: production ? "ai-pdm-prod-migration@jenfu-ai-pdm-prod.iam" : "pdm-migration-stg@jenfu-ai-pdm-stg-361825.iam"
  };
  const candidatePackage = buildCandidatePackage({ target, grantSql, postgresFiles });

  return {
    schemaVersion: 1,
    reportType: production ? "dev-032-production-cloudsql-migration-package" : "dev-046-cloudsql-migration-package-preflight",
    dev: production ? "DEV-032" : "DEV-046",
    phase: production ? "Gate-C-production-clean-seed-migration" : "Phase-2B-staging-migration-preflight",
    packageVersion: DEV046_CLOUDSQL_MIGRATION_PACKAGE_VERSION,
    generatedAt: new Date().toISOString(),
    target,
    liveExecutionEvidence: {
      path: executionEvidencePath,
      present: liveExecutionEvidence !== null,
      status: liveExecutionEvidence?.status ?? "not-present",
      adminBootstrapSucceeded: liveExecutionEvidence?.adminBootstrap?.status === "succeeded",
      liveMigrationCompleted,
      idempotenceVerified: liveExecutionEvidence?.migrationResult?.idempotenceVerified === true,
      runtimeSmokeExecuted
    },
    executionBoundary: {
      localOnly: true,
      outputOnly: true,
      noCredentialLookupPerformed: true,
      noCloudSqlConnectionAttempted: true,
      noSqlApplied: true,
      noTerraformAction: true,
      noGcloudMutation: true,
      noPsqlCommand: true,
      liveExecutionAllowed: false
    },
    sourceInventory: {
      postgresDirectory: "db/postgres",
      postgresReadmeDeclaresCloudSqlAuthority:
        read("db/postgres/README.md").includes("authoritative PostgreSQL migration source") &&
        read("db/postgres/README.md").includes("approved production database is Google Cloud SQL for PostgreSQL") &&
        read("db/postgres/README.md").includes("Supabase is retired"),
      postgresSqlFileCount: migrations.length,
      cloudSqlGrantFile: grantsFile,
      cloudSqlGrantFileSha256: sha256(grantSql),
      singletonMigrationRunnerPresent: read("src/lib/singleton-migration-runner.ts").includes("runSingletonMigrations"),
      currentPostgresMigrations: migrations
    },
    supabaseCompatibility: {
      cloudSqlReady: supabaseRoleFindings.length === 0,
      totalRoleReferenceLines: supabaseRoleFindings.length,
      byFile: roleReferencesByFile,
      sampleFindings: supabaseRoleFindings.slice(0, 12)
    },
    ddlRisk: {
      totalReviewLines: ddlFindings.length,
      blockingDestructiveLines,
      reviewRequiredIdempotentLines: ddlFindings.filter((finding) => finding.severity === "review_required_idempotent_ddl").length,
      sampleFindings: ddlFindings.slice(0, 12)
    },
    adminBootstrap: {
      required: true,
      file: grantsFile,
      createsRuntimeRole: grantSql.includes("CREATE ROLE pdm_runtime"),
      createsMigrationRole: grantSql.includes("CREATE ROLE pdm_migration"),
      grantsIamUsers: grantSql.includes('GRANT pdm_runtime TO :"runtime_iam_user"') && grantSql.includes('GRANT pdm_migration TO :"migration_iam_user"'),
      runtimeDatabaseRole: cloudSqlAccess.runtimeDatabaseRole,
      migrationDatabaseRole: cloudSqlAccess.migrationDatabaseRole,
      executed: liveExecutionEvidence?.adminBootstrap?.status === "succeeded",
      reason: liveMigrationCompleted
        ? "Privileged bootstrap and the subsequent runtime least-privilege smoke completed."
        : "Cloud SQL IAM database users exist, but role/grant bootstrap still requires a privileged database execution path before runtime least-privilege smoke."
    },
    executionEnvironment: {
      privateIpOnly: true,
      proxyRequiresVpcReachability: true,
      vpcAttachedRunnerRequired,
      recommendedRunner: "reviewed Cloud Run Job or equivalent VPC-attached migration runner using the migration service account and Cloud SQL Auth Proxy automatic IAM database authentication",
      localMachineDirectApplyAllowed: false,
      runtimeSmokeRequiresBrowserHttpsEntrypoint: production ? true : manifest.phase2Bootstrap?.internalPilotAccess?.browserHttpsEntrypointRequired === true
    },
    readiness: {
      status: production
        ? "production_candidate_package_generated_not_applied"
        : liveMigrationCompleted && runtimeSmokeExecuted
        ? "live_migration_and_runtime_smoke_completed_acceptance_gated"
        : liveMigrationCompleted
          ? "live_migration_completed_runtime_smoke_pending"
          : "blocked_package_not_ready",
      readyForLiveApply: false,
      cloudSqlMigrationPackageReady: cloudSqlPackageReady,
      liveMigrationCompleted,
      runtimeSmokeReady: runtimeSmokeExecuted,
      blockers: production
        ? ["PRODUCTION_ADMIN_BOOTSTRAP_NOT_EXECUTED", "PRODUCTION_MIGRATION_NOT_EXECUTED", "PRODUCTION_RUNTIME_SMOKE_NOT_EXECUTED"]
        : liveMigrationCompleted && runtimeSmokeExecuted
        ? currentAcceptanceBlockers
        : liveMigrationCompleted
          ? ["STAGING_RUNTIME_SMOKE_NOT_EXECUTED"]
        : [
            "STAGING_CLOUD_SQL_MIGRATION_PACKAGE_NOT_READY",
            ...(reviewedVpcAttachedRunnerPresent ? [] : ["STAGING_VPC_ATTACHED_MIGRATION_RUNNER_NOT_READY"]),
            "STAGING_ADMIN_BOOTSTRAP_GRANTS_NOT_EXECUTED",
            "STAGING_MIGRATION_AND_RUNTIME_SMOKE_NOT_EXECUTED"
          ],
      stopConditions: [
        "Do not apply db/postgres/*.sql directly to Cloud SQL until Supabase role references are removed or converted.",
        "Do not use a local private-IP proxy unless the executor is inside a network that can reach the Cloud SQL private IP.",
        "Do not use static database passwords, service-account keys, public IP enablement or browser-direct database access.",
        `Stop before live execution if the reviewed plan would delete/replace resources, exceed the USD 240 review stop, or widen scope beyond ${production ? "DEV-032 Gate C production" : "DEV-046 Phase 2B staging"}.`
      ]
    },
    candidatePackage: {
      status: candidatePackage.status,
      readyForPackageReview: candidatePackage.readyForPackageReview,
      liveApplyAllowed: candidatePackage.liveApplyAllowed,
      orderedManifestPath: "cloudsql-migration-manifest.json",
      runnerContractPath: "runner-contract.md",
      supportFileCount: candidatePackage.supportFiles.length,
      orderedSchemaMigrationCount: candidatePackage.schemaFiles.length,
      supportFiles: candidatePackage.supportFiles.map(({ sql: _sql, ...file }) => file),
      orderedSchemaMigrations: candidatePackage.schemaFiles.map(({ sql: _sql, ...file }) => file),
      excludedFiles: candidatePackage.excludedFiles,
      transformations: candidatePackage.transformations
    },
    requiredNextWork: production
      ? [
          "Apply only after the DEV-032 production infrastructure plan and target readback pass.",
          "Execute admin bootstrap separately, then run schema migration twice to prove idempotence.",
          "Run production runtime, restore and numbering reconciliation before canary."
        ]
      : liveMigrationCompleted && runtimeSmokeExecuted
      ? [
          "Create or verify the staging principal mapping after a real provider UID exists.",
          "Resolve the deployed application artifact provenance and source drift before full staging acceptance."
        ]
      : liveMigrationCompleted
      ? [
          "Provision or approve a browser-accessible internal HTTPS entrypoint.",
          "Run least-privilege runtime smoke through the Cloud Run runtime service account.",
          "Only after runtime smoke succeeds, create or verify staging principal mappings."
        ]
      : [
          "Review the generated Cloud SQL-specific ordered migration manifest for the Phase 2B/3A no-file slice.",
          "Approve or correct the Cloud SQL BFF runtime choice to remove Supabase RLS/FORCE RLS from the current no-file slice.",
          "Use the reviewed VPC-attached runner Job for admin bootstrap, schema migration, checksum history and runtime grant verification only after separate live approvals.",
          "After migration succeeds, run runtime smoke through the Cloud Run service account and only then perform user/principal mapping smoke."
        ],
    notes: production
      ? [
          "This package is tied to the dedicated production project and IAM database users.",
          "No source business rows, staging identities, credentials or GCS file-authority migration are included.",
          "Generation performs no cloud or database action."
        ]
      : liveMigrationCompleted && runtimeSmokeExecuted
      ? [
          "This local report reads durable evidence but does not connect to Cloud SQL or execute cloud actions.",
          "Admin bootstrap and all 18 intended schema migrations completed; an immediate second run applied zero versions.",
          "The Cloud Run runtime identity completed the read-only Cloud SQL smoke without creating business data.",
          "Migration work is complete; the remaining blockers belong to staging identity evidence and application artifact provenance."
        ]
      : liveMigrationCompleted
      ? [
          "This local report reads durable evidence but does not connect to Cloud SQL or execute cloud actions.",
          "Admin bootstrap and all 18 intended schema migrations completed; an immediate second run applied zero versions.",
          "The migration Job was restored to dry-run posture. Public DNS remains deferred and runtime acceptance remains blocked."
        ]
      : [
          "Existing Cloud SQL instance and database are present, but this report intentionally does not connect to them.",
          "The staging Cloud Run migration Job exists, but admin bootstrap, live migration and runtime smoke are not yet closed.",
          "Public DNS is deferred by user decision; this does not block database migration itself, but it still blocks browser login/runtime smoke."
        ]
  };
}

export async function writeDev046CloudSqlMigrationPackage(report, outputDir = defaultOutputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  await mkdir(path.join(resolvedOutputDir, candidateSqlDirectory), { recursive: true });
  const grantSql = read("db/cloud-sql/pdm_runtime_grants.sql");
  const postgresFiles = listSqlFiles("db/postgres");
  const candidatePackage = buildCandidatePackage({ target: report.target, grantSql, postgresFiles });
  const jsonPath = path.join(resolvedOutputDir, "report.json");
  const markdownPath = path.join(resolvedOutputDir, "report.md");
  const manifestPath = path.join(resolvedOutputDir, "cloudsql-migration-manifest.json");
  const runnerContractPath = path.join(resolvedOutputDir, "runner-contract.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");
  await writeFile(manifestPath, `${JSON.stringify(candidatePackage.orderedManifest, null, 2)}\n`, "utf8");
  await writeFile(runnerContractPath, buildRunnerContractMarkdown(report), "utf8");
  for (const file of [...candidatePackage.supportFiles, ...candidatePackage.schemaFiles]) {
    await writeFile(path.join(resolvedOutputDir, file.output), file.sql, "utf8");
  }
  return { jsonPath, markdownPath, manifestPath, runnerContractPath, sqlDirectory: path.join(resolvedOutputDir, candidateSqlDirectory) };
}

function parseArgs(argv) {
  const parsed = { writeReport: false, outputDir: defaultOutputDir };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write-report") parsed.writeReport = true;
    if (arg === "--output") {
      parsed.writeReport = true;
      parsed.outputDir = argv[index + 1] ? path.resolve(argv[index + 1]) : defaultOutputDir;
      index += 1;
    }
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = buildDev046CloudSqlMigrationPackage();
  if (args.writeReport) await writeDev046CloudSqlMigrationPackage(report, args.outputDir);
  console.log(`DEV-046 Cloud SQL migration package preflight: ${report.readiness.status}`);
  console.log(`PostgreSQL SQL files scanned: ${report.sourceInventory.postgresSqlFileCount}`);
  console.log(`Supabase role-reference lines: ${report.supabaseCompatibility.totalRoleReferenceLines}`);
  console.log(`DDL review lines: ${report.ddlRisk.totalReviewLines}`);
  console.log(`Candidate schema files: ${report.candidatePackage.orderedSchemaMigrationCount}`);
  console.log(`Candidate excluded files: ${report.candidatePackage.excludedFiles.length}`);
  for (const blocker of report.readiness.blockers) console.log(`BLOCKED ${blocker}`);
  console.log("No credentials, Cloud SQL connections, psql commands, Terraform actions or gcloud mutations were executed.");
  if (process.argv.includes("--require-ready") && !report.readiness.readyForLiveApply) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
