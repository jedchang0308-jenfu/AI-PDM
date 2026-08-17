import { NextResponse } from "next/server";
import { createDrawingRecognitionSession } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionJsonBody } from "@/lib/drawing-recognition-api";
import { DrawingRecognitionError, requireSafeRecognitionId, type DrawingRecognitionSourceContextType } from "@/lib/drawing-recognition-contract";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await recognitionJsonBody(request);
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.run", body });
    if (access.response || !access.company || !access.actor) return access.response;
    const sourceContextType = String(body.sourceContextType ?? body.source_context_type ?? "") as DrawingRecognitionSourceContextType;
    if (!["candidate_revision", "revision_package", "drawing_revision", "drawing_number"].includes(sourceContextType)) {
      throw new DrawingRecognitionError("RECOGNITION_CONTEXT_TYPE_INVALID", "辨識來源類型不正確。", 400);
    }
    const sourceAssetIds = Array.isArray(body.sourceAssetIds)
      ? body.sourceAssetIds.map((id) => requireSafeRecognitionId(id, "RECOGNITION_SOURCE_ID_INVALID"))
      : undefined;
    const session = await createDrawingRecognitionSession({
      companyId: access.company.companyId,
      actorId: access.actor.pdmUserId,
      sourceContextType,
      sourceContextId: requireSafeRecognitionId(body.sourceContextId ?? body.source_context_id, "RECOGNITION_CONTEXT_ID_INVALID"),
      sourceAssetIds
    });
    return NextResponse.json({ session }, { status: 201, headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-sessions.create");
  }
}
