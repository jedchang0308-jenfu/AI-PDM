import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type {
  BomImportJob,
  BomImportProfile,
  BomReleaseSnapshotDetail,
  BomReleaseGateIssue,
  BomWorkbenchDraftDetail,
  BomWorkbenchDraftSummary,
  BomWorkbenchLine,
  BomWorkbenchSummary,
  FileReference
} from "@/lib/types";

type BomWorkbenchParentRow = Omit<BomWorkbenchSummary, "drafts" | "active_draft">;
type AsyncBomReleaseSnapshotRow = Omit<BomReleaseSnapshotDetail, "lines"> & { line_snapshot_json: string };

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
  submitted_by: string;
  reviewed_by: string | null;
  change_reason: string;
  decision_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
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
  snapshotId: string;
};

export type SubmitAsyncBomWorkbenchDraftReviewInput = {
  draftId: string;
  actorId: string;
  changeReason: string;
};

export type SaveAsyncBomWorkbenchDraftTreeInput = {
  draftId: string;
  actorId: string | null;
  reason?: string;
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
  id: string;
  revision: string;
  status: string;
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

const BOM_WORKBENCH_SOURCE_PRIORITY = {
  cad_reference: 10,
  solidworks_xls: 20,
  manual: 30
} as const;

const SOLIDWORKS_BOM_IMPORT_PROFILE_NAME = "solidworks_bom_default";
const SOLIDWORKS_BOM_IMPORT_PROFILE_VERSION = "v1";

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

export const SELECT_ASYNC_BOM_WORKBENCH_DRAFTS_SQL = `
  SELECT *
  FROM bom_drafts
  WHERE parent_submission_id = :submissionId
  ORDER BY is_active DESC, updated_at DESC, id DESC
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

export const DEACTIVATE_ASYNC_BOM_WORKBENCH_ACTIVE_DRAFTS_SQL = `
  UPDATE bom_drafts
  SET is_active = 0,
      updated_at = :updatedAt
  WHERE parent_item_id = :parentItemId
    AND upper(parent_revision) = upper(:parentRevision)
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

export const DELETE_ASYNC_BOM_WORKBENCH_DRAFT_LINES_SQL = `
  DELETE FROM bom_lines_tree
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
      updated_by = :updatedBy,
      updated_at = :updatedAt
  WHERE id = :draftId
`;

export const SELECT_ASYNC_BOM_WORKBENCH_LATEST_RELEASE_SNAPSHOT_SQL = `
  SELECT
    rs.*,
    i.part_number AS parent_part_number,
    i.part_name AS parent_part_name,
    s.drawing_number AS parent_drawing_number,
    u.display_name AS released_by_name
  FROM bom_release_snapshots rs
  JOIN items i ON i.id = rs.parent_item_id
  JOIN submissions s ON s.id = rs.parent_submission_id
  LEFT JOIN users u ON u.id = rs.released_by
  WHERE rs.parent_item_id = :parentItemId
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
    i.part_number AS parent_part_number,
    i.part_name AS parent_part_name,
    s.drawing_number AS parent_drawing_number,
    u.display_name AS released_by_name
  FROM bom_release_snapshots rs
  JOIN items i ON i.id = rs.parent_item_id
  JOIN submissions s ON s.id = rs.parent_submission_id
  LEFT JOIN users u ON u.id = rs.released_by
  WHERE rs.id = :snapshotId
`;

export const SELECT_ASYNC_BOM_WORKBENCH_PENDING_REVIEWS_SQL = `
  SELECT
    rr.id,
    rr.bom_draft_id,
    rr.status,
    rr.submitted_by,
    u.display_name AS submitted_by_name,
    rr.change_reason,
    rr.submitted_at,
    d.parent_submission_id,
    d.draft_name,
    d.review_attempt,
    i.part_number AS parent_part_number,
    i.part_name AS parent_part_name,
    s.drawing_number AS parent_drawing_number,
    d.parent_revision
  FROM bom_review_requests rr
  JOIN bom_drafts d ON d.id = rr.bom_draft_id
  JOIN items i ON i.id = d.parent_item_id
  JOIN submissions s ON s.id = d.parent_submission_id
  LEFT JOIN users u ON u.id = rr.submitted_by
  WHERE rr.status = 'PendingReview'
    AND d.status = 'PendingReview'
  ORDER BY rr.submitted_at DESC, rr.id DESC
`;

export const SELECT_ASYNC_BOM_WORKBENCH_REVIEW_SQL = `
  SELECT *
  FROM bom_review_requests
  WHERE id = :reviewId
`;

export const SELECT_ASYNC_BOM_WORKBENCH_EXISTING_PENDING_REVIEW_SQL = `
  SELECT id
  FROM bom_drafts
  WHERE parent_item_id = :parentItemId
    AND upper(parent_revision) = upper(:parentRevision)
    AND status = 'PendingReview'
    AND id <> :draftId
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
    id, bom_draft_id, status, submitted_by, change_reason, submitted_at
  ) VALUES (
    :id, :draftId, :status, :submittedBy, :changeReason, :submittedAt
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
  WHERE parent_item_id = :parentItemId
    AND upper(parent_revision) = upper(:parentRevision)
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
    WHERE parent_item_id = :parentItemId
      AND upper(parent_revision) = upper(:parentRevision)
      AND id <> :snapshotId
  )
    AND status = 'Released'
`;

export const INSERT_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOT_SQL = `
  INSERT INTO bom_release_snapshots (
    id, bom_draft_id, parent_item_id, parent_submission_id, parent_revision,
    line_snapshot_json, line_count, released_by, released_at
  ) VALUES (
    :id, :draftId, :parentItemId, :parentSubmissionId, :parentRevision,
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

  async getDraftById(draftId: string): Promise<BomWorkbenchDraftDetail | null> {
    const draft = await this.client.queryOne<BomWorkbenchDraftSummary>(SELECT_ASYNC_BOM_WORKBENCH_DRAFT_SQL, { draftId });
    if (!draft) return null;

    const lines = await this.client.query<BomWorkbenchLine>(SELECT_ASYNC_BOM_WORKBENCH_DRAFT_LINES_SQL, { draftId });
    return {
      ...coerceDraftSummary(draft),
      lines: lines.map(coerceWorkbenchLine)
    };
  }

  async getDraftDiff(draftId: string): Promise<BomWorkbenchDraftDiffResult | null> {
    const draft = await this.getDraftById(draftId);
    if (!draft) return null;

    const baseSnapshot = await this.getLatestReleaseSnapshotForDraft(draft);
    const changes = diffBomWorkbenchLines(baseSnapshot?.lines ?? [], draft.lines);
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

    const parsed = parseSolidWorksBomImport(input.fileBuffer);
    const now = this.clock();
    const draftId = this.idFactory();
    const importJobId = this.idFactory();
    const asset = saveBomImportOriginalFile({
      importJobId,
      originalFilename,
      fileBuffer: input.fileBuffer,
      parentSubmissionId: parent.parent_submission_id,
      now
    });
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

      for (const [index, line] of parsed.lines.entries()) {
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

    if (this.client.kind === "postgres") {
      await this.client.transaction(create);
    } else {
      await create(this.client);
    }

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
    const now = this.clock();
    const reason = input.reason?.trim() || "Save BOM workbench draft tree";
    const save = async (client: AsyncDatabaseClient) => {
      await client.execute(DELETE_ASYNC_BOM_WORKBENCH_DRAFT_LINES_SQL, {
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

      await client.execute(UPDATE_ASYNC_BOM_WORKBENCH_DRAFT_AFTER_SAVE_SQL, {
        draftId: input.draftId,
        source: "manual",
        lineCount: normalizedLines.length,
        updatedBy: input.actorId,
        updatedAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_EDIT_EVENT_SQL, {
        id: this.idFactory(),
        draftId: input.draftId,
        actorId: input.actorId,
        eventType: "save_tree",
        beforeJson: JSON.stringify({ lineCount: before.lines.length, lines: before.lines }),
        afterJson: JSON.stringify({ lineCount: normalizedLines.length, lines: normalizedLines }),
        reason,
        createdAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_AUDIT_LOG_SQL, {
        id: this.idFactory(),
        submissionId: before.parent_submission_id,
        actorId: input.actorId,
        action: "BomWorkbenchDraftSaved",
        detailJson: JSON.stringify({
          draftId: input.draftId,
          beforeLineCount: before.lines.length,
          afterLineCount: normalizedLines.length,
          reason: input.reason?.trim() || null
        }),
        createdAt: now
      });
    };

    if (this.client.kind === "postgres") {
      await this.client.transaction(save);
    } else {
      await save(this.client);
    }

    return this.getDraftById(input.draftId);
  }

  async submitReview(input: SubmitAsyncBomWorkbenchDraftReviewInput): Promise<BomWorkbenchReview | null> {
    const draft = await this.getDraftById(input.draftId);
    if (!draft) return null;
    assertBomDraftMutable(draft.status);

    const changeReason = input.changeReason.trim();
    if (!changeReason) throw new Error("BOM_REVIEW_CHANGE_REASON_REQUIRED");

    const existingPendingReview = await this.client.queryOne<{ id: string }>(SELECT_ASYNC_BOM_WORKBENCH_EXISTING_PENDING_REVIEW_SQL, {
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
        submissionId: draft.parent_submission_id,
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

  async rejectReview(input: DecideAsyncBomWorkbenchReviewInput): Promise<{ review: BomWorkbenchReview | null; draft: BomWorkbenchDraftDetail | null } | null> {
    const review = await this.getReviewById(input.reviewId);
    if (!review) return null;
    if (review.status !== "PendingReview") throw new Error("BOM_REVIEW_NOT_PENDING");

    const draft = await this.getDraftById(review.bom_draft_id);
    if (!draft) return null;

    const now = this.clock();
    const decisionReason = input.decisionReason?.trim() || "";
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
        submissionId: draft.parent_submission_id,
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
    if (draft.status !== "PendingReview") throw new Error("BOM_DRAFT_NOT_PENDING_REVIEW");

    const issues = await this.evaluateReleaseGate(draft.lines);
    if (issues.length > 0) throw new BomReleaseGateError(issues);

    const now = this.clock();
    const snapshotId = this.idFactory();
    const decisionReason = input.decisionReason?.trim() || "";
    const approve = async (client: AsyncDatabaseClient) => {
      await client.execute(OBSOLETE_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOTS_SQL, {
        parentItemId: draft.parent_item_id,
        parentRevision: draft.parent_revision,
        obsoleteAt: now,
        obsoleteBy: input.actorId
      });
      await client.execute(OBSOLETE_ASYNC_BOM_WORKBENCH_RELEASED_DRAFTS_SQL, {
        parentItemId: draft.parent_item_id,
        parentRevision: draft.parent_revision,
        snapshotId,
        updatedBy: input.actorId,
        updatedAt: now
      });
      await client.execute(INSERT_ASYNC_BOM_WORKBENCH_RELEASE_SNAPSHOT_SQL, {
        id: snapshotId,
        draftId: draft.id,
        parentItemId: draft.parent_item_id,
        parentSubmissionId: draft.parent_submission_id,
        parentRevision: draft.parent_revision,
        lineSnapshotJson: JSON.stringify(draft.lines),
        lineCount: draft.lines.length,
        releasedBy: input.actorId,
        releasedAt: now
      });
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
        submissionId: draft.parent_submission_id,
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
      await client.execute(DEACTIVATE_ASYNC_BOM_WORKBENCH_ACTIVE_DRAFTS_SQL, {
        parentItemId: before.parent_item_id,
        parentRevision: before.parent_revision,
        updatedAt: now
      });
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
        submissionId: before.parent_submission_id,
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

  private async getLatestReleaseSnapshotForDraft(draft: BomWorkbenchDraftDetail): Promise<BomReleaseSnapshotDetail | null> {
    const row = await this.client.queryOne<AsyncBomReleaseSnapshotRow>(SELECT_ASYNC_BOM_WORKBENCH_LATEST_RELEASE_SNAPSHOT_SQL, {
      parentItemId: draft.parent_item_id,
      draftId: draft.id
    });
    if (!row) return null;
    return parseReleaseSnapshot(row);
  }

  private async evaluateReleaseGate(lines: BomWorkbenchLine[]): Promise<BomReleaseGateIssue[]> {
    const issues: BomReleaseGateIssue[] = [];
    for (const line of lines) {
      if (line.node_type !== "item" || !line.part_number) continue;
      const item = await this.client.queryOne<{ id: string }>(SELECT_ASYNC_BOM_WORKBENCH_ITEM_BY_PART_NUMBER_SQL, {
        partNumber: line.part_number
      });
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

      const childSubmission = await this.client.queryOne<AsyncBomReleaseGateSubmissionRow>(
        SELECT_ASYNC_BOM_WORKBENCH_RELEASE_GATE_SUBMISSION_SQL,
        {
          itemId: item.id,
          revision: line.revision
        }
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

      const latest = await this.client.queryOne<{ revision: string }>(SELECT_ASYNC_BOM_WORKBENCH_LATEST_RELEASED_REVISION_SQL, {
        itemId: item.id
      });
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
    is_active: numberValue(row.is_active),
    line_count: numberValue(row.line_count),
    review_attempt: numberValue(row.review_attempt)
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

function coerceImportJob(row: BomImportJob): BomImportJob {
  return {
    ...row,
    row_count: numberValue(row.row_count)
  };
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
  return { ...snapshot, lines };
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

function saveBomImportOriginalFile(input: {
  importJobId: string;
  originalFilename: string;
  fileBuffer: Buffer;
  parentSubmissionId: string;
  now: string;
}) {
  const repositoryDir = getRepositoryDir();
  const date = input.now.slice(0, 10).split("-");
  const targetDir = path.join(repositoryDir, "bom-imports", date[0] ?? "unknown", date[1] ?? "unknown", input.importJobId);
  fs.mkdirSync(targetDir, { recursive: true });
  const localPath = path.join(targetDir, input.originalFilename);
  fs.writeFileSync(localPath, input.fileBuffer);
  const storageKey = path.relative(repositoryDir, localPath).replaceAll(path.sep, "/");
  return {
    id: crypto.randomUUID(),
    localPath,
    storageKey,
    sha256: crypto.createHash("sha256").update(input.fileBuffer).digest("hex"),
    parentSubmissionId: input.parentSubmissionId
  };
}

function parseSolidWorksBomImport(fileBuffer: Buffer): SolidWorksBomParseResult {
  rejectUnsupportedBinaryXls(fileBuffer);
  const text = decodeImportBuffer(fileBuffer).trim();
  if (!text) throw new BomXlsImportError("BOM_XLS_EMPTY_FILE");

  const lower = text.slice(0, 1000).toLowerCase();
  if (lower.includes("<html") || lower.includes("<table") || lower.includes("<tr")) {
    return parseStructuredBomRows(extractHtmlTableRows(text), "html");
  }
  if (lower.includes("<workbook") || lower.includes("<worksheet") || lower.includes("<row")) {
    return parseStructuredBomRows(extractSpreadsheetMlRows(text), "spreadsheetml");
  }
  return parseStructuredBomRows(parseDelimitedRows(text), "delimited");
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
  const nullByteCount = fileBuffer.subarray(0, Math.min(fileBuffer.length, 4096)).filter((value) => value === 0).length;
  if (isOleBinary || nullByteCount > fileBuffer.length * 0.1) {
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

function parseStructuredBomRows(rows: string[][], format: SolidWorksBomParseResult["format"]): SolidWorksBomParseResult {
  const normalizedRows = rows.map((row) => row.map((cell) => normalizeCell(cell))).filter((row) => row.some(Boolean));
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

  normalizedRows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + offset + 2;
    const childPartNumber = row[partNumberIndex]?.trim();
    if (!childPartNumber) return;

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
  });

  if (parsedLines.length === 0) throw new BomXlsImportError("BOM_XLS_NO_LINES");
  const lines = mergeSolidWorksBomRows(parsedLines);
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

function mergeSolidWorksBomRows(
  rows: Array<{ childPartNumber: string; childRevision: string | null; quantity: number; rowNumber: number }>
): SolidWorksBomImportLine[] {
  const byKey = new Map<string, SolidWorksBomImportLine>();
  for (const row of rows) {
    const key = `${row.childPartNumber.toUpperCase()}::${(row.childRevision ?? "").toUpperCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += row.quantity;
      existing.rowNumbers.push(row.rowNumber);
      existing.sourceReferenceId = `solidworks_rows:${existing.rowNumbers.join(",")}`;
      continue;
    }
    byKey.set(key, {
      childPartNumber: row.childPartNumber,
      childRevision: row.childRevision,
      quantity: row.quantity,
      rowNumbers: [row.rowNumber],
      sourceReferenceId: `solidworks_rows:${row.rowNumber}`
    });
  }
  return Array.from(byKey.values());
}

