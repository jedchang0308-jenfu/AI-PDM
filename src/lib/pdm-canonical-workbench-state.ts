import type {
  CanonicalActionKey,
  CanonicalDataLayer,
  CanonicalHandling,
  CanonicalWorkbenchAction,
  CanonicalWorkbenchRowDto,
  WorkbenchEntityType
} from "@/lib/pdm-canonical-workbench-contract";
import {
  CANONICAL_HANDLING_LABELS,
  canonicalDataLayerToLayer,
  canonicalLayerLabel,
  canonicalRowKey
} from "@/lib/pdm-canonical-workbench-contract";

export type CanonicalWorkbenchStateRecord = {
  id: string;
  aggregateId: string;
  companyId: string;
  entityType: WorkbenchEntityType;
  canonicalEntityId: string;
  code: string;
  name: string;
  dataLayer: CanonicalDataLayer;
  branchId: string | null;
  revisionId: string | null;
  revision: string | null;
  workId: string | null;
  workOwnerId: string | null;
  reviewRequestId: string | null;
  reviewerUserId: string | null;
  handling: CanonicalHandling;
  blockerReason: string | null;
  rowVersion: number;
  openBranchCount: number;
  branchStatus: "open" | "historical" | null;
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
  };
};

function action(key: CanonicalActionKey, label: string, href?: string): CanonicalWorkbenchAction {
  return href ? { key, label, href } : { key, label };
}

export function resolveCanonicalWorkbenchActions(record: CanonicalWorkbenchStateRecord, actor: CanonicalWorkbenchActor) {
  const sameCompany = actor.companyId === record.companyId;
  if (!sameCompany || record.handling === "system" || record.handling === "system_admin" || record.handling === "blocked") return [];
  const mayEditWork = Boolean(
    record.workId && record.handling === "owner" && actor.permissions.updateWork &&
    (record.workOwnerId === actor.id || actor.canEditNonOwned)
  );
  const isReviewer = Boolean(
    record.handling === "review_owner" && record.reviewRequestId && record.reviewerUserId === actor.id && actor.permissions.decideReview
  );

  if (isReviewer) return [action("review", "前往審核", `/approvals/${encodeURIComponent(record.reviewRequestId!)}`)];
  if (mayEditWork) {
    if (record.entityType === "drawing") {
      return [action("edit", "進行編輯", `/numbering/drawings/${encodeURIComponent(record.canonicalEntityId)}/workspace?workId=${encodeURIComponent(record.workId!)}`)];
    }
    if (record.entityType === "part") {
      return [action("edit", "進行編輯", `/parts/${encodeURIComponent(record.canonicalEntityId)}/workspace?workId=${encodeURIComponent(record.workId!)}`)];
    }
    return [action("edit", "進行編輯", `/numbering/relations/${encodeURIComponent(record.canonicalEntityId)}/workspace?workId=${encodeURIComponent(record.workId!)}`)];
  }
  if (record.handling !== "none") return [];
  if (record.dataLayer === "drawing_production" && actor.permissions.createWork) {
    return record.openBranchCount >= 3 ? [] : [action("advance", "進版", `/api/pdm/drawings/${encodeURIComponent(record.canonicalEntityId)}/revision-targets?sourceRowKey=${encodeURIComponent(canonicalRowKey(record.id))}`)];
  }
  if (record.dataLayer === "drawing_rd" && actor.permissions.createWork && record.branchStatus === "open") {
    const actions = [action("advance", "進版", `/api/pdm/drawings/${encodeURIComponent(record.canonicalEntityId)}/revision-targets?sourceRowKey=${encodeURIComponent(canonicalRowKey(record.id))}`)];
    if (actor.permissions.obsoleteDrawing && !record.workId && record.branchId) actions.push(action("void_rd", "申請作廢", `/api/pdm/drawing-rd-branches/${encodeURIComponent(record.branchId)}/void-requests`));
    return actions;
  }
  if (record.dataLayer === "part_formal" && actor.permissions.createWork) return [action("create_change", "建立修改", `/api/pdm/parts/${encodeURIComponent(record.canonicalEntityId)}/change-works`)];
  if (record.dataLayer === "relation_formal" && actor.permissions.createWork) return [action("create_change", "建立調整", `/api/pdm/relations/${encodeURIComponent(record.canonicalEntityId)}/change-works`)];
  return [];
}

export function projectCanonicalWorkbenchRow(record: CanonicalWorkbenchStateRecord, actor: CanonicalWorkbenchActor): CanonicalWorkbenchRowDto {
  const blockerReason = record.handling === "blocked" ? record.blockerReason : null;
  const detailHref = record.entityType === "drawing"
    ? `/numbering/drawings?detail=${encodeURIComponent(canonicalRowKey(record.id))}`
    : record.entityType === "part"
      ? `/parts?detail=${encodeURIComponent(canonicalRowKey(record.id))}`
      : `/numbering/relations?detail=${encodeURIComponent(canonicalRowKey(record.id))}`;
  return {
    rowKey: canonicalRowKey(record.id),
    entityType: record.entityType,
    entityId: record.canonicalEntityId,
    code: record.code,
    name: record.name,
    layer: canonicalDataLayerToLayer(record.dataLayer),
    layerLabel: canonicalLayerLabel({ dataLayer: record.dataLayer, revision: record.revision }),
    revision: record.entityType === "drawing" ? record.revision : null,
    handling: record.handling,
    handlingLabel: CANONICAL_HANDLING_LABELS[record.handling],
    blockerReason,
    detailHref,
    rowVersion: record.rowVersion,
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
