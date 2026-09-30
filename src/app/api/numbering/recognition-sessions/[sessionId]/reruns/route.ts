import { NextResponse } from "next/server";
import { rerunDrawingRecognition } from "@/lib/drawing-recognition";
import { recognitionErrorResponse } from "@/lib/drawing-recognition-api";
import { withPrincipalDrawingRecognitionMutation } from "@/lib/drawing-recognition-principal-mutation";
import { requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.run" });
    if (access.response || !access.company || !access.actor) return access.response;
    const { sessionId } = await context.params;
    const session = await withPrincipalDrawingRecognitionMutation({
      metadata: access.metadata, permissionCode: "numbering.recognition.run",
      companyId: access.company.companyId, actorId: access.actor.pdmUserId,
      execute: (snapshot, decision, verified) => rerunDrawingRecognition({
        sessionId: requireSafeRecognitionId(sessionId, "RECOGNITION_SESSION_ID_INVALID"),
        companyId: access.company.companyId, actorId: access.actor.pdmUserId,
        initiatorPrincipalId: verified.session.principalId,
        roles: decision.roleCode ? [decision.roleCode] : [], client: snapshot
      })
    });
    return NextResponse.json({ session }, { status: 201, headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-sessions.rerun");
  }
}
