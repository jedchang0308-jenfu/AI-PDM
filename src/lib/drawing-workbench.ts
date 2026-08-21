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
  type DrawingWorkbenchIdentityRecord,
  type DrawingWorkbenchRevisionRecord
} from "@/lib/repositories/drawing-workbench-async-repository";
import type { HumanStatusProjection, ViewerHumanStatusProjection } from "@/lib/human-status-projection";
import { parseWorkStatusSelection, type WorkStatusFilter } from "@/lib/work-status-presentation";
import { actionEvidenceFrom, projectResponsibilityStatusPair, responsibilityStatusMatchesSelection, type ResponsibilityActionEvidence } from "@/lib/responsibility-status-projection";
import type { PdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-contract";
import { parsePdmWorkbenchFilterSelection, PdmWorkbenchFilterSelectionError, selectionHashValue } from "@/lib/pdm-workbench-filter-selection";
import { projectDrawingAvailability, type AvailabilityScopeProjection } from "@/lib/availability-scope";
import { projectDrawingHumanStatus } from "@/lib/drawing-workbench-status";
import { canEditPdmOwnedResource } from "@/lib/pdm-edit-scope-policy";
import { ACTIVE_DRAWING_PURPOSE_CODES } from "@/lib/numbering-identity";
import { PDM_WORKBENCH_RECORD_STATUS_VALUES } from "@/lib/pdm-workbench-filter-options";
import { projectNumberLifecycleUserView } from "@/lib/number-lifecycle-user-view";
import type { NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import type { DrawingModuleListRecord, DrawingPurposeCode, NumberingRecordStatus } from "@/lib/repositories/numbering-repository";
import { parseNumberSortDirection, type NumberSortDirection } from "@/lib/number-sort";
import { compareRevisionCodes } from "@/lib/revision-policy";
import type { UnifiedDrawingRecord } from "@/lib/repositories/unified-drawing-async-repository";
import { isPdmWorkbenchProductionRdLanesV1Enabled } from "@/lib/number-state-flow-feature";
import { groupPdmWorkbenchRows, laneSelectionIncludes, makePdmWorkbenchLaneFields, withPdmWorkbenchLane } from "@/lib/pdm-workbench-lane";
import { verifyPdmWorkbenchProjectionToken, PdmWorkbenchProjectionTokenError, pdmWorkbenchReferenceFingerprint } from "@/lib/pdm-workbench-projection-token";

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
  candidateWithdraw: boolean;
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
  canEditNonOwned: boolean;
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
    canSubmitReview: boolean;
    canWithdrawReview: boolean;
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
  seriesCode: PdmWorkbenchFilterSelection<string>;
  purposeCode: PdmWorkbenchFilterSelection<DrawingPurposeCode>;
  recordStatus: PdmWorkbenchFilterSelection<NumberingRecordStatus>;
  includeHistory: boolean;
  cursor: string;
  direction: "after" | "before";
  limit: number;
  humanStatus: PdmWorkbenchFilterSelection<WorkStatusFilter>;
  sortDirection: NumberSortDirection;
  lane: PdmWorkbenchFilterSelection<"production" | "rd">;
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
export const DRAWING_WORKBENCH_PURPOSE_CODES = ACTIVE_DRAWING_PURPOSE_CODES;
export const DRAWING_WORKBENCH_RECORD_STATUS_VALUES = PDM_WORKBENCH_RECORD_STATUS_VALUES;
const drawingPurposeCodes = DRAWING_WORKBENCH_PURPOSE_CODES;
const drawingRecordStatuses = DRAWING_WORKBENCH_RECORD_STATUS_VALUES;

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
  const purposeCode = parsePdmWorkbenchFilterSelection<DrawingPurposeCode>(url.searchParams, "purposeCode", { allowedValues: drawingPurposeCodes, maxValueLength: 10 });
  const recordStatus = parsePdmWorkbenchFilterSelection<NumberingRecordStatus>(url.searchParams, "recordStatus", { allowedValues: drawingRecordStatuses, maxValueLength: 40 });
  const requestedHistory = normalizedText(url.searchParams.get("history"), 20);
  if (requestedHistory && requestedHistory !== "include" && requestedHistory !== "exclude") {
    throw new DrawingWorkbenchError("workbench_invalid_history", "請重新選擇有效的歷史資料範圍。", 400);
  }
  const workStatusQuery = parseWorkStatusSelection(url.searchParams, { history: requestedHistory, view: requestedView, supportsMineView: true, strict: true });
  const sortDirection = parseNumberSortDirection(url.searchParams.get("sortDirection"));
  const requestedDirection = url.searchParams.get("direction");
  if (requestedDirection && requestedDirection !== "after" && requestedDirection !== "before") {
    throw new DrawingWorkbenchError("workbench_invalid_direction", "清單位置方向不正確。", 400);
  }
  return {
    query,
    view: (workStatusQuery.view === "mine" || workStatusQuery.view === "work" ? workStatusQuery.view : view),
    stage: requestedStage as DrawingWorkbenchStage | "",
    seriesCode: parsePdmWorkbenchFilterSelection(url.searchParams, "seriesCode", { maxValueLength: 80 }),
    purposeCode,
    recordStatus,
    includeHistory: workStatusQuery.includeHistory,
    cursor: normalizedText(url.searchParams.get("cursor"), 2_000),
    direction: requestedDirection === "before" ? "before" : "after",
    limit,
    humanStatus: workStatusQuery.selection,
    sortDirection,
    lane: parsePdmWorkbenchFilterSelection(url.searchParams, "lane", { allowedValues: ["production", "rd"], maxValueLength: 20 })
  };
}

function filterHash(query: NormalizedQuery, actor: DrawingWorkbenchActor) {
  return pdmWorkbenchFilterHash({
    namespace: "drawing-v2",
    filters: {
      query: query.query.toLocaleLowerCase("zh-Hant"),
      view: query.view,
      stage: query.stage,
      seriesCode: selectionHashValue(query.seriesCode),
      purposeCode: selectionHashValue(query.purposeCode),
      recordStatus: selectionHashValue(query.recordStatus),
      includeHistory: query.includeHistory,
      humanStatus: selectionHashValue(query.humanStatus),
      sortDirection: query.sortDirection,
      lane: selectionHashValue(query.lane)
    },
    companyId: actor.companyId,
    actorId: actor.id
  });
}

function candidateStage(workspace: NumberingDraftWorkspaceRecord): DrawingWorkbenchStage {
  if (workspace.lifecycleStatus === "cancelled") return "history_only";
  if (workspace.lifecycleV2?.stage === "drawing_addendum_required") return "drawing_preparation";
  if (workspace.reservations.filter((reservation) => reservation.state !== "recycled").length === 0) return "building";
  const stage = workspace.lifecycleV2 ? projectNumberLifecycleUserView(workspace.lifecycleV2).stage : undefined;
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
  const returnTo = `/numbering/drawings?view=work${historyQuery}`;
  const drawingId = rowKey.startsWith("drawing:") ? rowKey.slice("drawing:".length) : "";
  const workspaceHref = (intent: string) => drawingId
    ? `/numbering/drawings/${encodeURIComponent(drawingId)}/workspace?intent=${encodeURIComponent(intent)}&returnTo=${encodeURIComponent(returnTo)}`
    : `/numbering/drawings?view=work${historyQuery}&detail=${encodeURIComponent(rowKey)}`;
  const href = workspaceHref("view");
  const canMaintain = canEditPdmOwnedResource({ actorId: actor.id, ownerId: workspace.ownerId, canEditNonOwned: actor.canEditNonOwned });
  const workspaceAction = (
    kind: DrawingWorkbenchPrimaryActionKind,
    ownerLabel: string,
    permissionAllowed: boolean,
    intent: string
  ): DrawingWorkbenchPrimaryAction => ({
    kind,
    label: canMaintain && permissionAllowed ? ownerLabel : "查看工作區",
    enabled: true,
    disabledReason: null,
    href: workspaceHref(canMaintain && permissionAllowed ? intent : "view"),
    permissionCode: null,
    contactRole: null,
    adminHref: null
  });
  if (stage === "building") return workspaceAction("continue_building", "繼續建立", actor.permissions.workspaceUpdate, "view");
  if (stage === "drawing_preparation") return workspaceAction("complete_first_drawing", "編輯此版次", actor.permissions.draftUpdate, "edit_revision");
  if (stage === "correction_required") return workspaceAction("complete_first_drawing", "繼續修正", actor.permissions.draftUpdate, "edit_revision");
  if (stage === "bundle_ready") return workspaceAction("submit_bundle_review", "編輯此版次", actor.permissions.draftUpdate, "edit_revision");
  if (stage === "in_review") {
    const requestId = workspace.latestApproval?.requestId;
    return { kind: "view_review", label: "查看審核", enabled: true, disabledReason: null, href: requestId ? `/approvals/${encodeURIComponent(requestId)}?returnTo=${encodeURIComponent(returnTo)}` : href };
  }
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
    canSubmitReview: actor.permissions.candidateSubmit,
    canWithdrawReview: actor.permissions.candidateWithdraw,
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

function candidateStatusPair(
  workspace: NumberingDraftWorkspaceRecord,
  row: Omit<DrawingWorkbenchRow, "humanStatus" | "responsibilityStatus" | "viewerActionability" | "viewerStatus" | "availabilityScope">,
  actor: DrawingWorkbenchActor,
  humanStatus: HumanStatusProjection
) {
  const recoveryEvidence: ResponsibilityActionEvidence | null = row.stage === "recovery_required"
    ? { kind: "retry_formalization", label: "重試正式化", enabled: actor.permissions.publish, disabledReason: actor.permissions.publish ? null : "目前沒有正式化恢復權限。", href: row.primaryAction?.href }
    : null;
  const actions = [actionEvidenceFrom(row.primaryAction), recoveryEvidence]
    .filter((action): action is NonNullable<ReturnType<typeof actionEvidenceFrom>> => Boolean(action && action.kind !== "view_processing"));
  return projectResponsibilityStatusPair({
    status: humanStatus,
    actorId: actor.id,
    ownerId: workspace.ownerId,
    ownerQueueEligible: actor.canEditNonOwned && actions.some((action) => action.enabled),
    hasActiveReviewWorkItem: row.stage === "in_review" && workspace.latestApproval?.status === "pending",
    hasOwnerResponsibilityAction: !["in_review", "auto_finalizing", "recovery_required", "history_only"].includes(row.stage) && Boolean(row.primaryAction),
    hasSystemAdminRecoveryAction: row.stage === "recovery_required" && Boolean(workspace.lifecycleV2?.stage === "recovery_required" || workspace.latestApproval?.status === "apply_failed" || workspace.latestApproval?.applyStatus === "failed"),
    systemFinalizing: row.stage === "auto_finalizing",
    reviewQueueEligible: row.stage === "in_review" && actor.permissions.candidateReview,
    systemAdminQueueEligible: row.stage === "recovery_required" && actor.permissions.publish,
    responsibilityActions: actions
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
  const row: Omit<DrawingWorkbenchRow, "humanStatus" | "responsibilityStatus" | "viewerActionability" | "viewerStatus" | "availabilityScope"> = {
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
  const pair = candidateStatusPair(workspace, row, actor, humanStatus);
  return { ...row, humanStatus, ...pair, availabilityScope: projectDrawingAvailability(row) };
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

function drawingStatusPair(
  drawing: DrawingModuleListRecord,
  row: Omit<DrawingWorkbenchRow, "humanStatus" | "responsibilityStatus" | "viewerActionability" | "viewerStatus" | "availabilityScope">,
  actor: DrawingWorkbenchActor,
  humanStatus: HumanStatusProjection
) {
  const action = actionEvidenceFrom(row.primaryAction);
  const actions = action && action.kind !== "view_review" && action.kind !== "view_history" ? [action] : [];
  const reviewActions = action ? [action] : [];
  return projectResponsibilityStatusPair({
    status: humanStatus,
    actorId: actor.id,
    ownerId: drawing.lifecycle?.submittedBy ?? null,
    reviewerIds: drawing.lifecycle?.reviewerIds,
    hasActiveReviewWorkItem: row.stage === "revision_in_review" && Boolean(drawing.lifecycle?.requestId),
    hasOwnerResponsibilityAction: row.stage !== "revision_in_review" && row.stage !== "history_only" && row.stage !== "released" && Boolean(row.primaryAction),
    systemFinalizing: row.stage === "auto_finalizing",
    responsibilityActions: row.stage === "revision_in_review" ? reviewActions : actions
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
      label: !drawing.lifecycle?.requestId ? "確認審核狀態" : exactReviewer ? "前往審核" : "查看進度",
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
    (drawing.lifecycle.submittedBy === actor.id || actor.canEditNonOwned) &&
    drawing.lifecycle.decisionCount === 0
      ? {
          kind: "withdraw_review",
          label: "撤回送審",
          commandHref: `/api/approvals/requests/${encodeURIComponent(drawing.lifecycle.requestId)}/withdraw`
        }
      : null;
  const row: Omit<DrawingWorkbenchRow, "humanStatus" | "responsibilityStatus" | "viewerActionability" | "viewerStatus" | "availabilityScope"> = {
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
  const pair = drawingStatusPair(drawing, row, actor, humanStatus);
  return { ...row, humanStatus, ...pair, availabilityScope: projectDrawingAvailability(row) };
}

/**
 * Re-project a formal drawing record onto one exact revision lane. The list
 * resolver overlays the latest revision onto the formal row; dual-lane rows
 * must not inherit that overlay's status when the other lane is selected.
 */
function drawingRecordForRevision(drawing: DrawingModuleListRecord, revision: DrawingWorkbenchRevisionRecord): DrawingModuleListRecord {
  const lifecycle = drawing.lifecycle
    ? {
        ...drawing.lifecycle,
        state: revision.lifecycleState,
        revision: revision.revision,
        requestId: null,
        submittedBy: null,
        decisionCount: 0,
        reviewerIds: [],
        correctionReason: null
      }
    : {
        state: revision.lifecycleState,
        revision: revision.revision,
        requestId: null,
        submittedBy: null,
        decisionCount: 0,
        reviewerIds: [],
        correctionReason: null
      };
  return {
    ...drawing,
    lifecycle,
    recordStatus: revision.lifecycleState === "released" ? "Released" : drawing.recordStatus,
    updatedAt: revision.updatedAt
  };
}

export function projectDrawingWorkbenchRecord(drawing: DrawingModuleListRecord, actor: DrawingWorkbenchActor): DrawingWorkbenchRow {
  return drawingRow(drawing, actor);
}

function rowInView(row: DrawingWorkbenchRow, source: NumberingDraftWorkspaceRecord | DrawingModuleListRecord, actor: DrawingWorkbenchActor, view: DrawingWorkbenchView) {
  if (view === "all") return true;
  if (view === "work") return !["released", "history_only"].includes(row.stage);
  return row.viewerActionability.isMine;
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
    const lanesEnabled = isPdmWorkbenchProductionRdLanesV1Enabled();
    const cursor = query.cursor ? decodePdmWorkbenchCursor(query.cursor, currentFilterHash, process.env, lanesEnabled ? 2 : 1) : null;
    const direction = cursor?.direction === "before" ? "before" : query.direction;
    const page = await this.repository.readListPage({
      companyId: actor.companyId,
      query: query.query,
      seriesCode: query.seriesCode,
      purposeCode: query.purposeCode,
      recordStatus: query.recordStatus,
      sortDirection: query.sortDirection,
      includeCandidates: actor.permissions.workspaceView && query.recordStatus.mode === "all",
      cursor: cursor ? { sortValue: cursor.sortValue ?? cursor.updatedAt, rowKey: cursor.rowKey } : null,
      direction,
      limit: lanesEnabled ? Math.min(100, query.limit * 2) : query.limit
    }, (identities, candidateRecords, drawingRecords, canonicalDrawings, sourceWorkspaces = [], revisions = []) => {
      const candidateById = new Map(candidateRecords.map((workspace) => [workspace.id, workspace]));
      const sourceWorkspaceById = new Map(sourceWorkspaces.filter((workspace) => !["published", "cancelled"].includes(workspace.lifecycleStatus)).map((workspace) => [workspace.id, workspace]));
      const formalById = new Map(drawingRecords.map((drawing) => [drawing.id, drawing]));
      const canonicalById = new Map(canonicalDrawings.map((drawing) => [drawing.id, drawing]));
      const revisionsByDrawingId = new Map<string, DrawingWorkbenchRevisionRecord[]>();
      for (const revision of revisions) revisionsByDrawingId.set(revision.drawingId, [...(revisionsByDrawingId.get(revision.drawingId) ?? []), revision]);
      const latestRevision = (drawingId: string, lifecycleState: DrawingWorkbenchRevisionRecord["lifecycleState"]) => {
        const candidates = (revisionsByDrawingId.get(drawingId) ?? []).filter((revision) => revision.lifecycleState === lifecycleState);
        return candidates.sort((left, right) => {
          try { return compareRevisionCodes(right.revision, left.revision, { allowLegacy: true }); }
          catch { return right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id); }
        })[0] ?? null;
      };
      const latestRdRevision = (drawingId: string) => {
        const candidates = (revisionsByDrawingId.get(drawingId) ?? []).filter((revision) => revision.lifecycleState !== "released");
        return candidates.sort((left, right) => {
          try { return compareRevisionCodes(right.revision, left.revision, { allowLegacy: true }); }
          catch { return right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id); }
        })[0] ?? null;
      };
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
      const baseRows = projected
        .filter(({ row }) => query.includeHistory || row.stage !== "history_only")
        .filter(({ row, source }) => rowInView(row, source, actor, query.view))
        .map(({ row }) => row)
        .filter((row) => !query.stage || row.stage === query.stage)
        .filter((row) => responsibilityStatusMatchesSelection(row.responsibilityStatus, row.viewerActionability, row.humanStatus, query.humanStatus, row.availabilityScope))
        .map((row) => row);
      if (!lanesEnabled) return baseRows;
      const laneRows: DrawingWorkbenchRow[] = [];
      for (const identity of identities) {
        const canonical = canonicalById.get(identity.id);
        if (!canonical) continue;
        const formal = identity.formalDrawingNumberId ? formalById.get(identity.formalDrawingNumberId) : null;
        const candidate = identity.workspaceId ? (candidateById.get(identity.workspaceId) ?? sourceWorkspaceById.get(identity.workspaceId)) : null;
        const base = baseRows.find((row) => row.rowKey === identity.rowKey);
        const groupKey = `drawing:${canonical.id}`;
        if (identity.sourceKind === "candidate" && base) {
          if (laneSelectionIncludes(query.lane, "rd")) {
            laneRows.push(withPdmWorkbenchLane({ ...base, rowKey: `${base.rowKey}:rd` }, makePdmWorkbenchLaneFields({
              companyId: actor.companyId, actorId: actor.id, rowKey: `${base.rowKey}:rd`, groupKey, entityKey: canonical.id, lane: "rd",
              referenceKind: "candidate_workspace", referenceId: candidate?.id ?? base.rowKey, displayRevision: base.stageLabel, purposeLabel: "研發工作區", sourceCount: 1
            })));
          }
          continue;
        }
        if (!formal || !base) continue;
        const releasedRevision = latestRevision(canonical.id, "released");
        if (laneSelectionIncludes(query.lane, "production")) {
          const productionRowKey = `${base.rowKey}:production`;
          const productionBase = releasedRevision ? drawingRow(drawingRecordForRevision(formal, releasedRevision), actor, canonical) : base;
          laneRows.push(withPdmWorkbenchLane({ ...productionBase, rowKey: productionRowKey }, makePdmWorkbenchLaneFields({
            companyId: actor.companyId, actorId: actor.id, rowKey: productionRowKey, groupKey, entityKey: canonical.id, lane: "production",
            referenceKind: releasedRevision ? "drawing_revision_package" : formal.lifecycle?.state === "released" ? "drawing_revision_package" : "legacy_released_basis",
            referenceId: releasedRevision?.id ?? formal.id,
            displayRevision: releasedRevision?.revision ?? formal.lifecycle?.revision ?? null,
            purposeLabel: "量產受控版", sourceCount: 1
          })));
        }
        const rdRevision = latestRdRevision(canonical.id);
        if (laneSelectionIncludes(query.lane, "rd") && (candidate || rdRevision)) {
          if (candidate) {
            const rdIdentity = { ...identity, sourceKind: "candidate" as const, rowKey: `${base.rowKey}:rd`, workspaceId: candidate.id };
            const rdBase = candidateRow(candidate, rdIdentity, canonical, actor);
            laneRows.push(withPdmWorkbenchLane(rdBase, makePdmWorkbenchLaneFields({
              companyId: actor.companyId, actorId: actor.id, rowKey: rdBase.rowKey, groupKey, entityKey: canonical.id, lane: "rd",
              referenceKind: "candidate_workspace", referenceId: candidate.id, displayRevision: rdBase.stageLabel, purposeLabel: "研發變更版", sourceCount: 1
            })));
          } else if (rdRevision) {
            const rdRowKey = `${base.rowKey}:rd`;
            const rdBase = drawingRow(drawingRecordForRevision(formal, rdRevision), actor, canonical);
            laneRows.push(withPdmWorkbenchLane({ ...rdBase, rowKey: rdRowKey }, makePdmWorkbenchLaneFields({
              companyId: actor.companyId, actorId: actor.id, rowKey: rdRowKey, groupKey, entityKey: canonical.id, lane: "rd",
              referenceKind: "drawing_revision_package", referenceId: rdRevision.id, displayRevision: rdRevision.revision, purposeLabel: "研發變更版", sourceCount: 1
            })));
          }
        }
      }
      return laneRows;
    });
    const pageRows = lanesEnabled ? groupPdmWorkbenchRows(page.rows, query.limit) : page.rows.slice(0, query.limit);
    const hasNext = lanesEnabled ? page.rows.some((row) => !pageRows.includes(row)) : page.rows.length > query.limit;
    if (options.previewEnabled) {
      const { resolveDrawingWorkbenchPreviewReferences } = await import("@/lib/pdm-workbench-preview-gallery");
      const previews = await resolveDrawingWorkbenchPreviewReferences(this.client, pageRows.map((row) => ({ ...row, projectionToken: row.lane?.reference.projectionToken })), actor.companyId);
      for (const row of pageRows) row.preview = previews.get(row.rowKey)?.summary ?? null;
    }
    const last = pageRows.at(-1);
    const first = pageRows[0];
    const nextPageIndex = (cursor?.pageIndex ?? 0) + 1;
    const currentPageIndex = cursor?.pageIndex ?? 0;
    return {
      rows: pageRows,
      nextCursor: hasNext && last && page.lastIdentity ? encodePdmWorkbenchCursor({
        version: lanesEnabled ? 2 : 1,
        filterHash: currentFilterHash,
        updatedAt: page.lastIdentity.updatedAt,
        sortValue: page.lastIdentity.sortValue,
        rowKey: page.lastIdentity.rowKey,
        ...(lanesEnabled ? { groupKey: pageRows.at(-1)?.lane?.groupKey ?? page.lastIdentity.rowKey } : {}),
        direction: "after",
        pageIndex: nextPageIndex
      }) : null,
      previousCursor: currentPageIndex > 0 && first && page.firstIdentity ? encodePdmWorkbenchCursor({
        version: lanesEnabled ? 2 : 1,
        filterHash: currentFilterHash,
        updatedAt: page.firstIdentity.updatedAt,
        sortValue: page.firstIdentity.sortValue,
        rowKey: page.firstIdentity.rowKey,
        ...(lanesEnabled ? { groupKey: pageRows[0]?.lane?.groupKey ?? page.firstIdentity.rowKey } : {}),
        direction: "before",
        pageIndex: currentPageIndex - 1
      }) : null,
      pageIndex: currentPageIndex,
      generatedAt: new Date().toISOString(),
      filters: {
        seriesCodeOptions: page.seriesCodeOptions,
        purposeCodeOptions: [...drawingPurposeCodes],
        recordStatusOptions: [...drawingRecordStatuses]
      },
      ...(lanesEnabled ? { paginationUnit: "group" as const, groupLimit: query.limit, groupCount: new Set(pageRows.map((row) => row.lane?.groupKey ?? row.rowKey)).size } : {})
    };
  }

  async detail(rowKey: string, actor: DrawingWorkbenchActor, options: { previewEnabled?: boolean; projectionToken?: string | null } = {}): Promise<DrawingWorkbenchDetailResponse | null> {
    const lanesEnabled = isPdmWorkbenchProductionRdLanesV1Enabled();
    const requestedLane = lanesEnabled && rowKey.endsWith(":rd") ? "rd" : lanesEnabled && rowKey.endsWith(":production") ? "production" : null;
    if (requestedLane) rowKey = rowKey.slice(0, -(`:${requestedLane}`).length);
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
        let row = candidateRow(detail.candidate, identity, detail.canonical, actor);
        if (requestedLane === "rd") {
          const laneRowKey = `${row.rowKey}:rd`;
          row = withPdmWorkbenchLane({ ...row, rowKey: laneRowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey: laneRowKey, groupKey: `drawing:${detail.canonical.id}`, entityKey: detail.canonical.id, lane: "rd", referenceKind: "candidate_workspace", referenceId: detail.candidate.id, displayRevision: row.stageLabel, purposeLabel: "研發工作區" }));
          const fingerprint = pdmWorkbenchReferenceFingerprint({ referenceKind: "candidate_workspace", referenceId: detail.candidate.id, revisionOrBaseline: row.stageLabel, contentHashOrSnapshotHash: null });
          verifyPdmWorkbenchProjectionToken(options.projectionToken, { companyId: actor.companyId, actorId: actor.id, rowKey: laneRowKey, lane: "rd", fingerprint });
        }
        const capabilities = workbenchCapabilities(actor);
        const canMaintain = canEditPdmOwnedResource({ actorId: actor.id, ownerId: detail.candidate.ownerId, canEditNonOwned: actor.canEditNonOwned });
        capabilities.canCreateRevision = false;
        capabilities.canUpdateDraft = capabilities.canUpdateDraft && canMaintain && !["in_review", "auto_finalizing", "recovery_required", "history_only"].includes(row.stage);
        capabilities.canSubmitReview = capabilities.canSubmitReview && canMaintain && !["in_review", "auto_finalizing", "recovery_required", "history_only"].includes(row.stage);
        capabilities.canWithdrawReview = capabilities.canWithdrawReview && canMaintain && row.stage === "in_review" && detail.candidate.capabilities.canWithdrawReview;
        if (options.previewEnabled) {
          const { resolveDrawingWorkbenchPreviewReferences } = await import("@/lib/pdm-workbench-preview-gallery");
          row.preview = (await resolveDrawingWorkbenchPreviewReferences(this.client, [{ ...row, projectionToken: row.lane?.reference.projectionToken }], actor.companyId)).get(row.rowKey)?.summary ?? null;
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
      const releasedRevision = requestedLane === "production"
        ? await this.repository.readLatestRevision({ drawingId: detail.canonical.id, companyId: actor.companyId, lane: "released" })
        : null;
      const rdRevision = requestedLane === "rd"
        ? await this.repository.readLatestRevision({ drawingId: detail.canonical.id, companyId: actor.companyId, lane: "rd" })
        : null;
      const laneRevision = requestedLane === "production" ? releasedRevision : requestedLane === "rd" ? rdRevision : null;
      const laneDrawing = laneRevision ? drawingRecordForRevision(detail.drawing, laneRevision) : detail.drawing;
      let row = drawingRow(laneDrawing, actor, detail.canonical);
      if (requestedLane === "production" || !requestedLane) {
        if (lanesEnabled && requestedLane === "production") {
          const productionRowKey = `${row.rowKey}:production`;
          const referenceKind = releasedRevision ? "drawing_revision_package" : detail.drawing.lifecycle?.state === "released" ? "drawing_revision_package" : "legacy_released_basis";
          const referenceId = releasedRevision?.id ?? detail.drawing.id;
          const displayRevision = releasedRevision?.revision ?? detail.drawing.lifecycle?.revision ?? null;
          row = withPdmWorkbenchLane({ ...row, rowKey: productionRowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey: productionRowKey, groupKey: `drawing:${detail.canonical.id}`, entityKey: detail.canonical.id, lane: "production", referenceKind, referenceId, displayRevision, purposeLabel: "量產受控版" }));
          const fingerprint = pdmWorkbenchReferenceFingerprint({ referenceKind: row.lane!.reference.kind, referenceId, revisionOrBaseline: row.lane!.reference.displayRevision, contentHashOrSnapshotHash: null });
          verifyPdmWorkbenchProjectionToken(options.projectionToken, { companyId: actor.companyId, actorId: actor.id, rowKey: row.rowKey, lane: "production", fingerprint });
        }
      } else if (requestedLane === "rd" && detail.sourceWorkspace?.lifecycleStatus === "active") {
        const rdIdentity: DrawingWorkbenchIdentityRecord = { id: detail.canonical.id, rowKey: `${row.rowKey}:rd`, sourceKind: "candidate", workspaceId: detail.sourceWorkspace.id, formalDrawingNumberId: null, drawingDraftId: detail.canonical.drawingDraftId, updatedAt: detail.sourceWorkspace.updatedAt, sortValue: row.displayCode };
        row = candidateRow(detail.sourceWorkspace, rdIdentity, detail.canonical, actor);
        row = withPdmWorkbenchLane(row, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey: row.rowKey, groupKey: `drawing:${detail.canonical.id}`, entityKey: detail.canonical.id, lane: "rd", referenceKind: "candidate_workspace", referenceId: detail.sourceWorkspace.id, displayRevision: row.stageLabel, purposeLabel: "研發變更版" }));
        const fingerprint = pdmWorkbenchReferenceFingerprint({ referenceKind: "candidate_workspace", referenceId: detail.sourceWorkspace.id, revisionOrBaseline: row.stageLabel, contentHashOrSnapshotHash: null });
        verifyPdmWorkbenchProjectionToken(options.projectionToken, { companyId: actor.companyId, actorId: actor.id, rowKey: row.rowKey, lane: "rd", fingerprint });
      } else if (requestedLane === "rd" && rdRevision) {
        const rdRowKey = `${row.rowKey}:rd`;
        row = withPdmWorkbenchLane({ ...row, rowKey: rdRowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey: rdRowKey, groupKey: `drawing:${detail.canonical.id}`, entityKey: detail.canonical.id, lane: "rd", referenceKind: "drawing_revision_package", referenceId: rdRevision.id, displayRevision: rdRevision.revision, purposeLabel: "研發變更版" }));
        const fingerprint = pdmWorkbenchReferenceFingerprint({ referenceKind: "drawing_revision_package", referenceId: rdRevision.id, revisionOrBaseline: rdRevision.revision, contentHashOrSnapshotHash: null });
        verifyPdmWorkbenchProjectionToken(options.projectionToken, { companyId: actor.companyId, actorId: actor.id, rowKey: rdRowKey, lane: "rd", fingerprint });
      } else if (requestedLane === "rd") {
        return null;
      }
      const detailLifecycle = requestedLane === "production" && releasedRevision
        ? { ...detail.drawing.lifecycle, state: "released" as const, revision: releasedRevision.revision }
        : requestedLane === "rd" && rdRevision
          ? { ...detail.drawing.lifecycle, state: rdRevision.lifecycleState, revision: rdRevision.revision }
          : detail.drawing.lifecycle;
      const publicDrawing: DrawingModuleListRecord = detailLifecycle
        ? {
            ...detail.drawing,
            lifecycle: {
              state: detailLifecycle.state,
              revision: detailLifecycle.revision,
              requestId: null,
              submittedBy: null,
              decisionCount: 0,
              reviewerIds: [],
              correctionReason: detailLifecycle.correctionReason ?? null
            }
          }
        : detail.drawing;
      const capabilities = workbenchCapabilities(actor);
      capabilities.canUpdateDraft = false;
      capabilities.canSubmitReview = false;
      capabilities.canWithdrawReview = Boolean(row.secondaryAction) && actor.permissions.candidateWithdraw;
      capabilities.canCreateRevision = capabilities.canCreateRevision && !["in_review", "auto_finalizing", "recovery_required", "history_only"].includes(row.stage);
      if (detail.drawing.lifecycle?.state === "in_review") {
        capabilities.canReviewApprovals = detail.drawing.lifecycle.reviewerIds.includes(actor.id);
      }
      if (options.previewEnabled) {
        const { resolveDrawingWorkbenchPreviewReferences } = await import("@/lib/pdm-workbench-preview-gallery");
        row.preview = (await resolveDrawingWorkbenchPreviewReferences(this.client, [{ ...row, projectionToken: row.lane?.reference.projectionToken }], actor.companyId)).get(row.rowKey)?.summary ?? null;
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
  if (error instanceof PdmWorkbenchProjectionTokenError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status, headers: DRAWING_WORKBENCH_NO_STORE_HEADERS });
  }
  if (error instanceof DrawingWorkbenchError) {
    return Response.json(
      { error: error.code, message: error.message },
      { status: error.status, headers: DRAWING_WORKBENCH_NO_STORE_HEADERS }
    );
  }
  if (error instanceof PdmWorkbenchFilterSelectionError) {
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
