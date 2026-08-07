import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { searchNumberingRecordsAsync } from "@/lib/numbering-async";
import type { NumberingRecordStatus, NumberingSearchEntityType } from "@/lib/repositories/numbering-repository";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

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
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const entityType = normalizeEnum(url.searchParams.get("entityType"), entityTypes) as NumberingSearchEntityType | undefined;
  const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;

  const results = await searchNumberingRecordsAsync({
    companyId: companyResult.company.companyId,
    query: url.searchParams.get("query") ?? "",
    entityType,
    recordStatus,
    limit: Number(url.searchParams.get("limit") ?? 50)
  });

  return NextResponse.json({ results, pdmCompany: companyResult.company });
}

function normalizeEnum(value: string | null, allowed: Set<string>) {
  const text = value?.trim();
  return text && allowed.has(text) ? text : undefined;
}
