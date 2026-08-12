import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  decodePdmWorkbenchCursor,
  encodePdmWorkbenchCursor,
  pdmWorkbenchFilterHash,
  PdmWorkbenchCursorError
} from "@/lib/pdm-workbench-cursor";
import type {
  PdmWorkbenchAction,
  PdmWorkbenchListResponse,
  PdmWorkbenchPermissionRequirement,
  PdmWorkbenchPreviewSummary,
  PdmWorkbenchRowBase,
  PdmWorkbenchTerminalInfo
} from "@/lib/pdm-workbench-contract";
import {
  DrawingWorkbenchAsyncRepository,
  type DrawingWorkbenchIdentityRecord
} from "@/lib/repositories/drawing-workbench-async-repository";
import { isHumanStatusFilter, projectViewerHumanStatus, viewerStatusMatchesFilter, type HumanStatusFilter, type HumanStatusProjection, type ViewerHumanStatusProjection } from "@/lib/human-status-projection";
import { projectDrawingAvailability, type AvailabilityScopeProjection } from "@/lib/availability-scope";
import { projectDrawingHumanStatus } from "@/lib/drawing-workbench-status";
import { ACTIVE_DRAWING_PURPOSE_CODES } from "@/lib/numbering-identity";
import type { NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import type { DrawingModuleListRecord, DrawingPurposeCode, NumberingRecordStatus } from "@/lib/repositories/numbering-repository";
import { parseNumberSortDirection, type NumberSortDirection } from "@/lib/number-sort";
import type { UnifiedDrawingRecord } from "@/lib/repositories/unified-drawing-async-repository";

export const DRAWING_WORKBENCH_STAGES = [
  "building",
  "drawing_preparation",
  "bundle_ready",
  "in_review",
  "auto_finalizing",
  "recovery_required",
  "official_controlled",
  "correction_required",
  "revision_in_review",
  "released",
  "history_only"
] as const;

export type DrawingWorkbenchStage = typeof DRAWING_WORKBENCH_STAGES[number];
export type DrawingWorkbenchView = "mine" | "work" | "all";
export type DrawingWorkbenchPrimaryActionKind =
  | "continue_building"
  | "complete_first_drawing"
  | "submit_bundle_review"
  | "view_review"
  | "view_processing"
  | "retry_formalization"
  | "view_drawing"
  | "create_revision"
  | "view_history";

export type DrawingWorkbenchPrimaryAction = PdmWorkbenchAction<DrawingWorkbenchPrimaryActionKind>;

export type DrawingWorkbenchSecondaryAction = {
  kind: "withdraw_review";
  label: "撤回送審";
  commandHref: string;
};

export type DrawingWorkbenchTerminalInfo = PdmWorkbenchTerminalInfo;

export type DrawingWorkbenchRow = PdmWorkbenchRowBase<
  "drawing",
  DrawingWorkbenchPrimaryActionKind
> & {
  drawingId: string;
  workspaceId: string | null;
  drawingNumberId: string | null;
  additionalDrawingCount: number;
  relatedPartSummary: string | null;
  purposeCode: DrawingPurposeCode | null;
  recordStatus: NumberingRecordStatus | null;
  pendingApprovalCount: number;
  releaseStatusMismatch: boolean;
  warningCount: number;
  stage: DrawingWorkbenchStage;
  stageLabel: string;
  usage: "not_for_formal_use" | "rd_controlled" | "released" | "historical_only";
  secondaryAction?: DrawingWorkbenchSecondaryAction | null;
  warning: { code: string; message: string } | null;
  preview: PdmWorkbenchPreviewSummary | null;
};

export type DrawingWorkbenchPermissions = {
  workspaceView: boolean;
  workspaceUpdate: boolean;
  candidateSubmit: boolean;
  candidateReview: boolean;
  publish: boolean;
  createRevision: boolean;
  draftUpdate: boolean;
  manageReferenceAttachments: boolean;
  managePermissions: boolean;
};

export type DrawingWorkbenchActor = {
  id: string;
  companyId: string;
  permissions: DrawingWorkbenchPermissions;
};

export type DrawingWorkbenchListResponse = PdmWorkbenchListResponse<DrawingWorkbenchRow, {
  seriesCodeOptions: string[];
  purposeCodeOptions: DrawingPurposeCode[];
  recordStatusOptions: NumberingRecordStatus[];
}>;

export type DrawingWorkbenchDetailResponse = {
  row: DrawingWorkbenchRow;
  drawingIdentity: UnifiedDrawingRecord;
  candidate: NumberingDraftWorkspaceRecord | null;
  drawing: DrawingModuleListRecord | null;
  sourceWorkspace: NumberingDraftWorkspaceRecord | null;
  capabilities: {
    canReviewApprovals: boolean;
    canCreateRevision: boolean;
    canUpdateDraft: boolean;
    canManageReferenceAttachments: boolean;
    canRequestSupplement: boolean;
    canDecideSupplement: boolean;
    canManagePermissions: boolean;
    permissionRequirements: {
      updateDraft: DrawingWorkbenchPermissionRequirement;
      createRevision: DrawingWorkbenchPermissionRequirement;
      manageReferenceAttachments: DrawingWorkbenchPermissionRequirement;
    };
  };
};

export type DrawingWorkbenchPermissionRequirement = PdmWorkbenchPermissionRequirement;

export class DrawingWorkbenchError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "DrawingWorkbenchError";
  }
}

