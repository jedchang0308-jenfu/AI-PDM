import type {
  ContextActionBarModel,
  PdmDetailActionDescriptor,
  PdmDetailActionDisabledReasonCode,
  PdmDetailActionExecution,
  PdmDetailActionGroup,
  PdmDetailActionKind,
  PdmDetailStateFamily,
  PdmDetailSurface,
  PdmEntityKey
} from "@/lib/pdm-entity-detail-contract";
import type { PdmDetailActionCapabilities, PdmDetailCapability } from "@/lib/pdm-detail-action-capabilities";

type Owner = "drawing" | "part" | "relation";
type LockReason = {
  code: PdmDetailActionDisabledReasonCode;
  message: string;
  permissionCode?: string | null;
  contactRole?: string | null;
};

export type PdmDetailActionReviewFacts = {
  requestId: string;
  decisionReady: boolean;
  allowedDecisions: Array<"approved" | "rejected" | "needs_info">;
  drift: boolean;
};

export type PdmDetailActionResolverFacts = {
  entityKey: PdmEntityKey;
  surface: PdmDetailSurface;
  stateFamily: PdmDetailStateFamily;
  actorId: string;
  ownerId: string | null;
  ownerHref: string;
  returnTo: string;
  capabilities: PdmDetailActionCapabilities;
  readinessBlockers: string[];
  candidate: null | {
    workspaceId: string;
    rowVersion: number;
    lifecycleV2: boolean;
    requestId: string | null;
    submittedBy: string | null;
    decisionCount: number;
    canUpdate: boolean;
    canCancel: boolean;
    canSubmitReview: boolean;
    canWithdrawReview: boolean;
    applyFailed: boolean;
  };
  formalDrawing: null | {
    drawingNumber: string;
    requestId: string | null;
    submittedBy: string | null;
    decisionCount: number;
  };
  review: PdmDetailActionReviewFacts | null;
};

const actionOrder: Record<PdmDetailActionKind, { group: PdmDetailActionGroup; order: number }> = {
  edit: { group: "object", order: 100 },
  manage_files: { group: "object", order: 110 },
  manage_relation: { group: "object", order: 120 },
  submit_review: { group: "workflow", order: 200 },
  cancel: { group: "workflow", order: 205 },
  view_review: { group: "workflow", order: 210 },
  withdraw_review: { group: "workflow", order: 220 },
  retry_apply: { group: "workflow", order: 230 },
  retry_cleanup: { group: "workflow", order: 240 },
  create_revision: { group: "workflow", order: 250 },
  view_history: { group: "workflow", order: 260 },
  approve: { group: "review", order: 300 },
  return_for_correction: { group: "review", order: 310 },
  reject: { group: "review", order: 320 },
  refresh: { group: "utility", order: 900 },
  return: { group: "utility", order: 910 }
};

const groupOrder: Record<PdmDetailActionGroup, number> = { object: 0, workflow: 1, review: 2, utility: 3 };
const mutationKinds = new Set<PdmDetailActionKind>(["edit", "manage_files", "manage_relation", "submit_review", "withdraw_review", "cancel", "retry_apply", "retry_cleanup", "create_revision", "approve", "return_for_correction", "reject"]);

function ownerForSurface(surface: PdmDetailSurface): Owner {
  return surface;
}

function permissionReason(capability: PdmDetailCapability): LockReason | null {
  if (capability.allowed) return null;
  return {
    code: "PDM_ACTION_PERMISSION_REQUIRED",
    message: `目前帳號沒有此操作權限；請聯絡${capability.contactRole}。`,
    permissionCode: capability.permissionCode,
    contactRole: capability.contactRole
  };
}

function ownerReason(facts: PdmDetailActionResolverFacts): LockReason | null {
  if (!facts.ownerId || facts.ownerId === facts.actorId) return null;
  return { code: "PDM_ACTION_OWNER_REQUIRED", message: "只有這筆工作的負責人可以執行；請聯絡工作負責人。", contactRole: "工作負責人" };
}

