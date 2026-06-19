import { NextResponse } from "next/server";
import { createAuditLogAsync } from "@/lib/audit-async";
import { forbidden, requireRoleAsync } from "@/lib/auth-async";
import { uploadFileToDrive } from "@/lib/gdrive";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { getFilesNeedingUploadAsync, updateFileGDriveStatusAsync } from "@/lib/submission-files-async";
import { getSubmissionAsync } from "@/lib/submissions-async";
import { getSystemSettingAsync } from "@/lib/system-settings-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const submission = await getSubmissionAsync(id);

  if (!submission) {
    return NextResponse.json({ error: "?曆??圈祟鞈?" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();

  const pendingFolderId = (await getSystemSettingAsync("gdrive_pending_folder_id")) || (process.env.GOOGLE_DRIVE_PENDING_FOLDER_ID ?? "");
  if (!pendingFolderId) {
    return NextResponse.json({ error: "敺祟?貉??冗 ID 撠閮剖?" }, { status: 400 });
  }

  const files = await getFilesNeedingUploadAsync(id);
  if (files.length === 0) {
    return NextResponse.json({ message: "瘝?憭望??憭梁?銝?", filesProcessed: 0 });
  }

  let successCount = 0;
  let failureCount = 0;

  for (const file of files) {
    try {
      await updateFileGDriveStatusAsync(file.id, "uploading");
      const gdriveFileId = await uploadFileToDrive({
        localPath: file.local_path,
        filename: file.original_filename,
        targetFolderId: pendingFolderId
      });
      await updateFileGDriveStatusAsync(file.id, "uploaded", gdriveFileId);
      successCount++;
    } catch (error) {
      console.error(`Retry upload failed for file ${file.id}:`, error);
      await updateFileGDriveStatusAsync(file.id, "failed");
      failureCount++;
    }
  }

  await createAuditLogAsync({
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

