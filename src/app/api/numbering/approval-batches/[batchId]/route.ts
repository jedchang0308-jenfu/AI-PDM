import { NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-async";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import {
  decideNumberingApprovalBatchAsync,
  getNumberingApprovalBatchAsync,
  resubmitRejectedNumberingApprovalBatchItemsAsync
} from "@/lib/numbering-async";
import { canUserUseNumberingActionAsync, requireNumberingPageAsync } from "@/lib/numbering-permission-guard";

export const runtime = "nodejs";

function reviewerRoleCode(role: string) {
  if (role === "Admin") return "pdm_admin";
  if (role === "R&D Manager") return "rd_manager";
  return role.toLowerCase().replaceAll(" ", "_");
}

export async function GET(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.approvals");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;

  const { batchId } = await params;
  const batch = await getNumberingApprovalBatchAsync(batchId, companyResult.company.companyId);
  if (!batch) {
    return NextResponse.json({ error: "Approval batch not found" }, { status: 404 });
  }
  return NextResponse.json(batch);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const auth = await requireNumberingPageAsync(request, "numbering.approvals");
  if (auth.response) return auth.response;

  const { batchId } = await params;
  const body = await request.json().catch(() => ({}));
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request, body));
  if (companyResult.response) return companyResult.response;
  const action = String(body.action ?? "").trim();
  const batch = await getNumberingApprovalBatchAsync(batchId, companyResult.company.companyId);
  if (!batch) {
    return NextResponse.json({ error: "Approval batch not found" }, { status: 404 });
  }
  const approvalRequestIds = Array.isArray(body.approvalRequestIds)
    ? body.approvalRequestIds.map((id: unknown) => String(id))
    : Array.isArray(body.approval_request_ids)
      ? body.approval_request_ids.map((id: unknown) => String(id))
      : undefined;
  const rawItemComments = typeof body.itemComments === "object" && body.itemComments !== null ? (body.itemComments as Record<string, unknown>) : {};
  const itemComments = Object.fromEntries(
    Object.entries(rawItemComments)
      .map(([approvalRequestId, comment]) => [approvalRequestId, String(comment ?? "").trim()] as const)
      .filter(([, comment]) => comment.length > 0)
  );

  try {
    if (action === "resubmit_rejected") {
      const permission = await canUserUseNumberingActionAsync(auth.user, "numbering.approval.batch.resubmit", {
        projectCode: batch.projectCode,
        actionCode: batch.actionCode
      });
      if (!permission.allowed) return forbidden();
      const result = await resubmitRejectedNumberingApprovalBatchItemsAsync({
        companyId: companyResult.company.companyId,
        batchId,
        approvalRequestIds,
        reason: String(body.reason ?? "").trim(),
        requestedBy: auth.user.id
      });
      return NextResponse.json(result);
    }

    const decision = String(body.decision ?? action).trim();
    if (decision !== "approved" && decision !== "rejected" && decision !== "needs_info") {
      return NextResponse.json({ error: "decision must be approved, rejected, or needs_info" }, { status: 400 });
    }
    const permission = await canUserUseNumberingActionAsync(auth.user, "numbering.approval.batch.decide", {
      projectCode: batch.projectCode,
      actionCode: batch.actionCode
    });
    if (!permission.allowed) return forbidden();

    const result = await decideNumberingApprovalBatchAsync({
      companyId: companyResult.company.companyId,
      batchId,
      approvalRequestIds,
      decision,
      comment: String(body.comment ?? "").trim() || undefined,
      itemComments,
      approverRole: String(body.approverRole ?? body.approver_role ?? "").trim() || permission.roleCode || reviewerRoleCode(auth.user.role),
      approverId: auth.user.id
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update approval batch";
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("NO_") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
