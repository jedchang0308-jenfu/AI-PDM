import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { diffBomWorkbenchLines as diffBomWorkbenchLinesShared } from "@/lib/bom-workbench-diff";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { parseRevisionCode } from "@/lib/revision-policy";
import { getStorageUploadPolicy, validateStorageUploadFile } from "@/lib/storage-upload-policy";
import type {
  BomImportJob,
  BomImportProfile,
  BomDraftFloatingTopic,
  BomReconfirmationFlag,
  BomReleaseSnapshotDetail,
  BomReleaseGateIssue,
  BomWorkbenchDraftDetail,
  BomWorkbenchListRecord,
  BomWorkbenchDraftSummary,
  BomWorkbenchLine,
  BomWorkbenchSummary,
  FileReference
} from "@/lib/types";

type BomWorkbenchParentRow = Omit<BomWorkbenchSummary, "drafts" | "active_draft">;
type AsyncBomReleaseSnapshotRow = Omit<BomReleaseSnapshotDetail, "lines"> & { line_snapshot_json: string };
export type BomWorkbenchLifecycleAction = "release" | "obsolete";

export type ListBomWorkbenchRecordsInput = {
  companyId: string;
  query?: string;
  status?: BomWorkbenchDraftSummary["status"] | "";
  limit?: number;
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
};

export type CreateAsyncBomWorkbenchDraftFromAssemblyInput = {
  submissionId: string;
  actorId: string | null;
  draftName?: string;
  setActive?: boolean;
};

export type CreateAsyncBomWorkbenchDraftFromSolidWorksXlsInput = {
  submissionId: string;
  actorId: string | null;
  draftName?: string;
  setActive?: boolean;
  originalFilename: string;
  fileBuffer: Buffer;
  contentType?: string | null;
  profileName?: string;
  profileVersion?: string;
};

export type CreateAsyncBomWorkbenchDraftFromSolidWorksXlsResult = {
  draft: BomWorkbenchDraftDetail;
  importJob: BomImportJob;
};

export type CreateCanonicalBomDraftInput = {
  companyId: string;
  ownerPartNumberId: string;
  ownerPartNumber: string;
  legacyItemId: string | null;
  bomRevision: string;
  source: "manual" | "cad_reference";
  sourceSubmissionId?: string | null;
  sourceRevisionPackageId?: string | null;
  actorId: string;
  idempotencyKey: string;
  requestFingerprint: string;
  draftName?: string;
};

export type CreateCanonicalBomDraftFromSolidWorksXlsInput = Omit<
  CreateCanonicalBomDraftInput,
  "source" | "sourceSubmissionId" | "sourceRevisionPackageId"
> & {
  originalFilename: string;
  fileBuffer: Buffer;
  contentType?: string | null;
  profileName?: string;
  profileVersion?: string;
};

