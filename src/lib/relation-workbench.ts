import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { projectDrawingAvailability, projectDrawingRecordAvailability, projectPartAvailability, projectRelationRootAvailability } from "@/lib/availability-scope";
import { projectEffectiveRelationRecordStatus, projectNumberingRootStatus, relationshipHealthLabel } from "@/lib/drawing-part-relation-status";
import { projectDrawingRecordHumanStatus } from "@/lib/drawing-workbench-status";
import {
  createHumanStatus,
  isHumanStatusFilter,
  projectRoleViewerHumanStatus,
  projectViewerHumanStatus,
  viewerStatusMatchesFilter,
  type HumanStatusFilter,
  type HumanStatusRoleCapabilities,
  type HumanStatusProjection,
  type ViewerHumanStatusProjection
} from "@/lib/human-status-projection";
import { isManufacturingDrawingPurpose, isReferenceDrawingPurpose } from "@/lib/numbering-identity";
import { projectPartHumanStatus } from "@/lib/part-human-status";
import { decodePdmWorkbenchCursor, encodePdmWorkbenchCursor, pdmWorkbenchFilterHash, PdmWorkbenchCursorError } from "@/lib/pdm-workbench-cursor";
import type { PdmWorkbenchAction, PdmWorkbenchListResponse, PdmWorkbenchRowBase } from "@/lib/pdm-workbench-contract";
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
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: ReturnType<typeof projectPartAvailability>;
  linkedDrawingNumbers: string[];
  hasManufacturingDrawing: boolean;
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

export type ProjectedRelationRootDetail = NumberingRootDetailRecord & {
  humanStatus: HumanStatusProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: ReturnType<typeof projectRelationRootAvailability>;
  drawingNumbers: Array<DrawingNumberRecord & Pick<RelationDrawing, "humanStatus" | "viewerStatus" | "availabilityScope">>;
  partNumbers: Array<PartNumberRecord & Pick<RelationPart, "humanStatus" | "viewerStatus" | "availabilityScope">>;
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
  seriesCode: string;
  entityType: NumberingSearchEntityType;
  recordStatus: NumberingRecordStatus | "";
  humanStatus: HumanStatusFilter;
  includeHistory: boolean;
  cursor: string;
  limit: number;
};

const entityTypes = ["all", "part_root", "part_number", "drawing_number"] as const satisfies readonly NumberingSearchEntityType[];
const recordStatuses = ["Draft", "NeedInfo", "Active", "PendingReview", "Released", "Rejected", "Obsolete", "Merged", "PendingAdminConfirm", "MainDrawingInvalid"] as const satisfies readonly NumberingRecordStatus[];
const stageLabels: Record<RelationWorkbenchStage, string> = {
  building: "建立中", drawing_preparation: "首版準備", bundle_ready: "可送審", in_review: "審核中",
  auto_finalizing: "系統正式化中", recovery_required: "需要處理", correction_required: "需要修正",
  official_controlled: "研發受控", released: "已發布", history_only: "歷史紀錄"
};

function text(value: string | null, max: number) { return String(value ?? "").trim().slice(0, max); }

export function normalizeRelationWorkbenchQuery(url: URL): NormalizedRelationQuery {
  const rawView = text(url.searchParams.get("view"), 20);
  const view: RelationWorkbenchView = rawView === "mine" || rawView === "work" ? rawView : "all";
  const entityType = text(url.searchParams.get("entityType"), 30) || "all";
  if (!(entityTypes as readonly string[]).includes(entityType)) throw new RelationWorkbenchError("workbench_invalid_entity_type", "請重新選擇有效的資料類型。", 400);
  const recordStatus = text(url.searchParams.get("recordStatus"), 40);
  if (recordStatus && !(recordStatuses as readonly string[]).includes(recordStatus)) throw new RelationWorkbenchError("workbench_invalid_record_status", "請重新選擇有效的資料狀態。", 400);
  const humanStatus = text(url.searchParams.get("humanStatus"), 30) || "all";
  if (!isHumanStatusFilter(humanStatus)) throw new RelationWorkbenchError("workbench_invalid_human_status", "請重新選擇有效的工作狀態。", 400);
  const history = text(url.searchParams.get("history"), 20);
  if (history && history !== "include" && history !== "exclude") throw new RelationWorkbenchError("workbench_invalid_history", "請重新選擇有效的歷史資料範圍。", 400);
  const rawLimit = text(url.searchParams.get("limit"), 10) || "60";
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RelationWorkbenchError("workbench_invalid_limit", "每頁筆數必須介於 1 到 100。", 400);
  return {
    query: text(url.searchParams.get("query"), 200), view, seriesCode: text(url.searchParams.get("seriesCode"), 80),
    entityType: entityType as NumberingSearchEntityType, recordStatus: recordStatus as NumberingRecordStatus | "",
    humanStatus, includeHistory: history === "include", cursor: text(url.searchParams.get("cursor"), 2_000), limit
  };
}

