import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { createDrawingSourceSubmission, DrawingSubmissionWorkbenchError } from "@/lib/drawing-submission-workbench";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { revisionPolicySuggestionFromBody } from "@/lib/revision-policy-engine";
import { buildTransferPackageHref, normalizeSubmissionMode, resolveSubmissionReadiness } from "@/lib/submission-gate";
import { triggerBackgroundUpload } from "@/lib/submission-background-upload";
import { getSystemSettingAsync } from "@/lib/system-settings-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ drawingNumber: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const { drawingNumber } = await params;
  const decodedDrawingNumber = decodeURIComponent(drawingNumber);
  const submissionMode = normalizeSubmissionMode(body.submissionMode);
  const caseType = typeof body.caseType === "string" ? body.caseType : null;
  if (submissionMode === "technical_transfer") {
    const transferPackageHref = buildTransferPackageHref({
      sourceType: "drawing",
      sourceId: decodedDrawingNumber,
      sourceLabel: decodedDrawingNumber,
      caseType
    });
    const readiness = resolveSubmissionReadiness({
      mode: "technical_transfer",
      caseType,
      sourceType: "drawing",
      sourceId: decodedDrawingNumber,
      facts: {
        hasReviewableAttachment: Array.isArray(body.selectedAttachmentIds) && body.selectedAttachmentIds.length > 0
      }
    });
    return NextResponse.json(
      {
        error: "technical_transfer_requires_package",
        code: "technical_transfer_requires_package",
        group: "submission_gate",
        message: "技術移轉送審需先建立移轉包，不能從單一圖號直接建立正式送審。",
        recoveryTarget: "transfer_package",
        recoveryHref: transferPackageHref,
        blockers: readiness.blockers
      },
      { status: 409 }
    );
  }

  const expectedRevision = String(body.expectedRevision ?? "").trim() || null;
  const revisionPolicySuggestion = revisionPolicySuggestionFromBody({
    revisionPolicySuggestion: body["revisionPolicySuggestion"],
    revision_policy_suggestion: body["revision_policy_suggestion"]
  });
  const workflowIntent = String(body.workflowIntent ?? body.workflow_intent ?? revisionPolicySuggestion?.workflowIntent ?? "rd_workspace");
  const revisionOverrideReason = String(body["revisionOverrideReason"] ?? body["revision_override_reason"] ?? "").trim() || null;
  const rawPartNumberIds = body.partNumberIds ?? body.part_number_ids;
  try {
    const result = await createDrawingSourceSubmission({
      company: companyResult.company,
      drawingNumber: decodedDrawingNumber,
      currentPartNumberId: String(body.currentPartNumberId ?? body.current_part_number_id ?? "").trim() || null,
      partNumberIds: Array.isArray(rawPartNumberIds)
        ? rawPartNumberIds.map((value) => String(value).trim()).filter(Boolean)
        : [],
      expectedRevision,
      workflowIntent,
      revisionPolicySuggestion,
      revisionOverrideReason,
      selectedAttachmentIds: Array.isArray(body.selectedAttachmentIds)
        ? body.selectedAttachmentIds.map((value) => String(value))
        : [],
      note: String(body.note ?? ""),
      submittedBy: auth.user.id,
      idempotencyKey: String(body.idempotencyKey ?? "")
    });

    const pendingFolderId =
      (await getSystemSettingAsync("gdrive_pending_folder_id")) || (process.env.GOOGLE_DRIVE_PENDING_FOLDER_ID ?? "");
    if (pendingFolderId) {
      triggerBackgroundUpload(result.submissionId, pendingFolderId).catch(console.error);
    }

    return NextResponse.json(
      {
        submissionId: result.submissionId,
        status: result.status,
        revision: result.revision,
        pdmCompany: companyResult.company
      },
      { status: 201 }
    );
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
    const message = error instanceof Error ? error.message : "DRAWING_SUBMISSION_CREATE_FAILED";
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
      { error: "DRAWING_SUBMISSION_CREATE_FAILED", message: "送審建立失敗，請稍後重試或通知管理員。" },
      { status: 500 }
    );
  }
}
