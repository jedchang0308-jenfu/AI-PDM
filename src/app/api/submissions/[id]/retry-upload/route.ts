import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getSubmission, getFilesNeedingUpload, updateFileGDriveStatus, getSystemSetting, createAuditLog } from "@/lib/db";
import { uploadFileToDrive } from "@/lib/gdrive";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = getSubmission(id);

  if (!submission) {
    return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  }

  const pendingFolderId = getSystemSetting("gdrive_pending_folder_id") || (process.env.GOOGLE_DRIVE_PENDING_FOLDER_ID ?? "");
  if (!pendingFolderId) {
    return NextResponse.json({ error: "待審核資料夾 ID 尚未設定" }, { status: 400 });
  }

  const files = getFilesNeedingUpload(id);
  if (files.length === 0) {
    return NextResponse.json({ message: "沒有失敗或遺失的上傳項目", filesProcessed: 0 });
  }

  let successCount = 0;
  let failureCount = 0;

  for (const file of files) {
    try {
      updateFileGDriveStatus(file.id, "uploading");
      const gdriveFileId = await uploadFileToDrive({
        localPath: file.local_path,
        filename: file.original_filename,
        targetFolderId: pendingFolderId
      });
      updateFileGDriveStatus(file.id, "uploaded", gdriveFileId);
      successCount++;
    } catch (error) {
      console.error(`Retry upload failed for file ${file.id}:`, error);
      updateFileGDriveStatus(file.id, "failed");
      failureCount++;
    }
  }

  createAuditLog({
    submissionId: id,
    actorId: auth.user.id,
    action: "RetryUpload",
    detail: { successCount, failureCount, totalAttempted: files.length }
  });

  if (failureCount > 0) {
    return NextResponse.json(
      { error: `${failureCount} files failed to upload`, successCount, failureCount },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, successCount });
}
