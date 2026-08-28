import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { ItemRevisionHistoryEntry } from "@/lib/types";

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
  LEFT JOIN submission_part_scopes scope
    ON scope.submission_id = s.id
   AND scope.part_number = :partNumber
  JOIN items i ON i.id = COALESCE(scope.item_id, s.item_id)
  JOIN users u ON u.id = s.submitted_by
  WHERE i.part_number = :partNumber
    AND (:submittedBy IS NULL OR s.submitted_by = :submittedBy)
  ORDER BY s.created_at DESC, s.revision DESC
`;

export class AsyncItemInsightRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async listItemRevisionHistory(input: ListItemInsightInput): Promise<ItemRevisionHistoryEntry[]> {
    return this.client.query<ItemRevisionHistoryEntry>(SELECT_ASYNC_ITEM_REVISION_HISTORY_SQL, {
      partNumber: input.partNumber.trim(),
      submittedBy: input.submittedBy ?? null
    });
  }
}
