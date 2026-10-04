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
  try {
    const credential = await resolveSettingsSecretProbeCredential((await params).jobId, actor);
    return NextResponse.json(credential, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SettingsSecretLifecycleError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ error: "SECRET_CREDENTIAL_READ_FAILED" }, { status: 500 });
  }
}
