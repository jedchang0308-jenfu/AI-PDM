import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { authenticateWindowsServiceDevice, windowsServiceDeviceErrorResponse } from "@/lib/windows-service-device-auth";
import { WindowsServiceDeviceRepository } from "@/lib/windows-service-devices";

export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store" };

export async function POST(request: Request) {
  const authentication = await authenticateWindowsServiceDevice(request);
  if ("response" in authentication) return authentication.response;
  const { actor } = authentication;
  try {
    const device = await new WindowsServiceDeviceRepository(getAsyncDatabaseClient()).heartbeat({
      credentialHash: actor.credentialHash,
      deviceId: actor.deviceId,
      companyId: actor.companyId,
      instanceId: actor.instanceId!
    });
    return NextResponse.json({ ok: true, lastSeenAt: device.lastSeenAt }, { headers });
  } catch (error) { return windowsServiceDeviceErrorResponse(error); }
}