function reviewLockReason(facts: PdmDetailActionResolverFacts): LockReason | null {
  if (facts.stateFamily !== "in_review" && !facts.review) return null;
  return { code: "PDM_ACTION_REVIEW_LOCKED", message: "送審中不可修改；如需變更應先撤回送審。" };
}

function processingReason(facts: PdmDetailActionResolverFacts): LockReason | null {
  if (facts.stateFamily !== "auto_finalizing") return null;
  return { code: "PDM_ACTION_PROCESSING", message: "系統正在完成正式化，完成前暫時不能操作。" };
}

function targetReason(execution: PdmDetailActionExecution | null): LockReason | null {
  return execution ? null : { code: "PDM_ACTION_TARGET_UNAVAILABLE", message: "此操作入口目前尚未就緒，請稍後重試或聯絡 PDM 管理者。", contactRole: "PDM 管理者" };
}

function prerequisiteReason(blockers: string[]): LockReason | null {
  if (blockers.length === 0) return null;
  return { code: "PDM_ACTION_PREREQUISITE_MISSING", message: `尚缺必要資料或檔案：${blockers.slice(0, 2).join("、")}。` };
}

function descriptor(input: {
  kind: PdmDetailActionKind;
  owner: PdmDetailActionDescriptor["owner"];
  label: string;
  execution: PdmDetailActionExecution | null;
  lock?: LockReason | null;
  confirmation?: boolean;
  idempotency?: boolean;
  danger?: boolean;
}): PdmDetailActionDescriptor {
  const position = actionOrder[input.kind];
  const locked = input.lock ?? targetReason(input.execution);
  return {
    id: `detail:${input.owner}:${input.kind}`,
    kind: input.kind,
    owner: input.owner,
    label: input.label,
    tone: locked ? "secondary" : input.danger ? "danger" : "secondary",
    placement: "secondary",
    group: position.group,
    order: position.order,
    enabled: !locked,
    disabledReason: locked?.message ?? null,
    disabledReasonCode: locked?.code ?? null,
    permissionCode: locked?.permissionCode ?? null,
    contactRole: locked?.contactRole ?? null,
    execution: locked ? null : input.execution,
    requiresConfirmation: input.confirmation ?? false,
    idempotencyRequired: input.idempotency ?? false
  };
}

function firstReason(...reasons: Array<LockReason | null>): LockReason | null {
  return reasons.find(Boolean) ?? null;
}

function navigate(href: string | null): PdmDetailActionExecution | null {
  return href ? { type: "navigate", href } : null;
}

function withAnchor(href: string, anchor: string) {
  return `${href.split("#", 1)[0]}#${anchor}`;
}

function command(href: string | null, body: Record<string, string | number | boolean | null>, input: "none" | "optional_reason" | "required_comment", success: "refresh_detail" | "return_to_inbox" = "refresh_detail"): PdmDetailActionExecution | null {
  return href ? { type: "command", method: "POST", href, body, input, success } : null;
}

function activeRequest(facts: PdmDetailActionResolverFacts) {
  return facts.review?.requestId ?? facts.candidate?.requestId ?? facts.formalDrawing?.requestId ?? null;
}

