import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { authorizeDynamicResourceCapabilityInSnapshot } from "@/lib/principal-resource-capability";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalCompanyWrite } from "@/lib/principal-company-read";
import { setDrawingPackageModelBasisAsync, Shared3dBaselineError } from "@/lib/shared-3d-baseline";

export const runtime = "nodejs";
const routePath = "src/app/api/numbering/drawing-revision-packages/[packageId]/model-basis/route.ts";

export async function POST(request: Request, { params }: { params: Promise<{ packageId: string }> }) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { packageId } = await params;
  if (principalSessionTokenFromRequest(request)) {
    return withPrincipalCompanyWrite(request, routePath, "pdm.shared_model.manage",
      async (snapshot, company, verified) => {
        // Linking a shared model edits the package/model relationship. The
        // existing combined 2D-only operation also confirms its exception,
        // so it retains edit and additionally requires review.
        const denial = await authorizeDynamicResourceCapabilityInSnapshot(
          snapshot, verified, ["drawing", "model"], "edit", { workspaceCode: company.companyId });
        if (denial) return denial;
        if (!body.sharedModelVersionId) {
          const reviewDenial = await authorizeDynamicResourceCapabilityInSnapshot(
            snapshot, verified, ["drawing", "model"], "review", { workspaceCode: company.companyId });
          if (reviewDenial) return reviewDenial;
        }
        try {
          const basis = await setDrawingPackageModelBasisAsync({
            packageId,
            actorId: verified.profile.pdmUserId,
            sharedModelVersionId: body.sharedModelVersionId ? String(body.sharedModelVersionId) : null,
            twoDOnlyReason: body.twoDOnlyReason ? String(body.twoDOnlyReason) : null,
            confirmTwoDOnly: body.confirmTwoDOnly === true
          }, {
            client: snapshot,
            companyId: company.companyId,
            principalAudit: { principalId: verified.session.principalId, companyId: company.companyId }
          });
          return NextResponse.json({ basis }, { headers: { "cache-control": "private, no-store" } });
        } catch (error) {
          return shared3dErrorResponse(error);
        }
      }, { expectedScopeResolver: "package company" });
  }
  const auth = await requirePdmRouteAuthorizationAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const basis = await setDrawingPackageModelBasisAsync({
      packageId,
      actorId: auth.user.id,
      sharedModelVersionId: body.sharedModelVersionId ? String(body.sharedModelVersionId) : null,
      twoDOnlyReason: body.twoDOnlyReason ? String(body.twoDOnlyReason) : null,
      confirmTwoDOnly: body.confirmTwoDOnly === true
    });
    return NextResponse.json({ basis });
  } catch (error) {
    return shared3dErrorResponse(error);
  }
}

function shared3dErrorResponse(error: unknown) {
  if (error instanceof Shared3dBaselineError) {
    return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return NextResponse.json({ error: "PACKAGE_MODEL_BASIS_FAILED", message: "圖面 model basis 設定失敗，請稍後重試或通知 Admin。" }, { status: 500 });
}
