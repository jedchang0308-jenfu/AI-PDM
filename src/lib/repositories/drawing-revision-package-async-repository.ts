import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  getSupplementReasonDefinition,
  type DrawingRevisionPackageStatus,
  type DrawingRevisionPackageSupplementReasonCode,
  type DrawingRevisionSupplementFileInput
} from "@/lib/drawing-revision-package";
import {
  classifyRevisionPackageFiles,
  inferRevisionPackageRole,
  normalizeRevisionPackageFileRole,
  type RevisionPackageFileRole
} from "@/lib/revision-package";
import { mapReadQueryBatches } from "@/lib/repositories/read-query-batch";

type SubmissionPackageSeedRow = {
  id: string;
  company_id: string;
  drawing_number: string;
  revision: string;
  status: string;
  submitted_by: string;
  created_at: string;
  released_at: string | null;
  source_entity_id: string | null;
  source_drawing_number_id: string | null;
  snapshot_json: string | null;
};

type SubmissionPackageFileSeedRow = {
  submission_file_id: string;
  source_file_asset_id: string | null;
  original_filename: string;
  display_name: string | null;
  description: string | null;
  document_category: string | null;
};

type DrawingRevisionPackageRow = {
  id: string;
  company_id: string;
  drawing_number_id: string;
  drawing_number: string;
  revision: string;
  status: DrawingRevisionPackageStatus;
  source_submission_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  released_at: string | null;
  snapshot_json: string | null;
  effective_status?: DrawingRevisionPackageStatus | "ReviewApproved";
};

type FileAssetRow = {
  id: string;
  file_name: string;
  display_name: string | null;
  description: string | null;
  document_category: string | null;
  revision: string | null;
};

type SupplementRow = {
  id: string;
  package_id: string;
  package_company_id: string;
  source_submission_id: string | null;
  status: string;
  reason_code: DrawingRevisionPackageSupplementReasonCode;
  requested_by: string;
};

export class DrawingRevisionPackageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DrawingRevisionPackageError";
  }
}

export class AsyncDrawingRevisionPackageRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async getPackageBySubmissionId(submissionId: string) {
    return this.client.queryOne<DrawingRevisionPackageRow>(
      `
      SELECT package.*,
             CASE
               WHEN package.status = 'Pending'
                AND (
                  (
                    companion.package_id = package.id
                    AND companion.snapshot_hash = candidate.review_snapshot_hash
                  )
                  OR (
                    instr(package.revision, '.') > 0
                    AND EXISTS (
                      SELECT 1
                      FROM drawing_revision_fff_assessments fff
                      JOIN review_confirmation_events rce
                        ON rce.review_id = fff.id
                       AND rce.company_id = fff.company_id
                      WHERE fff.company_id = package.company_id
                        AND fff.submission_id = package.source_submission_id
                        AND rce.action IN (
                          'confirm_bom_no_revision',
                          'confirm_original_part_reuse',
                          'approve_replacement_part_and_drawing_release'
                        )
                    )
                  )
                )
               THEN 'ReviewApproved'
               ELSE package.status
             END AS effective_status
      FROM drawing_revision_packages package
      LEFT JOIN drawing_revision_package_review_approvals companion ON companion.package_id = package.id
      LEFT JOIN numbering_candidate_revision_drafts candidate
        ON candidate.id = companion.candidate_revision_id
       AND candidate.formal_revision_package_id = package.id
      WHERE package.source_submission_id = :submissionId
      LIMIT 1
    `,
      { submissionId }
    );
  }

  async ensurePackageForSubmission(input: { submissionId: string; actorId: string }) {
    const existing = await this.getPackageBySubmissionId(input.submissionId);
    if (existing) return existing;

    const seed = await this.loadSubmissionSeed(input.submissionId);
    const drawingNumberId = seed.source_drawing_number_id || seed.source_entity_id;
    if (!drawingNumberId) {
      throw new DrawingRevisionPackageError(
        "drawing_revision_package_source_missing",
        "這筆送審缺少圖號來源，無法建立版次附件包。",
        409
      );
    }

    const packageStatus = packageStatusForSubmission(seed.status);
    if (packageStatus === "Released") {
      await this.assertNoDuplicateReleasedPackage({
        companyId: seed.company_id,
        drawingNumberId,
        revision: seed.revision,
        sourceSubmissionId: seed.id
      });
    }

    const packageId = `DRP-${this.idFactory()}`;
    const now = this.clock();
    const snapshot = parseSnapshot(seed.snapshot_json);
    const packageRoleBySourceId = packageRolesFromSnapshot(snapshot);
    const fileRows = await this.client.query<SubmissionPackageFileSeedRow>(
      `
      SELECT
        sf.id AS submission_file_id,
        sf.source_master_attachment_id AS source_file_asset_id,
        sf.original_filename,
        fa.display_name,
        fa.description,
        fa.document_category
      FROM submission_files sf
      LEFT JOIN file_assets fa ON fa.id = sf.source_master_attachment_id
      WHERE sf.submission_id = :submissionId
      ORDER BY sf.created_at ASC, sf.id ASC
    `,
      { submissionId: seed.id }
    );

    await this.client.transaction(async (tx) => {
      await tx.execute(
        `
        INSERT INTO drawing_revision_packages (
          id, company_id, drawing_number_id, drawing_number, revision, status, source_submission_id,
          created_by, created_at, updated_at, submitted_at, released_at, snapshot_json
        ) VALUES (
          :id, :companyId, :drawingNumberId, :drawingNumber, :revision, :status, :sourceSubmissionId,
          :createdBy, :createdAt, :updatedAt, :submittedAt, :releasedAt, :snapshotJson
        )
        ON CONFLICT(source_submission_id) DO UPDATE SET
          updated_at = excluded.updated_at
      `,
        {
          id: packageId,
          companyId: seed.company_id,
          drawingNumberId,
          drawingNumber: seed.drawing_number,
          revision: seed.revision,
          status: packageStatus,
          sourceSubmissionId: seed.id,
          createdBy: input.actorId,
          createdAt: now,
          updatedAt: now,
          submittedAt: seed.created_at ?? now,
          releasedAt: packageStatus === "Released" ? seed.released_at ?? now : null,
          snapshotJson: seed.snapshot_json
        }
      );

      for (const [index, file] of fileRows.entries()) {
        if (!file.source_file_asset_id) continue;
        const snapshotRole = packageRoleBySourceId.get(file.source_file_asset_id);
        const inferredRole = inferRevisionPackageRole(file.original_filename, file.document_category);
        const role = normalizeRevisionPackageFileRole(snapshotRole?.role) ?? inferredRole;
        const roleSource = snapshotRole?.source === "user" ? "user" : snapshotRole ? "extension" : "system";
        await tx.execute(
          `
          INSERT INTO drawing_revision_package_files (
            id, package_id, source_file_asset_id, source_submission_file_id, role, role_source,
            display_name, description, sort_order, is_primary, created_by, created_at
          ) VALUES (
            :id, :packageId, :sourceFileAssetId, :sourceSubmissionFileId, :role, :roleSource,
            :displayName, :description, :sortOrder, 0, :createdBy, :createdAt
          )
          ON CONFLICT(package_id, source_file_asset_id) DO UPDATE SET
            source_submission_file_id = excluded.source_submission_file_id
        `,
          {
            id: this.idFactory(),
            packageId,
            sourceFileAssetId: file.source_file_asset_id,
            sourceSubmissionFileId: file.submission_file_id,
            role,
            roleSource,
            displayName: file.display_name || file.original_filename,
            description: file.description ?? "",
            sortOrder: index,
            createdBy: input.actorId,
            createdAt: now
          }
        );
      }

      await insertPackageAudit(tx, {
        id: this.idFactory(),
        submissionId: seed.id,
        actorId: input.actorId,
        action: "drawing_revision_package.created",
        detail: { packageId, status: packageStatus, fileCount: fileRows.filter((file) => file.source_file_asset_id).length },
        createdAt: now
      });
    });

    const created = await this.getPackageBySubmissionId(input.submissionId);
    if (!created) {
      throw new DrawingRevisionPackageError("drawing_revision_package_create_failed", "版次附件包建立失敗。", 500);
    }
    return created;
  }

  async markPackageReleasedForSubmission(input: { submissionId: string; actorId: string }) {
    const existing = await this.getPackageBySubmissionId(input.submissionId);
    if (!existing) {
      throw new DrawingRevisionPackageError("drawing_revision_package_missing", "送審缺少版次附件包，不能完成發行。", 409);
    }
    await this.assertNoDuplicateReleasedPackage({
      companyId: existing.company_id,
      drawingNumberId: existing.drawing_number_id,
      revision: existing.revision,
      sourceSubmissionId: input.submissionId
    });

    const now = this.clock();
    await this.client.transaction(async (tx) => {
      await tx.execute(
        `
        UPDATE drawing_revision_packages
        SET status = 'Released',
            released_at = COALESCE(released_at, :now),
            updated_at = :now
        WHERE source_submission_id = :submissionId
      `,
        { submissionId: input.submissionId, now }
      );
      await insertPackageAudit(tx, {
        id: this.idFactory(),
        submissionId: input.submissionId,
        actorId: input.actorId,
        action: "drawing_revision_package.released",
        detail: { packageId: existing.id },
        createdAt: now
      });
    });
  }

  async markPackageCancelledForSubmission(input: { submissionId: string; actorId: string; reason: string }) {
    const existing = await this.getPackageBySubmissionId(input.submissionId);
    if (!existing || existing.status === "Released") return false;
    const now = this.clock();
    await this.client.transaction(async (tx) => {
      await tx.execute(
        `
        UPDATE drawing_revision_packages
        SET status = 'Cancelled',
            cancelled_at = COALESCE(cancelled_at, :now),
            updated_at = :now
        WHERE source_submission_id = :submissionId
          AND status IN ('Draft', 'Pending', 'Rejected', 'Cancelled')
      `,
        { submissionId: input.submissionId, now }
      );
      await insertPackageAudit(tx, {
        id: this.idFactory(),
        submissionId: input.submissionId,
        actorId: input.actorId,
        action: "drawing_revision_package.cancelled",
        detail: { packageId: existing.id, reason: input.reason },
        createdAt: now
      });
    });
    return true;
  }

  async requestSupplement(input: {
    packageId: string;
    companyId: string;
    actorId: string;
    reasonCode: DrawingRevisionPackageSupplementReasonCode;
    reasonNote?: string | null;
    files: DrawingRevisionSupplementFileInput[];
  }) {
    const pkg = await this.getPackageById(input.packageId);
    if (!pkg || pkg.company_id !== input.companyId) {
      throw new DrawingRevisionPackageError("drawing_revision_package_not_found", "找不到版次附件包。", 404);
    }
    if (pkg.status !== "Released") {
      throw new DrawingRevisionPackageError("drawing_revision_package_not_released", "只有已發布的版次附件包可以補附件。", 409);
    }
    const reason = getSupplementReasonDefinition(input.reasonCode);
    const reasonNote = String(input.reasonNote ?? "").trim();
    if (reason.noteRequired && !reasonNote) {
      throw new DrawingRevisionPackageError("supplement_reason_note_required", "請填寫補件原因說明。", 400);
    }
    if (input.files.length === 0) {
      throw new DrawingRevisionPackageError("supplement_file_required", "請至少選擇一個補件附件。", 400);
    }

    const fileRows = await this.loadPackageFileAssets(pkg, input.files.map((file) => file.fileId));
    if (fileRows.length !== new Set(input.files.map((file) => file.fileId)).size) {
      throw new DrawingRevisionPackageError("supplement_file_not_found", "補件附件不存在，或不屬於此圖號。", 404);
    }
    const roleByFileId = new Map(input.files.map((file) => [file.fileId, file.role ?? null]));
    const displayByFileId = new Map(input.files.map((file) => [file.fileId, file.displayName ?? null]));
    const descriptionByFileId = new Map(input.files.map((file) => [file.fileId, file.description ?? null]));
    const classifiedFiles = classifyRevisionPackageFiles(
      fileRows.map((file) => ({
        id: file.id,
        filename: file.file_name,
        documentCategory: file.document_category,
        userCorrectedRole: roleByFileId.get(file.id) ?? null
      }))
    );
    const classifiedByFileId = new Map(classifiedFiles.map((file) => [file.id ?? "", file]));
    const supplementId = `DRPS-${this.idFactory()}`;
    const now = this.clock();

    await this.client.transaction(async (tx) => {
      await tx.execute(
        `
        INSERT INTO drawing_revision_package_supplements (
          id, package_id, status, reason_code, reason_note, revision_warning_shown,
          requested_by, requested_at, created_at, updated_at
        ) VALUES (
          :id, :packageId, 'Pending', :reasonCode, :reasonNote, :revisionWarningShown,
          :requestedBy, :requestedAt, :createdAt, :updatedAt
        )
      `,
        {
          id: supplementId,
          packageId: pkg.id,
          reasonCode: input.reasonCode,
          reasonNote: reasonNote || null,
          revisionWarningShown: reason.revisionWarning ? 1 : 0,
          requestedBy: input.actorId,
          requestedAt: now,
          createdAt: now,
          updatedAt: now
        }
      );

      for (const [index, file] of fileRows.entries()) {
        const classified = classifiedByFileId.get(file.id);
        await tx.execute(
          `
          INSERT INTO drawing_revision_package_supplement_files (
            id, supplement_id, source_file_asset_id, role, display_name, description,
            sort_order, created_by, created_at
          ) VALUES (
            :id, :supplementId, :sourceFileAssetId, :role, :displayName, :description,
            :sortOrder, :createdBy, :createdAt
          )
        `,
          {
            id: this.idFactory(),
            supplementId,
            sourceFileAssetId: file.id,
            role: classified?.role ?? inferRevisionPackageRole(file.file_name, file.document_category),
            displayName: displayByFileId.get(file.id) || file.display_name || file.file_name,
            description: descriptionByFileId.get(file.id) || file.description || "",
            sortOrder: index,
            createdBy: input.actorId,
            createdAt: now
          }
        );
      }
      await insertPackageAudit(tx, {
        id: this.idFactory(),
        submissionId: pkg.source_submission_id,
        actorId: input.actorId,
        action: "drawing_revision_package.supplement.requested",
        detail: {
          packageId: pkg.id,
          supplementId,
          reasonCode: input.reasonCode,
          revisionWarningShown: reason.revisionWarning,
          fileCount: fileRows.length
        },
        createdAt: now
      });
    });

    return { supplementId, status: "Pending" as const, revisionWarningShown: reason.revisionWarning };
  }

  async decideSupplement(input: {
    supplementId: string;
    companyId: string;
    actorId: string;
    actorRole: string;
    decision: "approve" | "reject";
    note?: string | null;
  }) {
    if (!["R&D Manager", "Admin"].includes(input.actorRole)) {
      throw new DrawingRevisionPackageError("supplement_decision_forbidden", "只有主管或 Admin 可以核准/駁回補件。", 403);
    }
    const supplement = await this.client.queryOne<SupplementRow>(
      `
      SELECT
        s.id,
        s.package_id,
        s.status,
        s.reason_code,
        s.requested_by,
        p.company_id AS package_company_id,
        p.source_submission_id
      FROM drawing_revision_package_supplements s
      JOIN drawing_revision_packages p ON p.id = s.package_id
      WHERE s.id = :supplementId
      LIMIT 1
    `,
      { supplementId: input.supplementId }
    );
    if (!supplement || supplement.package_company_id !== input.companyId) {
      throw new DrawingRevisionPackageError("supplement_not_found", "找不到補件申請。", 404);
    }
    if (supplement.status !== "Pending") {
      throw new DrawingRevisionPackageError("supplement_not_pending", "這筆補件已處理，不能重複審核。", 409);
    }
    if (supplement.requested_by === input.actorId && input.actorRole !== "Admin") {
      throw new DrawingRevisionPackageError("supplement_self_approve_forbidden", "補件申請者不能自行核准，請由主管或 Admin 處理。", 403);
    }

    const now = this.clock();
    const nextStatus = input.decision === "approve" ? "Approved" : "Rejected";
    await this.client.transaction(async (tx) => {
      await tx.execute(
        `
        UPDATE drawing_revision_package_supplements
        SET status = :status,
            reviewed_by = :reviewedBy,
            reviewed_at = :reviewedAt,
            review_decision_note = :note,
            updated_at = :updatedAt
        WHERE id = :supplementId
          AND status = 'Pending'
      `,
        {
          status: nextStatus,
          reviewedBy: input.actorId,
          reviewedAt: now,
          note: String(input.note ?? "").trim() || null,
          updatedAt: now,
          supplementId: input.supplementId
        }
      );
      await insertPackageAudit(tx, {
        id: this.idFactory(),
        submissionId: supplement.source_submission_id,
        actorId: input.actorId,
        action: input.decision === "approve" ? "drawing_revision_package.supplement.approved" : "drawing_revision_package.supplement.rejected",
        detail: { packageId: supplement.package_id, supplementId: supplement.id, note: input.note ?? null },
        createdAt: now
      });
    });

    return { supplementId: input.supplementId, status: nextStatus };
  }

  async dryRunMigration() {
    const submissions = await this.client.query<SubmissionPackageSeedRow>(
      `
      SELECT
        s.id,
        s.company_id,
        s.drawing_number,
        s.revision,
        s.status,
        s.submitted_by,
        s.created_at,
        s.released_at,
        s.source_entity_id,
        ss.source_drawing_number_id,
        ss.snapshot_json
      FROM submissions s
      LEFT JOIN submission_snapshots ss ON ss.submission_id = s.id
      WHERE s.status IN ('Pending', 'Releasing', 'Released', 'Obsolete', 'Rejected', 'Cancelled')
      ORDER BY s.created_at ASC, s.id ASC
    `
    );
    const clear: Array<{ submissionId: string; drawingNumber: string; revision: string; status: string; fileCount: number }> = [];
    const ambiguous: Array<{ submissionId: string; drawingNumber: string; revision: string; reason: string }> = [];
    for (const submission of submissions) {
      const snapshot = parseSnapshot(submission.snapshot_json);
      const revisionPackage = snapshotRecord(snapshot.revisionPackage);
      const files = Array.isArray(revisionPackage?.files) ? revisionPackage.files : [];
      if (!submission.source_drawing_number_id && !submission.source_entity_id) {
        ambiguous.push({ submissionId: submission.id, drawingNumber: submission.drawing_number, revision: submission.revision, reason: "missing_drawing_number_id" });
        continue;
      }
      if (!revisionPackage || files.length === 0) {
        ambiguous.push({ submissionId: submission.id, drawingNumber: submission.drawing_number, revision: submission.revision, reason: "missing_revision_package_snapshot" });
        continue;
      }
      clear.push({
        submissionId: submission.id,
        drawingNumber: submission.drawing_number,
        revision: submission.revision,
        status: packageStatusForSubmission(submission.status),
        fileCount: files.length
      });
    }
    return {
      clearCount: clear.length,
      ambiguousCount: ambiguous.length,
      clear,
      ambiguous
    };
  }

  private async loadSubmissionSeed(submissionId: string) {
    const seed = await this.client.queryOne<SubmissionPackageSeedRow>(
      `
      SELECT
        s.id,
        s.company_id,
        s.drawing_number,
        s.revision,
        s.status,
        s.submitted_by,
        s.created_at,
        s.released_at,
        s.source_entity_id,
        ss.source_drawing_number_id,
        ss.snapshot_json
      FROM submissions s
      LEFT JOIN submission_snapshots ss ON ss.submission_id = s.id
      WHERE s.id = :submissionId
      LIMIT 1
    `,
      { submissionId }
    );
    if (!seed) {
      throw new DrawingRevisionPackageError("submission_not_found", "找不到送審資料，無法建立版次附件包。", 404);
    }
    return seed;
  }

  private async getPackageById(packageId: string) {
    return this.client.queryOne<DrawingRevisionPackageRow>(
      `
      SELECT package.*,
             CASE
               WHEN package.status = 'Pending'
                AND (
                  (
                    companion.package_id = package.id
                    AND companion.snapshot_hash = candidate.review_snapshot_hash
                  )
                  OR (
                    instr(package.revision, '.') > 0
                    AND EXISTS (
                      SELECT 1
                      FROM drawing_revision_fff_assessments fff
                      JOIN review_confirmation_events rce
                        ON rce.review_id = fff.id
                       AND rce.company_id = fff.company_id
                      WHERE fff.company_id = package.company_id
                        AND fff.submission_id = package.source_submission_id
                        AND rce.action IN (
                          'confirm_bom_no_revision',
                          'confirm_original_part_reuse',
                          'approve_replacement_part_and_drawing_release'
                        )
                    )
                  )
                )
               THEN 'ReviewApproved'
               ELSE package.status
             END AS effective_status
      FROM drawing_revision_packages package
      LEFT JOIN drawing_revision_package_review_approvals companion ON companion.package_id = package.id
      LEFT JOIN numbering_candidate_revision_drafts candidate
        ON candidate.id = companion.candidate_revision_id
       AND candidate.formal_revision_package_id = package.id
      WHERE package.id = :packageId
      LIMIT 1
    `,
      { packageId }
    );
  }

  private async assertNoDuplicateReleasedPackage(input: {
    companyId: string;
    drawingNumberId: string;
    revision: string;
    sourceSubmissionId: string;
  }) {
    const duplicate = await this.client.queryOne<{ id: string; source_submission_id: string | null }>(
      `
      SELECT id, source_submission_id
      FROM drawing_revision_packages
      WHERE company_id = :companyId
        AND drawing_number_id = :drawingNumberId
        AND revision = :revision
        AND status = 'Released'
        AND COALESCE(source_submission_id, '') <> :sourceSubmissionId
      LIMIT 1
    `,
      input
    );
    if (duplicate) {
      throw new DrawingRevisionPackageError(
        "duplicate_released_revision_package",
        "此圖號與版次已有正式版次附件包，不能重複發行同一版次。",
        409,
        { existingPackageId: duplicate.id }
      );
    }
  }

  private async loadPackageFileAssets(pkg: DrawingRevisionPackageRow, fileIds: string[]) {
    const uniqueFileIds = Array.from(new Set(fileIds.map((id) => id.trim()).filter(Boolean)));
    if (uniqueFileIds.length === 0) return [];
    const batches = await mapReadQueryBatches(uniqueFileIds, async (ids) => {
      const params: Record<string, unknown> = { drawingNumberId: pkg.drawing_number_id };
      const placeholders = ids.map((fileId, index) => {
        params[`fileId${index}`] = fileId;
        return `:fileId${index}`;
      });
      return this.client.query<FileAssetRow>(
        `
        SELECT id, file_name, display_name, description, document_category, revision
        FROM file_assets
        WHERE id IN (${placeholders.join(", ")})
          AND linked_entity_type = 'drawing_number'
          AND linked_entity_id = :drawingNumberId
          AND deleted_at IS NULL
      `,
        params
      );
    });
    const rowById = new Map(batches.flat().map((row) => [row.id, row]));
    return uniqueFileIds.flatMap((fileId) => {
      const row = rowById.get(fileId);
      return row ? [row] : [];
    });
  }
}

