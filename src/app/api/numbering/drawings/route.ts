import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { listDrawingModuleRecordsAsync, listProductSeriesOptionsAsync, listSeriesCodeOptionsAsync } from "@/lib/numbering-async";
import { ACTIVE_DRAWING_PURPOSE_CODES } from "@/lib/numbering-identity";
import { canUserUseNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { withPrincipalNumberingCompanyRead } from "@/lib/principal-numbering-read";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
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
  const url = new URL(request.url);
  const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  const purposeCode = normalizeEnum(url.searchParams.get("purposeCode"), purposeCodes) as DrawingPurposeCode | undefined;
  const productSeries = url.searchParams.get("productSeries")?.trim() || undefined;
  const seriesCode = url.searchParams.get("seriesCode")?.trim() || undefined;
  const listInput = {
    query: url.searchParams.get("query") ?? "",
    productSeries, seriesCode, recordStatus, purposeCode,
    sortDirection: parseNumberSortDirection(url.searchParams.get("sortDirection")),
    limit: Number(url.searchParams.get("limit") ?? 50)
  };

  const principalResponse = await withPrincipalNumberingCompanyRead(request, "numbering.drawings.view",
    async (snapshot, company, verified) => {
      const repository = new AsyncNumberingRepository(snapshot);
      const [drawings, productSeriesOptions, seriesCodeOptions, decisions] = await Promise.all([
        repository.listDrawingModuleRecords({ ...listInput, companyId: company.companyId }),
        repository.listProductSeriesOptions(company.companyId),
        repository.listSeriesCodeOptions(company.companyId),
        evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
          [{ permissionKind: "action", permissionCode: "approval.request.decide" }])
      ]);
      if (decisions.length !== 1 || decisions[0]?.principalId !== verified.session.principalId) {
        throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
      }
      return NextResponse.json({ drawings, productSeriesOptions, seriesCodeOptions,
        pdmCompany: company, approvalProjection: { canReview: decisions[0].allowed } });
    });
  if (principalResponse) return principalResponse;

  const auth = await requireNumberingPageAsync(request, "numbering.drawings.view");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id,
    requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;
  const [drawings, productSeriesOptions, seriesCodeOptions, approvalPermission] = await Promise.all([
    listDrawingModuleRecordsAsync({
      companyId: companyResult.company.companyId,
      ...listInput
    }),
    listProductSeriesOptionsAsync(companyResult.company.companyId),
    listSeriesCodeOptionsAsync(companyResult.company.companyId),
    canUserUseNumberingActionAsync(auth.user, "approval.request.decide")
  ]);

  return NextResponse.json({
    drawings,
    productSeriesOptions,
    seriesCodeOptions,
    pdmCompany: companyResult.company,
    approvalProjection: {
      canReview: approvalPermission.allowed
    }
  });
}

function normalizeEnum(value: string | null, allowed: Set<string>) {
  const text = value?.trim();
  return text && allowed.has(text) ? text : undefined;
}
