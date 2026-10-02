import { authenticateWorkerService, rejectWorkerLabel } from "@/lib/worker-service-auth";
import { NextResponse } from "next/server";
import { completeDrawingRecognitionJob } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionJsonBody } from "@/lib/drawing-recognition-api";
import { DrawingRecognitionError, requireSafeRecognitionId, type DrawingRecognitionAdapterCompletion } from "@/lib/drawing-recognition-contract";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const authentication = authenticateWorkerService(request, "recognition_jobs");
  if ("response" in authentication) return authentication.response;
  const { actor } = authentication;
  try {
    const body = await recognitionJsonBody(request);
    const labelDenied = rejectWorkerLabel(actor, body.workerId);
    if (labelDenied) return labelDenied;
    if (!Array.isArray(body.results)) throw new DrawingRecognitionError("RECOGNITION_RESULTS_REQUIRED", "Worker results are required.", 400);
    const { sessionId } = await context.params;
    const session = await completeDrawingRecognitionJob({
      sessionId: requireSafeRecognitionId(sessionId, "RECOGNITION_SESSION_ID_INVALID"),
      workerId: actor.id,
      sourceSetFingerprint: requireSafeRecognitionId(body.sourceSetFingerprint, "RECOGNITION_SOURCE_FINGERPRINT_INVALID"),
      results: body.results as DrawingRecognitionAdapterCompletion[]
    });
    return NextResponse.json({ session }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-jobs.complete");
  }
}
