import { authenticateWorkerService, rejectWorkerLabel } from "@/lib/worker-service-auth";
import { NextResponse } from "next/server";
import { readClaimedDrawingRecognitionSource } from "@/lib/drawing-recognition";
import { recognitionErrorResponse } from "@/lib/drawing-recognition-api";
import { requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";
import { decodeRecognitionLeaseHeader, recognitionLeaseHeader } from "@/lib/recognition-worker-lease";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string; sourceId: string }> }) {
  const authentication = await authenticateWorkerService(request, "recognition_jobs");
  if ("response" in authentication) return authentication.response;
  const { actor } = authentication;
  try {
    const workerId = actor.id;
    const leaseBasis = decodeRecognitionLeaseHeader(request.headers.get(recognitionLeaseHeader));
    if (!leaseBasis || leaseBasis.companyId !== actor.companyId) return NextResponse.json({ error: "RECOGNITION_LEASE_REQUIRED" }, { status: 400 });
    const { sessionId, sourceId } = await context.params;
    const result = await readClaimedDrawingRecognitionSource({
      sessionId: requireSafeRecognitionId(sessionId, "RECOGNITION_SESSION_ID_INVALID"),
      sourceId: requireSafeRecognitionId(sourceId, "RECOGNITION_SOURCE_ID_INVALID"),
      workerId: requireSafeRecognitionId(workerId, "RECOGNITION_WORKER_ID_INVALID"),
      ownerPrincipalId: actor.ownerPrincipalId,
      leaseBasis
    });
    const safeName = result.fileName.replace(/[\r\n"\\]/gu, "_").slice(0, 180) || "source.bin";
    return new NextResponse(result.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "cache-control": "private, no-store",
        "content-type": result.mimeType,
        "content-length": String(result.bytes.byteLength),
        "content-hash": result.contentHash,
        "content-disposition": `inline; filename="${safeName}"`,
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    return recognitionErrorResponse(error, "recognition-jobs.source-content");
  }
}
