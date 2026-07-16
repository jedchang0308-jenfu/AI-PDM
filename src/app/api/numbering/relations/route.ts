import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getNumberingRootDetailAsync, listProductSeriesOptionsAsync, maintainDrawingPartRelationAsync, searchNumberingRecordsAsync } from "@/lib/numbering-async";
import { displayDrawingPurposeLabel, isManufacturingDrawingPurpose, isReferenceDrawingPurpose } from "@/lib/numbering-identity";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import type {
  DrawingNumberRecord,
  MaintainDrawingPartRelationOperation,
  NumberingLinkRecord,
  NumberingPhase,
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
  "EVTDisabled",
  "PendingAdminConfirm",
  "MainDrawingInvalid"
]);
const phases = new Set(["EVT", "DVT", "PVT", "Release", "ECR"]);
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
  const developmentPhase = normalizeEnum(url.searchParams.get("developmentPhase"), phases) as NumberingPhase | undefined;
  const productSeries = url.searchParams.get("productSeries")?.trim() || undefined;
  const limit = Number(url.searchParams.get("limit") ?? 60);

  const [matches, productSeriesOptions] = await Promise.all([
    searchNumberingRecordsAsync({
      companyId: companyResult.company.companyId,
      query: url.searchParams.get("query") ?? "",
      productSeries,
      entityType,
      recordStatus,
      developmentPhase,
      limit: Math.min(Math.max(Number.isFinite(limit) ? Math.floor(limit) : 60, 1), 100)
    }),
    listProductSeriesOptionsAsync(companyResult.company.companyId)
  ]);
  const rootCodes = Array.from(new Set(matches.map((match) => match.rootCode))).slice(0, 60);
  const details = (
    await Promise.all(rootCodes.map((rootCode) => getNumberingRootDetailAsync(rootCode, companyResult.company.companyId)))
  ).filter((detail): detail is NumberingRootDetailRecord => Boolean(detail));
  const roots = details.map(mapRelationRoot);
  const summary = {
    rootCount: roots.length,
    manufacturingDrawingCount: roots.reduce((sum, root) => sum + root.drawings.filter((drawing) => drawing.isManufacturing).length, 0),
    referenceDrawingCount: roots.reduce((sum, root) => sum + root.drawings.filter((drawing) => drawing.isReferenceOnly).length, 0),
    partCount: roots.reduce((sum, root) => sum + root.parts.length, 0),
    blockerCount: roots.reduce((sum, root) => sum + root.blockers.length, 0)
  };

  return NextResponse.json({ roots, summary, productSeriesOptions, pdmCompany: companyResult.company });
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

function mapRelationRoot(detail: NumberingRootDetailRecord) {
  const drawingById = new Map(detail.drawingNumbers.map((drawing) => [drawing.id, drawing]));
  const linksByDrawing = groupLinksBy(detail.links, "drawingNumberId");
  const linksByPart = groupLinksBy(detail.links, "partNumberId");
  const manufacturingDrawings = detail.drawingNumbers.filter((drawing) => isManufacturingDrawingPurpose(drawing.purposeCode));
  const blockers = buildRelationBlockers(detail, drawingById, linksByDrawing, linksByPart, manufacturingDrawings);
  const health = relationshipHealth(detail, blockers, manufacturingDrawings);
  return {
    rootId: detail.root.id,
    rootCode: detail.root.rootCode,
    coreName: detail.root.coreName,
    recordStatus: detail.root.recordStatus,
    developmentPhase: detail.root.developmentPhase,
    relationshipHealth: health,
    nextStep: relationNextStep(health, blockers),
    drawings: detail.drawingNumbers.map((drawing) => mapRelationDrawing(drawing, linksByDrawing.get(drawing.id) ?? [])),
    parts: detail.partNumbers.map((part) => mapRelationPart(part, linksByPart.get(part.id) ?? [], drawingById)),
    matrix: buildRelationMatrix(detail.partNumbers, detail.drawingNumbers, detail.links, drawingById),
    blockers
  };
}

function mapRelationDrawing(drawing: DrawingNumberRecord, links: NumberingLinkRecord[]) {
  const isManufacturing = isManufacturingDrawingPurpose(drawing.purposeCode);
  const isReferenceOnly = isReferenceDrawingPurpose(drawing.purposeCode);
  return {
    id: drawing.id,
    drawingNumber: drawing.drawingNumber,
    purposeCode: drawing.purposeCode,
    purposeLabel: isManufacturing ? "製造圖" : "參考圖",
    purposeText: `${drawing.purposeCode} ${displayDrawingPurposeLabel(drawing.purposeCode)}`,
    isManufacturing,
    isReferenceOnly,
    recordStatus: drawing.recordStatus,
    developmentPhase: drawing.developmentPhase,
    linkedPartNumbers: links.map((link) => link.partNumber),
    nextStep: isReferenceOnly ? "參考圖不可作為製造基準" : links.length === 0 ? "未關聯料號" : drawing.recordStatus === "Draft" ? "送審前確認" : "製造基準關聯待狀態確認"
  };
}

function mapRelationPart(part: PartNumberRecord, links: NumberingLinkRecord[], drawingById: Map<string, DrawingNumberRecord>) {
  const hasManufacturingDrawing = links.some((link) => {
    const drawing = drawingById.get(link.drawingNumberId);
    return link.linkType === "primary_manufacturing" && Boolean(drawing && isManufacturingDrawingPurpose(drawing.purposeCode));
  });
  return {
    id: part.id,
    partNumber: part.partNumber,
    partName: part.partName,
    itemKind: part.itemKind,
    recordStatus: part.recordStatus,
    developmentPhase: part.developmentPhase,
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

function relationshipHealth(
  detail: NumberingRootDetailRecord,
  blockers: DrawingPartRelationBlocker[],
  manufacturingDrawings: DrawingNumberRecord[]
): DrawingPartRelationHealth {
  if (["Obsolete", "Merged", "EVTDisabled", "MainDrawingInvalid"].includes(detail.root.recordStatus)) return "blocked";
  if (detail.partNumbers.length === 0) return "missing_part";
  if (manufacturingDrawings.length === 0 || blockers.some((blocker) => blocker.code === "part_without_manufacturing_drawing")) return "missing_manufacturing_drawing";
  if (blockers.some((blocker) => blocker.code === "reference_only")) return "blocked";
  if (blockers.some((blocker) => blocker.code === "ambiguous_primary")) return "ambiguous";
  if (detail.root.recordStatus === "Draft" || detail.root.recordStatus === "NeedInfo") return "draft";
  return "complete";
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
