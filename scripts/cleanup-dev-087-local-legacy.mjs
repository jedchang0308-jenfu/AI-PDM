#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const fixtureMode = argv.includes("--allow-fixture");
const confirmed = argv.includes("--confirm-local-dev-087") || process.env.PDM_DEV087_LOCAL_CLEANUP_AUTHORIZED === "1";
const option = (name) => argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
const root = path.resolve(process.cwd());
const primaryDb = path.resolve(root, "data", "ai-pdm.sqlite");
const dbPath = path.resolve(option("--db") ?? primaryDb);
const outputDir = path.resolve(option("--output-dir") ?? path.join(root, "output", "qa", "dev-087-local-cleanup", new Date().toISOString().replace(/[:.]/gu, "-")));
const provider = (process.env.PDM_DB_PROVIDER || "sqlite").trim().toLowerCase();

if (provider !== "sqlite") throw new Error(`DEV087_LOCAL_CLEANUP_PROVIDER_REJECTED:${provider}`);
if (apply && !confirmed) throw new Error("DEV087_LOCAL_CLEANUP_CONFIRMATION_REQUIRED");
if (!fixtureMode && dbPath !== primaryDb) throw new Error(`DEV087_LOCAL_CLEANUP_PATH_REJECTED:${dbPath}`);
if (fixtureMode && !dbPath.startsWith(path.join(root, "output", "qa") + path.sep)) throw new Error(`DEV087_LOCAL_CLEANUP_FIXTURE_PATH_REJECTED:${dbPath}`);
if (!fs.existsSync(dbPath)) throw new Error(`DEV087_LOCAL_CLEANUP_DB_NOT_FOUND:${dbPath}`);
if (fs.readFileSync(dbPath).subarray(0, 16).toString("utf8") !== "SQLite format 3\0") throw new Error("DEV087_LOCAL_CLEANUP_NOT_SQLITE");

const db = new Database(dbPath, apply ? undefined : { readonly: true, fileMustExist: true });
db.pragma("foreign_keys=ON");
const tableExists = (table) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
const rows = (sql, params = {}) => Array.isArray(params) ? db.prepare(sql).all(...params) : db.prepare(sql).all(params);
const scalar = (sql, params = {}) => Number((Array.isArray(params) ? db.prepare(sql).get(...params) : db.prepare(sql).get(params))?.count ?? 0);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort());
const placeholders = (values) => values.map(() => "?").join(",") || "NULL";

const workspaces = tableExists("numbering_draft_workspaces")
  ? rows("SELECT id, company_id, lifecycle_status FROM numbering_draft_workspaces ORDER BY company_id,id")
  : [];
const workspaceIds = workspaces.map((row) => row.id);
const idsFor = (table, column = "workspace_id") => tableExists(table) && workspaceIds.length
  ? rows(`SELECT id FROM ${table} WHERE ${column} IN (${placeholders(workspaceIds)}) ORDER BY id`, workspaceIds).map((row) => row.id)
  : [];
const draftRootIds = idsFor("numbering_draft_roots");
const draftPartIds = idsFor("numbering_draft_parts");
const draftDrawingIds = idsFor("numbering_draft_drawings");
const candidateRevisionIds = idsFor("numbering_candidate_revision_drafts");
const publicationEvidenceIds = idsFor("numbering_publication_evidence");
const candidateFileIds = tableExists("numbering_candidate_revision_files") && candidateRevisionIds.length
  ? rows(`SELECT id FROM numbering_candidate_revision_files WHERE candidate_revision_id IN (${placeholders(candidateRevisionIds)}) ORDER BY id`, candidateRevisionIds).map((row) => row.id)
  : [];
const candidateFileAssets = tableExists("numbering_candidate_revision_files") && candidateRevisionIds.length
  ? rows(`SELECT DISTINCT asset.id, asset.original_path, asset.storage_key, asset.content_hash
      FROM numbering_candidate_revision_files binding JOIN file_assets asset ON asset.id=binding.source_file_asset_id
      WHERE binding.candidate_revision_id IN (${placeholders(candidateRevisionIds)})`, candidateRevisionIds)
  : [];

