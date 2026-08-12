import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  decorateMasterAttachmentsWithPreviewState,
  enqueuePreviewJobForAttachmentAsync,
  getPreviewDerivativeBytesForAttachmentAsync,
  isNativeSolidWorksPreviewSource,
  recoverStalePreviewJobsAsync
} from "@/lib/preview-derivatives";
import { AsyncMasterAttachmentRepository } from "@/lib/repositories/master-attachment-async-repository";
import type { MasterAttachmentEntityType, MasterAttachmentRecord } from "@/lib/repositories/master-attachment-repository";

export async function listMasterAttachmentsAsync(input: { entityType: MasterAttachmentEntityType; entityCode: string; actorUserId?: string }) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncMasterAttachmentRepository(client);
  const result = await repository.listMasterAttachments(input);
  if (!result) return result;
  await recoverStalePreviewJobsAsync(client);
  let attachments = await decorateMasterAttachmentsWithPreviewState(client, result.attachments);
  if (input.actorUserId) {
    for (const attachment of attachments) {
      if (!isNativeSolidWorksPreviewSource(attachment.fileExt)) continue;
      const hasCurrentDerivative = attachment.previewDerivatives.some(
        (derivative) => derivative.status === "ready" && derivative.sourceContentHash === attachment.contentHash
      );
      const hasActiveJob =
        attachment.previewJob?.sourceContentHash === attachment.contentHash
        && (attachment.previewJob.status === "queued" || attachment.previewJob.status === "running");
      if (hasCurrentDerivative || hasActiveJob) continue;
      if (attachment.previewJob?.sourceContentHash === attachment.contentHash && attachment.previewJob.status !== "cancelled") continue;
      try {
        await enqueuePreviewJobForAttachmentAsync(client, {
          entityType: input.entityType,
          entityCode: input.entityCode,
          attachmentId: attachment.id,
          actorUserId: input.actorUserId,
          requestedKind: "native_thumbnail_png",
          generatorProfile: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1" ? "fake_preview_worker" : "windows_solidworks_preview_worker",
          runFakeWorker: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1"
        });
      } catch {
        // Preview generation is non-blocking; the source attachment remains readable.
      }
    }
    attachments = await decorateMasterAttachmentsWithPreviewState(client, result.attachments);
  }
  return { ...result, attachments };
}

export function listDeletedMasterAttachmentsAsync(input: { entityType: MasterAttachmentEntityType; entityCode: string }) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncMasterAttachmentRepository(client);
  return repository.listDeletedMasterAttachments(input);
}

export async function createMasterAttachmentAsync(input: {
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
  const attachment = await client.transaction((transactionClient) => new AsyncMasterAttachmentRepository(transactionClient).createMasterAttachment(input));
  if (!attachment) throw new Error("MASTER_ATTACHMENT_CREATE_FAILED");
  if (isNativeSolidWorksPreviewSource(attachment.fileExt)) {
    try {
      await enqueuePreviewJobForAttachmentAsync(client, {
        entityType: input.entityType,
        entityCode: input.entityCode,
        attachmentId: attachment.id,
        actorUserId: input.uploadedBy,
        requestedKind: "native_thumbnail_png",
        generatorProfile: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1" ? "fake_preview_worker" : "windows_solidworks_preview_worker",
        runFakeWorker: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1"
      });
    } catch {
      // Preview generation is non-blocking; the source attachment remains readable.
    }
  }
  return decorateSingleAttachmentWithPreviewState(client, attachment);
}

export async function getMasterAttachmentAsync(input: { entityType: MasterAttachmentEntityType; entityCode: string; attachmentId: string }) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncMasterAttachmentRepository(client);
  const attachment = await repository.getMasterAttachment(input);
  if (!attachment) return attachment;
  return decorateSingleAttachmentWithPreviewState(client, attachment);
}

export function getMasterAttachmentLifecyclePolicyAsync(input: {
  entityType: MasterAttachmentEntityType;
  entityCode: string;
  attachmentId: string;
}) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncMasterAttachmentRepository(client);
  return repository.getMasterAttachmentLifecyclePolicy(input);
}

export function getMasterAttachmentBytesAsync(input: { entityType: MasterAttachmentEntityType; entityCode: string; attachmentId: string }) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncMasterAttachmentRepository(client);
  return repository.getMasterAttachmentBytes(input);
}

export function getMasterAttachmentPreviewDerivativeBytesAsync(input: {
  entityType: MasterAttachmentEntityType;
  entityCode: string;
  attachmentId: string;
  derivativeId: string;
}) {
  const client = getAsyncDatabaseClient();
  return getPreviewDerivativeBytesForAttachmentAsync(client, input);
}

export function enqueueMasterAttachmentPreviewJobAsync(input: {
  entityType: MasterAttachmentEntityType;
  entityCode: string;
  attachmentId: string;
  actorUserId: string;
  requestedKind?: "native_thumbnail_png" | "drawing_pdf";
  forceRegenerate?: boolean;
}) {
  const client = getAsyncDatabaseClient();
  const runFakeWorker = process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1";
  return enqueuePreviewJobForAttachmentAsync(client, {
    ...input,
    generatorProfile: runFakeWorker ? "fake_preview_worker" : "windows_solidworks_preview_worker",
    runFakeWorker
  });
}

export function softDeleteMasterAttachmentAsync(input: {
  entityType: MasterAttachmentEntityType;
  entityCode: string;
  attachmentId: string;
  deletedBy: string;
  reason?: string | null;
}) {
  const client = getAsyncDatabaseClient();
  return client.transaction((transactionClient) => new AsyncMasterAttachmentRepository(transactionClient).softDeleteMasterAttachment(input));
}

export function restoreMasterAttachmentAsync(input: {
  entityType: MasterAttachmentEntityType;
  entityCode: string;
  attachmentId: string;
  restoredBy: string;
  reason?: string | null;
}) {
  const client = getAsyncDatabaseClient();
  return client.transaction((transactionClient) => new AsyncMasterAttachmentRepository(transactionClient).restoreMasterAttachment(input));
}

export async function syncMasterAttachmentToDriveAsync(input: { attachmentId: string; actorId?: string | null }) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncMasterAttachmentRepository(client);
  const attachment = await repository.syncMasterAttachmentToDrive(input);
  if (!attachment) return attachment;
  return decorateSingleAttachmentWithPreviewState(client, attachment);
}

async function decorateSingleAttachmentWithPreviewState(client: ReturnType<typeof getAsyncDatabaseClient>, attachment: MasterAttachmentRecord) {
  const decorated = await decorateMasterAttachmentsWithPreviewState(client, [attachment]);
  return decorated[0] ?? attachment;
}
