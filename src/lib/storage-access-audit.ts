import { createAuditLogAsync } from "@/lib/audit-async";
import type { DownloadUrl, FileStorageProvider } from "@/lib/file-storage";

export type StorageAccessKind =
  | "submission_file"
  | "submission_file_preview"
  | "release_package"
  | "public_share_package";

export type StorageAccessAuditInput = {
  actorId?: string | null;
  submissionId: string;
  accessKind: StorageAccessKind;
  fileId?: string | null;
  shareId?: string | null;
  filename: string;
  bytes: number;
  disposition: "inline" | "attachment";
  provider: FileStorageProvider;
  storageKey: string;
  bucket?: string | null;
  access: DownloadUrl;
  route: string;
  externalAccess?: boolean;
  provenance?: StorageAccessAuditProvenance;
};

export type StorageAccessAuditProvenance = {
  source: "runtime" | "qc_api";
  qcRunId?: string | null;
};

const QC_STORAGE_AUDIT_RUN_HEADER = "x-ai-pdm-qc-storage-audit-run-id";

export function resolveStorageAccessAuditProvenance(headers: Headers): StorageAccessAuditProvenance {
  const qcRunId = sanitizeQcRunId(headers.get(QC_STORAGE_AUDIT_RUN_HEADER));
  if (qcRunId && process.env.NODE_ENV !== "production") {
    return {
      source: "qc_api",
      qcRunId
    };
  }
  return {
    source: "runtime",
    qcRunId: null
  };
}

export async function auditStorageAccess(input: StorageAccessAuditInput): Promise<void> {
  const provenance = input.provenance ?? { source: "runtime" as const, qcRunId: null };
  await createAuditLogAsync({
    submissionId: input.submissionId,
    actorId: input.actorId,
    action: "StorageAccessed",
    detail: {
      storageAccess: true,
      storageAccessSource: provenance.source,
      qcRunId: provenance.source === "qc_api" ? provenance.qcRunId ?? null : null,
      accessKind: input.accessKind,
      fileId: input.fileId ?? null,
      shareId: input.shareId ?? null,
      filename: input.filename,
      bytes: input.bytes,
      disposition: input.disposition,
      externalAccess: input.externalAccess ?? false,
      provider: input.provider,
      bucket: input.bucket ?? null,
      storageKey: input.storageKey,
      accessMode: input.access.mode,
      signedUrlExpiresAt: input.access.expiresAt,
      signedUrlExpiresInSeconds: input.access.expiresInSeconds,
      authorizationHeaderRequired: input.access.authorizationHeaderRequired,
      auditRequired: input.access.auditRequired,
      route: input.route
    }
  });
}

function sanitizeQcRunId(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const safe = normalized.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 80);
  return safe || null;
}
