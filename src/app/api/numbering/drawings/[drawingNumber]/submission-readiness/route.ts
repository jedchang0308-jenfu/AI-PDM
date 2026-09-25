import { NextResponse } from "next/server";
import { DrawingSubmissionWorkbenchError, resolveDrawingSubmissionContext } from "@/lib/drawing-submission-workbench";
import { requireNumberingCompanyPermissionAsync } from "@/lib/numbering-company-permission";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ drawingNumber: string }> }) {
  const auth = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.drawings.view");
  if (auth.response) return auth.response;

  const { drawingNumber } = await params;
  try {
    const context = await resolveDrawingSubmissionContext({
      company: auth.company,
      drawingNumber: decodeURIComponent(drawingNumber)
    });
    return NextResponse.json(context);
  } catch (error) {
    if (error instanceof DrawingSubmissionWorkbenchError) {
      return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "DRAWING_SUBMISSION_READINESS_FAILED";
    return NextResponse.json({ error: "DRAWING_SUBMISSION_READINESS_FAILED", message }, { status: 500 });
  }
}
