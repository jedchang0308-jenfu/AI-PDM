#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { ensureAutomaticPreviewJobsForSourceAssetsAsync } from "../src/lib/preview-derivatives.ts";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const apply = args.flags.has("--apply");
const configuredDataDir = path.resolve(process.env.PDM_DATA_DIR?.trim() || path.join(root, "data"));
const configuredRepositoryDir = path.resolve(process.env.PDM_REPOSITORY_DIR?.trim() || path.join(root, "data", "repository"));
const databasePath = path.resolve(args.options.get("--database") || path.join(configuredDataDir, "ai-pdm.sqlite"));
const primaryDataDir = path.resolve(root, "data");
const primaryRepositoryDir = path.resolve(root, "data", "repository");
const primaryDatabasePath = path.resolve(primaryDataDir, "ai-pdm.sqlite");
const isPrimary = samePath(databasePath, primaryDatabasePath);
const databaseSha256Before = fs.existsSync(databasePath) ? sha256File(databasePath) : null;

if (!fs.existsSync(databasePath) || fs.lstatSync(databasePath).isSymbolicLink()) {
  throw new Error(`DEV105_DATABASE_NOT_FOUND: ${databasePath}`);
}

if (apply) {
  if (!process.env.PDM_DATA_DIR?.trim() || !process.env.PDM_REPOSITORY_DIR?.trim()) {
    throw new Error("DEV105_APPLY_REQUIRES_EXPLICIT_PDM_DATA_AND_REPOSITORY_DIR");
  }
  if (isPrimary) {
    const expected = String(args.options.get("--expected-sha256") || "").trim().toLowerCase();
    if (!args.flags.has("--confirm-primary-preview-backfill") || !expected || expected !== sha256File(databasePath)) {
      throw new Error("DEV105_PRIMARY_APPLY_REQUIRES_CONFIRMATION_AND_EXACT_SHA256");
    }
  } else {
    if (!args.flags.has("--confirm-isolated-preview-backfill")) {
      throw new Error("DEV105_ISOLATED_APPLY_REQUIRES_CONFIRMATION");
    }
    if (!within(databasePath, configuredDataDir) || samePath(configuredDataDir, primaryDataDir)
      || samePath(configuredRepositoryDir, primaryRepositoryDir)) {
      throw new Error("DEV105_ISOLATED_APPLY_REQUIRES_TASK_OWNED_PATHS");
    }
  }
}

const database = new Database(databasePath, { readonly: !apply, fileMustExist: true });
database.pragma("foreign_keys = ON");
const before = inventory(database);
const sourceFingerprintBefore = sourceFingerprint(database);
let preparations = [];

