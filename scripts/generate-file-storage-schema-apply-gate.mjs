#!/usr/bin/env node

import "./retired-supabase-tooling-block.mjs";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import {
  STORAGE_SCHEMA_MIGRATION_PACKAGE_VERSION,
  STORAGE_SCHEMA_MIGRATION_PROPOSAL_SQL,
  buildStorageSchemaMigrationPackage
} from "./generate-file-storage-schema-migration-package.mjs";
import { evaluateStorageSchemaTargetSafety } from "./file-storage-schema-target-safety.mjs";

export const STORAGE_SCHEMA_APPLY_GATE_VERSION = "storage-schema-apply-gate/v1";

const DEFAULT_TARGET_KIND = "postgres_disposable";
const REQUIRED_TABLES = ["storage_providers", "storage_objects", "storage_object_references"];
function statusReason(status) {
  if (status === "disabled") return "set PDM_STORAGE_SCHEMA_APPLY_ENABLED=1 and pass --confirm-disposable";
  if (status === "missing_database_url") return "set PDM_STORAGE_SCHEMA_APPLY_DATABASE_URL for a disposable target";
  if (status === "unsupported_target_kind") return "only postgres_disposable targets can be used by this gate";
  if (status === "unsafe_target") return "target name must clearly identify a disposable/staging/shadow/test database and not production/main";
  if (status === "unsafe_known_target") return "target matches a known Supabase project that is not approved for AI_PDM storage schema apply";
  return "proposal SQL was applied to the disposable target and schema checks passed";
}

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Storage Schema Apply Gate",
    "",
    `Generated at: ${report.generatedAt}`,
    `Gate version: ${report.gateVersion}`,
    `Package version: ${report.sourcePackage.packageVersion}`,
    "",
    "## Summary",
    "",
    `- Status: ${report.summary.status}`,
    `- Target kind: ${report.inputs.targetKind}`,
    `- Target name: ${report.inputs.targetName || "-"}`,
    `- Database URL configured: ${report.inputs.databaseUrlConfigured}`,
    `- Tables verified: ${report.summary.tablesVerifiedCount}`,
    `- RLS verified: ${report.summary.rlsVerifiedCount}`,
    `- Forced RLS verified: ${report.summary.forcedRlsVerifiedCount}`,
    `- Disallowed grant findings: ${report.summary.disallowedGrantCount}`,
    "",
    "## Guardrails",
    "",
    `- Explicit enable required: ${report.assumptions.explicitEnableRequired}`,
    `- Disposable confirmation required: ${report.assumptions.disposableConfirmationRequired}`,
    `- Disposable target only: ${report.assumptions.disposableTargetOnly}`,
    `- Official migration directories untouched: ${report.assumptions.noOfficialMigrationFilesWritten}`,
    `- Provider requests disabled: ${report.assumptions.noProviderIo}`,
    "",
    "## Verification",
    ""
  ];

  if (report.verification.tables.length === 0) {
    lines.push("- No live schema verification was executed.");
  } else {
    for (const item of report.verification.tables) {
      lines.push(`- table ${item.tableName}: exists=${item.exists}`);
    }
    for (const item of report.verification.rls) {
      lines.push(`- rls ${item.tableName}: enabled=${item.rlsEnabled}, forced=${item.rlsForced}`);
    }
  }

  if (report.verification.disallowedGrants.length > 0) {
    lines.push("", "## Grant Findings", "");
    for (const item of report.verification.disallowedGrants) {
      lines.push(`- ${item.grantee}.${item.tableName}.${item.privilegeType}`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function buildBaseReport({ env, enabled, confirmDisposable, targetKind, targetName, databaseUrlConfigured, status, sourcePackage }) {
  return {
    reportType: "file-storage-schema-apply-gate",
    gateVersion: STORAGE_SCHEMA_APPLY_GATE_VERSION,
    generatedAt: new Date().toISOString(),
    sourcePackage: {
      reportType: sourcePackage.reportType,
      packageVersion: sourcePackage.packageVersion,
      status: sourcePackage.status,
      migrationPackageVersion: STORAGE_SCHEMA_MIGRATION_PACKAGE_VERSION
    },
    assumptions: {
      explicitEnableRequired: true,
      disposableConfirmationRequired: true,
      disposableTargetOnly: true,
      noOfficialMigrationFilesWritten: true,
      noRuntimeProviderCutover: true,
      noProviderIo: true,
      noMetadataPointersUpdated: true,
      noDatabaseUrlPrinted: true
    },
    inputs: {
      targetKind,
      targetName,
      enabled,
      confirmDisposable,
      databaseUrlConfigured,
      envFlags: {
        applyEnabledConfigured: env.PDM_STORAGE_SCHEMA_APPLY_ENABLED === "1",
        databaseUrlConfigured: Boolean(env.PDM_STORAGE_SCHEMA_APPLY_DATABASE_URL),
        targetNameConfigured: Boolean(env.PDM_STORAGE_SCHEMA_APPLY_TARGET_NAME),
        targetKindConfigured: Boolean(env.PDM_STORAGE_SCHEMA_APPLY_TARGET_KIND)
      }
    },
    readiness: {
      readyToApply: false,
      reason: statusReason(status)
    },
    summary: {
      status,
      tablesVerifiedCount: 0,
      rlsVerifiedCount: 0,
      forcedRlsVerifiedCount: 0,
      disallowedGrantCount: 0
    },
    verification: {
      tables: [],
      rls: [],
      disallowedGrants: []
    }
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

export function createPgSchemaApplyClient(databaseUrl) {
  const client = new pg.Client({ connectionString: databaseUrl });
  return {
    async connect() {
      await client.connect();
    },
    async apply(sql) {
      await client.query(sql);
    },
    async query(sql, params = []) {
      return client.query(sql, params);
    },
    async close() {
      await client.end();
    }
  };
}

export async function buildStorageSchemaApplyGate(options = {}) {
  const env = options.env ?? process.env;
  const enabled = options.enabled ?? env.PDM_STORAGE_SCHEMA_APPLY_ENABLED === "1";
  const confirmDisposable = options.confirmDisposable === true;
  const targetKind = options.targetKind ?? env.PDM_STORAGE_SCHEMA_APPLY_TARGET_KIND ?? DEFAULT_TARGET_KIND;
  const targetName = options.targetName ?? env.PDM_STORAGE_SCHEMA_APPLY_TARGET_NAME ?? "";
  const databaseUrl = options.databaseUrl ?? env.PDM_STORAGE_SCHEMA_APPLY_DATABASE_URL ?? "";
  const sourcePackage = buildStorageSchemaMigrationPackage();

  if (!enabled || !confirmDisposable) {
    return buildBaseReport({
      env,
      enabled,
      confirmDisposable,
      targetKind,
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
      confirmDisposable,
      targetKind,
      targetName,
      databaseUrlConfigured: false,
      status: "missing_database_url",
      sourcePackage
    });
  }

  const safety = evaluateStorageSchemaTargetSafety({
    targetKind,
    targetName,
    databaseUrl,
    requireDisposableKind: true
  });
  if (!safety.safe) {
    return buildBaseReport({
      env,
      enabled,
      confirmDisposable,
      targetKind,
      targetName,
      databaseUrlConfigured: true,
      status: safety.status,
      sourcePackage
    });
  }

  const clientFactory = options.clientFactory ?? createPgSchemaApplyClient;
  const client = clientFactory(databaseUrl);
  try {
    await client.connect();
    await client.apply(STORAGE_SCHEMA_MIGRATION_PROPOSAL_SQL);

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

    const tablesVerifiedCount = tables.filter((item) => item.exists).length;
    const rlsVerifiedCount = rls.filter((item) => item.rlsEnabled).length;
    const forcedRlsVerifiedCount = rls.filter((item) => item.rlsForced).length;
    const disallowedGrantCount = disallowedGrants.length;
    const status = tablesVerifiedCount === REQUIRED_TABLES.length &&
      rlsVerifiedCount === REQUIRED_TABLES.length &&
      forcedRlsVerifiedCount === REQUIRED_TABLES.length &&
      disallowedGrantCount === 0
      ? "applied_to_disposable"
      : "applied_with_findings";

    const report = buildBaseReport({
      env,
      enabled,
      confirmDisposable,
      targetKind,
      targetName,
      databaseUrlConfigured: true,
      status,
      sourcePackage
    });
    report.readiness.readyToApply = status === "applied_to_disposable";
    report.summary = {
      status,
      tablesVerifiedCount,
      rlsVerifiedCount,
      forcedRlsVerifiedCount,
      disallowedGrantCount
    };
    report.verification = { tables, rls, disallowedGrants };
    return report;
  } finally {
    await client.close();
  }
}

export async function writeStorageSchemaApplyGate(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "storage-schema-apply-gate.json");
  const markdownPath = path.join(resolvedOutputDir, "storage-schema-apply-gate.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const parsed = {
    outputDir: "",
    targetKind: undefined,
    targetName: undefined,
    confirmDisposable: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
    else if (arg === "--target-kind") parsed.targetKind = argv[++index];
    else if (arg === "--target-name") parsed.targetName = argv[++index];
    else if (arg === "--confirm-disposable") parsed.confirmDisposable = true;
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildStorageSchemaApplyGate({
    targetKind: args.targetKind,
    targetName: args.targetName,
    confirmDisposable: args.confirmDisposable
  });
  if (args.outputDir) {
    await writeStorageSchemaApplyGate(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
