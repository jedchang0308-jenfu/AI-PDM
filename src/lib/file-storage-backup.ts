import path from "node:path";
import { createFileStorageServiceForPointer, sha256, storagePointerFromRecord, type StoredFileStoragePointer } from "@/lib/file-storage";
import { ensureDriveFolder, findDriveFileInFolderByName, uploadBytesToDrive } from "@/lib/gdrive";

export type DriveBackupSource = "submission_files" | "release_packages" | "file_assets" | "file_derivatives";
export type DriveBackupCoverage = "required" | "selective" | "excluded";
export type DriveBackupReason =
  | "formal_release_required"
  | "release_package_required"
  | "master_attachment_selective"
  | "draft_or_in_review_selective"
  | "generated_preview_derivative_excluded";

export type DriveBackupCandidate = {
  id: string;
  source: DriveBackupSource;
  filename: string;
  storage_provider?: string | null;
  storage_bucket?: string | null;
  storage_key?: string | null;
  local_path?: string | null;
  original_path?: string | null;
  file_role?: string | null;
  document_category?: string | null;
  derivative_kind?: string | null;
  business_status?: string | null;
  linked_entity_type?: string | null;
  linked_entity_id?: string | null;
  revision?: string | null;
  sha256?: string | null;
  content_hash?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
};

export type DriveBackupPlanItem = {
  candidate: DriveBackupCandidate;
  coverage: DriveBackupCoverage;
  reason: DriveBackupReason;
  storagePointer: StoredFileStoragePointer | null;
  driveFolderPath: string[];
  driveFilename: string;
  metadataFilename: string;
  metadataSnapshot: Record<string, unknown>;
};

export type DriveBackupUploadResult = {
  candidateId: string;
  source: DriveBackupSource;
  coverage: DriveBackupCoverage;
  status: "uploaded" | "skipped" | "existing_not_overwritten" | "failed";
  driveFileId?: string;
  metadataStatus?: "uploaded" | "skipped" | "existing_not_overwritten" | "failed";
  metadataDriveFileId?: string;
  metadataFilename?: string;
  driveFolderPath: string[];
  driveFilename: string;
  error?: string;
  metadataError?: string;
};

type DriveBackupClient = {
  ensureFolder(parentId: string, folderName: string): Promise<{ id: string }>;
  findFile(parentId: string, filename: string): Promise<{ id: string } | null>;
  uploadBytes(input: {
    bytes: Buffer;
    filename: string;
    targetFolderId: string;
    mimeType?: string;
    appProperties?: Record<string, string>;
  }): Promise<string>;
};

export function classifyDriveBackupCandidate(candidate: DriveBackupCandidate): { coverage: DriveBackupCoverage; reason: DriveBackupReason } {
  if (candidate.source === "file_derivatives" || candidate.derivative_kind) {
    return { coverage: "excluded", reason: "generated_preview_derivative_excluded" };
  }
  if (candidate.source === "release_packages") {
    return { coverage: "required", reason: "release_package_required" };
  }
  if (candidate.business_status === "Released" || candidate.business_status === "Obsolete") {
    return { coverage: "required", reason: "formal_release_required" };
  }
  if (candidate.source === "file_assets") {
    return { coverage: "selective", reason: "master_attachment_selective" };
  }
  return { coverage: "selective", reason: "draft_or_in_review_selective" };
}

export function buildDriveBackupPlan(candidates: DriveBackupCandidate[]): DriveBackupPlanItem[] {
  return candidates.map((candidate) => {
    const classification = classifyDriveBackupCandidate(candidate);
    const storagePointer = classification.coverage === "excluded" ? null : storagePointerFromRecord(candidate);
    const driveFolderPath = buildDriveFolderPath(candidate, classification.coverage);
    const driveFilename = sanitizeDriveFilename(candidate.filename || `${candidate.id}.bin`);
    return {
      candidate,
      ...classification,
      storagePointer,
      driveFolderPath,
      driveFilename,
      metadataFilename: metadataFilenameFor(driveFilename),
      metadataSnapshot: buildDriveMetadataSnapshot(candidate, storagePointer, classification.coverage, classification.reason)
    };
  });
}

