import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { previewAppendNumbersAsync } from "@/lib/numbering-preview";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getNumberingRootDetailAsync } from "@/lib/numbering-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { consensusStoredPartStructureType } from "@/lib/numbering-structure-type";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;

  const { rootCode } = await params;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const detail = await getNumberingRootDetailAsync(decodeURIComponent(rootCode), companyResult.company.companyId);
  if (!detail) return NextResponse.json({ error: "PART_ROOT_NOT_FOUND" }, { status: 404 });

  const client = getAsyncDatabaseClient();
  const [manufacturingPreview, referencePreview] = await Promise.all([
    previewAppendNumbersAsync(client, companyResult.company.companyId, detail.root.rootCode, "M"),
    previewAppendNumbersAsync(client, companyResult.company.companyId, detail.root.rootCode, "R")
  ]);
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
    pdmCompany: companyResult.company
  });
}
