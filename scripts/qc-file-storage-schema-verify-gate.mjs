#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STORAGE_SCHEMA_VERIFY_GATE_VERSION,
  buildStorageSchemaVerifyGate,
  writeStorageSchemaVerifyGate
} from "./generate-file-storage-schema-verify-gate.mjs";
import { readProjectFile } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function makeFakeClient(calls, overrides = {}) {
  return {
    async connect() {
      calls.push({ type: "connect" });
    },
    async query(sql, params) {
      calls.push({ type: "query", sql, params });
      if (sql.includes("information_schema.tables")) {
        return {
          rows: overrides.tableRows ?? [
            { table_name: "storage_providers" },
            { table_name: "storage_objects" },
            { table_name: "storage_object_references" }
          ]
        };
      }
      if (sql.includes("pg_class")) {
        return {
          rows: overrides.rlsRows ?? [
            { relname: "storage_providers", relrowsecurity: true, relforcerowsecurity: true },
            { relname: "storage_objects", relrowsecurity: true, relforcerowsecurity: true },
            { relname: "storage_object_references", relrowsecurity: true, relforcerowsecurity: true }
          ]
        };
      }
      if (sql.includes("role_table_grants")) {
        return { rows: overrides.grantRows ?? [] };
      }
      if (sql.includes("pg_indexes")) {
        return {
          rows: overrides.indexRows ?? [
            { indexname: "idx_storage_objects_provider_key" },
            { indexname: "idx_storage_objects_hash" },
            { indexname: "idx_storage_objects_lifecycle" },
            { indexname: "idx_storage_object_references_entity" },
            { indexname: "idx_storage_object_references_object" }
          ]
        };
      }
      if (sql.includes("pg_constraint")) {
        return {
          rows: overrides.constraintRows ?? [
            { conname: "storage_objects_provider_id_bucket_object_key_key" },
            { conname: "storage_object_references_object_id_linked_entity_type_linked_entity_id_file_role_filename_key" }
          ]
        };
      }
      if (sql.includes("storage_providers")) {
        return {
          rows: overrides.providerRows ?? [
            { provider_id: "local_repository", is_enabled: true },
            { provider_id: "supabase_storage", is_enabled: false },
            { provider_id: "s3_compatible", is_enabled: false },
            { provider_id: "nas_gateway", is_enabled: false }
          ]
        };
      }
      return { rows: [] };
    },
    async close() {
      calls.push({ type: "close" });
    }
  };
}

let tempRoot;

