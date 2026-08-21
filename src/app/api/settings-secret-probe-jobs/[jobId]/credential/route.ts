import { NextResponse } from "next/server";
import { resolveSettingsSecretProbeCredential, SettingsSecretLifecycleError } from "@/lib/settings-secret-lifecycle";
import { requireWorkerServiceToken, safeWorkerId } from "@/lib/worker-service-auth";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const denied = requireWorkerServiceToken(request);
  if (denied) return denied;
  const workerId = safeWorkerId(request.headers.get("x-pdm-worker-id"));
  if (!workerId) return NextResponse.json({ error: "WORKER_ID_REQUIRED" }, { status: 400 });
  try {
    const credential = await resolveSettingsSecretProbeCredential((await params).jobId, workerId);
    return NextResponse.json(credential, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SettingsSecretLifecycleError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ error: "SECRET_CREDENTIAL_READ_FAILED" }, { status: 500 });
  }
}
