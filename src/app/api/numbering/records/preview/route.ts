import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { previewNewBundleNumbersAsync } from "@/lib/numbering-preview";
import type { NumberPreviewPurposeCode } from "@/lib/numbering-preview";
import { parseNumberingStructureType } from "@/lib/numbering-structure-type";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.create");
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const content = url.searchParams.get("content") === "drawing_part" ? "drawing_part" : url.searchParams.get("content") === "part" ? "part" : "";
  const purpose = url.searchParams.get("purposeCode");
  const purposeCode: NumberPreviewPurposeCode = purpose === "R" ? "R" : "M";
  const structureType = parseNumberingStructureType(url.searchParams.get("structureType"));
  if (!content) return NextResponse.json({ error: "content must be part or drawing_part" }, { status: 400 });
  if (!structureType) return NextResponse.json({ error: "structureType is required" }, { status: 422 });
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;
  try {
    const result = await previewNewBundleNumbersAsync(getAsyncDatabaseClient(), companyResult.company.companyId, purposeCode);
    return NextResponse.json({
      estimated: true,
      observedAt: new Date().toISOString(),
      content,
      structureType,
      purposeCode: content === "part" ? null : purposeCode,
      nextNumbers: {
        root: result.root,
        part: result.part,
        drawing: content === "part" ? null : result.drawing,
      },
      pdmCompany: companyResult.company,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to preview numbering";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
