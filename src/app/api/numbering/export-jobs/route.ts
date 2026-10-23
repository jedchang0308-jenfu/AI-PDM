import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest } from "@/lib/numbering-company-context";
import { resolvePrincipalCompanyContextInSnapshot } from "@/lib/company-context";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { authorizeDynamicResourceCapabilityInSnapshot, isDynamicRolePolicyInSnapshot } from "@/lib/principal-resource-capability";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import { withPrincipalCompanyWrite } from "@/lib/principal-company-read";
import { authorizeNumberingExportJobResultInSnapshot } from "@/lib/numbering-export-job-capability";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!principalSessionTokenFromRequest(request)) {
    return NextResponse.json({ code: "auth_session_invalid" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const principalResponse = await withPrincipalNumberingCompanyRead(request, "numbering.reports",
    async (snapshot, company) => {
      const dynamicPolicy = await isDynamicRolePolicyInSnapshot(snapshot);
      const jobs = await new AsyncNumberingRepository(snapshot).listNumberingExportJobs({
        companyId: company.companyId, limit
      });
      return NextResponse.json({
        jobs: dynamicPolicy ? jobs.map(({ result: _result, ...metadata }) => metadata) : jobs,
        pdmCompany: company
      }, { headers: { "cache-control": "private, no-store" } });
    });
  return principalResponse ?? NextResponse.json({ code: "principal_authorization_unavailable" },
    { status: 503, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  // Parse once: a serializable transaction may retry its callback.
  const raw: unknown = await request.json().catch(() => ({}));
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return withPrincipalCompanyWrite(request, "src/app/api/numbering/export-jobs/route.ts", "numbering.export.create",
    async (snapshot, _company, verified) => {
      const companyResult = await resolvePrincipalCompanyContextInSnapshot(snapshot, verified,
        requestedNumberingCompanyCodeFromRequest(request, body));
      if (companyResult.response) return companyResult.response;
      const exportMode = String(body.exportMode ?? body.export_mode ?? "no_audit").trim();
      if (exportMode !== "no_audit" && exportMode !== "last_change_summary" && exportMode !== "full_change_summary") {
        return NextResponse.json({ error: "exportMode must be no_audit, last_change_summary, or full_change_summary" }, { status: 400 });
      }
      // A numbering export can contain both parent groups. Authorize before
      // creating the job, then validate the actual result in this transaction.
      for (const action of ['view', 'download'] as const) {
        const denial = await authorizeDynamicResourceCapabilityInSnapshot(snapshot, verified, ['part', 'drawing'], action);
        if (denial) return denial;
      }
      const result = await new AsyncNumberingRepository(snapshot, undefined, undefined, undefined, verified).createNumberingExportJob({
        companyId: companyResult.company.companyId, exportMode, generatedBy: verified.profile.pdmUserId });
      const denial = await authorizeNumberingExportJobResultInSnapshot(snapshot, verified, result.result);
      if (denial) return denial; // the shared writer rolls back non-success responses
      return NextResponse.json(result, { status: 201, headers: { 'cache-control': 'private, no-store' } });
    });
}
