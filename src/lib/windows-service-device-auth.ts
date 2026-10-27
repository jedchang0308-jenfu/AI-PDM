import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  WINDOWS_SERVICE_CAPABILITIES,
  WINDOWS_SERVICE_PURPOSES,
  WindowsServiceDeviceRepository,
  windowsServiceCredentialHash,
  type WindowsServiceDevice
} from "@/lib/windows-service-devices";
import { JenfuPrincipalAccountError } from "@/lib/jenfu-principal-account-repository";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";

export type VerifiedWindowsServiceDevice = Readonly<{
  kind: "windows_service_device";
  id: string;
  deviceId: string;
  companyId: string;
  instanceId: string | null;
  credentialHash: string;
  ownerPrincipalId: string;
  owner: Readonly<{
    principalId: string;
    employeeId: string;
    pdmUserId: string;
    companyId: string;
    identityIssuer: string;
    identitySubject: string;
  }>;
  device: WindowsServiceDevice;
  purposes: typeof WINDOWS_SERVICE_PURPOSES;
  capabilities: typeof WINDOWS_SERVICE_CAPABILITIES;
}>;

type Authentication = { actor: VerifiedWindowsServiceDevice } | { response: NextResponse };
const headers = { "cache-control": "private, no-store" };

function denied(code: string, status: number) {
  return { response: NextResponse.json({ error: code }, { status, headers }) };
}

export async function authenticateWindowsServiceDevice(
  request: Request, input: { bootstrap?: boolean } = {}
): Promise<Authentication> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^[Bb][Ee][Aa][Rr][Ee][Rr] +([A-Za-z0-9_-]{43})$/u)?.[1];
  if (!token || request.headers.has("x-pdm-preview-worker-token")) return denied("WORKER_DEVICE_UNAUTHORIZED", 403);
  const credentialHash = windowsServiceCredentialHash(token);
  let found;
  try {
    found = await new WindowsServiceDeviceRepository(getAsyncDatabaseClient()).findAuthorizedByCredentialHash(credentialHash);
  } catch (error) {
    if ((error instanceof JenfuPrincipalAccountError && ["principal_account_missing", "principal_account_inactive"].includes(error.code)) ||
        (error instanceof JenfuEntitlementRepositoryError && error.code === "permission_not_granted")) {
      return denied("WORKER_DEVICE_UNAUTHORIZED", 403);
    }
    return denied("WORKER_DEVICE_AUTH_UNAVAILABLE", 503);
  }
  if (!found || found.device.status !== "active" || found.device.protocolVersion !== 1) {
    return denied("WORKER_DEVICE_UNAUTHORIZED", 403);
  }
  const device = found.device;
  const instanceLabel = device.instanceId ? `${device.id}:${device.instanceId}` : null;
  if (!input.bootstrap) {
    const suppliedLabel = request.headers.get("x-pdm-worker-id");
    if (!instanceLabel || suppliedLabel !== instanceLabel) return denied("WORKER_DEVICE_UNAUTHORIZED", 403);
  }
  const actor: VerifiedWindowsServiceDevice = Object.freeze({
    kind: "windows_service_device", id: input.bootstrap ? device.id : instanceLabel!,
    deviceId: device.id, companyId: device.companyId, instanceId: device.instanceId,
    ownerPrincipalId: device.ownerPrincipalId, owner: Object.freeze(found.owner),
    credentialHash, device,
    purposes: WINDOWS_SERVICE_PURPOSES,
    capabilities: WINDOWS_SERVICE_CAPABILITIES
  });
  return { actor };
}

export function windowsServiceDeviceErrorResponse(error: unknown) {
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === "string" ? candidate.code : "WINDOWS_SERVICE_REQUEST_FAILED";
  const status = typeof candidate?.status === "number" && candidate.status >= 400 && candidate.status <= 599
    ? candidate.status : 500;
  const responseHeaders: Record<string, string> = { ...headers };
  if (status === 429) responseHeaders["retry-after"] = "60";
  return NextResponse.json({ error: code }, { status, headers: responseHeaders });
}
