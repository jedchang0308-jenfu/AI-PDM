import { NextResponse } from "next/server";
import { getDrawingRecognitionProjection } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionRoles } from "@/lib/drawing-recognition-api";
import { requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import { projectDrawingRecognitionReviewFields, type RecognitionReviewCandidateDecision, type RecognitionReviewScope } from "@/lib/drawing-recognition-review-projection";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const access = await requireNumberingPlatformCommandAsync(request, { action: "numbering.recognition.review" });
    if (access.response || !access.company || !access.actor) return access.response;
    const { sessionId } = await context.params;
    const session = await getDrawingRecognitionProjection({
      sessionId: requireSafeRecognitionId(sessionId, "RECOGNITION_SESSION_ID_INVALID"),
      companyId: access.company.companyId,
      actorId: access.actor.pdmUserId,
      roles: recognitionRoles(access)
    });
    const reviewCandidates = session.candidates.map((candidate) => ({
      ...candidate,
      observations: candidate.observations.map((observation) => ({
        ...observation,
        candidateId: candidate.id,
        sourceFileName: session.sources.find((source) => source.id === observation.sourceId)?.fileName ?? null,
        sourceRole: session.sources.find((source) => source.id === observation.sourceId)?.sourceRole ?? null
      }))
    })) as RecognitionReviewCandidateDecision[];
    const reviewFields = projectDrawingRecognitionReviewFields(session.reviewGroups as RecognitionReviewScope[], reviewCandidates, { partOwnerTargets: session.partOwnerTargets });
    const { partOwnerTargets: _partOwnerTargets, ...sessionProjection } = session;
    return NextResponse.json({ session: { ...sessionProjection, reviewFields } }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-sessions.get");
  }
}
