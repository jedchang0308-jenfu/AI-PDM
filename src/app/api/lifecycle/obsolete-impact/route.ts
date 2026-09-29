import { NextResponse } from "next/server";
import { FormalObsoleteImpactError, getFormalObsoleteImpactAsync } from "@/lib/numbering-obsolete-impact";
import { requestedNumberingCompanyCodeFromRequest } from "@/lib/numbering-company-context";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalCompanyRead } from "@/lib/principal-company-read";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!principalSessionTokenFromRequest(request)) return NextResponse.json({ code: "auth_session_invalid" },
    { status: 401, headers: { "cache-control": "no-store" } });
  const routePath = "src/app/api/lifecycle/obsolete-impact/route.ts";
  const policy = resolveJenfuRoutePolicy(routePath, "GET",
    { expectedPermissionCode: "numbering.search" });
  if (policy?.path !== routePath || policy.authorizationMode !== "permission" ||
      policy.scopeResolver !== "workspace") {
    return NextResponse.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  return (await withPrincipalCompanyRead(request,
    requestedNumberingCompanyCodeFromRequest(request),
    [{ permissionKind: "page", permissionCode: "numbering.search" }],
    async (snapshot, company) => {
      const url = new URL(request.url);
      const entityType = url.searchParams.get("entityType");
      if (entityType !== "drawing_number" && entityType !== "part_number") {
        return NextResponse.json({ error: "LIFE_UNSUPPORTED_ENTITY" }, { status: 400 });
      }
      try {
        const impact = await getFormalObsoleteImpactAsync({
          companyId: company.companyId, entityType,
          entityId: url.searchParams.get("entityId"),
          entityCode: url.searchParams.get("entityCode"), client: snapshot
        });
        if (impact.recordStatus !== "Active" && impact.recordStatus !== "Released") {
          return NextResponse.json({ error: "LIFE_OBSOLETE_NOT_FORMAL",
            message: "此資料尚未正式發行，不能申請作廢。" },
          { status: 409, headers: { "cache-control": "private, no-store" } });
        }
        return NextResponse.json({ impact, pdmCompany: company },
          { headers: { "cache-control": "private, no-store" } });
      } catch (error) {
        if (error instanceof FormalObsoleteImpactError) {
          const status = error.code === "LIFE_ENTITY_NOT_FOUND" ? 404 :
            error.code === "LIFE_ENTITY_IDENTITY_MISMATCH" ? 409 : 400;
          return NextResponse.json({ error: error.code, message: error.message }, { status });
        }
        throw error;
      }
    })) ?? NextResponse.json({ code: "principal_authorization_unavailable" },
    { status: 503, headers: { "cache-control": "no-store" } });
}
