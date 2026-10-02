import crypto from "node:crypto";
import { canonicalJsonStringify } from "@/lib/canonical-json";
import { createPdmCommand, type PdmCommandMetadata } from "@/lib/platform-command";
import { executePdmCommandWithOutbox } from "@/lib/platform-command-service";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  decorateMasterAttachmentsWithPreviewState,
  enqueuePreviewJobForAttachmentAsync,
  getPreviewDerivativeBytesForAttachmentAsync,
  isNativeSolidWorksPreviewSource,
  requestedPreviewKindForSource,
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
        && attachment.previewJob.requestedKind === requestedPreviewKindForSource(attachment.fileExt)
        && (attachment.previewJob.status === "queued" || attachment.previewJob.status === "running");
      if (hasCurrentDerivative || hasActiveJob) continue;
      if (attachment.previewJob?.sourceContentHash === attachment.contentHash
        && attachment.previewJob.requestedKind === requestedPreviewKindForSource(attachment.fileExt)
        && attachment.previewJob.status !== "cancelled") continue;
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
  await recoverStalePreviewJobsAsync(client);
  const decorated = await decorateMasterAttachmentsWithPreviewState(client, [attachment]);
  return decorated[0] ?? attachment;
}

/** The caller's verified Principal/company authorization and this read share one snapshot.
 * A GET never repairs jobs or queues preview work; those are authorized commands.
 */
export async function listMasterAttachmentsInCompanyAsync(snapshot: AsyncDatabaseClient, input: {
  entityType: MasterAttachmentEntityType;
  entityCode: string;
  companyId: string;
  deleted: boolean;
}) {
  const repository = new AsyncMasterAttachmentRepository(snapshot);
  if (input.deleted) return repository.listDeletedMasterAttachmentsInCompany(input);
  const result = await repository.listMasterAttachmentsInCompany(input);
  if (!result) return result;
  return { ...result, attachments: await decorateMasterAttachmentsWithPreviewState(snapshot, result.attachments) };
}

/** Attachment writes, published grants, canonical actor and outbox share one transaction. */
export async function executeMasterAttachmentCommandAsync(input: {
  kind: "delete" | "restore" | "preview";
  entityType: MasterAttachmentEntityType;
  entityCode: string;
  attachmentId: string;
  reason?: string;
  requestedKind?: "native_thumbnail_png" | "drawing_pdf";
  forceRegenerate?: boolean;
}, metadata: PdmCommandMetadata) {
  if (metadata.actor.authorizationActor?.sessionSchemaVersion !== 2 ||
      !metadata.principalRequest || !metadata.principalAuthorization ||
      metadata.principalAuthorization.permissionCode !== "numbering.attachments.manage") {
    throw new Error("MASTER_ATTACHMENT_PRINCIPAL_CONTEXT_REQUIRED");
  }
  const command = createPdmCommand({ commandName: `pdm.master_attachment.${input.kind}`,
    idempotencyKey: metadata.idempotencyKey, actor: metadata.actor, payload: input });
  const executed = await executePdmCommandWithOutbox({
    client: getAsyncDatabaseClient(), command,
    principalRequest: metadata.principalRequest, principalAuthorization: metadata.principalAuthorization,
    serializable: true,
    execute: async (snapshot, _decision, verified) => {
      if (!verified || verified.session.principalId !== metadata.actor.principalId ||
          verified.profile.companyId !== metadata.actor.organizationId ||
          verified.profile.pdmUserId !== metadata.actor.pdmUserId) {
        throw new Error("MASTER_ATTACHMENT_PRINCIPAL_CONTEXT_REQUIRED");
      }
      const repository = new AsyncMasterAttachmentRepository(snapshot, undefined, undefined, {
        companyId: verified.profile.companyId, principalId: verified.session.principalId,
        profileId: verified.profile.pdmUserId, profileVersion: verified.session.profileVersion
      });
      if (input.kind === "delete") {
        await repository.softDeleteMasterAttachment({ ...input, deletedBy: verified.profile.pdmUserId });
        return { deleted: true };
      }
      if (input.kind === "restore") {
        const attachment = await repository.restoreMasterAttachment({ ...input, restoredBy: verified.profile.pdmUserId });
        const policy = await repository.getMasterAttachmentLifecyclePolicy(input);
        return { attachment, policy };
      }
      if (!await repository.getMasterAttachment(input)) throw new Error("MASTER_ATTACHMENT_NOT_FOUND");
      return enqueuePreviewJobForAttachmentAsync(snapshot, { ...input,
        companyId: verified.profile.companyId, actorUserId: verified.profile.pdmUserId,
        initiatorPrincipalId: verified.session.principalId,
        generatorProfile: "windows_solidworks_preview_worker", runFakeWorker: false });
    },
    event: () => ({ aggregateType: "master_attachment", aggregateId: input.attachmentId,
      eventType: `pdm.master_attachment.${input.kind}`, payload: input })
  });
  return executed.result;
}

