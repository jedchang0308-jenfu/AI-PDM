import { authenticateOpenSwxScheduler } from "@/lib/openswx-metadata-dispatch-auth";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { recoverOpenSwxDispatch } from "@/lib/openswx-metadata-dispatch";
import { openSwxErrorResponse, openSwxPrivateHeaders, readOpenSwxJson } from "@/lib/openswx-metadata";
import { OpenSwxMetadataError } from "@/lib/openswx-metadata-contract";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const deadline = Date.now() + 20_000, signal = AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]);
  const denied = await authenticateOpenSwxScheduler(request);
  if (denied) return denied;
  try {
    if (signal.aborted) throw new OpenSwxMetadataError("OPENSWX_REQUEST_ABORTED", 408);
    await readOpenSwxJson(request, [], 1024, signal);
    return Response.json(await recoverOpenSwxDispatch(getAsyncDatabaseClient(), { signal, deadline }), { headers: openSwxPrivateHeaders });
  } catch (error) { return openSwxErrorResponse(error); }
}