type NormalizedQuery = {
  query: string;
  view: DrawingWorkbenchView;
  stage: DrawingWorkbenchStage | "";
  seriesCode: string;
  purposeCode: DrawingPurposeCode | "";
  recordStatus: NumberingRecordStatus | "";
  includeHistory: boolean;
  cursor: string;
  limit: number;
  humanStatus: HumanStatusFilter;
  sortDirection: NumberSortDirection;
};

const stageLabels: Record<DrawingWorkbenchStage, string> = {
  building: "建立中",
  drawing_preparation: "首版準備",
  bundle_ready: "可送審",
  in_review: "審核中",
  auto_finalizing: "系統正式化中",
  recovery_required: "需要處理",
  official_controlled: "研發受控",
  correction_required: "需要修正",
  revision_in_review: "新版審核中",
  released: "已發布",
  history_only: "歷史紀錄"
};

const terminalDrawingStatuses = new Set<NumberingRecordStatus>(["Obsolete", "Merged"]);
const drawingPurposeCodes = ACTIVE_DRAWING_PURPOSE_CODES;
const drawingRecordStatuses = [
  "Draft",
  "NeedInfo",
  "Active",
  "PendingReview",
  "Released",
  "Rejected",
  "Obsolete",
  "Merged",
  "PendingAdminConfirm",
  "MainDrawingInvalid"
] as const satisfies readonly NumberingRecordStatus[];

function normalizedText(value: string | null, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

export function normalizeDrawingWorkbenchQuery(url: URL): NormalizedQuery {
  const query = normalizedText(url.searchParams.get("query"), 200);
  const requestedView = normalizedText(url.searchParams.get("view"), 20);
  const view: DrawingWorkbenchView = requestedView === "mine" || requestedView === "work" ? requestedView : "all";
  const requestedStage = normalizedText(url.searchParams.get("stage"), 40);
  if (requestedStage && !(DRAWING_WORKBENCH_STAGES as readonly string[]).includes(requestedStage)) {
    throw new DrawingWorkbenchError("workbench_invalid_stage", "請重新選擇有效的階段篩選。", 400);
  }
  const rawLimit = normalizedText(url.searchParams.get("limit"), 10) || "50";
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new DrawingWorkbenchError("workbench_invalid_limit", "每頁筆數必須介於 1 到 100。", 400);
  }
  const requestedPurposeCode = normalizedText(url.searchParams.get("purposeCode"), 10);
  if (requestedPurposeCode && !(drawingPurposeCodes as readonly string[]).includes(requestedPurposeCode)) {
    throw new DrawingWorkbenchError("workbench_invalid_purpose", "請重新選擇有效的圖面用途。", 400);
  }
  const requestedRecordStatus = normalizedText(url.searchParams.get("recordStatus"), 40);
  if (requestedRecordStatus && !(drawingRecordStatuses as readonly string[]).includes(requestedRecordStatus)) {
    throw new DrawingWorkbenchError("workbench_invalid_record_status", "請重新選擇有效的資料狀態。", 400);
  }
  const requestedHistory = normalizedText(url.searchParams.get("history"), 20);
  if (requestedHistory && requestedHistory !== "include" && requestedHistory !== "exclude") {
    throw new DrawingWorkbenchError("workbench_invalid_history", "請重新選擇有效的歷史資料範圍。", 400);
  }
  const requestedHumanStatus = normalizedText(url.searchParams.get("humanStatus"), 30) || "all";
  if (!isHumanStatusFilter(requestedHumanStatus)) {
    throw new DrawingWorkbenchError("workbench_invalid_human_status", "請重新選擇有效的人類狀態篩選。", 400);
  }
  const sortDirection = parseNumberSortDirection(url.searchParams.get("sortDirection"));
  return {
    query,
    view,
    stage: requestedStage as DrawingWorkbenchStage | "",
    seriesCode: normalizedText(url.searchParams.get("seriesCode"), 80),
    purposeCode: requestedPurposeCode as DrawingPurposeCode | "",
    recordStatus: requestedRecordStatus as NumberingRecordStatus | "",
    includeHistory: requestedHistory === "include",
    cursor: normalizedText(url.searchParams.get("cursor"), 2_000),
    limit,
    humanStatus: requestedHumanStatus,
    sortDirection
  };
}

