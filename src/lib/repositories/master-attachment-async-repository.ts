import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";
import {
  buildStorageKey,
  createFileStorageService,
  createFileStorageServiceForPointer,
  sha256,
  storagePointerFromRecord
} from "@/lib/file-storage";
import { isGoogleDriveServiceConfigured, setFileAppProperties, uploadFileToDrive } from "@/lib/gdrive";
import { buildMasterAttachmentLifecyclePolicy, type LifecycleActionPolicy } from "@/lib/pdm-lifecycle-policy";
import { normalizeRevisionCode, revisionValidationMessage, validateRevisionCode } from "@/lib/revision-policy";
import { getMasterAttachmentUploadPolicy } from "@/lib/storage-upload-policy";
import type {
  MasterAttachmentCategory,
  MasterAttachmentDriveStatus,
  MasterAttachmentEntityType,
  MasterAttachmentRecord
} from "@/lib/repositories/master-attachment-repository";
import { assertPdmEntityWriteAllowedAsync } from "@/lib/pdm-review-lock";

type MasterAttachmentRow = {
  id: string;
  storage_provider: string;
  original_path: string | null;
  storage_key: string | null;
  file_name: string;
  file_ext: string;
  mime_type: string | null;
  file_size: number | string | null;
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
  revision_package_effective_status?: string | null;
  revision_package_revision?: string | null;
  revision_package_source_submission_id?: string | null;
  revision_package_file_kind?: string | null;
  revision_package_supplement_id?: string | null;
  revision_package_supplement_status?: string | null;
  revision_package_supplement_reason_code?: string | null;
  revision_package_supplement_reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
};

type EntityRef = {
  type: MasterAttachmentEntityType;
  id: string;
  code: string;
};

export const SELECT_ASYNC_PART_ATTACHMENT_ENTITY_SQL = `
  SELECT id, part_number
  FROM part_numbers
  WHERE part_number = :code
`;

export const SELECT_ASYNC_DRAWING_ATTACHMENT_ENTITY_SQL = `
  SELECT id, drawing_number
  FROM drawing_numbers
  WHERE drawing_number = :code
`;

export const SELECT_ASYNC_PART_ATTACHMENT_ENTITY_BY_ID_SQL = `
  SELECT id, part_number
  FROM part_numbers
  WHERE id = :id
`;

export const SELECT_ASYNC_DRAWING_ATTACHMENT_ENTITY_BY_ID_SQL = `
  SELECT id, drawing_number
  FROM drawing_numbers
  WHERE id = :id
`;

