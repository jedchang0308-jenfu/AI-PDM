import { WindowsServiceDeviceRepository, windowsServiceRequestHash } from "@/lib/windows-service-devices";
import {
  assertWindowsServiceKeys,
  windowsServiceAdminWriteRoute,
  windowsServiceEnrollmentCreator,
  WindowsServiceHttpError
} from "@/lib/windows-service-admin-route";

export const runtime = "nodejs";
const routePath = "src/app/api/settings/windows-service/enrollments/route.ts";
const headers = { "cache-control": "private, no-store" };

export async function POST(request: Request) {
  return windowsServiceAdminWriteRoute(request, routePath, async (client, company, verified, body) => {
    assertWindowsServiceKeys(body, ["requestId", "codeHash"]);
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    const codeHash = typeof body.codeHash === "string" ? body.codeHash.toLowerCase() : "";
    if (!/^[0-9a-f-]{36}$/u.test(requestId) || !/^[a-f0-9]{64}$/u.test(codeHash)) {
      throw new WindowsServiceHttpError("WINDOWS_SERVICE_ENROLLMENT_INPUT_INVALID", 422);
    }
    const repository = new WindowsServiceDeviceRepository(client);
    const result = await repository.createEnrollment({
      companyId: company.companyId,
      requestId,
      codeHash,
      requestHash: windowsServiceRequestHash({ companyId: company.companyId, requestId, codeHash }),
      ...windowsServiceEnrollmentCreator(verified)
    });
    return Response.json({ id: result.enrollment.id, expiresAt: result.enrollment.expiresAt },
      { status: result.created ? 201 : 200, headers });
  });
}