function filterHash(query: NormalizedQuery, actor: DrawingWorkbenchActor) {
  return pdmWorkbenchFilterHash({
    namespace: "drawing-v2",
    filters: {
      query: query.query.toLocaleLowerCase("zh-Hant"),
      view: query.view,
      stage: query.stage,
      seriesCode: query.seriesCode,
      purposeCode: query.purposeCode,
      recordStatus: query.recordStatus,
      includeHistory: query.includeHistory,
      humanStatus: query.humanStatus,
      sortDirection: query.sortDirection
    },
    companyId: actor.companyId,
    actorId: actor.id
  });
}

function candidateStage(workspace: NumberingDraftWorkspaceRecord): DrawingWorkbenchStage {
  if (workspace.lifecycleStatus === "cancelled") return "history_only";
  if (workspace.lifecycleV2?.stage === "drawing_addendum_required") return "drawing_preparation";
  if (workspace.reservations.filter((reservation) => reservation.state !== "recycled").length === 0) return "building";
  const stage = workspace.lifecycleV2?.stage;
  if (stage && (DRAWING_WORKBENCH_STAGES as readonly string[]).includes(stage)) return stage as DrawingWorkbenchStage;
  return "recovery_required";
}

function candidateAction(
  workspace: NumberingDraftWorkspaceRecord,
  stage: DrawingWorkbenchStage,
  actor: DrawingWorkbenchActor,
  rowKey: string
): DrawingWorkbenchPrimaryAction | null {
  const historyQuery = stage === "history_only" ? "&history=include" : "";
  const href = `/numbering/drawings?view=work${historyQuery}&detail=${encodeURIComponent(rowKey)}`;
  const owner = workspace.ownerId === actor.id;
  const disabled = (
    kind: DrawingWorkbenchPrimaryActionKind,
    label: string,
    permissionAllowed: boolean,
    permissionCode: string,
    permissionLabel: string
  ): DrawingWorkbenchPrimaryAction => {
    const enabled = owner && permissionAllowed;
    return {
      kind,
      label,
      enabled,
      disabledReason: enabled
        ? null
        : owner
          ? `缺少「${permissionLabel}」權限（${permissionCode}），請聯絡研發主管或 PDM Admin。`
          : "這筆工作需由負責人處理；請聯絡目前負責人。",
      href: enabled ? href : null,
      permissionCode: owner && !permissionAllowed ? permissionCode : null,
      contactRole: owner && !permissionAllowed ? "研發主管或 PDM Admin" : "工作負責人",
      adminHref: owner && !permissionAllowed && actor.permissions.managePermissions ? "/settings/workflow" : null
    };
  };
  if (stage === "building") return disabled("continue_building", "繼續建立", actor.permissions.workspaceUpdate, "numbering.workspace.update", "維護圖號工作");
  if (stage === "drawing_preparation") return disabled("complete_first_drawing", "完成首版", actor.permissions.draftUpdate, "numbering.draft.update", "維護受控草稿");
  if (stage === "bundle_ready") return disabled("submit_bundle_review", "送交審核", actor.permissions.candidateSubmit, "numbering.candidate.review.submit", "送交圖號審核");
  if (stage === "in_review") return { kind: "view_review", label: "查看審核", enabled: true, disabledReason: null, href };
  if (stage === "auto_finalizing") return null;
  if (stage === "recovery_required") {
    return actor.permissions.publish
      ? { kind: "retry_formalization", label: "重試正式化", enabled: true, disabledReason: null, href }
      : { kind: "view_processing", label: "查看處理狀態", enabled: true, disabledReason: null, href };
  }
  return { kind: "view_history", label: "查看取消紀錄", enabled: true, disabledReason: null, href };
}

function permissionRequirement(
  actor: DrawingWorkbenchActor,
  permissionCode: string,
  label: string,
  contactRole: string
): DrawingWorkbenchPermissionRequirement {
  return {
    permissionCode,
    label,
    contactRole,
    adminHref: actor.permissions.managePermissions ? "/settings/workflow" : null
  };
}

function workbenchCapabilities(actor: DrawingWorkbenchActor): DrawingWorkbenchDetailResponse["capabilities"] {
  return {
    canReviewApprovals: actor.permissions.candidateReview,
    canCreateRevision: actor.permissions.createRevision,
    canUpdateDraft: actor.permissions.draftUpdate,
    canManageReferenceAttachments: actor.permissions.manageReferenceAttachments,
    canRequestSupplement: actor.permissions.manageReferenceAttachments,
    canDecideSupplement: actor.permissions.manageReferenceAttachments,
    canManagePermissions: actor.permissions.managePermissions,
    permissionRequirements: {
      updateDraft: permissionRequirement(actor, "numbering.draft.update", "維護受控草稿", "研發主管或 PDM Admin"),
      createRevision: permissionRequirement(actor, "post_release_change", "建立正式圖面新版", "研發主管或 PDM Admin"),
      manageReferenceAttachments: permissionRequirement(actor, "numbering.attachments.manage", "管理參考附件", "PDM Admin")
    }
  };
}

