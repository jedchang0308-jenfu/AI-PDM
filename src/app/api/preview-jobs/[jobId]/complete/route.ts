import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { completePreviewJobAsync, type PreviewWorkerCompletionInput } from "@/lib/preview-derivatives";
import { parsePreviewLeaseEnvelope, previewLeaseProtocolVersion } from "@/lib/preview-worker-lease";
import { masterAttachmentStatusFromError } from "@/lib/master-attachment-response";
import { authenticateWorkerService, rejectWorkerLabel } from "@/lib/worker-service-auth";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const authentication = authenticateWorkerService(request, "preview_jobs");
  if ("response" in authentication) return authentication.response;
  const { actor } = authentication;

  const { jobId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "INVALID_WORKER_BODY" }, { status: 400 });
  const labelDenied = rejectWorkerLabel(actor, body.workerId);
  if (labelDenied) return labelDenied;
  const workerId = actor.id;
  const status = body.status;
  if (!["succeeded", "failed", "skipped", "cancelled"].includes(status)) return NextResponse.json({ error: "INVALID_PREVIEW_COMPLETION_STATUS" }, { status: 400 });
  const leaseBasis = parsePreviewLeaseEnvelope(body);
  if (!leaseBasis || (status === "cancelled" && body.cancelReason !== "operator_shutdown")) return NextResponse.json({ error: "INVALID_PREVIEW_LEASE" }, { status: 400 });

  try {
    const completion =
      status === "cancelled"
        ? ({ workerId, jobId, status, leaseBasis, cancelReason: "operator_shutdown" } satisfies PreviewWorkerCompletionInput)
        : status === "succeeded"
        ? ({
            workerId,
            jobId,
            leaseBasis,
            status,
            sourceContentHash: String(body.sourceContentHash ?? ""),
            derivatives: Array.isArray(body.derivatives) ? body.derivatives : []
          } satisfies PreviewWorkerCompletionInput)
        : ({
            workerId,
            jobId,
            leaseBasis,
            status,
            errorCode: String(body.errorCode ?? "preview_worker_failed"),
            errorSummary: String(body.errorSummary ?? "預覽 worker 未完成，請確認 worker 狀態後重試。")
          } satisfies PreviewWorkerCompletionInput);
    const result = await completePreviewJobAsync(getAsyncDatabaseClient(), completion);
    return NextResponse.json({ ...result, leaseProtocolVersion: previewLeaseProtocolVersion }, { status: result.accepted ? 200 : 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PREVIEW_JOB_COMPLETE_FAILED";
    return NextResponse.json({ error: message }, { status: masterAttachmentStatusFromError(message) });
  }
}
