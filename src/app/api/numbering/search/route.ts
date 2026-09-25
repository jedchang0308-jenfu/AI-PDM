import { NextResponse } from "next/server";
import { searchNumberingRecordsAsync } from "@/lib/numbering-async";
import type { NumberingRecordStatus, NumberingSearchEntityType } from "@/lib/repositories/numbering-repository";
import { requireNumberingCompanyPermissionAsync } from "@/lib/numbering-company-permission";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import { parseNumberSortDirection } from "@/lib/number-sort";

export const runtime = "nodejs";

const entityTypes = new Set(["all", "part_root", "part_number", "drawing_number"]);
const recordStatuses = new Set([
  "Draft",
  "NeedInfo",
  "Active",
  "PendingReview",
  "Released",
  "Rejected",
  "Obsolete",
  "Merged",
  "PendingAdminConfirm",
  "MainDrawingInvalid"
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const entityType = normalizeEnum(url.searchParams.get("entityType"), entityTypes) as NumberingSearchEntityType | undefined;
  const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  const search = {
    query: url.searchParams.get("query") ?? "",
    entityType,
    recordStatus,
    sortDirection: parseNumberSortDirection(url.searchParams.get("sortDirection")),
    limit: Number(url.searchParams.get("limit") ?? 50)
  };

  const principalResponse = await withPrincipalNumberingCompanyRead(request, "numbering.search",
    async (snapshot, company) => {
      const results = await new AsyncNumberingRepository(snapshot).searchNumberingRecords({
        ...search, companyId: company.companyId
      });
      return NextResponse.json({ results, pdmCompany: company });
    });
  if (principalResponse) return principalResponse;

  const auth = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.search");
  if (auth.response) return auth.response;
  const results = await searchNumberingRecordsAsync({ ...search, companyId: auth.company.companyId });

  return NextResponse.json({ results, pdmCompany: auth.company });
}

function normalizeEnum(value: string | null, allowed: Set<string>) {
  const text = value?.trim();
  return text && allowed.has(text) ? text : undefined;
}
