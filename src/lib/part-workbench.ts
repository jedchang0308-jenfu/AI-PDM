import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { projectDrawingAvailability, projectPartAvailability } from "@/lib/availability-scope";
import {
  createHumanStatus,
  type HumanStatusProjection,
  type HumanStatusRoleCapabilities
} from "@/lib/human-status-projection";
import { parseWorkStatusSelection, type WorkStatusFilter } from "@/lib/work-status-presentation";
import { actionEvidenceFrom, projectResponsibilityStatusPair, responsibilityStatusMatchesSelection, type ResponsibilityActionEvidence } from "@/lib/responsibility-status-projection";
import { projectPartHumanStatus } from "@/lib/part-human-status";
import { canEditPdmOwnedResource } from "@/lib/pdm-edit-scope-policy";
import {
  decodePdmWorkbenchCursor,
  encodePdmWorkbenchCursor,
  pdmWorkbenchFilterHash,
  PdmWorkbenchCursorError
} from "@/lib/pdm-workbench-cursor";
import type { PdmWorkbenchAction, PdmWorkbenchFilterSelection, PdmWorkbenchListResponse, PdmWorkbenchPreviewSummary, PdmWorkbenchRowBase } from "@/lib/pdm-workbench-contract";
import { parsePdmWorkbenchFilterSelection, PdmWorkbenchFilterSelectionError, selectionHashValue } from "@/lib/pdm-workbench-filter-selection";
import { PART_WORKBENCH_ITEM_KIND_VALUES as SHARED_PART_WORKBENCH_ITEM_KIND_VALUES, PDM_WORKBENCH_RECORD_STATUS_VALUES } from "@/lib/pdm-workbench-filter-options";
import { PartWorkbenchAsyncRepository } from "@/lib/repositories/part-workbench-async-repository";
import type { NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import type { NumberingRecordStatus, PartModuleDetailRecord, PartModuleListRecord } from "@/lib/repositories/numbering-repository";
import { parseNumberSortDirection, type NumberSortDirection } from "@/lib/number-sort";
import { isPdmWorkbenchProductionRdLanesV1Enabled } from "@/lib/number-state-flow-feature";
import { groupPdmWorkbenchRows, laneSelectionIncludes, makePdmWorkbenchLaneFields, withPdmWorkbenchLane } from "@/lib/pdm-workbench-lane";
import { pdmWorkbenchReferenceFingerprint, PdmWorkbenchProjectionTokenError, verifyPdmWorkbenchProjectionToken } from "@/lib/pdm-workbench-projection-token";

export const PART_WORKBENCH_STAGES = [
  "building",
  "drawing_preparation",
  "bundle_ready",
  "in_review",
  "auto_finalizing",
  "recovery_required",
  "correction_required",
  "official_controlled",
  "released",
  "history_only"
] as const;

export type PartWorkbenchStage = typeof PART_WORKBENCH_STAGES[number];
export type PartWorkbenchView = "mine" | "work" | "all";
export type PartWorkbenchActionKind =
  | "continue_building"
  | "complete_first_drawing"
  | "submit_bundle_review"
  | "view_review"
  | "view_processing"
  | "retry_formalization"
  | "view_part"
  | "view_history";

export type PartWorkbenchRow = PdmWorkbenchRowBase<"candidate_bundle" | "part_master", PartWorkbenchActionKind> & {
  workspaceId: string | null;
  partNumberId: string | null;
  partCount: number;
  additionalPartCount: number;
  rootCode: string | null;
  seriesCode: string | null;
  itemKind: string | null;
  recordStatus: NumberingRecordStatus | null;
  primaryDrawingNumber: string | null;
  drawingCount: number;
  stage: PartWorkbenchStage;
  stageLabel: string;
  warning: { code: string; message: string } | null;
  partRootId: string | null;
  preview: PdmWorkbenchPreviewSummary | null;
};

export type PartWorkbenchPermissions = {
  workspaceView: boolean;
  workspaceUpdate: boolean;
  candidateSubmit: boolean;
  candidateReview: boolean;
  publish: boolean;
  managePermissions: boolean;
};

export type PartWorkbenchActor = {
  id: string;
  companyId: string;
  canEditNonOwned: boolean;
  permissions: PartWorkbenchPermissions;
  viewerCapabilities: HumanStatusRoleCapabilities;
};

export type PartWorkbenchListResponse = PdmWorkbenchListResponse<PartWorkbenchRow, {
  seriesCodeOptions: string[];
  itemKindOptions: string[];
  recordStatusOptions: NumberingRecordStatus[];
}>;

export type PartWorkbenchDetailResponse = {
  row: PartWorkbenchRow;
  candidate: NumberingDraftWorkspaceRecord | null;
  part: (PartModuleDetailRecord & Pick<PartWorkbenchRow, "humanStatus" | "responsibilityStatus" | "viewerActionability" | "viewerStatus" | "availabilityScope">) | null;
  capabilities: {
    canManagePermissions: boolean;
  };
};

export class PartWorkbenchError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = "PartWorkbenchError";
  }
}