export type CreateCanonicalBomDraftResult = {
  draft: BomWorkbenchDraftDetail;
  replayed: boolean;
  importJob?: BomImportJob;
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

type AssemblyDraftLine = {
  childPartNumber: string;
  childRevision: string | null;
  quantity: number;
  sourceReferenceId: string | null;
  sourceFilename: string | null;
};

type SolidWorksBomImportLine = {
  childPartNumber: string;
  childRevision: string | null;
  quantity: number;
  sourceReferenceId: string;
  rowNumbers: number[];
};

type SolidWorksBomParseResult = {
  format: "delimited" | "html" | "spreadsheetml";
  rawRowCount: number;
  lines: SolidWorksBomImportLine[];
  warnings: string[];
};

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

const BOM_WORKBENCH_SOURCE_PRIORITY = {
  cad_reference: 10,
  solidworks_xls: 20,
  manual: 30
} as const;

const SOLIDWORKS_BOM_IMPORT_PROFILE_NAME = "solidworks_bom_default";
const SOLIDWORKS_BOM_IMPORT_PROFILE_VERSION = "v1";
const BOM_IMPORT_ROW_YIELD_INTERVAL = 250;
const BOM_IMPORT_CHARACTER_YIELD_INTERVAL = 16 * 1024;
const BOM_IMPORT_DELIMITER_SAMPLE_CHARACTERS = 64 * 1024;

const SOLIDWORKS_BOM_IMPORT_PROFILE_MAPPING = {
  acceptedFormats: ["tsv", "csv", "excel_html", "spreadsheetml_xml"],
  columns: {
    partNumber: ["part number", "part no", "part no.", "partno", "part_number", "component", "component part number"],
    revision: ["revision", "rev", "rev.", "version"],
    quantity: ["quantity", "qty", "qty.", "q'ty"],
    description: ["description", "desc", "part name", "name"]
  }
} as const;

export class BomXlsImportError extends Error {
  constructor(
    public readonly code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}

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
    COALESCE(pn.part_name, i.part_name, '') AS parent_part_name
  FROM bom_drafts d
  LEFT JOIN part_numbers pn ON pn.id = d.owner_part_number_id
  LEFT JOIN items i ON i.id = d.parent_item_id
  LEFT JOIN submissions s ON s.id = COALESCE(d.source_submission_id, d.parent_submission_id)
  WHERE COALESCE(d.company_id, s.company_id) = :companyId
    AND d.status <> 'Archived'
    AND (:status = '' OR d.status = :status)
    AND (
      :query = ''
      OR upper(COALESCE(pn.part_number, i.part_number, '')) LIKE upper(:queryLike)
      OR upper(COALESCE(pn.part_name, i.part_name, '')) LIKE upper(:queryLike)
      OR upper(COALESCE(d.bom_revision, d.parent_revision, '')) LIKE upper(:queryLike)
      OR upper(d.draft_name) LIKE upper(:queryLike)
    )
  ORDER BY d.updated_at DESC, d.id DESC
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

export const SELECT_ASYNC_BOM_WORKBENCH_ASSEMBLY_REFERENCES_SQL = `
  SELECT *
  FROM file_references
  WHERE submission_id = :submissionId
    AND reference_type = 'assembly_component'
    AND referenced_part_number IS NOT NULL
    AND trim(referenced_part_number) <> ''
  ORDER BY source_filename ASC, referenced_part_number ASC, referenced_revision ASC, referenced_filename ASC
`;

export const INSERT_ASYNC_BOM_WORKBENCH_DRAFT_SQL = `
  INSERT INTO bom_drafts (
    id, parent_item_id, parent_submission_id, parent_revision, draft_name, status, source,
    is_active, line_count, review_attempt, created_by, updated_by, created_at, updated_at
  ) VALUES (
    :id, :parentItemId, :parentSubmissionId, :parentRevision, :draftName, :status, :source,
    :isActive, :lineCount, :reviewAttempt, :createdBy, :updatedBy, :createdAt, :updatedAt
  )
`;

export const INSERT_ASYNC_CANONICAL_BOM_DRAFT_SQL = `
  INSERT INTO bom_drafts (
    id, company_id, owner_part_number_id, bom_revision, source_submission_id, source_revision_package_id, identity_authority,
    parent_item_id, parent_submission_id, parent_revision, draft_name, status, source,
    is_active, line_count, review_attempt, created_by, updated_by, created_at, updated_at
  ) VALUES (
    :id, :companyId, :ownerPartNumberId, :bomRevision, :sourceSubmissionId, :sourceRevisionPackageId, 'canonical_part_number',
    :parentItemId, :parentSubmissionId, NULL, :draftName, 'Draft', :source,
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
    id, bom_draft_id, parent_line_id, node_type, item_id, part_number, revision, group_name,
    quantity, sequence_no, source, source_priority, source_ref_id, source_filename,
    created_by, updated_by, created_at, updated_at
  ) VALUES (
    :id, :draftId, :parentLineId, :nodeType, :itemId, :partNumber, :revision, :groupName,
    :quantity, :sequenceNo, :source, :sourcePriority, :sourceRefId, :sourceFilename,
    :createdBy, :updatedBy, :createdAt, :updatedAt
  )
`;

export const INSERT_ASYNC_BOM_DRAFT_FLOATING_TOPIC_SQL = `
  INSERT INTO bom_draft_floating_topics (
    id, bom_draft_id, parent_floating_topic_id, node_type, item_id, part_number, revision, group_name,
    quantity, sequence_no, root_position_x, root_position_y, source,
    created_by, updated_by, created_at, updated_at
  ) VALUES (
    :id, :draftId, :parentFloatingTopicId, :nodeType, :itemId, :partNumber, :revision, :groupName,
    :quantity, :sequenceNo, :rootPositionX, :rootPositionY, 'manual',
    :createdBy, :updatedBy, :createdAt, :updatedAt
  )
`;

export const SELECT_ASYNC_BOM_IMPORT_PROFILE_SQL = `
  SELECT *
  FROM bom_import_profiles
  WHERE profile_name = :profileName
    AND version = :version
`;

export const UPDATE_ASYNC_BOM_IMPORT_PROFILE_SQL = `
  UPDATE bom_import_profiles
  SET mapping_json = :mappingJson,
      is_active = 1
  WHERE id = :id
`;

export const INSERT_ASYNC_BOM_IMPORT_PROFILE_SQL = `
  INSERT INTO bom_import_profiles (id, profile_name, source_type, version, mapping_json, is_active, created_at)
  VALUES (:id, :profileName, :sourceType, :version, :mappingJson, :isActive, :createdAt)
`;

export const SELECT_ASYNC_BOM_IMPORT_JOB_SQL = `
  SELECT *
  FROM bom_import_jobs
  WHERE id = :importJobId
`;

export const INSERT_ASYNC_BOM_IMPORT_JOB_SQL = `
  INSERT INTO bom_import_jobs (
    id, bom_draft_id, parent_submission_id, import_profile_id, source_asset_id, original_filename,
    status, row_count, error_json, created_by, created_at
  ) VALUES (
    :id, :draftId, :parentSubmissionId, :importProfileId, :sourceAssetId, :originalFilename,
    :status, :rowCount, :errorJson, :createdBy, :createdAt
  )
`;

export const INSERT_ASYNC_CANONICAL_BOM_IMPORT_JOB_SQL = `
  INSERT INTO bom_import_jobs (
    id, bom_draft_id, owner_part_number_id, bom_revision, source_submission_id, parent_submission_id,
    import_profile_id, source_asset_id, original_filename, status, row_count, error_json, created_by, created_at
  ) VALUES (
    :id, :draftId, :ownerPartNumberId, :bomRevision, NULL, NULL,
    :importProfileId, :sourceAssetId, :originalFilename, :status, :rowCount, :errorJson, :createdBy, :createdAt
  )
`;

export const INSERT_ASYNC_FILE_ASSET_SQL = `
  INSERT INTO file_assets (
    id, storage_provider, original_path, storage_key, file_name, file_ext, file_size,
    content_hash, hash_algorithm, linked_entity_type, linked_entity_id, revision, sync_status, created_at, updated_at
  ) VALUES (
    :id, :storageProvider, :originalPath, :storageKey, :fileName, :fileExt, :fileSize,
    :contentHash, :hashAlgorithm, :linkedEntityType, :linkedEntityId, :revision, :syncStatus, :createdAt, :updatedAt
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
    reviewed_at
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
    reviewed_at
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
    id, bom_draft_id, company_id, owner_part_number_id, bom_revision, source_submission_id, source_revision_package_id,
    parent_item_id, parent_submission_id, parent_revision,
    line_snapshot_json, line_count, released_by, released_at
  ) VALUES (
    :id, :draftId, :companyId, :ownerPartNumberId, :bomRevision, :sourceSubmissionId, :sourceRevisionPackageId,
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
    const rows = await this.client.query<BomWorkbenchListRecord>(SELECT_ASYNC_BOM_WORKBENCH_RECORDS_SQL, {
      companyId: input.companyId,
      query,
      queryLike: `%${query}%`,
      status: input.status ?? "",
      limit: Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 200)
    });
    return rows.map((row) => ({
      ...coerceDraftSummary(row),
      parent_part_number: row.parent_part_number,
      parent_part_name: row.parent_part_name
    }));
  }

  async getWorkbenchByDraftId(draftId: string): Promise<BomWorkbenchSummary | null> {
    const draft = await this.getDraftById(draftId);
    if (!draft) return null;
    if (!draft.owner_part_number_id) {
      return draft.parent_submission_id ? this.getWorkbenchBySubmissionId(draft.parent_submission_id) : null;
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

  async getDraftById(draftId: string): Promise<BomWorkbenchDraftDetail | null> {
    const draft = await this.client.queryOne<BomWorkbenchDraftSummary>(SELECT_ASYNC_BOM_WORKBENCH_DRAFT_SQL, { draftId });
    if (!draft) return null;

    const [lines, floatingTopics, reconfirmationFlags, latestReview, releaseSnapshot] = await Promise.all([
      this.client.query<BomWorkbenchLine>(SELECT_ASYNC_BOM_WORKBENCH_DRAFT_LINES_SQL, { draftId }),
      this.client.query<BomDraftFloatingTopic>(SELECT_ASYNC_BOM_DRAFT_FLOATING_TOPICS_SQL, { draftId }),
      this.client.query<BomReconfirmationFlag>(SELECT_ASYNC_BOM_WORKBENCH_RECONFIRMATION_FLAGS_SQL, { draftId }),
      this.client.queryOne<BomWorkbenchReview>(SELECT_ASYNC_BOM_WORKBENCH_LATEST_REVIEW_SQL, { draftId }),
      this.client.queryOne<{ id: string }>(SELECT_ASYNC_BOM_WORKBENCH_DRAFT_RELEASE_SNAPSHOT_ID_SQL, { draftId })
    ]);
    return {
      ...coerceDraftSummary(draft),
      lines: lines.map(coerceWorkbenchLine),
      floating_topics: floatingTopics.map(coerceFloatingTopic),
      reconfirmation_flags: reconfirmationFlags,
      release_snapshot_id: releaseSnapshot?.id ?? null,
      latest_review: latestReview ?? null
    };
  }

  async getDraftDiff(draftId: string): Promise<BomWorkbenchDraftDiffResult | null> {
    const draft = await this.getDraftById(draftId);
    if (!draft) return null;

    const baseSnapshot = await this.getLatestReleaseSnapshotForDraft(draft);
    const changes = diffBomWorkbenchLinesShared(baseSnapshot?.lines ?? [], draft.lines);
    return {
      draft,
      base_snapshot: baseSnapshot,
      summary: {
        added_count: changes.filter((change) => change.change_type === "added").length,
        removed_count: changes.filter((change) => change.change_type === "removed").length,
        changed_count: changes.filter((change) => change.change_type === "changed").length,
        unchanged_count: changes.filter((change) => change.change_type === "unchanged").length
      },
      changes
    };
  }

  async getReleaseSnapshotById(snapshotId: string): Promise<BomReleaseSnapshotDetail | null> {
    const row = await this.client.queryOne<AsyncBomReleaseSnapshotRow>(SELECT_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOT_SQL, {
      snapshotId
    });
    return row ? parseReleaseSnapshot(row) : null;
  }

  async listObsoleteHistory(input: ListBomWorkbenchObsoleteHistoryInput): Promise<BomWorkbenchObsoleteHistoryRecord[]> {
    const rows = await this.client.query<BomWorkbenchObsoleteHistoryRecord>(SELECT_ASYNC_BOM_WORKBENCH_OBSOLETE_HISTORY_SQL, {
      companyId: input.companyId,
      limit: Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500)
    });
    return rows.map((row) => ({ ...row, line_count: numberValue(row.line_count) }));
  }

  async createCanonicalDraft(input: CreateCanonicalBomDraftInput): Promise<CreateCanonicalBomDraftResult> {
    const replay = await this.getCanonicalCreateReplay(input);
    if (replay) return replay;
    await this.assertCanonicalRevisionAvailable(input);
    if (input.source === "cad_reference" && !input.sourceSubmissionId && !input.sourceRevisionPackageId) {
      throw new Error("BOM_CAD_SOURCE_SUBMISSION_REQUIRED");
    }
    if (input.sourceSubmissionId && input.sourceRevisionPackageId) throw new Error("BOM_CAD_SOURCE_AMBIGUOUS");

    const references = input.sourceSubmissionId
      ? await this.client.query<FileReference>(SELECT_ASYNC_BOM_WORKBENCH_ASSEMBLY_REFERENCES_SQL, {
          submissionId: input.sourceSubmissionId
        })
      : [];
    const lines = input.source === "cad_reference" ? mergeAssemblyReferences(references) : [];
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
        sourceSubmissionId: input.sourceSubmissionId ?? null,
        sourceRevisionPackageId: input.sourceRevisionPackageId ?? null,
        parentItemId: input.legacyItemId,
        parentSubmissionId: input.sourceSubmissionId ?? null,
        draftName,
        source: input.source,
        lineCount: lines.length,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: now,
        updatedAt: now
      });

      for (const [index, line] of lines.entries()) {
        const childItem = await client.queryOne<{ id: string }>(
          `SELECT id FROM items WHERE company_id = :companyId AND upper(part_number) = upper(:partNumber) LIMIT 1`,
          { companyId: input.companyId, partNumber: line.childPartNumber }
        );
        await client.execute(INSERT_ASYNC_BOM_WORKBENCH_DRAFT_LINE_SQL, {
          id: this.idFactory(),
          draftId,
          parentLineId: null,
          nodeType: "item",
          itemId: childItem?.id ?? null,
          partNumber: line.childPartNumber,
          revision: null,
          groupName: null,
          quantity: line.quantity,
          sequenceNo: index + 1,
          source: input.source,
          sourcePriority: BOM_WORKBENCH_SOURCE_PRIORITY[input.source],
          sourceRefId: line.sourceReferenceId,
          sourceFilename: line.sourceFilename,
          createdBy: input.actorId,
          updatedBy: input.actorId,
          createdAt: now,
          updatedAt: now
        });
      }

      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId,
        actorId: input.actorId,
        eventType: input.source === "cad_reference" ? "create_from_assembly" : "create_manual",
        beforeJson: null,
        afterJson: JSON.stringify({
          draftId,
          ownerPartNumberId: input.ownerPartNumberId,
          bomRevision: input.bomRevision,
          source: input.source,
          sourceRevisionPackageId: input.sourceRevisionPackageId ?? null,
          lineCount: lines.length
        }),
        reason: "Create canonical material-owned BOM draft",
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: input.sourceSubmissionId ?? null,
        actorId: input.actorId,
        action: "CanonicalBomDraftCreated",
        detailJson: JSON.stringify({
          draftId,
          ownerPartNumberId: input.ownerPartNumberId,
          bomRevision: input.bomRevision,
          source: input.source,
          sourceRevisionPackageId: input.sourceRevisionPackageId ?? null
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

  async createCanonicalDraftFromSolidWorksXls(
    input: CreateCanonicalBomDraftFromSolidWorksXlsInput
  ): Promise<CreateCanonicalBomDraftResult> {
    const replay = await this.getCanonicalCreateReplay(input);
    if (replay) return replay;
    await this.assertCanonicalRevisionAvailable(input);

    const originalFilename = sanitizeFilename(input.originalFilename || "solidworks-bom.xls");
    if (input.fileBuffer.byteLength === 0) throw new BomXlsImportError("BOM_XLS_EMPTY_FILE");
    const uploadValidation = validateStorageUploadFile(
      { name: originalFilename, size: input.fileBuffer.byteLength },
      getStorageUploadPolicy()
    );
    if (!uploadValidation.ok) throw new BomXlsImportError("BOM_XLS_FILE_TOO_LARGE");
    const parsed = await parseSolidWorksBomImport(input.fileBuffer);
    const now = this.clock();
    const draftId = this.idFactory();
    const importJobId = this.idFactory();
    const asset = await saveBomImportOriginalFile({
      importJobId,
      originalFilename,
      fileBuffer: input.fileBuffer,
      parentSubmissionId: input.ownerPartNumberId,
      now
    });
    const draftName = input.draftName?.trim() || `${input.ownerPartNumber} BOM Rev ${input.bomRevision}`;

    const create = async (client: AsyncDatabaseClient) => {
      const concurrentReplay = await this.getCanonicalCreateReplay(input, client);
      if (concurrentReplay) return { draftId: concurrentReplay.draft.id, replayed: true, importJobId: null as string | null };
      await this.assertCanonicalRevisionAvailable(input, client);
      const profile = await this.ensureSolidWorksBomImportProfile(client, {
        profileName: input.profileName,
        profileVersion: input.profileVersion,
        now
      });
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
        sourceSubmissionId: null,
        parentItemId: input.legacyItemId,
        parentSubmissionId: null,
        draftName,
        source: "solidworks_xls",
        lineCount: parsed.lines.length,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: now,
        updatedAt: now
      });
      await client.execute(INSERT_ASYNC_FILE_ASSET_SQL, {
        id: asset.id,
        storageProvider: "external",
        originalPath: asset.localPath,
        storageKey: asset.storageKey,
        fileName: originalFilename,
        fileExt: path.extname(originalFilename).replace(".", "").toLowerCase(),
        fileSize: input.fileBuffer.byteLength,
        contentHash: asset.sha256,
        hashAlgorithm: "SHA-256",
        linkedEntityType: "bom_import_job",
        linkedEntityId: importJobId,
        revision: input.bomRevision,
        syncStatus: "local_only",
        createdAt: now,
        updatedAt: now
      });
      for (const [index, line] of parsed.lines.entries()) {
        const childItem = await client.queryOne<{ id: string }>(
          `SELECT id FROM items WHERE company_id = :companyId AND upper(part_number) = upper(:partNumber) LIMIT 1`,
          { companyId: input.companyId, partNumber: line.childPartNumber }
        );
        await client.execute(INSERT_ASYNC_BOM_WORKBENCH_DRAFT_LINE_SQL, {
          id: this.idFactory(),
          draftId,
          parentLineId: null,
          nodeType: "item",
          itemId: childItem?.id ?? null,
          partNumber: line.childPartNumber,
          revision: null,
          groupName: null,
          quantity: line.quantity,
          sequenceNo: index + 1,
          source: "solidworks_xls",
          sourcePriority: BOM_WORKBENCH_SOURCE_PRIORITY.solidworks_xls,
          sourceRefId: line.sourceReferenceId,
          sourceFilename: originalFilename,
          createdBy: input.actorId,
          updatedBy: input.actorId,
          createdAt: now,
          updatedAt: now
        });
      }
      await client.execute(INSERT_ASYNC_CANONICAL_BOM_IMPORT_JOB_SQL, {
        id: importJobId,
        draftId,
        ownerPartNumberId: input.ownerPartNumberId,
        bomRevision: input.bomRevision,
        importProfileId: profile.id,
        sourceAssetId: asset.id,
        originalFilename,
        status: "Imported",
        rowCount: parsed.rawRowCount,
        errorJson: JSON.stringify({ format: parsed.format, sha256: asset.sha256, warnings: parsed.warnings }),
        createdBy: input.actorId,
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId,
        actorId: input.actorId,
        eventType: "import_solidworks_xls",
        beforeJson: null,
        afterJson: JSON.stringify({ draftId, importJobId, ownerPartNumberId: input.ownerPartNumberId, bomRevision: input.bomRevision }),
        reason: "Import canonical material-owned BOM draft from SolidWorks XLS",
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: null,
        actorId: input.actorId,
        action: "CanonicalBomDraftImported",
        detailJson: JSON.stringify({ draftId, importJobId, ownerPartNumberId: input.ownerPartNumberId, bomRevision: input.bomRevision }),
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_CREATE_EFFECT_SQL, {
        id: this.idFactory(),
        companyId: input.companyId,
        actorId: input.actorId,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        draftId,
        outcomeJson: JSON.stringify({ draftId, importJobId, source: "solidworks_xls" }),
        createdAt: now
      });
      return { draftId, replayed: false, importJobId };
    };

    let result: { draftId: string; replayed: boolean; importJobId: string | null };
    try {
      result = await this.client.transaction(create);
    } catch (error) {
      await removeBomImportOriginalFile(asset);
      const replayAfterConcurrentCommit = await this.getCanonicalCreateReplay(input);
      if (replayAfterConcurrentCommit) return replayAfterConcurrentCommit;
      throw error;
    }
    if (result.replayed) await removeBomImportOriginalFile(asset);
    const draft = await this.getDraftById(result.draftId);
    if (!draft) throw new Error("BOM_CREATE_RESULT_NOT_FOUND");
    const importJob = result.importJobId
      ? await this.client.queryOne<BomImportJob>(SELECT_ASYNC_BOM_IMPORT_JOB_SQL, { importJobId: result.importJobId })
      : await this.client.queryOne<BomImportJob>(
          `SELECT * FROM bom_import_jobs WHERE bom_draft_id = :draftId ORDER BY created_at DESC, id DESC LIMIT 1`,
          { draftId: result.draftId }
        );
    return { draft, replayed: result.replayed, importJob: importJob ? coerceImportJob(importJob) : undefined };
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
    const importJob = await client.queryOne<BomImportJob>(
      `SELECT * FROM bom_import_jobs WHERE bom_draft_id = :draftId ORDER BY created_at DESC, id DESC LIMIT 1`,
      { draftId: effect.draft_id }
    );
    return { draft, replayed: true, importJob: importJob ? coerceImportJob(importJob) : undefined };
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

  async createDraftFromAssembly(input: CreateAsyncBomWorkbenchDraftFromAssemblyInput): Promise<BomWorkbenchDraftDetail | null> {
    const parent = await this.client.queryOne<BomWorkbenchParentRow>(SELECT_ASYNC_BOM_WORKBENCH_PARENT_SQL, {
      submissionId: input.submissionId
    });
    if (!parent) return null;

    const references = await this.client.query<FileReference>(SELECT_ASYNC_BOM_WORKBENCH_ASSEMBLY_REFERENCES_SQL, {
      submissionId: input.submissionId
    });
    const now = this.clock();
    const draftId = this.idFactory();
    const draftName = input.draftName?.trim() || `Assembly Draft ${now.slice(0, 10)}`;
    const lines = mergeAssemblyReferences(references);
    const setActive = input.setActive ?? true;

    const create = async (client: AsyncDatabaseClient) => {
      if (setActive) {
        await client.execute(DEACTIVATE_ASYNC_BOM_WORKBENCH_ACTIVE_DRAFTS_SQL, {
          parentItemId: parent.parent_item_id,
          parentRevision: parent.parent_revision,
          updatedAt: now
        });
      }

      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_DRAFT_SQL, {
        id: draftId,
        parentItemId: parent.parent_item_id,
        parentSubmissionId: parent.parent_submission_id,
        parentRevision: parent.parent_revision,
        draftName,
        status: "Draft",
        source: "cad_reference",
        isActive: setActive ? 1 : 0,
        lineCount: lines.length,
        reviewAttempt: 0,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: now,
        updatedAt: now
      });

      for (const [index, line] of lines.entries()) {
        const childItem = await client.queryOne<{ id: string }>(SELECT_ASYNC_BOM_WORKBENCH_ITEM_BY_PART_NUMBER_SQL, {
          partNumber: line.childPartNumber
        });
        await client.execute(INSERT_ASYNC_BOM_WORKBENCH_DRAFT_LINE_SQL, {
          id: this.idFactory(),
          draftId,
          parentLineId: null,
          nodeType: "item",
          itemId: childItem?.id ?? null,
          partNumber: line.childPartNumber,
          revision: line.childRevision,
          groupName: null,
          quantity: line.quantity,
          sequenceNo: index + 1,
          source: "cad_reference",
          sourcePriority: BOM_WORKBENCH_SOURCE_PRIORITY.cad_reference,
          sourceRefId: line.sourceReferenceId,
          sourceFilename: line.sourceFilename,
          createdBy: input.actorId,
          updatedBy: input.actorId,
          createdAt: now,
          updatedAt: now
        });
      }

      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId,
        actorId: input.actorId,
        eventType: "create_from_assembly",
        beforeJson: null,
        afterJson: JSON.stringify({ draftId, lineCount: lines.length, sourceReferenceCount: references.length, setActive }),
        reason: "Create BOM workbench draft from assembly references",
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: input.submissionId,
        actorId: input.actorId,
        action: "BomWorkbenchDraftCreated",
        detailJson: JSON.stringify({
          draftId,
          source: "cad_reference",
          lineCount: lines.length,
          sourceReferenceCount: references.length,
          setActive
        }),
        createdAt: now
      });
    };

    if (this.client.kind === "postgres") {
      await this.client.transaction(create);
    } else {
      await create(this.client);
    }

    return this.getDraftById(draftId);
  }

  async createDraftFromSolidWorksXls(
    input: CreateAsyncBomWorkbenchDraftFromSolidWorksXlsInput
  ): Promise<CreateAsyncBomWorkbenchDraftFromSolidWorksXlsResult | null> {
    const parent = await this.client.queryOne<BomWorkbenchParentRow>(SELECT_ASYNC_BOM_WORKBENCH_PARENT_SQL, {
      submissionId: input.submissionId
    });
    if (!parent) return null;

    const originalFilename = sanitizeFilename(input.originalFilename || "solidworks-bom.xls");
    if (input.fileBuffer.byteLength === 0) throw new BomXlsImportError("BOM_XLS_EMPTY_FILE");
    const uploadValidation = validateStorageUploadFile(
      { name: originalFilename, size: input.fileBuffer.byteLength },
      getStorageUploadPolicy()
    );
    if (!uploadValidation.ok) {
      throw new BomXlsImportError(
        "BOM_XLS_FILE_TOO_LARGE",
        `BOM import file exceeds the configured upload limit of ${uploadValidation.maxUploadFileBytes} bytes.`
      );
    }

    const parsed = await parseSolidWorksBomImport(input.fileBuffer);
    const now = this.clock();
    const draftId = this.idFactory();
    const importJobId = this.idFactory();
    const asset = await saveBomImportOriginalFile({
      importJobId,
      originalFilename,
      fileBuffer: input.fileBuffer,
      parentSubmissionId: parent.parent_submission_id,
      now
    });
    await yieldToEventLoop();
    const draftName = input.draftName?.trim() || `SolidWorks XLS ${now.slice(0, 10)}`;
    const setActive = input.setActive ?? true;

    const create = async (client: AsyncDatabaseClient) => {
      const profile = await this.ensureSolidWorksBomImportProfile(client, {
        profileName: input.profileName,
        profileVersion: input.profileVersion,
        now
      });

      if (setActive) {
        await client.execute(DEACTIVATE_ASYNC_BOM_WORKBENCH_ACTIVE_DRAFTS_SQL, {
          parentItemId: parent.parent_item_id,
          parentRevision: parent.parent_revision,
          updatedAt: now
        });
      }

      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_DRAFT_SQL, {
        id: draftId,
        parentItemId: parent.parent_item_id,
        parentSubmissionId: parent.parent_submission_id,
        parentRevision: parent.parent_revision,
        draftName,
        status: "Draft",
        source: "solidworks_xls",
        isActive: setActive ? 1 : 0,
        lineCount: parsed.lines.length,
        reviewAttempt: 0,
        createdBy: input.actorId,
        updatedBy: input.actorId,
        createdAt: now,
        updatedAt: now
      });

      await client.execute(INSERT_ASYNC_FILE_ASSET_SQL, {
        id: asset.id,
        storageProvider: "external",
        originalPath: asset.localPath,
        storageKey: asset.storageKey,
        fileName: originalFilename,
        fileExt: path.extname(originalFilename).replace(".", "").toLowerCase(),
        fileSize: input.fileBuffer.byteLength,
        contentHash: asset.sha256,
        hashAlgorithm: "SHA-256",
        linkedEntityType: "bom_import_job",
        linkedEntityId: importJobId,
        revision: parent.parent_revision,
        syncStatus: "local_only",
        createdAt: now,
        updatedAt: now
      });
      if (client.kind === "postgres") await yieldToEventLoop();

      for (const [index, line] of parsed.lines.entries()) {
        if (client.kind === "postgres" && index > 0 && index % BOM_IMPORT_ROW_YIELD_INTERVAL === 0) await yieldToEventLoop();
        const childItem = await client.queryOne<{ id: string }>(SELECT_ASYNC_BOM_WORKBENCH_ITEM_BY_PART_NUMBER_SQL, {
          partNumber: line.childPartNumber
        });
        await client.execute(INSERT_ASYNC_BOM_WORKBENCH_DRAFT_LINE_SQL, {
          id: this.idFactory(),
          draftId,
          parentLineId: null,
          nodeType: "item",
          itemId: childItem?.id ?? null,
          partNumber: line.childPartNumber,
          revision: line.childRevision,
          groupName: null,
          quantity: line.quantity,
          sequenceNo: index + 1,
          source: "solidworks_xls",
          sourcePriority: BOM_WORKBENCH_SOURCE_PRIORITY.solidworks_xls,
          sourceRefId: line.sourceReferenceId,
          sourceFilename: originalFilename,
          createdBy: input.actorId,
          updatedBy: input.actorId,
          createdAt: now,
          updatedAt: now
        });
        if (client.kind === "postgres" && ((index + 1) % BOM_IMPORT_ROW_YIELD_INTERVAL === 0 || index === parsed.lines.length - 1)) {
          await yieldToEventLoop();
        }
      }

      await client.execute(INSERT_ASYNC_BOM_IMPORT_JOB_SQL, {
        id: importJobId,
        draftId,
        parentSubmissionId: parent.parent_submission_id,
        importProfileId: profile.id,
        sourceAssetId: asset.id,
        originalFilename,
        status: "Imported",
        rowCount: parsed.rawRowCount,
        errorJson: JSON.stringify({
          format: parsed.format,
          sha256: asset.sha256,
          storageKey: asset.storageKey,
          transformedLineCount: parsed.lines.length,
          warnings: parsed.warnings
        }),
        createdBy: input.actorId,
        createdAt: now
      });
      if (client.kind === "postgres") await yieldToEventLoop();

      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId,
        actorId: input.actorId,
        eventType: "import_solidworks_xls",
        beforeJson: null,
        afterJson: JSON.stringify({
          draftId,
          importJobId,
          originalFilename,
          sourceAssetId: asset.id,
          profileName: profile.profile_name,
          profileVersion: profile.version,
          rawRowCount: parsed.rawRowCount,
          lineCount: parsed.lines.length,
          setActive
        }),
        reason: "Import BOM workbench draft from SolidWorks BOM XLS",
        createdAt: now
      });
      if (client.kind === "postgres") await yieldToEventLoop();

      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: input.submissionId,
        actorId: input.actorId,
        action: "BomWorkbenchDraftImported",
        detailJson: JSON.stringify({
          draftId,
          importJobId,
          source: "solidworks_xls",
          originalFilename,
          sourceAssetId: asset.id,
          profileName: profile.profile_name,
          profileVersion: profile.version,
          rawRowCount: parsed.rawRowCount,
          lineCount: parsed.lines.length,
          setActive
        }),
        createdAt: now
      });
    };

    try {
      await this.client.transaction(create);
    } catch (error) {
      try {
        await removeBomImportOriginalFile(asset);
      } catch (compensationError) {
        throw new AggregateError([error, compensationError], "BOM_XLS_IMPORT_COMPENSATION_FAILED");
      }
      throw error;
    }
    await yieldToEventLoop();

    const draft = await this.getDraftById(draftId);
    const importJob = await this.client.queryOne<BomImportJob>(SELECT_ASYNC_BOM_IMPORT_JOB_SQL, { importJobId });
    if (!draft || !importJob) throw new Error("BOM_XLS_IMPORT_RESULT_NOT_FOUND");
    return { draft, importJob: coerceImportJob(importJob) };
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
    return review ?? null;
  }

  async saveDraftTree(input: SaveAsyncBomWorkbenchDraftTreeInput): Promise<BomWorkbenchDraftDetail | null> {
    const before = await this.getDraftById(input.draftId);
    if (!before) return null;
    assertBomDraftMutable(before.status);

    const normalizedLines = this.normalizeWorkbenchTreeLines(input.lines);
    const normalizedFloatingTopics = this.normalizeFloatingTopics(input.floatingTopics);
    const lineIds = new Set(normalizedLines.map((line) => line.id));
    if (normalizedFloatingTopics.some((topic) => lineIds.has(topic.id))) throw new Error("BOM_EDITOR_DUPLICATE_NODE_ID");
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
          reason: input.reason?.trim() || null
        }),
        createdAt: now
      });
    };

    await this.client.transaction(save);

    return this.getDraftById(input.draftId);
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

    const changeReason = input.changeReason.trim();
    if (!changeReason) throw new Error("BOM_REVIEW_CHANGE_REASON_REQUIRED");

    const existingPendingReview = await this.client.queryOne<{ id: string }>(SELECT_ASYNC_BOM_WORKBENCH_EXISTING_PENDING_REVIEW_SQL, {
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
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId: input.draftId,
        actorId: input.actorId,
        eventType: "submit_review",
        beforeJson: JSON.stringify({ status: draft.status, reviewAttempt: draft.review_attempt }),
        afterJson: JSON.stringify({ status: "PendingReview", reviewAttempt: draft.review_attempt + 1, reviewId }),
        reason: changeReason,
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: auditSubmissionId(draft),
        actorId: input.actorId,
        action: "BomWorkbenchReviewSubmitted",
        detailJson: JSON.stringify({ draftId: input.draftId, reviewId, changeReason }),
        createdAt: now
      });
    };

    if (this.client.kind === "postgres") {
      await this.client.transaction(submit);
    } else {
      await submit(this.client);
    }

    return this.getReviewById(reviewId);
  }

  async requestObsoleteReview(input: RequestAsyncBomWorkbenchObsoleteReviewInput): Promise<BomWorkbenchReview | null> {
    const draft = await this.getDraftById(input.draftId);
    if (!draft) return null;
    if (draft.status === "Obsolete") throw new Error("LIFE_OBSOLETE_ALREADY_APPROVED");
    if (draft.status !== "Released") throw new Error("LIFE_OBSOLETE_NOT_FORMAL");

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

    if (this.client.kind === "postgres") {
      await this.client.transaction(requestObsolete);
    } else {
      await requestObsolete(this.client);
    }

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

    if (this.client.kind === "postgres") {
      await this.client.transaction(confirm);
    } else {
      await confirm(this.client);
    }

    return this.getDraftById(input.draftId);
  }

  async rejectReview(input: DecideAsyncBomWorkbenchReviewInput): Promise<{ review: BomWorkbenchReview | null; draft: BomWorkbenchDraftDetail | null } | null> {
    const review = await this.getReviewById(input.reviewId);
    if (!review) return null;
    if (review.status !== "PendingReview") throw new Error("BOM_REVIEW_NOT_PENDING");

    const draft = await this.getDraftById(review.bom_draft_id);
    if (!draft) return null;

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

      if (this.client.kind === "postgres") {
        await this.client.transaction(rejectObsolete);
      } else {
        await rejectObsolete(this.client);
      }

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

    if (this.client.kind === "postgres") {
      await this.client.transaction(reject);
    } else {
      await reject(this.client);
    }

    return {
      review: await this.getReviewById(input.reviewId),
      draft: await this.getDraftById(draft.id)
    };
  }

  async approveReview(input: DecideAsyncBomWorkbenchReviewInput): Promise<ApproveAsyncBomWorkbenchReviewResult | null> {
    const review = await this.getReviewById(input.reviewId);
    if (!review) return null;
    if (review.status !== "PendingReview") throw new Error("BOM_REVIEW_NOT_PENDING");

    const draft = await this.getDraftById(review.bom_draft_id);
    if (!draft) return null;
    if (review.lifecycle_action === "obsolete") {
      if (draft.status !== "Released") throw new Error("LIFE_OBSOLETE_NOT_FORMAL");

      const now = this.clock();
      const decisionReason = input.decisionReason?.trim() || "";
      const approveObsolete = async (client: AsyncDatabaseClient) => {
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

      if (this.client.kind === "postgres") {
        await this.client.transaction(approveObsolete);
      } else {
        await approveObsolete(this.client);
      }

      return {
        review: await this.getReviewById(input.reviewId),
        draft: await this.getDraftById(draft.id),
        snapshotId: null
      };
    }

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
        sourceRevisionPackageId: draft.source_revision_package_id ?? null,
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

    if (this.client.kind === "postgres") {
      await this.client.transaction(archive);
    } else {
      await archive(this.client);
    }

    return this.getDraftById(input.draftId);
  }

  async restoreDraft(input: RestoreAsyncBomWorkbenchDraftInput): Promise<BomWorkbenchDraftDetail | null> {
    const before = await this.getDraftById(input.draftId);
    if (!before) return null;
    if (before.status !== "Archived") throw new Error("LIFE_BOM_DRAFT_NOT_DELETED");

    const now = this.clock();
    const reason = input.reason?.trim() || "Restore BOM workbench draft";
    const restore = async (client: AsyncDatabaseClient) => {
      await client.execute(RESTORE_ASYNC_BOM_WORKBENCH_DRAFT_SQL, {
        draftId: input.draftId,
        updatedBy: input.actorId,
        updatedAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId: input.draftId,
        actorId: input.actorId,
        eventType: "restore_draft",
        beforeJson: JSON.stringify({ status: before.status, isActive: before.is_active, lineCount: before.lines.length }),
        afterJson: JSON.stringify({ status: "Draft", isActive: 0 }),
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

    if (this.client.kind === "postgres") {
      await this.client.transaction(restore);
    } else {
      await restore(this.client);
    }

    return this.getDraftById(input.draftId);
  }

  private async getLatestReleaseSnapshotForDraft(draft: BomWorkbenchDraftDetail): Promise<BomReleaseSnapshotDetail | null> {
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

  private normalizeWorkbenchTreeLines(lines: SaveAsyncBomWorkbenchDraftTreeInput["lines"]): NormalizedWorkbenchTreeLine[] {
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

    const merged = mergeDuplicateSiblingItems(normalized);
    validateTreeDepthAndCycles(merged);
    return sortWorkbenchTreeLines(merged);
  }

  private normalizeFloatingTopics(topics: SaveAsyncBomWorkbenchDraftTreeInput["floatingTopics"]): NormalizedFloatingTopic[] {
    const normalized = topics.map((topic, index) => {
      const base = this.normalizeWorkbenchTreeLine(
        {
          id: topic.id,
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
      parentLineId,
      nodeType,
      partNumber,
      revision: line.revision?.trim() || null,
      groupName: null,
      quantity,
      sequenceNo
    };
  }

  private async ensureSolidWorksBomImportProfile(
    client: AsyncDatabaseClient,
    input: { profileName?: string; profileVersion?: string; now: string }
  ): Promise<BomImportProfile> {
    const profileName = input.profileName?.trim() || SOLIDWORKS_BOM_IMPORT_PROFILE_NAME;
    const version = input.profileVersion?.trim() || SOLIDWORKS_BOM_IMPORT_PROFILE_VERSION;
    const mappingJson = JSON.stringify(SOLIDWORKS_BOM_IMPORT_PROFILE_MAPPING);
    const existing = await client.queryOne<BomImportProfile>(SELECT_ASYNC_BOM_IMPORT_PROFILE_SQL, {
      profileName,
      version
    });
    if (existing) {
      if (existing.mapping_json !== mappingJson || numberValue(existing.is_active) !== 1) {
        await client.execute(UPDATE_ASYNC_BOM_IMPORT_PROFILE_SQL, {
          id: existing.id,
          mappingJson
        });
        return {
          ...existing,
          mapping_json: mappingJson,
          is_active: 1
        };
      }
      return {
        ...existing,
        is_active: numberValue(existing.is_active)
      };
    }

    const profile: BomImportProfile = {
      id: this.idFactory(),
      profile_name: profileName,
      source_type: "solidworks_xls",
      version,
      mapping_json: mappingJson,
      is_active: 1,
      created_at: input.now
    };
    await client.execute(INSERT_ASYNC_BOM_IMPORT_PROFILE_SQL, {
      id: profile.id,
      profileName: profile.profile_name,
      sourceType: profile.source_type,
      version: profile.version,
      mappingJson: profile.mapping_json,
      isActive: profile.is_active,
      createdAt: profile.created_at
    });
    return profile;
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

function coerceImportJob(row: BomImportJob): BomImportJob {
  return {
    ...row,
    row_count: numberValue(row.row_count)
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

function parseReleaseSnapshot(row: AsyncBomReleaseSnapshotRow): BomReleaseSnapshotDetail {
  let lines: BomWorkbenchLine[] = [];
  try {
    const parsed = JSON.parse(row.line_snapshot_json) as unknown;
    if (Array.isArray(parsed)) lines = parsed as BomWorkbenchLine[];
  } catch {
    lines = [];
  }

  const { line_snapshot_json: _lineSnapshotJson, ...snapshot } = row;
  return {
    ...snapshot,
    company_id: snapshot.company_id ?? null,
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

function mergeAssemblyReferences(references: FileReference[]): AssemblyDraftLine[] {
  const byKey = new Map<string, AssemblyDraftLine>();
  for (const reference of references) {
    const childPartNumber = reference.referenced_part_number?.trim();
    if (!childPartNumber) continue;
    const childRevision = reference.referenced_revision?.trim() || null;
    const key = `${childPartNumber.toUpperCase()}::${(childRevision ?? "").toUpperCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += Number(reference.quantity || 1);
      continue;
    }
    byKey.set(key, {
      childPartNumber,
      childRevision,
      quantity: Number(reference.quantity || 1),
      sourceReferenceId: reference.id,
      sourceFilename: reference.source_filename
    });
  }
  return Array.from(byKey.values());
}

