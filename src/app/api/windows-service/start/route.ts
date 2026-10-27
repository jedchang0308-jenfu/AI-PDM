import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { authenticateWindowsServiceDevice, windowsServiceDeviceErrorResponse } from "@/lib/windows-service-device-auth";
import { WINDOWS_SERVICE_PROTOCOL_VERSION, WindowsServiceDeviceRepository } from "@/lib/windows-service-devices";

export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store" };

export async function POST(request: Request) {
  const authentication = await authenticateWindowsServiceDevice(request, { bootstrap: true });
  if ("response" in authentication) return authentication.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Array.isArray(body) || Object.keys(body).length !== 4 ||
      !["instanceId", "expectedRowVersion", "serviceVersion", "protocolVersion"].every((key) => key in body)) {
    return NextResponse.json({ error: "REQUEST_SCHEMA_INVALID" }, { status: 422, headers });
  }
  if (body.protocolVersion !== WINDOWS_SERVICE_PROTOCOL_VERSION) {
    return NextResponse.json({ error: "WORKER_PROTOCOL_UNSUPPORTED", protocolVersion: WINDOWS_SERVICE_PROTOCOL_VERSION },
      { status: 426, headers });
  }
  const { actor } = authentication;
  try {
    const device = await new WindowsServiceDeviceRepository(getAsyncDatabaseClient()).start({
      credentialHash: actor.credentialHash,
      deviceId: actor.deviceId,
      companyId: actor.companyId,
      instanceId: String(body.instanceId ?? ""),
      expectedRowVersion: Number(body.expectedRowVersion),
      serviceVersion: String(body.serviceVersion ?? ""),
      protocolVersion: Number(body.protocolVersion)
    });
    return NextResponse.json({ deviceId: device.id, instanceId: device.instanceId, rowVersion: device.rowVersion }, { headers });
  } catch (error) { return windowsServiceDeviceErrorResponse(error); }
}