function addOwnerActions(actions: PdmDetailActionDescriptor[], facts: PdmDetailActionResolverFacts) {
  const owner = ownerForSurface(facts.surface);
  const isApprovalOwnerContext = Boolean(facts.review);
  const isCandidate = facts.candidate !== null;
  const isTerminal = ["history_only", "terminal"].includes(facts.stateFamily);
  const isRecovery = facts.stateFamily === "recovery_required";
  const candidateControlled = isCandidate && ["rd_controlled", "released"].includes(facts.stateFamily);
  const processing = processingReason(facts);
  const reviewLocked = reviewLockReason(facts);
  if (isTerminal || candidateControlled) {
    actions.push(descriptor({ kind: "view_history", owner, label: "查看歷史", execution: navigate(facts.ownerHref) }));
    return;
  }

  const drawingObjectApplicable = facts.surface !== "drawing" || ["building", "drawing_preparation", "drawing_addendum_required", "bundle_ready", "in_review", "auto_finalizing", "correction_required"].includes(facts.stateFamily);
  if (!isRecovery && drawingObjectApplicable) {
    // `drawing_addendum_required` is normalized to `drawing_preparation` for the
    // shared detail surface. The write endpoint still enforces that only active
    // or approved-locked drawing reservations can start the addendum.
    const addendumDrawingMaintenance = facts.surface === "drawing" && facts.stateFamily === "drawing_preparation";
    const candidateStateReason = isCandidate && !facts.candidate?.canUpdate && !addendumDrawingMaintenance && !reviewLocked && !processing
      ? { code: "PDM_ACTION_PREREQUISITE_MISSING", message: "目前工作狀態尚不能修改，請先完成前一步。" } satisfies LockReason
      : null;
    if (facts.surface === "drawing") {
      const maintenanceExecution = navigate(withAnchor(facts.ownerHref, "drawing-data-maintenance"));
      const editCapability = isCandidate ? facts.capabilities.workspaceEdit : facts.capabilities.draftEdit;
      const fileCapability = isCandidate ? facts.capabilities.draftEdit : facts.capabilities.manageFiles;
      actions.push(descriptor({
        kind: "edit",
        owner,
        label: "圖面維護",
        execution: maintenanceExecution,
        lock: firstReason(
          reviewLocked,
          processing,
          isCandidate ? ownerReason(facts) : null,
          permissionReason(editCapability),
          permissionReason(fileCapability),
          candidateStateReason,
          targetReason(maintenanceExecution)
        )
      }));
    } else if (facts.surface === "part") {
      const editExecution = navigate(withAnchor(facts.ownerHref, "part-data-maintenance"));
      actions.push(descriptor({ kind: "edit", owner, label: facts.stateFamily === "correction_required" ? "繼續修正" : "編輯料號資料", execution: editExecution, lock: firstReason(reviewLocked, processing, isCandidate ? ownerReason(facts) : null, permissionReason(isCandidate ? facts.capabilities.workspaceEdit : facts.capabilities.draftEdit), candidateStateReason, targetReason(editExecution)) }));
    } else if (!isApprovalOwnerContext) {
      const relationExecution = navigate(withAnchor(facts.ownerHref, "relation-maintenance"));
      actions.push(descriptor({ kind: "manage_relation", owner: "relation", label: facts.stateFamily === "correction_required" ? "繼續修正關聯" : "維護圖料關聯", execution: relationExecution, lock: firstReason(reviewLocked, processing, isCandidate ? ownerReason(facts) : null, permissionReason(facts.capabilities.manageRelation), candidateStateReason, targetReason(relationExecution)) }));
    }
  }

  if (isCandidate && ["building", "drawing_preparation", "correction_required", "bundle_ready"].includes(facts.stateFamily)) {
    const candidate = facts.candidate!;
    const suffix = candidate.lifecycleV2 ? "submit-bundle-review" : "submit-review";
    const submitExecution = command(`/api/numbering/draft-workspaces/${encodeURIComponent(candidate.workspaceId)}/${suffix}`, candidate.lifecycleV2
      ? { expectedWorkspaceRowVersion: candidate.rowVersion, reason: "由統一明細送交審核" }
      : { expectedRowVersion: candidate.rowVersion, reason: "由統一明細送交審核" }, "optional_reason");
    actions.push(descriptor({ kind: "submit_review", owner, label: "送交審核", execution: submitExecution, confirmation: true, idempotency: true, lock: firstReason(ownerReason(facts), permissionReason(facts.capabilities.submitReview), prerequisiteReason(facts.readinessBlockers), candidate.canSubmitReview ? null : prerequisiteReason(["完成所有必要資料與檔案"]), targetReason(submitExecution)) }));
    const cancelExecution = command(
      `/api/numbering/draft-workspaces/${encodeURIComponent(candidate.workspaceId)}/cancel`,
      { expectedRowVersion: candidate.rowVersion, reason: "user_cancelled_draft" },
      "optional_reason"
    );
    actions.push(descriptor({
      kind: "cancel",
      owner,
      label: "取消編號申請",
      execution: cancelExecution,
      confirmation: true,
      idempotency: true,
      danger: true,
      lock: firstReason(
        ownerReason(facts),
        permissionReason(facts.capabilities.workspaceCancel),
        candidate.canCancel ? null : prerequisiteReason(["目前工作狀態不可取消"]),
        targetReason(cancelExecution)
      )
    }));
  }

  const requestId = activeRequest(facts);
  if (facts.stateFamily === "in_review" && requestId && !isApprovalOwnerContext) {
    const viewExecution = navigate(`/approvals?requestId=${encodeURIComponent(requestId)}&returnTo=${encodeURIComponent(facts.ownerHref)}`);
    actions.push(descriptor({ kind: "view_review", owner, label: "查看審核", execution: viewExecution }));
    const submittedBy = facts.candidate?.submittedBy ?? facts.formalDrawing?.submittedBy ?? null;
    const decisionCount = facts.candidate?.decisionCount ?? facts.formalDrawing?.decisionCount ?? 0;
    const canWithdrawByState = facts.candidate?.canWithdrawReview ?? decisionCount === 0;
    const withdrawHref = facts.candidate
      ? `/api/numbering/draft-workspaces/${encodeURIComponent(facts.candidate.workspaceId)}/${facts.candidate.lifecycleV2 ? "withdraw-bundle-review" : "withdraw-review"}`
      : `/api/approvals/requests/${encodeURIComponent(requestId)}/withdraw`;
    const withdrawBody: Record<string, string | number | boolean | null> = facts.candidate
      ? facts.candidate.lifecycleV2
        ? { expectedWorkspaceRowVersion: facts.candidate.rowVersion, reason: "由統一明細撤回送審" }
        : { expectedRowVersion: facts.candidate.rowVersion, reason: "由統一明細撤回送審" }
      : {};
    const withdrawExecution = command(withdrawHref, withdrawBody, "optional_reason");
    const withdrawScopeReason = decisionCount > 0 || !canWithdrawByState
      ? { code: "PDM_ACTION_REVIEW_SCOPE_REQUIRED", message: "審核已產生決策，這筆送審目前不能撤回。" } satisfies LockReason
      : null;
    actions.push(descriptor({ kind: "withdraw_review", owner, label: "撤回送審", execution: withdrawExecution, confirmation: true, idempotency: true, danger: true, lock: firstReason(submittedBy && submittedBy !== facts.actorId ? { code: "PDM_ACTION_OWNER_REQUIRED", message: "只有送審者可以撤回；請聯絡原送審者。", contactRole: "原送審者" } : null, permissionReason(facts.capabilities.withdrawReview), withdrawScopeReason, targetReason(withdrawExecution)) }));
  } else if (facts.stateFamily === "in_review" && !requestId && !isApprovalOwnerContext) {
    actions.push(descriptor({
      kind: "view_review",
      owner,
      label: "查看審核",
      execution: null,
      lock: {
        code: "PDM_ACTION_TARGET_UNAVAILABLE",
        message: "找不到有效的審核工作項；請聯絡 PDM 管理者確認流程。",
        contactRole: "PDM 管理者"
      }
    }));
  }

  if (facts.stateFamily === "recovery_required" && facts.candidate?.applyFailed && requestId) {
    const retryExecution = command(`/api/approvals/requests/${encodeURIComponent(requestId)}/apply`, {}, "none", "return_to_inbox");
    actions.push(descriptor({ kind: "retry_apply", owner, label: "重試正式化", execution: retryExecution, confirmation: true, idempotency: true, lock: firstReason(permissionReason(facts.capabilities.retryPublication), targetReason(retryExecution)) }));
    actions.push(descriptor({ kind: "view_history", owner, label: "查看處理紀錄", execution: navigate(facts.ownerHref) }));
  }

  if (facts.surface === "drawing" && !isCandidate && ["rd_controlled", "released", "drawing_preparation", "correction_required"].includes(facts.stateFamily) && facts.formalDrawing?.drawingNumber) {
    const revisionExecution = navigate(`/numbering/revisions?drawingNumber=${encodeURIComponent(facts.formalDrawing.drawingNumber)}&returnTo=${encodeURIComponent(facts.ownerHref)}`);
    actions.push(descriptor({ kind: "create_revision", owner: "drawing", label: facts.stateFamily === "correction_required" ? "繼續修正並重送" : "建立新版次", execution: revisionExecution, lock: firstReason(reviewLocked, permissionReason(facts.capabilities.createRevision), targetReason(revisionExecution)) }));
  }

  if (!isCandidate && ["rd_controlled", "released", "in_review", "recovery_required"].includes(facts.stateFamily)) {
    actions.push(descriptor({ kind: "view_history", owner, label: "查看歷史", execution: navigate(facts.ownerHref) }));
  }

  if (["auto_finalizing", "recovery_required"].includes(facts.stateFamily)) {
    actions.push(descriptor({ kind: "refresh", owner: "navigation", label: "重新整理", execution: { type: "local", command: "refresh" } }));
  }
}

