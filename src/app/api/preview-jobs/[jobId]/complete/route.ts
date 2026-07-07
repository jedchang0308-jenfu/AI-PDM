import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { completePreviewJobAsync, type PreviewWorkerCompletionInput } from "@/lib/preview-derivatives";
import { masterAttachmentStatusFromError } from "@/lib/master-attachment-response";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const tokenResponse = requirePreviewWorkerToken(request);
  if (tokenResponse) return tokenResponse;

  const { jobId } = await params;
  const body = await request.json().catch(() => ({}));
  const workerId = String(body.workerId ?? "").trim() || "preview-worker";
  const status = body.status === "succeeded" || body.status === "skipped" ? body.status : "failed";

  try {
    const completion =
      status === "succeeded"
        ? ({
            workerId,
            jobId,
            status,
            sourceContentHash: String(body.sourceContentHash ?? ""),
            derivatives: Array.isArray(body.derivatives) ? body.derivatives : []
          } satisfies PreviewWorkerCompletionInput)
        : ({
            workerId,
            jobId,
            status,
            errorCode: String(body.errorCode ?? "preview_worker_failed"),
            errorSummary: String(body.errorSummary ?? "預覽 worker 未完成，請確認 worker 狀態後重試。")
          } satisfies PreviewWorkerCompletionInput);
    const result = await completePreviewJobAsync(getAsyncDatabaseClient(), completion);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "PREVIEW_JOB_COMPLETE_FAILED";
    return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });
  }
}

function requirePreviewWorkerToken(request: Request) {
  const configuredToken = process.env.PDM_PREVIEW_WORKER_TOKEN?.trim();
  if (!configuredToken) return NextResponse.json({ error: "PREVIEW_WORKER_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  const providedToken = request.headers.get("x-pdm-preview-worker-token")?.trim();
  if (!providedToken || providedToken !== configuredToken) return NextResponse.json({ error: "PREVIEW_WORKER_FORBIDDEN" }, { status: 403 });
  return null;
}