async function saveBomImportOriginalFile(input: {
  importJobId: string;
  originalFilename: string;
  fileBuffer: Buffer;
  parentSubmissionId: string;
  now: string;
}) {
  const repositoryDir = getRepositoryDir();
  const date = input.now.slice(0, 10).split("-");
  const targetDir = path.join(repositoryDir, "bom-imports", date[0] ?? "unknown", date[1] ?? "unknown", input.importJobId);
  const resolvedTargetDir = path.resolve(targetDir);
  const localPath = path.resolve(resolvedTargetDir, input.originalFilename);
  if (path.dirname(localPath) !== resolvedTargetDir) throw new BomXlsImportError("BOM_XLS_FILENAME_INVALID");
  const sha256 = crypto.createHash("sha256").update(input.fileBuffer).digest("hex");

  const temporaryPath = path.join(resolvedTargetDir, `.${crypto.randomUUID()}.tmp`);
  let ownsTargetDirectory = false;
  try {
    await fs.promises.mkdir(path.dirname(resolvedTargetDir), { recursive: true });
    await fs.promises.mkdir(resolvedTargetDir);
    ownsTargetDirectory = true;
    await fs.promises.writeFile(temporaryPath, input.fileBuffer, { flag: "wx" });
    await fs.promises.rename(temporaryPath, localPath);
  } catch (error) {
    const cleanupErrors = await cleanupBomImportPaths({
      localPath,
      temporaryPath,
      targetDir: ownsTargetDirectory ? resolvedTargetDir : null
    });
    if (cleanupErrors.length > 0) {
      throw new AggregateError([error, ...cleanupErrors], "BOM_XLS_FILE_PERSISTENCE_COMPENSATION_FAILED");
    }
    throw error;
  }

  const storageKey = path.relative(repositoryDir, localPath).replaceAll(path.sep, "/");
  return {
    id: crypto.randomUUID(),
    localPath,
    targetDir: resolvedTargetDir,
    storageKey,
    sha256,
    parentSubmissionId: input.parentSubmissionId
  };
}

