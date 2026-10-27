import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { authenticateWindowsServiceDevice } from "@/lib/windows-service-device-auth";

export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store" };
const tables = {
  preview: "preview_jobs",
  recognition: "drawing_recognition_sessions",
  probe: "settings_secret_probe_jobs"
} as const;

export async function GET(request: Request, context: { params: Promise<{ kind: string; jobId: string }> }) {
  const authentication = await authenticateWindowsServiceDevice(request);
  if ("response" in authentication) return authentication.response;
  const { actor } = authentication;
  const { kind, jobId } = await context.params;
  if (!Object.hasOwn(tables, kind) || !/^[A-Za-z0-9._:-]{1,180}$/u.test(jobId)) {
    return NextResponse.json({ error: "WINDOWS_SERVICE_JOB_NOT_FOUND" }, { status: 404, headers });
  }
  const table = tables[kind as keyof typeof tables];
  const ownerPredicate = kind === "preview"
    ? "metadata_json::jsonb #>> '{initiator,principalId}'=:ownerPrincipalId"
    : "initiator_principal_id=:ownerPrincipalId";
  const row = await getAsyncDatabaseClient().queryOne<{
    status: string; locked_by: string | null; worker_completion_json: unknown;
  }>(`SELECT status,locked_by,worker_completion_json FROM ${table}
      WHERE id=:jobId AND company_id=:companyId AND ${ownerPredicate}`,
    { jobId, companyId: actor.companyId, ownerPrincipalId: actor.ownerPrincipalId });
  if (!row) return NextResponse.json({ error: "WINDOWS_SERVICE_JOB_NOT_FOUND" }, { status: 404, headers });
  let receipt: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = typeof row.worker_completion_json === "string"
      ? JSON.parse(row.worker_completion_json)
      : row.worker_completion_json;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) receipt = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "WINDOWS_SERVICE_JOB_READBACK_UNAVAILABLE" }, { status: 503, headers });
  }
  if ((receipt && receipt.workerId !== actor.id) || (!receipt && row.locked_by !== actor.id)) {
    return NextResponse.json({ error: "WINDOWS_SERVICE_JOB_NOT_FOUND" }, { status: 404, headers });
  }
  return NextResponse.json({ kind, jobId, status: row.status, completion: receipt ?? null }, { headers });
}
