import { NextResponse } from "next/server";
import { completeSettingsSecretProbe, SettingsSecretLifecycleError } from "@/lib/settings-secret-lifecycle";
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
  if (!workerId || !["passed", "failed", "blocked"].includes(String(body?.status))) {
    return NextResponse.json({ error: "INVALID_PROBE_RESULT" }, { status: 400 });
  }
  if (body.leaseAttempt !== undefined && (!Number.isSafeInteger(body.leaseAttempt) || body.leaseAttempt < 1)) return NextResponse.json({error:"INVALID_LEASE_ATTEMPT"},{status:400});
  if ([body.readerVersion, body.resultCode, body.summary].some(value => value !== undefined && value !== null && typeof value !== "string")) return NextResponse.json({error:"INVALID_PROBE_RESULT"},{status:400});
  try {
    const testRun = await completeSettingsSecretProbe({
      probeJobId: jobId,
      worker: actor,
      leaseAttempt: body.leaseAttempt,
      status: body.status,
      resultCode: body.resultCode ?? null,
      readerVersion: body.readerVersion ?? null,
      summary: body.summary ?? undefined
    });
    return NextResponse.json({ testRun, workflow:testRun.workflow }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SettingsSecretLifecycleError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({error:"SECRET_PROBE_COMPLETE_FAILED",retryable:true},{status:503,headers:{"cache-control":"private, no-store"}});
  }
}
