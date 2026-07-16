import type { SubmissionDetail } from "@/lib/types";
import { findReleasedFilenameConflicts, getSystemSetting, updateFileGDriveStatus } from "@/lib/db";
import { moveFileToFolder, moveFileToParents, setFileAppProperties } from "@/lib/gdrive";

type ReleaseMode = "auto" | "local_stub" | "strict";

function getReleaseMode(): ReleaseMode {
  const rawMode = (process.env.PDM_RELEASE_MODE ?? "auto").trim();
  if (rawMode === "auto" || rawMode === "local_stub" || rawMode === "strict") return rawMode;
  throw new Error(`INVALID_RELEASE_MODE: PDM_RELEASE_MODE must be auto, local_stub, or strict. Received ${rawMode}`);
}

function canUseLocalDevStub(mode: ReleaseMode) {
  if (mode === "strict") return false;
  if (mode === "local_stub") return true;
  return process.env.NODE_ENV !== "production";
}

export async function releaseSubmissionViaCloudFunction(submission: SubmissionDetail, approvedBy: string) {
  const files = submission.files.map((file) => ({
    fileRole: file.file_role,
    gdriveFileId: file.gdrive_file_id,
    originalFilename: file.original_filename
  }));
  const conflicts = findReleasedFilenameConflicts({
    submissionId: submission.id,
    files: submission.files.map((file) => ({
      file_role: file.file_role,
      original_filename: file.original_filename
    }))
  });

  if (conflicts.length > 0) {
    const names = conflicts.map((conflict) => `${conflict.original_filename} (${conflict.drawing_number} rev ${conflict.revision})`);
    throw new Error(`DUPLICATE_RELEASE_FILENAME: ${names.join(", ")}`);
  }

  const releaseFunctionUrl = process.env.RELEASE_FUNCTION_URL ?? "";
  const releaseFunctionToken = process.env.RELEASE_FUNCTION_TOKEN ?? "";
  const envPendingFolderId = process.env.GOOGLE_DRIVE_PENDING_FOLDER_ID ?? "";
  const envReleasedFolderId = process.env.GOOGLE_DRIVE_RELEASED_FOLDER_ID ?? "";
  const releaseMode = getReleaseMode();

  if (!releaseFunctionUrl) {
    const releasedFolderId = getSystemSetting("gdrive_released_folder_id") || envReleasedFolderId;
    const legacyLocalDriveRelease = (process.env.PDM_STORAGE_PROVIDER?.trim() || "local_repository") === "local_repository";
    if (releasedFolderId && legacyLocalDriveRelease) {
      const movedFiles = [];
      const compensatedFiles: Array<{ fileId: string; previousParents: string[]; dbFileId: string; filename: string }> = [];
      const approvedAt = new Date().toISOString();
      for (const file of submission.files) {
        if (file.gdrive_status === "moved") {
          movedFiles.push(file.original_filename);
          continue;
        }
        if (file.gdrive_file_id && file.gdrive_status === "uploaded") {
          try {
            const moveResult = await moveFileToFolder(file.gdrive_file_id, releasedFolderId);
            compensatedFiles.push({
              fileId: file.gdrive_file_id,
              previousParents: moveResult.previousParents,
              dbFileId: file.id,
              filename: file.original_filename
            });
            await setFileAppProperties(file.gdrive_file_id, {
              Status: "Official",
              SubmissionId: submission.id,
              DrawingNumber: submission.drawing_number,
              Revision: submission.revision,
              ApprovedBy: approvedBy,
              ApprovedAt: approvedAt
            });
            updateFileGDriveStatus(file.id, "moved");
            movedFiles.push(file.original_filename);
          } catch (error) {
            await compensateMovedFiles(compensatedFiles);
            throw new Error(
              `LOCAL_GDRIVE_RELEASE_FAILED: ${file.original_filename}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
      return {
        mode: "local-gdrive",
        released: true,
        message: `Moved ${movedFiles.length} file(s) to Released folder.`,
        files
      };
    }

    if (!canUseLocalDevStub(releaseMode)) {
      throw new Error(
        "RELEASE_NOT_CONFIGURED: configure RELEASE_FUNCTION_URL or GOOGLE_DRIVE_RELEASED_FOLDER_ID before approving releases."
      );
    }

    return {
      mode: "local-dev-stub",
      released: true,
      message: "PDM_RELEASE_MODE allows local-dev stub; no external release integration was configured.",
      files
    };
  }

  const pendingFolderId = getSystemSetting("gdrive_pending_folder_id") || envPendingFolderId;
  const releasedFolderId = getSystemSetting("gdrive_released_folder_id") || envReleasedFolderId;
  const approvedAt = new Date().toISOString();

  const response = await fetch(releaseFunctionUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(releaseFunctionToken ? { authorization: `Bearer ${releaseFunctionToken}` } : {})
    },
    body: JSON.stringify({
      submissionId: submission.id,
      approvedBy,
      drawingNumber: submission.drawing_number,
      revision: submission.revision,
      files,
      pendingFolderId,
      releasedFolderId,
      approvedAt
    })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error ?? `Release function failed with HTTP ${response.status}`);
  }

  return body;
}

async function compensateMovedFiles(files: Array<{ fileId: string; previousParents: string[]; dbFileId: string; filename: string }>) {
  const failures = [];
  for (const file of files.reverse()) {
    try {
      await moveFileToParents(file.fileId, file.previousParents);
      updateFileGDriveStatus(file.dbFileId, "uploaded");
    } catch (error) {
      failures.push(`${file.filename}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`LOCAL_GDRIVE_COMPENSATION_FAILED: ${failures.join("; ")}`);
  }
}