function candidateViewerStatus(
  workspace: NumberingDraftWorkspaceRecord,
  row: Omit<DrawingWorkbenchRow, "humanStatus" | "viewerStatus" | "availabilityScope">,
  actor: DrawingWorkbenchActor,
  humanStatus: HumanStatusProjection
) {
  if (row.stage === "auto_finalizing") {
    return projectViewerHumanStatus(humanStatus, { responsibility: "system", basis: "system", canAct: false, actorLabel: "系統正在建立已發布資料" });
  }
  if (row.stage === "in_review") {
    return projectViewerHumanStatus(humanStatus, {
      responsibility: actor.permissions.candidateReview ? "current_user" : "other_user",
      basis: "role_capability",
      canAct: actor.permissions.candidateReview,
      actorLabel: actor.permissions.candidateReview ? "你的角色可進行審核" : "等待審核人員處理",
      nextStep: actor.permissions.candidateReview ? "前往審核" : "查看審核進度"
    });
  }
  if (row.stage === "recovery_required") {
    return projectViewerHumanStatus(humanStatus, {
      responsibility: actor.permissions.publish ? "current_user" : "other_user",
      basis: "role_capability",
      canAct: actor.permissions.publish,
      actorLabel: actor.permissions.publish ? "你的角色可重試正式化" : "等待發布負責人處理",
      nextStep: actor.permissions.publish ? "重試正式化" : "查看處理進度"
    });
  }
  const owner = workspace.ownerId === actor.id;
  return projectViewerHumanStatus(humanStatus, {
    responsibility: owner ? "current_user" : "other_user",
    basis: "assignee",
    canAct: owner && Boolean(row.primaryAction?.enabled),
    actorLabel: owner
      ? row.primaryAction?.enabled ? "這筆工作由你負責" : "這筆工作由你負責，但目前缺少操作權限"
      : "等待工作負責人處理",
    nextStep: owner ? row.primaryAction?.label ?? "開啟工作" : "查看進度"
  });
}

function candidateRow(
  workspace: NumberingDraftWorkspaceRecord,
  identity: DrawingWorkbenchIdentityRecord,
  drawingIdentity: UnifiedDrawingRecord,
  actor: DrawingWorkbenchActor
): DrawingWorkbenchRow {
  const canonicalStage = ({
    building: "building",
    drawing_preparation: "drawing_preparation",
    bundle_ready: "bundle_ready",
    in_review: "in_review",
    auto_finalizing: "auto_finalizing",
    recovery_required: "recovery_required",
    rd_controlled: "official_controlled",
    released: "released",
    obsolete: "history_only",
    merged: "history_only",
    cancelled: "history_only"
  } as const)[drawingIdentity.lifecycleState];
  const stage = canonicalStage ?? candidateStage(workspace);
  const selectedDrawing = workspace.drawings.find((drawing) => drawing.id === identity.drawingDraftId) ?? workspace.drawings[0] ?? null;
  const partCodes = workspace.parts
    .map((part) => part.candidateCode)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right, "zh-Hant", { numeric: true }));
  const displayCode = drawingIdentity.drawingNumber ?? selectedDrawing?.candidateCode ?? "尚未產生圖號";
  const displayName = workspace.root?.coreName ?? workspace.parts[0]?.partName ?? (workspace.draftMode === "append_part" ? "新增同圖料號" : "新增同根圖號");
  const row: Omit<DrawingWorkbenchRow, "humanStatus" | "viewerStatus" | "availabilityScope"> = {
    rowKey: identity.rowKey,
    rowKind: "drawing",
    sourceKind: "candidate",
    drawingId: drawingIdentity.id,
    workspaceId: workspace.id,
    drawingNumberId: null,
    displayCode,
    additionalDrawingCount: 0,
    displayName,
    relatedPartSummary: partCodes.length > 0 ? partCodes.join("、") : null,
    purposeCode: (selectedDrawing?.purposeCode ?? drawingIdentity.purposeCode) as DrawingPurposeCode | null,
    recordStatus: null,
    pendingApprovalCount: 0,
    releaseStatusMismatch: false,
    warningCount: stage === "recovery_required" ? 1 : 0,
    stage,
    stageLabel: stageLabels[stage],
    usage: stage === "history_only" ? "historical_only" : "not_for_formal_use",
    primaryAction: candidateAction(workspace, stage, actor, identity.rowKey),
    warning: stage === "recovery_required"
      ? { code: "candidate_recovery_required", message: "這筆工作需要處理後才能繼續。" }
      : null,
    terminal: stage === "history_only" ? {
      kind: "cancelled",
      reasonLabel: "此工作已取消，不能再由原工作往前推進。",
      nextStepLabel: "如仍需要圖號，請建立新的圖號工作。"
    } : null,
    updatedAt: drawingIdentity.updatedAt,
    preview: null
  };
  const humanStatus = projectDrawingHumanStatus(row);
  return { ...row, humanStatus, viewerStatus: candidateViewerStatus(workspace, row, actor, humanStatus), availabilityScope: projectDrawingAvailability(row) };
}

