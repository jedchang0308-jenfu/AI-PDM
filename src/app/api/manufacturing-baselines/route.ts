import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { authorizeDynamicResourceCapabilityInSnapshot } from "@/lib/principal-resource-capability";
import { withPrincipalCompanyWrite } from "@/lib/principal-company-read";
import { createManufacturingBaselineDraftAsync, Shared3dBaselineError } from "@/lib/shared-3d-baseline";

export const runtime = "nodejs";
const routePath = "src/app/api/manufacturing-baselines/route.ts";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const input = {
    ownerScope: body.ownerScope === "part_root" ? "part_root" as const : "part_number" as const,
    ownerCode: String(body.ownerCode ?? ""),
    sharedModelVersionId: String(body.sharedModelVersionId ?? ""),
    baselineRevision: String(body.baselineRevision ?? "1"),
    selectedPackageIds: Array.isArray(body.selectedPackageIds) ? body.selectedPackageIds.map(String) : [],
    exclusions: Array.isArray(body.exclusions)
      ? body.exclusions.map((item) => ({
          drawingNumberId: String((item as Record<string, unknown>).drawingNumberId ?? ""),
          reason: String((item as Record<string, unknown>).reason ?? ""),
          approved: (item as Record<string, unknown>).approved === true
        }))
      : []
  };
  if (principalSessionTokenFromRequest(request)) {
    return withPrincipalCompanyWrite(request, routePath, "manufacturing.baseline.manage",
      async (snapshot, company, verified) => {
        const denial = await authorizeDynamicResourceCapabilityInSnapshot(
          snapshot, verified, ["transfer"], "edit", { workspaceCode: company.companyId });
        if (denial) return denial;
        try {
          const result = await createManufacturingBaselineDraftAsync({
            ...input,
            actorId: verified.profile.pdmUserId
          }, {
            client: snapshot,
            companyId: company.companyId,
            principalAudit: { principalId: verified.session.principalId, companyId: company.companyId }
          });
          return NextResponse.json(result, {
            status: 201, headers: { "cache-control": "private, no-store" }
          });
        } catch (error) {
          return shared3dErrorResponse(error);
        }
      }, { expectedScopeResolver: "baseline company" });
  }
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await createManufacturingBaselineDraftAsync({
      ...input,
      actorId: auth.user.id,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return shared3dErrorResponse(error);
  }
}

function shared3dErrorResponse(error: unknown) {
  if (error instanceof Shared3dBaselineError) {
    return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return NextResponse.json({ error: "BASELINE_CREATE_FAILED", message: "製造基準包建立失敗，請稍後重試或通知 Admin。" }, { status: 500 });
}