const canonicalTables = [
  "part_roots", "part_numbers", "drawing_numbers", "drawing_part_links", "drawings", "drawing_revisions",
  "drawing_revision_files", "pdm_workbench_aggregates", "drawing_rd_branches", "drawing_revision_claims",
  "drawing_revision_works", "drawing_revision_work_files", "part_change_works",
  "canonical_workbench_states", "pdm_work_review_requests", "pdm_review_traces"
];
function canonicalSnapshot() {
  const snapshot = {};
  for (const table of canonicalTables) {
    if (!tableExists(table)) continue;
    const data = rows(`SELECT * FROM ${table} ORDER BY 1`).map((entry) => {
      const normalized = { ...entry };
      if (table === "drawings") {
        delete normalized.workspace_id;
        delete normalized.drawing_draft_id;
        delete normalized.candidate_reservation_id;
      }
      if (table === "drawing_revisions") delete normalized.source_candidate_revision_id;
      if (table === "drawing_revision_files") delete normalized.source_candidate_file_id;
      return normalized;
    });
    snapshot[table] = { count: data.length, hash: sha256(data.map(stable).join("\n")) };
  }
  if (tableExists("file_assets")) {
    const legacyTypes = new Set(["numbering_draft_workspace", "numbering_draft_root", "numbering_draft_part", "numbering_draft_drawing", "numbering_candidate_revision"]);
    const data = rows("SELECT * FROM file_assets ORDER BY id").filter((asset) => !legacyTypes.has(asset.linked_entity_type) || hasBusinessFileReference(asset.id));
    snapshot.file_assets = { count: data.length, hash: sha256(data.map(stable).join("\n")) };
  }
  return snapshot;
}

const beforeCanonical = canonicalSnapshot();
const beforeCounts = {
  workspaces: workspaces.length,
  draftRoots: draftRootIds.length,
  draftParts: draftPartIds.length,
  draftDrawings: draftDrawingIds.length,
  candidateRevisions: candidateRevisionIds.length,
  quarantine: tableExists("pdm_workbench_migration_quarantine") ? scalar("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine") : 0,
  candidateFileAssets: candidateFileAssets.length
};

const physicalDeletePlan = [];
function deleteByIds(table, column, ids) {
  if (!tableExists(table) || !ids.length) return 0;
  return db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders(ids)})`).run(...ids).changes;
}
function hasBusinessFileReference(assetId) {
  const refs = [
    ["submission_files", "source_file_asset_id"], ["drawing_revision_package_files", "source_file_asset_id"],
    ["drawing_revision_files", "source_file_asset_id"], ["drawing_revision_package_supplement_files", "source_file_asset_id"],
    ["shared_cad_model_versions", "source_file_asset_id"], ["drawing_recognition_sources", "file_asset_id"],
    ["part_attachment_reuse_origins", "source_file_asset_id"], ["part_attachment_reuse_origins", "target_file_asset_id"]
  ];
  return refs.some(([table, column]) => tableExists(table) && scalar(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column}=?`, assetId) > 0);
}

