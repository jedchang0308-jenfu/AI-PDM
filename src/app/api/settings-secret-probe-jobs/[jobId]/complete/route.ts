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
  try {
    const testRun = await completeSettingsSecretProbe({
      probeJobId: jobId,
      worker: actor,
      status: body.status,
      resultCode: body.resultCode ? String(body.resultCode).slice(0, 120) : null,
      readerVersion: body.readerVersion ? String(body.readerVersion).slice(0, 120) : null,
      summary: body.summary ? String(body.summary).slice(0, 500) : undefined
    });
    return NextResponse.json({ testRun }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SettingsSecretLifecycleError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ error: "SECRET_PROBE_COMPLETE_FAILED" }, { status: 500 });
  }
}
