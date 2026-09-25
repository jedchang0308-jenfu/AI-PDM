#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { readApprovalEvidenceFileSource } from "../src/lib/pdm-approval-evidence-file-source.ts";

const dsn = process.env.PDM_POSTGRES_URL?.trim();
const target = dsn ? new URL(dsn) : null;
if (process.env.PDM_DEV121_FILE_SOURCE_DISPOSABLE !== "1" ||
    !target || !["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
  throw new Error("DEV121_FILE_SOURCE_DISPOSABLE_POSTGRES_REQUIRED");
}

const schema = `dev121_file_${crypto.randomUUID().replaceAll("-", "")}`;
const base = createAsyncDatabaseClient({ kind: "postgres", connectionString: dsn,
  maxConnections: 2, applicationName: "dev121-file-source-fixture" });
let scoped = null;
let created = false;
const checks = [];
const check = async (id, action) => { await action(); checks.push(id); };

try {
  await base.execute(`CREATE SCHEMA ${schema}`);
  created = true;
  scoped = createAsyncDatabaseClient({ kind: "postgres", connectionString: dsn,
    maxConnections: 2, applicationName: "dev121-file-source-qc",
    searchPath: `${schema},pg_catalog` });
  for (const sql of [
    `CREATE TABLE file_assets (id text PRIMARY KEY, storage_provider text, storage_bucket text,
      storage_key text, original_path text, storage_generation text, file_name text,
      file_ext text, mime_type text, file_size bigint, content_hash text, hash_algorithm text,
      linked_entity_type text, linked_entity_id text, deleted_at timestamptz)`,
    `CREATE TABLE numbering_candidate_revision_drafts (id text PRIMARY KEY, company_id text NOT NULL)`,
    `CREATE TABLE numbering_candidate_revision_files (source_file_asset_id text,
      candidate_revision_id text, company_id text NOT NULL)`,
    `CREATE TABLE drawing_revision_packages (id text PRIMARY KEY, company_id text NOT NULL)`,
    `CREATE TABLE drawing_revision_package_files (source_file_asset_id text, package_id text)`,
    `CREATE TABLE drawing_revisions (id text PRIMARY KEY, company_id text NOT NULL)`,
    `CREATE TABLE drawing_revision_files (source_file_asset_id text,
      drawing_revision_id text, company_id text NOT NULL)`,
    `CREATE TABLE submissions (id text PRIMARY KEY, company_id text NOT NULL)`,
    `CREATE TABLE submission_files (source_file_asset_id text,
      source_master_attachment_id text, submission_id text)`
  ]) await scoped.execute(sql);
  await scoped.execute(`INSERT INTO file_assets (id, file_name, linked_entity_type, linked_entity_id)
    VALUES ('candidate-a','a.pdf','numbering_candidate_revision','candidate-a'),
           ('package-b','b.pdf','drawing_revision_package','package-b'),
           ('revision-a','r.pdf','drawing_revision','revision-a'),
           ('submission-a','s.pdf','submission','submission-a'),
           ('orphan','o.pdf','submission','missing'),
           ('deleted-a','d.pdf','numbering_candidate_revision','candidate-a')`);
  await scoped.execute("UPDATE file_assets SET deleted_at = now() WHERE id = 'deleted-a'");
  await scoped.execute("INSERT INTO numbering_candidate_revision_drafts VALUES ('candidate-a','company-a')");
  await scoped.execute(`INSERT INTO numbering_candidate_revision_files VALUES
    ('candidate-a','candidate-a','company-a'), ('deleted-a','candidate-a','company-a')`);
  await scoped.execute("INSERT INTO drawing_revision_packages VALUES ('package-b','company-b')");
  await scoped.execute("INSERT INTO drawing_revision_package_files VALUES ('package-b','package-b')");
  await scoped.execute("INSERT INTO drawing_revisions VALUES ('revision-a','company-a')");
  await scoped.execute("INSERT INTO drawing_revision_files VALUES ('revision-a','revision-a','company-a')");
  await scoped.execute("INSERT INTO submissions VALUES ('submission-a','company-a')");
  await scoped.execute("INSERT INTO submission_files VALUES ('submission-a',NULL,'submission-a')");

  const read = (fileAssetId, companyId, bindingId = fileAssetId) =>
    readApprovalEvidenceFileSource(scoped, { fileAssetId, bindingId, companyId });
  await check("D121-FILE-PG-01 candidate company proof", async () =>
    assert.equal((await read("candidate-a", "company-a"))?.company_id, "company-a"));
  await check("D121-FILE-PG-02 package company proof", async () =>
    assert.equal((await read("package-b", "company-b"))?.company_id, "company-b"));
  await check("D121-FILE-PG-03 revision company proof", async () =>
    assert.equal((await read("revision-a", "company-a"))?.company_id, "company-a"));
  await check("D121-FILE-PG-04 submission company proof", async () =>
    assert.equal((await read("submission-a", "company-a"))?.company_id, "company-a"));
  await check("D121-FILE-PG-05 cross-company asset denied", async () =>
    assert.equal(await read("package-b", "company-a"), null));
  await check("D121-FILE-PG-06 orphan asset denied", async () =>
    assert.equal(await read("orphan", "company-a"), null));
  await check("D121-FILE-PG-07 deleted asset denied", async () =>
    assert.equal(await read("deleted-a", "company-a"), null));
  await check("D121-FILE-PG-08 wrong binding denied", async () =>
    assert.equal(await read("candidate-a", "company-a", "package-b"), null));
  process.stdout.write(`${JSON.stringify({ runner: "DEV-121 file source isolated PostgreSQL",
    status: "PASS", productionWrites: false, checks })}\n`);
} finally {
  try {
    await scoped?.close();
  } finally {
    try {
      if (created) await base.execute(`DROP SCHEMA ${schema} CASCADE`);
    } finally {
      await base.close();
    }
  }
}
