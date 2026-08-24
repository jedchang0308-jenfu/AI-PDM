import crypto from "node:crypto";
import { diffBomWorkbenchLines as diffBomWorkbenchLinesShared } from "@/lib/bom-workbench-diff";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { parseRevisionCode } from "@/lib/revision-policy";
import type {
  BomDraftFloatingTopic,
  BomApplicableParent,
  BomSharedComponent,
  BomReconfirmationFlag,
  BomReleaseSnapshotDetail,
  BomReleaseGateIssue,
  BomWorkbenchDraftDetail,
  BomWorkbenchListRecord,
  BomWorkbenchDraftSummary,
  BomWorkbenchLine,
  BomWorkbenchSummary
} from "@/lib/types";
import { assertMajorBomRevision, canonicalSha256, normalizeStableIds, SharedBomError, SHARED_BOM_LIMITS, validateSharedGraph, type SharedBomComponentInput } from "@/lib/bom-shared-structure";
import { getBomApplicabilityCandidateContractAsync } from "@/lib/bom-create-context";
import { assertSharedReleaseSnapshotIntegrity } from "@/lib/bom-release-integrity";

type BomWorkbenchParentRow = Omit<BomWorkbenchSummary, "drafts" | "active_draft">;
type AsyncBomReleaseSnapshotRow = Omit<BomReleaseSnapshotDetail, "lines"> & { line_snapshot_json: string };
export type BomWorkbenchLifecycleAction = "release" | "obsolete";

export type ListBomWorkbenchRecordsInput = {
  companyId: string;
  query?: string;
  status?: BomWorkbenchDraftSummary["status"] | "";
  limit?: number;
  cursor?: {
    updatedAt: string;
    definitionKey: string;
    revisionNumber: number;
    draftId: string;
  } | null;
};

export type BomWorkbenchComparableLine = {
  key: string;
  node_type: "item" | "group";
  label: string;
  part_number: string | null;
  revision: string | null;
  group_name: string | null;
  quantity: number | null;
  parent_path: string;
  level: number;
  sequence_no: number;
};

export type BomWorkbenchLineDiffChange = {
  key: string;
  change_type: "added" | "removed" | "changed" | "unchanged";
  label: string;
  before: BomWorkbenchComparableLine | null;
  after: BomWorkbenchComparableLine | null;
  changed_fields: string[];
};

export type BomWorkbenchDraftDiffResult = {
  draft: BomWorkbenchDraftDetail;
  base_snapshot: BomReleaseSnapshotDetail | null;
  summary: {
    added_count: number;
    removed_count: number;
    changed_count: number;
    unchanged_count: number;
  };
  changes: BomWorkbenchLineDiffChange[];
  baseReleaseSnapshotId?: string | null;
  parentChanges?: { added: string[]; removed: string[] };
  logicalLineChanges?: Array<{
    logicalLineId: string;
    changeTypes: Array<"added" | "removed" | "moved" | "quantity_changed" | "candidate_changed" | "parent_mapping_changed" | "unchanged">;
  }>;
  candidateChanges?: Array<{ logicalLineId: string; before: string[]; after: string[] }>;
  parentMappingChanges?: Array<{
    logicalLineId: string;
    parentPartNumberId: string;
    beforeChildPartNumberId: string | null;
    afterChildPartNumberId: string | null;
  }>;
  resolvedParentImpacts?: Array<{ parentPartNumberId: string; changedResolvedLineCount: number }>;
};

export type BomWorkbenchPendingReview = {
  id: string;
  bom_draft_id: string;
  status: "PendingReview";
  lifecycle_action: BomWorkbenchLifecycleAction;
  submitted_by: string;
  submitted_by_name: string | null;
  change_reason: string;
  submitted_at: string;
  parent_submission_id: string;
  parent_part_number: string;
  parent_part_name: string;
  parent_drawing_number: string;
  parent_revision: string;
  draft_name: string;
  review_attempt: number;
  diff: BomWorkbenchDraftDiffResult;
};

export type BomWorkbenchReview = {
  id: string;
  bom_draft_id: string;
  status: "PendingReview" | "Approved" | "Rejected" | "Cancelled";
  lifecycle_action: BomWorkbenchLifecycleAction;
  submitted_by: string;
  reviewed_by: string | null;
  change_reason: string;
  decision_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  review_schema_version?: number;
  definition_row_version?: number | null;
  editor_version?: number | null;
  review_snapshot_json?: string | null;
  review_snapshot_hash?: string | null;
};

export type BomWorkbenchObsoleteHistoryRecord = {
  bom_draft_id: string;
  draft_name: string;
  draft_status: "Obsolete";
  parent_submission_id: string;
  parent_part_number: string;
  parent_part_name: string;
  parent_drawing_number: string;
  parent_revision: string;
  line_count: number;
  review_id: string | null;
  submitted_by_name: string | null;
  reviewed_by_name: string | null;
  change_reason: string | null;
  decision_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  snapshot_id: string | null;
  released_at: string | null;
  obsolete_at: string | null;
};

export type ListBomWorkbenchObsoleteHistoryInput = {
  companyId: string;
  limit?: number;
};

export type SetAsyncBomWorkbenchActiveDraftInput = {
  draftId: string;
  actorId: string | null;
};

export type DecideAsyncBomWorkbenchReviewInput = {
  reviewId: string;
  actorId: string;
  decisionReason?: string;
};

export type ApproveAsyncBomWorkbenchReviewResult = {
  review: BomWorkbenchReview | null;
  draft: BomWorkbenchDraftDetail | null;
  snapshotId: string | null;
};

export type SubmitAsyncBomWorkbenchDraftReviewInput = {
  draftId: string;
  actorId: string;
  changeReason: string;
};

export type RequestAsyncBomWorkbenchObsoleteReviewInput = {
  draftId: string;
  actorId: string;
  reason: string;
};

export type ReconfirmAsyncBomReplacementFlagsInput = {
  draftId: string;
  actorId: string;
  note?: string;
};

export type DeleteAsyncBomWorkbenchDraftInput = {
  draftId: string;
  actorId: string | null;
  reason?: string;
};

export type RestoreAsyncBomWorkbenchDraftInput = {
  draftId: string;
  actorId: string | null;
  reason?: string;
};

export type SaveAsyncBomWorkbenchDraftTreeInput = {
  draftId: string;
  actorId: string | null;
  reason?: string;
  expectedEditorVersion: number;
  lines: Array<{
    id?: string;
    logicalLineId?: string;
    parentLineId?: string | null;
    nodeType: "item" | "group";
    partNumber?: string | null;
    revision?: string | null;
    groupName?: string | null;
    quantity?: number | null;
    sequenceNo?: number | null;
  }>;
  floatingTopics: Array<{
    id?: string;
    logicalLineId?: string;
    parentFloatingTopicId?: string | null;
    nodeType: "item" | "group";
    partNumber?: string | null;
    revision?: string | null;
    groupName?: string | null;
    quantity?: number | null;
    sequenceNo?: number | null;
    rootPositionX?: number | null;
    rootPositionY?: number | null;
  }>;
  components?: SharedBomComponentInput[];
};

export type CreateSharedBomDraftInput = {
  companyId: string;
  contextPartNumberId: string;
  applicableParentPartNumberIds: string[];
  bomRevision: string;
  source: "manual";
  baseReleaseSnapshotId: string | null;
  actorId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  selectionEtag: string;
};

export type CreateSharedBomDraftResult = CreateCanonicalBomDraftResult & {
  definitionId: string;
  applicableParents: BomApplicableParent[];
};

export type CreateCanonicalBomDraftInput = {
  companyId: string;
  ownerPartNumberId: string;
  ownerPartNumber: string;
  legacyItemId: string | null;
  bomRevision: string;
  source: "manual";
  actorId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  draftName?: string;
};

export type CreateCanonicalBomDraftResult = {
  draft: BomWorkbenchDraftDetail;
  replayed: boolean;
};

export class BomCreateIdempotencyConflictError extends Error {
  constructor() {
    super("BOM_CREATE_IDEMPOTENCY_CONFLICT");
  }
}

export class BomRevisionConflictError extends Error {
  constructor(public readonly code: "BOM_REVISION_OCCUPIED" | "BOM_REVISION_NOT_FORWARD") {
    super(code);
  }
}

type AsyncBomReleaseGateSubmissionRow = {
  item_id: string;
  id: string;
  revision: string;
  status: string;
  released_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type NormalizedWorkbenchTreeLine = {
  id: string;
  logicalLineId: string | null;
  parentLineId: string | null;
  nodeType: "item" | "group";
  partNumber: string | null;
  revision: string | null;
  groupName: string | null;
  quantity: number | null;
  sequenceNo: number;
};

type NormalizedFloatingTopic = {
  id: string;
  logicalLineId: string | null;
  parentFloatingTopicId: string | null;
  nodeType: "item" | "group";
  partNumber: string | null;
  revision: string | null;
  groupName: string | null;
  quantity: number | null;
  sequenceNo: number;
  rootPositionX: number;
  rootPositionY: number;
};

type SharedResolvedLineProjection = {
  logicalLineId: string;
  parentLogicalLineId: string | null;
  nodeType: "item" | "group";
  childPartNumberId: string | null;
  childPartNumber: string | null;
  childPartName: string | null;
  groupName: string | null;
  quantity: number | null;
  sequenceNo: number;
  level: number;
};

type SharedBomEvidence = {
  parents: BomApplicableParent[];
  sharedLines: Array<Record<string, unknown>>;
  mappings: Array<Record<string, unknown>>;
  resolved: Array<{
    parentPartNumberId: string;
    parentPartNumber: string;
    hash: string;
    lines: SharedResolvedLineProjection[];
  }>;
};

const BOM_WORKBENCH_SOURCE_PRIORITY = {
  manual: 30
} as const;

export class BomReleaseGateError extends Error {
  issues: BomReleaseGateIssue[];

  constructor(issues: BomReleaseGateIssue[]) {
    super("BOM_RELEASE_GATE_BLOCKED");
    this.issues = issues;
  }
}

export class BomDraftEditorVersionConflictError extends Error {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super("BOM_DRAFT_EDITOR_VERSION_CONFLICT");
  }
}

export class BomFloatingTopicsUnresolvedError extends Error {
  constructor(public readonly floatingTopicCount: number) {
    super("BOM_FLOATING_TOPICS_UNRESOLVED");
  }
}

export const SELECT_ASYNC_BOM_WORKBENCH_PARENT_SQL = `
  SELECT
    s.id AS parent_submission_id,
    s.item_id AS parent_item_id,
    i.part_number AS parent_part_number,
    i.part_name AS parent_part_name,
    s.drawing_number AS parent_drawing_number,
    s.revision AS parent_revision,
    s.status AS parent_status
  FROM submissions s
  JOIN items i ON i.id = s.item_id
  WHERE s.id = :submissionId
`;

export const SELECT_ASYNC_CANONICAL_BOM_WORKBENCH_PARENT_SQL = `
  SELECT
    COALESCE(d.source_submission_id, d.parent_submission_id, '') AS parent_submission_id,
    COALESCE(d.parent_item_id, '') AS parent_item_id,
    COALESCE(pn.part_number, i.part_number, '') AS parent_part_number,
    COALESCE(pn.part_name, i.part_name, '') AS parent_part_name,
    COALESCE(s.drawing_number, '') AS parent_drawing_number,
    COALESCE(d.bom_revision, d.parent_revision, '') AS parent_revision,
    COALESCE(s.status, d.status) AS parent_status
  FROM bom_drafts d
  LEFT JOIN part_numbers pn ON pn.id = d.owner_part_number_id
  LEFT JOIN items i ON i.id = d.parent_item_id
  LEFT JOIN submissions s ON s.id = COALESCE(d.source_submission_id, d.parent_submission_id)
  WHERE d.id = :draftId
`;

export const SELECT_ASYNC_CANONICAL_BOM_WORKBENCH_DRAFTS_SQL = `
  SELECT *
  FROM bom_drafts
  WHERE owner_part_number_id = :ownerPartNumberId
    AND status <> 'Archived'
  ORDER BY is_active DESC, updated_at DESC, id DESC
`;

export const SELECT_ASYNC_BOM_WORKBENCH_RECORDS_SQL = `
  SELECT
    d.*,
    COALESCE(pn.part_number, i.part_number, '') AS parent_part_number,
    COALESCE(pn.part_name, i.part_name, '') AS parent_part_name,
    (SELECT COUNT(*) FROM bom_draft_parent_bindings parent_count WHERE parent_count.bom_draft_id = d.id) AS applicable_parent_count,
    (
      SELECT COUNT(*)
      FROM bom_draft_component_nodes component
      JOIN bom_draft_parent_bindings parent_binding ON parent_binding.bom_draft_id = component.bom_draft_id
      LEFT JOIN bom_draft_parent_selections selection
        ON selection.bom_draft_id = component.bom_draft_id
       AND selection.logical_line_id = component.logical_line_id
       AND selection.parent_part_number_id = parent_binding.part_number_id
      WHERE component.bom_draft_id = d.id
        AND component.component_mode = 'by_parent'
        AND selection.child_part_number_id IS NULL
    ) AS unresolved_mapping_count,
    (
      SELECT snapshot.id
      FROM bom_release_snapshots snapshot
      WHERE snapshot.bom_draft_id = d.id AND snapshot.snapshot_schema_version = 2
      ORDER BY snapshot.released_at DESC, snapshot.id DESC
      LIMIT 1
    ) AS release_snapshot_id
  FROM bom_drafts d
  LEFT JOIN part_numbers pn ON pn.id = d.owner_part_number_id
  LEFT JOIN items i ON i.id = d.parent_item_id
  LEFT JOIN submissions s ON s.id = COALESCE(d.source_submission_id, d.parent_submission_id)
  WHERE COALESCE(d.company_id, s.company_id) = :companyId
    AND (:status = '' OR d.status = :status)
    AND (
      :query = ''
      OR upper(COALESCE(pn.part_number, i.part_number, '')) LIKE upper(:queryLike)
      OR upper(COALESCE(pn.part_name, i.part_name, '')) LIKE upper(:queryLike)
      OR upper(COALESCE(d.bom_revision, d.parent_revision, '')) LIKE upper(:queryLike)
      OR upper(d.draft_name) LIKE upper(:queryLike)
      OR EXISTS (
        SELECT 1
        FROM bom_draft_parent_bindings search_binding
        JOIN part_numbers search_parent ON search_parent.id = search_binding.part_number_id
        WHERE search_binding.bom_draft_id = d.id
          AND (
            upper(search_parent.part_number) LIKE upper(:queryLike)
            OR upper(search_parent.part_name) LIKE upper(:queryLike)
          )
      )
    )
    AND (
      :hasCursor = 0
      OR d.updated_at < :cursorUpdatedAt
      OR (d.updated_at = :cursorUpdatedAt AND COALESCE(d.definition_id, d.id) > :cursorDefinitionKey)
      OR (d.updated_at = :cursorUpdatedAt AND COALESCE(d.definition_id, d.id) = :cursorDefinitionKey
        AND CAST(COALESCE(d.bom_revision, d.parent_revision, '0') AS INTEGER) < :cursorRevision)
      OR (d.updated_at = :cursorUpdatedAt AND COALESCE(d.definition_id, d.id) = :cursorDefinitionKey
        AND CAST(COALESCE(d.bom_revision, d.parent_revision, '0') AS INTEGER) = :cursorRevision
        AND d.id > :cursorId)
    )
  ORDER BY d.updated_at DESC, COALESCE(d.definition_id, d.id), CAST(COALESCE(d.bom_revision, d.parent_revision, '0') AS INTEGER) DESC, d.id
  LIMIT :limit
`;

export const SELECT_ASYNC_BOM_WORKBENCH_DRAFTS_SQL = `
  SELECT *
  FROM bom_drafts
  WHERE parent_submission_id = :submissionId
    AND status <> 'Archived'
  ORDER BY is_active DESC, updated_at DESC, id DESC
`;

export const SELECT_ASYNC_DELETED_BOM_WORKBENCH_DRAFTS_SQL = `
  SELECT *
  FROM bom_drafts
  WHERE parent_submission_id = :submissionId
    AND status = 'Archived'
  ORDER BY updated_at DESC, id DESC
`;

export const SELECT_ASYNC_BOM_WORKBENCH_DRAFT_SQL = `
  SELECT *
  FROM bom_drafts
  WHERE id = :draftId
`;

export const SELECT_ASYNC_BOM_WORKBENCH_DRAFT_LINES_SQL = `
  SELECT
    l.*,
    i.part_name AS part_name
  FROM bom_lines_tree l
  LEFT JOIN items i ON i.id = l.item_id
  WHERE l.bom_draft_id = :draftId
  ORDER BY COALESCE(l.parent_line_id, ''), l.sequence_no ASC, l.id ASC
`;

export const SELECT_ASYNC_BOM_DRAFT_FLOATING_TOPICS_SQL = `
  SELECT
    f.*,
    i.part_name AS part_name
  FROM bom_draft_floating_topics f
  LEFT JOIN items i ON i.id = f.item_id
  WHERE f.bom_draft_id = :draftId
  ORDER BY COALESCE(f.parent_floating_topic_id, ''), f.sequence_no ASC, f.id ASC
`;

export const SELECT_ASYNC_BOM_WORKBENCH_RECONFIRMATION_FLAGS_SQL = `
  SELECT
    brf.id,
    brf.bom_draft_id,
    brf.old_part_number_id,
    old_part.part_number AS old_part_number,
    brf.new_part_number_id,
    new_part.part_number AS new_part_number,
    brf.reason,
    brf.created_at,
    brf.resolved_at,
    brf.resolved_by
  FROM bom_reconfirmation_flags brf
  JOIN part_numbers old_part ON old_part.id = brf.old_part_number_id
  JOIN part_numbers new_part ON new_part.id = brf.new_part_number_id
  WHERE brf.bom_draft_id = :draftId
    AND brf.resolved_at IS NULL
  ORDER BY brf.created_at DESC, brf.id DESC
`;

export const RESOLVE_ASYNC_BOM_WORKBENCH_RECONFIRMATION_FLAGS_SQL = `
  UPDATE bom_reconfirmation_flags
  SET resolved_at = :resolvedAt,
      resolved_by = :resolvedBy
  WHERE bom_draft_id = :draftId
    AND resolved_at IS NULL
`;

export const SELECT_ASYNC_BOM_WORKBENCH_REPLACEMENT_CANDIDATES_SQL = `
  SELECT DISTINCT
    links.company_id,
    links.old_part_number_id,
    links.new_part_number_id
  FROM bom_drafts draft
  JOIN bom_lines_tree line ON line.bom_draft_id = draft.id
  JOIN part_numbers old_part ON upper(old_part.part_number) = upper(line.part_number)
  JOIN part_replacement_links links ON links.old_part_number_id = old_part.id
  WHERE draft.id = :draftId
    AND links.company_id = COALESCE(draft.company_id, old_part.company_id)
`;

export const INSERT_ASYNC_BOM_WORKBENCH_RECONFIRMATION_FLAG_SQL = `
  INSERT INTO bom_reconfirmation_flags (
    id, company_id, bom_draft_id, old_part_number_id, new_part_number_id, reason, created_at
  )
  SELECT
    :id, :companyId, :draftId, :oldPartNumberId, :newPartNumberId, :reason, :createdAt
  WHERE NOT EXISTS (
    SELECT 1
    FROM bom_reconfirmation_flags
    WHERE company_id = :companyId
      AND bom_draft_id = :draftId
      AND old_part_number_id = :oldPartNumberId
      AND new_part_number_id = :newPartNumberId
  )
`;

export const DEACTIVATE_ASYNC_BOM_WORKBENCH_ACTIVE_DRAFTS_SQL = `
  UPDATE bom_drafts
  SET is_active = 0,
      updated_at = :updatedAt
  WHERE parent_item_id = :parentItemId
    AND upper(parent_revision) = upper(:parentRevision)
    AND is_active = 1
    AND status IN ('Draft', 'Rejected')
`;

