import { approveBomWorkbenchReviewAsync, rejectBomWorkbenchReviewAsync } from "@/lib/bom-workbench-async";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { decideDrawingRevisionPackageSupplementAsync } from "@/lib/drawing-revision-packages-async";
import {
  decideNumberingApprovalBatchAsync,
  decideNumberingApprovalAsync,
  decidePartCostChangeRequestAsync
} from "@/lib/numbering-async";
import { applyDrawingRevisionReviewAction, type DrawingRevisionReviewAction } from "@/lib/pdm-change-control";
import { approveSubmissionObsoleteReviewAsync, rejectSubmissionObsoleteReviewAsync } from "@/lib/submission-lifecycle-async";
import type { DbUser } from "@/lib/db";
import {
  AsyncApprovalPlatformRepository,
  decodeLegacyApprovalId,
  encodeLegacyApprovalId,
  type ApprovalPlatformAction,
  type ApprovalPlatformDecision,
  type ApprovalPlatformInboxItem,
  type ApprovalPlatformRequestDetail,
  type ApprovalPlatformSource,
  type ApprovalPlatformStatus,
  type CreateApprovalPlatformRequestInput
} from "@/lib/repositories/approval-platform-async-repository";

export type SubmitApprovalPlatformRequestInput = Omit<CreateApprovalPlatformRequestInput, "impactSnapshot"> & {
  impactSnapshot?: Record<string, unknown>;
};

type ApprovalPlatformActor = { id: string; role: string } & Partial<Omit<DbUser, "id" | "role">>;

export type DecideApprovalPlatformInput = {
  requestId: string;
  decision: ApprovalPlatformDecision;
  comment?: string | null;
  actor: ApprovalPlatformActor;
  companyId?: string;
  partNumber?: string;
  basisQty?: number;
};

type ApprovalHandler = {
  handlerKey: string;
  submit?: (input: SubmitApprovalPlatformRequestInput, action: ApprovalPlatformAction) => Promise<CreateApprovalPlatformRequestInput>;
  apply?: (detail: ApprovalPlatformRequestDetail, actor: ApprovalPlatformActor) => Promise<Record<string, unknown>>;
};

type LegacyApprovalSource = Exclude<ApprovalPlatformSource, "platform">;
type LegacyApprovalDecisionResult<T = unknown> = {
  detail: ApprovalPlatformRequestDetail;
  legacyResult: T;
};

const fakeHandler: ApprovalHandler = {
  handlerKey: "platform.fake",
  async submit(input, action) {
    const target = input.targets[0];
    if (!target) throw new Error("APPROVAL_TARGET_REQUIRED");
    return {
      ...input,
      title: input.title.trim() || action.title,
      impactSnapshot: input.impactSnapshot ?? {
        qcOnly: true,
        actionCode: input.actionCode,
        targetCount: input.targets.length,
        target: {
          type: target.type,
          id: target.targetId,
          code: target.code ?? null
        }
      }
    };
  },
  async apply(detail, actor) {
    return {
      qcOnly: true,
      appliedBy: actor.id,
      requestId: detail.id,
      targetCount: detail.targets.length
    };
  }
};

const handlers = new Map<string, ApprovalHandler>([[fakeHandler.handlerKey, fakeHandler]]);

function repository() {
  return new AsyncApprovalPlatformRepository(getAsyncDatabaseClient());
}

export async function listApprovalPlatformActionsAsync() {
  return repository().listActions();
}

export type ApprovalPlatformInboxFilter = {
  companyId?: string;
  status?: "active" | "all" | ApprovalPlatformStatus;
  limit?: number;
  domainCode?: string;
  actionCode?: string;
};

export async function listApprovalPlatformInboxAsync(input: ApprovalPlatformInboxFilter = {}) {
  return repository().listInbox(input) as Promise<ApprovalPlatformInboxItem[]>;
}

export async function getApprovalPlatformRequestDetailAsync(requestId: string) {
  return repository().getRequestDetail(requestId);
}

export async function submitApprovalPlatformRequestAsync(input: SubmitApprovalPlatformRequestInput) {
  const repo = repository();
  const action = await repo.getAction(input.actionCode);
  if (!action || !action.enabled) throw new Error(`APPROVAL_ACTION_NOT_REGISTERED: ${input.actionCode}`);
  const handler = handlers.get(action.handlerKey);
  if (!handler?.submit) throw new Error(`APPROVAL_HANDLER_NOT_REGISTERED: ${action.handlerKey}`);
  const normalized = await handler.submit(input, action);
  return repo.createRequest(normalized);
}

