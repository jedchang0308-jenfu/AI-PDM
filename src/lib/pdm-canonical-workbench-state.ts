import type {
  CanonicalActionKey,
  CanonicalDataState,
  HistoricalCanonicalDataLayer,
  CanonicalHandling,
  CanonicalWorkbenchAction,
  CanonicalWorkbenchRowDto,
  HistoricalWorkbenchEntityType
} from "@/lib/pdm-canonical-workbench-contract";
import type { DrawingRevisionBasisState } from "@/lib/drawing-revision-lifecycle-policy";
import {
  CANONICAL_DATA_STATE_LABELS,
  CANONICAL_HANDLING_LABELS,
  canonicalDataLayerToLayer,
  canonicalLayerLabel,
  canonicalRowKey
} from "@/lib/pdm-canonical-workbench-contract";

export type CanonicalWorkbenchStateRecord = {
  id: string;
  aggregateId: string;
  companyId: string;
  entityType: HistoricalWorkbenchEntityType;
  canonicalEntityId: string;
  code: string;
  name: string;
  dataLayer: HistoricalCanonicalDataLayer;
  branchId: string | null;
  revisionId: string | null;
  revision: string | null;
  dataState: CanonicalDataState;
  workId: string | null;
  workOwnerId: string | null;
  reviewRequestId: string | null;
  reviewerUserId: string | null;
  handling: CanonicalHandling;
  blockerReason: string | null;
  rowVersion: number;
  openBranchCount: number;
  branchStatus: "open" | "historical" | null;
  baseProductionRevisionId: string | null;
  currentProductionRevisionId: string | null;
  currentProductionRowId: string | null;
  basisState: DrawingRevisionBasisState | null;
  updatedAt: string;
};

export type CanonicalWorkbenchActor = {
  id: string;
  companyId: string;
  canEditNonOwned: boolean;
  permissions: {
    createWork: boolean;
    updateWork: boolean;
    submitWork: boolean;
    cancelWork: boolean;
    decideReview: boolean;
    obsoleteDrawing: boolean;
    obsoleteFormal?: boolean;
    manageAttachments?: boolean;
  };
};

function action(key: CanonicalActionKey, label: string, href?: string): CanonicalWorkbenchAction {
  return href ? { key, label, href } : { key, label };
}

