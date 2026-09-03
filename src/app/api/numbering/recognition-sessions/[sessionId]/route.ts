import { NextResponse } from "next/server";
import { getDrawingRecognitionProjection } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionRoles } from "@/lib/drawing-recognition-api";
import { requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { issueCanonicalWorkbenchContract } from "@/lib/pdm-workbench-authority-control";
import { requireNumberingPlatformCommandAsync } from "@/lib/platform-command-context";
import { projectDrawingRecognitionReviewFields, type RecognitionReviewCandidateDecision, type RecognitionReviewScope } from "@/lib/drawing-recognition-review-projection";
import { getDrawingRecognitionPartWorkHandoffProjection } from "@/lib/drawing-recognition-part-work-handoff";

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
    const handoff = ["queued", "extracting"].includes(session.status)
      ? { handoffControl: { state: "locked", workMutationCount: 0, unchangedCount: 0, blockers: ["辨識處理中"] } }
      : await getDrawingRecognitionPartWorkHandoffProjection({ sessionId: session.id, companyId: access.company.companyId });
    const handoffSummary = "applicationScope" in handoff ? {
      schemaVersion: 2,
      destination: "part_work",
      relationScopeFingerprint: handoff.applicationScope.relationScopeFingerprint,
      eligiblePartCount: handoff.applicationScope.eligiblePartCount,
      workMutationCount: handoff.handoffControl.workMutationCount,
      unchangedCount: handoff.handoffControl.unchangedCount,
      eventId: null,
      targets: handoff.exceptions.map((exception) => ({ partId: exception.partId, partNumber: exception.partNumber, result: "already_current" as const }))
    } : null;
    let contractToken: string | null = null;
    if (handoffSummary) {
      try {
        contractToken = await issueCanonicalWorkbenchContract(getAsyncDatabaseClient(), { companyId: access.company.companyId, actorId: access.actor.pdmUserId });
      } catch {
        // The legacy recognition read remains available while authority cutover is gated.
        // The handoff POST will fail closed without a current canonical token.
      }
    }
    return NextResponse.json({ session: { ...sessionProjection, reviewFields, ...handoff, handoff: handoffSummary }, meta: { contractToken } }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-sessions.get");
  }
}