export const SELECT_ASYNC_MASTER_ATTACHMENTS_SQL = `
  WITH package_links AS (
    SELECT
      pf.source_file_asset_id AS attachment_id,
      p.id AS package_id,
      p.status AS package_status,
      CASE WHEN EXISTS (
        SELECT 1
        FROM drawing_revision_package_review_approvals companion
        JOIN numbering_candidate_revision_drafts candidate ON candidate.id = companion.candidate_revision_id
        WHERE companion.package_id = p.id
          AND candidate.formal_revision_package_id = p.id
          AND candidate.lifecycle_status = 'promoted'
          AND candidate.review_snapshot_hash = companion.snapshot_hash
      ) OR (
        p.status = 'Pending'
        AND p.revision LIKE '%.%'
        AND EXISTS (
          SELECT 1
          FROM drawing_revision_fff_assessments fff
          JOIN review_confirmation_events rce
            ON rce.review_id = fff.id
           AND rce.company_id = fff.company_id
          WHERE fff.company_id = p.company_id
            AND fff.submission_id = p.source_submission_id
            AND rce.action IN (
              'confirm_bom_no_revision',
              'confirm_original_part_reuse',
              'approve_replacement_part_and_drawing_release'
            )
        )
      ) THEN 'ReviewApproved' ELSE p.status END AS package_effective_status,
      p.revision AS package_revision,
      p.source_submission_id AS package_source_submission_id,
      p.released_at AS package_released_at,
      p.created_at AS package_created_at,
      'core' AS file_kind,
      NULL AS supplement_id,
      NULL AS supplement_status,
      NULL AS supplement_reason_code,
      NULL AS supplement_reviewed_at
    FROM drawing_revision_package_files pf
    JOIN drawing_revision_packages p ON p.id = pf.package_id
    UNION ALL
    SELECT
      psf.source_file_asset_id AS attachment_id,
      p.id AS package_id,
      p.status AS package_status,
      CASE WHEN EXISTS (
        SELECT 1
        FROM drawing_revision_package_review_approvals companion
        JOIN numbering_candidate_revision_drafts candidate ON candidate.id = companion.candidate_revision_id
        WHERE companion.package_id = p.id
          AND candidate.formal_revision_package_id = p.id
          AND candidate.lifecycle_status = 'promoted'
          AND candidate.review_snapshot_hash = companion.snapshot_hash
      ) OR (
        p.status = 'Pending'
        AND p.revision LIKE '%.%'
        AND EXISTS (
          SELECT 1
          FROM drawing_revision_fff_assessments fff
          JOIN review_confirmation_events rce
            ON rce.review_id = fff.id
           AND rce.company_id = fff.company_id
          WHERE fff.company_id = p.company_id
            AND fff.submission_id = p.source_submission_id
            AND rce.action IN (
              'confirm_bom_no_revision',
              'confirm_original_part_reuse',
              'approve_replacement_part_and_drawing_release'
            )
        )
      ) THEN 'ReviewApproved' ELSE p.status END AS package_effective_status,
      p.revision AS package_revision,
      p.source_submission_id AS package_source_submission_id,
      p.released_at AS package_released_at,
      p.created_at AS package_created_at,
      'supplement' AS file_kind,
      s.id AS supplement_id,
      s.status AS supplement_status,
      s.reason_code AS supplement_reason_code,
      s.reviewed_at AS supplement_reviewed_at
    FROM drawing_revision_package_supplement_files psf
    JOIN drawing_revision_package_supplements s ON s.id = psf.supplement_id
    JOIN drawing_revision_packages p ON p.id = s.package_id
  ),
  ranked_package_links AS (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY attachment_id
        ORDER BY
          CASE
            WHEN file_kind = 'core' AND package_effective_status IN ('Released', 'ReviewApproved') THEN 0
            WHEN file_kind = 'supplement' AND supplement_status = 'Approved' THEN 1
            WHEN package_status = 'Released' THEN 2
            ELSE 9
          END,
          COALESCE(supplement_reviewed_at, package_released_at, package_created_at) DESC,
          package_id DESC
      ) AS link_rank
    FROM package_links
  )
  SELECT
    a.*,
    u.display_name AS uploaded_by_name,
    pl.package_id AS revision_package_id,
    pl.package_status AS revision_package_status,
    pl.package_effective_status AS revision_package_effective_status,
    pl.package_revision AS revision_package_revision,
    pl.package_source_submission_id AS revision_package_source_submission_id,
    pl.file_kind AS revision_package_file_kind,
    pl.supplement_id AS revision_package_supplement_id,
    pl.supplement_status AS revision_package_supplement_status,
    pl.supplement_reason_code AS revision_package_supplement_reason_code,
    pl.supplement_reviewed_at AS revision_package_supplement_reviewed_at,
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
  LEFT JOIN ranked_package_links pl ON pl.attachment_id = a.id AND pl.link_rank = 1
  WHERE a.linked_entity_type = :entityType
    AND a.linked_entity_id = :entityId
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
    a.created_at DESC
`;