try {
  if (apply && before.silentGaps.length > 0) {
    const actorUserId = String(args.options.get("--actor-user-id") || "").trim();
    if (!actorUserId || !database.prepare("SELECT id FROM users WHERE id = ?").get(actorUserId)) {
      throw new Error("DEV105_APPLY_REQUIRES_EXISTING_ACTOR_USER_ID");
    }
    const client = createAsyncDatabaseClient({ kind: "sqlite", database });
    for (const [companyId, rows] of groupBy(before.silentGaps, (row) => row.companyId)) {
      preparations.push(...await ensureAutomaticPreviewJobsForSourceAssetsAsync(client, {
        companyId,
        sourceFileAssetIds: rows.map((row) => row.sourceFileAssetId),
        actorUserId
      }));
    }
  }

  const after = inventory(database);
  const sourceFingerprintAfter = sourceFingerprint(database);
  const report = {
    devId: "DEV-105",
    mode: apply ? "apply" : "dry-run",
    target: isPrimary ? "primary-local" : "isolated",
    databaseSha256Before,
    databaseSha256After: sha256File(databasePath),
    sourceFingerprintBefore,
    sourceFingerprintAfter,
    sourceAuthorityUnchanged: sourceFingerprintBefore === sourceFingerprintAfter,
    before,
    preparations,
    after,
    foreignKeyViolations: database.pragma("foreign_key_check"),
    passed: sourceFingerprintBefore === sourceFingerprintAfter
      && database.pragma("foreign_key_check").length === 0
      && (!apply || after.silentGaps.length === 0)
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const outputPath = args.options.get("--output");
  if (outputPath) {
    const resolved = path.resolve(outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, serialized, "utf8");
  }
  process.stdout.write(serialized);
  if (!report.passed) process.exitCode = 1;
} finally {
  database.close();
}

function inventory(database) {
  const sources = database.prepare(`
    SELECT binding.company_id AS company_id,
           asset.id AS source_file_asset_id,
           drawing.drawing_number,
           revision.revision,
           asset.file_name,
           lower(asset.file_ext) AS file_ext,
           asset.content_hash,
           CASE
             WHEN EXISTS (
               SELECT 1 FROM file_derivatives derivative
                WHERE derivative.source_file_asset_id = asset.id
                  AND derivative.source_content_hash = asset.content_hash
                  AND derivative.status = 'ready'
                  AND derivative.derivative_kind IN ('thumbnail_png', 'model_preview_png')
                  AND derivative.generator_profile <> 'fake_preview_worker'
                  AND COALESCE(derivative.generator_version, '') <> 'fake-local-pipeline'
             ) THEN 'ready'
             WHEN EXISTS (
               SELECT 1 FROM preview_jobs job
                WHERE job.source_file_asset_id = asset.id
                  AND job.source_content_hash = asset.content_hash
                  AND job.requested_kind = 'native_thumbnail_png'
                  AND job.status IN ('queued', 'running')
             ) THEN 'active'
             ELSE 'gap'
           END AS disposition
      FROM drawing_revision_files binding
      JOIN drawing_revisions revision ON revision.id = binding.drawing_revision_id
      JOIN drawings drawing ON drawing.id = revision.drawing_id AND drawing.company_id = binding.company_id
      JOIN file_assets asset ON asset.id = binding.source_file_asset_id
     WHERE binding.removed_at IS NULL
       AND asset.deleted_at IS NULL
       AND lower(asset.file_ext) IN ('sldprt', 'sldasm')
       AND length(trim(COALESCE(asset.content_hash, ''))) > 0
     ORDER BY binding.company_id, drawing.drawing_number, revision.revision, asset.id
  `).all().map(mapInventoryRow);
  const unique = [...new Map(sources.map((row) => [row.sourceFileAssetId, row])).values()];
  return {
    sourceCount: unique.length,
    readyCount: unique.filter((row) => row.disposition === "ready").length,
    activeCount: unique.filter((row) => row.disposition === "active").length,
    silentGapCount: unique.filter((row) => row.disposition === "gap").length,
    silentGaps: unique.filter((row) => row.disposition === "gap")
  };
}

function mapInventoryRow(row) {
  return {
    companyId: String(row.company_id),
    sourceFileAssetId: String(row.source_file_asset_id),
    drawingNumber: String(row.drawing_number),
    revision: String(row.revision),
    fileName: String(row.file_name),
    fileExt: String(row.file_ext),
    contentHash: String(row.content_hash),
    disposition: String(row.disposition)
  };
}

function sourceFingerprint(database) {
  const rows = database.prepare(`
    SELECT binding.id, binding.company_id, binding.drawing_revision_id, binding.source_file_asset_id,
           binding.role, binding.sort_order, binding.is_primary, binding.removed_at,
           asset.file_name, asset.file_ext, asset.file_size, asset.content_hash, asset.deleted_at
      FROM drawing_revision_files binding
      JOIN file_assets asset ON asset.id = binding.source_file_asset_id
     WHERE lower(asset.file_ext) IN ('sldprt', 'sldasm')
     ORDER BY binding.id
  `).all();
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function parseArgs(values) {
  const flags = new Set();
  const options = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value.includes("=")) {
      const split = value.indexOf("=");
      options.set(value.slice(0, split), value.slice(split + 1));
    } else if (["--database", "--output", "--actor-user-id", "--expected-sha256"].includes(value)) {
      options.set(value, values[++index]);
    } else {
      flags.add(value);
    }
  }
  return { flags, options };
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function within(target, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
