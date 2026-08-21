import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncSettingsSecretRepository } from "@/lib/repositories/settings-secret-async-repository";
import { requireWorkerServiceToken, safeWorkerId } from "@/lib/worker-service-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = requireWorkerServiceToken(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const workerId = safeWorkerId(body?.workerId);
  if (!workerId) return NextResponse.json({ error: "WORKER_ID_REQUIRED" }, { status: 400 });
  const repository = new AsyncSettingsSecretRepository(getAsyncDatabaseClient());
  const job = await repository.claimProbeJob(workerId, new Date().toISOString());
  if (!job) return new NextResponse(null, { status: 204 });
  const reference = await repository.getReferenceById(job.secretReferenceId);
  if (!reference) return NextResponse.json({ error: "SECRET_REFERENCE_NOT_FOUND" }, { status: 409 });
  return NextResponse.json({
    id: job.id,
    secretReferenceId: job.secretReferenceId,
    kind: job.kind,
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    vaultProvider: reference.vaultProvider,
    version: reference.version,
    fingerprint: reference.fingerprint
  }, { headers: { "cache-control": "private, no-store" } });
}
