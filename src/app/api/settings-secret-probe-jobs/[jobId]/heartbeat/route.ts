import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncSettingsSecretRepository } from "@/lib/repositories/settings-secret-async-repository";
import { requireWorkerServiceToken, safeWorkerId } from "@/lib/worker-service-auth";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const denied = requireWorkerServiceToken(request);
  if (denied) return denied;
  const { jobId } = await params;
  const body = await request.json().catch(() => ({}));
  const workerId = safeWorkerId(body?.workerId);
  if (!workerId) return NextResponse.json({ error: "WORKER_ID_REQUIRED" }, { status: 400 });
  const repository = new AsyncSettingsSecretRepository(getAsyncDatabaseClient());
  const ok = await repository.heartbeatProbeJob(jobId, workerId, new Date().toISOString());
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "SECRET_PROBE_JOB_LOCKED" }, { status: 409 });
}
