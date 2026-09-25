import { NextResponse } from "next/server";
import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";
import { resolveRequiredMaForBaselineAsync, Shared3dBaselineError } from "@/lib/shared-3d-baseline";
import { requestedPdmCompanyCodeFromRequest } from "@/lib/company-context";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalCompanyRead } from "@/lib/principal-company-read";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";

export const runtime = "nodejs";

async function resolveForRequest(request: Request, ownerScope: unknown, ownerCode: unknown) {
  if (principalSessionTokenFromRequest(request)) {
    const routePath = "src/app/api/manufacturing-baselines/resolve/route.ts";
    const policy = resolveJenfuRoutePolicy(routePath, request.method,
      { expectedPermissionCode: "manufacturing.baseline.view" });
    if (policy?.path !== routePath || policy.authorizationMode !== "permission") {
      return NextResponse.json({ code: "principal_route_policy_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    return await withPrincipalCompanyRead(request, requestedPdmCompanyCodeFromRequest(request),
      [{ permissionKind: "action", permissionCode: "manufacturing.baseline.view" }],
      async (snapshot, company) => {
        try {
          const result = await resolveRequiredMaForBaselineAsync({
            ownerScope: ownerScope === "part_root" ? "part_root" : "part_number",
            ownerCode: String(ownerCode ?? "")
          }, snapshot);
          if (result.owner.companyId !== company.companyId) {
            return NextResponse.json({ code: "entitlement_scope_mismatch" },
              { status: 403, headers: { "cache-control": "no-store" } });
          }
          return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
        } catch (error) {
          return shared3dErrorResponse(error);
        }
      }) ?? NextResponse.json({ code: "auth_session_invalid" }, { status: 401 });
  }
  const auth = await requirePdmRouteAuthorizationAsync(request, ["Engineer", "R&D Manager", "Admin", "Manufacturing"]);
  if (auth.response || !auth.user) return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await resolveRequiredMaForBaselineAsync({
      ownerScope: ownerScope === "part_root" ? "part_root" : "part_number",
      ownerCode: String(ownerCode ?? "")
    });
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return shared3dErrorResponse(error);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return resolveForRequest(request, url.searchParams.get("ownerScope"), url.searchParams.get("ownerCode"));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return resolveForRequest(request, body.ownerScope, body.ownerCode);
}

function shared3dErrorResponse(error: unknown) {
  if (error instanceof Shared3dBaselineError) {
    return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
  }
  return NextResponse.json({ error: "BASELINE_RESOLVE_FAILED", message: "製造基準包 required-MA 解析失敗，請稍後重試或通知 Admin。" }, { status: 500 });
}
