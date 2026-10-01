import { NextResponse } from "next/server";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import { normalizeWorkStatusQuery } from "@/lib/work-status-presentation";
import { projectRoleResponsibilityStatusPair, responsibilityStatusMatchesFilter } from "@/lib/responsibility-status-projection";
import { projectPartHumanStatus } from "@/lib/part-human-status";
import { projectPartAvailability } from "@/lib/availability-scope";
import { resolvePrincipalHumanStatusRoleCapabilitiesInSnapshot } from "@/lib/numbering-human-status-viewer";
import type { NumberingRecordStatus } from "@/lib/repositories/numbering-repository";
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

export async function GET(request: Request) {
  if (!principalSessionTokenFromRequest(request)) return NextResponse.json({ code: "auth_session_invalid" },
    { status: 401, headers: { "cache-control": "no-store" } });

  const url = new URL(request.url);

  const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  const productSeries = url.searchParams.get("productSeries")?.trim() || undefined;
  const seriesCode = url.searchParams.get("seriesCode")?.trim() || undefined;
  const workStatusQuery = normalizeWorkStatusQuery(url.searchParams.get("humanStatus"), url.searchParams.get("history"), url.searchParams.get("view"));
  const humanStatus = workStatusQuery.filter;
  const requestedLimit = normalizeLimit(url.searchParams.get("limit"), 50);

  return await withPrincipalNumberingCompanyRead(request, "numbering.search", async (snapshot, company, verified) => {
    const repository = new AsyncNumberingRepository(snapshot);
    const [parts, productSeriesOptions, seriesCodeOptions, viewerCapabilities] = await Promise.all([
      repository.listPartModuleRecords({
        companyId: company.companyId,
        query: url.searchParams.get("query") ?? "",
        productSeries,
        seriesCode,
        recordStatus,
        sortDirection: parseNumberSortDirection(url.searchParams.get("sortDirection")),
        limit: humanStatus === "all" ? requestedLimit : null,
        includeHistory: workStatusQuery.includeHistory
      }),
      repository.listProductSeriesOptions(company.companyId),
      repository.listSeriesCodeOptions(company.companyId),
      resolvePrincipalHumanStatusRoleCapabilitiesInSnapshot(snapshot, verified)
    ]);

    const projectedParts = parts
      .map((part) => {
        const objectiveStatus = projectPartHumanStatus(part);
        return {
          ...part,
          humanStatus: objectiveStatus,
          ...projectRoleResponsibilityStatusPair({
            status: objectiveStatus,
            actorId: verified.profile.pdmUserId,
            capabilities: viewerCapabilities,
            href: `/parts?detail=${encodeURIComponent(`part:${part.id}`)}`
          }),
          availabilityScope: projectPartAvailability(part)
        };
      })
      .filter((part) => responsibilityStatusMatchesFilter(part.responsibilityStatus, part.viewerActionability, part.humanStatus, humanStatus, part.availabilityScope))
      .slice(0, requestedLimit);
    return NextResponse.json({
      parts: projectedParts,
      productSeriesOptions,
      seriesCodeOptions,
      pdmCompany: company
    }, { headers: { "cache-control": "private, no-store" } });
  }) ?? NextResponse.json({ code: "principal_authorization_unavailable" },
    { status: 503, headers: { "cache-control": "no-store" } });
}

function normalizeEnum(value: string | null, allowed: Set<string>) {
  const text = value?.trim();
  return text && allowed.has(text) ? text : undefined;
}

function normalizeLimit(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 1), 100) : fallback;
}
