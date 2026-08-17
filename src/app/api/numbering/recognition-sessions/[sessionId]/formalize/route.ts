import { NextResponse } from "next/server";
import { calculateDrawingRecognitionImpact, formalizeDrawingRecognition, verifyRecognitionImpactToken } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionJsonBody, recognitionRoles } from "@/lib/drawing-recognition-api";
import { DrawingRecognitionError, requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const body = await recognitionJsonBody(request);
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.formalize", body });
    if (access.response || !access.company || !access.actor || !access.metadata) return access.response;
    const { sessionId: rawSessionId } = await context.params;
    const sessionId = requireSafeRecognitionId(rawSessionId, "RECOGNITION_SESSION_ID_INVALID");
    const impactToken = String(body.impactToken ?? body.impact_token ?? "").trim();
    if (!impactToken) throw new DrawingRecognitionError("RECOGNITION_IMPACT_TOKEN_REQUIRED", "請先確認寫入內容。", 400);
    const token = verifyRecognitionImpactToken(impactToken, { sessionId, companyId: access.company.companyId });
    const impact = await calculateDrawingRecognitionImpact({ sessionId, companyId: access.company.companyId, actorId: access.actor.pdmUserId, roles: recognitionRoles(access), expectedRowVersion: token.sessionRowVersion });
    if (impact.requiresPostReleaseChange) {
      const postRelease = await requireNumberingActionAsync(request, "post_release_change");
      if (postRelease.response) return postRelease.response;
    }
    const reason = body.reason == null ? null : String(body.reason).trim();
    const result = await formalizeDrawingRecognition({ sessionId, companyId: access.company.companyId, actorId: access.actor.pdmUserId, roles: recognitionRoles(access), impactToken, reason, metadata: access.metadata });
    return NextResponse.json({ result }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-sessions.formalize");
  }
}
