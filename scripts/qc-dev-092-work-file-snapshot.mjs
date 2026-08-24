#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { assert, createFixtureDatabase, ids, pass } from "./qc-dev-087-fixtures.mjs";

const root = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dev-092-work-files-"));
const dbPath = path.join(tempRoot, "fixture.sqlite");
const evidenceRoot = path.join(root, "output", "qa", "dev-092-work-file-snapshot", path.basename(tempRoot));
fs.mkdirSync(evidenceRoot, { recursive: true });

function addRevisionFiles(db) {
  const rows = [
    { binding: "binding-dev092-1", asset: "asset-dev092-1", name: "A0002-M01.pdf", ext: "pdf", mime: "application/pdf", hash: "hash-dev092-1", role: "pdf", ordinal: 0 },
    { binding: "binding-dev092-2", asset: "asset-dev092-2", name: "A0002-M01.SLDDRW", ext: "slddrw", mime: "application/octet-stream", hash: "hash-dev092-2", role: "drawing_2d", ordinal: 1 },
    { binding: "binding-dev092-3", asset: "asset-dev092-3", name: "A0002-M01.SLDPRT", ext: "sldprt", mime: "application/octet-stream", hash: "hash-dev092-3", role: "cad_3d", ordinal: 2 }
  ];
  const insertAsset = db.prepare(`INSERT INTO file_assets (id, file_name, file_ext, mime_type, file_size, content_hash, linked_entity_type, linked_entity_id, document_category, display_name, uploaded_by)
    VALUES (@asset, @name, @ext, @mime, 128, @hash, 'drawing_revision', @revision, 'drawing', @name, @owner)`);
  const insertBinding = db.prepare(`INSERT INTO drawing_revision_files (id, company_id, drawing_revision_id, source_file_asset_id, role, role_source, display_name, sort_order, is_primary, created_by)
    VALUES (@binding, @company, @revision, @asset, @role, 'migration', @name, @ordinal, @primary, @owner)`);
  for (const row of rows) {
    insertAsset.run({ ...row, revision: ids.rdRevision, owner: ids.owner });
    insertBinding.run({ ...row, company: ids.company, revision: ids.rdRevision, owner: ids.owner, primary: row.ordinal === 0 ? 1 : 0 });
  }
  return rows;
}

function runMigration(args, outputName, targetDbPath = dbPath) {
  const outputDir = path.join(evidenceRoot, outputName);
  const result = spawnSync(process.execPath, ["scripts/migrate-dev-087-canonical-workbench.mjs", `--db=${targetDbPath}`, `--output-dir=${outputDir}`, "--expected-commit=local-dev", ...args], { cwd: root, encoding: "utf8" });
  const manifestPath = path.join(outputDir, "manifest.json");
  return { ...result, outputDir, manifest: fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : null };
}

function runNegativeMatrixCase(name, mutate, expectedReason) {
  const caseDbPath = path.join(tempRoot, `${name}.sqlite`);
  fs.copyFileSync(cleanDbPath, caseDbPath);
  const caseDb = new Database(caseDbPath);
  mutate(caseDb);
  caseDb.close();
  const result = runMigration([], `matrix-${name}`, caseDbPath);
  assert.equal(result.status, 2, `${name}: ${result.stderr || result.stdout}`);
  assert.ok(result.manifest?.quarantine?.some((entry) => entry.reasonCode === expectedReason), `${name}: expected ${expectedReason}`);
  return { name, exitCode: result.status, reasonCode: expectedReason, manifest: path.join(result.outputDir, "manifest.json") };
}

const db = createFixtureDatabase({ filename: dbPath, canonical: false, rdLifecycle: "preparing" });
const sourceFiles = addRevisionFiles(db);
db.close();

const firstApply = runMigration(["--apply", "--confirm-disposable-dev-087", "--switch-canonical-only"], "first-apply");
assert.equal(firstApply.status, 0, firstApply.stderr || firstApply.stdout);
assert.equal(firstApply.manifest?.source.expectedDrawingWorkFiles, sourceFiles.length);
assert.equal(firstApply.manifest?.target.drawingWorkFiles, sourceFiles.length);
assert.equal(firstApply.manifest?.unresolved, 0);

let checkDb = new Database(dbPath, { readonly: true });
assert.equal(checkDb.prepare("SELECT COUNT(*) AS count FROM drawing_revision_work_files").get().count, sourceFiles.length);
const workId = checkDb.prepare("SELECT id FROM drawing_revision_works WHERE drawing_id = ?").get(ids.drawing).id;
checkDb.close();

const secondApply = runMigration(["--apply", "--confirm-disposable-dev-087"], "second-apply");
assert.equal(secondApply.status, 0, secondApply.stderr || secondApply.stdout);
assert.equal(secondApply.manifest?.unresolved, 0);
assert.equal(secondApply.manifest?.workFileRepair?.plannedRows, 0);

checkDb = new Database(dbPath);
checkDb.prepare("DELETE FROM drawing_revision_work_files WHERE work_id = ? AND file_binding_id = ?").run(workId, "binding-dev092-2");
checkDb.close();

const negative = runMigration([], "negative-missing-file");
assert.equal(negative.status, 2, negative.stderr || negative.stdout);
assert.ok(negative.manifest?.quarantine?.some((entry) => entry.reasonCode === "work_file_snapshot_incomplete"));

