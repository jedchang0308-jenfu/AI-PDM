import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import {
  listBomCreateAssemblyOptionsAsync,
  listBomCreateCadSourcesAsync,
  listBomCreateDraftOptionsAsync,
  listBomCreatePartOptionsAsync
} from "@/lib/bom-create-context";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const url = new URL(request.url);
  const ownerPartNumberId = url.searchParams.get("ownerPartNumberId")?.trim() ?? "";
  const [parts, assemblyParts, drafts, cadSources] = await Promise.all([
    listBomCreatePartOptionsAsync({
      user: auth.user,
      companyId: companyResult.company.companyId,
      query: url.searchParams.get("query") ?? "",
      limit: 80
    }),
    listBomCreateAssemblyOptionsAsync({
      user: auth.user,
      companyId: companyResult.company.companyId,
      query: url.searchParams.get("query") ?? "",
      limit: 80
    }),
    listBomCreateDraftOptionsAsync({
      user: auth.user,
      companyId: companyResult.company.companyId,
      query: url.searchParams.get("query") ?? "",
      limit: 80
    }),
    ownerPartNumberId
      ? listBomCreateCadSourcesAsync({
          user: auth.user,
          companyId: companyResult.company.companyId,
          ownerPartNumberId
        })
      : Promise.resolve([])
  ]);

  return NextResponse.json(
    { parts, assemblyParts, drafts, cadSources, pdmCompany: companyResult.company },
    { headers: { "cache-control": "private, no-store" } }
  );
}
