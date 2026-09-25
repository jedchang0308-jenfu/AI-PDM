import { NextResponse } from "next/server";
import { DrawingSubmissionWorkbenchError, resolveDrawingSubmissionContext } from "@/lib/drawing-submission-workbench";
import { requireNumberingCompanyPermissionAsync } from "@/lib/numbering-company-permission";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmCompanyContext } from "@/lib/company-context";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ drawingNumber: string }> }) {
  const { drawingNumber } = await params;
  const principalResponse = await withPrincipalNumberingCompanyRead(request, "numbering.drawings.view",
    (snapshot, company) => readContext(company, drawingNumber, snapshot));
  if (principalResponse) return principalResponse;

  const auth = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.drawings.view");
  if (auth.response) return auth.response;
  return readContext(auth.company, drawingNumber);
}

async function readContext(company: PdmCompanyContext, drawingNumber: string, snapshot?: AsyncDatabaseClient) {
  try {
    const context = await resolveDrawingSubmissionContext({
      company,
      drawingNumber: decodeURIComponent(drawingNumber)
    }, snapshot);
    return NextResponse.json(context);
  } catch (error) {
    if (error instanceof DrawingSubmissionWorkbenchError) {
      return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "DRAWING_SUBMISSION_READINESS_FAILED";
    return NextResponse.json({ error: "DRAWING_SUBMISSION_READINESS_FAILED", message }, { status: 500 });
  }
}
