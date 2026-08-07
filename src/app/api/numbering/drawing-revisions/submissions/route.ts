import { NextResponse } from "next/server";
import { createAuditLogAsync } from "@/lib/audit-async";
import { createDrawingSourceSubmission, DrawingSubmissionWorkbenchError } from "@/lib/drawing-submission-workbench";
import { markDrawingRevisionPackageCancelledForSubmissionAsync } from "@/lib/drawing-revision-packages-async";
import { uploadFileToDrive } from "@/lib/gdrive";
import { getFilesNeedingUploadAsync, updateFileGDriveStatusAsync } from "@/lib/submission-files-async";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { buildPdmChangeControlActor } from "@/lib/pdm-change-control-api";
import {
  PdmChangeControlError,
  submitDrawingRevisionFffAssessment,
  type DrawingRevisionFffState,
  type PartNumberDraftItemType
} from "@/lib/pdm-change-control";
import { normalizeRevisionPackageFileRole } from "@/lib/revision-package";
import { revisionPolicySuggestionFromBody } from "@/lib/revision-policy-engine";
import { cancelPendingSubmissionAsync } from "@/lib/submission-status-async";
import { getSystemSettingAsync } from "@/lib/system-settings-async";
import {
  drawingRevisionLifecycleErrorPayload,
  isDrawingRevisionLifecycleEnforced,
  submitDrawingRevisionLifecycle
} from "@/lib/drawing-revision-lifecycle";

export const runtime = "nodejs";

const fffStates = new Set(["no_impact", "suspected_impact", "confirmed_impact"]);
const itemTypes = new Set(["self_made", "purchased", "standard"]);