export const DEACTIVATE_ASYNC_CANONICAL_BOM_ACTIVE_DRAFTS_SQL = `
  UPDATE bom_drafts
  SET is_active = 0,
      updated_at = :updatedAt
  WHERE owner_part_number_id = :ownerPartNumberId
    AND upper(bom_revision) = upper(:bomRevision)
    AND is_active = 1
    AND status IN ('Draft', 'Rejected')
`;

export const ACTIVATE_ASYNC_BOM_WORKBENCH_DRAFT_SQL = `
  UPDATE bom_drafts
  SET is_active = 1,
      updated_by = :updatedBy,
      updated_at = :updatedAt
  WHERE id = :draftId
`;

export const INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL = `
  INSERT INTO bom_edit_events (
    id, bom_draft_id, actor_id, event_type, before_json, after_json, reason, created_at
  ) VALUES (
    :id, :draftId, :actorId, :eventType, :beforeJson, :afterJson, :reason, :createdAt
  )
`;

export const INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL = `
  INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
  VALUES (:id, :submissionId, :actorId, :action, :detailJson, :createdAt)
`;

export const SELECT_ASYNC_BOM_WORKBENCH_ITEM_BY_PART_NUMBER_SQL = `
  SELECT id
  FROM items
  WHERE upper(part_number) = upper(:partNumber)
  LIMIT 1
`;

export const INSERT_ASYNC_CANONICAL_BOM_DRAFT_SQL = `
  INSERT INTO bom_drafts (
    id, company_id, owner_part_number_id, bom_revision, identity_authority,
    parent_item_id, parent_submission_id, parent_revision, draft_name, status, source,
    is_active, line_count, review_attempt, created_by, updated_by, created_at, updated_at
  ) VALUES (
    :id, :companyId, :ownerPartNumberId, :bomRevision, 'canonical_part_number',
    :parentItemId, NULL, NULL, :draftName, 'Draft', :source,
    1, :lineCount, 0, :createdBy, :updatedBy, :createdAt, :updatedAt
  )
`;

export const SELECT_ASYNC_BOM_CREATE_EFFECT_SQL = `
  SELECT id, request_fingerprint, draft_id, outcome_json, created_at
  FROM bom_create_effects
  WHERE company_id = :companyId
    AND actor_id = :actorId
    AND idempotency_key = :idempotencyKey
`;

export const INSERT_ASYNC_BOM_CREATE_EFFECT_SQL = `
  INSERT INTO bom_create_effects (
    id, company_id, actor_id, idempotency_key, request_fingerprint, draft_id, outcome_json, created_at
  ) VALUES (
    :id, :companyId, :actorId, :idempotencyKey, :requestFingerprint, :draftId, :outcomeJson, :createdAt
  )
`;

export const DELETE_ASYNC_BOM_WORKBENCH_DRAFT_LINES_SQL = `
  DELETE FROM bom_lines_tree
  WHERE bom_draft_id = :draftId
`;

export const DELETE_ASYNC_BOM_DRAFT_FLOATING_TOPICS_SQL = `
  DELETE FROM bom_draft_floating_topics
  WHERE bom_draft_id = :draftId
`;

export const INSERT_ASYNC_BOM_WORKBENCH_DRAFT_LINE_SQL = `
  INSERT INTO bom_lines_tree (
    id, bom_draft_id, logical_line_id, parent_line_id, node_type, item_id, part_number, revision, group_name,
    quantity, sequence_no, source, source_priority, source_ref_id, source_filename,
    created_by, updated_by, created_at, updated_at
  ) VALUES (
    :id, :draftId, :logicalLineId, :parentLineId, :nodeType, :itemId, :partNumber, :revision, :groupName,
    :quantity, :sequenceNo, :source, :sourcePriority, :sourceRefId, :sourceFilename,
    :createdBy, :updatedBy, :createdAt, :updatedAt
  )
`;

export const INSERT_ASYNC_BOM_DRAFT_FLOATING_TOPIC_SQL = `
  INSERT INTO bom_draft_floating_topics (
    id, bom_draft_id, logical_line_id, parent_floating_topic_id, node_type, item_id, part_number, revision, group_name,
    quantity, sequence_no, root_position_x, root_position_y, source,
    created_by, updated_by, created_at, updated_at
  ) VALUES (
    :id, :draftId, :logicalLineId, :parentFloatingTopicId, :nodeType, :itemId, :partNumber, :revision, :groupName,
    :quantity, :sequenceNo, :rootPositionX, :rootPositionY, 'manual',
    :createdBy, :updatedBy, :createdAt, :updatedAt
  )
`;

export const UPDATE_ASYNC_BOM_WORKBENCH_DRAFT_AFTER_SAVE_SQL = `
  UPDATE bom_drafts
  SET source = :source,
      line_count = :lineCount,
      editor_version = editor_version + 1,
      updated_by = :updatedBy,
      updated_at = :updatedAt
  WHERE id = :draftId
    AND editor_version = :expectedEditorVersion
`;

export const SELECT_ASYNC_BOM_WORKBENCH_LATEST_RELEASE_SNAPSHOT_SQL = `
  SELECT
    rs.*,
    COALESCE(pn.part_number, i.part_number, '') AS parent_part_number,
    COALESCE(pn.part_name, i.part_name, '') AS parent_part_name,
    COALESCE(s.drawing_number, '') AS parent_drawing_number,
    u.display_name AS released_by_name
  FROM bom_release_snapshots rs
  LEFT JOIN part_numbers pn ON pn.id = rs.owner_part_number_id
  LEFT JOIN items i ON i.id = rs.parent_item_id
  LEFT JOIN submissions s ON s.id = COALESCE(rs.source_submission_id, rs.parent_submission_id)
  LEFT JOIN users u ON u.id = rs.released_by
  WHERE (
      (rs.owner_part_number_id IS NOT NULL AND rs.owner_part_number_id = :ownerPartNumberId)
      OR (rs.owner_part_number_id IS NULL AND rs.parent_item_id = :parentItemId)
    )
    AND rs.bom_draft_id <> :draftId
  ORDER BY
    CASE WHEN rs.obsolete_at IS NULL THEN 0 ELSE 1 END,
    rs.released_at DESC,
    rs.id DESC
  LIMIT 1
`;

export const SELECT_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOT_SQL = `
  SELECT
    rs.*,
    COALESCE(pn.part_number, i.part_number, '') AS parent_part_number,
    COALESCE(pn.part_name, i.part_name, '') AS parent_part_name,
    COALESCE(s.drawing_number, '') AS parent_drawing_number,
    u.display_name AS released_by_name
  FROM bom_release_snapshots rs
  LEFT JOIN part_numbers pn ON pn.id = rs.owner_part_number_id
  LEFT JOIN items i ON i.id = rs.parent_item_id
  LEFT JOIN submissions s ON s.id = COALESCE(rs.source_submission_id, rs.parent_submission_id)
  LEFT JOIN users u ON u.id = rs.released_by
  WHERE rs.id = :snapshotId
`;

export const SELECT_ASYNC_BOM_WORKBENCH_PENDING_REVIEWS_SQL = `
  SELECT
    rr.id,
    rr.bom_draft_id,
    rr.status,
    COALESCE(rr.lifecycle_action, 'release') AS lifecycle_action,
    rr.submitted_by,
    u.display_name AS submitted_by_name,
    rr.change_reason,
    rr.submitted_at,
    COALESCE(d.source_submission_id, d.parent_submission_id, '') AS parent_submission_id,
    d.draft_name,
    d.review_attempt,
    COALESCE(pn.part_number, i.part_number, '') AS parent_part_number,
    COALESCE(pn.part_name, i.part_name, '') AS parent_part_name,
    COALESCE(s.drawing_number, '') AS parent_drawing_number,
    COALESCE(d.bom_revision, d.parent_revision, '') AS parent_revision
  FROM bom_review_requests rr
  JOIN bom_drafts d ON d.id = rr.bom_draft_id
  LEFT JOIN part_numbers pn ON pn.id = d.owner_part_number_id
  LEFT JOIN items i ON i.id = d.parent_item_id
  LEFT JOIN submissions s ON s.id = COALESCE(d.source_submission_id, d.parent_submission_id)
  LEFT JOIN users u ON u.id = rr.submitted_by
  WHERE rr.status = 'PendingReview'
    AND (
      (COALESCE(rr.lifecycle_action, 'release') = 'release' AND d.status = 'PendingReview')
      OR (COALESCE(rr.lifecycle_action, 'release') = 'obsolete' AND d.status = 'Released')
    )
  ORDER BY rr.submitted_at DESC, rr.id DESC
`;

export const SELECT_ASYNC_BOM_WORKBENCH_REVIEW_SQL = `
  SELECT
    id,
    bom_draft_id,
    status,
    COALESCE(lifecycle_action, 'release') AS lifecycle_action,
    submitted_by,
    reviewed_by,
    change_reason,
    decision_reason,
    submitted_at,
    reviewed_at,
    review_schema_version,
    definition_row_version,
    editor_version,
    review_snapshot_json,
    review_snapshot_hash
  FROM bom_review_requests
  WHERE id = :reviewId
`;

export const SELECT_ASYNC_BOM_WORKBENCH_LATEST_REVIEW_SQL = `
  SELECT
    id,
    bom_draft_id,
    status,
    COALESCE(lifecycle_action, 'release') AS lifecycle_action,
    submitted_by,
    reviewed_by,
    change_reason,
    decision_reason,
    submitted_at,
    reviewed_at,
    review_schema_version,
    definition_row_version,
    editor_version,
    review_snapshot_json,
    review_snapshot_hash
  FROM bom_review_requests
  WHERE bom_draft_id = :draftId
  ORDER BY submitted_at DESC, id DESC
  LIMIT 1
`;

export const SELECT_ASYNC_BOM_WORKBENCH_DRAFT_RELEASE_SNAPSHOT_ID_SQL = `
  SELECT id
  FROM bom_release_snapshots
  WHERE bom_draft_id = :draftId
  ORDER BY released_at DESC, id DESC
  LIMIT 1
`;

export const SELECT_ASYNC_BOM_WORKBENCH_OBSOLETE_HISTORY_SQL = `
  SELECT
    d.id AS bom_draft_id,
    d.draft_name,
    d.status AS draft_status,
    COALESCE(d.source_submission_id, d.parent_submission_id, '') AS parent_submission_id,
    COALESCE(pn.part_number, i.part_number, '') AS parent_part_number,
    COALESCE(pn.part_name, i.part_name, '') AS parent_part_name,
    COALESCE(s.drawing_number, '') AS parent_drawing_number,
    COALESCE(d.bom_revision, d.parent_revision, '') AS parent_revision,
    COALESCE(rs.line_count, d.line_count) AS line_count,
    rr.id AS review_id,
    submitter.display_name AS submitted_by_name,
    reviewer.display_name AS reviewed_by_name,
    rr.change_reason,
    rr.decision_reason,
    rr.submitted_at,
    rr.reviewed_at,
    rs.id AS snapshot_id,
    rs.released_at,
    rs.obsolete_at
  FROM bom_drafts d
  LEFT JOIN part_numbers pn ON pn.id = d.owner_part_number_id
  LEFT JOIN submissions s ON s.id = COALESCE(d.source_submission_id, d.parent_submission_id)
  LEFT JOIN items i ON i.id = d.parent_item_id
  LEFT JOIN bom_release_snapshots rs ON rs.bom_draft_id = d.id
  LEFT JOIN bom_review_requests rr
    ON rr.bom_draft_id = d.id
    AND rr.status = 'Approved'
    AND COALESCE(rr.lifecycle_action, 'release') = 'obsolete'
  LEFT JOIN users submitter ON submitter.id = rr.submitted_by
  LEFT JOIN users reviewer ON reviewer.id = rr.reviewed_by
  WHERE d.status = 'Obsolete'
    AND COALESCE(d.company_id, s.company_id) = :companyId
  ORDER BY COALESCE(rs.obsolete_at, rr.reviewed_at, d.updated_at) DESC, d.id DESC
  LIMIT :limit
`;

export const SELECT_ASYNC_BOM_WORKBENCH_EXISTING_PENDING_REVIEW_SQL = `
  SELECT id
  FROM bom_drafts
  WHERE (
      (owner_part_number_id IS NOT NULL AND owner_part_number_id = :ownerPartNumberId)
      OR (owner_part_number_id IS NULL AND parent_item_id = :parentItemId)
    )
    AND status = 'PendingReview'
    AND id <> :draftId
  LIMIT 1
`;

export const SELECT_ASYNC_BOM_WORKBENCH_EXISTING_PENDING_OBSOLETE_REVIEW_SQL = `
  SELECT id
  FROM bom_review_requests
  WHERE bom_draft_id = :draftId
    AND status = 'PendingReview'
    AND COALESCE(lifecycle_action, 'release') = 'obsolete'
  LIMIT 1
`;

export const SUBMIT_ASYNC_BOM_WORKBENCH_DRAFT_REVIEW_SQL = `
  UPDATE bom_drafts
  SET status = 'PendingReview',
      review_attempt = review_attempt + 1,
      updated_by = :updatedBy,
      updated_at = :updatedAt
  WHERE id = :draftId
`;

export const INSERT_ASYNC_BOM_WORKBENCH_REVIEW_SQL = `
  INSERT INTO bom_review_requests (
    id, bom_draft_id, status, lifecycle_action, submitted_by, change_reason, submitted_at
  ) VALUES (
    :id, :draftId, :status, :lifecycleAction, :submittedBy, :changeReason, :submittedAt
  )
`;

export const REJECT_ASYNC_BOM_WORKBENCH_DRAFT_SQL = `
  UPDATE bom_drafts
  SET status = 'Rejected',
      updated_by = :updatedBy,
      updated_at = :updatedAt
  WHERE id = :draftId
`;

export const REJECT_ASYNC_BOM_WORKBENCH_REVIEW_SQL = `
  UPDATE bom_review_requests
  SET status = 'Rejected',
      reviewed_by = :reviewedBy,
      decision_reason = :decisionReason,
      reviewed_at = :reviewedAt
  WHERE id = :reviewId
`;

export const SELECT_ASYNC_BOM_WORKBENCH_RELEASE_GATE_SUBMISSION_SQL = `
  SELECT id, revision, status
  FROM submissions
  WHERE item_id = :itemId
    AND (:revision IS NULL OR upper(revision) = upper(:revision))
  ORDER BY
    CASE WHEN status = 'Released' THEN 0 ELSE 1 END,
    COALESCE(released_at, updated_at, created_at) DESC,
    id DESC
  LIMIT 1
`;

export const SELECT_ASYNC_BOM_WORKBENCH_LATEST_RELEASED_REVISION_SQL = `
  SELECT revision
  FROM submissions
  WHERE item_id = :itemId
    AND status = 'Released'
  ORDER BY COALESCE(released_at, updated_at, created_at) DESC, id DESC
  LIMIT 1
`;

export const OBSOLETE_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOTS_SQL = `
  UPDATE bom_release_snapshots
  SET obsolete_at = :obsoleteAt,
      obsolete_by = :obsoleteBy
  WHERE (
      (owner_part_number_id IS NOT NULL AND owner_part_number_id = :ownerPartNumberId)
      OR (owner_part_number_id IS NULL AND parent_item_id = :parentItemId)
    )
    AND obsolete_at IS NULL
`;

export const OBSOLETE_ASYNC_BOM_WORKBENCH_RELEASED_DRAFTS_SQL = `
  UPDATE bom_drafts
  SET status = 'Obsolete',
      updated_by = :updatedBy,
      updated_at = :updatedAt
  WHERE id IN (
    SELECT bom_draft_id
    FROM bom_release_snapshots
    WHERE (
        (owner_part_number_id IS NOT NULL AND owner_part_number_id = :ownerPartNumberId)
        OR (owner_part_number_id IS NULL AND parent_item_id = :parentItemId)
      )
      AND id <> :snapshotId
  )
    AND status = 'Released'
`;

export const OBSOLETE_ASYNC_BOM_WORKBENCH_DRAFT_RELEASE_SNAPSHOTS_SQL = `
  UPDATE bom_release_snapshots
  SET obsolete_at = :obsoleteAt,
      obsolete_by = :obsoleteBy
  WHERE bom_draft_id = :draftId
    AND obsolete_at IS NULL
`;

export const OBSOLETE_ASYNC_BOM_WORKBENCH_DRAFT_SQL = `
  UPDATE bom_drafts
  SET status = 'Obsolete',
      is_active = 0,
      updated_by = :updatedBy,
      updated_at = :updatedAt
  WHERE id = :draftId
`;

export const INSERT_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOT_SQL = `
  INSERT INTO bom_release_snapshots (
    id, bom_draft_id, company_id, owner_part_number_id, bom_revision, source_submission_id,
    parent_item_id, parent_submission_id, parent_revision,
    line_snapshot_json, line_count, released_by, released_at
  ) VALUES (
    :id, :draftId, :companyId, :ownerPartNumberId, :bomRevision, :sourceSubmissionId,
    :parentItemId, :parentSubmissionId, :parentRevision,
    :lineSnapshotJson, :lineCount, :releasedBy, :releasedAt
  )
`;

export const RELEASE_ASYNC_BOM_WORKBENCH_DRAFT_SQL = `
  UPDATE bom_drafts
  SET status = 'Released',
      is_active = 0,
      updated_by = :updatedBy,
      updated_at = :updatedAt
  WHERE id = :draftId
`;

export const ARCHIVE_ASYNC_BOM_WORKBENCH_DRAFT_SQL = `
  UPDATE bom_drafts
  SET status = 'Archived',
      is_active = 0,
      updated_by = :updatedBy,
      updated_at = :updatedAt
  WHERE id = :draftId
`;

export const RESTORE_ASYNC_BOM_WORKBENCH_DRAFT_SQL = `
  UPDATE bom_drafts
  SET status = 'Draft',
      is_active = 0,
      updated_by = :updatedBy,
      updated_at = :updatedAt
  WHERE id = :draftId
`;

export const APPROVE_ASYNC_BOM_WORKBENCH_REVIEW_SQL = `
  UPDATE bom_review_requests
  SET status = 'Approved',
      reviewed_by = :reviewedBy,
      decision_reason = :decisionReason,
      reviewed_at = :reviewedAt
  WHERE id = :reviewId
`;

export class AsyncBomWorkbenchRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async getWorkbenchBySubmissionId(submissionId: string): Promise<BomWorkbenchSummary | null> {
    const parent = await this.client.queryOne<BomWorkbenchParentRow>(SELECT_ASYNC_BOM_WORKBENCH_PARENT_SQL, { submissionId });
    if (!parent) return null;

    const drafts = await this.listDraftsBySubmissionId(submissionId);
    const activeSummary =
      drafts.find((draft) => draft.is_active === 1 && (draft.status === "Draft" || draft.status === "Rejected")) ?? null;
    const activeDraft = activeSummary ? await this.getDraftById(activeSummary.id) : null;

