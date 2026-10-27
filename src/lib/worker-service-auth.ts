import { NextResponse } from "next/server";
import {
  authenticateWindowsServiceDevice,
  type VerifiedWindowsServiceDevice
} from "@/lib/windows-service-device-auth";
import {
  WINDOWS_SERVICE_CAPABILITIES,
  WINDOWS_SERVICE_PURPOSES
} from "@/lib/windows-service-devices";

export type WorkloadPurpose = typeof WINDOWS_SERVICE_PURPOSES[number];
export type WorkloadCapability = typeof WINDOWS_SERVICE_CAPABILITIES[number];
export type VerifiedWorkloadActor = VerifiedWindowsServiceDevice;
type Authentication<T> = { actor: T } | { response: NextResponse };

function denied(code: string, status: number) {
  return NextResponse.json({ error: code }, { status, headers: { "cache-control": "private, no-store" } });
}

/** Product capability readiness. Runtime authorization is always a current DB device read. */
export function isWorkerPurposeConfigured(purpose: WorkloadPurpose): boolean {
  return WINDOWS_SERVICE_PURPOSES.includes(purpose);
}

/**
 * Authenticate one user-owned DEV-125 Windows device. There is no anonymous,
 * shared-key or environment-credential fallback: token hash, device status,
 * owner account, current Principal grant and instance are re-read for every request.
 */
export async function authenticateWorkerService(
  request: Request,
  purpose: WorkloadPurpose
): Promise<Authentication<VerifiedWorkloadActor>> {
  if (!WINDOWS_SERVICE_PURPOSES.includes(purpose)) return { response: denied("WORKLOAD_FORBIDDEN", 403) };
  const authentication = await authenticateWindowsServiceDevice(request);
  if ("response" in authentication) return authentication;
  const actor = authentication.actor;
  if (!actor.purposes.includes(purpose)) return { response: denied("WORKLOAD_FORBIDDEN", 403) };
  for (const header of ["x-pdm-preview-worker-id", "x-pdm-recognition-worker-id"]) {
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
