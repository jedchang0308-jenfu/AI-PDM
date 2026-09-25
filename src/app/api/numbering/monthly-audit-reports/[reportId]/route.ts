import { NextResponse } from "next/server";
import { getMonthlyNumberingAuditReportAsync } from "@/lib/numbering-async";
import { requireNumberingCompanyPermissionAsync } from "@/lib/numbering-company-permission";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const auth = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.reports");
  if (auth.response) return auth.response;

  const { reportId } = await params;
  const report = await getMonthlyNumberingAuditReportAsync(reportId, auth.company.companyId);
  if (!report) {
    return NextResponse.json({ error: "Monthly numbering audit report not found" }, { status: 404 });
  }
  return NextResponse.json(report);
}