export async function POST(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.draft.update");
  if (auth.response) return auth.response;
  if (!["Engineer", "Admin"].includes(auth.user.role)) {
    return NextResponse.json(
      { error: "drawing_revision_submission_forbidden", message: "你目前不能建立圖面進版送審，請由工程或 Admin 角色處理。" },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const drawingNumber = nullableText(body.drawingNumber ?? body.drawing_number);
  const revision = nullableText(body.revision);
  const reasonCategory = nullableText(body.reasonCategory ?? body.reason_category);
  const formState = normalizeEnum(body.formState ?? body.form_state, fffStates) as DrawingRevisionFffState | undefined;
  const fitState = normalizeEnum(body.fitState ?? body.fit_state, fffStates) as DrawingRevisionFffState | undefined;
  const functionState = normalizeEnum(body.functionState ?? body.function_state, fffStates) as DrawingRevisionFffState | undefined;
  const selectedAttachmentIds = Array.isArray(body.selectedAttachmentIds)
    ? body.selectedAttachmentIds.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const revisionPolicySuggestion = revisionPolicySuggestionFromBody(body);
  const workflowIntent = nullableText(body.workflowIntent ?? body.workflow_intent) ?? revisionPolicySuggestion?.workflowIntent ?? "rd_workspace";
  const revisionOverrideReason = nullableText(body.revisionOverrideReason ?? body.revision_override_reason);
  const currentPartNumberId = nullableText(body.currentPartNumberId ?? body.current_part_number_id);
  const partNumberIds = normalizeTextArray(body.partNumberIds ?? body.part_number_ids);
  const packageFileRoles = Array.isArray(body.packageFileRoles)
    ? body.packageFileRoles
        .map((value) => {
          if (!value || typeof value !== "object") return null;
          const entry = value as Record<string, unknown>;
          const attachmentId = String(entry.attachmentId ?? entry.attachment_id ?? "").trim();
          const role = normalizeRevisionPackageFileRole(entry.role);
          return attachmentId && role ? { attachmentId, role } : null;
        })
        .filter((value): value is { attachmentId: string; role: NonNullable<ReturnType<typeof normalizeRevisionPackageFileRole>> } => Boolean(value))
    : [];
  const errors: string[] = [];

  if (!drawingNumber) errors.push("drawingNumber is required");
  if (!revision) errors.push("revision is required");
  if (!reasonCategory) errors.push("reasonCategory is required");
  if (!formState) errors.push("formState is required");
  if (!fitState) errors.push("fitState is required");
  if (!functionState) errors.push("functionState is required");
  if (selectedAttachmentIds.length === 0) errors.push("selectedAttachmentIds is required");
  if (errors.length > 0 || !drawingNumber || !revision || !reasonCategory || !formState || !fitState || !functionState) {
    return NextResponse.json({ error: "Invalid drawing revision submission", details: errors }, { status: 400 });
  }

  if (isDrawingRevisionLifecycleEnforced()) {
    try {
      const lifecycle = await submitDrawingRevisionLifecycle({
        company: companyResult.company,
        drawingNumber,
        currentPartNumberId,
        partNumberIds,
        fffAssessment: { formState, fitState, functionState },
        expectedRevision: revision,
        workflowIntent,
        revisionPolicySuggestion,
        revisionOverrideReason,
        selectedAttachmentIds,
        packageFileRoles,
        reasonCategory,
        note: String(body.note ?? ""),
        submittedBy: auth.user.id,
        idempotencyKey: String(
          body.idempotencyKey ??
          request.headers.get("idempotency-key") ??
          request.headers.get("x-idempotency-key") ??
          ""
        )
      });
      return NextResponse.json(
        {
          ...lifecycle,
          lifecycle: true,
          submissionId: null,
          status: lifecycle.lifecycleState,
          outcome: lifecycle.displayStatus,
          pdmCompany: companyResult.company
        },
        { status: lifecycle.cleanupPending ? 202 : 201 }
      );
    } catch (error) {
      const failure = drawingRevisionLifecycleErrorPayload(error);
      return NextResponse.json(failure.body, { status: failure.status });
    }
  }

  try {
    const submissionResult = await createDrawingSourceSubmission({
      company: companyResult.company,
      drawingNumber,
      currentPartNumberId,
      partNumberIds,
      fffAssessment: { formState, fitState, functionState },
      expectedRevision: revision,
      workflowIntent,
      revisionPolicySuggestion,
      revisionOverrideReason,
      selectedAttachmentIds,
      packageFileRoles,
      note: String(body.note ?? ""),
      submittedBy: auth.user.id,
      idempotencyKey: String(body.idempotencyKey ?? "")
    });

    try {
      const actor = buildPdmChangeControlActor(auth, companyResult.company.companyId);
      const assessmentResult = await submitDrawingRevisionFffAssessment({
        drawingNumberId: submissionResult.context.drawing.id,
        revision: submissionResult.revision,
        formState,
        fitState,
        functionState,
        reasonCategory,
        note: nullableText(body.note),
        submissionId: submissionResult.submissionId,
        reviewPackageId: nullableText(body.reviewPackageId ?? body.review_package_id),
        currentPartNumberId: submissionResult.context.primaryPart?.id ?? null,
        replacementReservedPartNumber: nullableText(body.replacementReservedPartNumber ?? body.replacement_reserved_part_number),
        replacementItemType: normalizeEnum(body.replacementItemType ?? body.replacement_item_type, itemTypes) as PartNumberDraftItemType | undefined,
        detectedPartNumber: nullableText(body.detectedPartNumber ?? body.detected_part_number),
        correctedPartNumber: nullableText(body.correctedPartNumber ?? body.corrected_part_number),
        actor
      });

      const pendingFolderId =
        (await getSystemSettingAsync("gdrive_pending_folder_id")) || (process.env.GOOGLE_DRIVE_PENDING_FOLDER_ID ?? "");
      if (pendingFolderId) {
        triggerBackgroundUpload(submissionResult.submissionId, pendingFolderId).catch(console.error);
      }

      return NextResponse.json(
        {
          submissionId: submissionResult.submissionId,
          packageId: submissionResult.packageId,
          status: submissionResult.status,
          revision: submissionResult.revision,
          outcome: assessmentResult.outcome,
          assessment: assessmentResult.assessment,
          replacementDraft: assessmentResult.replacementDraft,
          packageWarnings: submissionResult.packageWarnings,
          idempotentReplay: submissionResult.idempotentReplay,
          pdmCompany: companyResult.company
        },
        { status: 201 }
      );
    } catch (error) {
      const submissionCancelled = !submissionResult.idempotentReplay
        ? await cancelIncompleteRevisionSubmission(submissionResult.submissionId, auth.user.id, error)
        : false;
      return drawingRevisionFffErrorResponse(error, submissionResult.submissionId, submissionCancelled);
    }
  } catch (error) {
    if (error instanceof DrawingSubmissionWorkbenchError) {
      return NextResponse.json(
        {
          error: error.code,
          code: error.code,
          group: error.options.group,
          message: error.message,
          details: error.details,
          recoveryTarget: error.options.recoveryTarget,
          recoveryHref: error.options.recoveryHref,
          existingSubmission: error.options.existingSubmission,
          blockers: error.options.blockers
        },
        { status: error.status }
      );
    }
    const message = error instanceof Error ? error.message : "";
    if (
      message.includes("UNIQUE constraint failed: submissions.company_id, submissions.drawing_number, submissions.revision") ||
      message.includes("UNIQUE constraint failed: submissions.drawing_number, submissions.revision")
    ) {
      return NextResponse.json(
        {
          error: "duplicate_active_submission",
          code: "duplicate_active_submission",
          group: "submission_conflict",
          message: "此圖號與版次已有送審紀錄，不能重複建立。請查看既有送審，或先完成/退回該送審後再處理新版次。",
          recoveryTarget: "existing_submission",
          recoveryHref: "/"
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "DRAWING_REVISION_SUBMISSION_CREATE_FAILED", message: "圖面進版送審建立失敗，請稍後重試或通知管理員。" },
      { status: 500 }
    );
  }
}

async function cancelIncompleteRevisionSubmission(submissionId: string, actorId: string, cause: unknown) {
  const reason = "圖面進版 FFF 判定建立失敗，系統取消未完整送審。";
  try {
    await cancelPendingSubmissionAsync({ id: submissionId, actorId, reason });
    await markDrawingRevisionPackageCancelledForSubmissionAsync({ submissionId, actorId, reason });
    await createAuditLogAsync({
      submissionId,
      actorId,
      action: "drawing_revision_submission.cancelled_after_fff_failure",
      detail: {
        reason,
        error: cause instanceof Error ? cause.message : String(cause ?? "")
      }
    });
    return true;
  } catch (error) {
    console.error(`Failed to cancel incomplete drawing revision submission ${submissionId}:`, error);
    return false;
  }
}

function drawingRevisionFffErrorResponse(error: unknown, cancelledSubmissionId: string, submissionCancelled: boolean) {
  if (error instanceof PdmChangeControlError) {
    return NextResponse.json(
      {
        error: error.code,
        message: error.message,
        details: error.details,
        cancelledSubmissionId,
        submissionCancelled
      },
      { status: statusForPdmChangeControlError(error.code) }
    );
  }
  return NextResponse.json(
    {
      error: "DRAWING_REVISION_FFF_ASSESSMENT_FAILED",
      message: submissionCancelled ? "圖面進版送審已取消：FFF 判定建立失敗，請修正資料後重送。" : "圖面進版 FFF 判定建立失敗，請修正資料後重送。",
      cancelledSubmissionId,
      submissionCancelled
    },
    { status: 400 }
  );
}

function statusForPdmChangeControlError(code: string) {
  if (code.includes("not_found")) return 404;
  if (code.includes("forbidden")) return 403;
  if (code.includes("optimistic_lock_conflict")) return 409;
  if (code.includes("already") || code.includes("controlled_boundary") || code.includes("not_") || code.includes("reused")) return 409;
  return 400;
}

function normalizeEnum(value: unknown, allowed: Set<string>) {
  const text = String(value ?? "").trim();
  return allowed.has(text) ? text : undefined;
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeTextArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry ?? "").trim()).filter(Boolean)));
}

async function triggerBackgroundUpload(submissionId: string, folderId: string) {
  const files = await getFilesNeedingUploadAsync(submissionId);

  for (const file of files) {
    try {
      await updateFileGDriveStatusAsync(file.id, "uploading");
      const gdriveFileId = await uploadFileToDrive({
        localPath: file.local_path,
        filename: file.original_filename,
        targetFolderId: folderId
      });
      await updateFileGDriveStatusAsync(file.id, "uploaded", gdriveFileId);
    } catch (error) {
      console.error(`Failed to upload file ${file.id} to Drive:`, error);
      await updateFileGDriveStatusAsync(file.id, "failed");
    }
  }
}
