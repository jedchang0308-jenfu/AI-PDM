#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildStorageMetadataModelBlueprint } from "./storage-metadata-model.mjs";

export const STORAGE_SCHEMA_MIGRATION_PACKAGE_VERSION = "storage-schema-migration-package/v1";

export const STORAGE_SCHEMA_MIGRATION_PROPOSAL_SQL = `-- AI_PDM storage metadata schema migration proposal
-- Version: ${STORAGE_SCHEMA_MIGRATION_PACKAGE_VERSION}
-- Status: proposal_only_not_applied
-- Guardrail: review and apply only after DEV-SUPABASE-DB-001 runtime DB gate passes.
-- Guardrail: do not grant anon/authenticated Data API access; application access is server-side only.

BEGIN;
SET search_path = public;

CREATE TABLE IF NOT EXISTS storage_providers (
  provider_id TEXT PRIMARY KEY,
  provider_kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  capabilities_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage_objects (
  object_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES storage_providers(provider_id),
  bucket TEXT NOT NULL DEFAULT '',
  object_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  hash_algorithm TEXT NOT NULL DEFAULT 'SHA-256',
  byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
  mime_type TEXT,
  lifecycle_tier TEXT NOT NULL DEFAULT 'hot' CHECK (lifecycle_tier IN ('hot', 'warm', 'cold', 'archive')),
  object_status TEXT NOT NULL DEFAULT 'active' CHECK (object_status IN ('active', 'registered_external', 'archived', 'deleted', 'missing', 'hash_mismatch')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (provider_id, bucket, object_key)
);

CREATE TABLE IF NOT EXISTS storage_object_references (
  reference_id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL REFERENCES storage_objects(object_id) ON DELETE RESTRICT,
  linked_entity_type TEXT NOT NULL,
  linked_entity_id TEXT NOT NULL,
  file_role TEXT NOT NULL,
  filename TEXT NOT NULL,
  reference_status TEXT NOT NULL DEFAULT 'active' CHECK (reference_status IN ('active', 'obsolete', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (object_id, linked_entity_type, linked_entity_id, file_role, filename)
);

CREATE INDEX IF NOT EXISTS idx_storage_objects_provider_key ON storage_objects(provider_id, bucket, object_key);
CREATE INDEX IF NOT EXISTS idx_storage_objects_hash ON storage_objects(content_hash, hash_algorithm);
CREATE INDEX IF NOT EXISTS idx_storage_objects_lifecycle ON storage_objects(lifecycle_tier, object_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_storage_object_references_entity ON storage_object_references(linked_entity_type, linked_entity_id);
CREATE INDEX IF NOT EXISTS idx_storage_object_references_object ON storage_object_references(object_id, reference_status);

INSERT INTO storage_providers (provider_id, provider_kind, display_name, capabilities_json, is_enabled)
VALUES
  ('local_repository', 'local_repository', 'Local repository', '{"server_stream": true, "signed_url": false}'::jsonb, TRUE),
  ('supabase_storage', 'supabase_storage', 'Supabase Storage', '{"server_stream": true, "signed_url": true}'::jsonb, FALSE),
  ('s3_compatible', 's3_compatible', 'S3-compatible storage', '{"server_stream": true, "signed_url": true}'::jsonb, FALSE),
  ('nas_gateway', 'nas_gateway', 'NAS gateway', '{"server_stream": true, "signed_url": false}'::jsonb, FALSE)
ON CONFLICT (provider_id) DO UPDATE SET
  provider_kind = excluded.provider_kind,
  display_name = excluded.display_name,
  capabilities_json = excluded.capabilities_json,
  updated_at = now();

ALTER TABLE storage_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_object_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_providers FORCE ROW LEVEL SECURITY;
ALTER TABLE storage_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE storage_object_references FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE storage_providers, storage_objects, storage_object_references FROM anon, authenticated;
REVOKE ALL ON TABLE storage_providers, storage_objects, storage_object_references FROM PUBLIC;

COMMIT;
`;