export async function decideApprovalPlatformRequestAsync(input: DecideApprovalPlatformInput) {
  const legacy = decodeLegacyApprovalId(input.requestId);
  if (legacy) return (await decideLegacyApprovalWithResult(input, legacy.source, legacy.legacyId)).detail;

  const repo = repository();
  const before = await repo.getRequestDetail(input.requestId);
  if (!before) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
  const action = await repo.getAction(before.actionCode);
  if (!action || !action.enabled) throw new Error(`APPROVAL_ACTION_NOT_REGISTERED: ${before.actionCode}`);
  const handler = handlers.get(action.handlerKey);
  if (!handler) throw new Error(`APPROVAL_HANDLER_NOT_REGISTERED: ${action.handlerKey}`);

  const decided = await repo.decideNativeRequest({
    requestId: input.requestId,
    decision: input.decision,
    comment: input.comment,
    approverRole: input.actor.role,
    approverId: input.actor.id
  });

  if (input.decision !== "approved" || !handler.apply) return decided;

  try {
    const applyDetail = await handler.apply(decided, input.actor);
    const applied = await repo.markApplyResult({
      requestId: input.requestId,
      actorId: input.actor.id,
      success: true,
      detail: applyDetail
    });
    if (!applied) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
    return applied;
  } catch (error) {
    const failed = await repo.markApplyResult({
      requestId: input.requestId,
      actorId: input.actor.id,
      success: false,
      error: error instanceof Error ? error.message : "APPROVAL_APPLY_FAILED"
    });
    if (!failed) throw error;
    return failed;
  }
}

async function decideLegacyApprovalWithResult(
  input: DecideApprovalPlatformInput,
  source: LegacyApprovalSource,
  legacyId: string
): Promise<LegacyApprovalDecisionResult> {
  if (input.decision === "needs_info" && source !== "legacy_numbering") {
    throw new Error("APPROVAL_LEGACY_NEEDS_INFO_UNSUPPORTED");
  }

  if (source === "legacy_numbering") {
    const legacyResult = await decideNumberingApprovalAsync({
      companyId: input.companyId,
      approvalRequestId: legacyId,
      decision: input.decision,
      comment: input.comment ?? undefined,
      approverRole: input.actor.role,
      approverId: input.actor.id
    });
    const detail = await repository().getRequestDetail(input.requestId);
    if (!detail) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
    return { detail, legacyResult };
  }

  if (source === "legacy_submission") {
    let legacyResult: Awaited<ReturnType<typeof approveSubmissionObsoleteReviewAsync | typeof rejectSubmissionObsoleteReviewAsync>>;
    if (input.decision === "approved") {
      legacyResult = await approveSubmissionObsoleteReviewAsync({
        requestId: legacyId,
        actorId: input.actor.id,
        decisionReason: input.comment ?? undefined
      });
    } else {
      legacyResult = await rejectSubmissionObsoleteReviewAsync({
        requestId: legacyId,
        actorId: input.actor.id,
        decisionReason: input.comment ?? undefined
      });
    }
    const detail = await repository().getRequestDetail(input.requestId);
    if (!detail) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
    return { detail, legacyResult };
  }

  if (source === "legacy_bom") {
    let legacyResult: Awaited<ReturnType<typeof approveBomWorkbenchReviewAsync | typeof rejectBomWorkbenchReviewAsync>>;
    if (input.decision === "approved") {
      legacyResult = await approveBomWorkbenchReviewAsync({ reviewId: legacyId, actorId: input.actor.id, decisionReason: input.comment ?? undefined });
    } else {
      legacyResult = await rejectBomWorkbenchReviewAsync({ reviewId: legacyId, actorId: input.actor.id, decisionReason: input.comment ?? undefined });
    }
    const detail = await repository().getRequestDetail(input.requestId);
    if (!detail) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
    return { detail, legacyResult };
  }

  if (source === "legacy_part_cost") {
    const detail = await repository().getRequestDetail(input.requestId);
    if (!detail) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
    const partNumber = input.partNumber?.trim() || detail.targetSummary.split("/")[0]?.trim();
    if (!partNumber) throw new Error("APPROVAL_PART_COST_TARGET_NOT_FOUND");
    const legacyResult = await decidePartCostChangeRequestAsync({
      companyId: input.companyId,
      partNumber,
      requestId: legacyId,
      decision: input.decision === "approved" ? "approve" : "reject",
      reviewedBy: input.actor.id,
      reviewComment: input.comment ?? null,
      basisQty: input.basisQty
    });
    const updated = await repository().getRequestDetail(input.requestId);
    if (!updated) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
    return { detail: updated, legacyResult };
  }

  if (source === "legacy_drawing_package") {
    const legacyResult = await decideDrawingRevisionPackageSupplementAsync({
      supplementId: legacyId,
      companyId: input.companyId ?? "company-jenfu",
      actorId: input.actor.id,
      actorRole: input.actor.role,
      decision: input.decision === "approved" ? "approve" : "reject",
      note: input.comment ?? null
    });
    const detail = await repository().getRequestDetail(input.requestId);
    if (!detail) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
    return { detail, legacyResult };
  }

  if (source === "legacy_drawing_revision_review") {
    const before = await repository().getRequestDetail(input.requestId);
    if (!before) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
    const action = drawingRevisionReviewDecisionAction(input.decision, String(before.payload.outcome ?? ""));
    const legacyResult = await applyDrawingRevisionReviewAction({
      assessmentId: legacyId,
      action,
      result: input.comment?.trim() || action,
      actor: {
        userId: input.actor.id,
        companyId: input.companyId ?? before.companyId,
        role: input.actor.role
      }
    });
    const detail = await repository().getRequestDetail(input.requestId);
    if (!detail) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
    return { detail, legacyResult };
  }

  throw new Error(`APPROVAL_LEGACY_SOURCE_UNSUPPORTED: ${source}`);
}

