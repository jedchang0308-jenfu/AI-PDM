import crypto from "node:crypto";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { projectDrawingAvailability, projectDrawingRecordAvailability, projectPartAvailability, projectRelationRootAvailability } from "@/lib/availability-scope";
import { createHumanStatus, projectViewerHumanStatus } from "@/lib/human-status-projection";
import { AsyncNumberStateFlowRepository, numberingCandidateReviewSnapshotHash } from "@/lib/repositories/number-state-flow-async-repository";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import { UnifiedDrawingAsyncRepository } from "@/lib/repositories/unified-drawing-async-repository";
import { decorateMasterAttachmentsWithPreviewState } from "@/lib/preview-derivatives";
import { AsyncMasterAttachmentRepository } from "@/lib/repositories/master-attachment-async-repository";
import { withPdmWorkbenchReadSnapshot } from "@/lib/repositories/pdm-workbench-read-snapshot";
import { PdmEntityDetailAsyncRepository } from "@/lib/repositories/pdm-entity-detail-async-repository";
import { derivePdmDetailProjectionPolicy, type PdmDetailProjectionPolicy } from "@/lib/pdm-entity-detail-policy";
import { normalizePdmApprovalReturnTo } from "@/lib/pdm-review-navigation";
import { PdmReviewScopeError, pdmReviewEntityId, pdmReviewTargetTypesForEntityKey, resolvePdmReviewScopeReceiptAsync } from "@/lib/pdm-review-scope";
import type { NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import type { DrawingModuleListRecord, PartModuleDetailRecord, NumberingRootDetailRecord } from "@/lib/repositories/numbering-repository";
import type { MasterAttachmentRecord } from "@/lib/repositories/master-attachment-repository";
import type { PdmDetailSurface, PdmEntityDetailResponse, PdmEntityKey, PdmDetailStateFamily, DrawingProjectionFull, DrawingProjectionSummary, PartProjectionFull, PartProjectionSummary, RelationProjectionFull, RelationProjectionSummary, DrawingPreviewSlotModel, PdmDetailActionDescriptor } from "@/lib/pdm-entity-detail-contract";

export class PdmEntityDetailError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) { super(message); this.name = "PdmEntityDetailError"; }
}

function parseKey(value: string): PdmEntityKey {
  let key: string;
  try {
    key = decodeURIComponent(value).trim();
  } catch {
    throw new PdmEntityDetailError("PDM_ENTITY_KEY_INVALID", "無法辨識這筆明細。", 400);
  }
  if (!/^(candidate|drawing|part|root):[^:]+$/u.test(key)) throw new PdmEntityDetailError("PDM_ENTITY_KEY_INVALID", "無法辨識這筆明細。", 400);
  return key as PdmEntityKey;
}

function stateFamily(value: string | null | undefined): PdmDetailStateFamily {
  if (value === "released") return "released";
  if (value === "rd_controlled" || value === "official_controlled") return "rd_controlled";
  if (value === "in_review" || value === "revision_in_review") return "in_review";
  if (value === "correction_required") return "correction_required";
  if (value === "recovery_required") return "recovery_required";
  if (value === "history_only" || value === "cancelled") return "history_only";
  if (value === "bundle_ready") return "bundle_ready";
  if (value === "drawing_preparation") return "drawing_preparation";
  return "building";
}

function basicStatus(label: string, key: "preparing" | "usable" | "waiting_review" | "relation_complete" | "cancelled") {
  const status = key === "usable" ? createHumanStatus("usable", "usable", label, "success", "check")
    : key === "waiting_review" ? createHumanStatus("waiting_review", "waiting", label, "info", "clock")
    : key === "relation_complete" ? createHumanStatus("relation_complete", "usable", label, "success", "check")
    : key === "cancelled" ? createHumanStatus("cancelled", "terminal", label, "neutral", "archive")
    : createHumanStatus("preparing", "waiting", label, "info", "clock");
  return status;
}

function viewerStatus(status: ReturnType<typeof basicStatus>, actorId: string, ownerId: string | null, canAct = false) {
  return projectViewerHumanStatus(status, { responsibility: ownerId === actorId ? "current_user" : "unknown", basis: ownerId === actorId ? "assignee" : "unknown", canAct, actorLabel: ownerId === actorId ? "這筆資料由你負責" : "目前由系統依權限提供查閱", nextStep: null });
}

type DetailAttachment = MasterAttachmentRecord & { readHref?: string };