    return {
      ...parent,
      drafts,
      active_draft: activeDraft
    };
  }

  async listDraftsBySubmissionId(submissionId: string): Promise<BomWorkbenchDraftSummary[]> {
    const rows = await this.client.query<BomWorkbenchDraftSummary>(SELECT_ASYNC_BOM_WORKBENCH_DRAFTS_SQL, { submissionId });
    return rows.map(coerceDraftSummary);
  }

  async listWorkbenchRecords(input: ListBomWorkbenchRecordsInput): Promise<BomWorkbenchListRecord[]> {
    const query = input.query?.trim() ?? "";
    const rows = await this.client.query<BomWorkbenchListRecord & {
      applicable_parent_count: number | string;
      unresolved_mapping_count: number | string;
      release_snapshot_id: string | null;
    }>(SELECT_ASYNC_BOM_WORKBENCH_RECORDS_SQL, {
      companyId: input.companyId,
      query,
      queryLike: `%${query}%`,
      status: input.status ?? "",
      hasCursor: input.cursor ? 1 : 0,
      cursorUpdatedAt: input.cursor?.updatedAt ?? "",
      cursorDefinitionKey: input.cursor?.definitionKey ?? "",
      cursorRevision: input.cursor?.revisionNumber ?? 0,
      cursorId: input.cursor?.draftId ?? "",
      limit: Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 200)
    });
    const sharedDraftIds = rows.filter((row) => row.definition_id).map((row) => row.id);
    const parentRows = sharedDraftIds.length
      ? await this.client.query<{
          bom_draft_id: string;
          part_number_id: string;
          part_number: string;
          part_name: string;
          selection_order: number | string;
        }>(`
          SELECT binding.bom_draft_id, binding.part_number_id, part.part_number, part.part_name, binding.selection_order
          FROM bom_draft_parent_bindings binding
          JOIN part_numbers part ON part.id = binding.part_number_id
          WHERE binding.bom_draft_id IN (${sharedDraftIds.map((_, index) => `:draft${index}`).join(",")})
          ORDER BY binding.bom_draft_id, binding.selection_order, binding.part_number_id
        `, Object.fromEntries(sharedDraftIds.map((draftId, index) => [`draft${index}`, draftId])))
      : [];
    const parentsByDraft = new Map<string, Array<{ partNumberId: string; partNumber: string; name: string }>>();
    for (const parent of parentRows) {
      const list = parentsByDraft.get(parent.bom_draft_id) ?? [];
      list.push({ partNumberId: parent.part_number_id, partNumber: parent.part_number, name: parent.part_name });
      parentsByDraft.set(parent.bom_draft_id, list);
    }
    return rows.map((row) => ({
      ...coerceDraftSummary(row),
      parent_part_number: row.parent_part_number,
      parent_part_name: row.parent_part_name,
      definitionId: row.definition_id ?? null,
      draftId: row.id,
      releaseSnapshotId: row.release_snapshot_id ?? null,
      bomRevision: row.bom_revision ?? row.parent_revision,
      applicableParentCount: Number(row.applicable_parent_count ?? 0),
      applicableParents: parentsByDraft.get(row.id) ?? [],
      unresolvedMappingCount: Number(row.unresolved_mapping_count ?? 0),
      baseReleaseSnapshotId: row.base_release_snapshot_id ?? null,
      updatedAt: row.updated_at
    }));
  }

  async getWorkbenchByDraftId(draftId: string, contextParentPartNumberId?: string | null): Promise<BomWorkbenchSummary | null> {
    const draft = await this.getDraftById(draftId, contextParentPartNumberId);
    if (!draft) return null;
    if (!draft.owner_part_number_id) {
      return draft.parent_submission_id ? this.getWorkbenchBySubmissionId(draft.parent_submission_id) : null;
    }
    if (draft.definition_id) {
      const parentPartNumberId = draft.context_parent_part_number_id;
      if (!parentPartNumberId) return null;
      const parent = await this.client.queryOne<BomWorkbenchParentRow>(`
        SELECT
          '' AS parent_submission_id,
          COALESCE((SELECT item.id FROM items item WHERE item.company_id = part.company_id AND upper(item.part_number) = upper(part.part_number) ORDER BY item.id LIMIT 1), '') AS parent_item_id,
          part.part_number AS parent_part_number,
          part.part_name AS parent_part_name,
          COALESCE((
            SELECT drawing.drawing_number FROM drawing_part_links link
            JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id
            WHERE link.part_number_id = part.id AND link.link_type = 'primary_manufacturing'
            ORDER BY drawing.id LIMIT 1
          ), '') AS parent_drawing_number,
          COALESCE(:bomRevision, '') AS parent_revision,
          part.record_status AS parent_status
        FROM part_numbers part
        JOIN bom_draft_parent_bindings binding ON binding.part_number_id = part.id
        WHERE binding.bom_draft_id = :draftId AND part.id = :parentPartNumberId
      `, { draftId, parentPartNumberId, bomRevision: draft.bom_revision ?? draft.parent_revision });
      if (!parent) return null;
      const rows = await this.client.query<BomWorkbenchDraftSummary>(`
        SELECT * FROM bom_drafts
        WHERE definition_id = :definitionId
        ORDER BY CAST(COALESCE(bom_revision, parent_revision, '0') AS INTEGER) DESC, updated_at DESC, id DESC
      `, { definitionId: draft.definition_id });
      return { ...parent, drafts: rows.map(coerceDraftSummary), active_draft: draft };
    }
    const parent = await this.client.queryOne<BomWorkbenchParentRow>(SELECT_ASYNC_CANONICAL_BOM_WORKBENCH_PARENT_SQL, { draftId });
    if (!parent) return null;
    const rows = await this.client.query<BomWorkbenchDraftSummary>(SELECT_ASYNC_CANONICAL_BOM_WORKBENCH_DRAFTS_SQL, {
      ownerPartNumberId: draft.owner_part_number_id
    });
    const drafts = rows.map(coerceDraftSummary);
    return { ...parent, drafts, active_draft: draft };
  }

  async listDeletedDraftsBySubmissionId(submissionId: string): Promise<BomWorkbenchDraftSummary[]> {
    const rows = await this.client.query<BomWorkbenchDraftSummary>(SELECT_ASYNC_DELETED_BOM_WORKBENCH_DRAFTS_SQL, { submissionId });
    return rows.map(coerceDraftSummary);
  }

  async getDraftById(draftId: string, contextParentPartNumberId?: string | null): Promise<BomWorkbenchDraftDetail | null> {
    const draft = await this.client.queryOne<BomWorkbenchDraftSummary>(SELECT_ASYNC_BOM_WORKBENCH_DRAFT_SQL, { draftId });
    if (!draft) return null;

    const [lines, floatingTopics, reconfirmationFlags, latestReview, releaseSnapshot] = await Promise.all([
      this.client.query<BomWorkbenchLine>(SELECT_ASYNC_BOM_WORKBENCH_DRAFT_LINES_SQL, { draftId }),
      this.client.query<BomDraftFloatingTopic>(SELECT_ASYNC_BOM_DRAFT_FLOATING_TOPICS_SQL, { draftId }),
      this.client.query<BomReconfirmationFlag>(SELECT_ASYNC_BOM_WORKBENCH_RECONFIRMATION_FLAGS_SQL, { draftId }),
      this.client.queryOne<BomWorkbenchReview>(SELECT_ASYNC_BOM_WORKBENCH_LATEST_REVIEW_SQL, { draftId }),
      this.client.queryOne<{ id: string }>(SELECT_ASYNC_BOM_WORKBENCH_DRAFT_RELEASE_SNAPSHOT_ID_SQL, { draftId })
    ]);
    let applicableParents: BomApplicableParent[] | undefined;
    let components: BomSharedComponent[] | undefined;
    let unresolvedMappings: Array<{ logical_line_id: string; parent_part_number_id: string }> | undefined;
    if (draft.definition_id) {
      const [parentRows, componentRows, candidateRows, selectionRows] = await Promise.all([
        this.client.query<BomApplicableParent>(`
          SELECT binding.part_number_id, part.part_number, part.part_name, binding.selection_order
          FROM bom_draft_parent_bindings binding JOIN part_numbers part ON part.id = binding.part_number_id
          WHERE binding.bom_draft_id = :draftId ORDER BY binding.selection_order, binding.part_number_id
        `, { draftId }),
        this.client.query<{ node_id: string; logical_line_id: string; node_location: "tree" | "floating"; component_mode: "fixed" | "by_parent"; child_part_root_id: string }>(`
          SELECT node_id, logical_line_id, node_location, component_mode, child_part_root_id
          FROM bom_draft_component_nodes WHERE bom_draft_id = :draftId ORDER BY logical_line_id
        `, { draftId }),
        this.client.query<{ logical_line_id: string; child_part_number_id: string; part_number: string; part_name: string; part_root_id: string }>(`
          SELECT candidate.logical_line_id, candidate.child_part_number_id, part.part_number, part.part_name, part.part_root_id
          FROM bom_draft_component_candidates candidate JOIN part_numbers part ON part.id = candidate.child_part_number_id
          WHERE candidate.bom_draft_id = :draftId ORDER BY candidate.logical_line_id, candidate.selection_order, candidate.child_part_number_id
        `, { draftId }),
        this.client.query<{ logical_line_id: string; parent_part_number_id: string; child_part_number_id: string }>(`
          SELECT logical_line_id, parent_part_number_id, child_part_number_id FROM bom_draft_parent_selections
          WHERE bom_draft_id = :draftId ORDER BY logical_line_id, parent_part_number_id
        `, { draftId })
      ]);
      applicableParents = parentRows.map((row) => ({ ...row, selection_order: numberValue(row.selection_order) }));
      components = componentRows.map((row) => ({
        ...row,
        child_part_number_ids: candidateRows.filter((candidate) => candidate.logical_line_id === row.logical_line_id).map((candidate) => candidate.child_part_number_id),
        child_candidates: candidateRows.filter((candidate) => candidate.logical_line_id === row.logical_line_id).map((candidate) => ({
          part_number_id: candidate.child_part_number_id,
          part_number: candidate.part_number,
          part_name: candidate.part_name,
          part_root_id: candidate.part_root_id
        })),
        parent_selections: selectionRows.filter((selection) => selection.logical_line_id === row.logical_line_id).map((selection) => ({
          parent_part_number_id: selection.parent_part_number_id,
          child_part_number_id: selection.child_part_number_id
        }))
      }));
      unresolvedMappings = components.flatMap((component) => component.component_mode === "by_parent"
        ? applicableParents!.filter((parent) => !component.parent_selections.some((selection) => selection.parent_part_number_id === parent.part_number_id))
          .map((parent) => ({ logical_line_id: component.logical_line_id, parent_part_number_id: parent.part_number_id }))
        : []);
      if (contextParentPartNumberId && !applicableParents.some((parent) => parent.part_number_id === contextParentPartNumberId)) {
        return null;
      }
    }
    return {
      ...coerceDraftSummary(draft),
      lines: lines.map(coerceWorkbenchLine),
      floating_topics: floatingTopics.map(coerceFloatingTopic),
      reconfirmation_flags: reconfirmationFlags,
      release_snapshot_id: releaseSnapshot?.id ?? null,
      latest_review: latestReview ? coerceReview(latestReview) : null
      ,...(applicableParents ? {
        applicable_parents: applicableParents,
        components: components ?? [],
        unresolved_mappings: unresolvedMappings ?? [],
        context_parent_part_number_id: contextParentPartNumberId
          ?? (applicableParents.some((parent) => parent.part_number_id === draft.owner_part_number_id)
            ? draft.owner_part_number_id
            : applicableParents[0]?.part_number_id ?? null)
      } : {})
    };
  }

  async getDraftDiff(draftId: string): Promise<BomWorkbenchDraftDiffResult | null> {
    const draft = await this.getDraftById(draftId);
    if (!draft) return null;

    const baseSnapshot = await this.getLatestReleaseSnapshotForDraft(draft);
    const changes = diffBomWorkbenchLinesShared(baseSnapshot?.lines ?? [], draft.lines);
    const sharedDiff = draft.definition_id ? buildSharedDraftDiff(draft, baseSnapshot, changes) : null;
    return {
      draft,
      base_snapshot: baseSnapshot,
      summary: {
        added_count: changes.filter((change) => change.change_type === "added").length,
        removed_count: changes.filter((change) => change.change_type === "removed").length,
        changed_count: changes.filter((change) => change.change_type === "changed").length,
        unchanged_count: changes.filter((change) => change.change_type === "unchanged").length
      },
      changes,
      ...(sharedDiff ?? {})
    };
  }

  async getReleaseSnapshotById(snapshotId: string): Promise<BomReleaseSnapshotDetail | null> {
    const row = await this.client.queryOne<AsyncBomReleaseSnapshotRow>(SELECT_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOT_SQL, {
      snapshotId
    });
    if (!row) return null;
    const snapshot = parseReleaseSnapshot(row);
    if (numberValue(row.snapshot_schema_version ?? 1) === 2) {
      const [parents, resolvedLines, review] = await Promise.all([
        this.client.query<BomApplicableParent>(`
          SELECT parent_part_number_id AS part_number_id,
            parent_part_number AS part_number,
            parent_part_name AS part_name,
            selection_order
          FROM bom_release_parent_snapshots WHERE release_snapshot_id = :snapshotId
          ORDER BY selection_order, parent_part_number_id
        `, { snapshotId }),
        this.client.query<NonNullable<BomReleaseSnapshotDetail["resolved_lines"]>[number]>(`
          SELECT * FROM bom_release_resolved_lines WHERE release_snapshot_id = :snapshotId
          ORDER BY parent_part_number_id, level, sequence_no, logical_line_id
        `, { snapshotId }),
        this.client.queryOne<{ review_snapshot_hash: string | null }>(`
          SELECT review_snapshot_hash FROM bom_review_requests
          WHERE bom_draft_id = :draftId AND review_schema_version = 2 AND status = 'Approved'
          ORDER BY reviewed_at DESC, id DESC LIMIT 1
        `, { draftId: row.bom_draft_id })
      ]);
      snapshot.applicable_parents = parents.map((parent) => ({ ...parent, selection_order: numberValue(parent.selection_order) }));
      snapshot.resolved_lines = resolvedLines.map((line) => ({ ...line, quantity: nullableNumberValue(line.quantity), sequence_no: numberValue(line.sequence_no), level: numberValue(line.level) }));
      assertSharedReleaseSnapshotIntegrity(snapshot, review?.review_snapshot_hash ?? null);
    }
    return snapshot;
  }

  async listObsoleteHistory(input: ListBomWorkbenchObsoleteHistoryInput): Promise<BomWorkbenchObsoleteHistoryRecord[]> {
    const rows = await this.client.query<BomWorkbenchObsoleteHistoryRecord>(SELECT_ASYNC_BOM_WORKBENCH_OBSOLETE_HISTORY_SQL, {
      companyId: input.companyId,
      limit: Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500)
    });
    return rows.map((row) => ({ ...row, line_count: numberValue(row.line_count) }));
  }

  async createSharedDraft(input: CreateSharedBomDraftInput): Promise<CreateSharedBomDraftResult> {
    const selectedParentIds = normalizeStableIds(input.applicableParentPartNumberIds, SHARED_BOM_LIMITS.parents);
    if (!selectedParentIds.length || !selectedParentIds.includes(input.contextPartNumberId)) {
      throw new SharedBomError("BOM_CONTEXT_PARENT_REQUIRED", 422);
    }
    const revision = assertMajorBomRevision(input.bomRevision);
    const replay = await this.getSharedCreateReplay(input);
    if (replay) return replay;

    const now = this.clock();
    const draftId = this.idFactory();
    const create = async (client: AsyncDatabaseClient) => {
      const concurrentEffect = await client.queryOne<{ request_fingerprint: string; draft_id: string }>(
        SELECT_ASYNC_BOM_CREATE_EFFECT_SQL,
        { companyId: input.companyId, actorId: input.actorId, idempotencyKey: input.idempotencyKey }
      );
      if (concurrentEffect) {
        if (concurrentEffect.request_fingerprint !== input.requestFingerprint) throw new BomCreateIdempotencyConflictError();
        return { draftId: concurrentEffect.draft_id, replayed: true, definitionId: "" };
      }

      const candidates = await getBomApplicabilityCandidateContractAsync({
        client,
        companyId: input.companyId,
        contextPartNumberId: input.contextPartNumberId
      });
      if (candidates.selectionEtag !== input.selectionEtag) throw new SharedBomError("BOM_APPLICABILITY_STALE", 409);
      if (revision !== candidates.suggestedBomRevision) throw new SharedBomError("BOM_DEFINITION_REVISION_CONFLICT", 409);
      if ((input.baseReleaseSnapshotId ?? null) !== candidates.baseReleaseSnapshotId) {
        throw new SharedBomError("BOM_BASE_RELEASE_STALE", 409);
      }
      const candidateById = new Map(candidates.candidates.map((candidate) => [candidate.partNumberId, candidate]));
      for (const parentId of selectedParentIds) {
        const candidate = candidateById.get(parentId);
        if (!candidate) {
          const sameCompanyPart = await client.queryOne<{ id: string }>(
            "SELECT id FROM part_numbers WHERE id = :parentId AND company_id = :companyId",
            { parentId, companyId: input.companyId }
          );
          throw new SharedBomError(sameCompanyPart ? "BOM_PARENT_SCOPE_INVALID" : "BOM_RESOURCE_NOT_FOUND", sameCompanyPart ? 422 : 404);
        }
        if (!candidate.selectable) throw new SharedBomError(candidate.blockedReason ?? "BOM_PARENT_SCOPE_INVALID", candidate.blockedReason === "BOM_APPLICABILITY_CONFLICT" ? 409 : 422);
      }
      if (candidates.mode === "next_revision") {
        const requiredParentIds = candidates.candidates.filter((candidate) => candidate.selected).map((candidate) => candidate.partNumberId);
        if (requiredParentIds.some((parentId) => !selectedParentIds.includes(parentId))) {
          throw new SharedBomError("BOM_PARENT_REMOVAL_NOT_SUPPORTED", 409);
        }
      } else if (input.baseReleaseSnapshotId !== null || revision !== "1") {
        throw new SharedBomError("BOM_DEFINITION_REVISION_CONFLICT", 409);
      }

      const context = await client.queryOne<{
        part_root_id: string; root_code: string; legacy_item_id: string | null;
      }>(`
        SELECT part.part_root_id, root.root_code,
          (SELECT item.id FROM items item WHERE item.company_id = part.company_id AND upper(item.part_number) = upper(part.part_number) ORDER BY item.id LIMIT 1) AS legacy_item_id
        FROM part_numbers part JOIN part_roots root ON root.id = part.part_root_id
        WHERE part.id = :partNumberId AND part.company_id = :companyId
      `, { partNumberId: input.contextPartNumberId, companyId: input.companyId });
      if (!context) throw new SharedBomError("BOM_RESOURCE_NOT_FOUND", 404);

      let definitionId = candidates.definitionId;
      if (!definitionId) {
        definitionId = this.idFactory();
        await client.execute(`
          INSERT INTO bom_definitions (id, company_id, part_root_id, row_version, created_by, updated_by, created_at, updated_at)
          VALUES (:id, :companyId, :rootId, 1, :actorId, :actorId, :createdAt, :updatedAt)
        `, { id: definitionId, companyId: input.companyId, rootId: context.part_root_id, actorId: input.actorId, createdAt: now, updatedAt: now });
      } else {
        const definition = await client.queryOne<{ company_id: string; part_root_id: string }>(`
          SELECT company_id, part_root_id FROM bom_definitions WHERE id = :definitionId ${client.kind === "postgres" ? "FOR UPDATE" : ""}
        `, { definitionId });
        if (!definition || definition.company_id !== input.companyId || definition.part_root_id !== context.part_root_id) {
          throw new SharedBomError("BOM_RESOURCE_NOT_FOUND", 404);
        }
        const open = await client.queryOne<{ id: string }>(`
          SELECT id FROM bom_drafts WHERE definition_id = :definitionId AND status IN ('Draft','Rejected','PendingReview','Archived') LIMIT 1
        `, { definitionId });
        if (open) throw new SharedBomError("BOM_OPEN_REVISION_EXISTS", 409, { draftId: open.id });
      }

      const existingBindings = await client.query<{ part_number_id: string; definition_id: string }>(`
        SELECT part_number_id, definition_id FROM bom_definition_parent_bindings
        WHERE part_number_id IN (${selectedParentIds.map((_, index) => `:parent${index}`).join(",")})
      `, Object.fromEntries(selectedParentIds.map((parentId, index) => [`parent${index}`, parentId])));
      if (existingBindings.some((binding) => binding.definition_id !== definitionId)) {
        throw new SharedBomError("BOM_APPLICABILITY_CONFLICT", 409);
      }

      let definitionChanged = false;
      for (const parentId of selectedParentIds) {
        if (!existingBindings.some((binding) => binding.part_number_id === parentId)) {
          await client.execute(`
            INSERT INTO bom_definition_parent_bindings
              (id, company_id, definition_id, part_number_id, bound_from_bom_revision, created_by, created_at)
            VALUES (:id, :companyId, :definitionId, :parentId, :revision, :actorId, :createdAt)
          `, { id: this.idFactory(), companyId: input.companyId, definitionId, parentId, revision, actorId: input.actorId, createdAt: now });
          definitionChanged = true;
        }
      }
      if (definitionChanged && candidates.definitionId) {
        await client.execute(`
          UPDATE bom_definitions SET row_version = row_version + 1, updated_by = :actorId, updated_at = :updatedAt
          WHERE id = :definitionId
        `, { definitionId, actorId: input.actorId, updatedAt: now });
      }

      await client.execute(`
        INSERT INTO bom_drafts (
          id, company_id, definition_id, base_release_snapshot_id, owner_part_number_id, bom_revision,
          identity_authority, parent_item_id, draft_name, status, source, is_active, line_count,
          review_attempt, editor_version, created_by, updated_by, created_at, updated_at
        ) VALUES (
          :id, :companyId, :definitionId, :baseReleaseSnapshotId, :contextPartNumberId, :revision,
          'canonical_part_number', :legacyItemId, :draftName, 'Draft', 'manual', 1, 0,
          0, :editorVersion, :actorId, :actorId, :createdAt, :updatedAt
        )
      `, {
        id: draftId, companyId: input.companyId, definitionId, baseReleaseSnapshotId: input.baseReleaseSnapshotId,
        contextPartNumberId: input.contextPartNumberId, revision, legacyItemId: context.legacy_item_id,
        draftName: `${context.root_code} BOM Rev ${revision}`, editorVersion: input.baseReleaseSnapshotId ? 1 : 0,
        actorId: input.actorId, createdAt: now, updatedAt: now
      });
      for (const [selectionOrder, parentId] of selectedParentIds.entries()) {
        await client.execute(`
          INSERT INTO bom_draft_parent_bindings
            (id, company_id, bom_draft_id, part_number_id, selection_order, created_by, created_at)
          VALUES (:id, :companyId, :draftId, :parentId, :selectionOrder, :actorId, :createdAt)
        `, { id: this.idFactory(), companyId: input.companyId, draftId, parentId, selectionOrder, actorId: input.actorId, createdAt: now });
      }

      let clonedLineCount = 0;
      if (input.baseReleaseSnapshotId) {
        clonedLineCount = await this.cloneSharedReleaseIntoDraft({
          client,
          releaseSnapshotId: input.baseReleaseSnapshotId,
          draftId,
          selectedParentIds,
          actorId: input.actorId,
          now
        });
        await client.execute("UPDATE bom_drafts SET line_count = :lineCount WHERE id = :draftId", { draftId, lineCount: clonedLineCount });
      }

      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(), draftId, actorId: input.actorId,
        eventType: input.baseReleaseSnapshotId ? "clone_shared_revision" : "create_shared_manual",
        beforeJson: null,
        afterJson: JSON.stringify({ definitionId, draftId, revision, parentPartNumberIds: selectedParentIds, baseReleaseSnapshotId: input.baseReleaseSnapshotId, lineCount: clonedLineCount }),
        reason: input.baseReleaseSnapshotId ? "Clone next shared BOM revision" : "Create shared assembly BOM draft",
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(), submissionId: null, actorId: input.actorId, action: "SharedBomDraftCreated",
        detailJson: JSON.stringify({ definitionId, draftId, bomRevision: revision, parentPartNumberIds: selectedParentIds, baseReleaseSnapshotId: input.baseReleaseSnapshotId, idempotencyKey: input.idempotencyKey }),
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_CREATE_EFFECT_SQL, {
        id: this.idFactory(), companyId: input.companyId, actorId: input.actorId,
        idempotencyKey: input.idempotencyKey, requestFingerprint: input.requestFingerprint,
        draftId, outcomeJson: JSON.stringify({ definitionId, draftId, bomRevision: revision, parentPartNumberIds: selectedParentIds }), createdAt: now
      });
      return { draftId, replayed: false, definitionId };
    };

    let result: { draftId: string; replayed: boolean; definitionId: string };
    try {
      result = await this.client.transaction(create, { serializable: true });
    } catch (error) {
      const replayAfterCommit = await this.getSharedCreateReplay(input);
      if (replayAfterCommit) return replayAfterCommit;
      throw error;
    }
    const draft = await this.getDraftById(result.draftId);
    if (!draft?.definition_id || !draft.applicable_parents) throw new Error("BOM_CREATE_RESULT_NOT_FOUND");
    return { draft, replayed: result.replayed, definitionId: draft.definition_id, applicableParents: draft.applicable_parents };
  }

  private async getSharedCreateReplay(
    input: Pick<CreateSharedBomDraftInput, "companyId" | "actorId" | "idempotencyKey" | "requestFingerprint">
  ): Promise<CreateSharedBomDraftResult | null> {
    const effect = await this.client.queryOne<{ request_fingerprint: string; draft_id: string }>(SELECT_ASYNC_BOM_CREATE_EFFECT_SQL, {
      companyId: input.companyId, actorId: input.actorId, idempotencyKey: input.idempotencyKey
    });
    if (!effect) return null;
    if (effect.request_fingerprint !== input.requestFingerprint) throw new BomCreateIdempotencyConflictError();
    const draft = await this.getDraftById(effect.draft_id);
    if (!draft?.definition_id || !draft.applicable_parents) throw new Error("BOM_CREATE_EFFECT_DRAFT_NOT_FOUND");
    return { draft, replayed: true, definitionId: draft.definition_id, applicableParents: draft.applicable_parents };
  }

  private async cloneSharedReleaseIntoDraft(input: {
    client: AsyncDatabaseClient;
    releaseSnapshotId: string;
    draftId: string;
    selectedParentIds: string[];
    actorId: string;
    now: string;
  }) {
    const base = await input.client.queryOne<{ bom_draft_id: string; snapshot_schema_version: number | string }>(`
      SELECT bom_draft_id, snapshot_schema_version FROM bom_release_snapshots
      WHERE id = :releaseSnapshotId AND obsolete_at IS NULL
      ${input.client.kind === "postgres" ? "FOR UPDATE" : ""}
    `, { releaseSnapshotId: input.releaseSnapshotId });
    if (!base || numberValue(base.snapshot_schema_version) !== 2) throw new SharedBomError("BOM_BASE_RELEASE_STALE", 409);
    const baseParents = await input.client.query<{ parent_part_number_id: string }>(`
      SELECT parent_part_number_id FROM bom_release_parent_snapshots WHERE release_snapshot_id = :releaseSnapshotId
    `, { releaseSnapshotId: input.releaseSnapshotId });
    if (baseParents.some((parent) => !input.selectedParentIds.includes(parent.parent_part_number_id))) {
      throw new SharedBomError("BOM_PARENT_REMOVAL_NOT_SUPPORTED", 409);
    }
    const [lines, components, candidates, selections] = await Promise.all([
      input.client.query<BomWorkbenchLine>(SELECT_ASYNC_BOM_WORKBENCH_DRAFT_LINES_SQL, { draftId: base.bom_draft_id }),
      input.client.query<{ node_id: string; logical_line_id: string; node_location: "tree" | "floating"; component_mode: "fixed" | "by_parent"; child_part_root_id: string }>(
        "SELECT node_id, logical_line_id, node_location, component_mode, child_part_root_id FROM bom_draft_component_nodes WHERE bom_draft_id = :draftId",
        { draftId: base.bom_draft_id }
      ),
      input.client.query<{ logical_line_id: string; child_part_number_id: string; selection_order: number | string }>(
        "SELECT logical_line_id, child_part_number_id, selection_order FROM bom_draft_component_candidates WHERE bom_draft_id = :draftId ORDER BY logical_line_id, selection_order",
        { draftId: base.bom_draft_id }
      ),
      input.client.query<{ logical_line_id: string; parent_part_number_id: string; child_part_number_id: string }>(
        "SELECT logical_line_id, parent_part_number_id, child_part_number_id FROM bom_draft_parent_selections WHERE bom_draft_id = :draftId",
        { draftId: base.bom_draft_id }
      )
    ]);
    const nodeIdMap = new Map(lines.map((line) => [line.id, this.idFactory()]));
    for (const line of lines) {
      if (!line.logical_line_id) throw new SharedBomError("BOM_RELEASE_PROJECTION_AMBIGUOUS", 409);
      await input.client.execute(INSERT_ASYNC_BOM_WORKBENCH_DRAFT_LINE_SQL, {
        id: nodeIdMap.get(line.id), draftId: input.draftId, logicalLineId: line.logical_line_id,
        parentLineId: line.parent_line_id ? nodeIdMap.get(line.parent_line_id) ?? null : null,
        nodeType: line.node_type, itemId: line.item_id, partNumber: line.part_number, revision: line.revision,
        groupName: line.group_name, quantity: line.quantity, sequenceNo: line.sequence_no,
        source: "manual", sourcePriority: BOM_WORKBENCH_SOURCE_PRIORITY.manual, sourceRefId: null, sourceFilename: null,
        createdBy: input.actorId, updatedBy: input.actorId, createdAt: input.now, updatedAt: input.now
      });
    }
    for (const component of components) {
      const newNodeId = nodeIdMap.get(component.node_id);
      if (!newNodeId) throw new SharedBomError("BOM_RELEASE_PROJECTION_AMBIGUOUS", 409);
      await input.client.execute(`
        INSERT INTO bom_draft_component_nodes
          (bom_draft_id, logical_line_id, node_id, node_location, component_mode, child_part_root_id, created_by, updated_by, created_at, updated_at)
        VALUES (:draftId, :logicalLineId, :nodeId, :nodeLocation, :componentMode, :childRootId, :actorId, :actorId, :createdAt, :updatedAt)
      `, { draftId: input.draftId, logicalLineId: component.logical_line_id, nodeId: newNodeId, nodeLocation: "tree", componentMode: component.component_mode, childRootId: component.child_part_root_id, actorId: input.actorId, createdAt: input.now, updatedAt: input.now });
      for (const candidate of candidates.filter((row) => row.logical_line_id === component.logical_line_id)) {
        await input.client.execute(`
          INSERT INTO bom_draft_component_candidates (bom_draft_id, logical_line_id, child_part_number_id, selection_order)
          VALUES (:draftId, :logicalLineId, :childPartNumberId, :selectionOrder)
        `, { draftId: input.draftId, logicalLineId: component.logical_line_id, childPartNumberId: candidate.child_part_number_id, selectionOrder: numberValue(candidate.selection_order) });
      }
      for (const selection of selections.filter((row) => row.logical_line_id === component.logical_line_id && input.selectedParentIds.includes(row.parent_part_number_id))) {
        await input.client.execute(`
          INSERT INTO bom_draft_parent_selections (bom_draft_id, logical_line_id, parent_part_number_id, child_part_number_id)
          VALUES (:draftId, :logicalLineId, :parentPartNumberId, :childPartNumberId)
        `, { draftId: input.draftId, logicalLineId: component.logical_line_id, parentPartNumberId: selection.parent_part_number_id, childPartNumberId: selection.child_part_number_id });
      }
    }
    return lines.length;
  }

  async createCanonicalDraft(input: CreateCanonicalBomDraftInput): Promise<CreateCanonicalBomDraftResult> {
    const replay = await this.getCanonicalCreateReplay(input);
    if (replay) return replay;
    await this.assertCanonicalRevisionAvailable(input);
    const now = this.clock();
    const draftId = this.idFactory();
    const draftName = input.draftName?.trim() || `${input.ownerPartNumber} BOM Rev ${input.bomRevision}`;

    const create = async (client: AsyncDatabaseClient) => {
      const concurrentReplay = await this.getCanonicalCreateReplay(input, client);
      if (concurrentReplay) return { draftId: concurrentReplay.draft.id, replayed: true };
      await this.assertCanonicalRevisionAvailable(input, client);

      await client.execute(DEACTIVATE_ASYNC_CANONICAL_BOM_ACTIVE_DRAFTS_SQL, {
        ownerPartNumberId: input.ownerPartNumberId,
        bomRevision: input.bomRevision,
        updatedAt: now
      });
      await client.execute(INSERT_ASYNC_CANONICAL_BOM_DRAFT_SQL, {
        id: draftId,
        companyId: input.companyId,
        ownerPartNumberId: input.ownerPartNumberId,
        bomRevision: input.bomRevision,
        parentItemId: input.legacyItemId,
        draftName,
        source: input.source,
        lineCount: 0,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: now,
        updatedAt: now
      });

      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId,
        actorId: input.actorId,
        eventType: "create_manual",
        beforeJson: null,
        afterJson: JSON.stringify({
          draftId,
          ownerPartNumberId: input.ownerPartNumberId,
          bomRevision: input.bomRevision,
          source: input.source,
          lineCount: 0
        }),
        reason: "Create canonical material-owned BOM draft",
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: null,
        actorId: input.actorId,
        action: "CanonicalBomDraftCreated",
        detailJson: JSON.stringify({
          draftId,
          ownerPartNumberId: input.ownerPartNumberId,
          bomRevision: input.bomRevision,
          source: input.source
        }),
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_CREATE_EFFECT_SQL, {
        id: this.idFactory(),
        companyId: input.companyId,
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        draftId,
        outcomeJson: JSON.stringify({ draftId, source: input.source }),
        createdAt: now
      });
      return { draftId, replayed: false };
    };

    let result: { draftId: string; replayed: boolean };
    try {
      result = await this.client.transaction(create);
    } catch (error) {
      const replayAfterConcurrentCommit = await this.getCanonicalCreateReplay(input);
      if (replayAfterConcurrentCommit) return replayAfterConcurrentCommit;
      throw error;
    }
    const draft = await this.getDraftById(result.draftId);
    if (!draft) throw new Error("BOM_CREATE_RESULT_NOT_FOUND");
    return { draft, replayed: result.replayed };
  }

  private async getCanonicalCreateReplay(
    input: Pick<CreateCanonicalBomDraftInput, "companyId" | "actorId" | "idempotencyKey" | "requestFingerprint">,
    client: AsyncDatabaseClient = this.client
  ): Promise<CreateCanonicalBomDraftResult | null> {
    const effect = await client.queryOne<{ request_fingerprint: string; draft_id: string }>(SELECT_ASYNC_BOM_CREATE_EFFECT_SQL, {
      companyId: input.companyId,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey
    });
    if (!effect) return null;
    if (effect.request_fingerprint !== input.requestFingerprint) throw new BomCreateIdempotencyConflictError();
    const draft = await this.getDraftById(effect.draft_id);
    if (!draft) throw new Error("BOM_CREATE_EFFECT_DRAFT_NOT_FOUND");
    return { draft, replayed: true };
  }

  private async assertCanonicalRevisionAvailable(
    input: Pick<CreateCanonicalBomDraftInput, "ownerPartNumberId" | "bomRevision">,
    client: AsyncDatabaseClient = this.client
  ) {
    const history = await client.query<{ revision: string; status: string }>(
      `
        SELECT bom_revision AS revision, status
        FROM bom_drafts
        WHERE owner_part_number_id = :ownerPartNumberId
          AND bom_revision IS NOT NULL
          AND status <> 'Archived'
        UNION ALL
        SELECT bom_revision AS revision, 'Released' AS status
        FROM bom_release_snapshots
        WHERE owner_part_number_id = :ownerPartNumberId
          AND bom_revision IS NOT NULL
      `,
      { ownerPartNumberId: input.ownerPartNumberId }
    );
    const requested = parseRevisionCode(input.bomRevision);
    if (!requested || requested.kind !== "major") throw new BomRevisionConflictError("BOM_REVISION_NOT_FORWARD");
    const parsedHistory = history
      .map((row) => ({ row, parsed: parseRevisionCode(row.revision, { allowLegacy: true }) }))
      .filter((entry): entry is { row: { revision: string; status: string }; parsed: NonNullable<ReturnType<typeof parseRevisionCode>> } =>
        Boolean(entry.parsed)
      );
    if (parsedHistory.some((entry) => entry.parsed.kind === "major" && entry.parsed.major === requested.major)) {
      throw new BomRevisionConflictError("BOM_REVISION_OCCUPIED");
    }
    const latestReleasedMajor = Math.max(
      0,
      ...parsedHistory
        .filter((entry) => entry.row.status === "Released" && entry.parsed.kind === "major")
        .map((entry) => entry.parsed.major)
    );
    if (requested.major <= latestReleasedMajor) throw new BomRevisionConflictError("BOM_REVISION_NOT_FORWARD");
  }

  async listPendingReviews(): Promise<BomWorkbenchPendingReview[]> {
    const rows = await this.client.query<Omit<BomWorkbenchPendingReview, "diff">>(SELECT_ASYNC_BOM_WORKBENCH_PENDING_REVIEWS_SQL);
    const reviews: BomWorkbenchPendingReview[] = [];
    for (const row of rows) {
      const diff = await this.getDraftDiff(row.bom_draft_id);
      if (diff) {
        reviews.push({ ...row, review_attempt: numberValue(row.review_attempt), diff });
      }
    }
    return reviews;
  }

  async getReviewById(reviewId: string): Promise<BomWorkbenchReview | null> {
    const review = await this.client.queryOne<BomWorkbenchReview>(SELECT_ASYNC_BOM_WORKBENCH_REVIEW_SQL, { reviewId });
    return review ? coerceReview(review) : null;
  }

  async saveDraftTree(input: SaveAsyncBomWorkbenchDraftTreeInput): Promise<BomWorkbenchDraftDetail | null> {
    const before = await this.getDraftById(input.draftId);
    if (!before) return null;
    assertBomDraftMutable(before.status);

    const isShared = Boolean(before.definition_id);
    const normalizedLines = this.normalizeWorkbenchTreeLines(input.lines, isShared);
    const normalizedFloatingTopics = this.normalizeFloatingTopics(input.floatingTopics);
    const lineIds = new Set(normalizedLines.map((line) => line.id));
    if (normalizedFloatingTopics.some((topic) => lineIds.has(topic.id))) throw new Error("BOM_EDITOR_DUPLICATE_NODE_ID");
    const parentIds = before.applicable_parents?.map((parent) => parent.part_number_id) ?? [];
    const normalizedComponents = (input.components ?? []).map((component) => ({
      ...component,
      logicalLineId: component.logicalLineId.trim().toLowerCase(),
      childPartNumberIds: [...component.childPartNumberIds],
      parentSelections: component.parentSelections.map((selection) => ({ ...selection }))
    }));
    if (isShared) {
      if (!parentIds.length) throw new SharedBomError("BOM_APPLICABILITY_CONFLICT", 409);
      validateSharedGraph({
        lines: normalizedLines.map((line) => ({
          id: line.id,
          logicalLineId: line.logicalLineId ?? "",
          parentLineId: line.parentLineId,
          nodeType: line.nodeType,
          partNumber: line.partNumber,
          groupName: line.groupName,
          quantity: line.quantity,
          sequenceNo: line.sequenceNo
        })),
        floatingTopics: normalizedFloatingTopics.map((topic) => ({
          id: topic.id,
          logicalLineId: topic.logicalLineId ?? "",
          parentFloatingTopicId: topic.parentFloatingTopicId,
          nodeType: topic.nodeType,
          partNumber: topic.partNumber,
          groupName: topic.groupName,
          quantity: topic.quantity,
          sequenceNo: topic.sequenceNo
        })),
        components: normalizedComponents,
        parentPartNumberIds: parentIds
      });
    } else if (input.components?.length) {
      throw new SharedBomError("BOM_SHARED_PAYLOAD_NOT_ALLOWED", 422);
    }
    const now = this.clock();
    const reason = input.reason?.trim() || "Save BOM workbench draft tree";
    const save = async (client: AsyncDatabaseClient) => {
      const lockedDraft = await client.queryOne<{ status: BomWorkbenchDraftSummary["status"]; editor_version: number }>(
        `
          SELECT status, editor_version
          FROM bom_drafts
          WHERE id = :draftId
          ${client.kind === "postgres" ? "FOR UPDATE" : ""}
        `,
        { draftId: input.draftId }
      );
      if (!lockedDraft) throw new Error("BOM_DRAFT_NOT_FOUND");
      assertBomDraftMutable(lockedDraft.status);
      const actualVersion = numberValue(lockedDraft.editor_version);
      if (actualVersion !== input.expectedEditorVersion) {
        throw new BomDraftEditorVersionConflictError(input.expectedEditorVersion, actualVersion);
      }

      if (isShared) {
        await this.validateSharedSaveAuthority({
          client,
          draft: before,
          lines: normalizedLines,
          floatingTopics: normalizedFloatingTopics,
          components: normalizedComponents,
          parentIds
        });
        await client.execute("DELETE FROM bom_draft_component_nodes WHERE bom_draft_id = :draftId", { draftId: input.draftId });
      }
      await client.execute(DELETE_ASYNC_BOM_WORKBENCH_DRAFT_LINES_SQL, {
        draftId: input.draftId
      });
      await client.execute(DELETE_ASYNC_BOM_DRAFT_FLOATING_TOPICS_SQL, {
        draftId: input.draftId
      });

      for (const line of normalizedLines) {
        const childItem =
          line.nodeType === "item" && line.partNumber
            ? await client.queryOne<{ id: string }>(SELECT_ASYNC_BOM_WORKBENCH_ITEM_BY_PART_NUMBER_SQL, {
                partNumber: line.partNumber
              })
            : null;
        await client.execute(INSERT_ASYNC_BOM_WORKBENCH_DRAFT_LINE_SQL, {
          id: line.id,
          draftId: input.draftId,
          logicalLineId: line.logicalLineId,
          parentLineId: line.parentLineId,
          nodeType: line.nodeType,
          itemId: childItem?.id ?? null,
          partNumber: line.nodeType === "item" ? line.partNumber : null,
          revision: line.nodeType === "item" ? line.revision : null,
          groupName: line.nodeType === "group" ? line.groupName : null,
          quantity: line.nodeType === "item" ? line.quantity : null,
          sequenceNo: line.sequenceNo,
          source: "manual",
          sourcePriority: BOM_WORKBENCH_SOURCE_PRIORITY.manual,
          sourceRefId: null,
          sourceFilename: null,
          createdBy: input.actorId,
          updatedBy: input.actorId,
          createdAt: now,
          updatedAt: now
        });
      }

      for (const topic of normalizedFloatingTopics) {
        const childItem =
          topic.nodeType === "item" && topic.partNumber
            ? await client.queryOne<{ id: string }>(SELECT_ASYNC_BOM_WORKBENCH_ITEM_BY_PART_NUMBER_SQL, {
                partNumber: topic.partNumber
              })
            : null;
        await client.execute(INSERT_ASYNC_BOM_DRAFT_FLOATING_TOPIC_SQL, {
          id: topic.id,
          draftId: input.draftId,
          logicalLineId: topic.logicalLineId,
          parentFloatingTopicId: topic.parentFloatingTopicId,
          nodeType: topic.nodeType,
          itemId: childItem?.id ?? null,
          partNumber: topic.nodeType === "item" ? topic.partNumber : null,
          revision: topic.nodeType === "item" ? topic.revision : null,
          groupName: topic.nodeType === "group" ? topic.groupName : null,
          quantity: topic.nodeType === "item" ? topic.quantity : null,
          sequenceNo: topic.sequenceNo,
          rootPositionX: topic.rootPositionX,
          rootPositionY: topic.rootPositionY,
          createdBy: input.actorId,
          updatedBy: input.actorId,
          createdAt: now,
          updatedAt: now
        });
      }

      if (isShared) {
        const candidateIds = normalizeStableIds(normalizedComponents.flatMap((component) => component.childPartNumberIds), SHARED_BOM_LIMITS.nodes * SHARED_BOM_LIMITS.candidatesPerLine);
        const candidateParams = Object.fromEntries(candidateIds.map((candidateId, index) => [`child${index}`, candidateId]));
        const childRows = candidateIds.length ? await client.query<{ id: string; part_root_id: string }>(`
          SELECT id, part_root_id FROM part_numbers
          WHERE id IN (${candidateIds.map((_, index) => `:child${index}`).join(",")}) AND company_id = :companyId
        `, { ...candidateParams, companyId: before.company_id }) : [];
        const childById = new Map(childRows.map((row) => [row.id, row]));
        for (const component of normalizedComponents) {
          const roots = new Set(component.childPartNumberIds.map((candidateId) => childById.get(candidateId)?.part_root_id).filter(Boolean));
          if (roots.size !== 1) throw new SharedBomError("BOM_COMPONENT_CHILD_SCOPE_INVALID", 422);
          await client.execute(`
            INSERT INTO bom_draft_component_nodes
              (bom_draft_id, logical_line_id, node_id, node_location, component_mode, child_part_root_id, created_by, updated_by, created_at, updated_at)
            VALUES (:draftId, :logicalLineId, :nodeId, :nodeLocation, :componentMode, :childRootId, :actorId, :actorId, :createdAt, :updatedAt)
          `, {
            draftId: input.draftId, logicalLineId: component.logicalLineId, nodeId: component.nodeId,
            nodeLocation: component.nodeLocation, componentMode: component.componentMode,
            childRootId: [...roots][0], actorId: input.actorId, createdAt: now, updatedAt: now
          });
          for (const [selectionOrder, childPartNumberId] of component.childPartNumberIds.entries()) {
            await client.execute(`
              INSERT INTO bom_draft_component_candidates (bom_draft_id, logical_line_id, child_part_number_id, selection_order)
              VALUES (:draftId, :logicalLineId, :childPartNumberId, :selectionOrder)
            `, { draftId: input.draftId, logicalLineId: component.logicalLineId, childPartNumberId, selectionOrder });
          }
          for (const selection of component.parentSelections) {
            await client.execute(`
              INSERT INTO bom_draft_parent_selections (bom_draft_id, logical_line_id, parent_part_number_id, child_part_number_id)
              VALUES (:draftId, :logicalLineId, :parentPartNumberId, :childPartNumberId)
            `, { draftId: input.draftId, logicalLineId: component.logicalLineId, parentPartNumberId: selection.parentPartNumberId, childPartNumberId: selection.childPartNumberId });
          }
        }
        await client.execute(`
          UPDATE bom_definitions SET row_version = row_version + 1, updated_by = :actorId, updated_at = :updatedAt
          WHERE id = :definitionId
        `, { definitionId: before.definition_id, actorId: input.actorId, updatedAt: now });
      }

      const replacementCandidates = await client.query<{ company_id: string; old_part_number_id: string; new_part_number_id: string }>(
        SELECT_ASYNC_BOM_WORKBENCH_REPLACEMENT_CANDIDATES_SQL,
        { draftId: input.draftId }
      );
      for (const candidate of replacementCandidates) {
        await client.execute(INSERT_ASYNC_BOM_WORKBENCH_RECONFIRMATION_FLAG_SQL, {
          id: this.idFactory(),
          companyId: candidate.company_id,
          draftId: input.draftId,
          oldPartNumberId: candidate.old_part_number_id,
          newPartNumberId: candidate.new_part_number_id,
          reason: "replacement_part_released",
          createdAt: now
        });
      }

      await client.execute(UPDATE_ASYNC_BOM_WORKBENCH_DRAFT_AFTER_SAVE_SQL, {
        draftId: input.draftId,
        source: "manual",
        lineCount: normalizedLines.length,
        expectedEditorVersion: input.expectedEditorVersion,
        updatedBy: input.actorId,
        updatedAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId: input.draftId,
        actorId: input.actorId,
        eventType: "save_tree",
        beforeJson: JSON.stringify({
          editorVersion: input.expectedEditorVersion,
          lineCount: before.lines.length,
          floatingTopicCount: before.floating_topics.length,
          lines: before.lines,
          floatingTopics: before.floating_topics
        }),
        afterJson: JSON.stringify({
          editorVersion: input.expectedEditorVersion + 1,
          lineCount: normalizedLines.length,
          floatingTopicCount: normalizedFloatingTopics.length,
          lines: normalizedLines,
          floatingTopics: normalizedFloatingTopics
          ,...(isShared ? { components: normalizedComponents, parentPartNumberIds: parentIds } : {})
        }),
        reason,
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: auditSubmissionId(before),
        actorId: input.actorId,
        action: "BomWorkbenchDraftSaved",
        detailJson: JSON.stringify({
          draftId: input.draftId,
          beforeLineCount: before.lines.length,
          afterLineCount: normalizedLines.length,
          beforeFloatingTopicCount: before.floating_topics.length,
          afterFloatingTopicCount: normalizedFloatingTopics.length,
          expectedEditorVersion: input.expectedEditorVersion,
          savedEditorVersion: input.expectedEditorVersion + 1,
          definitionId: before.definition_id,
          parentPartNumberIds: isShared ? parentIds : undefined,
          reason: input.reason?.trim() || null
        }),
        createdAt: now
      });
    };

    await this.client.transaction(save);

    return this.getDraftById(input.draftId);
  }

  private async validateSharedSaveAuthority(input: {
    client: AsyncDatabaseClient;
    draft: BomWorkbenchDraftDetail;
    lines: NormalizedWorkbenchTreeLine[];
    floatingTopics: NormalizedFloatingTopic[];
    components: SharedBomComponentInput[];
    parentIds: string[];
  }) {
    if (!input.draft.definition_id || !input.draft.company_id) throw new SharedBomError("BOM_APPLICABILITY_CONFLICT", 409);
    const allNodes = [...input.lines, ...input.floatingTopics];
    const currentLogicalIds = new Set([
      ...input.draft.lines.map((line) => line.logical_line_id).filter((value): value is string => Boolean(value)),
      ...input.draft.floating_topics.map((topic) => topic.logical_line_id).filter((value): value is string => Boolean(value))
    ]);
    const requestedLogicalIds = allNodes.map((node) => node.logicalLineId).filter((value): value is string => Boolean(value));
    const historicalRows = requestedLogicalIds.length ? await input.client.query<{ logical_line_id: string }>(`
      SELECT tree.logical_line_id
      FROM bom_lines_tree tree JOIN bom_drafts draft ON draft.id = tree.bom_draft_id
      WHERE draft.definition_id = :definitionId AND draft.id <> :draftId
        AND tree.logical_line_id IN (${requestedLogicalIds.map((_, index) => `:logical${index}`).join(",")})
      UNION
      SELECT floating.logical_line_id
      FROM bom_draft_floating_topics floating JOIN bom_drafts draft ON draft.id = floating.bom_draft_id
      WHERE draft.definition_id = :definitionId AND draft.id <> :draftId
        AND floating.logical_line_id IN (${requestedLogicalIds.map((_, index) => `:logical${index}`).join(",")})
    `, {
      definitionId: input.draft.definition_id,
      draftId: input.draft.id,
      ...Object.fromEntries(requestedLogicalIds.map((logicalId, index) => [`logical${index}`, logicalId]))
    }) : [];
    if (historicalRows.some((row) => !currentLogicalIds.has(row.logical_line_id))) {
      throw new SharedBomError("BOM_LOGICAL_LINE_ID_CONFLICT", 409);
    }

    const childIds = normalizeStableIds(input.components.flatMap((component) => component.childPartNumberIds), SHARED_BOM_LIMITS.nodes * SHARED_BOM_LIMITS.candidatesPerLine);
    const childRows = childIds.length ? await input.client.query<{
      id: string; company_id: string; part_root_id: string; record_status: string;
    }>(`
      SELECT id, company_id, part_root_id, record_status FROM part_numbers
      WHERE id IN (${childIds.map((_, index) => `:child${index}`).join(",")})
    `, Object.fromEntries(childIds.map((childId, index) => [`child${index}`, childId]))) : [];
    if (childRows.length !== childIds.length || childRows.some((row) => row.company_id !== input.draft.company_id || ["Obsolete", "Merged", "MainDrawingInvalid"].includes(row.record_status))) {
      throw new SharedBomError("BOM_COMPONENT_CHILD_SCOPE_INVALID", 422);
    }
    const childById = new Map(childRows.map((row) => [row.id, row]));
    for (const component of input.components) {
      const roots = new Set(component.childPartNumberIds.map((childId) => childById.get(childId)?.part_root_id));
      if (roots.size !== 1 || roots.has(undefined)) throw new SharedBomError("BOM_COMPONENT_CHILD_SCOPE_INVALID", 422);
      if (component.componentMode === "fixed" && input.parentIds.includes(component.childPartNumberIds[0])) {
        throw new SharedBomError("BOM_GRAPH_CYCLE", 409, { logicalLineId: component.logicalLineId });
      }
      if (component.parentSelections.some((selection) => selection.parentPartNumberId === selection.childPartNumberId)) {
        throw new SharedBomError("BOM_GRAPH_CYCLE", 409, { logicalLineId: component.logicalLineId });
      }
    }
  }

  private async buildSharedEvidence(draft: BomWorkbenchDraftDetail, client: AsyncDatabaseClient = this.client): Promise<SharedBomEvidence> {
    if (!draft.definition_id || !draft.company_id || !draft.applicable_parents || !draft.components) {
      throw new SharedBomError("BOM_RELEASE_PROJECTION_AMBIGUOUS", 409);
    }
    if (!draft.lines.some((line) => line.node_type === "item")) throw new SharedBomError("BOM_ITEM_LINE_REQUIRED", 409);
    if (draft.unresolved_mappings?.length) {
      throw new SharedBomError("BOM_VARIANT_MAPPING_INCOMPLETE", 409, { unresolvedMappings: draft.unresolved_mappings });
    }
    if (draft.lines.length * draft.applicable_parents.length > SHARED_BOM_LIMITS.resolvedRows) {
      throw new SharedBomError("BOM_SHARED_STRUCTURE_LIMIT_EXCEEDED", 413, { limit: SHARED_BOM_LIMITS.resolvedRows });
    }
    const parents = [...draft.applicable_parents].sort((left, right) => left.selection_order - right.selection_order || left.part_number_id.localeCompare(right.part_number_id, "en"));
    const componentByLogicalId = new Map(draft.components.map((component) => [component.logical_line_id, component]));
    const childIds = normalizeStableIds(draft.components.flatMap((component) => component.child_part_number_ids), SHARED_BOM_LIMITS.nodes * SHARED_BOM_LIMITS.candidatesPerLine);
    const children = childIds.length ? await client.query<{
      id: string; company_id: string; part_number: string; part_name: string; record_status: string;
    }>(`
      SELECT id, company_id, part_number, part_name, record_status FROM part_numbers
      WHERE id IN (${childIds.map((_, index) => `:child${index}`).join(",")})
    `, Object.fromEntries(childIds.map((childId, index) => [`child${index}`, childId]))) : [];
    if (children.length !== childIds.length || children.some((child) => child.company_id !== draft.company_id || ["Obsolete", "Merged", "MainDrawingInvalid"].includes(child.record_status))) {
      throw new SharedBomError("BOM_COMPONENT_CHILD_SCOPE_INVALID", 409);
    }
    const childById = new Map(children.map((child) => [child.id, child]));
    const lineById = new Map(draft.lines.map((line) => [line.id, line]));
    const levelCache = new Map<string, number>();
    const levelOf = (line: BomWorkbenchLine): number => {
      const cached = levelCache.get(line.id);
      if (cached !== undefined) return cached;
      const level = line.parent_line_id ? levelOf(lineById.get(line.parent_line_id) ?? line) + 1 : 0;
      levelCache.set(line.id, level);
      return level;
    };
    const sharedLines = draft.lines.map((line) => {
      if (!line.logical_line_id) throw new SharedBomError("BOM_LOGICAL_LINE_ID_INVALID", 409);
      return {
        logicalLineId: line.logical_line_id,
        parentLogicalLineId: line.parent_line_id ? lineById.get(line.parent_line_id)?.logical_line_id ?? null : null,
        nodeType: line.node_type,
        groupName: line.group_name,
        quantity: line.quantity,
        sequenceNo: line.sequence_no,
        level: levelOf(line)
      };
    });
    const mappings = [...draft.components].sort((left, right) => left.logical_line_id.localeCompare(right.logical_line_id, "en")).map((component) => ({
      logicalLineId: component.logical_line_id,
      componentMode: component.component_mode,
      childPartRootId: component.child_part_root_id,
      childPartNumberIds: [...component.child_part_number_ids].sort((left, right) => left.localeCompare(right, "en")),
      parentSelections: [...component.parent_selections]
        .sort((left, right) => left.parent_part_number_id.localeCompare(right.parent_part_number_id, "en"))
        .map((selection) => ({ parentPartNumberId: selection.parent_part_number_id, childPartNumberId: selection.child_part_number_id }))
    }));
    const resolved = parents.map((parent) => {
      const lines = draft.lines.map<SharedResolvedLineProjection>((line) => {
        const parentLogicalLineId = line.parent_line_id ? lineById.get(line.parent_line_id)?.logical_line_id ?? null : null;
        if (!line.logical_line_id) throw new SharedBomError("BOM_LOGICAL_LINE_ID_INVALID", 409);
        if (line.node_type === "group") return {
          logicalLineId: line.logical_line_id,
          parentLogicalLineId,
          nodeType: "group",
          childPartNumberId: null,
          childPartNumber: null,
          childPartName: null,
          groupName: line.group_name,
          quantity: null,
          sequenceNo: line.sequence_no,
          level: levelOf(line)
        };
        const component = componentByLogicalId.get(line.logical_line_id);
        if (!component) throw new SharedBomError("BOM_COMPONENT_REQUIRED", 409, { logicalLineId: line.logical_line_id });
        const childPartNumberId = component.component_mode === "fixed"
          ? component.child_part_number_ids[0]
          : component.parent_selections.find((selection) => selection.parent_part_number_id === parent.part_number_id)?.child_part_number_id;
        const child = childPartNumberId ? childById.get(childPartNumberId) : null;
        if (!child) throw new SharedBomError("BOM_VARIANT_MAPPING_INCOMPLETE", 409, { logicalLineId: line.logical_line_id, parentPartNumberId: parent.part_number_id });
        return {
          logicalLineId: line.logical_line_id,
          parentLogicalLineId,
          nodeType: "item",
          childPartNumberId: child.id,
          childPartNumber: child.part_number,
          childPartName: child.part_name,
          groupName: null,
          quantity: line.quantity,
          sequenceNo: line.sequence_no,
          level: levelOf(line)
        };
      });
      return { parentPartNumberId: parent.part_number_id, parentPartNumber: parent.part_number, hash: canonicalSha256(lines).hash, lines };
    });

    const existingEdges = await client.query<{ parent_part_number_id: string; child_part_number_id: string }>(`
      SELECT resolved.parent_part_number_id, resolved.child_part_number_id
      FROM bom_release_resolved_lines resolved JOIN bom_release_snapshots snapshot ON snapshot.id = resolved.release_snapshot_id
      WHERE snapshot.company_id = :companyId AND snapshot.snapshot_schema_version = 2 AND snapshot.obsolete_at IS NULL
        AND resolved.node_type = 'item' AND resolved.child_part_number_id IS NOT NULL
    `, { companyId: draft.company_id });
    const graph = new Map<string, Set<string>>();
    for (const edge of existingEdges) {
      if (!graph.has(edge.parent_part_number_id)) graph.set(edge.parent_part_number_id, new Set());
      graph.get(edge.parent_part_number_id)!.add(edge.child_part_number_id);
    }
    for (const projection of resolved) {
      graph.set(projection.parentPartNumberId, new Set(projection.lines.filter((line) => line.nodeType === "item").map((line) => line.childPartNumberId as string)));
    }
    const detectCycle = (origin: string, current: string, visiting = new Set<string>()): boolean => {
      if (visiting.has(current)) return current === origin;
      const nextVisiting = new Set(visiting).add(current);
      for (const child of graph.get(current) ?? []) {
        if (child === origin || detectCycle(origin, child, nextVisiting)) return true;
      }
      return false;
    };
    for (const parent of parents) if (detectCycle(parent.part_number_id, parent.part_number_id)) {
      throw new SharedBomError("BOM_GRAPH_CYCLE", 409, { parentPartNumberId: parent.part_number_id });
    }
    return { parents, sharedLines, mappings, resolved };
  }

  async submitReview(input: SubmitAsyncBomWorkbenchDraftReviewInput): Promise<BomWorkbenchReview | null> {
    const draft = await this.getDraftById(input.draftId);
    if (!draft) return null;
    assertBomDraftMutable(draft.status);
    if (draft.floating_topics.length > 0) {
      throw new BomFloatingTopicsUnresolvedError(draft.floating_topics.length);
    }
    if (draft.reconfirmation_flags.length > 0) {
      throw new Error("BOM_RECONFIRMATION_REQUIRED");
    }
    let sharedEvidence: SharedBomEvidence | null = null;
    let definitionRowVersion: number | null = null;
    let reviewSnapshot: { json: string; hash: string } | null = null;
    if (draft.definition_id) {
      sharedEvidence = await this.buildSharedEvidence(draft);
      const definition = await this.client.queryOne<{ row_version: number | string }>(
        "SELECT row_version FROM bom_definitions WHERE id = :definitionId AND company_id = :companyId",
        { definitionId: draft.definition_id, companyId: draft.company_id }
      );
      if (!definition) throw new SharedBomError("BOM_RESOURCE_NOT_FOUND", 404);
      definitionRowVersion = numberValue(definition.row_version);
      reviewSnapshot = canonicalSha256({
        schemaVersion: 2,
        definitionId: draft.definition_id,
        definitionRowVersion,
        draftId: draft.id,
        editorVersion: draft.editor_version,
        bomRevision: draft.bom_revision,
        submitterId: input.actorId,
        parents: sharedEvidence.parents.map((parent) => ({ partNumberId: parent.part_number_id, partNumber: parent.part_number, name: parent.part_name, selectionOrder: parent.selection_order })),
        sharedLines: sharedEvidence.sharedLines,
        mappings: sharedEvidence.mappings,
        resolvedProjectionHashes: sharedEvidence.resolved.map((projection) => ({ parentPartNumberId: projection.parentPartNumberId, hash: projection.hash, lineCount: projection.lines.length })),
        reconfirmationCount: draft.reconfirmation_flags.length,
        baseReleaseSnapshotId: draft.base_release_snapshot_id ?? null
      });
    }

    const changeReason = input.changeReason.trim();
    if (!changeReason) throw new Error("BOM_REVIEW_CHANGE_REASON_REQUIRED");

    const existingPendingReview = draft.definition_id
      ? await this.client.queryOne<{ id: string }>("SELECT id FROM bom_drafts WHERE definition_id = :definitionId AND status = 'PendingReview' AND id <> :draftId LIMIT 1", { definitionId: draft.definition_id, draftId: input.draftId })
      : await this.client.queryOne<{ id: string }>(SELECT_ASYNC_BOM_WORKBENCH_EXISTING_PENDING_REVIEW_SQL, {
          ownerPartNumberId: draft.owner_part_number_id,
          bomRevision: draft.bom_revision,
          parentItemId: draft.parent_item_id,
          parentRevision: draft.parent_revision,
          draftId: input.draftId
        });
    if (existingPendingReview) throw new Error("BOM_PENDING_REVIEW_EXISTS");

    const now = this.clock();
    const reviewId = this.idFactory();
    const submit = async (client: AsyncDatabaseClient) => {
      if (draft.definition_id) {
        const locked = await client.queryOne<{ status: string; editor_version: number | string; row_version: number | string }>(`
          SELECT draft.status, draft.editor_version, definition.row_version
          FROM bom_drafts draft JOIN bom_definitions definition ON definition.id = draft.definition_id
          WHERE draft.id = :draftId
          ${client.kind === "postgres" ? "FOR UPDATE OF draft, definition" : ""}
        `, { draftId: draft.id });
        if (!locked || !["Draft", "Rejected"].includes(locked.status)
          || numberValue(locked.editor_version) !== draft.editor_version
          || numberValue(locked.row_version) !== definitionRowVersion) {
          throw new SharedBomError("BOM_REVIEW_SNAPSHOT_STALE", 409);
        }
      }
      await client.execute(SUBMIT_ASYNC_BOM_WORKBENCH_DRAFT_REVIEW_SQL, {
        draftId: input.draftId,
        updatedBy: input.actorId,
        updatedAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_REVIEW_SQL, {
        id: reviewId,
        draftId: input.draftId,
        status: "PendingReview",
        lifecycleAction: "release",
        submittedBy: input.actorId,
        changeReason,
        submittedAt: now
      });
      if (draft.definition_id && reviewSnapshot && definitionRowVersion !== null) {
        await client.execute(`
          UPDATE bom_review_requests
          SET review_schema_version = 2,
              definition_row_version = :definitionRowVersion,
              editor_version = :editorVersion,
              review_snapshot_json = :reviewSnapshotJson,
              review_snapshot_hash = :reviewSnapshotHash
          WHERE id = :reviewId
        `, {
          reviewId,
          definitionRowVersion,
          editorVersion: draft.editor_version,
          reviewSnapshotJson: reviewSnapshot.json,
          reviewSnapshotHash: reviewSnapshot.hash
        });
      }
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId: input.draftId,
        actorId: input.actorId,
        eventType: "submit_review",
        beforeJson: JSON.stringify({ status: draft.status, reviewAttempt: draft.review_attempt }),
        afterJson: JSON.stringify({ status: "PendingReview", reviewAttempt: draft.review_attempt + 1, reviewId, reviewSnapshotHash: reviewSnapshot?.hash ?? null }),
        reason: changeReason,
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: auditSubmissionId(draft),
        actorId: input.actorId,
        action: "BomWorkbenchReviewSubmitted",
        detailJson: JSON.stringify({
          definitionId: draft.definition_id,
          draftId: input.draftId,
          reviewId,
          changeReason,
          parentPartNumberIds: sharedEvidence?.parents.map((parent) => parent.part_number_id),
          definitionRowVersion,
          editorVersion: draft.editor_version,
          reviewSnapshotHash: reviewSnapshot?.hash ?? null
        }),
        createdAt: now
      });
    };

    await this.client.transaction(submit, { serializable: Boolean(draft.definition_id) });

    return this.getReviewById(reviewId);
  }

  async requestObsoleteReview(input: RequestAsyncBomWorkbenchObsoleteReviewInput): Promise<BomWorkbenchReview | null> {
    const draft = await this.getDraftById(input.draftId);
    if (!draft) return null;
    if (draft.status === "Obsolete") throw new Error("LIFE_OBSOLETE_ALREADY_APPROVED");
    if (draft.status !== "Released") throw new Error("LIFE_OBSOLETE_NOT_FORMAL");
    if (draft.definition_id) {
      const current = await this.client.queryOne<{ bom_draft_id: string }>(`
        SELECT bom_draft_id FROM bom_release_snapshots
        WHERE definition_id = :definitionId AND obsolete_at IS NULL
        ORDER BY released_at DESC, id DESC LIMIT 1
      `, { definitionId: draft.definition_id });
      if (!current || current.bom_draft_id !== draft.id) throw new SharedBomError("BOM_PARTIAL_OBSOLETE_NOT_SUPPORTED", 409);
    }

    const reason = input.reason.trim();
    if (!reason) throw new Error("LIFE_OBSOLETE_REASON_REQUIRED");

    const existingPendingReview = await this.client.queryOne<{ id: string }>(
      SELECT_ASYNC_BOM_WORKBENCH_EXISTING_PENDING_OBSOLETE_REVIEW_SQL,
      { draftId: input.draftId }
    );
    if (existingPendingReview) throw new Error("LIFE_OBSOLETE_ALREADY_REQUESTED");

    const now = this.clock();
    const reviewId = this.idFactory();
    const requestObsolete = async (client: AsyncDatabaseClient) => {
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_REVIEW_SQL, {
        id: reviewId,
        draftId: input.draftId,
        status: "PendingReview",
        lifecycleAction: "obsolete",
        submittedBy: input.actorId,
        changeReason: reason,
        submittedAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId: input.draftId,
        actorId: input.actorId,
        eventType: "request_obsolete",
        beforeJson: JSON.stringify({ status: draft.status }),
        afterJson: JSON.stringify({ status: draft.status, reviewId, lifecycleAction: "obsolete" }),
        reason,
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: auditSubmissionId(draft),
        actorId: input.actorId,
        action: "lifecycle.obsolete.requested",
        detailJson: JSON.stringify({
          entityType: "bom_workbench_draft",
          draftId: input.draftId,
          reviewId,
          beforeStatus: draft.status,
          requestedStatus: "Obsolete",
          reason
        }),
        createdAt: now
      });
    };

    await this.client.transaction(requestObsolete, { serializable: Boolean(draft.definition_id) });

    return this.getReviewById(reviewId);
  }

  async reconfirmReplacementFlags(input: ReconfirmAsyncBomReplacementFlagsInput): Promise<BomWorkbenchDraftDetail | null> {
    const draft = await this.getDraftById(input.draftId);
    if (!draft) return null;
    assertBomDraftMutable(draft.status);
    if (draft.reconfirmation_flags.length === 0) return draft;

    const now = this.clock();
    const note = input.note?.trim() || "BOM owner reconfirmed replaced part usage";
    const confirm = async (client: AsyncDatabaseClient) => {
      await client.execute(RESOLVE_ASYNC_BOM_WORKBENCH_RECONFIRMATION_FLAGS_SQL, {
        draftId: input.draftId,
        resolvedAt: now,
        resolvedBy: input.actorId
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId: input.draftId,
        actorId: input.actorId,
        eventType: "reconfirm_replaced_parts",
        beforeJson: JSON.stringify({ reconfirmationFlags: draft.reconfirmation_flags }),
        afterJson: JSON.stringify({ reconfirmationFlags: [] }),
        reason: note,
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: auditSubmissionId(draft),
        actorId: input.actorId,
        action: "BomWorkbenchReplacementPartsReconfirmed",
        detailJson: JSON.stringify({
          draftId: input.draftId,
          flagCount: draft.reconfirmation_flags.length,
          note
        }),
        createdAt: now
      });
    };

    await this.client.transaction(confirm, { serializable: Boolean(draft.definition_id) });

    return this.getDraftById(input.draftId);
  }

  async rejectReview(input: DecideAsyncBomWorkbenchReviewInput): Promise<{ review: BomWorkbenchReview | null; draft: BomWorkbenchDraftDetail | null } | null> {
    const review = await this.getReviewById(input.reviewId);
    if (!review) return null;
    if (review.status !== "PendingReview") throw new Error("BOM_REVIEW_NOT_PENDING");

    const draft = await this.getDraftById(review.bom_draft_id);
    if (!draft) return null;
    if (draft.definition_id && review.submitted_by === input.actorId) throw new SharedBomError("BOM_REVIEW_SELF_DECISION_FORBIDDEN", 403);

    const now = this.clock();
    const decisionReason = input.decisionReason?.trim() || "";
    if (review.lifecycle_action === "obsolete") {
      if (draft.status !== "Released") throw new Error("LIFE_OBSOLETE_NOT_FORMAL");
      const rejectObsolete = async (client: AsyncDatabaseClient) => {
        await client.execute(REJECT_ASYNC_BOM_WORKBENCH_REVIEW_SQL, {
          reviewId: input.reviewId,
          reviewedBy: input.actorId,
          decisionReason: decisionReason || null,
          reviewedAt: now
        });
        await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
          id: this.idFactory(),
          draftId: draft.id,
          actorId: input.actorId,
          eventType: "reject_obsolete",
          beforeJson: JSON.stringify({ status: draft.status, reviewId: input.reviewId, lifecycleAction: "obsolete" }),
          afterJson: JSON.stringify({ status: draft.status }),
          reason: decisionReason || "Reject BOM obsolete request",
          createdAt: now
        });
        await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
          id: this.idFactory(),
          submissionId: auditSubmissionId(draft),
          actorId: input.actorId,
          action: "lifecycle.obsolete.rejected",
          detailJson: JSON.stringify({
            entityType: "bom_workbench_draft",
            draftId: draft.id,
            reviewId: input.reviewId,
            beforeStatus: draft.status,
            afterStatus: draft.status,
            decisionReason: decisionReason || null
          }),
          createdAt: now
        });
      };

      await this.client.transaction(rejectObsolete, { serializable: Boolean(draft.definition_id) });

      return {
        review: await this.getReviewById(input.reviewId),
        draft: await this.getDraftById(draft.id)
      };
    }

    const reject = async (client: AsyncDatabaseClient) => {
      await client.execute(REJECT_ASYNC_BOM_WORKBENCH_DRAFT_SQL, {
        draftId: draft.id,
        updatedBy: input.actorId,
        updatedAt: now
      });
      await client.execute(REJECT_ASYNC_BOM_WORKBENCH_REVIEW_SQL, {
        reviewId: input.reviewId,
        reviewedBy: input.actorId,
        decisionReason: decisionReason || null,
        reviewedAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId: draft.id,
        actorId: input.actorId,
        eventType: "reject_review",
        beforeJson: JSON.stringify({ status: draft.status, reviewId: input.reviewId }),
        afterJson: JSON.stringify({ status: "Rejected" }),
        reason: decisionReason || "Reject BOM review",
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: auditSubmissionId(draft),
        actorId: input.actorId,
        action: "BomWorkbenchReviewRejected",
        detailJson: JSON.stringify({ draftId: draft.id, reviewId: input.reviewId, decisionReason: decisionReason || null }),
        createdAt: now
      });
    };

    await this.client.transaction(reject, { serializable: Boolean(draft.definition_id) });

    return {
      review: await this.getReviewById(input.reviewId),
      draft: await this.getDraftById(draft.id)
    };
  }

  private async approveSharedRelease(input: {
    command: DecideAsyncBomWorkbenchReviewInput;
    review: BomWorkbenchReview;
    draft: BomWorkbenchDraftDetail;
  }): Promise<ApproveAsyncBomWorkbenchReviewResult> {
    const { command, review, draft } = input;
    if (!draft.definition_id || !draft.company_id || draft.status !== "PendingReview") throw new SharedBomError("BOM_DRAFT_NOT_PENDING_REVIEW", 409);
    if (numberValue(review.review_schema_version ?? 1) !== 2 || !review.review_snapshot_json || !review.review_snapshot_hash
      || review.definition_row_version === null || review.definition_row_version === undefined
      || review.editor_version === null || review.editor_version === undefined) {
      throw new SharedBomError("BOM_REVIEW_SNAPSHOT_INVALID", 409);
    }
    let frozenReview: Record<string, unknown>;
    try {
      frozenReview = JSON.parse(review.review_snapshot_json) as Record<string, unknown>;
    } catch {
      throw new SharedBomError("BOM_REVIEW_SNAPSHOT_INVALID", 409);
    }
    if (canonicalSha256(frozenReview).hash !== review.review_snapshot_hash) throw new SharedBomError("BOM_REVIEW_SNAPSHOT_INVALID", 409);
    const evidence = await this.buildSharedEvidence(draft);
    const currentProjectionHashes = evidence.resolved.map((projection) => ({
      parentPartNumberId: projection.parentPartNumberId,
      hash: projection.hash,
      lineCount: projection.lines.length
    }));
    const reconstructedReview = canonicalSha256({
      schemaVersion: 2,
      definitionId: draft.definition_id,
      definitionRowVersion: numberValue(review.definition_row_version),
      draftId: draft.id,
      editorVersion: numberValue(review.editor_version),
      bomRevision: draft.bom_revision,
      submitterId: review.submitted_by,
      parents: evidence.parents.map((parent) => ({ partNumberId: parent.part_number_id, partNumber: parent.part_number, name: parent.part_name, selectionOrder: parent.selection_order })),
      sharedLines: evidence.sharedLines,
      mappings: evidence.mappings,
      resolvedProjectionHashes: currentProjectionHashes,
      reconfirmationCount: draft.reconfirmation_flags.length,
      baseReleaseSnapshotId: draft.base_release_snapshot_id ?? null
    });
    if (reconstructedReview.hash !== review.review_snapshot_hash
      || canonicalSha256(currentProjectionHashes).hash !== canonicalSha256(frozenReview.resolvedProjectionHashes ?? []).hash) {
      throw new SharedBomError("BOM_REVIEW_SNAPSHOT_STALE", 409);
    }
    const parentSnapshot = canonicalSha256(evidence.parents.map((parent) => ({
      partNumberId: parent.part_number_id,
      partNumber: parent.part_number,
      name: parent.part_name,
      selectionOrder: parent.selection_order
    })));
    const mappingSnapshot = canonicalSha256(evidence.mappings);
    const resolvedProjection = canonicalSha256(currentProjectionHashes);
    const lineSnapshot = canonicalSha256(draft.lines);
    const snapshotEvidence = canonicalSha256({
      schemaVersion: 2,
      definitionId: draft.definition_id,
      bomRevision: draft.bom_revision,
      reviewSnapshotHash: review.review_snapshot_hash,
      parentSnapshotHash: parentSnapshot.hash,
      lineSnapshotHash: lineSnapshot.hash,
      mappingSnapshotHash: mappingSnapshot.hash,
      resolvedProjectionHash: resolvedProjection.hash
    });
    const now = this.clock();
    const snapshotId = this.idFactory();
    const decisionReason = command.decisionReason?.trim() || "";
    const approve = async (client: AsyncDatabaseClient) => {
      const locked = await client.queryOne<{
        draft_status: string; editor_version: number | string; definition_row_version: number | string;
        review_status: string; review_hash: string | null;
      }>(`
        SELECT draft.status AS draft_status, draft.editor_version,
          definition.row_version AS definition_row_version,
          review.status AS review_status, review.review_snapshot_hash AS review_hash
        FROM bom_drafts draft
        JOIN bom_definitions definition ON definition.id = draft.definition_id
        JOIN bom_review_requests review ON review.bom_draft_id = draft.id AND review.id = :reviewId
        WHERE draft.id = :draftId
        ${client.kind === "postgres" ? "FOR UPDATE OF draft, definition, review" : ""}
      `, { draftId: draft.id, reviewId: review.id });
      if (!locked || locked.draft_status !== "PendingReview" || locked.review_status !== "PendingReview"
        || numberValue(locked.editor_version) !== numberValue(review.editor_version)
        || numberValue(locked.definition_row_version) !== numberValue(review.definition_row_version)
        || locked.review_hash !== review.review_snapshot_hash) {
        throw new SharedBomError("BOM_REVIEW_SNAPSHOT_STALE", 409);
      }
      await client.execute(`
        UPDATE bom_release_snapshots SET obsolete_at = :obsoleteAt, obsolete_by = :obsoleteBy
        WHERE definition_id = :definitionId AND obsolete_at IS NULL
      `, { definitionId: draft.definition_id, obsoleteAt: now, obsoleteBy: command.actorId });
      await client.execute(`
        UPDATE bom_drafts SET status = 'Obsolete', is_active = 0, updated_by = :actorId, updated_at = :updatedAt
        WHERE definition_id = :definitionId AND status = 'Released'
      `, { definitionId: draft.definition_id, actorId: command.actorId, updatedAt: now });
      await client.execute(`
        INSERT INTO bom_release_snapshots (
          id, bom_draft_id, company_id, definition_id, owner_part_number_id, bom_revision,
          parent_item_id, line_snapshot_json, line_count, released_by, released_at,
          snapshot_schema_version, parent_snapshot_json, mapping_snapshot_json, resolved_projection_json, snapshot_hash
        ) VALUES (
          :id, :draftId, :companyId, :definitionId, :ownerPartNumberId, :bomRevision,
          :parentItemId, :lineSnapshotJson, :lineCount, :releasedBy, :releasedAt,
          2, :parentSnapshotJson, :mappingSnapshotJson, :resolvedProjectionJson, :snapshotHash
        )
      `, {
        id: snapshotId,
        draftId: draft.id,
        companyId: draft.company_id,
        definitionId: draft.definition_id,
        ownerPartNumberId: draft.owner_part_number_id,
        bomRevision: draft.bom_revision,
        parentItemId: draft.parent_item_id || null,
        lineSnapshotJson: lineSnapshot.json,
        lineCount: draft.lines.length,
        releasedBy: command.actorId,
        releasedAt: now,
        parentSnapshotJson: parentSnapshot.json,
        mappingSnapshotJson: mappingSnapshot.json,
        resolvedProjectionJson: resolvedProjection.json,
        snapshotHash: snapshotEvidence.hash
      });
      for (const parent of evidence.parents) {
        await client.execute(`
          INSERT INTO bom_release_parent_snapshots
            (release_snapshot_id, parent_part_number_id, definition_id, parent_part_number, parent_part_name, selection_order)
          VALUES (:snapshotId, :parentPartNumberId, :definitionId, :partNumber, :partName, :selectionOrder)
        `, { snapshotId, parentPartNumberId: parent.part_number_id, definitionId: draft.definition_id, partNumber: parent.part_number, partName: parent.part_name, selectionOrder: parent.selection_order });
      }
      for (const projection of evidence.resolved) {
        for (const line of projection.lines) {
          await client.execute(`
            INSERT INTO bom_release_resolved_lines (
              id, release_snapshot_id, definition_id, parent_part_number_id, logical_line_id,
              parent_logical_line_id, node_type, child_part_number_id, child_part_number, child_part_name,
              group_name, quantity, sequence_no, level, source
            ) VALUES (
              :id, :snapshotId, :definitionId, :parentPartNumberId, :logicalLineId,
              :parentLogicalLineId, :nodeType, :childPartNumberId, :childPartNumber, :childPartName,
              :groupName, :quantity, :sequenceNo, :level, 'manual'
            )
          `, {
            id: this.idFactory(), snapshotId, definitionId: draft.definition_id,
            parentPartNumberId: projection.parentPartNumberId, logicalLineId: line.logicalLineId,
            parentLogicalLineId: line.parentLogicalLineId, nodeType: line.nodeType,
            childPartNumberId: line.childPartNumberId, childPartNumber: line.childPartNumber,
            childPartName: line.childPartName, groupName: line.groupName, quantity: line.quantity,
            sequenceNo: line.sequenceNo, level: line.level
          });
        }
      }
      await client.execute(RELEASE_ASYNC_BOM_WORKBENCH_DRAFT_SQL, { draftId: draft.id, updatedBy: command.actorId, updatedAt: now });
      await client.execute(APPROVE_ASYNC_BOM_WORKBENCH_REVIEW_SQL, {
        reviewId: review.id, reviewedBy: command.actorId, decisionReason: decisionReason || null, reviewedAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(), draftId: draft.id, actorId: command.actorId, eventType: "approve_shared_release",
        beforeJson: JSON.stringify({ status: draft.status, reviewId: review.id, reviewSnapshotHash: review.review_snapshot_hash }),
        afterJson: JSON.stringify({ status: "Released", snapshotId, snapshotHash: snapshotEvidence.hash }),
        reason: decisionReason || "Approve shared BOM release", createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(), submissionId: null, actorId: command.actorId, action: "SharedBomReviewApproved",
        detailJson: JSON.stringify({
          definitionId: draft.definition_id, draftId: draft.id, reviewId: review.id, snapshotId,
          bomRevision: draft.bom_revision, parentPartNumberIds: evidence.parents.map((parent) => parent.part_number_id),
          reviewSnapshotHash: review.review_snapshot_hash, snapshotHash: snapshotEvidence.hash,
          beforeStatus: draft.status, afterStatus: "Released", decisionReason: decisionReason || null
        }),
        createdAt: now
      });
    };
    await this.client.transaction(approve, { serializable: true });
    return { review: await this.getReviewById(review.id), draft: await this.getDraftById(draft.id), snapshotId };
  }

  async approveReview(input: DecideAsyncBomWorkbenchReviewInput): Promise<ApproveAsyncBomWorkbenchReviewResult | null> {
    const review = await this.getReviewById(input.reviewId);
    if (!review) return null;
    if (review.status !== "PendingReview") throw new Error("BOM_REVIEW_NOT_PENDING");

    const draft = await this.getDraftById(review.bom_draft_id);
    if (!draft) return null;
    if (draft.definition_id && review.submitted_by === input.actorId) throw new SharedBomError("BOM_REVIEW_SELF_DECISION_FORBIDDEN", 403);
    if (review.lifecycle_action === "obsolete") {
      if (draft.status !== "Released") throw new Error("LIFE_OBSOLETE_NOT_FORMAL");

      const now = this.clock();
      const decisionReason = input.decisionReason?.trim() || "";
      const approveObsolete = async (client: AsyncDatabaseClient) => {
        if (draft.definition_id) {
          await client.execute(`
            UPDATE bom_release_snapshots SET obsolete_at = :obsoleteAt, obsolete_by = :obsoleteBy
            WHERE definition_id = :definitionId AND obsolete_at IS NULL
          `, { definitionId: draft.definition_id, obsoleteAt: now, obsoleteBy: input.actorId });
          await client.execute(`
            UPDATE bom_drafts SET status = 'Obsolete', is_active = 0, updated_by = :updatedBy, updated_at = :updatedAt
            WHERE definition_id = :definitionId AND status = 'Released'
          `, { definitionId: draft.definition_id, updatedBy: input.actorId, updatedAt: now });
        } else {
          await client.execute(OBSOLETE_ASYNC_BOM_WORKBENCH_DRAFT_RELEASE_SNAPSHOTS_SQL, {
            draftId: draft.id,
            obsoleteAt: now,
            obsoleteBy: input.actorId
          });
          await client.execute(OBSOLETE_ASYNC_BOM_WORKBENCH_DRAFT_SQL, {
            draftId: draft.id,
            updatedBy: input.actorId,
            updatedAt: now
          });
        }
        await client.execute(APPROVE_ASYNC_BOM_WORKBENCH_REVIEW_SQL, {
          reviewId: input.reviewId,
          reviewedBy: input.actorId,
          decisionReason: decisionReason || null,
          reviewedAt: now
        });
        await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
          id: this.idFactory(),
          draftId: draft.id,
          actorId: input.actorId,
          eventType: "approve_obsolete",
          beforeJson: JSON.stringify({ status: draft.status, reviewId: input.reviewId, lifecycleAction: "obsolete" }),
          afterJson: JSON.stringify({ status: "Obsolete" }),
          reason: decisionReason || "Approve BOM obsolete request",
          createdAt: now
        });
        await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
          id: this.idFactory(),
          submissionId: auditSubmissionId(draft),
          actorId: input.actorId,
          action: "lifecycle.obsolete.approved",
          detailJson: JSON.stringify({
            entityType: "bom_workbench_draft",
            draftId: draft.id,
            reviewId: input.reviewId,
            beforeStatus: draft.status,
            afterStatus: "Obsolete",
            decisionReason: decisionReason || null
          }),
          createdAt: now
        });
      };

      await this.client.transaction(approveObsolete, { serializable: Boolean(draft.definition_id) });

      return {
        review: await this.getReviewById(input.reviewId),
        draft: await this.getDraftById(draft.id),
        snapshotId: null
      };
    }

    if (draft.definition_id) return this.approveSharedRelease({ command: input, review, draft });

    if (draft.status !== "PendingReview") throw new Error("BOM_DRAFT_NOT_PENDING_REVIEW");

    if (draft.floating_topics.length > 0) {
      throw new BomFloatingTopicsUnresolvedError(draft.floating_topics.length);
    }

    const issues = await this.evaluateReleaseGate(draft.lines);
    if (issues.length > 0) throw new BomReleaseGateError(issues);

    const now = this.clock();
    const snapshotId = this.idFactory();
    const decisionReason = input.decisionReason?.trim() || "";
    const approve = async (client: AsyncDatabaseClient) => {
      await client.execute(OBSOLETE_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOTS_SQL, {
        ownerPartNumberId: draft.owner_part_number_id,
        bomRevision: draft.bom_revision,
        parentItemId: draft.parent_item_id || null,
        parentRevision: draft.parent_revision,
        obsoleteAt: now,
        obsoleteBy: input.actorId
      });
      await client.execute(OBSOLETE_ASYNC_BOM_WORKBENCH_RELEASED_DRAFTS_SQL, {
        ownerPartNumberId: draft.owner_part_number_id,
        bomRevision: draft.bom_revision,
        parentItemId: draft.parent_item_id,
        parentRevision: draft.parent_revision,
        snapshotId,
        updatedBy: input.actorId,
        updatedAt: now
      });
      const snapshotParameters = {
        id: snapshotId,
        draftId: draft.id,
        companyId: draft.company_id,
        ownerPartNumberId: draft.owner_part_number_id,
        bomRevision: draft.bom_revision,
        sourceSubmissionId: draft.source_submission_id,
        parentItemId: draft.parent_item_id || null,
        parentSubmissionId: draft.source_submission_id || draft.parent_submission_id || null,
        parentRevision: draft.identity_authority === "canonical_part_number" ? null : draft.parent_revision,
        lineSnapshotJson: JSON.stringify(draft.lines),
        lineCount: draft.lines.length,
        releasedBy: input.actorId,
        releasedAt: now
      };
      try {
        await client.execute(INSERT_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOT_SQL, snapshotParameters);
      } catch (error) {
        console.error("BOM release snapshot insert failed", {
          draftId: snapshotParameters.draftId,
          companyId: snapshotParameters.companyId,
          ownerPartNumberId: snapshotParameters.ownerPartNumberId,
          sourceSubmissionId: snapshotParameters.sourceSubmissionId,
          parentItemId: snapshotParameters.parentItemId,
          parentSubmissionId: snapshotParameters.parentSubmissionId,
          releasedBy: snapshotParameters.releasedBy,
          errorMessage: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
      await client.execute(RELEASE_ASYNC_BOM_WORKBENCH_DRAFT_SQL, {
        draftId: draft.id,
        updatedBy: input.actorId,
        updatedAt: now
      });
      await client.execute(APPROVE_ASYNC_BOM_WORKBENCH_REVIEW_SQL, {
        reviewId: input.reviewId,
        reviewedBy: input.actorId,
        decisionReason: decisionReason || null,
        reviewedAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId: draft.id,
        actorId: input.actorId,
        eventType: "approve_release",
        beforeJson: JSON.stringify({ status: draft.status, reviewId: input.reviewId }),
        afterJson: JSON.stringify({ status: "Released", snapshotId }),
        reason: decisionReason || "Approve BOM release",
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: auditSubmissionId(draft),
        actorId: input.actorId,
        action: "BomWorkbenchReviewApproved",
        detailJson: JSON.stringify({
          draftId: draft.id,
          reviewId: input.reviewId,
          snapshotId,
          decisionReason: decisionReason || null
        }),
        createdAt: now
      });
    };

    if (this.client.kind === "postgres") {
      await this.client.transaction(approve);
    } else {
      await approve(this.client);
    }

    return {
      review: await this.getReviewById(input.reviewId),
      draft: await this.getDraftById(draft.id),
      snapshotId
    };
  }

  async setActiveDraft(input: SetAsyncBomWorkbenchActiveDraftInput): Promise<BomWorkbenchDraftDetail | null> {
    const before = await this.getDraftById(input.draftId);
    if (!before) return null;
    if (before.definition_id) throw new SharedBomError("BOM_OPERATION_RETIRED", 410);
    assertBomDraftMutable(before.status);

    const now = this.clock();
    const activate = async (client: AsyncDatabaseClient) => {
      if (before.owner_part_number_id && before.bom_revision) {
        await client.execute(DEACTIVATE_ASYNC_CANONICAL_BOM_ACTIVE_DRAFTS_SQL, {
          ownerPartNumberId: before.owner_part_number_id,
          bomRevision: before.bom_revision,
          updatedAt: now
        });
      } else {
        await client.execute(DEACTIVATE_ASYNC_BOM_WORKBENCH_ACTIVE_DRAFTS_SQL, {
          parentItemId: before.parent_item_id,
          parentRevision: before.parent_revision,
          updatedAt: now
        });
      }
      await client.execute(ACTIVATE_ASYNC_BOM_WORKBENCH_DRAFT_SQL, {
        draftId: input.draftId,
        updatedBy: input.actorId,
        updatedAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId: input.draftId,
        actorId: input.actorId,
        eventType: "set_active",
        beforeJson: JSON.stringify({ isActive: before.is_active }),
        afterJson: JSON.stringify({ isActive: 1 }),
        reason: "Set active BOM workbench draft",
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: auditSubmissionId(before),
        actorId: input.actorId,
        action: "BomWorkbenchDraftActivated",
        detailJson: JSON.stringify({ draftId: input.draftId, previousActive: before.is_active }),
        createdAt: now
      });
    };

    if (this.client.kind === "postgres") {
      await this.client.transaction(activate);
    } else {
      await activate(this.client);
    }

    return this.getDraftById(input.draftId);
  }

  async deleteDraft(input: DeleteAsyncBomWorkbenchDraftInput): Promise<BomWorkbenchDraftDetail | null> {
    const before = await this.getDraftById(input.draftId);
    if (!before) return null;
    if (before.status === "Archived") throw new Error("LIFE_BOM_DRAFT_ALREADY_DELETED");
    if (before.status !== "Draft") throw new Error("LIFE_BOM_DRAFT_NOT_DELETABLE");

    const now = this.clock();
    const reason = input.reason?.trim() || "Delete BOM workbench draft";
    const archive = async (client: AsyncDatabaseClient) => {
      await client.execute(ARCHIVE_ASYNC_BOM_WORKBENCH_DRAFT_SQL, {
        draftId: input.draftId,
        updatedBy: input.actorId,
        updatedAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId: input.draftId,
        actorId: input.actorId,
        eventType: "delete_draft",
        beforeJson: JSON.stringify({ status: before.status, isActive: before.is_active, lineCount: before.lines.length }),
        afterJson: JSON.stringify({ status: "Archived", isActive: 0 }),
        reason,
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: auditSubmissionId(before),
        actorId: input.actorId,
        action: "BomWorkbenchDraftDeleted",
        detailJson: JSON.stringify({
          lifecycleAction: "delete",
          draftId: input.draftId,
          beforeStatus: before.status,
          afterStatus: "Archived",
          previousActive: before.is_active,
          reason
        }),
        createdAt: now
      });
    };

    await this.client.transaction(archive, { serializable: Boolean(before.definition_id) });

    return this.getDraftById(input.draftId);
  }

  async restoreDraft(input: RestoreAsyncBomWorkbenchDraftInput): Promise<BomWorkbenchDraftDetail | null> {
    const before = await this.getDraftById(input.draftId);
    if (!before) return null;
    if (before.status !== "Archived") throw new Error("LIFE_BOM_DRAFT_NOT_DELETED");

    if (before.definition_id) {
      const conflicting = await this.client.queryOne<{ id: string }>(`
        SELECT id FROM bom_drafts
        WHERE definition_id = :definitionId AND id <> :draftId AND status IN ('Draft','Rejected','PendingReview','Archived')
        LIMIT 1
      `, { definitionId: before.definition_id, draftId: before.id });
      if (conflicting) throw new SharedBomError("BOM_OPEN_REVISION_EXISTS", 409, { draftId: conflicting.id });
      const latest = await this.client.queryOne<{ bom_revision: string }>(`
        SELECT bom_revision FROM bom_release_snapshots WHERE definition_id = :definitionId
        ORDER BY CAST(bom_revision AS INTEGER) DESC, released_at DESC LIMIT 1
      `, { definitionId: before.definition_id });
      if (latest && Number(before.bom_revision) <= Number(latest.bom_revision)) {
        throw new SharedBomError("BOM_DEFINITION_REVISION_CONFLICT", 409);
      }
    }

    const now = this.clock();
    const reason = input.reason?.trim() || "Restore BOM workbench draft";
    const restore = async (client: AsyncDatabaseClient) => {
      if (before.definition_id) {
        await client.execute(`
          UPDATE bom_drafts SET status = 'Draft', is_active = 1, updated_by = :updatedBy, updated_at = :updatedAt
          WHERE id = :draftId
        `, { draftId: input.draftId, updatedBy: input.actorId, updatedAt: now });
      } else {
        await client.execute(RESTORE_ASYNC_BOM_WORKBENCH_DRAFT_SQL, {
          draftId: input.draftId,
          updatedBy: input.actorId,
          updatedAt: now
        });
      }
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId: input.draftId,
        actorId: input.actorId,
        eventType: "restore_draft",
        beforeJson: JSON.stringify({ status: before.status, isActive: before.is_active, lineCount: before.lines.length }),
        afterJson: JSON.stringify({ status: "Draft", isActive: before.definition_id ? 1 : 0 }),
        reason,
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: auditSubmissionId(before),
        actorId: input.actorId,
        action: "BomWorkbenchDraftRestored",
        detailJson: JSON.stringify({
          lifecycleAction: "restore",
          draftId: input.draftId,
          beforeStatus: before.status,
          afterStatus: "Draft",
          reason,
          conflictCheckResult: "passed"
        }),
        createdAt: now
      });
    };

    await this.client.transaction(restore, { serializable: Boolean(before.definition_id) });

    return this.getDraftById(input.draftId);
  }

  private async getLatestReleaseSnapshotForDraft(draft: BomWorkbenchDraftDetail): Promise<BomReleaseSnapshotDetail | null> {
    if (draft.definition_id) {
      return draft.base_release_snapshot_id ? this.getReleaseSnapshotById(draft.base_release_snapshot_id) : null;
    }
    const row = await this.client.queryOne<AsyncBomReleaseSnapshotRow>(SELECT_ASYNC_BOM_WORKBENCH_LATEST_RELEASE_SNAPSHOT_SQL, {
      ownerPartNumberId: draft.owner_part_number_id,
      parentItemId: draft.parent_item_id,
      draftId: draft.id
    });
    if (!row) return null;
    return parseReleaseSnapshot(row);
  }

  private async evaluateReleaseGate(lines: BomWorkbenchLine[]): Promise<BomReleaseGateIssue[]> {
    const candidateLines = lines.filter(
      (line): line is BomWorkbenchLine & { node_type: "item"; part_number: string } => line.node_type === "item" && Boolean(line.part_number)
    );
    if (candidateLines.length === 0) return [];

    const partNumbers = [...new Set(candidateLines.map((line) => line.part_number))];
    const partNumberParams = Object.fromEntries(partNumbers.map((partNumber, index) => [`partNumber${index}`, partNumber]));
    const itemRows = await this.client.query<{ id: string; part_number: string }>(
      `
        SELECT id, part_number
        FROM items
        WHERE upper(part_number) IN (${partNumbers.map((_, index) => `:partNumber${index}`).join(", ")})
      `,
      partNumberParams
    );
    const itemByPartNumber = new Map(itemRows.map((row) => [row.part_number.toUpperCase(), row]));
    const itemIds = [...new Set(itemRows.map((row) => row.id))];
    const submissionRows = itemIds.length
      ? await this.client.query<AsyncBomReleaseGateSubmissionRow>(
          `
            SELECT item_id, id, revision, status, released_at, updated_at, created_at
            FROM submissions
            WHERE item_id IN (${itemIds.map((_, index) => `:itemId${index}`).join(", ")})
            ORDER BY
              item_id ASC,
              CASE WHEN status = 'Released' THEN 0 ELSE 1 END,
              COALESCE(released_at, updated_at, created_at) DESC,
              id DESC
          `,
          Object.fromEntries(itemIds.map((itemId, index) => [`itemId${index}`, itemId]))
        )
      : [];
    const submissionsByItemId = new Map<string, AsyncBomReleaseGateSubmissionRow[]>();
    const latestReleasedByItemId = new Map<string, AsyncBomReleaseGateSubmissionRow>();
    for (const row of submissionRows) {
      const rowsForItem = submissionsByItemId.get(row.item_id) ?? [];
      rowsForItem.push(row);
      submissionsByItemId.set(row.item_id, rowsForItem);
      if (row.status === "Released" && !latestReleasedByItemId.has(row.item_id)) {
        latestReleasedByItemId.set(row.item_id, row);
      }
    }

    const issues: BomReleaseGateIssue[] = [];
    for (const line of candidateLines) {
      const item = itemByPartNumber.get(line.part_number.toUpperCase());
      if (!item) {
        issues.push({
          code: "missing_child_item",
          line_id: line.id,
          part_number: line.part_number,
          revision: line.revision,
          message: "Child item does not exist"
        });
        continue;
      }

      const childSubmission = (submissionsByItemId.get(item.id) ?? []).find(
        (submission) => line.revision === null || submission.revision.toUpperCase() === line.revision.toUpperCase()
      );
      if (!childSubmission) {
        issues.push({
          code: "missing_child_revision",
          line_id: line.id,
          part_number: line.part_number,
          revision: line.revision,
          message: "Child revision submission does not exist"
        });
        continue;
      }

      if (childSubmission.status !== "Released") {
        issues.push({
          code: "child_not_released",
          line_id: line.id,
          part_number: line.part_number,
          revision: line.revision,
          child_status: childSubmission.status,
          message: "Child revision is not Released"
        });
        continue;
      }

      const latest = latestReleasedByItemId.get(item.id);
      if (line.revision && latest?.revision && latest.revision.toUpperCase() !== line.revision.toUpperCase()) {
        issues.push({
          code: "child_outdated_revision",
          line_id: line.id,
          part_number: line.part_number,
          revision: line.revision,
          latest_released_revision: latest.revision,
          message: "Child revision is not the latest Released revision"
        });
      }
    }
    return issues;
  }

  private normalizeWorkbenchTreeLines(lines: SaveAsyncBomWorkbenchDraftTreeInput["lines"], preserveLogicalNodes = false): NormalizedWorkbenchTreeLine[] {
    const normalized = lines.map((line, index) => this.normalizeWorkbenchTreeLine(line, index));
    const byId = new Map<string, NormalizedWorkbenchTreeLine>();
    for (const line of normalized) {
      if (byId.has(line.id)) throw new Error("BOM_DUPLICATE_LINE_ID");
      byId.set(line.id, line);
    }
    for (const line of normalized) {
      if (line.parentLineId && !byId.has(line.parentLineId)) throw new Error("BOM_PARENT_LINE_NOT_FOUND");
      if (line.parentLineId === line.id) throw new Error("BOM_CYCLE_DETECTED");
    }

    const merged = preserveLogicalNodes ? normalized : mergeDuplicateSiblingItems(normalized);
    validateTreeDepthAndCycles(merged);
    return sortWorkbenchTreeLines(merged);
  }

  private normalizeFloatingTopics(topics: SaveAsyncBomWorkbenchDraftTreeInput["floatingTopics"]): NormalizedFloatingTopic[] {
    const normalized = topics.map((topic, index) => {
      const base = this.normalizeWorkbenchTreeLine(
        {
          id: topic.id,
          logicalLineId: topic.logicalLineId,
          parentLineId: topic.parentFloatingTopicId,
          nodeType: topic.nodeType,
          partNumber: topic.partNumber,
          revision: topic.revision,
          groupName: topic.groupName,
          quantity: topic.quantity,
          sequenceNo: topic.sequenceNo
        },
        index
      );
      const rootPositionX = Number(topic.rootPositionX ?? 0);
      const rootPositionY = Number(topic.rootPositionY ?? 0);
      if (!Number.isFinite(rootPositionX) || !Number.isFinite(rootPositionY)) {
        throw new Error("BOM_FLOATING_TOPIC_POSITION_INVALID");
      }
      return {
        id: base.id,
        logicalLineId: base.logicalLineId,
        parentFloatingTopicId: base.parentLineId,
        nodeType: base.nodeType,
        partNumber: base.partNumber,
        revision: base.revision,
        groupName: base.groupName,
        quantity: base.quantity,
        sequenceNo: base.sequenceNo,
        rootPositionX,
        rootPositionY
      };
    });
    const byId = new Map<string, NormalizedFloatingTopic>();
    for (const topic of normalized) {
      if (byId.has(topic.id)) throw new Error("BOM_DUPLICATE_FLOATING_TOPIC_ID");
      byId.set(topic.id, topic);
    }
    for (const topic of normalized) {
      if (topic.parentFloatingTopicId && !byId.has(topic.parentFloatingTopicId)) throw new Error("BOM_FLOATING_TOPIC_PARENT_NOT_FOUND");
      if (topic.parentFloatingTopicId === topic.id) throw new Error("BOM_CYCLE_DETECTED");
    }
    const structuralLines = normalized.map<NormalizedWorkbenchTreeLine>((topic) => ({
      id: topic.id,
      logicalLineId: topic.logicalLineId,
      parentLineId: topic.parentFloatingTopicId,
      nodeType: topic.nodeType,
      partNumber: topic.partNumber,
      revision: topic.revision,
      groupName: topic.groupName,
      quantity: topic.quantity,
      sequenceNo: topic.sequenceNo
    }));
    validateTreeDepthAndCycles(structuralLines);
    const topicById = new Map(normalized.map((topic) => [topic.id, topic]));
    return sortWorkbenchTreeLines(structuralLines).map((line) => topicById.get(line.id) as NormalizedFloatingTopic);
  }

  private normalizeWorkbenchTreeLine(
    line: SaveAsyncBomWorkbenchDraftTreeInput["lines"][number],
    index: number
  ): NormalizedWorkbenchTreeLine {
    const nodeType = line.nodeType;
    if (nodeType !== "item" && nodeType !== "group") throw new Error("BOM_INVALID_NODE_TYPE");
    const id = line.id?.trim() || this.idFactory();
    const parentLineId = line.parentLineId?.trim() || null;
    const sequenceNo = Number.isFinite(Number(line.sequenceNo)) ? Number(line.sequenceNo) : index + 1;
    if (sequenceNo < 1) throw new Error("BOM_INVALID_SEQUENCE");

    if (nodeType === "group") {
      const groupName = line.groupName?.trim();
      if (!groupName) throw new Error("BOM_GROUP_NAME_REQUIRED");
      return {
        id,
        logicalLineId: line.logicalLineId?.trim().toLowerCase() || null,
        parentLineId,
        nodeType,
        partNumber: null,
        revision: null,
        groupName,
        quantity: null,
        sequenceNo
      };
    }

    const partNumber = line.partNumber?.trim();
    if (!partNumber) throw new Error("BOM_PART_NUMBER_REQUIRED");
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("BOM_INVALID_QUANTITY");
    return {
      id,
      logicalLineId: line.logicalLineId?.trim().toLowerCase() || null,
      parentLineId,
      nodeType,
      partNumber,
      revision: line.revision?.trim() || null,
      groupName: null,
      quantity,
      sequenceNo
    };
  }
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

function nullableNumberValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return numberValue(value);
}

function coerceDraftSummary(row: BomWorkbenchDraftSummary): BomWorkbenchDraftSummary {
  return {
    ...row,
    company_id: row.company_id ?? null,
    definition_id: row.definition_id ?? null,
    base_release_snapshot_id: row.base_release_snapshot_id ?? null,
    owner_part_number_id: row.owner_part_number_id ?? null,
    bom_revision: row.bom_revision ?? row.parent_revision ?? null,
    source_submission_id: row.source_submission_id ?? row.parent_submission_id ?? null,
    identity_authority: row.identity_authority ?? "legacy_submission_bound",
    parent_item_id: row.parent_item_id ?? "",
    parent_submission_id: row.parent_submission_id ?? row.source_submission_id ?? "",
    parent_revision: row.parent_revision ?? row.bom_revision ?? "",
    is_active: numberValue(row.is_active),
    line_count: numberValue(row.line_count),
    review_attempt: numberValue(row.review_attempt),
    editor_version: numberValue(row.editor_version)
  };
}

function coerceWorkbenchLine(row: BomWorkbenchLine): BomWorkbenchLine {
  return {
    ...row,
    quantity: nullableNumberValue(row.quantity),
    sequence_no: numberValue(row.sequence_no),
    source_priority: numberValue(row.source_priority)
  };
}

