import { NextResponse } from "next/server";
import { heartbeatDrawingRecognitionJob } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionJsonBody, requireRecognitionWorker, workerUnauthorizedResponse } from "@/lib/drawing-recognition-api";
import { requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  if (!requireRecognitionWorker(request)) return workerUnauthorizedResponse();
  try {
    const body = await recognitionJsonBody(request);
    const { sessionId } = await context.params;
    await heartbeatDrawingRecognitionJob({ sessionId: requireSafeRecognitionId(sessionId, "RECOGNITION_SESSION_ID_INVALID"), workerId: requireSafeRecognitionId(body.workerId, "RECOGNITION_WORKER_ID_INVALID") });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-jobs.heartbeat");
  }
}
