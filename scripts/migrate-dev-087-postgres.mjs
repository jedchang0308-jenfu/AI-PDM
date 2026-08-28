#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const contractCheck = argv.includes("--contract-check");
const option = (name, fallback = null) => argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const mode = option("--mode", "inventory");
const mappingPath = option("--mapping");
const expectedCommit = option("--expected-commit", process.env.PDM_BUILD_COMMIT?.trim());
const expectedSchemaHash = option("--expected-schema-hash", "dev090-v1");
const outputDir = path.resolve(option("--output-dir", path.join("output", "qa", "dev-087-postgres-migration", new Date().toISOString().replace(/[:.]/gu, "-"))));
const connectionString = process.env.PDM_POSTGRES_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
const provider = process.env.PDM_DB_PROVIDER?.trim() || "";

if (argv.some((value) => value.includes("discard") || value.includes("retain-unmapped") || value.includes("retained_legacy_source"))) throw new Error("DEV087_PRODUCTION_DISCARD_OR_RETAIN_FLAG_FORBIDDEN");
if (!["inventory", "rehearsal", "cutover"].includes(mode)) throw new Error(`DEV087_POSTGRES_MODE_INVALID:${mode}`);
if (apply && mode === "inventory") throw new Error("DEV087_POSTGRES_INVENTORY_IS_READ_ONLY");
if (apply && !mappingPath) throw new Error("DEV087_POSTGRES_MAPPING_REQUIRED");
if (apply && !expectedCommit) throw new Error("DEV087_POSTGRES_EXPECTED_COMMIT_REQUIRED");
if (apply && mode === "rehearsal" && process.env.PDM_DEV087_ISOLATED_RESTORE !== "1") throw new Error("DEV087_REHEARSAL_REQUIRES_ISOLATED_RESTORE");
if (apply && mode === "cutover" && process.env.PDM_DEV087_PRODUCTION_CUTOVER_AUTHORIZED !== "1") throw new Error("DEV087_PRODUCTION_CUTOVER_AUTHORIZATION_REQUIRED");
if (!contractCheck && provider !== "cloud_sql_postgres") throw new Error(`DEV087_POSTGRES_PROVIDER_REQUIRED:${provider || "unset"}`);
if (!contractCheck && !connectionString) throw new Error("DEV087_POSTGRES_CONNECTION_REQUIRED");

