import { authenticateWorkerService } from "@/lib/worker-service-auth";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";
import { OpenSwxMetadataService, openSwxErrorResponse, openSwxPrivateHeaders, openSwxRequestFence, readOpenSwxContent } from "@/lib/openswx-metadata";
import { canonicalOpenSwxExecution } from "@/lib/openswx-metadata-dispatch";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ jobId: string; sourceId?: string }> }) {
  const auth = authenticateWorkerService(request, "openswx_metadata_jobs");
  if ("response" in auth) return auth.response;
  try {
    const { jobId, sourceId } = await context.params;
    const db = getAsyncDatabaseClient(), service = new OpenSwxMetadataService(db);
    const input = openSwxRequestFence(request);
    const fence = await service.workerFence(auth.actor, requireSafeRecognitionId(jobId, "OPENSWX_ID_INVALID"), { ...input, executionName: canonicalOpenSwxExecution(input.executionName) });
    const content = await readOpenSwxContent(db, service, auth.actor, fence, requireSafeRecognitionId(sourceId, "OPENSWX_ID_INVALID"));
    return new Response(content.bytes as unknown as BodyInit, { headers: { ...openSwxPrivateHeaders, "content-type": "application/octet-stream", "content-length": String(content.bytes.length), "content-hash": content.sha256 } });
  } catch (error) { return openSwxErrorResponse(error); }
}
