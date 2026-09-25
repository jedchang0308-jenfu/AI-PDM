import { NextResponse } from "next/server";
import { listSeriesCodeOptionsAsync } from "@/lib/numbering-async";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";

export const runtime = "nodejs";

/** Read-only series options for numbering forms and workbenches. Series codes remain owned by canonical numbering data. */
export async function GET(request: Request) {
  const principalResponse = await withPrincipalNumberingCompanyRead(request, [
    { permissionKind: "page", permissionCode: "numbering.search" },
    { permissionKind: "page", permissionCode: "numbering.drawings.view" },
    { permissionKind: "action", permissionCode: "numbering.create" }
  ], async (snapshot, company) => NextResponse.json({
    seriesCodeOptions: await new AsyncNumberingRepository(snapshot).listSeriesCodeOptions(company.companyId),
    pdmCompany: company
  }, { headers: { "cache-control": "private, no-store" } }));
  if (principalResponse) return principalResponse;

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
