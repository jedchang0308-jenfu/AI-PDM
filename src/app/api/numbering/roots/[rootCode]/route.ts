import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getNumberingRootDetailAsync } from "@/lib/numbering-async";
import { projectEffectiveRelationRecordStatus, projectNumberingRootStatus } from "@/lib/drawing-part-relation-status";
import { projectPartHumanStatus } from "@/lib/part-human-status";
import { projectDrawingRecordHumanStatus } from "@/lib/drawing-record-status";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { projectRoleResponsibilityStatusPair } from "@/lib/responsibility-status-projection";
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
      ...projectRoleResponsibilityStatusPair({
        status: humanStatus,
        actorId: auth.user.id,
        capabilities: viewerCapabilities,
        href: `/numbering/search?detail=${encodeURIComponent(`drawing:${drawing.id}`)}`
      }),
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
      ...projectRoleResponsibilityStatusPair({
        status: humanStatus,
        actorId: auth.user.id,
        capabilities: viewerCapabilities,
        href: `/numbering/search?detail=${encodeURIComponent(`part:${part.id}`)}`
      }),
      availabilityScope: projectPartAvailability({
        recordStatus: part.recordStatus,
        itemKind: part.itemKind,
        primaryDrawingNumber: primaryDrawing?.drawingNumber ?? null,
        primaryDrawingRecordStatus: primaryDrawing ? drawingById.get(primaryDrawing.id)?.recordStatus ?? null : null,
        hasManufacturingDrawing: Boolean(primaryDrawing)
      })
    };
  });
  const rootStatus = projectNumberingRootStatus(detail);
  const humanStatus = rootStatus.humanStatus;
  const availabilityScope = projectRelationRootAvailability({
    recordStatus: projectEffectiveRelationRecordStatus(detail, rootStatus.relationshipHealth, rootStatus.blockerCount),
    relationshipHealth: rootStatus.relationshipHealth,
    blockerCount: rootStatus.blockerCount,
    dependencyReleaseReady
  });
  return NextResponse.json({
    ...detail,
    humanStatus,
    ...projectRoleResponsibilityStatusPair({
      status: humanStatus,
      actorId: auth.user.id,
      capabilities: viewerCapabilities,
      href: `/numbering/search?detail=${encodeURIComponent(`root:${detail.root.id}`)}`
    }),
    availabilityScope,
    drawingNumbers,
    partNumbers,
    pdmCompany: companyResult.company
  }, { headers: { "cache-control": "private, no-store" } });
}
