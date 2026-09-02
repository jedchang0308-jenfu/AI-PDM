/**
 * CAPA-001: project the persisted approval/apply state into one user-facing
 * outcome.  This file is intentionally pure so route handlers and browser
 * clients cannot drift into separate success semantics.
 */

export type ApprovalOutcomeFeedbackTone = "success" | "warning" | "danger";

export type ApprovalOutcomeFeedbackKind =
  | "decision_saved"
  | "applied"
  | "apply_failed"
  | "applying"
  | "pending"
  | "needs_info"
  | "rejected"
  | "cancelled"
  | "unknown";

export type ApprovalOutcomeFeedback = {
  kind: ApprovalOutcomeFeedbackKind;
  label: string;
  message: string;
  tone: ApprovalOutcomeFeedbackTone;
  isSuccess: boolean;
  canRetryApply: boolean;
};

export type ApprovalOutcomeFeedbackInput = {
  status: unknown;
  applyStatus?: unknown;
  decision?: unknown;
  actionCode?: unknown;
};

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * The persisted request status is the decision authority and applyStatus is
 * the domain-effect authority.  An apply failure always wins over a prior
 * approved decision, including when the transport response was HTTP 200.
 */
export function projectApprovalDecisionFeedback(input: ApprovalOutcomeFeedbackInput): ApprovalOutcomeFeedback {
  const status = normalized(input.status);
  const applyStatus = normalized(input.applyStatus);

  if (status === "apply_failed" || applyStatus === "failed") {
    return {
      kind: "apply_failed",
      label: "核准已保存，正式化未完成",
      message: "核准決議已保存，正式化尚未完成。請重試或請管理員協助。",
      tone: "danger",
      isSuccess: false,
      canRetryApply: true
    };
  }

  if (status === "applied" && applyStatus === "applied") {
    return {
      kind: "applied",
      label: "已核准並完成正式化",
      message: "已核准並完成正式化。",
      tone: "success",
      isSuccess: true,
      canRetryApply: false
    };
  }

  if (status === "approved" && applyStatus === "not_required") {
    return {
      kind: "decision_saved",
      label: "已核准（無需正式化）",
      message: "已核准；本案不需要正式化套用。",
      tone: "success",
      isSuccess: true,
      canRetryApply: false
    };
  }

  if (status === "approved" && (applyStatus === "pending" || applyStatus === "not_ready" || !applyStatus)) {
    return {
      kind: "applying",
      label: "已核准，等待正式化",
      message: "已核准；正式化尚未完成，請等待處理結果。",
      tone: "warning",
      isSuccess: false,
      canRetryApply: false
    };
  }

  if (status === "pending") {
    return {
      kind: "pending",
      label: "審核中",
      message: "審核決議尚未完成。",
      tone: "warning",
      isSuccess: false,
      canRetryApply: false
    };
  }

  if (status === "needs_info") {
    return {
      kind: "needs_info",
      label: "待補資料",
      message: "已要求補充資料，尚未完成核准。",
      tone: "warning",
      isSuccess: false,
      canRetryApply: false
    };
  }

  if (status === "rejected") {
    return {
      kind: "rejected",
      label: "已退回",
      message: "已退回修正。",
      tone: "danger",
      isSuccess: false,
      canRetryApply: false
    };
  }

  if (status === "cancelled") {
    return {
      kind: "cancelled",
      label: "已取消",
      message: "此審核已取消。",
      tone: "warning",
      isSuccess: false,
      canRetryApply: false
    };
  }

  return {
    kind: "unknown",
    label: "結果待確認",
    message: "系統已保存處理結果，但正式化狀態尚未能確認；請重新整理或請管理員協助。",
    tone: "warning",
    isSuccess: false,
    canRetryApply: false
  };
}