type NormalizedPartWorkbenchQuery = {
  query: string;
  view: PartWorkbenchView;
  stage: PartWorkbenchStage | "";
  seriesCode: PdmWorkbenchFilterSelection<string>;
  itemKind: PdmWorkbenchFilterSelection<string>;
  recordStatus: PdmWorkbenchFilterSelection<NumberingRecordStatus>;
  humanStatus: PdmWorkbenchFilterSelection<WorkStatusFilter>;
  includeHistory: boolean;
  cursor: string;
  direction: "after" | "before";
  pageIndex: number;
  limit: number;
  sortDirection: NumberSortDirection;
  lane: PdmWorkbenchFilterSelection<"production" | "rd">;
};

export const PART_WORKBENCH_ITEM_KIND_VALUES = SHARED_PART_WORKBENCH_ITEM_KIND_VALUES;
export const PART_WORKBENCH_RECORD_STATUS_VALUES = PDM_WORKBENCH_RECORD_STATUS_VALUES;
const itemKinds = PART_WORKBENCH_ITEM_KIND_VALUES;
const recordStatuses = PART_WORKBENCH_RECORD_STATUS_VALUES;
const terminalStatuses = new Set<NumberingRecordStatus>(["Obsolete", "Merged"]);
const stageLabels: Record<PartWorkbenchStage, string> = {
  building: "建立中",
  drawing_preparation: "首版準備",
  bundle_ready: "可送審",
  in_review: "審核中",
  auto_finalizing: "系統正式化中",
  recovery_required: "需要處理",
  correction_required: "需要修正",
  official_controlled: "研發受控",
  released: "已發布",
  history_only: "歷史紀錄"
};

function normalizedText(value: string | null, maximum: number) {
  return String(value ?? "").trim().slice(0, maximum);
}

export function normalizePartWorkbenchQuery(url: URL): NormalizedPartWorkbenchQuery {
  const requestedView = normalizedText(url.searchParams.get("view"), 20);
  const view: PartWorkbenchView = requestedView === "mine" || requestedView === "work" ? requestedView : "all";
  const stage = normalizedText(url.searchParams.get("stage"), 40);
  if (stage && !(PART_WORKBENCH_STAGES as readonly string[]).includes(stage)) throw new PartWorkbenchError("workbench_invalid_stage", "請重新選擇有效的工作階段。", 400);
  const itemKind = parsePdmWorkbenchFilterSelection(url.searchParams, "itemKind", { allowedValues: itemKinds, maxValueLength: 30 });
  const recordStatus = parsePdmWorkbenchFilterSelection<NumberingRecordStatus>(url.searchParams, "recordStatus", { allowedValues: recordStatuses, maxValueLength: 40 });
  const history = normalizedText(url.searchParams.get("history"), 20);
  if (history && history !== "include" && history !== "exclude") throw new PartWorkbenchError("workbench_invalid_history", "請重新選擇有效的歷史資料範圍。", 400);
  const workStatusQuery = parseWorkStatusSelection(url.searchParams, { history, view: requestedView, supportsMineView: true, strict: true });
  const rawLimit = normalizedText(url.searchParams.get("limit"), 10) || "50";
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new PartWorkbenchError("workbench_invalid_limit", "每頁筆數必須介於 1 到 100。", 400);
  const sortDirection = parseNumberSortDirection(url.searchParams.get("sortDirection"));
  const direction = url.searchParams.get("direction") === "before" ? "before" : "after";
  const pageIndexValue = Number(url.searchParams.get("pageIndex") ?? "0");
  return {
    query: normalizedText(url.searchParams.get("query"), 200),
    view: (workStatusQuery.view === "mine" || workStatusQuery.view === "work" ? workStatusQuery.view : view),
    stage: stage as PartWorkbenchStage | "",
    seriesCode: parsePdmWorkbenchFilterSelection(url.searchParams, "seriesCode", { maxValueLength: 80 }),
    itemKind,
    recordStatus,
    humanStatus: workStatusQuery.selection,
    includeHistory: workStatusQuery.includeHistory,
    cursor: normalizedText(url.searchParams.get("cursor"), 2_000),
    direction,
    pageIndex: Number.isInteger(pageIndexValue) && pageIndexValue >= 0 && pageIndexValue < 100_000 ? pageIndexValue : 0,
    limit,
    sortDirection,
    lane: parsePdmWorkbenchFilterSelection(url.searchParams, "lane", { allowedValues: ["production", "rd"], maxValueLength: 20 })
  };
}