export const SELECT_ASYNC_MASTER_ATTACHMENT_SQL = `
  WITH package_links AS (
    SELECT
      pf.source_file_asset_id AS attachment_id,
      p.id AS package_id,
      p.status AS package_status,
      CASE WHEN EXISTS (
        SELECT 1
        FROM drawing_revision_package_review_approvals companion
        JOIN numbering_candidate_revision_drafts candidate ON candidate.id = companion.candidate_revision_id
        WHERE companion.package_id = p.id
          AND candidate.formal_revision_package_id = p.id
          AND candidate.lifecycle_status = 'promoted'
          AND candidate.review_snapshot_hash = companion.snapshot_hash
      ) OR (
        p.status = 'Pending'
        AND p.revision LIKE '%.%'
        AND EXISTS (
          SELECT 1
          FROM drawing_revision_fff_assessments fff
          JOIN review_confirmation_events rce
            ON rce.review_id = fff.id
           AND rce.company_id = fff.company_id
          WHERE fff.company_id = p.company_id
            AND fff.submission_id = p.source_submission_id
            AND rce.action IN (
              'confirm_bom_no_revision',
              'confirm_original_part_reuse',
              'approve_replacement_part_and_drawing_release'
            )
        )
      ) THEN 'ReviewApproved' ELSE p.status END AS package_effective_status,
      p.revision AS package_revision,
      p.source_submission_id AS package_source_submission_id,
      p.released_at AS package_released_at,
      p.created_at AS package_created_at,
      'core' AS file_kind,
      NULL AS supplement_id,
      NULL AS supplement_status,
      NULL AS supplement_reason_code,
      NULL AS supplement_reviewed_at
    FROM drawing_revision_package_files pf
    JOIN drawing_revision_packages p ON p.id = pf.package_id
    UNION ALL
    SELECT
      psf.source_file_asset_id AS attachment_id,
      p.id AS package_id,
      p.status AS package_status,
      CASE WHEN EXISTS (
        SELECT 1
        FROM drawing_revision_package_review_approvals companion
        JOIN numbering_candidate_revision_drafts candidate ON candidate.id = companion.candidate_revision_id
        WHERE companion.package_id = p.id
          AND candidate.formal_revision_package_id = p.id
          AND candidate.lifecycle_status = 'promoted'
          AND candidate.review_snapshot_hash = companion.snapshot_hash
      ) OR (
        p.status = 'Pending'
        AND p.revision LIKE '%.%'
        AND EXISTS (
          SELECT 1
          FROM drawing_revision_fff_assessments fff
          JOIN review_confirmation_events rce
            ON rce.review_id = fff.id
           AND rce.company_id = fff.company_id
          WHERE fff.company_id = p.company_id
            AND fff.submission_id = p.source_submission_id
            AND rce.action IN (
              'confirm_bom_no_revision',
              'confirm_original_part_reuse',
              'approve_replacement_part_and_drawing_release'
            )
        )
      ) THEN 'ReviewApproved' ELSE p.status END AS package_effective_status,
      p.revision AS package_revision,
      p.source_submission_id AS package_source_submission_id,
      p.released_at AS package_released_at,
      p.created_at AS package_created_at,
      'supplement' AS file_kind,
      s.id AS supplement_id,
      s.status AS supplement_status,
      s.reason_code AS supplement_reason_code,
      s.reviewed_at AS supplement_reviewed_at
    FROM drawing_revision_package_supplement_files psf
    JOIN drawing_revision_package_supplements s ON s.id = psf.supplement_id
    JOIN drawing_revision_packages p ON p.id = s.package_id
  ),
  ranked_package_links AS (
    SELECT
      *,
      ROW_NUMBER() OVER (
        PARTITION BY attachment_id
        ORDER BY
          CASE
            WHEN file_kind = 'core' AND package_effective_status IN ('Released', 'ReviewApproved') THEN 0
            WHEN file_kind = 'supplement' AND supplement_status = 'Approved' THEN 1
            WHEN package_status = 'Released' THEN 2
            ELSE 9
          END,
          COALESCE(supplement_reviewed_at, package_released_at, package_created_at) DESC,
          package_id DESC
      ) AS link_rank
    FROM package_links
  )
  SELECT
    a.*,
    u.display_name AS uploaded_by_name,
    pl.package_id AS revision_package_id,
    pl.package_status AS revision_package_status,
    pl.package_effective_status AS revision_package_effective_status,
    pl.package_revision AS revision_package_revision,
    pl.package_source_submission_id AS revision_package_source_submission_id,
    pl.file_kind AS revision_package_file_kind,
    pl.supplement_id AS revision_package_supplement_id,
    pl.supplement_status AS revision_package_supplement_status,
    pl.supplement_reason_code AS revision_package_supplement_reason_code,
    pl.supplement_reviewed_at AS revision_package_supplement_reviewed_at,
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
  LEFT JOIN ranked_package_links pl ON pl.attachment_id = a.id AND pl.link_rank = 1
  WHERE a.id = :attachmentId
    AND a.linked_entity_type = :entityType
    AND a.linked_entity_id = :entityId
    AND a.deleted_at IS NULL
  LIMIT 1
`;

export const SELECT_ASYNC_DELETED_MASTER_ATTACHMENTS_SQL = `
  SELECT a.*, u.display_name AS uploaded_by_name
  FROM file_assets a
  LEFT JOIN users u ON u.id = a.uploaded_by
  WHERE a.linked_entity_type = :entityType
    AND a.linked_entity_id = :entityId
    AND a.deleted_at IS NOT NULL
  ORDER BY a.deleted_at DESC, a.created_at DESC
`;

