import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { requestedPdmCompanyCodeFromRequest, resolvePdmCompanyContextAsync } from "@/lib/company-context";
import { scopedSubmittedBy } from "@/lib/permissions";
import { searchSubmissionsAsync } from "@/lib/submissions-async";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const companyResult = await resolvePdmCompanyContextAsync(auth.user, requestedPdmCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const query = (url.searchParams.get("q") ?? "").trim();
  const status = url.searchParams.get("status") ?? undefined;
  const includeHistory = status === "Obsolete";
  const filters = {
    productLine: url.searchParams.get("productLine") ?? undefined,
    customer: url.searchParams.get("customer") ?? undefined,
    projectCode: url.searchParams.get("projectCode") ?? url.searchParams.get("project") ?? undefined,
    processName: url.searchParams.get("processName") ?? url.searchParams.get("process") ?? undefined,
    machine: url.searchParams.get("machine") ?? undefined,
    material: url.searchParams.get("material") ?? undefined,
    surfaceFinish: url.searchParams.get("surfaceFinish") ?? undefined,
    parentDrawing: url.searchParams.get("parentDrawing") ?? undefined,
    childDrawingNumber: url.searchParams.get("childDrawingNumber") ?? undefined,
    childPartNumber: url.searchParams.get("childPartNumber") ?? undefined,
    status
  };
  const hasFilters = Object.values(filters).some((value) => value?.trim());
  const submittedBy = scopedSubmittedBy(auth.user);

  if (url.searchParams.get("entity") === "part") {
    if (query.length < 2) return NextResponse.json({ pdmCompany: companyResult.company, parts: [] });
    const parts = await getAsyncDatabaseClient().query<{
      id: string; item_id: string | null; part_number: string; part_name: string; part_root_id: string;
    }>(`
      SELECT part.id,
        (SELECT item.id FROM items item WHERE item.company_id = part.company_id AND upper(item.part_number) = upper(part.part_number) ORDER BY item.id LIMIT 1) AS item_id,
        part.part_number, part.part_name, part.part_root_id
      FROM part_numbers part
      WHERE part.company_id = :companyId
        AND part.record_status NOT IN ('Obsolete','Merged','MainDrawingInvalid')
        AND (upper(part.part_number) LIKE upper(:queryLike) OR upper(part.part_name) LIKE upper(:queryLike))
      ORDER BY part.part_number, part.id LIMIT 30
    `, { companyId: companyResult.company.companyId, queryLike: `%${query}%` });
    return NextResponse.json({
      pdmCompany: companyResult.company,
      parts: parts.map((part) => ({
        id: part.id,
        part_number_id: part.id,
        item_id: part.item_id ?? "",
        part_number: part.part_number,
        part_name: part.part_name,
        part_root_id: part.part_root_id,
        revision: ""
      }))
    });
  }

  if (query.length < 2 && !hasFilters) {
    return NextResponse.json({ pdmCompany: companyResult.company, submissions: [] });
  }

  return NextResponse.json({
    pdmCompany: companyResult.company,
    submissions: await searchSubmissionsAsync({
      query: query.length >= 2 ? query : "",
      status,
      filters,
      submittedBy,
      companyId: companyResult.company.companyId,
      includeHistory
    })
  });
}
