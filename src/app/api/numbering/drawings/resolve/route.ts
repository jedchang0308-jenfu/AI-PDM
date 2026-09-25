import { NextResponse } from "next/server";
import { requireNumberingCompanyPermissionAsync } from "@/lib/numbering-company-permission";
import { resolveDrawingRevisionContext } from "@/lib/drawing-revision-workbench";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.drawings.view");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const result = await resolveDrawingRevisionContext({
    companyId: auth.company.companyId,
    drawingNumberId: url.searchParams.get("drawingNumberId") ?? url.searchParams.get("drawing_number_id"),
    drawingNumber: url.searchParams.get("drawingNumber") ?? url.searchParams.get("drawing_number"),
    partNumber: url.searchParams.get("partNumber") ?? url.searchParams.get("part_number"),
    workflowIntent:
      url.searchParams.get("workflowIntent") ??
      url.searchParams.get("workflow_intent") ??
      url.searchParams.get("lifecycleStage"),
    query: url.searchParams.get("query"),
    limit: Number(url.searchParams.get("limit") ?? 8)
  });

  return NextResponse.json({ ...result, pdmCompany: auth.company });
}
