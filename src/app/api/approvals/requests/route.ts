import { NextResponse } from "next/server";
import { requireAuthAsync } from "@/lib/auth-async";
import { submitApprovalPlatformRequestAsync } from "@/lib/approval-platform";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAuthAsync(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const actionCode = String(body.actionCode ?? body.action_code ?? "").trim();
  const title = String(body.title ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const targets = Array.isArray(body.targets) ? body.targets : [];

  if (!actionCode) return NextResponse.json({ error: "actionCode is required" }, { status: 400 });
  if (actionCode === "numbering.candidate_publication_review") {
    return NextResponse.json({ error: "APPROVAL_DOMAIN_SUBMIT_REQUIRED" }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: "reason is required" }, { status: 400 });
  if (targets.length === 0) return NextResponse.json({ error: "targets is required" }, { status: 400 });

  try {
    const result = await submitApprovalPlatformRequestAsync({
      companyId: String(body.companyId ?? body.company_id ?? "").trim() || undefined,
      actionCode,
      title,
      reason,
      requestedBy: auth.user.id,
      payload: objectOrEmpty(body.payload),
      impactSnapshot: objectOrUndefined(body.impactSnapshot ?? body.impact_snapshot),
      targets: targets.map((target: unknown) => normalizeTarget(target))
    });
    return NextResponse.json({ request: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "APPROVAL_REQUEST_SUBMIT_FAILED";
    return NextResponse.json({ error: message }, { status: approvalErrorStatus(message) });
  }
}

function normalizeTarget(value: unknown) {
  const target = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const role = String(target.role ?? "").trim();
  return {
    role: role === "primary" || role === "child" || role === "impact" ? role : undefined,
    type: String(target.type ?? target.targetType ?? target.target_type ?? "").trim(),
    targetId: String(target.targetId ?? target.target_id ?? target.id ?? "").trim(),
    code: nullableText(target.code ?? target.targetCode ?? target.target_code),
    label: nullableText(target.label ?? target.targetLabel ?? target.target_label),
    status: nullableText(target.status ?? target.targetStatus ?? target.target_status),
    snapshot: objectOrEmpty(target.snapshot)
  };
}

function objectOrEmpty(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function objectOrUndefined(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function approvalErrorStatus(message: string) {
  if (message.includes("NOT_REGISTERED")) return 400;
  if (message.includes("REQUIRED")) return 400;
  return 500;
}