function drawingStage(drawing: DrawingModuleListRecord): DrawingWorkbenchStage {
  if (drawing.lifecycle?.state === "in_review") return "revision_in_review";
  if (drawing.lifecycle?.state === "correction_required") return "correction_required";
  if (drawing.lifecycle?.state === "released") return "released";
  if (drawing.lifecycle?.state === "preparing") return "drawing_preparation";
  if (drawing.lifecycle?.state === "rd_controlled") return "official_controlled";
  if (drawing.pendingApproval && drawing.pendingApproval.count > 0) return "revision_in_review";
  if (drawing.recordStatus === "Released") return "released";
  if (drawing.recordStatus === "Rejected") return "correction_required";
  if (terminalDrawingStatuses.has(drawing.recordStatus)) return "history_only";
  return "official_controlled";
}

function drawingViewerStatus(
  drawing: DrawingModuleListRecord,
  row: Omit<DrawingWorkbenchRow, "humanStatus" | "viewerStatus" | "availabilityScope">,
  actor: DrawingWorkbenchActor,
  humanStatus: HumanStatusProjection
) {
  if (row.stage === "revision_in_review") {
    const exactReviewer = Boolean(drawing.lifecycle?.requestId && drawing.lifecycle.reviewerIds.includes(actor.id));
    return projectViewerHumanStatus(humanStatus, {
      responsibility: exactReviewer ? "current_user" : "other_user",
      basis: "reviewer",
      canAct: exactReviewer,
      actorLabel: exactReviewer ? "這筆審核需要你處理" : "等待指定審核人員處理",
      nextStep: exactReviewer ? "前往審核" : "查看審核進度"
    });
  }
  const submittedByCurrentUser = Boolean(drawing.lifecycle?.submittedBy && drawing.lifecycle.submittedBy === actor.id);
  const roleCanHandle = actor.permissions.createRevision;
  const currentUserResponsible = submittedByCurrentUser || (!drawing.lifecycle?.submittedBy && roleCanHandle);
  return projectViewerHumanStatus(humanStatus, {
    responsibility: currentUserResponsible ? "current_user" : "other_user",
    basis: submittedByCurrentUser ? "assignee" : "role_capability",
    canAct: currentUserResponsible && Boolean(row.primaryAction?.enabled),
    actorLabel: submittedByCurrentUser
      ? "這筆圖面變更由你負責"
      : currentUserResponsible ? "你的角色可處理這一步" : "等待圖面負責人處理",
    nextStep: currentUserResponsible ? row.primaryAction?.label ?? "開啟圖面" : "查看進度"
  });
}

