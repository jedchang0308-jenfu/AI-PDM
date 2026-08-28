#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const root = process.cwd();
const runId = `DEV100-primary-dry-run-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV100_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-100", runId));
const dbPath = path.resolve(process.env.PDM_PRIMARY_DB_PATH?.trim() || path.join(root, "data", "ai-pdm.sqlite"));
const repositoryDir = path.resolve(process.env.PDM_PRIMARY_REPOSITORY_DIR?.trim() || path.join(root, "data", "repository"));
const originalFailureScreenshot = "C:\\Users\\user\\AppData\\Local\\Temp\\codex-clipboard-a2ee3d29-61f7-4dd7-a925-90e1f99a7c60.png";
const checks = [];
let firstFailure = null;

fs.mkdirSync(evidenceDir, { recursive: true });
console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-100 read-only primary A0044 inventory, fingerprint and bounded A/B repair dry-run",
  port: null,
  owningProcessTree: "this Node process only",
  cleanupCondition: "read-only SQLite handle closed; evidence retained",
  PDM_DATA_DIR: path.dirname(dbPath),
  PDM_REPOSITORY_DIR: repositoryDir,
  mutationScope: "none; primary DB and repository opened read-only"
} }));

function hashBytes(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function check(id, label, fn) {
  try {
    const detail = fn();
    checks.push({ id, label, status: "PASS", detail: detail ?? null });
    console.log(`PASS ${id} ${label}`);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    checks.push({ id, label, status: "FAIL", message });
    throw error;
  }
}
function resolvePhysical(row) {
  const candidates = [
    row.original_path ? path.resolve(row.original_path) : null,
    row.storage_key ? path.join(repositoryDir, ...String(row.storage_key).split("/")) : null
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0] ?? null;
}
function readInventory(db) {
  const work = db.prepare(`SELECT work.id work_id,work.company_id,work.drawing_id,work.owner_user_id,work.row_version,work.proposed_payload,
      state.id state_id,state.revision_id,state.row_version state_row_version,revision.revision,drawing.drawing_number
    FROM drawing_revision_works work
    JOIN canonical_workbench_states state ON state.work_id=work.id AND state.company_id=work.company_id
    JOIN drawing_revisions revision ON revision.id=state.revision_id AND revision.company_id=state.company_id
    JOIN drawings drawing ON drawing.id=work.drawing_id AND drawing.company_id=work.company_id
    WHERE work.id='c65d1134-44d1-49d1-a689-74d83e75174a' OR drawing.drawing_number='A0044-M01'
    ORDER BY CASE WHEN work.id='c65d1134-44d1-49d1-a689-74d83e75174a' THEN 0 ELSE 1 END LIMIT 1`).get();
  assert.ok(work, "affected A0044 work exists");
  const files = db.prepare(`SELECT file.id file_binding_id,file.sort_order,file.role,file.is_primary,file.removed_at,file.removed_by,
      asset.id asset_id,asset.file_name,asset.storage_provider,asset.original_path,asset.storage_key,asset.content_hash,
      asset.deleted_at,asset.deleted_by,asset.deleted_reason,binding.work_id,binding.ordinal,binding.content_hash binding_content_hash
    FROM drawing_revision_files file
    JOIN file_assets asset ON asset.id=file.source_file_asset_id
    LEFT JOIN drawing_revision_work_files binding ON binding.file_binding_id=file.id AND binding.work_id=?
    WHERE file.company_id=? AND file.drawing_revision_id=?
    ORDER BY file.sort_order,file.created_at,file.id`).all(work.work_id, work.company_id, work.revision_id);
  const physical = files.map((row) => {
    const physicalPath = resolvePhysical(row);
    return {
      fileBindingId: row.file_binding_id,
      assetId: row.asset_id,
      fileName: row.file_name,
      physicalPath,
      exists: Boolean(physicalPath && fs.existsSync(physicalPath)),
      sha256: physicalPath && fs.existsSync(physicalPath) ? hashBytes(fs.readFileSync(physicalPath)) : null,
      dbHash: row.content_hash,
      matches: Boolean(physicalPath && fs.existsSync(physicalPath) && hashBytes(fs.readFileSync(physicalPath)) === row.content_hash)
    };
  });
  const active = files.filter((row) => row.work_id === work.work_id && row.removed_at === null && row.deleted_at === null);
  const tombstones = files.filter((row) => row.removed_at !== null || row.deleted_at !== null);
  return { work, files, physical, active, tombstones };
}
function protectedInvariant(db) {
  const payload = {
    schema: db.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') AND tbl_name IN ('part_roots','part_numbers','drawing_numbers','drawings','drawing_revisions','drawing_revision_files','drawing_revision_works','drawing_revision_work_files','canonical_workbench_states') ORDER BY type,name`).all(),
    roots: db.prepare("SELECT id,company_id,root_code FROM part_roots ORDER BY id").all(),
    parts: db.prepare("SELECT id,company_id,part_root_id,part_number FROM part_numbers ORDER BY id").all(),
    drawings: db.prepare("SELECT id,company_id,part_root_id,drawing_number FROM drawings ORDER BY id").all(),
    residue: db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%migration%' ORDER BY name").all(),
    foreignKeys: db.pragma("foreign_key_check")
  };
  return { payload, hash: hashBytes(JSON.stringify(payload)) };
}