const repairDryRun = runMigration(["--repair-work-files"], "repair-dry-run");
assert.equal(repairDryRun.status, 0, repairDryRun.stderr || repairDryRun.stdout);
assert.equal(repairDryRun.manifest?.workFileRepair?.plannedRows, 1);
assert.equal(repairDryRun.manifest?.target?.drawingWorkFiles, 1);

const repairApply = runMigration(["--apply", "--repair-work-files", "--confirm-disposable-dev-087"], "repair-apply");
assert.equal(repairApply.status, 0, repairApply.stderr || repairApply.stdout);
assert.equal(repairApply.manifest?.workFileRepair?.plannedRows, 1);

checkDb = new Database(dbPath, { readonly: true });
assert.equal(checkDb.prepare("SELECT COUNT(*) AS count FROM drawing_revision_work_files WHERE work_id = ?").get(workId).count, sourceFiles.length);
assert.equal(checkDb.pragma("foreign_key_check").length, 0);
checkDb.close();

const repairIdempotent = runMigration(["--apply", "--repair-work-files", "--confirm-disposable-dev-087"], "repair-idempotent");
assert.equal(repairIdempotent.status, 0, repairIdempotent.stderr || repairIdempotent.stdout);
assert.equal(repairIdempotent.manifest?.workFileRepair?.plannedRows, 0);

// Preserve a clean, repaired target snapshot so every drift case below is
// isolated and cannot mask another case's mutation.
const cleanDbPath = path.join(tempRoot, "clean.sqlite");
fs.copyFileSync(dbPath, cleanDbPath);

const matrixCases = [
  runNegativeMatrixCase("source-asset-deleted", (caseDb) => {
    caseDb.prepare("UPDATE file_assets SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run("asset-dev092-2");
  }, "work_file_source_asset_missing_or_deleted"),
  runNegativeMatrixCase("source-binding-removed", (caseDb) => {
    caseDb.prepare("UPDATE drawing_revision_files SET removed_at = CURRENT_TIMESTAMP, removed_by = ? WHERE id = ?").run(ids.owner, "binding-dev092-2");
  }, "work_file_source_asset_missing_or_deleted"),
  runNegativeMatrixCase("source-content-hash-drift", (caseDb) => {
    caseDb.prepare("UPDATE file_assets SET content_hash = ? WHERE id = ?").run("hash-dev092-mutated", "asset-dev092-2");
  }, "work_file_snapshot_target_drift"),
  runNegativeMatrixCase("target-extra-binding", (caseDb) => {
    caseDb.prepare("INSERT INTO drawing_revision_work_files (work_id, file_binding_id, ordinal, content_hash) VALUES (?, ?, ?, ?)").run(workId, "binding-dev092-extra", 99, "hash-dev092-extra");
  }, "work_file_snapshot_target_drift"),
  runNegativeMatrixCase("target-hash-drift", (caseDb) => {
    caseDb.prepare("UPDATE drawing_revision_work_files SET content_hash = ? WHERE work_id = ? AND file_binding_id = ?").run("hash-dev092-target-mutated", workId, "binding-dev092-2");
  }, "work_file_snapshot_target_drift"),
  runNegativeMatrixCase("target-duplicate-ordinal", (caseDb) => {
    caseDb.prepare("UPDATE drawing_revision_work_files SET ordinal = 0 WHERE work_id = ? AND file_binding_id = ?").run(workId, "binding-dev092-2");
  }, "work_file_snapshot_target_drift"),
  runNegativeMatrixCase("source-cross-company", (caseDb) => {
    caseDb.prepare("UPDATE drawing_revisions SET company_id = ? WHERE id = ?").run(ids.otherCompany, ids.rdRevision);
    caseDb.prepare("UPDATE drawing_revision_files SET company_id = ? WHERE drawing_revision_id = ?").run(ids.otherCompany, ids.rdRevision);
  }, "work_file_source_scope_mismatch")
];

checkDb = new Database(dbPath);
checkDb.prepare("UPDATE drawing_revision_work_files SET ordinal = ordinal + 99 WHERE work_id = ? AND file_binding_id = ?").run(workId, "binding-dev092-2");
checkDb.close();
const targetDrift = runMigration([], "negative-target-drift");
assert.equal(targetDrift.status, 2, targetDrift.stderr || targetDrift.stdout);
assert.ok(targetDrift.manifest?.quarantine?.some((entry) => entry.reasonCode === "work_file_snapshot_target_drift"));

const evidence = {
  devId: "DEV-092",
  status: "PASS",
  sourceFileCount: sourceFiles.length,
  workId,
  negativeControl: { exitCode: negative.status, reasonCode: "work_file_snapshot_incomplete", targetDriftExitCode: targetDrift.status, targetDriftReasonCode: "work_file_snapshot_target_drift" },
  driftMatrix: matrixCases,
  repair: { plannedRows: repairApply.manifest.workFileRepair.plannedRows, finalCount: sourceFiles.length },
  manifests: ["first-apply", "second-apply", "negative-missing-file", "repair-dry-run", "repair-apply", "repair-idempotent", "negative-target-drift", ...matrixCases.map((entry) => entry.manifest)]
};
fs.writeFileSync(path.join(evidenceRoot, "manifest.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
pass("DEV-092 work-file snapshot migration/repair", 21);
