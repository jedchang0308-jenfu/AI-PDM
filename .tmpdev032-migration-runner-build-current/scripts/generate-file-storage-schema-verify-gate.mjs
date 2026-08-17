#!/usr/bin/env node

import "./retired-supabase-tooling-block.mjs";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { STORAGE_SCHEMA_MIGRATION_PACKAGE_VERSION, buildStorageSchemaMigrationPackage } from "./generate-file-storage-schema-migration-package.mjs";
import { evaluateStorageSchemaTargetSafety } from "./file-storage-schema-target-safety.mjs";

export const STORAGE_SCHEMA_VERIFY_GATE_VERSION = "storage-schema-verify-gate/v1";

const REQUIRED_TABLES = ["storage_providers", "storage_objects", "storage_object_references"];
const REQUIRED_INDEXES = [
  "idx_storage_objects_provider_key",
  "idx_storage_objects_hash",
  "idx_storage_objects_lifecycle",
  "idx_storage_object_references_entity",
  "idx_storage_object_references_object"
];
const REQUIRED_UNIQUE_CONSTRAINTS = [
  "storage_objects_provider_id_bucket_object_key_key",
  "storage_object_references_object_id_linked_entity_type_linked_entity_id_file_role_filename_key"
];
const REQUIRED_PROVIDERS = [
  { providerId: "local_repository", isEnabled: true },
  { providerId: "supabase_storage", isEnabled: false },
  { providerId: "s3_compatible", isEnabled: false },
  { providerId: "nas_gateway", isEnabled: false }
];
function statusReason(status) {
  if (status === "disabled") return "set PDM_STORAGE_SCHEMA_VERIFY_ENABLED=1 and pass --confirm-target";
  if (status === "missing_database_url") return "set PDM_STORAGE_SCHEMA_VERIFY_DATABASE_URL for a non-production verification target";
  if (status === "unsafe_target") return "target name must clearly identify a disposable/staging/shadow/test database and not production/main";
  if (status === "unsafe_known_target") return "target matches a known Supabase project that is not approved for AI_PDM storage schema verification";
  if (status === "verified_with_findings") return "schema was reachable but one or more storage metadata checks failed";
  return "storage metadata schema verification passed";
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Storage Schema Verify Gate",
    "",
    `Generated at: ${report.generatedAt}`,
    `Gate version: ${report.gateVersion}`,
    `Package version: ${report.sourcePackage.packageVersion}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Target name: ${report.inputs.targetName || "-"}`,
    `- Database URL configured: ${report.inputs.databaseUrlConfigured}`,
    `- Tables verified: ${report.summary.tablesVerifiedCount}`,
    `- RLS verified: ${report.summary.rlsVerifiedCount}`,
    `- Forced RLS verified: ${report.summary.forcedRlsVerifiedCount}`,
    `- Indexes verified: ${report.summary.indexesVerifiedCount}`,
    `- Unique constraints verified: ${report.summary.uniqueConstraintsVerifiedCount}`,
    `- Providers verified: ${report.summary.providersVerifiedCount}`,
    `- Disallowed grant findings: ${report.summary.disallowedGrantCount}`,
    "",
    "## Guardrails",
    "",
    `- Explicit enable required: ${report.assumptions.explicitEnableRequired}`,
    `- Confirmation required: ${report.assumptions.confirmationRequired}`,
    `- Read-only verification: ${report.assumptions.readOnlyVerification}`,
    `- Non-production target only: ${report.assumptions.nonProductionTargetOnly}`,
    `- Database URL omitted from output: ${report.assumptions.noDatabaseUrlPrinted}`,
    "",
    "## Findings",
    ""
  ];

  if (report.findings.length === 0) {
    lines.push("- No findings.");
  } else {
    for (const finding of report.findings) {
      lines.push(`- ${finding}`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function buildBaseReport({ env, enabled, confirmTarget, targetName, databaseUrlConfigured, status, sourcePackage }) {
  return {
    reportType: "file-storage-schema-verify-gate",
    gateVersion: STORAGE_SCHEMA_VERIFY_GATE_VERSION,
    generatedAt: new Date().toISOString(),
    sourcePackage: {
      reportType: sourcePackage.reportType,
      packageVersion: sourcePackage.packageVersion,
      status: sourcePackage.status,
      migrationPackageVersion: STORAGE_SCHEMA_MIGRATION_PACKAGE_VERSION
    },
    assumptions: {
      explicitEnableRequired: true,
      confirmationRequired: true,
      readOnlyVerification: true,
      nonProductionTargetOnly: true,
      noOfficialMigrationFilesWritten: true,
      noSqlApplied: true,
      noProviderIo: true,
      noMetadataPointersUpdated: true,
      noDatabaseUrlPrinted: true
    },
    inputs: {
      targetName,
      enabled,
      confirmTarget,
      databaseUrlConfigured,
      envFlags: {
        verifyEnabledConfigured: env.PDM_STORAGE_SCHEMA_VERIFY_ENABLED === "1",
        databaseUrlConfigured: Boolean(env.PDM_STORAGE_SCHEMA_VERIFY_DATABASE_URL),
        targetNameConfigured: Boolean(env.PDM_STORAGE_SCHEMA_VERIFY_TARGET_NAME)
      }
    },
    readiness: {
      readyToPromoteSchema: false,
      reason: statusReason(status)
    },
    summary: {
      status,
      tablesVerifiedCount: 0,
      rlsVerifiedCount: 0,
      forcedRlsVerifiedCount: 0,
      indexesVerifiedCount: 0,
      uniqueConstraintsVerifiedCount: 0,
      providersVerifiedCount: 0,
      disallowedGrantCount: 0
    },
    verification: {
      tables: [],
      rls: [],
      indexes: [],
      uniqueConstraints: [],
      providers: [],
      disallowedGrants: []
    },
    findings: []
  };
}

function normalizeTableRows(rows) {
  return rows.map((row) => row.table_name ?? row.tableName ?? row.relname).filter(Boolean);
}

function normalizeRlsRows(rows) {
  return rows.map((row) => ({
    tableName: row.relname ?? row.table_name ?? row.tableName,
    rlsEnabled: Boolean(row.relrowsecurity ?? row.rls_enabled ?? row.rlsEnabled),
    rlsForced: Boolean(row.relforcerowsecurity ?? row.rls_forced ?? row.rlsForced)
  }));
}

function normalizeGrantRows(rows) {
  return rows.map((row) => ({
    tableName: row.table_name ?? row.tableName ?? "",
    grantee: row.grantee ?? "",
    privilegeType: row.privilege_type ?? row.privilegeType ?? ""
  }));
}

function normalizeIndexRows(rows) {
  return rows.map((row) => row.indexname ?? row.index_name ?? row.indexName).filter(Boolean);
}

function normalizeConstraintRows(rows) {
  return rows.map((row) => row.conname ?? row.constraint_name ?? row.constraintName).filter(Boolean);
}

function normalizeProviderRows(rows) {
  return rows.map((row) => ({
    providerId: row.provider_id ?? row.providerId,
    isEnabled: Boolean(row.is_enabled ?? row.isEnabled)
  }));
}

function collectFindings(verification) {
  const findings = [];
  for (const item of verification.tables) {
    if (!item.exists) findings.push(`missing table ${item.tableName}`);
  }
  for (const item of verification.rls) {
    if (!item.rlsEnabled) findings.push(`RLS disabled for ${item.tableName}`);
    if (!item.rlsForced) findings.push(`RLS not forced for ${item.tableName}`);
  }
  for (const item of verification.indexes) {
    if (!item.exists) findings.push(`missing index ${item.indexName}`);
  }
  for (const item of verification.uniqueConstraints) {
    if (!item.exists) findings.push(`missing unique constraint ${item.constraintName}`);
  }
  for (const item of verification.providers) {
    if (!item.exists) findings.push(`missing provider ${item.providerId}`);
    else if (!item.enabledMatchesExpected) findings.push(`provider ${item.providerId} enabled flag mismatch`);
  }
  for (const item of verification.disallowedGrants) {
    findings.push(`disallowed grant ${item.grantee}.${item.tableName}.${item.privilegeType}`);
  }
  return findings;
}

export function createPgSchemaVerifyClient(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl });
  return {
    async connect() {
      await client.connect();
    },
    async query(sql, params = []) {
      return client.query(sql, params);
    },
    async close() {
      await client.end();
    }
  };
}

export async function buildStorageSchemaVerifyGate(options = {}) {
  const env = options.env ?? process.env;
  const enabled = options.enabled ?? env.PDM_STORAGE_SCHEMA_VERIFY_ENABLED === "1";
  const confirmTarget = options.confirmTarget === true;
  const targetName = options.targetName ?? env.PDM_STORAGE_SCHEMA_VERIFY_TARGET_NAME ?? "";
  const databaseUrl = options.databaseUrl ?? env.PDM_STORAGE_SCHEMA_VERIFY_DATABASE_URL ?? "";
  const sourcePackage = buildStorageSchemaMigrationPackage();

  if (!enabled || !confirmTarget) {
    return buildBaseReport({
      env,
      enabled,
      confirmTarget,
      targetName,
      databaseUrlConfigured: Boolean(databaseUrl),
      status: "disabled",
      sourcePackage
    });
  }

  if (!databaseUrl) {
    return buildBaseReport({
      env,
      enabled,
      confirmTarget,
      targetName,
      databaseUrlConfigured: false,
      status: "missing_database_url",
      sourcePackage
    });
  }

  const safety = evaluateStorageSchemaTargetSafety({ targetName, databaseUrl });
  if (!safety.safe) {
    return buildBaseReport({
      env,
      enabled,
      confirmTarget,
      targetName,
      databaseUrlConfigured: true,
      status: safety.status,
      sourcePackage
    });
  }

  const clientFactory = options.clientFactory ?? createPgSchemaVerifyClient;
  const client = clientFactory(databaseUrl);
  try {
    await client.connect();

    const tableResult = await client.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        ORDER BY table_name`,
      [REQUIRED_TABLES]
    );
    const presentTables = new Set(normalizeTableRows(tableResult.rows ?? []));
    const tables = REQUIRED_TABLES.map((tableName) => ({ tableName, exists: presentTables.has(tableName) }));

    const rlsResult = await client.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ANY($1::text[])
        ORDER BY c.relname`,
      [REQUIRED_TABLES]
    );
    const rlsByTable = new Map(normalizeRlsRows(rlsResult.rows ?? []).map((row) => [row.tableName, row]));
    const rls = REQUIRED_TABLES.map((tableName) => {
      const row = rlsByTable.get(tableName);
      return { tableName, rlsEnabled: row?.rlsEnabled === true, rlsForced: row?.rlsForced === true };
    });

    const grantResult = await client.query(
      `SELECT table_name, grantee, privilege_type
         FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
          AND grantee IN ('anon', 'authenticated', 'PUBLIC')
        ORDER BY table_name, grantee, privilege_type`,
      [REQUIRED_TABLES]
    );
    const disallowedGrants = normalizeGrantRows(grantResult.rows ?? []);

    const indexResult = await client.query(
      `SELECT indexname
         FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY($1::text[])
        ORDER BY indexname`,
      [REQUIRED_INDEXES]
    );
    const presentIndexes = new Set(normalizeIndexRows(indexResult.rows ?? []));
    const indexes = REQUIRED_INDEXES.map((indexName) => ({ indexName, exists: presentIndexes.has(indexName) }));

    const constraintResult = await client.query(
      `SELECT conname
         FROM pg_constraint
        WHERE conname = ANY($1::text[])
        ORDER BY conname`,
      [REQUIRED_UNIQUE_CONSTRAINTS]
    );
    const presentConstraints = new Set(normalizeConstraintRows(constraintResult.rows ?? []));
    const uniqueConstraints = REQUIRED_UNIQUE_CONSTRAINTS.map((constraintName) => ({
      constraintName,
      exists: presentConstraints.has(constraintName)
    }));

    const providerResult = await client.query(
      `SELECT provider_id, is_enabled
         FROM storage_providers
        WHERE provider_id = ANY($1::text[])
        ORDER BY provider_id`,
      [REQUIRED_PROVIDERS.map((item) => item.providerId)]
    );
    const providersById = new Map(normalizeProviderRows(providerResult.rows ?? []).map((row) => [row.providerId, row]));
    const providers = REQUIRED_PROVIDERS.map((expected) => {
      const actual = providersById.get(expected.providerId);
      return {
        providerId: expected.providerId,
        exists: Boolean(actual),
        expectedEnabled: expected.isEnabled,
        actualEnabled: actual?.isEnabled ?? null,
        enabledMatchesExpected: Boolean(actual) && actual.isEnabled === expected.isEnabled
      };
    });

    const verification = { tables, rls, indexes, uniqueConstraints, providers, disallowedGrants };
    const findings = collectFindings(verification);
    const status = findings.length === 0 ? "verified" : "verified_with_findings";
    const report = buildBaseReport({
      env,
      enabled,
      confirmTarget,
      targetName,
      databaseUrlConfigured: true,
      status,
      sourcePackage
    });
    report.readiness.readyToPromoteSchema = status === "verified";
    report.summary = {
      status,
      tablesVerifiedCount: tables.filter((item) => item.exists).length,
      rlsVerifiedCount: rls.filter((item) => item.rlsEnabled).length,
      forcedRlsVerifiedCount: rls.filter((item) => item.rlsForced).length,
      indexesVerifiedCount: indexes.filter((item) => item.exists).length,
      uniqueConstraintsVerifiedCount: uniqueConstraints.filter((item) => item.exists).length,
      providersVerifiedCount: providers.filter((item) => item.exists && item.enabledMatchesExpected).length,
      disallowedGrantCount: disallowedGrants.length
    };
    report.verification = verification;
    report.findings = findings;
    return report;
  } finally {
    await client.close();
  }
}

export async function writeStorageSchemaVerifyGate(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "storage-schema-verify-gate.json");
  const markdownPath = path.join(resolvedOutputDir, "storage-schema-verify-gate.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    outputDir: "",
    targetName: undefined,
    confirmTarget: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
    else if (arg === "--target-name") parsed.targetName = argv[++index];
    else if (arg === "--confirm-target") parsed.confirmTarget = true;
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageSchemaVerifyGate({
    targetName: args.targetName,
    confirmTarget: args.confirmTarget
  });
  if (args.outputDir) {
    await writeStorageSchemaVerifyGate(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
