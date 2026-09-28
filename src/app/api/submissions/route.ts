import { NextResponse } from "next/server";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { authorizePrincipalSubmissionListInSnapshot } from "@/lib/principal-submission-access";
import { AsyncSubmissionListRepository } from "@/lib/repositories/submission-list-async-repository";
import { AsyncDashboardRepository } from "@/lib/repositories/dashboard-async-repository";
import { requestedPdmCompanyCodeFromRequest, resolvePrincipalCompanyContextInSnapshot } from "@/lib/company-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  const path = "src/app/api/submissions/route.ts";
  const policy = resolveJenfuRoutePolicy(path, "GET", { expectedPermissionCode: "submission.view" });
  if (policy?.path !== path || policy.authorizationMode !== "permission" ||
      policy.scopeResolver !== "submission company") {
    return NextResponse.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
      getJenfuEntitlementMode() !== "enforce") {
    return NextResponse.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const includeHistory = status === "Obsolete";
    const limit = parsePageLimit(url.searchParams.get("limit"));
    const offset = parsePageOffset(url.searchParams.get("offset"));
    return await withVerifiedJenfuPrincipalRequest(principalRequestInput(token), async (snapshot, verified) => {
      const scope = await authorizePrincipalSubmissionListInSnapshot(snapshot, verified);
      if (scope instanceof Response) return scope;
      const companyResult = await resolvePrincipalCompanyContextInSnapshot(snapshot, verified,
        requestedPdmCompanyCodeFromRequest(request));
      if (companyResult.response) return companyResult.response;
      const rows = await new AsyncSubmissionListRepository(snapshot).listSubmissions({
        status, submittedBy: scope.submittedBy, companyId: companyResult.company.companyId,
        limit: limit + 1, offset, includeHistory
      });
      const submissions = rows.slice(0, limit);
      return NextResponse.json({
        pdmCompany: companyResult.company, submissions,
        pagination: { limit, offset, count: submissions.length,
          hasMore: rows.length > limit, nextOffset: offset + submissions.length },
        metrics: await new AsyncDashboardRepository(snapshot).getDashboardMetrics({
          submittedBy: scope.submittedBy, companyId: companyResult.company.companyId
        }),
        historicalReadOnly: true
      }, { headers: { "cache-control": "private, no-store" } });
    });
  } catch (error) { return principalRequestFailure(error); }
}

function parsePageLimit(value: string | null) {
  const parsed = Number(value ?? 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.trunc(parsed), 1), 200);
}

function parsePageOffset(value: string | null) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.trunc(parsed), 0);
}

export async function POST() {
  return NextResponse.json(
    {
      error: "GENERIC_SUBMISSION_RETIRED",
      message: "通用上傳送審已退役。請從圖號／料號工作台完成主資料與附件確認後送審，不可在送審階段補填主資料。"
    },
    { status: 410, headers: { "cache-control": "no-store" } }
  );
}
