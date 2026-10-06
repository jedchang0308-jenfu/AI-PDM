import { authenticateWorkerService } from "@/lib/worker-service-auth";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { requireSafeRecognitionId } from "@/lib/drawing-recognition-contract";
import { OpenSwxMetadataService, openSwxErrorResponse, openSwxPrivateHeaders, openSwxWorkerProjection, openSwxRequestFence, readOpenSwxJson } from "@/lib/openswx-metadata";
import { canonicalOpenSwxExecution } from "@/lib/openswx-metadata-dispatch";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ jobId: string; sourceId?: string }> }) {
  const auth = authenticateWorkerService(request, "openswx_metadata_jobs");
  if ("response" in auth) return auth.response;
  try {
    const { jobId } = await context.params;
    const db = getAsyncDatabaseClient(), service = new OpenSwxMetadataService(db);
    const input = openSwxRequestFence(request);
    const fence = await service.workerFence(auth.actor, requireSafeRecognitionId(jobId, "OPENSWX_ID_INVALID"), { ...input, executionName: canonicalOpenSwxExecution(input.executionName) });
    const body = await readOpenSwxJson(request, ["results"]);
    if (!Array.isArray(body.results)) return Response.json({ code: "OPENSWX_BODY_INVALID" }, { status: 400, headers: openSwxPrivateHeaders });
    const job = await service.complete(auth.actor, fence, body.results);
    return Response.json({ job: openSwxWorkerProjection(job) }, { headers: openSwxPrivateHeaders });
  } catch (error) { return openSwxErrorResponse(error); }
}
