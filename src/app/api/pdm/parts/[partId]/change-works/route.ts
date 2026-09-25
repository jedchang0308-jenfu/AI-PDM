import { PartChangeWorkService } from "@/lib/part-change-work";
import { dev087CommandContext, dev087Json, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalDev087Route } from "@/lib/pdm-principal-dev087-route";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ partId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (token) return withPrincipalDev087Route(request, token, {
    path: "src/app/api/pdm/parts/[partId]/change-works/route.ts", method: "POST",
    permissionCode: "numbering.workspace.create", readOnly: false
  }, async (tx, verified) => {
    const { partId } = await params;
    const body = await dev087Json(request);
    return dev087Success(await new PartChangeWorkService(tx)
      .createPrincipal(partId, verified, dev087CommandContext(request), body.initialPayload));
  });
  const access = await resolveDev087RouteActor(request, "numbering.search");
  if (access.response || !access.actor) return access.response;
  try {
    const { partId } = await params;
    const body = await dev087Json(request);
    return dev087Success(await new PartChangeWorkService()
      .create(partId, access.actor, dev087CommandContext(request), body.initialPayload));
  } catch (error) { return dev087RouteError(error); }
}