async function removeBomImportOriginalFile(asset: { localPath: string; targetDir: string }) {
  const cleanupErrors = await cleanupBomImportPaths({ localPath: asset.localPath, targetDir: asset.targetDir });
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, "BOM_XLS_FILE_COMPENSATION_FAILED");
}

async function cleanupBomImportPaths(input: { localPath: string; temporaryPath?: string; targetDir: string | null }) {
  const errors: unknown[] = [];
  for (const filePath of [input.temporaryPath, input.localPath]) {
    if (!filePath) continue;
    try {
      await fs.promises.rm(filePath, { force: true });
    } catch (error) {
      errors.push(error);
    }
  }
  if (input.targetDir) {
    try {
      await fs.promises.rmdir(input.targetDir);
    } catch (error) {
      if (!isNodeErrorWithCode(error, "ENOENT")) errors.push(error);
    }
  }
  return errors;
}

function isNodeErrorWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

async function parseSolidWorksBomImport(fileBuffer: Buffer): Promise<SolidWorksBomParseResult> {
  rejectUnsupportedBinaryXls(fileBuffer);
  const text = decodeImportBuffer(fileBuffer).trim();
  if (!text) throw new BomXlsImportError("BOM_XLS_EMPTY_FILE");
  await yieldToEventLoop();

  const lower = text.slice(0, 1000).toLowerCase();
  if (lower.includes("<html") || lower.includes("<table") || lower.includes("<tr")) {
    const rows = extractHtmlTableRows(text);
    await yieldToEventLoop();
    return parseStructuredBomRows(rows, "html");
  }
  if (lower.includes("<workbook") || lower.includes("<worksheet") || lower.includes("<row")) {
    const rows = extractSpreadsheetMlRows(text);
    await yieldToEventLoop();
    return parseStructuredBomRows(rows, "spreadsheetml");
  }
  const parsed = await parseStructuredBomRows(await parseDelimitedRows(text), "delimited");
  await yieldToEventLoop();
  return parsed;
}

