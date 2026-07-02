import crypto from "node:crypto";
import { createFileStorageService, storageKeyFromLocalPath } from "@/lib/file-storage";
import { removeSubmissionUploadFolder, saveSubmissionFileBuffers } from "@/lib/file-store";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncSubmissionWriteRepository, type CreateSubmissionAsyncInput } from "@/lib/repositories/submission-write-async-repository";
import { suggestRevisionCode } from "@/lib/revision-policy";
import { createSubmissionRecordAsync, getSubmissionAsync, listSubmissionRevisionsByDrawingAsync } from "@/lib/submissions-async";
import { normalizeFileRole, validateSubmissionInput } from "@/lib/validation";

export type DrawingSubmissionBlockerCode =
  | "drawing_number_not_found"
  | "root_not_found"
  | "drawing_part_link_missing"
  | "ambiguous_root"
  | "missing_primary_drawing"
  | "multiple_primary_drawings"
  | "multiple_primary_parts"
  | "primary_part_not_manufacturing"
  | "missing_primary_part"
  | "missing_material"
  | "missing_surface_finish"
  | "duplicate_attachment_filename"
  | "release_filename_conflict"
  | "missing_attachment"
  | "duplicate_active_submission"
  | "same_revision_in_progress"
  | "release_incomplete_conflict"
  | "released_revision_exists"
  | "obsolete_revision_locked"
  | "drawing_not_submittable";

export type DrawingSubmissionBlockerGroup =
  | "master_data_missing"
  | "attachment_conflict"
  | "submission_conflict"
  | "state_or_permission_blocked"
  | "system_recoverable";

export type ExistingSubmissionSummary = {
  submissionId: string;
  drawingNumber: string;
  revision: string;
  status: string;
  createdAt?: string;
  submittedByDisplayName?: string;
  releaseError?: string | null;
  resolvedBySubmissionId?: string | null;
  resolvedAt?: string | null;
  correctsSubmissionId?: string | null;
};

export type SameRevisionSubmissionRecord = ExistingSubmissionSummary & {
  userLabel: string;
  blocking: boolean;
  resolved: boolean;
  historyMessage: string;
};

export type DrawingSubmissionBlocker = {
  code: DrawingSubmissionBlockerCode;
  group: DrawingSubmissionBlockerGroup;
  severity: "blocker";
  message: string;
  recoveryHref: string;
  recoveryLabel?: string;
  existingSubmission?: ExistingSubmissionSummary;
};

export type DrawingSubmissionContext = {
  pdmCompany: {
    companyId: string;
    companyCode: string;
    displayName: string;
  };
  root: {
    id: string;
    rootCode: string;
    coreName: string;
    recordStatus: string;
    developmentPhase: string;
  };
  drawing: {
    id: string;
    drawingNumber: string;
    purposeCode: string;
    purposeLabel: string;
    recordStatus: string;
    developmentPhase: string;
    coreName: string;
  };
  primaryPart: null | {
    id: string;
    partNumber: string;
    partName: string;
    itemKind: string;
    material: string;
    surfaceFinish: string;
    processName: string;
    productSeries: string;
  };
  linkedParts: Array<{
    id: string;
    partNumber: string;
    partName: string;
    isPrimary: boolean;
  }>;
  attachments: DrawingSubmissionAttachment[];
  suggestedRevision: {
    revision: string;
    source: "revision_policy" | "latest_attachment" | "manual_master";
  };
  blockers: DrawingSubmissionBlocker[];
  sameRevisionRecords: SameRevisionSubmissionRecord[];
  nonBlockingHistory: Array<{ message: string; submissionId: string; href: string }>;
};

export type DrawingSubmissionAttachment = {
  id: string;
  displayName: string;
  fileName: string;
  fileExt: string;
  fileSize: number;
  documentCategory: string;
  revision: string | null;
  createdAt: string;
  eligibleForSubmission: boolean;
  ineligibleReason?: string;
  releaseConflict?: {
    submissionId: string;
    drawingNumber: string;
    revision: string;
    originalFilename: string;
  } | null;
};

export class DrawingSubmissionWorkbenchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details: string[] = [],
    public readonly options: {
      group?: DrawingSubmissionBlockerGroup;
      recoveryTarget?: string;
      recoveryHref?: string;
      existingSubmission?: ExistingSubmissionSummary;
      blockers?: DrawingSubmissionBlocker[];
    } = {}
  ) {
    super(message);
  }
}

type PdmCompany = DrawingSubmissionContext["pdmCompany"];

type DrawingRow = {
  id: string;
  part_root_id: string;
  drawing_number: string;
  purpose_code: string;
  purpose_description: string;
  development_phase: string;
  record_status: string;
  core_name: string | null;
  root_code: string;
  root_record_status: string;
  root_development_phase: string;
  rule_version_id: string;
};

type LinkedPartRow = {
  id: string;
  part_root_id: string;
  part_number: string;
  part_name: string;
  item_kind: string;
  development_phase: string;
  record_status: string;
  link_type: string;
  material_code: string | null;
  material_label: string | null;
  surface_treatment: string | null;
};

type AttachmentRow = {
  id: string;
  storage_key: string | null;
  original_path: string | null;
  file_name: string;
  file_ext: string | null;
  file_size: number | string | null;
  content_hash: string | null;
  document_category: string;
  display_name: string;
  revision: string | null;
  created_at: string;
};

const eligibleSubmissionExtensions = new Set(["slddrw", "sldprt", "sldasm", "pdf", "dwg"]);
const blockedDrawingStatuses = new Set(["Obsolete", "Merged", "EVTDisabled", "MainDrawingInvalid"]);
const submittablePrimaryPartKinds = new Set(["manufactured", "outsourced", "custom"]);
const snapshotRulesVersion = "drawing_part_submission_v1.2026-07-01";
const activeSubmissionStatusSql = "'Pending', 'Releasing'";
const sameRevisionInProgressMessage = "此圖號版次正在送審或發行中，請先查看既有送審或聯絡負責人。";
const releaseIncompleteMessage = "發行未完成：此圖號版次已通過審核，但尚未完成發行，需要主管或 Admin 處理。";
const releasedRevisionExistsMessage = "此圖號版次已進入正式紀錄，不能重複送審同一版次。";
const duplicateSubmissionMessage = sameRevisionInProgressMessage;
const duplicateActiveReviewMessage = "此圖號版次正在送審或發行中，請先處理其他進行中的同版次送審後再審核。";

type RootRow = {
  id: string;
  root_code: string;
  core_name: string;
  development_phase: string;
  record_status: string;
};

type PrimaryDrawingRow = {
  id: string;
  drawing_number: string;
  purpose_code: string;
  record_status: string;
};

type SubmissionAttemptStatus = "started" | "blocked" | "failed" | "created";

type SubmissionAttemptRow = {
  id: string;
  company_id: string;
  source_root_code: string;
  source_drawing_number: string | null;
  source_revision: string | null;
  idempotency_key: string;
  actor_id: string;
  status: SubmissionAttemptStatus;
  retryable: number | string | null;
  blocker_json: string | null;
  error_code: string | null;
  error_message: string | null;
  submission_id: string | null;
};

type ExistingSubmissionRow = {
  id: string;
  drawing_number: string;
  revision: string;
  status: string;
  created_at: string | null;
  submitted_by_name: string | null;
  release_error: string | null;
  resolved_by_submission_id: string | null;
  resolved_at: string | null;
  corrects_submission_id: string | null;
};

type ReviewSubmissionRow = ExistingSubmissionRow & {
  company_id: string;
};

export type DuplicateActiveSubmissionReviewConflict = {
  code: "same_revision_in_progress";
  group: "submission_conflict";
  message: string;
  currentSubmission: ExistingSubmissionSummary;
  activeSubmissions: ExistingSubmissionSummary[];
};

