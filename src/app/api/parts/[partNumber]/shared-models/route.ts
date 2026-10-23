import { NextResponse } from "next/server";
import { requestedPdmCompanyCodeFromRequest } from "@/lib/company-context";
import { authorizeDynamicResourceCapabilityInSnapshot } from "@/lib/principal-resource-capability";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { withPrincipalCompanyRead, withPrincipalCompanyWrite } from "@/lib/principal-company-read";
import {
  createSharedModelVersionAsync,
  listSharedModelVersionsAsync,
  Shared3dBaselineError
} from "@/lib/shared-3d-baseline";

export const runtime = "nodejs";

const routePath = "src/app/api/parts/[partNumber]/shared-models/route.ts";

export async function GET(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const policy = resolveJenfuRoutePolicy(routePath, "GET", { expectedPermissionCode: "pdm.shared_model.view" });
  if (policy?.path !== routePath || policy.authorizationMode !== "permission" || policy.scopeResolver !== "Part company") {
    return NextResponse.json({ code: "principal_route_policy_unavailable" }, {
      status: 503, headers: { "cache-control": "no-store" }
    });
  }
  const { partNumber } = await params;
  const response = await withPrincipalCompanyRead(request, requestedPdmCompanyCodeFromRequest(request),
    [{ permissionKind: "action", permissionCode: "pdm.shared_model.view" }],
    async (snapshot, company, verified) => {
      const denial = await authorizeDynamicResourceCapabilityInSnapshot(
        snapshot, verified, ["part", "model"], "view", { workspaceCode: company.companyId }
      );
      if (denial) return denial;
      try {
        const result = await listSharedModelVersionsAsync({
          ownerScope: "part_number",
          ownerCode: decodeURIComponent(partNumber)
        }, { client: snapshot, companyId: company.companyId });
        return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
      } catch (error) {
        return shared3dErrorResponse(error);
      }
    });
  return response ?? NextResponse.json({ code: "auth_session_invalid" }, { status: 401 });
}

export async function POST(request: Request, { params }: { params: Promise<{ partNumber: string }> }) {
  const raw = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "SHARED_MODEL_BODY_INVALID" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;
  const rawStatus = body.status === undefined ? "Released" : String(body.status).trim();
  if (rawStatus !== "Draft" && rawStatus !== "Released") {
    return NextResponse.json({ error: "SHARED_MODEL_STATUS_INVALID" }, { status: 400 });
  }
  const statusValue: "Draft" | "Released" = rawStatus;
  const sourceFileAssetId = String(body.sourceFileAssetId ?? body.attachmentId ?? "").trim();
  if (!sourceFileAssetId) {
    return NextResponse.json({ error: "SHARED_MODEL_SOURCE_REQUIRED" }, { status: 400 });
  }
  const { partNumber } = await params;
  return withPrincipalCompanyWrite(request, routePath, "pdm.shared_model.manage",
    async (snapshot, company, verified) => {
      const viewDenial = await authorizeDynamicResourceCapabilityInSnapshot(
        snapshot, verified, ["part", "model"], "view",
        { workspaceCode: company.companyId }
      );
      if (viewDenial) return viewDenial;
      const editDenial = await authorizeDynamicResourceCapabilityInSnapshot(
        snapshot, verified, ["model"], "edit", { workspaceCode: company.companyId }
      );
      if (editDenial) return editDenial;
      try {
        const result = await createSharedModelVersionAsync({
          ownerScope: "part_number",
          ownerCode: decodeURIComponent(partNumber),
          sourceFileAssetId,
          modelRevision: String(body.modelRevision ?? ""),
          actorId: verified.profile.pdmUserId,
          status: statusValue,
          releaseReason: String(body.releaseReason ?? ""),
          allowSameHashNewLabel: body.allowSameHashNewLabel === true
        }, {
          client: snapshot,
          companyId: company.companyId,
          principalAudit: { principalId: verified.session.principalId, companyId: company.companyId },
          beforeNewRelease: statusValue === "Released" ? async () => {
            const publishDenial = await authorizeDynamicResourceCapabilityInSnapshot(
              snapshot, verified, ["part", "model"], "publish", { workspaceCode: company.companyId }
            );
            if (publishDenial) {
              throw new Shared3dBaselineError(
                publishDenial.status === 403 ? "SHARED_MODEL_PUBLISH_NOT_ALLOWED" : "principal_dependency_unavailable",
                publishDenial.status === 403 ? "目前 Principal 沒有發行共用 3D model 的權限。" : "目前無法確認發布權限。",
                publishDenial.status
              );
            }
          } : undefined
        });
        return NextResponse.json(result, {
          status: result.reused ? 200 : 201,
          headers: { "cache-control": "private, no-store" }
        });
      } catch (error) {
        return shared3dErrorResponse(error);
      }
    }, { expectedScopeResolver: "Part company" });
}

function shared3dErrorResponse(error: unknown) {
  if (error instanceof Shared3dBaselineError) {
    return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return NextResponse.json({ error: "SHARED_3D_OPERATION_FAILED", message: "共用 3D 操作失敗，請稍後重試或通知 Admin。" }, { status: 500 });
}
