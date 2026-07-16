import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { buildPdmChangeControlActor, pdmChangeControlErrorResponse } from "@/lib/pdm-change-control-api";
import { decideApprovalPlatformLegacyDrawingRevisionReviewActionAsync } from "@/lib/approval-platform";
import type { DrawingRevisionReviewAction } from "@/lib/pdm-change-control";

export async function handleDrawingRevisionReviewAction(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
  action: DrawingRevisionReviewAction
) {
  const auth = await requireNumberingActionAsync(request, "numbering.approval.batch.decide");
  if (auth.response) return auth.response;

  const { reviewId } = await params;
  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  try {
    const actor = buildPdmChangeControlActor(auth, companyResult.company.companyId);
    const result = await decideApprovalPlatformLegacyDrawingRevisionReviewActionAsync({
      assessmentId: reviewId,
      action,
      result: String(body.result ?? "").trim() || null,
      actor: { id: actor.userId, role: actor.role ?? auth.user.role },
      companyId: actor.companyId
    });
    return Response.json({ ...result, pdmCompany: companyResult.company });
  } catch (error) {
    return pdmChangeControlErrorResponse(error, "Failed to apply drawing revision review action");
  }
}
