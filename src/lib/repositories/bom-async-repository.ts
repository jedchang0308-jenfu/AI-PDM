import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { buildBomSubmissionDiff } from "@/lib/bom-submission-diff";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";
import type { BomDetail, BomDiffResult, FileReference, SubmissionSummary } from "@/lib/types";

type BomHeaderRow = Omit<BomDetail, "lines">;

type BomSubmissionRow = Pick<
  SubmissionSummary,
  "id" | "item_id" | "revision" | "created_at" | "updated_at" | "released_at" | "status"
>;

export const SELECT_ASYNC_BOM_HEADER_SQL = `
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
  WHERE h.parent_submission_id = :submissionId
`;

export const SELECT_ASYNC_BOM_LINES_SQL = `
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
      COALESCE(cs.released_at, cs.updated_at, cs.created_at) DESC,
      cs.id DESC
    LIMIT 1
  )
  LEFT JOIN submissions latest_any ON latest_any.id = (
    SELECT la.id
    FROM submissions la
    WHERE la.item_id = child_i.id
    ORDER BY COALESCE(la.released_at, la.updated_at, la.created_at) DESC, la.id DESC
    LIMIT 1
  )
  LEFT JOIN submissions latest_released ON latest_released.id = (
    SELECT lr.id
    FROM submissions lr
    WHERE lr.item_id = child_i.id
      AND lr.status = 'Released'
    ORDER BY COALESCE(lr.released_at, lr.updated_at, lr.created_at) DESC, lr.id DESC
    LIMIT 1
  )
  WHERE l.bom_header_id = :bomHeaderId
  ORDER BY l.line_no ASC
`;

export const SELECT_ASYNC_BOM_SUBMISSION_SQL = `
  SELECT id, item_id, revision, created_at, updated_at, released_at, status
  FROM submissions
  WHERE id = :submissionId
`;

export const SELECT_ASYNC_ASSEMBLY_FILE_REFERENCES_SQL = `
  SELECT *
  FROM file_references
  WHERE submission_id = :submissionId
    AND reference_type = 'assembly_component'
    AND referenced_part_number IS NOT NULL
    AND trim(referenced_part_number) <> ''
  ORDER BY source_filename, referenced_part_number, referenced_filename
`;

export const UPSERT_ASYNC_BOM_HEADER_SQL = `
  INSERT INTO bom_headers (
    id, parent_item_id, parent_submission_id, parent_revision, status, source, line_count, created_at, updated_at
  ) VALUES (:id, :parentItemId, :parentSubmissionId, :parentRevision, :status, :source, :lineCount, :now, :now)
  ON CONFLICT(parent_submission_id) DO UPDATE SET
    parent_revision = excluded.parent_revision,
    source = excluded.source,
    line_count = excluded.line_count,
    updated_at = excluded.updated_at
`;

export const DELETE_ASYNC_BOM_LINES_SQL = `
  DELETE FROM bom_lines
  WHERE bom_header_id = :bomHeaderId
`;

export const INSERT_ASYNC_BOM_LINE_SQL = `
  INSERT INTO bom_lines (
    id, bom_header_id, line_no, child_part_number, child_revision, quantity,
    source_file_id, source_reference_id, source_filename, created_at
  ) VALUES (:id, :bomHeaderId, :lineNo, :childPartNumber, :childRevision, :quantity,
    :sourceFileId, :sourceReferenceId, :sourceFilename, :createdAt)
`;

export const SELECT_ASYNC_PREVIOUS_BOM_SUBMISSIONS_SQL = `
  SELECT s.id
  FROM submissions s
  JOIN bom_headers h ON h.parent_submission_id = s.id
  WHERE s.item_id = :itemId
  ORDER BY s.created_at ASC, s.id ASC
`;