function filterHash(query: NormalizedPartWorkbenchQuery, actor: PartWorkbenchActor) {
  return pdmWorkbenchFilterHash({
    namespace: "part-v1",
    filters: {
      query: query.query.toLocaleLowerCase("zh-Hant"),
      view: query.view,
      stage: query.stage,
      seriesCode: selectionHashValue(query.seriesCode),
      itemKind: selectionHashValue(query.itemKind),
      recordStatus: selectionHashValue(query.recordStatus),
      humanStatus: selectionHashValue(query.humanStatus),
      includeHistory: query.includeHistory,
      lane: selectionHashValue(query.lane)
    },
    companyId: actor.companyId,
    actorId: actor.id
  });
}

function candidateStage(workspace: NumberingDraftWorkspaceRecord): PartWorkbenchStage {
  if (workspace.lifecycleStatus === "cancelled") return "history_only";
  const stage = workspace.lifecycleV2?.stage;
  if (stage === "drawing_addendum_required") return "drawing_preparation";
  if (stage === "official_controlled") return "official_controlled";
  if (stage && (PART_WORKBENCH_STAGES as readonly string[]).includes(stage)) return stage as PartWorkbenchStage;
  if (workspace.reservations.filter((reservation) => reservation.state !== "recycled").length === 0) return "building";
  if (workspace.latestApproval?.status === "needs_info" || workspace.latestApproval?.status === "rejected") return "correction_required";
  return "recovery_required";
}

function candidateHumanStatus(stage: PartWorkbenchStage) {
  if (stage === "history_only") return createHumanStatus("cancelled", "terminal", "已取消", "neutral", "archive");
  if (stage === "bundle_ready") return createHumanStatus("ready_to_submit", "ready", "可送審", "success", "play");
  if (stage === "in_review") return createHumanStatus("waiting_review", "waiting", "待審核", "info", "clock");
  if (stage === "auto_finalizing") return createHumanStatus("finalizing", "waiting", "正式化中", "info", "clock");
  if (stage === "recovery_required") return createHumanStatus("formalization_failed", "action_required", "正式化待處理", "danger", "alert");
  if (stage === "correction_required") return createHumanStatus("correction_required", "action_required", "待修正", "warning", "alert");
  if (stage === "official_controlled") return createHumanStatus("rd_controlled", "usable", "研發受控", "success", "check");
  return createHumanStatus("preparing", "waiting", stage === "drawing_preparation" ? "首版準備" : "建立中", "info", "clock");
}

function candidateAction(workspace: NumberingDraftWorkspaceRecord, stage: PartWorkbenchStage, actor: PartWorkbenchActor): PdmWorkbenchAction<PartWorkbenchActionKind> | null {
  const href = `/numbering/workspaces/${encodeURIComponent(workspace.id)}?intent=${stage === "bundle_ready" ? "submit_review" : stage === "history_only" ? "view" : "edit"}&returnTo=${encodeURIComponent(`/parts?view=work${stage === "history_only" ? "&history=include" : ""}`)}`;
  const canMaintain = canEditPdmOwnedResource({ actorId: actor.id, ownerId: workspace.ownerId, canEditNonOwned: actor.canEditNonOwned });
  const ownedAction = (kind: PartWorkbenchActionKind, label: string, allowed: boolean, permissionCode: string) => ({
    kind,
    label,
    enabled: canMaintain && allowed,
    disabledReason: canMaintain ? allowed ? null : `缺少權限（${permissionCode}），請聯絡研發主管或 PDM Admin。` : "這筆工作需由負責人處理。",
    href: canMaintain && allowed ? href : null,
    permissionCode: canMaintain && !allowed ? permissionCode : null,
    contactRole: canMaintain ? "研發主管或 PDM Admin" : "工作負責人",
    adminHref: canMaintain && !allowed && actor.permissions.managePermissions ? "/settings/workflow" : null
  });
  if (stage === "building" || stage === "correction_required") return ownedAction("continue_building", stage === "correction_required" ? "繼續修正" : "繼續建立", actor.permissions.workspaceUpdate, "numbering.workspace.update");
  if (stage === "drawing_preparation") return ownedAction("complete_first_drawing", "完成首版", actor.permissions.workspaceUpdate, "numbering.workspace.update");
  if (stage === "bundle_ready") return ownedAction("submit_bundle_review", "送交審核", actor.permissions.candidateSubmit, "numbering.candidate.review.submit");
  if (stage === "in_review") return { kind: "view_review", label: actor.permissions.candidateReview ? "前往審核" : "查看審核", enabled: true, disabledReason: null, href };
  if (stage === "auto_finalizing") return null;
  if (stage === "recovery_required") return { kind: actor.permissions.publish ? "retry_formalization" : "view_processing", label: actor.permissions.publish ? "重試正式化" : "查看處理狀態", enabled: true, disabledReason: null, href };
  return { kind: "view_history", label: "查看紀錄", enabled: true, disabledReason: null, href };
}

