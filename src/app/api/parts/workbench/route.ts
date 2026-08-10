import { NextResponse } from "next/server";
import { isUnifiedPartRelationWorkbenchV1Enabled } from "@/lib/number-state-flow-feature";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { resolveHumanStatusRoleCapabilitiesAsync } from "@/lib/numbering-human-status-viewer";
import { canViewPartCostAmounts } from "@/lib/part-cost-visibility";
import { normalizePartWorkbenchQuery, PartWorkbenchService, partWorkbenchErrorResponse, type PartWorkbenchActor } from "@/lib/part-workbench";
import { canUserUseNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

async function resolveActor(request: Request) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return { response: auth.response, actor: null, company: null };
  if (!isUnifiedPartRelationWorkbenchV1Enabled()) return { response: NextResponse.json({ error: "part_relation_workbench_not_enabled" }, { status: 404 }), actor: null, company: null };
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return { response: companyResult.response, actor: null, company: null };
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
  return { response: null, actor, company: companyResult.company };
}

export async function GET(request: Request) {
  const access = await resolveActor(request);
  if (access.response || !access.actor) return access.response;
  try {
    const result = await new PartWorkbenchService().list(normalizePartWorkbenchQuery(new URL(request.url)), access.actor);
    return NextResponse.json({ ...result, pdmCompany: access.company }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return partWorkbenchErrorResponse(error);
  }
}
