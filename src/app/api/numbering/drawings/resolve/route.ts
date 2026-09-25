import { NextResponse } from "next/server";
import { requireNumberingCompanyPermissionAsync } from "@/lib/numbering-company-permission";
import { resolveDrawingRevisionContext } from "@/lib/drawing-revision-workbench";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const input = {
    drawingNumberId: url.searchParams.get("drawingNumberId") ?? url.searchParams.get("drawing_number_id"),
    drawingNumber: url.searchParams.get("drawingNumber") ?? url.searchParams.get("drawing_number"),
    partNumber: url.searchParams.get("partNumber") ?? url.searchParams.get("part_number"),
    workflowIntent:
      url.searchParams.get("workflowIntent") ??
      url.searchParams.get("workflow_intent") ??
      url.searchParams.get("lifecycleStage"),
    query: url.searchParams.get("query"),
    limit: Number(url.searchParams.get("limit") ?? 8)
  };

  const principalResponse = await withPrincipalNumberingCompanyRead(request, "numbering.drawings.view",
    async (snapshot, company) => NextResponse.json({
      ...await resolveDrawingRevisionContext({ ...input, companyId: company.companyId }, snapshot),
      pdmCompany: company
    }));
  if (principalResponse) return principalResponse;

  const auth = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.drawings.view");
  if (auth.response) return auth.response;
  const result = await resolveDrawingRevisionContext({ ...input, companyId: auth.company.companyId });

  return NextResponse.json({ ...result, pdmCompany: auth.company });
}
