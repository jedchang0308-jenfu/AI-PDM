import { authenticateWorkerService, rejectWorkerLabel } from "@/lib/worker-service-auth";
import { NextResponse } from "next/server";
import { heartbeatDrawingRecognitionJob } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionJsonBody } from "@/lib/drawing-recognition-api";
import { requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const authentication = authenticateWorkerService(request, "recognition_jobs");
  if ("response" in authentication) return authentication.response;
  const { actor } = authentication;
  try {
    const body = await recognitionJsonBody(request);
    const labelDenied = rejectWorkerLabel(actor, body.workerId);
    if (labelDenied) return labelDenied;
    const { sessionId } = await context.params;
    await heartbeatDrawingRecognitionJob({ sessionId: requireSafeRecognitionId(sessionId, "RECOGNITION_SESSION_ID_INVALID"), workerId: actor.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-jobs.heartbeat");
  }
}
