import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { FileReference, FileRole } from "@/lib/types";

export const SELECT_ASYNC_SUBMISSION_REVISION_EXISTS_SQL = `
  SELECT id
  FROM submissions
  WHERE drawing_number = :drawingNumber
    AND revision = :revision
    AND company_id = :companyId
    AND (
      status IN ('Pending', 'Releasing', 'Released', 'Obsolete')
      OR (status = 'ReleaseFailed' AND resolved_by_submission_id IS NULL)
    )
  LIMIT 1
`;

export const SELECT_ASYNC_SUBMISSION_REVISIONS_BY_DRAWING_SQL = `
  SELECT revision, status, created_at, updated_at, released_at
  FROM submissions
  WHERE drawing_number = :drawingNumber
    AND company_id = :companyId
  ORDER BY created_at ASC, id ASC
`;

export const UPSERT_ASYNC_SUBMISSION_ITEM_SQL = `
  INSERT INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at)
  VALUES (:id, :companyId, :partNumber, :partName, NULL, :now, :now)
  ON CONFLICT(company_id, part_number) DO UPDATE SET
    part_name = excluded.part_name,
    updated_at = excluded.updated_at
  RETURNING id
`;

export const INSERT_ASYNC_SUBMISSION_RECORD_SQL = `
  INSERT INTO submissions (
    id, company_id, item_id, drawing_number, revision, product_line, customer, project_code, process_name,
    machine, material, surface_finish, document_type,
    change_description, status, submitted_by, approval_required, source_entity_type, source_entity_id, corrects_submission_id, created_at, updated_at
  ) VALUES (
    :id, :companyId, :itemId, :drawingNumber, :revision, :productLine, :customer, :projectCode, :processName,
    :machine, :material, :surfaceFinish, :documentType,
    :changeDescription, 'Pending', :submittedBy, :approvalRequired, :sourceEntityType, :sourceEntityId, :correctsSubmissionId, :now, :now
  )
`;

export const INSERT_ASYNC_SUBMISSION_FILE_SQL = `
  INSERT INTO submission_files (
    id, submission_id, file_role, original_filename, local_path, storage_provider, storage_bucket, storage_key, gdrive_file_id,
    sha256, file_size, source_master_attachment_id, source_file_asset_id, created_at
  ) VALUES (
    :id, :submissionId, :fileRole, :originalFilename, :localPath, :storageProvider, :storageBucket, :storageKey, :gdriveFileId,
    :sha256, :fileSize, :sourceMasterAttachmentId, :sourceFileAssetId, :now
  )
`;

export const INSERT_ASYNC_SUBMISSION_SNAPSHOT_SQL = `
  INSERT INTO submission_snapshots (
    id, submission_id, company_id, source_root_id, source_root_code,
    source_drawing_number_id, source_drawing_number, source_part_number_id, source_part_number,
    snapshot_version, rules_version, snapshot_hash, snapshot_json, captured_by, captured_at, created_at
  ) VALUES (
    :id, :submissionId, :companyId, :sourceRootId, :sourceRootCode,
    :sourceDrawingNumberId, :sourceDrawingNumber, :sourcePartNumberId, :sourcePartNumber,
    :snapshotVersion, :rulesVersion, :snapshotHash, :snapshotJson, :capturedBy, :capturedAt, :createdAt
  )
`;

export const INSERT_ASYNC_SUBMISSION_PART_SCOPE_SQL = `
  INSERT INTO submission_part_scopes (
    id, submission_id, company_id, item_id, part_number_id, part_number, part_name,
    link_type, form_state, fit_state, function_state, fff_outcome, created_at
  ) VALUES (
    :id, :submissionId, :companyId, :itemId, :partNumberId, :partNumber, :partName,
    :linkType, :formState, :fitState, :functionState, :fffOutcome, :createdAt
  )
`;

export const INSERT_ASYNC_FILE_REFERENCE_SQL = `
  INSERT INTO file_references (
    id, submission_id, source_file_id, source_filename, source_file_role,
    referenced_filename, referenced_part_number, referenced_drawing_number,
    referenced_revision, reference_type, quantity, extraction_method, confidence, created_at
  ) VALUES (
    :id, :submissionId, :sourceFileId, :sourceFilename, :sourceFileRole,
    :referencedFilename, :referencedPartNumber, :referencedDrawingNumber,
    :referencedRevision, :referenceType, :quantity, :extractionMethod, :confidence, :now
  )
`;