function rejectUnsupportedBinaryXls(fileBuffer: Buffer) {
  const isOleBinary =
    fileBuffer.length >= 8 &&
    fileBuffer[0] === 0xd0 &&
    fileBuffer[1] === 0xcf &&
    fileBuffer[2] === 0x11 &&
    fileBuffer[3] === 0xe0 &&
    fileBuffer[4] === 0xa1 &&
    fileBuffer[5] === 0xb1 &&
    fileBuffer[6] === 0x1a &&
    fileBuffer[7] === 0xe1;
  const sample = fileBuffer.subarray(0, Math.min(fileBuffer.length, 4096));
  const nullByteCount = sample.filter((value) => value === 0).length;
  const oddNullByteCount = sample.filter((value, index) => index % 2 === 1 && value === 0).length;
  const isUtf16LeText =
    (fileBuffer.length >= 2 && fileBuffer[0] === 0xff && fileBuffer[1] === 0xfe) || oddNullByteCount > sample.length / 4;
  if (isOleBinary || (!isUtf16LeText && nullByteCount > sample.length * 0.1)) {
    throw new BomXlsImportError(
      "BOM_XLS_BINARY_UNSUPPORTED",
      "Binary .xls is not supported by the first SolidWorks BOM import profile. Export SolidWorks BOM as tab-delimited, CSV, Excel HTML, or SpreadsheetML."
    );
  }
}