function candidateRow(workspace: NumberingDraftWorkspaceRecord, actor: PartWorkbenchActor): PartWorkbenchRow {
  const stage = candidateStage(workspace);
  const codes = workspace.parts.map((part) => part.candidateCode).filter((value): value is string => Boolean(value)).sort((a, b) => a.localeCompare(b, "zh-Hant", { numeric: true }));
  const humanStatus = candidateHumanStatus(stage);
  const primaryAction = candidateAction(workspace, stage, actor);
  const recoveryAction: ResponsibilityActionEvidence | null = stage === "recovery_required"
    ? { kind: "retry_formalization", label: "重試正式化", enabled: actor.permissions.publish, disabledReason: actor.permissions.publish ? null : "目前沒有正式化恢復權限。", href: primaryAction?.href }
    : null;
  const responsibilityActions = [actionEvidenceFrom(primaryAction), recoveryAction]
    .filter((action): action is NonNullable<ReturnType<typeof actionEvidenceFrom>> => Boolean(action && action.kind !== "view_processing" && action.kind !== "view_review" && action.kind !== "view_history"));
  const pair = projectResponsibilityStatusPair({
    status: humanStatus,
    actorId: actor.id,
    ownerId: workspace.ownerId,
    ownerQueueEligible: actor.canEditNonOwned && responsibilityActions.some((action) => action.enabled),
    hasActiveReviewWorkItem: stage === "in_review" && workspace.latestApproval?.status === "pending",
    hasOwnerResponsibilityAction: !["in_review", "auto_finalizing", "recovery_required", "history_only"].includes(stage) && responsibilityActions.length > 0,
    hasSystemAdminRecoveryAction: stage === "recovery_required",
    systemFinalizing: stage === "auto_finalizing",
    reviewQueueEligible: stage === "in_review" && actor.permissions.candidateReview,
    systemAdminQueueEligible: stage === "recovery_required" && actor.permissions.publish,
    responsibilityActions
  });
  return {
    rowKey: `candidate:${workspace.id}`,
    rowKind: "candidate_bundle",
    sourceKind: "candidate",
    workspaceId: workspace.id,
    partNumberId: null,
    displayCode: codes[0] ?? workspace.root?.candidateCode ?? "尚未產生料號",
    displayName: workspace.root?.coreName ?? workspace.parts[0]?.partName ?? "新增料號工作",
    partCount: workspace.parts.length,
    additionalPartCount: Math.max(0, codes.length - 1),
    rootCode: workspace.root?.candidateCode ?? null,
    seriesCode: workspace.parts.find((part) => part.seriesCode)?.seriesCode ?? null,
    itemKind: workspace.parts[0]?.itemKind ?? workspace.root?.itemKind ?? null,
    recordStatus: null,
    primaryDrawingNumber: workspace.drawings.find((drawing) => drawing.isPrimaryManufacturing)?.candidateCode ?? workspace.drawings[0]?.candidateCode ?? null,
    drawingCount: workspace.drawings.length,
    stage,
    stageLabel: stageLabels[stage],
    humanStatus,
    ...pair,
    availabilityScope: projectDrawingAvailability({ stage, usage: stage === "official_controlled" ? "rd_controlled" : stage === "history_only" ? "historical_only" : "not_for_formal_use", terminal: stage === "history_only" }),
    primaryAction,
    warning: stage === "recovery_required" ? { code: "candidate_recovery_required", message: "這筆工作需要處理後才能繼續。" } : null,
    terminal: stage === "history_only" ? { kind: "cancelled", reasonLabel: "此工作已取消。", nextStepLabel: "如仍需要料號，請建立新的料號工作。" } : null,
    updatedAt: workspace.updatedAt,
    partRootId: workspace.sourceRootId,
    preview: null
  };
}