export const UPSERT_ASYNC_SUBMISSION_BOM_HEADER_SQL = `
  INSERT INTO bom_headers (
    id, parent_item_id, parent_submission_id, parent_revision, status, source, line_count, created_at, updated_at
  ) VALUES (
    :id, :parentItemId, :parentSubmissionId, :parentRevision, 'Draft', 'cad_references', :lineCount, :now, :now
  )
  ON CONFLICT(parent_submission_id) DO UPDATE SET
    parent_revision = excluded.parent_revision,
    source = excluded.source,
    line_count = excluded.line_count,
    updated_at = excluded.updated_at
  RETURNING id, parent_submission_id, line_count
`;

export const DELETE_ASYNC_SUBMISSION_BOM_LINES_SQL = `
  DELETE FROM bom_lines
  WHERE bom_header_id = :bomHeaderId
`;

export const INSERT_ASYNC_SUBMISSION_BOM_LINE_SQL = `
  INSERT INTO bom_lines (
    id, bom_header_id, line_no, child_part_number, child_revision, quantity,
    source_file_id, source_reference_id, source_filename, created_at
  ) VALUES (
    :id, :bomHeaderId, :lineNo, :childPartNumber, :childRevision, :quantity,
    :sourceFileId, :sourceReferenceId, :sourceFilename, :now
  )
`;

export const INSERT_ASYNC_SUBMISSION_WRITE_AUDIT_LOG_SQL = `
  INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
  VALUES (:id, :submissionId, :actorId, :action, :detailJson, :createdAt)
`;

export type CreateSubmissionAsyncInput = {
  companyId: string;
  drawingNumber: string;
  partNumber: string;
  partName: string;
  revision: string;
  productLine?: string;
  customer?: string;
  projectCode?: string;
  processName?: string;
  machine?: string;
  material: string;
  surfaceFinish: string;
  documentType: string;
  changeDescription: string;
  submittedBy: string;
  approvalRequired?: 1 | 2;
  sourceEntityType?: "drawing_number" | "part_number" | null;
  sourceEntityId?: string | null;
  correctsSubmissionId?: string | null;
  files: Array<{
    fileRole: string;
    originalFilename: string;
    localPath?: string | null;
    storageProvider?: "local_repository" | "supabase_storage" | "s3_compatible" | "google_cloud_storage";
    storageBucket?: string | null;
    storageKey?: string | null;
    gdriveFileId?: string | null;
    sha256: string;
    fileSize: number;
    sourceMasterAttachmentId?: string | null;
    sourceFileAssetId?: string | null;
  }>;
  snapshot?: CreateSubmissionSnapshotInput;
  partScopes?: CreateSubmissionPartScopeInput[];
  references?: Array<{
    sourceFilename: string;
    sourceFileRole: FileReference["source_file_role"];
    referencedFilename: string;
    referencedPartNumber?: string;
    referencedDrawingNumber?: string;
    referencedRevision?: string;
    referenceType: FileReference["reference_type"];
    quantity: number;
    extractionMethod: string;
    confidence: FileReference["confidence"];
  }>;
  storageUploadOverride?: {
    approvedBy: string;
    reason: string;
    maxUploadFileBytes: number;
    largeFileThresholdBytes: number;
    decisions: Array<{
      filename: string;
      fileSize: number;
      disposition: string;
      reason: string;
    }>;
  };
};

export type CreateSubmissionPartScopeInput = {
  partNumberId: string;
  partNumber: string;
  partName: string;
  linkType: "primary_manufacturing" | "reference";
  formState: "no_impact" | "suspected_impact" | "confirmed_impact";
  fitState: "no_impact" | "suspected_impact" | "confirmed_impact";
  functionState: "no_impact" | "suspected_impact" | "confirmed_impact";
  fffOutcome: "no_impact" | "suspected_impact" | "confirmed_impact";
};

export type CreateSubmissionSnapshotInput = {
  sourceRootId: string;
  sourceRootCode: string;
  sourceDrawingNumberId: string;
  sourceDrawingNumber: string;
  sourcePartNumberId: string;
  sourcePartNumber: string;
  rulesVersion: string;
  capturedBy: string;
  capturedAt: string;
  snapshotJson: Record<string, unknown>;
};