function coerceFloatingTopic(row: BomDraftFloatingTopic): BomDraftFloatingTopic {
  return {
    ...row,
    quantity: nullableNumberValue(row.quantity),
    sequence_no: numberValue(row.sequence_no),
    root_position_x: numberValue(row.root_position_x),
    root_position_y: numberValue(row.root_position_y)
  };
}

function auditSubmissionId(draft: BomWorkbenchDraftSummary) {
  return draft.source_submission_id || draft.parent_submission_id || null;
}

function assertBomDraftMutable(status: BomWorkbenchDraftSummary["status"]) {
  if (status !== "Draft" && status !== "Rejected") {
    throw new Error("BOM_DRAFT_NOT_MUTABLE");
  }
}

function jsonText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

type SharedDiffMapping = {
  logicalLineId: string;
  componentMode: "fixed" | "by_parent";
  childPartNumberIds: string[];
  parentSelections: Array<{ parentPartNumberId: string; childPartNumberId: string }>;
};

function buildSharedDraftDiff(
  draft: BomWorkbenchDraftDetail,
  baseSnapshot: BomReleaseSnapshotDetail | null,
  changes: BomWorkbenchLineDiffChange[]
): Pick<
  BomWorkbenchDraftDiffResult,
  "baseReleaseSnapshotId" | "parentChanges" | "logicalLineChanges" | "candidateChanges" | "parentMappingChanges" | "resolvedParentImpacts"
