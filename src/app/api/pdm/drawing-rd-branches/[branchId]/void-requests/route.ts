import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { dev087CommandContext, dev087Json, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalDev087Route } from "@/lib/pdm-principal-dev087-route";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ branchId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (token) return withPrincipalDev087Route(request, token, {
    path: "src/app/api/pdm/drawing-rd-branches/[branchId]/void-requests/route.ts",
    method: "POST", permissionCode: "numbering.draft.obsolete", readOnly: false
  }, async (tx, verified) => {
    const { branchId } = await params;
    const body = await dev087Json(request);
    if (Object.keys(body).length !== 1 || typeof body.rowKey !== "string") {
      return Response.json({ code: "invalid_void_request" }, { status: 422 });
    }
    return dev087Success(await new DrawingRevisionWorkService(tx)
      .requestVoidPrincipal(branchId, body.rowKey, verified, dev087CommandContext(request)));
  });
  const access = await resolveDev087RouteActor(request, "numbering.drawings.view");
  if (access.response || !access.actor) return access.response;
  try {
    const { branchId } = await params;
    const body = await dev087Json(request);
    return dev087Success(await new DrawingRevisionWorkService()
      .requestVoid(branchId, String(body.rowKey ?? ""), access.actor, dev087CommandContext(request)));
  } catch (error) { return dev087RouteError(error); }
}
