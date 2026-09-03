import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { listBomCreateCandidatesAsync } from "@/lib/bom-create-context";
import { SharedBomError } from "@/lib/bom-shared-structure";
import { isBomReleasedOnlyRole } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;
  if (isBomReleasedOnlyRole(auth.user)) return errorResponse("BOM_CREATE_FORBIDDEN", 403);
  const company = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (company.response) return company.response;
  const url = new URL(request.url);
  if (url.searchParams.has("purpose")) return errorResponse("BOM_PURPOSE_RETIRED", 400);
  const cursorInput = url.searchParams.get("cursor")?.trim() || null;
  const query = url.searchParams.get("query")?.trim() ?? "";
  const exactPartNumberId = url.searchParams.get("partNumberId")?.trim() || null;
  if (exactPartNumberId && (query || cursorInput)) return errorResponse("BOM_CREATE_CANDIDATE_FILTER_INVALID", 422);
  if (cursorInput && !query) return errorResponse("BOM_CREATE_CANDIDATE_CURSOR_INVALID", 422);
  const limitInput = Number.parseInt(url.searchParams.get("limit") ?? "25", 10);
  if (!Number.isInteger(limitInput) || limitInput < 1 || limitInput > 50) return errorResponse("BOM_CREATE_CANDIDATE_LIMIT_INVALID", 422);
  try {
    const data = await listBomCreateCandidatesAsync({
      companyId: company.company.companyId,
      actorId: auth.user.id,
      query,
      exactPartNumberId,
      cursor: cursorInput,
      limit: limitInput,
      canMutate: true
    });
    return NextResponse.json({
      mode: data.mode,
      items: data.items.map((item) => ({
        partNumberId: item.partNumberId,
        partNumber: item.partNumber,
        partName: item.partName,
        itemKind: item.itemKind,
        structureType: item.structureType,
        action: item.action,
        definitionId: item.definitionId,
        openDraftId: item.action === "open" ? item.draftId : null,
        releasedDraftId: item.action === "open" && item.draftId && item.blockerCode === null ? item.draftId : null,
        reason: item.reason ? {
          code: item.reason.code === "assembly_file" ? "assembly_file" : item.reason.code === "created_by_me_recently" ? "created_by_me" : "company_recent"
        } : null,
        blockerCode: item.blockerCode,
        actionHref: item.action === "open" && item.draftId
          ? `/bom/workbench/${encodeURIComponent(item.draftId)}?parentPartNumberId=${encodeURIComponent(item.partNumberId)}`
          : item.action === "classify" ? `/parts?detail=${encodeURIComponent(item.canonicalRowKey ?? item.partNumberId)}` : null
      })),
      nextCursor: data.nextCursor
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof SharedBomError) return errorResponse(error.code, error.status, error.details);
    return errorResponse("BOM_CREATE_CANDIDATE_READ_FAILED", 500);
  }
}

function errorResponse(code: string, status: number, details: Record<string, unknown> = {}) {
  return NextResponse.json({ error: code, message: safeMessage(code), details, correlationId: crypto.randomUUID() }, { status });
}

function safeMessage(code: string) {
  if (code === "BOM_SALES_KIT_DISABLED") return "非製造 BOM 功能尚未啟用";
  if (code === "BOM_SALES_KIT_MIGRATION_BLOCKED") return "非製造 BOM 資料結構尚未就緒";
  if (code === "BOM_SHARED_STRUCTURE_DISABLED") return "共用 BOM 功能尚未啟用";
  if (code === "BOM_PURPOSE_RETIRED") return "BOM 不再區分用途。";
  if (code === "BOM_CREATE_CANDIDATE_CURSOR_INVALID") return "搜尋位置已失效，請重新搜尋";
  if (code === "BOM_CREATE_CANDIDATE_FILTER_INVALID") return "搜尋條件不能同時使用料號與文字或游標";
  if (code === "BOM_CREATE_CANDIDATE_LIMIT_INVALID") return "搜尋筆數必須介於 1 到 50";
  if (code === "BOM_CREATE_FORBIDDEN") return "目前角色沒有建立 BOM 的權限";
  if (code === "BOM_RESOURCE_NOT_FOUND") return "找不到指定料號";
  return "無法取得可建立 BOM 的料號";
}
