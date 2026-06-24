import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { buildPdmChangeControlActor, pdmChangeControlErrorResponse } from "@/lib/pdm-change-control-api";
import { listPendingDrawingRevisionReviews } from "@/lib/pdm-change-control";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.approval.batch.decide");
  if (auth.response) return auth.response;

  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  try {
    const actor = buildPdmChangeControlActor(auth, companyResult.company.companyId);
    const reviews = await listPendingDrawingRevisionReviews(actor);
    return Response.json({ reviews, pdmCompany: companyResult.company });
  } catch (error) {
    return pdmChangeControlErrorResponse(error, "Failed to list pending drawing revision reviews");
  }
}
