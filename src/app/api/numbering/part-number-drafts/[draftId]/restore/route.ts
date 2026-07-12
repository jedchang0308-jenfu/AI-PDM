import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { buildPdmChangeControlActor, pdmChangeControlErrorResponse } from "@/lib/pdm-change-control-api";
import { getPartNumberDraftLifecyclePolicy, restorePartNumberDraft } from "@/lib/pdm-change-control";
import { isProductionSliceEnforced, productionSliceDeniedPayload } from "@/lib/production-slice";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.draft.obsolete");
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  if (isProductionSliceEnforced()) {
    return NextResponse.json(productionSliceDeniedPayload("POST /api/numbering/part-number-drafts/[draftId]/restore"), { status: 403 });
  }

  try {
    const actor = buildPdmChangeControlActor(auth, companyResult.company.companyId);
    const draft = await restorePartNumberDraft({ draftId, actor });
    const policy = await getPartNumberDraftLifecyclePolicy({ draftId, actor });
    return NextResponse.json({ draft, policy, pdmCompany: companyResult.company });
  } catch (error) {
    return pdmChangeControlErrorResponse(error, "Failed to restore part-number draft");
  }
}
