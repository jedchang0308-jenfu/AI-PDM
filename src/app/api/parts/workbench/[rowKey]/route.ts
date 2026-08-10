import { NextResponse } from "next/server";
import { isUnifiedPartRelationWorkbenchV1Enabled } from "@/lib/number-state-flow-feature";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { resolveHumanStatusRoleCapabilitiesAsync } from "@/lib/numbering-human-status-viewer";
import { canViewPartCostAmounts } from "@/lib/part-cost-visibility";
import { PartWorkbenchService, partWorkbenchErrorResponse, type PartWorkbenchActor } from "@/lib/part-workbench";
import { canUserUseNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rowKey: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;
  if (!isUnifiedPartRelationWorkbenchV1Enabled()) return NextResponse.json({ error: "part_relation_workbench_not_enabled" }, { status: 404 });
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;
  const [workspaceView, workspaceUpdate, candidateSubmit, candidateReview, publish, managePermissions, viewerCapabilities] = await Promise.all([
    canUserUseNumberingActionAsync(auth.user, "numbering.workspace.view"),
    canUserUseNumberingActionAsync(auth.user, "numbering.workspace.update"),
    canUserUseNumberingActionAsync(auth.user, "numbering.candidate.review.submit"),
    canUserUseNumberingActionAsync(auth.user, "numbering.candidate.review.decide"),
    canUserUseNumberingActionAsync(auth.user, "numbering.publish"),
    canUserUseNumberingActionAsync(auth.user, "settings.admin_matrix"),
    resolveHumanStatusRoleCapabilitiesAsync(auth.user)
  ]);
  const actor: PartWorkbenchActor = {
    id: auth.user.id,
    companyId: companyResult.company.companyId,
    permissions: {
      workspaceView: workspaceView.allowed,
      workspaceUpdate: workspaceUpdate.allowed,
      candidateSubmit: candidateSubmit.allowed,
      candidateReview: candidateReview.allowed,
      publish: publish.allowed,
      managePermissions: managePermissions.allowed
    },
    viewerCapabilities,
    canViewCostAmounts: canViewPartCostAmounts(auth)
  };
  try {
    const { rowKey } = await params;
    const result = await new PartWorkbenchService().detail(decodeURIComponent(rowKey), actor);
    if (!result) return NextResponse.json({ error: { code: "part_workbench_row_not_found", message: "這筆料號工作不存在或目前無法查看。", retryable: false } }, { status: 404 });
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return partWorkbenchErrorResponse(error);
  }
}