> {
  const currentParentIds = (draft.applicable_parents ?? []).map((parent) => parent.part_number_id).sort((a, b) => a.localeCompare(b, "en"));
  const baseParentIds = (baseSnapshot?.applicable_parents ?? []).map((parent) => parent.part_number_id).sort((a, b) => a.localeCompare(b, "en"));
  const currentMappings: SharedDiffMapping[] = (draft.components ?? []).map((component) => ({
    logicalLineId: component.logical_line_id,
    componentMode: component.component_mode,
    childPartNumberIds: [...component.child_part_number_ids].sort((a, b) => a.localeCompare(b, "en")),
    parentSelections: component.parent_selections.map((selection) => ({
      parentPartNumberId: selection.parent_part_number_id,
      childPartNumberId: selection.child_part_number_id
    })).sort((a, b) => a.parentPartNumberId.localeCompare(b.parentPartNumberId, "en"))
  }));
  const baseMappings = parseSharedDiffMappings(baseSnapshot?.mapping_snapshot_json);
  const currentByLogical = new Map(currentMappings.map((mapping) => [mapping.logicalLineId, mapping]));
  const baseByLogical = new Map(baseMappings.map((mapping) => [mapping.logicalLineId, mapping]));
  const logicalIds = new Set([...baseByLogical.keys(), ...currentByLogical.keys()]);
  for (const change of changes) {
    if (change.key.startsWith("logical:")) logicalIds.add(change.key.slice("logical:".length));
  }

  const candidateChanges = [...logicalIds].flatMap((logicalLineId) => {
    const before = baseByLogical.get(logicalLineId)?.childPartNumberIds ?? [];
    const after = currentByLogical.get(logicalLineId)?.childPartNumberIds ?? [];
    return arraysEqual(before, after) ? [] : [{ logicalLineId, before, after }];
  });
  const allParentIds = [...new Set([...baseParentIds, ...currentParentIds])].sort((a, b) => a.localeCompare(b, "en"));
  const parentMappingChanges = [...logicalIds].flatMap((logicalLineId) => allParentIds.flatMap((parentPartNumberId) => {
    const beforeChildPartNumberId = resolvedChildForDiff(baseByLogical.get(logicalLineId), parentPartNumberId);
    const afterChildPartNumberId = resolvedChildForDiff(currentByLogical.get(logicalLineId), parentPartNumberId);
    return beforeChildPartNumberId === afterChildPartNumberId ? [] : [{
      logicalLineId,
      parentPartNumberId,
      beforeChildPartNumberId,
      afterChildPartNumberId
    }];
  }));
  const changeByLogical = new Map<string, Set<NonNullable<BomWorkbenchDraftDiffResult["logicalLineChanges"]>[number]["changeTypes"][number]>>();
  for (const logicalLineId of logicalIds) changeByLogical.set(logicalLineId, new Set());
  for (const change of changes) {
    if (!change.key.startsWith("logical:")) continue;
    const logicalLineId = change.key.slice("logical:".length);
    const types = changeByLogical.get(logicalLineId) ?? new Set();
    if (change.change_type === "added") types.add("added");
    else if (change.change_type === "removed") types.add("removed");
    else {
      if (change.changed_fields.includes("hierarchy") || change.changed_fields.includes("sequence")) types.add("moved");
      if (change.changed_fields.includes("quantity")) types.add("quantity_changed");
    }
    changeByLogical.set(logicalLineId, types);
  }
  for (const change of candidateChanges) changeByLogical.get(change.logicalLineId)?.add("candidate_changed");
  for (const change of parentMappingChanges) changeByLogical.get(change.logicalLineId)?.add("parent_mapping_changed");
  const logicalLineChanges = [...changeByLogical.entries()]
    .map(([logicalLineId, types]) => ({ logicalLineId, changeTypes: types.size ? [...types] : ["unchanged" as const] }))
    .sort((a, b) => a.logicalLineId.localeCompare(b.logicalLineId, "en"));
  const changedLineIds = new Set(logicalLineChanges.filter((line) => !line.changeTypes.includes("unchanged")).map((line) => line.logicalLineId));
  const resolvedParentImpacts = currentParentIds.map((parentPartNumberId) => ({
    parentPartNumberId,
    changedResolvedLineCount: [...changedLineIds].filter((logicalLineId) => {
      const mappingChangedForParent = parentMappingChanges.some((change) => change.logicalLineId === logicalLineId && change.parentPartNumberId === parentPartNumberId);
      const generalChange = logicalLineChanges.find((line) => line.logicalLineId === logicalLineId)?.changeTypes.some((type) => type !== "parent_mapping_changed");
      return mappingChangedForParent || Boolean(generalChange);
    }).length
  }));
  return {
    baseReleaseSnapshotId: draft.base_release_snapshot_id ?? null,
    parentChanges: {
      added: currentParentIds.filter((id) => !baseParentIds.includes(id)),
      removed: baseParentIds.filter((id) => !currentParentIds.includes(id))
    },
    logicalLineChanges,
    candidateChanges,
    parentMappingChanges,
    resolvedParentImpacts
  };
}

