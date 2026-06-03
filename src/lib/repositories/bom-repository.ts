import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createAuditLog, getDb, getSubmission } from "@/lib/db";
import type {
  BomDetail,
  BomDiffResult,
  BomImportJob,
  BomImportProfile,
  BomReleaseGateIssue,
  BomReleaseSnapshotDetail,
  BomWorkbenchDraftDetail,
  BomWorkbenchDraftSummary,
  BomWorkbenchLine,
  BomWorkbenchSummary,
  FileReference,
  WhereUsedEntry
} from "@/lib/types";

export function getBomBySubmissionId(submissionId: string): BomDetail | null {
  const database = getDb();
  const header = database
    .prepare(
      `
      SELECT
        h.*,
        i.part_number AS parent_part_number,
        i.part_name AS parent_part_name,
        s.drawing_number AS parent_drawing_number,
        s.material AS parent_material,
        s.surface_finish AS parent_surface_finish,
        s.status AS parent_status
      FROM bom_headers h
      JOIN items i ON i.id = h.parent_item_id
      JOIN submissions s ON s.id = h.parent_submission_id
      WHERE h.parent_submission_id = ?
    `
    )
    .get(submissionId) as Omit<BomDetail, "lines"> | undefined;

  if (!header) return null;

  const lines = database
    .prepare(
      `
      SELECT
        l.*,
        child_i.part_name AS child_part_name,
        child_s.id AS child_submission_id,
        child_s.drawing_number AS child_drawing_number,
        child_s.material AS child_material,
        child_s.surface_finish AS child_surface_finish,
        child_s.revision AS child_submission_revision,
        child_s.status AS child_status,
        latest_any.revision AS child_latest_revision,
        latest_released.revision AS child_latest_released_revision
      FROM bom_lines l
      LEFT JOIN items child_i ON upper(child_i.part_number) = upper(l.child_part_number)
      LEFT JOIN submissions child_s ON child_s.id = (
        SELECT cs.id
        FROM submissions cs
        WHERE cs.item_id = child_i.id
          AND (l.child_revision IS NULL OR upper(cs.revision) = upper(l.child_revision))
        ORDER BY
          CASE WHEN cs.status = 'Released' THEN 0 ELSE 1 END,
          datetime(COALESCE(cs.released_at, cs.updated_at, cs.created_at)) DESC,
          cs.rowid DESC
        LIMIT 1
      )
      LEFT JOIN submissions latest_any ON latest_any.id = (
        SELECT la.id
        FROM submissions la
        WHERE la.item_id = child_i.id
        ORDER BY datetime(COALESCE(la.released_at, la.updated_at, la.created_at)) DESC, la.rowid DESC
        LIMIT 1
      )
      LEFT JOIN submissions latest_released ON latest_released.id = (
        SELECT lr.id
        FROM submissions lr
        WHERE lr.item_id = child_i.id
          AND lr.status = 'Released'
        ORDER BY datetime(COALESCE(lr.released_at, lr.updated_at, lr.created_at)) DESC, lr.rowid DESC
        LIMIT 1
      )
      WHERE l.bom_header_id = ?
      ORDER BY l.line_no ASC
    `
    )
    .all(header.id) as BomDetail["lines"];

  return { ...header, lines };
}

