import crypto from "node:crypto";
import { createAuditLog, getDb, getSystemSetting } from "@/lib/db";
import type { SqliteDatabase } from "@/lib/db-provider";
import { buildStorageKey, createFileStorageService, sha256, storageKeyFromLocalPath } from "@/lib/file-storage";
import { isGoogleDriveServiceConfigured, setFileAppProperties, uploadFileToDrive } from "@/lib/gdrive";
import { normalizeRevisionCode, revisionValidationMessage, validateRevisionCode } from "@/lib/revision-policy";
import { getMasterAttachmentUploadPolicy } from "@/lib/storage-upload-policy";

export type MasterAttachmentEntityType = "drawing_number" | "part_number";
export type DrawingAttachmentCategory = "cad_3d" | "intermediate" | "drawing_2d" | "dwg" | "pdf" | "other";
export type PartAttachmentCategory = "cad_3d" | "intermediate" | "catalog" | "spec_sheet" | "supplier_doc" | "test_report" | "other";
export type MasterAttachmentCategory = DrawingAttachmentCategory | PartAttachmentCategory;
export type MasterAttachmentDriveStatus = "none" | "uploading" | "uploaded" | "failed";
export type MasterAttachmentPreviewJobStatus = "queued" | "running" | "succeeded" | "failed" | "skipped" | "cancelled";
export type MasterAttachmentPreviewDerivativeStatus = "ready" | "stale" | "retired" | "failed";
export type MasterAttachmentPreviewDerivative = {
  id: string;
  derivativeKind: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  pageCount: number | null;
  sourceContentHash: string;
  generatorProfile: string;
  generatorVersion: string | null;
  status: MasterAttachmentPreviewDerivativeStatus;
  createdAt: string;
};
export type MasterAttachmentPreviewJob = {
  id: string;
  requestedKind: string;
  status: MasterAttachmentPreviewJobStatus;
  sourceContentHash: string;
  sourceExtension: string;
  generatorProfile: string;
  attemptCount: number;
  errorCode: string | null;
  errorSummary: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type MasterAttachmentRecord = {
  id: string;
  entityType: MasterAttachmentEntityType;
  entityId: string;
  entityCode: string;
  documentCategory: MasterAttachmentCategory;
  displayName: string;
  description: string;
  revision: string | null;
  fileName: string;
  fileExt: string;
  mimeType: string | null;
  fileSize: number;
  contentHash: string;
  hashAlgorithm: string;
  storageKey: string | null;
  gdriveFileId: string | null;
  gdriveStatus: MasterAttachmentDriveStatus;
  gdriveError: string | null;
  gdriveSyncedAt: string | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  sourceSubmissionId: string | null;
  sourceSubmissionStatus: string | null;
  sourceSubmissionRevision: string | null;
  sourceSubmissionCreatedAt: string | null;
  sourceSubmissionReleasedAt: string | null;
  revisionPackageId: string | null;
  revisionPackageStatus: string | null;
  revisionPackageRevision: string | null;
  revisionPackageSourceSubmissionId: string | null;
  revisionPackageFileKind: string | null;
  revisionPackageSupplementId: string | null;
  revisionPackageSupplementStatus: string | null;
  revisionPackageSupplementReasonCode: string | null;
  revisionPackageSupplementReviewedAt: string | null;
  previewDerivatives: MasterAttachmentPreviewDerivative[];
  previewJob: MasterAttachmentPreviewJob | null;
  createdAt: string;
  updatedAt: string;
};

type MasterAttachmentRow = {
  id: string;
  storage_provider: string;
  original_path: string | null;
  storage_key: string | null;
  file_name: string;
  file_ext: string;
  mime_type: string | null;
  file_size: number | null;
  content_hash: string | null;
  hash_algorithm: string;
  linked_entity_type: string;
  linked_entity_id: string;
  document_category: string;
  display_name: string;
  description: string;
  revision: string | null;
  uploaded_by: string | null;
  uploaded_by_name?: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_reason: string | null;
  gdrive_file_id: string | null;
  gdrive_status: string;
  gdrive_error: string | null;
  gdrive_synced_at: string | null;
  sync_status: string;
  source_submission_id?: string | null;
  source_submission_status?: string | null;
  source_submission_revision?: string | null;
  source_submission_created_at?: string | null;
  source_submission_released_at?: string | null;
  revision_package_id?: string | null;
  revision_package_status?: string | null;
  revision_package_revision?: string | null;
  revision_package_source_submission_id?: string | null;
  revision_package_file_kind?: string | null;
  revision_package_supplement_id?: string | null;
  revision_package_supplement_status?: string | null;
  revision_package_supplement_reason_code?: string | null;
  revision_package_supplement_reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
  entity_code?: string;
};

type EntityRef = {
  type: MasterAttachmentEntityType;
  id: string;
  code: string;
};

const drawingCategories = new Set<MasterAttachmentCategory>(["cad_3d", "intermediate", "drawing_2d", "dwg", "pdf", "other"]);
const partCategories = new Set<MasterAttachmentCategory>(["cad_3d", "intermediate", "catalog", "spec_sheet", "supplier_doc", "test_report", "other"]);
const allowedAttachmentExtensions = new Set([
  "sldprt",
  "sldasm",
  "slddrw",
  "step",
  "stp",
  "iges",
  "igs",
  "x_t",
  "dwg",
  "dxf",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "zip",
  "png",
  "jpg",
  "jpeg"
]);

export function listMasterAttachments(input: { entityType: MasterAttachmentEntityType; entityCode: string }) {
  const database = getDb();
  const entity = resolveEntity(database, input.entityType, input.entityCode);
  if (!entity) return null;
  const rows = database
    .prepare(
      `
      SELECT
        a.*,
        u.display_name AS uploaded_by_name,
        (
          SELECT s.id
          FROM submission_files sf
          JOIN submissions s ON s.id = sf.submission_id
          WHERE sf.source_master_attachment_id = a.id
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT 1
        ) AS source_submission_id,
        (
          SELECT s.status
          FROM submission_files sf
          JOIN submissions s ON s.id = sf.submission_id
          WHERE sf.source_master_attachment_id = a.id
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT 1
        ) AS source_submission_status,
        (
          SELECT s.revision
          FROM submission_files sf
          JOIN submissions s ON s.id = sf.submission_id
          WHERE sf.source_master_attachment_id = a.id
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT 1
        ) AS source_submission_revision,
        (
          SELECT s.created_at
          FROM submission_files sf
          JOIN submissions s ON s.id = sf.submission_id
          WHERE sf.source_master_attachment_id = a.id
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT 1
        ) AS source_submission_created_at,
        (
          SELECT s.released_at
          FROM submission_files sf
          JOIN submissions s ON s.id = sf.submission_id
          WHERE sf.source_master_attachment_id = a.id
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT 1
        ) AS source_submission_released_at
      FROM file_assets a
      LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE a.linked_entity_type = ?
        AND a.linked_entity_id = ?
        AND a.deleted_at IS NULL
      ORDER BY
        CASE a.document_category
          WHEN 'cad_3d' THEN 0
          WHEN 'intermediate' THEN 1
          WHEN 'drawing_2d' THEN 1
          WHEN 'dwg' THEN 2
          WHEN 'pdf' THEN 3
          WHEN 'catalog' THEN 0
          WHEN 'spec_sheet' THEN 1
          WHEN 'supplier_doc' THEN 2
          WHEN 'test_report' THEN 3
          ELSE 9
        END,
        datetime(a.created_at) DESC
    `
    )
    .all(entity.type, entity.id) as MasterAttachmentRow[];
  return { entity, attachments: rows.map((row) => mapMasterAttachment(row, entity.code)) };
}

export async function createMasterAttachment(input: {
  entityType: MasterAttachmentEntityType;
  entityCode: string;
  file: File;
  documentCategory: string;
  displayName?: string;
  description?: string;
  revision?: string | null;
  uploadedBy: string;
}) {
  const database = getDb();
  const entity = resolveEntity(database, input.entityType, input.entityCode);
  if (!entity) throw new Error("MASTER_ATTACHMENT_ENTITY_NOT_FOUND");

  const category = normalizeCategory(entity.type, input.documentCategory);
  const revision = normalizeAttachmentRevision(input.revision);
  const fileBuffer = Buffer.from(await input.file.arrayBuffer());
  validateAttachmentFile(input.file.name, fileBuffer.byteLength);
  const originalFilename = input.file.name.trim();
  const fileExt = getFileExtension(originalFilename);
  const now = new Date().toISOString();
  const duplicate = findActiveDuplicate(database, {
    entity,
    category,
    revision,
    filename: originalFilename
  });
  if (duplicate) throw new Error("MASTER_ATTACHMENT_DUPLICATE_ACTIVE_FILE");

  const saved = await saveMasterAttachmentFile({
    entity,
    originalFilename,
    bytes: fileBuffer
  });
  const id = crypto.randomUUID();
  const contentHash = sha256(fileBuffer);
  const driveFolderId = getMasterAttachmentsDriveFolderId();
  const initialDriveStatus: MasterAttachmentDriveStatus = driveFolderId && isGoogleDriveServiceConfigured() ? "uploading" : "none";

  database
    .prepare(
      `
      INSERT INTO file_assets (
        id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size,
        content_hash, hash_algorithm, linked_entity_type, linked_entity_id, document_category,
        display_name, description, revision, uploaded_by, gdrive_status, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      id,
      "j_drive",
      saved.localPath,
      saved.storageKey,
      originalFilename,
      fileExt,
      input.file.type || inferMimeType(originalFilename),
      fileBuffer.byteLength,
      contentHash,
      "SHA-256",
      entity.type,
      entity.id,
      category,
      normalizeDisplayName(input.displayName, originalFilename),
      normalizeNullableText(input.description) ?? "",
      revision,
      input.uploadedBy,
      initialDriveStatus,
      "local_only",
      now,
      now
    );

  createAuditLog({
    actorId: input.uploadedBy,
    action: "numbering.master_attachment.upload",
    detail: {
      attachmentId: id,
      entityType: entity.type,
      entityCode: entity.code,
      documentCategory: category,
      revision,
      fileName: originalFilename,
      sha256: contentHash,
      gdriveStatus: initialDriveStatus
    }
  });

  if (initialDriveStatus === "uploading") {
    await syncMasterAttachmentToDrive({ attachmentId: id, actorId: input.uploadedBy });
  }

  return getMasterAttachment({ entityType: entity.type, entityCode: entity.code, attachmentId: id });
}

export function getMasterAttachment(input: {
  entityType: MasterAttachmentEntityType;
  entityCode: string;
  attachmentId: string;
}) {
  const database = getDb();
  const entity = resolveEntity(database, input.entityType, input.entityCode);
  if (!entity) return null;
  const row = selectMasterAttachmentRow(database, entity, input.attachmentId);
  return row ? mapMasterAttachment(row, entity.code) : null;
}

export async function getMasterAttachmentBytes(input: {
  entityType: MasterAttachmentEntityType;
  entityCode: string;
  attachmentId: string;
}) {
  const database = getDb();
  const entity = resolveEntity(database, input.entityType, input.entityCode);
  if (!entity) return null;
  const row = selectMasterAttachmentRow(database, entity, input.attachmentId);
  if (!row?.original_path) return null;
  const storage = createFileStorageService();
  let storageKey: string;
  try {
    storageKey = row.storage_key || storageKeyFromLocalPath(row.original_path);
  } catch {
    throw new Error("MASTER_ATTACHMENT_PATH_OUTSIDE_REPOSITORY");
  }
  const bytes = await storage.readObject(storageKey);
  return { attachment: mapMasterAttachment(row, entity.code), bytes };
}

export function softDeleteMasterAttachment(input: {
  entityType: MasterAttachmentEntityType;
  entityCode: string;
  attachmentId: string;
  deletedBy: string;
  reason?: string | null;
}) {
  const database = getDb();
  const entity = resolveEntity(database, input.entityType, input.entityCode);
  if (!entity) throw new Error("MASTER_ATTACHMENT_ENTITY_NOT_FOUND");
  const row = selectMasterAttachmentRow(database, entity, input.attachmentId);
  if (!row) throw new Error("MASTER_ATTACHMENT_NOT_FOUND");
  const now = new Date().toISOString();
  database
    .prepare(
      `
      UPDATE file_assets
      SET deleted_at = ?, deleted_by = ?, deleted_reason = ?, updated_at = ?
      WHERE id = ?
    `
    )
    .run(now, input.deletedBy, normalizeNullableText(input.reason), now, input.attachmentId);
  createAuditLog({
    actorId: input.deletedBy,
    action: "numbering.master_attachment.delete",
    detail: {
      attachmentId: input.attachmentId,
      entityType: entity.type,
      entityCode: entity.code,
      fileName: row.file_name,
      reason: normalizeNullableText(input.reason)
    }
  });
}

export async function syncMasterAttachmentToDrive(input: { attachmentId: string; actorId?: string | null }) {
  const database = getDb();
  const row = database
    .prepare("SELECT * FROM file_assets WHERE id = ? AND linked_entity_type IN ('drawing_number', 'part_number') AND deleted_at IS NULL")
    .get(input.attachmentId) as MasterAttachmentRow | undefined;
  if (!row) throw new Error("MASTER_ATTACHMENT_NOT_FOUND");
  const entity = resolveEntityById(database, row.linked_entity_type as MasterAttachmentEntityType, row.linked_entity_id);
  if (!entity) throw new Error("MASTER_ATTACHMENT_ENTITY_NOT_FOUND");
  if (!row.original_path) throw new Error("MASTER_ATTACHMENT_LOCAL_PATH_MISSING");
  const driveFolderId = getMasterAttachmentsDriveFolderId();
  if (!driveFolderId) throw new Error("MASTER_ATTACHMENT_GDRIVE_FOLDER_NOT_CONFIGURED");

  const now = new Date().toISOString();
  database.prepare("UPDATE file_assets SET gdrive_status = 'uploading', gdrive_error = NULL, updated_at = ? WHERE id = ?").run(now, row.id);
  try {
    const fileId = await uploadFileToDrive({
      localPath: row.original_path,
      filename: row.file_name,
      targetFolderId: driveFolderId,
      mimeType: row.mime_type ?? inferMimeType(row.file_name)
    });
    await setFileAppProperties(fileId, {
      Source: "AI_PDM_MASTER_ATTACHMENT",
      AttachmentId: row.id,
      EntityType: entity.type,
      EntityCode: entity.code,
      Category: row.document_category,
      Revision: row.revision ?? "",
      Sha256: row.content_hash ?? ""
    });
    const syncedAt = new Date().toISOString();
    database
      .prepare(
        `
        UPDATE file_assets
        SET gdrive_status = 'uploaded', gdrive_file_id = ?, gdrive_error = NULL, gdrive_synced_at = ?, updated_at = ?
        WHERE id = ?
      `
      )
      .run(fileId, syncedAt, syncedAt, row.id);
    createAuditLog({
      actorId: input.actorId ?? null,
      action: "numbering.master_attachment.gdrive_sync",
      detail: { attachmentId: row.id, entityType: entity.type, entityCode: entity.code, gdriveFileId: fileId, status: "uploaded" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedAt = new Date().toISOString();
    database
      .prepare("UPDATE file_assets SET gdrive_status = 'failed', gdrive_error = ?, updated_at = ? WHERE id = ?")
      .run(message.slice(0, 1000), failedAt, row.id);
    createAuditLog({
      actorId: input.actorId ?? null,
      action: "numbering.master_attachment.gdrive_sync_failed",
      detail: { attachmentId: row.id, entityType: entity.type, entityCode: entity.code, error: message.slice(0, 1000) }
    });
  }

  return getMasterAttachment({ entityType: entity.type, entityCode: entity.code, attachmentId: row.id });
}

function resolveEntity(database: SqliteDatabase, entityType: MasterAttachmentEntityType, entityCode: string): EntityRef | null {
  const code = entityCode.trim();
  if (!code) return null;
  if (entityType === "drawing_number") {
    const row = database.prepare("SELECT id, drawing_number FROM drawing_numbers WHERE drawing_number = ?").get(code) as
      | { id: string; drawing_number: string }
      | undefined;
    return row ? { type: "drawing_number", id: row.id, code: row.drawing_number } : null;
  }
  const row = database.prepare("SELECT id, part_number FROM part_numbers WHERE part_number = ?").get(code) as
    | { id: string; part_number: string }
    | undefined;
  return row ? { type: "part_number", id: row.id, code: row.part_number } : null;
}

function resolveEntityById(database: SqliteDatabase, entityType: MasterAttachmentEntityType, entityId: string): EntityRef | null {
  if (entityType === "drawing_number") {
    const row = database.prepare("SELECT id, drawing_number FROM drawing_numbers WHERE id = ?").get(entityId) as
      | { id: string; drawing_number: string }
      | undefined;
    return row ? { type: "drawing_number", id: row.id, code: row.drawing_number } : null;
  }
  const row = database.prepare("SELECT id, part_number FROM part_numbers WHERE id = ?").get(entityId) as
    | { id: string; part_number: string }
    | undefined;
  return row ? { type: "part_number", id: row.id, code: row.part_number } : null;
}

function selectMasterAttachmentRow(database: SqliteDatabase, entity: EntityRef, attachmentId: string) {
  return database
    .prepare(
      `
      SELECT a.*, u.display_name AS uploaded_by_name
      FROM file_assets a
      LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE a.id = ?
        AND a.linked_entity_type = ?
        AND a.linked_entity_id = ?
        AND a.deleted_at IS NULL
      LIMIT 1
    `
    )
    .get(attachmentId, entity.type, entity.id) as MasterAttachmentRow | undefined;
}

function findActiveDuplicate(
  database: SqliteDatabase,
  input: { entity: EntityRef; category: MasterAttachmentCategory; revision: string | null; filename: string }
) {
  return database
    .prepare(
      `
      SELECT id
      FROM file_assets
      WHERE linked_entity_type = ?
        AND linked_entity_id = ?
        AND document_category = ?
        AND COALESCE(revision, '') = COALESCE(?, '')
        AND lower(file_name) = lower(?)
        AND deleted_at IS NULL
      LIMIT 1
    `
    )
    .get(input.entity.type, input.entity.id, input.category, input.revision, input.filename) as { id: string } | undefined;
}

function normalizeCategory(entityType: MasterAttachmentEntityType, value: string): MasterAttachmentCategory {
  const normalized = value.trim();
  const allowed = entityType === "drawing_number" ? drawingCategories : partCategories;
  if (allowed.has(normalized as MasterAttachmentCategory)) return normalized as MasterAttachmentCategory;
  throw new Error("MASTER_ATTACHMENT_CATEGORY_INVALID");
}

function validateAttachmentFile(filename: string, fileSize: number) {
  const ext = getFileExtension(filename);
  if (!ext || !allowedAttachmentExtensions.has(ext)) throw new Error("MASTER_ATTACHMENT_EXTENSION_NOT_ALLOWED");
  if (fileSize <= 0) throw new Error("MASTER_ATTACHMENT_FILE_EMPTY");
  if (fileSize > getMaxAttachmentBytes()) throw new Error("MASTER_ATTACHMENT_FILE_TOO_LARGE");
}

async function saveMasterAttachmentFile(input: { entity: EntityRef; originalFilename: string; bytes: Buffer }) {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const safeName = sanitizeFilename(input.originalFilename);
  const entityDir = input.entity.type === "drawing_number" ? "drawing-number" : "part-number";
  const storedName = `${crypto.randomUUID()}-${safeName}`;
  const stored = await createFileStorageService().putObject({
    key: buildStorageKey(["master-attachments", entityDir, sanitizeFilename(input.entity.code), yyyy, mm, storedName]),
    bytes: input.bytes
  });
  return {
    localPath: stored.localPath,
    storageKey: stored.key
  };
}

function mapMasterAttachment(row: MasterAttachmentRow, entityCode: string): MasterAttachmentRecord {
  return {
    id: row.id,
    entityType: row.linked_entity_type as MasterAttachmentEntityType,
    entityId: row.linked_entity_id,
    entityCode,
    documentCategory: row.document_category as MasterAttachmentCategory,
    displayName: row.display_name || row.file_name,
    description: row.description ?? "",
    revision: row.revision,
    fileName: row.file_name,
    fileExt: row.file_ext,
    mimeType: row.mime_type,
    fileSize: row.file_size ?? 0,
    contentHash: row.content_hash ?? "",
    hashAlgorithm: row.hash_algorithm,
    storageKey: row.storage_key,
    gdriveFileId: row.gdrive_file_id,
    gdriveStatus: normalizeDriveStatus(row.gdrive_status),
    gdriveError: row.gdrive_error,
    gdriveSyncedAt: row.gdrive_synced_at,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name ?? null,
    sourceSubmissionId: row.source_submission_id ?? null,
    sourceSubmissionStatus: row.source_submission_status ?? null,
    sourceSubmissionRevision: row.source_submission_revision ?? null,
    sourceSubmissionCreatedAt: row.source_submission_created_at ?? null,
    sourceSubmissionReleasedAt: row.source_submission_released_at ?? null,
    revisionPackageId: row.revision_package_id ?? null,
    revisionPackageStatus: row.revision_package_status ?? null,
    revisionPackageRevision: row.revision_package_revision ?? null,
    revisionPackageSourceSubmissionId: row.revision_package_source_submission_id ?? null,
    revisionPackageFileKind: row.revision_package_file_kind ?? null,
    revisionPackageSupplementId: row.revision_package_supplement_id ?? null,
    revisionPackageSupplementStatus: row.revision_package_supplement_status ?? null,
    revisionPackageSupplementReasonCode: row.revision_package_supplement_reason_code ?? null,
    revisionPackageSupplementReviewedAt: row.revision_package_supplement_reviewed_at ?? null,
    previewDerivatives: [],
    previewJob: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeDriveStatus(value: string): MasterAttachmentDriveStatus {
  return value === "uploading" || value === "uploaded" || value === "failed" ? value : "none";
}

function getMasterAttachmentsDriveFolderId() {
  return (
    getSystemSetting("gdrive_master_attachments_folder_id") ||
    process.env.GOOGLE_DRIVE_MASTER_ATTACHMENTS_FOLDER_ID?.trim() ||
    ""
  );
}

function normalizeDisplayName(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function normalizeNullableText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function normalizeAttachmentRevision(value: string | null | undefined) {
  const text = normalizeNullableText(value);
  if (!text) return null;
  const error = validateRevisionCode(text, { required: false });
  if (error) throw new Error(`MASTER_ATTACHMENT_REVISION_INVALID: ${revisionValidationMessage(error)}`);
  return normalizeRevisionCode(text);
}

function getFileExtension(filename: string) {
  const normalized = filename.trim().toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index > 0 && index < normalized.length - 1 ? normalized.slice(index + 1) : "";
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "uploaded-file";
}

function inferMimeType(filename: string) {
  const ext = getFileExtension(filename);
  if (ext === "pdf") return "application/pdf";
  if (ext === "dwg") return "application/acad";
  if (ext === "dxf") return "image/vnd.dxf";
  if (ext === "csv") return "text/csv";
  if (ext === "txt") return "text/plain";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "zip") return "application/zip";
  return "application/octet-stream";
}

function getMaxAttachmentBytes() {
  return getMasterAttachmentUploadPolicy().maxUploadFileBytes;
}