function parseSharedDiffMappings(value: unknown): SharedDiffMapping[] {
  try {
    const parsed = JSON.parse(jsonText(value) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as Record<string, unknown>;
      const logicalLineId = typeof row.logicalLineId === "string" ? row.logicalLineId : "";
      const componentMode = row.componentMode === "by_parent" ? "by_parent" as const : "fixed" as const;
      const childPartNumberIds = Array.isArray(row.childPartNumberIds)
        ? row.childPartNumberIds.filter((id): id is string => typeof id === "string").sort((a, b) => a.localeCompare(b, "en"))
        : [];
      const parentSelections = Array.isArray(row.parentSelections)
        ? row.parentSelections.flatMap((selection) => {
            if (!selection || typeof selection !== "object") return [];
            const candidate = selection as Record<string, unknown>;
            return typeof candidate.parentPartNumberId === "string" && typeof candidate.childPartNumberId === "string"
              ? [{ parentPartNumberId: candidate.parentPartNumberId, childPartNumberId: candidate.childPartNumberId }]
              : [];
          }).sort((a, b) => a.parentPartNumberId.localeCompare(b.parentPartNumberId, "en"))
        : [];
      return logicalLineId ? [{ logicalLineId, componentMode, childPartNumberIds, parentSelections }] : [];
    });
  } catch {
    return [];
  }
}

