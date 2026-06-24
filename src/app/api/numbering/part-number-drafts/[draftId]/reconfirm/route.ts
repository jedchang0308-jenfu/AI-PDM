import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { buildPdmChangeControlActor, pdmChangeControlErrorResponse } from "@/lib/pdm-change-control-api";
import { reconfirmPartNumberDraft } from "@/lib/pdm-change-control";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const auth = await requireNumberingActionAsync(request, "numbering.draft.update");
  if (auth.response) return auth.response;

  const { draftId } = await params;
  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  try {
    const actor = buildPdmChangeControlActor(auth, companyResult.company.companyId);
    const draft = await reconfirmPartNumberDraft({ draftId, actor });
    return NextResponse.json({ draft, pdmCompany: companyResult.company });
  } catch (error) {
    return pdmChangeControlErrorResponse(error, "Failed to reconfirm part-number draft");
  }
}
