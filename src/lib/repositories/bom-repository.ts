import crypto from "node:crypto";
import { createAuditLog, getDb, getSubmission } from "@/lib/db";
import type { BomDetail, BomDiffResult, FileReference, WhereUsedEntry } from "@/lib/types";

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