export function materializeBomDraftFromReferences(submissionId: string) {
  const submission = getSubmission(submissionId);
  if (!submission) return null;

  const database = getDb();
  const now = new Date().toISOString();
  const headerId = crypto.randomUUID();
  const references = database
    .prepare(
      `
      SELECT *
      FROM file_references
      WHERE submission_id = ?
        AND reference_type = 'assembly_component'
        AND referenced_part_number IS NOT NULL
        AND trim(referenced_part_number) <> ''
      ORDER BY source_filename, referenced_part_number, referenced_filename
    `
    )
    .all(submissionId) as FileReference[];

  const existing = getBomBySubmissionId(submissionId);
  const targetHeaderId = existing?.id ?? headerId;

  const tx = database.transaction(() => {
    database
      .prepare(
        `
        INSERT INTO bom_headers (
          id, parent_item_id, parent_submission_id, parent_revision, status, source, line_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(parent_submission_id) DO UPDATE SET
          parent_revision = excluded.parent_revision,
          source = excluded.source,
          line_count = excluded.line_count,
          updated_at = excluded.updated_at
      `
      )
      .run(
        targetHeaderId,
        submission.item_id,
        submission.id,
        submission.revision,
        submission.status === "Released" ? "ReleasedSnapshot" : "Draft",
        "cad_references",
        references.length,
        now,
        now
      );

    database.prepare("DELETE FROM bom_lines WHERE bom_header_id = ?").run(targetHeaderId);

    const insertLine = database.prepare(
      `
      INSERT INTO bom_lines (
        id, bom_header_id, line_no, child_part_number, child_revision, quantity,
        source_file_id, source_reference_id, source_filename, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );

    references.forEach((reference, index) => {
      insertLine.run(
        crypto.randomUUID(),
        targetHeaderId,
        index + 1,
        reference.referenced_part_number,
        reference.referenced_revision,
        reference.quantity,
        reference.source_file_id,
        reference.id,
        reference.source_filename,
        now
      );
    });
  });

  tx();

  createAuditLog({
    submissionId,
    actorId: null,
    action: "BomDraftMaterialized",
    detail: { source: "file_references", lineCount: references.length }
  });

  return getBomBySubmissionId(submissionId);
}

export type CreateBomWorkbenchDraftFromAssemblyInput = {
  submissionId: string;
  actorId: string | null;
  draftName?: string;
  setActive?: boolean;
};

export type CreateBomWorkbenchDraftFromSolidWorksXlsInput = {
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

export type CreateBomWorkbenchDraftFromSolidWorksXlsResult = {
  draft: BomWorkbenchDraftDetail;
  importJob: BomImportJob;
};

export type SaveBomWorkbenchDraftTreeInput = {
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

export type SetBomWorkbenchActiveDraftInput = {
  draftId: string;
  actorId: string | null;
};

export type SubmitBomWorkbenchDraftReviewInput = {
  draftId: string;
  actorId: string;
  changeReason: string;
};

export type DecideBomWorkbenchReviewInput = {
  reviewId: string;
  actorId: string;
  decisionReason?: string;
};

export type BomWorkbenchLineDiffChange = {
  key: string;
  change_type: "added" | "removed" | "changed" | "unchanged";
  label: string;
  before: BomWorkbenchComparableLine | null;
  after: BomWorkbenchComparableLine | null;
  changed_fields: string[];
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
    partNumber: [
      "part number",
      "part no",
      "part no.",
      "partno",
      "part_number",
      "component",
      "component part number",
      "料號",
      "零件號",
      "零件號碼",
      "品號"
    ],
    revision: ["revision", "rev", "rev.", "version", "版次", "版本"],
    quantity: ["quantity", "qty", "qty.", "q'ty", "數量", "用量", "數目"],
    description: ["description", "desc", "part name", "name", "零件名稱", "品名", "說明"]
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

export function createBomWorkbenchDraftFromAssembly(input: CreateBomWorkbenchDraftFromAssemblyInput): BomWorkbenchDraftDetail | null {
  const submission = getSubmission(input.submissionId);
  if (!submission) return null;

  const database = getDb();
  const references = database
    .prepare(
      `
      SELECT *
      FROM file_references
      WHERE submission_id = ?
        AND reference_type = 'assembly_component'
        AND referenced_part_number IS NOT NULL
        AND trim(referenced_part_number) <> ''
      ORDER BY source_filename, referenced_part_number, referenced_revision, referenced_filename
    `
    )
    .all(input.submissionId) as FileReference[];

  const now = new Date().toISOString();
  const draftId = crypto.randomUUID();
  const draftName = input.draftName?.trim() || `Assembly Draft ${now.slice(0, 10)}`;
  const lines = mergeAssemblyReferences(references);
  const setActive = input.setActive ?? true;

  const tx = database.transaction(() => {
    if (setActive) {
      database
        .prepare(
          `
          UPDATE bom_drafts
          SET is_active = 0,
              updated_at = ?
          WHERE parent_item_id = ?
            AND upper(parent_revision) = upper(?)
            AND is_active = 1
            AND status IN ('Draft', 'Rejected')
        `
        )
        .run(now, submission.item_id, submission.revision);
    }

    database
      .prepare(
        `
        INSERT INTO bom_drafts (
          id, parent_item_id, parent_submission_id, parent_revision, draft_name, status, source,
          is_active, line_count, review_attempt, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        draftId,
        submission.item_id,
        submission.id,
        submission.revision,
        draftName,
        "Draft",
        "cad_reference",
        setActive ? 1 : 0,
        lines.length,
        0,
        input.actorId,
        input.actorId,
        now,
        now
      );

    const insertLine = database.prepare(
      `
      INSERT INTO bom_lines_tree (
        id, bom_draft_id, parent_line_id, node_type, item_id, part_number, revision, group_name,
        quantity, sequence_no, source, source_priority, source_ref_id, source_filename,
        created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );
    const findItem = database.prepare("SELECT id FROM items WHERE upper(part_number) = upper(?) LIMIT 1");

    lines.forEach((line, index) => {
      const childItem = findItem.get(line.childPartNumber) as { id: string } | undefined;
      insertLine.run(
        crypto.randomUUID(),
        draftId,
        null,
        "item",
        childItem?.id ?? null,
        line.childPartNumber,
        line.childRevision,
        null,
        line.quantity,
        index + 1,
        "cad_reference",
        BOM_WORKBENCH_SOURCE_PRIORITY.cad_reference,
        line.sourceReferenceId,
        line.sourceFilename,
        input.actorId,
        input.actorId,
        now,
        now
      );
    });

    database
      .prepare(
        `
        INSERT INTO bom_edit_events (
          id, bom_draft_id, actor_id, event_type, before_json, after_json, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        crypto.randomUUID(),
        draftId,
        input.actorId,
        "create_from_assembly",
        null,
        JSON.stringify({ draftId, lineCount: lines.length, sourceReferenceCount: references.length, setActive }),
        "Create BOM workbench draft from assembly references",
        now
      );
  });

  tx();

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.actorId,
    action: "BomWorkbenchDraftCreated",
    detail: {
      draftId,
      source: "cad_reference",
      lineCount: lines.length,
      sourceReferenceCount: references.length,
      setActive
    }
  });

  return getBomWorkbenchDraftById(draftId);
}

