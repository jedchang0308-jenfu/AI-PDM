import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { authorizeDynamicResourceCapabilityInSnapshot } from "@/lib/principal-resource-capability";
import { withPrincipalCompanyWrite } from "@/lib/principal-company-read";
import { releaseManufacturingBaselineAsync, Shared3dBaselineError } from "@/lib/shared-3d-baseline";

export const runtime = "nodejs";
const routePath = "src/app/api/manufacturing-baselines/[baselineId]/release/route.ts";

export async function POST(request: Request, { params }: { params: Promise<{ baselineId: string }> }) {
  const { baselineId } = await params;
  if (principalSessionTokenFromRequest(request)) {
    return withPrincipalCompanyWrite(request, routePath, "manufacturing.baseline.release",
      async (snapshot, company, verified) => {
        const denial = await authorizeDynamicResourceCapabilityInSnapshot(
          snapshot, verified, ["transfer", "model"], "publish", { workspaceCode: company.companyId });
        if (denial) return denial;
        try {
          const result = await releaseManufacturingBaselineAsync({
            baselineId, actorId: verified.profile.pdmUserId
          }, {
            client: snapshot,
            companyId: company.companyId,
            principalAudit: { principalId: verified.session.principalId, companyId: company.companyId }
          });
          return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
        } catch (error) {
          return shared3dErrorResponse(error);
        }
      }, { expectedScopeResolver: "baseline company" });
  }
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await releaseManufacturingBaselineAsync({ baselineId, actorId: auth.user.id });
    return NextResponse.json(result);
  } catch (error) {
    return shared3dErrorResponse(error);
  }
}

function shared3dErrorResponse(error: unknown) {
  if (error instanceof Shared3dBaselineError) {
    return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return NextResponse.json({ error: "BASELINE_RELEASE_FAILED", message: "製造基準包發行失敗，請稍後重試或通知 Admin。" }, { status: 500 });
}