function drawingRevisionReviewDecisionAction(decision: ApprovalPlatformDecision, outcome: string): DrawingRevisionReviewAction {
  if (decision === "needs_info") throw new Error("APPROVAL_DRAWING_REVISION_NEEDS_INFO_UNSUPPORTED");
  if (outcome === "no_impact" && decision === "approved") return "confirm_bom_no_revision";
  if (outcome === "suspected_impact" && decision === "approved") return "confirm_original_part_reuse";
  if (outcome === "suspected_impact" && decision === "rejected") return "return_for_replacement_part";
  if (outcome === "confirmed_impact" && decision === "approved") return "approve_replacement_part_and_drawing_release";
  throw new Error(`APPROVAL_DRAWING_REVISION_DECISION_UNSUPPORTED: ${decision}/${outcome}`);
}

export async function decideApprovalPlatformLegacyNumberingAsync(input: {
  approvalRequestId: string;
  decision: ApprovalPlatformDecision;
  comment?: string | null;
  actor: ApprovalPlatformActor;
  companyId?: string;
}) {
  const requestId = encodeLegacyApprovalId("legacy_numbering", input.approvalRequestId);
  return (
    await decideLegacyApprovalWithResult(
      {
        requestId,
        decision: input.decision,
        comment: input.comment,
        actor: input.actor,
        companyId: input.companyId
      },
      "legacy_numbering",
      input.approvalRequestId
    )
  ).legacyResult as Awaited<ReturnType<typeof decideNumberingApprovalAsync>>;
}

export async function decideApprovalPlatformLegacyNumberingBatchAsync(input: {
  batchId: string;
  approvalRequestIds?: string[];
  decision: ApprovalPlatformDecision;
  comment?: string | null;
  itemComments?: Record<string, string>;
  actor: ApprovalPlatformActor;
  companyId?: string;
  approverRole?: string;
}) {
  return decideNumberingApprovalBatchAsync({
    companyId: input.companyId,
    batchId: input.batchId,
    approvalRequestIds: input.approvalRequestIds,
    decision: input.decision,
    comment: input.comment ?? undefined,
    itemComments: input.itemComments,
    approverRole: input.approverRole ?? input.actor.role,
    approverId: input.actor.id
  });
}

export async function decideApprovalPlatformLegacySubmissionAsync(input: {
  requestId: string;
  decision: Exclude<ApprovalPlatformDecision, "needs_info">;
  comment?: string | null;
  actor: ApprovalPlatformActor;
}) {
  return (
    await decideLegacyApprovalWithResult(
      {
        requestId: encodeLegacyApprovalId("legacy_submission", input.requestId),
        decision: input.decision,
        comment: input.comment,
        actor: input.actor
      },
      "legacy_submission",
      input.requestId
    )
  ).legacyResult;
}

