import { NextResponse } from "next/server";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { createNumberingApprovalBatchAsync, listNumberingApprovalBatchesAsync } from "@/lib/numbering-async";
import { requireNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import type { ListNumberingApprovalBatchesInput, NumberingApprovalActionCode } from "@/lib/repositories/numbering-repository";

export const runtime = "nodejs";

const dvtReleaseActionCodes = new Set<NumberingApprovalActionCode>([
  "dvt_promotion",
  "dvt_missing_ma_override",
  "release",
  "release_missing_ma_confirm",
  "same_drawing_variant_after_release",
  "main_drawing_restore",
  "obsolete_part_number",
  "obsolete_ma_drawing"
]);

const validBatchStatuses = new Set(["active", "all", "pending", "partially_approved", "approved", "rejected", "needs_info", "cancelled"]);

export async function GET(request: Request) {
  const auth = await requireNumberingPageAsync(request, "numbering.approvals");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const url = new URL(request.url);
  const statusValue = url.searchParams.get("status") ?? "active";
  const status = validBatchStatuses.has(statusValue) ? statusValue : "active";
  const actionParam = url.searchParams.get("actionCodes") ?? "";
  const scope = url.searchParams.get("scope") ?? "dvt_release";
  const actionCodes =
    actionParam.trim().length > 0
      ? actionParam
          .split(",")
          .map((item) => item.trim())
          .filter((item): item is NumberingApprovalActionCode => dvtReleaseActionCodes.has(item as NumberingApprovalActionCode))
      : scope === "dvt_release"
        ? Array.from(dvtReleaseActionCodes)
        : undefined;

  const batches = await listNumberingApprovalBatchesAsync({
    companyId: companyResult.company.companyId,
    status: status as ListNumberingApprovalBatchesInput["status"],
    actionCodes,
    limit: Number(url.searchParams.get("limit") ?? 50),
    user: auth.user
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      total: batches.length,
      pending: batches.filter((batch) => batch.batchStatus === "pending").length,
      partiallyApproved: batches.filter((batch) => batch.batchStatus === "partially_approved").length,
      needsInfo: batches.filter((batch) => batch.batchStatus === "needs_info").length
    },
    batches
  });
}

export async function POST(request: Request) {
  const auth = await requireNumberingActionAsync(request, "numbering.approval.batch.create");
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;
  const approvalRequestIds = Array.isArray(body.approvalRequestIds)
    ? body.approvalRequestIds.map((id: unknown) => String(id))
    : Array.isArray(body.approval_request_ids)
      ? body.approval_request_ids.map((id: unknown) => String(id))
      : [];

  if (approvalRequestIds.length === 0) {
    return NextResponse.json({ error: "approvalRequestIds is required" }, { status: 400 });
  }

  try {
    const result = await createNumberingApprovalBatchAsync({
      companyId: companyResult.company.companyId,
      approvalRequestIds,
      projectCode: String(body.projectCode ?? body.project_code ?? "").trim() || undefined,
      actionCode: String(body.actionCode ?? body.action_code ?? "").trim() || undefined,
      submittedBy: auth.user.id
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create approval batch";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("MISMATCH") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