try {
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-schema-verify-gate-qc-"));
  const packageJson = readProjectFile(root, "package.json");
  const gateSource = readProjectFile(root, "scripts/generate-file-storage-schema-verify-gate.mjs");
  const planSource = readProjectFile(root, ".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md");
  const devTaskSource = readProjectFile(root, ".ai-doc/dev_task.md");

  const disabledCalls = [];
  const disabledReport = await buildStorageSchemaVerifyGate({
    env: {},
    confirmTarget: false,
    clientFactory: () => makeFakeClient(disabledCalls)
  });
  record("STORAGE-SCHEMA-VERIFY-GATE-001 gate version is stable", disabledReport.gateVersion === STORAGE_SCHEMA_VERIFY_GATE_VERSION);
  record("STORAGE-SCHEMA-VERIFY-GATE-002 default gate is disabled", disabledReport.summary.status === "disabled");
  record("STORAGE-SCHEMA-VERIFY-GATE-003 disabled gate does not connect", disabledCalls.length === 0);
  record(
    "STORAGE-SCHEMA-VERIFY-GATE-004 disabled report keeps read-only guardrails",
    disabledReport.assumptions.readOnlyVerification === true &&
      disabledReport.assumptions.noSqlApplied === true &&
      disabledReport.assumptions.noDatabaseUrlPrinted === true
  );

  const missingUrlReport = await buildStorageSchemaVerifyGate({
    env: { PDM_STORAGE_SCHEMA_VERIFY_ENABLED: "1" },
    confirmTarget: true,
    targetName: "ai-pdm-disposable-shadow"
  });
  record("STORAGE-SCHEMA-VERIFY-GATE-005 enabled gate requires database URL", missingUrlReport.summary.status === "missing_database_url");

  const unsafeTargetReport = await buildStorageSchemaVerifyGate({
    env: { PDM_STORAGE_SCHEMA_VERIFY_ENABLED: "1", PDM_STORAGE_SCHEMA_VERIFY_DATABASE_URL: "postgres://user:pass@example/db" },
    confirmTarget: true,
    targetName: "ai-pdm-production"
  });
  record("STORAGE-SCHEMA-VERIFY-GATE-006 production-like target is blocked", unsafeTargetReport.summary.status === "unsafe_target");

  const forbiddenRefCalls = [];
  const forbiddenRefReport = await buildStorageSchemaVerifyGate({
    env: { PDM_STORAGE_SCHEMA_VERIFY_ENABLED: "1" },
    databaseUrl: "postgres://user:pass@db.fhisnnufoeulxqrchldf.supabase.co/postgres",
    confirmTarget: true,
    targetName: "ai-pdm-test",
    clientFactory: () => makeFakeClient(forbiddenRefCalls)
  });
  record("STORAGE-SCHEMA-VERIFY-GATE-007 known ProJED_TEST database ref is blocked", forbiddenRefReport.summary.status === "unsafe_known_target");
  record("STORAGE-SCHEMA-VERIFY-GATE-008 known database ref does not connect", forbiddenRefCalls.length === 0);

  const verifiedCalls = [];
  const verifiedReport = await buildStorageSchemaVerifyGate({
    env: { PDM_STORAGE_SCHEMA_VERIFY_ENABLED: "1" },
    databaseUrl: "postgres://user:pass@example/ai_pdm_disposable",
    confirmTarget: true,
    targetName: "ai-pdm-staging-shadow",
    clientFactory: () => makeFakeClient(verifiedCalls)
  });
  record("STORAGE-SCHEMA-VERIFY-GATE-009 safe target verifies with fake client", verifiedReport.summary.status === "verified");
  record("STORAGE-SCHEMA-VERIFY-GATE-010 schema tables are verified", verifiedReport.summary.tablesVerifiedCount === 3);
  record("STORAGE-SCHEMA-VERIFY-GATE-011 RLS is verified", verifiedReport.summary.rlsVerifiedCount === 3);
  record("STORAGE-SCHEMA-VERIFY-GATE-012 forced RLS is verified", verifiedReport.summary.forcedRlsVerifiedCount === 3);
  record("STORAGE-SCHEMA-VERIFY-GATE-013 indexes are verified", verifiedReport.summary.indexesVerifiedCount === 5);
  record("STORAGE-SCHEMA-VERIFY-GATE-014 unique constraints are verified", verifiedReport.summary.uniqueConstraintsVerifiedCount === 2);
  record("STORAGE-SCHEMA-VERIFY-GATE-015 provider seed rows are verified", verifiedReport.summary.providersVerifiedCount === 4);
  record("STORAGE-SCHEMA-VERIFY-GATE-016 disallowed grants are absent", verifiedReport.summary.disallowedGrantCount === 0);
  record("STORAGE-SCHEMA-VERIFY-GATE-017 client is closed after verification", verifiedCalls.at(-1)?.type === "close");
  record("STORAGE-SCHEMA-VERIFY-GATE-018 gate never executes apply SQL", verifiedCalls.every((call) => call.type !== "apply"));

  const findingCalls = [];
  const findingReport = await buildStorageSchemaVerifyGate({
    env: { PDM_STORAGE_SCHEMA_VERIFY_ENABLED: "1" },
    databaseUrl: "postgres://user:pass@example/ai_pdm_disposable",
    confirmTarget: true,
    targetName: "ai-pdm-disposable-shadow",
    clientFactory: () =>
      makeFakeClient(findingCalls, {
        rlsRows: [{ relname: "storage_providers", relrowsecurity: false, relforcerowsecurity: false }],
        grantRows: [{ table_name: "storage_objects", grantee: "authenticated", privilege_type: "SELECT" }],
        providerRows: [{ provider_id: "local_repository", is_enabled: false }]
      })
  });
  record("STORAGE-SCHEMA-VERIFY-GATE-019 findings downgrade readiness", findingReport.summary.status === "verified_with_findings");
  record(
    "STORAGE-SCHEMA-VERIFY-GATE-020 findings include RLS, forced RLS, grant, and provider issues",
    findingReport.findings.some((item) => item.includes("RLS disabled")) &&
      findingReport.findings.some((item) => item.includes("RLS not forced")) &&
      findingReport.findings.some((item) => item.includes("disallowed grant")) &&
      findingReport.findings.some((item) => item.includes("enabled flag mismatch"))
  );

  const outputs = await writeStorageSchemaVerifyGate(verifiedReport, tempRoot);
  record("STORAGE-SCHEMA-VERIFY-GATE-021 output files are written", (await exists(outputs.jsonPath)) && (await exists(outputs.markdownPath)));
  const outputBody = `${await fsp.readFile(outputs.jsonPath, "utf8")}\n${await fsp.readFile(outputs.markdownPath, "utf8")}`;
  record("STORAGE-SCHEMA-VERIFY-GATE-022 output does not print database URL", !outputBody.includes("postgres://user:pass@example"));

  record(
    "STORAGE-SCHEMA-VERIFY-GATE-023 package scripts are registered",
    packageJson.includes('"storage:schema-verify-gate"') && packageJson.includes('"qc:file-storage-schema-verify-gate"')
  );
  record(
    "STORAGE-SCHEMA-VERIFY-GATE-024 PM evidence references schema verify gate lane",
    planSource.includes("Phase 5J") &&
      planSource.includes("storage:schema-verify-gate") &&
      planSource.includes("qc:file-storage-schema-verify-gate") &&
      devTaskSource.includes("DEV-STORAGE-COST-001") &&
      devTaskSource.includes("Storage governance and cost")
  );
  record(
    "STORAGE-SCHEMA-VERIFY-GATE-025 gate does not write official migration directories",
    !gateSource.includes("db/postgres") && !gateSource.includes("supabase/migrations")
  );

  const serialized = JSON.stringify([disabledReport, missingUrlReport, unsafeTargetReport, forbiddenRefReport, verifiedReport, findingReport]) + outputBody;
  record(
    "STORAGE-SCHEMA-VERIFY-GATE-026 reports do not expose common cloud credential markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16})/i.test(serialized)
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
} finally {
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true });
}
