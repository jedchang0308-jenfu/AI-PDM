import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { authenticateWindowsServiceDevice } from "@/lib/windows-service-device-auth";
import { WindowsServiceDeviceRepository } from "@/lib/windows-service-devices";

export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store" };

export async function GET(request: Request) {
  const authentication = await authenticateWindowsServiceDevice(request, { bootstrap: true });
  if ("response" in authentication) return authentication.response;
  const { actor } = authentication;
  const activeJob = actor.instanceId
    ? await new WindowsServiceDeviceRepository(getAsyncDatabaseClient()).findActiveJob({
      companyId: actor.companyId, workerId: `${actor.deviceId}:${actor.instanceId}`
    }) : null;
  return NextResponse.json({
    deviceId: actor.deviceId,
    status: actor.device.status,
    instanceId: actor.instanceId,
    serviceVersion: actor.device.serviceVersion,
    protocolVersion: actor.device.protocolVersion,
    rowVersion: actor.device.rowVersion,
    activeJob
  }, { headers });
}
