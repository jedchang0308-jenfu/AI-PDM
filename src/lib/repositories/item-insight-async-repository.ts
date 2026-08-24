import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { SharedBomError } from "@/lib/bom-shared-structure";
import { AsyncBomWorkbenchRepository } from "@/lib/repositories/bom-workbench-async-repository";
import type { ItemRevisionHistoryEntry, WhereUsedEntry } from "@/lib/types";

export type ListItemInsightInput = {
  companyId: string;
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
    AND s.company_id = :companyId
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
    AND s.company_id = :companyId
    AND (:submittedBy IS NULL OR s.submitted_by = :submittedBy)
  ORDER BY child_is_outdated DESC, COALESCE(s.released_at, s.updated_at, s.created_at) DESC, s.id DESC
`;

export const SELECT_ASYNC_SHARED_WHERE_USED_SQL = `
  SELECT
    '' AS parent_submission_id,
    COALESCE((SELECT item.id FROM items item WHERE item.company_id = snapshot.company_id AND upper(item.part_number) = upper(parent.parent_part_number) ORDER BY item.id LIMIT 1), parent.parent_part_number_id) AS parent_item_id,
    parent.parent_part_number,
    parent.parent_part_name,
    COALESCE((
      SELECT drawing.drawing_number
      FROM drawing_part_links link JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id
      WHERE link.part_number_id = parent.parent_part_number_id AND link.link_type = 'primary_manufacturing'
        AND drawing.company_id = snapshot.company_id AND drawing.purpose_code = 'M'
      ORDER BY drawing.id LIMIT 1
    ), '') AS parent_drawing_number,
    snapshot.bom_revision AS parent_revision,
    'Released' AS parent_status,
    snapshot.released_by AS parent_submitted_by,
    COALESCE(releaser.display_name, '') AS parent_submitted_by_name,
    snapshot.id AS bom_header_id,
    'Released' AS bom_status,
    resolved.child_part_number,
    NULL AS child_revision,
    NULL AS child_submission_id,
    NULL AS child_drawing_number,
    NULL AS child_status,
    NULL AS child_latest_released_revision,
    0 AS child_is_outdated,
    resolved.quantity,
    NULL AS source_filename,
    snapshot.released_at AS parent_created_at,
    snapshot.released_at AS parent_released_at
  FROM bom_release_resolved_lines resolved
  JOIN bom_release_snapshots snapshot ON snapshot.id = resolved.release_snapshot_id
  JOIN bom_release_parent_snapshots parent
    ON parent.release_snapshot_id = resolved.release_snapshot_id
   AND parent.parent_part_number_id = resolved.parent_part_number_id
  LEFT JOIN users releaser ON releaser.id = snapshot.released_by
  WHERE snapshot.snapshot_schema_version = 2
    AND snapshot.obsolete_at IS NULL
    AND snapshot.company_id = :companyId
    AND resolved.node_type = 'item'
    AND lower(resolved.child_part_number) = lower(:partNumber)
    AND (:submittedBy IS NULL OR snapshot.released_by = :submittedBy)
  ORDER BY snapshot.released_at DESC, parent.parent_part_number, resolved.sequence_no
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
    const params = {
      companyId: input.companyId,
      partNumber: input.partNumber.trim(),
      submittedBy: input.submittedBy ?? null
    };
    const corrupt = await this.client.queryOne<{ id: string }>(`
      SELECT snapshot.id
      FROM bom_release_snapshots snapshot
      WHERE snapshot.snapshot_schema_version = 2
        AND snapshot.obsolete_at IS NULL
        AND snapshot.company_id = :companyId
        AND (
          snapshot.definition_id IS NULL
          OR snapshot.parent_snapshot_json IS NULL
          OR snapshot.mapping_snapshot_json IS NULL
          OR snapshot.resolved_projection_json IS NULL
          OR snapshot.snapshot_hash IS NULL
          OR (SELECT COUNT(*) FROM bom_release_parent_snapshots parent WHERE parent.release_snapshot_id = snapshot.id) = 0
          OR (SELECT COUNT(*) FROM bom_release_resolved_lines resolved WHERE resolved.release_snapshot_id = snapshot.id)
             <> snapshot.line_count * (SELECT COUNT(*) FROM bom_release_parent_snapshots parent WHERE parent.release_snapshot_id = snapshot.id)
        )
      LIMIT 1
    `, params);
    if (corrupt) throw new SharedBomError("BOM_RELEASE_SNAPSHOT_INVALID", 409);
    const [shared, legacy] = await Promise.all([
      this.client.query<WhereUsedEntry>(SELECT_ASYNC_SHARED_WHERE_USED_SQL, params),
      this.client.query<WhereUsedEntry>(SELECT_ASYNC_WHERE_USED_SQL, params)
    ]);
    const sharedSnapshotIds = [...new Set(shared.map((entry) => entry.bom_header_id))];
    const releaseRepository = new AsyncBomWorkbenchRepository(this.client);
    for (const snapshotId of sharedSnapshotIds) await releaseRepository.getReleaseSnapshotById(snapshotId);
    return [...shared, ...legacy];
  }
}
