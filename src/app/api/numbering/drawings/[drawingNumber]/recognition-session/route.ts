import { NextResponse } from "next/server";
import { getLatestDrawingRecognitionForDrawing } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionRoles } from "@/lib/drawing-recognition-api";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import { drawingRecognitionClientStatus } from "@/lib/number-state-flow-feature";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ drawingNumber: string }> }) {
  try {
    const feature = drawingRecognitionClientStatus();
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.review" });
    if (access.response || !access.company || !access.actor) return access.response;
    const { drawingNumber } = await context.params;
    const session = await getLatestDrawingRecognitionForDrawing({ drawingNumber: decodeURIComponent(drawingNumber).trim().slice(0, 200), companyId: access.company.companyId, actorId: access.actor.pdmUserId, roles: recognitionRoles(access) });
    return NextResponse.json({ session, feature }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return recognitionErrorResponse(error, "drawings.latest-recognition");
  }
}
