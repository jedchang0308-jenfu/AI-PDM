import { NextResponse } from "next/server";
import { cancelDrawingRecognitionAmendment } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionJsonBody, recognitionRoles } from "@/lib/drawing-recognition-api";
import { DrawingRecognitionError, requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const body = await recognitionJsonBody(request);
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.review", body });
    if (access.response || !access.company || !access.actor || !access.metadata) return access.response;
    const expectedRowVersion = Number(body.expectedRowVersion ?? body.expected_row_version);
    if (!Number.isInteger(expectedRowVersion) || expectedRowVersion < 1) throw new DrawingRecognitionError("RECOGNITION_ROW_VERSION_REQUIRED", "缺少目前辨識內容版本。", 400);
    const { sessionId } = await context.params;
    const session = await cancelDrawingRecognitionAmendment({
      sessionId: requireSafeRecognitionId(sessionId, "RECOGNITION_SESSION_ID_INVALID"),
      companyId: access.company.companyId,
      actorId: access.actor.pdmUserId,
      roles: recognitionRoles(access),
      expectedRowVersion,
      metadata: access.metadata
    });
    return NextResponse.json({ session }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-sessions.cancel-amendment");
  }
}
