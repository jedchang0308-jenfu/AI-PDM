import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { heartbeatPreviewJobAsync } from "@/lib/preview-derivatives";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const tokenResponse = requirePreviewWorkerToken(request);
  if (tokenResponse) return tokenResponse;

  const { jobId } = await params;
  const workerId = String((await request.json().catch(() => ({}))).workerId ?? "").trim() || "preview-worker";
  await heartbeatPreviewJobAsync(getAsyncDatabaseClient(), { jobId, workerId });
  return NextResponse.json({ ok: true });
}

function requirePreviewWorkerToken(request: Request) {
  const configuredToken = process.env.PDM_PREVIEW_WORKER_TOKEN?.trim();
  if (!configuredToken) return NextResponse.json({ error: "PREVIEW_WORKER_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  const providedToken = request.headers.get("x-pdm-preview-worker-token")?.trim();
  if (!providedToken || providedToken !== configuredToken) return NextResponse.json({ error: "PREVIEW_WORKER_FORBIDDEN" }, { status: 403 });
  return null;
}
