import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { requestedPdmCompanyCodeFromRequest, resolvePdmCompanyContextAsync } from "@/lib/company-context";
import { getDashboardMetricsAsync } from "@/lib/dashboard-metrics-async";
import { scopedSubmittedBy } from "@/lib/permissions";
import { listSubmissionsAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const includeHistory = status === "Obsolete";
  const limit = parsePageLimit(url.searchParams.get("limit"));
  const offset = parsePageOffset(url.searchParams.get("offset"));
  const companyResult = await resolvePdmCompanyContextAsync(auth.user, requestedPdmCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const submittedBy = scopedSubmittedBy(auth.user);
  const rows = await listSubmissionsAsync({
    status,
    submittedBy,
    companyId: companyResult.company.companyId,
    limit: limit + 1,
    offset,
    includeHistory
  });
  const submissions = rows.slice(0, limit);
  return NextResponse.json({
    pdmCompany: companyResult.company,
    submissions,
    pagination: {
      limit,
      offset,
      count: submissions.length,
      hasMore: rows.length > limit,
      nextOffset: offset + submissions.length
    },
    metrics: await getDashboardMetricsAsync({ submittedBy, companyId: companyResult.company.companyId })
  });
}

function parsePageLimit(value: string | null) {
  const parsed = Number(value ?? 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.trunc(parsed), 1), 200);
}

function parsePageOffset(value: string | null) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.trunc(parsed), 0);
}

export async function POST() {
  return NextResponse.json(
    {
      error: "GENERIC_SUBMISSION_RETIRED",
      message: "通用上傳送審已退役。請從圖號／料號工作台完成主資料與附件確認後送審，不可在送審階段補填主資料。"
    },
    { status: 410, headers: { "cache-control": "no-store" } }
  );
}
