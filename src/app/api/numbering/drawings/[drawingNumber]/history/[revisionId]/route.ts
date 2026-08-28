import { NextResponse } from "next/server";
import { CanonicalDrawingHistoryError, readCanonicalDrawingHistoryRevision } from "@/lib/pdm-canonical-drawing-history";
import { resolveDev087RouteActor } from "@/lib/pdm-dev087-route";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ drawingNumber: string; revisionId: string }> }) {
  const access = await resolveDev087RouteActor(request, "numbering.drawings.view");
  if (access.response || !access.actor) return access.response;
  const { drawingNumber, revisionId } = await params;
  try {
    return NextResponse.json(await readCanonicalDrawingHistoryRevision({ companyId: access.actor.companyId, drawingId: drawingNumber, revisionId }), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof CanonicalDrawingHistoryError) {
      const status = error.code === "HISTORY_DRAWING_NOT_FOUND" || error.code === "HISTORY_REVISION_NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ error: error.code, message: error.message }, { status });
    }
    return NextResponse.json({ error: "HISTORY_READ_FAILED" }, { status: 500 });
  }
}