function resolvedChildForDiff(mapping: SharedDiffMapping | undefined, parentPartNumberId: string) {
  if (!mapping) return null;
  if (mapping.componentMode === "fixed") return mapping.childPartNumberIds[0] ?? null;
  return mapping.parentSelections.find((selection) => selection.parentPartNumberId === parentPartNumberId)?.childPartNumberId ?? null;
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function coerceReview(review: BomWorkbenchReview): BomWorkbenchReview {
  return {
    ...review,
    review_schema_version: numberValue(review.review_schema_version ?? 1),
    definition_row_version: review.definition_row_version === null || review.definition_row_version === undefined ? null : numberValue(review.definition_row_version),
    editor_version: review.editor_version === null || review.editor_version === undefined ? null : numberValue(review.editor_version),
    review_snapshot_json: jsonText(review.review_snapshot_json),
    review_snapshot_hash: review.review_snapshot_hash ?? null
  };
}

function parseReleaseSnapshot(row: AsyncBomReleaseSnapshotRow): BomReleaseSnapshotDetail {
  let lines: BomWorkbenchLine[] = [];
  try {
    const parsed = JSON.parse(jsonText(row.line_snapshot_json) ?? "[]") as unknown;
    if (Array.isArray(parsed)) lines = parsed as BomWorkbenchLine[];
  } catch {
    lines = [];
  }

  const { line_snapshot_json: _lineSnapshotJson, ...snapshot } = row;
  return {
    ...snapshot,
    company_id: snapshot.company_id ?? null,
    definition_id: snapshot.definition_id ?? null,
    snapshot_schema_version: numberValue(snapshot.snapshot_schema_version ?? 1),
    parent_snapshot_json: jsonText(snapshot.parent_snapshot_json),
    mapping_snapshot_json: jsonText(snapshot.mapping_snapshot_json),
    resolved_projection_json: jsonText(snapshot.resolved_projection_json),
    snapshot_hash: snapshot.snapshot_hash ?? null,
    owner_part_number_id: snapshot.owner_part_number_id ?? null,
    bom_revision: snapshot.bom_revision ?? snapshot.parent_revision ?? null,
    source_submission_id: snapshot.source_submission_id ?? snapshot.parent_submission_id ?? null,
    parent_item_id: snapshot.parent_item_id ?? "",
    parent_submission_id: snapshot.parent_submission_id ?? snapshot.source_submission_id ?? "",
    parent_revision: snapshot.parent_revision ?? snapshot.bom_revision ?? "",
    line_count: numberValue(snapshot.line_count),
    lines
  };
}

function mergeDuplicateSiblingItems(lines: NormalizedWorkbenchTreeLine[]) {
  const bySiblingItem = new Map<string, NormalizedWorkbenchTreeLine>();
  const duplicateToKept = new Map<string, string>();
  const merged: NormalizedWorkbenchTreeLine[] = [];

  for (const line of lines.sort((a, b) => a.sequenceNo - b.sequenceNo)) {
    if (line.nodeType !== "item") {
      merged.push(line);
      continue;
    }
    const key = [
      line.parentLineId ?? "ROOT",
      line.partNumber?.trim().toUpperCase() ?? "",
      line.revision?.trim().toUpperCase() ?? ""
    ].join("::");
    const existing = bySiblingItem.get(key);
    if (existing) {
      existing.quantity = Number(existing.quantity ?? 0) + Number(line.quantity ?? 0);
      duplicateToKept.set(line.id, existing.id);
      continue;
    }
    bySiblingItem.set(key, line);
    merged.push(line);
  }

  return merged.map((line) => ({
    ...line,
    parentLineId: line.parentLineId && duplicateToKept.has(line.parentLineId) ? (duplicateToKept.get(line.parentLineId) ?? line.parentLineId) : line.parentLineId
  }));
}

function validateTreeDepthAndCycles(lines: NormalizedWorkbenchTreeLine[]) {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const visiting = new Set<string>();
  const visitedDepth = new Map<string, number>();

  function depthOf(line: NormalizedWorkbenchTreeLine): number {
    const existingDepth = visitedDepth.get(line.id);
    if (existingDepth) return existingDepth;
    if (visiting.has(line.id)) throw new Error("BOM_CYCLE_DETECTED");
    visiting.add(line.id);
    const parentDepth = line.parentLineId ? depthOf(byId.get(line.parentLineId) ?? failMissingParent()) : 0;
    visiting.delete(line.id);
    const depth = parentDepth + 1;
    if (depth > 10) throw new Error("BOM_MAX_DEPTH_EXCEEDED");
    visitedDepth.set(line.id, depth);
    return depth;
  }

  for (const line of lines) depthOf(line);
}

function failMissingParent(): never {
  throw new Error("BOM_PARENT_LINE_NOT_FOUND");
}

function sortWorkbenchTreeLines(lines: NormalizedWorkbenchTreeLine[]) {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const depthCache = new Map<string, number>();
  const depthOf = (line: NormalizedWorkbenchTreeLine): number => {
    const cached = depthCache.get(line.id);
    if (cached) return cached;
    const depth = line.parentLineId ? depthOf(byId.get(line.parentLineId) ?? line) + 1 : 1;
    depthCache.set(line.id, depth);
    return depth;
  };
  return [...lines].sort((a, b) => depthOf(a) - depthOf(b) || a.sequenceNo - b.sequenceNo || a.id.localeCompare(b.id));
}
