import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { listPartModuleRecordsAsync } from "@/lib/numbering-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { canViewPartCostAmounts, redactPartListCosts } from "@/lib/part-cost-visibility";
import type { NumberingPhase, NumberingRecordStatus } from "@/lib/repositories/numbering-repository";

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
  "EVTDisabled",
  "PendingAdminConfirm",
  "MainDrawingInvalid"
]);
const phases = new Set(["EVT", "DVT", "PVT", "Release", "ECR"]);

export async function GET(request: Request) {
  const auth = await requireNumberingPageAsync(request, "numbering.search");
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const recordStatus = normalizeEnum(url.searchParams.get("recordStatus"), recordStatuses) as NumberingRecordStatus | undefined;
  const developmentPhase = normalizeEnum(url.searchParams.get("developmentPhase"), phases) as NumberingPhase | undefined;

  const parts = await listPartModuleRecordsAsync({
    companyId: companyResult.company.companyId,
    query: url.searchParams.get("query") ?? "",
    recordStatus,
    developmentPhase,
    limit: Number(url.searchParams.get("limit") ?? 50)
  });

  return NextResponse.json({ parts: redactPartListCosts(parts, canViewPartCostAmounts(auth)), pdmCompany: companyResult.company });
}

function normalizeEnum(value: string | null, allowed: Set<string>) {
  const text = value?.trim();
  return text && allowed.has(text) ? text : undefined;
}
