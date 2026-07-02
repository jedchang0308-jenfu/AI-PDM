import { NextResponse } from "next/server";
import { requireRoleAsync } from "@/lib/auth-async";
import { createDrawingSourceSubmission, DrawingSubmissionWorkbenchError } from "@/lib/drawing-submission-workbench";
import { uploadFileToDrive } from "@/lib/gdrive";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getFilesNeedingUploadAsync, updateFileGDriveStatusAsync } from "@/lib/submission-files-async";
import { getSystemSettingAsync } from "@/lib/system-settings-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ drawingNumber: string }> }) {
  const auth = await requireRoleAsync(request, ["Engineer", "Admin"]);
  if (auth.response) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const { drawingNumber } = await params;
  try {
    const result = await createDrawingSourceSubmission({
      company: companyResult.company,
      drawingNumber: decodeURIComponent(drawingNumber),
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
