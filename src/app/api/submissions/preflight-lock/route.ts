import { NextResponse } from "next/server";
import { parsePdmCompanyRequest, requestedPdmCompanyCodeFromRequest } from "@/lib/company-context";
import { withPrincipalCompanyRead } from "@/lib/principal-company-read";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { AsyncItemLockRepository } from "@/lib/repositories/item-lock-async-repository";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const path = "src/app/api/submissions/preflight-lock/route.ts";
  const policy = resolveJenfuRoutePolicy(path, "POST",
    { expectedPermissionCode: "submission.update" });
  if (policy?.path !== path || policy.authorizationMode !== "permission" ||
      policy.scopeResolver !== "submission company") {
    return NextResponse.json({ code: "principal_route_policy_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
  }
  const response = await withPrincipalCompanyRead(request,
    requestedPdmCompanyCodeFromRequest(request),
    [{ permissionKind: "action", permissionCode: "submission.update" }],
    async (snapshot, company, verified) => {
      const rawBody: unknown = await request.json().catch(() => null);
      if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
        return NextResponse.json({ code: "submission_preflight_input_invalid" },
          { status: 400, headers: { "cache-control": "no-store" } });
      }
      const body = rawBody as Record<string, unknown>;
      const requestedCompany = parsePdmCompanyRequest(
        body.pdm_company_code ?? body.pdmCompanyCode);
      if (requestedCompany.state === "invalid" ||
          (requestedCompany.state === "valid" &&
            requestedCompany.companyCode !== company.companyCode)) {
        return NextResponse.json({ code: "entitlement_scope_mismatch" },
          { status: 403, headers: { "cache-control": "no-store" } });
      }
      const drawingNumber = String(body.drawing_number ?? body.drawingNumber ?? "").trim();
      const partNumber = String(body.part_number ?? body.partNumber ?? "").trim();
      if (!drawingNumber && !partNumber) {
        return NextResponse.json({ error: "圖號或料號為必填" },
          { status: 400, headers: { "cache-control": "no-store" } });
      }
      const lock = await new AsyncItemLockRepository(snapshot)
        .findActiveItemLockForSubmissionIdentifiers({
          companyId: company.companyId, drawingNumber, partNumber
        });
      return NextResponse.json({
        locked: Boolean(lock),
        // Historical profile ID is a lock owner relation, never a grant.
        lockedByCurrentUser: Boolean(lock &&
          lock.locked_by === verified.profile.pdmUserId),
        pdmCompany: company,
        matchedBy: lock ? { drawing_number: drawingNumber || null,
          part_number: partNumber || null } : null,
        lock
      }, { headers: { "cache-control": "private, no-store" } });
    });
  return response ?? NextResponse.json({ code: "auth_session_invalid" },
    { status: 401, headers: { "cache-control": "no-store" } });
}
