import { NextResponse } from "next/server";
import { projectEffectiveRelationRecordStatus, projectNumberingRootStatus } from "@/lib/drawing-part-relation-status";
import { projectPartHumanStatus } from "@/lib/part-human-status";
import { projectDrawingRecordHumanStatus } from "@/lib/drawing-record-status";
import { projectRoleResponsibilityStatusPair } from "@/lib/responsibility-status-projection";
import { projectDrawingRecordAvailability, projectPartAvailability, projectRelationRootAvailability } from "@/lib/availability-scope";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  if (!principalSessionTokenFromRequest(request)) return NextResponse.json({ code: "auth_session_invalid" },
    { status: 401, headers: { "cache-control": "no-store" } });
  return (await withPrincipalNumberingCompanyRead(request, "numbering.search",
    async (snapshot, company, verified) => {
      const { rootCode } = await params;
      const detail = await new AsyncNumberingRepository(snapshot)
        .getNumberingRootDetail(decodeURIComponent(rootCode), company.companyId);
      if (!detail) return NextResponse.json({ error: "Numbering root not found" }, { status: 404 });
      const capabilities = [
        "numbering.draft.update", "numbering.link_variant", "approval.request.decide",
        "numbering.publish", "numbering.candidate.review.submit"
      ];
      const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
        capabilities.map((permissionCode) => ({ permissionKind: "action" as const, permissionCode })));
      if (decisions.length !== capabilities.length || decisions.some((decision, index) =>
        decision.principalId !== verified.session.principalId ||
        decision.permissionCode !== capabilities[index])) {
        throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
      }
      const viewerCapabilities = {
        canEdit: decisions[0].allowed,
        canManageRelations: decisions[1].allowed,
        canReview: decisions[2].allowed,
        canPublish: decisions[3].allowed,
        // The old unscoped restore code is absent from the published catalog.
        canRestoreMainDrawing: false,
        canSubmit: decisions[4].allowed
      };
      const actorId = verified.profile.pdmUserId;
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
        actorId,
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
        actorId,
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
      actorId,
      capabilities: viewerCapabilities,
      href: `/numbering/search?detail=${encodeURIComponent(`root:${detail.root.id}`)}`
    }),
    availabilityScope,
    drawingNumbers,
    partNumbers,
    pdmCompany: company
  }, { headers: { "cache-control": "private, no-store" } });
    })) ?? NextResponse.json({ code: "principal_authorization_unavailable" },
    { status: 503, headers: { "cache-control": "no-store" } });
}
