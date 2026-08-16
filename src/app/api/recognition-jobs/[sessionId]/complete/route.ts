import { NextResponse } from "next/server";
import { completeDrawingRecognitionJob } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionJsonBody, requireRecognitionWorker, workerUnauthorizedResponse } from "@/lib/drawing-recognition-api";
import { DrawingRecognitionError, requireSafeRecognitionId, type DrawingRecognitionAdapterCompletion } from "@/lib/drawing-recognition-contract";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  if (!requireRecognitionWorker(request)) return workerUnauthorizedResponse();
  try {
    const body = await recognitionJsonBody(request);
    if (!Array.isArray(body.results)) throw new DrawingRecognitionError("RECOGNITION_RESULTS_REQUIRED", "Worker results are required.", 400);
    const { sessionId } = await context.params;
    const session = await completeDrawingRecognitionJob({
      sessionId: requireSafeRecognitionId(sessionId, "RECOGNITION_SESSION_ID_INVALID"),
      workerId: requireSafeRecognitionId(body.workerId, "RECOGNITION_WORKER_ID_INVALID"),
      sourceSetFingerprint: requireSafeRecognitionId(body.sourceSetFingerprint, "RECOGNITION_SOURCE_FINGERPRINT_INVALID"),
      results: body.results as DrawingRecognitionAdapterCompletion[]
    });
    return NextResponse.json({ session }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-jobs.complete");
  }
}
