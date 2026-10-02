import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { protectedFileResponseHeaders } from "@/lib/file-response";
import { readClaimedPreviewSourceAsync } from "@/lib/preview-derivatives";
import { authenticateWorkerService } from "@/lib/worker-service-auth";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const authentication = authenticateWorkerService(request, "preview_jobs");
  if ("response" in authentication) return authentication.response;
  try {
    const { jobId } = await params;
    const result = await readClaimedPreviewSourceAsync(getAsyncDatabaseClient(), {
      jobId, workerId: authentication.actor.id
    });
    return new Response(new Uint8Array(result.bytes), { headers: {
      ...protectedFileResponseHeaders("attachment", result.fileName, result.mimeType),
      "content-type": result.mimeType, "content-length": String(result.bytes.length), "content-hash": result.contentHash
    } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PREVIEW_SOURCE_READ_FAILED";
    const denied = message === "PREVIEW_SOURCE_CLAIM_FORBIDDEN" || message === "PREVIEW_SOURCE_CLAIM_REQUIRED";
    return Response.json({ error: denied ? "PREVIEW_SOURCE_CLAIM_FORBIDDEN" : "PREVIEW_SOURCE_READ_FAILED" }, { status: denied ? 403 : 503 });
  }
}
