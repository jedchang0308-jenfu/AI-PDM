import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { sanitizeDrawingRevisionWorkPayload } from "@/lib/drawing-revision-work-payload";
import { uploadDrawingRevisionWorkFile } from "@/lib/drawing-revision-work-file";
import { assertRequiredDrawingFiles } from "@/lib/pdm-file-ownership";
import { dev087RequestHash, replayDev087TerminalReceipt, runDev087IdempotentCommand } from "@/lib/pdm-canonical-command";
import { CanonicalWorkbenchError, parseCanonicalRowKey } from "@/lib/pdm-canonical-workbench-contract";
import { issueCanonicalWorkbenchContract, verifyCanonicalWorkbenchCommandContract } from "@/lib/pdm-workbench-authority-control";
import { beginDev087Approval, dev087FaultHandling, recordDev087Fault, returnDev087WorkForCorrection, type Dev087ReviewDecision } from "@/lib/pdm-work-review";
import { DrawingRevisionWorkAsyncRepository, parseCanonicalRevision, type RevisionTuple } from "@/lib/repositories/drawing-revision-work-async-repository";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";
import { hydrateDrawingChangeImpactForWork, validateDrawingChangeImpactForWork } from "@/lib/drawing-change-impact";
import { createFileStorageService } from "@/lib/file-storage";
import { deriveDrawingRevisionBasis, type DrawingRevisionBasisState } from "@/lib/drawing-revision-lifecycle-policy";
import { issueDrawingRevisionTargetToken, verifyDrawingRevisionTargetToken } from "@/lib/drawing-revision-target-token.server";
import { DrawingRevisionTargetContractError, parseDrawingRevisionCreateSelection } from "@/lib/drawing-revision-target-contract";
import { assertReviewPackageRecognitionReady, buildReviewPackage, reviewPackageV2WriteEnabled, verifyReviewPackageIntegrity } from "@/lib/pdm-review-package";
import { parseReviewPackageSnapshot } from "@/lib/pdm-review-package-contract";

export type DrawingRevisionActor = { id: string; companyId: string; canEditNonOwned: boolean; permissions: { create: boolean; update: boolean; submit: boolean; cancel: boolean; decide: boolean; obsolete: boolean } };
type CommandContext = { idempotencyKey: string; contractToken: string; expectedRowVersion: number; correlationId?: string };
function correlation(value?: string) { return value?.trim() || crypto.randomUUID(); }
function allow(value: boolean) { if (!value) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403); }
function edit(actor: DrawingRevisionActor, owner: string) { if (actor.id !== owner && !actor.canEditNonOwned) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403); }
function parseCreateSelection(value: unknown) {
  try {
    return parseDrawingRevisionCreateSelection(value);
  } catch (error) {
    if (error instanceof DrawingRevisionTargetContractError) {
      throw new CanonicalWorkbenchError(error.code, error.message, 422);
    }
    throw error;
  }
}
function interaction(basisState: DrawingRevisionBasisState, handling: string) {
  const stale = basisState === "stale";
  const reviewer = handling === "review_owner";
  return {
    mode: reviewer ? stale ? "review_stale_cleanup" as const : "review_decide" as const : stale ? "owner_stale_cleanup" as const : "owner_edit" as const,
    basisState,
    canMutateContent: !stale && !reviewer,
    canSubmit: !stale && !reviewer,
    canCancel: !reviewer,
    canApprove: reviewer && !stale,
    canReturn: reviewer,
    reasonCode: stale ? "DRAWING_PRODUCTION_BASE_STALE" as const : null
  };
}
function validateDrawingPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料格式無效", 422);
  const record = sanitizeDrawingRevisionWorkPayload(value);
  const text = JSON.stringify(record); if (Buffer.byteLength(text, "utf8") > 2_000_000) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料過大", 422);
  if (["branchId", "predecessorRevisionId", "sourceRevisionId", "companyId", "ownerUserId", "reviewerUserId", "changeImpactRequired", "relatedParts", "affectedParts"].some((key) => key in record)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料包含不可修改的系統欄位", 422);
  return record;
}

