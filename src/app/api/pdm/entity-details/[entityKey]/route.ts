import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { isPdmEntityDetailV1Enabled } from "@/lib/number-state-flow-feature";
import { isPdmDetailSurface } from "@/lib/pdm-entity-detail-policy";
import { PdmEntityDetailError, PdmEntityDetailService } from "@/lib/pdm-entity-detail";
import { normalizePdmApprovalReturnTo } from "@/lib/pdm-review-navigation";
import { resolvePdmDetailActionCapabilities } from "@/lib/pdm-detail-action-capabilities";
import type { NumberingUserScope } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ entityKey: string }> }) {
  if (!isPdmEntityDetailV1Enabled()) return NextResponse.json({ error: { code: "PDM_ENTITY_DETAIL_DISABLED", message: "統一明細目前尚未啟用。" } }, { status: 404 });
  const url = new URL(request.url);
  const surfaceValue = url.searchParams.get("surface");
  if (!isPdmDetailSurface(surfaceValue)) return NextResponse.json({ error: { code: "PDM_ENTITY_DETAIL_SURFACE_INVALID", message: "明細來源不正確。" } }, { status: 400 });
  const reviewRequestId = url.searchParams.get("reviewRequestId");
  let actor: NumberingUserScope;
  if (reviewRequestId) {
    const authenticated = await requireAuthAsync(request);
    if (authenticated.response) return authenticated.response;
    actor = authenticated.user;
  } else {
    const permission = await requireNumberingPageAsync(request, surfaceValue === "drawing" ? "numbering.drawings.view" : surfaceValue === "part" ? "numbering.search" : "numbering.search");
    if (permission.response) return permission.response;
    actor = permission.user;
  }
  const company = await resolveNumberingCompanyContextAsync(actor.id, requestedNumberingCompanyCodeFromRequest(request));
  if (company.response) return company.response;
  try {
    const { entityKey } = await params;
    const requestedReturnTo = url.searchParams.get("returnTo");
    const returnTo = normalizePdmApprovalReturnTo(requestedReturnTo);
    const capabilities = await resolvePdmDetailActionCapabilities(actor);
    const result = await new PdmEntityDetailService().read({ entityKey, surface: surfaceValue, companyId: company.company.companyId, actorId: actor.id, reviewRequestId, returnTo, capabilities });
    return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof PdmEntityDetailError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    console.error("PDM entity detail read failed", error);
    return NextResponse.json({ error: { code: "PDM_ENTITY_DETAIL_PROJECTION_FAILED", message: "明細目前未完整載入，請重新整理。" } }, { status: 503 });
  }
}
