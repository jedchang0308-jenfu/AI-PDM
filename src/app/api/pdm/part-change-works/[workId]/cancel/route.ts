import { PartChangeWorkService } from "@/lib/part-change-work";
import { dev087CommandContext, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalDev087Route } from "@/lib/pdm-principal-dev087-route";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ workId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (token) return withPrincipalDev087Route(request, token, {
    path: "src/app/api/pdm/part-change-works/[workId]/cancel/route.ts", method: "POST",
    permissionCode: "numbering.workspace.cancel", readOnly: false
  }, async (tx, verified) => {
    const { workId } = await params;
    return dev087Success(await new PartChangeWorkService(tx)
      .cancelPrincipal(workId, verified, dev087CommandContext(request)));
  });
  const access = await resolveDev087RouteActor(request, "numbering.search");
  if (access.response || !access.actor) return access.response;
  try {
    const { workId } = await params;
    return dev087Success(await new PartChangeWorkService()
      .cancel(workId, access.actor, dev087CommandContext(request)));
  } catch (error) { return dev087RouteError(error); }
}
