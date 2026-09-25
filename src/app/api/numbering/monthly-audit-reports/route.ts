import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { generateMonthlyNumberingAuditReportAsync, listMonthlyNumberingAuditReportsAsync } from "@/lib/numbering-async";
import { requireNumberingCompanyPermissionAsync } from "@/lib/numbering-company-permission";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.reports");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const reportMonth = url.searchParams.get("reportMonth") ?? url.searchParams.get("report_month") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 20);
  return NextResponse.json({
    reports: await listMonthlyNumberingAuditReportsAsync({ companyId: auth.company.companyId, reportMonth, limit }),
    pdmCompany: auth.company
  });
}

export async function POST(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.audit_report.generate");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;
  const result = await generateMonthlyNumberingAuditReportAsync({
    companyId: companyResult.company.companyId,
    reportMonth: String(body.reportMonth ?? body.report_month ?? "").trim() || undefined,
    generationMode: "manual",
    generatedBy: auth.user.id
  });
  return NextResponse.json(result, { status: 201 });
}