type PackageAttachmentRow = {
  id: string;
  source_file_asset_id: string;
  role: string;
  display_name: string | null;
  description: string | null;
  revision: string;
  file_name: string;
  file_ext: string;
  mime_type: string | null;
  file_size: number | string | null;
  content_hash: string | null;
  storage_key: string | null;
  storage_provider: string | null;
  created_at: string;
  updated_at: string;
};

function withQuery(href: string, name: string, value: string) {
  return `${href}${href.includes("?") ? "&" : "?"}${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
}

function previewSlot(kind: "three-d" | "two-d", title: string, attachment: DetailAttachment | null, reviewRequestId?: string | null): DrawingPreviewSlotModel {
  if (!attachment) return { kind, title, fileName: null, state: "missing", stateTitle: "尚無正式檔案", stateText: kind === "three-d" ? "目前沒有正式 3D CAD。" : "目前沒有正式 2D 圖面。", mediaHref: null, downloadHref: null, retryCommandRef: null };
  const sourceHref = attachment.readHref ?? `/api/numbering/drawings/${encodeURIComponent(attachment.entityCode)}/attachments/${encodeURIComponent(attachment.id)}`;
  const downloadHref = reviewRequestId ? withQuery(sourceHref, "reviewRequestId", reviewRequestId) : sourceHref;
  const derivative = attachment.previewDerivatives.find((item) => item.status === "ready" && item.sourceContentHash === attachment.contentHash && (kind === "three-d" ? ["model_preview_png", "thumbnail_png"].includes(item.derivativeKind) : ["drawing_pdf", "sheet_png", "thumbnail_png"].includes(item.derivativeKind)));
  const activeJob = attachment.previewJob?.sourceContentHash === attachment.contentHash && ["queued", "running"].includes(attachment.previewJob.status);
  if (derivative) {
    return { kind, title, fileName: attachment.displayName || attachment.fileName, state: "ready", stateTitle: "預覽已就緒", stateText: "可直接開啟預覽。", mediaHref: derivative ? withQuery(downloadHref, "previewDerivative", derivative.id) : withQuery(downloadHref, "preview", "1"), downloadHref, retryCommandRef: null };
  }
  if (activeJob) return { kind, title, fileName: attachment.displayName || attachment.fileName, state: "running", stateTitle: "預覽產生中", stateText: "系統完成後會自動更新。", mediaHref: null, downloadHref, retryCommandRef: null };
  return { kind, title, fileName: attachment.displayName || attachment.fileName, state: "unavailable", stateTitle: "尚未產生可看的預覽", stateText: "可先下載原始檔查看。", mediaHref: null, downloadHref, retryCommandRef: null };
}

function action(kind: PdmDetailActionDescriptor["kind"], label: string, href: string | null, enabled = true, owner: PdmDetailActionDescriptor["owner"] = "drawing", commandRef: string | null = null): PdmDetailActionDescriptor {
  return { id: `detail:${kind}`, kind, owner, label, tone: kind === "reject" || kind === "return_for_correction" ? "danger" : kind === "refresh" || kind === "return" ? "secondary" : "primary", placement: kind === "return" || kind === "refresh" ? "secondary" : "primary", enabled, disabledReason: enabled ? null : "目前狀態不允許此操作。", href, commandRef, requiresConfirmation: kind === "reject" || kind === "return_for_correction", idempotencyRequired: kind !== "refresh" && kind !== "return" };
}

type DetailSource = { key: PdmEntityKey; drawing: DrawingModuleListRecord | null; canonicalDrawing: Awaited<ReturnType<UnifiedDrawingAsyncRepository["findByIdOrFormalId"]>>; candidate: NumberingDraftWorkspaceRecord | null; part: PartModuleDetailRecord | null; root: NumberingRootDetailRecord | null; attachments: DetailAttachment[] };

type ReviewRead = {
  requestId: string;
  source: "platform" | "legacy";
  status: string;
  actionCode: string;
  actionTitle: string;
  requester: { id: string | null; label: string | null };
  eligibleReviewer: { assigned: boolean; actorResponsibility: string; canDecide: boolean };
  targetRefs: Array<{ type: string; id: string }>;
  targetAnchors: Array<{ id: string; label: string }>;
  decisionReady: boolean;
  allowedDecisions: Array<"approved" | "rejected" | "needs_info">;
  snapshot: { snapshotId: string | null; snapshotHash: string | null; currentAggregateHash: string | null; checkStatus: "一致" | "有差異" | "未提供"; checkedAt: string | null; drift: boolean; mismatchReason: string | null };
};

export class PdmEntityDetailService {
  constructor(private readonly client: AsyncDatabaseClient = getAsyncDatabaseClient()) {}

  async read(input: { entityKey: string; surface: PdmDetailSurface; companyId: string; actorId: string; reviewRequestId?: string | null; returnTo?: string | null }): Promise<PdmEntityDetailResponse> {
    const key = parseKey(input.entityKey);
    const policy = derivePdmDetailProjectionPolicy(input.surface, input.reviewRequestId);
    return withPdmWorkbenchReadSnapshot(this.client, async (snapshot) => {
      const repository = new PdmEntityDetailAsyncRepository(snapshot);
      const source = await repository.readAggregate((client) => this.loadSource(client, key, input.companyId, input.reviewRequestId));
      if (!source) throw new PdmEntityDetailError("PDM_ENTITY_DETAIL_NOT_FOUND", "找不到資料或目前無權查看。", 404);
      let review: ReviewRead | null = null;
      try {
        review = policy.review ? await this.loadReview(snapshot, source, input) : null;
      } catch (error) {
        if (error instanceof PdmReviewScopeError) {
          throw new PdmEntityDetailError(error.code, error.message, error.code === "PDM_REVIEW_NOT_ASSIGNED" ? 403 : 409);
        }
        throw error;
      }
      if (policy.review && !review) throw new PdmEntityDetailError("PDM_ENTITY_DETAIL_NOT_FOUND", "找不到指定審核或目前無權查看。", 404);
      return this.compose(source, input, policy, review);
    });
  }

  private async loadReview(client: AsyncDatabaseClient, source: DetailSource, input: { entityKey: string; surface: PdmDetailSurface; companyId: string; actorId: string; reviewRequestId?: string | null }): Promise<ReviewRead | null> {
    const targetIds = new Set<string>([pdmReviewEntityId(source.key)]);
    if (source.candidate?.id) targetIds.add(source.candidate.id);
    if (source.canonicalDrawing?.id) targetIds.add(source.canonicalDrawing.id);
    if (source.canonicalDrawing?.formalDrawingNumberId) targetIds.add(source.canonicalDrawing.formalDrawingNumberId);
    if (source.part?.id) targetIds.add(source.part.id);
    if (source.root?.root.id) targetIds.add(source.root.root.id);
    const targetTypes = pdmReviewTargetTypesForEntityKey(source.key);
    const scope = await resolvePdmReviewScopeReceiptAsync({ client, requestId: input.reviewRequestId ?? "", companyId: input.companyId, actorId: input.actorId, entityKey: source.key, targetTypes, targetIds: [...targetIds] });
    if (!scope) return null;
    const currentAggregateHash = source.candidate
      ? (scope.actionCode === "numbering.candidate_publication_review"
        ? numberingCandidateReviewSnapshotHash(source.candidate)
        : source.candidate.candidateRevisions.find((revision) => revision.reviewSnapshotHash)?.reviewSnapshotHash ?? source.candidate.latestApproval?.snapshotHash ?? this.aggregateHash(source))
      : this.aggregateHash(source);
    const drift = Boolean(scope.snapshotHash && currentAggregateHash && scope.snapshotHash !== currentAggregateHash);
    return {
      requestId: scope.requestId,
      source: "platform",
      status: scope.status,
      actionCode: scope.actionCode,
      actionTitle: scope.actionTitle,
      requester: scope.requester,
      eligibleReviewer: { assigned: scope.decisionReady, actorResponsibility: scope.decisionReady ? "目前由你負責審核" : "目前由審核權限提供查閱", canDecide: scope.decisionReady && !drift },
      targetRefs: scope.targetRefs,
      targetAnchors: scope.targetAnchors,
      decisionReady: scope.decisionReady && !drift,
      allowedDecisions: scope.allowedDecisions,
      snapshot: { snapshotId: scope.snapshotId, snapshotHash: scope.snapshotHash, currentAggregateHash, checkStatus: scope.snapshotHash ? (drift ? "有差異" : "一致") : "未提供", checkedAt: scope.checkedAt, drift, mismatchReason: drift ? "目前資料與送審時的 aggregate hash 不一致。" : null }
    };
  }

  private async loadSource(client: AsyncDatabaseClient, key: PdmEntityKey, companyId: string, reviewRequestId?: string | null): Promise<DetailSource | null> {
    const numbering = new AsyncNumberingRepository(client);
    const unified = new UnifiedDrawingAsyncRepository(client);
    const state = new AsyncNumberStateFlowRepository(client);
    if (key.startsWith("candidate:")) {
      const candidate = await state.getWorkspacesByIds([key.slice(10)], companyId).then((rows) => rows[0] ?? null);
      if (!candidate || candidate.lifecycleStatus === "published") return null;
      const root = candidate.sourceRootId ? (await numbering.getNumberingRootDetailsByIds([candidate.sourceRootId], companyId, { includeAncillary: true }))[0] ?? null : null;
      const candidateFiles = candidate.candidateRevisions.flatMap((revision) => revision.files.filter((file) => !file.removedAt).map((file) => ({ ...file, revision })));
      const attachments = candidateFiles.length > 0
        ? await decorateMasterAttachmentsWithPreviewState(client, await this.readCandidateAttachments(client, candidate, candidateFiles, reviewRequestId))
        : [];
      return { key, candidate, root, drawing: null, part: null, canonicalDrawing: null, attachments };
    }
    if (key.startsWith("drawing:")) {
      const drawingKey = key.slice(8);
      const revisionPackage = await client.queryOne<{ drawing_number_id: string; id: string; revision: string }>(
        `SELECT drawing_number_id, id, revision FROM drawing_revision_packages WHERE id = :drawingId AND company_id = :companyId`,
        { drawingId: drawingKey, companyId }
      );
      const canonicalDrawing = await unified.findByIdOrFormalId({ drawingId: revisionPackage?.drawing_number_id ?? drawingKey, companyId });
      if (!canonicalDrawing) return null;
      const drawing = canonicalDrawing.formalDrawingNumberId ? (await numbering.listDrawingModuleRecordsByIds([canonicalDrawing.formalDrawingNumberId], companyId))[0] ?? null : null;
      const root = canonicalDrawing.partRootId ? (await numbering.getNumberingRootDetailsByIds([canonicalDrawing.partRootId], companyId, { includeAncillary: true }))[0] ?? null : null;
      const attachmentResult = revisionPackage
        ? { attachments: await this.readPackageAttachments(client, revisionPackage.id, revisionPackage.revision, companyId, reviewRequestId) }
        : drawing?.drawingNumber ? await new AsyncMasterAttachmentRepository(client).listMasterAttachments({ entityType: "drawing_number", entityCode: drawing.drawingNumber }) : null;
      const attachments = attachmentResult ? await decorateMasterAttachmentsWithPreviewState(client, attachmentResult.attachments) : [];
      return { key, canonicalDrawing, drawing, root, candidate: canonicalDrawing.workspaceId ? await state.getWorkspacesByIds([canonicalDrawing.workspaceId], companyId).then((rows) => rows[0] ?? null) : null, part: null, attachments };
    }
    if (key.startsWith("part:")) {
      const partSummary = (await numbering.listPartModuleRecordsByIds([key.slice(5)], companyId))[0] ?? null;
      const part = partSummary ? await numbering.getPartModuleDetail(partSummary.partNumber, companyId) : null;
      if (!part) return null;
      const root = (await numbering.getNumberingRootDetailsByIds([part.partRootId], companyId, { includeAncillary: true }))[0] ?? null;
      return { key, part, root, drawing: null, candidate: null, canonicalDrawing: null, attachments: [] };
    }
    const root = (await numbering.getNumberingRootDetailsByIds([key.slice(5)], companyId, { includeAncillary: true }))[0] ?? null;
    return root ? { key, root, drawing: null, part: null, candidate: null, canonicalDrawing: null, attachments: [] } : null;
  }

  private async readPackageAttachments(client: AsyncDatabaseClient, packageId: string, revision: string, companyId: string, reviewRequestId?: string | null): Promise<DetailAttachment[]> {
    const rows = await client.query<PackageAttachmentRow>(
      `SELECT package_file.id, package_file.source_file_asset_id, package_file.role, package_file.display_name,
              package_file.description, :revision AS revision, asset.file_name, asset.file_ext, asset.mime_type,
              asset.file_size, asset.content_hash, asset.storage_key, asset.storage_provider, asset.created_at, asset.updated_at
         FROM drawing_revision_package_files package_file
         JOIN drawing_revision_packages revision_package
           ON revision_package.id = package_file.package_id
          AND revision_package.company_id = :companyId
         JOIN file_assets asset ON asset.id = package_file.source_file_asset_id
        WHERE package_file.package_id = :packageId AND asset.deleted_at IS NULL
        ORDER BY package_file.sort_order, package_file.id`,
      { packageId, revision, companyId }
    );
    return rows.map((row) => ({
      id: row.source_file_asset_id,
      entityType: "drawing_number",
      entityId: packageId,
      entityCode: packageId,
      documentCategory: row.role === "cad_3d" ? "cad_3d" : row.role === "drawing_2d" ? "drawing_2d" : row.role === "pdf" ? "pdf" : row.role === "dwg_dxf" ? "dwg" : "other",
      displayName: row.display_name ?? row.file_name,
      description: row.description ?? "",
      revision: row.revision,
      fileName: row.file_name,
      fileExt: row.file_ext.replace(/^\./u, "").toLowerCase(),
      mimeType: row.mime_type,
      fileSize: Number(row.file_size ?? 0),
      contentHash: row.content_hash ?? "",
      hashAlgorithm: "SHA-256",
      storageKey: row.storage_key,
      gdriveFileId: null,
      gdriveStatus: "none",
      gdriveError: null,
      gdriveSyncedAt: null,
      uploadedBy: null,
      uploadedByName: null,
      sourceSubmissionId: null,
      sourceSubmissionStatus: null,
      sourceSubmissionRevision: null,
      sourceSubmissionCreatedAt: null,
      sourceSubmissionReleasedAt: null,
      revisionPackageId: packageId,
      revisionPackageStatus: "Pending",
      revisionPackageEffectiveStatus: "Pending",
      revisionPackageRevision: revision,
      revisionPackageSourceSubmissionId: null,
      revisionPackageFileKind: "core",
      revisionPackageSupplementId: null,
      revisionPackageSupplementStatus: null,
      revisionPackageSupplementReasonCode: null,
      revisionPackageSupplementReviewedAt: null,
      previewDerivatives: [],
      previewJob: null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      readHref: reviewRequestId ? withQuery(`/api/numbering/drawing-revision-packages/${encodeURIComponent(packageId)}/files/${encodeURIComponent(row.id)}`, "reviewRequestId", reviewRequestId) : `/api/numbering/drawing-revision-packages/${encodeURIComponent(packageId)}/files/${encodeURIComponent(row.id)}`
    } satisfies DetailAttachment));
  }

  private async readCandidateAttachments(client: AsyncDatabaseClient, candidate: NumberingDraftWorkspaceRecord, files: Array<{ id: string; sourceFileAssetId: string; displayName: string; role: string; revision: { id: string; revision: string } }>, reviewRequestId?: string | null): Promise<DetailAttachment[]> {
    const assetIds = [...new Set(files.map((file) => file.sourceFileAssetId).filter(Boolean))];
    if (assetIds.length === 0) return [];
    const placeholders = assetIds.map((_, index) => `:assetId${index}`).join(", ");
    const rows = await client.query<{ id: string; file_name: string; file_ext: string; mime_type: string | null; file_size: number | string | null; content_hash: string | null; storage_key: string | null; storage_provider: string | null; created_at: string; updated_at: string }>(
      `SELECT asset.id, asset.file_name, asset.file_ext, asset.mime_type, asset.file_size,
              asset.content_hash, asset.storage_key, asset.storage_provider, asset.created_at, asset.updated_at
         FROM file_assets asset
         JOIN numbering_candidate_revision_files candidate_file
           ON candidate_file.source_file_asset_id = asset.id
         JOIN numbering_candidate_revision_drafts candidate_revision
           ON candidate_revision.id = candidate_file.candidate_revision_id
          AND candidate_revision.company_id = :companyId
          AND candidate_revision.workspace_id = :workspaceId
        WHERE asset.id IN (${placeholders}) AND asset.deleted_at IS NULL`,
      Object.fromEntries(["companyId", "workspaceId", ...assetIds].map((value, index) => [index === 0 ? "companyId" : index === 1 ? "workspaceId" : `assetId${index - 2}`, index === 0 ? candidate.companyId : index === 1 ? candidate.id : value]))
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return files.flatMap((file) => {
      const row = byId.get(file.sourceFileAssetId);
      if (!row) return [];
      const fileExt = row.file_ext.replace(/^\./u, "").toLowerCase();
      const category = file.role === "cad_3d" ? "cad_3d" : file.role === "drawing_2d" ? "drawing_2d" : file.role === "pdf" ? "pdf" : file.role === "dwg_dxf" ? "dwg" : "other";
      const readHref = `/api/numbering/draft-workspaces/${encodeURIComponent(candidate.id)}/candidate-revisions/${encodeURIComponent(file.revision.id)}/files/${encodeURIComponent(file.id)}`;
      return [{ id: row.id, entityType: "drawing_number", entityId: candidate.id, entityCode: candidate.id, documentCategory: category, displayName: file.displayName || row.file_name, description: "", revision: file.revision.revision, fileName: row.file_name, fileExt, mimeType: row.mime_type, fileSize: Number(row.file_size ?? 0), contentHash: row.content_hash ?? "", hashAlgorithm: "SHA-256", storageKey: row.storage_key, gdriveFileId: null, gdriveStatus: "none", gdriveError: null, gdriveSyncedAt: null, uploadedBy: null, uploadedByName: null, sourceSubmissionId: null, sourceSubmissionStatus: null, sourceSubmissionRevision: null, sourceSubmissionCreatedAt: null, sourceSubmissionReleasedAt: null, revisionPackageId: null, revisionPackageStatus: null, revisionPackageEffectiveStatus: null, revisionPackageRevision: file.revision.revision, revisionPackageSourceSubmissionId: null, revisionPackageFileKind: null, revisionPackageSupplementId: null, revisionPackageSupplementStatus: null, revisionPackageSupplementReasonCode: null, revisionPackageSupplementReviewedAt: null, previewDerivatives: [], previewJob: null, createdAt: row.created_at, updatedAt: row.updated_at, readHref: reviewRequestId ? withQuery(readHref, "reviewRequestId", reviewRequestId) : readHref } satisfies DetailAttachment];
    });
  }

  private compose(source: DetailSource, input: { surface: PdmDetailSurface; companyId: string; actorId: string; reviewRequestId?: string | null; returnTo?: string | null }, policy: PdmDetailProjectionPolicy, review: ReviewRead | null): PdmEntityDetailResponse {
    const root = source.root;
    const drawingRecord = source.drawing;
    const partRecord = source.part;
    const entityCode = source.key.startsWith("drawing:") ? drawingRecord?.drawingNumber ?? source.canonicalDrawing?.drawingNumber ?? source.key.slice(8)
      : source.key.startsWith("part:") ? partRecord?.partNumber ?? source.key.slice(5)
      : source.key.startsWith("root:") ? root?.root.rootCode ?? source.key.slice(5)
      : source.candidate?.root?.candidateCode ?? source.key.slice(10);
    const displayName = drawingRecord?.coreName ?? partRecord?.partName ?? root?.root.coreName ?? source.candidate?.root?.coreName ?? entityCode;
    const status = basicStatus(source.candidate?.latestApproval?.status === "pending" ? "待審核" : source.key.startsWith("root:") ? "圖料關係" : "準備中", source.candidate?.latestApproval?.status === "pending" ? "waiting_review" : source.key.startsWith("root:") ? "relation_complete" : "preparing");
    const availability = drawingRecord ? projectDrawingRecordAvailability(drawingRecord) : partRecord ? projectPartAvailability(partRecord) : root ? projectRelationRootAvailability({ recordStatus: root.root.recordStatus, relationshipHealth: root.summary.hasMainDrawingInvalid ? "blocked" : "complete", blockerCount: root.summary.warningCount }) : projectDrawingAvailability({ stage: "building", usage: "not_for_formal_use" });
    const header = { entityKind: source.key.split(":", 1)[0] as "candidate" | "drawing" | "part" | "root", entityCode, displayName, humanStatus: status, viewerStatus: viewerStatus(status, input.actorId, source.candidate?.ownerId ?? null), availabilityScope: availability, stateFamily: stateFamily(source.candidate?.latestApproval?.status === "pending" ? "in_review" : undefined), actorResponsibility: source.candidate?.ownerId === input.actorId ? "目前由你負責" : "依目前權限提供查閱", lockedByReview: source.candidate?.latestApproval?.status === "pending" };
    const projections: PdmEntityDetailResponse["projections"] = {};
    if (policy.drawing && (drawingRecord || source.canonicalDrawing || source.candidate || source.root)) projections.drawing = policy.drawing === "full" ? { level: "full", data: this.drawingProjection(source, header, "full", input.reviewRequestId) as DrawingProjectionFull } : { level: "summary", data: this.drawingProjection(source, header, "summary", input.reviewRequestId) as DrawingProjectionSummary };
    if (policy.part && (partRecord || root || source.candidate)) projections.part = policy.part === "full" ? { level: "full", data: this.partProjection(source, header, "full") as PartProjectionFull } : { level: "summary", data: this.partProjection(source, header, "summary") as PartProjectionSummary };
    if (policy.relation && root) projections.relation = policy.relation === "full" ? { level: "full", data: this.relationProjection(root, "full") as RelationProjectionFull } : { level: "summary", data: this.relationProjection(root, "summary") as RelationProjectionSummary };
    if (review) projections.review = { level: "full", data: review };
    const ownerPath = input.surface === "drawing" ? "/numbering/drawings" : input.surface === "part" ? "/parts" : "/numbering/search";
    const revisionToken = this.aggregateHash(source);
    const reviewReturnTo = normalizePdmApprovalReturnTo(input.returnTo);
    const primary = review ? action(review.eligibleReviewer.canDecide ? "approve" : "return", review.eligibleReviewer.canDecide ? "核准" : "回到審核工作台", review.eligibleReviewer.canDecide ? null : reviewReturnTo, review.eligibleReviewer.canDecide, "approval", review.eligibleReviewer.canDecide ? `POST /api/approvals/requests/${review.requestId}/decisions` : null) : action("return", "回到來源清單", ownerPath, true, "navigation");
    const secondary = review ? [
      ...review.allowedDecisions.filter((decision) => decision !== "approved").map((decision) => action(decision === "needs_info" ? "return_for_correction" : "reject", decision === "needs_info" ? "補充資料" : "退回修改", null, review.eligibleReviewer.canDecide, "approval", `POST /api/approvals/requests/${review.requestId}/decisions`)),
      action("refresh", "重新整理", null, true, "navigation")
    ] : [action("refresh", "重新整理", null, true, "navigation")];
    const ownerParams = new URLSearchParams({ detail: source.key });
    if (review?.requestId) {
      ownerParams.set("reviewRequestId", review.requestId);
      ownerParams.set("returnTo", reviewReturnTo);
    }
    return { schemaVersion: "pdm-entity-detail.v1", entityKey: source.key, surface: input.surface, generatedAt: new Date().toISOString(), revisionToken, header: { ...header, lockedByReview: Boolean(review) || header.lockedByReview }, projections, actionBar: { primary, secondary }, navigation: { ownerHref: `${ownerPath}?${ownerParams.toString()}`, returnTo: reviewReturnTo, fallbackHref: "/approvals", targetAnchors: Object.keys(projections).map((projection) => ({ id: projection, label: projection === "drawing" ? "圖面" : projection === "part" ? "料號" : projection === "relation" ? "關聯" : "審核", projection: projection as "drawing" | "part" | "relation" | "review" })) } };
  }

  private aggregateHash(source: DetailSource) {
    const value = source.candidate ? numberingCandidateReviewSnapshotHash(source.candidate) : JSON.stringify({ key: source.key, drawing: source.canonicalDrawing ? { id: source.canonicalDrawing.id, rowVersion: source.canonicalDrawing.rowVersion, lifecycleState: source.canonicalDrawing.lifecycleState, updatedAt: source.canonicalDrawing.updatedAt } : null, part: source.part ? { id: source.part.id, updatedAt: source.part.updatedAt, linkedDrawings: source.part.linkedDrawings } : null, root: source.root ? { id: source.root.root.id, recordStatus: source.root.root.recordStatus, links: source.root.links } : null });
    return source.candidate ? value : crypto.createHash("sha256").update(value).digest("hex");
  }

  private drawingProjection(source: DetailSource, header: PdmEntityDetailResponse["header"], level: "summary" | "full", reviewRequestId?: string | null): DrawingProjectionSummary | DrawingProjectionFull {
    const drawing = source.drawing; const canonical = source.canonicalDrawing; const parts = source.root?.partNumbers ?? [];
    const rootDrawing = source.root?.drawingNumbers[0] ?? null;
    const summary: DrawingProjectionSummary = { drawingId: canonical?.id ?? drawing?.id ?? rootDrawing?.id ?? source.key.slice(10), rowKey: `drawing:${canonical?.id ?? drawing?.id ?? rootDrawing?.id ?? source.key.slice(10)}`, drawingNumber: canonical?.drawingNumber ?? drawing?.drawingNumber ?? rootDrawing?.drawingNumber ?? null, displayName: drawing?.coreName ?? source.candidate?.root?.coreName ?? source.root?.root.coreName ?? header.displayName, purposeCode: canonical?.purposeCode ?? drawing?.purposeCode ?? rootDrawing?.purposeCode ?? source.candidate?.drawings[0]?.purposeCode ?? null, purposeLabel: drawing?.purposeCode ?? rootDrawing?.purposeCode ?? null, humanStatus: header.humanStatus, viewerStatus: header.viewerStatus, availabilityScope: header.availabilityScope, linkedPartCount: drawing?.linkedPartCount ?? parts.length, representativePreview: { kind: "three-d", state: "missing", stateTitle: "尚無預覽", stateText: "尚未產生可用預覽。" } };
    if (level === "summary") return summary;
    const threeD = source.attachments.find((attachment) => attachment.documentCategory === "cad_3d" || ["sldprt", "sldasm", "step", "stp", "iges", "igs", "x_t", "x_b", "sat", "stl", "jt"].includes(attachment.fileExt.toLowerCase())) ?? null;
    const twoD = source.attachments.find((attachment) => attachment.documentCategory === "drawing_2d" || ["slddrw", "pdf", "dwg", "dxf", "png", "jpg", "jpeg", "webp"].includes(attachment.fileExt.toLowerCase())) ?? null;
    return { ...summary, stateFamily: header.stateFamily, previews: [previewSlot("three-d", "3D 模型", threeD, reviewRequestId), previewSlot("two-d", "2D 圖面", twoD, reviewRequestId)], currentRevision: { revision: source.attachments.map((attachment) => attachment.revision).filter(Boolean).sort().at(-1) ?? null, lifecycleState: canonical?.lifecycleState ?? null }, revisionHistory: [], attachments: source.attachments.map((attachment) => ({ id: attachment.id, displayName: attachment.displayName || attachment.fileName, role: attachment.documentCategory, href: attachment.readHref ?? `/api/numbering/drawings/${encodeURIComponent(attachment.entityCode)}/attachments/${encodeURIComponent(attachment.id)}` })), readiness: { blockers: [], owner: "研發", nextStep: null }, linkedParts: parts.map((part) => ({ id: part.id, partNumber: part.partNumber, partName: part.partName, recordStatus: part.recordStatus })) };
  }

  private partProjection(source: DetailSource, header: PdmEntityDetailResponse["header"], level: "summary" | "full"): PartProjectionSummary | PartProjectionFull {
    const part = source.part; const root = source.root; const raw = part ?? root?.partNumbers[0]; const id = part?.id ?? raw?.id ?? source.key.slice(10); const drawings = root?.drawingNumbers ?? [];
    const summary: PartProjectionSummary = { partId: id, rowKey: `part:${id}`, partNumber: part?.partNumber ?? raw?.partNumber ?? source.candidate?.parts[0]?.candidateCode ?? id, rootCode: part?.rootCode ?? root?.root.rootCode ?? "", displayName: part?.partName ?? source.candidate?.parts[0]?.partName ?? header.displayName, itemKind: part?.itemKind ?? raw?.itemKind ?? "", humanStatus: header.humanStatus, viewerStatus: header.viewerStatus, availabilityScope: header.availabilityScope, linkedDrawingCount: part?.drawingCount ?? drawings.length, representativeDrawing: drawings[0] ? { id: drawings[0].id, drawingNumber: drawings[0].drawingNumber } : null };
    if (level === "summary") return summary;
    return { ...summary, attributes: { customSpecification: part?.customSpecification ?? raw?.customSpecification ?? null, seriesCode: part?.seriesCode ?? raw?.seriesCode ?? null, variant: part?.variant ?? null }, linkedDrawings: (part?.linkedDrawings ?? root?.links.filter((link) => link.partNumberId === id) ?? []).map((link) => ({ id: link.id, drawingNumber: link.drawingNumber, linkType: link.linkType })), sharedModels: [], readiness: { blockers: [], owner: "研發", nextStep: null } };
  }

  private relationProjection(root: NumberingRootDetailRecord, level: "summary" | "full"): RelationProjectionSummary | RelationProjectionFull {
    const blockers = root.warnings.filter((warning) => warning.severity === "blocker").map((warning) => warning.message);
    const summary: RelationProjectionSummary = { rootId: root.root.id, rowKey: `root:${root.root.id}`, rootCode: root.root.rootCode, relationshipHealth: blockers.length ? "blocked" : "complete", counts: { drawings: root.drawingNumbers.length, parts: root.partNumbers.length, links: root.links.length, blockers: blockers.length }, blockers };
    if (level === "summary") return summary;
    return { ...summary, drawings: root.drawingNumbers.map((drawing) => ({ id: drawing.id, drawingNumber: drawing.drawingNumber, purposeCode: drawing.purposeCode, recordStatus: drawing.recordStatus })), parts: root.partNumbers.map((part) => ({ id: part.id, partNumber: part.partNumber, partName: part.partName, recordStatus: part.recordStatus })), links: root.links.map((link) => ({ id: link.id, drawingNumber: link.drawingNumber, partNumber: link.partNumber, linkType: link.linkType })), matrix: root.links.map((link) => ({ drawingNumber: link.drawingNumber, partNumber: link.partNumber, linkType: link.linkType })) };
  }
}
