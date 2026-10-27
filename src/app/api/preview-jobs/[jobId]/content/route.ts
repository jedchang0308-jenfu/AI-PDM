import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { protectedFileResponseHeaders } from "@/lib/file-response";
import { readClaimedPreviewSourceAsync } from "@/lib/preview-derivatives";
import { authenticateWorkerService } from "@/lib/worker-service-auth";
import { decodePreviewLeaseHeader, previewLeaseHeader, previewLeaseProtocolVersion, previewLeaseVersionHeader } from "@/lib/preview-worker-lease";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const authentication = await authenticateWorkerService(request, "preview_jobs");
  if ("response" in authentication) return authentication.response;
  const leaseBasis = decodePreviewLeaseHeader(request.headers.get(previewLeaseHeader));
  if (!leaseBasis) return Response.json({ error: "INVALID_PREVIEW_LEASE" }, { status: 400, headers: { "cache-control": "private, no-store" } });
  try {
    const { jobId } = await params;
    const result = await readClaimedPreviewSourceAsync(getAsyncDatabaseClient(), {
      jobId, workerId: authentication.actor.id,
      ownerPrincipalId: authentication.actor.ownerPrincipalId, leaseBasis
    });
    return new Response(new Uint8Array(result.bytes), { headers: {
      ...protectedFileResponseHeaders("attachment", result.fileName, result.mimeType),
      "content-type": result.mimeType, "content-length": String(result.bytes.length), "content-hash": result.contentHash,
      [previewLeaseVersionHeader]: String(previewLeaseProtocolVersion)
    } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PREVIEW_SOURCE_READ_FAILED";
    const lost = message === "PREVIEW_JOB_CLAIM_LOST";
    return Response.json({ error: lost ? message : "PREVIEW_SOURCE_READ_FAILED" }, { status: lost ? 409 : 503, headers: { "cache-control": "private, no-store" } });
  }
}
