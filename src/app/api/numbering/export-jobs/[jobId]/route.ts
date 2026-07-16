import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getNumberingExportJobAsync } from "@/lib/numbering-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.reports");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const { jobId } = await params;
  const job = await getNumberingExportJobAsync(jobId, companyResult.company.companyId);
  if (!job) {
    return NextResponse.json({ error: "Export job not found" }, { status: 404 });
  }
  return NextResponse.json(job);
}
