import { NextResponse } from "next/server";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { resolveJenfuRoutePolicyFromRequest } from "@/lib/jenfu-route-permission-map";
import { CanonicalDrawingHistoryError, readCanonicalDrawingHistoryRevision } from "@/lib/pdm-canonical-drawing-history";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ drawingNumber: string; revisionId: string }> }) {
  const policy = resolveJenfuRoutePolicyFromRequest(request, "numbering.drawings.view");
  if (policy?.path !== "src/app/api/numbering/drawings/[drawingNumber]/history/[revisionId]/route.ts" ||
      policy.authorizationMode !== "permission" || policy.scopeResolver !== "workspace") {
    return NextResponse.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  const { drawingNumber, revisionId } = await params;
  return await withPrincipalNumberingCompanyRead(request, "numbering.drawings.view",
    (snapshot, company) => readHistory(snapshot, company.companyId, drawingNumber, revisionId))
    ?? NextResponse.json({ code: "auth_session_invalid" },
      { status: 401, headers: { "cache-control": "no-store" } });
}

async function readHistory(client: AsyncDatabaseClient, companyId: string,
  drawingNumber: string, revisionId: string) {
  try {
    return NextResponse.json(await readCanonicalDrawingHistoryRevision({
      client, companyId, drawingId: drawingNumber, revisionId
    }), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof CanonicalDrawingHistoryError) {
      const status = error.code === "HISTORY_DRAWING_NOT_FOUND" || error.code === "HISTORY_REVISION_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    return NextResponse.json({ error: "HISTORY_READ_FAILED" }, { status: 500 });
  }
}