export async function resolveDrawingSubmissionContext(input: {
  company: PdmCompany;
  drawingNumber: string;
}): Promise<DrawingSubmissionContext> {
  const client = getAsyncDatabaseClient();
  const drawingNumber = normalizeText(input.drawingNumber);
  if (!drawingNumber) throw new DrawingSubmissionWorkbenchError("DRAWING_NUMBER_REQUIRED", "圖號為必填。", 400);

  const drawing = await findDrawing(client, input.company.companyId, drawingNumber);
  if (!drawing) throw new DrawingSubmissionWorkbenchError("drawing_number_not_found", "找不到此圖號，請確認圖號是否存在於目前公司。", 404);

  const linkedPartRows = await listLinkedParts(client, input.company.companyId, drawing.id);
  const rootPrimaryDrawings = await listRootPrimaryDrawings(client, input.company.companyId, drawing.part_root_id);
  const primaryPart = resolvePrimaryPart(linkedPartRows);
  const attachmentRows = await listDrawingAttachments(client, drawing.id);
  const attachments = (
    await enrichAttachmentsWithReleaseConflicts(client, attachmentRows.map(mapAttachment), primaryPart)
  ).sort(compareSubmissionAttachments);
  const revisions = await listSubmissionRevisionsByDrawingAsync({
    companyId: input.company.companyId,
    drawingNumber: drawing.drawing_number
  });
  const latestEligibleAttachment = attachments.find((attachment) => attachment.eligibleForSubmission && attachment.revision);
  const suggestedRevision = latestEligibleAttachment?.revision ?? suggestRevisionCode(revisions, "rd_workspace");
  const sameRevisionRecords = await listSameRevisionSubmissions(client, {
    companyId: input.company.companyId,
    drawingNumber: drawing.drawing_number,
    revision: suggestedRevision
  });
  const blockingSubmission = sameRevisionRecords.find((record) => record.blocking) ?? null;
  const blockers = buildBlockers({
    drawing,
    primaryPart,
    linkedPartRows,
    rootPrimaryDrawings,
    attachments,
    existingSubmission: blockingSubmission
  });

  return {
    pdmCompany: input.company,
    root: {
      id: drawing.part_root_id,
      rootCode: drawing.root_code,
      coreName: drawing.core_name ?? "",
      recordStatus: drawing.root_record_status,
      developmentPhase: drawing.root_development_phase
    },
    drawing: {
      id: drawing.id,
      drawingNumber: drawing.drawing_number,
      purposeCode: drawing.purpose_code,
      purposeLabel: drawing.purpose_code === "MA" ? "MA 製造圖" : "OT 其他圖",
      recordStatus: drawing.record_status,
      developmentPhase: drawing.development_phase,
      coreName: drawing.core_name ?? ""
    },
    primaryPart: primaryPart ? mapPrimaryPart(primaryPart) : null,
    linkedParts: linkedPartRows.map((part) => ({
      id: part.id,
      partNumber: part.part_number,
      partName: part.part_name,
      isPrimary: part.id === primaryPart?.id
    })),
    attachments,
    suggestedRevision: {
      revision: suggestedRevision,
      source: latestEligibleAttachment?.revision ? "latest_attachment" : "revision_policy"
    },
    blockers,
    sameRevisionRecords,
    nonBlockingHistory: sameRevisionRecords
      .filter((record) => !record.blocking)
      .map((record) => ({
        message: record.historyMessage,
        submissionId: record.submissionId,
        href: existingSubmissionRecoveryHref(record)
      }))
  };
}

export async function resolveRootSubmissionReadiness(input: {
  company: PdmCompany;
  rootCode: string;
}): Promise<DrawingSubmissionContext | { pdmCompany: PdmCompany; root: DrawingSubmissionContext["root"] | null; blockers: DrawingSubmissionContext["blockers"] }> {
  const client = getAsyncDatabaseClient();
  const rootCode = normalizeText(input.rootCode);
  if (!rootCode) throw new DrawingSubmissionWorkbenchError("ROOT_CODE_REQUIRED", "主根號為必填。", 400);
  const root = await findRoot(client, input.company.companyId, rootCode);
  if (!root) {
    return {
      pdmCompany: input.company,
      root: null,
      blockers: [
        makeSubmissionBlocker({
          code: "root_not_found",
          message: "找不到此主根號，請確認圖料關聯是否已建立。",
          recoveryHref: "/numbering/search"
        })
      ]
    };
  }
  const primaryDrawings = await listRootPrimaryDrawings(client, input.company.companyId, root.id);
  if (primaryDrawings.length === 0) {
    return {
      pdmCompany: input.company,
      root: mapRootForContext(root),
      blockers: [
        makeSubmissionBlocker({
          code: "missing_primary_drawing",
          message: "此主根號尚未指定主要圖號，請先在圖料模組設定主圖。",
          recoveryHref: `/numbering/search?query=${encodeURIComponent(root.root_code)}`
        })
      ]
    };
  }
  if (primaryDrawings.length > 1) {
    return {
      pdmCompany: input.company,
      root: mapRootForContext(root),
      blockers: [
        makeSubmissionBlocker({
          code: "multiple_primary_drawings",
          message: "此主根號有多個主要圖號，系統無法判定送審主圖，請先修正主圖設定。",
          recoveryHref: `/numbering/search?query=${encodeURIComponent(root.root_code)}`
        })
      ]
    };
  }
  return resolveDrawingSubmissionContext({ company: input.company, drawingNumber: primaryDrawings[0].drawing_number });
}

