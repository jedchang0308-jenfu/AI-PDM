import { NextResponse } from "next/server";
import { getAuthMode, getJenfuPlatformAuthMode } from "@/lib/auth-config";
import { getJenfuEntitlementMode } from "@/lib/entitlement-config";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { authorizePrincipalSubmissionListInSnapshot } from "@/lib/principal-submission-access";
import { AsyncSubmissionListRepository } from "@/lib/repositories/submission-list-async-repository";
import { requireAuthAsync } from "@/lib/auth-async";
import { requestedPdmCompanyCodeFromRequest, resolvePdmCompanyContextAsync, resolvePrincipalCompanyContextInSnapshot } from "@/lib/company-context";
import { scopedSubmittedBy } from "@/lib/permissions";
import { searchSubmissionsAsync } from "@/lib/submissions-async";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = principalSessionTokenFromRequest(request);
  if (token || (getAuthMode() === "firebase_bff" && getJenfuPlatformAuthMode() === "on")) {
    const url = new URL(request.url);
    const partSearch = url.searchParams.get("entity") === "part";
    const path = "src/app/api/search/route.ts";
    const discriminator = partSearch ? "search:part" : "search:submission";
    const permissionCode = partSearch ? "numbering.search" : "submission.view";
    const policy = resolveJenfuRoutePolicy(path, "GET", {
      discriminator, expectedPermissionCode: permissionCode
    });
    if (policy?.path !== path || policy.discriminator !== discriminator ||
        policy.authorizationMode !== "permission" ||
        policy.scopeResolver !== (partSearch ? "principal company" : "submission company")) {
      return NextResponse.json({ code: "principal_route_policy_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    if (!token) return NextResponse.json({ code: "auth_session_invalid" },
      { status: 401, headers: { "cache-control": "no-store" } });
    if (getAuthMode() !== "firebase_bff" || getJenfuPlatformAuthMode() !== "on" ||
        getJenfuEntitlementMode() !== "enforce") {
      return NextResponse.json({ code: "principal_authorization_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    try {
      const query = (url.searchParams.get("q") ?? "").trim();
      const status = url.searchParams.get("status") ?? undefined;
      const includeHistory = status === "Obsolete";
      const filters = searchFilters(url, status);
      const hasFilters = Object.values(filters).some((value) => value?.trim());
      return await withVerifiedJenfuPrincipalRequest(principalRequestInput(token), async (snapshot, verified) => {
        if (partSearch) {
          const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
            [{ permissionKind: "page", permissionCode: "numbering.search" }]);
          const decision = decisions[0];
          if (decisions.length !== 1 || !decision || decision.permissionCode !== "numbering.search" ||
              decision.principalId !== verified.session.principalId) {
            return NextResponse.json({ code: "principal_dependency_unavailable" },
              { status: 503, headers: { "cache-control": "no-store" } });
          }
          if (!decision.allowed) return jenfuEntitlementFailureResponse(decision.decisionCode);
        } else {
          const scope = await authorizePrincipalSubmissionListInSnapshot(snapshot, verified);
          if (scope instanceof Response) return scope;
          const companyResult = await resolvePrincipalCompanyContextInSnapshot(snapshot, verified,
            requestedPdmCompanyCodeFromRequest(request));
          if (companyResult.response) return companyResult.response;
          if (query.length < 2 && !hasFilters) {
            return NextResponse.json({ pdmCompany: companyResult.company, submissions: [] },
              { headers: { "cache-control": "private, no-store" } });
          }
          return NextResponse.json({ pdmCompany: companyResult.company,
            submissions: await new AsyncSubmissionListRepository(snapshot).searchSubmissions({
              query: query.length >= 2 ? query : "", status, filters,
              submittedBy: scope.submittedBy, companyId: companyResult.company.companyId,
              includeHistory
            }), historicalReadOnly: true }, { headers: { "cache-control": "private, no-store" } });
        }
        const companyResult = await resolvePrincipalCompanyContextInSnapshot(snapshot, verified,
          requestedPdmCompanyCodeFromRequest(request));
        if (companyResult.response) return companyResult.response;
        return NextResponse.json({ pdmCompany: companyResult.company,
          parts: query.length < 2 ? [] : await searchPartsInSnapshot(snapshot,
            companyResult.company.companyId, query)
        }, { headers: { "cache-control": "private, no-store" } });
      });
    } catch (error) { return principalRequestFailure(error); }
  }
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const companyResult = await resolvePdmCompanyContextAsync(auth.user, requestedPdmCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const query = (url.searchParams.get("q") ?? "").trim();
  const status = url.searchParams.get("status") ?? undefined;
  const includeHistory = status === "Obsolete";
  const filters = searchFilters(url, status);
  const hasFilters = Object.values(filters).some((value) => value?.trim());
  const submittedBy = scopedSubmittedBy(auth.user);

  if (url.searchParams.get("entity") === "part") {
    if (query.length < 2) return NextResponse.json({ pdmCompany: companyResult.company, parts: [] });
    return NextResponse.json({ pdmCompany: companyResult.company,
      parts: await searchPartsInSnapshot(getAsyncDatabaseClient(),
        companyResult.company.companyId, query) });
  }

  if (query.length < 2 && !hasFilters) {
    return NextResponse.json({ pdmCompany: companyResult.company, submissions: [] });
  }

  return NextResponse.json({
    pdmCompany: companyResult.company,
    submissions: await searchSubmissionsAsync({
      query: query.length >= 2 ? query : "",
      status,
      filters,
      submittedBy,
      companyId: companyResult.company.companyId,
      includeHistory
    })
  });
}

function searchFilters(url: URL, status: string | undefined) {
  return {
    productLine: url.searchParams.get("productLine") ?? undefined,
    customer: url.searchParams.get("customer") ?? undefined,
    projectCode: url.searchParams.get("projectCode") ?? url.searchParams.get("project") ?? undefined,
    processName: url.searchParams.get("processName") ?? url.searchParams.get("process") ?? undefined,
    machine: url.searchParams.get("machine") ?? undefined,
    material: url.searchParams.get("material") ?? undefined,
    surfaceFinish: url.searchParams.get("surfaceFinish") ?? undefined,
    parentDrawing: url.searchParams.get("parentDrawing") ?? undefined,
    childDrawingNumber: url.searchParams.get("childDrawingNumber") ?? undefined,
    childPartNumber: url.searchParams.get("childPartNumber") ?? undefined,
    status
  };
}

async function searchPartsInSnapshot(client: AsyncDatabaseClient, companyId: string, query: string) {
  const schema = client.kind === "postgres" ? "ai_pdm_core." : "";
  const rows = await client.query<{
    id: string; item_id: string | null; part_number: string; part_name: string; part_root_id: string;
  }>(
    "SELECT part.id, " +
    "(SELECT item.id FROM " + schema + "items item WHERE item.company_id=part.company_id " +
    "AND upper(item.part_number)=upper(part.part_number) ORDER BY item.id LIMIT 1) AS item_id, " +
    "part.part_number,part.part_name,part.part_root_id " +
    "FROM " + schema + "part_numbers part WHERE part.company_id=:companyId " +
    "AND part.record_status NOT IN ('Obsolete','Merged','MainDrawingInvalid') " +
    "AND (upper(part.part_number) LIKE upper(:queryLike) OR upper(part.part_name) LIKE upper(:queryLike)) " +
    "ORDER BY part.part_number,part.id LIMIT 30",
    { companyId, queryLike: "%" + query + "%" }
  );
  return rows.map((part) => ({
    id: part.id, part_number_id: part.id, item_id: part.item_id ?? "",
    part_number: part.part_number, part_name: part.part_name,
    part_root_id: part.part_root_id, revision: ""
  }));
}
