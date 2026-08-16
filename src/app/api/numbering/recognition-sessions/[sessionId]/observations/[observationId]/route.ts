import { NextResponse } from "next/server";
import { getDrawingRecognitionObservation } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionRoles } from "@/lib/drawing-recognition-api";
import { requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ sessionId: string; observationId: string }> }) {
  try {
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.review" });
    if (access.response || !access.company || !access.actor) return access.response;
    const params = await context.params;
    const observation = await getDrawingRecognitionObservation({ sessionId: requireSafeRecognitionId(params.sessionId, "RECOGNITION_SESSION_ID_INVALID"), observationId: requireSafeRecognitionId(params.observationId, "RECOGNITION_OBSERVATION_ID_INVALID"), companyId: access.company.companyId, actorId: access.actor.pdmUserId, roles: recognitionRoles(access) });
    return NextResponse.json({ observation }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-sessions.observation");
  }
}
