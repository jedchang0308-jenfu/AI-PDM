#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

const root = process.cwd();
const connectionString = process.env.PDM_POSTGRES_URL?.trim();
const repositoryDir = process.env.PDM_QC_REPOSITORY_DIR ? path.resolve(process.env.PDM_QC_REPOSITORY_DIR) : "";
if (!connectionString || !repositoryDir) throw new Error("PDM_POSTGRES_URL and PDM_QC_REPOSITORY_DIR are required");
if (!repositoryDir.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("Postgres FMEA repository must stay inside the OS temp directory");
process.env.PDM_REPOSITORY_DIR = repositoryDir;

const bootstrapPool = new pg.Pool({ connectionString, max: 1, statement_timeout: 60_000, query_timeout: 65_000 });
const now = "2026-08-09T00:00:00.000Z";

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolutePath);
      else files.push(path.relative(directory, absolutePath).replaceAll(path.sep, "/"));
    }
  }
  return files.sort();
}

async function tableCount(table) {
  const result = await bootstrapPool.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return Number(result.rows[0].count);
}

async function persistedState() {
  const active = await bootstrapPool.query("SELECT id FROM bom_drafts WHERE is_active = 1 ORDER BY id LIMIT 1");
  return {
    drafts: await tableCount("bom_drafts"),
    lines: await tableCount("bom_lines_tree"),
    jobs: await tableCount("bom_import_jobs"),
    assets: await tableCount("file_assets"),
    events: await tableCount("bom_edit_events"),
    audits: await tableCount("audit_logs"),
    activeDraftId: active.rows[0]?.id ?? null,
    files: listFiles(repositoryDir)
  };
}

let client;
try {
  console.log("Postgres FMEA: applying schema");
  await bootstrapPool.query(fs.readFileSync(path.join(root, "db", "postgres", "001_initial_schema.sql"), "utf8"));
  console.log("Postgres FMEA: seeding fixture");
  await bootstrapPool.query(
    `INSERT INTO companies (id, company_code, display_name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $4)`,
    ["company-qc-pg", "QCPG", "QC Postgres Company", now]
  );
  await bootstrapPool.query(
    `INSERT INTO users (id, display_name, email, role, company_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    ["user-qc-pg", "QC Postgres Manager", "qc-postgres@example.invalid", "R&D Manager", "company-qc-pg", now]
  );
  await bootstrapPool.query(
    `INSERT INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6)`,
    ["item-qc-pg", "company-qc-pg", "QC-PG-PARENT", "QC PG Parent", "A", now]
  );
  await bootstrapPool.query(
    `INSERT INTO submissions (
       id, company_id, item_id, drawing_number, revision, material, surface_finish, document_type,
       change_description, status, submitted_by, approval_required, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
    [
      "submission-qc-pg",
      "company-qc-pg",
      "item-qc-pg",
      "QC-PG-DRAWING",
      "A",
      "QC",
      "QC",
      "Assembly",
      "QC Postgres FMEA fixture",
      "Pending",
      "user-qc-pg",
      1,
      now
    ]
  );

  const { PostgresAsyncDatabaseClient } = await import(pathToFileURL(path.join(root, "src", "lib", "db-async-provider.ts")).href);
  const { AsyncBomWorkbenchRepository } = await import(
    pathToFileURL(path.join(root, "src", "lib", "repositories", "bom-workbench-async-repository.ts")).href
  );
  client = new PostgresAsyncDatabaseClient({ kind: "postgres", connectionString, maxConnections: 2 });
  const repository = new AsyncBomWorkbenchRepository(client, () => now, () => crypto.randomUUID());
  const input = (overrides = {}) => ({
    submissionId: "submission-qc-pg",
    actorId: "user-qc-pg",
    setActive: true,
    originalFilename: "postgres-bom.xls",
    fileBuffer: Buffer.from("Part Number\tQuantity\nQC-PG-CHILD\t2", "utf8"),
    ...overrides
  });

  const valid = await repository.createDraftFromSolidWorksXls(input());
  console.log("Postgres FMEA: valid import completed");
  assert(valid && valid.draft.lines.length === 1, "live Postgres BOM import succeeds");
  assert.equal(valid.draft.lines[0].part_number, "QC-PG-CHILD", "live Postgres preserves parsed output");
  const validAsset = await bootstrapPool.query("SELECT * FROM file_assets WHERE id = $1", [valid.importJob.source_asset_id]);
  assert(validAsset.rows[0] && fs.existsSync(validAsset.rows[0].original_path), "live Postgres import persists its source asset and file");

  const stateBeforeFault = await persistedState();
  await bootstrapPool.query(`
    CREATE OR REPLACE FUNCTION qc_fail_bom_file_asset() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'QC_PG_DB_FAULT';
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER qc_fail_bom_file_asset
    BEFORE INSERT ON file_assets
    FOR EACH ROW EXECUTE FUNCTION qc_fail_bom_file_asset();
  `);
  await assert.rejects(
    () => repository.createDraftFromSolidWorksXls(input({ originalFilename: "postgres-fault.xls" })),
    /QC_PG_DB_FAULT/u,
    "live Postgres propagates the original transactional failure"
  );
  console.log("Postgres FMEA: injected rollback completed");
  assert.deepEqual(await persistedState(), stateBeforeFault, "live Postgres failure rolls back every row and compensates the source file");

  console.log("QC System Health Phase 6-8 Postgres FMEA: PASS (schema apply, valid import, transaction rollback, file compensation)");
} finally {
  if (client) await client.close().catch(() => undefined);
  await bootstrapPool.end().catch(() => undefined);
}
