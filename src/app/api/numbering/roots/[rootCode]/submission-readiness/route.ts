import { NextResponse } from "next/server";
import { DrawingSubmissionWorkbenchError, resolveRootSubmissionReadiness } from "@/lib/drawing-submission-workbench";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmCompanyContext } from "@/lib/company-context";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  if (!principalSessionTokenFromRequest(request)) {
    return NextResponse.json({ code: "auth_session_invalid" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  return (await withPrincipalNumberingCompanyRead(request, "numbering.search",
    (snapshot, company) => readinessResponse(params, snapshot, company))) ??
    NextResponse.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
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
