import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getNumberingRootDetailAsync, listDrawingModuleRecordsByIdsAsync, listProductSeriesOptionsAsync, listSeriesCodeOptionsAsync, maintainDrawingPartRelationAsync, searchNumberingRecordsAsync } from "@/lib/numbering-async";
import { displayDrawingPurposeLabel, isManufacturingDrawingPurpose, isReferenceDrawingPurpose } from "@/lib/numbering-identity";
import { projectNumberingRootStatus } from "@/lib/drawing-part-relation-status";
import { projectPartHumanStatus } from "@/lib/part-human-status";
import { projectDrawingRecordHumanStatus } from "@/lib/drawing-workbench-status";
import { projectDrawingWorkbenchRecord, type DrawingWorkbenchActor, type DrawingWorkbenchRow } from "@/lib/drawing-workbench";
import { normalizeHumanStatusFilter, projectRoleViewerHumanStatus, viewerStatusMatchesFilter, type HumanStatusRoleCapabilities } from "@/lib/human-status-projection";
import { canUserUseNumberingActionAsync, requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { resolveHumanStatusRoleCapabilitiesAsync } from "@/lib/numbering-human-status-viewer";
import { projectDrawingRecordAvailability, projectPartAvailability, projectRelationRootAvailability } from "@/lib/availability-scope";
import type {
  DrawingNumberRecord,
  MaintainDrawingPartRelationOperation,
  NumberingLinkRecord,
  NumberingRecordStatus,
  NumberingRootDetailRecord,
  NumberingSearchEntityType,
  PartNumberRecord
} from "@/lib/repositories/numbering-repository";

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

export async function GET(request: Request) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const entityType = normalizeEnum(url.searchParams.get("entityType"), entityTypes) as NumberingSearchEntityType | undefined;
  const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  const productSeries = url.searchParams.get("productSeries")?.trim() || undefined;
  const seriesCode = url.searchParams.get("seriesCode")?.trim() || undefined;
  const limit = Number(url.searchParams.get("limit") ?? 60);
  const humanStatus = normalizeHumanStatusFilter(url.searchParams.get("humanStatus"));
  const requestedLimit = normalizeLimit(limit, 60);

  const [matches, productSeriesOptions, seriesCodeOptions, viewerCapabilities, createRevisionPermission] = await Promise.all([
    searchNumberingRecordsAsync({
      companyId: companyResult.company.companyId,
      query: url.searchParams.get("query") ?? "",
      productSeries,
      seriesCode,
      entityType,
      recordStatus,
      limit: humanStatus === "all" ? requestedLimit : 100
    }),
    listProductSeriesOptionsAsync(companyResult.company.companyId),
    listSeriesCodeOptionsAsync(companyResult.company.companyId),
    resolveHumanStatusRoleCapabilitiesAsync(auth.user),
    canUserUseNumberingActionAsync(auth.user, "post_release_change")
  ]);
  const rootCodes = Array.from(new Set(matches.map((match) => match.rootCode)));
  const details = (
    await Promise.all(rootCodes.map((rootCode) => getNumberingRootDetailAsync(rootCode, companyResult.company.companyId)))
  ).filter((detail): detail is NumberingRootDetailRecord => Boolean(detail));
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
  const roots = details
    .map((detail) => mapRelationRoot(detail, viewerCapabilities, canonicalDrawingRows))
    .filter((root) => viewerStatusMatchesFilter(root.viewerStatus, root.humanStatus, humanStatus))
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
    return NextResponse.json({ error: message }, { status });
  }
}

function mapRelationRoot(
  detail: NumberingRootDetailRecord,
  viewerCapabilities: HumanStatusRoleCapabilities,
  canonicalDrawingRows: Map<string, DrawingWorkbenchRow>
) {
  const drawingById = new Map(detail.drawingNumbers.map((drawing) => [drawing.id, drawing]));
  const linksByDrawing = groupLinksBy(detail.links, "drawingNumberId");
  const linksByPart = groupLinksBy(detail.links, "partNumberId");
  const manufacturingDrawings = detail.drawingNumbers.filter((drawing) => isManufacturingDrawingPurpose(drawing.purposeCode));
  const blockers = buildRelationBlockers(detail, drawingById, linksByDrawing, linksByPart, manufacturingDrawings);
  const rootStatus = projectNumberingRootStatus(detail);
  const health = rootStatus.relationshipHealth;
  const humanStatus = rootStatus.humanStatus;
  const dependencyReleaseReady = manufacturingDrawings.length > 0
    && manufacturingDrawings.every((drawing) => drawing.recordStatus === "Released")
    && detail.partNumbers.every((part) => part.recordStatus === "Released");
  const availabilityScope = projectRelationRootAvailability({
    recordStatus: detail.root.recordStatus,
    relationshipHealth: health,
    blockerCount: rootStatus.blockerCount,
    dependencyReleaseReady
  });
  return {
    rootId: detail.root.id,
    rootCode: detail.root.rootCode,
    coreName: detail.root.coreName,
    recordStatus: detail.root.recordStatus,
    relationshipHealth: health,
    humanStatus,
    viewerStatus: projectRoleViewerHumanStatus(humanStatus, viewerCapabilities),
    availabilityScope,
    nextStep: relationNextStep(health, blockers),
    drawings: detail.drawingNumbers.map((drawing) => mapRelationDrawing(
      drawing,
      linksByDrawing.get(drawing.id) ?? [],
      viewerCapabilities,
      canonicalDrawingRows.get(drawing.id)
    )),
    parts: detail.partNumbers.map((part) => mapRelationPart(part, linksByPart.get(part.id) ?? [], drawingById, viewerCapabilities)),
    matrix: buildRelationMatrix(detail.partNumbers, detail.drawingNumbers, detail.links, drawingById),
    blockers
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
    availabilityScope: canonicalRow?.availabilityScope ?? projectDrawingRecordAvailability(drawing),
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
    blockers.push({ code: "missing_part", message: "這個主根號尚未建立料號，不能判定圖料關係。", target: "root", targetId: detail.root.id });
  }
  if (manufacturingDrawings.length === 0) {
    blockers.push({ code: "missing_manufacturing_drawing", message: "這個主根號還沒有製造圖類別，不能建立製造基準關聯。", target: "root", targetId: detail.root.id });
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
