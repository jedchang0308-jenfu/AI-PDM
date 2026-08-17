import { NextResponse } from "next/server";
import {
  addApprovalAsync,
  getApprovalSummaryAsync,
  listOpenApprovalMatrixRequirementsAsync,
  reviewerHasDecisionAsync
} from "@/lib/approval-async";
import { createAuditLogAsync } from "@/lib/audit-async";
import { forbidden, requireRoleAsync } from "@/lib/auth-async";
import { getDuplicateActiveSubmissionConflictForReviewAsync } from "@/lib/drawing-submission-workbench";
import { canReadSubmissionAsync } from "@/lib/permissions";
import { assertSubmissionReleasePolicyAsync } from "@/lib/revision-policy-release-gate";
import { executeSubmissionReleaseWorkflowAsync } from "@/lib/submission-release-workflow";
import { getActiveSandboxBranchForSubmissionAsync, getSubmissionReleaseActionabilityAsync } from "@/lib/submission-status-async";
import { getSubmissionAsync } from "@/lib/submissions-async";
import { resolveLegacyDrawingLifecycleNavigation } from "@/lib/approval-workbench-legacy-redirect";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
  if (auth.response) return auth.response;

  const { id } = await params;
  const lifecycleNavigation = await resolveLegacyDrawingLifecycleNavigation({
    submissionId: id,
    actorId: auth.user.id,
    companyId: auth.user.company_id
  });
  if (lifecycleNavigation) {
    return NextResponse.json(
      {
        error: "DRAWING_LIFECYCLE_LEGACY_MUTATION_DISABLED",
        code: "DRAWING_LIFECYCLE_LEGACY_MUTATION_DISABLED",
        message: "這筆圖面進版已改由審核工作台處理。",
        canonicalHref: lifecycleNavigation.canonicalHref
      },
      { status: 410 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const reviewerId = auth.user.id;
  const comment = String(body.comment ?? "");
  const submission = await getSubmissionAsync(id);

  if (!submission) {
    return NextResponse.json({ error: "submission_not_found", message: "找不到送審資料。" }, { status: 404 });
  }
  if (!(await canReadSubmissionAsync(auth.user, submission))) return forbidden();
  if (submission.status !== "Pending") {
    return NextResponse.json(
      { error: "submission_not_pending", message: "只有審核中的送審可以核准。" },
      { status: 409 }
    );
  }
  const releaseActionability = await getSubmissionReleaseActionabilityAsync(id);
  if (!releaseActionability.allowed) {
    return NextResponse.json(
      {
        error: releaseActionability.code,
        code: releaseActionability.code,
        message: releaseActionability.message,
        recoveryHref: releaseActionability.recovery_href,
        terminalEntities: releaseActionability.terminal_entities
      },
      { status: 409 }
    );
  }
  const duplicateConflict = await getDuplicateActiveSubmissionConflictForReviewAsync(id);
  if (duplicateConflict) {
    await createAuditLogAsync({
      submissionId: id,
      actorId: reviewerId,
      action: "submission.review.blocked_duplicate_active",
      detail: duplicateConflict
    });
    return NextResponse.json(
      {
        error: duplicateConflict.code,
        code: duplicateConflict.code,
        group: duplicateConflict.group,
        message: duplicateConflict.message,
        currentSubmission: duplicateConflict.currentSubmission,
        activeSubmissions: duplicateConflict.activeSubmissions
      },
      { status: 409 }
    );
  }
  const activeSandboxBranch = await getActiveSandboxBranchForSubmissionAsync(id);
  if (activeSandboxBranch) {
    return NextResponse.json(
      { error: "active_sandbox_branch", message: "此送審仍有進行中的設計分支，請先完成或關閉分支後再核准。", branch: activeSandboxBranch },
      { status: 409 }
    );
  }
  if (await reviewerHasDecisionAsync({ submissionId: id, reviewerId })) {
    return NextResponse.json({ error: "reviewer_already_decided", message: "你已經判定過這筆送審。" }, { status: 409 });
  }

  const currentSummary = await getApprovalSummaryAsync(id);
  const finalApprovalWouldRelease = currentSummary.approved + 1 >= submission.approval_required;
  const openApprovalMatrixRequirementsBeforeApproval = finalApprovalWouldRelease
    ? await listOpenApprovalMatrixRequirementsAsync(id)
    : [];
  const reviewerWouldCloseApprovalMatrix =
    openApprovalMatrixRequirementsBeforeApproval.length === 0 ||
    openApprovalMatrixRequirementsBeforeApproval.every((requirement) => requirement.required_role === auth.user.role);
  if (finalApprovalWouldRelease && reviewerWouldCloseApprovalMatrix) {
    const policyGate = await assertSubmissionReleasePolicyAsync({ submissionId: id, actorId: reviewerId });
    if (!policyGate.ok) return NextResponse.json(policyGate.responseBody, { status: policyGate.status });
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

  const releaseResult = await executeSubmissionReleaseWorkflowAsync({ submissionId: id, actorId: reviewerId });
  if (!releaseResult.ok) {
    if (releaseResult.status === "Blocked") {
      return NextResponse.json(releaseResult.policy, { status: 409 });
    }
    return NextResponse.json(
      { error: "release_failed", message: releaseResult.error, status: "ReleaseFailed" },
      { status: 500 }
    );
  }
  return NextResponse.json({
    submissionId: id,
    status: "Released",
    release: releaseResult.release,
    lifecycle: releaseResult.lifecycle
  });
}
