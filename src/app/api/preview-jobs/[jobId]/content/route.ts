import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { protectedFileResponseHeaders } from "@/lib/file-response";
import { readClaimedPreviewSourceAsync } from "@/lib/preview-derivatives";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const tokenResponse = requirePreviewWorkerToken(request);
  if (tokenResponse) return tokenResponse;
  try {
    const { jobId } = await params;
    const result = await readClaimedPreviewSourceAsync(getAsyncDatabaseClient(), {
      jobId, workerId: request.headers.get("x-pdm-preview-worker-id")?.trim() || ""
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

function requirePreviewWorkerToken(request: Request) {
  const token = process.env.PDM_PREVIEW_WORKER_TOKEN?.trim();
  if (!token) return Response.json({ error: "PREVIEW_WORKER_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  if (request.headers.get("x-pdm-preview-worker-token")?.trim() !== token) {
    return Response.json({ error: "PREVIEW_WORKER_FORBIDDEN" }, { status: 403 });
  }
  return null;
}
