import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { obsoleteDraftNumberingRecordAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { isProductionNumberingLifecycleGateOpen, productionSliceDeniedPayload, isProductionSliceEnforced } from "@/lib/production-slice";
import { validateNumberStateMutationRequest } from "@/lib/number-state-flow-api";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ rootCode: string }> }) {
  const idempotencyKey = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
  const invalid = validateNumberStateMutationRequest({ request, idempotencyKey, requireIdempotency: true });
  if (invalid) return invalid;
  if (isProductionSliceEnforced() && !isProductionNumberingLifecycleGateOpen("draft-obsolete")) {
    return NextResponse.json(productionSliceDeniedPayload("numbering.records.obsolete"), { status: 403 });
  }
  const auth = await requireNumberingActionAsync(request, "numbering.draft.obsolete");
  if (auth.response) return auth.response;

  const { rootCode } = await params;
  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  const reason = String(body.reason ?? "").trim();
  if (!reason) {
    return NextResponse.json({ error: "OBSOLETE_REASON_REQUIRED", message: "請填寫作廢原因。" }, { status: 400 });
  }
  if (body.confirmObsolete !== true && body.confirm_obsolete !== true) {
    return NextResponse.json({ error: "OBSOLETE_CONFIRMATION_REQUIRED", message: "請確認這是作廢編號，而不是刪除資料。" }, { status: 400 });
  }

  try {
    const result = await obsoleteDraftNumberingRecordAsync({
      companyId: companyResult.company.companyId,
      rootCode: decodeURIComponent(rootCode),
      reason,
      obsoletedBy: auth.user.id,
      idempotencyKey: idempotencyKey?.trim()
    });
    return NextResponse.json({ result, pdmCompany: companyResult.company, idempotencyKey: idempotencyKey?.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to obsolete draft numbering record";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("NOT_DRAFT") || message.includes("CONTROLLED") || message.includes("ALREADY") || message.startsWith("LIFE_") ? 409 : 400;
    return NextResponse.json({ error: message, message: humanizeObsoleteError(message) }, { status });
  }
}

function humanizeObsoleteError(message: string) {
  if (message.includes("NOT_DRAFT")) return "此組編號已不是可直接作廢的草稿狀態。";
  if (message.includes("CONTROLLED")) return "此組編號已有受控關聯，請改走正式作廢申請。";
  if (message.includes("LIFE_ROOT_MIXED_OR_TERMINAL")) return "此圖料根號已有受控關聯或已進入終態，請改走正式作廢申請。";
  if (message.includes("ALREADY")) return "此組編號已有作廢處理中的申請。";
  if (message.includes("NOT_FOUND")) return "找不到指定的圖料根號。";
  return "作廢編號失敗，請重新整理後再試。";
}
