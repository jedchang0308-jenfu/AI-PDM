import { NextResponse } from "next/server";
import { listSeriesCodeOptionsAsync } from "@/lib/numbering-async";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

/** Read-only creation aid. Series codes remain owned by canonical numbering data. */
export async function GET(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.create");
  if (auth.response) return auth.response;

  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const seriesCodeOptions = await listSeriesCodeOptionsAsync(companyResult.company.companyId);
  return NextResponse.json(
    { seriesCodeOptions, pdmCompany: companyResult.company },
    { headers: { "cache-control": "private, no-store" } },
  );
}
