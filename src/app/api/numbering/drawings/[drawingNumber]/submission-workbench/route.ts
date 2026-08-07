import { NextResponse } from "next/server";
import { DrawingSubmissionWorkbenchError, resolveDrawingSubmissionContext } from "@/lib/drawing-submission-workbench";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ drawingNumber: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.drawings.view");
  if (auth.response) return auth.response;

  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const { drawingNumber } = await params;
  const url = new URL(request.url);
  const targetRevision = url.searchParams.get("revision");
  const currentPartNumberId =
    url.searchParams.get("currentPartNumberId") ?? url.searchParams.get("current_part_number_id");
  const partNumberIds = [
    ...url.searchParams.getAll("partNumberId"),
    ...url.searchParams.getAll("part_number_id"),
    ...(url.searchParams.get("partNumberIds") ?? url.searchParams.get("part_number_ids") ?? "").split(",")
  ]
    .map((value) => value.trim())
    .filter(Boolean);
  const workflowIntent =
    url.searchParams.get("workflowIntent") ??
    url.searchParams.get("workflow_intent") ??
    url.searchParams.get("lifecycleStage");
  try {
    const context = await resolveDrawingSubmissionContext({
      company: companyResult.company,
      drawingNumber: decodeURIComponent(drawingNumber),
      targetRevision,
      currentPartNumberId,
      partNumberIds,
      workflowIntent
    });
    return NextResponse.json(context);
  } catch (error) {
    if (error instanceof DrawingSubmissionWorkbenchError) {
      return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: "drawing_submission_workbench_failed",
        message: "圖面送審工作台讀取失敗，請重新整理或通知管理員。"
      },
      { status: 500 }
    );
  }
}
