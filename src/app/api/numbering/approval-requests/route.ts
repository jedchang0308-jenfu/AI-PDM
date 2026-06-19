import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import {
  requestMainDrawingRestoreApprovalAsync,
  requestNumberingApprovalAsync,
  requestSameDrawingVariantApprovalAsync
} from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";
import type { RequestNumberingApprovalInput } from "@/lib/repositories/numbering-repository";

export const runtime = "nodejs";

const allowedActionCodes = new Set([
  "dvt_promotion",
  "release",
  "same_drawing_variant_after_release",
  "dvt_missing_ma_override",
  "release_missing_ma_confirm",
  "main_drawing_restore"
]);

const allowedEntityTypes = new Set(["part_root", "part_number", "drawing_number", "same_drawing_variant"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const actionCode = String(body.actionCode ?? body.action_code ?? "").trim();
  const reason = String(body.reason ?? "").trim();

  if (!allowedActionCodes.has(actionCode)) {
    return NextResponse.json({ error: "Invalid approval action code" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const auth = await requireNumberingActionAsync(request, actionCode, { actionCode });
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;

  try {
    if (actionCode === "same_drawing_variant_after_release") {
      const result = await requestSameDrawingVariantApprovalAsync({
        companyId: companyResult.company.companyId,
        drawingNumber: String(body.drawingNumber ?? body.drawing_number ?? "").trim(),
        partNumber: String(body.partNumber ?? body.part_number ?? "").trim(),
        variants: body.variants,
        reason,
        requestedBy: auth.user.id
      });
      return NextResponse.json(result, { status: 201 });
    }

    if (actionCode === "main_drawing_restore") {
      const result = await requestMainDrawingRestoreApprovalAsync({
        companyId: companyResult.company.companyId,
        partNumber: String(body.partNumber ?? body.part_number ?? "").trim(),
        replacementDrawingNumber: String(body.replacementDrawingNumber ?? body.replacement_drawing_number ?? "").trim() || undefined,
        reason,
        requestedBy: auth.user.id
      });
      return NextResponse.json(result, { status: 201 });
    }

    const entityType = String(body.entityType ?? body.entity_type ?? "").trim();
    const entityId = String(body.entityId ?? body.entity_id ?? "").trim();
    if (!allowedEntityTypes.has(entityType) || !entityId) {
      return NextResponse.json({ error: "entityType and entityId are required" }, { status: 400 });
    }

    const result = await requestNumberingApprovalAsync({
      companyId: companyResult.company.companyId,
      actionCode: actionCode as RequestNumberingApprovalInput["actionCode"],
      entityType: entityType as RequestNumberingApprovalInput["entityType"],
      entityId,
      reason,
      payload: typeof body.payload === "object" && body.payload !== null ? body.payload : {},
      requestedBy: auth.user.id
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to request numbering approval";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("MISMATCH") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
