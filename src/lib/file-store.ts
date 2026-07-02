import fs from "node:fs/promises";
import path from "node:path";
import { buildStorageKey, createFileStorageService } from "@/lib/file-storage";
import { normalizeFileRole } from "@/lib/validation";

export type SavedSubmissionFile = {
  fileRole: string;
  originalFilename: string;
  localPath: string;
  sha256: string;
  fileSize: number;
  sourceMasterAttachmentId?: string | null;
};

export type SubmissionFileBuffer = {
  filename: string;
  bytes: Buffer;
  sourceMasterAttachmentId?: string | null;
};

export async function saveUploadedFiles(submissionFolderName: string, files: File[]) {
  const buffers = await Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      bytes: Buffer.from(await file.arrayBuffer())
    }))
  );
  return saveSubmissionFileBuffers(submissionFolderName, buffers);
}

export async function saveSubmissionFileBuffers(
  submissionFolderName: string,
  files: SubmissionFileBuffer[]
): Promise<SavedSubmissionFile[]> {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const storage = createFileStorageService();

  const saved: SavedSubmissionFile[] = [];
  for (const file of files) {
    const safeName = sanitizeFilename(file.filename);
    const stored = await storage.putObject({
      key: buildStorageKey(["pending", yyyy, mm, submissionFolderName, safeName]),
      bytes: file.bytes
    });
    saved.push({
      fileRole: normalizeFileRole(file.filename),
      originalFilename: file.filename,
      localPath: stored.localPath,
      sha256: stored.sha256,
      fileSize: stored.bytes,
      sourceMasterAttachmentId: file.sourceMasterAttachmentId ?? null
    });
  }

  return saved;
}

export async function removeSubmissionUploadFolder(submissionFolderName: string) {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const repositoryDir = getRepositoryDir();
  const targetDir = path.join(/*turbopackIgnore: true*/ repositoryDir, "pending", yyyy, mm, submissionFolderName);
  const repositoryRoot = path.resolve(/*turbopackIgnore: true*/ repositoryDir);
  const resolvedTarget = path.resolve(/*turbopackIgnore: true*/ targetDir);

  if (!resolvedTarget.startsWith(repositoryRoot + path.sep)) {
    throw new Error("拒絕移除 PDM 檔案庫外的路徑");
  }

  await fs.rm(resolvedTarget, { recursive: true, force: true });
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "uploaded-file";
}

function getRepositoryDir() {
  const configured = process.env.PDM_REPOSITORY_DIR?.trim();
  if (!configured) return path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "repository");
  return path.isAbsolute(configured) ? configured : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
}
