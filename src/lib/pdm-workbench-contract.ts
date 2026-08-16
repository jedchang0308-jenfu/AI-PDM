import type { AvailabilityScopeProjection } from "@/lib/availability-scope";
import type { HumanStatusProjection, ViewerHumanStatusProjection } from "@/lib/human-status-projection";

export type PdmWorkbenchSourceKind = "candidate" | "formal";

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
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
  primaryAction: PdmWorkbenchAction<ActionKind> | null;
  terminal: PdmWorkbenchTerminalInfo | null;
};

export type PdmWorkbenchListResponse<Row, Filters> = {
  rows: Row[];
  nextCursor: string | null;
  previousCursor?: string | null;
  pageIndex?: number;
  generatedAt: string;
  filters: Filters;
};

export type PdmWorkbenchCursorPayload = {
  version: 1;
  filterHash: string;
  updatedAt: string;
  sortValue?: string;
  rowKey: string;
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
