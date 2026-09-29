import { NextResponse } from "next/server";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { previewAppendNumbersAsync } from "@/lib/numbering-preview";
import { consensusStoredPartStructureType } from "@/lib/numbering-structure-type";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import type { PdmCompanyContext } from "@/lib/company-context";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  if (!principalSessionTokenFromRequest(request)) return NextResponse.json({ code: "auth_session_invalid" },
    { status: 401, headers: { "cache-control": "no-store" } });
  return (await withPrincipalNumberingCompanyRead(request, "numbering.search",
    (snapshot, company) => appendPolicyResponse(params, snapshot, company))) ??
    NextResponse.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
}

async function appendPolicyResponse(params: Promise<{ rootCode: string }>, client: AsyncDatabaseClient,
  company: PdmCompanyContext) {
  const { rootCode } = await params;
  const detail = await new AsyncNumberingRepository(client)
    .getNumberingRootDetail(decodeURIComponent(rootCode), company.companyId);

  if (!detail) return NextResponse.json({ error: "PART_ROOT_NOT_FOUND" }, { status: 404 });

  // A principal request uses one transaction-bound client for authorization,
  // root detail and both previews. Query it sequentially.
  const manufacturingPreview = await previewAppendNumbersAsync(client, company.companyId, detail.root.rootCode, "M");
  const referencePreview = await previewAppendNumbersAsync(client, company.companyId, detail.root.rootCode, "R");
  const reasonRequired = [detail.root.recordStatus, ...detail.partNumbers.map((part) => part.recordStatus), ...detail.drawingNumbers.map((drawing) => drawing.recordStatus)].some(
    (status) => status === "Active" || status === "Released" || status === "MainDrawingInvalid"
  );
  const locked = ["Obsolete", "Merged"].includes(detail.root.recordStatus);
  const currentParts = detail.partNumbers.filter((part) => !["Obsolete", "Merged"].includes(part.recordStatus));
  const firstPart = currentParts[0];
  const structureType = consensusStoredPartStructureType(currentParts.map((part) => part.structureType));
  const inheritedPart = firstPart
    ? { itemKind: firstPart.itemKind, structureType, isUniversal: firstPart.isUniversal, seriesCode: firstPart.seriesCode, customSpecification: firstPart.customSpecification }
    : { itemKind: detail.root.itemKind, structureType: "unclassified" as const, isUniversal: false, seriesCode: null, customSpecification: null };

  return NextResponse.json({
    root: detail.root,
    inheritedPart,
    counts: detail.summary,
    locked,
    profileBlocked: false,
    reasonRequired,
    nextNumbers: {
      part: manufacturingPreview.part,
      drawingM: manufacturingPreview.drawing,
      drawingR: referencePreview.drawing
    },
    drawings: detail.drawingNumbers.map((drawing) => ({
      id: drawing.id,
      drawingNumber: drawing.drawingNumber,
      purposeCode: drawing.purposeCode,
      recordStatus: drawing.recordStatus
    })),
    pdmCompany: company
  }, { headers: { "cache-control": "private, no-store" } });
}
