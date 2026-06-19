import { createAuditLogAsync } from "@/lib/audit-async";
import {
  buildStorageKey,
  createFileStorageService,
  createReleasePackageStorageService,
  sha256,
  storageKeyFromLocalPath
} from "@/lib/file-storage";
import { upsertReleasePackageRecordAsync } from "@/lib/release-records-async";
import type { SubmissionDetail, SubmissionFile } from "@/lib/types";
import { createZip } from "@/lib/zip";

type ReleasePackageResult = {
  id: string;
  packageFilename: string;
  localPath: string;
  sha256: string;
  fileSize: number;
};

export async function createReleasePackageAsync(
  submission: SubmissionDetail,
  createdBy: string,
  releaseResult: Record<string, unknown>
): Promise<ReleasePackageResult> {
  const storage = createFileStorageService();
  const packageStorage = createReleasePackageStorageService();
  const packageFilename = sanitizeFilename(`${submission.drawing_number}_rev-${submission.revision}_release-package.zip`);
  const manifest = buildManifest(submission, createdBy, releaseResult);
  const entries: { path: string; data: Buffer }[] = [
    {
      path: "manifest.json",
      data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8")
    }
  ];

  for (const file of submission.files) {
    let storageKey: string;
    try {
      storageKey = storageKeyFromLocalPath(file.local_path);
    } catch {
      throw new Error(`RELEASE_PACKAGE_PATH_OUTSIDE_REPOSITORY: ${file.original_filename}`);
    }

    const bytes = await storage.readObject(storageKey);
    const actualHash = sha256(bytes);
    if (actualHash !== file.sha256) {
      throw new Error(`RELEASE_PACKAGE_HASH_MISMATCH: ${file.original_filename}`);
    }

    entries.push({
      path: `files/${file.file_role}/${sanitizeZipSegment(file.original_filename)}`,
      data: bytes
    });
  }

  const zip = createZip(entries);
  const storedPackage = await packageStorage.putObject({
    key: releasePackageStorageKey(submission, packageFilename),
    bytes: zip.bytes
  });

  const record = await upsertReleasePackageRecordAsync({
    submissionId: submission.id,
    packageFilename,
    localPath: storedPackage.localPath,
    sha256: zip.sha256,
    fileSize: zip.bytes.byteLength,
    manifestJson: JSON.stringify(manifest),
    createdBy
  });

  if (!record) {
    throw new Error("RELEASE_PACKAGE_RECORD_FAILED");
  }

  await createAuditLogAsync({
    submissionId: submission.id,
    actorId: createdBy,
    action: "ReleasePackageCreated",
    detail: {
      packageFilename,
      sha256: zip.sha256,
      fileSize: zip.bytes.byteLength,
      fileCount: submission.files.length
    }
  });

  return {
    id: record.id,
    packageFilename,
    localPath: storedPackage.localPath,
    sha256: zip.sha256,
    fileSize: zip.bytes.byteLength
  };
}

function buildManifest(submission: SubmissionDetail, createdBy: string, releaseResult: Record<string, unknown>) {
  return {
    schema: "ai-pdm-release-package.v1",
    generated_at: new Date().toISOString(),
    generated_by: createdBy,
    submission: {
      id: submission.id,
      status: "Released",
      drawing_number: submission.drawing_number,
      revision: submission.revision,
      part_number: submission.part_number,
      part_name: submission.part_name,
      material: submission.material,
      surface_finish: submission.surface_finish,
      document_type: submission.document_type,
      change_description: submission.change_description,
      submitted_by: submission.submitted_by,
      submitted_by_name: submission.submitted_by_name,
      approval_required: submission.approval_required
    },
    approvals: submission.approvals.map((approval) => ({
      reviewer_id: approval.reviewer_id,
      reviewer_name: approval.reviewer_name,
      decision: approval.decision,
      comment: approval.comment,
      decided_at: approval.decided_at
    })),
    files: submission.files.map(fileManifest),
    references: submission.references.map((reference) => ({
      source_filename: reference.source_filename,
      source_file_role: reference.source_file_role,
      referenced_filename: reference.referenced_filename,
      referenced_part_number: reference.referenced_part_number,
      referenced_drawing_number: reference.referenced_drawing_number,
      referenced_revision: reference.referenced_revision,
      reference_type: reference.reference_type,
      quantity: reference.quantity,
      extraction_method: reference.extraction_method,
      confidence: reference.confidence
    })),
    release: releaseResult
  };
}

function fileManifest(file: SubmissionFile) {
  return {
    id: file.id,
    file_role: file.file_role,
    original_filename: file.original_filename,
    package_path: `files/${file.file_role}/${sanitizeZipSegment(file.original_filename)}`,
    sha256: file.sha256,
    file_size: file.file_size,
    gdrive_file_id: file.gdrive_file_id,
    gdrive_status: file.gdrive_status
  };
}

function releasePackageStorageKey(submission: SubmissionDetail, packageFilename: string) {
  const created = new Date(submission.created_at);
  const yyyy = String(created.getFullYear());
  const mm = String(created.getMonth() + 1).padStart(2, "0");
  return buildStorageKey([yyyy, mm, submission.id, packageFilename]);
}

function sanitizeFilename(filename: string) {
  const safe = filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
  return safe || "release-package.zip";
}

function sanitizeZipSegment(filename: string) {
  return sanitizeFilename(filename).replace(/\.\./g, "_");
}
