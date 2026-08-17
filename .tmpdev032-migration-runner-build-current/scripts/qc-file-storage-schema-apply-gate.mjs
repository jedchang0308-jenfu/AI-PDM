#!/usr/bin/env node

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  STORAGE_SCHEMA_APPLY_GATE_VERSION,
  buildStorageSchemaApplyGate,
  writeStorageSchemaApplyGate
} from "./generate-file-storage-schema-apply-gate.mjs";
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

function makeFakeClient(calls) {
  return {
    async connect() {
      calls.push({ type: "connect" });
    },
    async apply(sql) {
      calls.push({ type: "apply", sql });
    },
    async query(sql, params) {
      calls.push({ type: "query", sql, params });
      if (sql.includes("information_schema.tables")) {
        return {
          rows: [
            { table_name: "storage_providers" },
            { table_name: "storage_objects" },
            { table_name: "storage_object_references" }
          ]
        };
      }
      if (sql.includes("pg_class")) {
        return {
          rows: [
            { relname: "storage_providers", relrowsecurity: true, relforcerowsecurity: true },
            { relname: "storage_objects", relrowsecurity: true, relforcerowsecurity: true },
            { relname: "storage_object_references", relrowsecurity: true, relforcerowsecurity: true }
          ]
        };
      }
      if (sql.includes("role_table_grants")) {
        return { rows: [] };
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
  tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "ai-pdm-storage-schema-apply-gate-qc-"));
  const packageJson = readProjectFile(root, "package.json");
  const gateSource = readProjectFile(root, "scripts/generate-file-storage-schema-apply-gate.mjs");
  const planSource = readProjectFile(root, ".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md");
  const devTaskSource = readProjectFile(root, ".ai-doc/dev_task.md");

  const disabledCalls = [];
  const disabledReport = await buildStorageSchemaApplyGate({
    env: {},
    confirmDisposable: false,
    clientFactory: () => makeFakeClient(disabledCalls)
  });
  record("STORAGE-SCHEMA-APPLY-GATE-001 gate version is stable", disabledReport.gateVersion === STORAGE_SCHEMA_APPLY_GATE_VERSION);
  record("STORAGE-SCHEMA-APPLY-GATE-002 default gate is disabled", disabledReport.summary.status === "disabled");
  record("STORAGE-SCHEMA-APPLY-GATE-003 disabled gate does not connect", disabledCalls.length === 0);
  record(
    "STORAGE-SCHEMA-APPLY-GATE-004 disabled report keeps no-apply guardrails",
    disabledReport.assumptions.noOfficialMigrationFilesWritten === true &&
      disabledReport.assumptions.noProviderIo === true &&
      disabledReport.assumptions.noDatabaseUrlPrinted === true
  );

  const missingUrlReport = await buildStorageSchemaApplyGate({
    env: { PDM_STORAGE_SCHEMA_APPLY_ENABLED: "1" },
    confirmDisposable: true,
    targetName: "ai-pdm-disposable-shadow"
  });
  record("STORAGE-SCHEMA-APPLY-GATE-005 enabled gate requires database URL", missingUrlReport.summary.status === "missing_database_url");

  const unsafeTargetReport = await buildStorageSchemaApplyGate({
    env: { PDM_STORAGE_SCHEMA_APPLY_ENABLED: "1", PDM_STORAGE_SCHEMA_APPLY_DATABASE_URL: "postgres://user:pass@example/db" },
    confirmDisposable: true,
    targetName: "ai-pdm-production"
  });
  record("STORAGE-SCHEMA-APPLY-GATE-006 production-like target is blocked", unsafeTargetReport.summary.status === "unsafe_target");

  const unsupportedTargetReport = await buildStorageSchemaApplyGate({
    env: { PDM_STORAGE_SCHEMA_APPLY_ENABLED: "1", PDM_STORAGE_SCHEMA_APPLY_DATABASE_URL: "postgres://user:pass@example/db" },
    confirmDisposable: true,
    targetKind: "supabase_production",
    targetName: "ai-pdm-disposable-shadow"
  });
  record("STORAGE-SCHEMA-APPLY-GATE-007 unsupported target kind is blocked", unsupportedTargetReport.summary.status === "unsupported_target_kind");

  const forbiddenNameCalls = [];
  const forbiddenNameReport = await buildStorageSchemaApplyGate({
    env: { PDM_STORAGE_SCHEMA_APPLY_ENABLED: "1", PDM_STORAGE_SCHEMA_APPLY_DATABASE_URL: "postgres://user:pass@example/db" },
    confirmDisposable: true,
    targetName: "ProJED_TEST",
    clientFactory: () => makeFakeClient(forbiddenNameCalls)
  });
  record("STORAGE-SCHEMA-APPLY-GATE-008 known ProJED_TEST target name is blocked", forbiddenNameReport.summary.status === "unsafe_known_target");
  record("STORAGE-SCHEMA-APPLY-GATE-009 known target name does not connect", forbiddenNameCalls.length === 0);

  const appliedCalls = [];
  const appliedReport = await buildStorageSchemaApplyGate({
    env: { PDM_STORAGE_SCHEMA_APPLY_ENABLED: "1" },
    databaseUrl: "postgres://user:pass@example/ai_pdm_disposable",
    confirmDisposable: true,
    targetName: "ai-pdm-disposable-shadow",
    clientFactory: () => makeFakeClient(appliedCalls)
  });
  record("STORAGE-SCHEMA-APPLY-GATE-010 safe disposable target can apply with fake client", appliedReport.summary.status === "applied_to_disposable");
  record(
    "STORAGE-SCHEMA-APPLY-GATE-011 proposal SQL is executed once",
    appliedCalls.filter((call) => call.type === "apply").length === 1 &&
      appliedCalls.some((call) => call.type === "apply" && call.sql.includes("CREATE TABLE IF NOT EXISTS storage_objects"))
  );
  record("STORAGE-SCHEMA-APPLY-GATE-012 schema tables are verified", appliedReport.summary.tablesVerifiedCount === 3);
  record("STORAGE-SCHEMA-APPLY-GATE-013 RLS is verified", appliedReport.summary.rlsVerifiedCount === 3);
  record("STORAGE-SCHEMA-APPLY-GATE-014 forced RLS is verified", appliedReport.summary.forcedRlsVerifiedCount === 3);
  record("STORAGE-SCHEMA-APPLY-GATE-015 disallowed grants are absent", appliedReport.summary.disallowedGrantCount === 0);
  record(
    "STORAGE-SCHEMA-APPLY-GATE-016 client is closed after execution",
    appliedCalls.at(-1)?.type === "close"
  );

  const outputs = await writeStorageSchemaApplyGate(appliedReport, tempRoot);
  record("STORAGE-SCHEMA-APPLY-GATE-017 output files are written", (await exists(outputs.jsonPath)) && (await exists(outputs.markdownPath)));
  const outputBody = `${await fsp.readFile(outputs.jsonPath, "utf8")}\n${await fsp.readFile(outputs.markdownPath, "utf8")}`;
  record("STORAGE-SCHEMA-APPLY-GATE-018 output does not print database URL", !outputBody.includes("postgres://user:pass@example"));

  record(
    "STORAGE-SCHEMA-APPLY-GATE-019 package scripts are registered",
    packageJson.includes('"storage:schema-apply-gate"') && packageJson.includes('"qc:file-storage-schema-apply-gate"')
  );
  record(
    "STORAGE-SCHEMA-APPLY-GATE-020 PM evidence references schema apply gate lane",
    planSource.includes("Phase 5J") &&
      planSource.includes("storage:schema-apply-gate") &&
      planSource.includes("qc:file-storage-schema-apply-gate") &&
      devTaskSource.includes("DEV-STORAGE-COST-001") &&
      devTaskSource.includes("Storage governance and cost")
  );
  record(
    "STORAGE-SCHEMA-APPLY-GATE-021 gate does not write official migration directories",
    !gateSource.includes("db/postgres") && !gateSource.includes("supabase/migrations")
  );

  const serialized = JSON.stringify([disabledReport, missingUrlReport, unsafeTargetReport, unsupportedTargetReport, forbiddenNameReport, appliedReport]) + outputBody;
  record(
    "STORAGE-SCHEMA-APPLY-GATE-022 reports do not expose common cloud credential markers",
    !/(service_role|X-Amz|BEGIN PRIVATE KEY|AKIA[0-9A-Z]{16})/i.test(serialized)
  );

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
} finally {
  if (tempRoot) await fsp.rm(tempRoot, { recursive: true, force: true });
}
