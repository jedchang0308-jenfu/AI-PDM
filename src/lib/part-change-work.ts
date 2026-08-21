import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { runDev087IdempotentCommand, dev087RequestHash, replayDev087TerminalReceipt } from "@/lib/pdm-canonical-command";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { issueCanonicalWorkbenchContract, verifyCanonicalWorkbenchCommandContract } from "@/lib/pdm-workbench-authority-control";
import { beginDev087Approval, returnDev087WorkForCorrection, type Dev087ReviewDecision } from "@/lib/pdm-work-review";
import { PartChangeWorkAsyncRepository, validatePartChangePayload, type PartChangePayload } from "@/lib/repositories/part-change-work-async-repository";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";

export type PartChangeActor = {
  id: string; companyId: string; canEditNonOwned: boolean;
  permissions: { create: boolean; update: boolean; submit: boolean; cancel: boolean; decide: boolean };
};
type CommandContext = { idempotencyKey: string; contractToken: string; expectedRowVersion: number; correlationId?: string };

function correlation(value?: string) { return value?.trim() || crypto.randomUUID(); }
function assertAllowed(allowed: boolean) { if (!allowed) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403); }
function assertEditor(actor: PartChangeActor, ownerId: string) {
  if (actor.id !== ownerId && !actor.canEditNonOwned) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403);
}

export class PartChangeWorkService {
  constructor(private readonly client: AsyncDatabaseClient = getAsyncDatabaseClient()) {}

  private async verify(actor: PartChangeActor, token: string) {
    return verifyCanonicalWorkbenchCommandContract(this.client, { companyId: actor.companyId, actorId: actor.id, token });
  }

