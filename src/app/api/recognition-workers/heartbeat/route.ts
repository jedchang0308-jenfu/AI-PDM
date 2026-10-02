import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncSettingsSecretRepository } from "@/lib/repositories/settings-secret-async-repository";
import { authenticateWorkerService, rejectWorkerLabel, rejectWorkerCapability } from "@/lib/worker-service-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authentication = authenticateWorkerService(request, "recognition_heartbeat");
  if ("response" in authentication) return authentication.response;
  const { actor } = authentication;
  const capabilityDenied = rejectWorkerCapability(actor, "solidworks_document_manager");
  if (capabilityDenied) return capabilityDenied;
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "INVALID_WORKER_BODY" }, { status: 400 });
  const labelDenied = rejectWorkerLabel(actor, body.workerId);
  if (labelDenied) return labelDenied;
  const workerId = actor.id;
  const capability = String(body?.capability ?? "").trim();
  if (!workerId || capability !== "solidworks_document_manager") return NextResponse.json({ error: "INVALID_WORKER_CAPABILITY" }, { status: 400 });
  const status = body?.status === "ready" || body?.status === "degraded" ? body.status : "blocked";
  const now = new Date().toISOString();
  const repository = new AsyncSettingsSecretRepository(getAsyncDatabaseClient());
  await repository.upsertWorkerCapabilityHeartbeat({
    workerId,
    workerKind: "drawing-recognition",
    capabilityCode: capability,
    status,
    appliedSecretKind: body?.appliedSecretKind ? String(body.appliedSecretKind).slice(0, 80) : null,
    appliedSecretVersion: Number.isInteger(body?.appliedSecretVersion) ? body.appliedSecretVersion : null,
    appliedSecretFingerprint: body?.appliedSecretFingerprint ? String(body.appliedSecretFingerprint).slice(0, 128) : null,
    readerVersion: body?.readerVersion ? String(body.readerVersion).slice(0, 120) : null,
    issueCode: body?.issueCode ? String(body.issueCode).slice(0, 120) : null,
    lastAppliedAt: body?.lastAppliedAt ? String(body.lastAppliedAt) : null,
    lastSeenAt: now,
    updatedAt: now
  });
  return NextResponse.json({ ok: true, lastSeenAt: now }, { headers: { "cache-control": "private, no-store" } });
}