type PreparedFileReference = NonNullable<CreateSubmissionAsyncInput["references"]>[number] & {
  id: string;
  sourceFileId: string | null;
  sourceFileRoleValue: FileRole;
};

type SubmissionRevisionHistoryRow = {
  revision: string;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  released_at: string | null;
};

export class AsyncSubmissionWriteRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async submissionRevisionExists(input: { companyId: string; drawingNumber: string; revision: string }): Promise<boolean> {
    const row = await this.client.queryOne<{ id: string }>(SELECT_ASYNC_SUBMISSION_REVISION_EXISTS_SQL, input);
    return Boolean(row);
  }

  async listSubmissionRevisionsByDrawing(input: { companyId: string; drawingNumber: string }) {
    const rows = await this.client.query<SubmissionRevisionHistoryRow>(SELECT_ASYNC_SUBMISSION_REVISIONS_BY_DRAWING_SQL, input);
    return rows.map((row) => ({
      revision: row.revision,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      releasedAt: row.released_at
    }));
  }

  async createSubmissionRecord(input: CreateSubmissionAsyncInput): Promise<string> {
    const now = this.clock();
    const submissionId = `SUB-${now.slice(0, 10).replaceAll("-", "")}-${this.idFactory().slice(0, 8).toUpperCase()}`;
    const itemId = this.idFactory();
    const partScopeEntries = (input.partScopes ?? []).map((scope) => ({
      ...scope,
      id: this.idFactory(),
      itemId: this.idFactory()
    }));
    const fileEntries = input.files.map((file) => ({
      ...file,
      id: this.idFactory()
    }));
    const fileIdByName = new Map(fileEntries.map((file) => [file.originalFilename, { id: file.id, role: file.fileRole as FileRole }]));
    const references = (input.references ?? []).map<PreparedFileReference>((reference) => {
      const sourceFile = fileIdByName.get(reference.sourceFilename);
      return {
        ...reference,
        id: this.idFactory(),
        sourceFileId: sourceFile?.id ?? null,
        sourceFileRoleValue: sourceFile?.role ?? reference.sourceFileRole
      };
    });

    const create = async (client: AsyncDatabaseClient) => {
      const item = await client.queryOne<{ id: string }>(UPSERT_ASYNC_SUBMISSION_ITEM_SQL, {
        id: itemId,
        companyId: input.companyId,
        partNumber: input.partNumber,
        partName: input.partName,
        now
      });
      if (!item) throw new Error("Failed to create item");

      for (const scope of partScopeEntries) {
        const scopeItem = await client.queryOne<{ id: string }>(UPSERT_ASYNC_SUBMISSION_ITEM_SQL, {
          id: scope.itemId,
          companyId: input.companyId,
          partNumber: scope.partNumber,
          partName: scope.partName,
          now
        });
        if (!scopeItem) throw new Error(`Failed to create scoped item ${scope.partNumber}`);
        scope.itemId = scopeItem.id;
      }

      await client.execute(INSERT_ASYNC_SUBMISSION_RECORD_SQL, {
        id: submissionId,
        companyId: input.companyId,
        itemId: item.id,
        drawingNumber: input.drawingNumber,
        revision: input.revision,
        productLine: input.productLine?.trim() ?? "",
        customer: input.customer?.trim() ?? "",
        projectCode: input.projectCode?.trim() ?? "",
        processName: input.processName?.trim() ?? "",
        machine: input.machine?.trim() ?? "",
        material: input.material,
        surfaceFinish: input.surfaceFinish,
        documentType: input.documentType,
        changeDescription: input.changeDescription,
        submittedBy: input.submittedBy,
        approvalRequired: input.approvalRequired ?? 1,
        sourceEntityType: input.sourceEntityType ?? null,
        sourceEntityId: input.sourceEntityId ?? null,
        correctsSubmissionId: input.correctsSubmissionId ?? null,
        now
      });

      for (const scope of partScopeEntries) {
        await client.execute(INSERT_ASYNC_SUBMISSION_PART_SCOPE_SQL, {
          id: scope.id,
          submissionId,
          companyId: input.companyId,
          itemId: scope.itemId,
          partNumberId: scope.partNumberId,
          partNumber: scope.partNumber,
          partName: scope.partName,
          linkType: scope.linkType,
          formState: scope.formState,
          fitState: scope.fitState,
          functionState: scope.functionState,
          fffOutcome: scope.fffOutcome,
          createdAt: now
        });
      }

      for (const file of fileEntries) {
        await client.execute(INSERT_ASYNC_SUBMISSION_FILE_SQL, {
          id: file.id,
          submissionId,
          fileRole: file.fileRole,
          originalFilename: file.originalFilename,
          localPath: file.localPath,
          storageProvider: file.storageProvider ?? "local_repository",
          storageBucket: file.storageBucket ?? null,
          storageKey: file.storageKey ?? null,
          gdriveFileId: file.gdriveFileId ?? null,
          sha256: file.sha256,
          fileSize: file.fileSize,
          sourceMasterAttachmentId: file.sourceMasterAttachmentId ?? null,
          sourceFileAssetId: file.sourceFileAssetId ?? null,
          now
        });
      }

      if (input.snapshot) {
        const snapshotJson = buildSubmissionSnapshotJson(input.snapshot.snapshotJson, {
          submissionId,
          submissionFileEntries: fileEntries.map((file) => ({
            submissionFileId: file.id,
            sourceMasterAttachmentId: file.sourceMasterAttachmentId ?? null,
            sourceFileAssetId: file.sourceFileAssetId ?? null,
            fileRole: file.fileRole,
            originalFilename: file.originalFilename,
            localPath: file.localPath,
            storageProvider: file.storageProvider ?? "local_repository",
            storageBucket: file.storageBucket ?? null,
            storageKey: file.storageKey ?? null,
            sha256: file.sha256,
            fileSize: file.fileSize
          }))
        });
        const snapshotJsonText = canonicalJsonStringify(snapshotJson);
        await client.execute(INSERT_ASYNC_SUBMISSION_SNAPSHOT_SQL, {
          id: this.idFactory(),
          submissionId,
          companyId: input.companyId,
          sourceRootId: input.snapshot.sourceRootId,
          sourceRootCode: input.snapshot.sourceRootCode,
          sourceDrawingNumberId: input.snapshot.sourceDrawingNumberId,
          sourceDrawingNumber: input.snapshot.sourceDrawingNumber,
          sourcePartNumberId: input.snapshot.sourcePartNumberId,
          sourcePartNumber: input.snapshot.sourcePartNumber,
          snapshotVersion: "drawing_part_submission_v1",
          rulesVersion: input.snapshot.rulesVersion,
          snapshotHash: crypto.createHash("sha256").update(snapshotJsonText).digest("hex"),
          snapshotJson: snapshotJsonText,
          capturedBy: input.snapshot.capturedBy,
          capturedAt: input.snapshot.capturedAt,
          createdAt: now
        });
        await this.insertAudit(client, {
          submissionId,
          actorId: input.submittedBy,
          action: "submission.snapshot.created",
          detail: {
            sourceRootCode: input.snapshot.sourceRootCode,
            sourceDrawingNumber: input.snapshot.sourceDrawingNumber,
            sourcePartNumber: input.snapshot.sourcePartNumber,
            rulesVersion: input.snapshot.rulesVersion
          },
          now
        });
      }

      for (const reference of references) {
        await client.execute(INSERT_ASYNC_FILE_REFERENCE_SQL, {
          id: reference.id,
          submissionId,
          sourceFileId: reference.sourceFileId,
          sourceFilename: reference.sourceFilename,
          sourceFileRole: reference.sourceFileRoleValue,
          referencedFilename: reference.referencedFilename,
          referencedPartNumber: reference.referencedPartNumber ?? null,
          referencedDrawingNumber: reference.referencedDrawingNumber ?? null,
          referencedRevision: reference.referencedRevision ?? null,
          referenceType: reference.referenceType,
          quantity: reference.quantity,
          extractionMethod: reference.extractionMethod,
          confidence: reference.confidence,
          now
        });
      }

      await this.insertAudit(client, {
        submissionId,
        actorId: input.submittedBy,
        action: "Submit",
        detail: {
          fileCount: input.files.length,
          ...(input.sourceEntityType && input.sourceEntityId
            ? { sourceEntityType: input.sourceEntityType, sourceEntityId: input.sourceEntityId }
            : {}),
          sourceMasterAttachmentIds: input.files.map((file) => file.sourceMasterAttachmentId).filter(Boolean),
          partScope: partScopeEntries.map((scope) => ({
            partNumberId: scope.partNumberId,
            partNumber: scope.partNumber,
            fffOutcome: scope.fffOutcome
          })),
          ...(input.storageUploadOverride ? { storageUploadOverride: input.storageUploadOverride } : {})
        },
        now
      });

      if (references.some((reference) => reference.referenceType === "assembly_component")) {
        await this.materializeBomFromReferences(client, {
          submissionId,
          itemId: item.id,
          revision: input.revision,
          actorId: null,
          references,
          now
        });
      }
    };

    await this.client.transaction(create);

    return submissionId;
  }

  private async materializeBomFromReferences(
    client: AsyncDatabaseClient,
    input: {
      submissionId: string;
      itemId: string;
      revision: string;
      actorId: string | null;
      references: PreparedFileReference[];
      now: string;
    }
  ) {
    const bomReferences = input.references
      .filter(
        (reference) =>
          reference.referenceType === "assembly_component" &&
          Boolean(reference.referencedPartNumber?.trim())
      )
      .sort(compareBomReferences);

    const header = await client.queryOne<{ id: string }>(UPSERT_ASYNC_SUBMISSION_BOM_HEADER_SQL, {
      id: this.idFactory(),
      parentItemId: input.itemId,
      parentSubmissionId: input.submissionId,
      parentRevision: input.revision,
      lineCount: bomReferences.length,
      now: input.now
    });
    if (!header) throw new Error("Failed to materialize BOM header");

    await client.execute(DELETE_ASYNC_SUBMISSION_BOM_LINES_SQL, { bomHeaderId: header.id });

    for (const [index, reference] of bomReferences.entries()) {
      await client.execute(INSERT_ASYNC_SUBMISSION_BOM_LINE_SQL, {
        id: this.idFactory(),
        bomHeaderId: header.id,
        lineNo: index + 1,
        childPartNumber: reference.referencedPartNumber?.trim() ?? "",
        childRevision: reference.referencedRevision ?? null,
        quantity: reference.quantity,
        sourceFileId: reference.sourceFileId,
        sourceReferenceId: reference.id,
        sourceFilename: reference.sourceFilename,
        now: input.now
      });
    }

    await this.insertAudit(client, {
      submissionId: input.submissionId,
      actorId: input.actorId,
      action: "BomDraftMaterialized",
      detail: { source: "file_references", lineCount: bomReferences.length },
      now: input.now
    });
  }

  private async insertAudit(
    client: AsyncDatabaseClient,
    input: {
      submissionId: string;
      actorId: string | null;
      action: string;
      detail: Record<string, unknown>;
      now: string;
    }
  ) {
    await client.execute(INSERT_ASYNC_SUBMISSION_WRITE_AUDIT_LOG_SQL, {
      id: this.idFactory(),
      submissionId: input.submissionId,
      actorId: input.actorId,
      action: input.action,
      detailJson: JSON.stringify(input.detail),
      createdAt: input.now
    });
  }
}

