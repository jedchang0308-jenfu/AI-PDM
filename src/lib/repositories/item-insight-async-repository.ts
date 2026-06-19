import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { ItemRevisionHistoryEntry, WhereUsedEntry } from "@/lib/types";

export type ListItemInsightInput = {
  partNumber: string;
  submittedBy?: string;
};

export const SELECT_ASYNC_ITEM_REVISION_HISTORY_SQL = `
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
  JOIN items i ON i.id = s.item_id
  JOIN users u ON u.id = s.submitted_by
  WHERE i.part_number = :partNumber
    AND (:submittedBy IS NULL OR s.submitted_by = :submittedBy)
  ORDER BY s.created_at DESC, s.revision DESC
`;

export const SELECT_ASYNC_WHERE_USED_SQL = `
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
        AND lower(l.child_revision) <> lower(latest_released.revision)
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
  LEFT JOIN items child_i ON lower(child_i.part_number) = lower(l.child_part_number)
  LEFT JOIN submissions child_s ON child_s.id = (
    SELECT cs.id
    FROM submissions cs
    WHERE cs.item_id = child_i.id
      AND (l.child_revision IS NULL OR lower(cs.revision) = lower(l.child_revision))
    ORDER BY
      CASE WHEN cs.status = 'Released' THEN 0 ELSE 1 END,
      COALESCE(cs.released_at, cs.updated_at, cs.created_at) DESC,
      cs.id DESC
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
  WHERE lower(l.child_part_number) = lower(:partNumber)
    AND (:submittedBy IS NULL OR s.submitted_by = :submittedBy)
  ORDER BY child_is_outdated DESC, COALESCE(s.released_at, s.updated_at, s.created_at) DESC, s.id DESC
`;

export class AsyncItemInsightRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async listItemRevisionHistory(input: ListItemInsightInput): Promise<ItemRevisionHistoryEntry[]> {
    return this.client.query<ItemRevisionHistoryEntry>(SELECT_ASYNC_ITEM_REVISION_HISTORY_SQL, {
      partNumber: input.partNumber.trim(),
      submittedBy: input.submittedBy ?? null
    });
  }

  async listWhereUsed(input: ListItemInsightInput): Promise<WhereUsedEntry[]> {
    return this.client.query<WhereUsedEntry>(SELECT_ASYNC_WHERE_USED_SQL, {
      partNumber: input.partNumber.trim(),
      submittedBy: input.submittedBy ?? null
    });
  }
}