export function resolveCanonicalWorkbenchActions(record: CanonicalWorkbenchStateRecord, actor: CanonicalWorkbenchActor) {
  if (record.entityType === "relation") return [];
  const sameCompany = actor.companyId === record.companyId;
  if (!sameCompany || record.handling === "system" || record.handling === "system_admin" || record.handling === "blocked") return [];
  const mayEditWork = Boolean(
    record.workId && record.handling === "owner" && actor.permissions.updateWork &&
    (record.workOwnerId === actor.id || actor.canEditNonOwned)
  );
  const isReviewer = Boolean(
    record.handling === "review_owner" && record.reviewRequestId && record.reviewerUserId === actor.id && actor.permissions.decideReview
  );
  const matrixEdit = actor.permissions.updateWork
    ? action("edit_relation_matrix", "編輯關聯矩陣")
    : null;

  if (isReviewer) return [action("review", "前往審核", `/approvals/${encodeURIComponent(record.reviewRequestId!)}`), ...(matrixEdit ? [matrixEdit] : [])];
  if (mayEditWork) {
    if (record.entityType === "drawing") {
      return [action("edit", "進行編輯", `/numbering/drawings/${encodeURIComponent(record.canonicalEntityId)}/workspace?workId=${encodeURIComponent(record.workId!)}`), ...(matrixEdit ? [matrixEdit] : [])];
    }
    if (record.entityType === "part") {
      return [action("edit", "進行編輯", `/parts/${encodeURIComponent(record.canonicalEntityId)}/workspace?workId=${encodeURIComponent(record.workId!)}`), ...(matrixEdit ? [matrixEdit] : [])];
    }
    return [];
  }
  if (record.handling !== "none") return [];
  if (record.dataLayer === "drawing_production" && actor.permissions.createWork) {
    const actions = record.openBranchCount >= 3
      ? []
      : [action("advance", "進版", `/api/pdm/drawings/${encodeURIComponent(record.canonicalEntityId)}/revision-targets?sourceRowKey=${encodeURIComponent(canonicalRowKey(record.id))}`)];
    if (actor.permissions.obsoleteFormal && !record.workId) actions.push(action("request_obsolete", "申請作廢"));
    return [...actions, ...(matrixEdit ? [matrixEdit] : [])];
  }
  if (record.dataLayer === "drawing_rd" && actor.permissions.createWork && record.branchStatus === "open") {
    const targetsHref = `/api/pdm/drawings/${encodeURIComponent(record.canonicalEntityId)}/revision-targets?sourceRowKey=${encodeURIComponent(canonicalRowKey(record.id))}`;
    const actions = record.basisState === "stale"
      ? (record.currentProductionRowId ? [action("restart_from_current_production", "從目前量產版建立新工作", `/api/pdm/drawings/${encodeURIComponent(record.canonicalEntityId)}/revision-targets?sourceRowKey=${encodeURIComponent(canonicalRowKey(record.currentProductionRowId))}`)] : [])
      : [action("advance", "進版", targetsHref)];
    if (actor.permissions.obsoleteDrawing && !record.workId && record.branchId) actions.push(action("void_rd", "申請作廢", `/api/pdm/drawing-rd-branches/${encodeURIComponent(record.branchId)}/void-requests`));
    return [...actions, ...(matrixEdit ? [matrixEdit] : [])];
  }
  if (record.dataLayer === "part_formal" && actor.permissions.createWork) {
    const actions = [action("create_change", "建立修改", `/api/pdm/parts/${encodeURIComponent(record.canonicalEntityId)}/change-works`)];
    if (actor.permissions.obsoleteFormal && !record.workId) actions.push(action("request_obsolete", "申請作廢"));
    return [...actions, ...(matrixEdit ? [matrixEdit] : [])];
  }
  return [];
}

export function projectCanonicalWorkbenchRow(record: CanonicalWorkbenchStateRecord, actor: CanonicalWorkbenchActor): CanonicalWorkbenchRowDto {
  if (record.entityType === "relation") throw new Error("DEV090_HISTORICAL_RELATION_NOT_PROJECTABLE");
  const blockerReason = record.handling === "blocked" ? record.blockerReason : null;
  const detailHref = record.entityType === "drawing"
    ? `/numbering/drawings?detail=${encodeURIComponent(canonicalRowKey(record.id))}`
    : `/parts?detail=${encodeURIComponent(canonicalRowKey(record.id))}`;
  return {
    rowKey: canonicalRowKey(record.id),
    entityType: record.entityType,
    entityId: record.canonicalEntityId,
    code: record.code,
    name: record.name,
    layer: canonicalDataLayerToLayer(record.dataLayer),
    layerLabel: canonicalLayerLabel({ dataLayer: record.dataLayer, revision: record.revision }),
    revision: record.entityType === "drawing" ? record.revision : null,
    dataState: record.dataState,
    dataStateLabel: CANONICAL_DATA_STATE_LABELS[record.dataState],
    handling: record.handling,
    handlingLabel: CANONICAL_HANDLING_LABELS[record.handling],
    blockerReason,
    detailHref,
    rowVersion: record.rowVersion,
    basisState: record.entityType === "drawing" ? record.basisState : null,
    actions: resolveCanonicalWorkbenchActions(record, actor)
  };
}

const handlingOrder: Record<CanonicalHandling, number> = {
  owner: 0,
  review_owner: 1,
  system: 2,
  system_admin: 3,
  blocked: 4,
  none: 5
};

export function sortCanonicalGroupRows(rows: CanonicalWorkbenchStateRecord[]) {
  return [...rows].sort((left, right) => {
    if (left.dataLayer === "drawing_production" && right.dataLayer !== "drawing_production") return -1;
    if (right.dataLayer === "drawing_production" && left.dataLayer !== "drawing_production") return 1;
    return handlingOrder[left.handling] - handlingOrder[right.handling]
      || left.updatedAt.localeCompare(right.updatedAt)
      || left.id.localeCompare(right.id);
  });
}