function decodeImportBuffer(fileBuffer: Buffer) {
  if (fileBuffer.length >= 2 && fileBuffer[0] === 0xff && fileBuffer[1] === 0xfe) return fileBuffer.subarray(2).toString("utf16le");
  if (fileBuffer.length >= 3 && fileBuffer[0] === 0xef && fileBuffer[1] === 0xbb && fileBuffer[2] === 0xbf) return fileBuffer.subarray(3).toString("utf8");

  const sample = fileBuffer.subarray(0, Math.min(fileBuffer.length, 200));
  const oddNulls = sample.filter((value, index) => index % 2 === 1 && value === 0).length;
  if (oddNulls > sample.length / 4) return fileBuffer.toString("utf16le");
  return fileBuffer.toString("utf8");
}

async function parseStructuredBomRows(
  rows: string[][],
  format: SolidWorksBomParseResult["format"]
): Promise<SolidWorksBomParseResult> {
  const normalizedRows: string[][] = [];
  for (const [index, row] of rows.entries()) {
    const normalizedRow = row.map((cell) => normalizeCell(cell));
    if (normalizedRow.some(Boolean)) normalizedRows.push(normalizedRow);
    if ((index + 1) % BOM_IMPORT_ROW_YIELD_INTERVAL === 0) await yieldToEventLoop();
  }
  const headerIndex = findHeaderRowIndex(normalizedRows);
  if (headerIndex < 0) throw new BomXlsImportError("BOM_XLS_HEADER_NOT_FOUND");

  const headers = normalizedRows[headerIndex];
  const partNumberIndex = findColumnIndex(headers, SOLIDWORKS_BOM_IMPORT_PROFILE_MAPPING.columns.partNumber);
  const quantityIndex = findColumnIndex(headers, SOLIDWORKS_BOM_IMPORT_PROFILE_MAPPING.columns.quantity);
  const revisionIndex = findColumnIndex(headers, SOLIDWORKS_BOM_IMPORT_PROFILE_MAPPING.columns.revision);
  if (partNumberIndex < 0) throw new BomXlsImportError("BOM_XLS_PART_NUMBER_COLUMN_REQUIRED");
  if (quantityIndex < 0) throw new BomXlsImportError("BOM_XLS_QUANTITY_COLUMN_REQUIRED");

  const warnings: string[] = [];
  const parsedLines: Array<{
    childPartNumber: string;
    childRevision: string | null;
    quantity: number;
    rowNumber: number;
  }> = [];

  for (let index = headerIndex + 1; index < normalizedRows.length; index += 1) {
    const row = normalizedRows[index];
    const rowNumber = index + 1;
    const childPartNumber = row[partNumberIndex]?.trim();
    if (!childPartNumber) continue;

    const quantity = parseQuantity(row[quantityIndex]);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BomXlsImportError("BOM_XLS_INVALID_QUANTITY", `Invalid quantity at row ${rowNumber}`);
    }

    parsedLines.push({
      childPartNumber,
      childRevision: revisionIndex >= 0 ? normalizeRevision(row[revisionIndex]) : null,
      quantity,
      rowNumber
    });
    if ((index - headerIndex) % BOM_IMPORT_ROW_YIELD_INTERVAL === 0) await yieldToEventLoop();
  }

  if (parsedLines.length === 0) throw new BomXlsImportError("BOM_XLS_NO_LINES");
  const lines = await mergeSolidWorksBomRows(parsedLines);
  if (lines.length < parsedLines.length) warnings.push("duplicate_part_revision_rows_merged");

  return {
    format,
    rawRowCount: parsedLines.length,
    lines,
    warnings
  };
}

