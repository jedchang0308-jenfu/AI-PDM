import { NextResponse } from "next/server";
import { isUnifiedPartRelationWorkbenchV1Enabled } from "@/lib/number-state-flow-feature";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { resolveHumanStatusRoleCapabilitiesAsync } from "@/lib/numbering-human-status-viewer";
import { canUserUseNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { RelationWorkbenchService, relationWorkbenchErrorResponse, type RelationWorkbenchActor } from "@/lib/relation-workbench";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ rowKey: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;
  if (!isUnifiedPartRelationWorkbenchV1Enabled()) return NextResponse.json({ error: "part_relation_workbench_not_enabled" }, { status: 404 });
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;
  const [workspaceView, workspaceUpdate, candidateSubmit, candidateReview, publish, manageRelations, managePermissions, viewerCapabilities] = await Promise.all([
    canUserUseNumberingActionAsync(auth.user, "numbering.workspace.view"),
    canUserUseNumberingActionAsync(auth.user, "numbering.workspace.update"),
    canUserUseNumberingActionAsync(auth.user, "numbering.candidate.review.submit"),
    canUserUseNumberingActionAsync(auth.user, "numbering.candidate.review.decide"),
    canUserUseNumberingActionAsync(auth.user, "numbering.publish"),
    canUserUseNumberingActionAsync(auth.user, "numbering.link_variant"),
    canUserUseNumberingActionAsync(auth.user, "settings.admin_matrix"),
    resolveHumanStatusRoleCapabilitiesAsync(auth.user)
  ]);
  const actor: RelationWorkbenchActor = {
    id: auth.user.id,
    companyId: companyResult.company.companyId,
    permissions: {
      workspaceView: workspaceView.allowed,
      workspaceUpdate: workspaceUpdate.allowed,
      candidateSubmit: candidateSubmit.allowed,
      candidateReview: candidateReview.allowed,
      publish: publish.allowed,
      manageRelations: manageRelations.allowed,
      managePermissions: managePermissions.allowed
    },
    viewerCapabilities
  };
  try {
    const { rowKey } = await params;
    const result = await new RelationWorkbenchService().detail(decodeURIComponent(rowKey), actor);
    if (!result) return NextResponse.json({ error: { code: "relation_workbench_row_not_found", message: "這筆圖料工作不存在或目前無法查看。", retryable: false } }, { status: 404 });
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return relationWorkbenchErrorResponse(error);
  }
}
