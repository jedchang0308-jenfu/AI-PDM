import { NextResponse } from "next/server";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";

export const runtime = "nodejs";

/** Read-only series options for numbering forms and workbenches. Series codes remain owned by canonical numbering data. */
export async function GET(request: Request) {
  if (!principalSessionTokenFromRequest(request)) return NextResponse.json({ code: "auth_session_invalid" },
    { status: 401, headers: { "cache-control": "no-store" } });
  return await withPrincipalNumberingCompanyRead(request, [
    { permissionKind: "page", permissionCode: "numbering.search" },
    { permissionKind: "page", permissionCode: "numbering.drawings.view" },
    { permissionKind: "action", permissionCode: "numbering.create" }
  ], async (snapshot, company) => NextResponse.json({
    seriesCodeOptions: await new AsyncNumberingRepository(snapshot).listSeriesCodeOptions(company.companyId),
    pdmCompany: company
  }, { headers: { "cache-control": "private, no-store" } })) ??
    NextResponse.json({ code: "principal_authorization_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } });
}
