import { NextResponse } from "next/server";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  if (!principalSessionTokenFromRequest(request)) {
    return NextResponse.json({ code: "auth_session_invalid" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const { jobId } = await params;
  const principalResponse = await withPrincipalNumberingCompanyRead(request, "numbering.reports",
    async (snapshot, company) => {
      const job = await new AsyncNumberingRepository(snapshot).getNumberingExportJob(jobId, company.companyId);
      return job ? NextResponse.json(job, { headers: { "cache-control": "private, no-store" } }) : NextResponse.json({ error: "Export job not found" }, { status: 404 });
    });
  return principalResponse ?? NextResponse.json({ code: "principal_authorization_unavailable" },
    { status: 503, headers: { "cache-control": "no-store" } });
}
