import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { listDrawingModuleRecordsAsync, listProductSeriesOptionsAsync, listSeriesCodeOptionsAsync } from "@/lib/numbering-async";
import { ACTIVE_DRAWING_PURPOSE_CODES } from "@/lib/numbering-identity";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import type { DrawingPurposeCode, NumberingRecordStatus } from "@/lib/repositories/numbering-repository";
import { parseNumberSortDirection } from "@/lib/number-sort";

export const runtime = "nodejs";

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
const purposeCodes = new Set<string>(ACTIVE_DRAWING_PURPOSE_CODES);

export async function GET(request: Request) {
  const auth = await requireNumberingPageAsync(request, "numbering.drawings.view");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  const purposeCode = normalizeEnum(url.searchParams.get("purposeCode"), purposeCodes) as DrawingPurposeCode | undefined;
  const productSeries = url.searchParams.get("productSeries")?.trim() || undefined;
  const seriesCode = url.searchParams.get("seriesCode")?.trim() || undefined;

  const [drawings, productSeriesOptions, seriesCodeOptions] = await Promise.all([
    listDrawingModuleRecordsAsync({
      companyId: companyResult.company.companyId,
      query: url.searchParams.get("query") ?? "",
      productSeries,
      seriesCode,
      recordStatus,
      purposeCode,
      sortDirection: parseNumberSortDirection(url.searchParams.get("sortDirection")),
      limit: Number(url.searchParams.get("limit") ?? 50)
    }),
    listProductSeriesOptionsAsync(companyResult.company.companyId),
    listSeriesCodeOptionsAsync(companyResult.company.companyId)
  ]);

  return NextResponse.json({
    drawings,
    productSeriesOptions,
    seriesCodeOptions,
    pdmCompany: companyResult.company,
    approvalProjection: {
      canReview: auth.user.role === "R&D Manager" || auth.user.role === "Admin"
    }
  });
}

function normalizeEnum(value: string | null, allowed: Set<string>) {
  const text = value?.trim();
  return text && allowed.has(text) ? text : undefined;
}