function addReviewActions(actions: PdmDetailActionDescriptor[], facts: PdmDetailActionResolverFacts) {
  const review = facts.review;
  if (!review) return;
  const mappings: Array<{ allowed: "approved" | "needs_info" | "rejected"; kind: "approve" | "return_for_correction" | "reject"; label: string; decision: string; danger?: boolean }> = [
    { allowed: "approved", kind: "approve", label: "核准", decision: "approved" },
    { allowed: "needs_info", kind: "return_for_correction", label: "要求補充資料", decision: "needs_info", danger: true },
    { allowed: "rejected", kind: "reject", label: "退回修改", decision: "rejected", danger: true }
  ];
  for (const mapping of mappings) {
    if (!review.allowedDecisions.includes(mapping.allowed)) continue;
    const execution = command(`/api/approvals/requests/${encodeURIComponent(review.requestId)}/decisions`, { decision: mapping.decision, comment: null }, mapping.kind === "approve" ? "none" : "required_comment", "return_to_inbox");
    const lock = review.drift
      ? { code: "PDM_ACTION_REVIEW_DRIFT", message: "目前資料與送審內容不一致；請重新整理並確認差異後再處理。" } satisfies LockReason
      : !review.decisionReady
        ? { code: "PDM_ACTION_REVIEW_SCOPE_REQUIRED", message: "這筆審核目前未指派給你，或已不在可決策狀態。" } satisfies LockReason
        : targetReason(execution);
    actions.push(descriptor({ kind: mapping.kind, owner: "approval", label: mapping.label, execution, confirmation: mapping.kind !== "approve", idempotency: true, danger: mapping.danger, lock }));
  }
}

