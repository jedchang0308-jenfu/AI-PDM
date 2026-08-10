import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { listPartModuleRecordsAsync, listProductSeriesOptionsAsync, listSeriesCodeOptionsAsync } from "@/lib/numbering-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { canViewPartCostAmounts, redactPartListCosts } from "@/lib/part-cost-visibility";
import { normalizeHumanStatusFilter, projectRoleViewerHumanStatus, viewerStatusMatchesFilter } from "@/lib/human-status-projection";
import { projectPartHumanStatus } from "@/lib/part-human-status";
import { projectPartAvailability } from "@/lib/availability-scope";
import { resolveHumanStatusRoleCapabilitiesAsync } from "@/lib/numbering-human-status-viewer";
import type { NumberingRecordStatus } from "@/lib/repositories/numbering-repository";

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

export async function GET(request: Request) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  const productSeries = url.searchParams.get("productSeries")?.trim() || undefined;
  const seriesCode = url.searchParams.get("seriesCode")?.trim() || undefined;
  const humanStatus = normalizeHumanStatusFilter(url.searchParams.get("humanStatus"));
  const requestedLimit = normalizeLimit(url.searchParams.get("limit"), 50);

  const [parts, productSeriesOptions, seriesCodeOptions, viewerCapabilities] = await Promise.all([
    listPartModuleRecordsAsync({
      companyId: companyResult.company.companyId,
      query: url.searchParams.get("query") ?? "",
      productSeries,
      seriesCode,
      recordStatus,
      limit: humanStatus === "all" ? requestedLimit : 100
    }),
    listProductSeriesOptionsAsync(companyResult.company.companyId),
    listSeriesCodeOptionsAsync(companyResult.company.companyId),
    resolveHumanStatusRoleCapabilitiesAsync(auth.user)
  ]);

  const redactedParts = redactPartListCosts(parts, canViewPartCostAmounts(auth));
  const projectedParts = redactedParts
    .map((part) => {
      const objectiveStatus = projectPartHumanStatus(part);
      return {
        ...part,
        humanStatus: objectiveStatus,
        viewerStatus: projectRoleViewerHumanStatus(objectiveStatus, viewerCapabilities),
        availabilityScope: projectPartAvailability(part)
      };
    })
    .filter((part) => viewerStatusMatchesFilter(part.viewerStatus, part.humanStatus, humanStatus, part.availabilityScope))
    .slice(0, requestedLimit);
  return NextResponse.json({
    parts: projectedParts,
    productSeriesOptions,
    seriesCodeOptions,
    pdmCompany: companyResult.company
  }, { headers: { "cache-control": "private, no-store" } });
}

function normalizeEnum(value: string | null, allowed: Set<string>) {
  const text = value?.trim();
  return text && allowed.has(text) ? text : undefined;
}

function normalizeLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 1), 100) : fallback;
}
