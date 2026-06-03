import { NextResponse } from "next/server";
import { getMonthlyNumberingAuditReport } from "@/lib/db";
import { requireNumberingPage } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const auth = requireNumberingPage(request, "numbering.reports");
  if (auth.response) return auth.response;

  const { reportId } = await params;
  const report = getMonthlyNumberingAuditReport(reportId);
  if (!report) {
    return NextResponse.json({ error: "Monthly numbering audit report not found" }, { status: 404 });
  }
  return NextResponse.json(report);
}