export async function getMasterAttachmentInCompanyAsync(snapshot: AsyncDatabaseClient, input: {
  entityType: MasterAttachmentEntityType; entityCode: string; attachmentId: string; companyId: string;
}) {
  const attachment = await new AsyncMasterAttachmentRepository(snapshot).getMasterAttachmentInCompany(input);
  if (!attachment) return null;
  const decorated = await decorateMasterAttachmentsWithPreviewState(snapshot, [attachment]);
  return decorated[0] ?? attachment;
}

/** Stable binary identity is derived from the command binding, never from an email/UID.
 * Content effects are idempotent and are not placed in a serializable auto-retry.
 * A failed DB commit may retain an unreferenced blob; never delete a potentially
 * shared existing object as compensation. Receipt replay determines DB outcome.
 */
export async function executeMasterAttachmentUploadAsync(input: {
  entityType: MasterAttachmentEntityType; entityCode: string; file: File;
  documentCategory: string; displayName?: string; description?: string; revision?: string | null;
}, metadata: PdmCommandMetadata) {
  if (metadata.actor.authorizationActor?.sessionSchemaVersion !== 2 ||
      !metadata.principalRequest || !metadata.principalAuthorization ||
      metadata.principalAuthorization.permissionCode !== "numbering.attachments.manage") {
    throw new Error("MASTER_ATTACHMENT_PRINCIPAL_CONTEXT_REQUIRED");
  }
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  const payload = {entityType:input.entityType,entityCode:input.entityCode,
    documentCategory:input.documentCategory,displayName:input.displayName ?? "",
    description:input.description ?? "",revision:input.revision ?? null,
    fileName:input.file.name,mimeType:input.file.type,fileSize:bytes.length,contentSha256:digest};
  const identity = crypto.createHash("sha256").update(canonicalJsonStringify({
    commandName:"pdm.master_attachment.upload",principalId:metadata.actor.principalId,
    companyId:metadata.actor.organizationId,idempotencyKey:metadata.idempotencyKey
  })).digest("hex");
  const attachmentId = `${identity.slice(0,8)}-${identity.slice(8,12)}-5${identity.slice(13,16)}-a${identity.slice(17,20)}-${identity.slice(20,32)}`;
  const command = createPdmCommand({commandName:"pdm.master_attachment.upload",
    idempotencyKey:metadata.idempotencyKey,actor:metadata.actor,payload});
  const executed = await executePdmCommandWithOutbox({client:getAsyncDatabaseClient(),command,
    principalRequest:metadata.principalRequest,principalAuthorization:metadata.principalAuthorization,
    serializable:false,
    execute:async (snapshot,_decision,verified) => {
      if (!verified || verified.session.principalId !== metadata.actor.principalId ||
          verified.profile.companyId !== metadata.actor.organizationId ||
          verified.profile.pdmUserId !== metadata.actor.pdmUserId) {
        throw new Error("MASTER_ATTACHMENT_PRINCIPAL_CONTEXT_REQUIRED");
      }
      const repository = new AsyncMasterAttachmentRepository(snapshot,undefined,undefined,{
        companyId:verified.profile.companyId,profileId:verified.profile.pdmUserId,
        principalId:verified.session.principalId,profileVersion:verified.session.profileVersion
      });
      const attachment = await repository.createMasterAttachment({...input,attachmentId,
        file:new File([new Uint8Array(bytes)],input.file.name,{type:input.file.type}),
        uploadedBy:verified.profile.pdmUserId,deferDriveSync:true});
      if (!attachment) throw new Error("MASTER_ATTACHMENT_CREATE_FAILED");
      if (isNativeSolidWorksPreviewSource(attachment.fileExt)) {
        await enqueuePreviewJobForAttachmentAsync(snapshot,{entityType:input.entityType,
          entityCode:input.entityCode,attachmentId,companyId:verified.profile.companyId,
          actorUserId:verified.profile.pdmUserId,initiatorPrincipalId:verified.session.principalId,
          requestedKind:"native_thumbnail_png",generatorProfile:"windows_solidworks_preview_worker",runFakeWorker:false});
      }
      const decorated = await decorateMasterAttachmentsWithPreviewState(snapshot,[attachment]);
      return decorated[0] ?? attachment;
    },
    event:attachment => ({aggregateType:"master_attachment",aggregateId:attachment.id,
      eventType:"pdm.master_attachment.upload",payload:{...payload,attachmentId:attachment.id}})
  });
  return executed.result;
}
