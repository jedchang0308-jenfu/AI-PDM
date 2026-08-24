import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { previewAppendNumbersAsync } from "@/lib/numbering-preview";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getNumberingRootDetailAsync } from "@/lib/numbering-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

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
  const inheritedPart = detail.partNumbers[0]
    ? {
        itemKind: detail.partNumbers[0].itemKind,
        structureType: detail.partNumbers[0].structureType,
        isUniversal: detail.partNumbers[0].isUniversal,
        seriesCode: detail.partNumbers[0].seriesCode,
        customSpecification: detail.partNumbers[0].customSpecification
      }
    : {
        itemKind: detail.root.itemKind,
        structureType: "single_part",
        isUniversal: false,
        seriesCode: null,
        customSpecification: null
      };

  return NextResponse.json({
    root: detail.root,
    inheritedPart,
    counts: detail.summary,
    locked,
    profileBlocked: inheritedPart.structureType === "unclassified",
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
