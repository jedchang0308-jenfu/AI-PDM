import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  buildExternalLargeFileAuditDetail,
  buildExternalLargeFileObjectMetadata,
  buildExternalLargeFileReferenceMetadata,
  resolveExternalLargeFileProviderId,
  validateExternalLargeFileRegistrationInput,
  type ExternalLargeFileRegistration,
  type ExternalLargeFileRegistrationInput
} from "@/lib/external-large-file-intake";

export const UPSERT_EXTERNAL_LARGE_FILE_STORAGE_OBJECT_SQL = `
  INSERT INTO storage_objects (
    object_id, provider_id, bucket, object_key, content_hash, hash_algorithm,
    byte_size, mime_type, lifecycle_tier, object_status, created_at, updated_at, deleted_at
  ) VALUES (
    :objectId, :providerId, :bucket, :objectKey, :contentHash, :hashAlgorithm,
    :byteSize, :mimeType, :lifecycleTier, :objectStatus, :now, :now, NULL
  )
  ON CONFLICT(provider_id, bucket, object_key) DO UPDATE SET
    content_hash = excluded.content_hash,
    hash_algorithm = excluded.hash_algorithm,
    byte_size = excluded.byte_size,
    mime_type = excluded.mime_type,
    lifecycle_tier = excluded.lifecycle_tier,
    object_status = excluded.object_status,
    updated_at = excluded.updated_at,
    deleted_at = NULL
  RETURNING object_id
`;

export const UPSERT_EXTERNAL_LARGE_FILE_OBJECT_REFERENCE_SQL = `
  INSERT INTO storage_object_references (
    reference_id, object_id, linked_entity_type, linked_entity_id, file_role,
    filename, reference_status, created_at, updated_at
  ) VALUES (
    :referenceId, :objectId, :linkedEntityType, :linkedEntityId, :fileRole,
    :filename, :referenceStatus, :now, :now
  )
  ON CONFLICT(object_id, linked_entity_type, linked_entity_id, file_role, filename) DO UPDATE SET
    reference_status = excluded.reference_status,
    updated_at = excluded.updated_at
  RETURNING reference_id
`;

export const INSERT_EXTERNAL_LARGE_FILE_INTAKE_AUDIT_SQL = `
  INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
  VALUES (:id, :submissionId, :actorId, :action, :detailJson, :createdAt)
`;

export class AsyncExternalLargeFileIntakeRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async registerExternalLargeFile(input: ExternalLargeFileRegistrationInput): Promise<ExternalLargeFileRegistration> {
    const validation = validateExternalLargeFileRegistrationInput(input);
    if (!validation.ok) {
      throw new Error(`EXTERNAL_LARGE_FILE_INTAKE_INVALID:${validation.errors.join("|")}`);
    }

    const now = this.clock();
    const object = buildExternalLargeFileObjectMetadata(input);
    const reference = buildExternalLargeFileReferenceMetadata(input);
    const requestedObjectId = this.idFactory();
    const requestedReferenceId = this.idFactory();

    const register = async (client: AsyncDatabaseClient): Promise<ExternalLargeFileRegistration> => {
      const objectRow = await client.queryOne<{ object_id: string }>(UPSERT_EXTERNAL_LARGE_FILE_STORAGE_OBJECT_SQL, {
        objectId: requestedObjectId,
        providerId: object.providerId,
        bucket: object.bucket,
        objectKey: object.objectKey,
        contentHash: object.contentHash,
        hashAlgorithm: object.hashAlgorithm,
        byteSize: object.byteSize,
        mimeType: object.mimeType,
        lifecycleTier: object.lifecycleTier,
        objectStatus: object.objectStatus,
        now
      });
      if (!objectRow) throw new Error("EXTERNAL_LARGE_FILE_OBJECT_REGISTRATION_FAILED");

      const referenceRow = await client.queryOne<{ reference_id: string }>(UPSERT_EXTERNAL_LARGE_FILE_OBJECT_REFERENCE_SQL, {
        referenceId: requestedReferenceId,
        objectId: objectRow.object_id,
        linkedEntityType: reference.linkedEntityType,
        linkedEntityId: reference.linkedEntityId,
        fileRole: reference.fileRole,
        filename: reference.filename,
        referenceStatus: reference.referenceStatus,
        now
      });
      if (!referenceRow) throw new Error("EXTERNAL_LARGE_FILE_REFERENCE_REGISTRATION_FAILED");

      const registration: ExternalLargeFileRegistration = {
        objectId: objectRow.object_id,
        referenceId: referenceRow.reference_id,
        auditAction: "LargeFileIntakeRegistered",
        providerId: resolveExternalLargeFileProviderId(input),
        bucket: object.bucket,
        objectKey: object.objectKey,
        sha256: object.contentHash,
        fileSize: object.byteSize,
        linkedEntityType: reference.linkedEntityType,
        linkedEntityId: reference.linkedEntityId,
        filename: reference.filename
      };

      await client.execute(INSERT_EXTERNAL_LARGE_FILE_INTAKE_AUDIT_SQL, {
        id: this.idFactory(),
        submissionId: input.submissionId,
        actorId: input.registeredBy,
        action: registration.auditAction,
        detailJson: JSON.stringify(buildExternalLargeFileAuditDetail(input, registration)),
        createdAt: now
      });

      return registration;
    };

    if (this.client.kind === "postgres") {
      return this.client.transaction(register);
    }

    return register(this.client);
  }
}
