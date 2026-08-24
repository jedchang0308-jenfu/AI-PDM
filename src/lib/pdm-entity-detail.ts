import crypto from "node:crypto";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { projectDrawingAvailability, projectDrawingRecordAvailability, projectPartAvailability, projectRelationRootAvailability } from "@/lib/availability-scope";
import { AsyncNumberStateFlowRepository, numberingCandidateReviewSnapshotHash } from "@/lib/repositories/number-state-flow-async-repository";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import { UnifiedDrawingAsyncRepository } from "@/lib/repositories/unified-drawing-async-repository";
import { decorateMasterAttachmentsWithPreviewState } from "@/lib/preview-derivatives";
import { AsyncMasterAttachmentRepository } from "@/lib/repositories/master-attachment-async-repository";
import { withPdmWorkbenchReadSnapshot } from "@/lib/repositories/pdm-workbench-read-snapshot";
import { PdmEntityDetailAsyncRepository } from "@/lib/repositories/pdm-entity-detail-async-repository";
import { AsyncApprovalPlatformRepository } from "@/lib/repositories/approval-platform-async-repository";
import { derivePdmDetailProjectionPolicy, type PdmDetailProjectionPolicy } from "@/lib/pdm-entity-detail-policy";
import { normalizePdmApprovalReturnTo } from "@/lib/pdm-review-navigation";
import { PdmReviewScopeError, pdmReviewEntityId, pdmReviewTargetTypesForEntityKey, resolvePdmReviewScopeReceiptAsync } from "@/lib/pdm-review-scope";
import { compareRevisionCodes } from "@/lib/revision-policy";
import { evaluateCandidateRevisionReadiness } from "@/lib/number-lifecycle-simplification";
import { isNumberLifecycleAdoptionHiddenFromUser, projectNumberLifecycleUserView } from "@/lib/number-lifecycle-user-view";
import { EMPTY_PDM_DETAIL_ACTION_CAPABILITIES, type PdmDetailActionCapabilities } from "@/lib/pdm-detail-action-capabilities";
import { resolvePdmDetailActions } from "@/lib/pdm-detail-action-resolver";
import { normalizePdmDetailStateFamily, projectPdmDetailObjectiveStatus, projectPdmDetailViewerStatus } from "@/lib/pdm-detail-status-actionability";
import type { NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import type { DrawingModuleListRecord, PartModuleDetailRecord, NumberingRootDetailRecord } from "@/lib/repositories/numbering-repository";
import type { MasterAttachmentRecord } from "@/lib/repositories/master-attachment-repository";
import type { PdmDetailSurface, PdmEntityDetailResponse, PdmEntityKey, PdmDetailStateFamily, DrawingProjectionFull, DrawingProjectionSummary, PartProjectionFull, PartProjectionSummary, RelationProjectionFull, RelationProjectionSummary, DrawingPreviewSlotModel } from "@/lib/pdm-entity-detail-contract";

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

type DetailRevisionRecord = {
  revision: string;
  lifecycleState: string | null;
  updatedAt: string | null;
  fileCount: number;
};

type DetailRevisionPackagePointer = {
  id: string;
  drawing_number_id: string;
  revision: string;
  updated_at: string;
};

function displayPartItemKind(itemKind: string | null | undefined, isUniversal: boolean | null | undefined, universalReason: string | null | undefined) {
  if (itemKind === "purchased" && isUniversal && universalReason === "standard_part") return "標準件";
  return ({ manufactured: "自製件", purchased: "外購件", outsourced: "委外件", shared: "共用件", custom: "客製件" } as Record<string, string>)[itemKind ?? ""] ?? itemKind ?? "";
}

function withQuery(href: string, name: string, value: string) {
  const [pathAndQuery, hash = ""] = href.split("#", 2);
  const [pathname, query = ""] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(query);
  params.set(name, value);
  return `${pathname}?${params.toString()}${hash ? `#${hash}` : ""}`;
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

type DetailSource = { key: PdmEntityKey; drawing: DrawingModuleListRecord | null; canonicalDrawing: Awaited<ReturnType<UnifiedDrawingAsyncRepository["findByIdOrFormalId"]>>; candidate: NumberingDraftWorkspaceRecord | null; part: PartModuleDetailRecord | null; root: NumberingRootDetailRecord | null; attachments: DetailAttachment[]; revisionRecords: DetailRevisionRecord[] };

function activeCandidate(source: DetailSource) {
  if (!source.candidate) return null;
  if (source.key.startsWith("candidate:")) return source.candidate;
  if (source.candidate.lifecycleStatus === "published" || source.canonicalDrawing?.formalDrawingNumberId) return null;
  return source.candidate;
}

function preferPrimaryManufacturingLink<T extends { linkType: string }>(links: T[]) {
  return links.find((link) => link.linkType === "primary_manufacturing") ?? links[0] ?? null;
}

function formalDrawingForProjection(source: DetailSource): NumberingRootDetailRecord["drawingNumbers"][number] | DrawingModuleListRecord | null {
  const drawings = source.root?.drawingNumbers ?? [];
  if (source.drawing) return drawings.find((drawing) => drawing.id === source.drawing!.id) ?? source.drawing;
  if (source.canonicalDrawing?.formalDrawingNumberId) {
    const canonicalDrawing = drawings.find((drawing) => drawing.id === source.canonicalDrawing!.formalDrawingNumberId);
    if (canonicalDrawing) return canonicalDrawing;
  }
  if (source.part) {
    const partLinks = source.part.linkedDrawings.length > 0
      ? source.part.linkedDrawings
      : source.root?.links.filter((link) => link.partNumberId === source.part!.id) ?? [];
    const preferredLink = preferPrimaryManufacturingLink(partLinks);
    const linkedDrawing = preferredLink ? drawings.find((drawing) => drawing.id === preferredLink.drawingNumberId) : null;
    if (linkedDrawing) return linkedDrawing;
  }
  return drawings.find((drawing) => drawing.isPrimaryManufacturing) ?? drawings[0] ?? null;
}

function formalPartForProjection(source: DetailSource, drawing: NumberingRootDetailRecord["drawingNumbers"][number] | DrawingModuleListRecord | null): NumberingRootDetailRecord["partNumbers"][number] | PartModuleDetailRecord | null {
  if (source.part) return source.part;
  const parts = source.root?.partNumbers ?? [];
  if (drawing) {
    const drawingLinks = source.root?.links.filter((link) => link.drawingNumberId === drawing.id) ?? [];
    const preferredLink = preferPrimaryManufacturingLink(drawingLinks);
    const linkedPart = preferredLink ? parts.find((part) => part.id === preferredLink.partNumberId) : null;
    if (linkedPart) return linkedPart;
  }
  return parts[0] ?? null;
}

type ReviewRead = {
  requestId: string;
  source: "platform" | "legacy";
  status: string;
  actionCode: string;
  actionTitle: string;
  requestReason: string | null;
  requester: { id: string | null; label: string | null };
  eligibleReviewer: { assigned: boolean; actorResponsibility: string; canDecide: boolean };
  targetRefs: Array<{ type: string; id: string }>;
  targetAnchors: Array<{ id: string; label: string }>;
  decisionReady: boolean;
  allowedDecisions: Array<"approved" | "rejected" | "needs_info">;
  snapshot: { snapshotId: string | null; snapshotHash: string | null; currentAggregateHash: string | null; checkStatus: "一致" | "有差異" | "未提供"; checkedAt: string | null; drift: boolean; mismatchReason: string | null };
  drawingRevisionEvidence: {
    drawingNumber: string | null;
    revision: string | null;
    parts: Array<{ id: string; number: string; name: string; linkType: string; formState: string; fitState: string; functionState: string; outcome: string }>;
    fff: { formState: string; fitState: string; functionState: string; outcome: string; reasonCategory: string; note: string };
    files: Array<{ id: string; displayName: string; role: string }>;
  } | null;
};

function evidenceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function evidenceRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(evidenceRecord) : [];
}

function evidenceText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export class PdmEntityDetailService {
  constructor(private readonly client: AsyncDatabaseClient = getAsyncDatabaseClient()) {}

  async read(input: { entityKey: string; surface: PdmDetailSurface; companyId: string; actorId: string; reviewRequestId?: string | null; returnTo?: string | null; capabilities?: PdmDetailActionCapabilities }): Promise<PdmEntityDetailResponse> {
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
    const scope = await resolvePdmReviewScopeReceiptAsync({
      client,
      requestId: input.reviewRequestId ?? "",
      companyId: input.companyId,
      actorId: input.actorId,
      entityKey: source.key,
      targetTypes,
      targetIds: [...targetIds],
      access: "review_evidence"
    });
    if (!scope) return null;
    const reviewDetail = await new AsyncApprovalPlatformRepository(client).getRequestDetail(scope.requestId, input.companyId);
    const currentCandidate = activeCandidate(source);
    const currentAggregateHash = currentCandidate
      ? (scope.actionCode === "numbering.candidate_publication_review"
        ? numberingCandidateReviewSnapshotHash(currentCandidate)
        : currentCandidate.candidateRevisions.find((revision) => revision.reviewSnapshotHash)?.reviewSnapshotHash ?? currentCandidate.latestApproval?.snapshotHash ?? this.aggregateHash(source))
      : this.aggregateHash(source);
    const drift = Boolean(scope.snapshotHash && currentAggregateHash && scope.snapshotHash !== currentAggregateHash);
    let drawingRevisionEvidence: ReviewRead["drawingRevisionEvidence"] = null;
    if (scope.source === "legacy" && scope.actionCode === "numbering.drawing_revision_impact_review") {
      const locked = evidenceRecord(reviewDetail?.impactSnapshots.at(-1)?.snapshot);
      const drawing = evidenceRecord(locked.drawing);
      const fff = evidenceRecord(locked.fff);
      const parts = evidenceRecords(locked.parts);
      const files = evidenceRecords(locked.files);
      drawingRevisionEvidence = {
        drawingNumber: evidenceText(drawing.number) || null,
        revision: evidenceText(drawing.revision) || null,
        parts: parts.map((part) => {
          const partFff = evidenceRecord(part.fff);
          return {
            id: evidenceText(part.id) || evidenceText(part.number),
            number: evidenceText(part.number),
            name: evidenceText(part.name),
            linkType: evidenceText(part.linkType),
            formState: evidenceText(partFff.formState) || evidenceText(fff.formState),
            fitState: evidenceText(partFff.fitState) || evidenceText(fff.fitState),
            functionState: evidenceText(partFff.functionState) || evidenceText(fff.functionState),
            outcome: evidenceText(partFff.outcome) || evidenceText(fff.outcome)
          };
        }),
        fff: {
          formState: evidenceText(fff.formState),
          fitState: evidenceText(fff.fitState),
          functionState: evidenceText(fff.functionState),
          outcome: evidenceText(fff.outcome),
          reasonCategory: evidenceText(fff.reasonCategory),
          note: evidenceText(fff.note)
        },
        files: files.map((file) => ({
          id: evidenceText(file.id) || evidenceText(file.sourceFileAssetId),
          displayName: evidenceText(file.displayName),
          role: evidenceText(file.role)
        }))
      };
    }
    return {
      requestId: scope.requestId,
      source: scope.source,
      status: scope.status,
      actionCode: scope.actionCode,
      actionTitle: scope.actionTitle,
      requestReason: reviewDetail?.reason.trim() || null,
      requester: scope.requester,
      eligibleReviewer: { assigned: scope.decisionReady, actorResponsibility: scope.decisionReady ? "目前由你負責審核" : "目前由審核權限提供查閱", canDecide: scope.decisionReady && !drift },
      targetRefs: scope.targetRefs,
      targetAnchors: scope.targetAnchors,
      decisionReady: scope.decisionReady && !drift,
      allowedDecisions: scope.allowedDecisions,
      snapshot: { snapshotId: scope.snapshotId, snapshotHash: scope.snapshotHash, currentAggregateHash, checkStatus: scope.snapshotHash ? (drift ? "有差異" : "一致") : "未提供", checkedAt: scope.checkedAt, drift, mismatchReason: drift ? "目前資料與送審時的 aggregate hash 不一致。" : null },
      drawingRevisionEvidence
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
      return { key, candidate, root, drawing: null, part: null, canonicalDrawing: null, attachments, revisionRecords: [] };
    }
    if (key.startsWith("drawing:")) {
      const drawingKey = key.slice(8);
      const requestedRevisionPackage = await client.queryOne<DetailRevisionPackagePointer>(
        `SELECT drawing_number_id, id, revision, updated_at FROM drawing_revision_packages WHERE id = :drawingId AND company_id = :companyId`,
        { drawingId: drawingKey, companyId }
      );
      const canonicalDrawing = await unified.findByIdOrFormalId({ drawingId: requestedRevisionPackage?.drawing_number_id ?? drawingKey, companyId });
      if (!canonicalDrawing) return null;
      const revisionPackage = requestedRevisionPackage
        ?? await this.loadCurrentRevisionPackage(client, canonicalDrawing.formalDrawingNumberId, companyId);
      const drawing = canonicalDrawing.formalDrawingNumberId ? (await numbering.listDrawingModuleRecordsByIds([canonicalDrawing.formalDrawingNumberId], companyId))[0] ?? null : null;
      const root = canonicalDrawing.partRootId ? (await numbering.getNumberingRootDetailsByIds([canonicalDrawing.partRootId], companyId, { includeAncillary: true }))[0] ?? null : null;
      const candidate = canonicalDrawing.workspaceId
        ? await state.getWorkspacesByIds([canonicalDrawing.workspaceId], companyId).then((rows) => rows[0] ?? null)
        : null;
      const candidateFiles = candidate
        ? candidate.candidateRevisions
          .filter((revision) => !canonicalDrawing.drawingDraftId || revision.drawingDraftId === canonicalDrawing.drawingDraftId)
          .flatMap((revision) => revision.files.filter((file) => !file.removedAt).map((file) => ({ ...file, revision })))
        : [];
      const attachmentResult = revisionPackage
        ? { attachments: await this.readPackageAttachments(client, revisionPackage.id, revisionPackage.revision, companyId, reviewRequestId) }
        : drawing?.drawingNumber ? await new AsyncMasterAttachmentRepository(client).listMasterAttachments({ entityType: "drawing_number", entityCode: drawing.drawingNumber }) : null;
      const rawAttachments = attachmentResult?.attachments
        ?? (candidate && candidateFiles.length > 0 ? await this.readCandidateAttachments(client, candidate, candidateFiles, reviewRequestId) : []);
      const attachments = await decorateMasterAttachmentsWithPreviewState(client, rawAttachments);
      const revisionRecords = await this.loadRevisionRecords(client, canonicalDrawing.id, canonicalDrawing.formalDrawingNumberId, companyId, attachments);
      return { key, canonicalDrawing, drawing, root, candidate, part: null, attachments, revisionRecords };
    }
    if (key.startsWith("part:")) {
      const partSummary = (await numbering.listPartModuleRecordsByIds([key.slice(5)], companyId))[0] ?? null;
      const part = partSummary ? await numbering.getPartModuleDetail(partSummary.partNumber, companyId) : null;
      if (!part) return null;
      const root = (await numbering.getNumberingRootDetailsByIds([part.partRootId], companyId, { includeAncillary: true }))[0] ?? null;
      return { key, part, root, drawing: null, candidate: null, canonicalDrawing: null, attachments: [], revisionRecords: [] };
    }
    const root = (await numbering.getNumberingRootDetailsByIds([key.slice(5)], companyId, { includeAncillary: true }))[0] ?? null;
    if (!root) return null;
    const representativeDrawing = root.drawingNumbers.find((entry) => entry.isPrimaryManufacturing)
      ?? root.drawingNumbers[0]
      ?? null;
    if (!representativeDrawing) {
      return { key, root, drawing: null, part: null, candidate: null, canonicalDrawing: null, attachments: [], revisionRecords: [] };
    }
    const canonicalDrawing = await unified.findByIdOrFormalId({ drawingId: representativeDrawing.id, companyId });
    const drawing = (await numbering.listDrawingModuleRecordsByIds([representativeDrawing.id], companyId))[0] ?? null;
    const candidate = canonicalDrawing?.workspaceId
      ? await state.getWorkspacesByIds([canonicalDrawing.workspaceId], companyId).then((rows) => rows[0] ?? null)
      : null;
    const revisionPackage = await this.loadCurrentRevisionPackage(client, canonicalDrawing?.formalDrawingNumberId ?? representativeDrawing.id, companyId);
    const attachmentResult = revisionPackage
      ? { attachments: await this.readPackageAttachments(client, revisionPackage.id, revisionPackage.revision, companyId, reviewRequestId) }
      : await new AsyncMasterAttachmentRepository(client).listMasterAttachments({
          entityType: "drawing_number",
          entityCode: representativeDrawing.drawingNumber
        });
    const attachments = await decorateMasterAttachmentsWithPreviewState(client, attachmentResult?.attachments ?? []);
    const revisionRecords = await this.loadRevisionRecords(
      client,
      canonicalDrawing?.id ?? "",
      canonicalDrawing?.formalDrawingNumberId ?? representativeDrawing.id,
      companyId,
      attachments
    );
    return { key, root, drawing, part: null, candidate, canonicalDrawing, attachments, revisionRecords };
  }

  private async loadCurrentRevisionPackage(client: AsyncDatabaseClient, drawingNumberId: string | null, companyId: string): Promise<DetailRevisionPackagePointer | null> {
    if (!drawingNumberId) return null;
    const rows = await client.query<DetailRevisionPackagePointer>(
      `SELECT id, drawing_number_id, revision, updated_at
         FROM drawing_revision_packages
        WHERE company_id = :companyId AND drawing_number_id = :drawingNumberId
          AND status NOT IN ('Cancelled', 'Superseded')`,
      { companyId, drawingNumberId }
    );
    return rows.sort((left, right) => {
      let revisionOrder = 0;
      try {
        revisionOrder = compareRevisionCodes(left.revision, right.revision, { allowLegacy: true });
      } catch {
        revisionOrder = left.revision.localeCompare(right.revision, "en");
      }
      return revisionOrder || left.updated_at.localeCompare(right.updated_at) || left.id.localeCompare(right.id, "en");
    }).at(-1) ?? null;
  }

  private async loadRevisionRecords(client: AsyncDatabaseClient, drawingId: string, drawingNumberId: string | null, companyId: string, attachments: DetailAttachment[]): Promise<DetailRevisionRecord[]> {
    const rows = await client.query<{ revision: string; lifecycle_state: string | null; updated_at: string | null; file_count: number | string }>(
      `SELECT revision, MAX(lifecycle_state) AS lifecycle_state, MAX(updated_at) AS updated_at, SUM(file_count) AS file_count
         FROM (
           SELECT revision, lifecycle_state, updated_at, 0 AS file_count
             FROM drawing_revisions
            WHERE drawing_id = :drawingId AND company_id = :companyId
           UNION ALL
           SELECT package.revision,
                  CASE
                    WHEN package.status = 'Pending'
                     AND package.revision LIKE '%.%'
                     AND EXISTS (
                       SELECT 1
                       FROM drawing_revision_fff_assessments assessment
                       JOIN review_confirmation_events confirmation
                         ON confirmation.review_id = assessment.id
                        AND confirmation.company_id = assessment.company_id
                       WHERE assessment.company_id = package.company_id
                         AND assessment.submission_id = package.source_submission_id
                         AND assessment.drawing_number_id = package.drawing_number_id
                         AND assessment.revision = package.revision
                         AND confirmation.action IN (
                           'confirm_original_part_reuse',
                           'approve_replacement_part_and_drawing_release'
                         )
                     )
                    THEN 'rd_controlled'
                    ELSE COALESCE(package.lifecycle_state, package.status)
                  END AS lifecycle_state,
                  package.updated_at, COUNT(package_file.id)
            FROM drawing_revision_packages package
            LEFT JOIN drawing_revision_package_files package_file ON package_file.package_id = package.id
           WHERE package.company_id = :companyId
              AND :hasDrawingNumberId = 1
              AND package.drawing_number_id = :drawingNumberId
            GROUP BY package.id, package.revision, package.lifecycle_state, package.status, package.updated_at
         ) records
        GROUP BY revision
        ORDER BY updated_at ASC, revision ASC`,
      { drawingId, drawingNumberId: drawingNumberId ?? "", hasDrawingNumberId: drawingNumberId ? 1 : 0, companyId }
    );
    const attachmentCounts = new Map<string, number>();
    for (const attachment of attachments) {
      const revision = attachment.revision?.trim();
      if (revision) attachmentCounts.set(revision, (attachmentCounts.get(revision) ?? 0) + 1);
    }
    const records = new Map(rows.map((row) => [row.revision, { revision: row.revision, lifecycleState: row.lifecycle_state, updatedAt: row.updated_at, fileCount: Math.max(Number(row.file_count ?? 0), attachmentCounts.get(row.revision) ?? 0) }]));
    for (const [revision, fileCount] of attachmentCounts) {
      if (!records.has(revision)) records.set(revision, { revision, lifecycleState: null, updatedAt: null, fileCount });
    }
    return [...records.values()];
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

  private compose(source: DetailSource, input: { surface: PdmDetailSurface; companyId: string; actorId: string; reviewRequestId?: string | null; returnTo?: string | null; capabilities?: PdmDetailActionCapabilities }, policy: PdmDetailProjectionPolicy, review: ReviewRead | null): PdmEntityDetailResponse {
    const root = source.root;
    const drawingRecord = source.drawing;
    const partRecord = source.part;
    const candidate = activeCandidate(source);
    const entityKind = source.key.split(":", 1)[0] as "candidate" | "drawing" | "part" | "root";
    const entityCode = source.key.startsWith("drawing:") ? drawingRecord?.drawingNumber ?? source.canonicalDrawing?.drawingNumber ?? source.key.slice(8)
      : source.key.startsWith("part:") ? partRecord?.partNumber ?? source.key.slice(5)
      : source.key.startsWith("root:") ? root?.root.rootCode ?? source.key.slice(5)
      : source.candidate?.root?.candidateCode
        ?? root?.root.rootCode
        ?? source.candidate?.drawings[0]?.candidateCode
        ?? source.candidate?.parts[0]?.candidateCode
        ?? source.key.slice(10);
    const displayName = drawingRecord?.coreName ?? partRecord?.partName ?? root?.root.coreName ?? source.candidate?.root?.coreName ?? entityCode;
    const adoptionHidden = candidate?.lifecycleV2 ? isNumberLifecycleAdoptionHiddenFromUser(candidate.lifecycleV2) : false;
    const candidateLifecycle = candidate?.lifecycleV2 ? projectNumberLifecycleUserView(candidate.lifecycleV2) : null;
    const candidateState = candidateLifecycle?.stage
      ?? (candidate?.latestApproval?.status === "pending" ? "in_review"
        : ["needs_info", "rejected"].includes(candidate?.latestApproval?.status ?? "") ? "correction_required"
          : candidate?.lifecycleStatus === "cancelled" ? "history_only" : "building");
    // The formal lifecycle overlay includes the established ReviewApproved
    // compatibility projection. Published workspace state is provenance only.
    const formalState = source.drawing?.lifecycle?.state
      ?? source.canonicalDrawing?.lifecycleState
      ?? (source.part ? (["Obsolete", "Merged"].includes(source.part.recordStatus) ? "history_only" : source.part.recordStatus === "Released" ? "released" : "rd_controlled")
        : source.root ? (["Obsolete", "Merged"].includes(source.root.root.recordStatus) ? "history_only" : source.root.root.recordStatus === "Released" ? "released" : "rd_controlled")
          : null);
    const derivedStateFamily = normalizePdmDetailStateFamily(candidate ? candidateState : formalState);
    const status = projectPdmDetailObjectiveStatus({ stateFamily: derivedStateFamily, entityKind });
    const availability = drawingRecord ? projectDrawingRecordAvailability(drawingRecord) : partRecord ? projectPartAvailability(partRecord) : root ? projectRelationRootAvailability({ recordStatus: root.root.recordStatus, relationshipHealth: root.summary.hasMainDrawingInvalid ? "blocked" : "complete", blockerCount: root.summary.warningCount }) : projectDrawingAvailability({ stage: "building", usage: "not_for_formal_use" });
    const ownerId = candidate?.ownerId ?? source.canonicalDrawing?.ownerId ?? source.drawing?.lifecycle?.submittedBy ?? null;
    const ownerPath = input.surface === "drawing" ? "/numbering/drawings" : input.surface === "part" ? "/parts" : "/numbering/search";
    const revisionToken = this.aggregateHash(source);
    const reviewReturnTo = normalizePdmApprovalReturnTo(input.returnTo);
    const ownerParams = new URLSearchParams({ detail: source.key });
    if (review?.requestId) {
      ownerParams.set("reviewRequestId", review.requestId);
      ownerParams.set("returnTo", reviewReturnTo);
    }
    const ownerHref = `${ownerPath}?${ownerParams.toString()}`;
    const activeCandidateRevision = candidate?.candidateRevisions.find((revision) => revision.lifecycleStatus === "review_locked" && revision.approvalRequestId) ?? null;
    const candidateRequestId = adoptionHidden
      ? null
      : activeCandidateRevision?.approvalRequestId ?? (candidate?.latestApproval?.status === "pending" ? candidate.latestApproval.requestId : null);
    const readinessLabels: Record<string, string> = { revision: "版次", primary_file: "主要檔案", drawing_2d: "2D 圖面", cad_3d: "3D 模型", finalized_evidence: "完成驗證證據" };
    const readinessBlockers = candidateLifecycle?.stage === "bundle_ready" ? [] : candidate
      ? [...new Set([
          ...candidate.drawings.flatMap((drawing) => {
            const revision = candidate.candidateRevisions.find((entry) => entry.drawingDraftId === drawing.id && entry.lifecycleStatus === "draft");
            return revision ? evaluateCandidateRevisionReadiness(revision).missing.map((missing) => readinessLabels[missing] ?? missing) : ["首版"];
          }),
          ...(candidate.draftMode !== "append_part" && candidate.drawings.length > 0 && candidate.parts.length > 0 && candidate.relations.length === 0 ? ["圖料關聯"] : []),
          ...(candidate.draftMode === "append_part"
            && candidate.parts.some((part) => ["manufactured", "outsourced", "custom"].includes(part.itemKind))
            && !candidate.sourceDrawingNumberId ? ["自製件製造圖關聯"] : [])
        ])]
      : [];
    const actionBar = resolvePdmDetailActions({
      entityKey: source.key,
      surface: input.surface,
      stateFamily: derivedStateFamily,
      actorId: input.actorId,
      ownerId,
      ownerHref,
      returnTo: reviewReturnTo,
      capabilities: input.capabilities ?? EMPTY_PDM_DETAIL_ACTION_CAPABILITIES,
      readinessBlockers,
      candidate: candidate ? {
        workspaceId: candidate.id,
        rowVersion: candidate.rowVersion,
        lifecycleV2: candidate.lifecycleV2 !== null,
        requestId: candidateRequestId,
        submittedBy: activeCandidateRevision?.createdBy ?? candidate.latestApproval?.requestedBy ?? candidate.ownerId,
        decisionCount: 0,
        canUpdate: candidate.capabilities.canUpdate,
        canCancel: candidate.capabilities.canCancel,
        canSubmitReview: candidate.capabilities.canSubmitReview,
        canWithdrawReview: candidate.capabilities.canWithdrawReview,
        applyFailed: !adoptionHidden && (
          candidateState === "recovery_required" ||
          candidate.latestApproval?.status === "apply_failed" ||
          candidate.latestApproval?.applyStatus === "failed"
        )
      } : null,
      formalDrawing: source.drawing ? {
        drawingNumber: source.drawing.drawingNumber,
        requestId: source.drawing.lifecycle?.requestId ?? null,
        submittedBy: source.drawing.lifecycle?.submittedBy ?? null,
        decisionCount: source.drawing.lifecycle?.decisionCount ?? 0
      } : source.canonicalDrawing?.drawingNumber ? { drawingNumber: source.canonicalDrawing.drawingNumber, requestId: null, submittedBy: null, decisionCount: 0 } : null,
      review: review ? { requestId: review.requestId, decisionReady: review.decisionReady, allowedDecisions: review.allowedDecisions, drift: review.snapshot.drift } : null
    });
    const activeReviewRequestId = review?.requestId ?? candidateRequestId ?? source.drawing?.lifecycle?.requestId ?? null;
    const projectedViewerStatus = projectPdmDetailViewerStatus({
      objectiveStatus: status,
      stateFamily: derivedStateFamily,
      actorId: input.actorId,
      ownerId,
      reviewerIds: source.drawing?.lifecycle?.reviewerIds ?? [],
      reviewRequestId: activeReviewRequestId,
      reviewContext: Boolean(review),
      actionBar
    });
    const header = { entityKind, entityCode, displayName, humanStatus: status, viewerStatus: projectedViewerStatus, availabilityScope: availability, stateFamily: derivedStateFamily, actorResponsibility: projectedViewerStatus.actorLabel, lockedByReview: Boolean(review) || derivedStateFamily === "in_review" };
    const projections: PdmEntityDetailResponse["projections"] = {};
    if (policy.drawing && (drawingRecord || source.canonicalDrawing || source.candidate || source.root)) projections.drawing = policy.drawing === "full" ? { level: "full", data: this.drawingProjection(source, header, "full", input.reviewRequestId) as DrawingProjectionFull } : { level: "summary", data: this.drawingProjection(source, header, "summary", input.reviewRequestId) as DrawingProjectionSummary };
    if (policy.part && (partRecord || root || source.candidate)) projections.part = policy.part === "full" ? { level: "full", data: this.partProjection(source, header, "full") as PartProjectionFull } : { level: "summary", data: this.partProjection(source, header, "summary") as PartProjectionSummary };
    if (policy.relation && (root || candidate)) {
      const relation = candidate ? this.candidateRelationProjection(candidate, root, policy.relation) : this.relationProjection(root!, policy.relation);
      projections.relation = policy.relation === "full" ? { level: "full", data: relation as RelationProjectionFull } : { level: "summary", data: relation as RelationProjectionSummary };
    }
    if (review) projections.review = { level: "full", data: review };
    return { schemaVersion: "pdm-entity-detail.v2", entityKey: source.key, surface: input.surface, generatedAt: new Date().toISOString(), revisionToken, header: { ...header, lockedByReview: Boolean(review) || header.lockedByReview }, projections, actionBar, navigation: { ownerHref, returnTo: reviewReturnTo, fallbackHref: "/approvals", targetAnchors: Object.keys(projections).map((projection) => ({ id: projection, label: projection === "drawing" ? "圖面" : projection === "part" ? "料號" : projection === "relation" ? "關聯" : "審核", projection: projection as "drawing" | "part" | "relation" | "review" })) } };
  }

  private aggregateHash(source: DetailSource) {
    const candidate = activeCandidate(source);
    const value = candidate ? numberingCandidateReviewSnapshotHash(candidate) : JSON.stringify({ key: source.key, drawing: source.canonicalDrawing ? { id: source.canonicalDrawing.id, rowVersion: source.canonicalDrawing.rowVersion, lifecycleState: source.canonicalDrawing.lifecycleState, updatedAt: source.canonicalDrawing.updatedAt } : null, part: source.part ? { id: source.part.id, updatedAt: source.part.updatedAt, linkedDrawings: source.part.linkedDrawings } : null, root: source.root ? { id: source.root.root.id, recordStatus: source.root.root.recordStatus, links: source.root.links } : null });
    return candidate ? value : crypto.createHash("sha256").update(value).digest("hex");
  }

  private drawingProjection(source: DetailSource, header: PdmEntityDetailResponse["header"], level: "summary" | "full", reviewRequestId?: string | null): DrawingProjectionSummary | DrawingProjectionFull {
    const drawing = source.drawing; const canonical = source.canonicalDrawing;
    const preferCandidate = source.key.startsWith("candidate:");
    const candidate = activeCandidate(source);
    const rootDrawing = formalDrawingForProjection(source);
    const formalDrawingLinks = rootDrawing
      ? (reviewRequestId
        ? source.root?.links ?? []
        : source.root?.links.filter((link) => link.drawingNumberId === rootDrawing.id) ?? [])
      : [];
    const formalLinkedParts = formalDrawingLinks.flatMap((link) => {
      const part = source.root?.partNumbers.find((candidate) => candidate.id === link.partNumberId);
      return part ? [part] : [];
    });
    const candidateDrawing = candidate?.drawings.find((entry) => entry.id === canonical?.drawingDraftId)
      ?? candidate?.drawings.find((entry) => entry.isPrimaryManufacturing)
      ?? candidate?.drawings[0]
      ?? null;
    const candidateRevision = candidateDrawing
      ? candidate?.candidateRevisions.find((entry) => entry.drawingDraftId === candidateDrawing.id && entry.lifecycleStatus === "draft")
        ?? candidate?.candidateRevisions.find((entry) => entry.drawingDraftId === candidateDrawing.id)
        ?? null
      : null;
    const drawingId = preferCandidate && candidateDrawing
      ? candidateDrawing.id
      : canonical?.id ?? drawing?.id ?? rootDrawing?.id ?? candidateDrawing?.id ?? source.key.slice(10);
    const drawingNumber = preferCandidate && candidateDrawing
      ? candidateDrawing.candidateCode
      : canonical?.drawingNumber ?? drawing?.drawingNumber ?? rootDrawing?.drawingNumber ?? candidateDrawing?.candidateCode ?? null;
    const purposeCode = preferCandidate && candidateDrawing
      ? candidateDrawing.purposeCode
      : canonical?.purposeCode ?? drawing?.purposeCode ?? rootDrawing?.purposeCode ?? candidateDrawing?.purposeCode ?? null;
    const candidateLinkedParts = candidate && candidateDrawing
      ? candidate.relations
        .filter((relation) => relation.drawingDraftId === candidateDrawing.id)
        .flatMap((relation) => candidate.parts.filter((part) => part.id === relation.partDraftId))
      : [];
    const summary: DrawingProjectionSummary = { drawingId, rowKey: `drawing:${drawingId}`, drawingNumber, displayName: preferCandidate ? candidate?.root?.coreName ?? source.root?.root.coreName ?? drawing?.coreName ?? header.displayName : drawing?.coreName ?? candidate?.root?.coreName ?? source.root?.root.coreName ?? header.displayName, purposeCode, purposeLabel: preferCandidate && candidateDrawing ? candidateDrawing.purposeCode : drawing?.purposeCode ?? rootDrawing?.purposeCode ?? candidateDrawing?.purposeCode ?? null, humanStatus: header.humanStatus, viewerStatus: header.viewerStatus, availabilityScope: header.availabilityScope, linkedPartCount: preferCandidate && candidateDrawing ? candidateLinkedParts.length : formalLinkedParts.length, representativePreview: { kind: "three-d", state: "missing", stateTitle: "尚無預覽", stateText: "尚未產生可用預覽。" } };
    if (level === "summary") return summary;
    const threeD = source.attachments.find((attachment) => attachment.documentCategory === "cad_3d" || ["sldprt", "sldasm", "step", "stp", "iges", "igs", "x_t", "x_b", "sat", "stl", "jt"].includes(attachment.fileExt.toLowerCase())) ?? null;
    const twoD = source.attachments.find((attachment) => attachment.documentCategory === "drawing_2d" || ["slddrw", "pdf", "dwg", "dxf", "png", "jpg", "jpeg", "webp"].includes(attachment.fileExt.toLowerCase())) ?? null;
    const revisionGroups = new Map(source.revisionRecords.map((record) => [record.revision, { fileCount: record.fileCount, updatedAt: record.updatedAt }]));
    for (const attachment of source.attachments) {
      const revision = attachment.revision?.trim();
      if (!revision) continue;
      const current = revisionGroups.get(revision);
      const attachmentCount = source.attachments.filter((candidate) => candidate.revision?.trim() === revision).length;
      revisionGroups.set(revision, { fileCount: Math.max(current?.fileCount ?? 0, attachmentCount), updatedAt: current?.updatedAt ?? attachment.updatedAt ?? null });
    }
    const orderedRevisions = [...revisionGroups.keys()].sort((left, right) => {
      try { return compareRevisionCodes(left, right, { allowLegacy: true }); } catch { return left.localeCompare(right, "en"); }
    });
    const currentRevision = orderedRevisions.at(-1) ?? candidateRevision?.revision ?? null;
    const revisionHistory = orderedRevisions
      .filter((revision) => revision !== currentRevision)
      .reverse()
      .map((revision) => ({ revision, lifecycleState: "historical", ...revisionGroups.get(revision)! }));
    const currentRevisionLifecycle = currentRevision
      ? source.revisionRecords.find((record) => record.revision === currentRevision)?.lifecycleState ?? candidateRevision?.lifecycleStatus ?? canonical?.lifecycleState ?? null
      : canonical?.lifecycleState ?? null;
    const isFormalDrawing = Boolean(canonical?.formalDrawingNumberId || drawing?.id);
    const maintenanceTarget = isFormalDrawing && drawingNumber
      ? { kind: "formal_drawing" as const, drawingNumber }
      : preferCandidate && candidate && candidateDrawing && candidateRevision?.lifecycleStatus === "draft"
        ? { kind: "candidate_revision" as const, workspaceId: candidate.id, drawingDraftId: candidateDrawing.id, candidateRevisionId: candidateRevision.id, rowVersion: candidateRevision.rowVersion, revision: candidateRevision.revision }
        : preferCandidate && candidate && candidateDrawing && !candidateRevision && candidate.lifecycleStatus === "active"
          ? { kind: "candidate_revision_pending" as const, workspaceId: candidate.id, drawingDraftId: candidateDrawing.id, workspaceRowVersion: candidate.rowVersion }
          : null;
    const linkedParts = preferCandidate && candidateDrawing
      ? candidateLinkedParts.map((part) => ({ id: part.id, partNumber: part.candidateCode ?? "尚未取得料號", partName: part.partName, recordStatus: "Candidate" }))
      : formalLinkedParts.map((part) => ({ id: part.id, partNumber: part.partNumber, partName: part.partName, recordStatus: part.recordStatus }));
    return { ...summary, stateFamily: header.stateFamily, maintenanceTarget, previews: [previewSlot("three-d", "3D 模型", threeD, reviewRequestId), previewSlot("two-d", "2D 圖面", twoD, reviewRequestId)], currentRevision: { revision: currentRevision, lifecycleState: currentRevisionLifecycle }, revisionHistory, attachments: source.attachments.map((attachment) => ({ id: attachment.id, displayName: attachment.displayName || attachment.fileName, role: attachment.documentCategory, href: attachment.readHref ?? `/api/numbering/drawings/${encodeURIComponent(attachment.entityCode)}/attachments/${encodeURIComponent(attachment.id)}` })), readiness: { blockers: [], owner: "研發", nextStep: null }, linkedParts };
  }

  private partProjection(source: DetailSource, header: PdmEntityDetailResponse["header"], level: "summary" | "full"): PartProjectionSummary | PartProjectionFull {
    const part = source.part; const root = source.root; const candidatePart = source.candidate?.parts[0] ?? null; const preferCandidate = source.key.startsWith("candidate:") && Boolean(candidatePart); const projectionDrawing = formalDrawingForProjection(source); const raw = part ?? formalPartForProjection(source, projectionDrawing); const id = preferCandidate ? candidatePart!.id : part?.id ?? raw?.id ?? candidatePart?.id ?? source.key.slice(10);
    const candidateLinkedDrawings = source.candidate && candidatePart
      ? source.candidate.relations
        .filter((relation) => relation.partDraftId === candidatePart.id)
        .flatMap((relation) => source.candidate!.drawings.filter((drawingEntry) => drawingEntry.id === relation.drawingDraftId).map((drawingEntry) => ({ ...drawingEntry, relation })))
      : [];
    const formalPartLinks = raw
      ? (part?.linkedDrawings ?? root?.links.filter((link) => link.partNumberId === raw.id) ?? [])
      : [];
    const preferredPartDrawing = source.drawing || source.canonicalDrawing
      ? projectionDrawing
      : (() => {
          const preferredLink = preferPrimaryManufacturingLink(formalPartLinks);
          return preferredLink ? root?.drawingNumbers.find((drawingEntry) => drawingEntry.id === preferredLink.drawingNumberId) ?? null : null;
        })();
    const representativeDrawing = candidateLinkedDrawings[0]
      ? { id: candidateLinkedDrawings[0].id, drawingNumber: candidateLinkedDrawings[0].candidateCode ?? "尚未取得圖號" }
      : preferredPartDrawing ? { id: preferredPartDrawing.id, drawingNumber: preferredPartDrawing.drawingNumber } : null;
    const summary: PartProjectionSummary = { partId: id, rowKey: `part:${id}`, partNumber: preferCandidate ? candidatePart!.candidateCode ?? id : part?.partNumber ?? raw?.partNumber ?? candidatePart?.candidateCode ?? id, rootCode: source.candidate?.root?.candidateCode ?? part?.rootCode ?? root?.root.rootCode ?? "", displayName: preferCandidate ? candidatePart!.partName : part?.partName ?? raw?.partName ?? candidatePart?.partName ?? header.displayName, itemKind: preferCandidate ? displayPartItemKind(candidatePart!.itemKind, candidatePart!.isUniversal, candidatePart!.universalReason) : displayPartItemKind(part?.itemKind ?? raw?.itemKind ?? candidatePart?.itemKind, part?.isUniversal ?? raw?.isUniversal ?? candidatePart?.isUniversal, part?.universalReason ?? raw?.universalReason ?? candidatePart?.universalReason), humanStatus: header.humanStatus, viewerStatus: header.viewerStatus, availabilityScope: header.availabilityScope, linkedDrawingCount: candidatePart ? candidateLinkedDrawings.length : formalPartLinks.length, representativeDrawing };
    if (level === "summary") return summary;
    const linkedDrawings = candidatePart
      ? candidateLinkedDrawings.map((drawingEntry) => ({ id: drawingEntry.relation.id, drawingNumber: drawingEntry.candidateCode ?? "尚未取得圖號", linkType: drawingEntry.relation.linkType }))
      : formalPartLinks.map((link) => ({ id: link.id, drawingNumber: link.drawingNumber, linkType: link.linkType }));
    return {
      ...summary,
      attributes: {
        customSpecification: part?.customSpecification ?? raw?.customSpecification ?? candidatePart?.customSpecification ?? null,
        seriesCode: part?.seriesCode ?? raw?.seriesCode ?? candidatePart?.seriesCode ?? null,
        materialLabel: part?.variant?.materialLabel ?? part?.variant?.materialCode ?? null,
        colorLabel: part?.variant?.colorLabel ?? part?.variant?.colorCode ?? null,
        surfaceTreatment: part?.variant?.surfaceTreatment ?? null,
        variantNote: part?.variant?.variantNote ?? null
      },
      linkedDrawings,
      sharedModels: [],
      readiness: { blockers: [], owner: "研發", nextStep: null }
    };
  }

  private candidateRelationProjection(candidate: NumberingDraftWorkspaceRecord, root: NumberingRootDetailRecord | null, level: "summary" | "full"): RelationProjectionSummary | RelationProjectionFull {
    const formalBlockers = root?.warnings.filter((warning) => warning.severity === "blocker").map((warning) => warning.message) ?? [];
    const candidateDrawings = candidate.drawings.map((drawing) => ({ id: drawing.id, drawingNumber: drawing.candidateCode ?? "尚未取得圖號", purposeCode: drawing.purposeCode, recordStatus: "Candidate" }));
    const candidateParts = candidate.parts.map((part) => ({ id: part.id, partNumber: part.candidateCode ?? "尚未取得料號", partName: part.partName, recordStatus: "Candidate" }));
    const drawingsById = new Map(candidateDrawings.map((drawing) => [drawing.id, drawing]));
    const partsById = new Map(candidateParts.map((part) => [part.id, part]));
    const candidateLinks = candidate.relations.flatMap((relation) => {
      const drawing = drawingsById.get(relation.drawingDraftId);
      const part = partsById.get(relation.partDraftId);
      return drawing && part ? [{ id: relation.id, drawingNumber: drawing.drawingNumber, partNumber: part.partNumber, linkType: relation.linkType }] : [];
    });
    const relationMappingMissing = candidate.relations.length - candidateLinks.length;
    const candidateRelationRequired = candidate.draftMode !== "append_part" && candidate.drawings.length > 0 && candidate.parts.length > 0;
    const blockers = [
      ...formalBlockers,
      ...(candidateRelationRequired && candidate.relations.length === 0 ? ["候選圖號與料號尚未建立關聯。"] : []),
      ...(relationMappingMissing > 0 ? ["部分候選圖料關聯無法對應目前的圖號或料號。"] : [])
    ];
    const drawings = [...(root?.drawingNumbers.map((drawing) => ({ id: drawing.id, drawingNumber: drawing.drawingNumber, purposeCode: drawing.purposeCode, recordStatus: drawing.recordStatus })) ?? []), ...candidateDrawings];
    const parts = [...(root?.partNumbers.map((part) => ({ id: part.id, partNumber: part.partNumber, partName: part.partName, recordStatus: part.recordStatus })) ?? []), ...candidateParts];
    const links = [...(root?.links.map((link) => ({ id: link.id, drawingNumber: link.drawingNumber, partNumber: link.partNumber, linkType: link.linkType })) ?? []), ...candidateLinks];
    const rootId = candidate.root?.id ?? root?.root.id ?? candidate.id;
    const rootCode = candidate.root?.candidateCode ?? root?.root.rootCode ?? candidate.sourceRootId ?? "尚未取得圖料根號";
    const summary: RelationProjectionSummary = { rootId, rowKey: `root:${rootId}`, rootCode, relationshipHealth: blockers.length > 0 ? "blocked" : "complete", counts: { drawings: drawings.length, parts: parts.length, links: links.length, blockers: blockers.length }, blockers };
    if (level === "summary") return summary;
    return { ...summary, drawings, parts, links, matrix: links.map((link) => ({ drawingNumber: link.drawingNumber, partNumber: link.partNumber, linkType: link.linkType })) };
  }

  private relationProjection(root: NumberingRootDetailRecord, level: "summary" | "full"): RelationProjectionSummary | RelationProjectionFull {
    const blockers = root.warnings.filter((warning) => warning.severity === "blocker").map((warning) => warning.message);
    const summary: RelationProjectionSummary = { rootId: root.root.id, rowKey: `root:${root.root.id}`, rootCode: root.root.rootCode, relationshipHealth: blockers.length ? "blocked" : "complete", counts: { drawings: root.drawingNumbers.length, parts: root.partNumbers.length, links: root.links.length, blockers: blockers.length }, blockers };
    if (level === "summary") return summary;
    return { ...summary, drawings: root.drawingNumbers.map((drawing) => ({ id: drawing.id, drawingNumber: drawing.drawingNumber, purposeCode: drawing.purposeCode, recordStatus: drawing.recordStatus })), parts: root.partNumbers.map((part) => ({ id: part.id, partNumber: part.partNumber, partName: part.partName, recordStatus: part.recordStatus })), links: root.links.map((link) => ({ id: link.id, drawingNumber: link.drawingNumber, partNumber: link.partNumber, linkType: link.linkType })), matrix: root.links.map((link) => ({ drawingNumber: link.drawingNumber, partNumber: link.partNumber, linkType: link.linkType })) };
  }
}
