import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { projectDrawingAvailability, projectDrawingRecordAvailability, projectPartAvailability, projectRelationRootAvailability } from "@/lib/availability-scope";
import { projectEffectiveRelationRecordStatus, projectNumberingRootStatus, relationshipHealthLabel } from "@/lib/drawing-part-relation-status";
import { projectDrawingRecordHumanStatus } from "@/lib/drawing-workbench-status";
import {
  createHumanStatus,
  type HumanStatusRoleCapabilities,
  type HumanStatusProjection,
  type ViewerHumanStatusProjection
} from "@/lib/human-status-projection";
import { parseWorkStatusSelection, type WorkStatusFilter } from "@/lib/work-status-presentation";
import { actionEvidenceFrom, projectResponsibilityStatusPair, responsibilityStatusMatchesSelection, type ResponsibilityActionEvidence, type ResponsibilityStatusProjection, type ViewerActionabilityProjection } from "@/lib/responsibility-status-projection";
import { isManufacturingDrawingPurpose, isReferenceDrawingPurpose } from "@/lib/numbering-identity";
import { projectPartHumanStatus } from "@/lib/part-human-status";
import { canEditPdmOwnedResource } from "@/lib/pdm-edit-scope-policy";
import { decodePdmWorkbenchCursor, encodePdmWorkbenchCursor, pdmWorkbenchFilterHash, PdmWorkbenchCursorError } from "@/lib/pdm-workbench-cursor";
import type { PdmWorkbenchAction, PdmWorkbenchFilterSelection, PdmWorkbenchListResponse, PdmWorkbenchRowBase } from "@/lib/pdm-workbench-contract";
import { parsePdmWorkbenchFilterSelection, PdmWorkbenchFilterSelectionError, selectionHashValue } from "@/lib/pdm-workbench-filter-selection";
import { RELATION_WORKBENCH_ENTITY_TYPE_VALUES as SHARED_RELATION_WORKBENCH_ENTITY_TYPE_VALUES, PDM_WORKBENCH_RECORD_STATUS_VALUES } from "@/lib/pdm-workbench-filter-options";
import { RelationWorkbenchAsyncRepository, type RelationWorkbenchChangeSource } from "@/lib/repositories/relation-workbench-async-repository";
import type { NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import type {
  DrawingNumberRecord,
  NumberingLinkRecord,
  NumberingRecordStatus,
  NumberingRootDetailRecord,
  NumberingSearchEntityType,
  PartNumberRecord
} from "@/lib/repositories/numbering-repository";
import { parseNumberSortDirection, type NumberSortDirection } from "@/lib/number-sort";
import { isPdmWorkbenchProductionRdLanesV1Enabled } from "@/lib/number-state-flow-feature";
import { groupPdmWorkbenchRows, laneSelectionIncludes, makePdmWorkbenchLaneFields, withPdmWorkbenchLane } from "@/lib/pdm-workbench-lane";
import { pdmWorkbenchReferenceFingerprint, PdmWorkbenchProjectionTokenError, verifyPdmWorkbenchProjectionToken } from "@/lib/pdm-workbench-projection-token";

export type RelationWorkbenchView = "mine" | "work" | "all";
export type RelationWorkbenchStage = "building" | "drawing_preparation" | "bundle_ready" | "in_review" | "auto_finalizing" | "recovery_required" | "correction_required" | "official_controlled" | "released" | "history_only";
export type RelationWorkbenchActionKind = "continue_change" | "submit_change" | "review_change" | "view_processing" | "view_root" | "view_history";
export type RelationHealth = "complete" | "missing_manufacturing_drawing" | "missing_part" | "ambiguous" | "blocked" | "draft";
export type RelationSeverity = "ok" | "info" | "warning" | "blocked";

export type RelationBlocker = { code: string; message: string; target: "root" | "drawing" | "part" | "relationship"; targetId?: string };
export type RelationMatrixCell = { drawingNumber: string; partNumber: string; relationType: "manufacturing_basis" | "reference" | "pending" | "not_applicable" | "required_missing" | "blocked"; isPrimary?: boolean };
export type RelationDrawing = {
  id: string;
  drawingNumber: string;
  purposeCode: string;
  purposeLabel: "製造圖" | "參考圖";
  purposeText: string;
  isManufacturing: boolean;
  isReferenceOnly: boolean;
  recordStatus: NumberingRecordStatus;
  humanStatus: HumanStatusProjection;
  responsibilityStatus: ResponsibilityStatusProjection;
  viewerActionability: ViewerActionabilityProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: ReturnType<typeof projectDrawingRecordAvailability>;
  linkedPartNumbers: string[];
  nextStep: string;
};
export type RelationPart = {
  id: string;
  partNumber: string;
  partName: string;
  itemKind: string;
  recordStatus: NumberingRecordStatus;
  humanStatus: HumanStatusProjection;
  responsibilityStatus: ResponsibilityStatusProjection;
  viewerActionability: ViewerActionabilityProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: ReturnType<typeof projectPartAvailability>;
  linkedDrawingNumbers: string[];
  hasManufacturingDrawing: boolean;
  hasMasterDataGap: boolean;
};
export type RelationActiveChange = {
  workspaceId: string;
  rowKey: string;
  displayCode: string;
  displayName: string;
  stage: RelationWorkbenchStage;
  stageLabel: string;
  ownerId: string;
  updatedAt: string;
  partCodes: string[];
  drawingCodes: string[];
  primaryAction: PdmWorkbenchAction<RelationWorkbenchActionKind> | null;
};

export type RelationWorkbenchRow = PdmWorkbenchRowBase<"formal_root" | "candidate_root", RelationWorkbenchActionKind> & {
  rootId: string | null;
  workspaceId: string | null;
  recordStatus: NumberingRecordStatus | null;
  relationshipHealth: RelationHealth;
  relationshipLabel: string;
  nextStep: { label: string; target?: string; severity: RelationSeverity };
  drawings: RelationDrawing[];
  parts: RelationPart[];
  matrix: RelationMatrixCell[];
  blockers: RelationBlocker[];
  activeChanges: RelationActiveChange[];
  stage: RelationWorkbenchStage;
  stageLabel: string;
  warning: { code: string; message: string } | null;
};

export type ProjectedRelationRootDetail = Omit<NumberingRootDetailRecord, "drawingNumbers" | "partNumbers"> & {
  humanStatus: HumanStatusProjection;
  responsibilityStatus: ResponsibilityStatusProjection;
  viewerActionability: ViewerActionabilityProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: ReturnType<typeof projectRelationRootAvailability>;
  drawingNumbers: Array<DrawingNumberRecord & Pick<RelationDrawing, "humanStatus" | "responsibilityStatus" | "viewerActionability" | "viewerStatus" | "availabilityScope">>;
  partNumbers: Array<PartNumberRecord & Pick<RelationPart, "humanStatus" | "responsibilityStatus" | "viewerActionability" | "viewerStatus" | "availabilityScope" | "hasMasterDataGap">>;
};

export type RelationWorkbenchDetailResponse = {
  row: RelationWorkbenchRow;
  rootDetail: ProjectedRelationRootDetail | null;
  candidate: NumberingDraftWorkspaceRecord | null;
  focusedChange: RelationActiveChange | null;
  capabilities: { canManageRelations: boolean; canManagePermissions: boolean };
};

export type RelationWorkbenchPermissions = {
  workspaceView: boolean;
  workspaceUpdate: boolean;
  candidateSubmit: boolean;
  candidateReview: boolean;
  publish: boolean;
  manageRelations: boolean;
  managePermissions: boolean;
};
export type RelationWorkbenchActor = {
  id: string;
  companyId: string;
  canEditNonOwned: boolean;
  permissions: RelationWorkbenchPermissions;
  viewerCapabilities: HumanStatusRoleCapabilities;
};
export type RelationWorkbenchListResponse = PdmWorkbenchListResponse<RelationWorkbenchRow, {
  seriesCodeOptions: string[];
  entityTypeOptions: NumberingSearchEntityType[];
  recordStatusOptions: NumberingRecordStatus[];
}>;

export class RelationWorkbenchError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
    this.name = "RelationWorkbenchError";
  }
}

