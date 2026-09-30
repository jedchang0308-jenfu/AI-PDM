import { servePublishedReleasePackage } from "@/lib/principal-published-release-package";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return servePublishedReleasePackage(request, params, {
    path: "src/app/api/handoff/[id]/release-package/route.ts", url: "/api/handoff/[id]/release-package",
    permissionCode: "handoff.published.view", scopeResolver: "published handoff company"
  });
}