function selectPrimary(actions: PdmDetailActionDescriptor[], facts: PdmDetailActionResolverFacts) {
  const enabled = (kind: PdmDetailActionKind) => actions.find((action) => action.kind === kind && action.enabled);
  const candidate = facts.review?.decisionReady && !facts.review.drift ? enabled("approve")
    : ["building", "drawing_preparation", "correction_required"].includes(facts.stateFamily) ? enabled("edit") ?? enabled("manage_relation")
      : facts.stateFamily === "bundle_ready" ? enabled("submit_review")
        : facts.stateFamily === "in_review" ? enabled("view_review")
          : facts.stateFamily === "recovery_required" ? enabled("retry_apply") ?? enabled("retry_cleanup")
            : facts.surface === "drawing" && facts.stateFamily === "released" ? enabled("create_revision")
              : undefined;
  if (!candidate) return null;
  candidate.tone = "primary";
  candidate.placement = "primary";
  return candidate;
}

export function resolvePdmDetailActions(facts: PdmDetailActionResolverFacts): ContextActionBarModel {
  const actions: PdmDetailActionDescriptor[] = [];
  addOwnerActions(actions, facts);
  addReviewActions(actions, facts);
  actions.push(descriptor({ kind: "return", owner: "navigation", label: "返回", execution: { type: "local", command: "return" } }));
  actions.sort((left, right) => groupOrder[left.group] - groupOrder[right.group] || left.order - right.order || left.id.localeCompare(right.id));
  const primary = selectPrimary(actions, facts);
  return { primary, secondary: actions.filter((action) => action !== primary) };
}

export function isPdmDetailMutationAction(action: PdmDetailActionDescriptor) {
  return mutationKinds.has(action.kind);
}
