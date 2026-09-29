import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { createNumberingExportJobAsync } from "@/lib/numbering-async";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!principalSessionTokenFromRequest(request)) {
    return NextResponse.json({ code: "auth_session_invalid" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const principalResponse = await withPrincipalNumberingCompanyRead(request, "numbering.reports",
    async (snapshot, company) => NextResponse.json({
      jobs: await new AsyncNumberingRepository(snapshot).listNumberingExportJobs({
        companyId: company.companyId, limit
      }), pdmCompany: company
    }, { headers: { "cache-control": "private, no-store" } }));
  return principalResponse ?? NextResponse.json({ code: "principal_authorization_unavailable" },
    { status: 503, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.export.create");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;
  const exportMode = String(body.exportMode ?? body.export_mode ?? "no_audit").trim();
  if (exportMode !== "no_audit" && exportMode !== "last_change_summary" && exportMode !== "full_change_summary") {
    return NextResponse.json({ error: "exportMode must be no_audit, last_change_summary, or full_change_summary" }, { status: 400 });
  }

  const result = await createNumberingExportJobAsync({ companyId: companyResult.company.companyId, exportMode, generatedBy: auth.user.id });
  return NextResponse.json(result, { status: 201 });
}
