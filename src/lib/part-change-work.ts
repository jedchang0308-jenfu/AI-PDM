import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { runDev087IdempotentCommand, dev087RequestHash, replayDev087TerminalReceipt } from "@/lib/pdm-canonical-command";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { runPrincipalDev087Command } from "@/lib/pdm-principal-dev087-command";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { issueCanonicalWorkbenchContract, verifyCanonicalWorkbenchCommandContract } from "@/lib/pdm-workbench-authority-control";
import { beginDev087Approval, dev087FaultHandling, recordDev087Fault, returnDev087WorkForCorrection, type Dev087ReviewDecision } from "@/lib/pdm-work-review";
import { PartChangeWorkAsyncRepository, validatePartChangePayload, type PartChangePayload } from "@/lib/repositories/part-change-work-async-repository";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";
import { selectPrincipalReviewerInSnapshot } from "@/lib/repositories/pdm-principal-reviewer-selector";
import { buildReviewPackage, reviewPackageV2WriteEnabled, verifyReviewPackageIntegrity } from "@/lib/pdm-review-package";
import { parseReviewPackageSnapshot } from "@/lib/pdm-review-package-contract";

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

  private async requirePrincipalCapability(verified: VerifiedPrincipalRequest,
    permissionCode: string, requireAal2 = false) {
    if (this.client.kind !== "postgres" || this.client.transactionScope !== "postgres" ||
        (requireAal2 && verified.session.assuranceLevel !== "aal2")) {
      throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403);
    }
    const [capability] = await evaluatePrincipalWorkspacePermissionsInSnapshot(this.client,
      verified, [{ permissionKind: "action", permissionCode }]);
    if (!capability?.allowed) {
      throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403);
    }
    return { companyId: verified.profile.companyId, actorId: verified.profile.pdmUserId };
  }

  private async verify(actor: PartChangeActor, token: string) {
    return verifyCanonicalWorkbenchCommandContract(this.client, { companyId: actor.companyId, actorId: actor.id, token });
  }

  async read(workId: string, actor: PartChangeActor) {
    const repository = new PartChangeWorkAsyncRepository(this.client);
    const work = await repository.readWork(this.client, actor.companyId, workId);
    if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "修改資料不存在", 404);
    assertEditor(actor, work.owner_user_id);
    const payload = typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) : work.proposed_payload;
    const [identity, attachments, formalAttributes] = await Promise.all([
      this.client.queryOne(`SELECT part_number AS code, part_name AS name FROM part_numbers WHERE id = :partId AND company_id = :companyId`, { partId: work.part_id, companyId: actor.companyId }),
      this.client.query(`SELECT asset.id, asset.file_name, asset.display_name, asset.document_category, asset.mime_type, asset.file_size
        FROM file_assets asset WHERE asset.linked_entity_type = 'part_number' AND asset.linked_entity_id = :partId AND asset.deleted_at IS NULL
        ORDER BY asset.created_at DESC, asset.id DESC`, { partId: work.part_id }),
      this.client.query<{ key: string; label: string; value: string | null; applicabilityState: string }>(
        `SELECT definition.stable_key AS key, definition.display_label AS label, value.value_text AS value,
                value.applicability_state AS "applicabilityState"
         FROM pdm_part_attribute_values value
         JOIN pdm_attribute_definitions definition
           ON definition.id = value.attribute_definition_id AND definition.company_id = value.company_id
         WHERE value.company_id = :companyId AND value.part_number_id = :partId
         ORDER BY definition.display_label, definition.stable_key`,
        { partId: work.part_id, companyId: actor.companyId }
      )
    ]);
    return { data: { entityType: "part" as const, entityId: work.part_id, workId: work.id, rowVersion: Number(work.row_version), payload, identity, attachments, formalAttributes, readonly: false }, meta: { contractToken: await issueCanonicalWorkbenchContract(this.client, { companyId: actor.companyId, actorId: actor.id }), correlationId: crypto.randomUUID() } };
  }

  async readPrincipal(workId: string, verified: VerifiedPrincipalRequest) {
    const { companyId, actorId } = await this.requirePrincipalCapability(verified,
      "numbering.workspace.view");
    const [update] = await evaluatePrincipalWorkspacePermissionsInSnapshot(this.client,
      verified, [{ permissionKind: "action", permissionCode: "numbering.workspace.update" }]);
    const result = await this.read(workId, {
      id: actorId, companyId, canEditNonOwned: false,
      permissions: { create: false, update: false, submit: false,
        cancel: false, decide: false }
    });
    return { ...result, data: { ...result.data, readonly: !update?.allowed } };
  }

  async create(partId: string, actor: PartChangeActor, context: CommandContext, initialPayload?: unknown) {
    assertAllowed(actor.permissions.create);
    await this.verify(actor, context.contractToken);
    const validatedInitialPayload = initialPayload === undefined ? undefined : validatePartChangePayload(initialPayload);
    const repository = new PartChangeWorkAsyncRepository(this.client);
    const request = validatedInitialPayload ? { partId, expectedRowVersion: context.expectedRowVersion, initialPayload: validatedInitialPayload } : { partId, expectedRowVersion: context.expectedRowVersion };
    return runDev087IdempotentCommand(this.client, {
      companyId: actor.companyId, actorId: actor.id, command: "part.create", idempotencyKey: context.idempotencyKey,
      request, effectKey: `part-work:${partId}`, correlationId: correlation(context.correlationId)
    }, (tx) => repository.create(tx, { companyId: actor.companyId, partId, ownerUserId: actor.id, expectedFormalRowVersion: context.expectedRowVersion, initialPayload: validatedInitialPayload }));
  }

  async createPrincipal(partId: string, verified: VerifiedPrincipalRequest,
    context: CommandContext, initialPayload?: unknown) {
    const { companyId, actorId } = await this.requirePrincipalCapability(verified,
      "numbering.workspace.create");
    await verifyCanonicalWorkbenchCommandContract(this.client,
      { companyId, actorId, token: context.contractToken });
    const validated = initialPayload === undefined ? undefined
      : validatePartChangePayload(initialPayload);
    return runPrincipalDev087Command(this.client, verified, {
      command: "part.create", idempotencyKey: context.idempotencyKey,
      request: { partId, expectedRowVersion: context.expectedRowVersion,
        ...(validated ? { initialPayload: validated } : {}) },
      effectKey: `part-work:${partId}`, correlationId: correlation(context.correlationId)
    }, (tx) => new PartChangeWorkAsyncRepository(tx).create(tx, {
      companyId, partId, ownerUserId: actorId,
      expectedFormalRowVersion: context.expectedRowVersion,
      initialPayload: validated
    }));
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

  async updatePrincipal(workId: string, payload: unknown,
    verified: VerifiedPrincipalRequest, context: CommandContext) {
    const { companyId, actorId } = await this.requirePrincipalCapability(verified,
      "numbering.workspace.update");
    await verifyCanonicalWorkbenchCommandContract(this.client,
      { companyId, actorId, token: context.contractToken });
    const validated = validatePartChangePayload(payload);
    return runPrincipalDev087Command(this.client, verified, {
      command: "part.update", idempotencyKey: context.idempotencyKey,
      request: { workId, expectedRowVersion: context.expectedRowVersion, payload: validated },
      effectKey: `part-work:${workId}:update`, correlationId: correlation(context.correlationId)
    }, async (tx) => {
      const repository = new PartChangeWorkAsyncRepository(tx);
      const locked = await repository.readWork(tx, companyId, workId, true);
      if (!locked) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "修改資料不存在", 404);
      if (locked.owner_user_id !== actorId) {
        throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403);
      }
      return repository.update(tx, { companyId, workId,
        expectedRowVersion: context.expectedRowVersion, payload: validated });
    });
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
    }, (tx) => this.applySubmission(tx, workId, actor.companyId,
      context.expectedRowVersion, false));
  }

  /** The HTTP caller must have verified the v2 session in this serializable write snapshot. */
  async submitPrincipal(workId: string, verified: VerifiedPrincipalRequest, context: CommandContext) {
    const { companyId, actorId } = await this.requirePrincipalCapability(verified,
      "numbering.candidate.review.submit", true);
    await verifyCanonicalWorkbenchCommandContract(this.client,
      { companyId, actorId, token: context.contractToken });
    return runPrincipalDev087Command(this.client, verified, {
      command: "part.submit", idempotencyKey: context.idempotencyKey,
      request: { workId, expectedRowVersion: context.expectedRowVersion },
      effectKey: `part-work:${workId}:review`, correlationId: correlation(context.correlationId)
    }, (tx) => this.applySubmission(tx, workId, companyId,
      context.expectedRowVersion, true, actorId));
  }

  private async applySubmission(tx: AsyncDatabaseClient, workId: string,
    companyId: string, expectedRowVersion: number, principalOnly: boolean,
    principalOwnerId?: string) {
    const locked = await new PartChangeWorkAsyncRepository(tx)
      .readWork(tx, companyId, workId, true);
    if (!locked || Number(locked.row_version) !== expectedRowVersion) {
      throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
    }
    if (principalOnly && locked.owner_user_id !== principalOwnerId) {
      throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403);
    }
    const reviewRepository = new PdmWorkReviewAsyncRepository(tx);
    const reviewerUserId = principalOnly
      ? await selectPrincipalReviewerInSnapshot(tx,
        { companyId, ownerUserId: locked.owner_user_id })
      : await reviewRepository.selectReviewer(tx,
        { companyId, ownerUserId: locked.owner_user_id });
    const snapshotPayload = typeof locked.proposed_payload === "string"
      ? JSON.parse(locked.proposed_payload) as PartChangePayload : locked.proposed_payload;
    const snapshotHash = dev087RequestHash(snapshotPayload);
    const packagePayload = principalOnly || reviewPackageV2WriteEnabled()
      ? await buildReviewPackage(tx, {
        companyId, requestKind: "part_change", entityType: "part",
        canonicalEntityId: locked.part_id, workId, branchId: null,
        decisionBasis: { hash: snapshotHash, payload: snapshotPayload }
      })
      : snapshotPayload;
    const request = await reviewRepository.create(tx, {
      companyId, requestKind: "part_change", entityType: "part",
      canonicalEntityId: locked.part_id, workId, reviewerUserId,
      snapshotPayload: packagePayload,
      snapshotHash: "packageHash" in packagePayload ? packagePayload.packageHash : snapshotHash
    });
    await tx.execute(`UPDATE canonical_workbench_states SET handling = 'review_owner', row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND work_id = :workId AND handling = 'owner'`, { companyId, workId });
    return { requestId: request.id, reviewCycleId: request.reviewCycleId,
      rowVersion: request.rowVersion };
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

  async cancelPrincipal(workId: string, verified: VerifiedPrincipalRequest,
    context: CommandContext) {
    const { companyId, actorId } = await this.requirePrincipalCapability(verified,
      "numbering.workspace.cancel");
    await verifyCanonicalWorkbenchCommandContract(this.client,
      { companyId, actorId, token: context.contractToken });
    return runPrincipalDev087Command(this.client, verified, {
      command: "part.cancel", idempotencyKey: context.idempotencyKey,
      request: { workId, expectedRowVersion: context.expectedRowVersion },
      effectKey: `part-work:${workId}:cancel`, correlationId: correlation(context.correlationId)
    }, async (tx) => {
      const repository = new PartChangeWorkAsyncRepository(tx);
      const locked = await repository.readWork(tx, companyId, workId, true);
      if (!locked) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "修改資料不存在", 404);
      if (locked.owner_user_id !== actorId) {
        throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403);
      }
      return repository.cancel(tx, { companyId, workId,
        expectedRowVersion: context.expectedRowVersion });
    });
  }

  async decide(requestId: string, decision: Dev087ReviewDecision, actor: PartChangeActor, context: CommandContext) {
    assertAllowed(actor.permissions.decide);
    await this.verify(actor, context.contractToken);
    const correlationId = correlation(context.correlationId);
    const commandRequest = { requestId, decision, expectedRowVersion: context.expectedRowVersion };
    const replay = await replayDev087TerminalReceipt<{ acknowledged: true }>(this.client, {
      companyId: actor.companyId, actorId: actor.id, command: "review.decision", idempotencyKey: context.idempotencyKey,
      request: commandRequest, correlationId
    });
    if (replay) return replay;
    const reviewRepository = new PdmWorkReviewAsyncRepository(this.client);
    const request = await reviewRepository.get(this.client, { companyId: actor.companyId, requestId });
    if (!request || request.requestKind !== "part_change" || request.reviewerUserId !== actor.id) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "審核項目不存在", 404);
    return runDev087IdempotentCommand(this.client, {
      companyId: actor.companyId, actorId: actor.id, command: "review.decision", idempotencyKey: context.idempotencyKey,
      request: commandRequest, effectKey: `review:${request.reviewCycleId}`, correlationId, terminalReview: true
    }, (tx) => this.applyDecision(tx, requestId, decision, actor.companyId,
      actor.id, context.expectedRowVersion));
  }

  /** The HTTP caller must have verified the v2 session and capability in this transaction. */
  async decidePrincipal(requestId: string, decision: Dev087ReviewDecision,
    verified: VerifiedPrincipalRequest, context: CommandContext) {
    const { companyId, actorId } = await this.requirePrincipalCapability(verified,
      "approval.request.decide", true);
    await verifyCanonicalWorkbenchCommandContract(this.client,
      { companyId, actorId, token: context.contractToken });
    return runPrincipalDev087Command(this.client, verified, {
      command: "review.decision", idempotencyKey: context.idempotencyKey,
      request: { requestId, decision, expectedRowVersion: context.expectedRowVersion },
      effectKey: `review:${requestId}`, correlationId: correlation(context.correlationId)
    }, (tx) => this.applyDecision(tx, requestId, decision, companyId,
      actorId, context.expectedRowVersion, true));
  }

  private async applyDecision(tx: AsyncDatabaseClient, requestId: string,
    decision: Dev087ReviewDecision, companyId: string, actorId: string,
    expectedRowVersion: number, principalOnly = false) {
    const reviewRepository = new PdmWorkReviewAsyncRepository(tx);
    const locked = await reviewRepository.get(tx, { companyId, requestId }, true);
    if (!locked || locked.requestKind !== "part_change" ||
        locked.reviewerUserId !== actorId || locked.requestStatus !== "pending" ||
        locked.rowVersion !== expectedRowVersion) {
      throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_REQUEST_STALE", "重新開啟目前審核項目", 409);
    }
    const parsedPackage = parseReviewPackageSnapshot(locked.snapshotPayload);
    if (parsedPackage.kind === "invalid") throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包格式無效", 409);
    if (principalOnly && parsedPackage.kind !== "v2") {
      throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包格式無效", 409);
    }
    const verifiedPackage = parsedPackage.kind === "v2" ? verifyReviewPackageIntegrity(locked.snapshotPayload, locked.snapshotHash) : null;
    if (decision === "return_for_correction") return returnDev087WorkForCorrection(tx, locked);
    await beginDev087Approval(tx, locked);
    const faultHandling = dev087FaultHandling();
    if (faultHandling) return recordDev087Fault(tx, locked, faultHandling);
    if (!locked.workId) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409);
    const workRepository = new PartChangeWorkAsyncRepository(tx);
    const work = await workRepository.readWork(tx, companyId, locked.workId, true);
    const expectedHash = verifiedPackage?.decisionBasis.hash ?? locked.snapshotHash;
    if (!work || dev087RequestHash(typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) : work.proposed_payload) !== expectedHash) {
      throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409);
    }
    await workRepository.formalize(tx, { companyId, work, reviewCycleId: locked.reviewCycleId });
    await reviewRepository.recordTerminalReceipt(tx, locked);
    await tx.execute(`DELETE FROM pdm_work_review_requests WHERE id = :id AND company_id = :companyId`, locked);
    return { acknowledged: true };
  }
}
