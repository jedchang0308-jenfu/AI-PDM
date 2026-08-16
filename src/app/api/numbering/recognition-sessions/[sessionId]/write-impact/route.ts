import { NextResponse } from "next/server";
import { calculateDrawingRecognitionImpact } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionJsonBody, recognitionRoles } from "@/lib/drawing-recognition-api";
import { DrawingRecognitionError, requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const body = await recognitionJsonBody(request);
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.formalize", body });
    if (access.response || !access.company || !access.actor) return access.response;
    const expectedRowVersion = Number(body.expectedRowVersion ?? body.expected_row_version);
    if (!Number.isInteger(expectedRowVersion) || expectedRowVersion < 1) throw new DrawingRecognitionError("RECOGNITION_ROW_VERSION_REQUIRED", "缺少目前內容版本。", 400);
    const { sessionId } = await context.params;
    const impact = await calculateDrawingRecognitionImpact({ sessionId: requireSafeRecognitionId(sessionId, "RECOGNITION_SESSION_ID_INVALID"), companyId: access.company.companyId, actorId: access.actor.pdmUserId, roles: recognitionRoles(access), expectedRowVersion });
    return NextResponse.json({ impact }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-sessions.write-impact");
  }
}
