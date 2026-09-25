import { NextResponse } from "next/server";
import { resolveDrawingSubmissionContext, DrawingSubmissionWorkbenchError } from "@/lib/drawing-submission-workbench";
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
    return NextResponse.json(
      {
        error: "drawing_submission_context_failed",
        message: "圖面送審資料讀取失敗，請重新整理或通知管理員。"
      },
      { status: 500 }
    );
  }
}
