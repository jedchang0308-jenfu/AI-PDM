import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncSubmissionFileRepository } from "@/lib/repositories/submission-file-async-repository";

export async function getSubmissionFileAsync(input: { submissionId: string; fileId: string }) {
  return new AsyncSubmissionFileRepository(getAsyncDatabaseClient()).getSubmissionFile(input);
}

export async function getFilesNeedingUploadAsync(submissionId: string) {
  return new AsyncSubmissionFileRepository(getAsyncDatabaseClient()).getFilesNeedingUpload(submissionId);
}

export async function updateFileGDriveStatusAsync(fileId: string, gdriveStatus: string, gdriveFileId?: string | null) {
  return new AsyncSubmissionFileRepository(getAsyncDatabaseClient()).updateFileGDriveStatus(
    fileId,
    gdriveStatus,
    gdriveFileId
  );
}
