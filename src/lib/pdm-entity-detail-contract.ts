import type { AvailabilityScopeProjection } from "@/lib/availability-scope";
import type { HumanStatusProjection, ViewerHumanStatusProjection } from "@/lib/human-status-projection";
import type { ResponsibilityStatusProjection, ViewerActionabilityProjection } from "@/lib/responsibility-status-projection";

export type PdmEntityKey = `candidate:${string}` | `drawing:${string}` | `part:${string}` | `root:${string}`;
export type PdmDetailSurface = "drawing" | "part" | "relation";
export type PdmProjectionLevel = "summary" | "full";
export type PdmDetailStateFamily =
  | "building" | "drawing_preparation" | "bundle_ready" | "in_review"
  | "auto_finalizing" | "correction_required" | "recovery_required"
  | "rd_controlled" | "released" | "history_only" | "terminal";

export type PdmProjectionEnvelope<Summary, Full> =
  | { level: "summary"; data: Summary }
  | { level: "full"; data: Full };

export type SharedIdentityStatusHeaderModel = {
  entityKind: "candidate" | "drawing" | "part" | "root";
  entityCode: string;
  displayName: string;
  humanStatus: HumanStatusProjection;
  responsibilityStatus: ResponsibilityStatusProjection;
  viewerActionability: ViewerActionabilityProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
  stateFamily: PdmDetailStateFamily;
  actorResponsibility: string;
  lockedByReview: boolean;
};

export type DrawingPreviewState = "queued" | "running" | "ready" | "delayed" | "failed" | "unavailable" | "missing";
export type DrawingPreviewSlotModel = {
  kind: "three-d" | "two-d";
  title: string;
  fileName: string | null;
  state: DrawingPreviewState;
  stateTitle: string;
  stateText: string;
  mediaHref: string | null;
  downloadHref: string | null;
  retryCommandRef: string | null;
};

export type DrawingProjectionSummary = {
  drawingId: string;
  rowKey: `drawing:${string}`;
  drawingNumber: string | null;
  displayName: string;
  purposeCode: string | null;
  purposeLabel: string | null;
  humanStatus: HumanStatusProjection;
  responsibilityStatus: ResponsibilityStatusProjection;
  viewerActionability: ViewerActionabilityProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
  linkedPartCount: number;
  representativePreview: Pick<DrawingPreviewSlotModel, "kind" | "state" | "stateTitle" | "stateText">;
};

export type DrawingMaintenanceTarget =
  | { kind: "candidate_revision"; workspaceId: string; drawingDraftId: string; candidateRevisionId: string; rowVersion: number; revision: string }
  | { kind: "candidate_revision_pending"; workspaceId: string; drawingDraftId: string; workspaceRowVersion: number }
  | { kind: "formal_drawing"; drawingNumber: string }
  | null;

export type DrawingProjectionFull = DrawingProjectionSummary & {
  stateFamily: PdmDetailStateFamily;
  maintenanceTarget: DrawingMaintenanceTarget;
  previews: [DrawingPreviewSlotModel, DrawingPreviewSlotModel];
  currentRevision: { revision: string | null; lifecycleState: string | null };
  revisionHistory: Array<{ revision: string; lifecycleState: string; updatedAt: string | null; fileCount: number }>;
  attachments: Array<{ id: string; displayName: string; role: string | null; href: string | null }>;
  readiness: { blockers: string[]; owner: string; nextStep: string | null };
  linkedParts: Array<{ id: string; partNumber: string; partName: string; recordStatus: string }>;
};

export type PartProjectionSummary = {
  partId: string;
  rowKey: `part:${string}`;
  partNumber: string;
  rootCode: string;
  displayName: string;
  itemKind: string;
  humanStatus: HumanStatusProjection;
  responsibilityStatus: ResponsibilityStatusProjection;
  viewerActionability: ViewerActionabilityProjection;
  viewerStatus: ViewerHumanStatusProjection;
  availabilityScope: AvailabilityScopeProjection;
  linkedDrawingCount: number;
  representativeDrawing: { id: string; drawingNumber: string } | null;
};

export type PartProjectionFull = PartProjectionSummary & {
  attributes: {
    customSpecification: string | null;
    seriesCode: string | null;
    materialLabel: string | null;
    colorLabel: string | null;
    surfaceTreatment: string | null;
    variantNote: string | null;
  };
  linkedDrawings: Array<{ id: string; drawingNumber: string; linkType: string }>;
  sharedModels: Array<{ id: string; label: string }>;
  readiness: { blockers: string[]; owner: string; nextStep: string | null };
};

export type RelationProjectionSummary = {
  rootId: string;
  rowKey: `root:${string}`;
  rootCode: string;
  relationshipHealth: string;
  counts: { drawings: number; parts: number; links: number; blockers: number };
  blockers: string[];
};

export type RelationProjectionFull = RelationProjectionSummary & {
  drawings: Array<{ id: string; drawingNumber: string; purposeCode: string; recordStatus: string }>;
  parts: Array<{ id: string; partNumber: string; partName: string; recordStatus: string }>;
  links: Array<{ id: string; drawingNumber: string; partNumber: string; linkType: string }>;
  matrix: Array<{ drawingNumber: string; partNumber: string; linkType: string }>;
};

