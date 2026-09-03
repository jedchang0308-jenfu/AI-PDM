import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncSettingsSecretRepository } from "@/lib/repositories/settings-secret-async-repository";
import { requireWorkerServiceToken, safeWorkerId } from "@/lib/worker-service-auth";

export const runtime = "nodejs";

const capabilityKinds = {
  solidworks_2d_preview_png: "solidworks-2d-preview",
  solidworks_3d_preview_png: "solidworks-3d-preview"
} as const;

type PreviewCapabilityCode = keyof typeof capabilityKinds;

function previewCapability(value: unknown): PreviewCapabilityCode | null {
  const normalized = String(value ?? "").trim();
  return normalized in capabilityKinds ? normalized as PreviewCapabilityCode : null;
}

export async function POST(request: Request) {
  const denied = requireWorkerServiceToken(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const workerId = safeWorkerId(body?.workerId);
  const capabilityCode = previewCapability(body?.capability);
  if (!workerId || !capabilityCode) {
    return NextResponse.json({ error: "INVALID_WORKER_CAPABILITY" }, { status: 400 });
  }

  const status = body?.status === "ready" || body?.status === "degraded" ? body.status : "blocked";
  const now = new Date().toISOString();
  await new AsyncSettingsSecretRepository(getAsyncDatabaseClient()).upsertWorkerCapabilityHeartbeat({
    workerId,
    workerKind: capabilityKinds[capabilityCode],
    capabilityCode,
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

  return NextResponse.json({ ok: true, capability: capabilityCode, lastSeenAt: now }, {
    headers: { "cache-control": "private, no-store" }
  });
}

export async function GET(request: Request) {
  const denied = requireWorkerServiceToken(request);
  if (denied) return denied;

  const capabilityCode = previewCapability(new URL(request.url).searchParams.get("capability"));
  if (!capabilityCode) return NextResponse.json({ error: "INVALID_WORKER_CAPABILITY" }, { status: 400 });
  const heartbeat = await new AsyncSettingsSecretRepository(getAsyncDatabaseClient())
    .getLatestWorkerCapabilityHeartbeat(capabilityCode);
  const fresh = Boolean(heartbeat && Date.parse(heartbeat.lastSeenAt) >= Date.now() - 30_000);
  return NextResponse.json({
    capability: capabilityCode,
    status: heartbeat?.status ?? "degraded",
    fresh,
    workerId: heartbeat?.workerId ?? null,
    readerVersion: heartbeat?.readerVersion ?? null,
    issueCode: heartbeat?.issueCode ?? "preview_capability_missing",
    lastSeenAt: heartbeat?.lastSeenAt ?? null
  }, { headers: { "cache-control": "private, no-store" } });
}
