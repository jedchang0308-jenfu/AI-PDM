import { NextResponse } from "next/server";
import {
  addApproval,
  createAuditLog,
  getActiveSandboxBranchForSubmission,
  getApprovalSummary,
  listOpenRequiredPhaseGateChecks,
  listOpenApprovalMatrixRequirements,
  getSubmission,
  markSubmissionReleasedAndObsoletePrevious,
  reviewerHasDecision,
  updateSubmissionStatus
} from "@/lib/db";
import { releaseSubmissionViaCloudFunction } from "@/lib/release";
import { createReleasePackage } from "@/lib/release-package";
import { requireRole } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireRole(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reviewerId = auth.user.id;
  const comment = String(body.comment ?? "");
  const submission = getSubmission(id);

  if (!submission) {
    return NextResponse.json({ error: "找不到送審資料" }, { status: 404 });
  }
  if (submission.status !== "Pending") {
    return NextResponse.json({ error: `Only Pending submissions can be approved. Current status: ${submission.status}` }, { status: 409 });
  }
  const activeSandboxBranch = getActiveSandboxBranchForSubmission(id);
  if (activeSandboxBranch) {
    return NextResponse.json(
      { error: "核准或發布前必須先合併啟用中的試作分支", branch: activeSandboxBranch },
      { status: 409 }
    );
  }
  const openPhaseGateChecks = listOpenRequiredPhaseGateChecks(id);
  if (openPhaseGateChecks.length > 0) {
    return NextResponse.json(
      { error: "核准或發布前必須先完成或豁免必要階段關卡", checks: openPhaseGateChecks },
      { status: 409 }
    );
  }
  if (reviewerHasDecision({ submissionId: id, reviewerId })) {
    return NextResponse.json({ error: "審核者已決議此送審資料" }, { status: 409 });
  }

  addApproval({ submissionId: id, reviewerId, decision: "Approved", comment });
  createAuditLog({ submissionId: id, actorId: reviewerId, action: "ApproveRequested", detail: { comment } });

  const summary = getApprovalSummary(id);
  if (summary.approved < submission.approval_required) {
    createAuditLog({
      submissionId: id,
      actorId: reviewerId,
      action: "ApprovalPending",
      detail: { approved: summary.approved, required: submission.approval_required }
    });
    return NextResponse.json({
      submissionId: id,
      status: "Pending",
      approval: { approved: summary.approved, required: submission.approval_required }
    });
  }
  const openApprovalMatrixRequirements = listOpenApprovalMatrixRequirements(id);
  if (openApprovalMatrixRequirements.length > 0) {
    createAuditLog({
      submissionId: id,
      actorId: reviewerId,
      action: "ApprovalMatrixPending",
      detail: { requirements: openApprovalMatrixRequirements.map((requirement) => requirement.required_role) }
    });
    return NextResponse.json({
      submissionId: id,
      status: "Pending",
      approval: { approved: summary.approved, required: submission.approval_required },
      matrix: { open_requirements: openApprovalMatrixRequirements }
    });
  }

  updateSubmissionStatus({ id, status: "Releasing" });

  try {
    const latest = getSubmission(id);
    if (!latest) throw new Error("發布前送審資料已不存在");
    const result = await releaseSubmissionViaCloudFunction(latest, reviewerId);
    const releasePackage = await createReleasePackage(latest, reviewerId, result);
    const lifecycle = markSubmissionReleasedAndObsoletePrevious({ id, actorId: reviewerId });
    createAuditLog({ submissionId: id, actorId: reviewerId, action: "ReleaseSucceeded", detail: { ...result, releasePackage, lifecycle } });
    return NextResponse.json({ submissionId: id, status: "Released", release: { ...result, package: releasePackage }, lifecycle });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知發布錯誤";
    updateSubmissionStatus({ id, status: "ReleaseFailed", releaseError: message });
    createAuditLog({ submissionId: id, actorId: reviewerId, action: "ReleaseFailed", detail: { error: message } });
    return NextResponse.json({ error: message, status: "ReleaseFailed" }, { status: 500 });
  }
}