  async read(workId: string, actor: PartChangeActor) {
    const repository = new PartChangeWorkAsyncRepository(this.client);
    const work = await repository.readWork(this.client, actor.companyId, workId);
    if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "修改資料不存在", 404);
    assertEditor(actor, work.owner_user_id);
    const payload = typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) : work.proposed_payload;
    const attachments = await this.client.query(`SELECT asset.id, asset.file_name, asset.display_name, asset.mime_type, asset.file_size
      FROM file_assets asset WHERE asset.linked_entity_type = 'part_number' AND asset.linked_entity_id = :partId AND asset.deleted_at IS NULL
      ORDER BY asset.created_at DESC, asset.id DESC`, { partId: work.part_id });
    return { data: { entityType: "part" as const, entityId: work.part_id, workId: work.id, rowVersion: Number(work.row_version), payload, attachments, readonly: false }, meta: { contractToken: await issueCanonicalWorkbenchContract(this.client, { companyId: actor.companyId, actorId: actor.id }), correlationId: crypto.randomUUID() } };
  }

  async create(partId: string, actor: PartChangeActor, context: CommandContext) {
    assertAllowed(actor.permissions.create);
    await this.verify(actor, context.contractToken);
    const repository = new PartChangeWorkAsyncRepository(this.client);
    return runDev087IdempotentCommand(this.client, {
      companyId: actor.companyId, actorId: actor.id, command: "part.create", idempotencyKey: context.idempotencyKey,
      request: { partId, expectedRowVersion: context.expectedRowVersion }, effectKey: `part-work:${partId}`, correlationId: correlation(context.correlationId)
    }, (tx) => repository.create(tx, { companyId: actor.companyId, partId, ownerUserId: actor.id, expectedFormalRowVersion: context.expectedRowVersion }));
  }

  async update(workId: string, payload: unknown, actor: PartChangeActor, context: CommandContext) {
    assertAllowed(actor.permissions.update);
    await this.verify(actor, context.contractToken);
    const repository = new PartChangeWorkAsyncRepository(this.client);
    const work = await repository.readWork(this.client, actor.companyId, workId);
    if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "修改資料不存在", 404);
    assertEditor(actor, work.owner_user_id);
    const validated = validatePartChangePayload(payload);
    return runDev087IdempotentCommand(this.client, {
      companyId: actor.companyId, actorId: actor.id, command: "part.update", idempotencyKey: context.idempotencyKey,
      request: { workId, expectedRowVersion: context.expectedRowVersion, payload: validated }, effectKey: `part-work:${workId}:update`, correlationId: correlation(context.correlationId)
    }, (tx) => repository.update(tx, { companyId: actor.companyId, workId, expectedRowVersion: context.expectedRowVersion, payload: validated }));
  }

  async submit(workId: string, actor: PartChangeActor, context: CommandContext) {
    assertAllowed(actor.permissions.submit);
    await this.verify(actor, context.contractToken);
    const workRepository = new PartChangeWorkAsyncRepository(this.client);
    const work = await workRepository.readWork(this.client, actor.companyId, workId);
    if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "修改資料不存在", 404);
    assertEditor(actor, work.owner_user_id);
    return runDev087IdempotentCommand(this.client, {
      companyId: actor.companyId, actorId: actor.id, command: "part.submit", idempotencyKey: context.idempotencyKey,
      request: { workId, expectedRowVersion: context.expectedRowVersion }, effectKey: `part-work:${workId}:review`, correlationId: correlation(context.correlationId)
    }, async (tx) => {
      const locked = await workRepository.readWork(tx, actor.companyId, workId, true);
      if (!locked || Number(locked.row_version) !== context.expectedRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
      const reviewRepository = new PdmWorkReviewAsyncRepository(tx);
      const reviewerUserId = await reviewRepository.selectReviewer(tx, { companyId: actor.companyId, ownerUserId: locked.owner_user_id });
      const snapshotPayload = typeof locked.proposed_payload === "string" ? JSON.parse(locked.proposed_payload) as PartChangePayload : locked.proposed_payload;
      const request = await reviewRepository.create(tx, { companyId: actor.companyId, requestKind: "part_change", entityType: "part", canonicalEntityId: locked.part_id, workId, reviewerUserId, snapshotPayload, snapshotHash: dev087RequestHash(snapshotPayload) });
      await tx.execute(`UPDATE canonical_workbench_states SET handling = 'review_owner', row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND work_id = :workId AND handling = 'owner'`, { companyId: actor.companyId, workId });
      return { requestId: request.id, reviewCycleId: request.reviewCycleId, rowVersion: request.rowVersion };
    });
  }

  async cancel(workId: string, actor: PartChangeActor, context: CommandContext) {
    assertAllowed(actor.permissions.cancel);
    await this.verify(actor, context.contractToken);
    const repository = new PartChangeWorkAsyncRepository(this.client);
    const work = await repository.readWork(this.client, actor.companyId, workId);
    if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "修改資料不存在", 404);
    assertEditor(actor, work.owner_user_id);
    return runDev087IdempotentCommand(this.client, {
      companyId: actor.companyId, actorId: actor.id, command: "part.cancel", idempotencyKey: context.idempotencyKey,
      request: { workId, expectedRowVersion: context.expectedRowVersion }, effectKey: `part-work:${workId}:cancel`, correlationId: correlation(context.correlationId)
    }, (tx) => repository.cancel(tx, { companyId: actor.companyId, workId, expectedRowVersion: context.expectedRowVersion }));
  }

  async decide(requestId: string, decision: Dev087ReviewDecision, actor: PartChangeActor, context: CommandContext) {
    assertAllowed(actor.permissions.decide);
    await this.verify(actor, context.contractToken);
    const correlationId = correlation(context.correlationId);
    const commandRequest = { requestId, decision, expectedRowVersion: context.expectedRowVersion };
    const replay = await replayDev087TerminalReceipt<{ acknowledged: true }>(this.client, {
      companyId: actor.companyId, command: "review.decision", idempotencyKey: context.idempotencyKey,
      request: commandRequest, correlationId
    });
    if (replay) return replay;
    const reviewRepository = new PdmWorkReviewAsyncRepository(this.client);
    const request = await reviewRepository.get(this.client, { companyId: actor.companyId, requestId });
    if (!request || request.requestKind !== "part_change" || request.reviewerUserId !== actor.id) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "審核項目不存在", 404);
    return runDev087IdempotentCommand(this.client, {
      companyId: actor.companyId, actorId: actor.id, command: "review.decision", idempotencyKey: context.idempotencyKey,
      request: commandRequest, effectKey: `review:${request.reviewCycleId}`, correlationId, terminalReview: true
    }, async (tx) => {
      const locked = await reviewRepository.get(tx, { companyId: actor.companyId, requestId }, true);
      if (!locked || locked.reviewerUserId !== actor.id || locked.requestStatus !== "pending" || locked.rowVersion !== context.expectedRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_REQUEST_STALE", "重新開啟目前審核項目", 409);
      if (decision === "return_for_correction") return returnDev087WorkForCorrection(tx, locked);
      await beginDev087Approval(tx, locked);
      if (!locked.workId) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409);
      const workRepository = new PartChangeWorkAsyncRepository(tx);
      const work = await workRepository.readWork(tx, actor.companyId, locked.workId, true);
      if (!work || dev087RequestHash(typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) : work.proposed_payload) !== locked.snapshotHash) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409);
      await workRepository.formalize(tx, { companyId: actor.companyId, work, reviewCycleId: locked.reviewCycleId });
      await tx.execute(`DELETE FROM pdm_work_review_requests WHERE id = :id AND company_id = :companyId`, locked);
      return { acknowledged: true };
    });
  }
}