type NormalizedRelationQuery = {
  query: string;
  view: RelationWorkbenchView;
  seriesCode: PdmWorkbenchFilterSelection<string>;
  entityType: PdmWorkbenchFilterSelection<NumberingSearchEntityType>;
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

export const RELATION_WORKBENCH_ENTITY_TYPE_VALUES = SHARED_RELATION_WORKBENCH_ENTITY_TYPE_VALUES;
export const RELATION_WORKBENCH_RECORD_STATUS_VALUES = PDM_WORKBENCH_RECORD_STATUS_VALUES;
const entityTypes = ["all", ...RELATION_WORKBENCH_ENTITY_TYPE_VALUES] as const satisfies readonly NumberingSearchEntityType[];
const recordStatuses = RELATION_WORKBENCH_RECORD_STATUS_VALUES;
const stageLabels: Record<RelationWorkbenchStage, string> = {
  building: "建立中", drawing_preparation: "首版準備", bundle_ready: "可送審", in_review: "審核中",
  auto_finalizing: "系統正式化中", recovery_required: "需要處理", correction_required: "需要修正",
  official_controlled: "研發受控", released: "已發布", history_only: "歷史紀錄"
};

function text(value: string | null, max: number) { return String(value ?? "").trim().slice(0, max); }

export function normalizeRelationWorkbenchQuery(url: URL): NormalizedRelationQuery {
  const rawView = text(url.searchParams.get("view"), 20);
  const view: RelationWorkbenchView = rawView === "mine" || rawView === "work" ? rawView : "all";
  const entityType = parsePdmWorkbenchFilterSelection<NumberingSearchEntityType>(url.searchParams, "entityType", { allowedValues: entityTypes.filter((value): value is Exclude<NumberingSearchEntityType, "all"> => value !== "all"), maxValueLength: 30 });
  const recordStatus = parsePdmWorkbenchFilterSelection<NumberingRecordStatus>(url.searchParams, "recordStatus", { allowedValues: recordStatuses, maxValueLength: 40 });
  const history = text(url.searchParams.get("history"), 20);
  if (history && history !== "include" && history !== "exclude") throw new RelationWorkbenchError("workbench_invalid_history", "請重新選擇有效的歷史資料範圍。", 400);
  const workStatusQuery = parseWorkStatusSelection(url.searchParams, { history, view: rawView, supportsMineView: true, strict: true });
  const rawLimit = text(url.searchParams.get("limit"), 10) || "60";
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RelationWorkbenchError("workbench_invalid_limit", "每頁筆數必須介於 1 到 100。", 400);
  const sortDirection = parseNumberSortDirection(url.searchParams.get("sortDirection"));
  const direction = url.searchParams.get("direction") === "before" ? "before" : "after";
  const pageIndexValue = Number(url.searchParams.get("pageIndex") ?? "0");
  return {
    query: text(url.searchParams.get("query"), 200), view: (workStatusQuery.view === "mine" || workStatusQuery.view === "work" ? workStatusQuery.view : view), seriesCode: parsePdmWorkbenchFilterSelection(url.searchParams, "seriesCode", { maxValueLength: 80 }),
    entityType, recordStatus,
    humanStatus: workStatusQuery.selection, includeHistory: workStatusQuery.includeHistory, cursor: text(url.searchParams.get("cursor"), 2_000), direction, pageIndex: Number.isInteger(pageIndexValue) && pageIndexValue >= 0 && pageIndexValue < 100_000 ? pageIndexValue : 0, limit, sortDirection,
    lane: parsePdmWorkbenchFilterSelection(url.searchParams, "lane", { allowedValues: ["production", "rd"], maxValueLength: 20 })
  };
}

function relationFilterHash(query: NormalizedRelationQuery, actor: RelationWorkbenchActor) {
  return pdmWorkbenchFilterHash({ namespace: "relation-v1", filters: {
    query: query.query.toLocaleLowerCase("zh-Hant"), view: query.view, seriesCode: selectionHashValue(query.seriesCode),
    entityType: selectionHashValue(query.entityType), recordStatus: selectionHashValue(query.recordStatus), humanStatus: selectionHashValue(query.humanStatus), includeHistory: query.includeHistory, sortDirection: query.sortDirection, lane: selectionHashValue(query.lane)
  }, companyId: actor.companyId, actorId: actor.id });
}

type RelationChangeSource = NumberingDraftWorkspaceRecord | RelationWorkbenchChangeSource;

function candidateStage(workspace: RelationChangeSource): RelationWorkbenchStage {
  if ("projectedStage" in workspace) return workspace.projectedStage;
  if (workspace.lifecycleStatus === "cancelled") return "history_only";
  const stage = workspace.lifecycleV2?.stage;
  if (stage === "drawing_addendum_required") return "drawing_preparation";
  if (stage === "official_controlled") return "official_controlled";
  if (stage && Object.hasOwn(stageLabels, stage)) return stage as RelationWorkbenchStage;
  if (workspace.latestApproval?.status === "needs_info" || workspace.latestApproval?.status === "rejected") return "correction_required";
  if (workspace.reservations.filter((reservation) => reservation.state !== "recycled").length === 0) return "building";
  return "recovery_required";
}

function candidateStatus(stage: RelationWorkbenchStage) {
  if (stage === "history_only") return createHumanStatus("cancelled", "terminal", "已取消", "neutral", "archive");
  if (stage === "bundle_ready") return createHumanStatus("ready_to_submit", "ready", "可送審", "success", "play");
  if (stage === "in_review") return createHumanStatus("waiting_review", "waiting", "待審核", "info", "clock");
  if (stage === "auto_finalizing") return createHumanStatus("finalizing", "waiting", "正式化中", "info", "clock");
  if (stage === "recovery_required") return createHumanStatus("formalization_failed", "action_required", "正式化待處理", "danger", "alert");
  if (stage === "correction_required") return createHumanStatus("correction_required", "action_required", "待修正", "warning", "alert");
  return createHumanStatus("preparing", "waiting", "準備中", "info", "clock");
}

function roleResponsibilityAction(status: HumanStatusProjection, actor: RelationWorkbenchActor, href: string): ResponsibilityActionEvidence | null {
  const capabilities = actor.viewerCapabilities;
  if (status.phase === "terminal" || status.phase === "usable") return null;
  if (status.key === "waiting_review") return { kind: "review_relation", label: capabilities.canReview ? "前往審核" : "查看審核進度", enabled: capabilities.canReview, disabledReason: capabilities.canReview ? null : "目前不是審核負責人。", href };
  if (status.key === "main_drawing_invalid") return { kind: "restore_main_drawing", label: "處理主圖恢復", enabled: capabilities.canRestoreMainDrawing, disabledReason: capabilities.canRestoreMainDrawing ? null : "目前不是主圖維護負責人。", href };
  if (["missing_manufacturing_drawing", "missing_part", "data_conflict"].includes(status.key)) return { kind: "manage_relation", label: "維護圖料關係", enabled: capabilities.canManageRelations, disabledReason: capabilities.canManageRelations ? null : "目前不是圖料關係負責人。", href };
  if (status.key === "ready_to_submit") return { kind: "submit_review", label: "送交審核", enabled: capabilities.canSubmit, disabledReason: capabilities.canSubmit ? null : "目前不是送審負責人。", href };
  return { kind: "edit_relation", label: "開啟明細處理", enabled: capabilities.canEdit, disabledReason: capabilities.canEdit ? null : "目前不是負責人。", href };
}

function roleStatusPair(status: HumanStatusProjection, actor: RelationWorkbenchActor, href: string, options: { hasActiveReviewWorkItem?: boolean; systemAdminRecovery?: boolean } = {}) {
  const action = roleResponsibilityAction(status, actor, href);
  const reviewOwner = options.hasActiveReviewWorkItem === true || status.key === "waiting_review";
  const systemAdmin = options.systemAdminRecovery === true;
  const responsibilityActions = action ? [action] : [];
  return projectResponsibilityStatusPair({
    status,
    actorId: actor.id,
    hasActiveReviewWorkItem: reviewOwner,
    hasOwnerResponsibilityAction: !reviewOwner && !systemAdmin && status.phase !== "terminal" && status.phase !== "usable",
    hasSystemAdminRecoveryAction: systemAdmin,
    ownerQueueEligible: !reviewOwner && !systemAdmin && Boolean(action?.enabled),
    reviewQueueEligible: reviewOwner && actor.viewerCapabilities.canReview,
    systemAdminQueueEligible: systemAdmin && actor.viewerCapabilities.canPublish,
    responsibilityActions
  });
}

function candidateAction(
  workspace: RelationChangeSource,
  stage: RelationWorkbenchStage,
  actor: RelationWorkbenchActor
): PdmWorkbenchAction<RelationWorkbenchActionKind> | null {
  const href = `/numbering/workspaces/${encodeURIComponent(workspace.id)}?intent=${stage === "bundle_ready" ? "submit_review" : stage === "history_only" ? "view" : "edit"}&returnTo=${encodeURIComponent(`/numbering/search?view=work${stage === "history_only" ? "&history=include" : ""}`)}`;
  const canMaintain = canEditPdmOwnedResource({ actorId: actor.id, ownerId: workspace.ownerId, canEditNonOwned: actor.canEditNonOwned });
  const owned = (kind: RelationWorkbenchActionKind, label: string, allowed: boolean, permissionCode: string): PdmWorkbenchAction<RelationWorkbenchActionKind> => ({
    kind, label, enabled: canMaintain && allowed,
    disabledReason: canMaintain ? allowed ? null : `缺少權限（${permissionCode}），請聯絡研發主管或 PDM Admin。` : "這筆工作需由負責人處理。",
    href: canMaintain && allowed ? href : null, permissionCode: canMaintain && !allowed ? permissionCode : null,
    contactRole: canMaintain ? "研發主管或 PDM Admin" : "工作負責人", adminHref: canMaintain && !allowed && actor.permissions.managePermissions ? "/settings/workflow" : null
  });
  if (stage === "building" || stage === "drawing_preparation" || stage === "correction_required") return owned("continue_change", stage === "correction_required" ? "繼續修正" : "繼續建立", actor.permissions.workspaceUpdate, "numbering.workspace.update");
  if (stage === "bundle_ready") return owned("submit_change", "送交審核", actor.permissions.candidateSubmit, "numbering.candidate.review.submit");
  if (stage === "in_review") return { kind: "review_change", label: actor.permissions.candidateReview ? "前往審核" : "查看審核", enabled: true, disabledReason: null, href };
  if (stage === "auto_finalizing") return null;
  if (stage === "recovery_required") return { kind: "view_processing", label: "查看處理狀態", enabled: true, disabledReason: null, href };
  return { kind: "view_history", label: "查看紀錄", enabled: true, disabledReason: null, href };
}

function activeChange(workspace: RelationChangeSource, actor: RelationWorkbenchActor): RelationActiveChange {
  const stage = candidateStage(workspace);
  const partCodes = workspace.parts.map((part) => part.candidateCode).filter((value): value is string => Boolean(value));
  const drawingCodes = workspace.drawings.map((drawing) => drawing.candidateCode).filter((value): value is string => Boolean(value));
  return {
    workspaceId: workspace.id,
    rowKey: `candidate:${workspace.id}`,
    displayCode: workspace.root?.candidateCode ?? drawingCodes[0] ?? partCodes[0] ?? "尚未產生編號",
    displayName: workspace.root?.coreName ?? workspace.parts[0]?.partName ?? "圖料變更工作",
    stage,
    stageLabel: stageLabels[stage],
    ownerId: workspace.ownerId,
    updatedAt: workspace.updatedAt,
    partCodes,
    drawingCodes,
    primaryAction: candidateAction(workspace, stage, actor)
  };
}

function groupLinks(links: NumberingLinkRecord[], key: "drawingNumberId" | "partNumberId") {
  const groups = new Map<string, NumberingLinkRecord[]>();
  for (const link of links) groups.set(link[key], [...(groups.get(link[key]) ?? []), link]);
  return groups;
}

function requiresManufacturingDrawing(itemKind: string) { return ["manufactured", "outsourced", "custom"].includes(itemKind); }

function blockersFor(detail: NumberingRootDetailRecord): RelationBlocker[] {
  const blockers: RelationBlocker[] = [];
  const drawingById = new Map(detail.drawingNumbers.map((drawing) => [drawing.id, drawing]));
  const linksByPart = groupLinks(detail.links, "partNumberId");
  const linksByDrawing = groupLinks(detail.links, "drawingNumberId");
  const manufacturing = detail.drawingNumbers.filter((drawing) => isManufacturingDrawingPurpose(drawing.purposeCode));
  if (detail.partNumbers.length === 0) blockers.push({ code: "missing_part", message: "這個圖料根號尚未建立料號，不能判定圖料關係。", target: "root", targetId: detail.root.id });
  if (manufacturing.length === 0) blockers.push({ code: "missing_manufacturing_drawing", message: "這個圖料根號還沒有製造圖類別，不能建立製造基準關聯。", target: "root", targetId: detail.root.id });
  for (const part of detail.partNumbers) {
    const manufacturingLinks = (linksByPart.get(part.id) ?? []).filter((link) => link.linkType === "primary_manufacturing" && Boolean(drawingById.get(link.drawingNumberId) && isManufacturingDrawingPurpose(drawingById.get(link.drawingNumberId)!.purposeCode)));
    if (manufacturingLinks.length > 1) blockers.push({ code: "ambiguous_primary", message: `料號 ${part.partNumber} 同時連到多張製造圖，請確認主要製造依據。`, target: "part", targetId: part.id });
    if (manufacturingLinks.length === 0 && requiresManufacturingDrawing(part.itemKind)) blockers.push({ code: "part_without_manufacturing_drawing", message: `料號 ${part.partNumber} 尚未連到製造圖，請先建立圖料關係。`, target: "part", targetId: part.id });
  }
  for (const drawing of detail.drawingNumbers) if ((linksByDrawing.get(drawing.id) ?? []).length === 0) blockers.push({ code: "drawing_without_part", message: `圖號 ${drawing.drawingNumber} 尚未關聯料號。`, target: "drawing", targetId: drawing.id });
  for (const link of detail.links) {
    const drawing = drawingById.get(link.drawingNumberId);
    if (link.linkType === "primary_manufacturing" && (!drawing || !isManufacturingDrawingPurpose(drawing.purposeCode))) blockers.push({ code: "reference_only", message: `圖號 ${link.drawingNumber} 是參考圖，不可作為製造依據。`, target: "relationship", targetId: link.id });
  }
  return blockers;
}

function nextStep(health: RelationHealth, blockers: RelationBlocker[]) {
  if (health === "complete") return { label: "製造基準關聯完整", severity: "ok" as const };
  if (health === "missing_part") return { label: "補料號", severity: "warning" as const };
  if (health === "missing_manufacturing_drawing") return { label: "補製造圖關聯", severity: "blocked" as const };
  if (health === "draft") return { label: blockers.length > 0 ? "先收斂缺口" : "完成送審前確認", severity: "info" as const };
  if (health === "ambiguous") return { label: "檢查主圖主料", severity: "blocked" as const };
  return { label: "需處理阻擋", severity: "blocked" as const };
}

function matrixFor(parts: PartNumberRecord[], drawings: DrawingNumberRecord[], links: NumberingLinkRecord[]): RelationMatrixCell[] {
  const linksByPair = new Map(links.map((link) => [`${link.partNumberId}:${link.drawingNumberId}`, link]));
  const manufacturingIds = new Set(drawings.filter((drawing) => isManufacturingDrawingPurpose(drawing.purposeCode)).map((drawing) => drawing.id));
  return parts.flatMap((part) => drawings.map((drawing) => {
    const link = linksByPair.get(`${part.id}:${drawing.id}`);
    if (!link) {
      const hasManufacturing = links.some((item) => item.partNumberId === part.id && item.linkType === "primary_manufacturing" && manufacturingIds.has(item.drawingNumberId));
      if (!isManufacturingDrawingPurpose(drawing.purposeCode) || !requiresManufacturingDrawing(part.itemKind) || hasManufacturing) return { drawingNumber: drawing.drawingNumber, partNumber: part.partNumber, relationType: "not_applicable" as const };
      return { drawingNumber: drawing.drawingNumber, partNumber: part.partNumber, relationType: manufacturingIds.size === 1 ? "required_missing" as const : "pending" as const };
    }
    if (link.linkType === "primary_manufacturing" && manufacturingIds.has(link.drawingNumberId)) return { drawingNumber: drawing.drawingNumber, partNumber: part.partNumber, relationType: "manufacturing_basis" as const, isPrimary: true };
    if (link.linkType === "primary_manufacturing") return { drawingNumber: drawing.drawingNumber, partNumber: part.partNumber, relationType: "blocked" as const, isPrimary: true };
    return { drawingNumber: drawing.drawingNumber, partNumber: part.partNumber, relationType: "reference" as const };
  }));
}

type CandidatePart = NumberingDraftWorkspaceRecord["parts"][number];
type CandidateDrawing = NumberingDraftWorkspaceRecord["drawings"][number];
type CandidateRelation = NumberingDraftWorkspaceRecord["relations"][number];

function candidateCode(code: string | null, label: "圖" | "料", index: number) {
  return code ?? `未取號${label}${index + 1}`;
}

function candidateBlockers(workspace: NumberingDraftWorkspaceRecord): RelationBlocker[] {
  const blockers: RelationBlocker[] = [];
  const partById = new Map(workspace.parts.map((part) => [part.id, part]));
  const drawingById = new Map(workspace.drawings.map((drawing) => [drawing.id, drawing]));
  const relationsByPart = new Map<string, CandidateRelation[]>();
  const relationsByDrawing = new Map<string, CandidateRelation[]>();
  const seenPairs = new Set<string>();
  for (const relation of workspace.relations) {
    relationsByPart.set(relation.partDraftId, [...(relationsByPart.get(relation.partDraftId) ?? []), relation]);
    relationsByDrawing.set(relation.drawingDraftId, [...(relationsByDrawing.get(relation.drawingDraftId) ?? []), relation]);
    const part = partById.get(relation.partDraftId);
    const drawing = drawingById.get(relation.drawingDraftId);
    if (!part || !drawing) {
      blockers.push({
        code: "candidate_relation_orphan",
        message: "這筆關聯的圖號或料號不屬於目前工作，請聯絡系統管理員檢查移轉資料。",
        target: "relationship",
        targetId: relation.id
      });
      continue;
    }
    const pair = `${relation.partDraftId}:${relation.drawingDraftId}`;
    if (seenPairs.has(pair)) {
      blockers.push({
        code: "candidate_relation_duplicate",
        message: `料號 ${part.candidateCode ?? part.partName} 與圖號 ${drawing.candidateCode ?? drawing.purposeCode} 存在重複關聯，請聯絡系統管理員檢查移轉資料。`,
        target: "relationship",
        targetId: relation.id
      });
    }
    seenPairs.add(pair);
    if ((relation.linkType === "primary_manufacturing" && (!relation.isPrimary || !isManufacturingDrawingPurpose(drawing.purposeCode)))
      || (relation.linkType === "reference" && relation.isPrimary)) {
      blockers.push({
        code: "candidate_primary_invalid",
        message: `料號 ${part.candidateCode ?? part.partName} 的主要製造關聯不是有效製造圖，請檢查關聯資料。`,
        target: "relationship",
        targetId: relation.id
      });
    }
  }
  if (workspace.parts.length === 0) {
    blockers.push({ code: "missing_part", message: "這筆工作尚未建立料號，不能判定圖料關係。", target: "root", targetId: workspace.id });
  }
  const requiredParts = workspace.parts.filter((part) => requiresManufacturingDrawing(part.itemKind));
  const manufacturingDrawings = workspace.drawings.filter((drawing) => isManufacturingDrawingPurpose(drawing.purposeCode));
  if (requiredParts.length > 0 && manufacturingDrawings.length === 0) {
    blockers.push({ code: "missing_manufacturing_drawing", message: "這筆工作還沒有製造圖類別，不能建立製造基準關聯。", target: "root", targetId: workspace.id });
  }
  for (const part of requiredParts) {
    const validPrimary = (relationsByPart.get(part.id) ?? []).filter((relation) => {
      const drawing = drawingById.get(relation.drawingDraftId);
      return relation.linkType === "primary_manufacturing"
        && relation.isPrimary
        && Boolean(drawing && isManufacturingDrawingPurpose(drawing.purposeCode));
    });
    if (validPrimary.length === 0) {
      blockers.push({
        code: "part_without_manufacturing_drawing",
        message: `料號 ${part.candidateCode ?? part.partName} 尚未連到製造圖，請先建立圖料關係。`,
        target: "part",
        targetId: part.id
      });
    } else if (validPrimary.length > 1) {
      blockers.push({
        code: "ambiguous_primary",
        message: `料號 ${part.candidateCode ?? part.partName} 同時連到多張製造圖，請確認主要製造依據。`,
        target: "part",
        targetId: part.id
      });
    }
  }
  for (const drawing of workspace.drawings) {
    if ((relationsByDrawing.get(drawing.id) ?? []).length === 0) {
      blockers.push({
        code: "drawing_without_part",
        message: `圖號 ${drawing.candidateCode ?? drawing.purposeCode} 尚未關聯料號。`,
        target: "drawing",
        targetId: drawing.id
      });
    }
  }
  return blockers;
}

function candidateHealth(workspace: NumberingDraftWorkspaceRecord, blockers: RelationBlocker[]): RelationHealth {
  if (workspace.parts.length === 0) return "missing_part";
  if (blockers.some((blocker) => ["candidate_relation_orphan", "candidate_relation_duplicate", "candidate_primary_invalid"].includes(blocker.code))) return "blocked";
  if (blockers.some((blocker) => blocker.code === "ambiguous_primary")) return "ambiguous";
  if (blockers.some((blocker) => blocker.code === "missing_manufacturing_drawing" || blocker.code === "part_without_manufacturing_drawing")) return "missing_manufacturing_drawing";
  return "draft";
}

function candidateMatrix(workspace: NumberingDraftWorkspaceRecord): RelationMatrixCell[] {
  const relationsByPair = new Map<string, CandidateRelation[]>();
  for (const relation of workspace.relations) {
    const pair = `${relation.partDraftId}:${relation.drawingDraftId}`;
    relationsByPair.set(pair, [...(relationsByPair.get(pair) ?? []), relation]);
  }
  const manufacturingDrawingIds = new Set(workspace.drawings.filter((drawing) => isManufacturingDrawingPurpose(drawing.purposeCode)).map((drawing) => drawing.id));
  const partNumbers = new Map(workspace.parts.map((part, index) => [part.id, candidateCode(part.candidateCode, "料", index)]));
  const drawingNumbers = new Map(workspace.drawings.map((drawing, index) => [drawing.id, candidateCode(drawing.candidateCode, "圖", index)]));
  return workspace.parts.flatMap((part) => workspace.drawings.map((drawing) => {
    const pairRelations = relationsByPair.get(`${part.id}:${drawing.id}`) ?? [];
    const relation = pairRelations[0];
    const drawingNumber = drawingNumbers.get(drawing.id)!;
    const partNumber = partNumbers.get(part.id)!;
    if (pairRelations.length > 1) {
      return { drawingNumber, partNumber, relationType: "blocked" as const };
    }
    if (!relation) {
      const hasManufacturing = workspace.relations.some((item) => item.partDraftId === part.id
        && item.linkType === "primary_manufacturing"
        && item.isPrimary
        && manufacturingDrawingIds.has(item.drawingDraftId));
      if (!isManufacturingDrawingPurpose(drawing.purposeCode) || !requiresManufacturingDrawing(part.itemKind) || hasManufacturing) {
        return { drawingNumber, partNumber, relationType: "not_applicable" as const };
      }
      return { drawingNumber, partNumber, relationType: manufacturingDrawingIds.size === 1 ? "required_missing" as const : "pending" as const };
    }
    if (relation.linkType === "primary_manufacturing" && relation.isPrimary && manufacturingDrawingIds.has(relation.drawingDraftId)) {
      return { drawingNumber, partNumber, relationType: "manufacturing_basis" as const, isPrimary: true };
    }
    if (relation.linkType === "primary_manufacturing") {
      return { drawingNumber, partNumber, relationType: "blocked" as const, isPrimary: true };
    }
    return { drawingNumber, partNumber, relationType: "reference" as const };
  }));
}

function mapCandidateDrawing(
  drawing: CandidateDrawing,
  index: number,
  workspace: NumberingDraftWorkspaceRecord,
  humanStatus: HumanStatusProjection,
  pair: ReturnType<typeof roleStatusPair>
): RelationDrawing {
  const drawingNumber = candidateCode(drawing.candidateCode, "圖", index);
  const relatedPartIds = workspace.relations.filter((relation) => relation.drawingDraftId === drawing.id).map((relation) => relation.partDraftId);
  const partNumbers = new Map(workspace.parts.map((part, partIndex) => [part.id, candidateCode(part.candidateCode, "料", partIndex)]));
  const reference = isReferenceDrawingPurpose(drawing.purposeCode);
  return {
    id: drawing.id,
    drawingNumber,
    purposeCode: drawing.purposeCode,
    purposeLabel: reference ? "參考圖" : "製造圖",
    purposeText: drawing.purposeDescription || drawing.purposeCode,
    isManufacturing: isManufacturingDrawingPurpose(drawing.purposeCode),
    isReferenceOnly: reference,
    recordStatus: "Draft",
    humanStatus,
    ...pair,
    availabilityScope: projectDrawingRecordAvailability({ recordStatus: "Draft" }),
    linkedPartNumbers: relatedPartIds.map((partId) => partNumbers.get(partId)).filter((value): value is string => Boolean(value)),
    nextStep: reference ? "參考圖不可作為製造基準" : relatedPartIds.length === 0 ? "未關聯料號" : "關係已建立，待正式生效"
  };
}

function mapCandidatePart(
  part: CandidatePart,
  index: number,
  workspace: NumberingDraftWorkspaceRecord,
  humanStatus: HumanStatusProjection,
  pair: ReturnType<typeof roleStatusPair>
): RelationPart {
  const partNumber = candidateCode(part.candidateCode, "料", index);
  const drawingById = new Map(workspace.drawings.map((drawing) => [drawing.id, drawing]));
  const drawingNumbers = new Map(workspace.drawings.map((drawing, drawingIndex) => [drawing.id, candidateCode(drawing.candidateCode, "圖", drawingIndex)]));
  const related = workspace.relations.filter((relation) => relation.partDraftId === part.id);
  const primary = related.find((relation) => {
    const drawing = drawingById.get(relation.drawingDraftId);
    return relation.linkType === "primary_manufacturing" && relation.isPrimary && Boolean(drawing && isManufacturingDrawingPurpose(drawing.purposeCode));
  });
  return {
    id: part.id,
    partNumber,
    partName: part.partName,
    itemKind: part.itemKind,
    recordStatus: "Draft",
    humanStatus,
    ...pair,
    availabilityScope: projectPartAvailability({
      recordStatus: "Draft",
      itemKind: part.itemKind,
      primaryDrawingNumber: primary ? drawingNumbers.get(primary.drawingDraftId) ?? null : null,
      primaryDrawingRecordStatus: primary ? "Draft" : null,
      hasManufacturingDrawing: Boolean(primary)
    }),
    linkedDrawingNumbers: related.map((relation) => drawingNumbers.get(relation.drawingDraftId)).filter((value): value is string => Boolean(value)),
    hasManufacturingDrawing: Boolean(primary),
    hasMasterDataGap: false
  };
}

function mapDrawing(drawing: DrawingNumberRecord, links: NumberingLinkRecord[], actor: RelationWorkbenchActor): RelationDrawing {
  const humanStatus = projectDrawingRecordHumanStatus(drawing);
  const reference = isReferenceDrawingPurpose(drawing.purposeCode);
  const pair = roleStatusPair(humanStatus, actor, `/numbering/search?detail=${encodeURIComponent(`drawing:${drawing.id}`)}`);
  return {
    id: drawing.id, drawingNumber: drawing.drawingNumber, purposeCode: drawing.purposeCode,
    purposeLabel: reference ? "參考圖" : "製造圖", purposeText: drawing.purposeCode,
    isManufacturing: isManufacturingDrawingPurpose(drawing.purposeCode), isReferenceOnly: reference,
    recordStatus: drawing.recordStatus, humanStatus, ...pair,
    availabilityScope: projectDrawingRecordAvailability(drawing), linkedPartNumbers: links.map((link) => link.partNumber),
    nextStep: reference ? "參考圖不可作為製造基準" : links.length === 0 ? "未關聯料號" : "製造基準關聯待狀態確認"
  };
}

function mapPart(part: PartNumberRecord, links: NumberingLinkRecord[], drawingById: Map<string, DrawingNumberRecord>, actor: RelationWorkbenchActor, partMasterDataGaps: ReadonlyMap<string, boolean> = new Map()): RelationPart {
  const primary = links.find((link) => link.linkType === "primary_manufacturing" && Boolean(drawingById.get(link.drawingNumberId) && isManufacturingDrawingPurpose(drawingById.get(link.drawingNumberId)!.purposeCode)));
  const primaryDrawing = primary ? drawingById.get(primary.drawingNumberId) : null;
  const humanStatus = projectPartHumanStatus({ recordStatus: part.recordStatus, itemKind: part.itemKind, primaryDrawingNumber: primaryDrawing?.drawingNumber ?? null, hasManufacturingDrawing: Boolean(primary) });
  const pair = roleStatusPair(humanStatus, actor, `/numbering/search?detail=${encodeURIComponent(`part:${part.id}`)}`);
  return {
    id: part.id, partNumber: part.partNumber, partName: part.partName, itemKind: part.itemKind, recordStatus: part.recordStatus,
    humanStatus, ...pair,
    availabilityScope: projectPartAvailability({ recordStatus: part.recordStatus, itemKind: part.itemKind, primaryDrawingNumber: primaryDrawing?.drawingNumber ?? null, primaryDrawingRecordStatus: primaryDrawing?.recordStatus ?? null, hasManufacturingDrawing: Boolean(primary) }),
    linkedDrawingNumbers: links.map((link) => link.drawingNumber), hasManufacturingDrawing: Boolean(primary), hasMasterDataGap: partMasterDataGaps.get(part.id) ?? false
  };
}

function projectRootDetail(detail: NumberingRootDetailRecord, actor: RelationWorkbenchActor, partMasterDataGaps: ReadonlyMap<string, boolean> = new Map()): ProjectedRelationRootDetail {
  const detailForProjection = { ...detail } as NumberingRootDetailRecord & { partMasterDataGaps?: Record<string, boolean> };
  delete detailForProjection.partMasterDataGaps;
  const status = projectNumberingRootStatus(detail);
  const drawingById = new Map(detail.drawingNumbers.map((drawing) => [drawing.id, drawing]));
  const linksByDrawing = groupLinks(detail.links, "drawingNumberId");
  const linksByPart = groupLinks(detail.links, "partNumberId");
  const blockers = blockersFor(detail);
  const manufacturing = detail.drawingNumbers.filter((drawing) => isManufacturingDrawingPurpose(drawing.purposeCode));
  const dependencyReleaseReady = manufacturing.length > 0 && manufacturing.every((drawing) => drawing.recordStatus === "Released") && detail.partNumbers.every((part) => part.recordStatus === "Released");
  const availabilityScope = projectRelationRootAvailability({ recordStatus: projectEffectiveRelationRecordStatus(detail, status.relationshipHealth, blockers.length), relationshipHealth: status.relationshipHealth, blockerCount: blockers.length, dependencyReleaseReady });
  const rootPair = roleStatusPair(status.humanStatus, actor, `/numbering/search?detail=${encodeURIComponent(`root:${detail.root.id}`)}`);
  return {
    ...detailForProjection,
    humanStatus: status.humanStatus,
    ...rootPair,
    availabilityScope,
    drawingNumbers: detail.drawingNumbers.map((drawing) => {
      const projection = mapDrawing(drawing, linksByDrawing.get(drawing.id) ?? [], actor);
      return { ...drawing, humanStatus: projection.humanStatus, responsibilityStatus: projection.responsibilityStatus, viewerActionability: projection.viewerActionability, viewerStatus: projection.viewerStatus, availabilityScope: projection.availabilityScope };
    }),
    partNumbers: detail.partNumbers.map((part) => {
      const projection = mapPart(part, linksByPart.get(part.id) ?? [], drawingById, actor, partMasterDataGaps);
      return { ...part, humanStatus: projection.humanStatus, responsibilityStatus: projection.responsibilityStatus, viewerActionability: projection.viewerActionability, viewerStatus: projection.viewerStatus, availabilityScope: projection.availabilityScope, hasMasterDataGap: projection.hasMasterDataGap };
    })
  };
}

function formalRootRow(detail: NumberingRootDetailRecord, sourceChanges: RelationChangeSource[], actor: RelationWorkbenchActor, partMasterDataGaps: ReadonlyMap<string, boolean> = new Map()): RelationWorkbenchRow {
  const drawingById = new Map(detail.drawingNumbers.map((drawing) => [drawing.id, drawing]));
  const linksByDrawing = groupLinks(detail.links, "drawingNumberId");
  const linksByPart = groupLinks(detail.links, "partNumberId");
  const blockers = blockersFor(detail);
  const rootStatus = projectNumberingRootStatus(detail);
  const health = rootStatus.relationshipHealth as RelationHealth;
  const changes = sourceChanges.map((workspace) => activeChange(workspace, actor)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.workspaceId.localeCompare(b.workspaceId));
  const terminal = ["Obsolete", "Merged"].includes(detail.root.recordStatus);
  const stage: RelationWorkbenchStage = terminal ? "history_only" : detail.root.recordStatus === "Released" ? "released" : "official_controlled";
  const manufacturing = detail.drawingNumbers.filter((drawing) => isManufacturingDrawingPurpose(drawing.purposeCode));
  const dependencyReleaseReady = manufacturing.length > 0 && manufacturing.every((drawing) => drawing.recordStatus === "Released") && detail.partNumbers.every((part) => part.recordStatus === "Released");
  const href = `/numbering/search?view=all${terminal ? "&history=include" : ""}&detail=${encodeURIComponent(`root:${detail.root.id}`)}`;
  const pair = roleStatusPair(rootStatus.humanStatus, actor, href);
  return {
    rowKey: `root:${detail.root.id}`, rowKind: "formal_root", sourceKind: "formal", rootId: detail.root.id, workspaceId: null,
    displayCode: detail.root.rootCode, displayName: detail.root.coreName, recordStatus: detail.root.recordStatus,
    relationshipHealth: health, relationshipLabel: relationshipHealthLabel(health), nextStep: nextStep(health, blockers),
    drawings: detail.drawingNumbers.map((drawing) => mapDrawing(drawing, linksByDrawing.get(drawing.id) ?? [], actor)),
    parts: detail.partNumbers.map((part) => mapPart(part, linksByPart.get(part.id) ?? [], drawingById, actor, partMasterDataGaps)),
    matrix: matrixFor(detail.partNumbers, detail.drawingNumbers, detail.links), blockers, activeChanges: changes,
    stage, stageLabel: stageLabels[stage], humanStatus: rootStatus.humanStatus,
    ...pair,
    availabilityScope: projectRelationRootAvailability({ recordStatus: projectEffectiveRelationRecordStatus(detail, health, blockers.length), relationshipHealth: health, blockerCount: blockers.length, dependencyReleaseReady }),
    primaryAction: { kind: terminal ? "view_history" : "view_root", label: changes.length > 0 ? `查看變更（${changes.length}）` : terminal ? "查看歷史" : "查看關係", enabled: true, disabledReason: null, href },
    warning: blockers.length > 0 ? { code: blockers[0].code, message: blockers[0].message } : null,
    terminal: terminal ? { kind: detail.root.recordStatus === "Merged" ? "merged" : "obsolete", reasonLabel: detail.root.recordStatus === "Merged" ? "此圖料根號已合併。" : "此圖料根號已作廢。", nextStepLabel: "請改用有效圖料根號；需要追溯時再查看歷史。" } : null,
    updatedAt: changes[0]?.updatedAt ?? ""
  };
}

function candidateRootRow(workspace: NumberingDraftWorkspaceRecord, actor: RelationWorkbenchActor): RelationWorkbenchRow {
  const change = activeChange(workspace, actor);
  const humanStatus = candidateStatus(change.stage);
  const recoveryAction: ResponsibilityActionEvidence | null = change.stage === "recovery_required"
    ? { kind: "retry_formalization", label: "重試正式化", enabled: actor.permissions.publish, disabledReason: actor.permissions.publish ? null : "目前沒有正式化恢復權限。", href: change.primaryAction?.href }
    : null;
  const responsibilityActions = [actionEvidenceFrom(change.primaryAction), recoveryAction]
    .filter((action): action is NonNullable<ReturnType<typeof actionEvidenceFrom>> => Boolean(action && action.kind !== "view_processing" && action.kind !== "review_change" && action.kind !== "view_history"));
  const pair = projectResponsibilityStatusPair({
    status: humanStatus,
    actorId: actor.id,
    ownerId: workspace.ownerId,
    ownerQueueEligible: actor.canEditNonOwned && responsibilityActions.some((action) => action.enabled),
    hasActiveReviewWorkItem: change.stage === "in_review" && workspace.latestApproval?.status === "pending",
    hasOwnerResponsibilityAction: !["in_review", "auto_finalizing", "recovery_required", "history_only"].includes(change.stage) && responsibilityActions.length > 0,
    hasSystemAdminRecoveryAction: change.stage === "recovery_required",
    systemFinalizing: change.stage === "auto_finalizing",
    reviewQueueEligible: change.stage === "in_review" && actor.permissions.candidateReview,
    systemAdminQueueEligible: change.stage === "recovery_required" && actor.permissions.publish,
    responsibilityActions
  });
  const blockers = candidateBlockers(workspace);
  const health = candidateHealth(workspace, blockers);
  const actionableBlockers = blockers.filter((blocker) => blocker.code !== "drawing_without_part");
  const relationshipComplete = actionableBlockers.length === 0;
  return {
    rowKey: change.rowKey, rowKind: "candidate_root", sourceKind: "candidate", rootId: null, workspaceId: workspace.id,
    displayCode: change.displayCode, displayName: change.displayName, recordStatus: null,
    relationshipHealth: health,
    relationshipLabel: relationshipComplete
      ? workspace.relations.length > 0 ? "關係已建立（尚未生效）" : "關係資料完整（尚未生效）"
      : relationshipHealthLabel(health),
    nextStep: relationshipComplete ? { label: change.stageLabel, severity: "info" } : nextStep(health, actionableBlockers),
    drawings: workspace.drawings.map((drawing, index) => mapCandidateDrawing(drawing, index, workspace, humanStatus, pair)),
    parts: workspace.parts.map((part, index) => mapCandidatePart(part, index, workspace, humanStatus, pair)),
    matrix: candidateMatrix(workspace), blockers, activeChanges: [change], stage: change.stage, stageLabel: change.stageLabel,
    humanStatus,
    ...pair,
    availabilityScope: projectDrawingAvailability({ stage: change.stage, usage: "not_for_formal_use", terminal: change.stage === "history_only" }),
    primaryAction: change.primaryAction,
    warning: change.stage === "recovery_required"
      ? { code: "candidate_recovery_required", message: "這筆工作需要處理後才能繼續。" }
      : actionableBlockers.length > 0 ? { code: actionableBlockers[0].code, message: actionableBlockers[0].message } : null,
    terminal: change.stage === "history_only" ? { kind: "cancelled", reasonLabel: "此工作已取消。", nextStepLabel: "如仍需要圖料關係，請建立新的工作。" } : null,
    updatedAt: workspace.updatedAt
  };
}

function rowInView(row: RelationWorkbenchRow, actor: RelationWorkbenchActor, view: RelationWorkbenchView) {
  if (view === "all") return true;
  if (view === "work") return row.rowKind === "candidate_root" || row.activeChanges.length > 0 || row.relationshipHealth !== "complete";
  return row.viewerActionability.isMine;
}

export class RelationWorkbenchService {
  private readonly repository: RelationWorkbenchAsyncRepository;
  constructor(client: AsyncDatabaseClient = getAsyncDatabaseClient()) { this.repository = new RelationWorkbenchAsyncRepository(client); }

  async list(query: NormalizedRelationQuery, actor: RelationWorkbenchActor): Promise<RelationWorkbenchListResponse> {
    const currentFilterHash = relationFilterHash(query, actor);
    const lanesEnabled = isPdmWorkbenchProductionRdLanesV1Enabled();
    const cursor = query.cursor ? decodePdmWorkbenchCursor(query.cursor, currentFilterHash, process.env, lanesEnabled ? 2 : 1) : null;
    const effectivePageIndex = cursor?.pageIndex ?? query.pageIndex;
    const page = await this.repository.readListPage<RelationWorkbenchRow>({
      companyId: actor.companyId, query: query.query, seriesCode: query.seriesCode, entityType: query.entityType,
      recordStatus: query.recordStatus, sortDirection: query.sortDirection, includeCandidates: actor.permissions.workspaceView && query.recordStatus.mode === "all",
      includeHistory: query.includeHistory,
      cursor: cursor ? { sortValue: cursor.sortValue ?? cursor.updatedAt, rowKey: cursor.rowKey, direction: cursor.direction ?? query.direction } : null, direction: cursor?.direction ?? query.direction, limit: lanesEnabled ? Math.min(100, query.limit * 2) : query.limit
    }, (workspaces, roots, partMasterDataGaps, rdRootIds = new Set<string>()) => {
      const visibleWorkspaces = workspaces.filter((workspace) => query.includeHistory || candidateStage(workspace) !== "history_only");
      const sourceChanges = new Map<string, NumberingDraftWorkspaceRecord[]>();
      for (const workspace of visibleWorkspaces) if (workspace.sourceRootId) sourceChanges.set(workspace.sourceRootId, [...(sourceChanges.get(workspace.sourceRootId) ?? []), workspace]);
      const baseRows = [
        ...roots.map((root) => formalRootRow(root, sourceChanges.get(root.root.id) ?? [], actor, partMasterDataGaps)),
        ...visibleWorkspaces.filter((workspace) => !workspace.sourceRootId).map((workspace) => candidateRootRow(workspace, actor))
      ].filter((row) => query.includeHistory || row.stage !== "history_only")
        .filter((row) => rowInView(row, actor, query.view))
        .filter((row) => responsibilityStatusMatchesSelection(row.responsibilityStatus, row.viewerActionability, row.humanStatus, query.humanStatus, row.availabilityScope));
      if (!lanesEnabled) return baseRows;
      const laneRows: RelationWorkbenchRow[] = [];
      for (const row of baseRows) {
        if (row.rowKind === "candidate_root") {
          if (!laneSelectionIncludes(query.lane, "rd")) continue;
          const rowKey = `${row.rowKey}:rd`;
          laneRows.push(withPdmWorkbenchLane({ ...row, rowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey, groupKey: `root:candidate:${row.workspaceId ?? row.rowKey}`, entityKey: row.workspaceId ?? row.rowKey, lane: "rd", referenceKind: "candidate_workspace", referenceId: row.workspaceId ?? row.rowKey, displayRevision: row.stageLabel, purposeLabel: "研發工作區" })));
          continue;
        }
        const groupKey = `root:${row.rootId}`;
        if (laneSelectionIncludes(query.lane, "production")) {
          const productionRowKey = `${row.rowKey}:production`;
          laneRows.push(withPdmWorkbenchLane({ ...row, rowKey: productionRowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey: productionRowKey, groupKey, entityKey: row.rootId ?? row.rowKey, lane: "production", referenceKind: "manufacturing_baseline", referenceId: row.rootId ?? row.rowKey, displayRevision: row.updatedAt, purposeLabel: "量產受控版", sourceCount: 1 })));
        }
        if (laneSelectionIncludes(query.lane, "rd") && row.activeChanges.length === 0 && row.rootId && rdRootIds.has(row.rootId)) {
          const rdRowKey = `${row.rowKey}:rd`;
          laneRows.push(withPdmWorkbenchLane({ ...row, rowKey: rdRowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey: rdRowKey, groupKey, entityKey: row.rootId, lane: "rd", referenceKind: "manufacturing_baseline", referenceId: row.rootId, displayRevision: row.updatedAt, purposeLabel: "研發變更版", sourceCount: 1 })));
        }
        if (laneSelectionIncludes(query.lane, "rd")) for (const change of row.activeChanges.slice(0, 1)) {
          const rowKey = `${row.rowKey}:rd`;
          laneRows.push(withPdmWorkbenchLane({ ...row, rowKey, sourceKind: "candidate", workspaceId: change.workspaceId, activeChanges: [change], stage: change.stage, stageLabel: change.stageLabel, updatedAt: change.updatedAt }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey, groupKey, entityKey: row.rootId ?? row.rowKey, lane: "rd", referenceKind: "active_change_set", referenceId: change.workspaceId, displayRevision: change.stageLabel, purposeLabel: "研發變更版", sourceCount: 1 })));
        }
      }
      return laneRows;
    });
    const rows = lanesEnabled ? groupPdmWorkbenchRows(page.rows, query.limit) : page.rows.slice(0, query.limit);
    const hasNext = lanesEnabled ? page.rows.some((row) => !rows.includes(row)) : page.rows.length > query.limit;
    const last = rows.at(-1);
    const first = rows.at(0);
    return {
      rows,
      nextCursor: hasNext && last ? encodePdmWorkbenchCursor({ version: lanesEnabled ? 2 : 1, filterHash: currentFilterHash, updatedAt: last.updatedAt, sortValue: last.displayCode, rowKey: last.rowKey, ...(lanesEnabled ? { groupKey: last.lane?.groupKey ?? last.rowKey } : {}), direction: "after", pageIndex: effectivePageIndex + 1 }) : null,
      previousCursor: effectivePageIndex > 0 && first ? encodePdmWorkbenchCursor({ version: lanesEnabled ? 2 : 1, filterHash: currentFilterHash, updatedAt: first.updatedAt, sortValue: first.displayCode, rowKey: first.rowKey, ...(lanesEnabled ? { groupKey: first.lane?.groupKey ?? first.rowKey } : {}), direction: "before", pageIndex: Math.max(0, effectivePageIndex - 1) }) : null,
      pageIndex: effectivePageIndex,
      generatedAt: new Date().toISOString(),
      filters: { seriesCodeOptions: page.seriesCodeOptions, entityTypeOptions: entityTypes.filter((value): value is Exclude<NumberingSearchEntityType, "all"> => value !== "all"), recordStatusOptions: [...recordStatuses] },
      ...(lanesEnabled ? { paginationUnit: "group" as const, groupLimit: query.limit, groupCount: new Set(rows.map((row) => row.lane?.groupKey ?? row.rowKey)).size } : {})
    };
  }

  async detail(rowKey: string, actor: RelationWorkbenchActor, options: { projectionToken?: string | null } = {}): Promise<RelationWorkbenchDetailResponse | null> {
    const lanesEnabled = isPdmWorkbenchProductionRdLanesV1Enabled();
    const requestedLane = lanesEnabled && rowKey.endsWith(":rd") ? "rd" : lanesEnabled && rowKey.endsWith(":production") ? "production" : null;
    if (requestedLane) rowKey = rowKey.slice(0, -(`:${requestedLane}`).length);
    if (rowKey.startsWith("candidate:")) {
      if (!actor.permissions.workspaceView) return null;
      const candidate = await this.repository.readCandidateDetail(rowKey.slice("candidate:".length), actor.companyId);
      if (!candidate) return null;
      let row = candidateRootRow(candidate, actor);
      if (requestedLane === "rd") {
        const laneRowKey = `${row.rowKey}:rd`;
        row = withPdmWorkbenchLane({ ...row, rowKey: laneRowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey: laneRowKey, groupKey: `root:candidate:${candidate.id}`, entityKey: candidate.id, lane: "rd", referenceKind: "candidate_workspace", referenceId: candidate.id, displayRevision: row.stageLabel, purposeLabel: "研發工作區" }));
        const fingerprint = pdmWorkbenchReferenceFingerprint({ referenceKind: "candidate_workspace", referenceId: candidate.id, revisionOrBaseline: row.stageLabel, contentHashOrSnapshotHash: null });
        verifyPdmWorkbenchProjectionToken(options.projectionToken, { companyId: actor.companyId, actorId: actor.id, rowKey: laneRowKey, lane: "rd", fingerprint });
      }
      return { row, rootDetail: null, candidate, focusedChange: activeChange(candidate, actor), capabilities: { canManageRelations: actor.permissions.manageRelations, canManagePermissions: actor.permissions.managePermissions } };
    }
    const result = rowKey.startsWith("root:")
      ? await this.repository.readRootDetail(rowKey.slice("root:".length), actor.companyId)
      : await this.repository.resolveRootByCode(rowKey, actor.companyId);
    if (!result) return null;
    let row = formalRootRow(result.root, actor.permissions.workspaceView ? result.workspaces : [], actor, result.partMasterDataGaps);
    if (requestedLane === "production") {
      const productionRowKey = `${row.rowKey}:production`;
      row = withPdmWorkbenchLane({ ...row, rowKey: productionRowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey: productionRowKey, groupKey: `root:${result.root.root.id}`, entityKey: result.root.root.id, lane: "production", referenceKind: "manufacturing_baseline", referenceId: result.root.root.id, displayRevision: row.updatedAt, purposeLabel: "量產受控版" }));
      const fingerprint = pdmWorkbenchReferenceFingerprint({ referenceKind: "manufacturing_baseline", referenceId: result.root.root.id, revisionOrBaseline: row.updatedAt, contentHashOrSnapshotHash: null });
      verifyPdmWorkbenchProjectionToken(options.projectionToken, { companyId: actor.companyId, actorId: actor.id, rowKey: row.rowKey, lane: "production", fingerprint });
    } else if (requestedLane === "rd") {
      const change = result.workspaces[0];
      const laneRowKey = `${row.rowKey}:rd`;
      if (change) {
        const changeStage = candidateStage(change);
        row = withPdmWorkbenchLane({ ...row, rowKey: laneRowKey, sourceKind: "candidate", workspaceId: change.id, activeChanges: [activeChange(change, actor)], stage: changeStage, stageLabel: stageLabels[changeStage], updatedAt: change.updatedAt }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey: laneRowKey, groupKey: `root:${result.root.root.id}`, entityKey: result.root.root.id, lane: "rd", referenceKind: "active_change_set", referenceId: change.id, displayRevision: stageLabels[changeStage], purposeLabel: "研發變更版" }));
        const fingerprint = pdmWorkbenchReferenceFingerprint({ referenceKind: "active_change_set", referenceId: change.id, revisionOrBaseline: changeStage, contentHashOrSnapshotHash: null });
        verifyPdmWorkbenchProjectionToken(options.projectionToken, { companyId: actor.companyId, actorId: actor.id, rowKey: laneRowKey, lane: "rd", fingerprint });
      } else {
        row = withPdmWorkbenchLane({ ...row, rowKey: laneRowKey }, makePdmWorkbenchLaneFields({ companyId: actor.companyId, actorId: actor.id, rowKey: laneRowKey, groupKey: `root:${result.root.root.id}`, entityKey: result.root.root.id, lane: "rd", referenceKind: "manufacturing_baseline", referenceId: result.root.root.id, displayRevision: row.updatedAt, purposeLabel: "研發變更版" }));
        const fingerprint = pdmWorkbenchReferenceFingerprint({ referenceKind: "manufacturing_baseline", referenceId: result.root.root.id, revisionOrBaseline: row.updatedAt, contentHashOrSnapshotHash: null });
        verifyPdmWorkbenchProjectionToken(options.projectionToken, { companyId: actor.companyId, actorId: actor.id, rowKey: laneRowKey, lane: "rd", fingerprint });
      }
    }
    return { row, rootDetail: projectRootDetail(result.root, actor, result.partMasterDataGaps), candidate: null, focusedChange: null, capabilities: { canManageRelations: actor.permissions.manageRelations, canManagePermissions: actor.permissions.managePermissions } };
  }
}

export function relationWorkbenchErrorResponse(error: unknown) {
  if (error instanceof PdmWorkbenchProjectionTokenError) return Response.json({ error: { code: error.code, message: error.message, retryable: false } }, { status: error.status });
  if (error instanceof PdmWorkbenchCursorError || error instanceof RelationWorkbenchError || error instanceof PdmWorkbenchFilterSelectionError) return Response.json({ error: { code: error.code, message: error.message, retryable: false } }, { status: error.status });
  console.error("Relation workbench read failed", error);
  return Response.json({ error: { code: "relation_workbench_read_failed", message: "圖料工作台目前無法載入，請重新整理。", retryable: true } }, { status: 500 });
}
