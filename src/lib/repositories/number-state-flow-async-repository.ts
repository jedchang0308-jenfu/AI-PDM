import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { canonicalJsonStringify } from "@/lib/canonical-json";
import {
  NUMBERING_RULE_V3_ID,
  assertPurposeAllowedForRule,
  formatDrawingNumberForRule,
  formatDrawingSequenceForRule,
  formatPartNumberForRule,
  formatPartSequenceForRule,
  formatRootCodeForRule,
  rootCodeToV3Ordinal
} from "@/lib/numbering-identity";
import {
  DatabasePublicationEvidencePort,
  type PublicationEvidenceResult
} from "@/lib/publication-evidence";
import { isNumberLifecycleV2Enabled } from "@/lib/number-state-flow-feature";
import {
  projectNumberLifecycleV2,
  type CandidateRevisionLifecycleStatus,
  type NumberLifecycleProjectionV2,
  type NumberingCandidateRevisionFileRecord,
  type NumberingCandidateRevisionRecord
} from "@/lib/number-lifecycle-simplification";
import { UnifiedDrawingAsyncRepository } from "@/lib/repositories/unified-drawing-async-repository";

export const MAX_CANDIDATE_ALLOCATION_ATTEMPTS = 3;

export type NumberingDraftMode = "new_bundle" | "append_drawing" | "append_part" | "append_drawing_part";
export type NumberingDraftLifecycle = "active" | "cancelled" | "published";
export type NumberingDraftItemKind = "purchased" | "manufactured" | "outsourced" | "shared" | "custom";
export type NumberCandidateItemType = "root" | "part" | "drawing";
export type NumberCandidateState = "active" | "review_locked" | "approved_locked" | "promoted" | "recycled";
export type NumberingDraftPurposeCode = "MA" | "OT" | "M" | "R";
export type NumberingSourceLinkType = "primary_manufacturing" | "reference";

function isManufacturingPurpose(value: NumberingDraftPurposeCode) {
  return value === "M" || value === "MA";
}