const allowedTargetTables = new Set([
  "drawing_revisions", "part_roots", "part_numbers", "drawing_numbers", "drawing_part_links",
  "pdm_workbench_aggregates", "drawing_rd_branches", "drawing_revision_claims", "drawing_revision_works",
  "drawing_revision_work_files", "part_change_works", "relation_change_works", "canonical_workbench_states",
  "pdm_work_review_requests", "pdm_review_traces", "pdm_workbench_migration_quarantine"
]);
const canonicalIdentityBackfillTables = new Set(["drawing_revisions", "part_roots", "part_numbers", "drawing_numbers", "drawing_part_links"]);
const allowedSourceUpdateColumns = new Map([
  ["drawings", new Set(["formal_drawing_number_id", "part_root_id"])]
]);
const allowedSourceUpdateHashNormalizationColumns = new Map([
  ["drawings", new Set(["updated_at"])]
]);
const receiptTargetTables = new Set([...allowedTargetTables].filter((table) => table !== "drawing_revision_work_files"));
receiptTargetTables.add("drawing_revision_files");
receiptTargetTables.add("drawing_part_links");
const sourceTables = [
  "drawings", "drawing_revisions", "part_numbers", "part_roots", "drawing_numbers", "drawing_part_links", "file_assets",
  "numbering_draft_workspaces", "numbering_draft_roots", "numbering_draft_parts", "numbering_draft_drawings",
  "numbering_draft_relations", "numbering_candidate_revision_drafts", "numbering_candidate_revision_files",
  "drawing_revision_package_review_approvals"
];
const targetTables = [...allowedTargetTables];
const legacySourceTables = [
  "numbering_draft_workspaces", "numbering_draft_roots", "numbering_draft_parts", "numbering_draft_drawings",
  "numbering_draft_relations", "numbering_candidate_revision_drafts", "numbering_candidate_revision_files",
  "drawing_revision_package_review_approvals"
];
const targetIdentityColumns = new Map([...allowedTargetTables].filter((table) => table !== "drawing_revision_work_files").map((table) => [table, "id"]));
targetIdentityColumns.set("pdm_review_traces", "review_cycle_id");
targetIdentityColumns.set("drawing_revision_files", "id");
targetIdentityColumns.set("drawing_part_links", "id");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stableId = (namespace, ...values) => {
  const hex = sha256([namespace, ...values].join("\u001f"));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

function validateMapping(mapping, inventory) {
  if (!mapping || ![2, 3].includes(mapping.version)) throw new Error("DEV087_POSTGRES_MAPPING_VERSION_INVALID");
  if (mapping.sourceFingerprint !== inventory.sourceFingerprint) throw new Error("DEV087_POSTGRES_MAPPING_SOURCE_DRIFT");
  if (mapping.productionDiscard === true || mapping.retainUnmappedLegacy === true) throw new Error("DEV087_POSTGRES_MAPPING_LOSS_POLICY_FORBIDDEN");
  const expected = new Map(inventory.legacySources.map((source) => [`${source.sourceTable}:${source.sourceIdentity}`, source]));
  const receipts = Array.isArray(mapping.receipts) ? mapping.receipts : [];
  const seen = new Set();
  for (const receipt of receipts) {
    const key = `${receipt.sourceTable}:${receipt.sourceIdentity}`;
    const source = expected.get(key);
    if (!source) throw new Error(`DEV087_POSTGRES_MAPPING_UNKNOWN_SOURCE:${key}`);
    if (seen.has(key)) throw new Error(`DEV087_POSTGRES_MAPPING_DUPLICATE_SOURCE:${key}`);
    if (receipt.sourceHash !== source.sourceHash) throw new Error(`DEV087_POSTGRES_MAPPING_SOURCE_HASH_MISMATCH:${key}`);
    if (!receiptTargetTables.has(receipt.targetTable) || !receipt.targetIdentity || !receipt.targetHash) throw new Error(`DEV087_POSTGRES_MAPPING_TARGET_INVALID:${key}`);
    if (receipt.targetIdentityColumn !== targetIdentityColumns.get(receipt.targetTable)) throw new Error(`DEV087_POSTGRES_MAPPING_TARGET_KEY_INVALID:${key}`);
    seen.add(key);
  }
  const unresolved = [];
  for (const source of expected.values()) if (!seen.has(`${source.sourceTable}:${source.sourceIdentity}`)) unresolved.push(source);
  const targetRows = Array.isArray(mapping.targetRows) ? mapping.targetRows : [];
  const seenTargetRows = new Set();
  for (const operation of targetRows) {
    if (!allowedTargetTables.has(operation.table) || !operation.row || typeof operation.row !== "object" || Array.isArray(operation.row)) throw new Error("DEV087_POSTGRES_TARGET_ROW_INVALID");
    const identityColumn = targetIdentityColumns.get(operation.table);
    const identity = identityColumn ? operation.row[identityColumn] : null;
    if (!identity) throw new Error(`DEV087_POSTGRES_TARGET_IDENTITY_MISSING:${operation.table}`);
    const targetKey = `${operation.table}:${identity}`;
    if (seenTargetRows.has(targetKey)) throw new Error(`DEV087_POSTGRES_TARGET_ROW_DUPLICATE:${targetKey}`);
    seenTargetRows.add(targetKey);
    if (mapping.version >= 3 && !/^[a-f0-9]{64}$/iu.test(String(operation.targetHash || ""))) throw new Error(`DEV087_POSTGRES_TARGET_HASH_REQUIRED:${targetKey}`);
    if (mapping.version < 3 && canonicalIdentityBackfillTables.has(operation.table)) throw new Error(`DEV087_POSTGRES_CANONICAL_IDENTITY_REQUIRES_MAPPING_V3:${operation.table}`);
  }
  if (targetRows.some((operation) => operation.table === "drawing_revision_work_files")) throw new Error("DEV092_POSTGRES_WORK_FILE_ROWS_REQUIRE_COMPOSITE_RECEIPTS");
  const drawingWorkFiles = Array.isArray(mapping.drawingWorkFiles) ? mapping.drawingWorkFiles : [];
  for (const operation of drawingWorkFiles) {
    if (!operation || typeof operation !== "object" || Array.isArray(operation) || !operation.row || typeof operation.row !== "object" || Array.isArray(operation.row)) throw new Error("DEV092_POSTGRES_WORK_FILE_ROW_INVALID");
    const row = operation.row;
    if (!row.work_id || !row.file_binding_id || row.ordinal === undefined || row.ordinal === null || !row.content_hash) throw new Error("DEV092_POSTGRES_WORK_FILE_ROW_INVALID");
  }
  const workFileReceipts = Array.isArray(mapping.workFileReceipts) ? mapping.workFileReceipts : [];
  const seenWorkFileBindings = new Set();
  for (const receipt of workFileReceipts) {
    const key = `${receipt.workId}:${receipt.fileBindingId}`;
    if (!receipt.workId || !receipt.fileBindingId || receipt.ordinal === undefined || receipt.ordinal === null || !receipt.contentHash || !receipt.targetHash) throw new Error("DEV092_POSTGRES_WORK_FILE_RECEIPT_INVALID");
    if (seenWorkFileBindings.has(key)) throw new Error(`DEV092_POSTGRES_WORK_FILE_RECEIPT_DUPLICATE:${key}`);
    if (!drawingWorkFiles.some((operation) => operation.row.work_id === receipt.workId && operation.row.file_binding_id === receipt.fileBindingId && Number(operation.row.ordinal) === Number(receipt.ordinal) && operation.row.content_hash === receipt.contentHash)) throw new Error(`DEV092_POSTGRES_WORK_FILE_TARGET_ROW_MISSING:${key}`);
    seenWorkFileBindings.add(key);
  }
  const fileReceipts = Array.isArray(mapping.fileReceipts) ? mapping.fileReceipts : [];
  const expectedFileAssets = new Set(inventory.legacyFileAssets.map((entry) => entry.fileAssetId));
  const seenFileAssets = new Set();
  for (const receipt of fileReceipts) {
    if (!expectedFileAssets.has(receipt.sourceFileAssetId) || !receipt.targetFileAssetId || !receipt.contentHash) throw new Error("DEV087_POSTGRES_FILE_RECEIPT_INVALID");
    if (seenFileAssets.has(receipt.sourceFileAssetId)) throw new Error(`DEV087_POSTGRES_FILE_RECEIPT_DUPLICATE:${receipt.sourceFileAssetId}`);
    seenFileAssets.add(receipt.sourceFileAssetId);
  }
  for (const sourceFileAssetId of expectedFileAssets) if (!seenFileAssets.has(sourceFileAssetId)) unresolved.push({ sourceTable: "file_assets", sourceIdentity: sourceFileAssetId, reason: "file_receipt_missing" });
  const sourceUpdates = Array.isArray(mapping.sourceUpdates) ? mapping.sourceUpdates : [];
  const seenSourceUpdates = new Set();
  for (const operation of sourceUpdates) {
    const allowedColumns = allowedSourceUpdateColumns.get(operation?.table);
    const allowedHashNormalizationColumns = allowedSourceUpdateHashNormalizationColumns.get(operation?.table) || new Set();
    const entries = operation?.set && typeof operation.set === "object" && !Array.isArray(operation.set) ? Object.entries(operation.set) : [];
    const hashNormalizationEntries = operation?.hashNormalization && typeof operation.hashNormalization === "object" && !Array.isArray(operation.hashNormalization) ? Object.entries(operation.hashNormalization) : [];
    const key = `${operation?.table || ""}:${operation?.identity || ""}`;
    if (mapping.version < 3) throw new Error("DEV087_POSTGRES_SOURCE_UPDATE_REQUIRES_MAPPING_V3");
    if (!allowedColumns || !operation.identity || entries.length === 0 || entries.some(([column]) => !allowedColumns.has(column))) throw new Error(`DEV087_POSTGRES_SOURCE_UPDATE_INVALID:${key}`);
    if (hashNormalizationEntries.some(([column]) => !allowedHashNormalizationColumns.has(column))) throw new Error(`DEV087_POSTGRES_SOURCE_UPDATE_HASH_NORMALIZATION_INVALID:${key}`);
    if (!/^[a-f0-9]{64}$/iu.test(String(operation.expectedBeforeHash || "")) || !/^[a-f0-9]{64}$/iu.test(String(operation.expectedAfterHash || ""))) throw new Error(`DEV087_POSTGRES_SOURCE_UPDATE_HASH_REQUIRED:${key}`);
    if (seenSourceUpdates.has(key)) throw new Error(`DEV087_POSTGRES_SOURCE_UPDATE_DUPLICATE:${key}`);
    seenSourceUpdates.add(key);
  }
  return { mappingVersion: mapping.version, receipts, fileReceipts, workFileReceipts, drawingWorkFiles, targetRows, sourceUpdates, unresolved };
}

async function tableExists(client, table) {
  const result = await client.query("SELECT to_regclass($1) IS NOT NULL AS present", [`public.${table}`]);
  return result.rows[0]?.present === true;
}

async function inventory(client) {
  const tables = {};
  for (const table of [...sourceTables, ...targetTables]) {
    if (!(await tableExists(client, table))) {
      tables[table] = { present: false, count: 0, hash: null };
      continue;
    }
    const result = await client.query(`SELECT to_jsonb(source) AS row FROM ${table} source ORDER BY to_jsonb(source)::text`);
    tables[table] = { present: true, count: result.rowCount, hash: sha256(result.rows.map((entry) => stableJson(entry.row)).join("\n")) };
  }
  const legacySources = [];
  for (const table of legacySourceTables) {
    if (!tables[table]?.present) continue;
    const result = await client.query(`SELECT to_jsonb(source) AS row FROM ${table} source ORDER BY to_jsonb(source)::text`);
    for (const entry of result.rows) {
      const sourceIdentity = String(entry.row.id ?? entry.row.approval_request_id ?? sha256(stableJson(entry.row)));
      legacySources.push({ sourceTable: table, sourceIdentity, sourceHash: sha256(stableJson(entry.row)) });
    }
  }
  const legacyFileAssets = [];
  if (tables.numbering_candidate_revision_files?.present) {
    const result = await client.query(`SELECT DISTINCT asset.id,asset.content_hash
      FROM numbering_candidate_revision_files binding JOIN file_assets asset ON asset.id=binding.source_file_asset_id
      ORDER BY asset.id`);
    for (const asset of result.rows) legacyFileAssets.push({ fileAssetId: String(asset.id), contentHash: String(asset.content_hash || "") });
  }
  const sourceFingerprint = sha256(stableJson({ tables: Object.fromEntries(sourceTables.map((table) => [table, tables[table]])), legacySources, legacyFileAssets }));
  return { tables, legacySources, legacyFileAssets, sourceFingerprint };
}

async function insertRow(client, table, row) {
  const columns = Object.keys(row);
  if (!columns.length) throw new Error(`DEV087_POSTGRES_EMPTY_TARGET_ROW:${table}`);
  const values = columns.map((column) => row[column]);
  const quoted = columns.map((column) => `"${column.replaceAll('"', '""')}"`);
  await client.query(`INSERT INTO ${table} (${quoted.join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")}) ON CONFLICT DO NOTHING`, values);
}

async function rowByIdentity(client, table, identityColumn, identity) {
  const result = await client.query(`SELECT to_jsonb(target) AS row FROM ${table} target WHERE ${identityColumn}=$1 LIMIT 1`, [identity]);
  return result.rows[0]?.row ?? null;
}

async function verifyTargetRows(client, operations) {
  const missing = [];
  for (const operation of operations) {
    if (!operation.targetHash) continue;
    const identityColumn = targetIdentityColumns.get(operation.table);
    const identity = operation.row[identityColumn];
    const row = await rowByIdentity(client, operation.table, identityColumn, identity);
    if (!row || sha256(stableJson(row)) !== operation.targetHash) missing.push({ table: operation.table, identity, reason: row ? "target_row_hash_mismatch" : "target_row_missing" });
  }
  return missing;
}

async function applySourceUpdate(client, operation) {
  const identityColumn = "id";
  const current = await rowByIdentity(client, operation.table, identityColumn, operation.identity);
  if (!current) throw new Error(`DEV087_POSTGRES_SOURCE_UPDATE_MISSING:${operation.table}:${operation.identity}`);
  const normalizedHash = (row) => sha256(stableJson({ ...row, ...(operation.hashNormalization || {}) }));
  const currentHash = normalizedHash(current);
  if (currentHash === operation.expectedAfterHash) return;
  if (currentHash !== operation.expectedBeforeHash) throw new Error(`DEV087_POSTGRES_SOURCE_UPDATE_DRIFT:${operation.table}:${operation.identity}`);
  const entries = Object.entries(operation.set);
  await client.query(`UPDATE ${operation.table} SET ${entries.map(([column], index) => `"${column.replaceAll('"', '""')}"=$${index + 1}`).join(",")} WHERE ${identityColumn}=$${entries.length + 1}`, [...entries.map(([, value]) => value), operation.identity]);
  const after = await rowByIdentity(client, operation.table, identityColumn, operation.identity);
  if (!after || normalizedHash(after) !== operation.expectedAfterHash) throw new Error(`DEV087_POSTGRES_SOURCE_UPDATE_VERIFY_FAILED:${operation.table}:${operation.identity}`);
}

async function snapshotMutationRows(client, validation) {
  const tables = new Set([
    ...validation.targetRows.filter((operation) => sourceTables.includes(operation.table)).map((operation) => operation.table),
    ...validation.sourceUpdates.map((operation) => operation.table)
  ]);
  const snapshots = new Map();
  for (const table of tables) {
    const identityColumn = targetIdentityColumns.get(table) || "id";
    const result = await client.query(`SELECT ${identityColumn}::text AS identity,to_jsonb(source) AS row FROM ${table} source ORDER BY ${identityColumn}::text`);
    snapshots.set(table, new Map(result.rows.map((entry) => [entry.identity, { row: entry.row, hash: sha256(stableJson(entry.row)) }])));
  }
  return snapshots;
}

async function reconcileSourceMutations(client, before, after, beforeSnapshots, validation) {
  const unresolved = [];
  const mutationTables = new Set(beforeSnapshots.keys());
  for (const table of sourceTables) {
    if (!mutationTables.has(table) && (before.tables[table]?.count !== after.tables[table]?.count || before.tables[table]?.hash !== after.tables[table]?.hash)) unresolved.push({ table, reason: "source_fingerprint_drift" });
  }
  for (const table of mutationTables) {
    const identityColumn = targetIdentityColumns.get(table) || "id";
    const beforeRows = beforeSnapshots.get(table);
    const result = await client.query(`SELECT ${identityColumn}::text AS identity,to_jsonb(source) AS row FROM ${table} source ORDER BY ${identityColumn}::text`);
    const afterRows = new Map(result.rows.map((entry) => [entry.identity, { row: entry.row, hash: sha256(stableJson(entry.row)) }]));
    const inserts = new Map(validation.targetRows.filter((operation) => operation.table === table).map((operation) => [String(operation.row[identityColumn]), operation.targetHash]));
    const updates = new Map(validation.sourceUpdates.filter((operation) => operation.table === table).map((operation) => [String(operation.identity), operation]));
    for (const [identity, beforeEntry] of beforeRows) {
      const update = updates.get(identity);
      const expectedHash = update?.expectedAfterHash || beforeEntry.hash;
      const afterEntry = afterRows.get(identity);
      const actualHash = update && afterEntry ? sha256(stableJson({ ...afterEntry.row, ...(update.hashNormalization || {}) })) : afterEntry?.hash;
      if (!afterRows.has(identity)) unresolved.push({ table, identity, reason: "source_row_missing" });
      else if (actualHash !== expectedHash) unresolved.push({ table, identity, reason: updates.has(identity) ? "source_update_hash_mismatch" : "source_row_changed" });
    }
    for (const [identity, expectedHash] of inserts) {
      if (!afterRows.has(identity)) unresolved.push({ table, identity, reason: "canonical_identity_backfill_missing" });
      else if (afterRows.get(identity).hash !== expectedHash) unresolved.push({ table, identity, reason: "canonical_identity_backfill_hash_mismatch" });
    }
    const allowedIdentities = new Set([...beforeRows.keys(), ...inserts.keys()]);
    for (const identity of afterRows.keys()) if (!allowedIdentities.has(identity)) unresolved.push({ table, identity, reason: "unexpected_source_row" });
  }
  return { mutationTables: [...mutationTables], unresolved, pass: unresolved.length === 0 };
}

async function insertAutomaticFormalProjection(client) {
  const drawings = (await client.query("SELECT id,company_id FROM drawings WHERE lifecycle_state NOT IN ('cancelled','obsolete','merged') ORDER BY company_id,id")).rows;
  const parts = (await client.query("SELECT id,company_id FROM part_numbers ORDER BY company_id,id")).rows;
  const roots = (await client.query("SELECT id,company_id FROM part_roots ORDER BY company_id,id")).rows;
  for (const drawing of drawings) {
    await insertRow(client, "pdm_workbench_aggregates", { id: stableId("dev087-aggregate", drawing.company_id, "drawing", drawing.id), company_id: drawing.company_id, entity_type: "drawing", canonical_entity_id: drawing.id, open_branch_count: 0, row_version: 1 });
    const revision = (await client.query("SELECT id,row_version FROM drawing_revisions WHERE company_id=$1 AND drawing_id=$2 AND lifecycle_state='released' AND revision ~ '^[0-9]+$' ORDER BY revision::integer DESC,updated_at DESC,id DESC LIMIT 1", [drawing.company_id, drawing.id])).rows[0];
    if (revision) await insertRow(client, "canonical_workbench_states", { id: stableId("dev087-state", drawing.company_id, "drawing_production", drawing.id), company_id: drawing.company_id, entity_type: "drawing", canonical_entity_id: drawing.id, data_layer: "drawing_production", branch_id: null, revision_id: revision.id, work_id: null, handling: "none", blocker_reason: null, row_version: Number(revision.row_version || 1) });
  }
  for (const part of parts) {
    await insertRow(client, "pdm_workbench_aggregates", { id: stableId("dev087-aggregate", part.company_id, "part", part.id), company_id: part.company_id, entity_type: "part", canonical_entity_id: part.id, open_branch_count: 0, row_version: 1 });
    await insertRow(client, "canonical_workbench_states", { id: stableId("dev087-state", part.company_id, "part_formal", part.id), company_id: part.company_id, entity_type: "part", canonical_entity_id: part.id, data_layer: "part_formal", branch_id: null, revision_id: null, work_id: null, handling: "none", blocker_reason: null, row_version: 1 });
  }
  for (const relation of roots) {
    await insertRow(client, "pdm_workbench_aggregates", { id: stableId("dev087-aggregate", relation.company_id, "relation", relation.id), company_id: relation.company_id, entity_type: "relation", canonical_entity_id: relation.id, open_branch_count: 0, row_version: 1 });
    await insertRow(client, "canonical_workbench_states", { id: stableId("dev087-state", relation.company_id, "relation_formal", relation.id), company_id: relation.company_id, entity_type: "relation", canonical_entity_id: relation.id, data_layer: "relation_formal", branch_id: null, revision_id: null, work_id: null, handling: "none", blocker_reason: null, row_version: 1 });
  }
  if (await tableExists(client, "drawing_revision_package_review_approvals")) {
    const approvals = (await client.query(`SELECT approval.approval_request_id,approval.company_id,approval.approved_at,revision.drawing_id
      FROM drawing_revision_package_review_approvals approval JOIN drawing_revisions revision ON revision.source_candidate_revision_id=approval.candidate_revision_id`)).rows;
    for (const approval of approvals) await insertRow(client, "pdm_review_traces", { review_cycle_id: stableId("dev087-package-review-trace", approval.company_id, approval.approval_request_id), company_id: approval.company_id, entity_type: "drawing", canonical_entity_id: approval.drawing_id, decision_at: approval.approved_at });
  }
}

async function verifyReceipts(client, receipts) {
  const missing = [];
  for (const receipt of receipts) {
    const identityColumn = targetIdentityColumns.get(receipt.targetTable);
    const result = await client.query(`SELECT to_jsonb(target) AS row FROM ${receipt.targetTable} target WHERE ${identityColumn}=$1 LIMIT 1`, [receipt.targetIdentity]);
    if (!result.rowCount || sha256(stableJson(result.rows[0].row)) !== receipt.targetHash) missing.push({ ...receipt, reason: result.rowCount ? "target_hash_mismatch" : "target_missing" });
  }
  return missing;
}

async function verifyFileReceipts(client, receipts) {
  const missing = [];
  for (const receipt of receipts) {
    const source = (await client.query("SELECT content_hash FROM file_assets WHERE id=$1", [receipt.sourceFileAssetId])).rows[0];
    const target = (await client.query("SELECT content_hash FROM file_assets WHERE id=$1", [receipt.targetFileAssetId])).rows[0];
    if (!source || !target || source.content_hash !== receipt.contentHash || target.content_hash !== receipt.contentHash) {
      missing.push({ ...receipt, reason: "file_content_hash_mismatch" });
      continue;
    }
    const expectedDerivatives = Array.isArray(receipt.derivatives) ? receipt.derivatives : [];
    for (const derivative of expectedDerivatives) {
      const sourceDerivative = (await client.query("SELECT content_hash FROM file_derivatives WHERE id=$1 AND source_file_asset_id=$2", [derivative.sourceDerivativeId, receipt.sourceFileAssetId])).rows[0];
      const targetDerivative = (await client.query("SELECT content_hash FROM file_derivatives WHERE id=$1 AND source_file_asset_id=$2", [derivative.targetDerivativeId, receipt.targetFileAssetId])).rows[0];
      if (!sourceDerivative || !targetDerivative || sourceDerivative.content_hash !== derivative.contentHash || targetDerivative.content_hash !== derivative.contentHash) missing.push({ ...derivative, reason: "preview_content_hash_mismatch" });
    }
  }
  return missing;
}

async function verifyWorkFileReceipts(client, receipts) {
  const missing = [];
  for (const receipt of receipts) {
    const result = await client.query(`SELECT to_jsonb(target) AS row
      FROM drawing_revision_work_files target
      WHERE target.work_id=$1 AND target.file_binding_id=$2 LIMIT 1`, [receipt.workId, receipt.fileBindingId]);
    const row = result.rows[0]?.row;
    if (!row || Number(row.ordinal) !== Number(receipt.ordinal) || row.content_hash !== receipt.contentHash || sha256(stableJson(row)) !== receipt.targetHash) {
      missing.push({ ...receipt, reason: row ? "work_file_receipt_hash_or_tuple_mismatch" : "work_file_target_missing" });
    }
  }
  return missing;
}

async function targetForeignKeyReceipt(client) {
  const result = await client.query(`SELECT conrelid::regclass::text AS table_name,conname,convalidated
    FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text = ANY($1::text[])
    ORDER BY conrelid::regclass::text,conname`, [targetTables]);
  return { constraints: result.rows, unvalidated: result.rows.filter((row) => row.convalidated !== true) };
}

fs.mkdirSync(outputDir, { recursive: true });
if (contractCheck) {
  const result = { status: "PASS", mappingVersion: 3, acceptedMappingVersions: [2, 3], providerRequired: "cloud_sql_postgres", modes: ["inventory", "rehearsal", "cutover"], productionDiscardAllowed: false, mappingRequiredForApply: true, rowHashReceiptsRequired: true, fileHashReceiptsRequired: true, sourceUpdateHashReceiptsRequired: true, canonicalIdentityBackfillTables: [...canonicalIdentityBackfillTables], compositeWorkFileRowsField: "drawingWorkFiles", compositeWorkFileReceiptsRequired: true, allowedTargetTables: [...allowedTargetTables] };
  fs.writeFileSync(path.join(outputDir, "contract.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const client = new pg.Client({ connectionString, application_name: `ai-pdm-dev087-${mode}` });
await client.connect();
let report;
try {
  const before = await inventory(client);
  const mapping = mappingPath ? JSON.parse(fs.readFileSync(path.resolve(mappingPath), "utf8")) : null;
  const validation = mapping ? validateMapping(mapping, before) : { mappingVersion: null, receipts: [], fileReceipts: [], workFileReceipts: [], drawingWorkFiles: [], targetRows: [], sourceUpdates: [], unresolved: [...before.legacySources, ...before.legacyFileAssets.map((entry) => ({ sourceTable: "file_assets", sourceIdentity: entry.fileAssetId, reason: "file_receipt_missing" }))] };
  const sourceMutationBefore = await snapshotMutationRows(client, validation);
  if (apply && validation.unresolved.length) throw new Error(`DEV087_POSTGRES_UNRESOLVED:${validation.unresolved.length}`);
  if (apply) {
    await client.query("BEGIN");
    try {
      await client.query(fs.readFileSync(path.resolve("db/postgres/042_status_data_rebuild.sql"), "utf8"));
      if (validation.mappingVersion !== 3) await insertAutomaticFormalProjection(client);
      for (const operation of validation.targetRows) await insertRow(client, operation.table, operation.row);
      for (const operation of validation.drawingWorkFiles) await insertRow(client, "drawing_revision_work_files", operation.row);
      for (const operation of validation.sourceUpdates) await applySourceUpdate(client, operation);
      const missingPlannedTargets = await verifyTargetRows(client, validation.targetRows);
      if (missingPlannedTargets.length) throw new Error(`DEV087_POSTGRES_PLANNED_TARGET_MISSING:${missingPlannedTargets.length}`);
      const missingTargets = await verifyReceipts(client, validation.receipts);
      if (missingTargets.length) throw new Error(`DEV087_POSTGRES_TARGET_RECEIPT_MISSING:${missingTargets.length}`);
      const missingFiles = await verifyFileReceipts(client, validation.fileReceipts);
      if (missingFiles.length) throw new Error(`DEV087_POSTGRES_FILE_RECEIPT_MISSING:${missingFiles.length}`);
      const missingWorkFiles = await verifyWorkFileReceipts(client, validation.workFileReceipts);
      if (missingWorkFiles.length) throw new Error(`DEV092_POSTGRES_WORK_FILE_RECEIPT_MISSING:${missingWorkFiles.length}`);
      if (mode === "cutover") await client.query("UPDATE pdm_workbench_state_authority_control SET mode='canonical_only',expected_commit=$1,schema_hash=$2,row_version=row_version+1,switched_at=now() WHERE id=1", [expectedCommit, expectedSchemaHash]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  const after = await inventory(client);
  const missingTargets = mapping ? await verifyReceipts(client, validation.receipts) : [];
  const missingFiles = mapping ? await verifyFileReceipts(client, validation.fileReceipts) : [];
  const missingWorkFiles = mapping ? await verifyWorkFileReceipts(client, validation.workFileReceipts) : [];
  const missingPlannedTargets = mapping ? await verifyTargetRows(client, validation.targetRows) : [];
  const foreignKeys = await targetForeignKeyReceipt(client);
  const sourceMutationReconciliation = await reconcileSourceMutations(client, before, after, sourceMutationBefore, validation);
  const unresolved = [...validation.unresolved, ...missingTargets, ...missingFiles, ...missingWorkFiles, ...missingPlannedTargets, ...sourceMutationReconciliation.unresolved, ...foreignKeys.unvalidated.map((entry) => ({ ...entry, reason: "foreign_key_not_validated" }))];
  report = { devId: "DEV-087", provider: "cloud_sql_postgres", mode, apply, mappingVersion: validation.mappingVersion, expectedCommit, expectedSchemaHash, before, after, foreignKeys, sourceMutationReconciliation, drawingWorkFiles: validation.drawingWorkFiles, workFileReceipts: validation.workFileReceipts, unresolved, sourceReconciliation: unresolved.length === 0 ? 1 : 0, productionDiscard: false, pass: unresolved.length === 0 };
} finally {
  await client.end();
}
const reportPath = path.join(outputDir, "manifest.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: report.pass ? "PASS" : "BLOCKED", mode, apply, unresolved: report.unresolved.length, sourceFingerprint: report.before.sourceFingerprint, reportPath }, null, 2));
if (!report.pass) process.exitCode = 2;
