import crypto from "node:crypto";
import { NextResponse } from "next/server";

const purposes = ["preview_jobs", "preview_heartbeat", "recognition_jobs", "recognition_heartbeat", "settings_secret_probe", "solidworks_credential"] as const;
const capabilities = ["solidworks_3d_preview_png", "solidworks_2d_preview_png", "solidworks_document_manager"] as const;
export type WorkloadPurpose = typeof purposes[number];
export type WorkloadCapability = typeof capabilities[number];
export type VerifiedWorkloadActor = Readonly<{
  kind: "workload";
  id: string;
  purposes: readonly WorkloadPurpose[];
  capabilities: readonly WorkloadCapability[];
}>;
type Credential = { id: string; token: string; purposes: WorkloadPurpose[]; capabilities: WorkloadCapability[] };
type Authentication = { actor: VerifiedWorkloadActor } | { response: NextResponse };

function denied(code: string, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "cache-control": "private, no-store" } });
}

function readCredentials(): Credential[] | null {
  const value = process.env.PDM_WORKLOAD_AUTH_CREDENTIALS;
  if (!value || value.length > 16_384) return null;
  try {
    const config = JSON.parse(value);
    if (!config || config.schemaVersion !== "ai-pdm.workload-credentials.v1"
      || Object.keys(config).sort().join(",") !== "schemaVersion,workloads"
      || !Array.isArray(config.workloads) || config.workloads.length < 1 || config.workloads.length > 16) return null;
    const ids = new Set<string>(), tokens = new Set<string>();
    for (const row of config.workloads) {
      if (!row || Object.keys(row).sort().join(",") !== "capabilities,id,purposes,token"
        || typeof row.id !== "string" || safeWorkerId(row.id) !== row.id
        || typeof row.token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(row.token)
        || ids.has(row.id) || tokens.has(row.token)
        || !Array.isArray(row.purposes) || !row.purposes.length || new Set(row.purposes).size !== row.purposes.length
        || row.purposes.some((purpose: unknown) => !purposes.includes(purpose as WorkloadPurpose))
        || !Array.isArray(row.capabilities) || new Set(row.capabilities).size !== row.capabilities.length
        || row.capabilities.some((capability: unknown) => !capabilities.includes(capability as WorkloadCapability))) return null;
      const needsDocumentManager = row.purposes.some((purpose: WorkloadPurpose) => ["recognition_jobs", "recognition_heartbeat", "settings_secret_probe", "solidworks_credential"].includes(purpose));
      const needsPreview = row.purposes.some((purpose: WorkloadPurpose) => ["preview_jobs", "preview_heartbeat"].includes(purpose));
      if ((needsDocumentManager && !row.capabilities.includes("solidworks_document_manager"))
        || (needsPreview && !row.capabilities.some((capability: WorkloadCapability) => ["solidworks_2d_preview_png", "solidworks_3d_preview_png"].includes(capability)))) return null;
      ids.add(row.id); tokens.add(row.token);
    }
    return config.workloads;
  } catch { return null; }
}

/** Readiness only; it does not authenticate a request or return a credential. */
export function isWorkerPurposeConfigured(purpose: WorkloadPurpose): boolean {
  return readCredentials()?.some(credential => credential.purposes.includes(purpose)) ?? false;
}

/** Technical executor credential. Never a human Principal, grant, or reusable session. */
export function authenticateWorkerService(request: Request, purpose: WorkloadPurpose): Authentication {
  const configured = readCredentials();
  if (!configured) return { response: denied("WORKLOAD_AUTH_NOT_CONFIGURED", 503) };
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^[Bb][Ee][Aa][Rr][Ee][Rr] +([A-Za-z0-9_-]{43})$/u)?.[1];
  const legacyHeader = request.headers.get("x-pdm-preview-worker-token");
  if (!bearer || legacyHeader !== null) return { response: denied("WORKLOAD_FORBIDDEN", 403) };
  const supplied = Buffer.from(bearer, "utf8");
  const row = configured.find(credential => crypto.timingSafeEqual(supplied, Buffer.from(credential.token, "utf8")));
  if (!row || !row.purposes.includes(purpose)) return { response: denied("WORKLOAD_FORBIDDEN", 403) };
  const actor: VerifiedWorkloadActor = Object.freeze({ kind: "workload", id: row.id,
    purposes: Object.freeze([...row.purposes]), capabilities: Object.freeze([...row.capabilities]) });
  for (const header of ["x-pdm-preview-worker-id", "x-pdm-recognition-worker-id", "x-pdm-worker-id"]) {
    const label = request.headers.get(header);
    if (label !== null && label !== actor.id) return { response: denied("WORKLOAD_ID_MISMATCH", 403) };
  }
  return { actor };
}

export function rejectWorkerLabel(actor: VerifiedWorkloadActor, claimed: unknown) {
  return claimed === undefined || claimed === actor.id ? null : denied("WORKLOAD_ID_MISMATCH", 403);
}

export function rejectWorkerCapability(actor: VerifiedWorkloadActor, capability: WorkloadCapability) {
  return actor.capabilities.includes(capability) ? null : denied("WORKLOAD_CAPABILITY_FORBIDDEN", 403);
}

export function safeWorkerId(value: unknown) {
  const workerId = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{1,120}$/u.test(workerId)) return null;
  return workerId;
}