function formalStage(part: PartModuleListRecord): PartWorkbenchStage {
  if (terminalStatuses.has(part.recordStatus)) return "history_only";
  if (part.recordStatus === "Released") return "released";
  if (part.recordStatus === "Rejected" || part.recordStatus === "NeedInfo" || part.recordStatus === "MainDrawingInvalid") return "correction_required";
  return "official_controlled";
}

function formalRow(part: PartModuleListRecord, actor: PartWorkbenchActor): PartWorkbenchRow {
  const stage = formalStage(part);
  const humanStatus = projectPartHumanStatus(part);
  const detailHref = `/parts?view=all${stage === "history_only" ? "&history=include" : ""}&detail=${encodeURIComponent(`part:${part.id}`)}`;
  const roleAction = roleResponsibilityAction(humanStatus, actor, detailHref);
  const responsibilityActions = roleAction ? [roleAction] : [];
  const pair = projectResponsibilityStatusPair({
    status: humanStatus,
    actorId: actor.id,
    hasActiveReviewWorkItem: humanStatus.key === "waiting_review",
    hasOwnerResponsibilityAction: humanStatus.phase === "action_required" || humanStatus.phase === "ready",
    hasSystemAdminRecoveryAction: ["formalization_failed", "release_status_mismatch"].includes(humanStatus.key),
    ownerQueueEligible: !["waiting_review", "formalization_failed", "release_status_mismatch"].includes(humanStatus.key) && Boolean(roleAction?.enabled),
    reviewQueueEligible: humanStatus.key === "waiting_review" && actor.viewerCapabilities.canReview,
    systemAdminQueueEligible: ["formalization_failed", "release_status_mismatch"].includes(humanStatus.key) && actor.viewerCapabilities.canPublish,
    responsibilityActions
  });
  return {
    rowKey: `part:${part.id}`,
    rowKind: "part_master",
    sourceKind: "formal",
    workspaceId: null,
    partNumberId: part.id,
    displayCode: part.partNumber,
    displayName: part.partName,
    partCount: 1,
    additionalPartCount: 0,
    rootCode: part.rootCode,
    seriesCode: part.seriesCode,
    itemKind: part.itemKind,
    recordStatus: part.recordStatus,
    primaryDrawingNumber: part.primaryDrawingNumber,
    drawingCount: part.drawingCount,
    stage,
    stageLabel: stageLabels[stage],
    humanStatus,
    ...pair,
    availabilityScope: projectPartAvailability(part),
    primaryAction: { kind: stage === "history_only" ? "view_history" : "view_part", label: stage === "history_only" ? "查看歷史" : "查看料號", enabled: true, disabledReason: null, href: detailHref },
    warning: part.recordStatus === "MainDrawingInvalid" ? { code: "main_drawing_invalid", message: "主要製造圖目前失效，請先確認圖料關係。" } : null,
    terminal: stage === "history_only" ? { kind: part.recordStatus === "Merged" ? "merged" : "obsolete", reasonLabel: part.recordStatus === "Merged" ? "此料號已合併。" : "此料號已作廢。", nextStepLabel: "請改用有效料號；需要追溯時再查看歷史。" } : null,
    updatedAt: part.updatedAt,
    partRootId: part.partRootId,
    preview: null
  };
}

function roleResponsibilityAction(status: HumanStatusProjection, actor: PartWorkbenchActor, href: string): ResponsibilityActionEvidence | null {
  const capabilities = actor.viewerCapabilities;
  if (status.phase === "terminal" || status.phase === "usable") return null;
  if (status.key === "waiting_review") return { kind: "review_part", label: capabilities.canReview ? "前往審核" : "查看審核進度", enabled: capabilities.canReview, disabledReason: capabilities.canReview ? null : "目前不是審核負責人。", href };
  if (["formalization_failed", "release_status_mismatch"].includes(status.key)) return { kind: "recover_publication", label: "處理發布異常", enabled: capabilities.canPublish, disabledReason: capabilities.canPublish ? null : "目前不是系統管理員。", href };
  if (["missing_manufacturing_drawing", "missing_part", "data_conflict"].includes(status.key)) return { kind: "manage_relation", label: "維護圖料關係", enabled: capabilities.canManageRelations, disabledReason: capabilities.canManageRelations ? null : "目前不是圖料關係負責人。", href };
  if (status.key === "main_drawing_invalid") return { kind: "restore_main_drawing", label: "處理主圖恢復", enabled: capabilities.canRestoreMainDrawing, disabledReason: capabilities.canRestoreMainDrawing ? null : "目前不是主圖維護負責人。", href };
  if (status.key === "ready_to_submit") return { kind: "submit_review", label: "送交審核", enabled: capabilities.canSubmit, disabledReason: capabilities.canSubmit ? null : "目前不是送審負責人。", href };
  return { kind: "edit_part", label: "開啟明細處理", enabled: capabilities.canEdit, disabledReason: capabilities.canEdit ? null : "目前不是負責人。", href };
}

