import { WindowsServiceDeviceRepository } from "@/lib/windows-service-devices";
import { windowsServiceUserReadRoute } from "@/lib/windows-service-admin-route";

export const runtime = "nodejs";
const routePath = "src/app/api/settings/windows-service/devices/route.ts";
const headers = { "cache-control": "private, no-store" };

export async function GET(request: Request) {
  return windowsServiceUserReadRoute(request, routePath, async (client, company, verified, canManageAll) => {
    const devices = await new WindowsServiceDeviceRepository(client).list(company.companyId,
      canManageAll ? undefined : verified.session.principalId);
    return Response.json({ devices: devices.map((device) => ({
      id: device.id,
      name: device.name,
      serviceVersion: device.serviceVersion,
      status: device.status,
      connection: device.connection,
      capabilities: device.capabilities,
      lastSeenAt: device.lastSeenAt,
      rowVersion: device.rowVersion,
      ownedByCurrentUser: device.ownerPrincipalId === verified.session.principalId
    })), canManageAll }, { headers });
  });
}
