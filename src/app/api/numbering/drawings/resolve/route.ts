import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { resolveDrawingRevisionContext } from "@/lib/drawing-revision-workbench";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireNumberingPageAsync(request, "numbering.drawings.view");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const result = await resolveDrawingRevisionContext({
    companyId: companyResult.company.companyId,
    drawingNumberId: url.searchParams.get("drawingNumberId") ?? url.searchParams.get("drawing_number_id"),
    drawingNumber: url.searchParams.get("drawingNumber") ?? url.searchParams.get("drawing_number"),
    partNumber: url.searchParams.get("partNumber") ?? url.searchParams.get("part_number"),
    query: url.searchParams.get("query"),
    limit: Number(url.searchParams.get("limit") ?? 8)
  });

  return NextResponse.json({ ...result, pdmCompany: companyResult.company });
}