function buildMarkdown(report) {
  const lines = [
    "# AI_PDM Storage Schema Migration Proposal",
    "",
    `Generated at: ${report.generatedAt}`,
    `Package version: ${report.packageVersion}`,
    "",
    "## Scope",
    "",
    "- Creates provider-neutral storage metadata tables.",
    "- Aligns with the Phase 4Q external large-file registration repository contract.",
    "- Keeps Data API exposure opt-in by revoking anon/authenticated/PUBLIC table privileges and enabling + forcing RLS.",
    "- Does not apply a migration, create live tables, move files, update metadata pointers, or call storage providers.",
    "",
    "## Proposed Tables",
    ""
  ];

  for (const table of report.proposedTables) {
    lines.push(`- ${table.name}: ${table.purpose}`);
  }

  lines.push("", "## Review Checklist", "");
  for (const item of report.reviewChecklist) {
    lines.push(`- ${item.check}: ${item.requirement}`);
  }

  lines.push("", "## Required Follow-up", "");
  for (const item of report.requiredFollowUp) {
    lines.push(`- ${item}`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function buildStorageSchemaMigrationPackage() {
  const blueprint = buildStorageMetadataModelBlueprint();
  const proposedTables = blueprint.tables.map((table) => ({
    name: table.name,
    purpose: table.purpose,
    requiredColumns: table.requiredColumns,
    constraints: table.constraints
  }));

  return {
    reportType: "file-storage-schema-migration-package",
    packageVersion: STORAGE_SCHEMA_MIGRATION_PACKAGE_VERSION,
    generatedAt: new Date().toISOString(),
    status: "proposal_only_not_applied",
    sourceBlueprint: {
      version: blueprint.version,
      status: blueprint.status,
      guardrails: blueprint.guardrails
    },
    assumptions: {
      noMigrationApplied: true,
      noRuntimeTablesCreated: true,
      noProviderIo: true,
      noMetadataPointersUpdated: true,
      noDataApiGrantsForAnonOrAuthenticated: true,
      rlsEnabledForPublicSchemaTables: true,
      rlsForcedForPublicSchemaTables: true,
      serverSideRepositoryOnly: true
    },
    proposedTables,
    sql: STORAGE_SCHEMA_MIGRATION_PROPOSAL_SQL,
    securityControls: [
      "Enable and force RLS on storage_providers, storage_objects, and storage_object_references.",
      "Revoke table privileges from anon, authenticated, and PUBLIC.",
      "Do not create browser-facing policies until a separate API exposure review is approved.",
      "Keep application writes behind server-side AsyncDatabaseClient repositories."
    ],
    reviewChecklist: [
      {
        check: "db_runtime_gate",
        requirement: "DEV-SUPABASE-DB-001 staging/prod runtime DB gate is complete before applying this proposal."
      },
      {
        check: "supabase_advisors",
        requirement: "Run Supabase security and performance advisors after applying to a disposable/staging target."
      },
      {
        check: "rls_and_grants",
        requirement: "Confirm RLS is enabled and forced, and anon/authenticated/PUBLIC do not have direct Data API access."
      },
      {
        check: "repository_contract",
        requirement: "Run qc:external-large-file-intake against a target containing these tables before enabling any API executor."
      },
      {
        check: "rollback",
        requirement: "Prepare a reversible migration or disposable-target reset path before production apply."
      }
    ],
    requiredFollowUp: [
      "Create an official migration with the project migration workflow after DB runtime gate approval.",
      "Register real provider rows such as Wasabi/R2/NAS gateway before external object registration uses custom provider_id values.",
      "Add staged repository integration tests against the applied schema.",
      "Keep large-file executor disabled until object registration, restore, and audit checks pass."
    ]
  };
}

export async function writeStorageSchemaMigrationPackage(report, outputDir) {
  const resolvedOutputDir = path.resolve(outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  const jsonPath = path.join(resolvedOutputDir, "storage-schema-migration-package.json");
  const markdownPath = path.join(resolvedOutputDir, "storage-schema-migration-package.md");
  const sqlPath = path.join(resolvedOutputDir, "storage-schema-migration-proposal.sql");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdown(report), "utf8");
  await writeFile(sqlPath, report.sql, "utf8");
  return { jsonPath, markdownPath, sqlPath };
}

function parseArgs(argv) {
  const parsed = { outputDir: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") parsed.outputDir = argv[++index] ?? "";
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = buildStorageSchemaMigrationPackage();
  if (args.outputDir) {
    await writeStorageSchemaMigrationPackage(report, args.outputDir);
  }
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
