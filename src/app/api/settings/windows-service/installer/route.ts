import { readWindowsServiceInstaller, WindowsServiceInstallerError } from "@/lib/windows-service-installer";
import { windowsServiceAdminReadRoute } from "@/lib/windows-service-admin-route";

export const runtime = "nodejs";
const routePath = "src/app/api/settings/windows-service/installer/route.ts";

export async function GET(request: Request) {
  return windowsServiceAdminReadRoute(request, routePath, async () => {
    try {
      const { manifest, bytes } = await readWindowsServiceInstaller();
      return new Response(bytes, { headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${manifest.fileName}"`,
        "content-length": String(bytes.byteLength),
        "content-type": "application/vnd.microsoft.portable-executable",
        "x-content-sha256": manifest.sha256,
        "x-pdm-source-revision": manifest.sourceRevision,
        "x-pdm-windows-service-version": manifest.version
      } });
    } catch (error) {
      if (error instanceof WindowsServiceInstallerError) {
        return Response.json({ error: error.code }, { status: error.status,
          headers: { "cache-control": "private, no-store" } });
      }
      throw error;
    }
  });
}
