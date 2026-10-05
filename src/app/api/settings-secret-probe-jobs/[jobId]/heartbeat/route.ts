import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncSettingsSecretRepository } from "@/lib/repositories/settings-secret-async-repository";
import { authenticateWorkerService, rejectWorkerLabel, rejectWorkerCapability } from "@/lib/worker-service-auth";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const authentication = authenticateWorkerService(request, "settings_secret_probe");
  if ("response" in authentication) return authentication.response;
  const { actor } = authentication;
  const capabilityDenied = rejectWorkerCapability(actor, "solidworks_document_manager");
  if (capabilityDenied) return capabilityDenied;
  const { jobId } = await params;
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "INVALID_WORKER_BODY" }, { status: 400 });
  const labelDenied = rejectWorkerLabel(actor, body.workerId);
  if (labelDenied) return labelDenied;
  const workerId = actor.id;
  if (!workerId) return NextResponse.json({ error: "WORKER_ID_REQUIRED" }, { status: 400 });
  if (body.leaseAttempt !== undefined && (!Number.isSafeInteger(body.leaseAttempt) || body.leaseAttempt < 1)) return NextResponse.json({error:"INVALID_LEASE_ATTEMPT"},{status:400});
  try {
    const repository = new AsyncSettingsSecretRepository(getAsyncDatabaseClient());
    const job = await repository.getProbeJobById(jobId);
    if (job && body.leaseAttempt === undefined && await repository.getLatestIntent(job.secretReferenceId)) return NextResponse.json({error:"PROBE_PROTOCOL_UPGRADE_REQUIRED"},{status:409});
    const ok = await repository.heartbeatProbeJob(jobId,workerId,new Date().toISOString(),body.leaseAttempt);
    return ok ? NextResponse.json({ok:true},{headers:{"cache-control":"private, no-store"}}) : NextResponse.json({error:"SECRET_PROBE_JOB_LOCKED"},{status:409});
  } catch {
    return NextResponse.json({error:"SECRET_PROBE_DEPENDENCY_UNAVAILABLE",retryable:true},{status:503,headers:{"cache-control":"private, no-store"}});
  }
}