export async function createDrawingSourceSubmission(input: {
  company: PdmCompany;
  drawingNumber: string;
  selectedAttachmentIds: string[];
  note: string;
  submittedBy: string;
  idempotencyKey: string;
}) {
  const idempotencyKey = normalizeText(input.idempotencyKey);
  if (!idempotencyKey) {
    throw new DrawingSubmissionWorkbenchError("SUBMISSION_IDEMPOTENCY_KEY_REQUIRED", "送審缺少防重複識別碼，請重新整理後再送出。", 400);
  }
  const context = await resolveDrawingSubmissionContext({ company: input.company, drawingNumber: input.drawingNumber });
  const client = getAsyncDatabaseClient();
  const existingAttempt = await getSubmissionAttempt(client, {
    companyId: input.company.companyId,
    actorId: input.submittedBy,
    idempotencyKey
  });
  if (existingAttempt?.status === "created" && existingAttempt.submission_id) {
    return {
      submissionId: existingAttempt.submission_id,
      status: "Pending" as const,
      revision: existingAttempt.source_revision || context.suggestedRevision.revision,
      context,
      idempotentReplay: true
    };
  }
  if (existingAttempt?.status === "blocked") {
    const details = parseAttemptDetails(existingAttempt.blocker_json);
    const blockers = parseAttemptBlockers(existingAttempt.blocker_json);
    const primaryBlocker = blockers[0];
    throw new DrawingSubmissionWorkbenchError(
      existingAttempt.error_code || "DRAWING_SUBMISSION_BLOCKED",
      existingAttempt.error_message || (primaryBlocker ? primaryBlocker.message : "送審條件尚未完成，不能送審。"),
      409,
      details,
      {
        group: primaryBlocker?.group,
        recoveryHref: primaryBlocker?.recoveryHref,
        recoveryTarget: isSameRevisionBlockerCode(primaryBlocker?.code) ? "existing_submission" : undefined,
        existingSubmission: primaryBlocker?.existingSubmission,
        blockers
      }
    );
  }
  const selectedAttachmentIds = uniqueStrings(input.selectedAttachmentIds.map((id) => id.trim()).filter(Boolean));
  if (selectedAttachmentIds.length === 0) {
    await upsertSubmissionAttempt(client, {
      companyId: input.company.companyId,
      sourceRootCode: context.root.rootCode,
      sourceDrawingNumber: context.drawing.drawingNumber,
      sourceRevision: context.suggestedRevision.revision,
      idempotencyKey,
      actorId: input.submittedBy,
      status: "blocked",
      errorCode: "DRAWING_SUBMISSION_ATTACHMENT_REQUIRED",
      errorMessage: "請至少選擇一個圖面附件。",
      blockerMessages: ["請至少選擇一個圖面附件。"]
    });
    throw new DrawingSubmissionWorkbenchError("DRAWING_SUBMISSION_ATTACHMENT_REQUIRED", "請至少選擇一個圖面附件。", 400);
  }
  if (context.blockers.length > 0) {
    const primaryBlocker = pickPrimarySubmissionBlocker(context.blockers);
    const errorMessage = submissionBlockerSummary(context.blockers);
    await upsertSubmissionAttempt(client, {
      companyId: input.company.companyId,
      sourceRootCode: context.root.rootCode,
      sourceDrawingNumber: context.drawing.drawingNumber,
      sourceRevision: context.suggestedRevision.revision,
      idempotencyKey,
      actorId: input.submittedBy,
      status: "blocked",
      errorCode: primaryBlocker.code,
      errorMessage,
      blockerPayload: buildBlockedAttemptPayload({
        blockers: context.blockers,
        companyId: input.company.companyId,
        actorId: input.submittedBy,
        idempotencyKey,
        rootCode: context.root.rootCode,
        drawingNumber: context.drawing.drawingNumber,
        revision: context.suggestedRevision.revision
      })
    });
    throw new DrawingSubmissionWorkbenchError(
      primaryBlocker.code,
      errorMessage,
      409,
      context.blockers.map((blocker) => blocker.message),
      {
        group: primaryBlocker.group,
        recoveryHref: primaryBlocker.recoveryHref,
        recoveryTarget: isSameRevisionBlockerCode(primaryBlocker.code) ? "existing_submission" : undefined,
        existingSubmission: primaryBlocker.existingSubmission,
        blockers: context.blockers
      }
    );
  }
  if (!context.primaryPart) {
    await upsertSubmissionAttempt(client, {
      companyId: input.company.companyId,
      sourceRootCode: context.root.rootCode,
      sourceDrawingNumber: context.drawing.drawingNumber,
      sourceRevision: context.suggestedRevision.revision,
      idempotencyKey,
      actorId: input.submittedBy,
      status: "blocked",
      errorCode: "DRAWING_SUBMISSION_PRIMARY_PART_REQUIRED",
      errorMessage: "圖號尚未解析到主料號。",
      blockerMessages: ["圖號尚未解析到主料號。"]
    });
    throw new DrawingSubmissionWorkbenchError("DRAWING_SUBMISSION_PRIMARY_PART_REQUIRED", "圖號尚未解析到主料號。", 409);
  }

  const attachmentRows = await listDrawingAttachments(client, context.drawing.id);
  const attachmentRowById = new Map(attachmentRows.map((attachment) => [attachment.id, attachment]));
  const selectedRows = selectedAttachmentIds.map((id) => attachmentRowById.get(id));
  if (selectedRows.some((row) => !row)) {
    await upsertSubmissionAttempt(client, {
      companyId: input.company.companyId,
      sourceRootCode: context.root.rootCode,
      sourceDrawingNumber: context.drawing.drawingNumber,
      sourceRevision: context.suggestedRevision.revision,
      idempotencyKey,
      actorId: input.submittedBy,
      status: "blocked",
      errorCode: "DRAWING_SUBMISSION_ATTACHMENT_NOT_FOUND",
      errorMessage: "選取的附件不存在或已刪除。",
      blockerMessages: ["選取的附件不存在或已刪除。"]
    });
    throw new DrawingSubmissionWorkbenchError("DRAWING_SUBMISSION_ATTACHMENT_NOT_FOUND", "選取的附件不存在或已刪除。", 404);
  }
  const selectedAttachments = selectedRows.filter((row): row is AttachmentRow => Boolean(row));
  const selectedView = selectedAttachments.map(mapAttachment);
  const ineligible = selectedView.filter((attachment) => !attachment.eligibleForSubmission);
  if (ineligible.length > 0) {
    await upsertSubmissionAttempt(client, {
      companyId: input.company.companyId,
      sourceRootCode: context.root.rootCode,
      sourceDrawingNumber: context.drawing.drawingNumber,
      sourceRevision: context.suggestedRevision.revision,
      idempotencyKey,
      actorId: input.submittedBy,
      status: "blocked",
      errorCode: "DRAWING_SUBMISSION_ATTACHMENT_INELIGIBLE",
      errorMessage: "選取的附件不可作為送審檔。",
      blockerMessages: ineligible.map((attachment) => `${attachment.fileName}: ${attachment.ineligibleReason ?? "不支援的檔案類型"}`)
    });
    throw new DrawingSubmissionWorkbenchError(
      "DRAWING_SUBMISSION_ATTACHMENT_INELIGIBLE",
      "選取的附件不可作為送審檔。",
      400,
      ineligible.map((attachment) => `${attachment.fileName}: ${attachment.ineligibleReason ?? "不支援的檔案類型"}`)
    );
  }
  const duplicateFilename = findDuplicateAttachmentFilename(selectedView);
  if (duplicateFilename) {
    const message = `送審附件中有重複檔名：${duplicateFilename}。同一送審包不可使用相同檔名，請先移除或更名後再送審。`;
    const blocker = makeSubmissionBlocker({
      code: "duplicate_attachment_filename",
      group: "attachment_conflict",
      message,
      recoveryHref: `/numbering/drawings?query=${encodeURIComponent(context.drawing.drawingNumber)}`,
      recoveryLabel: "處理附件"
    });
    await upsertSubmissionAttempt(client, {
      companyId: input.company.companyId,
      sourceRootCode: context.root.rootCode,
      sourceDrawingNumber: context.drawing.drawingNumber,
      sourceRevision: context.suggestedRevision.revision,
      idempotencyKey,
      actorId: input.submittedBy,
      status: "blocked",
      errorCode: "duplicate_attachment_filename",
      errorMessage: message,
      blockerPayload: buildBlockedAttemptPayload({
        blocker,
        companyId: input.company.companyId,
        actorId: input.submittedBy,
        idempotencyKey,
        rootCode: context.root.rootCode,
        drawingNumber: context.drawing.drawingNumber,
        revision: context.suggestedRevision.revision
      })
    });
    throw new DrawingSubmissionWorkbenchError("duplicate_attachment_filename", message, 409, [message], {
      group: blocker.group,
      recoveryHref: blocker.recoveryHref,
      blockers: [blocker]
    });
  }
  const filenameConflict = await findReleasedFilenameConflictForAttachmentRows(client, selectedAttachments, context.primaryPart.partNumber);
  if (filenameConflict) {
    const message = releaseFilenameConflictMessage(filenameConflict);
    const blocker = makeSubmissionBlocker({
      code: "duplicate_attachment_filename",
      group: "attachment_conflict",
      message,
      recoveryHref: `/drawings/${encodeURIComponent(context.drawing.drawingNumber)}/submission-workbench`,
      recoveryLabel: "修正附件"
    });
    await upsertSubmissionAttempt(client, {
      companyId: input.company.companyId,
      sourceRootCode: context.root.rootCode,
      sourceDrawingNumber: context.drawing.drawingNumber,
      sourceRevision: context.suggestedRevision.revision,
      idempotencyKey,
      actorId: input.submittedBy,
      status: "blocked",
      errorCode: "release_filename_conflict",
      errorMessage: message,
      blockerPayload: buildBlockedAttemptPayload({
        blocker,
        companyId: input.company.companyId,
        actorId: input.submittedBy,
        idempotencyKey,
        rootCode: context.root.rootCode,
        drawingNumber: context.drawing.drawingNumber,
        revision: context.suggestedRevision.revision
      })
    });
    throw new DrawingSubmissionWorkbenchError("release_filename_conflict", message, 409, [message], {
      group: blocker.group,
      recoveryHref: blocker.recoveryHref,
      blockers: [blocker]
    });
  }

  const revision = revisionFromSelectedAttachments(selectedView) ?? context.suggestedRevision.revision;
  const existingRevisionSubmission = await findBlockingSubmissionByDrawingRevision(client, {
    companyId: input.company.companyId,
    drawingNumber: context.drawing.drawingNumber,
    revision
  });
  if (existingRevisionSubmission) {
    const blocker = makeDuplicateSubmissionBlocker(existingRevisionSubmission, context.drawing.drawingNumber, revision);
    await upsertSubmissionAttempt(client, {
      companyId: input.company.companyId,
      sourceRootCode: context.root.rootCode,
      sourceDrawingNumber: context.drawing.drawingNumber,
      sourceRevision: revision,
      idempotencyKey,
      actorId: input.submittedBy,
      status: "blocked",
      errorCode: blocker.code,
      errorMessage: blocker.message,
      blockerPayload: buildBlockedAttemptPayload({
        blocker,
        companyId: input.company.companyId,
        actorId: input.submittedBy,
        idempotencyKey,
        rootCode: context.root.rootCode,
        drawingNumber: context.drawing.drawingNumber,
        revision
      })
    });
    throw new DrawingSubmissionWorkbenchError(blocker.code, blocker.message, 409, [blocker.message], {
      group: blocker.group,
      recoveryTarget: isSameRevisionBlockerCode(blocker.code) ? "existing_submission" : undefined,
      recoveryHref: blocker.recoveryHref,
      existingSubmission: blocker.existingSubmission,
      blockers: [blocker]
    });
  }

  const note = normalizeText(input.note);
  const documentType = documentTypeFromAttachments(selectedView);
  const submissionInput = {
    drawingNumber: context.drawing.drawingNumber,
    partNumber: context.primaryPart.partNumber,
    partName: context.primaryPart.partName,
    revision,
    productLine: context.primaryPart.productSeries,
    customer: "",
    projectCode: "",
    processName: context.primaryPart.processName,
    machine: "",
    material: context.primaryPart.material,
    surfaceFinish: context.primaryPart.surfaceFinish,
    documentType,
    changeDescription: note,
    submittedBy: input.submittedBy
  };
  const validationErrors = validateSubmissionInput(submissionInput);
  if (validationErrors.length > 0) {
    await upsertSubmissionAttempt(client, {
      companyId: input.company.companyId,
      sourceRootCode: context.root.rootCode,
      sourceDrawingNumber: context.drawing.drawingNumber,
      sourceRevision: revision,
      idempotencyKey,
      actorId: input.submittedBy,
      status: "blocked",
      errorCode: "DRAWING_SUBMISSION_VALIDATION_FAILED",
      errorMessage: "送審資料驗證失敗。",
      blockerMessages: validationErrors
    });
    throw new DrawingSubmissionWorkbenchError("DRAWING_SUBMISSION_VALIDATION_FAILED", "送審資料驗證失敗。", 400, validationErrors);
  }
  await upsertSubmissionAttempt(client, {
    companyId: input.company.companyId,
    sourceRootCode: context.root.rootCode,
    sourceDrawingNumber: context.drawing.drawingNumber,
    sourceRevision: revision,
    idempotencyKey,
    actorId: input.submittedBy,
    status: "started"
  });

  const capturedAt = new Date().toISOString();
  const submissionFolderName = `SUB-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto
    .randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
  const files = await Promise.all(
    selectedAttachments.map(async (attachment) => ({
      filename: attachment.file_name,
      bytes: await readAttachmentBytes(attachment),
      sourceMasterAttachmentId: attachment.id
    }))
  );
  const savedFiles = await saveSubmissionFileBuffers(submissionFolderName, files);

  try {
    const submissionId = await createSubmissionRecordAsync({
      companyId: input.company.companyId,
      ...submissionInput,
      approvalRequired: 1,
      sourceEntityType: "drawing_number",
      sourceEntityId: context.drawing.id,
      files: savedFiles,
      snapshot: {
        sourceRootId: context.root.id,
        sourceRootCode: context.root.rootCode,
        sourceDrawingNumberId: context.drawing.id,
        sourceDrawingNumber: context.drawing.drawingNumber,
        sourcePartNumberId: context.primaryPart.id,
        sourcePartNumber: context.primaryPart.partNumber,
        rulesVersion: snapshotRulesVersion,
        capturedBy: input.submittedBy,
        capturedAt,
        snapshotJson: buildSnapshotBase({ context, revision, selectedView, note, submittedBy: input.submittedBy, capturedAt })
      }
    });
    await upsertSubmissionAttempt(client, {
      companyId: input.company.companyId,
      sourceRootCode: context.root.rootCode,
      sourceDrawingNumber: context.drawing.drawingNumber,
      sourceRevision: revision,
      idempotencyKey,
      actorId: input.submittedBy,
      status: "created",
      submissionId
    });
    return {
      submissionId,
      status: "Pending" as const,
      revision,
      context,
      idempotentReplay: false
    };
  } catch (error) {
    await removeSubmissionUploadFolder(submissionFolderName);
    if (isSubmissionRevisionUniqueError(error)) {
      const existingSubmission = await findBlockingSubmissionByDrawingRevision(client, {
        companyId: input.company.companyId,
        drawingNumber: context.drawing.drawingNumber,
        revision
      });
      const blocker = makeDuplicateSubmissionBlocker(existingSubmission, context.drawing.drawingNumber, revision);
      await upsertSubmissionAttempt(client, {
        companyId: input.company.companyId,
        sourceRootCode: context.root.rootCode,
        sourceDrawingNumber: context.drawing.drawingNumber,
        sourceRevision: revision,
        idempotencyKey,
        actorId: input.submittedBy,
        status: "blocked",
        errorCode: blocker.code,
        errorMessage: blocker.message,
        blockerPayload: buildBlockedAttemptPayload({
          blocker,
          companyId: input.company.companyId,
          actorId: input.submittedBy,
          idempotencyKey,
          rootCode: context.root.rootCode,
          drawingNumber: context.drawing.drawingNumber,
          revision
        })
      });
      throw new DrawingSubmissionWorkbenchError(blocker.code, blocker.message, 409, [blocker.message], {
        group: blocker.group,
        recoveryTarget: isSameRevisionBlockerCode(blocker.code) ? "existing_submission" : undefined,
        recoveryHref: blocker.recoveryHref,
        existingSubmission: blocker.existingSubmission,
        blockers: [blocker]
      });
    }
    await upsertSubmissionAttempt(client, {
      companyId: input.company.companyId,
      sourceRootCode: context.root.rootCode,
      sourceDrawingNumber: context.drawing.drawingNumber,
      sourceRevision: revision,
      idempotencyKey,
      actorId: input.submittedBy,
      status: "failed",
      errorCode: "DRAWING_SUBMISSION_CREATE_FAILED",
      errorMessage: error instanceof Error ? error.message : "送審建立失敗。",
      blockerMessages: [error instanceof Error ? error.message : "送審建立失敗。"],
      retryable: true
    });
    throw error;
  }
}

export async function returnReleaseFailedSubmissionForCorrectionAsync(input: {
  submissionId: string;
  actorId: string;
  reason: string;
  selectedAttachmentIds?: string[];
}) {
  const client = getAsyncDatabaseClient();
  const source = await getSubmissionAsync(input.submissionId);
  if (!source) {
    throw new DrawingSubmissionWorkbenchError("submission_not_found", "找不到送審資料。", 404);
  }
  if (source.status !== "ReleaseFailed") {
    throw new DrawingSubmissionWorkbenchError("submission_not_release_incomplete", "只有發行未完成的送審可以退回修正。", 409);
  }
  if (source.resolved_by_submission_id || source.resolved_at) {
    throw new DrawingSubmissionWorkbenchError("release_incomplete_already_resolved", "這筆發行未完成已由後續送審處理完成。", 409);
  }

  const existingCorrection = await client.queryOne<{ id: string }>(
    `
    SELECT id
    FROM submissions
    WHERE corrects_submission_id = :submissionId
      AND status IN ('Pending', 'Releasing')
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    { submissionId: input.submissionId }
  );
  if (existingCorrection) {
    throw new DrawingSubmissionWorkbenchError(
      "release_incomplete_correction_exists",
      "這筆發行未完成已經有退回修正中的送審，請先查看既有送審。",
      409,
      [],
      {
        group: "submission_conflict",
        recoveryHref: `/submissions/${encodeURIComponent(existingCorrection.id)}`,
        recoveryTarget: "existing_submission",
        existingSubmission: {
          submissionId: existingCorrection.id,
          drawingNumber: source.drawing_number,
          revision: source.revision,
          status: "Pending"
        }
      }
    );
  }

  const snapshot = await client.queryOne<{
    source_root_id: string;
    source_root_code: string;
    source_drawing_number_id: string;
    source_drawing_number: string;
    source_part_number_id: string;
    source_part_number: string;
    rules_version: string;
  }>(
    `
    SELECT
      source_root_id,
      source_root_code,
      source_drawing_number_id,
      source_drawing_number,
      source_part_number_id,
      source_part_number,
      rules_version
    FROM submission_snapshots
    WHERE submission_id = :submissionId
    LIMIT 1
    `,
    { submissionId: input.submissionId }
  );

  const correctionReason = normalizeText(input.reason) || "退回修正發行未完成。";
  const now = new Date().toISOString();
  const correctionSource = await buildReleaseFailedCorrectionFilesFromCurrentAttachments(client, {
    source,
    snapshot,
    selectedAttachmentIds: input.selectedAttachmentIds
  });
  const correctionInput: CreateSubmissionAsyncInput = {
    companyId: source.company_id ?? "company-jenfu",
    drawingNumber: source.drawing_number,
    partNumber: source.part_number,
    partName: source.part_name,
    revision: source.revision,
    productLine: source.product_line,
    customer: source.customer,
    projectCode: source.project_code,
    processName: source.process_name,
    machine: source.machine,
    material: source.material,
    surfaceFinish: source.surface_finish,
    documentType: documentTypeFromAttachments(correctionSource.selectedView),
    changeDescription: correctionReason,
    submittedBy: input.actorId,
    approvalRequired: source.approval_required === 2 ? 2 : 1,
    sourceEntityType: source.source_entity_type === "drawing_number" || source.source_entity_type === "part_number" ? source.source_entity_type : null,
    sourceEntityId: source.source_entity_id ?? null,
    correctsSubmissionId: source.id,
    files: correctionSource.savedFiles,
    snapshot: snapshot
      ? {
          sourceRootId: snapshot.source_root_id,
          sourceRootCode: snapshot.source_root_code,
          sourceDrawingNumberId: snapshot.source_drawing_number_id,
          sourceDrawingNumber: snapshot.source_drawing_number,
          sourcePartNumberId: snapshot.source_part_number_id,
          sourcePartNumber: snapshot.source_part_number,
          rulesVersion: snapshot.rules_version,
          capturedBy: input.actorId,
          capturedAt: now,
          snapshotJson: {
            snapshotVersion: "drawing_part_submission_v1",
            source: {
              module: "drawing_submission_workbench",
              correctionOfSubmissionId: source.id
            },
            capturedAt: now,
            capturedBy: input.actorId,
            submission: {
              revision: source.revision,
              note: correctionReason,
              status: "Pending",
              approvalRequired: source.approval_required
            },
            correctedSubmission: {
              id: source.id,
              status: source.status,
              releaseError: source.release_error
            },
            selectedSourceAttachments: correctionSource.selectedView.map((attachment) => ({
              id: attachment.id,
              fileName: attachment.fileName,
              fileRole: normalizeFileRole(attachment.fileName),
              fileExt: attachment.fileExt,
              fileSize: attachment.fileSize,
              documentCategory: attachment.documentCategory,
              revision: attachment.revision,
              createdAt: attachment.createdAt
            }))
          }
        }
      : undefined
  };

  let newSubmissionId: string;
  try {
    newSubmissionId = await client.transaction(async (transactionClient) => {
      const submissionId = await new AsyncSubmissionWriteRepository(transactionClient).createSubmissionRecord(correctionInput);
      await transactionClient.execute(
        `
        UPDATE submissions
        SET returned_for_correction_at = :now,
            returned_for_correction_by = :actorId,
            returned_for_correction_reason = :reason,
            updated_at = :now
        WHERE id = :submissionId
          AND status = 'ReleaseFailed'
          AND resolved_by_submission_id IS NULL
        `,
        {
          submissionId: source.id,
          actorId: input.actorId,
          reason: correctionReason,
          now
        }
      );
      return submissionId;
    });
  } catch (error) {
    await removeSubmissionUploadFolder(correctionSource.submissionFolderName);
    throw error;
  }

  return {
    submissionId: newSubmissionId,
    status: "Pending" as const,
    correctsSubmissionId: source.id,
    revision: source.revision
  };
}

