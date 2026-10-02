import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { claimPreviewJobAsync } from "@/lib/preview-derivatives";
import { authenticateWorkerService, rejectWorkerLabel } from "@/lib/worker-service-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authentication = authenticateWorkerService(request, "preview_jobs");
  if ("response" in authentication) return authentication.response;
  const { actor } = authentication;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "INVALID_WORKER_BODY" }, { status: 400 });
  const supportedKinds = Array.isArray(body.supportedKinds) ? body.supportedKinds : ["native_thumbnail_png"];
  const supportedExtensions = Array.isArray(body.supportedExtensions) ? body.supportedExtensions : ["sldprt", "sldasm", "slddrw"];
  const labelDenied = rejectWorkerLabel(actor, body.workerId);
  if (labelDenied) return labelDenied;
  const workerId = actor.id;
  const allowedExtensions = [
    ...(actor.capabilities.includes("solidworks_3d_preview_png") ? ["sldprt", "sldasm"] : []),
    ...(actor.capabilities.includes("solidworks_2d_preview_png") ? ["slddrw"] : [])
  ];
  const extensions = supportedExtensions.map((extension: unknown) => String(extension ?? "").trim().toLowerCase())
    .filter((extension: string) => allowedExtensions.includes(extension));
  if (!extensions.length) return NextResponse.json({ error: "WORKLOAD_JOB_SCOPE_FORBIDDEN" }, { status: 403 });
  const allowedKinds = actor.capabilities.some(capability =>
    capability === "solidworks_2d_preview_png" || capability === "solidworks_3d_preview_png"
  ) ? ["native_thumbnail_png"] : [];
  if (!supportedKinds.length || supportedKinds.some((kind: unknown) => typeof kind !== "string" || !allowedKinds.includes(kind))) {
    return NextResponse.json({ error: "WORKLOAD_JOB_SCOPE_FORBIDDEN" }, { status: 403 });
  }
  const supportedPreviewKinds = [...new Set(supportedKinds)] as "native_thumbnail_png"[];

  const claim = await claimPreviewJobAsync(getAsyncDatabaseClient(), {
    workerId,
    supportedKinds: supportedPreviewKinds,
    supportedExtensions: extensions
  });
  return NextResponse.json({ job: claim });
}