export class DrawingRevisionWorkService {
  constructor(private readonly client: AsyncDatabaseClient = getAsyncDatabaseClient()) {}
  private verify(actor: DrawingRevisionActor, token: string) { return verifyCanonicalWorkbenchCommandContract(this.client, { companyId: actor.companyId, actorId: actor.id, token }); }

  async read(workId: string, actor: DrawingRevisionActor) {
    const repository = new DrawingRevisionWorkAsyncRepository(this.client); const work = await repository.readWork(this.client, actor.companyId, workId);
    if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料不存在", 404); edit(actor, work.owner_user_id);
    const basis = await repository.resolveWorkBasis(this.client, work);
    const interactionState = interaction(basis.basisState, work.handling);
    const [drawing, files] = await Promise.all([
      this.client.queryOne(`SELECT drawing_number AS code, purpose_code, purpose_description FROM drawings WHERE id = :drawingId AND company_id = :companyId`, { drawingId: work.drawing_id, companyId: actor.companyId }),
      this.client.query(`SELECT binding.file_binding_id AS id, file.source_file_asset_id, file.display_name, file.role,
          file.drawing_revision_id, file.is_primary, asset.file_name, asset.file_ext, asset.mime_type, asset.file_size,
          CASE WHEN file.drawing_revision_id = :revisionId THEN 1 ELSE 0 END AS current_revision_upload
        FROM drawing_revision_work_files binding JOIN drawing_revision_files file ON file.id = binding.file_binding_id
        JOIN file_assets asset ON asset.id = file.source_file_asset_id
        WHERE binding.work_id = :workId AND file.removed_at IS NULL AND asset.deleted_at IS NULL
        ORDER BY binding.ordinal, binding.file_binding_id`, { workId, revisionId: work.revision_id })
    ]);
    const raw = sanitizeDrawingRevisionWorkPayload(typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) : work.proposed_payload);
    const changeImpactProjection = await hydrateDrawingChangeImpactForWork(this.client, {
      companyId: actor.companyId,
      drawingId: work.drawing_id,
      revisionId: work.revision_id,
      predecessorRevisionId: work.predecessor_revision_id,
      impact: raw.changeImpact
    });
    if (changeImpactProjection.changeImpactRequired && changeImpactProjection.changeImpact) raw.changeImpact = changeImpactProjection.changeImpact;
    else delete raw.changeImpact;
    const { drawingId: _drawingId, revisionId: _revisionId, predecessorRevisionId: _predecessorRevisionId, ...payload } = raw;
    return { data: { entityType: "drawing" as const, entityId: work.drawing_id, workId: work.id, revisionId: work.revision_id, revision: work.target_label, rowVersion: Number(work.row_version), payload, identity: drawing, files, changeImpactRequired: changeImpactProjection.changeImpactRequired, relatedParts: changeImpactProjection.relatedParts, affectedParts: changeImpactProjection.affectedParts, readonly: !interactionState.canMutateContent, interaction: interactionState }, meta: { contractToken: await issueCanonicalWorkbenchContract(this.client, { companyId: actor.companyId, actorId: actor.id }), correlationId: crypto.randomUUID() } };
  }

  async targets(drawingId: string, sourceRowKey: string, actor: DrawingRevisionActor) {
    allow(actor.permissions.create); const rowId = parseCanonicalRowKey(sourceRowKey); const repository = new DrawingRevisionWorkAsyncRepository(this.client); const source = await repository.readSourceState(this.client, actor.companyId, rowId);
    if (!source || source.drawing_id !== drawingId || source.handling !== "none" || source.work_id) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
    const candidates = await repository.listCandidates(this.client, source); const basisState = deriveDrawingRevisionBasis({ dataLayer: source.data_layer, baseProductionRevisionId: source.base_production_revision_id, currentProductionRevisionId: source.current_production_revision_id }); const contractToken = await issueCanonicalWorkbenchContract(this.client, { companyId: actor.companyId, actorId: actor.id });
    const revision = parseCanonicalRevision(source.revision);
    const currentTuple = source.current_production_revision ? parseCanonicalRevision(source.current_production_revision) : null;
    const major = currentTuple?.major ?? 0;
    const targets = candidates.map((candidate) => ({ kind: candidate.kind, label: candidate.kind === "production" ? `量產版 ${candidate.target.label}` : `研發版 ${candidate.target.label}`, target: candidate.target, enabled: basisState !== "stale" && candidate.enabled, reason: basisState === "stale" ? "量產基準已更新，不能沿用這個分支進版" : candidate.reason, candidateToken: basisState === "stale" || !candidate.enabled ? null : issueDrawingRevisionTargetToken({ companyId: actor.companyId, actorId: actor.id, drawingId, sourceRowId: rowId, sourceRowVersion: source.row_version, basisState, target: candidate.target }) }));
    return { data: { source: { rowKey: `cw_${rowId}`, rowVersion: source.row_version, revision, basisState }, basisState, manualRule: { enabled: basisState !== "stale", major: basisState === "stale" ? null : major, minExclusive: basisState === "stale" ? null : revision.minor, maxInclusive: 2_147_483_647, reason: basisState === "stale" ? "stale分支不可建立新工作，請從目前量產版重新開始" : null }, candidates: basisState === "stale" ? [] : targets, recovery: basisState === "stale" && source.current_production_row_id ? { label: "從目前量產版建立新工作", targetsHref: `/api/pdm/drawings/${encodeURIComponent(drawingId)}/revision-targets?sourceRowKey=${encodeURIComponent(`cw_${source.current_production_row_id}`)}` } : null }, meta: { contractToken, correlationId: crypto.randomUUID() } };
  }

  async create(drawingId: string, rawInput: unknown, actor: DrawingRevisionActor, context: CommandContext) {
    allow(actor.permissions.create); await this.verify(actor, context.contractToken); const input = parseCreateSelection(rawInput); const sourceRowId = parseCanonicalRowKey(input.sourceRowKey); const repository = new DrawingRevisionWorkAsyncRepository(this.client); const source = await repository.readSourceState(this.client, actor.companyId, sourceRowId); if (!source || source.drawing_id !== drawingId) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
    const basisState = deriveDrawingRevisionBasis({ dataLayer: source.data_layer, baseProductionRevisionId: source.base_production_revision_id, currentProductionRevisionId: source.current_production_revision_id });
    let target: RevisionTuple;
    let requestedMinor: number | null = null;
    if (input.selectionMode === "recommended") {
      const candidate = verifyDrawingRevisionTargetToken(input.candidateToken, { companyId: actor.companyId, actorId: actor.id, drawingId, sourceRowId, sourceRowVersion: context.expectedRowVersion });
      if (candidate.basisState !== basisState) throw new CanonicalWorkbenchError("DRAWING_PRODUCTION_BASE_STALE", "量產基準已更新，請重新取得可用版次", 409);
      target = candidate.target;
    } else {
      requestedMinor = input.requestedMinor;
      const candidates = await repository.listCandidates(this.client, source);
      const rd = candidates.find((candidate) => candidate.kind === "rd");
      if (!rd) throw new CanonicalWorkbenchError("DRAWING_PRODUCTION_BASE_STALE", "量產基準已更新，請從目前量產版重新開始", 409);
      target = { major: rd.target.major, minor: requestedMinor, label: `${rd.target.major}.${requestedMinor}` };
    }
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "drawing.create", idempotencyKey: context.idempotencyKey, request: { drawingId, sourceRowId, selectionMode: input.selectionMode, target: input.selectionMode === "recommended" ? target : null, requestedMinor, expectedRowVersion: context.expectedRowVersion }, effectKey: input.selectionMode === "manual_minor" ? `drawing:${drawingId}:source:${sourceRowId}:v${context.expectedRowVersion}:manual:${requestedMinor}` : `drawing:${drawingId}:${target.major}.${target.minor}`, correlationId: correlation(context.correlationId) }, (tx) => repository.create(tx, { companyId: actor.companyId, sourceRowId, ownerUserId: actor.id, expectedRowVersion: context.expectedRowVersion, target, selectionMode: input.selectionMode, requestedMinor }));
  }

  async update(workId: string, value: unknown, actor: DrawingRevisionActor, context: CommandContext) {
    allow(actor.permissions.update); await this.verify(actor, context.contractToken); const repository = new DrawingRevisionWorkAsyncRepository(this.client); const work = await repository.readWork(this.client, actor.companyId, workId); if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料不存在", 404); edit(actor, work.owner_user_id); const payload = validateDrawingPayload(value);
    if (work.predecessor_revision_id === null) {
      if (Object.prototype.hasOwnProperty.call(payload, "changeImpact")) throw new CanonicalWorkbenchError("DRAWING_FFF_NOT_APPLICABLE", "首版工作不可寫入 FFF 判定", 422);
      delete payload.changeImpact;
    } else {
      payload.changeImpact = await validateDrawingChangeImpactForWork(this.client, { companyId: actor.companyId, drawingId: work.drawing_id, revisionId: work.revision_id, predecessorRevisionId: work.predecessor_revision_id, impact: payload.changeImpact, mode: "draft" });
    }
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "drawing.update", idempotencyKey: context.idempotencyKey, request: { workId, expectedRowVersion: context.expectedRowVersion, payload }, effectKey: `drawing-work:${workId}:update`, correlationId: correlation(context.correlationId) }, (tx) => repository.update(tx, { companyId: actor.companyId, workId, expectedRowVersion: context.expectedRowVersion, payload }));
  }

  async uploadFile(workId: string, input: { file: unknown; displayName?: unknown; description?: unknown }, actor: DrawingRevisionActor, context: CommandContext) {
    return uploadDrawingRevisionWorkFile({ client: this.client, workId, ...input, actor, context });
  }

  async removeFile(workId: string, fileBindingId: string, actor: DrawingRevisionActor, context: CommandContext) {
    allow(actor.permissions.update);
    await this.verify(actor, context.contractToken);
    const repository = new DrawingRevisionWorkAsyncRepository(this.client);
    const work = await repository.readWork(this.client, actor.companyId, workId);
    if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料不存在", 404);
    edit(actor, work.owner_user_id);
    const storage = createFileStorageService();
    let storageKeyToRemove: string | null = null;
    const result = await runDev087IdempotentCommand(this.client, {
      companyId: actor.companyId,
      actorId: actor.id,
      command: "drawing.file.remove",
      idempotencyKey: context.idempotencyKey,
      request: { workId, fileBindingId, expectedRowVersion: context.expectedRowVersion },
      effectKey: `drawing-work:${workId}:file-remove:${fileBindingId}`,
      correlationId: correlation(context.correlationId)
    }, async (tx) => {
      const locked = await repository.readWork(tx, actor.companyId, workId, true);
      if (!locked || Number(locked.row_version) !== context.expectedRowVersion || locked.handling !== "owner") {
        throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
      }
      await repository.assertWorkMutationBasis(tx, locked);
      const binding = await tx.queryOne<{ file_binding_id: string; source_file_asset_id: string; is_primary: number | string; storage_key: string | null }>(
        `SELECT binding.file_binding_id, file.is_primary, file.source_file_asset_id, asset.storage_key
           FROM drawing_revision_work_files binding
           JOIN drawing_revision_files file ON file.id = binding.file_binding_id AND file.company_id = :companyId
           JOIN file_assets asset ON asset.id = file.source_file_asset_id
          WHERE binding.work_id = :workId AND binding.file_binding_id = :fileBindingId
            AND file.removed_at IS NULL AND asset.deleted_at IS NULL`,
        { companyId: actor.companyId, workId, fileBindingId }
      );
      if (!binding) throw new CanonicalWorkbenchError("DRAWING_REVISION_FILE_NOT_FOUND", "檔案不存在或已移除", 404);
      if (Number(binding.is_primary ?? 0) === 1) throw new CanonicalWorkbenchError("DRAWING_REVISION_FILE_PRIMARY_LOCKED", "主要 2D/3D 檔案不可直接移除", 409);
      await tx.execute(`DELETE FROM drawing_revision_work_files WHERE work_id = :workId AND file_binding_id = :fileBindingId`, { workId, fileBindingId });
      await tx.execute(`UPDATE drawing_revision_files SET removed_at = CURRENT_TIMESTAMP, removed_by = :actorId, updated_at = CURRENT_TIMESTAMP WHERE id = :fileBindingId AND company_id = :companyId AND removed_at IS NULL`, { fileBindingId, companyId: actor.companyId, actorId: actor.id });
      await tx.execute(`UPDATE file_assets SET deleted_at = CURRENT_TIMESTAMP, deleted_by = :actorId, deleted_reason = 'drawing_revision_work_file_removed', updated_at = CURRENT_TIMESTAMP WHERE id = :fileAssetId AND linked_entity_type = 'drawing_revision' AND deleted_at IS NULL`, { fileAssetId: binding.source_file_asset_id, actorId: actor.id });
      await tx.execute(`UPDATE drawing_revision_works SET row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = :workId AND company_id = :companyId AND row_version = :expectedRowVersion`, { workId, companyId: actor.companyId, expectedRowVersion: context.expectedRowVersion });
      await tx.execute(`UPDATE canonical_workbench_states SET row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND work_id = :workId AND handling = 'owner'`, { companyId: actor.companyId, workId });
      await repository.assertWorkFileSnapshot(tx, locked);
      storageKeyToRemove = binding.storage_key;
      return { workId, fileBindingId, rowVersion: context.expectedRowVersion + 1, removed: true };
    });
    if (storageKeyToRemove) {
      try { await storage.deleteObject(storageKeyToRemove); } catch { /* DB tombstone remains authoritative; cleanup evidence records retry. */ }
    }
    return result;
  }

  async submit(workId: string, actor: DrawingRevisionActor, context: CommandContext) {
    allow(actor.permissions.submit); await this.verify(actor, context.contractToken); const repository = new DrawingRevisionWorkAsyncRepository(this.client); const work = await repository.readWork(this.client, actor.companyId, workId); if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料不存在", 404); edit(actor, work.owner_user_id);
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "drawing.submit", idempotencyKey: context.idempotencyKey, request: { workId, expectedRowVersion: context.expectedRowVersion }, effectKey: `drawing-work:${workId}:review`, correlationId: correlation(context.correlationId) }, async (tx) => {
      const locked = await repository.readWork(tx, actor.companyId, workId, true); if (!locked || Number(locked.row_version) !== context.expectedRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
      await repository.assertWorkMutationBasis(tx, locked);
      const storedPayload = typeof locked.proposed_payload === "string" ? JSON.parse(locked.proposed_payload) : locked.proposed_payload;
      const submittedPayload = validateDrawingPayload(storedPayload);
      if (locked.predecessor_revision_id === null) {
        delete submittedPayload.changeImpact;
      } else {
        submittedPayload.changeImpact = await validateDrawingChangeImpactForWork(tx, { companyId: actor.companyId, drawingId: locked.drawing_id, revisionId: locked.revision_id, predecessorRevisionId: locked.predecessor_revision_id, impact: submittedPayload.changeImpact, mode: "submit" });
      }
      await tx.execute(`UPDATE drawing_revision_works SET proposed_payload = :payload, updated_at = CURRENT_TIMESTAMP WHERE id = :workId AND company_id = :companyId`, { workId, companyId: actor.companyId, payload: JSON.stringify(submittedPayload) });
      const currentFiles = await tx.query<{
        id: string; file_name: string; file_ext: string; file_size: number | string | null;
        content_hash: string | null; role: string; is_primary: number | string;
      }>(`SELECT file.id, asset.file_name, asset.file_ext, asset.file_size, asset.content_hash, file.role, file.is_primary
          FROM drawing_revision_work_files binding
          JOIN drawing_revision_files file ON file.id = binding.file_binding_id AND file.company_id = :companyId
          JOIN file_assets asset ON asset.id = file.source_file_asset_id
          WHERE binding.work_id = :workId AND file.drawing_revision_id = :revisionId
            AND file.removed_at IS NULL AND asset.deleted_at IS NULL
          ORDER BY binding.ordinal, binding.file_binding_id`, {
        companyId: actor.companyId,
        workId,
        revisionId: locked.revision_id
      });
      try {
        assertRequiredDrawingFiles(currentFiles.map((file) => ({
          id: file.id,
          fileName: file.file_name,
          fileExt: file.file_ext,
          fileSize: file.file_size,
          contentHash: file.content_hash,
          role: file.role,
          isPrimary: file.is_primary
        })));
      } catch (error) {
        const message = error instanceof Error ? error.message : "必須重新上傳本版次的 2D 與 3D 原始檔。";
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "WORKBENCH_BAD_REQUEST";
        if (["DRAWING_2D_REQUIRED", "DRAWING_3D_REQUIRED", "DRAWING_2D_PRIMARY_REQUIRED", "DRAWING_3D_PRIMARY_REQUIRED", "DRAWING_ROLE_EXTENSION_MISMATCH"].includes(code)) {
          throw new CanonicalWorkbenchError(code as "DRAWING_2D_REQUIRED", message, 422);
        }
        throw error;
      }
      const reviews = new PdmWorkReviewAsyncRepository(tx); const reviewerUserId = await reviews.selectReviewer(tx, { companyId: actor.companyId, ownerUserId: locked.owner_user_id }); const snapshotPayload = sanitizeDrawingRevisionWorkPayload(submittedPayload); const decisionBasis = { payload: snapshotPayload, revisionId: locked.revision_id, claimId: locked.target_claim_id }; const legacySnapshotHash = dev087RequestHash(decisionBasis);
      const packagePayload = reviewPackageV2WriteEnabled()
        ? await buildReviewPackage(tx, { companyId: actor.companyId, requestKind: "drawing_revision", entityType: "drawing", canonicalEntityId: locked.drawing_id, workId, branchId: locked.branch_id, decisionBasis: { hash: legacySnapshotHash, ...decisionBasis } })
        : { payload: snapshotPayload, revisionId: locked.revision_id, claimId: locked.target_claim_id };
      const request = await reviews.create(tx, { companyId: actor.companyId, requestKind: "drawing_revision", entityType: "drawing", canonicalEntityId: locked.drawing_id, workId, branchId: locked.branch_id, reviewerUserId, snapshotPayload: packagePayload, snapshotHash: "packageHash" in packagePayload ? packagePayload.packageHash : legacySnapshotHash });
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
      const reviews = new PdmWorkReviewAsyncRepository(tx); const reviewerUserId = await reviews.selectReviewer(tx, { companyId: actor.companyId, ownerUserId: actor.id }); const snapshot = { drawingId: locked.drawing_id, branchId, revisionId: locked.revision_id, revision: locked.revision }; const legacySnapshotHash = dev087RequestHash(snapshot);
      const packagePayload = reviewPackageV2WriteEnabled()
        ? await buildReviewPackage(tx, { companyId: actor.companyId, requestKind: "drawing_rd_void", entityType: "drawing", canonicalEntityId: locked.drawing_id, workId: null, branchId, decisionBasis: { hash: legacySnapshotHash, payload: snapshot, revisionId: locked.revision_id, claimId: null } })
        : snapshot;
      let request; try { request = await reviews.create(tx, { companyId: actor.companyId, requestKind: "drawing_rd_void", entityType: "drawing", canonicalEntityId: locked.drawing_id, branchId, reviewerUserId, snapshotPayload: packagePayload, snapshotHash: "packageHash" in packagePayload ? packagePayload.packageHash : legacySnapshotHash }); } catch (error) { if (String(error).toLowerCase().includes("unique")) throw new CanonicalWorkbenchError("DRAWING_RD_VOID_ALREADY_PENDING", "這個研發版已有作廢申請", 409); throw error; }
      await tx.execute(`UPDATE canonical_workbench_states SET handling = 'review_owner', row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = :rowId AND company_id = :companyId`, { rowId, companyId: actor.companyId }); return { requestId: request.id, reviewCycleId: request.reviewCycleId, rowVersion: request.rowVersion };
    });
  }

  async decide(requestId: string, decision: Dev087ReviewDecision, actor: DrawingRevisionActor, context: CommandContext) {
    allow(actor.permissions.decide); await this.verify(actor, context.contractToken); const correlationId = correlation(context.correlationId); const commandRequest = { requestId, decision, expectedRowVersion: context.expectedRowVersion };
    const replay = await replayDev087TerminalReceipt<{ acknowledged: true }>(this.client, { companyId: actor.companyId, command: "review.decision", idempotencyKey: context.idempotencyKey, request: commandRequest, correlationId }); if (replay) return replay;
    const reviews = new PdmWorkReviewAsyncRepository(this.client); const request = await reviews.get(this.client, { companyId: actor.companyId, requestId });
    if (!request) {
      const terminalReceipt = await reviews.getTerminalReceipt(this.client, { companyId: actor.companyId, requestId });
      if (terminalReceipt) throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_REQUEST_STALE", "重新開啟目前審核項目", 409);
      throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "審核項目不存在", 404);
    }
    if (!["drawing_revision", "drawing_rd_void"].includes(request.requestKind) || request.reviewerUserId !== actor.id) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "審核項目不存在", 404);
    return runDev087IdempotentCommand(this.client, { companyId: actor.companyId, actorId: actor.id, command: "review.decision", idempotencyKey: context.idempotencyKey, request: commandRequest, effectKey: `review:${request.reviewCycleId}`, correlationId, terminalReview: true }, async (tx) => {
      const locked = await reviews.get(tx, { companyId: actor.companyId, requestId }, true); if (!locked || locked.reviewerUserId !== actor.id || locked.requestStatus !== "pending" || locked.rowVersion !== context.expectedRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_REQUEST_STALE", "重新開啟目前審核項目", 409);
      const parsedPackage = parseReviewPackageSnapshot(locked.snapshotPayload); if (parsedPackage.kind === "invalid") throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包格式無效", 409); const verifiedPackage = parsedPackage.kind === "v2" ? verifyReviewPackageIntegrity(locked.snapshotPayload, locked.snapshotHash) : null;
      if (decision === "return_for_correction") {
        if (locked.requestKind === "drawing_rd_void") { await reviews.appendTrace(tx, locked); await tx.execute(`UPDATE canonical_workbench_states SET handling = 'none', row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND branch_id = :branchId AND handling = 'review_owner'`, locked); await reviews.recordTerminalReceipt(tx, locked); await tx.execute(`DELETE FROM pdm_work_review_requests WHERE id = :id AND company_id = :companyId`, locked); return { acknowledged: true }; }
        if (locked.workId) { const repository = new DrawingRevisionWorkAsyncRepository(tx); const work = await repository.readWork(tx, actor.companyId, locked.workId, true); if (work) await tx.execute(`UPDATE drawing_revisions SET lifecycle_state = 'correction_required', updated_at = CURRENT_TIMESTAMP WHERE id = :revisionId AND company_id = :companyId`, { companyId: actor.companyId, revisionId: work.revision_id }); }
        return returnDev087WorkForCorrection(tx, locked);
      }
      if (verifiedPackage) assertReviewPackageRecognitionReady(verifiedPackage);
      const repository = new DrawingRevisionWorkAsyncRepository(tx);
      let approvalWork = null;
      if (locked.requestKind === "drawing_revision" && locked.workId) {
        approvalWork = await repository.readWork(tx, actor.companyId, locked.workId, true);
        if (!approvalWork) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409);
        await repository.assertFormalizationAllowed(tx, approvalWork);
      }
      await beginDev087Approval(tx, locked);
      if (locked.requestKind === "drawing_rd_void") {
        const current = await tx.queryOne<{ drawing_id: string; branch_id: string; revision_id: string; revision: string; branch_status: string; latest_approved_revision_id: string | null }>(
          `SELECT state.canonical_entity_id AS drawing_id, state.branch_id, state.revision_id, revision.revision,
                  branch.status AS branch_status, branch.latest_approved_revision_id
             FROM canonical_workbench_states state
             JOIN drawing_rd_branches branch ON branch.id = state.branch_id AND branch.company_id = state.company_id
             JOIN drawing_revisions revision ON revision.id = state.revision_id AND revision.company_id = state.company_id
            WHERE state.company_id = :companyId AND state.branch_id = :branchId
              AND state.canonical_entity_id = :canonicalEntityId AND state.entity_type = 'drawing'
              AND state.data_layer = 'drawing_rd' AND state.handling = 'system' AND state.work_id IS NULL`,
          locked
        );
        const expectedHash = verifiedPackage?.decisionBasis.hash ?? locked.snapshotHash;
        const currentBasis = current ? { drawingId: current.drawing_id, branchId: current.branch_id, revisionId: current.revision_id, revision: current.revision } : null;
        if (!current || current.branch_status !== "open" || current.latest_approved_revision_id !== current.revision_id || dev087RequestHash(currentBasis) !== expectedHash) {
          throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409);
        }
        await tx.execute(`UPDATE drawing_rd_branches SET status = 'historical', closed_reason = 'latest_rd_voided', closed_at = CURRENT_TIMESTAMP, row_version = row_version + 1 WHERE id = :branchId AND company_id = :companyId AND status = 'open'`, locked);
        await tx.execute(`UPDATE drawing_revisions SET lifecycle_state = 'superseded', superseded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT latest_approved_revision_id FROM drawing_rd_branches WHERE id = :branchId AND company_id = :companyId)`, locked);
        await tx.execute(`DELETE FROM canonical_workbench_states WHERE company_id = :companyId AND branch_id = :branchId`, locked);
        await tx.execute(`UPDATE pdm_workbench_aggregates SET open_branch_count = open_branch_count - 1, row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE company_id = :companyId AND entity_type = 'drawing' AND canonical_entity_id = :canonicalEntityId AND open_branch_count > 0`, locked);
        await reviews.recordTerminalReceipt(tx, locked); await tx.execute(`DELETE FROM pdm_work_review_requests WHERE id = :id AND company_id = :companyId`, locked); return { acknowledged: true };
      }
      const faultHandling = dev087FaultHandling();
      if (faultHandling) {
        return recordDev087Fault(tx, locked, faultHandling);
      }
      if (!locked.workId) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409); const work = approvalWork ?? await repository.readWork(tx, actor.companyId, locked.workId, true); const rawPayload = work ? (typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) : work.proposed_payload) : null; const snapshots = work ? [{ payload: sanitizeDrawingRevisionWorkPayload(rawPayload), revisionId: work.revision_id, claimId: work.target_claim_id }, { payload: rawPayload, revisionId: work.revision_id, claimId: work.target_claim_id }] : []; const expectedHash = verifiedPackage?.decisionBasis.hash ?? locked.snapshotHash; if (!work || !snapshots.some((snapshot) => dev087RequestHash(snapshot) === expectedHash)) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409);
      await repository.formalize(tx, { companyId: actor.companyId, work }); await reviews.recordTerminalReceipt(tx, locked); await tx.execute(`DELETE FROM pdm_work_review_requests WHERE id = :id AND company_id = :companyId`, locked); return { acknowledged: true };
    });
  }
}