export async function decideApprovalPlatformLegacyBomAsync(input: {
  reviewId: string;
  decision: Exclude<ApprovalPlatformDecision, "needs_info">;
  comment?: string | null;
  actor: ApprovalPlatformActor;
}) {
  return (
    await decideLegacyApprovalWithResult(
      {
        requestId: encodeLegacyApprovalId("legacy_bom", input.reviewId),
        decision: input.decision,
        comment: input.comment,
        actor: input.actor
      },
      "legacy_bom",
      input.reviewId
    )
  ).legacyResult;
}

export async function decideApprovalPlatformLegacyPartCostAsync(input: {
  requestId: string;
  decision: Exclude<ApprovalPlatformDecision, "needs_info">;
  comment?: string | null;
  actor: ApprovalPlatformActor;
  companyId?: string;
  partNumber?: string;
  basisQty?: number;
}) {
  return (
    await decideLegacyApprovalWithResult(
      {
        requestId: encodeLegacyApprovalId("legacy_part_cost", input.requestId),
        decision: input.decision,
        comment: input.comment,
        actor: input.actor,
        companyId: input.companyId,
        partNumber: input.partNumber,
        basisQty: input.basisQty
      },
      "legacy_part_cost",
      input.requestId
    )
  ).legacyResult as Awaited<ReturnType<typeof decidePartCostChangeRequestAsync>>;
}

export async function decideApprovalPlatformLegacyDrawingPackageSupplementAsync(input: {
  supplementId: string;
  decision: Exclude<ApprovalPlatformDecision, "needs_info">;
  comment?: string | null;
  actor: ApprovalPlatformActor;
  companyId?: string;
}) {
  return (
    await decideLegacyApprovalWithResult(
      {
        requestId: encodeLegacyApprovalId("legacy_drawing_package", input.supplementId),
        decision: input.decision,
        comment: input.comment,
        actor: input.actor,
        companyId: input.companyId
      },
      "legacy_drawing_package",
      input.supplementId
    )
  ).legacyResult as Awaited<ReturnType<typeof decideDrawingRevisionPackageSupplementAsync>>;
}

export async function decideApprovalPlatformLegacyDrawingRevisionReviewActionAsync(input: {
  assessmentId: string;
  action: DrawingRevisionReviewAction;
  result?: string | null;
  actor: ApprovalPlatformActor;
  companyId?: string;
}) {
  return applyDrawingRevisionReviewAction({
    assessmentId: input.assessmentId,
    action: input.action,
    result: input.result ?? input.action,
    actor: {
      userId: input.actor.id,
      companyId: input.companyId,
      role: input.actor.role
    }
  });
}

export async function applyApprovalPlatformRequestAsync(input: { requestId: string; actor: ApprovalPlatformActor }) {
  const legacy = decodeLegacyApprovalId(input.requestId);
  if (legacy) throw new Error("APPROVAL_LEGACY_APPLY_RETRY_UNSUPPORTED");

  const repo = repository();
  const detail = await repo.getRequestDetail(input.requestId);
  if (!detail) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
  if (detail.status !== "approved" && detail.status !== "apply_failed") {
    throw new Error(`APPROVAL_REQUEST_NOT_READY_TO_APPLY: ${detail.status}`);
  }

  const action = await repo.getAction(detail.actionCode);
  if (!action || !action.enabled) throw new Error(`APPROVAL_ACTION_NOT_REGISTERED: ${detail.actionCode}`);
  const handler = handlers.get(action.handlerKey);
  if (!handler?.apply) throw new Error(`APPROVAL_HANDLER_NOT_REGISTERED: ${action.handlerKey}`);

  try {
    const applyDetail = await handler.apply(detail, input.actor);
    const applied = await repo.markApplyResult({
      requestId: input.requestId,
      actorId: input.actor.id,
      success: true,
      detail: applyDetail
    });
    if (!applied) throw new Error(`APPROVAL_REQUEST_NOT_FOUND: ${input.requestId}`);
    return applied;
  } catch (error) {
    const failed = await repo.markApplyResult({
      requestId: input.requestId,
      actorId: input.actor.id,
      success: false,
      error: error instanceof Error ? error.message : "APPROVAL_APPLY_FAILED"
    });
    if (!failed) throw error;
    return failed;
  }
}