function drawingRow(drawing: DrawingModuleListRecord, actor: DrawingWorkbenchActor, drawingIdentity?: UnifiedDrawingRecord): DrawingWorkbenchRow {
  const stage = drawingStage(drawing);
  const terminal = stage === "history_only";
  const drawingId = drawingIdentity?.id ?? `drawing-formal-${drawing.id}`;
  const rowKey = `drawing:${drawingId}`;
  const detailHref = `/numbering/drawings?view=all${terminal ? "&history=include" : ""}&detail=${encodeURIComponent(rowKey)}`;
  let primaryAction: DrawingWorkbenchPrimaryAction;
  if (stage === "revision_in_review") {
    const exactReviewer = Boolean(drawing.lifecycle?.requestId && drawing.lifecycle.reviewerIds.includes(actor.id));
    primaryAction = {
      kind: "view_review",
      label: exactReviewer ? "前往審核" : "查看進度",
      enabled: true,
      disabledReason: null,
      href: exactReviewer ? drawing.pendingApproval?.workbenchHref ?? detailHref : detailHref
    };
  } else if (stage === "released") {
    const href = `/numbering/revisions?drawingNumber=${encodeURIComponent(drawing.drawingNumber)}`;
    primaryAction = {
      kind: "create_revision",
      label: "建立新版次",
      enabled: actor.permissions.createRevision,
      disabledReason: actor.permissions.createRevision ? null : "缺少「建立正式圖面新版」權限（post_release_change），請聯絡研發主管或 PDM Admin。",
      href: actor.permissions.createRevision ? href : null,
      permissionCode: actor.permissions.createRevision ? null : "post_release_change",
      contactRole: actor.permissions.createRevision ? null : "研發主管或 PDM Admin",
      adminHref: !actor.permissions.createRevision && actor.permissions.managePermissions ? "/settings/workflow" : null
    };
  } else if (stage === "history_only") {
    primaryAction = { kind: "view_history", label: drawing.recordStatus === "Merged" ? "查看合併紀錄" : "查看作廢紀錄", enabled: true, disabledReason: null, href: detailHref };
  } else {
    const href = `/numbering/revisions?drawingNumber=${encodeURIComponent(drawing.drawingNumber)}`;
    primaryAction = {
      kind: "create_revision",
      label: stage === "correction_required" ? "繼續修正並重送" : stage === "drawing_preparation" ? "繼續準備" : "建立新版次",
      enabled: actor.permissions.createRevision,
      disabledReason: actor.permissions.createRevision ? null : "缺少「建立正式圖面新版」權限（post_release_change），請聯絡研發主管或 PDM Admin。",
      href: actor.permissions.createRevision ? href : null,
      permissionCode: actor.permissions.createRevision ? null : "post_release_change",
      contactRole: actor.permissions.createRevision ? null : "研發主管或 PDM Admin",
      adminHref: !actor.permissions.createRevision && actor.permissions.managePermissions ? "/settings/workflow" : null
    };
  }
  const secondaryAction: DrawingWorkbenchSecondaryAction | null =
    stage === "revision_in_review" &&
    drawing.lifecycle?.requestId &&
    drawing.lifecycle.submittedBy === actor.id &&
    drawing.lifecycle.decisionCount === 0
      ? {
          kind: "withdraw_review",
          label: "撤回送審",
          commandHref: `/api/approvals/requests/${encodeURIComponent(drawing.lifecycle.requestId)}/withdraw`
        }
      : null;
  const row: Omit<DrawingWorkbenchRow, "humanStatus" | "viewerStatus" | "availabilityScope"> = {
    rowKey,
    rowKind: "drawing",
    sourceKind: "formal",
    drawingId,
    workspaceId: null,
    drawingNumberId: drawing.id,
    displayCode: drawing.drawingNumber,
    additionalDrawingCount: 0,
    displayName: drawing.coreName,
    relatedPartSummary: drawing.linkedPartNumbers.length > 0 ? drawing.linkedPartNumbers.join("、") : null,
    purposeCode: drawing.purposeCode,
    recordStatus: drawing.recordStatus,
    pendingApprovalCount: drawing.pendingApproval?.count ?? 0,
    releaseStatusMismatch: Boolean(drawing.releaseStatusMismatch),
    warningCount: drawing.warningCount,
    stage,
    stageLabel: drawing.lifecycle
      ? ({
          preparing: "準備中",
          in_review: "送審中",
          correction_required: "退回修改",
          rd_controlled: "研發受控",
          released: "發布"
        } as const)[drawing.lifecycle.state]
      : stageLabels[stage],
    usage: drawing.lifecycle?.state === "released"
      ? "released"
      : drawing.lifecycle?.state === "rd_controlled"
        ? "rd_controlled"
        : stage === "released"
          ? "released"
          : stage === "history_only"
            ? "historical_only"
            : stage === "correction_required" || stage === "drawing_preparation"
              ? "not_for_formal_use"
              : "rd_controlled",
    primaryAction,
    secondaryAction,
    warning: drawing.releaseStatusMismatch
      ? { code: "release_status_mismatch", message: "發布狀態需要確認，請先查看圖面。" }
      : drawing.lifecycle?.state === "correction_required"
        ? {
            code: "correction_required",
            message: drawing.lifecycle.correctionReason || "審核已退回；請修正本次版次後重新送審。"
          }
        : null,
    terminal: stage === "history_only" ? drawing.recordStatus === "Merged" ? {
      kind: "merged",
      reasonLabel: "此圖號已合併到其他圖號，不能再作為有效圖面使用。",
      nextStepLabel: "請改用合併後圖號；需要追溯時再查看合併紀錄。"
    } : {
      kind: "obsolete",
      reasonLabel: "此圖號已作廢，不能再作為有效圖面使用。",
      nextStepLabel: "如需變更，請建立新圖號；需要追溯時再查看作廢紀錄。"
    } : null,
    updatedAt: drawing.updatedAt,
    preview: null
  };
  const humanStatus = projectDrawingHumanStatus(row);
  return { ...row, humanStatus, viewerStatus: drawingViewerStatus(drawing, row, actor, humanStatus), availabilityScope: projectDrawingAvailability(row) };
}

export function projectDrawingWorkbenchRecord(drawing: DrawingModuleListRecord, actor: DrawingWorkbenchActor): DrawingWorkbenchRow {
  return drawingRow(drawing, actor);
}

