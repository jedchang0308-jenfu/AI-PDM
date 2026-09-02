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
  const url = new URL(request.url);
  const contextPartNumberId = url.searchParams.get("contextPartNumberId")?.trim() ?? "";
  if (!contextPartNumberId) return errorResponse("BOM_CONTEXT_PART_REQUIRED", 422);
  if (url.searchParams.has("purpose")) return errorResponse("BOM_PURPOSE_RETIRED", 400);
  const definitionId = url.searchParams.get("definitionId")?.trim() || undefined;
  const baseReleaseSnapshotId = url.searchParams.get("baseReleaseSnapshotId")?.trim() || undefined;
  try {
    const contract = await getBomApplicabilityCandidateContractAsync({ companyId: company.company.companyId, contextPartNumberId, definitionId, baseReleaseSnapshotId });
    const response = {
      mode: contract.mode === "initial" ? "create" as const : "next_revision" as const,
      definitionId: definitionId ?? contract.definitionId,
      baseReleaseSnapshotId: baseReleaseSnapshotId ?? contract.baseReleaseSnapshotId,
      suggestedBomRevision: contract.suggestedBomRevision,
      contextPart: { partNumberId: contract.contextPart.partNumberId, partNumber: contract.contextPart.partNumber, structureType: "assembly" as const },
      candidates: contract.candidates.map((candidate) => ({
        partNumberId: candidate.partNumberId,
        partNumber: candidate.partNumber,
        selected: candidate.selected,
        selectable: candidate.selectable,
        blockerCode: candidate.blockedReason
      })),
      selectionEtag: contract.selectionEtag
    };
    return NextResponse.json(response, { headers: { etag: contract.selectionEtag, "cache-control": "private, no-store" } });
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
  if (code === "BOM_SALES_KIT_DISABLED") return "非製造 BOM 功能尚未啟用";
  if (code === "BOM_SALES_KIT_MIGRATION_BLOCKED") return "非製造 BOM 資料結構尚未就緒";
  if (code === "BOM_PURPOSE_INVALID") return "BOM 用途無效";
  if (code === "BOM_PURPOSE_RETIRED") return "BOM 不再區分用途。";
  if (code === "BOM_PURPOSE_STRUCTURE_MISMATCH") return "此料號尚未設定為有下階結構";
  if (code === "BOM_SALES_KIT_PARENT_INACTIVE") return "非製造 BOM Parent 目前不可使用";
  if (code === "BOM_DEFINITION_PURPOSE_CONFLICT") return "此料號已有不同用途的 BOM";
  return "無法取得適用料號";
}
