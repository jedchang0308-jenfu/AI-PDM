import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { projectDrawingAvailability, projectPartAvailability } from "@/lib/availability-scope";
import {
  createHumanStatus,
  isHumanStatusFilter,
  projectRoleViewerHumanStatus,
  projectViewerHumanStatus,
  viewerStatusMatchesFilter,
  type HumanStatusFilter,
  type HumanStatusProjection,
  type HumanStatusRoleCapabilities
} from "@/lib/human-status-projection";
import { projectPartHumanStatus } from "@/lib/part-human-status";
import {
  decodePdmWorkbenchCursor,
  encodePdmWorkbenchCursor,
  pdmWorkbenchFilterHash,
  PdmWorkbenchCursorError
} from "@/lib/pdm-workbench-cursor";
import type { PdmWorkbenchAction, PdmWorkbenchListResponse, PdmWorkbenchPreviewSummary, PdmWorkbenchRowBase } from "@/lib/pdm-workbench-contract";
import { PartWorkbenchAsyncRepository } from "@/lib/repositories/part-workbench-async-repository";
import type { NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import type { NumberingRecordStatus, PartModuleDetailRecord, PartModuleListRecord } from "@/lib/repositories/numbering-repository";
import { parseNumberSortDirection, type NumberSortDirection } from "@/lib/number-sort";

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
  part: (PartModuleDetailRecord & Pick<PartWorkbenchRow, "humanStatus" | "viewerStatus" | "availabilityScope">) | null;
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
  seriesCode: string;
  itemKind: string;
  recordStatus: NumberingRecordStatus | "";
  humanStatus: HumanStatusFilter;
  includeHistory: boolean;
  cursor: string;
  limit: number;
  sortDirection: NumberSortDirection;
};

const itemKinds = ["purchased", "manufactured", "outsourced", "shared", "custom"] as const;
const recordStatuses = ["Draft", "NeedInfo", "Active", "PendingReview", "Released", "Rejected", "Obsolete", "Merged", "PendingAdminConfirm", "MainDrawingInvalid"] as const satisfies readonly NumberingRecordStatus[];
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
  const itemKind = normalizedText(url.searchParams.get("itemKind"), 30);
  if (itemKind && !(itemKinds as readonly string[]).includes(itemKind)) throw new PartWorkbenchError("workbench_invalid_item_kind", "請重新選擇有效的料號類型。", 400);
  const recordStatus = normalizedText(url.searchParams.get("recordStatus"), 40);
  if (recordStatus && !(recordStatuses as readonly string[]).includes(recordStatus)) throw new PartWorkbenchError("workbench_invalid_record_status", "請重新選擇有效的資料狀態。", 400);
  const humanStatus = normalizedText(url.searchParams.get("humanStatus"), 30) || "all";
  if (!isHumanStatusFilter(humanStatus)) throw new PartWorkbenchError("workbench_invalid_human_status", "請重新選擇有效的工作狀態。", 400);
  const history = normalizedText(url.searchParams.get("history"), 20);
  if (history && history !== "include" && history !== "exclude") throw new PartWorkbenchError("workbench_invalid_history", "請重新選擇有效的歷史資料範圍。", 400);
  const rawLimit = normalizedText(url.searchParams.get("limit"), 10) || "50";
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new PartWorkbenchError("workbench_invalid_limit", "每頁筆數必須介於 1 到 100。", 400);
  const sortDirection = parseNumberSortDirection(url.searchParams.get("sortDirection"));
  return {
    query: normalizedText(url.searchParams.get("query"), 200),
    view,
    stage: stage as PartWorkbenchStage | "",
    seriesCode: normalizedText(url.searchParams.get("seriesCode"), 80),
    itemKind,
    recordStatus: recordStatus as NumberingRecordStatus | "",
    humanStatus,
    includeHistory: history === "include",
    cursor: normalizedText(url.searchParams.get("cursor"), 2_000),
    limit,
    sortDirection
  };
}