export type ReviewContextProjectionFull = {
  requestId: string;
  source: "platform" | "legacy";
  status: string;
  actionCode: string;
  actionTitle: string;
  requestReason: string | null;
  requester: { id: string | null; label: string | null };
  eligibleReviewer: { assigned: boolean; actorResponsibility: string; canDecide: boolean };
  targetRefs: Array<{ type: string; id: string }>;
  targetAnchors: Array<{ id: string; label: string }>;
  decisionReady: boolean;
  allowedDecisions: Array<"approved" | "rejected" | "needs_info">;
  snapshot: { snapshotId: string | null; snapshotHash: string | null; currentAggregateHash: string | null; checkStatus: "一致" | "有差異" | "未提供"; checkedAt: string | null; drift: boolean; mismatchReason: string | null };
  drawingRevisionEvidence: {
    drawingNumber: string | null;
    revision: string | null;
    parts: Array<{
      id: string;
      number: string;
      name: string;
      linkType: string;
      formState: string;
      fitState: string;
      functionState: string;
      outcome: string;
    }>;
    fff: {
      formState: string;
      fitState: string;
      functionState: string;
      outcome: string;
      reasonCategory: string;
      note: string;
    };
    files: Array<{ id: string; displayName: string; role: string }>;
  } | null;
};

export type PdmDetailActionKind = "edit" | "submit_review" | "withdraw_review" | "cancel" | "approve" | "return_for_correction" | "reject" | "retry_apply" | "retry_cleanup" | "create_revision" | "view_review" | "manage_relation" | "view_history" | "refresh" | "return" | "manage_files";
export type PdmDetailActionGroup = "object" | "workflow" | "review" | "utility";
export type PdmDetailActionDisabledReasonCode =
  | "PDM_ACTION_PREREQUISITE_MISSING"
  | "PDM_ACTION_PERMISSION_REQUIRED"
  | "PDM_ACTION_OWNER_REQUIRED"
  | "PDM_ACTION_REVIEW_LOCKED"
  | "PDM_ACTION_REVIEW_SCOPE_REQUIRED"
  | "PDM_ACTION_REVIEW_DRIFT"
  | "PDM_ACTION_PROCESSING"
  | "PDM_ACTION_TARGET_UNAVAILABLE";
export type PdmDetailActionExecution =
  | { type: "navigate"; href: string }
  | {
      type: "command";
      method: "POST";
      href: string;
      body: Record<string, string | number | boolean | null>;
      input: "none" | "optional_reason" | "required_comment";
      success: "refresh_detail" | "return_to_inbox";
    }
  | { type: "local"; command: "refresh" | "return" };
export type PdmDetailActionDescriptor = {
  id: `detail:${"drawing" | "part" | "relation" | "approval" | "navigation"}:${string}`;
  kind: PdmDetailActionKind;
  owner: "drawing" | "part" | "relation" | "approval" | "navigation";
  label: string;
  tone: "primary" | "secondary" | "danger";
  placement: "primary" | "secondary";
  group: PdmDetailActionGroup;
  order: number;
  enabled: boolean;
  disabledReason: string | null;
  disabledReasonCode: PdmDetailActionDisabledReasonCode | null;
  permissionCode: string | null;
  contactRole: string | null;
  execution: PdmDetailActionExecution | null;
  requiresConfirmation: boolean;
  idempotencyRequired: boolean;
};

export type ContextActionBarModel = { primary: PdmDetailActionDescriptor | null; secondary: PdmDetailActionDescriptor[] };
export type PdmDetailNavigationModel = {
  ownerHref: string;
  returnTo: string;
  fallbackHref: string;
  targetAnchors: Array<{ id: string; label: string; projection: "drawing" | "part" | "relation" | "review" }>;
};

export type PdmEntityDetailResponse = {
  schemaVersion: "pdm-entity-detail.v2";
  entityKey: PdmEntityKey;
  surface: PdmDetailSurface;
  generatedAt: string;
  revisionToken: string;
  header: SharedIdentityStatusHeaderModel;
  projections: {
    drawing?: PdmProjectionEnvelope<DrawingProjectionSummary, DrawingProjectionFull>;
    part?: PdmProjectionEnvelope<PartProjectionSummary, PartProjectionFull>;
    relation?: PdmProjectionEnvelope<RelationProjectionSummary, RelationProjectionFull>;
    review?: PdmProjectionEnvelope<never, ReviewContextProjectionFull>;
  };
  actionBar: ContextActionBarModel;
  navigation: PdmDetailNavigationModel;
};

export type PdmEntityDetailErrorCode =
  | "PDM_ENTITY_KEY_INVALID"
  | "PDM_ENTITY_DETAIL_NOT_FOUND"
  | "PDM_ENTITY_DETAIL_SURFACE_INVALID"
  | "PDM_ENTITY_DETAIL_DISABLED"
  | "PDM_ENTITY_DETAIL_PROJECTION_FAILED"
  | "PDM_REVIEW_NOT_ACTIVE"
  | "PDM_REVIEW_NOT_ASSIGNED"
  | "PDM_REVIEW_AGGREGATE_AMBIGUOUS";