async function buildReleaseFailedCorrectionFilesFromCurrentAttachments(
  client: AsyncDatabaseClient,
  input: {
    source: NonNullable<Awaited<ReturnType<typeof getSubmissionAsync>>>;
    snapshot: {
      source_drawing_number_id: string;
    } | null;
    selectedAttachmentIds?: string[];
  }
) {
  const sourceDrawingId =
    input.source.source_entity_type === "drawing_number" && input.source.source_entity_id
      ? input.source.source_entity_id
      : input.snapshot?.source_drawing_number_id;
  if (!sourceDrawingId) {
    throw new DrawingSubmissionWorkbenchError(
      "release_incomplete_correction_source_missing",
      "這筆發行未完成缺少來源圖號，不能建立修正送審。請通知主管或 Admin 檢查資料。",
      409
    );
  }

  const attachmentRows = await listDrawingAttachments(client, sourceDrawingId);
  const requestedAttachmentIds = uniqueStrings((input.selectedAttachmentIds ?? []).map(normalizeText).filter(Boolean));
  let selectedRows = attachmentRows.map((row) => ({ row, view: mapAttachment(row) }));
  if (requestedAttachmentIds.length > 0) {
    const rowById = new Map(selectedRows.map((entry) => [entry.row.id, entry]));
    selectedRows = requestedAttachmentIds.map((id) => rowById.get(id)).filter((entry): entry is { row: AttachmentRow; view: DrawingSubmissionAttachment } => Boolean(entry));
    if (selectedRows.length !== requestedAttachmentIds.length) {
      throw new DrawingSubmissionWorkbenchError(
        "release_incomplete_correction_attachment_missing",
        "選取的修正附件不存在或已刪除，請重新整理後再選一次。",
        409
      );
    }
  } else {
    selectedRows = selectedRows.filter(({ view }) => view.eligibleForSubmission && view.revision === input.source.revision);
  }
  selectedRows = selectedRows.sort((left, right) => compareSubmissionAttachments(left.view, right.view));
  const selectedView = selectedRows.map(({ view }) => view);
  if (selectedRows.length === 0) {
    throw new DrawingSubmissionWorkbenchError(
      "release_incomplete_correction_attachment_missing",
      `此圖號目前沒有版次 ${input.source.revision} 的可送審附件，請先在圖號附件庫上傳正確附件後再退回修正。`,
      409
    );
  }
  const ineligible = selectedView.filter((attachment) => !attachment.eligibleForSubmission);
  if (ineligible.length > 0) {
    throw new DrawingSubmissionWorkbenchError(
      "DRAWING_SUBMISSION_ATTACHMENT_INELIGIBLE",
      "選取的附件不可作為送審檔。",
      400,
      ineligible.map((attachment) => `${attachment.fileName}: ${attachment.ineligibleReason ?? "不支援的檔案類型"}`)
    );
  }
  const revisionMismatch = selectedView.find((attachment) => attachment.revision !== input.source.revision);
  if (revisionMismatch) {
    throw new DrawingSubmissionWorkbenchError(
      "release_incomplete_correction_revision_mismatch",
      `附件 ${revisionMismatch.fileName} 的版次不是 ${input.source.revision}，請選擇同版次附件後再建立修正送審。`,
      409
    );
  }

  const duplicateFilename = findDuplicateAttachmentFilename(selectedView);
  if (duplicateFilename) {
    throw new DrawingSubmissionWorkbenchError(
      "duplicate_attachment_filename",
      `送審附件中有重複檔名：${duplicateFilename}。同一送審包不可使用相同檔名，請先移除或更名後再退回修正。`,
      409
    );
  }
  const filenameConflict = await findReleasedFilenameConflictForAttachmentRows(client, selectedRows.map(({ row }) => row), input.source.part_number);
  if (filenameConflict) {
    throw new DrawingSubmissionWorkbenchError("release_filename_conflict", releaseFilenameConflictMessage(filenameConflict), 409);
  }

  const submissionFolderName = `SUB-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto
    .randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
  const files = await Promise.all(
    selectedRows.map(async ({ row }) => ({
      filename: row.file_name,
      bytes: await readAttachmentBytes(row),
      sourceMasterAttachmentId: row.id
    }))
  );
  const savedFiles = await saveSubmissionFileBuffers(submissionFolderName, files);
  return { submissionFolderName, savedFiles, selectedView };
}

export async function getDuplicateActiveSubmissionConflictForReviewAsync(
  submissionId: string
): Promise<DuplicateActiveSubmissionReviewConflict | null> {
  const client = getAsyncDatabaseClient();
  const current = await client.queryOne<ReviewSubmissionRow>(
    `
    SELECT
      s.id,
      s.company_id,
      s.drawing_number,
      s.revision,
      s.status,
      s.created_at,
      u.display_name AS submitted_by_name
    FROM submissions s
    LEFT JOIN users u ON u.id = s.submitted_by
    WHERE s.id = :submissionId
    LIMIT 1
    `,
    { submissionId }
  );
  if (!current) return null;
  const activeSubmissions = await listActiveSubmissionsByDrawingRevision(client, {
    companyId: current.company_id,
    drawingNumber: current.drawing_number,
    revision: current.revision
  });
  if (activeSubmissions.length <= 1) return null;
  return {
    code: "same_revision_in_progress",
    group: "submission_conflict",
    message: duplicateActiveReviewMessage,
    currentSubmission: mapExistingSubmissionSummary(current),
    activeSubmissions
  };
}

async function findDrawing(client: AsyncDatabaseClient, companyId: string, drawingNumber: string) {
  return client.queryOne<DrawingRow>(
    `
    SELECT
      d.*,
      r.core_name,
      r.root_code,
      r.record_status AS root_record_status,
      r.development_phase AS root_development_phase
    FROM drawing_numbers d
    JOIN part_roots r ON r.id = d.part_root_id AND r.company_id = d.company_id
    WHERE d.company_id = :companyId
      AND d.drawing_number = :drawingNumber
    LIMIT 1
    `,
    { companyId, drawingNumber }
  );
}

async function findRoot(client: AsyncDatabaseClient, companyId: string, rootCode: string) {
  return client.queryOne<RootRow>(
    `
    SELECT id, root_code, core_name, development_phase, record_status
    FROM part_roots
    WHERE company_id = :companyId
      AND root_code = :rootCode
    LIMIT 1
    `,
    { companyId, rootCode }
  );
}

async function listRootPrimaryDrawings(client: AsyncDatabaseClient, companyId: string, rootId: string) {
  return client.query<PrimaryDrawingRow>(
    `
    SELECT id, drawing_number, purpose_code, record_status
    FROM drawing_numbers
    WHERE company_id = :companyId
      AND part_root_id = :rootId
      AND purpose_code = 'MA'
      AND is_primary_manufacturing = 1
      AND record_status NOT IN ('Obsolete', 'Merged', 'EVTDisabled')
    ORDER BY drawing_number ASC
    `,
    { companyId, rootId }
  );
}

async function listLinkedParts(client: AsyncDatabaseClient, companyId: string, drawingNumberId: string) {
  return client.query<LinkedPartRow>(
    `
    SELECT
      p.id,
      p.part_root_id,
      p.part_number,
      p.part_name,
      p.item_kind,
      p.development_phase,
      p.record_status,
      l.link_type,
      va.material_code,
      va.material_label,
      va.surface_treatment
    FROM drawing_part_links l
    JOIN part_numbers p ON p.id = l.part_number_id
    LEFT JOIN part_variant_attributes va ON va.part_number_id = p.id
    WHERE l.drawing_number_id = :drawingNumberId
      AND p.company_id = :companyId
    ORDER BY CASE WHEN l.link_type = 'primary_manufacturing' THEN 0 ELSE 1 END, p.part_number ASC
    `,
    { companyId, drawingNumberId }
  );
}

async function listDrawingAttachments(client: AsyncDatabaseClient, drawingNumberId: string) {
  return client.query<AttachmentRow>(
    `
    SELECT
      id,
      storage_key,
      original_path,
      file_name,
      file_ext,
      file_size,
      content_hash,
      document_category,
      display_name,
      revision,
      created_at
    FROM file_assets
    WHERE linked_entity_type = 'drawing_number'
      AND linked_entity_id = :drawingNumberId
      AND deleted_at IS NULL
    ORDER BY created_at DESC, file_name ASC
    `,
    { drawingNumberId }
  );
}

async function findBlockingSubmissionByDrawingRevision(
  client: AsyncDatabaseClient,
  input: { companyId: string; drawingNumber: string; revision: string }
): Promise<ExistingSubmissionSummary | null> {
  const row = await client.queryOne<ExistingSubmissionRow>(
    `
    SELECT
      s.id,
      s.drawing_number,
      s.revision,
      s.status,
      s.created_at,
      s.release_error,
      s.resolved_by_submission_id,
      s.resolved_at,
      s.corrects_submission_id,
      u.display_name AS submitted_by_name
    FROM submissions s
    LEFT JOIN users u ON u.id = s.submitted_by
    WHERE s.company_id = :companyId
      AND s.drawing_number = :drawingNumber
      AND s.revision = :revision
      AND (
        s.status IN ('Pending', 'Releasing', 'Released', 'Obsolete')
        OR (s.status = 'ReleaseFailed' AND s.resolved_by_submission_id IS NULL)
      )
    ORDER BY
      CASE
        WHEN s.status IN (${activeSubmissionStatusSql}) THEN 0
        WHEN s.status = 'ReleaseFailed' AND s.resolved_by_submission_id IS NULL THEN 1
        WHEN s.status = 'Released' THEN 2
        WHEN s.status = 'Obsolete' THEN 3
        ELSE 4
      END,
      s.created_at ASC,
      s.id ASC
    LIMIT 1
    `,
    input
  );
  return row ? mapExistingSubmissionSummary(row) : null;
}

async function listSameRevisionSubmissions(
  client: AsyncDatabaseClient,
  input: { companyId: string; drawingNumber: string; revision: string }
): Promise<SameRevisionSubmissionRecord[]> {
  const rows = await client.query<ExistingSubmissionRow>(
    `
    SELECT
      s.id,
      s.drawing_number,
      s.revision,
      s.status,
      s.created_at,
      s.release_error,
      s.resolved_by_submission_id,
      s.resolved_at,
      s.corrects_submission_id,
      u.display_name AS submitted_by_name
    FROM submissions s
    LEFT JOIN users u ON u.id = s.submitted_by
    WHERE s.company_id = :companyId
      AND s.drawing_number = :drawingNumber
      AND s.revision = :revision
    ORDER BY
      CASE
        WHEN s.status IN ('Pending', 'Releasing') THEN 0
        WHEN s.status = 'ReleaseFailed' AND s.resolved_by_submission_id IS NULL THEN 1
        WHEN s.status = 'Released' THEN 2
        WHEN s.status = 'Obsolete' THEN 3
        ELSE 4
      END,
      s.created_at ASC,
      s.id ASC
    `,
    input
  );
  return rows.map(mapSameRevisionSubmissionRecord);
}

async function listActiveSubmissionsByDrawingRevision(
  client: AsyncDatabaseClient,
  input: { companyId: string; drawingNumber: string; revision: string }
): Promise<ExistingSubmissionSummary[]> {
  const rows = await client.query<ExistingSubmissionRow>(
    `
    SELECT
      s.id,
      s.drawing_number,
      s.revision,
      s.status,
      s.created_at,
      s.release_error,
      s.resolved_by_submission_id,
      s.resolved_at,
      s.corrects_submission_id,
      u.display_name AS submitted_by_name
    FROM submissions s
    LEFT JOIN users u ON u.id = s.submitted_by
    WHERE s.company_id = :companyId
      AND s.drawing_number = :drawingNumber
      AND s.revision = :revision
      AND s.status IN (${activeSubmissionStatusSql})
    ORDER BY s.created_at ASC, s.id ASC
    `,
    input
  );
  return rows.map(mapExistingSubmissionSummary);
}

function mapExistingSubmissionSummary(row: ExistingSubmissionRow): ExistingSubmissionSummary {
  return {
    submissionId: row.id,
    drawingNumber: row.drawing_number,
    revision: row.revision,
    status: row.status,
    createdAt: row.created_at ?? undefined,
    submittedByDisplayName: row.submitted_by_name ?? undefined,
    releaseError: row.release_error ?? null,
    resolvedBySubmissionId: row.resolved_by_submission_id ?? null,
    resolvedAt: row.resolved_at ?? null,
    correctsSubmissionId: row.corrects_submission_id ?? null
  };
}

function mapSameRevisionSubmissionRecord(row: ExistingSubmissionRow): SameRevisionSubmissionRecord {
  const summary = mapExistingSubmissionSummary(row);
  const resolved = row.status === "ReleaseFailed" && Boolean(row.resolved_by_submission_id || row.resolved_at);
  const blocking =
    row.status === "Pending" ||
    row.status === "Releasing" ||
    row.status === "Released" ||
    row.status === "Obsolete" ||
    (row.status === "ReleaseFailed" && !resolved);
  return {
    ...summary,
    userLabel: sameRevisionStatusLabel(summary),
    blocking,
    resolved,
    historyMessage: sameRevisionHistoryMessage(summary, resolved)
  };
}

function resolvePrimaryPart(rows: LinkedPartRow[]) {
  const primaryRows = rows.filter((row) => row.link_type === "primary_manufacturing");
  if (primaryRows.length === 1) return primaryRows[0];
  if (primaryRows.length === 0 && rows.length === 1) return rows[0];
  return null;
}

function mapPrimaryPart(row: LinkedPartRow): NonNullable<DrawingSubmissionContext["primaryPart"]> {
  return {
    id: row.id,
    partNumber: row.part_number,
    partName: row.part_name,
    itemKind: row.item_kind,
    material: normalizeText(row.material_label) || normalizeText(row.material_code),
    surfaceFinish: normalizeText(row.surface_treatment),
    processName: "",
    productSeries: ""
  };
}

function mapAttachment(row: AttachmentRow): DrawingSubmissionAttachment {
  const fileExt = normalizeFileExt(row.file_ext || extensionFromFilename(row.file_name));
  const eligibleForSubmission = eligibleSubmissionExtensions.has(fileExt);
  return {
    id: row.id,
    displayName: normalizeText(row.display_name) || row.file_name,
    fileName: row.file_name,
    fileExt,
    fileSize: Number(row.file_size ?? 0),
    documentCategory: row.document_category,
    revision: normalizeText(row.revision) || null,
    createdAt: row.created_at,
    eligibleForSubmission,
    ineligibleReason: eligibleForSubmission ? undefined : "此附件格式不可直接送審"
  };
}

type ReleasedFilenameConflictRow = {
  submission_id: string;
  drawing_number: string;
  revision: string;
  original_filename: string;
};

async function enrichAttachmentsWithReleaseConflicts(
  client: AsyncDatabaseClient,
  attachments: DrawingSubmissionAttachment[],
  primaryPart: LinkedPartRow | null
) {
  const enriched: DrawingSubmissionAttachment[] = [];
  for (const attachment of attachments) {
    if (!attachment.eligibleForSubmission) {
      enriched.push(attachment);
      continue;
    }
    const conflict = await findReleasedFilenameConflict(client, {
      fileRole: normalizeFileRole(attachment.fileName),
      filename: attachment.fileName,
      partNumber: primaryPart?.part_number ?? null
    });
    enriched.push({
      ...attachment,
      releaseConflict: conflict
        ? {
            submissionId: conflict.submission_id,
            drawingNumber: conflict.drawing_number,
            revision: conflict.revision,
            originalFilename: conflict.original_filename
          }
        : null
    });
  }
  return enriched;
}

async function findReleasedFilenameConflictForAttachmentRows(
  client: AsyncDatabaseClient,
  attachments: AttachmentRow[],
  partNumber: string
) {
  for (const attachment of attachments) {
    const conflict = await findReleasedFilenameConflict(client, {
      fileRole: normalizeFileRole(attachment.file_name),
      filename: attachment.file_name,
      partNumber
    });
    if (conflict) return conflict;
  }
  return null;
}

async function findReleasedFilenameConflict(
  client: AsyncDatabaseClient,
  input: { fileRole: string; filename: string; partNumber: string | null }
) {
  return client.queryOne<ReleasedFilenameConflictRow>(
    `
    SELECT
      s.id AS submission_id,
      s.drawing_number,
      s.revision,
      f.original_filename
    FROM submission_files f
    JOIN submissions s ON s.id = f.submission_id
    JOIN items i ON i.id = s.item_id
    WHERE s.status = 'Released'
      AND f.file_role = :fileRole
      AND lower(f.original_filename) = lower(:filename)
      AND (:partNumber IS NULL OR i.part_number <> :partNumber)
    ORDER BY COALESCE(s.released_at, s.updated_at, s.created_at) DESC, s.id DESC
    LIMIT 1
    `,
    input
  );
}

function releaseFilenameConflictMessage(conflict: ReleasedFilenameConflictRow) {
  return `附件 ${conflict.original_filename} 已被正式紀錄 ${conflict.drawing_number} 版次 ${conflict.revision} 使用，請先移除或更換附件後再送審。`;
}

function makeSubmissionBlocker(input: {
  code: DrawingSubmissionBlockerCode;
  message: string;
  recoveryHref: string;
  group?: DrawingSubmissionBlockerGroup;
  recoveryLabel?: string;
  existingSubmission?: ExistingSubmissionSummary;
}): DrawingSubmissionBlocker {
  return {
    code: input.code,
    group: input.group ?? classifySubmissionBlocker(input.code),
    severity: "blocker",
    message: input.message,
    recoveryHref: input.recoveryHref,
    recoveryLabel: input.recoveryLabel,
    existingSubmission: input.existingSubmission
  };
}

function existingSubmissionRecoveryHref(existingSubmission: ExistingSubmissionSummary | null | undefined) {
  if (!existingSubmission?.submissionId) return "/";
  return `/submissions/${encodeURIComponent(existingSubmission.submissionId)}`;
}

function classifySubmissionBlocker(code: DrawingSubmissionBlockerCode): DrawingSubmissionBlockerGroup {
  if (isSameRevisionBlockerCode(code)) return "submission_conflict";
  if (code === "duplicate_attachment_filename" || code === "release_filename_conflict" || code === "missing_attachment") return "attachment_conflict";
  if (code === "drawing_not_submittable") return "state_or_permission_blocked";
  if (code === "drawing_number_not_found") return "system_recoverable";
  return "master_data_missing";
}

function buildBlockers(input: {
  drawing: DrawingRow;
  primaryPart: LinkedPartRow | null;
  linkedPartRows: LinkedPartRow[];
  rootPrimaryDrawings: PrimaryDrawingRow[];
  attachments: DrawingSubmissionAttachment[];
  existingSubmission: ExistingSubmissionSummary | null;
}) {
  const recoveryHref = `/numbering/drawings?query=${encodeURIComponent(input.drawing.drawing_number)}`;
  const blockers: DrawingSubmissionContext["blockers"] = [];
  const linkedRootIds = uniqueStrings(input.linkedPartRows.map((row) => row.part_root_id).filter(Boolean));
  if (input.linkedPartRows.length === 0) {
    blockers.push(makeSubmissionBlocker({
      code: "drawing_part_link_missing",
      message: "此圖號尚未連到主根號，請先建立圖料關聯。",
      recoveryHref
    }));
  }
  if (linkedRootIds.length > 1 || (linkedRootIds.length === 1 && linkedRootIds[0] !== input.drawing.part_root_id)) {
    blockers.push(makeSubmissionBlocker({
      code: "ambiguous_root",
      message: "此圖號連到多個主根號，系統無法判定送審來源，請先修正圖料關聯。",
      recoveryHref
    }));
  }
  if (input.rootPrimaryDrawings.length > 1) {
    blockers.push(makeSubmissionBlocker({
      code: "multiple_primary_drawings",
      message: "此主根號有多個主要圖號，系統無法判定送審主圖，請先修正主圖設定。",
      recoveryHref
    }));
  }
  if (input.linkedPartRows.filter((row) => row.link_type === "primary_manufacturing").length > 1) {
    blockers.push(makeSubmissionBlocker({
      code: "multiple_primary_parts",
      message: "此主根號有多個主料號，系統無法判定送審主料，請先修正主料設定。",
      recoveryHref
    }));
  }
  if (blockedDrawingStatuses.has(input.drawing.record_status)) {
    blockers.push(makeSubmissionBlocker({
      code: "drawing_not_submittable",
      message: `圖號狀態為 ${input.drawing.record_status}，不可送審。`,
      recoveryHref
    }));
  }
  if (!input.primaryPart) {
    blockers.push(makeSubmissionBlocker({
      code: "missing_primary_part",
      message:
        input.linkedPartRows.length > 1
          ? "此圖號關聯多個料號，但未指定主要料號。請先在圖號模組完成關聯主料號。"
          : "此圖號尚未關聯料號。請先在圖號模組完成圖料關係。",
      recoveryHref
    }));
  } else {
    const part = mapPrimaryPart(input.primaryPart);
    if (!submittablePrimaryPartKinds.has(input.primaryPart.item_kind)) {
      blockers.push(makeSubmissionBlocker({
        code: "primary_part_not_manufacturing",
        message: "主料號不是可送審的製造料，請先修正圖料關聯。",
        recoveryHref
      }));
    }
    if (!part.material) {
      blockers.push(makeSubmissionBlocker({
        code: "missing_material",
        message: "主要料號尚未完成材質主資料。請回圖號/料號模組補齊，不可在送審頁補填。",
        recoveryHref
      }));
    }
    if (!part.surfaceFinish) {
      blockers.push(makeSubmissionBlocker({
        code: "missing_surface_finish",
        message: "主要料號尚未完成表面處理主資料。請回圖號/料號模組補齊，不可在送審頁補填。",
        recoveryHref
      }));
    }
  }
  if (!input.attachments.some((attachment) => attachment.eligibleForSubmission)) {
    blockers.push(makeSubmissionBlocker({
      code: "missing_attachment",
      message: "此圖號尚無可送審的圖面/CAD/PDF/DWG 附件。請先在圖號附件庫上傳。",
      recoveryHref
    }));
  }
  if (input.existingSubmission) {
    blockers.push(makeSameRevisionSubmissionBlocker(input.existingSubmission));
  }
  return blockers;
}

function mapRootForContext(root: RootRow): DrawingSubmissionContext["root"] {
  return {
    id: root.id,
    rootCode: root.root_code,
    coreName: root.core_name,
    recordStatus: root.record_status,
    developmentPhase: root.development_phase
  };
}

async function getSubmissionAttempt(
  client: AsyncDatabaseClient,
  input: { companyId: string; actorId: string; idempotencyKey: string }
) {
  return client.queryOne<SubmissionAttemptRow>(
    `
    SELECT
      id,
      company_id,
      source_root_code,
      source_drawing_number,
      source_revision,
      idempotency_key,
      actor_id,
      status,
      retryable,
      blocker_json,
      error_code,
      error_message,
      submission_id
    FROM submission_attempts
    WHERE company_id = :companyId
      AND actor_id = :actorId
      AND idempotency_key = :idempotencyKey
    LIMIT 1
    `,
    input
  );
}

async function upsertSubmissionAttempt(
  client: AsyncDatabaseClient,
  input: {
    companyId: string;
    sourceRootCode: string;
    sourceDrawingNumber?: string | null;
    sourceRevision?: string | null;
    idempotencyKey: string;
    actorId: string;
    status: SubmissionAttemptStatus;
    submissionId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    blockerMessages?: string[];
    blockerPayload?: unknown;
    retryable?: boolean;
  }
) {
  const now = new Date().toISOString();
  await client.execute(
    `
    INSERT INTO submission_attempts (
      id,
      company_id,
      source_root_code,
      source_drawing_number,
      source_revision,
      idempotency_key,
      actor_id,
      status,
      retryable,
      blocker_json,
      error_code,
      error_message,
      submission_id,
      created_at,
      updated_at
    ) VALUES (
      :id,
      :companyId,
      :sourceRootCode,
      :sourceDrawingNumber,
      :sourceRevision,
      :idempotencyKey,
      :actorId,
      :status,
      :retryable,
      :blockerJson,
      :errorCode,
      :errorMessage,
      :submissionId,
      :now,
      :now
    )
    ON CONFLICT(company_id, actor_id, idempotency_key) DO UPDATE SET
      source_root_code = excluded.source_root_code,
      source_drawing_number = excluded.source_drawing_number,
      source_revision = excluded.source_revision,
      status = excluded.status,
      retryable = excluded.retryable,
      blocker_json = excluded.blocker_json,
      error_code = excluded.error_code,
      error_message = excluded.error_message,
      submission_id = excluded.submission_id,
      updated_at = excluded.updated_at
    `,
    {
      id: crypto.randomUUID(),
      companyId: input.companyId,
      sourceRootCode: input.sourceRootCode,
      sourceDrawingNumber: input.sourceDrawingNumber ?? null,
      sourceRevision: input.sourceRevision ?? null,
      idempotencyKey: input.idempotencyKey,
      actorId: input.actorId,
      status: input.status,
      retryable: input.retryable ? 1 : 0,
      blockerJson: JSON.stringify(input.blockerPayload ?? input.blockerMessages ?? []),
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      submissionId: input.submissionId ?? null,
      now
    }
  );
}

function parseAttemptDetails(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === "object" && item !== null && "message" in item ? String(item.message) : String(item)))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseAttemptBlockers(value: string | null): DrawingSubmissionBlocker[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item !== "object" || item === null) return null;
        const record = item as Partial<DrawingSubmissionBlocker>;
        if (!record.code || !record.message || !record.recoveryHref) return null;
        return makeSubmissionBlocker({
          code: record.code,
          group: record.group,
          message: record.message,
          recoveryHref: record.recoveryHref,
          recoveryLabel: record.recoveryLabel,
          existingSubmission: record.existingSubmission
        });
      })
      .filter((item): item is DrawingSubmissionBlocker => Boolean(item));
  } catch {
    return [];
  }
}

function makeDuplicateSubmissionBlocker(
  existingSubmission: ExistingSubmissionSummary | null,
  drawingNumber: string,
  revision: string
): DrawingSubmissionBlocker {
  if (existingSubmission) return makeSameRevisionSubmissionBlocker(existingSubmission);
  return makeSubmissionBlocker({
    code: "same_revision_in_progress",
    group: "submission_conflict",
    message: `圖號 ${drawingNumber} 版次 ${revision} 已有進行中的送審，不能重複建立。`,
    recoveryHref: "/",
    recoveryLabel: "查看既有送審"
  });
}

function makeSameRevisionSubmissionBlocker(existingSubmission: ExistingSubmissionSummary): DrawingSubmissionBlocker {
  const code = sameRevisionBlockerCode(existingSubmission);
  return makeSubmissionBlocker({
    code,
    group: "submission_conflict",
    message: sameRevisionBlockerMessage(code),
    recoveryHref: existingSubmissionRecoveryHref(existingSubmission),
    recoveryLabel: sameRevisionRecoveryLabel(code),
    existingSubmission
  });
}

function sameRevisionBlockerCode(existingSubmission: ExistingSubmissionSummary): DrawingSubmissionBlockerCode {
  if (existingSubmission.status === "ReleaseFailed") return "release_incomplete_conflict";
  if (existingSubmission.status === "Released") return "released_revision_exists";
  if (existingSubmission.status === "Obsolete") return "obsolete_revision_locked";
  return "same_revision_in_progress";
}

function sameRevisionBlockerMessage(code: DrawingSubmissionBlockerCode) {
  if (code === "release_incomplete_conflict") return releaseIncompleteMessage;
  if (code === "released_revision_exists" || code === "obsolete_revision_locked") return releasedRevisionExistsMessage;
  return sameRevisionInProgressMessage;
}

function sameRevisionRecoveryLabel(code: DrawingSubmissionBlockerCode) {
  if (code === "release_incomplete_conflict") return "處理發行未完成";
  if (code === "released_revision_exists" || code === "obsolete_revision_locked") return "查看正式紀錄";
  return "查看既有送審";
}

function isSameRevisionBlockerCode(code: string | undefined): code is DrawingSubmissionBlockerCode {
  return (
    code === "duplicate_active_submission" ||
    code === "same_revision_in_progress" ||
    code === "release_incomplete_conflict" ||
    code === "released_revision_exists" ||
    code === "obsolete_revision_locked"
  );
}

function sameRevisionStatusLabel(summary: ExistingSubmissionSummary) {
  if (summary.status === "Pending") return "正在送審中";
  if (summary.status === "Releasing") return "正在發行中";
  if (summary.status === "ReleaseFailed" && summary.resolvedBySubmissionId) return "發行未完成，已處理";
  if (summary.status === "ReleaseFailed") return "發行未完成";
  if (summary.status === "Rejected") return "已駁回";
  if (summary.status === "Cancelled") return "已取消";
  if (summary.status === "Released") return "已發布";
  if (summary.status === "Obsolete") return "已作廢";
  return summary.status;
}

function sameRevisionHistoryMessage(summary: ExistingSubmissionSummary, resolved: boolean) {
  if (summary.status === "Rejected" || summary.status === "Cancelled") return "曾有未完成送審，不影響本次送審。";
  if (summary.status === "ReleaseFailed" && resolved) return "發行未完成，已由新版送審處理完成。";
  return sameRevisionBlockerMessage(sameRevisionBlockerCode(summary));
}

function pickPrimarySubmissionBlocker(blockers: DrawingSubmissionBlocker[]) {
  return (
    blockers.find((blocker) => blocker.group === "submission_conflict") ??
    blockers.find((blocker) => blocker.group === "master_data_missing") ??
    blockers.find((blocker) => blocker.group === "attachment_conflict") ??
    blockers[0]
  );
}

function submissionBlockerSummary(blockers: DrawingSubmissionBlocker[]) {
  const groups = new Set(blockers.map((blocker) => blocker.group));
  if (groups.size === 1 && groups.has("submission_conflict")) return blockers[0]?.message ?? duplicateSubmissionMessage;
  if (groups.size === 1 && groups.has("attachment_conflict")) return "附件選取需修正，不能送審。";
  if (groups.has("submission_conflict")) return "送審條件尚未完成，且此圖號與版次已有送審紀錄。請先處理下列阻擋原因。";
  if (groups.has("state_or_permission_blocked")) return "目前狀態或權限不可送審。";
  return "主資料尚未完成，不能送審。";
}

function buildBlockedAttemptPayload(input: {
  blocker?: DrawingSubmissionBlocker;
  blockers?: DrawingSubmissionBlocker[];
  companyId: string;
  actorId: string;
  idempotencyKey: string;
  rootCode: string;
  drawingNumber: string;
  revision: string;
}) {
  const blockers = input.blockers ?? (input.blocker ? [input.blocker] : []);
  const occurredAt = new Date().toISOString();
  return blockers.map((blocker) => ({
    ...blocker,
    companyId: input.companyId,
    actorId: input.actorId,
    sourceRootCode: input.rootCode,
    drawingNumber: input.drawingNumber,
    revision: input.revision,
    idempotencyKey: input.idempotencyKey,
    existingSubmissionId: blocker.existingSubmission?.submissionId,
    recoveryTarget: isSameRevisionBlockerCode(blocker.code) ? "existing_submission" : undefined,
    occurredAt
  }));
}

function isSubmissionRevisionUniqueError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("UNIQUE constraint failed: submissions.company_id, submissions.drawing_number, submissions.revision") ||
    message.includes("UNIQUE constraint failed: submissions.drawing_number, submissions.revision") ||
    message.includes("submissions_company_id_drawing_number_revision") ||
    (message.includes("submissions.drawing_number") && message.includes("submissions.revision"))
  );
}

function findDuplicateAttachmentFilename(attachments: DrawingSubmissionAttachment[]) {
  const seen = new Set<string>();
  for (const attachment of attachments) {
    const key = `${normalizeFileRole(attachment.fileName)}:${attachment.fileName.trim().toLowerCase()}`;
    if (seen.has(key)) return attachment.fileName;
    seen.add(key);
  }
  return "";
}

function buildSnapshotBase(input: {
  context: DrawingSubmissionContext;
  revision: string;
  selectedView: DrawingSubmissionAttachment[];
  note: string;
  submittedBy: string;
  capturedAt: string;
}): Record<string, unknown> {
  return {
    snapshotVersion: "drawing_part_submission_v1",
    rulesVersion: snapshotRulesVersion,
    source: {
      module: "drawing_part_workbench",
      route: `/api/numbering/drawings/${encodeURIComponent(input.context.drawing.drawingNumber)}/submissions`
    },
    capturedAt: input.capturedAt,
    capturedBy: input.submittedBy,
    company: input.context.pdmCompany,
    root: input.context.root,
    drawing: input.context.drawing,
    primaryPart: input.context.primaryPart,
    linkedParts: input.context.linkedParts,
    submission: {
      revision: input.revision,
      note: input.note,
      status: "Pending",
      approvalRequired: 1
    },
    readiness: {
      blockerCount: input.context.blockers.length,
      blockers: input.context.blockers
    },
    selectedSourceAttachments: input.selectedView.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      fileRole: normalizeFileRole(attachment.fileName),
      fileExt: attachment.fileExt,
      fileSize: attachment.fileSize,
      documentCategory: attachment.documentCategory,
      revision: attachment.revision,
      createdAt: attachment.createdAt
    }))
  };
}

async function readAttachmentBytes(attachment: AttachmentRow) {
  const storage = createFileStorageService();
  const storageKey = attachment.storage_key || (attachment.original_path ? storageKeyFromLocalPath(attachment.original_path) : "");
  if (!storageKey) throw new DrawingSubmissionWorkbenchError("DRAWING_SUBMISSION_ATTACHMENT_PATH_MISSING", "附件缺少本機儲存路徑。", 500);
  return storage.readObject(storageKey);
}

function revisionFromSelectedAttachments(attachments: DrawingSubmissionAttachment[]) {
  const revisions = uniqueStrings(attachments.map((attachment) => attachment.revision ?? "").filter(Boolean));
  return revisions.length === 1 ? revisions[0] : null;
}

function documentTypeFromAttachments(attachments: DrawingSubmissionAttachment[]) {
  const primary = [...attachments].sort(compareSubmissionAttachments)[0];
  if (!primary) return "Drawing";
  if (primary.fileExt === "sldprt") return "Part";
  if (primary.fileExt === "sldasm") return "Assembly";
  if (primary.fileExt === "pdf") return "PDF";
  if (primary.fileExt === "dwg") return "DWG";
  return "Drawing";
}

function compareSubmissionAttachments(left: DrawingSubmissionAttachment, right: DrawingSubmissionAttachment) {
  return attachmentPriority(left) - attachmentPriority(right) || right.createdAt.localeCompare(left.createdAt) || left.fileName.localeCompare(right.fileName);
}

function attachmentPriority(attachment: DrawingSubmissionAttachment) {
  if (!attachment.eligibleForSubmission) return 99;
  if (attachment.fileExt === "slddrw") return 0;
  if (attachment.documentCategory === "drawing_2d") return 1;
  if (attachment.fileExt === "pdf") return 2;
  if (attachment.fileExt === "dwg") return 3;
  if (attachment.fileExt === "sldasm") return 4;
  if (attachment.fileExt === "sldprt") return 5;
  return 10;
}

function extensionFromFilename(filename: string) {
  const index = filename.lastIndexOf(".");
  return index > 0 && index < filename.length - 1 ? filename.slice(index + 1) : "";
}

function normalizeFileExt(value: string) {
  return value.trim().toLowerCase().replace(/^\./u, "");
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}
