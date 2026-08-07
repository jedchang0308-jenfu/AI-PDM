import { NextResponse } from "next/server";
import { evaluateApprovalRulesAsync, evaluateNumberingGateAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireNumberingActionAsync(request, "settings.admin_matrix");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const actionCode = String(body.actionCode ?? body.action_code ?? "").trim();
  if (actionCode) {
    const riskFlags = Array.isArray(body.riskFlags)
      ? body.riskFlags.map((flag: unknown) => String(flag))
      : Array.isArray(body.risk_flags)
        ? body.risk_flags.map((flag: unknown) => String(flag))
        : [];

    try {
      const result = await evaluateApprovalRulesAsync({
        actionCode,
        recordStatus: body.recordStatus ?? body.record_status,
        itemKind: body.itemKind ?? body.item_kind,
        riskFlags,
        ruleVersionId: body.ruleVersionId ?? body.rule_version_id
      });
      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to evaluate approval rules";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const partNumber = String(body.partNumber ?? body.part_number ?? "").trim();
  const rawGate = String(body.gate ?? "").trim();
  const gate = rawGate === "TechnicalTransfer" || rawGate === "Release" ? rawGate : null;

  const errors: string[] = [];
  if (!partNumber) errors.push("partNumber is required");
  if (!gate) errors.push("gate must be TechnicalTransfer or Release");
  if (errors.length > 0) {
    return NextResponse.json({ error: "Invalid numbering rule simulation request", details: errors }, { status: 400 });
  }
  if (!gate) {
    return NextResponse.json({ error: "gate must be TechnicalTransfer or Release" }, { status: 400 });
  }

  try {
    const result = await evaluateNumberingGateAsync({
      partNumber,
      gate,
      allowMainDrawingOverride: Boolean(body.allowMainDrawingOverride ?? body.allow_main_drawing_override)
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to evaluate numbering gate";
    const status = message.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
