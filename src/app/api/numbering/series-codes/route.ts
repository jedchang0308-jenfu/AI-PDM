import { NextResponse } from "next/server";
import { listSeriesCodeOptionsAsync } from "@/lib/numbering-async";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

/** Read-only series options for numbering forms and workbenches. Series codes remain owned by canonical numbering data. */
export async function GET(request: Request) {
  const searchPage = await requireNumberingPageAsync(request, "numbering.search");
  const auth = searchPage.response?.status === 403
    ? await requireNumberingPageAsync(request, "numbering.drawings.view")
    : searchPage;
  const pageAuth = auth.response?.status === 403
    ? await requireNumberingActionAsync(request, "numbering.create")
    : auth;
  if (pageAuth.response) return pageAuth.response;

  const companyResult = await resolveNumberingCompanyContextAsync(pageAuth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const seriesCodeOptions = await listSeriesCodeOptionsAsync(companyResult.company.companyId);
  return NextResponse.json(
    { seriesCodeOptions, pdmCompany: companyResult.company },
    { headers: { "cache-control": "private, no-store" } },
  );
}
