import { NextResponse } from "next/server";
import { completeSettingsSecretProbe, SettingsSecretLifecycleError } from "@/lib/settings-secret-lifecycle";
import { requireWorkerServiceToken, safeWorkerId } from "@/lib/worker-service-auth";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const denied = requireWorkerServiceToken(request);
  if (denied) return denied;
  const { jobId } = await params;
  const body = await request.json().catch(() => ({}));
  const workerId = safeWorkerId(body?.workerId);
  if (!workerId || !["passed", "failed", "blocked"].includes(String(body?.status))) {
    return NextResponse.json({ error: "INVALID_PROBE_RESULT" }, { status: 400 });
  }
  try {
    const testRun = await completeSettingsSecretProbe({
      probeJobId: jobId,
      workerId,
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
