import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { heartbeatPreviewJobAsync } from "@/lib/preview-derivatives";
import { parsePreviewLeaseEnvelope, previewLeaseProtocolVersion } from "@/lib/preview-worker-lease";
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
  const leaseBasis = parsePreviewLeaseEnvelope(body);
  if (!leaseBasis) return NextResponse.json({ error: "INVALID_PREVIEW_LEASE" }, { status: 400 });
  const accepted = await heartbeatPreviewJobAsync(getAsyncDatabaseClient(), { jobId, workerId, leaseBasis });
  return accepted
    ? NextResponse.json({ ok: true, leaseProtocolVersion: previewLeaseProtocolVersion })
    : NextResponse.json({ code: "PREVIEW_JOB_CLAIM_LOST" }, { status: 409 });
}
