#!/usr/bin/env node

import Database from "better-sqlite3";

import { projectFileExists, readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const checks = [];

const readRequired = (relativePath) => readProjectFile(root, relativePath);
const existsRequired = (relativePath) => projectFileExists(root, relativePath);

function assert(condition, message, detail = "") {
  checks.push({ message, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

const sqliteSchema = readRequired("db/schema.sql");
const postgresSchema = readRequired("db/postgres/001_initial_schema.sql");
const rlsPlan = readRequired("db/postgres/002_supabase_rls_plan.sql");
const repository = readRequired("src/lib/repositories/master-attachment-repository.ts");
const asyncRepository = readRequired("src/lib/repositories/master-attachment-async-repository.ts");
const revisionPolicy = readRequired("src/lib/revision-policy.ts");
const dbExports = readRequired("src/lib/db.ts");
const permissions = readRequired("src/lib/numbering-permission-codes.ts");
const settingsRoute = readRequired("src/app/api/settings/route.ts");
const settingsVerifyRoute = readRequired("src/app/api/settings/gdrive/folders/verify/route.ts");
const settingsPage = readRequired("src/app/settings/page.tsx");
const panel = readRequired("src/components/master-attachment-panel.tsx");
const sharedPreview = readRequired("src/components/drawing-detail-preview.tsx");
const drawingsPage = readRequired("src/app/numbering/drawings/page.tsx");
const partsPage = readRequired("src/app/parts/page.tsx");
const packageJson = readProjectJson(root, "package.json");

const expectedFileAssetColumns = [
  "mime_type",
  "document_category",
  "display_name",
  "description",
  "uploaded_by",
  "deleted_at",
  "deleted_by",
  "deleted_reason",
  "gdrive_file_id",
  "gdrive_status",
  "gdrive_error",
  "gdrive_synced_at"
];

for (const column of expectedFileAssetColumns) {
  assert(sqliteSchema.includes(column), `SQLite file_assets includes ${column}`);
  assert(postgresSchema.includes(column), `Postgres file_assets includes ${column}`);
}

assert(sqliteSchema.includes("gdrive_status IN ('none', 'uploading', 'uploaded', 'failed')"), "SQLite gdrive_status has attachment sync states");
assert(postgresSchema.includes("gdrive_status IN ('none', 'uploading', 'uploaded', 'failed')"), "Postgres gdrive_status has attachment sync states");
assert(rlsPlan.includes("'file_assets'"), "Supabase RLS baseline includes file_assets");

for (const roleCode of ["system_admin", "pdm_admin", "rd_manager", "rd"]) {
  assert(sqliteSchema.includes(`('${roleCode}', 'action', 'numbering.attachments.manage', 1)`), `${roleCode} can manage master attachments`);
}
assert(permissions.includes('"numbering.attachments.manage"'), "Permission code list includes numbering.attachments.manage");

const database = new Database(":memory:");
database.exec("PRAGMA foreign_keys = ON;");
database.exec(sqliteSchema);
const fileAssetColumns = database.prepare("PRAGMA table_info(file_assets)").all().map((column) => column.name);
for (const column of expectedFileAssetColumns) {
  assert(fileAssetColumns.includes(column), `Runtime SQLite file_assets column exists: ${column}`);
}
database.close();

for (const name of [
  "createMasterAttachment",
  "getMasterAttachment",
  "getMasterAttachmentBytes",
  "listMasterAttachments",
  "softDeleteMasterAttachment",
  "syncMasterAttachmentToDrive"
]) {
  assert(repository.includes(`export ${name.startsWith("sync") || name.startsWith("create") || name.startsWith("getMasterAttachmentBytes") ? "async function" : "function"} ${name}`) || repository.includes(`export function ${name}`), `Repository exports ${name}`);
  assert(dbExports.includes(name), `db.ts re-exports ${name}`);
}

assert(repository.includes("getSystemSetting(\"gdrive_master_attachments_folder_id\")"), "Repository reads master attachment Drive folder setting");
assert(repository.includes("GOOGLE_DRIVE_MASTER_ATTACHMENTS_FOLDER_ID"), "Repository supports env fallback for Drive folder");
assert(repository.includes("uploadFileToDrive"), "Repository uploads attachments to Drive");
assert(repository.includes("setFileAppProperties"), "Repository writes Drive appProperties");
assert(repository.includes("AI_PDM_MASTER_ATTACHMENT"), "Repository marks Drive files as master attachments");
assert(repository.includes("MASTER_ATTACHMENT_DUPLICATE_ACTIVE_FILE"), "Repository blocks duplicate active files");
assert(revisionPolicy.includes("REVISION_V_PREFIX_NOT_ALLOWED"), "Revision policy rejects V-prefixed revision codes");
assert(repository.includes("normalizeAttachmentRevision") && repository.includes("MASTER_ATTACHMENT_REVISION_INVALID"), "Sync repository validates attachment revision format");
assert(asyncRepository.includes("normalizeAttachmentRevision") && asyncRepository.includes("MASTER_ATTACHMENT_REVISION_INVALID"), "Async repository validates attachment revision format");

const routeFiles = [
  "src/app/api/numbering/drawings/[drawingNumber]/attachments/route.ts",
  "src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/route.ts",
  "src/app/api/parts/[partNumber]/attachments/route.ts",
  "src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts"
];
for (const routeFile of routeFiles) {
  assert(existsRequired(routeFile), `Attachment API route exists: ${routeFile}`);
  const source = readRequired(routeFile);
  assert(source.includes("numbering.attachments.manage"), `Attachment route enforces manage permission: ${routeFile}`);
  assert(source.includes("listMasterAttachments") || source.includes("createMasterAttachment") || source.includes("getMasterAttachmentBytes"), `Attachment route calls master attachment repository: ${routeFile}`);
}

assert(settingsRoute.includes("gdrive_master_attachments_folder_id"), "Settings API persists master attachment folder ID");
assert(settingsVerifyRoute.includes("master_attachments"), "Drive folder verify API accepts master_attachments intended use");
assert(settingsPage.includes("masterAttachmentsFolder"), "Settings page tracks master attachment folder state");
assert(settingsPage.includes('verifyAndAssign("master_attachments")'), "Settings page can assign selected folder as master attachment library");
assert(settingsPage.includes("folderSnapshotPayload(\"master_attachments\""), "Settings page saves master attachment folder snapshot");

assert(panel.includes("圖號附件庫") && panel.includes("料號附件庫"), "Shared panel labels drawing and part attachment libraries");
assert(panel.includes("retryDriveSync"), "Shared panel supports Drive retry");
assert(panel.includes("https://drive.google.com/file/d/"), "Shared panel links synced Drive files");
assert(panel.includes("suggestRevisionCode"), "Shared panel uses revision policy suggestion");
assert(panel.includes("revisionLifecycleStageForAttachment"), "Shared panel derives attachment revision lifecycle stage");
assert(panel.includes("buildDrawingPreviewSlots") && panel.includes("DrawingDetailPreview") && sharedPreview.includes("drawing-preview-board") && sharedPreview.includes("3D 模型") && sharedPreview.includes("2D 圖面"), "Drawing attachment panel renders the shared first-level 3D/2D preview board");
assert(panel.includes("attachmentPreviewMode") && panel.includes("?preview=1"), "Drawing attachment panel can inline preview PDF/image attachments");
assert(panel.includes("previewDerivatives") && panel.includes("previewJob"), "Drawing attachment panel receives native preview derivative/job metadata");
assert(panel.includes("findReadyPreviewDerivative") && panel.includes("previewDerivative="), "Drawing attachment panel can inline generated native preview derivatives");
assert(panel.includes("generatePreview") && panel.includes("/previews"), "Drawing attachment panel can enqueue native preview generation");
assert(panel.includes("previewPollingNeeded") && panel.includes("setInterval"), "Drawing attachment panel updates native preview state automatically");
assert(panel.includes("tone: \"failed\"") && panel.includes("title: \"無法預覽\"") && panel.includes("text: \"請下載原檔\""), "Drawing attachment panel shows concise native preview states");
assert(!panel.includes("master-attachment-refresh") && !panel.includes("重新整理附件"), "Attachment panel does not require a manual refresh control");
assert(panel.includes("findPreviewAttachment") && panel.includes("isThreeDimensionalAttachment") && panel.includes("isTwoDimensionalAttachment"), "Drawing attachment panel selects 3D and 2D preview attachments separately");
assert(panel.includes("groupHistoryAttachmentsByRevision") && panel.includes("master-attachment-history-revision"), "Drawing attachment history groups files by revision");
assert(panel.includes("placeholder={revisionStage ? suggestedRevision") && !panel.includes("例如 A、B 或空白"), "Shared panel no longer suggests A/B revision placeholder");
assert(panel.includes("版次 {attachment.revision}") && !panel.includes("Rev {attachment.revision}"), "Shared panel labels attachment revision without Rev prefix");
assert(drawingsPage.includes("MasterAttachmentPanel") && drawingsPage.includes('entityType="drawing_number"'), "Drawing drawer mounts master attachment panel");
assert(drawingsPage.includes("processControlled={isManufacturingDrawingPurpose(drawing.purposeCode)}"), "Drawing drawer passes PDM process control to attachment panel");
assert(partsPage.includes("MasterAttachmentPanel") && partsPage.includes('entityType="part_number"'), "Part drawer mounts master attachment panel");
assert(packageJson.scripts["qc:master-attachments"] === "node scripts/qc-master-attachments.mjs", "package script qc:master-attachments is registered");

console.log(`qc:master-attachments passed ${checks.length}/${checks.length} checks`);
