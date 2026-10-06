import { withPrincipalCompanyWrite } from "@/lib/principal-company-read";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { resolveJenfuRoutePolicyFromRequest } from "@/lib/jenfu-route-permission-map";
import { requireOpenSwxContext } from "@/lib/openswx-metadata-contract";
import { OpenSwxMetadataService, openSwxErrorResponse, openSwxHumanProjection, openSwxHumanStatusProjection, openSwxPrivateHeaders, readOpenSwxJson } from "@/lib/openswx-metadata";
import { isOpenSwxDispatchConfigured } from "@/lib/openswx-metadata-dispatch";
export const runtime = "nodejs";
const routePath = "src/app/api/numbering/openswx-metadata/[sourceContextType]/[sourceContextId]/route.ts";
type Context = { params: Promise<{ sourceContextType: string; sourceContextId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    if (resolveJenfuRoutePolicyFromRequest(request, "numbering.recognition.review")?.path !== routePath) return Response.json({ code: "principal_route_policy_unavailable" }, { status: 503, headers: openSwxPrivateHeaders });
    const params = await context.params, selected = new URL(request.url).searchParams;
    if ([...selected.keys()].some(k => k !== "sourceAssetId")) return Response.json({ code: "OPENSWX_BODY_INVALID" }, { status: 400, headers: openSwxPrivateHeaders });
    const selection = { ...requireOpenSwxContext(params.sourceContextType, params.sourceContextId), sourceAssetIds: selected.getAll("sourceAssetId") };
    const response = await withPrincipalNumberingCompanyRead(request, [{ permissionKind: "action", permissionCode: "numbering.recognition.review" }], async (snapshot, _company, verified) => {
      try { return Response.json(openSwxHumanProjection(await new OpenSwxMetadataService(snapshot).humanRead(verified, selection), isOpenSwxDispatchConfigured()), { headers: openSwxPrivateHeaders }); }
      catch (error) { return openSwxErrorResponse(error); }
    });
    return response ?? Response.json({ code: "auth_session_invalid" }, { status: 401, headers: openSwxPrivateHeaders });
  } catch (error) { return openSwxErrorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const body = await readOpenSwxJson(request, ["sourceAssetIds"], 4096), params = await context.params;
    const selection = { ...requireOpenSwxContext(params.sourceContextType, params.sourceContextId), sourceAssetIds: body.sourceAssetIds as string[] };
    return await withPrincipalCompanyWrite(request, routePath, "numbering.recognition.run", async (snapshot, _company, verified) => {
      try { return Response.json(openSwxHumanStatusProjection(await new OpenSwxMetadataService(snapshot).enqueue(verified, selection), isOpenSwxDispatchConfigured()), { status: 202, headers: openSwxPrivateHeaders }); }
      catch (error) { return openSwxErrorResponse(error); }
    });
  } catch (error) { return openSwxErrorResponse(error); }
}