let inventory = null;
let before = null;
let after = null;
let repairPlans = null;
try {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  db.pragma("query_only = ON");
  try {
    before = protectedInvariant(db);
    inventory = readInventory(db);
    const activeNames = inventory.active.map((row) => row.file_name);
    const preRepairState = JSON.stringify(activeNames) === JSON.stringify(["A0043.SLDASM", "A0044-M01.pdf"]);
    const repairedState = JSON.stringify(activeNames) === JSON.stringify(["A0044.SLDASM", "A0044-M01.pdf", "A0044-M01.SLDDRW"]);
    check("QA-100-001-A", "primary A0044 is either the fingerprint-gated pre-repair state or a complete coherent repair", () => {
      assert.equal(JSON.parse(inventory.work.proposed_payload).migrated, true);
      assert.equal(preRepairState || repairedState, true, `unexpected active set: ${JSON.stringify(activeNames)}`);
      if (preRepairState) {
        const retired = inventory.tombstones.find((row) => row.file_name === "A0044.SLDASM");
        assert.ok(retired);
        assert.equal(retired.deleted_reason, "drawing_revision_work_file_replaced");
        assert.ok(retired.removed_by && retired.deleted_by);
        return { disposition: "pre_repair_human_selection_required", workId: inventory.work.work_id, revision: inventory.work.revision, active: activeNames, tombstone: retired.file_name, reason: retired.deleted_reason };
      }
      const active3d = inventory.active.find((row) => row.file_name === "A0044.SLDASM" && row.role === "cad_3d");
      const active2d = inventory.active.find((row) => row.file_name === "A0044-M01.SLDDRW" && row.role === "drawing_2d");
      const activePdf = inventory.active.find((row) => row.file_name === "A0044-M01.pdf" && row.role === "pdf");
      const retiredA0043 = inventory.tombstones.find((row) => row.file_name === "A0043.SLDASM");
      assert.ok(active3d && active2d && activePdf && retiredA0043);
      assert.equal(Number(active3d.is_primary), 1);
      assert.equal(Number(active2d.is_primary), 1);
      assert.equal(Number(activePdf.is_primary), 0);
      assert.equal(active3d.binding_content_hash, active3d.content_hash);
      assert.equal(active2d.binding_content_hash, active2d.content_hash);
      assert.equal(activePdf.binding_content_hash, activePdf.content_hash);
      assert.equal(retiredA0043.deleted_reason, "drawing_revision_work_file_replaced");
      assert.ok(retiredA0043.removed_by && retiredA0043.deleted_by);
      return { disposition: "already_repaired", workId: inventory.work.work_id, revision: inventory.work.revision, active: activeNames, tombstone: retiredA0043.file_name, reason: retiredA0043.deleted_reason };
    });
    check("QA-100-001-B", "all inventoried A0044 file bytes exist and match DB SHA-256", () => {
      assert.equal(inventory.physical.length, inventory.files.length);
      assert.equal(inventory.physical.every((row) => row.exists && row.matches), true);
      return inventory.physical;
    });
    check("QA-100-001-C", "original rendered failure evidence records the pre-fix GET 409", () => {
      assert.equal(fs.existsSync(originalFailureScreenshot), true);
      const retainedPath = path.join(evidenceDir, "original-a0044-get-409.png");
      fs.copyFileSync(originalFailureScreenshot, retainedPath);
      return { sourcePath: originalFailureScreenshot, retainedPath, sha256: hashBytes(fs.readFileSync(retainedPath)), observed: "browser console GET /api/pdm/drawing-revision-works/... 409 Conflict and repair banner" };
    });

    const sourceFingerprintPayload = {
      work: inventory.work,
      files: inventory.files,
      physical: inventory.physical.map(({ physicalPath: _physicalPath, ...row }) => row),
      foreignKeys: before.payload.foreignKeys
    };
    const sourceFingerprint = hashBytes(JSON.stringify(sourceFingerprintPayload));
    const a0044 = inventory.files.find((row) => row.file_name === "A0044.SLDASM");
    const a0043 = inventory.files.find((row) => row.file_name === "A0043.SLDASM");
    const pdf = inventory.files.find((row) => row.file_name === "A0044-M01.pdf");
    assert.ok(a0044 && a0043 && pdf);
    const backupMetadata = {
      requiredBeforeApply: true,
      sourceDatabase: dbPath,
      sourceDatabaseSize: fs.statSync(dbPath).size,
      sourceDatabaseModifiedAt: fs.statSync(dbPath).mtime.toISOString(),
      sourceRepository: repositoryDir,
      logicalFingerprint: sourceFingerprint,
      recommendedDatabaseBackup: `${dbPath}.pre-dev100-<timestamp>.bak`,
      recommendedRepositoryBackup: `${repositoryDir}.pre-dev100-<timestamp>`
    };
    repairPlans = repairedState ? {
      sourceFingerprint,
      gate: {
        repairRequired: false,
        repairDisposition: "already_repaired",
        humanSelection: null,
        allowedSelections: [],
        applyCount: 0,
        stopIfFingerprintChanges: true,
        productionApplyAuthorized: false
      },
      backupMetadata,
      plans: {},
      resolvedState: {
        active: inventory.active.map((row) => ({ fileBindingId: row.file_binding_id, assetId: row.asset_id, fileName: row.file_name, role: row.role, ordinal: Number(row.ordinal), hash: row.content_hash })),
        retiredA0043: { fileBindingId: a0043.file_binding_id, assetId: a0043.asset_id, reason: a0043.deleted_reason }
      }
    } : {
      sourceFingerprint,
      gate: {
        repairRequired: true,
        repairDisposition: "human_selection_required",
        humanSelection: null,
        allowedSelections: ["A", "B"],
        applyCount: 0,
        stopIfFingerprintChanges: true,
        productionApplyAuthorized: false
      },
      backupMetadata,
      plans: {
        A: {
          label: "保留目前 last-wins 的 A0043.SLDASM",
          exactDelta: [],
          expectedActive: [
            { fileBindingId: a0043.file_binding_id, assetId: a0043.asset_id, fileName: a0043.file_name, ordinal: Number(a0043.ordinal), hash: a0043.content_hash },
            { fileBindingId: pdf.file_binding_id, assetId: pdf.asset_id, fileName: pdf.file_name, ordinal: Number(pdf.ordinal), hash: pdf.content_hash }
          ],
          expectedTombstone: { fileBindingId: a0044.file_binding_id, assetId: a0044.asset_id, reason: "drawing_revision_work_file_replaced" },
          expectedForeignKeyViolations: 0,
          note: "Code fix後此方案不需資料寫入；仍缺 native .SLDDRW，不能據此送審。"
        },
        B: {
          label: "恢復 A0044.SLDASM 並 retire A0043.SLDASM",
          exactDelta: [
            { table: "drawing_revision_work_files", action: "delete", key: { work_id: inventory.work.work_id, file_binding_id: a0043.file_binding_id } },
            { table: "drawing_revision_files", action: "soft-remove", key: { id: a0043.file_binding_id }, set: { removed_at: "<apply_timestamp>", removed_by: "<repair_actor>" } },
            { table: "file_assets", action: "soft-delete", key: { id: a0043.asset_id }, set: { deleted_at: "<apply_timestamp>", deleted_by: "<repair_actor>", deleted_reason: "drawing_revision_work_file_replaced" } },
            { table: "drawing_revision_files", action: "restore", key: { id: a0044.file_binding_id }, set: { removed_at: null, removed_by: null } },
            { table: "file_assets", action: "restore", key: { id: a0044.asset_id }, set: { deleted_at: null, deleted_by: null, deleted_reason: null } },
            { table: "drawing_revision_work_files", action: "insert", value: { work_id: inventory.work.work_id, file_binding_id: a0044.file_binding_id, ordinal: 0, content_hash: a0044.content_hash } },
            { table: "drawing_revision_works", action: "increment-row-version", key: { id: inventory.work.work_id, expected_row_version: inventory.work.row_version } },
            { table: "canonical_workbench_states", action: "increment-row-version", key: { id: inventory.work.state_id, expected_row_version: inventory.work.state_row_version } }
          ],
          expectedActive: [
            { fileBindingId: a0044.file_binding_id, assetId: a0044.asset_id, fileName: a0044.file_name, ordinal: 0, hash: a0044.content_hash },
            { fileBindingId: pdf.file_binding_id, assetId: pdf.asset_id, fileName: pdf.file_name, ordinal: Number(pdf.ordinal), hash: pdf.content_hash }
          ],
          expectedTombstone: { fileBindingId: a0043.file_binding_id, assetId: a0043.asset_id, reason: "drawing_revision_work_file_replaced" },
          expectedForeignKeyViolations: 0,
          note: "PDF維持 non-primary；仍缺 native .SLDDRW，不能據此送審。"
        }
      }
    };
    check("QA-100-017", "primary repair disposition is fingerprint-gated, read-only and zero-apply", () => {
      assert.equal(repairPlans.gate.applyCount, 0);
      assert.equal(repairPlans.gate.humanSelection, null);
      if (repairPlans.gate.repairRequired) {
        assert.deepEqual(repairPlans.gate.allowedSelections, ["A", "B"]);
        assert.equal(repairPlans.plans.A.exactDelta.length, 0);
        assert.ok(repairPlans.plans.B.exactDelta.length > 0);
        return { sourceFingerprint, disposition: repairPlans.gate.repairDisposition, selections: repairPlans.gate.allowedSelections, applyCount: 0, planBDeltaCount: repairPlans.plans.B.exactDelta.length };
      }
      assert.equal(repairPlans.gate.repairDisposition, "already_repaired");
      assert.deepEqual(repairPlans.gate.allowedSelections, []);
      assert.deepEqual(Object.keys(repairPlans.plans), []);
      assert.deepEqual(repairPlans.resolvedState.active.map((row) => row.fileName), ["A0044.SLDASM", "A0044-M01.pdf", "A0044-M01.SLDDRW"]);
      return { sourceFingerprint, disposition: repairPlans.gate.repairDisposition, selections: [], applyCount: 0, active: repairPlans.resolvedState.active.map((row) => row.fileName) };
    });
    after = protectedInvariant(db);
    check("QA-100-017-READONLY", "primary schema, identities, root references, residue and FK remain unchanged", () => {
      assert.equal(after.hash, before.hash);
      assert.equal(after.payload.foreignKeys.length, 0);
      return { before: before.hash, after: after.hash, foreignKeys: 0 };
    });
  } finally { db.close(); }
} catch (error) {
  firstFailure = error instanceof Error ? error.stack ?? error.message : String(error);
}

const status = !firstFailure && checks.every((entry) => entry.status === "PASS") ? "PASS" : "FAIL";
const manifest = { runner: "primary-dry-run", runId, status, readOnly: true, productionWrites: false, applyCount: 0, checks, firstFailure, invariant: { before: before?.hash ?? null, after: after?.hash ?? null } };
fs.writeFileSync(path.join(evidenceDir, "primary-inventory.json"), `${JSON.stringify({ work: inventory?.work ?? null, files: inventory?.files ?? [], physical: inventory?.physical ?? [] }, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(evidenceDir, "repair-plans.json"), `${JSON.stringify(repairPlans, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(evidenceDir, "primary-dry-run.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runner: manifest.runner, status, passed: checks.filter((entry) => entry.status === "PASS").length, total: checks.length, applyCount: 0 }));
if (status !== "PASS") process.exitCode = 1;
