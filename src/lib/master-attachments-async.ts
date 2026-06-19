import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncMasterAttachmentRepository } from "@/lib/repositories/master-attachment-async-repository";
import type { MasterAttachmentEntityType } from "@/lib/repositories/master-attachment-repository";

export function listMasterAttachmentsAsync(input: { entityType: MasterAttachmentEntityType; entityCode: string }) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncMasterAttachmentRepository(client);
  return repository.listMasterAttachments(input);
}

export function createMasterAttachmentAsync(input: {
  entityType: MasterAttachmentEntityType;
  entityCode: string;
  file: File;
  documentCategory: string;
  displayName?: string;
  description?: string;
  revision?: string | null;
  uploadedBy: string;
}) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncMasterAttachmentRepository(client);
  return repository.createMasterAttachment(input);
}

export function getMasterAttachmentAsync(input: { entityType: MasterAttachmentEntityType; entityCode: string; attachmentId: string }) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncMasterAttachmentRepository(client);
  return repository.getMasterAttachment(input);
}

export function getMasterAttachmentBytesAsync(input: { entityType: MasterAttachmentEntityType; entityCode: string; attachmentId: string }) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncMasterAttachmentRepository(client);
  return repository.getMasterAttachmentBytes(input);
}

export function softDeleteMasterAttachmentAsync(input: {
  entityType: MasterAttachmentEntityType;
  entityCode: string;
  attachmentId: string;
  deletedBy: string;
  reason?: string | null;
}) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncMasterAttachmentRepository(client);
  return repository.softDeleteMasterAttachment(input);
}

export function syncMasterAttachmentToDriveAsync(input: { attachmentId: string; actorId?: string | null }) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncMasterAttachmentRepository(client);
  return repository.syncMasterAttachmentToDrive(input);
}
