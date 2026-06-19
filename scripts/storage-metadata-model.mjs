export const STORAGE_METADATA_MODEL_VERSION = "storage-metadata-model-v1";

export const STORAGE_METADATA_REQUIRED_DESCRIPTOR_FIELDS = [
  "id",
  "source",
  "provider",
  "lifecycleTier",
  "businessStatus",
  "linkedEntityType",
  "linkedEntityId",
  "filename",
  "extension",
  "fileRole",
  "bytes",
  "hash",
  "hashAlgorithm",
  "storageKey",
  "localPath",
  "pathForExistenceCheck",
  "localRoot",
  "createdAt"
];

export const STORAGE_METADATA_BLUEPRINT = {
  version: STORAGE_METADATA_MODEL_VERSION,
  status: "blueprint_not_applied",
  guardrails: {
    noSchemaMigrationExecuted: true,
    noRuntimeTablesCreated: true,
    noMetadataPointersUpdated: true,
    providerRegistryRequired: true,
    noProviderCheckConstraintEnum: true
  },
  tables: [
    {
      name: "storage_providers",
      purpose: "Runtime-extensible registry for local, Supabase, S3-compatible, NAS gateway, and future providers.",
      requiredColumns: [
        "provider_id",
        "provider_kind",
        "display_name",
        "capabilities_json",
        "is_enabled",
        "created_at",
        "updated_at"
      ],
      constraints: [
        "provider_id primary key",
        "provider_kind text not null",
        "capabilities_json text/jsonb not null",
        "no CHECK constraint enumerating future provider ids"
      ]
    },
    {
      name: "storage_objects",
      purpose: "One row per physical object, independent from business records.",
      requiredColumns: [
        "object_id",
        "provider_id",
        "bucket",
        "object_key",
        "content_hash",
        "hash_algorithm",
        "byte_size",
        "mime_type",
        "lifecycle_tier",
        "object_status",
        "created_at",
        "updated_at",
        "deleted_at"
      ],
      constraints: [
        "object_id primary key",
        "provider_id references storage_providers(provider_id)",
        "unique(provider_id, bucket, object_key)",
        "index(content_hash, hash_algorithm)",
        "no provider enum CHECK; provider ids come from storage_providers"
      ]
    },
    {
      name: "storage_object_references",
      purpose: "Many business records may point at the same physical object for SHA-256 deduplication.",
      requiredColumns: [
        "reference_id",
        "object_id",
        "linked_entity_type",
        "linked_entity_id",
        "file_role",
        "filename",
        "reference_status",
        "created_at",
        "updated_at"
      ],
      constraints: [
        "reference_id primary key",
        "object_id references storage_objects(object_id)",
        "unique(object_id, linked_entity_type, linked_entity_id, file_role, filename)"
      ]
    }
  ],
  descriptorMapping: {
    provider: "storage_objects.provider_id -> storage_providers.provider_id",
    storageKey: "storage_objects.object_key",
    hash: "storage_objects.content_hash",
    hashAlgorithm: "storage_objects.hash_algorithm",
    bytes: "storage_objects.byte_size",
    lifecycleTier: "storage_objects.lifecycle_tier",
    linkedEntityType: "storage_object_references.linked_entity_type",
    linkedEntityId: "storage_object_references.linked_entity_id",
    fileRole: "storage_object_references.file_role",
    filename: "storage_object_references.filename"
  }
};

export function buildStorageMetadataModelBlueprint() {
  return structuredClone(STORAGE_METADATA_BLUEPRINT);
}

export function validateStorageMetadataDescriptor(object) {
  const missingFields = STORAGE_METADATA_REQUIRED_DESCRIPTOR_FIELDS.filter((field) => !(field in object));
  const errors = [];

  if (missingFields.length) {
    errors.push(`Missing required descriptor fields: ${missingFields.join(", ")}`);
  }
  if (!String(object.provider ?? "").trim()) {
    errors.push("Provider must be a non-empty provider id.");
  }
  if (object.hash && object.hashAlgorithm !== "SHA-256") {
    errors.push("Hashed objects must use SHA-256 in the current contract.");
  }
  if (!Number.isFinite(Number(object.bytes)) || Number(object.bytes) < 0) {
    errors.push("Byte size must be a non-negative number.");
  }
  if (!String(object.linkedEntityType ?? "").trim() || !String(object.linkedEntityId ?? "").trim()) {
    errors.push("Business reference identity is required.");
  }
  if (!String(object.storageKey ?? "").trim()) {
    errors.push("Storage key is required for provider migration planning.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function buildStorageObjectReferencePreview(objects) {
  return objects.map((object) => ({
    referenceId: `${object.source}:${object.id}`,
    objectFingerprint: object.hash
      ? `${object.provider}:${object.hashAlgorithm ?? "unknown"}:${object.hash}`
      : `${object.provider}:key:${object.storageKey}`,
    provider: object.provider,
    objectKey: object.storageKey,
    linkedEntityType: object.linkedEntityType,
    linkedEntityId: object.linkedEntityId,
    fileRole: object.fileRole,
    filename: object.filename,
    lifecycleTier: object.lifecycleTier,
    bytes: object.bytes
  }));
}

export function buildStorageDeduplicationPreview(objects) {
  const byFingerprint = new Map();
  for (const object of objects) {
    if (!object.hash) continue;
    const fingerprint = `${object.provider}:${object.hashAlgorithm ?? "unknown"}:${object.hash}`;
    const existing = byFingerprint.get(fingerprint) ?? {
      fingerprint,
      provider: object.provider,
      hash: object.hash,
      hashAlgorithm: object.hashAlgorithm ?? null,
      physicalObjectCount: 1,
      referenceCount: 0,
      totalReferenceBytes: 0,
      estimatedRecoverableBytes: 0,
      references: []
    };
    existing.referenceCount += 1;
    existing.totalReferenceBytes += Number(object.bytes || 0);
    existing.references.push({
      id: object.id,
      source: object.source,
      linkedEntityType: object.linkedEntityType,
      linkedEntityId: object.linkedEntityId,
      fileRole: object.fileRole,
      filename: object.filename,
      bytes: object.bytes
    });
    byFingerprint.set(fingerprint, existing);
  }

  return [...byFingerprint.values()]
    .filter((group) => group.referenceCount > 1)
    .map((group) => {
      const largest = Math.max(...group.references.map((reference) => Number(reference.bytes || 0)));
      return {
        ...group,
        estimatedRecoverableBytes: Math.max(0, group.totalReferenceBytes - largest)
      };
    });
}
