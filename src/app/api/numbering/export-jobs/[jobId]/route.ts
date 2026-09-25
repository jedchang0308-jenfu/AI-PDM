import { NextResponse } from "next/server";
import { getNumberingExportJobAsync } from "@/lib/numbering-async";
import { requireNumberingCompanyPermissionAsync } from "@/lib/numbering-company-permission";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const auth = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.reports");
  if (auth.response) return auth.response;

  const { jobId } = await params;
  const job = await getNumberingExportJobAsync(jobId, auth.company.companyId);
  if (!job) {
    return NextResponse.json({ error: "Export job not found" }, { status: 404 });
  }
  return NextResponse.json(job);
}
