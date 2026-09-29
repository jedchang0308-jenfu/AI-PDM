import { NextResponse } from "next/server";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { resolveDrawingRevisionContext } from "@/lib/drawing-revision-workbench";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!principalSessionTokenFromRequest(request)) return NextResponse.json({ code: "auth_session_invalid" },
    { status: 401, headers: { "cache-control": "no-store" } });
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
    }, { headers: { "cache-control": "private, no-store" } }));
  return principalResponse ?? NextResponse.json({ code: "principal_authorization_unavailable" },
    { status: 503, headers: { "cache-control": "no-store" } });
}
