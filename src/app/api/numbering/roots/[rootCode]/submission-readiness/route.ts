import { NextResponse } from "next/server";
import { DrawingSubmissionWorkbenchError, resolveRootSubmissionReadiness } from "@/lib/drawing-submission-workbench";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.search.view");
  if (auth.response) return auth.response;

  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const { rootCode } = await params;
  try {
    const readiness = await resolveRootSubmissionReadiness({
      company: companyResult.company,
      rootCode: decodeURIComponent(rootCode)
    });
    return NextResponse.json(readiness);
  } catch (error) {
    if (error instanceof DrawingSubmissionWorkbenchError) {
      return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "ROOT_SUBMISSION_READINESS_FAILED";
    return NextResponse.json({ error: "ROOT_SUBMISSION_READINESS_FAILED", message }, { status: 500 });
  }
}
