import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { dev087RequestHash, replayDev087TerminalReceipt, runDev087IdempotentCommand } from "@/lib/pdm-canonical-command";
import { CanonicalWorkbenchError, parseCanonicalRowKey } from "@/lib/pdm-canonical-workbench-contract";
import { issueCanonicalWorkbenchContract, verifyCanonicalWorkbenchCommandContract } from "@/lib/pdm-workbench-authority-control";
import { beginDev087Approval, dev087FaultHandling, recordDev087Fault, returnDev087WorkForCorrection, type Dev087ReviewDecision } from "@/lib/pdm-work-review";
import { DrawingRevisionWorkAsyncRepository, type RevisionTuple } from "@/lib/repositories/drawing-revision-work-async-repository";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";

export type DrawingRevisionActor = { id: string; companyId: string; canEditNonOwned: boolean; permissions: { create: boolean; update: boolean; submit: boolean; cancel: boolean; decide: boolean; obsolete: boolean } };
type CommandContext = { idempotencyKey: string; contractToken: string; expectedRowVersion: number; correlationId?: string };
type CandidatePayload = { version: 1; companyId: string; actorId: string; drawingId: string; sourceRowId: string; sourceRowVersion: number; target: RevisionTuple; expiresAt: number };
function correlation(value?: string) { return value?.trim() || crypto.randomUUID(); }
function allow(value: boolean) { if (!value) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403); }
function edit(actor: DrawingRevisionActor, owner: string) { if (actor.id !== owner && !actor.canEditNonOwned) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403); }
function secret() { return process.env.PDM_WORKBENCH_CONTRACT_SECRET?.trim() || process.env.PDM_AUTH_SECRET?.trim() || "local-dev087-candidate"; }
function candidateToken(payload: CandidatePayload) { const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url"); return `${encoded}.${crypto.createHmac("sha256", secret()).update(encoded).digest("base64url")}`; }
function verifyCandidateToken(value: string, expected: { actor: DrawingRevisionActor; drawingId: string; sourceRowId: string; sourceRowVersion: number }) {
  const [encoded, supplied, extra] = value.split("."); if (!encoded || !supplied || extra) throw new CanonicalWorkbenchError("WORKBENCH_CONTRACT_EXPIRED", "重新整理以使用新版本", 409);
  const signature = crypto.createHmac("sha256", secret()).update(encoded).digest("base64url"); if (signature.length !== supplied.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(supplied))) throw new CanonicalWorkbenchError("WORKBENCH_CONTRACT_EXPIRED", "重新整理以使用新版本", 409);
  let payload: CandidatePayload; try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CandidatePayload; } catch { throw new CanonicalWorkbenchError("WORKBENCH_CONTRACT_EXPIRED", "重新整理以使用新版本", 409); }
  if (payload.version !== 1 || payload.companyId !== expected.actor.companyId || payload.actorId !== expected.actor.id || payload.drawingId !== expected.drawingId || payload.sourceRowId !== expected.sourceRowId || payload.sourceRowVersion !== expected.sourceRowVersion || payload.expiresAt < Date.now()) throw new CanonicalWorkbenchError("WORKBENCH_CONTRACT_EXPIRED", "重新整理以使用新版本", 409);
  return payload;
}
function validateDrawingPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料格式無效", 422);
  const text = JSON.stringify(value); if (Buffer.byteLength(text, "utf8") > 2_000_000) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料過大", 422);
  const record = value as Record<string, unknown>;
  if (["branchId", "predecessorRevisionId", "sourceRevisionId", "companyId", "ownerUserId", "reviewerUserId"].some((key) => key in record)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料包含不可修改的系統欄位", 422);
  return record;
}

export class DrawingRevisionWorkService {
  constructor(private readonly client: AsyncDatabaseClient = getAsyncDatabaseClient()) {}
  private verify(actor: DrawingRevisionActor, token: string) { return verifyCanonicalWorkbenchCommandContract(this.client, { companyId: actor.companyId, actorId: actor.id, token }); }