function filterHash(query: NormalizedPartWorkbenchQuery, actor: PartWorkbenchActor) {
  return pdmWorkbenchFilterHash({
    namespace: "part-v1",
    filters: {
      query: query.query.toLocaleLowerCase("zh-Hant"),
      view: query.view,
      stage: query.stage,
      seriesCode: query.seriesCode,
      itemKind: query.itemKind,
      recordStatus: query.recordStatus,
      humanStatus: query.humanStatus,
      includeHistory: query.includeHistory
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
  const href = `/parts?view=work${stage === "history_only" ? "&history=include" : ""}&detail=${encodeURIComponent(`candidate:${workspace.id}`)}`;
  const owner = workspace.ownerId === actor.id;
  const ownedAction = (kind: PartWorkbenchActionKind, label: string, allowed: boolean, permissionCode: string) => ({
    kind,
    label,
    enabled: owner && allowed,
    disabledReason: owner ? allowed ? null : `缺少權限（${permissionCode}），請聯絡研發主管或 PDM Admin。` : "這筆工作需由負責人處理。",
    href: owner && allowed ? href : null,
    permissionCode: owner && !allowed ? permissionCode : null,
    contactRole: owner ? "研發主管或 PDM Admin" : "工作負責人",
    adminHref: owner && !allowed && actor.permissions.managePermissions ? "/settings/workflow" : null
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
  const responsible = stage === "auto_finalizing" ? "system" : stage === "in_review" ? actor.permissions.candidateReview ? "current_user" : "other_user" : workspace.ownerId === actor.id ? "current_user" : "other_user";
  const viewerStatus = projectViewerHumanStatus(humanStatus, {
    responsibility: responsible,
    basis: stage === "auto_finalizing" ? "system" : stage === "in_review" ? "role_capability" : "assignee",
    canAct: responsible === "current_user" && Boolean(primaryAction?.enabled),
    actorLabel: responsible === "system" ? "系統正在建立已發布資料" : responsible === "current_user" ? "這筆工作需要你處理" : "等待負責人處理",
    nextStep: primaryAction?.label ?? null
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
    viewerStatus,
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
    viewerStatus: projectRoleViewerHumanStatus(humanStatus, actor.viewerCapabilities),
    availabilityScope: projectPartAvailability(part),
    primaryAction: { kind: stage === "history_only" ? "view_history" : "view_part", label: stage === "history_only" ? "查看歷史" : "查看料號", enabled: true, disabledReason: null, href: detailHref },
    warning: part.recordStatus === "MainDrawingInvalid" ? { code: "main_drawing_invalid", message: "主要製造圖目前失效，請先確認圖料關係。" } : null,
    terminal: stage === "history_only" ? { kind: part.recordStatus === "Merged" ? "merged" : "obsolete", reasonLabel: part.recordStatus === "Merged" ? "此料號已合併。" : "此料號已作廢。", nextStepLabel: "請改用有效料號；需要追溯時再查看歷史。" } : null,
    updatedAt: part.updatedAt,
    partRootId: part.partRootId,
    preview: null
  };
}

function rowInView(row: PartWorkbenchRow, source: NumberingDraftWorkspaceRecord | PartModuleListRecord, actor: PartWorkbenchActor, view: PartWorkbenchView) {
  if (view === "all") return true;
  if (view === "work") return !["released", "history_only"].includes(row.stage);
  if (row.rowKind === "candidate_bundle") {
    const workspace = source as NumberingDraftWorkspaceRecord;
    return workspace.ownerId === actor.id || (row.stage === "in_review" && actor.permissions.candidateReview) || (row.stage === "recovery_required" && actor.permissions.publish);
  }
  return row.viewerStatus.category === "current_user";
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
    const cursor = query.cursor ? decodePdmWorkbenchCursor(query.cursor, currentFilterHash) : null;
    const page = await this.repository.readListPage<PartWorkbenchRow>({
      companyId: actor.companyId,
      query: query.query,
      seriesCode: query.seriesCode,
      itemKind: query.itemKind,
      recordStatus: query.recordStatus,
      sortDirection: query.sortDirection,
      includeCandidates: actor.permissions.workspaceView && !query.recordStatus,
      cursor: cursor ? { sortValue: cursor.sortValue ?? cursor.updatedAt, rowKey: cursor.rowKey } : null,
      limit: query.limit
    }, (candidateRecords, partRecords) => {
      const candidates = candidateRecords.map((source) => ({ source, row: candidateRow(source, actor) }));
      const formal = partRecords.map((source) => ({ source, row: formalRow(source, actor) }));
      return [...candidates, ...formal]
        .filter(({ row }) => query.includeHistory || row.stage !== "history_only")
        .filter(({ row, source }) => rowInView(row, source, actor, query.view))
        .map(({ row }) => row)
        .filter((row) => !query.stage || row.stage === query.stage)
        .filter((row) => viewerStatusMatchesFilter(row.viewerStatus, row.humanStatus, query.humanStatus, row.availabilityScope));
    });
    const hasNext = page.rows.length > query.limit;
    const rows = page.rows.slice(0, query.limit);
    if (options.previewEnabled) {
      const { resolvePartWorkbenchPreviewReferences } = await import("@/lib/pdm-workbench-preview-gallery");
      const previews = await resolvePartWorkbenchPreviewReferences(this.client, rows, actor.companyId);
      for (const row of rows) row.preview = previews.get(row.rowKey)?.summary ?? null;
    }
    const last = rows.at(-1);
    return {
      rows,
      nextCursor: hasNext && last ? encodePdmWorkbenchCursor({ version: 1, filterHash: currentFilterHash, updatedAt: last.updatedAt, sortValue: last.displayCode, rowKey: last.rowKey }) : null,
      generatedAt: new Date().toISOString(),
      filters: { seriesCodeOptions: page.seriesCodeOptions, itemKindOptions: [...itemKinds], recordStatusOptions: [...recordStatuses] }
    };
  }

  async detail(rowKey: string, actor: PartWorkbenchActor, options: { previewEnabled?: boolean } = {}): Promise<PartWorkbenchDetailResponse | null> {
    if (rowKey.startsWith("candidate:")) {
      if (!actor.permissions.workspaceView) return null;
      const candidate = await this.repository.readCandidateDetail(rowKey.slice("candidate:".length), actor.companyId);
      if (!candidate) return null;
      const row = candidateRow(candidate, actor);
      if (options.previewEnabled) {
        const { resolvePartWorkbenchPreviewReferences } = await import("@/lib/pdm-workbench-preview-gallery");
        row.preview = (await resolvePartWorkbenchPreviewReferences(this.client, [row], actor.companyId)).get(row.rowKey)?.summary ?? null;
      }
      return { row, candidate, part: null, capabilities: { canManagePermissions: actor.permissions.managePermissions } };
    }
    const source = rowKey.startsWith("part:")
      ? await this.repository.readPartDetailById(rowKey.slice("part:".length), actor.companyId)
      : await this.repository.readPartDetailByCode(rowKey, actor.companyId);
    if (!source) return null;
    const row = formalRow(source, actor);
    if (options.previewEnabled) {
      const { resolvePartWorkbenchPreviewReferences } = await import("@/lib/pdm-workbench-preview-gallery");
      row.preview = (await resolvePartWorkbenchPreviewReferences(this.client, [row], actor.companyId)).get(row.rowKey)?.summary ?? null;
    }
    return {
      row,
      candidate: null,
      part: { ...source, humanStatus: row.humanStatus, viewerStatus: row.viewerStatus, availabilityScope: row.availabilityScope },
      capabilities: { canManagePermissions: actor.permissions.managePermissions }
    };
  }
}

export function partWorkbenchErrorResponse(error: unknown) {
  if (error instanceof PdmWorkbenchCursorError || error instanceof PartWorkbenchError) {
    return Response.json({ error: { code: error.code, message: error.message, retryable: false } }, { status: error.status });
  }
  console.error("Part workbench read failed", error);
  return Response.json({ error: { code: "part_workbench_read_failed", message: "料號工作台目前無法載入，請重新整理。", retryable: true } }, { status: 500 });
}
