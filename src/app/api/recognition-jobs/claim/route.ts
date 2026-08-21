import { NextResponse } from "next/server";
import { claimDrawingRecognitionJob } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionJsonBody, requireRecognitionWorker, workerUnauthorizedResponse } from "@/lib/drawing-recognition-api";
import { requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!requireRecognitionWorker(request)) return workerUnauthorizedResponse();
  try {
    const body = await recognitionJsonBody(request);
    const job = await claimDrawingRecognitionJob({
      workerId: requireSafeRecognitionId(body.workerId, "RECOGNITION_WORKER_ID_INVALID"),
      maxAttempts: Number(body.maxAttempts ?? 2),
      allowNativeSources: body.allowNativeSources !== false
    });
    return job ? NextResponse.json(job, { headers: { "cache-control": "private, no-store" } }) : new NextResponse(null, { status: 204 });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-jobs.claim");
  }
}