function relationFilterHash(query: NormalizedRelationQuery, actor: RelationWorkbenchActor) {
  return pdmWorkbenchFilterHash({ namespace: "relation-v1", filters: {
    query: query.query.toLocaleLowerCase("zh-Hant"), view: query.view, seriesCode: query.seriesCode,
    entityType: query.entityType, recordStatus: query.recordStatus, humanStatus: query.humanStatus, includeHistory: query.includeHistory
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

function candidateAction(
  workspace: RelationChangeSource,
  stage: RelationWorkbenchStage,
  actor: RelationWorkbenchActor
): PdmWorkbenchAction<RelationWorkbenchActionKind> | null {
  const href = `/numbering/search?view=work${stage === "history_only" ? "&history=include" : ""}&detail=${encodeURIComponent(`candidate:${workspace.id}`)}`;
  const owner = workspace.ownerId === actor.id;
  const owned = (kind: RelationWorkbenchActionKind, label: string, allowed: boolean, permissionCode: string): PdmWorkbenchAction<RelationWorkbenchActionKind> => ({
    kind, label, enabled: owner && allowed,
    disabledReason: owner ? allowed ? null : `缺少權限（${permissionCode}），請聯絡研發主管或 PDM Admin。` : "這筆工作需由負責人處理。",
    href: owner && allowed ? href : null, permissionCode: owner && !allowed ? permissionCode : null,
    contactRole: owner ? "研發主管或 PDM Admin" : "工作負責人", adminHref: owner && !allowed && actor.permissions.managePermissions ? "/settings/workflow" : null
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
    displayCode: workspace.root?.candidateCode ?? drawingCodes[0] ?? partCodes[0] ?? "尚未產生候選號",
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
  if (detail.partNumbers.length === 0) blockers.push({ code: "missing_part", message: "這個主根號尚未建立料號，不能判定圖料關係。", target: "root", targetId: detail.root.id });
  if (manufacturing.length === 0) blockers.push({ code: "missing_manufacturing_drawing", message: "這個主根號還沒有製造圖類別，不能建立製造基準關聯。", target: "root", targetId: detail.root.id });
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

function mapDrawing(drawing: DrawingNumberRecord, links: NumberingLinkRecord[], actor: RelationWorkbenchActor): RelationDrawing {
  const humanStatus = projectDrawingRecordHumanStatus(drawing);
  const reference = isReferenceDrawingPurpose(drawing.purposeCode);
  return {
    id: drawing.id, drawingNumber: drawing.drawingNumber, purposeCode: drawing.purposeCode,
    purposeLabel: reference ? "參考圖" : "製造圖", purposeText: drawing.purposeCode,
    isManufacturing: isManufacturingDrawingPurpose(drawing.purposeCode), isReferenceOnly: reference,
    recordStatus: drawing.recordStatus, humanStatus, viewerStatus: projectRoleViewerHumanStatus(humanStatus, actor.viewerCapabilities),
    availabilityScope: projectDrawingRecordAvailability(drawing), linkedPartNumbers: links.map((link) => link.partNumber),
    nextStep: reference ? "參考圖不可作為製造基準" : links.length === 0 ? "未關聯料號" : "製造基準關聯待狀態確認"
  };
}

function mapPart(part: PartNumberRecord, links: NumberingLinkRecord[], drawingById: Map<string, DrawingNumberRecord>, actor: RelationWorkbenchActor): RelationPart {
  const primary = links.find((link) => link.linkType === "primary_manufacturing" && Boolean(drawingById.get(link.drawingNumberId) && isManufacturingDrawingPurpose(drawingById.get(link.drawingNumberId)!.purposeCode)));
  const primaryDrawing = primary ? drawingById.get(primary.drawingNumberId) : null;
  const humanStatus = projectPartHumanStatus({ recordStatus: part.recordStatus, itemKind: part.itemKind, primaryDrawingNumber: primaryDrawing?.drawingNumber ?? null, hasManufacturingDrawing: Boolean(primary) });
  return {
    id: part.id, partNumber: part.partNumber, partName: part.partName, itemKind: part.itemKind, recordStatus: part.recordStatus,
    humanStatus, viewerStatus: projectRoleViewerHumanStatus(humanStatus, actor.viewerCapabilities),
    availabilityScope: projectPartAvailability({ recordStatus: part.recordStatus, itemKind: part.itemKind, primaryDrawingNumber: primaryDrawing?.drawingNumber ?? null, primaryDrawingRecordStatus: primaryDrawing?.recordStatus ?? null, hasManufacturingDrawing: Boolean(primary) }),
    linkedDrawingNumbers: links.map((link) => link.drawingNumber), hasManufacturingDrawing: Boolean(primary)
  };
}

function projectRootDetail(detail: NumberingRootDetailRecord, actor: RelationWorkbenchActor): ProjectedRelationRootDetail {
  const status = projectNumberingRootStatus(detail);
  const drawingById = new Map(detail.drawingNumbers.map((drawing) => [drawing.id, drawing]));
  const linksByDrawing = groupLinks(detail.links, "drawingNumberId");
  const linksByPart = groupLinks(detail.links, "partNumberId");
  const blockers = blockersFor(detail);
  const manufacturing = detail.drawingNumbers.filter((drawing) => isManufacturingDrawingPurpose(drawing.purposeCode));
  const dependencyReleaseReady = manufacturing.length > 0 && manufacturing.every((drawing) => drawing.recordStatus === "Released") && detail.partNumbers.every((part) => part.recordStatus === "Released");
  const availabilityScope = projectRelationRootAvailability({ recordStatus: projectEffectiveRelationRecordStatus(detail, status.relationshipHealth, blockers.length), relationshipHealth: status.relationshipHealth, blockerCount: blockers.length, dependencyReleaseReady });
  return {
    ...detail,
    humanStatus: status.humanStatus,
    viewerStatus: projectRoleViewerHumanStatus(status.humanStatus, actor.viewerCapabilities),
    availabilityScope,
    drawingNumbers: detail.drawingNumbers.map((drawing) => {
      const projection = mapDrawing(drawing, linksByDrawing.get(drawing.id) ?? [], actor);
      return { ...drawing, humanStatus: projection.humanStatus, viewerStatus: projection.viewerStatus, availabilityScope: projection.availabilityScope };
    }),
    partNumbers: detail.partNumbers.map((part) => {
      const projection = mapPart(part, linksByPart.get(part.id) ?? [], drawingById, actor);
      return { ...part, humanStatus: projection.humanStatus, viewerStatus: projection.viewerStatus, availabilityScope: projection.availabilityScope };
    })
  };
}

function formalRootRow(detail: NumberingRootDetailRecord, sourceChanges: RelationChangeSource[], actor: RelationWorkbenchActor): RelationWorkbenchRow {
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
  return {
    rowKey: `root:${detail.root.id}`, rowKind: "formal_root", sourceKind: "formal", rootId: detail.root.id, workspaceId: null,
    displayCode: detail.root.rootCode, displayName: detail.root.coreName, recordStatus: detail.root.recordStatus,
    relationshipHealth: health, relationshipLabel: relationshipHealthLabel(health), nextStep: nextStep(health, blockers),
    drawings: detail.drawingNumbers.map((drawing) => mapDrawing(drawing, linksByDrawing.get(drawing.id) ?? [], actor)),
    parts: detail.partNumbers.map((part) => mapPart(part, linksByPart.get(part.id) ?? [], drawingById, actor)),
    matrix: matrixFor(detail.partNumbers, detail.drawingNumbers, detail.links), blockers, activeChanges: changes,
    stage, stageLabel: stageLabels[stage], humanStatus: rootStatus.humanStatus,
    viewerStatus: projectRoleViewerHumanStatus(rootStatus.humanStatus, actor.viewerCapabilities),
    availabilityScope: projectRelationRootAvailability({ recordStatus: projectEffectiveRelationRecordStatus(detail, health, blockers.length), relationshipHealth: health, blockerCount: blockers.length, dependencyReleaseReady }),
    primaryAction: { kind: terminal ? "view_history" : "view_root", label: changes.length > 0 ? `查看變更（${changes.length}）` : terminal ? "查看歷史" : "查看關係", enabled: true, disabledReason: null, href },
    warning: blockers.length > 0 ? { code: blockers[0].code, message: blockers[0].message } : null,
    terminal: terminal ? { kind: detail.root.recordStatus === "Merged" ? "merged" : "obsolete", reasonLabel: detail.root.recordStatus === "Merged" ? "此主根已合併。" : "此主根已作廢。", nextStepLabel: "請改用有效主根；需要追溯時再查看歷史。" } : null,
    updatedAt: changes[0]?.updatedAt ?? ""
  };
}

function candidateRootRow(workspace: NumberingDraftWorkspaceRecord, actor: RelationWorkbenchActor): RelationWorkbenchRow {
  const change = activeChange(workspace, actor);
  const humanStatus = candidateStatus(change.stage);
  const currentUser = workspace.ownerId === actor.id || (change.stage === "in_review" && actor.permissions.candidateReview);
  return {
    rowKey: change.rowKey, rowKind: "candidate_root", sourceKind: "candidate", rootId: null, workspaceId: workspace.id,
    displayCode: change.displayCode, displayName: change.displayName, recordStatus: null,
    relationshipHealth: "draft", relationshipLabel: "候選關係", nextStep: { label: change.stageLabel, severity: change.stage === "recovery_required" ? "blocked" : "info" },
    drawings: [], parts: [], matrix: [], blockers: [], activeChanges: [change], stage: change.stage, stageLabel: change.stageLabel,
    humanStatus,
    viewerStatus: projectViewerHumanStatus(humanStatus, { responsibility: change.stage === "auto_finalizing" ? "system" : currentUser ? "current_user" : "other_user", basis: change.stage === "in_review" ? "role_capability" : change.stage === "auto_finalizing" ? "system" : "assignee", canAct: currentUser && Boolean(change.primaryAction?.enabled), actorLabel: change.stage === "auto_finalizing" ? "系統正在建立正式資料" : currentUser ? "這筆工作需要你處理" : "等待負責人處理", nextStep: change.primaryAction?.label ?? null }),
    availabilityScope: projectDrawingAvailability({ stage: change.stage, usage: "not_for_formal_use", terminal: change.stage === "history_only" }),
    primaryAction: change.primaryAction, warning: change.stage === "recovery_required" ? { code: "candidate_recovery_required", message: "這筆工作需要處理後才能繼續。" } : null,
    terminal: change.stage === "history_only" ? { kind: "cancelled", reasonLabel: "此候選工作已取消。", nextStepLabel: "如仍需要圖料關係，請建立新的工作。" } : null,
    updatedAt: workspace.updatedAt
  };
}

function rowInView(row: RelationWorkbenchRow, actor: RelationWorkbenchActor, view: RelationWorkbenchView) {
  if (view === "all") return true;
  if (view === "work") return row.rowKind === "candidate_root" || row.activeChanges.length > 0 || row.relationshipHealth !== "complete";
  if (row.rowKind === "candidate_root") return row.activeChanges.some((change) => change.ownerId === actor.id || (change.stage === "in_review" && actor.permissions.candidateReview));
  return row.activeChanges.some((change) => change.ownerId === actor.id || (change.stage === "in_review" && actor.permissions.candidateReview)) || row.viewerStatus.category === "current_user";
}

export class RelationWorkbenchService {
  private readonly repository: RelationWorkbenchAsyncRepository;
  constructor(client: AsyncDatabaseClient = getAsyncDatabaseClient()) { this.repository = new RelationWorkbenchAsyncRepository(client); }

  async list(query: NormalizedRelationQuery, actor: RelationWorkbenchActor): Promise<RelationWorkbenchListResponse> {
    const currentFilterHash = relationFilterHash(query, actor);
    const cursor = query.cursor ? decodePdmWorkbenchCursor(query.cursor, currentFilterHash) : null;
    const page = await this.repository.readListPage({
      companyId: actor.companyId, query: query.query, seriesCode: query.seriesCode, entityType: query.entityType,
      recordStatus: query.recordStatus, includeCandidates: actor.permissions.workspaceView && !query.recordStatus,
      cursor: cursor ? { updatedAt: cursor.updatedAt, rowKey: cursor.rowKey } : null, limit: query.limit
    }, (workspaces, roots) => {
      const sourceChanges = new Map<string, NumberingDraftWorkspaceRecord[]>();
      for (const workspace of workspaces) if (workspace.sourceRootId) sourceChanges.set(workspace.sourceRootId, [...(sourceChanges.get(workspace.sourceRootId) ?? []), workspace]);
      return [
        ...roots.map((root) => formalRootRow(root, sourceChanges.get(root.root.id) ?? [], actor)),
        ...workspaces.filter((workspace) => !workspace.sourceRootId).map((workspace) => candidateRootRow(workspace, actor))
      ].filter((row) => query.includeHistory || row.stage !== "history_only")
        .filter((row) => rowInView(row, actor, query.view))
        .filter((row) => viewerStatusMatchesFilter(row.viewerStatus, row.humanStatus, query.humanStatus, row.availabilityScope));
    });
    const hasNext = page.rows.length > query.limit;
    const rows = page.rows.slice(0, query.limit);
    const last = rows.at(-1);
    return {
      rows,
      nextCursor: hasNext && last ? encodePdmWorkbenchCursor({ version: 1, filterHash: currentFilterHash, updatedAt: last.updatedAt, rowKey: last.rowKey }) : null,
      generatedAt: new Date().toISOString(),
      filters: { seriesCodeOptions: page.seriesCodeOptions, entityTypeOptions: [...entityTypes], recordStatusOptions: [...recordStatuses] }
    };
  }

  async detail(rowKey: string, actor: RelationWorkbenchActor): Promise<RelationWorkbenchDetailResponse | null> {
    if (rowKey.startsWith("candidate:")) {
      if (!actor.permissions.workspaceView) return null;
      const candidate = await this.repository.readCandidateDetail(rowKey.slice("candidate:".length), actor.companyId);
      if (!candidate) return null;
      return { row: candidateRootRow(candidate, actor), rootDetail: null, candidate, focusedChange: activeChange(candidate, actor), capabilities: { canManageRelations: actor.permissions.manageRelations, canManagePermissions: actor.permissions.managePermissions } };
    }
    const result = rowKey.startsWith("root:")
      ? await this.repository.readRootDetail(rowKey.slice("root:".length), actor.companyId)
      : await this.repository.resolveRootByCode(rowKey, actor.companyId);
    if (!result) return null;
    const row = formalRootRow(result.root, actor.permissions.workspaceView ? result.workspaces : [], actor);
    return { row, rootDetail: projectRootDetail(result.root, actor), candidate: null, focusedChange: null, capabilities: { canManageRelations: actor.permissions.manageRelations, canManagePermissions: actor.permissions.managePermissions } };
  }
}

export function relationWorkbenchErrorResponse(error: unknown) {
  if (error instanceof PdmWorkbenchCursorError || error instanceof RelationWorkbenchError) return Response.json({ error: { code: error.code, message: error.message, retryable: false } }, { status: error.status });
  console.error("Relation workbench read failed", error);
  return Response.json({ error: { code: "relation_workbench_read_failed", message: "圖料工作台目前無法載入，請重新整理。", retryable: true } }, { status: 500 });
}
