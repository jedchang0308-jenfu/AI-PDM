import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export type ListAsyncManufacturingHandoffSubmissionIdsInput = {
  submittedBy?: string;
  limit?: number;
};

export const SELECT_ASYNC_MANUFACTURING_HANDOFF_SUBMISSION_IDS_SQL = `
  SELECT s.id
  FROM submissions s
  WHERE s.status = 'Released'
    AND (:submittedBy IS NULL OR s.submitted_by = :submittedBy)
    AND NOT EXISTS (
      SELECT 1
      FROM submissions newer
      WHERE newer.item_id = s.item_id
        AND newer.status = 'Released'
        AND COALESCE(newer.released_at, newer.updated_at, newer.created_at) >
            COALESCE(s.released_at, s.updated_at, s.created_at)
    )
  ORDER BY COALESCE(s.released_at, s.updated_at, s.created_at) DESC, s.id DESC
  LIMIT :limit
`;

export class AsyncHandoffRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async listManufacturingHandoffSubmissionIds(input: ListAsyncManufacturingHandoffSubmissionIdsInput = {}): Promise<string[]> {
    const rows = await this.client.query<{ id: string }>(SELECT_ASYNC_MANUFACTURING_HANDOFF_SUBMISSION_IDS_SQL, {
      submittedBy: input.submittedBy ?? null,
      limit: Math.min(Math.max(input.limit ?? 100, 1), 200)
    });

    return rows.map((row) => row.id);
  }
}
