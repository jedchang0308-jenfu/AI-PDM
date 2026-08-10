import { NextResponse } from "next/server";
import { DRAWING_WORKBENCH_NO_STORE_HEADERS, DrawingWorkbenchService, drawingWorkbenchErrorResponse } from "@/lib/drawing-workbench";
import { isUnifiedDrawingWorkbenchV1Enabled } from "@/lib/number-state-flow-feature";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { canUserUseNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rowKey: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.drawings.view");
  if (auth.response) return auth.response;
  if (!isUnifiedDrawingWorkbenchV1Enabled()) {
    return NextResponse.json(
      { error: "drawing_workbench_not_enabled" },
      { status: 404, headers: DRAWING_WORKBENCH_NO_STORE_HEADERS }
    );
  }
  const companyResult = await resolveNumberingCompanyContextAsync(
    auth.user.id,
    requestedNumberingCompanyCodeFromRequest(request)
  );
  if (companyResult.response) return companyResult.response;
  try {
    const [workspaceView, workspaceUpdate, candidateSubmit, candidateReview, publish, createRevision, draftUpdate, manageReferenceAttachments, managePermissions] = await Promise.all([
      canUserUseNumberingActionAsync(auth.user, "numbering.workspace.view"),
      canUserUseNumberingActionAsync(auth.user, "numbering.workspace.update"),
      canUserUseNumberingActionAsync(auth.user, "numbering.candidate.review.submit"),
      canUserUseNumberingActionAsync(auth.user, "numbering.candidate.review.decide"),
      canUserUseNumberingActionAsync(auth.user, "numbering.publish"),
      canUserUseNumberingActionAsync(auth.user, "post_release_change"),
      canUserUseNumberingActionAsync(auth.user, "numbering.draft.update"),
      canUserUseNumberingActionAsync(auth.user, "numbering.attachments.manage"),
      canUserUseNumberingActionAsync(auth.user, "settings.admin_matrix")
    ]);
    const { rowKey } = await params;
    const detail = await new DrawingWorkbenchService().detail(rowKey, {
      id: auth.user.id,
      companyId: companyResult.company.companyId,
      permissions: {
        workspaceView: workspaceView.allowed,
        workspaceUpdate: workspaceUpdate.allowed,
        candidateSubmit: candidateSubmit.allowed,
        candidateReview: candidateReview.allowed,
        publish: publish.allowed,
        createRevision: createRevision.allowed,
        draftUpdate: draftUpdate.allowed,
        manageReferenceAttachments: manageReferenceAttachments.allowed,
        managePermissions: managePermissions.allowed
      }
    });
    if (!detail) {
      return NextResponse.json(
        { error: "drawing_workbench_row_not_found" },
        { status: 404, headers: DRAWING_WORKBENCH_NO_STORE_HEADERS }
      );
    }
    return NextResponse.json({ ...detail, pdmCompany: companyResult.company }, {
      headers: DRAWING_WORKBENCH_NO_STORE_HEADERS
    });
  } catch (error) {
    return drawingWorkbenchErrorResponse(error);
  }
}