export class AsyncBomRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async getBomBySubmissionId(submissionId: string): Promise<BomDetail | null> {
    const header = await this.client.queryOne<BomHeaderRow>(SELECT_ASYNC_BOM_HEADER_SQL, { submissionId });
    if (!header) return null;

    const lines = await this.client.query<BomDetail["lines"][number]>(SELECT_ASYNC_BOM_LINES_SQL, {
      bomHeaderId: header.id
    });

    return {
      ...header,
      line_count: Number(header.line_count),
      lines: lines.map((line) => ({
        ...line,
        line_no: Number(line.line_no),
        quantity: Number(line.quantity)
      }))
    };
  }

  async materializeBomDraftFromReferences(submissionId: string): Promise<BomDetail | null> {
    const submission = await this.getBomSubmission(submissionId);
    if (!submission) return null;

    const now = this.clock();
    const references = await this.client.query<FileReference>(SELECT_ASYNC_ASSEMBLY_FILE_REFERENCES_SQL, { submissionId });
    const existing = await this.getBomBySubmissionId(submissionId);
    const targetHeaderId = existing?.id ?? this.idFactory();

    await this.client.execute(UPSERT_ASYNC_BOM_HEADER_SQL, {
      id: targetHeaderId,
      parentItemId: submission.item_id,
      parentSubmissionId: submission.id,
      parentRevision: submission.revision,
      status: submission.status === "Released" ? "ReleasedSnapshot" : "Draft",
      source: "cad_references",
      lineCount: references.length,
      now
    });
    await this.client.execute(DELETE_ASYNC_BOM_LINES_SQL, { bomHeaderId: targetHeaderId });

    for (const [index, reference] of references.entries()) {
      await this.client.execute(INSERT_ASYNC_BOM_LINE_SQL, {
        id: this.idFactory(),
        bomHeaderId: targetHeaderId,
        lineNo: index + 1,
        childPartNumber: reference.referenced_part_number,
        childRevision: reference.referenced_revision,
        quantity: Number(reference.quantity),
        sourceFileId: reference.source_file_id,
        sourceReferenceId: reference.id,
        sourceFilename: reference.source_filename,
        createdAt: now
      });
    }

    await new AsyncAuditRepository(this.client, this.clock, this.idFactory).createAuditLog({
      submissionId,
      actorId: null,
      action: "BomDraftMaterialized",
      detail: { source: "file_references", lineCount: references.length }
    });

    return this.getBomBySubmissionId(submissionId);
  }

  async findPreviousBomSubmissionId(targetSubmissionId: string): Promise<string | null> {
    const target = await this.getBomSubmission(targetSubmissionId);
    if (!target) return null;

    const rows = await this.client.query<{ id: string }>(SELECT_ASYNC_PREVIOUS_BOM_SUBMISSIONS_SQL, {
      itemId: target.item_id
    });
    const targetIndex = rows.findIndex((row) => row.id === targetSubmissionId);
    if (targetIndex <= 0) return null;
    return rows[targetIndex - 1]?.id ?? null;
  }

  async getBomDiffBetweenSubmissions(input: {
    baseSubmissionId: string;
    targetSubmissionId: string;
  }): Promise<BomDiffResult | null> {
    const [baseSubmission, targetSubmission, baseBom, targetBom] = await Promise.all([
      this.getBomSubmission(input.baseSubmissionId),
      this.getBomSubmission(input.targetSubmissionId),
      this.getBomBySubmissionId(input.baseSubmissionId),
      this.getBomBySubmissionId(input.targetSubmissionId)
    ]);
    if (!baseSubmission || !targetSubmission || !baseBom || !targetBom) return null;
    return buildBomSubmissionDiff(baseSubmission, targetSubmission, baseBom.lines, targetBom.lines);
  }

  private async getBomSubmission(submissionId: string): Promise<BomSubmissionRow | null> {
    return this.client.queryOne<BomSubmissionRow>(SELECT_ASYNC_BOM_SUBMISSION_SQL, { submissionId });
  }
}