  async read(workId: string, actor: DrawingRevisionActor) {
    const repository = new DrawingRevisionWorkAsyncRepository(this.client); const work = await repository.readWork(this.client, actor.companyId, workId);
    if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料不存在", 404); edit(actor, work.owner_user_id);
    const [drawing, files] = await Promise.all([
      this.client.queryOne(`SELECT drawing_number AS code, purpose_code, purpose_description FROM drawings WHERE id = :drawingId AND company_id = :companyId`, { drawingId: work.drawing_id, companyId: actor.companyId }),
      this.client.query(`SELECT binding.file_binding_id AS id, file.source_file_asset_id, file.display_name, file.role, asset.file_name, asset.mime_type, asset.file_size
        FROM drawing_revision_work_files binding JOIN drawing_revision_files file ON file.id = binding.file_binding_id
        JOIN file_assets asset ON asset.id = file.source_file_asset_id WHERE binding.work_id = :workId ORDER BY binding.ordinal, binding.file_binding_id`, { workId })
    ]);
    const raw = typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) as Record<string, unknown> : work.proposed_payload as Record<string, unknown>;
    const { drawingId: _drawingId, revisionId: _revisionId, predecessorRevisionId: _predecessorRevisionId, ...payload } = raw;
    return { data: { entityType: "drawing" as const, entityId: work.drawing_id, workId: work.id, revisionId: work.revision_id, revision: work.target_label, rowVersion: Number(work.row_version), payload, identity: drawing, files, readonly: work.handling !== "owner" }, meta: { contractToken: await issueCanonicalWorkbenchContract(this.client, { companyId: actor.companyId, actorId: actor.id }), correlationId: crypto.randomUUID() } };
  }

  async targets(drawingId: string, sourceRowKey: string, actor: DrawingRevisionActor) {
    allow(actor.permissions.create); const rowId = parseCanonicalRowKey(sourceRowKey); const repository = new DrawingRevisionWorkAsyncRepository(this.client); const source = await repository.readSourceState(this.client, actor.companyId, rowId);
    if (!source || source.drawing_id !== drawingId || source.handling !== "none" || source.work_id) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
    const candidates = await repository.listCandidates(this.client, source); const contractToken = await issueCanonicalWorkbenchContract(this.client, { companyId: actor.companyId, actorId: actor.id });
    return { data: { candidates: candidates.map((candidate) => ({ kind: candidate.kind, label: candidate.kind === "production" ? `量產版 ${candidate.target.label}` : `研發版 ${candidate.target.label}`, enabled: candidate.enabled, reason: candidate.reason, candidateToken: candidate.enabled ? candidateToken({ version: 1, companyId: actor.companyId, actorId: actor.id, drawingId, sourceRowId: rowId, sourceRowVersion: source.row_version, target: candidate.target, expiresAt: Date.now() + 10 * 60_000 }) : null })) }, meta: { contractToken, correlationId: crypto.randomUUID() } };
  }

  async create(drawingId: string, input: { sourceRowKey: string; candidateToken: string }, actor: DrawingRevisionActor, context: CommandContext) {
    allow(actor.permissions.create); await this.verify(actor, context.contractToken); const sourceRowId = parseCanonicalRowKey(input.sourceRowKey); const candidate = verifyCandidateToken(input.candidateToken, { actor, drawingId, sourceRowId, sourceRowVersion: context.expectedRowVersion }); const repository = new DrawingRevisionWorkAsyncRepository(this.client);
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "drawing.create", idempotencyKey: context.idempotencyKey, request: { drawingId, sourceRowId, target: candidate.target, expectedRowVersion: context.expectedRowVersion }, effectKey: `drawing:${drawingId}:${candidate.target.major}.${candidate.target.minor}`, correlationId: correlation(context.correlationId) }, (tx) => repository.create(tx, { companyId: actor.companyId, sourceRowId, ownerUserId: actor.id, expectedRowVersion: context.expectedRowVersion, target: candidate.target }));
  }

  async update(workId: string, value: unknown, actor: DrawingRevisionActor, context: CommandContext) {
    allow(actor.permissions.update); await this.verify(actor, context.contractToken); const repository = new DrawingRevisionWorkAsyncRepository(this.client); const work = await repository.readWork(this.client, actor.companyId, workId); if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料不存在", 404); edit(actor, work.owner_user_id); const payload = validateDrawingPayload(value);
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "drawing.update", idempotencyKey: context.idempotencyKey, request: { workId, expectedRowVersion: context.expectedRowVersion, payload }, effectKey: `drawing-work:${workId}:update`, correlationId: correlation(context.correlationId) }, (tx) => repository.update(tx, { companyId: actor.companyId, workId, expectedRowVersion: context.expectedRowVersion, payload }));
  }

  async submit(workId: string, actor: DrawingRevisionActor, context: CommandContext) {
    allow(actor.permissions.submit); await this.verify(actor, context.contractToken); const repository = new DrawingRevisionWorkAsyncRepository(this.client); const work = await repository.readWork(this.client, actor.companyId, workId); if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料不存在", 404); edit(actor, work.owner_user_id);
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "drawing.submit", idempotencyKey: context.idempotencyKey, request: { workId, expectedRowVersion: context.expectedRowVersion }, effectKey: `drawing-work:${workId}:review`, correlationId: correlation(context.correlationId) }, async (tx) => {
      const locked = await repository.readWork(tx, actor.companyId, workId, true); if (!locked || Number(locked.row_version) !== context.expectedRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
      const reviews = new PdmWorkReviewAsyncRepository(tx); const reviewerUserId = await reviews.selectReviewer(tx, { companyId: actor.companyId, ownerUserId: locked.owner_user_id }); const snapshotPayload = typeof locked.proposed_payload === "string" ? JSON.parse(locked.proposed_payload) : locked.proposed_payload; const snapshotHash = dev087RequestHash({ payload: snapshotPayload, revisionId: locked.revision_id, claimId: locked.target_claim_id });
      const request = await reviews.create(tx, { companyId: actor.companyId, requestKind: "drawing_revision", entityType: "drawing", canonicalEntityId: locked.drawing_id, workId, branchId: locked.branch_id, reviewerUserId, snapshotPayload: { payload: snapshotPayload, revisionId: locked.revision_id, claimId: locked.target_claim_id }, snapshotHash });
      await tx.execute(`UPDATE drawing_revisions SET lifecycle_state = 'in_review', updated_at = CURRENT_TIMESTAMP WHERE id = :revisionId AND company_id = :companyId`, { companyId: actor.companyId, revisionId: locked.revision_id });
      await tx.execute(`UPDATE canonical_workbench_states SET handling = 'review_owner', row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND work_id = :workId AND handling = 'owner'`, { companyId: actor.companyId, workId }); return { requestId: request.id, reviewCycleId: request.reviewCycleId, rowVersion: request.rowVersion };
    });
  }

  async cancel(workId: string, actor: DrawingRevisionActor, context: CommandContext) {
    allow(actor.permissions.cancel); await this.verify(actor, context.contractToken); const repository = new DrawingRevisionWorkAsyncRepository(this.client); const work = await repository.readWork(this.client, actor.companyId, workId); if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料不存在", 404); edit(actor, work.owner_user_id);
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "drawing.cancel", idempotencyKey: context.idempotencyKey, request: { workId, expectedRowVersion: context.expectedRowVersion }, effectKey: `drawing-work:${workId}:cancel`, correlationId: correlation(context.correlationId) }, (tx) => repository.cancel(tx, { companyId: actor.companyId, workId, expectedRowVersion: context.expectedRowVersion }));
  }

  async requestVoid(branchId: string, rowKey: string, actor: DrawingRevisionActor, context: CommandContext) {
    allow(actor.permissions.obsolete); await this.verify(actor, context.contractToken); const rowId = parseCanonicalRowKey(rowKey); const repository = new DrawingRevisionWorkAsyncRepository(this.client); const source = await repository.readSourceState(this.client, actor.companyId, rowId); if (!source || source.branch_id !== branchId || source.data_layer !== "drawing_rd" || source.handling !== "none" || source.work_id || source.branch_status !== "open" || !source.latest_approved_revision_id) throw new CanonicalWorkbenchError("DRAWING_RD_VOID_NOT_ALLOWED", "目前無法申請作廢這個研發版", 409);
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "drawing.void", idempotencyKey: context.idempotencyKey, request: { branchId, rowId, expectedRowVersion: context.expectedRowVersion }, effectKey: `drawing-branch:${branchId}:void`, correlationId: correlation(context.correlationId) }, async (tx) => {
      const locked = await repository.readSourceState(tx, actor.companyId, rowId, true); if (!locked || locked.row_version !== context.expectedRowVersion || locked.handling !== "none" || locked.branch_id !== branchId) throw new CanonicalWorkbenchError("DRAWING_RD_VOID_NOT_ALLOWED", "目前無法申請作廢這個研發版", 409);
      const reviews = new PdmWorkReviewAsyncRepository(tx); const reviewerUserId = await reviews.selectReviewer(tx, { companyId: actor.companyId, ownerUserId: actor.id }); const snapshot = { drawingId: locked.drawing_id, branchId, revisionId: locked.revision_id, revision: locked.revision };
      let request; try { request = await reviews.create(tx, { companyId: actor.companyId, requestKind: "drawing_rd_void", entityType: "drawing", canonicalEntityId: locked.drawing_id, branchId, reviewerUserId, snapshotPayload: snapshot, snapshotHash: dev087RequestHash(snapshot) }); } catch (error) { if (String(error).toLowerCase().includes("unique")) throw new CanonicalWorkbenchError("DRAWING_RD_VOID_ALREADY_PENDING", "這個研發版已有作廢申請", 409); throw error; }
      await tx.execute(`UPDATE canonical_workbench_states SET handling = 'review_owner', row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = :rowId AND company_id = :companyId`, { rowId, companyId: actor.companyId }); return { requestId: request.id, reviewCycleId: request.reviewCycleId, rowVersion: request.rowVersion };
    });
  }

  async decide(requestId: string, decision: Dev087ReviewDecision, actor: DrawingRevisionActor, context: CommandContext) {
    allow(actor.permissions.decide); await this.verify(actor, context.contractToken); const correlationId = correlation(context.correlationId); const commandRequest = { requestId, decision, expectedRowVersion: context.expectedRowVersion };
    const replay = await replayDev087TerminalReceipt<{ acknowledged: true }>(this.client, { companyId: actor.companyId, command: "review.decision", idempotencyKey: context.idempotencyKey, request: commandRequest, correlationId }); if (replay) return replay;
    const reviews = new PdmWorkReviewAsyncRepository(this.client); const request = await reviews.get(this.client, { companyId: actor.companyId, requestId }); if (!request || !["drawing_revision", "drawing_rd_void"].includes(request.requestKind) || request.reviewerUserId !== actor.id) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "審核項目不存在", 404);
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "review.decision", idempotencyKey: context.idempotencyKey, request: commandRequest, effectKey: `review:${request.reviewCycleId}`, correlationId, terminalReview: true }, async (tx) => {
      const locked = await reviews.get(tx, { companyId: actor.companyId, requestId }, true); if (!locked || locked.reviewerUserId !== actor.id || locked.requestStatus !== "pending" || locked.rowVersion !== context.expectedRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_REQUEST_STALE", "重新開啟目前審核項目", 409);
      if (decision === "return_for_correction") {
        if (locked.requestKind === "drawing_rd_void") { await reviews.appendTrace(tx, locked); await tx.execute(`UPDATE canonical_workbench_states SET handling = 'none', row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND branch_id = :branchId AND handling = 'review_owner'`, locked); await tx.execute(`DELETE FROM pdm_work_review_requests WHERE id = :id AND company_id = :companyId`, locked); return { acknowledged: true }; }
        if (locked.workId) { const repository = new DrawingRevisionWorkAsyncRepository(tx); const work = await repository.readWork(tx, actor.companyId, locked.workId, true); if (work) await tx.execute(`UPDATE drawing_revisions SET lifecycle_state = 'correction_required', updated_at = CURRENT_TIMESTAMP WHERE id = :revisionId AND company_id = :companyId`, { companyId: actor.companyId, revisionId: work.revision_id }); }
        return returnDev087WorkForCorrection(tx, locked);
      }
      await beginDev087Approval(tx, locked);
      if (locked.requestKind === "drawing_rd_void") {
        await tx.execute(`UPDATE drawing_rd_branches SET status = 'historical', closed_reason = 'latest_rd_voided', closed_at = CURRENT_TIMESTAMP, row_version = row_version + 1 WHERE id = :branchId AND company_id = :companyId AND status = 'open'`, locked);
        await tx.execute(`UPDATE drawing_revisions SET lifecycle_state = 'superseded', superseded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT latest_approved_revision_id FROM drawing_rd_branches WHERE id = :branchId AND company_id = :companyId)`, locked);
        await tx.execute(`DELETE FROM canonical_workbench_states WHERE company_id = :companyId AND branch_id = :branchId`, locked);
        await tx.execute(`UPDATE pdm_workbench_aggregates SET open_branch_count = open_branch_count - 1, row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND entity_type = 'drawing' AND canonical_entity_id = :canonicalEntityId AND open_branch_count > 0`, locked);
        await tx.execute(`DELETE FROM pdm_work_review_requests WHERE id = :id AND company_id = :companyId`, locked); return { acknowledged: true };
      }
      const faultHandling = dev087FaultHandling();
      if (faultHandling) {
        return recordDev087Fault(tx, locked, faultHandling);
      }
      if (!locked.workId) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409); const repository = new DrawingRevisionWorkAsyncRepository(tx); const work = await repository.readWork(tx, actor.companyId, locked.workId, true); const snapshot = work ? { payload: typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) : work.proposed_payload, revisionId: work.revision_id, claimId: work.target_claim_id } : null; if (!work || dev087RequestHash(snapshot) !== locked.snapshotHash) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409);
      await repository.formalize(tx, { companyId: actor.companyId, work }); await tx.execute(`DELETE FROM pdm_work_review_requests WHERE id = :id AND company_id = :companyId`, locked); return { acknowledged: true };
    });
  }
}
