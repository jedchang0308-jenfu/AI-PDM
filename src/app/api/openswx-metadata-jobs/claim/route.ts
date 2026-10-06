import { authenticateWorkerService } from "@/lib/worker-service-auth";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { OpenSwxMetadataService, openSwxErrorResponse, openSwxWorkerProjection, openSwxPrivateHeaders, readOpenSwxJson } from "@/lib/openswx-metadata";
import { canonicalOpenSwxExecution, reconcileOpenSwxEmptyClaim } from "@/lib/openswx-metadata-dispatch";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = authenticateWorkerService(request, "openswx_metadata_jobs");
  if ("response" in auth) return auth.response;
  try {
    const body = await readOpenSwxJson(request, ["executionName"], 1024);
    const job = await new OpenSwxMetadataService(getAsyncDatabaseClient()).claim(auth.actor, { executionName: canonicalOpenSwxExecution(body.executionName) });
    return job ? Response.json({ job: openSwxWorkerProjection(job) }, { headers: openSwxPrivateHeaders }) : new Response(null, { status: 204, headers: openSwxPrivateHeaders });
  } catch (error) {
    if (error instanceof Error && error.message === "OPENSWX_CLAIM_NOT_ADMITTED") {
      const reconciliation = await reconcileOpenSwxEmptyClaim(getAsyncDatabaseClient(), { signal: request.signal });
      return reconciliation.state === "empty" ? new Response(null, { status: 204, headers: openSwxPrivateHeaders }) : Response.json({ code: "OPENSWX_DISPATCH_PENDING" }, { status: 409, headers: openSwxPrivateHeaders });
    }
    return openSwxErrorResponse(error);
  }
}