export function createBomWorkbenchDraftFromSolidWorksXls(
  input: CreateBomWorkbenchDraftFromSolidWorksXlsInput
): CreateBomWorkbenchDraftFromSolidWorksXlsResult | null {
  const submission = getSubmission(input.submissionId);
  if (!submission) return null;

  const originalFilename = sanitizeFilename(input.originalFilename || "solidworks-bom.xls");
  if (input.fileBuffer.byteLength === 0) throw new BomXlsImportError("BOM_XLS_EMPTY_FILE");

  const parsed = parseSolidWorksBomImport(input.fileBuffer);
  const database = getDb();
  const profile = ensureSolidWorksBomImportProfile(database, input.profileName, input.profileVersion);
  const now = new Date().toISOString();
  const draftId = crypto.randomUUID();
  const importJobId = crypto.randomUUID();
  const asset = saveBomImportOriginalFile({
    importJobId,
    originalFilename,
    fileBuffer: input.fileBuffer,
    parentSubmissionId: submission.id,
    now
  });
  const draftName = input.draftName?.trim() || `SolidWorks XLS ${now.slice(0, 10)}`;
  const setActive = input.setActive ?? true;
  const findItem = database.prepare("SELECT id FROM items WHERE upper(part_number) = upper(?) LIMIT 1");

  const tx = database.transaction(() => {
    if (setActive) {
      database
        .prepare(
          `
          UPDATE bom_drafts
          SET is_active = 0,
              updated_at = ?
          WHERE parent_item_id = ?
            AND upper(parent_revision) = upper(?)
            AND is_active = 1
            AND status IN ('Draft', 'Rejected')
        `
        )
        .run(now, submission.item_id, submission.revision);
    }

    database
      .prepare(
        `
        INSERT INTO bom_drafts (
          id, parent_item_id, parent_submission_id, parent_revision, draft_name, status, source,
          is_active, line_count, review_attempt, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        draftId,
        submission.item_id,
        submission.id,
        submission.revision,
        draftName,
        "Draft",
        "solidworks_xls",
        setActive ? 1 : 0,
        parsed.lines.length,
        0,
        input.actorId,
        input.actorId,
        now,
        now
      );

    database
      .prepare(
        `
        INSERT INTO file_assets (
          id, storage_provider, original_path, storage_key, file_name, file_ext, file_size,
          content_hash, hash_algorithm, linked_entity_type, linked_entity_id, revision, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        asset.id,
        "external",
        asset.localPath,
        asset.storageKey,
        originalFilename,
        path.extname(originalFilename).replace(".", "").toLowerCase(),
        input.fileBuffer.byteLength,
        asset.sha256,
        "SHA-256",
        "bom_import_job",
        importJobId,
        submission.revision,
        "local_only",
        now,
        now
      );

    const insertLine = database.prepare(
      `
      INSERT INTO bom_lines_tree (
        id, bom_draft_id, parent_line_id, node_type, item_id, part_number, revision, group_name,
        quantity, sequence_no, source, source_priority, source_ref_id, source_filename,
        created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );

    parsed.lines.forEach((line, index) => {
      const childItem = findItem.get(line.childPartNumber) as { id: string } | undefined;
      insertLine.run(
        crypto.randomUUID(),
        draftId,
        null,
        "item",
        childItem?.id ?? null,
        line.childPartNumber,
        line.childRevision,
        null,
        line.quantity,
        index + 1,
        "solidworks_xls",
        BOM_WORKBENCH_SOURCE_PRIORITY.solidworks_xls,
        line.sourceReferenceId,
        originalFilename,
        input.actorId,
        input.actorId,
        now,
        now
      );
    });

    database
      .prepare(
        `
        INSERT INTO bom_import_jobs (
          id, bom_draft_id, parent_submission_id, import_profile_id, source_asset_id, original_filename,
          status, row_count, error_json, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        importJobId,
        draftId,
        submission.id,
        profile.id,
        asset.id,
        originalFilename,
        "Imported",
        parsed.rawRowCount,
        JSON.stringify({
          format: parsed.format,
          sha256: asset.sha256,
          storageKey: asset.storageKey,
          transformedLineCount: parsed.lines.length,
          warnings: parsed.warnings
        }),
        input.actorId,
        now
      );

    database
      .prepare(
        `
        INSERT INTO bom_edit_events (
          id, bom_draft_id, actor_id, event_type, before_json, after_json, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        crypto.randomUUID(),
        draftId,
        input.actorId,
        "import_solidworks_xls",
        null,
        JSON.stringify({
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
        "Import BOM workbench draft from SolidWorks BOM XLS",
        now
      );
  });

  tx();

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.actorId,
    action: "BomWorkbenchDraftImported",
    detail: {
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
    }
  });

  const draft = getBomWorkbenchDraftById(draftId);
  const importJob = getBomImportJobById(importJobId);
  if (!draft || !importJob) throw new Error("BOM_XLS_IMPORT_RESULT_NOT_FOUND");
  return { draft, importJob };
}

export function saveBomWorkbenchDraftTree(input: SaveBomWorkbenchDraftTreeInput): BomWorkbenchDraftDetail | null {
  const before = getBomWorkbenchDraftById(input.draftId);
  if (!before) return null;
  assertBomDraftMutable(before.status);

  const normalizedLines = normalizeWorkbenchTreeLines(input.lines);
  const database = getDb();
  const now = new Date().toISOString();
  const findItem = database.prepare("SELECT id FROM items WHERE upper(part_number) = upper(?) LIMIT 1");

  const tx = database.transaction(() => {
    database.prepare("DELETE FROM bom_lines_tree WHERE bom_draft_id = ?").run(input.draftId);
    const insertLine = database.prepare(
      `
      INSERT INTO bom_lines_tree (
        id, bom_draft_id, parent_line_id, node_type, item_id, part_number, revision, group_name,
        quantity, sequence_no, source, source_priority, source_ref_id, source_filename,
        created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );

    for (const line of normalizedLines) {
      const childItem = line.nodeType === "item" && line.partNumber ? (findItem.get(line.partNumber) as { id: string } | undefined) : undefined;
      insertLine.run(
        line.id,
        input.draftId,
        line.parentLineId,
        line.nodeType,
        childItem?.id ?? null,
        line.nodeType === "item" ? line.partNumber : null,
        line.nodeType === "item" ? line.revision : null,
        line.nodeType === "group" ? line.groupName : null,
        line.nodeType === "item" ? line.quantity : null,
        line.sequenceNo,
        "manual",
        BOM_WORKBENCH_SOURCE_PRIORITY.manual,
        null,
        null,
        input.actorId,
        input.actorId,
        now,
        now
      );
    }

    database
      .prepare(
        `
        UPDATE bom_drafts
        SET source = ?,
            line_count = ?,
            updated_by = ?,
            updated_at = ?
        WHERE id = ?
      `
      )
      .run("manual", normalizedLines.length, input.actorId, now, input.draftId);

    database
      .prepare(
        `
        INSERT INTO bom_edit_events (
          id, bom_draft_id, actor_id, event_type, before_json, after_json, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        crypto.randomUUID(),
        input.draftId,
        input.actorId,
        "save_tree",
        JSON.stringify({ lineCount: before.lines.length, lines: before.lines }),
        JSON.stringify({ lineCount: normalizedLines.length, lines: normalizedLines }),
        input.reason?.trim() || "Save BOM workbench draft tree",
        now
      );
  });

  tx();

  createAuditLog({
    submissionId: before.parent_submission_id,
    actorId: input.actorId,
    action: "BomWorkbenchDraftSaved",
    detail: {
      draftId: input.draftId,
      beforeLineCount: before.lines.length,
      afterLineCount: normalizedLines.length,
      reason: input.reason?.trim() || null
    }
  });

  return getBomWorkbenchDraftById(input.draftId);
}

export function setBomWorkbenchActiveDraft(input: SetBomWorkbenchActiveDraftInput): BomWorkbenchDraftDetail | null {
  const before = getBomWorkbenchDraftById(input.draftId);
  if (!before) return null;
  assertBomDraftMutable(before.status);

  const now = new Date().toISOString();
  const database = getDb();
  const tx = database.transaction(() => {
    database
      .prepare(
        `
        UPDATE bom_drafts
        SET is_active = 0,
            updated_at = ?
        WHERE parent_item_id = ?
          AND upper(parent_revision) = upper(?)
          AND is_active = 1
          AND status IN ('Draft', 'Rejected')
      `
      )
      .run(now, before.parent_item_id, before.parent_revision);
    database
      .prepare(
        `
        UPDATE bom_drafts
        SET is_active = 1,
            updated_by = ?,
            updated_at = ?
        WHERE id = ?
      `
      )
      .run(input.actorId, now, input.draftId);
    database
      .prepare(
        `
        INSERT INTO bom_edit_events (
          id, bom_draft_id, actor_id, event_type, before_json, after_json, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        crypto.randomUUID(),
        input.draftId,
        input.actorId,
        "set_active",
        JSON.stringify({ isActive: before.is_active }),
        JSON.stringify({ isActive: 1 }),
        "Set active BOM workbench draft",
        now
      );
  });

  tx();

  createAuditLog({
    submissionId: before.parent_submission_id,
    actorId: input.actorId,
    action: "BomWorkbenchDraftActivated",
    detail: { draftId: input.draftId, previousActive: before.is_active }
  });

  return getBomWorkbenchDraftById(input.draftId);
}

export function submitBomWorkbenchDraftReview(input: SubmitBomWorkbenchDraftReviewInput) {
  const draft = getBomWorkbenchDraftById(input.draftId);
  if (!draft) return null;
  assertBomDraftMutable(draft.status);
  const changeReason = input.changeReason.trim();
  if (!changeReason) throw new Error("BOM_REVIEW_CHANGE_REASON_REQUIRED");

  const now = new Date().toISOString();
  const reviewId = crypto.randomUUID();
  const database = getDb();
  const existingPendingReview = database
    .prepare(
      `
      SELECT id
      FROM bom_drafts
      WHERE parent_item_id = ?
        AND upper(parent_revision) = upper(?)
        AND status = 'PendingReview'
        AND id <> ?
      LIMIT 1
    `
    )
    .get(draft.parent_item_id, draft.parent_revision, input.draftId) as { id: string } | undefined;
  if (existingPendingReview) throw new Error("BOM_PENDING_REVIEW_EXISTS");

  const tx = database.transaction(() => {
    database
      .prepare(
        `
        UPDATE bom_drafts
        SET status = 'PendingReview',
            review_attempt = review_attempt + 1,
            updated_by = ?,
            updated_at = ?
        WHERE id = ?
      `
      )
      .run(input.actorId, now, input.draftId);
    database
      .prepare(
        `
        INSERT INTO bom_review_requests (
          id, bom_draft_id, status, submitted_by, change_reason, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .run(reviewId, input.draftId, "PendingReview", input.actorId, changeReason, now);
    database
      .prepare(
        `
        INSERT INTO bom_edit_events (
          id, bom_draft_id, actor_id, event_type, before_json, after_json, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        crypto.randomUUID(),
        input.draftId,
        input.actorId,
        "submit_review",
        JSON.stringify({ status: draft.status, reviewAttempt: draft.review_attempt }),
        JSON.stringify({ status: "PendingReview", reviewAttempt: draft.review_attempt + 1, reviewId }),
        changeReason,
        now
      );
  });
  tx();

  createAuditLog({
    submissionId: draft.parent_submission_id,
    actorId: input.actorId,
    action: "BomWorkbenchReviewSubmitted",
    detail: { draftId: input.draftId, reviewId, changeReason }
  });

  return getBomWorkbenchReviewById(reviewId);
}

export function approveBomWorkbenchReview(input: DecideBomWorkbenchReviewInput) {
  const review = getBomWorkbenchReviewById(input.reviewId);
  if (!review) return null;
  if (review.status !== "PendingReview") throw new Error("BOM_REVIEW_NOT_PENDING");
  const draft = getBomWorkbenchDraftById(review.bom_draft_id);
  if (!draft) return null;
  if (draft.status !== "PendingReview") throw new Error("BOM_DRAFT_NOT_PENDING_REVIEW");

  const issues = evaluateBomReleaseGate(draft.lines);
  if (issues.length > 0) throw new BomReleaseGateError(issues);

  const now = new Date().toISOString();
  const snapshotId = crypto.randomUUID();
  const database = getDb();
  const tx = database.transaction(() => {
    database
      .prepare(
        `
        UPDATE bom_release_snapshots
        SET obsolete_at = ?,
            obsolete_by = ?
        WHERE parent_item_id = ?
          AND upper(parent_revision) = upper(?)
          AND obsolete_at IS NULL
      `
      )
      .run(now, input.actorId, draft.parent_item_id, draft.parent_revision);
    database
      .prepare(
        `
        UPDATE bom_drafts
        SET status = 'Obsolete',
            updated_by = ?,
            updated_at = ?
        WHERE id IN (
          SELECT bom_draft_id
          FROM bom_release_snapshots
          WHERE parent_item_id = ?
            AND upper(parent_revision) = upper(?)
            AND id <> ?
        )
          AND status = 'Released'
      `
      )
      .run(input.actorId, now, draft.parent_item_id, draft.parent_revision, snapshotId);
    database
      .prepare(
        `
        INSERT INTO bom_release_snapshots (
          id, bom_draft_id, parent_item_id, parent_submission_id, parent_revision,
          line_snapshot_json, line_count, released_by, released_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        snapshotId,
        draft.id,
        draft.parent_item_id,
        draft.parent_submission_id,
        draft.parent_revision,
        JSON.stringify(draft.lines),
        draft.lines.length,
        input.actorId,
        now
      );
    database
      .prepare(
        `
        UPDATE bom_drafts
        SET status = 'Released',
            is_active = 0,
            updated_by = ?,
            updated_at = ?
        WHERE id = ?
      `
      )
      .run(input.actorId, now, draft.id);
    database
      .prepare(
        `
        UPDATE bom_review_requests
        SET status = 'Approved',
            reviewed_by = ?,
            decision_reason = ?,
            reviewed_at = ?
        WHERE id = ?
      `
      )
      .run(input.actorId, input.decisionReason?.trim() || null, now, input.reviewId);
    database
      .prepare(
        `
        INSERT INTO bom_edit_events (
          id, bom_draft_id, actor_id, event_type, before_json, after_json, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        crypto.randomUUID(),
        draft.id,
        input.actorId,
        "approve_release",
        JSON.stringify({ status: draft.status, reviewId: input.reviewId }),
        JSON.stringify({ status: "Released", snapshotId }),
        input.decisionReason?.trim() || "Approve BOM release",
        now
      );
  });
  tx();

  createAuditLog({
    submissionId: draft.parent_submission_id,
    actorId: input.actorId,
    action: "BomWorkbenchReviewApproved",
    detail: { draftId: draft.id, reviewId: input.reviewId, snapshotId, decisionReason: input.decisionReason?.trim() || null }
  });

  return {
    review: getBomWorkbenchReviewById(input.reviewId),
    draft: getBomWorkbenchDraftById(draft.id),
    snapshotId
  };
}

export function getBomReleaseSnapshotById(snapshotId: string): BomReleaseSnapshotDetail | null {
  const row = getDb()
    .prepare(
      `
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
      WHERE rs.id = ?
    `
    )
    .get(snapshotId) as
    | (Omit<BomReleaseSnapshotDetail, "lines"> & {
        line_snapshot_json: string;
      })
    | undefined;

  if (!row) return null;

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

export function getBomWorkbenchDraftDiff(draftId: string): BomWorkbenchDraftDiffResult | null {
  const draft = getBomWorkbenchDraftById(draftId);
  if (!draft) return null;
  const baseSnapshot = getLatestBomReleaseSnapshotForDraft(draft);
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

export function listPendingBomWorkbenchReviews(): BomWorkbenchPendingReview[] {
  const rows = getDb()
    .prepare(
      `
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
      ORDER BY datetime(rr.submitted_at) DESC, rr.rowid DESC
    `
    )
    .all() as Array<Omit<BomWorkbenchPendingReview, "diff">>;

  return rows
    .map((row) => {
      const diff = getBomWorkbenchDraftDiff(row.bom_draft_id);
      return diff ? { ...row, diff } : null;
    })
    .filter((row): row is BomWorkbenchPendingReview => Boolean(row));
}

export function rejectBomWorkbenchReview(input: DecideBomWorkbenchReviewInput) {
  const review = getBomWorkbenchReviewById(input.reviewId);
  if (!review) return null;
  if (review.status !== "PendingReview") throw new Error("BOM_REVIEW_NOT_PENDING");
  const draft = getBomWorkbenchDraftById(review.bom_draft_id);
  if (!draft) return null;

  const now = new Date().toISOString();
  const decisionReason = input.decisionReason?.trim() || "";
  const database = getDb();
  const tx = database.transaction(() => {
    database
      .prepare(
        `
        UPDATE bom_drafts
        SET status = 'Rejected',
            updated_by = ?,
            updated_at = ?
        WHERE id = ?
      `
      )
      .run(input.actorId, now, draft.id);
    database
      .prepare(
        `
        UPDATE bom_review_requests
        SET status = 'Rejected',
            reviewed_by = ?,
            decision_reason = ?,
            reviewed_at = ?
        WHERE id = ?
      `
      )
      .run(input.actorId, decisionReason || null, now, input.reviewId);
    database
      .prepare(
        `
        INSERT INTO bom_edit_events (
          id, bom_draft_id, actor_id, event_type, before_json, after_json, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        crypto.randomUUID(),
        draft.id,
        input.actorId,
        "reject_review",
        JSON.stringify({ status: draft.status, reviewId: input.reviewId }),
        JSON.stringify({ status: "Rejected" }),
        decisionReason || "Reject BOM review",
        now
      );
  });
  tx();

  createAuditLog({
    submissionId: draft.parent_submission_id,
    actorId: input.actorId,
    action: "BomWorkbenchReviewRejected",
    detail: { draftId: draft.id, reviewId: input.reviewId, decisionReason: decisionReason || null }
  });

  return {
    review: getBomWorkbenchReviewById(input.reviewId),
    draft: getBomWorkbenchDraftById(draft.id)
  };
}

export function getBomWorkbenchReviewById(reviewId: string) {
  return getDb()
    .prepare(
      `
      SELECT *
      FROM bom_review_requests
      WHERE id = ?
    `
    )
    .get(reviewId) as
    | {
        id: string;
        bom_draft_id: string;
        status: "PendingReview" | "Approved" | "Rejected" | "Cancelled";
        submitted_by: string;
        reviewed_by: string | null;
        change_reason: string;
        decision_reason: string | null;
        submitted_at: string;
        reviewed_at: string | null;
      }
    | undefined;
}

export function evaluateBomReleaseGate(lines: BomWorkbenchLine[]): BomReleaseGateIssue[] {
  const database = getDb();
  const findItem = database.prepare("SELECT id FROM items WHERE upper(part_number) = upper(?) LIMIT 1");
  const findSubmission = database.prepare(
    `
    SELECT id, revision, status
    FROM submissions
    WHERE item_id = ?
      AND (? IS NULL OR upper(revision) = upper(?))
    ORDER BY
      CASE WHEN status = 'Released' THEN 0 ELSE 1 END,
      datetime(COALESCE(released_at, updated_at, created_at)) DESC,
      rowid DESC
    LIMIT 1
  `
  );
  const latestReleased = database.prepare(
    `
    SELECT revision
    FROM submissions
    WHERE item_id = ?
      AND status = 'Released'
    ORDER BY datetime(COALESCE(released_at, updated_at, created_at)) DESC, rowid DESC
    LIMIT 1
  `
  );

  const issues: BomReleaseGateIssue[] = [];
  for (const line of lines) {
    if (line.node_type !== "item" || !line.part_number) continue;
    const item = findItem.get(line.part_number) as { id: string } | undefined;
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
    const childSubmission = findSubmission.get(item.id, line.revision, line.revision) as
      | { id: string; revision: string; status: string }
      | undefined;
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
    const latest = latestReleased.get(item.id) as { revision: string } | undefined;
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

export function getBomWorkbenchBySubmissionId(submissionId: string): BomWorkbenchSummary | null {
  const database = getDb();
  const parent = database
    .prepare(
      `
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
      WHERE s.id = ?
    `
    )
    .get(submissionId) as Omit<BomWorkbenchSummary, "drafts" | "active_draft"> | undefined;

  if (!parent) return null;

  const drafts = listBomWorkbenchDraftsBySubmissionId(submissionId);
  const activeSummary = drafts.find((draft) => draft.is_active === 1 && (draft.status === "Draft" || draft.status === "Rejected")) ?? null;
  const activeDraft = activeSummary ? getBomWorkbenchDraftById(activeSummary.id) : null;

  return {
    ...parent,
    drafts,
    active_draft: activeDraft
  };
}

export function listBomWorkbenchDraftsBySubmissionId(submissionId: string): BomWorkbenchDraftSummary[] {
  return getDb()
    .prepare(
      `
      SELECT *
      FROM bom_drafts
      WHERE parent_submission_id = ?
      ORDER BY is_active DESC, datetime(updated_at) DESC, rowid DESC
    `
    )
    .all(submissionId) as BomWorkbenchDraftSummary[];
}

export function getBomWorkbenchDraftById(draftId: string): BomWorkbenchDraftDetail | null {
  const database = getDb();
  const draft = database.prepare("SELECT * FROM bom_drafts WHERE id = ?").get(draftId) as BomWorkbenchDraftSummary | undefined;
  if (!draft) return null;

  const lines = database
    .prepare(
      `
      SELECT
        l.*,
        i.part_name AS part_name
      FROM bom_lines_tree l
      LEFT JOIN items i ON i.id = l.item_id
      WHERE l.bom_draft_id = ?
      ORDER BY COALESCE(l.parent_line_id, ''), l.sequence_no ASC, l.rowid ASC
    `
    )
    .all(draftId) as BomWorkbenchLine[];

  return { ...draft, lines };
}

export function getBomImportJobById(importJobId: string): BomImportJob | null {
  return (getDb().prepare("SELECT * FROM bom_import_jobs WHERE id = ?").get(importJobId) as BomImportJob | undefined) ?? null;
}

function ensureSolidWorksBomImportProfile(database: ReturnType<typeof getDb>, profileName?: string, profileVersion?: string): BomImportProfile {
  const name = profileName?.trim() || SOLIDWORKS_BOM_IMPORT_PROFILE_NAME;
  const version = profileVersion?.trim() || SOLIDWORKS_BOM_IMPORT_PROFILE_VERSION;
  const mappingJson = JSON.stringify(SOLIDWORKS_BOM_IMPORT_PROFILE_MAPPING);
  const existing = database
    .prepare("SELECT * FROM bom_import_profiles WHERE profile_name = ? AND version = ?")
    .get(name, version) as BomImportProfile | undefined;
  if (existing) {
    if (existing.mapping_json !== mappingJson || existing.is_active !== 1) {
      database.prepare("UPDATE bom_import_profiles SET mapping_json = ?, is_active = 1 WHERE id = ?").run(mappingJson, existing.id);
      return database.prepare("SELECT * FROM bom_import_profiles WHERE id = ?").get(existing.id) as BomImportProfile;
    }
    return existing;
  }

  const id = crypto.randomUUID();
  database
    .prepare(
      `
      INSERT INTO bom_import_profiles (id, profile_name, source_type, version, mapping_json, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(id, name, "solidworks_xls", version, mappingJson, 1, new Date().toISOString());
  return database.prepare("SELECT * FROM bom_import_profiles WHERE id = ?").get(id) as BomImportProfile;
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
    .replace(/[:：]/g, "")
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

function assertBomDraftMutable(status: BomWorkbenchDraftSummary["status"]) {
  if (status !== "Draft" && status !== "Rejected") {
    throw new Error("BOM_DRAFT_NOT_MUTABLE");
  }
}

function getLatestBomReleaseSnapshotForDraft(draft: BomWorkbenchDraftDetail): BomReleaseSnapshotDetail | null {
  const row = getDb()
    .prepare(
      `
      SELECT id
      FROM bom_release_snapshots
      WHERE parent_item_id = ?
        AND bom_draft_id <> ?
      ORDER BY
        CASE WHEN obsolete_at IS NULL THEN 0 ELSE 1 END,
        datetime(released_at) DESC,
        rowid DESC
      LIMIT 1
    `
    )
    .get(draft.parent_item_id, draft.id) as { id: string } | undefined;
  return row ? getBomReleaseSnapshotById(row.id) : null;
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

function normalizeWorkbenchTreeLines(lines: SaveBomWorkbenchDraftTreeInput["lines"]): NormalizedWorkbenchTreeLine[] {
  const normalized = lines.map((line, index) => normalizeWorkbenchTreeLine(line, index));
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

function normalizeWorkbenchTreeLine(
  line: SaveBomWorkbenchDraftTreeInput["lines"][number],
  index: number
): NormalizedWorkbenchTreeLine {
  const nodeType = line.nodeType;
  if (nodeType !== "item" && nodeType !== "group") throw new Error("BOM_INVALID_NODE_TYPE");
  const id = line.id?.trim() || crypto.randomUUID();
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

function bomDiffKey(line: BomDetail["lines"][number]) {
  return line.child_part_number.trim().toUpperCase();
}

export function findPreviousBomSubmissionId(targetSubmissionId: string) {
  const target = getSubmission(targetSubmissionId);
  if (!target) return null;

  const rows = getDb()
    .prepare(
      `
      SELECT s.id
      FROM submissions s
      JOIN bom_headers h ON h.parent_submission_id = s.id
      WHERE s.item_id = ?
      ORDER BY datetime(s.created_at) ASC, s.rowid ASC
    `
    )
    .all(target.item_id) as Array<{ id: string }>;

  const targetIndex = rows.findIndex((row) => row.id === targetSubmissionId);
  if (targetIndex <= 0) return null;
  return rows[targetIndex - 1]?.id ?? null;
}

export function getBomDiffBetweenSubmissions(input: { baseSubmissionId: string; targetSubmissionId: string }): BomDiffResult | null {
  const baseSubmission = getSubmission(input.baseSubmissionId);
  const targetSubmission = getSubmission(input.targetSubmissionId);
  const baseBom = getBomBySubmissionId(input.baseSubmissionId);
  const targetBom = getBomBySubmissionId(input.targetSubmissionId);
  if (!baseSubmission || !targetSubmission || !baseBom || !targetBom) return null;

  const baseByKey = new Map(baseBom.lines.map((line) => [bomDiffKey(line), line]));
  const targetByKey = new Map(targetBom.lines.map((line) => [bomDiffKey(line), line]));
  const keys = Array.from(new Set([...baseByKey.keys(), ...targetByKey.keys()])).sort();
  const lines: BomDiffResult["lines"] = keys.map((key) => {
    const baseLine = baseByKey.get(key) ?? null;
    const targetLine = targetByKey.get(key) ?? null;
    const changeType = !baseLine
      ? "added"
      : !targetLine
        ? "removed"
        : baseLine.child_revision !== targetLine.child_revision || Number(baseLine.quantity) !== Number(targetLine.quantity)
          ? "changed"
          : "unchanged";

    return {
      key,
      change_type: changeType,
      child_part_number: targetLine?.child_part_number ?? baseLine?.child_part_number ?? key,
      from_revision: baseLine?.child_revision ?? null,
      to_revision: targetLine?.child_revision ?? null,
      from_quantity: baseLine ? Number(baseLine.quantity) : null,
      to_quantity: targetLine ? Number(targetLine.quantity) : null,
      from_source_filename: baseLine?.source_filename ?? null,
      to_source_filename: targetLine?.source_filename ?? null
    };
  });

  return {
    base_submission_id: baseSubmission.id,
    target_submission_id: targetSubmission.id,
    base_revision: baseSubmission.revision,
    target_revision: targetSubmission.revision,
    base_created_at: baseSubmission.created_at,
    target_created_at: targetSubmission.created_at,
    added_count: lines.filter((line) => line.change_type === "added").length,
    removed_count: lines.filter((line) => line.change_type === "removed").length,
    changed_count: lines.filter((line) => line.change_type === "changed").length,
    unchanged_count: lines.filter((line) => line.change_type === "unchanged").length,
    lines
  };
}

export function listWhereUsed(input: { partNumber: string; submittedBy?: string }) {
  const filters = ["upper(l.child_part_number) = upper(?)"];
  const values: unknown[] = [input.partNumber.trim()];
  if (input.submittedBy) {
    filters.push("s.submitted_by = ?");
    values.push(input.submittedBy);
  }

  return getDb()
    .prepare(
      `
      SELECT
        h.parent_submission_id,
        h.parent_item_id,
        i.part_number AS parent_part_number,
        i.part_name AS parent_part_name,
        s.drawing_number AS parent_drawing_number,
        s.revision AS parent_revision,
        s.status AS parent_status,
        s.submitted_by AS parent_submitted_by,
        u.display_name AS parent_submitted_by_name,
        h.id AS bom_header_id,
        h.status AS bom_status,
        l.child_part_number,
        l.child_revision,
        child_s.id AS child_submission_id,
        child_s.drawing_number AS child_drawing_number,
        child_s.status AS child_status,
        latest_released.revision AS child_latest_released_revision,
        CASE
          WHEN l.child_revision IS NOT NULL
            AND latest_released.revision IS NOT NULL
            AND upper(l.child_revision) <> upper(latest_released.revision)
          THEN 1
          ELSE 0
        END AS child_is_outdated,
        l.quantity,
        l.source_filename,
        s.created_at AS parent_created_at,
        s.released_at AS parent_released_at
      FROM bom_lines l
      JOIN bom_headers h ON h.id = l.bom_header_id
      JOIN submissions s ON s.id = h.parent_submission_id
      JOIN items i ON i.id = h.parent_item_id
      JOIN users u ON u.id = s.submitted_by
      LEFT JOIN items child_i ON upper(child_i.part_number) = upper(l.child_part_number)
      LEFT JOIN submissions child_s ON child_s.id = (
        SELECT cs.id
        FROM submissions cs
        WHERE cs.item_id = child_i.id
          AND (l.child_revision IS NULL OR upper(cs.revision) = upper(l.child_revision))
        ORDER BY
          CASE WHEN cs.status = 'Released' THEN 0 ELSE 1 END,
          datetime(COALESCE(cs.released_at, cs.updated_at, cs.created_at)) DESC,
          cs.rowid DESC
        LIMIT 1
      )
      LEFT JOIN submissions latest_released ON latest_released.id = (
        SELECT lr.id
        FROM submissions lr
        WHERE lr.item_id = child_i.id
          AND lr.status = 'Released'
        ORDER BY datetime(COALESCE(lr.released_at, lr.updated_at, lr.created_at)) DESC, lr.rowid DESC
        LIMIT 1
      )
      WHERE ${filters.join(" AND ")}
      ORDER BY child_is_outdated DESC, datetime(COALESCE(s.released_at, s.updated_at, s.created_at)) DESC, s.id DESC
    `
    )
    .all(...values) as WhereUsedEntry[];
}
