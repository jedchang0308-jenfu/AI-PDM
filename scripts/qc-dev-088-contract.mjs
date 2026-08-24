import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createFixtureDatabase } from "./qc-dev-087-fixtures.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const spec = read(".ai-doc/specs/SPEC-PDM-PART-ATTACHMENT-REUSE-002-replacement-selection-snapshot.md");
const adr = read(".ai-doc/decisions/ADR-PDM-PART-ATTACHMENT-REUSE-002-file-asset-snapshot.md");
const qa = read(".ai-doc/qa/qa-dev-088-replacement-part-attachment-selection-2026-08-22.md");
const schema = read("db/schema.sql");
const migration = read("db/postgres/041_part_attachment_reuse_snapshot.sql");
const service = read("src/lib/replacement-part-attachments.ts");
const domain = read("src/lib/pdm-change-control-domain.ts");
const ui = read("src/app/numbering/revisions/page.tsx");
const candidateRoute = read("src/app/api/parts/[partNumber]/replacement-attachment-candidates/route.ts");
const submissionRoute = read("src/app/api/numbering/drawing-revisions/submissions/route.ts");

assert(spec.includes("Status: `Local RD Implemented / Focused QA-QC PASS"));
assert(spec.includes("預設全選"));
assert(spec.includes("source stale fail closed"));
assert(spec.includes("不複製 physical bytes"));
assert(spec.includes("不顯示沿用／排除／新增件數"));
assert(adr.includes("兩張小型稽核表"));
assert(qa.includes("穩定性／效率優先"));
assert(qa.includes("不做作弊／攻防型重測"));

for (const table of ["part_attachment_reuse_snapshots", "part_attachment_reuse_origins"]) {
  assert(schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
}
assert(migration.startsWith("BEGIN;"));
assert(migration.trimEnd().endsWith("COMMIT;"));
assert(migration.includes("target_file_asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE RESTRICT"));
assert(migration.includes("source_file_asset_id TEXT REFERENCES file_assets(id) ON DELETE RESTRICT"));

assert(service.includes("asset.document_category NOT IN ('drawing_2d', 'cad_3d')"));
assert(service.includes("SOURCE_ATTACHMENTS_STALE"));
assert(service.includes("REPLACEMENT_ATTACHMENT_SNAPSHOT_CONFLICT"));
assert(service.includes("linked_entity_type = 'part_number_draft'"));
assert(service.includes("linked_entity_type = 'part_number'"));
assert(service.includes("replacement-part-attachments"));
assert(service.includes("expectedOriginCount !== Number(before?.count ?? 0)"));
assert(service.includes("SELECT origin.target_file_asset_id"));
assert(domain.includes("attachmentSnapshot?: ReplacementAttachmentSnapshotInput | null"));
assert(domain.includes("promoteReplacementPartAttachmentsAsync"));
assert(domain.includes("submitDrawingRevisionFffAssessmentInTransaction"));

assert(candidateRoute.includes('requireNumberingPageAsync(request, "numbering.search")'));
assert(candidateRoute.includes('"cache-control": "private, no-store"'));
assert(!candidateRoute.match(/storage(Key|Bucket|Provider)|contentHash/u));
assert(submissionRoute.includes("REPLACEMENT_ATTACHMENT_SNAPSHOT_LIFECYCLE_UNAVAILABLE"));
assert(submissionRoute.includes("prepareReplacementAttachmentCommand"));

assert(ui.includes("料號附件"));
assert(ui.includes("setSelectedReplacementAttachmentIds(nextSource.candidates.map"));
assert(ui.includes("part_attachment_file:${item.clientKey}"));
assert(ui.includes("你目前的選擇與新檔仍保留"));
for (const banned of ["沿用件數", "排除件數", "新增件數", "來源 badge", "selection_fingerprint", "sourceToken："]) {
  assert(!ui.includes(banned), `UI leaks banned copy: ${banned}`);
}

const db = createFixtureDatabase();
const tables = new Set(db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map((row) => row.name));
assert(tables.has("part_attachment_reuse_snapshots"));
assert(tables.has("part_attachment_reuse_origins"));
const originForeignKeys = db.prepare(`PRAGMA foreign_key_list(part_attachment_reuse_origins)`).all();
assert.equal(originForeignKeys.find((row) => row.from === "target_file_asset_id")?.on_delete, "RESTRICT");
assert.equal(originForeignKeys.find((row) => row.from === "source_file_asset_id")?.on_delete, "RESTRICT");
assert.equal(db.pragma("foreign_key_check").length, 0);
db.close();

console.log("DEV-088 contract: PASS (40 checks)");
