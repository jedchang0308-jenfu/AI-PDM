import { NextResponse } from "next/server";
import { resolveSettingsSecretProbeCredential, SettingsSecretLifecycleError } from "@/lib/settings-secret-lifecycle";
import { authenticateWorkerService, rejectWorkerLabel, rejectWorkerCapability } from "@/lib/worker-service-auth";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const authentication = authenticateWorkerService(request, "settings_secret_probe");
  if ("response" in authentication) return authentication.response;
  const { actor } = authentication;
  const capabilityDenied = rejectWorkerCapability(actor, "solidworks_document_manager");
  if (capabilityDenied) return capabilityDenied;
  const workerId = actor.id;
  if (!workerId) return NextResponse.json({ error: "WORKER_ID_REQUIRED" }, { status: 400 });
  const rawAttempt = new URL(request.url).searchParams.get("leaseAttempt");
  if (rawAttempt !== null && (!/^[1-9][0-9]*$/u.test(rawAttempt) || rawAttempt.match(/^[1-9][0-9]*$/u)?.[0] !== rawAttempt ||
    !Number.isSafeInteger(Number(rawAttempt)))) return NextResponse.json({error:"INVALID_LEASE_ATTEMPT"},{status:400});
  try {
    const credential = await resolveSettingsSecretProbeCredential((await params).jobId,actor,rawAttempt === null ? undefined : Number(rawAttempt));
    return NextResponse.json(credential, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SettingsSecretLifecycleError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({error:"SECRET_CREDENTIAL_READ_FAILED",retryable:true},{status:503,headers:{"cache-control":"private, no-store"}});
  }
}
