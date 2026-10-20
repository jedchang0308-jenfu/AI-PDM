import { NextResponse } from "next/server";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { authorizeNumberingExportJobResultInSnapshot } from "@/lib/numbering-export-job-capability";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  if (!principalSessionTokenFromRequest(request)) {
    return NextResponse.json({ code: "auth_session_invalid" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const { jobId } = await params;
  const principalResponse = await withPrincipalNumberingCompanyRead(request, "numbering.reports",
    async (snapshot, company, verified) => {
      const job = await new AsyncNumberingRepository(snapshot).getNumberingExportJob(jobId, company.companyId);
      if (!job) return NextResponse.json({ error: "Export job not found" }, { status: 404 });
      const capabilityResponse = await authorizeNumberingExportJobResultInSnapshot(snapshot, verified, job.result);
      if (capabilityResponse) return capabilityResponse;
      return NextResponse.json(job, { headers: { "cache-control": "private, no-store" } });
    });
  return principalResponse ?? NextResponse.json({ code: "principal_authorization_unavailable" },
    { status: 503, headers: { "cache-control": "no-store" } });
}