export const SELECT_ASYNC_MASTER_ATTACHMENT_ANY_SQL = `
  SELECT a.*, u.display_name AS uploaded_by_name
  FROM file_assets a
  LEFT JOIN users u ON u.id = a.uploaded_by
  WHERE a.id = :attachmentId
    AND a.linked_entity_type = :entityType
    AND a.linked_entity_id = :entityId
  LIMIT 1
`;

export const SELECT_ASYNC_MASTER_ATTACHMENT_BY_ID_SQL = `
  SELECT *
  FROM file_assets
  WHERE id = :attachmentId
    AND linked_entity_type IN ('drawing_number', 'part_number')
    AND deleted_at IS NULL
  LIMIT 1
`;

export const SELECT_ASYNC_MASTER_ATTACHMENT_DUPLICATE_SQL = `
  SELECT id
  FROM file_assets
  WHERE linked_entity_type = :entityType
    AND linked_entity_id = :entityId
    AND document_category = :category
    AND COALESCE(revision, '') = COALESCE(:revision, '')
    AND lower(file_name) = lower(:filename)
    AND deleted_at IS NULL
  LIMIT 1
`;

export const INSERT_ASYNC_MASTER_ATTACHMENT_SQL = `
  INSERT INTO file_assets (
    id, storage_provider, original_path, storage_key, file_name, file_ext, mime_type, file_size,
    content_hash, hash_algorithm, linked_entity_type, linked_entity_id, document_category,
    display_name, description, revision, uploaded_by, gdrive_status, sync_status, created_at, updated_at
  ) VALUES (
    :id, :storageProvider, :originalPath, :storageKey, :fileName, :fileExt, :mimeType, :fileSize,
    :contentHash, :hashAlgorithm, :entityType, :entityId, :documentCategory,
    :displayName, :description, :revision, :uploadedBy, :gdriveStatus, :syncStatus, :createdAt, :updatedAt
  )
`;

export const UPDATE_ASYNC_MASTER_ATTACHMENT_DELETE_SQL = `
  UPDATE file_assets
  SET deleted_at = :deletedAt,
      deleted_by = :deletedBy,
      deleted_reason = :deletedReason,
      updated_at = :updatedAt
  WHERE id = :attachmentId
`;

export const UPDATE_ASYNC_MASTER_ATTACHMENT_RESTORE_SQL = `
  UPDATE file_assets
  SET deleted_at = NULL,
      deleted_by = NULL,
      deleted_reason = NULL,
      updated_at = :updatedAt
  WHERE id = :attachmentId
    AND linked_entity_type = :entityType
    AND linked_entity_id = :entityId
    AND deleted_at IS NOT NULL
`;

export const UPDATE_ASYNC_MASTER_ATTACHMENT_GDRIVE_UPLOADING_SQL = `
  UPDATE file_assets
  SET gdrive_status = 'uploading',
      gdrive_error = NULL,
      updated_at = :updatedAt
  WHERE id = :attachmentId
`;

export const UPDATE_ASYNC_MASTER_ATTACHMENT_GDRIVE_UPLOADED_SQL = `
  UPDATE file_assets
  SET gdrive_status = 'uploaded',
      gdrive_file_id = :gdriveFileId,
      gdrive_error = NULL,
      gdrive_synced_at = :syncedAt,
      updated_at = :updatedAt
  WHERE id = :attachmentId
`;

export const UPDATE_ASYNC_MASTER_ATTACHMENT_GDRIVE_FAILED_SQL = `
  UPDATE file_assets
  SET gdrive_status = 'failed',
      gdrive_error = :gdriveError,
      updated_at = :updatedAt
  WHERE id = :attachmentId
`;

export const SELECT_ASYNC_MASTER_ATTACHMENT_GDRIVE_FOLDER_SQL = `
  SELECT value
  FROM system_settings
  WHERE key = 'gdrive_master_attachments_folder_id'
`;

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
  "igf",
  "x_t",
  "x_b",
  "sat",
  "stl",
  "jt",
  "dwg",
  "dxf",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "html",
  "htm",
  "zip",
  "png",
  "jpg",
  "jpeg"
]);

export class AsyncMasterAttachmentRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async listMasterAttachments(input: { entityType: MasterAttachmentEntityType; entityCode: string }) {
    const entity = await this.resolveEntity(input.entityType, input.entityCode);
    if (!entity) return null;
    const rows = await this.client.query<MasterAttachmentRow>(SELECT_ASYNC_MASTER_ATTACHMENTS_SQL, {
      entityType: entity.type,
      entityId: entity.id
    });
    return { entity, attachments: rows.map((row) => mapMasterAttachment(row, entity.code)) };
  }

  async listDeletedMasterAttachments(input: { entityType: MasterAttachmentEntityType; entityCode: string }) {
    const entity = await this.resolveEntity(input.entityType, input.entityCode);
    if (!entity) return null;
    const rows = await this.client.query<MasterAttachmentRow>(SELECT_ASYNC_DELETED_MASTER_ATTACHMENTS_SQL, {
      entityType: entity.type,
      entityId: entity.id
    });
    const attachments = await Promise.all(
      rows.map(async (row) => ({
        attachment: mapMasterAttachment(row, entity.code),
        policy: await this.buildPolicyForRow(entity, row)
      }))
    );
    return { entity, attachments };
  }

  async createMasterAttachment(input: {
    entityType: MasterAttachmentEntityType;
    entityCode: string;
    file: File;
    documentCategory: string;
    displayName?: string;
    description?: string;
    revision?: string | null;
    uploadedBy: string;
  }) {
    const entity = await this.resolveEntity(input.entityType, input.entityCode);
    if (!entity) throw new Error("MASTER_ATTACHMENT_ENTITY_NOT_FOUND");
    const companyId = (await this.client.queryOne<{ company_id: string }>(
        input.entityType === "drawing_number"
          ? "SELECT company_id FROM drawing_numbers WHERE id = :id"
          : "SELECT company_id FROM part_numbers WHERE id = :id",
        { id: entity.id }
      ))?.company_id;
    if (!companyId) throw new Error("MASTER_ATTACHMENT_ENTITY_NOT_FOUND");
    await assertPdmEntityWriteAllowedAsync(this.client, {
      companyId,
      targetIds: [entity.id],
      targetRefs: [{ type: input.entityType, id: entity.id }]
    });

    const category = normalizeCategory(entity.type, input.documentCategory);
    const revision = normalizeAttachmentRevision(input.revision);
    const fileBuffer = Buffer.from(await input.file.arrayBuffer());
    validateAttachmentFile(input.file.name, fileBuffer.byteLength);
    const originalFilename = input.file.name.trim();
    const fileExt = getFileExtension(originalFilename);
    const now = this.clock();
    const duplicate = await this.findActiveDuplicate({
      entity,
      category,
      revision,
      filename: originalFilename
    });
    if (duplicate) throw new Error("MASTER_ATTACHMENT_DUPLICATE_ACTIVE_FILE");

    const saved = await saveMasterAttachmentFile({ entity, originalFilename, bytes: fileBuffer });
    const id = this.idFactory();
    const contentHash = sha256(fileBuffer);
    const driveFolderId = await this.getMasterAttachmentsDriveFolderId();
    const initialDriveStatus: MasterAttachmentDriveStatus = driveFolderId && isGoogleDriveServiceConfigured() ? "uploading" : "none";

    await this.client.execute(INSERT_ASYNC_MASTER_ATTACHMENT_SQL, {
      id,
      storageProvider: storageProviderForFileAsset(saved.storageProvider),
      originalPath: saved.localPath,
      storageKey: saved.storageKey,
      fileName: originalFilename,
      fileExt,
      mimeType: input.file.type || inferMimeType(originalFilename),
      fileSize: fileBuffer.byteLength,
      contentHash,
      hashAlgorithm: "SHA-256",
      entityType: entity.type,
      entityId: entity.id,
      documentCategory: category,
      displayName: normalizeDisplayName(input.displayName, originalFilename),
      description: normalizeNullableText(input.description) ?? "",
      revision,
      uploadedBy: input.uploadedBy,
      gdriveStatus: initialDriveStatus,
      syncStatus: "local_only",
      createdAt: now,
      updatedAt: now
    });

    await this.createAuditLog(input.uploadedBy, "numbering.master_attachment.upload", {
      attachmentId: id,
      entityType: entity.type,
      entityCode: entity.code,
      documentCategory: category,
      revision,
      fileName: originalFilename,
      sha256: contentHash,
      gdriveStatus: initialDriveStatus
    });

    if (initialDriveStatus === "uploading") {
      await this.syncMasterAttachmentToDrive({ attachmentId: id, actorId: input.uploadedBy });
    }

    return this.getMasterAttachment({ entityType: entity.type, entityCode: entity.code, attachmentId: id });
  }

  async getMasterAttachment(input: { entityType: MasterAttachmentEntityType; entityCode: string; attachmentId: string }) {
    const entity = await this.resolveEntity(input.entityType, input.entityCode);
    if (!entity) return null;
    const row = await this.selectMasterAttachmentRow(entity, input.attachmentId);
    return row ? mapMasterAttachment(row, entity.code) : null;
  }

  async getMasterAttachmentLifecyclePolicy(input: {
    entityType: MasterAttachmentEntityType;
    entityCode: string;
    attachmentId: string;
  }): Promise<LifecycleActionPolicy | null> {
    const entity = await this.resolveEntity(input.entityType, input.entityCode);
    if (!entity) return null;
    const row = await this.selectMasterAttachmentAnyRow(entity, input.attachmentId);
    return row ? this.buildPolicyForRow(entity, row) : null;
  }

  async getMasterAttachmentBytes(input: { entityType: MasterAttachmentEntityType; entityCode: string; attachmentId: string }) {
    const entity = await this.resolveEntity(input.entityType, input.entityCode);
    if (!entity) return null;
    const row = await this.selectMasterAttachmentRow(entity, input.attachmentId);
    if (!row?.original_path) return null;
    let storagePointer;
    try {
      storagePointer = storagePointerFromRecord(row);
    } catch {
      throw new Error("MASTER_ATTACHMENT_PATH_OUTSIDE_REPOSITORY");
    }
    const bytes = await createFileStorageServiceForPointer(storagePointer).readObject(storagePointer.key);
    return { attachment: mapMasterAttachment(row, entity.code), bytes };
  }

  async softDeleteMasterAttachment(input: {
    entityType: MasterAttachmentEntityType;
    entityCode: string;
    attachmentId: string;
    deletedBy: string;
    reason?: string | null;
  }) {
    const entity = await this.resolveEntity(input.entityType, input.entityCode);
    if (!entity) throw new Error("MASTER_ATTACHMENT_ENTITY_NOT_FOUND");
    const companyId = (await this.client.queryOne<{ company_id: string }>(
      input.entityType === "drawing_number"
        ? "SELECT company_id FROM drawing_numbers WHERE id = :id"
        : "SELECT company_id FROM part_numbers WHERE id = :id",
      { id: entity.id }
    ))?.company_id;
    if (!companyId) throw new Error("MASTER_ATTACHMENT_ENTITY_NOT_FOUND");
    await assertPdmEntityWriteAllowedAsync(this.client, {
      companyId,
      targetIds: [entity.id, input.attachmentId],
      targetRefs: [{ type: input.entityType, id: entity.id }, { type: "attachment", id: input.attachmentId }]
    });
    const row = await this.selectMasterAttachmentRow(entity, input.attachmentId);
    if (!row) throw new Error("MASTER_ATTACHMENT_NOT_FOUND");
    const now = this.clock();
    await this.client.execute(UPDATE_ASYNC_MASTER_ATTACHMENT_DELETE_SQL, {
      deletedAt: now,
      deletedBy: input.deletedBy,
      deletedReason: normalizeNullableText(input.reason),
      updatedAt: now,
      attachmentId: input.attachmentId
    });
    await this.createAuditLog(input.deletedBy, "numbering.master_attachment.delete", {
      attachmentId: input.attachmentId,
      entityType: entity.type,
      entityCode: entity.code,
      fileName: row.file_name,
      reason: normalizeNullableText(input.reason)
    });
  }

  async restoreMasterAttachment(input: {
    entityType: MasterAttachmentEntityType;
    entityCode: string;
    attachmentId: string;
    restoredBy: string;
    reason?: string | null;
  }) {
    const entity = await this.resolveEntity(input.entityType, input.entityCode);
    if (!entity) throw new Error("LIFE_ATTACHMENT_PARENT_INVALID");
    const companyId = (await this.client.queryOne<{ company_id: string }>(
      input.entityType === "drawing_number"
        ? "SELECT company_id FROM drawing_numbers WHERE id = :id"
        : "SELECT company_id FROM part_numbers WHERE id = :id",
      { id: entity.id }
    ))?.company_id;
    if (!companyId) throw new Error("LIFE_ATTACHMENT_PARENT_INVALID");
    await assertPdmEntityWriteAllowedAsync(this.client, {
      companyId,
      targetIds: [entity.id, input.attachmentId],
      targetRefs: [{ type: input.entityType, id: entity.id }, { type: "attachment", id: input.attachmentId }]
    });

    const row = await this.selectMasterAttachmentAnyRow(entity, input.attachmentId);
    if (!row) throw new Error("LIFE_ATTACHMENT_NOT_FOUND");
    if (!row.deleted_at) throw new Error("LIFE_ATTACHMENT_NOT_DELETED");

    const duplicate = await this.findActiveDuplicate({
      entity,
      category: row.document_category as MasterAttachmentCategory,
      revision: row.revision,
      filename: row.file_name
    });
    if (duplicate) throw new Error("LIFE_ATTACHMENT_DUPLICATE_ACTIVE");

    const now = this.clock();
    await this.client.execute(UPDATE_ASYNC_MASTER_ATTACHMENT_RESTORE_SQL, {
      updatedAt: now,
      attachmentId: input.attachmentId,
      entityType: entity.type,
      entityId: entity.id
    });
    await this.createAuditLog(input.restoredBy, "numbering.master_attachment.restore", {
      attachmentId: input.attachmentId,
      entityType: entity.type,
      entityCode: entity.code,
      fileName: row.file_name,
      reason: normalizeNullableText(input.reason),
      conflictCheckResult: {
        parentValid: true,
        activeDuplicate: false
      }
    });

    return this.getMasterAttachment({ entityType: entity.type, entityCode: entity.code, attachmentId: input.attachmentId });
  }

  async syncMasterAttachmentToDrive(input: { attachmentId: string; actorId?: string | null }) {
    const row = await this.client.queryOne<MasterAttachmentRow>(SELECT_ASYNC_MASTER_ATTACHMENT_BY_ID_SQL, {
      attachmentId: input.attachmentId
    });
    if (!row) throw new Error("MASTER_ATTACHMENT_NOT_FOUND");
    const entity = await this.resolveEntityById(row.linked_entity_type as MasterAttachmentEntityType, row.linked_entity_id);
    if (!entity) throw new Error("MASTER_ATTACHMENT_ENTITY_NOT_FOUND");
    if (!row.original_path) throw new Error("MASTER_ATTACHMENT_LOCAL_PATH_MISSING");
    const driveFolderId = await this.getMasterAttachmentsDriveFolderId();
    if (!driveFolderId) throw new Error("MASTER_ATTACHMENT_GDRIVE_FOLDER_NOT_CONFIGURED");

    const now = this.clock();
    await this.client.execute(UPDATE_ASYNC_MASTER_ATTACHMENT_GDRIVE_UPLOADING_SQL, { updatedAt: now, attachmentId: row.id });
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
      const syncedAt = this.clock();
      await this.client.execute(UPDATE_ASYNC_MASTER_ATTACHMENT_GDRIVE_UPLOADED_SQL, {
        gdriveFileId: fileId,
        syncedAt,
        updatedAt: syncedAt,
        attachmentId: row.id
      });
      await this.createAuditLog(input.actorId ?? null, "numbering.master_attachment.gdrive_sync", {
        attachmentId: row.id,
        entityType: entity.type,
        entityCode: entity.code,
        gdriveFileId: fileId,
        status: "uploaded"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedAt = this.clock();
      await this.client.execute(UPDATE_ASYNC_MASTER_ATTACHMENT_GDRIVE_FAILED_SQL, {
        gdriveError: message.slice(0, 1000),
        updatedAt: failedAt,
        attachmentId: row.id
      });
      await this.createAuditLog(input.actorId ?? null, "numbering.master_attachment.gdrive_sync_failed", {
        attachmentId: row.id,
        entityType: entity.type,
        entityCode: entity.code,
        error: message.slice(0, 1000)
      });
    }

    return this.getMasterAttachment({ entityType: entity.type, entityCode: entity.code, attachmentId: row.id });
  }

  private async resolveEntity(entityType: MasterAttachmentEntityType, entityCode: string): Promise<EntityRef | null> {
    const code = entityCode.trim();
    if (!code) return null;
    if (entityType === "drawing_number") {
      const row = await this.client.queryOne<{ id: string; drawing_number: string }>(SELECT_ASYNC_DRAWING_ATTACHMENT_ENTITY_SQL, { code });
      return row ? { type: "drawing_number", id: row.id, code: row.drawing_number } : null;
    }
    const row = await this.client.queryOne<{ id: string; part_number: string }>(SELECT_ASYNC_PART_ATTACHMENT_ENTITY_SQL, { code });
    return row ? { type: "part_number", id: row.id, code: row.part_number } : null;
  }

  private async resolveEntityById(entityType: MasterAttachmentEntityType, entityId: string): Promise<EntityRef | null> {
    if (entityType === "drawing_number") {
      const row = await this.client.queryOne<{ id: string; drawing_number: string }>(SELECT_ASYNC_DRAWING_ATTACHMENT_ENTITY_BY_ID_SQL, {
        id: entityId
      });
      return row ? { type: "drawing_number", id: row.id, code: row.drawing_number } : null;
    }
    const row = await this.client.queryOne<{ id: string; part_number: string }>(SELECT_ASYNC_PART_ATTACHMENT_ENTITY_BY_ID_SQL, { id: entityId });
    return row ? { type: "part_number", id: row.id, code: row.part_number } : null;
  }

  private async selectMasterAttachmentRow(entity: EntityRef, attachmentId: string) {
    return this.client.queryOne<MasterAttachmentRow>(SELECT_ASYNC_MASTER_ATTACHMENT_SQL, {
      attachmentId,
      entityType: entity.type,
      entityId: entity.id
    });
  }

  private async selectMasterAttachmentAnyRow(entity: EntityRef, attachmentId: string) {
    return this.client.queryOne<MasterAttachmentRow>(SELECT_ASYNC_MASTER_ATTACHMENT_ANY_SQL, {
      attachmentId,
      entityType: entity.type,
      entityId: entity.id
    });
  }

  private async findActiveDuplicate(input: { entity: EntityRef; category: MasterAttachmentCategory; revision: string | null; filename: string }) {
    return this.client.queryOne<{ id: string }>(SELECT_ASYNC_MASTER_ATTACHMENT_DUPLICATE_SQL, {
      entityType: input.entity.type,
      entityId: input.entity.id,
      category: input.category,
      revision: input.revision,
      filename: input.filename
    });
  }

  private async buildPolicyForRow(entity: EntityRef, row: MasterAttachmentRow) {
    const duplicate = row.deleted_at
      ? await this.findActiveDuplicate({
          entity,
          category: row.document_category as MasterAttachmentCategory,
          revision: row.revision,
          filename: row.file_name
        })
      : null;

    return buildMasterAttachmentLifecyclePolicy({
      attachmentId: row.id,
      parentType: entity.type,
      parentCode: entity.code,
      deleted: Boolean(row.deleted_at),
      parentValid: true,
      activeDuplicate: Boolean(duplicate)
    });
  }

  private async getMasterAttachmentsDriveFolderId() {
    const row = await this.client.queryOne<{ value: string }>(SELECT_ASYNC_MASTER_ATTACHMENT_GDRIVE_FOLDER_SQL);
    return row?.value || process.env.GOOGLE_DRIVE_MASTER_ATTACHMENTS_FOLDER_ID?.trim() || "";
  }

  private async createAuditLog(actorId: string | null, action: string, detail: Record<string, unknown>) {
    const audit = new AsyncAuditRepository(this.client, this.clock, this.idFactory);
    await audit.createAuditLog({ actorId, action, detail });
  }
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
    storageProvider: stored.provider,
    storageKey: stored.key
  };
}

function storageProviderForFileAsset(provider: string) {
  return provider === "local_repository" ? "j_drive" : provider;
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
    fileSize: Number(row.file_size ?? 0),
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
    revisionPackageEffectiveStatus: row.revision_package_effective_status ?? row.revision_package_status ?? null,
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
  if (ext === "html" || ext === "htm") return "text/html";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "zip") return "application/zip";
  return "application/octet-stream";
}

function getMaxAttachmentBytes() {
  return getMasterAttachmentUploadPolicy().maxUploadFileBytes;
}
