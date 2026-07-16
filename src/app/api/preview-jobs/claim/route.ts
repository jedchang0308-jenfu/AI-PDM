import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { claimPreviewJobAsync } from "@/lib/preview-derivatives";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const tokenResponse = requirePreviewWorkerToken(request);
  if (tokenResponse) return tokenResponse;

  const body = await request.json().catch(() => ({}));
  const supportedKinds = Array.isArray(body.supportedKinds) ? body.supportedKinds : ["native_thumbnail_png"];
  const supportedExtensions = Array.isArray(body.supportedExtensions) ? body.supportedExtensions : ["sldprt", "sldasm", "slddrw"];
  const workerId = String(body.workerId ?? "").trim() || "preview-worker";
  const supportedPreviewKinds = supportedKinds.filter(
    (kind: unknown): kind is "native_thumbnail_png" | "drawing_pdf" => kind === "native_thumbnail_png" || kind === "drawing_pdf"
  );

  const claim = await claimPreviewJobAsync(getAsyncDatabaseClient(), {
    workerId,
    supportedKinds: supportedPreviewKinds.length > 0 ? supportedPreviewKinds : ["native_thumbnail_png"],
    supportedExtensions: supportedExtensions.map((extension: unknown) => String(extension ?? "").trim()).filter(Boolean)
  });
  return NextResponse.json({ job: claim });
}

function requirePreviewWorkerToken(request: Request) {
  const configuredToken = process.env.PDM_PREVIEW_WORKER_TOKEN?.trim();
  if (!configuredToken) return NextResponse.json({ error: "PREVIEW_WORKER_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  const providedToken = request.headers.get("x-pdm-preview-worker-token")?.trim();
  if (!providedToken || providedToken !== configuredToken) return NextResponse.json({ error: "PREVIEW_WORKER_FORBIDDEN" }, { status: 403 });
  return null;
}
