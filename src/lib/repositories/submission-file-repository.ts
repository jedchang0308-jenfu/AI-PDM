import { getDb } from "@/lib/db";
import type { SubmissionFile } from "@/lib/types";

export function getSubmissionFile(input: { submissionId: string; fileId: string }) {
  return getDb()
    .prepare("SELECT * FROM submission_files WHERE submission_id = ? AND id = ?")
    .get(input.submissionId, input.fileId) as SubmissionFile | undefined;
}

export function updateFileGDriveStatus(
  fileId: string,
  gdriveStatus: string,
  gdriveFileId?: string | null
) {
  if (gdriveFileId !== undefined) {
    getDb()
      .prepare("UPDATE submission_files SET gdrive_status = ?, gdrive_file_id = ? WHERE id = ?")
      .run(gdriveStatus, gdriveFileId, fileId);
  } else {
    getDb()
      .prepare("UPDATE submission_files SET gdrive_status = ? WHERE id = ?")
      .run(gdriveStatus, fileId);
  }
}

export function getFilesNeedingUpload(submissionId: string) {
  return getDb()
    .prepare(
      "SELECT * FROM submission_files WHERE submission_id = ? AND gdrive_status IN ('none', 'failed') AND storage_provider = 'local_repository'"
    )
    .all(submissionId) as SubmissionFile[];
}

export function findReleasedFilenameConflicts(input: {
  submissionId: string;
  files: Array<{ file_role: string; original_filename: string }>;
}) {
  if (input.files.length === 0) return [];

  const conflicts = [];
  const database = getDb();
  const query = database.prepare(
    `
    SELECT
      s.id AS submission_id,
      s.drawing_number,
      s.revision,
      f.file_role,
      f.original_filename
    FROM submission_files f
    JOIN submissions s ON s.id = f.submission_id
    JOIN submissions current_submission ON current_submission.id = ?
    WHERE s.status = 'Released'
      AND s.id <> current_submission.id
      AND s.item_id <> current_submission.item_id
      AND f.file_role = ?
      AND lower(f.original_filename) = lower(?)
    LIMIT 1
  `
  );

  for (const file of input.files) {
    const conflict = query.get(input.submissionId, file.file_role, file.original_filename) as
      | {
          submission_id: string;
          drawing_number: string;
          revision: string;
          file_role: string;
          original_filename: string;
        }
      | undefined;
    if (conflict) conflicts.push(conflict);
  }

  return conflicts;
}
