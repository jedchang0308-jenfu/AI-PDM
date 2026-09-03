import { NextResponse } from "next/server";
import { getLatestDrawingRecognitionForPart } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionRoles } from "@/lib/drawing-recognition-api";
import { requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";
import { projectPartRecognitionTransferSummary } from "@/lib/part-recognition-transfer";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ partId: string }> }) {
  try {
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.review" });
    if (access.response || !access.company || !access.actor) return access.response;
    const partId = requireSafeRecognitionId(decodeURIComponent((await context.params).partId), "RECOGNITION_PART_ID_INVALID");
    const session = await getLatestDrawingRecognitionForPart({
      partId,
      companyId: access.company.companyId,
      actorId: access.actor.pdmUserId,
      roles: recognitionRoles(access)
    });
    return NextResponse.json(
      { session: session ? projectPartRecognitionTransferSummary(session, partId) : null },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch (error) {
    return recognitionErrorResponse(error, "parts.latest-recognition");
  }
}
