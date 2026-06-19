import {
  ALTERNATE_LARGE_FILE_ALLOWED_PROVIDER_PROFILES,
  ALTERNATE_LARGE_FILE_REQUIRED_METADATA,
  type StorageUploadPolicy,
  getStorageUploadDecision,
  getStorageUploadPolicy
} from "@/lib/storage-upload-policy";
import type { FileRole } from "@/lib/types";

export type ExternalLargeFileProviderProfile = (typeof ALTERNATE_LARGE_FILE_ALLOWED_PROVIDER_PROFILES)[number];

export type ExternalLargeFileRegistrationInput = {
  submissionId: string;
  linkedEntityType: "submission_file" | "release_package" | "master_attachment";
  linkedEntityId: string;
  filename: string;
  fileRole: FileRole | "release_package" | "master_attachment";
  owner: string;
  sourcePath: string;
  provider: ExternalLargeFileProviderProfile;
  providerId?: string;
  bucket: string;
  objectKey: string;
  sha256: string;
  fileSize: number;
  mimeType?: string | null;
  retentionClass: "hot" | "warm" | "cold" | "archive";
  restoreOwner: string;
  registeredBy: string;
};

export type ExternalLargeFileRegistration = {
  objectId: string;
  referenceId: string;
  auditAction: "LargeFileIntakeRegistered";
  providerId: string;
  bucket: string;
  objectKey: string;
  sha256: string;
  fileSize: number;
  linkedEntityType: ExternalLargeFileRegistrationInput["linkedEntityType"];
  linkedEntityId: string;
  filename: string;
};

export type ExternalLargeFileRegistrationValidationResult =
  | { ok: true }
  | {
      ok: false;
      errors: string[];
    };

export const EXTERNAL_LARGE_FILE_INTAKE_CONTRACT_VERSION = "external-large-file-intake/v1";

const REQUIRED_INPUT_FIELDS: Array<keyof ExternalLargeFileRegistrationInput> = [
  ...ALTERNATE_LARGE_FILE_REQUIRED_METADATA,
  "submissionId",
  "linkedEntityType",
  "linkedEntityId",
  "filename",
  "fileRole",
  "registeredBy"
];

const SHA_256_HEX_PATTERN = /^[a-f0-9]{64}$/iu;

export function resolveExternalLargeFileProviderId(input: Pick<ExternalLargeFileRegistrationInput, "provider" | "providerId">) {
  return input.providerId?.trim() || input.provider;
}

export function validateExternalLargeFileRegistrationInput(
  input: ExternalLargeFileRegistrationInput,
  policy: StorageUploadPolicy = getStorageUploadPolicy()
): ExternalLargeFileRegistrationValidationResult {
  const errors: string[] = [];

  for (const field of REQUIRED_INPUT_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null || String(value).trim() === "") {
      errors.push(`missing_required_metadata:${String(field)}`);
    }
  }

  if (!ALTERNATE_LARGE_FILE_ALLOWED_PROVIDER_PROFILES.includes(input.provider)) {
    errors.push(`unsupported_provider_profile:${input.provider}`);
  }

  if (!SHA_256_HEX_PATTERN.test(input.sha256 ?? "")) {
    errors.push("invalid_sha256");
  }

  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
    errors.push("invalid_file_size");
  }

  const decision = getStorageUploadDecision({ name: input.filename, size: input.fileSize }, policy);
  if (decision.disposition !== "alternate_large_file_path_required") {
    errors.push(`alternate_large_file_path_not_required:${decision.disposition}`);
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

export function buildExternalLargeFileObjectMetadata(input: ExternalLargeFileRegistrationInput) {
  return {
    contractVersion: EXTERNAL_LARGE_FILE_INTAKE_CONTRACT_VERSION,
    providerId: resolveExternalLargeFileProviderId(input),
    providerProfile: input.provider,
    bucket: input.bucket.trim(),
    objectKey: input.objectKey.trim(),
    contentHash: input.sha256.toLowerCase(),
    hashAlgorithm: "SHA-256" as const,
    byteSize: input.fileSize,
    mimeType: input.mimeType?.trim() || null,
    lifecycleTier: input.retentionClass,
    objectStatus: "registered_external" as const,
    restoreOwner: input.restoreOwner.trim(),
    owner: input.owner.trim(),
    sourcePath: input.sourcePath.trim()
  };
}

export function buildExternalLargeFileReferenceMetadata(input: ExternalLargeFileRegistrationInput) {
  return {
    linkedEntityType: input.linkedEntityType,
    linkedEntityId: input.linkedEntityId.trim(),
    fileRole: input.fileRole,
    filename: input.filename.trim(),
    referenceStatus: "active" as const
  };
}

export function buildExternalLargeFileAuditDetail(
  input: ExternalLargeFileRegistrationInput,
  registration: Pick<ExternalLargeFileRegistration, "objectId" | "referenceId">
) {
  const object = buildExternalLargeFileObjectMetadata(input);
  const reference = buildExternalLargeFileReferenceMetadata(input);

  return {
    contractVersion: EXTERNAL_LARGE_FILE_INTAKE_CONTRACT_VERSION,
    objectId: registration.objectId,
    referenceId: registration.referenceId,
    providerId: object.providerId,
    providerProfile: object.providerProfile,
    bucket: object.bucket,
    objectKey: object.objectKey,
    sha256: object.contentHash,
    fileSize: object.byteSize,
    retentionClass: object.lifecycleTier,
    restoreOwner: object.restoreOwner,
    owner: object.owner,
    sourcePathRecorded: Boolean(object.sourcePath),
    linkedEntityType: reference.linkedEntityType,
    linkedEntityId: reference.linkedEntityId,
    fileRole: reference.fileRole,
    filename: reference.filename
  };
}