let deletedCounts = {};
if (apply) {
  db.transaction(() => {
    db.exec("DROP TRIGGER IF EXISTS trg_number_candidate_events_no_delete");
    if (candidateRevisionIds.length && tableExists("drawing_revision_package_review_approvals")) {
      const missingTrace = scalar(`SELECT COUNT(*) AS count
        FROM drawing_revision_package_review_approvals approval
        JOIN drawing_revisions revision ON revision.source_candidate_revision_id=approval.candidate_revision_id
        LEFT JOIN pdm_review_traces trace ON trace.company_id=approval.company_id
          AND trace.canonical_entity_id=revision.drawing_id AND trace.decision_at=approval.approved_at
        WHERE approval.candidate_revision_id IN (${placeholders(candidateRevisionIds)}) AND trace.review_cycle_id IS NULL`, candidateRevisionIds);
      if (missingTrace) throw new Error(`DEV087_APPROVED_TRACE_MIGRATION_REQUIRED:${missingTrace}`);
      db.exec("DROP TRIGGER IF EXISTS trg_drawing_revision_package_review_approvals_no_delete");
    }
    if (candidateRevisionIds.length && tableExists("drawing_revisions")) db.prepare(`UPDATE drawing_revisions SET source_candidate_revision_id=NULL WHERE source_candidate_revision_id IN (${placeholders(candidateRevisionIds)})`).run(...candidateRevisionIds);
    deleteByIds("drawing_revision_package_review_approvals", "candidate_revision_id", candidateRevisionIds);
    if (candidateFileIds.length && tableExists("drawing_revision_files")) db.prepare(`UPDATE drawing_revision_files SET source_candidate_file_id=NULL WHERE source_candidate_file_id IN (${placeholders(candidateFileIds)})`).run(...candidateFileIds);
    deleteByIds("numbering_candidate_revision_files", "candidate_revision_id", candidateRevisionIds);
    deleteByIds("numbering_publication_evidence", "id", publicationEvidenceIds);
    deleteByIds("numbering_candidate_revision_drafts", "id", candidateRevisionIds);
    deleteByIds("numbering_draft_relations", "workspace_id", workspaceIds);
    if (workspaceIds.length && tableExists("drawings")) db.prepare(`UPDATE drawings SET workspace_id=NULL,drawing_draft_id=NULL,candidate_reservation_id=NULL WHERE workspace_id IN (${placeholders(workspaceIds)})`).run(...workspaceIds);
    deleteByIds("numbering_draft_drawings", "id", draftDrawingIds);
    deleteByIds("numbering_draft_parts", "id", draftPartIds);
    deleteByIds("numbering_draft_roots", "id", draftRootIds);
    deleteByIds("transfer_package_draft_items", "workspace_id", workspaceIds);
    deleteByIds("number_candidate_events", "workspace_id", workspaceIds);
    deleteByIds("number_candidate_reservations", "workspace_id", workspaceIds);
    deleteByIds("numbering_draft_workspaces", "id", workspaceIds);
    if (tableExists("pdm_workbench_migration_quarantine")) db.prepare("DELETE FROM pdm_workbench_migration_quarantine").run();

    for (const asset of candidateFileAssets) {
      if (hasBusinessFileReference(asset.id)) continue;
      deleteByIds("preview_jobs", "source_file_asset_id", [asset.id]);
      deleteByIds("file_derivatives", "source_file_asset_id", [asset.id]);
      const deleted = deleteByIds("file_assets", "id", [asset.id]);
      if (!deleted) continue;
      const pointer = asset.original_path || asset.storage_key;
      if (pointer) physicalDeletePlan.push({ assetId: asset.id, pointer, contentHash: asset.content_hash });
    }
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_number_candidate_events_no_delete BEFORE DELETE ON number_candidate_events BEGIN SELECT RAISE(ABORT, 'NUMBER_CANDIDATE_EVENT_APPEND_ONLY'); END`);
    if (tableExists("drawing_revision_package_review_approvals")) db.exec(`CREATE TRIGGER IF NOT EXISTS trg_drawing_revision_package_review_approvals_no_delete BEFORE DELETE ON drawing_revision_package_review_approvals BEGIN SELECT RAISE(ABORT, 'DRAWING_REVISION_PACKAGE_REVIEW_APPROVAL_IMMUTABLE'); END`);
  })();

  const afterCanonical = canonicalSnapshot();
  const canonicalUnchanged = sha256(stable(beforeCanonical)) === sha256(stable(afterCanonical));
  if (!canonicalUnchanged) throw new Error("DEV087_CANONICAL_HASH_CHANGED");
  const releasedPhysical = [];
  const dataRoot = path.resolve(path.dirname(dbPath));
  for (const item of physicalDeletePlan) {
    const absolute = path.resolve(dataRoot, item.pointer);
    if (!absolute.startsWith(dataRoot + path.sep) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    const actualHash = sha256(fs.readFileSync(absolute));
    if (item.contentHash && actualHash !== item.contentHash) throw new Error(`DEV087_LEGACY_FILE_HASH_MISMATCH:${item.assetId}`);
    fs.unlinkSync(absolute);
    releasedPhysical.push({ ...item, absolute, actualHash });
  }
  deletedCounts = {
    workspaces: beforeCounts.workspaces,
    quarantine: beforeCounts.quarantine,
    fileAssets: physicalDeletePlan.length,
    physicalFiles: releasedPhysical.length
  };
}

const afterCanonical = canonicalSnapshot();
const afterCounts = {
  workspaces: tableExists("numbering_draft_workspaces") ? scalar("SELECT COUNT(*) AS count FROM numbering_draft_workspaces") : 0,
  quarantine: tableExists("pdm_workbench_migration_quarantine") ? scalar("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine") : 0
};
const canonicalUnchanged = sha256(stable(beforeCanonical)) === sha256(stable(afterCanonical));
const manifest = {
  devId: "DEV-087", provider: "sqlite", dbPath, mode: apply ? "apply" : "dry-run",
  exactPrimaryPath: dbPath === primaryDb, beforeCounts, afterCounts, beforeCanonical, afterCanonical,
  canonicalUnchanged, deletedCounts, physicalDeletePlan,
  pass: canonicalUnchanged && (!apply || (afterCounts.workspaces === 0 && afterCounts.quarantine === 0))
};
fs.mkdirSync(outputDir, { recursive: true });
const manifestPath = path.join(outputDir, "manifest.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
db.close();
console.log(JSON.stringify({ status: manifest.pass ? "PASS" : "FAIL", mode: manifest.mode, beforeCounts, afterCounts, canonicalUnchanged, manifestPath }, null, 2));
if (!manifest.pass) process.exitCode = 1;
