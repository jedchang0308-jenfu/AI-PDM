#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import pg from "pg";

import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { resolvePartPreviewsAsync } from "../src/lib/pdm-part-preview.ts";

const connectionString = process.env.PDM_POSTGRES_SHADOW_URL?.trim();
if (!connectionString) {
  console.error("BLOCKED DEV-065 PostgreSQL shadow QC: PDM_POSTGRES_SHADOW_URL is required; no database was contacted and productionWrites=false");
  process.exit(2);
}

const target = new URL(connectionString);
const databaseName = target.pathname.replace(/^\//u, "").toLowerCase();
const localHost = ["127.0.0.1", "localhost", "::1"].includes(target.hostname.toLowerCase());
const disposableName = /(test|shadow|dev065|pdm[_-]?dev)/u.test(databaseName) && !/(prod|production|live)/u.test(databaseName);
const explicitlyDisposable = process.env.PDM_DEV065_POSTGRES_DISPOSABLE === "true";
if (target.protocol !== "postgres:" && target.protocol !== "postgresql:") throw new Error("DEV065_POSTGRES_UNSAFE_PROTOCOL");
if (!(localHost || (disposableName && explicitlyDisposable))) {
  throw new Error(`DEV065_POSTGRES_UNSAFE_TARGET:${target.hostname}/${databaseName}`);
}

const migration = fs.readFileSync(path.join(process.cwd(), "db", "postgres", "046_part_preview_settings.sql"), "utf8")
  .replace(/^\s*BEGIN;\s*/iu, "")
  .replace(/\s*COMMIT;\s*$/iu, "");
const schema = `dev065_${crypto.randomUUID().replaceAll("-", "")}`;
const pool = new pg.Pool({ connectionString, max: 3, connectionTimeoutMillis: 10_000, statement_timeout: 20_000 });
const client = await pool.connect();
const checks = [];
const check = async (id, fn) => {
  try { await fn(); checks.push({ id, pass: true }); }
  catch (error) { checks.push({ id, pass: false, error: error instanceof Error ? error.message : String(error) }); }
};

try {
  await client.query("BEGIN");
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET LOCAL search_path TO ${schema}, public`);
  await client.query(`
    CREATE TABLE companies (id TEXT PRIMARY KEY);
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE part_numbers (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), part_number TEXT NOT NULL);
    CREATE TABLE file_assets (
      id TEXT PRIMARY KEY, storage_provider TEXT, original_path TEXT, storage_bucket TEXT, storage_key TEXT,
      file_name TEXT NOT NULL, file_ext TEXT, mime_type TEXT, file_size BIGINT, content_hash TEXT,
      linked_entity_type TEXT NOT NULL, linked_entity_id TEXT NOT NULL,
      document_category TEXT NOT NULL, deleted_at TIMESTAMPTZ
    );
    CREATE TABLE drawing_numbers (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, drawing_number TEXT NOT NULL);
    CREATE TABLE drawings (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, formal_drawing_number_id TEXT NOT NULL);
    CREATE TABLE drawing_part_links (id TEXT PRIMARY KEY, drawing_number_id TEXT NOT NULL, part_number_id TEXT NOT NULL, link_type TEXT NOT NULL);
    CREATE TABLE drawing_revisions (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, drawing_id TEXT NOT NULL, revision TEXT NOT NULL);
    CREATE TABLE canonical_workbench_states (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, entity_type TEXT NOT NULL, canonical_entity_id TEXT NOT NULL,
      data_layer TEXT NOT NULL, revision_id TEXT
    );
    CREATE TABLE drawing_revision_files (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, drawing_revision_id TEXT NOT NULL, source_file_asset_id TEXT NOT NULL,
      role TEXT, display_name TEXT, is_primary INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
      removed_at TIMESTAMPTZ
    );
    CREATE TABLE file_derivatives (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, source_file_asset_id TEXT NOT NULL, source_content_hash TEXT NOT NULL,
      derivative_kind TEXT, storage_key TEXT, mime_type TEXT, generator_profile TEXT, generator_version TEXT,
      status TEXT NOT NULL, created_at TIMESTAMPTZ
    );
    CREATE TABLE preview_jobs (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, source_file_asset_id TEXT NOT NULL, source_content_hash TEXT NOT NULL,
      status TEXT NOT NULL, locked_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, created_at TIMESTAMPTZ
    );
    INSERT INTO companies VALUES ('company-a'), ('company-b');
    INSERT INTO users VALUES ('user-a');
    INSERT INTO part_numbers VALUES ('part-a', 'company-a', 'A-001'), ('part-b', 'company-b', 'B-001');
    INSERT INTO drawing_numbers VALUES ('drawing-number-a', 'company-a', 'A-M01');
    INSERT INTO drawings VALUES ('drawing-a', 'company-a', 'drawing-number-a');
    INSERT INTO drawing_revisions VALUES ('revision-a', 'company-a', 'drawing-a', 'A');
    INSERT INTO canonical_workbench_states VALUES ('drawing-state-a', 'company-a', 'drawing', 'drawing-a', 'drawing_production', 'revision-a');
    INSERT INTO drawing_part_links VALUES ('link-a', 'drawing-number-a', 'part-a', 'primary_manufacturing');
  `);
  await check("PPC-PG-001 migration fresh apply and re-run", async () => { await client.query(migration); await client.query(migration); });
  await check("PPC-PG-002 valid custom setting", async () => {
    await client.query("INSERT INTO file_assets (id, file_name, file_ext, mime_type, file_size, content_hash, linked_entity_type, linked_entity_id, document_category, deleted_at) VALUES ('asset-a', 'part.png', 'png', 'image/png', 100, repeat('a', 64), 'part_number', 'part-a', 'part_preview_image', NULL)");
    await client.query("INSERT INTO part_preview_settings (id, company_id, part_number_id, source_mode, file_asset_id, created_by, updated_by) VALUES ('setting-a', 'company-a', 'part-a', 'custom_image', 'asset-a', 'user-a', 'user-a')");
  });
  await check("PPC-PG-003 active custom delete is blocked", async () => {
    await client.query("SAVEPOINT active_delete");
    try { await client.query("UPDATE file_assets SET deleted_at = now() WHERE id = 'asset-a'"); assert.fail("expected active delete guard"); }
    catch (error) { assert.match(error.message, /PART_PREVIEW_ACTIVE_ASSET/u); await client.query("ROLLBACK TO SAVEPOINT active_delete"); }
  });
  await check("PPC-PG-004 reset releases asset", async () => {
    await client.query("UPDATE part_preview_settings SET source_mode = 'auto', file_asset_id = NULL, row_version = row_version + 1 WHERE id = 'setting-a'");
    await client.query("UPDATE file_assets SET deleted_at = now() WHERE id = 'asset-a'");
    assert.ok((await client.query("SELECT deleted_at FROM file_assets WHERE id = 'asset-a'")).rows[0].deleted_at);
  });
  await check("PPC-PG-005 company and asset binding guards fail closed", async () => {
    for (const statement of [
      "INSERT INTO part_preview_settings (id, company_id, part_number_id, source_mode) VALUES ('bad-company', 'company-a', 'part-b', 'auto')",
      "INSERT INTO part_preview_settings (id, company_id, part_number_id, source_mode, file_asset_id) VALUES ('bad-asset', 'company-a', 'part-a', 'custom_image', 'asset-a')"
    ]) {
      await client.query("SAVEPOINT invalid_setting");
      try { await client.query(statement); assert.fail("expected setting guard"); }
      catch (error) { assert.match(error.message, /PART_PREVIEW_(PART_SCOPE|ASSET)_INVALID/u); await client.query("ROLLBACK TO SAVEPOINT invalid_setting"); }
    }
  });
  await client.query(`
    INSERT INTO file_assets (
      id, storage_provider, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
      linked_entity_type, linked_entity_id, document_category
    ) VALUES (
      'cad-asset-a', 'local_repository', 'preview/cad-a', 'A-M01.SLDPRT', 'sldprt',
      'application/octet-stream', 100, repeat('b', 64), 'drawing_number', 'drawing-number-a', 'cad_3d'
    );
    INSERT INTO drawing_revision_files (
      id, company_id, drawing_revision_id, source_file_asset_id, role, display_name, is_primary, sort_order
    ) VALUES ('binding-a', 'company-a', 'revision-a', 'cad-asset-a', 'cad_3d', 'A-M01.SLDPRT', 1, 0);
    INSERT INTO file_derivatives (
      id, company_id, source_file_asset_id, source_content_hash, derivative_kind, storage_key, mime_type,
      generator_profile, generator_version, status, created_at
    ) VALUES (
      'derivative-a', 'company-a', 'cad-asset-a', repeat('b', 64), 'model_preview_png', 'preview/a.png',
      'image/png', 'windows_solidworks_preview_worker', '1', 'ready', now()
    );
  `);
  await client.query("COMMIT");

  await check("PPC-PG-006 serializable expected-version race has one winner", async () => {
    const competitors = [await pool.connect(), await pool.connect()];
    let ready = 0;
    let releaseBarrier;
    const barrier = new Promise((resolve) => { releaseBarrier = resolve; });
    const race = async (competitor) => {
      try {
        await competitor.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        await competitor.query(`SET LOCAL search_path TO ${schema}, public`);
        const before = await competitor.query("SELECT row_version FROM part_preview_settings WHERE id = 'setting-a'");
        assert.equal(Number(before.rows[0]?.row_version), 2);
        ready += 1;
        if (ready === 2) releaseBarrier();
        await barrier;
        const updated = await competitor.query("UPDATE part_preview_settings SET row_version = row_version + 1, updated_at = now() WHERE id = 'setting-a' AND row_version = 2 RETURNING row_version");
        await competitor.query("COMMIT");
        return updated.rowCount;
      } catch (error) {
        await competitor.query("ROLLBACK").catch(() => undefined);
        if (error?.code === "40001") return 0;
        throw error;
      } finally {
        competitor.release();
      }
    };
    const results = await Promise.all(competitors.map(race));
    assert.equal(results.filter((count) => count === 1).length, 1);
    assert.equal(results.filter((count) => count === 0).length, 1);
    const final = await client.query("SELECT row_version FROM part_preview_settings WHERE id = 'setting-a'");
    assert.equal(Number(final.rows[0].row_version), 3);
  });

  await check("PPC-PG-007 actual resolver remains three bulk statements", async () => {
    const resolverUrl = new URL(connectionString);
    resolverUrl.searchParams.set("options", `-csearch_path=${schema},public`);
    const resolverClient = createAsyncDatabaseClient({ kind: "postgres", connectionString: resolverUrl.toString(), maxConnections: 1 });
    let statements = 0;
    const countingClient = {
      kind: resolverClient.kind,
      query: (...args) => { statements += 1; return resolverClient.query(...args); },
      queryOne: (...args) => { statements += 1; return resolverClient.queryOne(...args); },
      execute: (...args) => { statements += 1; return resolverClient.execute(...args); },
      transaction: (fn, options) => resolverClient.transaction(fn, options),
      close: () => resolverClient.close()
    };
    try {
      const projection = await resolvePartPreviewsAsync(countingClient, {
        companyId: "company-a", partIds: ["part-a", "part-b"],
        rowKeysByPartId: { "part-a": ["cw_part_a"], "part-b": ["cw_part_b"] }
      });
      assert.equal(statements, 3);
      assert.equal(projection.cw_part_a.state, "ready");
      assert.equal(projection.cw_part_a.sourceDrawingNumber, "A-M01");
    } finally {
      await resolverClient.close();
    }
  });
} catch (error) {
  try { await client.query("ROLLBACK"); } catch {}
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  try { await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); } catch {}
  client.release();
  await pool.end();
}

for (const item of checks) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.id}${item.error ? ` — ${item.error}` : ""}`);
if (checks.some((item) => !item.pass)) process.exitCode = 1;
else if (process.exitCode !== 1) console.log(`DEV-065 PostgreSQL shadow QC passed: ${checks.length} checks; taskSchemaRemoved=true; productionWrites=false`);
