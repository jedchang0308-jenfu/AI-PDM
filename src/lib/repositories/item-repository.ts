import crypto from "node:crypto";
import { type SqliteDatabase } from "@/lib/db-provider";
import { getDb } from "@/lib/db";
import type { ItemRevisionHistoryEntry } from "@/lib/types";

export function reconcileItemCurrentRevisions(database: SqliteDatabase) {
  database.exec(`
    UPDATE items
    SET current_revision = (
          SELECT s.revision
          FROM submissions s
          WHERE (
              s.item_id = items.id
              OR EXISTS (
                SELECT 1 FROM submission_part_scopes scope
                WHERE scope.submission_id = s.id AND scope.item_id = items.id
              )
            )
            AND s.status = 'Released'
          ORDER BY datetime(COALESCE(s.released_at, s.updated_at, s.created_at)) DESC
          LIMIT 1
        ),
        updated_at = CASE
          WHEN EXISTS (
            SELECT 1
            FROM submissions s
            WHERE (
                s.item_id = items.id
                OR EXISTS (
                  SELECT 1 FROM submission_part_scopes scope
                  WHERE scope.submission_id = s.id AND scope.item_id = items.id
                )
              )
              AND s.status = 'Released'
          )
          THEN updated_at
          ELSE updated_at
        END
  `);
}

export function listItemRevisionHistory(input: { partNumber: string; submittedBy?: string; companyId?: string }) {
  const filters = ["i.part_number = ?"];
  const values = [input.partNumber, input.partNumber];
  if (input.companyId) {
    filters.push("i.company_id = ?");
    values.push(input.companyId);
  }
  if (input.submittedBy) {
    filters.push("s.submitted_by = ?");
    values.push(input.submittedBy);
  }

  return getDb()
    .prepare(
      `
      SELECT
        s.id AS submission_id,
        s.item_id,
        i.part_number,
        i.part_name,
        s.drawing_number,
        s.revision,
        s.status,
        s.submitted_by,
        u.display_name AS submitted_by_name,
        s.approval_required,
        s.created_at,
        s.released_at,
        s.rejected_at,
        s.superseded_by_submission_id,
        s.obsolete_at,
        s.obsolete_by
      FROM submissions s
      LEFT JOIN submission_part_scopes scope
        ON scope.submission_id = s.id
       AND scope.part_number = ?
      JOIN items i ON i.id = COALESCE(scope.item_id, s.item_id)
      JOIN users u ON u.id = s.submitted_by
      WHERE ${filters.join(" AND ")}
      ORDER BY s.created_at DESC, s.revision DESC
    `
    )
    .all(...values) as ItemRevisionHistoryEntry[];
}

export function submissionRevisionExists(input: { drawingNumber: string; revision: string; companyId?: string }) {
  const companyId = input.companyId ?? "company-jenfu";
  const existing = getDb()
    .prepare("SELECT id FROM submissions WHERE drawing_number = ? AND revision = ? AND company_id = ?")
    .get(input.drawingNumber, input.revision, companyId) as { id: string } | undefined;
  return Boolean(existing);
}

export function findOrCreateItem(input: { partNumber: string; partName: string; revision: string; companyId?: string }) {
  const database = getDb();
  const companyId = input.companyId ?? "company-jenfu";
  const existing = database.prepare("SELECT id FROM items WHERE company_id = ? AND part_number = ?").get(companyId, input.partNumber) as
    | { id: string }
    | undefined;

  const now = new Date().toISOString();
  if (existing) {
    database
      .prepare("UPDATE items SET part_name = ?, updated_at = ? WHERE id = ?")
      .run(input.partName, now, existing.id);
    return existing.id;
  }

  const id = crypto.randomUUID();
  database
    .prepare("INSERT INTO items (id, company_id, part_number, part_name, current_revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, companyId, input.partNumber, input.partName, null, now, now);
  return id;
}
