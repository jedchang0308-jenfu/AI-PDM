import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { getBomApplicabilityCandidateContractAsync } from "@/lib/bom-create-context";
import { SharedBomError } from "@/lib/bom-shared-structure";
import { isBomReleasedOnlyRole } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;
  const company = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (company.response) return company.response;
  if (isBomReleasedOnlyRole(auth.user)) return errorResponse("BOM_CREATE_FORBIDDEN", 403);
  const contextPartNumberId = new URL(request.url).searchParams.get("contextPartNumberId")?.trim() ?? "";
  if (!contextPartNumberId) return errorResponse("BOM_CONTEXT_PART_REQUIRED", 422);
  try {
    const contract = await getBomApplicabilityCandidateContractAsync({ companyId: company.company.companyId, contextPartNumberId });
    return NextResponse.json(contract, { headers: { etag: contract.selectionEtag, "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SharedBomError) return errorResponse(error.code, error.status, error.details);
    return errorResponse("BOM_APPLICABILITY_READ_FAILED", 500);
  }
}

function errorResponse(code: string, status: number, details: Record<string, unknown> = {}) {
  return NextResponse.json({ error: code, message: safeMessage(code), details, correlationId: crypto.randomUUID() }, { status });
}

function safeMessage(code: string) {
  if (code === "BOM_PART_NOT_ASSEMBLY") return "此料號不是可建立 BOM 的組立件";
  if (code === "BOM_OPEN_REVISION_EXISTS") return "已有未完成的 BOM 版次";
  if (code === "BOM_SHARED_STRUCTURE_DISABLED") return "共用 BOM 功能尚未啟用";
  return "無法取得適用料號";
}
