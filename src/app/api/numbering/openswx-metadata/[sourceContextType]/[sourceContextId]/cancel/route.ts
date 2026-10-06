import { withPrincipalCompanyWrite } from "@/lib/principal-company-read";
import { requireOpenSwxContext } from "@/lib/openswx-metadata-contract";
import { OpenSwxMetadataService, openSwxErrorResponse, openSwxHumanStatusProjection, openSwxPrivateHeaders, readOpenSwxJson } from "@/lib/openswx-metadata";
import { isOpenSwxDispatchConfigured } from "@/lib/openswx-metadata-dispatch";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ sourceContextType: string; sourceContextId: string }> }) {
  try {
    const body = await readOpenSwxJson(request, ["sourceAssetIds"], 4096), params = await context.params;
    const selection = { ...requireOpenSwxContext(params.sourceContextType, params.sourceContextId), sourceAssetIds: body.sourceAssetIds as string[] };
    return await withPrincipalCompanyWrite(request, "src/app/api/numbering/openswx-metadata/[sourceContextType]/[sourceContextId]/cancel/route.ts", "numbering.recognition.run", async (snapshot, _company, verified) => {
      try { return Response.json(openSwxHumanStatusProjection(await new OpenSwxMetadataService(snapshot).cancelContext(verified, selection), isOpenSwxDispatchConfigured()), { headers: openSwxPrivateHeaders }); }
      catch (error) { return openSwxErrorResponse(error); }
    });
  } catch (error) { return openSwxErrorResponse(error); }
}
