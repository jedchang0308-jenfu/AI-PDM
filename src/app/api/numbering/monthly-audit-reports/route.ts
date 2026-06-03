import { NextResponse } from "next/server";
import { generateMonthlyNumberingAuditReport, listMonthlyNumberingAuditReports } from "@/lib/db";
import { requireNumberingAction, requireNumberingPage } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = requireNumberingPage(request, "numbering.reports");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const reportMonth = url.searchParams.get("reportMonth") ?? url.searchParams.get("report_month") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 20);
  return NextResponse.json({ reports: listMonthlyNumberingAuditReports({ reportMonth, limit }) });
}

export async function POST(request: Request) {
  const auth = requireNumberingAction(request, "numbering.audit_report.generate");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = generateMonthlyNumberingAuditReport({
    reportMonth: String(body.reportMonth ?? body.report_month ?? "").trim() || undefined,
    generationMode: "manual",
    generatedBy: auth.user.id
  });
  return NextResponse.json(result, { status: 201 });
}
