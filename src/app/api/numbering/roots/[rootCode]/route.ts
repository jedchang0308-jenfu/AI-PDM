import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getNumberingRootDetailAsync } from "@/lib/numbering-async";
import { projectNumberingRootDetailHumanStatus } from "@/lib/drawing-part-relation-status";
import { projectPartHumanStatus } from "@/lib/part-human-status";
import { projectDrawingRecordHumanStatus } from "@/lib/drawing-workbench-status";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { projectRoleViewerHumanStatus } from "@/lib/human-status-projection";
import { resolveHumanStatusRoleCapabilitiesAsync } from "@/lib/numbering-human-status-viewer";
import { projectDrawingRecordAvailability, projectPartAvailability, projectRelationRootAvailability } from "@/lib/availability-scope";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;

  const { rootCode } = await params;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const detail = await getNumberingRootDetailAsync(decodeURIComponent(rootCode), companyResult.company.companyId);
  if (!detail) {
    return NextResponse.json({ error: "Numbering root not found" }, { status: 404 });
  }
  const viewerCapabilities = await resolveHumanStatusRoleCapabilitiesAsync(auth.user);
  const drawingById = new Map(detail.drawingNumbers.map((drawing) => [drawing.id, drawing]));
  const manufacturingDrawings = detail.drawingNumbers.filter((drawing) => ["M", "MA"].includes(drawing.purposeCode));
  const dependencyReleaseReady = manufacturingDrawings.length > 0
    && manufacturingDrawings.every((drawing) => drawing.recordStatus === "Released")
    && detail.partNumbers.every((part) => part.recordStatus === "Released");
  const drawingNumbers = detail.drawingNumbers.map((drawing) => {
    const humanStatus = projectDrawingRecordHumanStatus(drawing);
    return {
      ...drawing,
      humanStatus,
      viewerStatus: projectRoleViewerHumanStatus(humanStatus, viewerCapabilities),
      availabilityScope: projectDrawingRecordAvailability(drawing)
    };
  });
  const partNumbers = detail.partNumbers.map((part) => {
    const links = detail.links.filter((link) => link.partNumberId === part.id);
    const primaryDrawing = links.find((link) => link.linkType === "primary_manufacturing" && ["M", "MA"].includes(drawingById.get(link.drawingNumberId)?.purposeCode ?? ""));
    const humanStatus = projectPartHumanStatus({
      recordStatus: part.recordStatus,
      itemKind: part.itemKind,
      primaryDrawingNumber: primaryDrawing?.drawingNumber ?? null,
      hasManufacturingDrawing: Boolean(primaryDrawing)
    });
    return {
      ...part,
      humanStatus,
      viewerStatus: projectRoleViewerHumanStatus(humanStatus, viewerCapabilities),
      availabilityScope: projectPartAvailability({
        recordStatus: part.recordStatus,
        itemKind: part.itemKind,
        primaryDrawingNumber: primaryDrawing?.drawingNumber ?? null,
        primaryDrawingRecordStatus: primaryDrawing ? drawingById.get(primaryDrawing.id)?.recordStatus ?? null : null,
        hasManufacturingDrawing: Boolean(primaryDrawing)
      })
    };
  });
  const humanStatus = projectNumberingRootDetailHumanStatus(detail);
  const availabilityScope = projectRelationRootAvailability({
    recordStatus: detail.root.recordStatus,
    relationshipHealth: humanStatus.key === "relation_complete" ? "complete" : "blocked",
    blockerCount: detail.summary.warningCount,
    dependencyReleaseReady
  });
  return NextResponse.json({
    ...detail,
    humanStatus,
    viewerStatus: projectRoleViewerHumanStatus(humanStatus, viewerCapabilities),
    availabilityScope,
    drawingNumbers,
    partNumbers,
    pdmCompany: companyResult.company
  }, { headers: { "cache-control": "private, no-store" } });
}
