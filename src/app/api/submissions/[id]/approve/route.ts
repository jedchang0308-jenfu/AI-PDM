import { NextResponse } from "next/server";
import {
  addApprovalAsync,
  getApprovalSummaryAsync,
  listOpenApprovalMatrixRequirementsAsync,
  reviewerHasDecisionAsync
} from "@/lib/approval-async";
import { createAuditLogAsync } from "@/lib/audit-async";
import { forbidden, requireRoleAsync } from "@/lib/auth-async";
import { listOpenRequiredPhaseGateChecksAsync } from "@/lib/collaboration-async";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { releaseSubmissionViaCloudFunctionAsync } from "@/lib/release-async";
import { createReleasePackageAsync } from "@/lib/release-package-async";
import {
  getActiveSandboxBranchForSubmissionAsync,
  markSubmissionReleaseFailedAsync,
  markSubmissionReleasedAndObsoletePreviousAsync,
  markSubmissionReleasingAsync
} from "@/lib/submission-status-async";
import { getSubmissionAsync } from "@/lib/submissions-async";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reviewerId = auth.user.id;
  const comment = String(body.comment ?? "");
  const submission = await getSubmissionAsync(id);

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();
  if (submission.status !== "Pending") {
    return NextResponse.json({ error: `Only Pending submissions can be approved. Current status: ${submission.status}` }, { status: 409 });
  }
  const activeSandboxBranch = await getActiveSandboxBranchForSubmissionAsync(id);
  if (activeSandboxBranch) {
    return NextResponse.json(
      { error: "Submission has an active sandbox branch and cannot be approved", branch: activeSandboxBranch },
      { status: 409 }
    );
  }
  const openPhaseGateChecks = await listOpenRequiredPhaseGateChecksAsync(id);
  if (openPhaseGateChecks.length > 0) {
    return NextResponse.json(
      { error: "Submission has open required phase gate checks", checks: openPhaseGateChecks },
      { status: 409 }
    );
  }
  if (await reviewerHasDecisionAsync({ submissionId: id, reviewerId })) {
    return NextResponse.json({ error: "Reviewer already decided this submission" }, { status: 409 });
  }

  await addApprovalAsync({ submissionId: id, reviewerId, decision: "Approved", comment });
  await createAuditLogAsync({ submissionId: id, actorId: reviewerId, action: "ApproveRequested", detail: { comment } });

  const summary = await getApprovalSummaryAsync(id);
  if (summary.approved < submission.approval_required) {
    await createAuditLogAsync({
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
  const openApprovalMatrixRequirements = await listOpenApprovalMatrixRequirementsAsync(id);
  if (openApprovalMatrixRequirements.length > 0) {
    await createAuditLogAsync({
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

  await markSubmissionReleasingAsync(id);

  try {
    const latest = await getSubmissionAsync(id);
    if (!latest) throw new Error("Submission disappeared before release");
    const result = await releaseSubmissionViaCloudFunctionAsync(latest, reviewerId);
    const releasePackage = await createReleasePackageAsync(latest, reviewerId, result);
    const lifecycle = await markSubmissionReleasedAndObsoletePreviousAsync({ id, actorId: reviewerId });
    await createAuditLogAsync({
      submissionId: id,
      actorId: reviewerId,
      action: "ReleaseSucceeded",
      detail: { ...result, releasePackage, lifecycle }
    });
    return NextResponse.json({ submissionId: id, status: "Released", release: { ...result, package: releasePackage }, lifecycle });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Release failed";
    await markSubmissionReleaseFailedAsync({ id, releaseError: message });
    await createAuditLogAsync({ submissionId: id, actorId: reviewerId, action: "ReleaseFailed", detail: { error: message } });
    return NextResponse.json({ error: message, status: "ReleaseFailed" }, { status: 500 });
  }
}
