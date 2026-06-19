import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { SubmissionFile } from "@/lib/types";

export const SELECT_ASYNC_SUBMISSION_FILE_SQL = `
  SELECT *
  FROM submission_files
  WHERE submission_id = :submissionId
    AND id = :fileId
`;

export const SELECT_ASYNC_FILES_NEEDING_UPLOAD_SQL = `
  SELECT *
  FROM submission_files
  WHERE submission_id = :submissionId
    AND gdrive_status IN ('none', 'failed')
  ORDER BY created_at ASC, id ASC
`;

export const UPDATE_ASYNC_FILE_GDRIVE_STATUS_SQL = `
  UPDATE submission_files
  SET gdrive_status = :gdriveStatus
  WHERE id = :fileId
`;

export const UPDATE_ASYNC_FILE_GDRIVE_STATUS_WITH_ID_SQL = `
  UPDATE submission_files
  SET gdrive_status = :gdriveStatus,
      gdrive_file_id = :gdriveFileId
  WHERE id = :fileId
`;

export class AsyncSubmissionFileRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async getSubmissionFile(input: { submissionId: string; fileId: string }): Promise<SubmissionFile | null> {
    const file = await this.client.queryOne<SubmissionFile>(SELECT_ASYNC_SUBMISSION_FILE_SQL, input);
    return file ? normalizeSubmissionFile(file) : null;
  }

  async getFilesNeedingUpload(submissionId: string): Promise<SubmissionFile[]> {
    const files = await this.client.query<SubmissionFile>(SELECT_ASYNC_FILES_NEEDING_UPLOAD_SQL, { submissionId });
    return files.map(normalizeSubmissionFile);
  }

  async updateFileGDriveStatus(fileId: string, gdriveStatus: string, gdriveFileId?: string | null): Promise<void> {
    if (gdriveFileId !== undefined) {
      await this.client.execute(UPDATE_ASYNC_FILE_GDRIVE_STATUS_WITH_ID_SQL, {
        fileId,
        gdriveStatus,
        gdriveFileId
      });
      return;
    }

    await this.client.execute(UPDATE_ASYNC_FILE_GDRIVE_STATUS_SQL, {
      fileId,
      gdriveStatus
    });
  }
}

function normalizeSubmissionFile(file: SubmissionFile): SubmissionFile {
  return {
    ...file,
    file_size: Number(file.file_size ?? 0)
  };
}