function parseDelimitedRows(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const delimiter = detectDelimiter(lines);
  return lines.map((line) => parseDelimitedLine(line, delimiter));
}

function detectDelimiter(lines: string[]) {
  const candidates = ["\t", ",", ";"];
  const sample = lines.slice(0, 5).join("\n");
  return candidates
    .map((delimiter) => ({ delimiter, count: countDelimiter(sample, delimiter) }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? "\t";
}

function countDelimiter(value: string, delimiter: string) {
  return value.split(delimiter).length - 1;
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];
    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += char;
  }
  cells.push(cell);
  return cells;
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
  return filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "solidworks-bom.xls";
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

function diffBomWorkbenchLines(baseLines: BomWorkbenchLine[], targetLines: BomWorkbenchLine[]): BomWorkbenchLineDiffChange[] {
  const before = comparableLineMap(baseLines);
  const after = comparableLineMap(targetLines);
  const keys = new Set([...before.keys(), ...after.keys()]);
  const changes: BomWorkbenchLineDiffChange[] = [];

  for (const key of keys) {
    const previous = before.get(key) ?? null;
    const next = after.get(key) ?? null;
    if (!previous && next) {
      changes.push({ key, change_type: "added", label: next.label, before: null, after: next, changed_fields: ["line"] });
      continue;
    }
    if (previous && !next) {
      changes.push({ key, change_type: "removed", label: previous.label, before: previous, after: null, changed_fields: ["line"] });
      continue;
    }
    if (!previous || !next) continue;
    const changedFields = changedComparableFields(previous, next);
    changes.push({
      key,
      change_type: changedFields.length > 0 ? "changed" : "unchanged",
      label: next.label,
      before: previous,
      after: next,
      changed_fields: changedFields
    });
  }

  return changes.sort((a, b) => diffSortWeight(a.change_type) - diffSortWeight(b.change_type) || a.label.localeCompare(b.label));
}

function comparableLineMap(lines: BomWorkbenchLine[]) {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const occurrence = new Map<string, number>();
  const comparable = new Map<string, BomWorkbenchComparableLine>();
  const sorted = [...lines].sort((a, b) => a.sequence_no - b.sequence_no);

  for (const line of sorted) {
    const baseKey =
      line.node_type === "group"
        ? `group:${(line.group_name ?? "").trim().toUpperCase()}`
        : `item:${(line.part_number ?? "").trim().toUpperCase()}`;
    const count = (occurrence.get(baseKey) ?? 0) + 1;
    occurrence.set(baseKey, count);
    const key = `${baseKey}#${count}`;
    const parentPath = buildParentPath(line, byId);
    comparable.set(key, {
      key,
      node_type: line.node_type,
      label: line.node_type === "group" ? line.group_name || "Group" : `${line.part_number ?? "-"} Rev ${line.revision ?? "-"}`,
      part_number: line.part_number,
      revision: line.revision,
      group_name: line.group_name,
      quantity: line.quantity,
      parent_path: parentPath.path,
      level: parentPath.level,
      sequence_no: line.sequence_no
    });
  }

  return comparable;
}

function buildParentPath(line: BomWorkbenchLine, byId: Map<string, BomWorkbenchLine>) {
  const labels: string[] = [];
  const visited = new Set<string>();
  let currentParentId = line.parent_line_id;
  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const parent = byId.get(currentParentId);
    if (!parent) break;
    labels.unshift(parent.node_type === "group" ? parent.group_name || "Group" : `${parent.part_number ?? "-"} Rev ${parent.revision ?? "-"}`);
    currentParentId = parent.parent_line_id;
  }
  return {
    path: labels.length > 0 ? labels.join(" / ") : "ROOT",
    level: labels.length
  };
}

function changedComparableFields(before: BomWorkbenchComparableLine, after: BomWorkbenchComparableLine) {
  const fields: string[] = [];
  if ((before.revision ?? "") !== (after.revision ?? "")) fields.push("revision");
  if ((before.quantity ?? null) !== (after.quantity ?? null)) fields.push("quantity");
  if (before.parent_path !== after.parent_path || before.level !== after.level) fields.push("hierarchy");
  if (before.sequence_no !== after.sequence_no) fields.push("sequence");
  return fields;
}

function diffSortWeight(changeType: BomWorkbenchLineDiffChange["change_type"]) {
  if (changeType === "added") return 1;
  if (changeType === "removed") return 2;
  if (changeType === "changed") return 3;
  return 4;
}