function rowInView(row: DrawingWorkbenchRow, source: NumberingDraftWorkspaceRecord | DrawingModuleListRecord, actor: DrawingWorkbenchActor, view: DrawingWorkbenchView) {
  if (view === "all") return true;
  if (view === "work") return !["released", "history_only"].includes(row.stage);
  if (row.sourceKind === "candidate") {
    const workspace = source as NumberingDraftWorkspaceRecord;
    return workspace.ownerId === actor.id
      || (row.stage === "in_review" && actor.permissions.candidateReview)
      || (row.stage === "recovery_required" && actor.permissions.publish);
  }
  const drawing = source as DrawingModuleListRecord;
  if (drawing.lifecycle?.state === "in_review") {
    return drawing.lifecycle.reviewerIds.includes(actor.id) || Boolean(row.secondaryAction);
  }
  return row.stage === "revision_in_review" && Boolean(drawing.pendingApproval) && actor.permissions.candidateReview;
}

export class DrawingWorkbenchService {
  private readonly repository: DrawingWorkbenchAsyncRepository;
  private readonly client: AsyncDatabaseClient;

  constructor(client: AsyncDatabaseClient = getAsyncDatabaseClient()) {
    this.client = client;
    this.repository = new DrawingWorkbenchAsyncRepository(client);
  }

  async list(query: NormalizedQuery, actor: DrawingWorkbenchActor, options: { previewEnabled?: boolean } = {}): Promise<DrawingWorkbenchListResponse> {
    const currentFilterHash = filterHash(query, actor);
    const cursor = query.cursor ? decodePdmWorkbenchCursor(query.cursor, currentFilterHash) : null;
    const page = await this.repository.readListPage({
      companyId: actor.companyId,
      query: query.query,
      seriesCode: query.seriesCode,
      purposeCode: query.purposeCode,
      recordStatus: query.recordStatus,
      sortDirection: query.sortDirection,
      includeCandidates: actor.permissions.workspaceView && !query.recordStatus,
      cursor: cursor ? { sortValue: cursor.sortValue ?? cursor.updatedAt, rowKey: cursor.rowKey } : null,
      limit: query.limit
    }, (identities, candidateRecords, drawingRecords, canonicalDrawings) => {
      const candidateById = new Map(candidateRecords.map((workspace) => [workspace.id, workspace]));
      const formalById = new Map(drawingRecords.map((drawing) => [drawing.id, drawing]));
      const canonicalById = new Map(canonicalDrawings.map((drawing) => [drawing.id, drawing]));
      const projected: Array<{
        row: DrawingWorkbenchRow;
        source: NumberingDraftWorkspaceRecord | DrawingModuleListRecord;
      }> = [];
      for (const identity of identities) {
        const canonical = canonicalById.get(identity.id);
        if (!canonical) continue;
        if (identity.sourceKind === "candidate") {
          const workspace = identity.workspaceId ? candidateById.get(identity.workspaceId) : null;
          if (workspace) projected.push({ row: candidateRow(workspace, identity, canonical, actor), source: workspace });
          continue;
        }
        const drawing = identity.formalDrawingNumberId ? formalById.get(identity.formalDrawingNumberId) : null;
        if (drawing) projected.push({ row: drawingRow(drawing, actor, canonical), source: drawing });
      }
      return projected
        .filter(({ row }) => query.includeHistory || row.stage !== "history_only")
        .filter(({ row, source }) => rowInView(row, source, actor, query.view))
        .map(({ row }) => row)
        .filter((row) => !query.stage || row.stage === query.stage)
        .filter((row) => viewerStatusMatchesFilter(row.viewerStatus, row.humanStatus, query.humanStatus, row.availabilityScope));
    });
    const hasNext = page.rows.length > query.limit;
    const pageRows = page.rows.slice(0, query.limit);
    if (options.previewEnabled) {
      const { resolveDrawingWorkbenchPreviewReferences } = await import("@/lib/pdm-workbench-preview-gallery");
      const previews = await resolveDrawingWorkbenchPreviewReferences(this.client, pageRows, actor.companyId);
      for (const row of pageRows) row.preview = previews.get(row.rowKey)?.summary ?? null;
    }
    const last = pageRows.at(-1);
    return {
      rows: pageRows,
      nextCursor: hasNext && last ? encodePdmWorkbenchCursor({
        version: 1,
        filterHash: currentFilterHash,
        updatedAt: last.updatedAt,
        sortValue: last.displayCode,
        rowKey: last.rowKey
      }) : null,
      generatedAt: new Date().toISOString(),
      filters: {
        seriesCodeOptions: page.seriesCodeOptions,
        purposeCodeOptions: [...drawingPurposeCodes],
        recordStatusOptions: [...drawingRecordStatuses]
      }
    };
  }

