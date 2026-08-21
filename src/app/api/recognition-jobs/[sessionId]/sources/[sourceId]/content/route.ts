import { NextResponse } from "next/server";
import { readClaimedDrawingRecognitionSource } from "@/lib/drawing-recognition";
import { recognitionErrorResponse, requireRecognitionWorker, workerUnauthorizedResponse } from "@/lib/drawing-recognition-api";
import { requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string; sourceId: string }> }) {
  if (!requireRecognitionWorker(request)) return workerUnauthorizedResponse();
  try {
    const workerId = request.headers.get("x-pdm-recognition-worker-id") ?? "";
    const { sessionId, sourceId } = await context.params;
    const result = await readClaimedDrawingRecognitionSource({
      sessionId: requireSafeRecognitionId(sessionId, "RECOGNITION_SESSION_ID_INVALID"),
      sourceId: requireSafeRecognitionId(sourceId, "RECOGNITION_SOURCE_ID_INVALID"),
      workerId: requireSafeRecognitionId(workerId, "RECOGNITION_WORKER_ID_INVALID")
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