function buildSubmissionSnapshotJson(
  base: Record<string, unknown>,
  generated: {
    submissionId: string;
    submissionFileEntries: Array<{
      submissionFileId: string;
      sourceMasterAttachmentId: string | null;
      sourceFileAssetId: string | null;
      fileRole: string;
      originalFilename: string;
      localPath: string | null | undefined;
      storageProvider?: "local_repository" | "supabase_storage" | "s3_compatible" | "google_cloud_storage";
      storageBucket?: string | null;
      storageKey?: string | null;
      sha256: string;
      fileSize: number;
    }>;
  }
) {
  return {
    ...base,
    submission: {
      ...((base.submission && typeof base.submission === "object" && !Array.isArray(base.submission)
        ? (base.submission as Record<string, unknown>)
        : {}) as Record<string, unknown>),
      id: generated.submissionId
    },
    attachments: generated.submissionFileEntries
  };
}

function canonicalJsonStringify(value: unknown) {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      if (key === "snapshot_hash") return result;
      result[key] = sortJsonValue(record[key]);
      return result;
    }, {});
}

function compareBomReferences(left: PreparedFileReference, right: PreparedFileReference) {
  return (
    left.sourceFilename.localeCompare(right.sourceFilename) ||
    String(left.referencedPartNumber ?? "").localeCompare(String(right.referencedPartNumber ?? "")) ||
    left.referencedFilename.localeCompare(right.referencedFilename)
  );
}
