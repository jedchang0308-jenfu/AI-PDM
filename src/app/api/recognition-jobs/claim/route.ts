import { authenticateWorkerService, rejectWorkerLabel } from "@/lib/worker-service-auth";
import { NextResponse } from "next/server";
import { claimDrawingRecognitionJob } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, recognitionJsonBody } from "@/lib/drawing-recognition-api";
import { requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const authentication = authenticateWorkerService(request, "recognition_jobs");
  if ("response" in authentication) return authentication.response;
  const { actor } = authentication;
  try {
    const body = await recognitionJsonBody(request);
    const labelDenied = rejectWorkerLabel(actor, body.workerId);
    if (labelDenied) return labelDenied;
    const job = await claimDrawingRecognitionJob({
      workerId: actor.id,
      maxAttempts: Number(body.maxAttempts ?? 2),
      allowNativeSources: body.allowNativeSources !== false
    });
    return job ? NextResponse.json(job, { headers: { "cache-control": "private, no-store" } }) : new NextResponse(null, { status: 204 });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-jobs.claim");
  }
}
