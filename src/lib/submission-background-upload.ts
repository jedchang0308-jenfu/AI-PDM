import { uploadFileToDrive } from "@/lib/gdrive";
import { getFilesNeedingUploadAsync, updateFileGDriveStatusAsync } from "@/lib/submission-files-async";
import type { SubmissionFile } from "@/lib/types";

type BackgroundUploadFile = Pick<SubmissionFile, "id" | "local_path" | "original_filename">;

export type BackgroundUploadDependencies = {
  getFilesNeedingUpload: (submissionId: string) => Promise<BackgroundUploadFile[]>;
  updateFileGDriveStatus: (fileId: string, gdriveStatus: string, gdriveFileId?: string | null) => Promise<unknown>;
  uploadFile: (input: { localPath: string; filename: string; targetFolderId: string }) => Promise<string>;
};

const productionDependencies: BackgroundUploadDependencies = {
  getFilesNeedingUpload: getFilesNeedingUploadAsync,
  updateFileGDriveStatus: updateFileGDriveStatusAsync,
  uploadFile: uploadFileToDrive
};

export async function triggerBackgroundUpload(
  submissionId: string,
  folderId: string,
  dependencies: BackgroundUploadDependencies = productionDependencies
) {
  const files = await dependencies.getFilesNeedingUpload(submissionId);

  for (const file of files) {
    try {
      await dependencies.updateFileGDriveStatus(file.id, "uploading");
      const gdriveFileId = await dependencies.uploadFile({
        localPath: file.local_path,
        filename: file.original_filename,
        targetFolderId: folderId
      });
      await dependencies.updateFileGDriveStatus(file.id, "uploaded", gdriveFileId);
    } catch (error) {
      console.error(`Failed to upload file ${file.id} to Drive:`, error);
      await dependencies.updateFileGDriveStatus(file.id, "failed");
    }
  }
}