function packageStatusForSubmission(status: string): DrawingRevisionPackageStatus {
  if (status === "Released" || status === "Obsolete") return "Released";
  if (status === "Rejected") return "Rejected";
  if (status === "Cancelled") return "Cancelled";
  return "Pending";
}

function parseSnapshot(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function snapshotRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function packageRolesFromSnapshot(snapshot: Record<string, unknown>) {
  const result = new Map<string, { role: RevisionPackageFileRole; source: string | null }>();
  const packageRecord = snapshotRecord(snapshot.revisionPackage);
  const files = Array.isArray(packageRecord?.files) ? packageRecord.files : [];
  for (const rawFile of files) {
    const file = snapshotRecord(rawFile);
    if (!file) continue;
    const sourceAttachmentId = String(file.sourceAttachmentId ?? "").trim();
    const role = normalizeRevisionPackageFileRole(file.role);
    if (!sourceAttachmentId || !role) continue;
    result.set(sourceAttachmentId, { role, source: typeof file.source === "string" ? file.source : null });
  }
  return result;
}

async function insertPackageAudit(
  client: AsyncDatabaseClient,
  input: {
    id: string;
    submissionId?: string | null;
    actorId?: string | null;
    action: string;
    detail: Record<string, unknown>;
    createdAt: string;
  }
) {
  await client.execute(
    `
    INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
    VALUES (:id, :submissionId, :actorId, :action, :detailJson, :createdAt)
  `,
    {
      id: input.id,
      submissionId: input.submissionId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      detailJson: JSON.stringify(input.detail),
      createdAt: input.createdAt
    }
  );
}