  async detail(rowKey: string, actor: DrawingWorkbenchActor, options: { previewEnabled?: boolean } = {}): Promise<DrawingWorkbenchDetailResponse | null> {
    if (rowKey.startsWith("candidate:")) {
      if (!actor.permissions.workspaceView) return null;
      const workspaceId = rowKey.slice("candidate:".length);
      if (!workspaceId) return null;
      const canonical = await this.repository.resolveLegacyCandidateDrawing({ workspaceId, companyId: actor.companyId });
      if (!canonical) return null;
      rowKey = `drawing:${canonical.id}`;
    }
    if (rowKey.startsWith("drawing:")) {
      const drawingIdOrFormalId = rowKey.slice("drawing:".length);
      if (!drawingIdOrFormalId) return null;
      const detail = await this.repository.readUnifiedDetail({
        drawingIdOrFormalId,
        companyId: actor.companyId,
        includeSourceWorkspace: actor.permissions.workspaceView
      });
      if (!detail) return null;
      if (detail.candidate) {
        if (!actor.permissions.workspaceView) return null;
        const identity: DrawingWorkbenchIdentityRecord = {
          id: detail.canonical.id,
          rowKey: `drawing:${detail.canonical.id}`,
          sourceKind: "candidate",
          workspaceId: detail.canonical.workspaceId,
          formalDrawingNumberId: null,
          drawingDraftId: detail.canonical.drawingDraftId,
          updatedAt: detail.canonical.updatedAt,
          sortValue: detail.canonical.drawingNumber ?? "尚未產生圖號"
        };
        const row = candidateRow(detail.candidate, identity, detail.canonical, actor);
        const capabilities = workbenchCapabilities(actor);
        capabilities.canCreateRevision = false;
        capabilities.canUpdateDraft = capabilities.canUpdateDraft && !["in_review", "auto_finalizing", "recovery_required", "history_only"].includes(row.stage);
        if (options.previewEnabled) {
          const { resolveDrawingWorkbenchPreviewReferences } = await import("@/lib/pdm-workbench-preview-gallery");
          row.preview = (await resolveDrawingWorkbenchPreviewReferences(this.client, [row], actor.companyId)).get(row.rowKey)?.summary ?? null;
        }
        return {
          row,
          drawingIdentity: detail.canonical,
          candidate: detail.candidate,
          drawing: null,
          sourceWorkspace: null,
          capabilities
        };
      }
      if (!detail.drawing) return null;
      const row = drawingRow(detail.drawing, actor, detail.canonical);
      const publicDrawing: DrawingModuleListRecord = detail.drawing.lifecycle
        ? {
            ...detail.drawing,
            lifecycle: {
              state: detail.drawing.lifecycle.state,
              revision: detail.drawing.lifecycle.revision,
              requestId: null,
              submittedBy: null,
              decisionCount: 0,
              reviewerIds: [],
              correctionReason: detail.drawing.lifecycle.correctionReason
            }
          }
        : detail.drawing;
      const capabilities = workbenchCapabilities(actor);
      capabilities.canUpdateDraft = false;
      capabilities.canCreateRevision = capabilities.canCreateRevision && !["in_review", "auto_finalizing", "recovery_required", "history_only"].includes(row.stage);
      if (detail.drawing.lifecycle?.state === "in_review") {
        capabilities.canReviewApprovals = detail.drawing.lifecycle.reviewerIds.includes(actor.id);
      }
      if (options.previewEnabled) {
        const { resolveDrawingWorkbenchPreviewReferences } = await import("@/lib/pdm-workbench-preview-gallery");
        row.preview = (await resolveDrawingWorkbenchPreviewReferences(this.client, [row], actor.companyId)).get(row.rowKey)?.summary ?? null;
      }
      return {
        row,
        drawingIdentity: detail.canonical,
        candidate: null,
        drawing: publicDrawing,
        sourceWorkspace: detail.sourceWorkspace,
        capabilities
      };
    }
    return null;
  }
}

export const DRAWING_WORKBENCH_NO_STORE_HEADERS = { "cache-control": "private, no-store" } as const;

export function drawingWorkbenchErrorResponse(error: unknown) {
  if (error instanceof PdmWorkbenchCursorError) {
    return Response.json(
      { error: error.code, message: error.message },
      { status: error.status, headers: DRAWING_WORKBENCH_NO_STORE_HEADERS }
    );
  }
  if (error instanceof DrawingWorkbenchError) {
    return Response.json(
      { error: error.code, message: error.message },
      { status: error.status, headers: DRAWING_WORKBENCH_NO_STORE_HEADERS }
    );
  }
  const code = error instanceof Error ? error.message.split(":", 1)[0] : String(error);
  console.error("Drawing workbench read failed", error);
  return Response.json(
    { error: "drawing_workbench_read_failed", message: "圖號工作台目前無法載入，請重新整理。" },
    { status: 500, headers: DRAWING_WORKBENCH_NO_STORE_HEADERS }
  );
}
