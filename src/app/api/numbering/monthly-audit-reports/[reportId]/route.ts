import { NextResponse } from "next/server";
import { getMonthlyNumberingAuditReportAsync } from "@/lib/numbering-async";
import { requireNumberingCompanyPermissionAsync } from "@/lib/numbering-company-permission";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const principalResponse = await withPrincipalNumberingCompanyRead(request, "numbering.reports",
    async (snapshot, company) => {
      const report = await new AsyncNumberingRepository(snapshot).getMonthlyNumberingAuditReport(reportId, company.companyId);
      return report ? NextResponse.json(report) :
        NextResponse.json({ error: "Monthly numbering audit report not found" }, { status: 404 });
    });
  if (principalResponse) return principalResponse;

  const auth = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.reports");
  if (auth.response) return auth.response;

  const report = await getMonthlyNumberingAuditReportAsync(reportId, auth.company.companyId);
  if (!report) {
    return NextResponse.json({ error: "Monthly numbering audit report not found" }, { status: 404 });
  }
  return NextResponse.json(report);
}
