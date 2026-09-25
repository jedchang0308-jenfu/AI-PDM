import { NextResponse } from "next/server";
import { DrawingSubmissionWorkbenchError, resolveRootSubmissionReadiness } from "@/lib/drawing-submission-workbench";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmCompanyContext } from "@/lib/company-context";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const principalResponse = await withPrincipalNumberingCompanyRead(request, "numbering.search",
    (snapshot, company) => readinessResponse(params, snapshot, company));
  if (principalResponse) return principalResponse;

  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;

  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  return readinessResponse(params, getAsyncDatabaseClient(), companyResult.company);
}

async function readinessResponse(params: Promise<{ rootCode: string }>, client: AsyncDatabaseClient,
  company: PdmCompanyContext) {
  const { rootCode } = await params;
  try {
    const readiness = await resolveRootSubmissionReadiness({
      company,
      rootCode: decodeURIComponent(rootCode)
    }, client);
    return NextResponse.json(readiness, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof DrawingSubmissionWorkbenchError) {
      return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "ROOT_SUBMISSION_READINESS_FAILED";
    return NextResponse.json({ error: "ROOT_SUBMISSION_READINESS_FAILED", message }, { status: 500 });
  }
}
