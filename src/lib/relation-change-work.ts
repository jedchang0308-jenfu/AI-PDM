import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { dev087RequestHash, replayDev087TerminalReceipt, runDev087IdempotentCommand } from "@/lib/pdm-canonical-command";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { issueCanonicalWorkbenchContract, verifyCanonicalWorkbenchCommandContract } from "@/lib/pdm-workbench-authority-control";
import { beginDev087Approval, dev087FaultHandling, recordDev087Fault, returnDev087WorkForCorrection, type Dev087ReviewDecision } from "@/lib/pdm-work-review";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";
import { RelationChangeWorkAsyncRepository, validateRelationChangeTree } from "@/lib/repositories/relation-change-work-async-repository";

export type RelationChangeActor = { id: string; companyId: string; canEditNonOwned: boolean; permissions: { create: boolean; update: boolean; submit: boolean; cancel: boolean; decide: boolean } };
type CommandContext = { idempotencyKey: string; contractToken: string; expectedRowVersion: number; correlationId?: string };
function correlation(value?: string) { return value?.trim() || crypto.randomUUID(); }
function allow(value: boolean) { if (!value) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403); }
function edit(actor: RelationChangeActor, owner: string) { if (actor.id !== owner && !actor.canEditNonOwned) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403); }

export class RelationChangeWorkService {
  constructor(private readonly client: AsyncDatabaseClient = getAsyncDatabaseClient()) {}
  private verify(actor: RelationChangeActor, token: string) { return verifyCanonicalWorkbenchCommandContract(this.client, { companyId: actor.companyId, actorId: actor.id, token }); }
  async read(workId: string, actor: RelationChangeActor) {
    const repository = new RelationChangeWorkAsyncRepository(this.client); const work = await repository.readWork(this.client, actor.companyId, workId);
    if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "調整資料不存在", 404); edit(actor, work.owner_user_id);
    const tree = typeof work.proposed_tree === "string" ? JSON.parse(work.proposed_tree) : work.proposed_tree;
    const [drawings, parts, root] = await Promise.all([
      this.client.query(`SELECT id, drawing_number AS code FROM drawing_numbers WHERE company_id = :companyId AND part_root_id = :rootId ORDER BY drawing_number`, { companyId: actor.companyId, rootId: work.root_id }),
      this.client.query(`SELECT id, part_number AS code, part_name AS name FROM part_numbers WHERE company_id = :companyId AND part_root_id = :rootId ORDER BY part_number`, { companyId: actor.companyId, rootId: work.root_id }),
      this.client.queryOne(`SELECT root_code AS code, core_name AS name FROM part_roots WHERE company_id = :companyId AND id = :rootId`, { companyId: actor.companyId, rootId: work.root_id })
    ]);
    return { data: { entityType: "relation" as const, entityId: work.root_id, workId: work.id, rowVersion: Number(work.row_version), payload: tree, options: { drawings, parts }, identity: root, readonly: false }, meta: { contractToken: await issueCanonicalWorkbenchContract(this.client, { companyId: actor.companyId, actorId: actor.id }), correlationId: crypto.randomUUID() } };
  }
  async create(rootId: string, actor: RelationChangeActor, context: CommandContext) {
    allow(actor.permissions.create); await this.verify(actor, context.contractToken); const repository = new RelationChangeWorkAsyncRepository(this.client);
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "relation.create", idempotencyKey: context.idempotencyKey, request: { rootId, expectedRowVersion: context.expectedRowVersion }, effectKey: `relation-work:${rootId}`, correlationId: correlation(context.correlationId) }, (tx) => repository.create(tx, { companyId: actor.companyId, rootId, ownerUserId: actor.id, expectedFormalRowVersion: context.expectedRowVersion }));
  }
  async update(workId: string, value: unknown, actor: RelationChangeActor, context: CommandContext) {
    allow(actor.permissions.update); await this.verify(actor, context.contractToken); const repository = new RelationChangeWorkAsyncRepository(this.client); const work = await repository.readWork(this.client, actor.companyId, workId); if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "調整資料不存在", 404); edit(actor, work.owner_user_id); const tree = validateRelationChangeTree(value);
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "relation.update", idempotencyKey: context.idempotencyKey, request: { workId, expectedRowVersion: context.expectedRowVersion, tree }, effectKey: `relation-work:${workId}:update`, correlationId: correlation(context.correlationId) }, (tx) => repository.update(tx, { companyId: actor.companyId, workId, expectedRowVersion: context.expectedRowVersion, tree }));
  }
  async submit(workId: string, actor: RelationChangeActor, context: CommandContext) {
    allow(actor.permissions.submit); await this.verify(actor, context.contractToken); const repository = new RelationChangeWorkAsyncRepository(this.client); const work = await repository.readWork(this.client, actor.companyId, workId); if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "調整資料不存在", 404); edit(actor, work.owner_user_id);
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "relation.submit", idempotencyKey: context.idempotencyKey, request: { workId, expectedRowVersion: context.expectedRowVersion }, effectKey: `relation-work:${workId}:review`, correlationId: correlation(context.correlationId) }, async (tx) => {
      const locked = await repository.readWork(tx, actor.companyId, workId, true); if (!locked || Number(locked.row_version) !== context.expectedRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
      const reviewRepository = new PdmWorkReviewAsyncRepository(tx); const reviewerUserId = await reviewRepository.selectReviewer(tx, { companyId: actor.companyId, ownerUserId: locked.owner_user_id }); const snapshotPayload = typeof locked.proposed_tree === "string" ? JSON.parse(locked.proposed_tree) : locked.proposed_tree;
      const request = await reviewRepository.create(tx, { companyId: actor.companyId, requestKind: "relation_change", entityType: "relation", canonicalEntityId: locked.root_id, workId, reviewerUserId, snapshotPayload, snapshotHash: locked.proposed_tree_hash });
      await tx.execute(`UPDATE canonical_workbench_states SET handling = 'review_owner', row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND work_id = :workId AND handling = 'owner'`, { companyId: actor.companyId, workId }); return { requestId: request.id, reviewCycleId: request.reviewCycleId, rowVersion: request.rowVersion };
    });
  }
  async cancel(workId: string, actor: RelationChangeActor, context: CommandContext) {
    allow(actor.permissions.cancel); await this.verify(actor, context.contractToken); const repository = new RelationChangeWorkAsyncRepository(this.client); const work = await repository.readWork(this.client, actor.companyId, workId); if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "調整資料不存在", 404); edit(actor, work.owner_user_id);
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "relation.cancel", idempotencyKey: context.idempotencyKey, request: { workId, expectedRowVersion: context.expectedRowVersion }, effectKey: `relation-work:${workId}:cancel`, correlationId: correlation(context.correlationId) }, (tx) => repository.cancel(tx, { companyId: actor.companyId, workId, expectedRowVersion: context.expectedRowVersion }));
  }
  async decide(requestId: string, decision: Dev087ReviewDecision, actor: RelationChangeActor, context: CommandContext) {
    allow(actor.permissions.decide); await this.verify(actor, context.contractToken); const correlationId = correlation(context.correlationId); const commandRequest = { requestId, decision, expectedRowVersion: context.expectedRowVersion };
    const replay = await replayDev087TerminalReceipt<{ acknowledged: true }>(this.client, { companyId: actor.companyId, command: "review.decision", idempotencyKey: context.idempotencyKey, request: commandRequest, correlationId }); if (replay) return replay;
    const reviews = new PdmWorkReviewAsyncRepository(this.client); const request = await reviews.get(this.client, { companyId: actor.companyId, requestId }); if (!request || request.requestKind !== "relation_change" || request.reviewerUserId !== actor.id) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "審核項目不存在", 404);
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "review.decision", idempotencyKey: context.idempotencyKey, request: commandRequest, effectKey: `review:${request.reviewCycleId}`, correlationId, terminalReview: true }, async (tx) => {
      const locked = await reviews.get(tx, { companyId: actor.companyId, requestId }, true); if (!locked || locked.reviewerUserId !== actor.id || locked.requestStatus !== "pending" || locked.rowVersion !== context.expectedRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_REQUEST_STALE", "重新開啟目前審核項目", 409);
      if (decision === "return_for_correction") return returnDev087WorkForCorrection(tx, locked); await beginDev087Approval(tx, locked);
      const faultHandling = dev087FaultHandling();
      if (faultHandling) {
        return recordDev087Fault(tx, locked, faultHandling);
      }
      if (!locked.workId) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409);
      const repository = new RelationChangeWorkAsyncRepository(tx); const work = await repository.readWork(tx, actor.companyId, locked.workId, true); if (!work || work.proposed_tree_hash !== locked.snapshotHash || dev087RequestHash(typeof work.proposed_tree === "string" ? JSON.parse(work.proposed_tree) : work.proposed_tree) !== locked.snapshotHash) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409);
      await repository.formalize(tx, { companyId: actor.companyId, work, reviewCycleId: locked.reviewCycleId }); await tx.execute(`DELETE FROM pdm_work_review_requests WHERE id = :id AND company_id = :companyId`, locked); return { acknowledged: true };
    });
  }
}
