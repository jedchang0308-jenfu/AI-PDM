export const DEFAULT_STORAGE_MAX_UPLOAD_FILE_BYTES = 50 * 1024 * 1024;
export const DEFAULT_STORAGE_LARGE_FILE_THRESHOLD_BYTES = 500 * 1024 * 1024;

export type StorageUploadPolicyEnv = Record<string, string | undefined>;

export type StorageUploadPolicy = {
  maxUploadFileBytes: number;
  maxUploadFileMb: number;
  source: "PDM_MAX_UPLOAD_FILE_BYTES" | "PDM_STORAGE_MAX_UPLOAD_MB" | "PDM_MASTER_ATTACHMENT_MAX_UPLOAD_FILE_BYTES" | "default";
  largeFileThresholdBytes: number;
  largeFileThresholdMb: number;
  largeFileThresholdSource: "PDM_STORAGE_LARGE_FILE_THRESHOLD_MB" | "default" | "clamped_to_max_upload";
};

export type StorageUploadDisposition = "normal_upload" | "admin_override_required" | "alternate_large_file_path_required";

export type StorageUploadDecision = {
  filename: string;
  fileSize: number;
  disposition: StorageUploadDisposition;
  maxUploadFileBytes: number;
  largeFileThresholdBytes: number;
  reason: string;
};

export type AlternateLargeFileIntakeItem = StorageUploadDecision & {
  intakeAction: "register_external_storage_object";
  requiredMetadata: string[];
  allowedProviderProfiles: string[];
  auditAction: "LargeFileIntakeRequired";
};

export type AlternateLargeFileIntakePackage = {
  required: boolean;
  packageVersion: "storage-large-file-intake/v1";
  blockedNormalSubmission: boolean;
  policy: {
    maxUploadFileBytes: number;
    largeFileThresholdBytes: number;
  };
  items: AlternateLargeFileIntakeItem[];
  nextSteps: string[];
  guardrails: string[];
};

export const ALTERNATE_LARGE_FILE_ALLOWED_PROVIDER_PROFILES = [
  "nas_gateway",
  "s3_compatible",
  "supabase_storage_staging"
] as const;

export const ALTERNATE_LARGE_FILE_REQUIRED_METADATA = [
  "owner",
  "sourcePath",
  "provider",
  "bucket",
  "objectKey",
  "sha256",
  "fileSize",
  "retentionClass",
  "restoreOwner"
] as const;

