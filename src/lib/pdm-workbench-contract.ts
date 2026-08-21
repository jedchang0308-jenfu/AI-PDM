import type { AvailabilityScopeProjection } from "@/lib/availability-scope";
import type { HumanStatusProjection, ViewerHumanStatusProjection } from "@/lib/human-status-projection";
import type { ResponsibilityStatusProjection, ViewerActionabilityProjection } from "@/lib/responsibility-status-projection";

export type PdmWorkbenchSourceKind = "candidate" | "formal";

/** The two business projections that may coexist for one canonical group. */
export type PdmWorkbenchLane = "production" | "rd";

export type PdmWorkbenchReferenceKind =
  | "drawing_revision_package"
  | "manufacturing_baseline"
  | "legacy_released_basis"
  | "candidate_workspace"
  | "active_change_set";

export type PdmWorkbenchLaneReference = {
  kind: PdmWorkbenchReferenceKind;
  displayRevision: string | null;
  purposeLabel: string;
  sourceCount: number;
  conflict: boolean;
  projectionToken: string;
};

export type PdmWorkbenchLaneFields = {
  groupKey: string;
  entityKey: string;
  lane: PdmWorkbenchLane;
  laneLabel: "量產最新版" | "研發最新版";
  reference: PdmWorkbenchLaneReference;
};

export type PdmWorkbenchFilterSelection<T extends string = string> =
  | { mode: "all" }
  | { mode: "none" }
  | { mode: "some"; values: readonly T[] };

export type PdmWorkbenchPreviewState = "ready" | "pending" | "delayed" | "missing" | "failed" | "unavailable";

export type PdmWorkbenchPreviewSummary = {
  state: PdmWorkbenchPreviewState;
  href: string | null;
  sourceKind: "drawing_latest_3d" | "root_representative_latest_3d";
  sourceDrawingNumber: string | null;
  sourceRevision: string | null;
  alt: string;
};

export type PdmWorkbenchAction<ActionKind extends string = string> = {
  kind: ActionKind;
  label: string;
  enabled: boolean;
  disabledReason: string | null;
  href: string | null;
  permissionCode?: string | null;
  contactRole?: string | null;
  adminHref?: string | null;
};

export type PdmWorkbenchPermissionRequirement = {
  permissionCode: string;
  label: string;
  contactRole: string;
  adminHref: string | null;
};

export type PdmWorkbenchTerminalInfo = {
  kind: "cancelled" | "obsolete" | "merged";
  reasonLabel: string;
  nextStepLabel: string;
};

export type PdmWorkbenchRowBase<
  RowKind extends string,
  ActionKind extends string = string
> = {
  rowKey: string;
  rowKind: RowKind;
  sourceKind: PdmWorkbenchSourceKind;
  displayCode: string;
  displayName: string;
  updatedAt: string;
  humanStatus: HumanStatusProjection;
  responsibilityStatus: ResponsibilityStatusProjection;
  viewerActionability: ViewerActionabilityProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
  primaryAction: PdmWorkbenchAction<ActionKind> | null;
  terminal: PdmWorkbenchTerminalInfo | null;
  /** Present when the production/R&D dual-lane projection is enabled. */
  lane?: PdmWorkbenchLaneFields;
};

export type PdmWorkbenchListResponse<Row, Filters> = {
  rows: Row[];
  nextCursor: string | null;
  previousCursor?: string | null;
  pageIndex?: number;
  generatedAt: string;
  filters: Filters;
  paginationUnit?: "row" | "group";
  groupLimit?: number;
  groupCount?: number;
};

export type PdmWorkbenchCursorPayload = {
  version: 1 | 2;
  filterHash: string;
  updatedAt: string;
  sortValue?: string;
  rowKey: string;
  groupKey?: string;
  direction?: "after" | "before";
  pageIndex?: number;
};

export type PdmWorkbenchErrorEnvelope = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    permissionCode?: string | null;
    contactRole?: string | null;
    adminHref?: string | null;
  };
};