export async function executeDriveBackupPlan(input: {
  rootFolderId: string;
  plan: DriveBackupPlanItem[];
  includeSelective?: boolean;
  client?: DriveBackupClient;
}): Promise<DriveBackupUploadResult[]> {
  const client = input.client ?? googleDriveBackupClient;
  const results: DriveBackupUploadResult[] = [];
  for (const item of input.plan) {
    if (item.coverage === "excluded" || (item.coverage === "selective" && !input.includeSelective)) {
      results.push({
        candidateId: item.candidate.id,
        source: item.candidate.source,
        coverage: item.coverage,
        status: "skipped",
        metadataStatus: "skipped",
        driveFolderPath: item.driveFolderPath,
        driveFilename: item.driveFilename,
        metadataFilename: item.metadataFilename
      });
      continue;
    }

    try {
      if (!item.storagePointer) throw new Error("Storage pointer is missing");
      const folderId = await ensureDriveFolderPath(client, input.rootFolderId, item.driveFolderPath);
      const finalFilename = await resolveAvailableDriveFilename(client, folderId, item.driveFilename, backupIdentity(item.candidate));
      const finalMetadataFilename = metadataFilenameFor(finalFilename);
      const existing = await client.findFile(folderId, finalFilename);
      if (existing) {
        const metadataResult = await uploadMetadataSnapshot({
          client,
          folderId,
          filename: finalMetadataFilename,
          item
        });
        results.push({
          candidateId: item.candidate.id,
          source: item.candidate.source,
          coverage: item.coverage,
          status: "existing_not_overwritten",
          driveFileId: existing.id,
          metadataStatus: metadataResult.status,
          metadataDriveFileId: metadataResult.driveFileId,
          metadataFilename: finalMetadataFilename,
          driveFolderPath: item.driveFolderPath,
          driveFilename: finalFilename
        });
        continue;
      }

      const bytes = await createFileStorageServiceForPointer(item.storagePointer).readObject(item.storagePointer.key);
      const expectedHash = normalizedHash(item.candidate.sha256 ?? item.candidate.content_hash);
      if (expectedHash && sha256(bytes) !== expectedHash) throw new Error("Backup source hash mismatch");
      const driveFileId = await client.uploadBytes({
        bytes,
        filename: finalFilename,
        targetFolderId: folderId,
        mimeType: item.candidate.mime_type ?? undefined,
        appProperties: {
          Source: "AI_PDM_CLOUD_SQL_CORE_BACKUP",
          CandidateId: item.candidate.id,
          SourceTable: item.candidate.source,
          Coverage: item.coverage,
          Sha256: expectedHash ?? ""
        }
      });
      const metadataResult = await uploadMetadataSnapshot({
        client,
        folderId,
        filename: finalMetadataFilename,
        item
      });
      results.push({
        candidateId: item.candidate.id,
        source: item.candidate.source,
        coverage: item.coverage,
        status: "uploaded",
        driveFileId,
        metadataStatus: metadataResult.status,
        metadataDriveFileId: metadataResult.driveFileId,
        metadataFilename: finalMetadataFilename,
        driveFolderPath: item.driveFolderPath,
        driveFilename: finalFilename
      });
    } catch (error) {
      results.push({
        candidateId: item.candidate.id,
        source: item.candidate.source,
        coverage: item.coverage,
        status: "failed",
        driveFolderPath: item.driveFolderPath,
        driveFilename: item.driveFilename,
        metadataFilename: item.metadataFilename,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return results;
}

export function buildDriveBackupRestoreIndex(plan: DriveBackupPlanItem[]) {
  return {
    schema: "ai-pdm-drive-backup-restore-index.v1",
    generatedAt: new Date().toISOString(),
    entries: plan
      .filter((item) => item.coverage !== "excluded")
      .map((item) => ({
        source: item.candidate.source,
        id: item.candidate.id,
        coverage: item.coverage,
        reason: item.reason,
        linkedEntityType: item.candidate.linked_entity_type ?? null,
        linkedEntityId: item.candidate.linked_entity_id ?? null,
        revision: item.candidate.revision ?? null,
        filename: item.candidate.filename,
        driveFolderPath: item.driveFolderPath,
        driveFilename: item.driveFilename,
        metadataFilename: item.metadataFilename,
        storage: item.storagePointer
          ? {
              provider: item.storagePointer.provider,
              bucket: item.storagePointer.bucket,
              key: item.storagePointer.key
            }
          : null,
        sha256: normalizedHash(item.candidate.sha256 ?? item.candidate.content_hash),
        fileSize: item.candidate.file_size ?? null
      }))
  };
}

export function buildDriveBackupManifest(plan: DriveBackupPlanItem[], results: DriveBackupUploadResult[] = []) {
  const resultByCandidateId = new Map(results.map((result) => [result.candidateId, result]));
  return {
    schema: "ai-pdm-drive-backup-manifest.v1",
    generatedAt: new Date().toISOString(),
    authority: "cloud_sql_postgres",
    entries: plan
      .filter((item) => item.coverage !== "excluded")
      .map((item) => {
        const result = resultByCandidateId.get(item.candidate.id);
        return {
          source: item.candidate.source,
          id: item.candidate.id,
          coverage: item.coverage,
          reason: item.reason,
          filename: item.candidate.filename,
          driveFolderPath: item.driveFolderPath,
          driveFilename: result?.driveFilename ?? item.driveFilename,
          driveFileId: result?.driveFileId ?? null,
          metadataFilename: result?.metadataFilename ?? item.metadataFilename,
          metadataDriveFileId: result?.metadataDriveFileId ?? null,
          backupStatus: result?.status ?? "planned",
          metadataStatus: result?.metadataStatus ?? "planned",
          storage: item.storagePointer
            ? {
                provider: item.storagePointer.provider,
                bucket: item.storagePointer.bucket,
                key: item.storagePointer.key
              }
            : null,
          sha256: normalizedHash(item.candidate.sha256 ?? item.candidate.content_hash),
          fileSize: item.candidate.file_size ?? null
        };
      })
  };
}

export function buildDriveBackupDriftReport(plan: DriveBackupPlanItem[], results: DriveBackupUploadResult[] = []) {
  const resultByCandidateId = new Map(results.map((result) => [result.candidateId, result]));
  const findings: Array<{
    candidateId: string;
    source: DriveBackupSource;
    severity: "error" | "warning";
    kind: "missing_result" | "required_skipped" | "blob_failed" | "metadata_failed" | "metadata_missing";
    message: string;
  }> = [];

  for (const item of plan) {
    if (item.coverage === "excluded") continue;
    const result = resultByCandidateId.get(item.candidate.id);
    if (!result) {
      if (item.coverage === "required") {
        findings.push({
          candidateId: item.candidate.id,
          source: item.candidate.source,
          severity: "error",
          kind: "missing_result",
          message: "Required backup item has no execution result."
        });
      }
      continue;
    }
    if (item.coverage === "required" && result.status === "skipped") {
      findings.push({
        candidateId: item.candidate.id,
        source: item.candidate.source,
        severity: "error",
        kind: "required_skipped",
        message: "Required backup item was skipped."
      });
    }
    if (result.status === "failed") {
      findings.push({
        candidateId: item.candidate.id,
        source: item.candidate.source,
        severity: item.coverage === "required" ? "error" : "warning",
        kind: "blob_failed",
        message: result.error ?? "Backup blob failed."
      });
    }
    if (result.metadataStatus === "failed") {
      findings.push({
        candidateId: item.candidate.id,
        source: item.candidate.source,
        severity: item.coverage === "required" ? "error" : "warning",
        kind: "metadata_failed",
        message: result.metadataError ?? "Backup metadata snapshot failed."
      });
    }
    if (item.coverage === "required" && !result.metadataStatus) {
      findings.push({
        candidateId: item.candidate.id,
        source: item.candidate.source,
        severity: "error",
        kind: "metadata_missing",
        message: "Required backup item is missing metadata snapshot execution evidence."
      });
    }
  }

  return {
    schema: "ai-pdm-drive-backup-drift-report.v1",
    generatedAt: new Date().toISOString(),
    summary: {
      totalPlanItems: plan.length,
      executableItems: plan.filter((item) => item.coverage !== "excluded").length,
      resultCount: results.length,
      errorCount: findings.filter((finding) => finding.severity === "error").length,
      warningCount: findings.filter((finding) => finding.severity === "warning").length
    },
    findings
  };
}

export function buildDriveMetadataSnapshot(
  candidate: DriveBackupCandidate,
  storagePointer: StoredFileStoragePointer | null,
  coverage: DriveBackupCoverage,
  reason: DriveBackupReason
) {
  return {
    schema: "ai-pdm-drive-backup-metadata.v1",
    source: candidate.source,
    id: candidate.id,
    coverage,
    reason,
    linkedEntityType: candidate.linked_entity_type ?? null,
    linkedEntityId: candidate.linked_entity_id ?? null,
    revision: candidate.revision ?? null,
    filename: candidate.filename,
    fileRole: candidate.file_role ?? null,
    documentCategory: candidate.document_category ?? null,
    businessStatus: candidate.business_status ?? null,
    storage: storagePointer
      ? {
          provider: storagePointer.provider,
          bucket: storagePointer.bucket,
          key: storagePointer.key
        }
      : null,
    sha256: normalizedHash(candidate.sha256 ?? candidate.content_hash),
    fileSize: candidate.file_size ?? null
  };
}

export function resolveCollisionSafeDriveFilename(filename: string, existingFilenames: Iterable<string>, identity: string) {
  const safe = sanitizeDriveFilename(filename);
  const existing = new Set([...existingFilenames].map((name) => name.toLowerCase()));
  if (!existing.has(safe.toLowerCase())) return safe;
  const parsed = path.parse(safe);
  const suffix = `__PDM-${sanitizeDriveFilename(identity).slice(0, 12) || "object"}`;
  return `${parsed.name}${suffix}${parsed.ext}`;
}

async function ensureDriveFolderPath(client: DriveBackupClient, rootFolderId: string, segments: string[]) {
  let currentFolderId = rootFolderId;
  for (const segment of segments) {
    const folder = await client.ensureFolder(currentFolderId, segment);
    currentFolderId = folder.id;
  }
  return currentFolderId;
}

async function resolveAvailableDriveFilename(client: DriveBackupClient, folderId: string, filename: string, identity: string) {
  const existing = await client.findFile(folderId, filename);
  if (!existing) return filename;
  const alternate = resolveCollisionSafeDriveFilename(filename, [filename], identity);
  const alternateExisting = await client.findFile(folderId, alternate);
  return alternateExisting ? alternate : alternate;
}

async function uploadMetadataSnapshot(input: {
  client: DriveBackupClient;
  folderId: string;
  filename: string;
  item: DriveBackupPlanItem;
}): Promise<{ status: "uploaded" | "existing_not_overwritten"; driveFileId: string }> {
  const existing = await input.client.findFile(input.folderId, input.filename);
  if (existing) return { status: "existing_not_overwritten", driveFileId: existing.id };
  const bytes = Buffer.from(`${JSON.stringify(input.item.metadataSnapshot, null, 2)}\n`, "utf8");
  const driveFileId = await input.client.uploadBytes({
    bytes,
    filename: input.filename,
    targetFolderId: input.folderId,
    mimeType: "application/json",
    appProperties: {
      Source: "AI_PDM_CLOUD_SQL_CORE_BACKUP_METADATA",
      CandidateId: input.item.candidate.id,
      SourceTable: input.item.candidate.source,
      Coverage: input.item.coverage,
      Sha256: normalizedHash(input.item.candidate.sha256 ?? input.item.candidate.content_hash) ?? ""
    }
  });
  return { status: "uploaded", driveFileId };
}

function metadataFilenameFor(filename: string) {
  return sanitizeDriveFilename(`${filename}.metadata.json`);
}

function buildDriveFolderPath(candidate: DriveBackupCandidate, coverage: DriveBackupCoverage) {
  return [
    coverage === "required" ? "formal-released" : coverage,
    sanitizeDriveSegment(candidate.source),
    sanitizeDriveSegment(candidate.linked_entity_type ?? "unlinked"),
    sanitizeDriveSegment(candidate.linked_entity_id ?? candidate.id),
    sanitizeDriveSegment(candidate.revision ? `rev-${candidate.revision}` : "rev-unlabeled"),
    sanitizeDriveSegment(candidate.file_role ?? candidate.document_category ?? candidate.derivative_kind ?? "file"),
    sanitizeDriveSegment(normalizedHash(candidate.sha256 ?? candidate.content_hash)?.slice(0, 16) ?? candidate.id)
  ];
}

function sanitizeDriveSegment(value: string) {
  return sanitizeDriveFilename(value).replace(/\.+$/g, "").trim() || "unnamed";
}

function sanitizeDriveFilename(value: string) {
  return String(value ?? "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\.\./g, "_")
    .trim() || "unnamed";
}

function backupIdentity(candidate: DriveBackupCandidate) {
  return normalizedHash(candidate.sha256 ?? candidate.content_hash)?.slice(0, 12) ?? candidate.id;
}

function normalizedHash(value: string | null | undefined) {
  const text = String(value ?? "").trim().toLowerCase();
  return text || null;
}

const googleDriveBackupClient: DriveBackupClient = {
  async ensureFolder(parentId, folderName) {
    return ensureDriveFolder({ parentId, folderName });
  },
  async findFile(parentId, filename) {
    return findDriveFileInFolderByName({ parentId, filename });
  },
  async uploadBytes(input) {
    return uploadBytesToDrive(input);
  }
};
