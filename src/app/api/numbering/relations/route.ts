import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { isUnifiedPartRelationWorkbenchV1Enabled } from "@/lib/number-state-flow-feature";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { listDrawingModuleRecordsByIdsAsync, listProductSeriesOptionsAsync, listSeriesCodeOptionsAsync, maintainDrawingPartRelationAsync, searchNumberingRecordsAsync } from "@/lib/numbering-async";
import { displayDrawingPurposeLabel, isManufacturingDrawingPurpose, isReferenceDrawingPurpose } from "@/lib/numbering-identity";
import { projectEffectiveRelationRecordStatus, projectNumberingRootStatus, relationshipHealthLabel } from "@/lib/drawing-part-relation-status";
import { projectPartHumanStatus } from "@/lib/part-human-status";
import { projectDrawingRecordHumanStatus } from "@/lib/drawing-workbench-status";
import { projectDrawingWorkbenchRecord, type DrawingWorkbenchActor, type DrawingWorkbenchRow } from "@/lib/drawing-workbench";
import { normalizeHumanStatusFilter, projectRoleViewerHumanStatus, viewerStatusMatchesFilter, type HumanStatusRoleCapabilities } from "@/lib/human-status-projection";
import { canUserUseNumberingActionAsync, requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { resolveHumanStatusRoleCapabilitiesAsync } from "@/lib/numbering-human-status-viewer";
import { projectDrawingRecordAvailability, projectPartAvailability, projectRelationRootAvailability } from "@/lib/availability-scope";
import { AsyncNumberStateFlowRepository, type NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import { normalizeRelationWorkbenchQuery, RelationWorkbenchService, relationWorkbenchErrorResponse, type RelationWorkbenchActor } from "@/lib/relation-workbench";
import type {
  DrawingNumberRecord,
  MaintainDrawingPartRelationOperation,
  NumberingLinkRecord,
  NumberingRecordStatus,
  NumberingRootDetailRecord,
  NumberingSearchEntityType,
  PartNumberRecord
} from "@/lib/repositories/numbering-repository";
import { compareNumberCodes, parseNumberSortDirection } from "@/lib/number-sort";

export const runtime = "nodejs";

const entityTypes = new Set(["all", "part_root", "part_number", "drawing_number"]);
const recordStatuses = new Set([
  "Draft",
  "NeedInfo",
  "Active",
  "PendingReview",
  "Released",
  "Rejected",
  "Obsolete",
  "Merged",
  "PendingAdminConfirm",
  "MainDrawingInvalid"
]);
const relationOperations = new Set(["link", "set_primary", "set_reference", "remove"]);

type DrawingPartRelationHealth = "complete" | "missing_manufacturing_drawing" | "missing_part" | "ambiguous" | "blocked" | "draft";

type DrawingPartRelationBlocker = {
  code: string;
  message: string;
  target: "root" | "drawing" | "part" | "relationship";
  targetId?: string;
};

type DrawingPartRelationCell = {
  drawingNumber: string;
  partNumber: string;
  relationType: "manufacturing_basis" | "reference" | "pending" | "not_applicable" | "required_missing" | "blocked";
  isPrimary?: boolean;
};

type DrawingPartRelationChangeReview = {
  id: string;
  title: string;
  statusLabel: string;
  summary: string;
  drawings: Array<{
    id: string;
    drawingNumber: string;
    purposeLabel: "製造圖" | "參考圖";
    isReferenceOnly: boolean;
    reviewAvailabilityLabel: string;
    linkedPartNumbers: string[];
    nextStep: string;
  }>;
  parts: Array<{
    id: string;
    partNumber: string;
    partName: string;
    role: string;
    roleByDrawing: Record<string, string>;
    hasManufacturingDrawing: boolean;
  }>;
};

export async function GET(request: Request) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const projection = url.searchParams.get("projection")?.trim() ?? "";
  if (projection && projection !== "workbench_v1") {
    return NextResponse.json({ error: { code: "relation_projection_invalid", message: "不支援指定的圖料讀取投影。", retryable: false } }, { status: 400 });
  }
  if (projection === "workbench_v1") {
    if (!isUnifiedPartRelationWorkbenchV1Enabled()) return NextResponse.json({ error: "part_relation_workbench_not_enabled" }, { status: 404 });
    const [workspaceView, workspaceUpdate, candidateSubmit, candidateReview, publish, manageRelations, managePermissions, viewerCapabilities] = await Promise.all([
      canUserUseNumberingActionAsync(auth.user, "numbering.workspace.view"),
      canUserUseNumberingActionAsync(auth.user, "numbering.workspace.update"),
      canUserUseNumberingActionAsync(auth.user, "numbering.candidate.review.submit"),
      canUserUseNumberingActionAsync(auth.user, "numbering.candidate.review.decide"),
      canUserUseNumberingActionAsync(auth.user, "numbering.publish"),
      canUserUseNumberingActionAsync(auth.user, "numbering.link_variant"),
      canUserUseNumberingActionAsync(auth.user, "settings.admin_matrix"),
      resolveHumanStatusRoleCapabilitiesAsync(auth.user)
    ]);
    const actor: RelationWorkbenchActor = {
      id: auth.user.id,
      companyId: companyResult.company.companyId,
      permissions: {
        workspaceView: workspaceView.allowed,
        workspaceUpdate: workspaceUpdate.allowed,
        candidateSubmit: candidateSubmit.allowed,
        candidateReview: candidateReview.allowed,
        publish: publish.allowed,
        manageRelations: manageRelations.allowed,
        managePermissions: managePermissions.allowed
      },
      viewerCapabilities
    };
    try {
      const result = await new RelationWorkbenchService().list(normalizeRelationWorkbenchQuery(url), actor);
      return NextResponse.json({ ...result, pdmCompany: companyResult.company }, { headers: { "cache-control": "private, no-store" } });
    } catch (error) {
      return relationWorkbenchErrorResponse(error);
    }
  }

  const entityType = normalizeEnum(url.searchParams.get("entityType"), entityTypes) as NumberingSearchEntityType | undefined;
  const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  const productSeries = url.searchParams.get("productSeries")?.trim() || undefined;
  const seriesCode = url.searchParams.get("seriesCode")?.trim() || undefined;
  const limit = Number(url.searchParams.get("limit") ?? 60);
  const humanStatus = normalizeHumanStatusFilter(url.searchParams.get("humanStatus"));
  const requestedLimit = normalizeLimit(limit, 60);
  const sortDirection = parseNumberSortDirection(url.searchParams.get("sortDirection"));

  const [matches, productSeriesOptions, seriesCodeOptions, viewerCapabilities, createRevisionPermission, workspaceViewPermission] = await Promise.all([
    searchNumberingRecordsAsync({
      companyId: companyResult.company.companyId,
      query: url.searchParams.get("query") ?? "",
      productSeries,
      seriesCode,
      entityType,
      recordStatus,
      sortDirection,
      limit: humanStatus === "all" ? requestedLimit : 100
    }),
    listProductSeriesOptionsAsync(companyResult.company.companyId),
    listSeriesCodeOptionsAsync(companyResult.company.companyId),
    resolveHumanStatusRoleCapabilitiesAsync(auth.user),
    canUserUseNumberingActionAsync(auth.user, "post_release_change"),
    canUserUseNumberingActionAsync(auth.user, "numbering.workspace.view")
  ]);
  const rootCodes = Array.from(new Set(matches.map((match) => match.rootCode)));
  const details = await new AsyncNumberingRepository(getAsyncDatabaseClient()).getNumberingRootDetailsByCodes(
    rootCodes,
    companyResult.company.companyId
  );
  const canonicalDrawingRecords = await listDrawingModuleRecordsByIdsAsync(
    details.flatMap((detail) => detail.drawingNumbers.map((drawing) => drawing.id)),
    companyResult.company.companyId
  );
  const projectionActor = relationDrawingProjectionActor(
    auth.user.id,
    companyResult.company.companyId,
    createRevisionPermission.allowed
  );
  const canonicalDrawingRows = new Map(
    canonicalDrawingRecords.map((drawing) => [drawing.id, projectDrawingWorkbenchRecord(drawing, projectionActor)])
  );
  const pendingCandidateWorkspaces = workspaceViewPermission.allowed && details.length > 0
    ? await new AsyncNumberStateFlowRepository(getAsyncDatabaseClient()).listWorkspaces({
        companyId: companyResult.company.companyId,
        lifecycleStatus: "active",
        sourceRootIds: details.map((detail) => detail.root.id),
        limit: 200
      })
    : [];
  const roots = details
    .map((detail) => mapRelationRoot(detail, viewerCapabilities, canonicalDrawingRows, pendingCandidateWorkspaces))
    .filter((root) => viewerStatusMatchesFilter(root.viewerStatus, root.humanStatus, humanStatus, root.availabilityScope))
    .sort((left, right) => compareNumberCodes(left.rootCode, right.rootCode, sortDirection) || left.rootId.localeCompare(right.rootId))
    .slice(0, requestedLimit);
  const summary = {
    rootCount: roots.length,
    manufacturingDrawingCount: roots.reduce((sum, root) => sum + root.drawings.filter((drawing) => drawing.isManufacturing).length, 0),
    referenceDrawingCount: roots.reduce((sum, root) => sum + root.drawings.filter((drawing) => drawing.isReferenceOnly).length, 0),
    partCount: roots.reduce((sum, root) => sum + root.parts.length, 0),
    blockerCount: roots.reduce((sum, root) => sum + root.blockers.length, 0)
  };

  return NextResponse.json({ roots, summary, productSeriesOptions, seriesCodeOptions, pdmCompany: companyResult.company }, {
    headers: { "cache-control": "private, no-store" }
  });
}

export async function POST(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.link_variant");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const operation = String(body.operation ?? "").trim() as MaintainDrawingPartRelationOperation;
  const drawingNumber = String(body.drawingNumber ?? body.drawing_number ?? "").trim();
  const partNumber = String(body.partNumber ?? body.part_number ?? "").trim();
  const errors: string[] = [];
  if (!relationOperations.has(operation)) errors.push("operation must be link, set_primary, set_reference, or remove");
  if (!drawingNumber) errors.push("drawingNumber is required");
  if (!partNumber) errors.push("partNumber is required");
  if (errors.length > 0) return NextResponse.json({ error: "Invalid drawing-part relation request", details: errors }, { status: 400 });

  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  try {
    const result = await maintainDrawingPartRelationAsync({
      companyId: companyResult.company.companyId,
      operation,
      drawingNumber,
      partNumber,
      actorId: auth.user.id
    });
    return NextResponse.json({ ...result, pdmCompany: companyResult.company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to maintain drawing-part relation";
    const status = message.includes("NOT_FOUND")
      ? 404
      : message.includes("MISMATCH") || message.includes("LOCKED")
        ? 409
        : message.includes("REQUIRED")
          ? 400
          : 422;
    return NextResponse.json({ error: message === "CANDIDATE_REVIEW_LOCKED" ? "PDM_REVIEW_LOCKED" : message }, { status });
  }
}

function mapRelationRoot(
  detail: NumberingRootDetailRecord,
  viewerCapabilities: HumanStatusRoleCapabilities,
  canonicalDrawingRows: Map<string, DrawingWorkbenchRow>,
  pendingCandidateWorkspaces: NumberingDraftWorkspaceRecord[]
) {
  const drawingById = new Map(detail.drawingNumbers.map((drawing) => [drawing.id, drawing]));
  const linksByDrawing = groupLinksBy(detail.links, "drawingNumberId");
  const linksByPart = groupLinksBy(detail.links, "partNumberId");
  const manufacturingDrawings = detail.drawingNumbers.filter((drawing) => isManufacturingDrawingPurpose(drawing.purposeCode));
  const blockers = buildRelationBlockers(detail, drawingById, linksByDrawing, linksByPart, manufacturingDrawings);
  const rootStatus = projectNumberingRootStatus(detail);
  const health = rootStatus.relationshipHealth;
  const humanStatus = rootStatus.humanStatus;
  const effectiveRecordStatus = projectEffectiveRelationRecordStatus(detail, health, rootStatus.blockerCount);
  const dependencyReleaseReady = manufacturingDrawings.length > 0
    && manufacturingDrawings.every((drawing) => drawing.recordStatus === "Released")
    && detail.partNumbers.every((part) => part.recordStatus === "Released");
  const availabilityScope = projectRelationRootAvailability({
    recordStatus: effectiveRecordStatus,
    relationshipHealth: health,
    blockerCount: rootStatus.blockerCount,
    dependencyReleaseReady
  });
  const drawings = detail.drawingNumbers.map((drawing) => mapRelationDrawing(
    drawing,
    linksByDrawing.get(drawing.id) ?? [],
    viewerCapabilities,
    canonicalDrawingRows.get(drawing.id)
  ));
  const parts = detail.partNumbers.map((part) => mapRelationPart(part, linksByPart.get(part.id) ?? [], drawingById, viewerCapabilities));
  const changeReviews = [
    ...detail.drawingNumbers.flatMap((drawing) => relationDrawingChangeReview(
      drawing,
      linksByDrawing.get(drawing.id) ?? [],
      canonicalDrawingRows.get(drawing.id),
      detail.partNumbers
    )),
    ...pendingCandidateWorkspaces
      .filter((workspace) => workspace.sourceRootId === detail.root.id)
      .flatMap((workspace) => relationCandidateChangeReview(workspace))
  ];
  return {
    rootId: detail.root.id,
    rootCode: detail.root.rootCode,
    coreName: detail.root.coreName,
    recordStatus: detail.root.recordStatus,
    relationshipHealth: health,
    relationshipLabel: relationshipHealthLabel(health),
    humanStatus,
    viewerStatus: projectRoleViewerHumanStatus(humanStatus, viewerCapabilities),
    availabilityScope,
    nextStep: relationNextStep(health, blockers),
    drawings,
    parts,
    matrix: buildRelationMatrix(detail.partNumbers, detail.drawingNumbers, detail.links, drawingById),
    blockers,
    changeReviews
  };
}

function mapRelationDrawing(
  drawing: DrawingNumberRecord,
  links: NumberingLinkRecord[],
  viewerCapabilities: HumanStatusRoleCapabilities,
  canonicalRow?: DrawingWorkbenchRow
) {
  const isManufacturing = isManufacturingDrawingPurpose(drawing.purposeCode);
  const isReferenceOnly = isReferenceDrawingPurpose(drawing.purposeCode);
  const fallbackHumanStatus = projectDrawingRecordHumanStatus(drawing);
  const humanStatus = canonicalRow?.humanStatus ?? fallbackHumanStatus;
  return {
    id: drawing.id,
    drawingNumber: drawing.drawingNumber,
    purposeCode: drawing.purposeCode,
    purposeLabel: isManufacturing ? "製造圖" : "參考圖",
    purposeText: `${drawing.purposeCode} ${displayDrawingPurposeLabel(drawing.purposeCode)}`,
    isManufacturing,
    isReferenceOnly,
    recordStatus: drawing.recordStatus,
    humanStatus,
    viewerStatus: canonicalRow?.viewerStatus ?? projectRoleViewerHumanStatus(fallbackHumanStatus, viewerCapabilities),
    // The relationship tree represents the effective master drawing. A
    // revision candidate may be in review, but it must not replace the
    // master drawing's current availability here.
    availabilityScope: projectDrawingRecordAvailability(drawing),
    linkedPartNumbers: links.map((link) => link.partNumber),
    nextStep: isReferenceOnly ? "參考圖不可作為製造基準" : links.length === 0 ? "未關聯料號" : drawing.recordStatus === "Draft" ? "送審前確認" : "製造基準關聯待狀態確認"
  };
}

function relationDrawingProjectionActor(userId: string, companyId: string, createRevision: boolean): DrawingWorkbenchActor {
  return {
    id: userId,
    companyId,
    permissions: {
      workspaceView: false,
      workspaceUpdate: false,
      candidateSubmit: false,
      candidateReview: false,
      publish: false,
      createRevision,
      draftUpdate: false,
      manageReferenceAttachments: false,
      managePermissions: false
    }
  };
}

function mapRelationPart(part: PartNumberRecord, links: NumberingLinkRecord[], drawingById: Map<string, DrawingNumberRecord>, viewerCapabilities: HumanStatusRoleCapabilities) {
  const hasManufacturingDrawing = links.some((link) => {
    const drawing = drawingById.get(link.drawingNumberId);
    return link.linkType === "primary_manufacturing" && Boolean(drawing && isManufacturingDrawingPurpose(drawing.purposeCode));
  });
  const primaryManufacturingLink = links.find((link) => {
    const drawing = drawingById.get(link.drawingNumberId);
    return link.linkType === "primary_manufacturing" && Boolean(drawing && isManufacturingDrawingPurpose(drawing.purposeCode));
  });
  const primaryDrawing = primaryManufacturingLink ? drawingById.get(primaryManufacturingLink.drawingNumberId) : null;
  const humanStatus = projectPartHumanStatus({ recordStatus: part.recordStatus, itemKind: part.itemKind, primaryDrawingNumber: hasManufacturingDrawing ? links[0]?.drawingNumber ?? "linked" : null, hasManufacturingDrawing });
  return {
    id: part.id,
    partNumber: part.partNumber,
    partName: part.partName,
    itemKind: part.itemKind,
    recordStatus: part.recordStatus,
    humanStatus,
    viewerStatus: projectRoleViewerHumanStatus(humanStatus, viewerCapabilities),
    availabilityScope: projectPartAvailability({
      recordStatus: part.recordStatus,
      itemKind: part.itemKind,
      primaryDrawingNumber: primaryDrawing?.drawingNumber ?? null,
      primaryDrawingRecordStatus: primaryDrawing?.recordStatus ?? null,
      hasManufacturingDrawing
    }),
    linkedDrawingNumbers: links.map((link) => link.drawingNumber),
    hasManufacturingDrawing
  };
}

function relationDrawingChangeReview(
  drawing: DrawingNumberRecord,
  links: NumberingLinkRecord[],
  canonicalRow: DrawingWorkbenchRow | undefined,
  parts: PartNumberRecord[]
): DrawingPartRelationChangeReview[] {
  const hasPendingRevision = canonicalRow?.stage === "revision_in_review" || canonicalRow?.stage === "correction_required" || (canonicalRow?.pendingApprovalCount ?? 0) > 0;
  if (!hasPendingRevision) return [];
  const statusLabel = canonicalRow?.stage === "correction_required" ? "新版次退回修改" : "新版次審查中";
  const linkedPartNumbers = [...new Set(links.map((link) => link.partNumber))];
  const partsByNumber = new Map(parts.map((part) => [part.partNumber, part]));
  const roleByPartNumber = new Map(
    links.map((link) => [link.partNumber, relationReviewRole(link.linkType, !isReferenceDrawingPurpose(drawing.purposeCode))])
  );
  const isReferenceOnly = isReferenceDrawingPurpose(drawing.purposeCode);
  return [{
    id: `drawing-review:${drawing.id}`,
    title: `圖號 ${drawing.drawingNumber} 的新版次變更`,
    statusLabel,
    summary: `這筆圖面變更尚未發布；目前仍使用現行圖號 ${drawing.drawingNumber} 與既有料號關係。`,
    drawings: [{
      id: drawing.id,
      drawingNumber: drawing.drawingNumber,
      purposeLabel: isReferenceOnly ? "參考圖" : "製造圖",
      isReferenceOnly,
      reviewAvailabilityLabel: canonicalRow?.stage === "correction_required"
        ? "退回修改：不可供生產使用"
        : "審查中：不可供生產使用",
      linkedPartNumbers,
      nextStep: isReferenceOnly ? "參考圖不可作為製造基準" : links.length === 0 ? "未關聯料號" : drawing.recordStatus === "Draft" ? "送審前確認" : "製造基準關聯待狀態確認"
    }],
    parts: linkedPartNumbers.map((partNumber) => {
      const part = partsByNumber.get(partNumber);
      const role = roleByPartNumber.get(partNumber) ?? "參考";
      return {
        id: part?.id ?? `review-part:${partNumber}`,
        partNumber,
        partName: part?.partName ?? "",
        role,
        roleByDrawing: { [drawing.drawingNumber]: role },
        hasManufacturingDrawing: role === "製造依據"
      };
    })
  }];
}

function relationCandidateChangeReview(workspace: NumberingDraftWorkspaceRecord): DrawingPartRelationChangeReview[] {
  const review = workspace.projection.review;
  if (!['in_review', 'needs_info', 'rejected'].includes(review)) return [];
  const drawingById = new Map(workspace.drawings.map((drawing) => [drawing.id, drawing]));
  const partById = new Map(workspace.parts.map((part) => [part.id, part]));
  const statusLabel = review === "in_review" ? "變更審查中" : review === "needs_info" ? "審查待補資料" : "審查退回修改";
  const modeLabel = workspace.draftMode === "append_part"
    ? "新增料號"
    : workspace.draftMode === "append_drawing"
      ? "新增圖號"
      : "圖料變更";
  const drawings = workspace.drawings.map((drawing) => {
    const linkedPartNumbers = workspace.relations
      .filter((relation) => relation.drawingDraftId === drawing.id)
      .map((relation) => partById.get(relation.partDraftId)?.candidateCode)
      .filter((code): code is string => Boolean(code));
    const isReferenceOnly = !isManufacturingDrawingPurpose(drawing.purposeCode);
    return {
      id: drawing.id,
      drawingNumber: drawing.candidateCode ?? "圖號",
      purposeLabel: isReferenceOnly ? "參考圖" as const : "製造圖" as const,
      isReferenceOnly,
      reviewAvailabilityLabel: review === "needs_info"
        ? "待補資料：不可供生產使用"
        : review === "rejected"
          ? "退回修改：不可供生產使用"
          : "審查中：不可供生產使用",
      linkedPartNumbers: [...new Set(linkedPartNumbers)],
      nextStep: statusLabel
    };
  });
  const parts = workspace.parts.map((part) => {
    const relations = workspace.relations.filter((relation) => relation.partDraftId === part.id);
    const roleByDrawing = Object.fromEntries(relations.map((relation) => [
      drawingById.get(relation.drawingDraftId)?.candidateCode ?? "圖號",
      relationReviewRole(relation.linkType, Boolean(drawingById.get(relation.drawingDraftId) && isManufacturingDrawingPurpose(drawingById.get(relation.drawingDraftId)?.purposeCode)))
    ]));
    const hasManufacturingDrawing = relations.some((relation) => {
      const drawing = drawingById.get(relation.drawingDraftId);
      return relation.linkType === "primary_manufacturing" && Boolean(drawing && isManufacturingDrawingPurpose(drawing.purposeCode));
    });
    return {
      id: part.id,
      partNumber: part.candidateCode ?? "料號",
      partName: part.partName,
      role: hasManufacturingDrawing ? "製造依據" : relations.some((relation) => {
        const drawing = drawingById.get(relation.drawingDraftId);
        return relation.linkType === "primary_manufacturing" && Boolean(drawing && !isManufacturingDrawingPurpose(drawing.purposeCode));
      }) ? "阻擋" : relations.length > 0 ? "參考" : "待建立製造依據",
      roleByDrawing,
      hasManufacturingDrawing
    };
  });
  const drawingNumbers = drawings.map((drawing) => drawing.drawingNumber);
  const partNumbers = parts.map((part) => part.partNumber);
  const drawingSummary = drawingNumbers.length > 0 ? `圖號 ${drawingNumbers.join("、")}` : "尚未產生圖號";
  const partSummary = partNumbers.length > 0 ? `料號 ${partNumbers.join("、")}` : "尚未產生料號";
  return [{
    id: `candidate-review:${workspace.id}`,
    title: `${modeLabel}申請`,
    statusLabel,
    summary: `${drawingSummary}、${partSummary} 尚未發布；目前主關係仍沿用現行資料。`,
    drawings,
    parts
  }];
}

function relationReviewRole(linkType: NumberingLinkRecord["linkType"], isManufacturingDrawing: boolean) {
  if (linkType === "primary_manufacturing" && isManufacturingDrawing) return "製造依據";
  if (linkType === "primary_manufacturing") return "阻擋";
  return "參考";
}

function buildRelationMatrix(
  parts: PartNumberRecord[],
  drawings: DrawingNumberRecord[],
  links: NumberingLinkRecord[],
  drawingById: Map<string, DrawingNumberRecord>
): DrawingPartRelationCell[] {
  const linkByPair = new Map(links.map((link) => [`${link.partNumberId}:${link.drawingNumberId}`, link]));
  const manufacturingDrawingIds = new Set(drawings.filter((drawing) => isManufacturingDrawingPurpose(drawing.purposeCode)).map((drawing) => drawing.id));
  const manufacturingDrawingCount = manufacturingDrawingIds.size;
  const partHasManufacturingDrawing = new Map(
    parts.map((part) => [
      part.id,
      links.some((link) => link.partNumberId === part.id && link.linkType === "primary_manufacturing" && manufacturingDrawingIds.has(link.drawingNumberId))
    ])
  );
  return parts.flatMap((part) =>
    drawings.map((drawing) => {
      const link = linkByPair.get(`${part.id}:${drawing.id}`);
      if (!link) {
        if (!isManufacturingDrawingPurpose(drawing.purposeCode)) {
          return { drawingNumber: drawing.drawingNumber, partNumber: part.partNumber, relationType: "not_applicable" };
        }
        if (!requiresManufacturingDrawing(part.itemKind) || partHasManufacturingDrawing.get(part.id)) {
          return { drawingNumber: drawing.drawingNumber, partNumber: part.partNumber, relationType: "not_applicable" };
        }
        return {
          drawingNumber: drawing.drawingNumber,
          partNumber: part.partNumber,
          relationType: manufacturingDrawingCount === 1 ? "required_missing" : "pending"
        };
      }
      const linkedDrawing = drawingById.get(link.drawingNumberId);
      if (link.linkType === "primary_manufacturing" && linkedDrawing && isManufacturingDrawingPurpose(linkedDrawing.purposeCode)) {
        return { drawingNumber: drawing.drawingNumber, partNumber: part.partNumber, relationType: "manufacturing_basis", isPrimary: true };
      }
      if (link.linkType === "primary_manufacturing") return { drawingNumber: drawing.drawingNumber, partNumber: part.partNumber, relationType: "blocked", isPrimary: true };
      return { drawingNumber: drawing.drawingNumber, partNumber: part.partNumber, relationType: "reference" };
    })
  );
}

function buildRelationBlockers(
  detail: NumberingRootDetailRecord,
  drawingById: Map<string, DrawingNumberRecord>,
  linksByDrawing: Map<string, NumberingLinkRecord[]>,
  linksByPart: Map<string, NumberingLinkRecord[]>,
  manufacturingDrawings: DrawingNumberRecord[]
): DrawingPartRelationBlocker[] {
  const blockers: DrawingPartRelationBlocker[] = [];
  if (detail.partNumbers.length === 0) {
    blockers.push({ code: "missing_part", message: "這個圖料根號尚未建立料號，不能判定圖料關係。", target: "root", targetId: detail.root.id });
  }
  if (manufacturingDrawings.length === 0) {
    blockers.push({ code: "missing_manufacturing_drawing", message: "這個圖料根號還沒有製造圖類別，不能建立製造基準關聯。", target: "root", targetId: detail.root.id });
  }
  for (const part of detail.partNumbers) {
    const links = linksByPart.get(part.id) ?? [];
    const manufacturingLinks = links.filter((link) => {
      const drawing = drawingById.get(link.drawingNumberId);
      return link.linkType === "primary_manufacturing" && Boolean(drawing && isManufacturingDrawingPurpose(drawing.purposeCode));
    });
    const hasManufacturing = manufacturingLinks.length > 0;
    if (manufacturingLinks.length > 1) {
      blockers.push({
        code: "ambiguous_primary",
        message: `料號 ${part.partNumber} 同時連到多張製造圖，請確認主要製造依據。`,
        target: "part",
        targetId: part.id
      });
    }
    if (!hasManufacturing && requiresManufacturingDrawing(part.itemKind)) {
      blockers.push({
        code: "part_without_manufacturing_drawing",
        message: `料號 ${part.partNumber} 尚未連到製造圖，請先建立圖料關係。`,
        target: "part",
        targetId: part.id
      });
    }
  }
  for (const drawing of detail.drawingNumbers) {
    const links = linksByDrawing.get(drawing.id) ?? [];
    if (links.length === 0) {
      blockers.push({
        code: "drawing_without_part",
        message: `圖號 ${drawing.drawingNumber} 尚未關聯料號。`,
        target: "drawing",
        targetId: drawing.id
      });
    }
  }
  for (const link of detail.links) {
    const drawing = drawingById.get(link.drawingNumberId);
    if (link.linkType === "primary_manufacturing" && (!drawing || !isManufacturingDrawingPurpose(drawing.purposeCode))) {
      blockers.push({
        code: "reference_only",
        message: `圖號 ${link.drawingNumber} 是參考圖，不可作為製造依據。`,
        target: "relationship",
        targetId: link.id
      });
    }
  }
  return blockers;
}

function requiresManufacturingDrawing(itemKind: string) {
  return ["manufactured", "outsourced", "custom"].includes(itemKind);
}

function relationNextStep(health: DrawingPartRelationHealth, blockers: DrawingPartRelationBlocker[]) {
  if (health === "complete") return { label: "製造基準關聯完整", severity: "ok" };
  if (health === "missing_part") return { label: "補料號", severity: "warning" };
  if (health === "missing_manufacturing_drawing") return { label: "補製造圖關聯", severity: "blocked" };
  if (health === "draft") return { label: blockers.length > 0 ? "先收斂缺口" : "完成送審前確認", severity: "info" };
  if (health === "ambiguous") return { label: "檢查主圖主料", severity: "blocked" };
  return { label: "需處理阻擋", severity: "blocked" };
}

function groupLinksBy(links: NumberingLinkRecord[], key: "drawingNumberId" | "partNumberId") {
  const groups = new Map<string, NumberingLinkRecord[]>();
  for (const link of links) {
    const list = groups.get(link[key]) ?? [];
    list.push(link);
    groups.set(link[key], list);
  }
  return groups;
}

function normalizeEnum(value: string | null, allowed: Set<string>) {
  const text = value?.trim();
  return text && allowed.has(text) ? text : undefined;
}

function normalizeLimit(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 1), 100) : fallback;
}
