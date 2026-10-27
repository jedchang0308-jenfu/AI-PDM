import { WindowsServiceDeviceRepository } from "@/lib/windows-service-devices";
import {
  assertWindowsServiceKeys,
  windowsServiceUserWriteRoute,
  WindowsServiceHttpError
} from "@/lib/windows-service-admin-route";

export const runtime = "nodejs";
const routePath = "src/app/api/settings/windows-service/devices/[deviceId]/revoke/route.ts";
const headers = { "cache-control": "private, no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  return windowsServiceUserWriteRoute(request, routePath, async (client, company, verified, body, canManageAll) => {
    assertWindowsServiceKeys(body, ["expectedRowVersion"]);
    const expectedRowVersion = body.expectedRowVersion;
    if (!Number.isSafeInteger(expectedRowVersion) || Number(expectedRowVersion) < 1) {
      throw new WindowsServiceHttpError("WINDOWS_SERVICE_REVOKE_INPUT_INVALID", 422);
    }
    const { deviceId } = await params;
    const device = await new WindowsServiceDeviceRepository(client).revoke({
      companyId: company.companyId,
      deviceId,
      expectedRowVersion: Number(expectedRowVersion),
      actorPrincipalId: verified.session.principalId,
      canManageAll
    });
    return Response.json({ id: device.id, status: device.status, rowVersion: device.rowVersion }, { headers });
  });
}
