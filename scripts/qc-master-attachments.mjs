#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message, detail = "") {
  checks.push({ message, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

const sqliteSchema = read("db/schema.sql");
const postgresSchema = read("db/postgres/001_initial_schema.sql");
const rlsPlan = read("db/postgres/002_supabase_rls_plan.sql");
const repository = read("src/lib/repositories/master-attachment-repository.ts");
const dbExports = read("src/lib/db.ts");
const permissions = read("src/lib/numbering-permission-codes.ts");
const settingsRoute = read("src/app/api/settings/route.ts");
const settingsVerifyRoute = read("src/app/api/settings/gdrive/folders/verify/route.ts");
const settingsPage = read("src/app/settings/page.tsx");
const panel = read("src/components/master-attachment-panel.tsx");
const drawingsPage = read("src/app/numbering/drawings/page.tsx");
const partsPage = read("src/app/parts/page.tsx");
const packageJson = JSON.parse(read("package.json"));

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

const routeFiles = [
  "src/app/api/numbering/drawings/[drawingNumber]/attachments/route.ts",
  "src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/route.ts",
  "src/app/api/parts/[partNumber]/attachments/route.ts",
  "src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts"
];
for (const routeFile of routeFiles) {
  assert(exists(routeFile), `Attachment API route exists: ${routeFile}`);
  const source = read(routeFile);
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
assert(drawingsPage.includes("MasterAttachmentPanel") && drawingsPage.includes('entityType="drawing_number"'), "Drawing drawer mounts master attachment panel");
assert(partsPage.includes("MasterAttachmentPanel") && partsPage.includes('entityType="part_number"'), "Part drawer mounts master attachment panel");
assert(packageJson.scripts["qc:master-attachments"] === "node scripts/qc-master-attachments.mjs", "package script qc:master-attachments is registered");

console.log(`qc:master-attachments passed ${checks.length}/${checks.length} checks`);
