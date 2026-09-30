import { servePublishedReleasePackage } from "@/lib/principal-published-release-package";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return servePublishedReleasePackage(request, params, {
    path: "src/app/api/integrations/procurement/releases/[id]/package/route.ts", url: "/api/integrations/procurement/releases/[id]/package",
    permissionCode: "integration.procurement.view", scopeResolver: "published procurement company"
  });
}