type WorkspaceRow = {
  id: string;
  company_id: string;
  draft_mode: NumberingDraftMode;
  lifecycle_status: NumberingDraftLifecycle;
  owner_id: string;
  created_by: string;
  source_root_id: string | null;
  source_drawing_number_id: string | null;
  source_part_number_id: string | null;
  source_link_type: NumberingSourceLinkType | null;
  append_reason: string | null;
  row_version: number;
  published_at: string | null;
  published_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

type RootRow = {
  id: string;
  company_id: string;
  workspace_id: string;
  core_name: string;
  item_kind: NumberingDraftItemKind;
  rule_version_id: string;
  candidate_reservation_id: string | null;
  candidate_code?: string | null;
};

type PartRow = {
  id: string;
  company_id: string;
  workspace_id: string;
  root_draft_id: string | null;
  source_root_id: string | null;
  part_name: string;
  item_kind: NumberingDraftItemKind;
  is_universal: number;
  universal_reason: string | null;
  custom_specification: string | null;
  series_code: string | null;
  candidate_reservation_id: string | null;
  candidate_code?: string | null;
};

type DrawingRow = {
  id: string;
  company_id: string;
  workspace_id: string;
  root_draft_id: string | null;
  source_root_id: string | null;
  purpose_code: NumberingDraftPurposeCode;
  purpose_description: string;
  is_primary_manufacturing: number;
  candidate_reservation_id: string | null;
  candidate_code?: string | null;
};

type RelationRow = {
  id: string;
  company_id: string;
  workspace_id: string;
  drawing_draft_id: string;
  part_draft_id: string;
  link_type: "primary_manufacturing" | "reference";
  is_primary: number;
};

type ReservationRow = {
  id: string;
  company_id: string;
  workspace_id: string;
  draft_item_type: NumberCandidateItemType;
  draft_item_id: string;
  candidate_code: string;
  sequence_scope_key: string;
  sequence_no: number;
  reservation_state: NumberCandidateState;
  row_version: number;
  approval_request_id: string | null;
  promoted_master_type: string | null;
  promoted_master_id: string | null;
  promoted_at: string | null;
  recycled_at: string | null;
  recycled_by: string | null;
  recycle_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type CandidateApprovalRow = {
  id: string;
  company_id: string;
  request_status: "pending" | "approved" | "rejected" | "needs_info" | "cancelled" | "apply_failed" | "applied";
  requested_by: string;
  requested_at: string;
  resolved_by: string | null;
  resolved_at: string | null;
  apply_status: "not_ready" | "not_required" | "pending" | "applied" | "failed";
  apply_attempts: number;
  apply_error: string | null;
  payload_json: string | Record<string, unknown>;
};

type CandidateRevisionRow = {
  id: string;
  company_id: string;
  workspace_id: string;
  drawing_draft_id: string;
  candidate_reservation_id: string;
  revision: string;
  workflow_intent: "rd_workspace";
  policy_snapshot_json: string | Record<string, unknown>;
  override_reason: string | null;
  lifecycle_status: CandidateRevisionLifecycleStatus;
  row_version: number | string;
  approval_request_id: string | null;
  review_snapshot_hash: string | null;
  legacy_baseline_request_id: string | null;
  legacy_baseline_snapshot_hash: string | null;
  formal_drawing_number_id: string | null;
  formal_revision_package_id: string | null;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
  promoted_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
};

type CandidateRevisionFileRow = {
  id: string;
  candidate_revision_id: string;
  source_file_asset_id: string;
  publication_evidence_id: string | null;
  role: NumberingCandidateRevisionFileRecord["role"];
  role_source: NumberingCandidateRevisionFileRecord["roleSource"];
  display_name: string;
  description: string;
  sort_order: number | string;
  is_primary: number | string | boolean;
  removed_at: string | null;
  removed_by: string | null;
};

type ReviewApprovalCompanionRow = {
  package_id: string;
  candidate_revision_id: string;
  snapshot_hash: string;
  package_status: string;
};

export type NumberingCandidateApprovalRecord = {
  requestId: string;
  status: CandidateApprovalRow["request_status"];
  requestedBy: string;
  requestedAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  applyStatus: CandidateApprovalRow["apply_status"];
  applyAttempts: number;
  applyError: string | null;
  snapshotHash: string | null;
};

export class NumberStateApprovalApplyFault extends Error {
  constructor(public readonly faultPoint: string) {
    super(`NUMBER_STATE_APPROVAL_APPLY_FAULT:${faultPoint}`);
    this.name = "NumberStateApprovalApplyFault";
  }
}

type SourceRootRow = {
  id: string;
  company_id: string;
  root_code: string;
  core_name: string;
  item_kind: NumberingDraftItemKind;
  record_status: string;
  rule_version_id: string;
};

type SourceDrawingRow = {
  id: string;
  company_id: string;
  part_root_id: string;
  purpose_code: NumberingDraftPurposeCode;
  record_status: string;
};

type SourcePartRow = {
  id: string;
  company_id: string;
  part_root_id: string;
  record_status: string;
};

export type NumberStateProjection = {
  numberQualification: "unnumbered" | "candidate" | "official" | "legacy_official_reservation";
  lifecycle: "draft" | "cancelled" | "published" | "obsolete";
  review: "not_submitted" | "in_review" | "needs_info" | "rejected" | "approved";
  publication: "not_ready" | "ready" | "publishing" | "failed" | "published";
  readiness: "incomplete" | "ready" | "stale" | "not_applicable";
  usage: "not_for_formal_use" | "formal_use_allowed" | "historical_only";
  nowWhat: {
    label: string;
    href: string | null;
    ownerRole: string;
    blockedReason: string | null;
  };
};

export type NumberCandidateReservationRecord = {
  id: string;
  itemType: NumberCandidateItemType;
  itemId: string;
  candidateCode: string;
  sequenceScopeKey: string;
  sequenceNo: number;
  state: NumberCandidateState;
  rowVersion: number;
};

export type NumberingDraftWorkspaceRecord = {
  id: string;
  companyId: string;
  draftMode: NumberingDraftMode;
  lifecycleStatus: NumberingDraftLifecycle;
  ownerId: string;
  createdBy: string;
  sourceRootId: string | null;
  sourceDrawingNumberId: string | null;
  sourcePartNumberId: string | null;
  sourceLinkType: NumberingSourceLinkType | null;
  appendReason: string | null;
  rowVersion: number;
  publishedAt: string | null;
  publishedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  root: null | {
    id: string;
    coreName: string;
    itemKind: NumberingDraftItemKind;
    ruleVersionId: string;
    candidateReservationId: string | null;
    candidateCode: string | null;
  };
  parts: Array<{
    id: string;
    rootDraftId: string | null;
    sourceRootId: string | null;
    partName: string;
    itemKind: NumberingDraftItemKind;
    isUniversal: boolean;
    universalReason: string | null;
    customSpecification: string | null;
    seriesCode: string | null;
    candidateReservationId: string | null;
    candidateCode: string | null;
  }>;
  drawings: Array<{
    id: string;
    rootDraftId: string | null;
    sourceRootId: string | null;
    purposeCode: NumberingDraftPurposeCode;
    purposeDescription: string;
    isPrimaryManufacturing: boolean;
    candidateReservationId: string | null;
    candidateCode: string | null;
  }>;
  relations: Array<{
    id: string;
    drawingDraftId: string;
    partDraftId: string;
    linkType: "primary_manufacturing" | "reference";
    isPrimary: boolean;
  }>;
  reservations: NumberCandidateReservationRecord[];
  latestApproval: NumberingCandidateApprovalRecord | null;
  projection: NumberStateProjection;
  lifecycleV2: NumberLifecycleProjectionV2 | null;
  candidateRevisions: NumberingCandidateRevisionRecord[];
  capabilities: {
    canUpdate: boolean;
    canAcquireCandidates: boolean;
    canCancel: boolean;
    canSubmitReview: boolean;
    canWithdrawReview: boolean;
    canPublish: boolean;
    publishBlockedReason: string | null;
  };
  references: Array<{ type: string; id: string; label: string }>;
};

export type CreateNumberingDraftWorkspaceData = {
  id: string;
  companyId: string;
  draftMode: NumberingDraftMode;
  ownerId: string;
  createdBy: string;
  sourceRootId: string | null;
  sourceDrawingNumberId: string | null;
  sourcePartNumberId: string | null;
  sourceLinkType: NumberingSourceLinkType | null;
  appendReason: string | null;
  root: null | {
    id: string;
    coreName: string;
    itemKind: NumberingDraftItemKind;
    ruleVersionId: string;
  };
  parts: Array<{
    id: string;
    partName: string;
    itemKind: NumberingDraftItemKind;
    isUniversal: boolean;
    universalReason: string | null;
    customSpecification: string | null;
    seriesCode: string | null;
  }>;
  drawings: Array<{
    id: string;
    purposeCode: NumberingDraftPurposeCode;
    purposeDescription: string;
    isPrimaryManufacturing: boolean;
  }>;
  relations: Array<{
    id: string;
    drawingDraftId: string;
    partDraftId: string;
    linkType: "primary_manufacturing" | "reference";
    isPrimary: boolean;
  }>;
};

export type UpdateNumberingDraftWorkspaceData = {
  workspaceId: string;
  companyId: string;
  actorId: string;
  expectedRowVersion: number;
  root?: { id: string; coreName: string; itemKind: NumberingDraftItemKind; ruleVersionId: string } | null;
  parts?: Array<{
    id: string;
    partName: string;
    itemKind: NumberingDraftItemKind;
    isUniversal: boolean;
    universalReason: string | null;
    customSpecification: string | null;
    seriesCode: string | null;
  }>;
  drawings?: Array<{
    id: string;
    purposeCode: NumberingDraftPurposeCode;
    purposeDescription: string;
    isPrimaryManufacturing: boolean;
  }>;
};

export type NumberingPublicationResult = {
  workspace: NumberingDraftWorkspaceRecord;
  approvalRequestId: string;
  snapshotHash: string;
  evidence: PublicationEvidenceResult;
  masters: {
    rootId: string;
    partIds: string[];
    drawingIds: string[];
    relationIds: string[];
  };
};

function toBoolean(value: number) {
  return value === 1;
}

function isUniqueConstraintError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "23505" || code.startsWith("SQLITE_CONSTRAINT") || /unique constraint/iu.test(message);
}

function lowestAvailable(used: Iterable<number>, maximum: number, label: string) {
  const values = new Set([...used].filter((value) => Number.isInteger(value) && value >= 1 && value <= maximum));
  for (let value = 1; value <= maximum; value += 1) {
    if (!values.has(value)) return value;
  }
  throw new Error(`${label}_SEQUENCE_EXHAUSTED`);
}

function sequenceFromPartCode(code: string, rootCode: string) {
  const compact = new RegExp(`^${rootCode.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}-P([0-9]{2})$`, "u").exec(code);
  if (compact) return Number.parseInt(compact[1], 10);
  const legacy = new RegExp(`^P-${rootCode.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}-([0-9]{3})$`, "u").exec(code);
  return legacy ? Number.parseInt(legacy[1], 10) : null;
}

function sequenceFromDrawingCode(code: string, rootCode: string, purposeCode: NumberingDraftPurposeCode) {
  const escapedRoot = rootCode.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const compact = new RegExp(`^${escapedRoot}-${purposeCode}([0-9]{2})$`, "u").exec(code);
  if (compact) return Number.parseInt(compact[1], 10);
  const legacy = new RegExp(`^D-${escapedRoot}-${purposeCode}([0-9])$`, "u").exec(code);
  return legacy ? Number.parseInt(legacy[1], 10) : null;
}

function mapReservation(row: ReservationRow): NumberCandidateReservationRecord {
  return {
    id: row.id,
    itemType: row.draft_item_type,
    itemId: row.draft_item_id,
    candidateCode: row.candidate_code,
    sequenceScopeKey: row.sequence_scope_key,
    sequenceNo: Number(row.sequence_no),
    state: row.reservation_state,
    rowVersion: Number(row.row_version)
  };
}

function parseJsonObject(value: string | Record<string, unknown>): Record<string, unknown> {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function canonicalNumberStateJson(value: unknown) {
  return canonicalJsonStringify(value);
}

const canonicalJson = canonicalNumberStateJson;

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function mapCandidateApproval(row: CandidateApprovalRow | null): NumberingCandidateApprovalRecord | null {
  if (!row) return null;
  const payload = parseJsonObject(row.payload_json);
  return {
    requestId: row.id,
    status: row.request_status,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    applyStatus: row.apply_status,
    applyAttempts: Number(row.apply_attempts),
    applyError: row.apply_error,
    snapshotHash: typeof payload.snapshotHash === "string" ? payload.snapshotHash : null
  };
}

function mapCandidateRevision(
  row: CandidateRevisionRow,
  files: CandidateRevisionFileRow[],
  companion: ReviewApprovalCompanionRow | undefined
): NumberingCandidateRevisionRecord {
  const mappedFiles = files.map<NumberingCandidateRevisionFileRecord>((file) => ({
    id: file.id,
    sourceFileAssetId: file.source_file_asset_id,
    publicationEvidenceId: file.publication_evidence_id,
    role: file.role,
    roleSource: file.role_source,
    displayName: file.display_name,
    description: file.description,
    sortOrder: Number(file.sort_order),
    isPrimary: Number(file.is_primary) === 1,
    removedAt: file.removed_at,
    removedBy: file.removed_by
  }));
  const reviewApproved =
    row.formal_revision_package_id !== null &&
    companion?.package_id === row.formal_revision_package_id &&
    companion.package_status === "Pending" &&
    companion.snapshot_hash === row.review_snapshot_hash;
  return {
    id: row.id,
    companyId: row.company_id,
    workspaceId: row.workspace_id,
    drawingDraftId: row.drawing_draft_id,
    candidateReservationId: row.candidate_reservation_id,
    revision: row.revision,
    workflowIntent: row.workflow_intent,
    policySnapshot: parseJsonObject(row.policy_snapshot_json),
    overrideReason: row.override_reason,
    lifecycleStatus: row.lifecycle_status,
    rowVersion: Number(row.row_version),
    approvalRequestId: row.approval_request_id,
    reviewSnapshotHash: row.review_snapshot_hash,
    legacyBaselineRequestId: row.legacy_baseline_request_id,
    legacyBaselineSnapshotHash: row.legacy_baseline_snapshot_hash,
    formalDrawingNumberId: row.formal_drawing_number_id,
    formalRevisionPackageId: row.formal_revision_package_id,
    createdBy: row.created_by,
    createdAt: String(row.created_at),
    updatedBy: row.updated_by,
    updatedAt: String(row.updated_at),
    promotedAt: row.promoted_at === null ? null : String(row.promoted_at),
    cancelledAt: row.cancelled_at === null ? null : String(row.cancelled_at),
    cancelledBy: row.cancelled_by,
    files: mappedFiles,
    effectiveStatus: reviewApproved ? "ReviewApproved" : row.formal_revision_package_id ? "Pending" : null
  };
}

function buildProjection(
  workspace: WorkspaceRow,
  reservations: ReservationRow[],
  latestApproval: NumberingCandidateApprovalRecord | null
): NumberStateProjection {
  const states = new Set(reservations.map((reservation) => reservation.reservation_state));
  const hasPromoted = states.has("promoted");
  const hasApproved = states.has("approved_locked");
  const hasReview = states.has("review_locked");
  const hasCandidate = reservations.some((reservation) => reservation.reservation_state !== "recycled");
  if (workspace.lifecycle_status === "published" && !hasPromoted) {
    return {
      numberQualification: "unnumbered",
      lifecycle: "published",
      review: "not_submitted",
      publication: "failed",
      readiness: "incomplete",
      usage: "not_for_formal_use",
      nowWhat: { label: "Check state inconsistency", href: null, ownerRole: "PDM Admin", blockedReason: "state_inconsistent" }
    };
  }
  const lifecycle = workspace.lifecycle_status === "active" ? "draft" : workspace.lifecycle_status;
  if (workspace.lifecycle_status === "cancelled") {
    return {
      numberQualification: "unnumbered",
      lifecycle,
      review: "not_submitted",
      publication: "not_ready",
      readiness: "not_applicable",
      usage: "historical_only",
      nowWhat: { label: "View cancelled draft", href: null, ownerRole: "Draft owner", blockedReason: null }
    };
  }
  if (hasPromoted) {
    return {
      numberQualification: "official",
      lifecycle: "published",
      review: "approved",
      publication: "published",
      readiness: "not_applicable",
      usage: "formal_use_allowed",
      nowWhat: { label: "View official record", href: null, ownerRole: "PDM", blockedReason: null }
    };
  }
  if (hasApproved) {
    return {
      numberQualification: "candidate",
      lifecycle,
      review: "approved",
      publication: "ready",
      readiness: "incomplete",
      usage: "not_for_formal_use",
      nowWhat: { label: "Publish official number", href: null, ownerRole: "Publisher", blockedReason: null }
    };
  }
  if (latestApproval?.status === "apply_failed") {
    return {
      numberQualification: "candidate",
      lifecycle,
      review: "in_review",
      publication: "failed",
      readiness: "stale",
      usage: "not_for_formal_use",
      nowWhat: { label: "Retry approval apply", href: `/approvals?requestId=${encodeURIComponent(latestApproval.requestId)}`, ownerRole: "Approver", blockedReason: "approval_apply_failed" }
    };
  }
  if (hasReview) {
    return {
      numberQualification: "candidate",
      lifecycle,
      review: "in_review",
      publication: "not_ready",
      readiness: "incomplete",
      usage: "not_for_formal_use",
      nowWhat: { label: "View review", href: null, ownerRole: "Approver", blockedReason: "candidate_review_locked" }
    };
  }
  if (latestApproval?.status === "needs_info" || latestApproval?.status === "rejected") {
    return {
      numberQualification: hasCandidate ? "candidate" : "unnumbered",
      lifecycle,
      review: latestApproval.status,
      publication: "not_ready",
      readiness: "incomplete",
      usage: "not_for_formal_use",
      nowWhat: {
        label: latestApproval.status === "needs_info" ? "Update requested information" : "Revise draft before resubmission",
        href: null,
        ownerRole: "Draft owner",
        blockedReason: latestApproval.status
      }
    };
  }
  return {
    numberQualification: hasCandidate ? "candidate" : "unnumbered",
    lifecycle,
    review: "not_submitted",
    publication: "not_ready",
    readiness: "incomplete",
    usage: "not_for_formal_use",
    nowWhat: {
      label: hasCandidate ? "Complete draft and submit review" : "Acquire candidate numbers",
      href: null,
      ownerRole: "Draft owner",
      blockedReason: null
    }
  };
}

export function numberingCandidateSnapshotFacts(workspace: NumberingDraftWorkspaceRecord) {
  return {
    workspace: {
      id: workspace.id,
      companyId: workspace.companyId,
      draftMode: workspace.draftMode,
      lifecycleStatus: workspace.lifecycleStatus,
      ownerId: workspace.ownerId,
      sourceRootId: workspace.sourceRootId,
      sourceDrawingNumberId: workspace.sourceDrawingNumberId,
      sourcePartNumberId: workspace.sourcePartNumberId,
      sourceLinkType: workspace.sourceLinkType,
      appendReason: workspace.appendReason
    },
    root: workspace.root ? {
      id: workspace.root.id,
      coreName: workspace.root.coreName,
      itemKind: workspace.root.itemKind,
      ruleVersionId: workspace.root.ruleVersionId,
      candidateReservationId: workspace.root.candidateReservationId,
      candidateCode: workspace.root.candidateCode
    } : null,
    parts: workspace.parts.map((part) => ({
      id: part.id,
      rootDraftId: part.rootDraftId,
      sourceRootId: part.sourceRootId,
      partName: part.partName,
      itemKind: part.itemKind,
      isUniversal: part.isUniversal,
      universalReason: part.universalReason,
      customSpecification: part.customSpecification,
      seriesCode: part.seriesCode,
      candidateReservationId: part.candidateReservationId,
      candidateCode: part.candidateCode
    })).sort((left, right) => left.id.localeCompare(right.id)),
    drawings: workspace.drawings.map((drawing) => ({
      id: drawing.id,
      rootDraftId: drawing.rootDraftId,
      sourceRootId: drawing.sourceRootId,
      purposeCode: drawing.purposeCode,
      purposeDescription: drawing.purposeDescription,
      isPrimaryManufacturing: drawing.isPrimaryManufacturing,
      candidateReservationId: drawing.candidateReservationId,
      candidateCode: drawing.candidateCode
    })).sort((left, right) => left.id.localeCompare(right.id)),
    relations: workspace.relations.map((relation) => ({
      id: relation.id,
      drawingDraftId: relation.drawingDraftId,
      partDraftId: relation.partDraftId,
      linkType: relation.linkType,
      isPrimary: relation.isPrimary
    })).sort((left, right) => left.id.localeCompare(right.id))
  };
}

const candidateSnapshotFacts = numberingCandidateSnapshotFacts;

function buildCandidateSnapshot(workspace: NumberingDraftWorkspaceRecord) {
  const facts = candidateSnapshotFacts(workspace);
  const factsHash = sha256(canonicalJson(facts));
  const snapshot = {
    snapshotVersion: "numbering-candidate-publication-review-v1",
    factsHash,
    facts,
    lockedReservations: workspace.reservations
      .filter((reservation) => reservation.state !== "recycled")
      .map((reservation) => ({
        id: reservation.id,
        itemType: reservation.itemType,
        itemId: reservation.itemId,
        candidateCode: reservation.candidateCode,
        sequenceScopeKey: reservation.sequenceScopeKey,
        sequenceNo: reservation.sequenceNo,
        rowVersion: reservation.rowVersion
      }))
      .sort((left, right) => left.id.localeCompare(right.id))
  };
  return { snapshot, snapshotJson: canonicalJson(snapshot), snapshotHash: sha256(canonicalJson(snapshot)), factsHash };
}

export class AsyncNumberStateFlowRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID(),
    private readonly approvalFaultInjector?: (faultPoint: string) => void
  ) {}

  private async workspaceRow(workspaceId: string, companyId: string, lock = false) {
    return this.client.queryOne<WorkspaceRow>(
      `SELECT * FROM numbering_draft_workspaces
       WHERE id = :workspaceId AND company_id = :companyId${lock && this.client.kind === "postgres" ? " FOR UPDATE" : ""}`,
      { workspaceId, companyId }
    );
  }

  private async sourceRoot(sourceRootId: string, companyId: string) {
    return this.client.queryOne<SourceRootRow>(
      `SELECT id, company_id, root_code, core_name, item_kind, record_status, rule_version_id FROM part_roots
       WHERE id = :sourceRootId AND company_id = :companyId`,
      { sourceRootId, companyId }
    );
  }

  private async sourceDrawing(sourceDrawingNumberId: string, companyId: string) {
    return this.client.queryOne<SourceDrawingRow>(
      `SELECT id, company_id, part_root_id, purpose_code, record_status
       FROM drawing_numbers
       WHERE id = :sourceDrawingNumberId AND company_id = :companyId`,
      { sourceDrawingNumberId, companyId }
    );
  }

  private async sourcePart(sourcePartNumberId: string, companyId: string) {
    return this.client.queryOne<SourcePartRow>(
      `SELECT id, company_id, part_root_id, record_status
       FROM part_numbers
       WHERE id = :sourcePartNumberId AND company_id = :companyId`,
      { sourcePartNumberId, companyId }
    );
  }

  private async validateSourceContext(input: {
    companyId: string;
    draftMode: NumberingDraftMode;
    sourceRootId: string | null;
    sourceDrawingNumberId: string | null;
    sourcePartNumberId: string | null;
    sourceLinkType: NumberingSourceLinkType | null;
    drawings: Array<{ purposeCode: NumberingDraftPurposeCode }>;
  }) {
    const [sourceDrawing, sourcePart] = await Promise.all([
      input.sourceDrawingNumberId ? this.sourceDrawing(input.sourceDrawingNumberId, input.companyId) : null,
      input.sourcePartNumberId ? this.sourcePart(input.sourcePartNumberId, input.companyId) : null
    ]);
    if (input.sourceDrawingNumberId && !sourceDrawing) throw new Error("SOURCE_DRAWING_NOT_FOUND");
    if (input.sourcePartNumberId && !sourcePart) throw new Error("SOURCE_PART_NOT_FOUND");
    const source = sourceDrawing ?? sourcePart;
    if (source && source.part_root_id !== input.sourceRootId) throw new Error("SOURCE_CONTEXT_ROOT_MISMATCH");
    if (source && !["Active", "Released", "MainDrawingInvalid"].includes(source.record_status)) {
      throw new Error("SOURCE_CONTEXT_STATE_BLOCKED");
    }
    if (sourceDrawing && input.draftMode !== "append_part") throw new Error("SOURCE_CONTEXT_MODE_MISMATCH");
    if (sourcePart && input.draftMode !== "append_drawing") throw new Error("SOURCE_CONTEXT_MODE_MISMATCH");
    if (input.sourceLinkType === "primary_manufacturing") {
      if (sourceDrawing && !isManufacturingPurpose(sourceDrawing.purpose_code)) {
        throw new Error("SOURCE_PRIMARY_LINK_INVALID");
      }
      if (sourcePart) {
        if (input.drawings.length !== 1 || !isManufacturingPurpose(input.drawings[0].purposeCode)) {
          throw new Error("SOURCE_PRIMARY_LINK_INVALID");
        }
        const existingPrimary = await this.client.queryOne<{ id: string }>(
          `SELECT id FROM drawing_part_links
           WHERE part_number_id = :sourcePartNumberId AND link_type = 'primary_manufacturing'
           LIMIT 1`,
          { sourcePartNumberId: sourcePart.id }
        );
        if (existingPrimary) throw new Error("SOURCE_PRIMARY_LINK_CONFLICT");
      }
    }
    return { sourceDrawing, sourcePart };
  }

  private async insertAudit(input: { actorId: string; action: string; detail: Record<string, unknown> }) {
    await this.client.execute(
      `INSERT INTO audit_logs (id, actor_id, action, detail_json, created_at)
       VALUES (:id, :actorId, :action, :detailJson, :createdAt)`,
      {
        id: this.idFactory(),
        actorId: input.actorId,
        action: input.action,
        detailJson: JSON.stringify(input.detail),
        createdAt: this.clock()
      }
    );
  }

  private async insertCandidateEvent(input: {
    companyId: string;
    workspaceId: string;
    reservationId?: string | null;
    eventType:
      | "workspace_created"
      | "candidate_reserved"
      | "review_locked"
      | "review_unlocked"
      | "approval_locked"
      | "candidate_recycled"
      | "candidate_promoted"
      | "publication_failed";
    actorId: string;
    detail?: Record<string, unknown>;
  }) {
    await this.client.execute(
      `INSERT INTO number_candidate_events (
         id, company_id, workspace_id, reservation_id, event_type, actor_id, occurred_at, detail_json
       ) VALUES (
         :id, :companyId, :workspaceId, :reservationId, :eventType, :actorId, :occurredAt, :detailJson
       )`,
      {
        id: this.idFactory(),
        companyId: input.companyId,
        workspaceId: input.workspaceId,
        reservationId: input.reservationId ?? null,
        eventType: input.eventType,
        actorId: input.actorId,
        occurredAt: this.clock(),
        detailJson: JSON.stringify(input.detail ?? {})
      }
    );
  }

  private buildWorkspaceRecord(input: {
    workspace: WorkspaceRow;
    root: RootRow | null;
    parts: PartRow[];
    drawings: DrawingRow[];
    relations: RelationRow[];
    reservations: ReservationRow[];
    latestApprovalRow: CandidateApprovalRow | null;
    candidateRows?: CandidateRevisionRow[];
    candidateFileRows?: CandidateRevisionFileRow[];
    companionRows?: ReviewApprovalCompanionRow[];
    latestBundleApprovalRow?: CandidateApprovalRow | null;
  }): NumberingDraftWorkspaceRecord {
    const { workspace, root, parts, drawings, relations, reservations, latestApprovalRow } = input;
    const latestApproval = mapCandidateApproval(latestApprovalRow);
    let candidateRevisions: NumberingCandidateRevisionRecord[] = [];
    let lifecycleV2: NumberLifecycleProjectionV2 | null = null;
    let latestBundleApproval: NumberingCandidateApprovalRecord | null = null;
    if (isNumberLifecycleV2Enabled()) {
      const filesByCandidate = new Map<string, CandidateRevisionFileRow[]>();
      for (const file of input.candidateFileRows ?? []) {
        const files = filesByCandidate.get(file.candidate_revision_id) ?? [];
        files.push(file);
        filesByCandidate.set(file.candidate_revision_id, files);
      }
      const companionByCandidate = new Map((input.companionRows ?? []).map((companion) => [companion.candidate_revision_id, companion]));
      candidateRevisions = (input.candidateRows ?? []).map((candidate) => mapCandidateRevision(
        candidate,
        filesByCandidate.get(candidate.id) ?? [],
        companionByCandidate.get(candidate.id)
      ));
      latestBundleApproval = mapCandidateApproval(input.latestBundleApprovalRow ?? null);
      lifecycleV2 = projectNumberLifecycleV2({
        workspaceLifecycle: workspace.lifecycle_status,
        drawingDraftIds: drawings.map((drawing) => drawing.id),
        relationCount: relations.length,
        relationshipOnlyReady: workspace.draft_mode === "append_part"
          && Boolean(workspace.source_drawing_number_id)
          && parts.length > 0,
        reservations: reservations.map((reservation) => ({
          itemType: reservation.draft_item_type,
          state: reservation.reservation_state
        })),
        legacyApproval: latestApproval,
        bundleApproval: latestBundleApproval,
        candidateRevisions
      });
    }
    const locked = reservations.some((reservation) => ["review_locked", "approved_locked", "promoted"].includes(reservation.reservation_state));
    const activeReservations = reservations.filter((reservation) => reservation.reservation_state !== "recycled");
    const allActive = activeReservations.length > 0 && activeReservations.every((reservation) => reservation.reservation_state === "active");
    const allReviewLocked = activeReservations.length > 0 && activeReservations.every((reservation) => reservation.reservation_state === "review_locked");
    const allApproved = activeReservations.length > 0 && activeReservations.every((reservation) => reservation.reservation_state === "approved_locked");
    return {
      id: workspace.id,
      companyId: workspace.company_id,
      draftMode: workspace.draft_mode,
      lifecycleStatus: workspace.lifecycle_status,
      ownerId: workspace.owner_id,
      createdBy: workspace.created_by,
      sourceRootId: workspace.source_root_id,
      sourceDrawingNumberId: workspace.source_drawing_number_id ?? null,
      sourcePartNumberId: workspace.source_part_number_id ?? null,
      sourceLinkType: workspace.source_link_type ?? null,
      appendReason: workspace.append_reason ?? null,
      rowVersion: Number(workspace.row_version),
      publishedAt: workspace.published_at,
      publishedBy: workspace.published_by,
      cancelledAt: workspace.cancelled_at,
      cancelledBy: workspace.cancelled_by,
      cancelReason: workspace.cancel_reason,
      createdAt: workspace.created_at,
      updatedAt: workspace.updated_at,
      root: root ? {
        id: root.id,
        coreName: root.core_name,
        itemKind: root.item_kind,
        ruleVersionId: root.rule_version_id,
        candidateReservationId: root.candidate_reservation_id,
        candidateCode: root.candidate_code ?? null
      } : null,
      parts: parts.map((part) => ({
        id: part.id,
        rootDraftId: part.root_draft_id,
        sourceRootId: part.source_root_id,
        partName: part.part_name,
        itemKind: part.item_kind,
        isUniversal: toBoolean(part.is_universal),
        universalReason: part.universal_reason ?? null,
        customSpecification: part.custom_specification,
        seriesCode: part.series_code,
        candidateReservationId: part.candidate_reservation_id,
        candidateCode: part.candidate_code ?? null
      })),
      drawings: drawings.map((drawing) => ({
        id: drawing.id,
        rootDraftId: drawing.root_draft_id,
        sourceRootId: drawing.source_root_id,
        purposeCode: drawing.purpose_code,
        purposeDescription: drawing.purpose_description,
        isPrimaryManufacturing: toBoolean(drawing.is_primary_manufacturing),
        candidateReservationId: drawing.candidate_reservation_id,
        candidateCode: drawing.candidate_code ?? null
      })),
      relations: relations.map((relation) => ({
        id: relation.id,
        drawingDraftId: relation.drawing_draft_id,
        partDraftId: relation.part_draft_id,
        linkType: relation.link_type,
        isPrimary: toBoolean(relation.is_primary)
      })),
      reservations: reservations.map(mapReservation),
      latestApproval,
      projection: buildProjection(workspace, reservations, latestApproval),
      lifecycleV2,
      candidateRevisions,
      capabilities: {
        canUpdate: workspace.lifecycle_status === "active" && !locked,
        canAcquireCandidates: workspace.lifecycle_status === "active" && !locked && activeReservations.length === 0,
        canCancel: workspace.lifecycle_status === "active" && !locked,
        canSubmitReview: workspace.lifecycle_status === "active" && allActive && latestApproval?.status !== "pending",
        canWithdrawReview: workspace.lifecycle_status === "active" && allReviewLocked &&
          (latestBundleApproval?.status === "pending" || latestApproval?.status === "pending"),
        canPublish: workspace.lifecycle_status === "active" && allApproved && latestApproval?.status === "approved" && latestApproval.applyStatus === "applied",
        publishBlockedReason: allApproved && latestApproval?.status === "approved" && latestApproval.applyStatus === "applied" ? null : "approval_required"
      },
      references: []
    };
  }

  private async insertApprovalEvent(input: {
    requestId: string;
    eventType: string;
    actorId: string;
    detail?: Record<string, unknown>;
  }) {
    await this.client.execute(
      `INSERT INTO approval_platform_events (
         id, request_id, package_id, event_type, actor_id, detail_json, created_at
       ) VALUES (
         :id, :requestId, NULL, :eventType, :actorId, :detailJson, :createdAt
       )`,
      {
        id: `APE-${this.idFactory()}`,
        requestId: input.requestId,
        eventType: input.eventType,
        actorId: input.actorId,
        detailJson: canonicalJson(input.detail ?? {}),
        createdAt: this.clock()
      }
    );
  }

  async createWorkspace(input: CreateNumberingDraftWorkspaceData): Promise<NumberingDraftWorkspaceRecord> {
    const now = this.clock();
    const sourceRoot = input.sourceRootId ? await this.sourceRoot(input.sourceRootId, input.companyId) : null;
    if (input.sourceRootId && !sourceRoot) {
      throw new Error("SOURCE_ROOT_NOT_FOUND");
    }
    const appendReasonRequired = sourceRoot ? ["Active", "Released", "MainDrawingInvalid"].includes(sourceRoot.record_status) : false;
    if (appendReasonRequired && !input.appendReason?.trim()) {
      throw new Error("APPEND_REASON_REQUIRED");
    }
    await this.validateSourceContext(input);
    const ruleVersionId = input.root?.ruleVersionId ?? sourceRoot?.rule_version_id;
    if (!ruleVersionId) throw new Error("NUMBERING_RULE_REQUIRED");
    for (const drawing of input.drawings) assertPurposeAllowedForRule(drawing.purposeCode, ruleVersionId);
    await this.client.execute(
      `INSERT INTO numbering_draft_workspaces (
         id, company_id, draft_mode, lifecycle_status, owner_id, created_by, source_root_id,
         source_drawing_number_id, source_part_number_id, source_link_type,
         append_reason, row_version, created_at, updated_at
       ) VALUES (
         :id, :companyId, :draftMode, 'active', :ownerId, :createdBy, :sourceRootId,
         :sourceDrawingNumberId, :sourcePartNumberId, :sourceLinkType,
         :appendReason, 1, :createdAt, :updatedAt
       )`,
      { ...input, createdAt: now, updatedAt: now }
    );
    if (input.root) {
      await this.client.execute(
        `INSERT INTO numbering_draft_roots (
           id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
         ) VALUES (
           :id, :companyId, :workspaceId, :coreName, :itemKind, :ruleVersionId, :createdAt, :updatedAt
         )`,
        { ...input.root, companyId: input.companyId, workspaceId: input.id, createdAt: now, updatedAt: now }
      );
    }
    const rootDraftId = input.root?.id ?? null;
    for (const part of input.parts) {
      await this.client.execute(
        `INSERT INTO numbering_draft_parts (
           id, company_id, workspace_id, root_draft_id, source_root_id, part_name, item_kind,
           is_universal, universal_reason, custom_specification, series_code, created_at, updated_at
         ) VALUES (
           :id, :companyId, :workspaceId, :rootDraftId, :sourceRootId, :partName, :itemKind,
           :isUniversal, :universalReason, :customSpecification, :seriesCode, :createdAt, :updatedAt
         )`,
        {
          ...part,
          companyId: input.companyId,
          workspaceId: input.id,
          rootDraftId,
          sourceRootId: input.sourceRootId,
          isUniversal: part.isUniversal ? 1 : 0,
          createdAt: now,
          updatedAt: now
        }
      );
    }
    for (const drawing of input.drawings) {
      await this.client.execute(
        `INSERT INTO numbering_draft_drawings (
           id, company_id, workspace_id, root_draft_id, source_root_id, purpose_code,
           purpose_description, is_primary_manufacturing, created_at, updated_at
         ) VALUES (
           :id, :companyId, :workspaceId, :rootDraftId, :sourceRootId, :purposeCode,
           :purposeDescription, :isPrimaryManufacturing, :createdAt, :updatedAt
         )`,
        {
          ...drawing,
          companyId: input.companyId,
          workspaceId: input.id,
          rootDraftId,
          sourceRootId: input.sourceRootId,
          isPrimaryManufacturing: drawing.isPrimaryManufacturing ? 1 : 0,
          createdAt: now,
          updatedAt: now
        }
      );
    }
    for (const relation of input.relations) {
      await this.client.execute(
        `INSERT INTO numbering_draft_relations (
           id, company_id, workspace_id, drawing_draft_id, part_draft_id, link_type,
           is_primary, created_at, updated_at
         ) VALUES (
           :id, :companyId, :workspaceId, :drawingDraftId, :partDraftId, :linkType,
           :isPrimary, :createdAt, :updatedAt
         )`,
        {
          ...relation,
          companyId: input.companyId,
          workspaceId: input.id,
          isPrimary: relation.isPrimary ? 1 : 0,
          createdAt: now,
          updatedAt: now
        }
      );
    }
    await this.insertCandidateEvent({
      companyId: input.companyId,
      workspaceId: input.id,
      eventType: "workspace_created",
      actorId: input.createdBy,
      detail: {
        draftMode: input.draftMode,
        rootCount: input.root ? 1 : 0,
        partCount: input.parts.length,
        drawingCount: input.drawings.length,
        sourceRootCode: sourceRoot?.root_code ?? null,
        sourceDrawingNumberId: input.sourceDrawingNumberId,
        sourcePartNumberId: input.sourcePartNumberId,
        sourceLinkType: input.sourceLinkType,
        appendReason: input.appendReason ?? null
      }
    });
    await this.insertAudit({
      actorId: input.createdBy,
      action: "pdm.numbering.create_draft_workspace",
      detail: {
        companyId: input.companyId,
        workspaceId: input.id,
        draftMode: input.draftMode,
        sourceRootId: input.sourceRootId ?? null,
        sourceRootCode: sourceRoot?.root_code ?? null,
        appendReason: input.appendReason ?? null
      }
    });
    await new UnifiedDrawingAsyncRepository(this.client).synchronizeWorkspace({
      workspaceId: input.id,
      companyId: input.companyId
    });
    return this.getWorkspace(input.id, input.companyId);
  }

  async listWorkspaces(input: {
    companyId: string;
    ownerId?: string | null;
    lifecycleStatus?: NumberingDraftLifecycle | null;
    sourceRootIds?: string[];
    seriesCode?: string | null;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
    const where = ["company_id = :companyId"];
    const params: Record<string, string> = { companyId: input.companyId };
    if (input.ownerId) {
      where.push("owner_id = :ownerId");
      params.ownerId = input.ownerId;
    }
    if (input.lifecycleStatus) {
      where.push("lifecycle_status = :lifecycleStatus");
      params.lifecycleStatus = input.lifecycleStatus;
    }
    const sourceRootIds = [...new Set((input.sourceRootIds ?? []).filter(Boolean))];
    if (sourceRootIds.length > 0) {
      const sourceRootPlaceholders = sourceRootIds.map((sourceRootId, index) => {
        const key = `sourceRootId${index}`;
        params[key] = sourceRootId;
        return `:${key}`;
      });
      where.push(`source_root_id IN (${sourceRootPlaceholders.join(", ")})`);
    }
    if (input.seriesCode) {
      where.push(`EXISTS (
        SELECT 1
        FROM numbering_draft_parts series_part
        WHERE series_part.workspace_id = numbering_draft_workspaces.id
          AND series_part.company_id = numbering_draft_workspaces.company_id
          AND series_part.series_code = :seriesCode
      )`);
      params.seriesCode = input.seriesCode;
    }
    const rows = await this.client.query<WorkspaceRow>(
      `SELECT * FROM numbering_draft_workspaces
       WHERE ${where.join(" AND ")}
       ORDER BY updated_at DESC
       LIMIT ${limit}`,
      params
    );
    return this.getWorkspacesByIds(rows.map((row) => row.id), input.companyId);
  }

  async getWorkspacesByIds(workspaceIds: string[], companyId: string): Promise<NumberingDraftWorkspaceRecord[]> {
    const orderedIds = [...new Set(workspaceIds.filter(Boolean))];
    if (orderedIds.length === 0) return [];
    const chunks = Array.from({ length: Math.ceil(orderedIds.length / 400) }, (_, index) => orderedIds.slice(index * 400, (index + 1) * 400));
    const queryChunks = async <T>(sql: (placeholders: string) => string) => {
      const batches = await Promise.all(chunks.map((chunk, chunkIndex) => {
        const bindings: Record<string, string> = { companyId };
        const placeholders = chunk.map((workspaceId, itemIndex) => {
          const key = `workspaceId${chunkIndex}_${itemIndex}`;
          bindings[key] = workspaceId;
          return `:${key}`;
        }).join(", ");
        return this.client.query<T>(sql(placeholders), bindings);
      }));
      return batches.flat();
    };
    type TargetedApprovalRow = CandidateApprovalRow & { target_workspace_id: string };
    type WorkspaceCompanionRow = ReviewApprovalCompanionRow & { workspace_id: string };
    const [workspaces, roots, parts, drawings, relations, reservations, legacyApprovalRows] = await Promise.all([
      queryChunks<WorkspaceRow>((ids) => `SELECT * FROM numbering_draft_workspaces WHERE company_id = :companyId AND id IN (${ids})`),
      queryChunks<RootRow>((ids) => `SELECT root.*, candidate.candidate_code
        FROM numbering_draft_roots root
        LEFT JOIN number_candidate_reservations candidate ON candidate.id = root.candidate_reservation_id
        WHERE root.company_id = :companyId AND root.workspace_id IN (${ids})`),
      queryChunks<PartRow>((ids) => `SELECT part.*, candidate.candidate_code
        FROM numbering_draft_parts part
        LEFT JOIN number_candidate_reservations candidate ON candidate.id = part.candidate_reservation_id
        WHERE part.company_id = :companyId AND part.workspace_id IN (${ids})
        ORDER BY part.created_at, part.id`),
      queryChunks<DrawingRow>((ids) => `SELECT drawing.*, candidate.candidate_code
        FROM numbering_draft_drawings drawing
        LEFT JOIN number_candidate_reservations candidate ON candidate.id = drawing.candidate_reservation_id
        WHERE drawing.company_id = :companyId AND drawing.workspace_id IN (${ids})
        ORDER BY drawing.created_at, drawing.id`),
      queryChunks<RelationRow>((ids) => `SELECT * FROM numbering_draft_relations
        WHERE company_id = :companyId AND workspace_id IN (${ids}) ORDER BY created_at, id`),
      queryChunks<ReservationRow>((ids) => `SELECT * FROM number_candidate_reservations
        WHERE company_id = :companyId AND workspace_id IN (${ids})
        ORDER BY CASE draft_item_type WHEN 'root' THEN 0 WHEN 'part' THEN 1 WHEN 'drawing' THEN 2 ELSE 3 END, created_at, id`),
      queryChunks<TargetedApprovalRow>((ids) => `SELECT request.*, target.target_id AS target_workspace_id
        FROM approval_platform_requests request
        JOIN approval_platform_targets target ON target.request_id = request.id
        WHERE request.company_id = :companyId
          AND request.action_code = 'numbering.candidate_publication_review'
          AND target.target_type = 'numbering_draft_workspace'
          AND target.target_id IN (${ids})
        ORDER BY target.target_id, request.requested_at DESC, request.id DESC`)
    ]);
    let candidateRows: CandidateRevisionRow[] = [];
    let candidateFileRows: CandidateRevisionFileRow[] = [];
    let companionRows: WorkspaceCompanionRow[] = [];
    let bundleApprovalRows: TargetedApprovalRow[] = [];
    if (isNumberLifecycleV2Enabled()) {
      [candidateRows, candidateFileRows, companionRows, bundleApprovalRows] = await Promise.all([
        queryChunks<CandidateRevisionRow>((ids) => `SELECT * FROM numbering_candidate_revision_drafts
          WHERE company_id = :companyId AND workspace_id IN (${ids}) ORDER BY created_at, id`),
        queryChunks<CandidateRevisionFileRow>((ids) => `SELECT candidate_file.*
          FROM numbering_candidate_revision_files candidate_file
          JOIN numbering_candidate_revision_drafts candidate
            ON candidate.id = candidate_file.candidate_revision_id AND candidate.company_id = candidate_file.company_id
          WHERE candidate.company_id = :companyId AND candidate.workspace_id IN (${ids})
          ORDER BY candidate_file.sort_order, candidate_file.id`),
        queryChunks<WorkspaceCompanionRow>((ids) => `SELECT approval.package_id, approval.candidate_revision_id, approval.snapshot_hash,
            package.status AS package_status, candidate.workspace_id
          FROM drawing_revision_package_review_approvals approval
          JOIN numbering_candidate_revision_drafts candidate
            ON candidate.id = approval.candidate_revision_id AND candidate.company_id = approval.company_id
          JOIN drawing_revision_packages package
            ON package.id = approval.package_id AND package.company_id = approval.company_id
          WHERE candidate.company_id = :companyId AND candidate.workspace_id IN (${ids})`),
        queryChunks<TargetedApprovalRow>((ids) => `SELECT request.*, target.target_id AS target_workspace_id
          FROM approval_platform_requests request
          JOIN approval_platform_targets target ON target.request_id = request.id
          WHERE request.company_id = :companyId
            AND request.action_code = 'numbering.candidate_bundle_review'
            AND target.target_type = 'numbering_draft_workspace'
            AND target.target_id IN (${ids})
          ORDER BY target.target_id, request.requested_at DESC, request.id DESC`)
      ]);
    }
    const group = <T extends { workspace_id: string }>(rows: T[]) => {
      const grouped = new Map<string, T[]>();
      for (const row of rows) grouped.set(row.workspace_id, [...(grouped.get(row.workspace_id) ?? []), row]);
      return grouped;
    };
    const workspacesById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
    const rootsByWorkspace = new Map(roots.map((root) => [root.workspace_id, root]));
    const partsByWorkspace = group(parts);
    const drawingsByWorkspace = group(drawings);
    const relationsByWorkspace = group(relations);
    const reservationsByWorkspace = group(reservations);
    const candidatesByWorkspace = group(candidateRows);
    const filesByCandidate = new Map<string, CandidateRevisionFileRow[]>();
    for (const file of candidateFileRows) filesByCandidate.set(file.candidate_revision_id, [...(filesByCandidate.get(file.candidate_revision_id) ?? []), file]);
    const companionsByWorkspace = group(companionRows);
    const latestLegacyByWorkspace = new Map<string, CandidateApprovalRow>();
    for (const row of legacyApprovalRows) if (!latestLegacyByWorkspace.has(row.target_workspace_id)) latestLegacyByWorkspace.set(row.target_workspace_id, row);
    const latestBundleByWorkspace = new Map<string, CandidateApprovalRow>();
    for (const row of bundleApprovalRows) if (!latestBundleByWorkspace.has(row.target_workspace_id)) latestBundleByWorkspace.set(row.target_workspace_id, row);
    return orderedIds.flatMap((workspaceId) => {
      const workspace = workspacesById.get(workspaceId);
      if (!workspace) return [];
      const workspaceCandidates = candidatesByWorkspace.get(workspaceId) ?? [];
      return [this.buildWorkspaceRecord({
        workspace,
        root: rootsByWorkspace.get(workspaceId) ?? null,
        parts: partsByWorkspace.get(workspaceId) ?? [],
        drawings: drawingsByWorkspace.get(workspaceId) ?? [],
        relations: relationsByWorkspace.get(workspaceId) ?? [],
        reservations: reservationsByWorkspace.get(workspaceId) ?? [],
        latestApprovalRow: latestLegacyByWorkspace.get(workspaceId) ?? null,
        candidateRows: workspaceCandidates,
        candidateFileRows: workspaceCandidates.flatMap((candidate) => filesByCandidate.get(candidate.id) ?? []),
        companionRows: companionsByWorkspace.get(workspaceId) ?? [],
        latestBundleApprovalRow: latestBundleByWorkspace.get(workspaceId) ?? null
      })];
    });
  }

  async getWorkspace(workspaceId: string, companyId: string): Promise<NumberingDraftWorkspaceRecord> {
    const workspace = await this.workspaceRow(workspaceId, companyId);
    if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
    const [root, parts, drawings, relations, reservations, latestApprovalRow] = await Promise.all([
      this.client.queryOne<RootRow>(
        `SELECT r.*, c.candidate_code FROM numbering_draft_roots r
         LEFT JOIN number_candidate_reservations c ON c.id = r.candidate_reservation_id
         WHERE r.workspace_id = :workspaceId AND r.company_id = :companyId`,
        { workspaceId, companyId }
      ),
      this.client.query<PartRow>(
        `SELECT p.*, c.candidate_code FROM numbering_draft_parts p
         LEFT JOIN number_candidate_reservations c ON c.id = p.candidate_reservation_id
         WHERE p.workspace_id = :workspaceId AND p.company_id = :companyId ORDER BY p.created_at, p.id`,
        { workspaceId, companyId }
      ),
      this.client.query<DrawingRow>(
        `SELECT d.*, c.candidate_code FROM numbering_draft_drawings d
         LEFT JOIN number_candidate_reservations c ON c.id = d.candidate_reservation_id
         WHERE d.workspace_id = :workspaceId AND d.company_id = :companyId ORDER BY d.created_at, d.id`,
        { workspaceId, companyId }
      ),
      this.client.query<RelationRow>(
        `SELECT * FROM numbering_draft_relations
         WHERE workspace_id = :workspaceId AND company_id = :companyId ORDER BY created_at, id`,
        { workspaceId, companyId }
      ),
      this.client.query<ReservationRow>(
        `SELECT * FROM number_candidate_reservations
         WHERE workspace_id = :workspaceId AND company_id = :companyId
         ORDER BY CASE draft_item_type
           WHEN 'root' THEN 0
           WHEN 'part' THEN 1
           WHEN 'drawing' THEN 2
           ELSE 3
         END, created_at, id`,
        { workspaceId, companyId }
      ),
      this.client.queryOne<CandidateApprovalRow>(
        `SELECT r.*
         FROM approval_platform_requests r
         JOIN approval_platform_targets t ON t.request_id = r.id
         WHERE r.company_id = :companyId
           AND r.action_code = 'numbering.candidate_publication_review'
           AND t.target_type = 'numbering_draft_workspace'
           AND t.target_id = :workspaceId
         ORDER BY r.requested_at DESC, r.id DESC
         LIMIT 1`,
        { workspaceId, companyId }
      )
    ]);
    let candidateRows: CandidateRevisionRow[] = [];
    let candidateFileRows: CandidateRevisionFileRow[] = [];
    let companionRows: ReviewApprovalCompanionRow[] = [];
    let latestBundleApprovalRow: CandidateApprovalRow | null = null;
    if (isNumberLifecycleV2Enabled()) {
      [candidateRows, candidateFileRows, companionRows, latestBundleApprovalRow] = await Promise.all([
        this.client.query<CandidateRevisionRow>(
          `SELECT * FROM numbering_candidate_revision_drafts
           WHERE workspace_id = :workspaceId AND company_id = :companyId
           ORDER BY created_at, id`,
          { workspaceId, companyId }
        ),
        this.client.query<CandidateRevisionFileRow>(
          `SELECT candidate_file.*
           FROM numbering_candidate_revision_files candidate_file
           JOIN numbering_candidate_revision_drafts candidate
             ON candidate.id = candidate_file.candidate_revision_id
            AND candidate.company_id = candidate_file.company_id
           WHERE candidate.workspace_id = :workspaceId AND candidate.company_id = :companyId
           ORDER BY candidate_file.sort_order, candidate_file.id`,
          { workspaceId, companyId }
        ),
        this.client.query<ReviewApprovalCompanionRow>(
          `SELECT approval.package_id, approval.candidate_revision_id, approval.snapshot_hash,
                  package.status AS package_status
           FROM drawing_revision_package_review_approvals approval
           JOIN numbering_candidate_revision_drafts candidate
             ON candidate.id = approval.candidate_revision_id
            AND candidate.company_id = approval.company_id
           JOIN drawing_revision_packages package
             ON package.id = approval.package_id
            AND package.company_id = approval.company_id
           WHERE candidate.workspace_id = :workspaceId AND candidate.company_id = :companyId`,
          { workspaceId, companyId }
        ),
        this.client.queryOne<CandidateApprovalRow>(
          `SELECT request.*
           FROM approval_platform_requests request
           JOIN approval_platform_targets target ON target.request_id = request.id
           WHERE request.company_id = :companyId
             AND request.action_code = 'numbering.candidate_bundle_review'
             AND target.target_type = 'numbering_draft_workspace'
             AND target.target_id = :workspaceId
           ORDER BY request.requested_at DESC, request.id DESC
           LIMIT 1`,
          { workspaceId, companyId }
        )
      ]);
    }
    return this.buildWorkspaceRecord({
      workspace, root, parts, drawings, relations, reservations, latestApprovalRow,
      candidateRows, candidateFileRows, companionRows, latestBundleApprovalRow
    });
  }

  async updateWorkspace(input: UpdateNumberingDraftWorkspaceData) {
    return this.client.transaction(async (client) => {
      const repository = new AsyncNumberStateFlowRepository(client, this.clock, this.idFactory);
      const workspace = await repository.workspaceRow(input.workspaceId, input.companyId, true);
      if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
      if (workspace.lifecycle_status !== "active") throw new Error("WORKSPACE_NOT_ACTIVE");
      if (Number(workspace.row_version) !== input.expectedRowVersion) throw new Error("WORKSPACE_VERSION_CONFLICT");
      const locked = await client.queryOne<{ count: number | string }>(
        `SELECT count(*) AS count FROM number_candidate_reservations
         WHERE workspace_id = :workspaceId AND company_id = :companyId
           AND reservation_state IN ('review_locked', 'approved_locked', 'promoted')`,
        { workspaceId: input.workspaceId, companyId: input.companyId }
      );
      if (Number(locked?.count ?? 0) > 0) throw new Error("CANDIDATE_REVIEW_LOCKED");
      const current = await repository.getWorkspace(input.workspaceId, input.companyId);
      if (input.root !== undefined) {
        if (!current.root || !input.root || input.root.id !== current.root.id) throw new Error("WORKSPACE_ITEM_SET_MISMATCH");
        const hasRootCandidate = current.root.candidateReservationId !== null;
        if (hasRootCandidate && input.root.ruleVersionId !== current.root.ruleVersionId) throw new Error("CANDIDATE_RULE_VERSION_LOCKED");
        await client.execute(
          `UPDATE numbering_draft_roots SET core_name = :coreName, item_kind = :itemKind,
             rule_version_id = :ruleVersionId, updated_at = :updatedAt
           WHERE id = :id AND workspace_id = :workspaceId AND company_id = :companyId`,
          { ...input.root, workspaceId: input.workspaceId, companyId: input.companyId, updatedAt: this.clock() }
        );
      }
      if (input.parts !== undefined) {
        const currentIds = current.parts.map((part) => part.id).sort();
        const nextIds = input.parts.map((part) => part.id).sort();
        if (JSON.stringify(currentIds) !== JSON.stringify(nextIds)) throw new Error("WORKSPACE_ITEM_SET_MISMATCH");
        for (const part of input.parts) {
          await client.execute(
            `UPDATE numbering_draft_parts SET part_name = :partName, item_kind = :itemKind,
               is_universal = :isUniversal, universal_reason = :universalReason, custom_specification = :customSpecification,
               series_code = :seriesCode, updated_at = :updatedAt
             WHERE id = :id AND workspace_id = :workspaceId AND company_id = :companyId`,
            {
              ...part,
              workspaceId: input.workspaceId,
              companyId: input.companyId,
              isUniversal: part.isUniversal ? 1 : 0,
              updatedAt: this.clock()
            }
          );
        }
      }
      if (input.drawings !== undefined) {
        const currentIds = current.drawings.map((drawing) => drawing.id).sort();
        const nextIds = input.drawings.map((drawing) => drawing.id).sort();
        if (JSON.stringify(currentIds) !== JSON.stringify(nextIds)) throw new Error("WORKSPACE_ITEM_SET_MISMATCH");
        const ruleVersionId = current.root?.ruleVersionId ?? (await repository.sourceRoot(workspace.source_root_id!, input.companyId))?.rule_version_id;
        if (!ruleVersionId) throw new Error("SOURCE_ROOT_NOT_FOUND");
        for (const drawing of input.drawings) {
          assertPurposeAllowedForRule(drawing.purposeCode, ruleVersionId);
          await client.execute(
            `UPDATE numbering_draft_drawings SET purpose_code = :purposeCode,
               purpose_description = :purposeDescription, is_primary_manufacturing = :isPrimaryManufacturing,
               updated_at = :updatedAt
             WHERE id = :id AND workspace_id = :workspaceId AND company_id = :companyId`,
            {
              ...drawing,
              workspaceId: input.workspaceId,
              companyId: input.companyId,
              isPrimaryManufacturing: drawing.isPrimaryManufacturing ? 1 : 0,
              updatedAt: this.clock()
            }
          );
        }
      }
      await client.execute(
        `UPDATE numbering_draft_workspaces SET row_version = row_version + 1, updated_at = :updatedAt
         WHERE id = :workspaceId AND company_id = :companyId AND row_version = :expectedRowVersion`,
        { workspaceId: input.workspaceId, companyId: input.companyId, expectedRowVersion: input.expectedRowVersion, updatedAt: this.clock() }
      );
      await repository.insertAudit({
        actorId: input.actorId,
        action: "pdm.numbering.update_draft_workspace",
        detail: { companyId: input.companyId, workspaceId: input.workspaceId, fromVersion: input.expectedRowVersion }
      });
      await new UnifiedDrawingAsyncRepository(client).synchronizeWorkspace({
        workspaceId: input.workspaceId,
        companyId: input.companyId
      });
      return repository.getWorkspace(input.workspaceId, input.companyId);
    });
  }

  private async lockSequenceScope(companyId: string, sequenceScopeKey: string) {
    const now = this.clock();
    await this.client.execute(
      `INSERT INTO numbering_sequences (sequence_key, company_id, next_value, updated_at)
       VALUES (:sequenceScopeKey, :companyId, 1, :updatedAt)
       ON CONFLICT(sequence_key) DO NOTHING`,
      { sequenceScopeKey, companyId, updatedAt: now }
    );
    await this.client.queryOne<{ next_value: number }>(
      `SELECT next_value FROM numbering_sequences WHERE sequence_key = :sequenceScopeKey${this.client.kind === "postgres" ? " FOR UPDATE" : ""}`,
      { sequenceScopeKey }
    );
  }

  private async usedCodes(companyId: string, itemType: NumberCandidateItemType, sequenceScopeKey: string) {
    const [candidateRows, recoveryRows] = await Promise.all([
      this.client.query<{ candidate_code: string }>(
        `SELECT candidate_code FROM number_candidate_reservations
         WHERE company_id = :companyId AND draft_item_type = :itemType
           AND sequence_scope_key = :sequenceScopeKey
           AND reservation_state IN ('active', 'review_locked', 'approved_locked', 'promoted')`,
        { companyId, itemType, sequenceScopeKey }
      ),
      this.client.query<{ number_value: string }>(
        `SELECT number_value FROM numbering_recovery_reservations
         WHERE company_id = :companyId AND number_kind = :itemType AND reservation_status = 'reserved'`,
        { companyId, itemType }
      )
    ]);
    return [...candidateRows.map((row) => row.candidate_code), ...recoveryRows.map((row) => row.number_value)];
  }

  private async allocateCode(input: {
    companyId: string;
    itemType: NumberCandidateItemType;
    rootCode?: string;
    purposeCode?: NumberingDraftPurposeCode;
    ruleVersionId: string;
    sequenceScopeKey: string;
  }) {
    await this.lockSequenceScope(input.companyId, input.sequenceScopeKey);
    const reservedCodes = await this.usedCodes(input.companyId, input.itemType, input.sequenceScopeKey);
    let officialCodes: string[] = [];
    if (input.itemType === "root") {
      officialCodes = (await this.client.query<{ code: string }>(
        "SELECT root_code AS code FROM part_roots WHERE company_id = :companyId",
        { companyId: input.companyId }
      )).map((row) => row.code);
    } else if (input.itemType === "part") {
      officialCodes = (await this.client.query<{ code: string }>(
        "SELECT part_number AS code FROM part_numbers WHERE company_id = :companyId",
        { companyId: input.companyId }
      )).map((row) => row.code);
    } else {
      officialCodes = (await this.client.query<{ code: string }>(
        "SELECT drawing_number AS code FROM drawing_numbers WHERE company_id = :companyId",
        { companyId: input.companyId }
      )).map((row) => row.code);
    }
    const allCodes = [...officialCodes, ...reservedCodes];
    let sequenceNo: number;
    let candidateCode: string;
    if (input.itemType === "root") {
      sequenceNo = lowestAvailable(allCodes.map((code) => rootCodeToV3Ordinal(code) ?? 0), 26 * 9999, "ROOT");
      candidateCode = formatRootCodeForRule(sequenceNo, input.ruleVersionId);
    } else if (input.itemType === "part") {
      const rootCode = input.rootCode!;
      sequenceNo = lowestAvailable(allCodes.map((code) => sequenceFromPartCode(code, rootCode) ?? 0), 99, "PART");
      candidateCode = formatPartNumberForRule(rootCode, formatPartSequenceForRule(sequenceNo, input.ruleVersionId), input.ruleVersionId);
    } else {
      const rootCode = input.rootCode!;
      const purposeCode = input.purposeCode!;
      sequenceNo = lowestAvailable(allCodes.map((code) => sequenceFromDrawingCode(code, rootCode, purposeCode) ?? 0), 99, "DRAWING");
      candidateCode = formatDrawingNumberForRule(
        rootCode,
        purposeCode,
        formatDrawingSequenceForRule(sequenceNo, input.ruleVersionId),
        input.ruleVersionId
      );
    }
    await this.client.execute(
      `UPDATE numbering_sequences
       SET next_value = CASE WHEN next_value < :nextValue THEN :nextValue ELSE next_value END, updated_at = :updatedAt
       WHERE sequence_key = :sequenceScopeKey`,
      { sequenceScopeKey: input.sequenceScopeKey, nextValue: sequenceNo + 1, updatedAt: this.clock() }
    );
    return { sequenceNo, candidateCode };
  }

  private async reserveCandidate(input: {
    companyId: string;
    workspaceId: string;
    actorId: string;
    itemType: NumberCandidateItemType;
    itemId: string;
    rootCode?: string;
    purposeCode?: NumberingDraftPurposeCode;
    ruleVersionId: string;
    sequenceScopeKey: string;
  }) {
    for (let attempt = 1; attempt <= MAX_CANDIDATE_ALLOCATION_ATTEMPTS; attempt += 1) {
      const allocated = await this.allocateCode(input);
      const reservationId = this.idFactory();
      const savepoint = `candidate_attempt_${attempt}`;
      await this.client.execute(`SAVEPOINT ${savepoint}`);
      try {
        const now = this.clock();
        await this.client.execute(
          `INSERT INTO number_candidate_reservations (
             id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code,
             sequence_scope_key, sequence_no, reservation_state, row_version, created_by, created_at, updated_at
           ) VALUES (
             :id, :companyId, :workspaceId, :itemType, :itemId, :candidateCode,
             :sequenceScopeKey, :sequenceNo, 'active', 1, :actorId, :createdAt, :updatedAt
           )`,
          { ...input, ...allocated, id: reservationId, createdAt: now, updatedAt: now }
        );
        const table = input.itemType === "root"
          ? "numbering_draft_roots"
          : input.itemType === "part"
            ? "numbering_draft_parts"
            : "numbering_draft_drawings";
        await this.client.execute(
          `UPDATE ${table} SET candidate_reservation_id = :reservationId, updated_at = :updatedAt
           WHERE id = :itemId AND workspace_id = :workspaceId AND company_id = :companyId
             AND candidate_reservation_id IS NULL`,
          { reservationId, updatedAt: now, itemId: input.itemId, workspaceId: input.workspaceId, companyId: input.companyId }
        );
        await this.insertCandidateEvent({
          companyId: input.companyId,
          workspaceId: input.workspaceId,
          reservationId,
          eventType: "candidate_reserved",
          actorId: input.actorId,
          detail: { itemType: input.itemType, itemId: input.itemId, candidateCode: allocated.candidateCode, sequenceScopeKey: input.sequenceScopeKey }
        });
        await this.client.execute(`RELEASE SAVEPOINT ${savepoint}`);
        return { id: reservationId, ...allocated };
      } catch (error) {
        await this.client.execute(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await this.client.execute(`RELEASE SAVEPOINT ${savepoint}`);
        if (!isUniqueConstraintError(error) || attempt === MAX_CANDIDATE_ALLOCATION_ATTEMPTS) throw error;
      }
    }
    throw new Error("CANDIDATE_COLLISION");
  }

  async acquireCandidates(input: { workspaceId: string; companyId: string; actorId: string; expectedRowVersion: number }) {
    const workspace = await this.workspaceRow(input.workspaceId, input.companyId, true);
    if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
    if (workspace.lifecycle_status !== "active") throw new Error("WORKSPACE_NOT_ACTIVE");
    if (Number(workspace.row_version) !== input.expectedRowVersion) throw new Error("WORKSPACE_VERSION_CONFLICT");
    const current = await this.getWorkspace(input.workspaceId, input.companyId);
    if (current.reservations.some((reservation) => reservation.state !== "recycled")) throw new Error("CANDIDATE_ALREADY_ACQUIRED");
    const root = current.root;
    const sourceRoot = workspace.source_root_id ? await this.sourceRoot(workspace.source_root_id, input.companyId) : null;
    const ruleVersionId = root?.ruleVersionId ?? sourceRoot?.rule_version_id ?? NUMBERING_RULE_V3_ID;
    let rootCode = sourceRoot?.root_code ?? null;
    const acquired: Array<{ id: string; itemType: NumberCandidateItemType; itemId: string; candidateCode: string }> = [];
    if (root) {
      const sequenceScopeKey = `${input.companyId}:root:${ruleVersionId}`;
      const reservation = await this.reserveCandidate({
        ...input,
        itemType: "root",
        itemId: root.id,
        ruleVersionId,
        sequenceScopeKey
      });
      rootCode = reservation.candidateCode;
      acquired.push({ id: reservation.id, itemType: "root", itemId: root.id, candidateCode: reservation.candidateCode });
    }
    if (!rootCode) throw new Error("SOURCE_ROOT_NOT_FOUND");
    for (const part of current.parts) {
      const sequenceScopeKey = `${input.companyId}:part:${rootCode}:${ruleVersionId}`;
      const reservation = await this.reserveCandidate({
        ...input,
        itemType: "part",
        itemId: part.id,
        rootCode,
        ruleVersionId,
        sequenceScopeKey
      });
      acquired.push({ id: reservation.id, itemType: "part", itemId: part.id, candidateCode: reservation.candidateCode });
    }
    for (const drawing of current.drawings) {
      assertPurposeAllowedForRule(drawing.purposeCode, ruleVersionId);
      const sequenceScopeKey = `${input.companyId}:drawing:${rootCode}:${drawing.purposeCode}:${ruleVersionId}`;
      const reservation = await this.reserveCandidate({
        ...input,
        itemType: "drawing",
        itemId: drawing.id,
        rootCode,
        purposeCode: drawing.purposeCode,
        ruleVersionId,
        sequenceScopeKey
      });
      acquired.push({ id: reservation.id, itemType: "drawing", itemId: drawing.id, candidateCode: reservation.candidateCode });
    }
    await this.client.execute(
      `UPDATE numbering_draft_workspaces SET row_version = row_version + 1, updated_at = :updatedAt
       WHERE id = :workspaceId AND company_id = :companyId AND row_version = :expectedRowVersion`,
      { ...input, updatedAt: this.clock() }
    );
    await this.insertAudit({
      actorId: input.actorId,
      action: "pdm.numbering.acquire_candidate_numbers",
      detail: { companyId: input.companyId, workspaceId: input.workspaceId, reservations: acquired }
    });
    await new UnifiedDrawingAsyncRepository(this.client).synchronizeWorkspace({
      workspaceId: input.workspaceId,
      companyId: input.companyId
    });
    return this.getWorkspace(input.workspaceId, input.companyId);
  }

  async cancelWorkspace(input: {
    workspaceId: string;
    companyId: string;
    actorId: string;
    expectedRowVersion: number;
    reason: string;
  }) {
    const workspace = await this.workspaceRow(input.workspaceId, input.companyId, true);
    if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
    if (workspace.lifecycle_status !== "active") throw new Error("WORKSPACE_NOT_ACTIVE");
    if (Number(workspace.row_version) !== input.expectedRowVersion) throw new Error("WORKSPACE_VERSION_CONFLICT");
    const reservations = await this.client.query<ReservationRow>(
      `SELECT * FROM number_candidate_reservations
       WHERE workspace_id = :workspaceId AND company_id = :companyId
         AND reservation_state <> 'recycled'${this.client.kind === "postgres" ? " FOR UPDATE" : ""}`,
      input
    );
    if (reservations.some((reservation) => ["review_locked", "approved_locked", "promoted"].includes(reservation.reservation_state))) {
      throw new Error("CANDIDATE_RECYCLE_BLOCKED");
    }
    const now = this.clock();
    for (const reservation of reservations) {
      await this.client.execute(
        `UPDATE number_candidate_reservations SET reservation_state = 'recycled', row_version = row_version + 1,
           recycled_at = :recycledAt, recycled_by = :recycledBy, recycle_reason = :recycleReason, updated_at = :updatedAt
         WHERE id = :reservationId AND company_id = :companyId AND reservation_state = 'active'`,
        {
          reservationId: reservation.id,
          companyId: input.companyId,
          recycledAt: now,
          recycledBy: input.actorId,
          recycleReason: input.reason,
          updatedAt: now
        }
      );
      await this.insertCandidateEvent({
        companyId: input.companyId,
        workspaceId: input.workspaceId,
        reservationId: reservation.id,
        eventType: "candidate_recycled",
        actorId: input.actorId,
        detail: { candidateCode: reservation.candidate_code, reason: input.reason }
      });
    }
    await this.client.execute(
      `UPDATE numbering_draft_workspaces SET lifecycle_status = 'cancelled', row_version = row_version + 1,
         cancelled_at = :cancelledAt, cancelled_by = :cancelledBy, cancel_reason = :cancelReason, updated_at = :updatedAt
       WHERE id = :workspaceId AND company_id = :companyId AND row_version = :expectedRowVersion`,
      {
        ...input,
        cancelledAt: now,
        cancelledBy: input.actorId,
        cancelReason: input.reason,
        updatedAt: now
      }
    );
    await this.insertAudit({
      actorId: input.actorId,
      action: "pdm.numbering.cancel_draft_workspace",
      detail: {
        companyId: input.companyId,
        workspaceId: input.workspaceId,
        recycledReservations: reservations.map((reservation) => ({ id: reservation.id, candidateCode: reservation.candidate_code }))
      }
    });
    await new UnifiedDrawingAsyncRepository(this.client).synchronizeWorkspace({
      workspaceId: input.workspaceId,
      companyId: input.companyId
    });
    return this.getWorkspace(input.workspaceId, input.companyId);
  }

  async submitCandidateReview(input: {
    workspaceId: string;
    companyId: string;
    actorId: string;
    expectedRowVersion: number;
    reason: string;
  }) {
    const workspaceRow = await this.workspaceRow(input.workspaceId, input.companyId, true);
    if (!workspaceRow) throw new Error("WORKSPACE_NOT_FOUND");
    if (workspaceRow.lifecycle_status !== "active") throw new Error("WORKSPACE_NOT_ACTIVE");
    if (Number(workspaceRow.row_version) !== input.expectedRowVersion) throw new Error("WORKSPACE_VERSION_CONFLICT");
    const before = await this.getWorkspace(input.workspaceId, input.companyId);
    const expectedItemCount = (before.root ? 1 : 0) + before.parts.length + before.drawings.length;
    const candidates = before.reservations.filter((reservation) => reservation.state !== "recycled");
    if (expectedItemCount === 0 || candidates.length !== expectedItemCount || candidates.some((reservation) => reservation.state !== "active")) {
      throw new Error("CANDIDATE_REQUIRED_BEFORE_REVIEW");
    }
    if (before.latestApproval?.status === "pending") throw new Error("CANDIDATE_REVIEW_ALREADY_PENDING");

    const action = await this.client.queryOne<{ action_code: string }>(
      `SELECT action_code FROM approval_platform_actions
       WHERE action_code = 'numbering.candidate_publication_review' AND enabled = 1`
    );
    if (!action) throw new Error("APPROVAL_ACTION_NOT_REGISTERED");
    const requestId = `APR-${this.idFactory()}`;
    const now = this.clock();
    await this.client.execute(
      `INSERT INTO approval_platform_requests (
         id, company_id, package_id, action_code, domain_code, request_status, title, reason,
         requested_by, requested_at, apply_status, payload_json, created_at, updated_at
       ) VALUES (
         :id, :companyId, NULL, 'numbering.candidate_publication_review', 'numbering', 'pending',
         :title, :reason, :requestedBy, :requestedAt, 'pending', '{}', :createdAt, :updatedAt
       )`,
      {
        id: requestId,
        companyId: input.companyId,
        title: `圖料號發布審核：${before.root?.coreName ?? before.sourceRootId ?? before.id}`,
        reason: input.reason,
        requestedBy: input.actorId,
        requestedAt: now,
        createdAt: now,
        updatedAt: now
      }
    );
    await this.client.execute(
      `UPDATE number_candidate_reservations
       SET reservation_state = 'review_locked', approval_request_id = :requestId,
           row_version = row_version + 1, updated_at = :updatedAt
       WHERE workspace_id = :workspaceId AND company_id = :companyId AND reservation_state = 'active'`,
      { requestId, workspaceId: input.workspaceId, companyId: input.companyId, updatedAt: now }
    );
    const locked = await this.getWorkspace(input.workspaceId, input.companyId);
    const lockedCandidates = locked.reservations.filter((reservation) => reservation.state === "review_locked");
    if (lockedCandidates.length !== expectedItemCount) throw new Error("CANDIDATE_REVIEW_LOCK_FAILED");
    const { snapshot, snapshotJson, snapshotHash, factsHash } = buildCandidateSnapshot(locked);
    const targets: Array<{
      type: string;
      id: string;
      code: string | null;
      label: string;
      status: string;
      snapshot: Record<string, unknown>;
    }> = [{
      type: "numbering_draft_workspace",
      id: locked.id,
      code: null,
      label: locked.root?.coreName ?? locked.sourceRootId ?? locked.id,
      status: locked.lifecycleStatus,
      snapshot: { rowVersion: locked.rowVersion, factsHash }
    }];
    if (locked.root) {
      targets.push({
        type: "numbering_draft_root",
        id: locked.root.id,
        code: locked.root.candidateCode,
        label: locked.root.coreName,
        status: "review_locked",
        snapshot: { ...locked.root }
      });
    }
    for (const part of locked.parts) {
      targets.push({
        type: "numbering_draft_part",
        id: part.id,
        code: part.candidateCode,
        label: part.partName,
        status: "review_locked",
        snapshot: { ...part }
      });
    }
    for (const drawing of locked.drawings) {
      targets.push({
        type: "numbering_draft_drawing",
        id: drawing.id,
        code: drawing.candidateCode,
        label: drawing.purposeDescription || drawing.purposeCode,
        status: "review_locked",
        snapshot: { ...drawing }
      });
    }
    for (const [sortOrder, target] of targets.entries()) {
      await this.client.execute(
        `INSERT INTO approval_platform_targets (
           id, request_id, target_role, target_type, target_id, target_code, target_label,
           target_status, snapshot_json, sort_order, created_at
         ) VALUES (
           :id, :requestId, :targetRole, :targetType, :targetId, :targetCode, :targetLabel,
           :targetStatus, :snapshotJson, :sortOrder, :createdAt
         )`,
        {
          id: `APT-${this.idFactory()}`,
          requestId,
          targetRole: sortOrder === 0 ? "primary" : "child",
          targetType: target.type,
          targetId: target.id,
          targetCode: target.code,
          targetLabel: target.label,
          targetStatus: target.status,
          snapshotJson: canonicalJson(target.snapshot),
          sortOrder,
          createdAt: now
        }
      );
    }
    await this.client.execute(
      `INSERT INTO approval_platform_impact_snapshots (
         id, request_id, package_id, snapshot_hash, snapshot_json, captured_by, captured_at
       ) VALUES (
         :id, :requestId, NULL, :snapshotHash, :snapshotJson, :capturedBy, :capturedAt
       )`,
      {
        id: `APIS-${this.idFactory()}`,
        requestId,
        snapshotHash,
        snapshotJson,
        capturedBy: input.actorId,
        capturedAt: now
      }
    );
    await this.client.execute(
      `UPDATE approval_platform_requests
       SET payload_json = :payloadJson, updated_at = :updatedAt
       WHERE id = :requestId`,
      {
        requestId,
        payloadJson: canonicalJson({
          workspaceId: input.workspaceId,
          snapshotVersion: snapshot.snapshotVersion,
          snapshotHash,
          factsHash
        }),
        updatedAt: now
      }
    );
    for (const reservation of lockedCandidates) {
      await this.insertCandidateEvent({
        companyId: input.companyId,
        workspaceId: input.workspaceId,
        reservationId: reservation.id,
        eventType: "review_locked",
        actorId: input.actorId,
        detail: { requestId, candidateCode: reservation.candidateCode, rowVersion: reservation.rowVersion }
      });
    }
    await this.insertApprovalEvent({
      requestId,
      eventType: "approval_platform.request.submitted",
      actorId: input.actorId,
      detail: { actionCode: "numbering.candidate_publication_review", workspaceId: input.workspaceId, snapshotHash, targetCount: targets.length }
    });
    await this.insertAudit({
      actorId: input.actorId,
      action: "pdm.numbering.submit_candidate_review",
      detail: { companyId: input.companyId, workspaceId: input.workspaceId, requestId, snapshotHash }
    });
    return {
      workspace: await this.getWorkspace(input.workspaceId, input.companyId),
      requestId,
      snapshotHash
    };
  }

  async withdrawCandidateReview(input: {
    workspaceId: string;
    companyId: string;
    actorId: string;
    expectedRowVersion: number;
  }) {
    const workspaceRow = await this.workspaceRow(input.workspaceId, input.companyId, true);
    if (!workspaceRow) throw new Error("WORKSPACE_NOT_FOUND");
    if (workspaceRow.lifecycle_status !== "active") throw new Error("WORKSPACE_NOT_ACTIVE");
    if (Number(workspaceRow.row_version) !== input.expectedRowVersion) throw new Error("WORKSPACE_VERSION_CONFLICT");
    if (workspaceRow.owner_id !== input.actorId) throw new Error("REVIEW_WITHDRAW_OWNER_REQUIRED");
    const current = await this.getWorkspace(input.workspaceId, input.companyId);
    const requestId = current.latestApproval?.requestId;
    if (!requestId || current.latestApproval?.status !== "pending") throw new Error("CANDIDATE_REVIEW_NOT_PENDING");
    const now = this.clock();
    await this.client.execute(
      `UPDATE approval_platform_requests
       SET request_status = 'cancelled', apply_status = 'not_required', resolved_by = :actorId,
           resolved_at = :resolvedAt, updated_at = :updatedAt
       WHERE id = :requestId AND company_id = :companyId AND request_status = 'pending'`,
      { requestId, companyId: input.companyId, actorId: input.actorId, resolvedAt: now, updatedAt: now }
    );
    await this.client.execute(
      `UPDATE number_candidate_reservations
       SET reservation_state = 'active', approval_request_id = NULL,
           row_version = row_version + 1, updated_at = :updatedAt
       WHERE workspace_id = :workspaceId AND company_id = :companyId
         AND reservation_state = 'review_locked' AND approval_request_id = :requestId`,
      { requestId, workspaceId: input.workspaceId, companyId: input.companyId, updatedAt: now }
    );
    const unlocked = await this.getWorkspace(input.workspaceId, input.companyId);
    for (const reservation of unlocked.reservations.filter((entry) => entry.state === "active")) {
      await this.insertCandidateEvent({
        companyId: input.companyId,
        workspaceId: input.workspaceId,
        reservationId: reservation.id,
        eventType: "review_unlocked",
        actorId: input.actorId,
        detail: { requestId, reason: "withdrawn" }
      });
    }
    await this.insertApprovalEvent({ requestId, eventType: "approval_platform.request.withdrawn", actorId: input.actorId, detail: { workspaceId: input.workspaceId } });
    await this.insertAudit({
      actorId: input.actorId,
      action: "pdm.numbering.withdraw_candidate_review",
      detail: { companyId: input.companyId, workspaceId: input.workspaceId, requestId }
    });
    return { workspace: await this.getWorkspace(input.workspaceId, input.companyId), requestId };
  }

  async decideCandidateReview(input: {
    requestId: string;
    companyId: string;
    actorId: string;
    actorRole: string;
    decision: "approved" | "rejected" | "needs_info";
    comment: string | null;
  }) {
    const request = await this.client.queryOne<CandidateApprovalRow & { workspace_id: string }>(
      `SELECT r.*, t.target_id AS workspace_id
       FROM approval_platform_requests r
       JOIN approval_platform_targets t
         ON t.request_id = r.id AND t.target_type = 'numbering_draft_workspace'
       WHERE r.id = :requestId AND r.company_id = :companyId
         AND r.action_code = 'numbering.candidate_publication_review'
       ${this.client.kind === "postgres" ? "FOR UPDATE OF r" : ""}`,
      { requestId: input.requestId, companyId: input.companyId }
    );
    if (!request) throw new Error("APPROVAL_REQUEST_NOT_FOUND");
    if (request.request_status !== "pending") throw new Error(`APPROVAL_REQUEST_ALREADY_RESOLVED:${request.request_status}`);
    const workspace = await this.workspaceRow(request.workspace_id, input.companyId, true);
    if (!workspace) throw new Error("WORKSPACE_NOT_FOUND");
    const reservations = await this.client.query<ReservationRow>(
      `SELECT * FROM number_candidate_reservations
       WHERE workspace_id = :workspaceId AND company_id = :companyId
       ${this.client.kind === "postgres" ? "FOR UPDATE" : ""}`,
      { workspaceId: request.workspace_id, companyId: input.companyId }
    );
    if (reservations.length === 0 || reservations.some((reservation) => reservation.reservation_state !== "review_locked" || reservation.approval_request_id !== input.requestId)) {
      throw new Error("CANDIDATE_REVIEW_LOCK_MISMATCH");
    }
    const now = this.clock();
    await this.client.execute(
      `INSERT INTO approval_platform_decisions (
         id, request_id, approver_role, approver_id, decision, comment, decided_at
       ) VALUES (
         :id, :requestId, :approverRole, :approverId, :decision, :comment, :decidedAt
       )`,
      {
        id: `APD-${this.idFactory()}`,
        requestId: input.requestId,
        approverRole: input.actorRole,
        approverId: input.actorId,
        decision: input.decision,
        comment: input.comment,
        decidedAt: now
      }
    );

    const applySavepoint = "candidate_review_apply";
    await this.client.execute(`SAVEPOINT ${applySavepoint}`);
    try {
      this.approvalFaultInjector?.("before_candidate_apply");
      if (input.decision === "approved") {
        await this.client.execute(
          `UPDATE number_candidate_reservations
           SET reservation_state = 'approved_locked', row_version = row_version + 1, updated_at = :updatedAt
           WHERE workspace_id = :workspaceId AND company_id = :companyId
             AND reservation_state = 'review_locked' AND approval_request_id = :requestId`,
          { requestId: input.requestId, workspaceId: request.workspace_id, companyId: input.companyId, updatedAt: now }
        );
      } else {
        await this.client.execute(
          `UPDATE number_candidate_reservations
           SET reservation_state = 'active', approval_request_id = NULL,
               row_version = row_version + 1, updated_at = :updatedAt
           WHERE workspace_id = :workspaceId AND company_id = :companyId
             AND reservation_state = 'review_locked' AND approval_request_id = :requestId`,
          { requestId: input.requestId, workspaceId: request.workspace_id, companyId: input.companyId, updatedAt: now }
        );
      }
      this.approvalFaultInjector?.("after_candidate_apply");
      await this.client.execute(`RELEASE SAVEPOINT ${applySavepoint}`);
    } catch (error) {
      await this.client.execute(`ROLLBACK TO SAVEPOINT ${applySavepoint}`);
      await this.client.execute(`RELEASE SAVEPOINT ${applySavepoint}`);
      const faultPoint = error instanceof NumberStateApprovalApplyFault ? error.faultPoint : "candidate_apply_database_error";
      const applyError = error instanceof Error ? error.message.slice(0, 500) : "CANDIDATE_REVIEW_APPLY_FAILED";
      await this.client.execute(
        `UPDATE approval_platform_requests
         SET request_status = 'apply_failed', apply_status = 'failed', apply_attempts = apply_attempts + 1,
             apply_error = :applyError, resolved_by = :resolvedBy, resolved_at = :resolvedAt, updated_at = :updatedAt
         WHERE id = :requestId`,
        {
          requestId: input.requestId,
          applyError,
          resolvedBy: input.actorId,
          resolvedAt: now,
          updatedAt: now
        }
      );
      await this.insertApprovalEvent({
        requestId: input.requestId,
        eventType: "approval_platform.request.apply_failed",
        actorId: input.actorId,
        detail: { decision: input.decision, faultPoint }
      });
      await this.insertAudit({
        actorId: input.actorId,
        action: "pdm.numbering.candidate_review_apply_failed",
        detail: { companyId: input.companyId, workspaceId: request.workspace_id, requestId: input.requestId, decision: input.decision, faultPoint }
      });
      return { workspace: await this.getWorkspace(request.workspace_id, input.companyId), requestId: input.requestId, applyFailed: true };
    }

    await this.client.execute(
      `UPDATE approval_platform_requests
       SET request_status = :requestStatus, apply_status = 'applied', apply_attempts = apply_attempts + 1,
           apply_error = NULL, resolved_by = :resolvedBy, resolved_at = :resolvedAt,
           applied_by = :appliedBy, applied_at = :appliedAt, updated_at = :updatedAt
       WHERE id = :requestId`,
      {
        requestId: input.requestId,
        requestStatus: input.decision,
        resolvedBy: input.actorId,
        resolvedAt: now,
        appliedBy: input.actorId,
        appliedAt: now,
        updatedAt: now
      }
    );
    for (const reservation of reservations) {
      await this.insertCandidateEvent({
        companyId: input.companyId,
        workspaceId: request.workspace_id,
        reservationId: reservation.id,
        eventType: input.decision === "approved" ? "approval_locked" : "review_unlocked",
        actorId: input.actorId,
        detail: { requestId: input.requestId, decision: input.decision }
      });
    }
    await this.insertApprovalEvent({
      requestId: input.requestId,
      eventType: "approval_platform.request.decided",
      actorId: input.actorId,
      detail: { decision: input.decision, approverRole: input.actorRole, applyStatus: "applied" }
    });
    await this.insertAudit({
      actorId: input.actorId,
      action: "pdm.numbering.decide_candidate_review",
      detail: { companyId: input.companyId, workspaceId: request.workspace_id, requestId: input.requestId, decision: input.decision }
    });
    return { workspace: await this.getWorkspace(request.workspace_id, input.companyId), requestId: input.requestId, applyFailed: false };
  }

  async retryCandidateReviewApply(input: {
    requestId: string;
    companyId: string;
    actorId: string;
  }) {
    const request = await this.client.queryOne<CandidateApprovalRow & { workspace_id: string }>(
      `SELECT r.*, t.target_id AS workspace_id
       FROM approval_platform_requests r
       JOIN approval_platform_targets t
         ON t.request_id = r.id AND t.target_type = 'numbering_draft_workspace'
       WHERE r.id = :requestId AND r.company_id = :companyId
         AND r.action_code = 'numbering.candidate_publication_review'
       ${this.client.kind === "postgres" ? "FOR UPDATE OF r" : ""}`,
      { requestId: input.requestId, companyId: input.companyId }
    );
    if (!request) throw new Error("APPROVAL_REQUEST_NOT_FOUND");
    if (request.request_status !== "apply_failed") throw new Error(`APPROVAL_REQUEST_NOT_READY_TO_APPLY:${request.request_status}`);
    const decision = await this.client.queryOne<{ decision: "approved" | "rejected" | "needs_info" }>(
      `SELECT decision FROM approval_platform_decisions
       WHERE request_id = :requestId
       ORDER BY decided_at DESC, id DESC
       LIMIT 1`,
      { requestId: input.requestId }
    );
    if (!decision) throw new Error("APPROVAL_DECISION_NOT_FOUND");
    await this.workspaceRow(request.workspace_id, input.companyId, true);
    const reservations = await this.client.query<ReservationRow>(
      `SELECT * FROM number_candidate_reservations
       WHERE workspace_id = :workspaceId AND company_id = :companyId
       ${this.client.kind === "postgres" ? "FOR UPDATE" : ""}`,
      { workspaceId: request.workspace_id, companyId: input.companyId }
    );
    if (reservations.length === 0 || reservations.some((reservation) => reservation.reservation_state !== "review_locked" || reservation.approval_request_id !== input.requestId)) {
      throw new Error("CANDIDATE_REVIEW_LOCK_MISMATCH");
    }
    const now = this.clock();
    this.approvalFaultInjector?.("before_candidate_apply_retry");
    if (decision.decision === "approved") {
      await this.client.execute(
        `UPDATE number_candidate_reservations
         SET reservation_state = 'approved_locked', row_version = row_version + 1, updated_at = :updatedAt
         WHERE workspace_id = :workspaceId AND company_id = :companyId
           AND reservation_state = 'review_locked' AND approval_request_id = :requestId`,
        { requestId: input.requestId, workspaceId: request.workspace_id, companyId: input.companyId, updatedAt: now }
      );
    } else {
      await this.client.execute(
        `UPDATE number_candidate_reservations
         SET reservation_state = 'active', approval_request_id = NULL,
             row_version = row_version + 1, updated_at = :updatedAt
         WHERE workspace_id = :workspaceId AND company_id = :companyId
           AND reservation_state = 'review_locked' AND approval_request_id = :requestId`,
        { requestId: input.requestId, workspaceId: request.workspace_id, companyId: input.companyId, updatedAt: now }
      );
    }
    await this.client.execute(
      `UPDATE approval_platform_requests
       SET request_status = :requestStatus, apply_status = 'applied', apply_attempts = apply_attempts + 1,
           apply_error = NULL, applied_by = :appliedBy, applied_at = :appliedAt, updated_at = :updatedAt
       WHERE id = :requestId`,
      {
        requestId: input.requestId,
        requestStatus: decision.decision,
        appliedBy: input.actorId,
        appliedAt: now,
        updatedAt: now
      }
    );
    for (const reservation of reservations) {
      await this.insertCandidateEvent({
        companyId: input.companyId,
        workspaceId: request.workspace_id,
        reservationId: reservation.id,
        eventType: decision.decision === "approved" ? "approval_locked" : "review_unlocked",
        actorId: input.actorId,
        detail: { requestId: input.requestId, decision: decision.decision, retry: true }
      });
    }
    await this.insertApprovalEvent({
      requestId: input.requestId,
      eventType: "approval_platform.request.applied",
      actorId: input.actorId,
      detail: { decision: decision.decision, retry: true }
    });
    await this.insertAudit({
      actorId: input.actorId,
      action: "pdm.numbering.retry_candidate_review_apply",
      detail: { companyId: input.companyId, workspaceId: request.workspace_id, requestId: input.requestId, decision: decision.decision }
    });
    return { workspace: await this.getWorkspace(request.workspace_id, input.companyId), requestId: input.requestId, decision: decision.decision };
  }

  async publishApprovedWorkspace(input: {
    workspaceId: string;
    companyId: string;
    actorId: string;
    evidence: PublicationEvidenceResult;
    approvalOverride?: {
      requestId: string;
      snapshotHash: string;
      factsHash: string;
      lockedReservations: Array<{ id: string; candidateCode: string; rowVersion: number }>;
      reservationVersionOffset: number;
    };
  }): Promise<NumberingPublicationResult> {
    const workspaceRow = await this.workspaceRow(input.workspaceId, input.companyId, true);
    if (!workspaceRow) throw new Error("WORKSPACE_NOT_FOUND");
    if (workspaceRow.lifecycle_status === "published") throw new Error("WORKSPACE_ALREADY_PUBLISHED");
    if (workspaceRow.lifecycle_status !== "active") throw new Error("WORKSPACE_NOT_ACTIVE");
    const workspace = await this.getWorkspace(input.workspaceId, input.companyId);
    const approval = workspace.latestApproval;
    if (!input.approvalOverride && (!approval || approval.status !== "approved" || approval.applyStatus !== "applied" || !approval.snapshotHash)) {
      throw new Error("CANDIDATE_APPROVAL_REQUIRED");
    }
    const approvalRequestId = input.approvalOverride?.requestId ?? approval!.requestId;
    const approvalSnapshotHash = input.approvalOverride?.snapshotHash ?? approval!.snapshotHash!;
    const reservations = await this.client.query<ReservationRow>(
      `SELECT * FROM number_candidate_reservations
       WHERE workspace_id = :workspaceId AND company_id = :companyId
       ORDER BY draft_item_type, draft_item_id
       ${this.client.kind === "postgres" ? "FOR UPDATE" : ""}`,
      { workspaceId: input.workspaceId, companyId: input.companyId }
    );
    if (reservations.length === 0 || reservations.some((reservation) => reservation.reservation_state !== "approved_locked" || reservation.approval_request_id !== approvalRequestId)) {
      throw new Error("CANDIDATE_APPROVAL_LOCK_MISMATCH");
    }
    const snapshotRow = await this.client.queryOne<{ snapshot_hash: string; snapshot_json: string | Record<string, unknown> }>(
      `SELECT snapshot_hash, snapshot_json
       FROM approval_platform_impact_snapshots
       WHERE request_id = :requestId
       ORDER BY captured_at DESC, id DESC
       LIMIT 1`,
      { requestId: approvalRequestId }
    );
    if (!snapshotRow || snapshotRow.snapshot_hash !== approvalSnapshotHash) throw new Error("APPROVAL_SNAPSHOT_STALE");
    const snapshot = parseJsonObject(snapshotRow.snapshot_json);
    const factsHash = sha256(canonicalJson(candidateSnapshotFacts(workspace)));
    const override = input.approvalOverride;
    if ((override?.factsHash ?? snapshot.factsHash) !== factsHash) throw new Error("APPROVAL_SNAPSHOT_STALE");
    const lockedReservations = override?.lockedReservations ?? (Array.isArray(snapshot.lockedReservations)
      ? snapshot.lockedReservations as Array<Record<string, unknown>>
      : []);
    const lockedById = new Map(lockedReservations.map((reservation) => [String(reservation.id), reservation]));
    for (const reservation of reservations) {
      const locked = lockedById.get(reservation.id);
      if (
        !locked || String(locked.candidateCode) !== reservation.candidate_code ||
        Number(locked.rowVersion) + (override?.reservationVersionOffset ?? 1) !== Number(reservation.row_version)
      ) {
        throw new Error("APPROVAL_SNAPSHOT_STALE");
      }
    }
    const evidence = await new DatabasePublicationEvidencePort(this.client).verify({
      companyId: input.companyId,
      workspaceId: input.workspaceId,
      snapshotHash: approvalSnapshotHash,
      draftDrawingIds: workspace.drawings.map((drawing) => drawing.id)
    });
    if (evidence.status === "not_ready" || evidence.token !== input.evidence.token || evidence.ruleVersion !== input.evidence.ruleVersion) {
      throw new Error("PUBLICATION_EVIDENCE_NOT_READY");
    }
    const now = this.clock();
    const reservationByItem = new Map(reservations.map((reservation) => [`${reservation.draft_item_type}:${reservation.draft_item_id}`, reservation]));
    const sourceRoot = workspace.sourceRootId ? await this.sourceRoot(workspace.sourceRootId, input.companyId) : null;
    const sourceContext = await this.validateSourceContext({
      companyId: input.companyId,
      draftMode: workspace.draftMode,
      sourceRootId: workspace.sourceRootId,
      sourceDrawingNumberId: workspace.sourceDrawingNumberId,
      sourcePartNumberId: workspace.sourcePartNumberId,
      sourceLinkType: workspace.sourceLinkType,
      drawings: workspace.drawings
    });
    const rootReservation = workspace.root ? reservationByItem.get(`root:${workspace.root.id}`) : null;
    const rootId = workspace.root ? `part-root-${rootReservation?.id ?? "missing"}` : sourceRoot?.id;
    if (!rootId || (workspace.root && !rootReservation)) throw new Error("CANDIDATE_ROOT_REQUIRED");
    const ruleVersionId = workspace.root?.ruleVersionId ?? sourceRoot?.rule_version_id ?? NUMBERING_RULE_V3_ID;
    const partIds: string[] = [];
    const drawingIds: string[] = [];
    const relationIds: string[] = [];
    const partMasterByDraft = new Map<string, string>();
    const drawingMasterByDraft = new Map<string, string>();

    if (workspace.root && rootReservation) {
      this.approvalFaultInjector?.("before_root_insert");
      await this.client.execute(
        `INSERT INTO part_roots (
           id, company_id, root_code, core_name, item_kind, record_status,
           rule_version_id, created_by, created_at, updated_at
         ) VALUES (
           :id, :companyId, :rootCode, :coreName, :itemKind, 'Active',
           :ruleVersionId, :createdBy, :createdAt, :updatedAt
         )`,
        {
          id: rootId,
          companyId: input.companyId,
          rootCode: rootReservation.candidate_code,
          coreName: workspace.root.coreName,
          itemKind: workspace.root.itemKind,
          ruleVersionId,
          createdBy: input.actorId,
          createdAt: now,
          updatedAt: now
        }
      );
    }
    for (const part of workspace.parts) {
      const reservation = reservationByItem.get(`part:${part.id}`);
      if (!reservation) throw new Error("CANDIDATE_PART_REQUIRED");
      const masterId = `part-number-${reservation.id}`;
      this.approvalFaultInjector?.("before_part_insert");
      await this.client.execute(
        `INSERT INTO part_numbers (
           id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name,
           item_kind, is_universal, custom_specification, series_code, record_status,
           universal_reason, rule_version_id, created_by, created_at, updated_at
         ) VALUES (
           :id, :companyId, :partRootId, :partNumber, :sequenceNo, :sequenceCode, :partName,
           :itemKind, :isUniversal, :customSpecification, :seriesCode, 'Active',
           :universalReason, :ruleVersionId, :createdBy, :createdAt, :updatedAt
         )`,
        {
          id: masterId,
          companyId: input.companyId,
          partRootId: rootId,
          partNumber: reservation.candidate_code,
          sequenceNo: reservation.sequence_no,
          sequenceCode: formatPartSequenceForRule(Number(reservation.sequence_no), ruleVersionId),
          partName: part.partName,
          itemKind: part.itemKind,
          isUniversal: part.isUniversal ? 1 : 0,
          universalReason: part.universalReason,
          customSpecification: part.customSpecification,
          seriesCode: part.seriesCode,
          ruleVersionId,
          createdBy: input.actorId,
          createdAt: now,
          updatedAt: now
        }
      );
      partIds.push(masterId);
      partMasterByDraft.set(part.id, masterId);
    }
    for (const drawing of workspace.drawings) {
      const reservation = reservationByItem.get(`drawing:${drawing.id}`);
      if (!reservation) throw new Error("CANDIDATE_DRAWING_REQUIRED");
      const masterId = `drawing-number-${reservation.id}`;
      this.approvalFaultInjector?.("before_drawing_insert");
      await this.client.execute(
        `INSERT INTO drawing_numbers (
           id, company_id, part_root_id, drawing_number, purpose_code, purpose_description,
           sequence_no, is_primary_manufacturing, record_status,
           rule_version_id, created_by, created_at, updated_at
         ) VALUES (
           :id, :companyId, :partRootId, :drawingNumber, :purposeCode, :purposeDescription,
           :sequenceNo, :isPrimaryManufacturing, 'Active',
           :ruleVersionId, :createdBy, :createdAt, :updatedAt
         )`,
        {
          id: masterId,
          companyId: input.companyId,
          partRootId: rootId,
          drawingNumber: reservation.candidate_code,
          purposeCode: drawing.purposeCode,
          purposeDescription: drawing.purposeDescription,
          sequenceNo: reservation.sequence_no,
          isPrimaryManufacturing: drawing.isPrimaryManufacturing ? 1 : 0,
          ruleVersionId,
          createdBy: input.actorId,
          createdAt: now,
          updatedAt: now
        }
      );
      drawingIds.push(masterId);
      drawingMasterByDraft.set(drawing.id, masterId);
    }
    for (const relation of workspace.relations) {
      const drawingNumberId = drawingMasterByDraft.get(relation.drawingDraftId);
      const partNumberId = partMasterByDraft.get(relation.partDraftId);
      if (!drawingNumberId || !partNumberId) throw new Error("DRAFT_RELATION_TARGET_MISSING");
      const relationId = `drawing-part-link-${relation.id}`;
      this.approvalFaultInjector?.("before_relation_insert");
      await this.client.execute(
        `INSERT INTO drawing_part_links (
           id, drawing_number_id, part_number_id, link_type, created_by, created_at
         ) VALUES (
           :id, :drawingNumberId, :partNumberId, :linkType, :createdBy, :createdAt
         )`,
        {
          id: relationId,
          drawingNumberId,
          partNumberId,
          linkType: relation.linkType,
          createdBy: input.actorId,
          createdAt: now
        }
      );
      relationIds.push(relationId);
    }
    if (sourceContext.sourceDrawing && workspace.sourceLinkType) {
      for (const part of workspace.parts) {
        const partNumberId = partMasterByDraft.get(part.id);
        if (!partNumberId) throw new Error("DRAFT_RELATION_TARGET_MISSING");
        const relationId = `drawing-part-link-source-${workspace.id}-${part.id}`;
        this.approvalFaultInjector?.("before_relation_insert");
        await this.client.execute(
          `INSERT INTO drawing_part_links (
             id, drawing_number_id, part_number_id, link_type, created_by, created_at
           ) VALUES (
             :id, :drawingNumberId, :partNumberId, :linkType, :createdBy, :createdAt
           )`,
          {
            id: relationId,
            drawingNumberId: sourceContext.sourceDrawing.id,
            partNumberId,
            linkType: workspace.sourceLinkType,
            createdBy: input.actorId,
            createdAt: now
          }
        );
        relationIds.push(relationId);
      }
    }
    if (sourceContext.sourcePart && workspace.sourceLinkType) {
      for (const drawing of workspace.drawings) {
        const drawingNumberId = drawingMasterByDraft.get(drawing.id);
        if (!drawingNumberId) throw new Error("DRAFT_RELATION_TARGET_MISSING");
        const relationId = `drawing-part-link-source-${workspace.id}-${drawing.id}`;
        this.approvalFaultInjector?.("before_relation_insert");
        await this.client.execute(
          `INSERT INTO drawing_part_links (
             id, drawing_number_id, part_number_id, link_type, created_by, created_at
           ) VALUES (
             :id, :drawingNumberId, :partNumberId, :linkType, :createdBy, :createdAt
           )`,
          {
            id: relationId,
            drawingNumberId,
            partNumberId: sourceContext.sourcePart.id,
            linkType: workspace.sourceLinkType,
            createdBy: input.actorId,
            createdAt: now
          }
        );
        relationIds.push(relationId);
      }
    }
    for (const reservation of reservations) {
      const promotedMasterType = reservation.draft_item_type === "root"
        ? "part_root"
        : reservation.draft_item_type === "part" ? "part_number" : "drawing_number";
      const promotedMasterId = reservation.draft_item_type === "root"
        ? rootId
        : reservation.draft_item_type === "part"
          ? partMasterByDraft.get(reservation.draft_item_id)
          : drawingMasterByDraft.get(reservation.draft_item_id);
      if (!promotedMasterId) throw new Error("PROMOTED_MASTER_TARGET_MISSING");
      this.approvalFaultInjector?.("before_reservation_promotion");
      await this.client.execute(
        `UPDATE number_candidate_reservations
         SET reservation_state = 'promoted', row_version = row_version + 1,
             promoted_master_type = :promotedMasterType, promoted_master_id = :promotedMasterId,
             promoted_at = :promotedAt, updated_at = :updatedAt
         WHERE id = :reservationId AND company_id = :companyId
           AND reservation_state = 'approved_locked' AND approval_request_id = :requestId`,
        {
          reservationId: reservation.id,
          companyId: input.companyId,
          requestId: approvalRequestId,
          promotedMasterType,
          promotedMasterId,
          promotedAt: now,
          updatedAt: now
        }
      );
      await this.insertCandidateEvent({
        companyId: input.companyId,
        workspaceId: input.workspaceId,
        reservationId: reservation.id,
        eventType: "candidate_promoted",
        actorId: input.actorId,
        detail: { requestId: approvalRequestId, promotedMasterType, promotedMasterId, candidateCode: reservation.candidate_code }
      });
    }
    this.approvalFaultInjector?.("before_workspace_publish");
    await this.client.execute(
      `UPDATE numbering_draft_workspaces
       SET lifecycle_status = 'published', row_version = row_version + 1,
           published_at = :publishedAt, published_by = :publishedBy, updated_at = :updatedAt
       WHERE id = :workspaceId AND company_id = :companyId AND lifecycle_status = 'active'`,
      {
        workspaceId: input.workspaceId,
        companyId: input.companyId,
        publishedAt: now,
        publishedBy: input.actorId,
        updatedAt: now
      }
    );
    this.approvalFaultInjector?.("before_publication_audit");
    await this.insertAudit({
      actorId: input.actorId,
      action: "pdm.numbering.publish_official_numbers",
      detail: {
        companyId: input.companyId,
        workspaceId: input.workspaceId,
        requestId: approvalRequestId,
        snapshotHash: approvalSnapshotHash,
        evidence: {
          status: evidence.status,
          ruleVersion: evidence.ruleVersion,
          references: evidence.references.map((reference) => ({
            evidenceId: reference.evidenceId,
            draftDrawingId: reference.draftDrawingId,
            provider: reference.provider,
            bucket: reference.bucket,
            objectKey: reference.objectKey,
            generation: reference.generation,
            contentHash: reference.contentHash,
            mediaType: reference.mediaType,
            finalizedAt: reference.finalizedAt
          }))
        },
        masters: { rootId, partIds, drawingIds, relationIds }
      }
    });
    await new UnifiedDrawingAsyncRepository(this.client).synchronizeWorkspace({
      workspaceId: input.workspaceId,
      companyId: input.companyId
    });
    return {
      workspace: await this.getWorkspace(input.workspaceId, input.companyId),
      approvalRequestId,
      snapshotHash: approvalSnapshotHash,
      evidence,
      masters: { rootId, partIds, drawingIds, relationIds }
    };
  }

  private async publishedWorkspaceResult(
    workspaceId: string,
    companyId: string,
    evidence: PublicationEvidenceResult
  ): Promise<NumberingPublicationResult> {
    const workspace = await this.getWorkspace(workspaceId, companyId);
    const reservations = await this.client.query<ReservationRow>(
      `SELECT * FROM number_candidate_reservations
       WHERE workspace_id = :workspaceId AND company_id = :companyId AND reservation_state = 'promoted'
       ORDER BY draft_item_type, draft_item_id`,
      { workspaceId, companyId }
    );
    if (reservations.length === 0 || !workspace.latestApproval?.snapshotHash) throw new Error("PUBLISHED_WORKSPACE_INCONSISTENT");
    const root = reservations.find((reservation) => reservation.promoted_master_type === "part_root");
    return {
      workspace,
      approvalRequestId: workspace.latestApproval.requestId,
      snapshotHash: workspace.latestApproval.snapshotHash,
      evidence,
      masters: {
        rootId: root?.promoted_master_id ?? workspace.sourceRootId ?? "",
        partIds: reservations.filter((reservation) => reservation.promoted_master_type === "part_number").map((reservation) => reservation.promoted_master_id!).filter(Boolean),
        drawingIds: reservations.filter((reservation) => reservation.promoted_master_type === "drawing_number").map((reservation) => reservation.promoted_master_id!).filter(Boolean),
        relationIds: [
          ...workspace.relations.map((relation) => `drawing-part-link-${relation.id}`),
          ...(workspace.sourceDrawingNumberId
            ? workspace.parts.map((part) => `drawing-part-link-source-${workspace.id}-${part.id}`)
            : []),
          ...(workspace.sourcePartNumberId
            ? workspace.drawings.map((drawing) => `drawing-part-link-source-${workspace.id}-${drawing.id}`)
            : [])
        ]
      }
    };
  }

  async classifyLegacyNumberingDryRun(companyId: string) {
    const [draftRows, ambiguousMasterRows] = await Promise.all([
      this.client.query<{
        id: string;
        reserved_part_number: string;
        status: string;
        official_id: string | null;
      }>(
        `SELECT d.id, d.reserved_part_number, d.status, p.id AS official_id
         FROM part_number_drafts d
         LEFT JOIN part_numbers p
           ON p.company_id = d.company_id AND p.part_number = d.reserved_part_number
         WHERE d.company_id = :companyId
         ORDER BY d.created_at, d.id`,
        { companyId }
      ),
      this.client.query<{ id: string; part_number: string }>(
        `SELECT p.id, p.part_number FROM part_numbers p
         WHERE p.company_id = :companyId AND p.record_status = 'Draft'
           AND NOT EXISTS (
             SELECT 1 FROM part_number_drafts d
             WHERE d.company_id = p.company_id AND d.reserved_part_number = p.part_number
           )
         ORDER BY p.created_at, p.id`,
        { companyId }
      )
    ]);
    const classifications = draftRows.map((row) => {
      let classification: "candidate_draft" | "controlled_legacy" | "recycled_history" | "official_non_reusable";
      if (row.official_id) classification = "official_non_reusable";
      else if (row.status === "voided") classification = "recycled_history";
      else if (["pending_review", "released", "needs_reconfirmation"].includes(row.status)) classification = "controlled_legacy";
      else classification = "candidate_draft";
      return { sourceType: "part_number_draft" as const, sourceId: row.id, code: row.reserved_part_number, classification };
    });
    return {
      mode: "dry_run" as const,
      companyId,
      classifications,
      ambiguous: ambiguousMasterRows.map((row) => ({
        sourceType: "part_number" as const,
        sourceId: row.id,
        code: row.part_number,
        classification: "ambiguous_report_only" as const
      })),
      mutationCount: 0
    };
  }
}
