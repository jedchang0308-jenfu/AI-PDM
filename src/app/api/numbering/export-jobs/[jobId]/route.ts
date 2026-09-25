import { NextResponse } from "next/server";
import { getNumberingExportJobAsync } from "@/lib/numbering-async";
import { requireNumberingCompanyPermissionAsync } from "@/lib/numbering-company-permission";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const principalResponse = await withPrincipalNumberingCompanyRead(request, "numbering.reports",
    async (snapshot, company) => {
      const job = await new AsyncNumberingRepository(snapshot).getNumberingExportJob(jobId, company.companyId);
      return job ? NextResponse.json(job) : NextResponse.json({ error: "Export job not found" }, { status: 404 });
    });
  if (principalResponse) return principalResponse;

  const auth = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.reports");
  if (auth.response) return auth.response;

  const job = await getNumberingExportJobAsync(jobId, auth.company.companyId);
  if (!job) {
    return NextResponse.json({ error: "Export job not found" }, { status: 404 });
  }
  return NextResponse.json(job);
}