function findHeaderRowIndex(rows: string[][]) {
  return rows.findIndex((row) => {
    const hasPartNumber = findColumnIndex(row, SOLIDWORKS_BOM_IMPORT_PROFILE_MAPPING.columns.partNumber) >= 0;
    const hasQuantity = findColumnIndex(row, SOLIDWORKS_BOM_IMPORT_PROFILE_MAPPING.columns.quantity) >= 0;
    return hasPartNumber && hasQuantity;
  });
}

function findColumnIndex(headers: string[], aliases: readonly string[]) {
  const aliasSet = new Set(aliases.map((alias) => normalizeHeader(alias)));
  return headers.findIndex((header) => aliasSet.has(normalizeHeader(header)));
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./\\]+/g, " ")
    .replace(/:/g, "")
    .trim();
}

function normalizeCell(value: string) {
  return value.replace(/\uFEFF/g, "").replace(/\u00A0/g, " ").trim();
}

function normalizeRevision(value: string | undefined) {
  const revision = value?.trim();
  if (!revision || revision === "-" || revision.toLowerCase() === "n/a") return null;
  return revision;
}

function parseQuantity(value: string | undefined) {
  const normalized = value?.trim().replace(/,/g, "") ?? "";
  const match = normalized.match(/^-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

async function mergeSolidWorksBomRows(
  rows: Array<{ childPartNumber: string; childRevision: string | null; quantity: number; rowNumber: number }>
): Promise<SolidWorksBomImportLine[]> {
  const byKey = new Map<string, SolidWorksBomImportLine>();
  for (const [index, row] of rows.entries()) {
    const key = `${row.childPartNumber.toUpperCase()}::${(row.childRevision ?? "").toUpperCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += row.quantity;
      existing.rowNumbers.push(row.rowNumber);
      existing.sourceReferenceId = `solidworks_rows:${existing.rowNumbers.join(",")}`;
    } else {
      byKey.set(key, {
        childPartNumber: row.childPartNumber,
        childRevision: row.childRevision,
        quantity: row.quantity,
        rowNumbers: [row.rowNumber],
        sourceReferenceId: `solidworks_rows:${row.rowNumber}`
      });
    }
    if ((index + 1) % BOM_IMPORT_ROW_YIELD_INTERVAL === 0) await yieldToEventLoop();
  }
  return Array.from(byKey.values());
}

async function parseDelimitedRows(text: string) {
  if (!text) return [];
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let cells: string[] = [];
  let cellParts: string[] = [];
  let segmentStart = 0;
  let inQuotes = false;
  let rowHasContent = false;

  for (let index = 0; index < text.length; index += 1) {
    if (index > 0 && index % BOM_IMPORT_CHARACTER_YIELD_INTERVAL === 0) await yieldToEventLoop();
    const char = text[index];
    const nextChar = text[index + 1];
    if (!rowHasContent && char.trim()) rowHasContent = true;
    if (char === '"' && inQuotes && nextChar === '"') {
      cellParts.push(text.slice(segmentStart, index), '"');
      index += 1;
      segmentStart = index + 1;
      continue;
    }
    if (char === '"') {
      cellParts.push(text.slice(segmentStart, index));
      inQuotes = !inQuotes;
      segmentStart = index + 1;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cellParts.push(text.slice(segmentStart, index));
      cells.push(cellParts.join(""));
      cellParts = [];
      segmentStart = index + 1;
      continue;
    }
    if (char === "\r" || char === "\n") {
      cellParts.push(text.slice(segmentStart, index));
      cells.push(cellParts.join(""));
      if (rowHasContent) rows.push(cells);
      cells = [];
      cellParts = [];
      inQuotes = false;
      if (char === "\r" && nextChar === "\n") index += 1;
      segmentStart = index + 1;
      rowHasContent = false;
    }
  }
  cellParts.push(text.slice(segmentStart));
  cells.push(cellParts.join(""));
  if (rowHasContent) rows.push(cells);
  return rows;
}

function detectDelimiter(text: string) {
  const candidates = ["\t", ",", ";"];
  const counts = new Map(candidates.map((delimiter) => [delimiter, 0]));
  let lineCount = 1;
  const sampleLength = Math.min(text.length, BOM_IMPORT_DELIMITER_SAMPLE_CHARACTERS);
  for (let index = 0; index < sampleLength && lineCount <= 5; index += 1) {
    const char = text[index];
    if (counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
    if (char === "\n") lineCount += 1;
  }
  return candidates
    .map((delimiter) => ({ delimiter, count: counts.get(delimiter) ?? 0 }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? "\t";
}

function yieldToEventLoop() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function extractHtmlTableRows(text: string) {
  const rows: string[][] = [];
  for (const rowMatch of text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      cells.push(decodeHtmlText(cellMatch[1]));
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function extractSpreadsheetMlRows(text: string) {
  const rows: string[][] = [];
  for (const rowMatch of text.matchAll(/<Row\b[^>]*>([\s\S]*?)<\/Row>/gi)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<Cell\b[^>]*>([\s\S]*?)<\/Cell>/gi)) {
      const dataMatch = cellMatch[1].match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i);
      cells.push(decodeHtmlText(dataMatch?.[1] ?? cellMatch[1]));
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function decodeHtmlText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function sanitizeFilename(filename: string) {
  const sanitized = filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
  if (!sanitized || sanitized === "." || sanitized === "..") return "solidworks-bom.xls";
  return sanitized;
}

function getRepositoryDir() {
  const configured = process.env.PDM_REPOSITORY_DIR?.trim();
  if (!configured) return path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "repository");
  return path.isAbsolute(configured) ? configured : path.join(/*turbopackIgnore: true*/ process.cwd(), configured);
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
