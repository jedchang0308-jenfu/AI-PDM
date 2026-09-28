import { numberStateFlowJson } from "@/lib/number-state-flow-api";
import { buildTransferPackageReadiness } from "@/lib/transfer-package-phase1d";
import { transferPhase1dErrorResponse } from "@/lib/transfer-package-phase1d-api";
import { withPrincipalCompanyRead } from "@/lib/principal-company-read";
import { requestedPdmCompanyCodeFromRequest } from "@/lib/company-context";
import { resolveJenfuRoutePolicyFromRequest } from "@/lib/jenfu-route-permission-map";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const policy = resolveJenfuRoutePolicyFromRequest(request, "transfer.package.view");
  if (policy?.path !== "src/app/api/transfer-packages/[id]/readiness-summary/route.ts" ||
      policy.scopeResolver !== "workspace") {
    return numberStateFlowJson({ code: "principal_route_policy_unavailable" }, { status: 503 });
  }
  const { id } = await params;
  return await withPrincipalCompanyRead(request, requestedPdmCompanyCodeFromRequest(request),
    [{ permissionKind: "action", permissionCode: "transfer.package.view" }],
    async (snapshot, company) => {
      try {
        const readiness = await buildTransferPackageReadiness(id, company.companyId, snapshot);
        return numberStateFlowJson({ readiness, pdmCompany: company });
      } catch (error) {
        return transferPhase1dErrorResponse(error, "readiness");
      }
    }) ?? numberStateFlowJson({ code: "auth_session_invalid" }, { status: 401 });
}