function parsePositiveInteger(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveNumber(value: string | undefined) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveLargeFileThreshold(env: StorageUploadPolicyEnv, maxUploadFileBytes: number) {
  const configuredMb = parsePositiveNumber(env.PDM_STORAGE_LARGE_FILE_THRESHOLD_MB);
  const configuredBytes = configuredMb ? Math.floor(configuredMb * 1024 * 1024) : null;
  const candidateBytes = configuredBytes ?? DEFAULT_STORAGE_LARGE_FILE_THRESHOLD_BYTES;

  if (candidateBytes < maxUploadFileBytes) {
    return {
      largeFileThresholdBytes: maxUploadFileBytes,
      largeFileThresholdSource: "clamped_to_max_upload" as const
    };
  }

  return {
    largeFileThresholdBytes: candidateBytes,
    largeFileThresholdSource: configuredBytes ? ("PDM_STORAGE_LARGE_FILE_THRESHOLD_MB" as const) : ("default" as const)
  };
}

function toPolicy(maxUploadFileBytes: number, source: StorageUploadPolicy["source"], env: StorageUploadPolicyEnv): StorageUploadPolicy {
  const { largeFileThresholdBytes, largeFileThresholdSource } = resolveLargeFileThreshold(env, maxUploadFileBytes);
  return {
    maxUploadFileBytes,
    maxUploadFileMb: maxUploadFileBytes / (1024 * 1024),
    source,
    largeFileThresholdBytes,
    largeFileThresholdMb: largeFileThresholdBytes / (1024 * 1024),
    largeFileThresholdSource
  };
}

export function getStorageUploadPolicy(env: StorageUploadPolicyEnv = process.env): StorageUploadPolicy {
  const configuredBytes = parsePositiveInteger(env.PDM_MAX_UPLOAD_FILE_BYTES);
  if (configuredBytes) return toPolicy(configuredBytes, "PDM_MAX_UPLOAD_FILE_BYTES", env);

  const configuredMb = parsePositiveNumber(env.PDM_STORAGE_MAX_UPLOAD_MB);
  if (configuredMb) return toPolicy(Math.floor(configuredMb * 1024 * 1024), "PDM_STORAGE_MAX_UPLOAD_MB", env);

  return toPolicy(DEFAULT_STORAGE_MAX_UPLOAD_FILE_BYTES, "default", env);
}

export function getMasterAttachmentUploadPolicy(env: StorageUploadPolicyEnv = process.env): StorageUploadPolicy {
  const configuredBytes = parsePositiveInteger(env.PDM_MASTER_ATTACHMENT_MAX_UPLOAD_FILE_BYTES);
  if (configuredBytes) return toPolicy(configuredBytes, "PDM_MASTER_ATTACHMENT_MAX_UPLOAD_FILE_BYTES", env);
  return getStorageUploadPolicy(env);
}

export function validateStorageUploadFile(file: { name: string; size: number }, policy = getStorageUploadPolicy()) {
  const decision = getStorageUploadDecision(file, policy);
  if (file.size <= policy.maxUploadFileBytes) return { ok: true as const };
  return {
    ok: false as const,
    code: "file_too_large" as const,
    filename: file.name,
    fileSize: file.size,
    maxUploadFileBytes: policy.maxUploadFileBytes,
    largeFileThresholdBytes: policy.largeFileThresholdBytes,
    policySource: policy.source,
    disposition: decision.disposition
  };
}

export function getStorageUploadDecision(file: { name: string; size: number }, policy = getStorageUploadPolicy()): StorageUploadDecision {
  if (file.size <= policy.maxUploadFileBytes) {
    return {
      filename: file.name,
      fileSize: file.size,
      disposition: "normal_upload",
      maxUploadFileBytes: policy.maxUploadFileBytes,
      largeFileThresholdBytes: policy.largeFileThresholdBytes,
      reason: "within_configured_upload_limit"
    };
  }

  if (file.size > policy.largeFileThresholdBytes) {
    return {
      filename: file.name,
      fileSize: file.size,
      disposition: "alternate_large_file_path_required",
      maxUploadFileBytes: policy.maxUploadFileBytes,
      largeFileThresholdBytes: policy.largeFileThresholdBytes,
      reason: "above_large_file_threshold"
    };
  }

  return {
    filename: file.name,
    fileSize: file.size,
    disposition: "admin_override_required",
    maxUploadFileBytes: policy.maxUploadFileBytes,
    largeFileThresholdBytes: policy.largeFileThresholdBytes,
    reason: "above_upload_limit_below_large_file_threshold"
  };
}

export function getStorageUploadDecisions(files: Array<{ name: string; size: number }>, policy = getStorageUploadPolicy()) {
  return files.map((file) => getStorageUploadDecision(file, policy));
}

export function getActionableStorageUploadDecisions(files: Array<{ name: string; size: number }>, policy = getStorageUploadPolicy()) {
  return getStorageUploadDecisions(files, policy).filter((decision) => decision.disposition !== "normal_upload");
}

export function getAlternateLargeFileIntakePackage(
  files: Array<{ name: string; size: number }>,
  policy = getStorageUploadPolicy()
): AlternateLargeFileIntakePackage {
  const items = getStorageUploadDecisions(files, policy)
    .filter((decision) => decision.disposition === "alternate_large_file_path_required")
    .map<AlternateLargeFileIntakeItem>((decision) => ({
      ...decision,
      intakeAction: "register_external_storage_object",
      requiredMetadata: [...ALTERNATE_LARGE_FILE_REQUIRED_METADATA],
      allowedProviderProfiles: [...ALTERNATE_LARGE_FILE_ALLOWED_PROVIDER_PROFILES],
      auditAction: "LargeFileIntakeRequired"
    }));

  return {
    required: items.length > 0,
    packageVersion: "storage-large-file-intake/v1",
    blockedNormalSubmission: items.length > 0,
    policy: {
      maxUploadFileBytes: policy.maxUploadFileBytes,
      largeFileThresholdBytes: policy.largeFileThresholdBytes
    },
    items,
    nextSteps: [
      "Create a controlled external storage object through NAS gateway, S3-compatible staging, or Supabase Storage staging.",
      "Record owner, source path, provider, bucket, object key, SHA-256, file size, retention class, and restore owner before linking it to PDM metadata.",
      "Run migration / restore verification before any production pointer update."
    ],
    guardrails: [
      "Do not upload this file through the normal submission endpoint.",
      "Do not bypass the large-file threshold with Admin override.",
      "Do not store service role keys, signed URLs, raw share tokens, or local absolute source paths in user-visible responses."
    ]
  };
}