function rowInView(row: PartWorkbenchRow, source: NumberingDraftWorkspaceRecord | PartModuleListRecord, actor: PartWorkbenchActor, view: PartWorkbenchView) {
  if (view === "all") return true;
  if (view === "work") return !["released", "history_only"].includes(row.stage);
  return row.viewerActionability.isMine;
}

export class PartWorkbenchService {
  private readonly repository: PartWorkbenchAsyncRepository;
  private readonly client: AsyncDatabaseClient;

  constructor(client: AsyncDatabaseClient = getAsyncDatabaseClient()) {
    this.client = client;
    this.repository = new PartWorkbenchAsyncRepository(client);
  }

  async list(query: NormalizedPartWorkbenchQuery, actor: PartWorkbenchActor, options: { previewEnabled?: boolean } = {}): Promise<PartWorkbenchListResponse> {
    const currentFilterHash = filterHash(query, actor);
    const lanesEnabled = isPdmWorkbenchProductionRdLanesV1Enabled();
    const cursor = query.cursor ? decodePdmWorkbenchCursor(query.cursor, currentFilterHash, process.env, lanesEnabled ? 2 : 1) : null;
    const effectivePageIndex = cursor?.pageIndex ?? query.pageIndex;
    const page = await this.repository.readListPage<PartWorkbenchRow>({
      companyId: actor.companyId,
      query: query.query,
      seriesCode: query.seriesCode,
      itemKind: query.itemKind,
      recordStatus: query.recordStatus,
      sortDirection: query.sortDirection,
      includeCandidates: actor.permissions.workspaceView && query.recordStatus.mode === "all",
      cursor: cursor ? { sortValue: cursor.sortValue ?? cursor.updatedAt, rowKey: cursor.rowKey, direction: cursor.direction ?? query.direction } : null,
      direction: cursor?.direction ?? query.direction,
      limit: lanesEnabled ? Math.min(100, query.limit * 2) : query.limit
    }, (candidateRecords, partRecords, sourceWorkspaces = []) => {
      const candidates = candidateRecords
        .filter((source) => !lanesEnabled || !source.sourcePartNumberId)
        .map((source) => ({ source, row: candidateRow(source, actor) }));
      const formal = partRecords.map((source) => ({ source, row: formalRow(source, actor) }));
      const sourceByPartId = new Map<string, NumberingDraftWorkspaceRecord[]>();
      for (const workspace of sourceWorkspaces) if (workspace.sourcePartNumberId) sourceByPartId.set(workspace.sourcePartNumberId, [...(sourceByPartId.get(workspace.sourcePartNumberId) ?? []), workspace]);
      const baseRows = [...candidates, ...formal]
        .filter(({ row }) => query.includeHistory || row.stage !== "history_only")
        .filter(({ row, source }) => rowInView(row, source, actor, query.view))
        .map(({ row }) => row)
        .filter((row) => !query.stage || row.stage === query.stage)
        .filter((row) => responsibilityStatusMatchesSelection(row.responsibilityStatus, row.viewerActionability, row.humanStatus, query.humanStatus, row.availabilityScope));
      if (!lanesEnabled) return baseRows;
      const laneRows: PartWorkbenchRow[] = [];
      for (const item of candidates) {
        if (!laneSelectionIncludes(query.lane, "rd")) continue;
        const rowKey = `${item.row.rowKey}:rd`;
        laneRows.push(withPdmWorkbenchLane({ ...item.row, rowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey, groupKey: `part:${item.row.displayCode}`, entityKey: item.source.id, lane: "rd", referenceKind: "candidate_workspace", referenceId: item.source.id, displayRevision: item.row.stageLabel, purposeLabel: "研發工作區" })));
      }
      for (const item of formal) {
        const groupKey = `part:${item.row.displayCode}`;
        if (laneSelectionIncludes(query.lane, "production")) {
          const productionRowKey = `${item.row.rowKey}:production`;
          laneRows.push(withPdmWorkbenchLane({ ...item.row, rowKey: productionRowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey: productionRowKey, groupKey, entityKey: item.source.id, lane: "production", referenceKind: item.source.recordStatus === "Released" ? "manufacturing_baseline" : "legacy_released_basis", referenceId: item.source.id, displayRevision: item.source.updatedAt, purposeLabel: "量產受控版" })));
        }
        if (laneSelectionIncludes(query.lane, "rd")) for (const workspace of (sourceByPartId.get(item.source.id) ?? []).slice(0, 1)) {
          const rowKey = `${item.row.rowKey}:rd`;
          const rd = candidateRow(workspace, actor);
          laneRows.push(withPdmWorkbenchLane({ ...rd, rowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey, groupKey, entityKey: item.source.id, lane: "rd", referenceKind: "candidate_workspace", referenceId: workspace.id, displayRevision: rd.stageLabel, purposeLabel: "研發變更版" })));
        }
      }
      return laneRows;
    });
    const rows = lanesEnabled ? groupPdmWorkbenchRows(page.rows, query.limit) : page.rows.slice(0, query.limit);
    const hasNext = lanesEnabled ? page.rows.some((row) => !rows.includes(row)) : page.rows.length > query.limit;
    if (options.previewEnabled) {
      const { resolvePartWorkbenchPreviewReferences } = await import("@/lib/pdm-workbench-preview-gallery");
      const previews = await resolvePartWorkbenchPreviewReferences(this.client, rows.map((row) => ({ ...row, projectionToken: row.lane?.reference.projectionToken })), actor.companyId);
      for (const row of rows) row.preview = previews.get(row.rowKey)?.summary ?? null;
    }
    const last = rows.at(-1);
    const first = rows.at(0);
    return {
      rows,
      nextCursor: hasNext && last ? encodePdmWorkbenchCursor({ version: lanesEnabled ? 2 : 1, filterHash: currentFilterHash, updatedAt: last.updatedAt, sortValue: last.displayCode, rowKey: last.rowKey, ...(lanesEnabled ? { groupKey: last.lane?.groupKey ?? last.rowKey } : {}), direction: "after", pageIndex: effectivePageIndex + 1 }) : null,
      previousCursor: effectivePageIndex > 0 && first ? encodePdmWorkbenchCursor({ version: lanesEnabled ? 2 : 1, filterHash: currentFilterHash, updatedAt: first.updatedAt, sortValue: first.displayCode, rowKey: first.rowKey, ...(lanesEnabled ? { groupKey: first.lane?.groupKey ?? first.rowKey } : {}), direction: "before", pageIndex: Math.max(0, effectivePageIndex - 1) }) : null,
      pageIndex: effectivePageIndex,
      generatedAt: new Date().toISOString(),
      filters: { seriesCodeOptions: page.seriesCodeOptions, itemKindOptions: [...itemKinds], recordStatusOptions: [...recordStatuses] },
      ...(lanesEnabled ? { paginationUnit: "group" as const, groupLimit: query.limit, groupCount: new Set(rows.map((row) => row.lane?.groupKey ?? row.rowKey)).size } : {})
    };
  }

  async detail(rowKey: string, actor: PartWorkbenchActor, options: { previewEnabled?: boolean; projectionToken?: string | null } = {}): Promise<PartWorkbenchDetailResponse | null> {
    const lanesEnabled = isPdmWorkbenchProductionRdLanesV1Enabled();
    const requestedLane = lanesEnabled && rowKey.endsWith(":rd") ? "rd" : lanesEnabled && rowKey.endsWith(":production") ? "production" : null;
    if (requestedLane) rowKey = rowKey.slice(0, -(`:${requestedLane}`).length);
    if (rowKey.startsWith("candidate:")) {
      if (!actor.permissions.workspaceView) return null;
      const candidate = await this.repository.readCandidateDetail(rowKey.slice("candidate:".length), actor.companyId);
      if (!candidate) return null;
      let row = candidateRow(candidate, actor);
      if (requestedLane === "rd") {
        const laneRowKey = `${row.rowKey}:rd`;
        row = withPdmWorkbenchLane({ ...row, rowKey: laneRowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey: laneRowKey, groupKey: `part:candidate:${candidate.id}`, entityKey: candidate.id, lane: "rd", referenceKind: "candidate_workspace", referenceId: candidate.id, displayRevision: row.stageLabel, purposeLabel: "研發工作區" }));
        const fingerprint = pdmWorkbenchReferenceFingerprint({ referenceKind: "candidate_workspace", referenceId: candidate.id, revisionOrBaseline: row.stageLabel, contentHashOrSnapshotHash: null });
        verifyPdmWorkbenchProjectionToken(options.projectionToken, { companyId: actor.companyId, actorId: actor.id, rowKey: laneRowKey, lane: "rd", fingerprint });
      }
      if (options.previewEnabled) {
        const { resolvePartWorkbenchPreviewReferences } = await import("@/lib/pdm-workbench-preview-gallery");
        row.preview = (await resolvePartWorkbenchPreviewReferences(this.client, [{ ...row, projectionToken: row.lane?.reference.projectionToken }], actor.companyId)).get(row.rowKey)?.summary ?? null;
      }
      return { row, candidate, part: null, capabilities: { canManagePermissions: actor.permissions.managePermissions } };
    }
    const source = rowKey.startsWith("part:")
      ? await this.repository.readPartDetailById(rowKey.slice("part:".length), actor.companyId)
      : await this.repository.readPartDetailByCode(rowKey, actor.companyId);
    if (!source) return null;
    let row = formalRow(source, actor);
    if (requestedLane === "production") {
      const productionRowKey = `${row.rowKey}:production`;
      row = withPdmWorkbenchLane({ ...row, rowKey: productionRowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey: productionRowKey, groupKey: `part:${source.id}`, entityKey: source.id, lane: "production", referenceKind: source.recordStatus === "Released" ? "manufacturing_baseline" : "legacy_released_basis", referenceId: source.id, displayRevision: source.updatedAt, purposeLabel: "量產受控版" }));
      const fingerprint = pdmWorkbenchReferenceFingerprint({ referenceKind: row.lane!.reference.kind, referenceId: source.id, revisionOrBaseline: row.lane!.reference.displayRevision, contentHashOrSnapshotHash: null });
      verifyPdmWorkbenchProjectionToken(options.projectionToken, { companyId: actor.companyId, actorId: actor.id, rowKey: row.rowKey, lane: "production", fingerprint });
    } else if (requestedLane === "rd") {
      const workspace = (await this.repository.readSourceWorkspacesForPart(source.id, actor.companyId))[0] ?? null;
      if (!workspace) return null;
      const laneRowKey = `${row.rowKey}:rd`;
      const rd = candidateRow(workspace, actor);
      row = withPdmWorkbenchLane({ ...rd, rowKey: laneRowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey: laneRowKey, groupKey: `part:${source.id}`, entityKey: source.id, lane: "rd", referenceKind: "candidate_workspace", referenceId: workspace.id, displayRevision: rd.stageLabel, purposeLabel: "研發變更版" }));
      const fingerprint = pdmWorkbenchReferenceFingerprint({ referenceKind: "candidate_workspace", referenceId: workspace.id, revisionOrBaseline: row.stageLabel, contentHashOrSnapshotHash: null });
      verifyPdmWorkbenchProjectionToken(options.projectionToken, { companyId: actor.companyId, actorId: actor.id, rowKey: laneRowKey, lane: "rd", fingerprint });
    }
    if (options.previewEnabled) {
      const { resolvePartWorkbenchPreviewReferences } = await import("@/lib/pdm-workbench-preview-gallery");
      row.preview = (await resolvePartWorkbenchPreviewReferences(this.client, [{ ...row, projectionToken: row.lane?.reference.projectionToken }], actor.companyId)).get(row.rowKey)?.summary ?? null;
    }
    return {
      row,
      candidate: null,
      part: { ...source, humanStatus: row.humanStatus, responsibilityStatus: row.responsibilityStatus, viewerActionability: row.viewerActionability, viewerStatus: row.viewerStatus, availabilityScope: row.availabilityScope },
      capabilities: { canManagePermissions: actor.permissions.managePermissions }
    };
  }
}

export function partWorkbenchErrorResponse(error: unknown) {
  if (error instanceof PdmWorkbenchProjectionTokenError) return Response.json({ error: { code: error.code, message: error.message, retryable: false } }, { status: error.status });
  if (error instanceof PdmWorkbenchCursorError || error instanceof PartWorkbenchError || error instanceof PdmWorkbenchFilterSelectionError) {
    return Response.json({ error: { code: error.code, message: error.message, retryable: false } }, { status: error.status });
  }
  console.error("Part workbench read failed", error);
  return Response.json({ error: { code: "part_workbench_read_failed", message: "料號工作台目前無法載入，請重新整理。", retryable: true } }, { status: 500 });
}
