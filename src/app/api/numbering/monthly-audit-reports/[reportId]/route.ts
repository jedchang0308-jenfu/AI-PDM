import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getMonthlyNumberingAuditReportAsync } from "@/lib/numbering-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.reports");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const { reportId } = await params;
  const report = await getMonthlyNumberingAuditReportAsync(reportId, companyResult.company.companyId);
  if (!report) {
    return NextResponse.json({ error: "Monthly numbering audit report not found" }, { status: 404 });
  }
  return NextResponse.json(report);
}
