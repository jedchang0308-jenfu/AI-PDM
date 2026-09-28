import { numberStateFlowJson } from "@/lib/number-state-flow-api";
import { transferPackageErrorResponse } from "@/lib/transfer-package-api";
import { getTransferPackageWorkbenchContext } from "@/lib/transfer-packages";
import { requestedPdmCompanyCodeFromRequest } from "@/lib/company-context";
import { withPrincipalCompanyRead } from "@/lib/principal-company-read";
import { resolveJenfuRoutePolicyFromRequest } from "@/lib/jenfu-route-permission-map";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const routePath = "src/app/api/transfer-packages/workbench-context/route.ts";
  const policy = resolveJenfuRoutePolicyFromRequest(request, "transfer.package.create");
  if (policy?.path !== routePath || policy.scopeResolver !== "workspace") {
    return numberStateFlowJson({ code: "principal_route_policy_unavailable" }, { status: 503 });
  }
  const url = new URL(request.url);
  return await withPrincipalCompanyRead(request, requestedPdmCompanyCodeFromRequest(request),
    [{ permissionKind: "action", permissionCode: "transfer.package.create" }],
    async (snapshot, company) => {
      try {
        const context = await getTransferPackageWorkbenchContext({
          companyId: company.companyId, client: snapshot,
          sourceType: url.searchParams.get("sourceType"),
          sourceId: url.searchParams.get("sourceId"),
          caseType: url.searchParams.get("caseType")
        });
        return numberStateFlowJson({ context, pdmCompany: company });
      } catch (error) {
        return transferPackageErrorResponse(error, "技轉包建立脈絡讀取失敗。");
      }
    }) ?? numberStateFlowJson({ code: "auth_session_invalid" }, { status: 401 });
}
