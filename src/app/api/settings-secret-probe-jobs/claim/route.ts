import { reconcilePendingSettingsSecretActivation } from "@/lib/settings-secret-lifecycle";
import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncSettingsSecretRepository } from "@/lib/repositories/settings-secret-async-repository";
import { authenticateWorkerService, rejectWorkerLabel, rejectWorkerCapability } from "@/lib/worker-service-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authentication = authenticateWorkerService(request, "settings_secret_probe");
  if ("response" in authentication) return authentication.response;
  const { actor } = authentication;
  const capabilityDenied = rejectWorkerCapability(actor, "solidworks_document_manager");
  if (capabilityDenied) return capabilityDenied;
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "INVALID_WORKER_BODY" }, { status: 400 });
  const labelDenied = rejectWorkerLabel(actor, body.workerId);
  if (labelDenied) return labelDenied;
  const workerId = actor.id;
  if (!workerId) return NextResponse.json({ error: "WORKER_ID_REQUIRED" }, { status: 400 });
  if (body.protocolVersion !== undefined && body.protocolVersion !== 2) return NextResponse.json({error:"INVALID_PROBE_PROTOCOL"},{status:400});
  try {
    if (body.protocolVersion === 2) await reconcilePendingSettingsSecretActivation();
    const repository = new AsyncSettingsSecretRepository(getAsyncDatabaseClient());
    const job = await repository.claimProbeJob(workerId,new Date().toISOString(),body.protocolVersion);
    if (!job) return new NextResponse(null,{status:204});
    const reference = await repository.getReferenceById(job.secretReferenceId);
    if (!reference) return NextResponse.json({error:"SECRET_REFERENCE_NOT_FOUND"},{status:409});
    return NextResponse.json({id:job.id,secretReferenceId:job.secretReferenceId,kind:job.kind,
      status:job.status,companyId:job.companyId,initiatorPrincipalId:job.initiatorPrincipalId,purpose:job.purpose,
      attemptCount:job.attemptCount,leaseAttempt:job.attemptCount,maxAttempts:job.maxAttempts,
      protocolVersion:body.protocolVersion ?? 1,vaultProvider:reference.vaultProvider,
      version:reference.version,fingerprint:reference.fingerprint},{headers:{"cache-control":"private, no-store"}});
  } catch {
    return NextResponse.json({error:"SECRET_PROBE_DEPENDENCY_UNAVAILABLE",retryable:true},
      {status:503,headers:{"cache-control":"private, no-store"}});
  }
}
