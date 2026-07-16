import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { createNumberingExportJobAsync, listNumberingExportJobsAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireNumberingPageAsync(request, "numbering.reports");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 20);
  return NextResponse.json({ jobs: await listNumberingExportJobsAsync({ companyId: companyResult.company.companyId, limit }), pdmCompany: companyResult.company });
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
