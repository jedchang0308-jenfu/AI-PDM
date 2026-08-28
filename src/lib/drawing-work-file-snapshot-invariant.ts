export type DrawingWorkFileSnapshotScope = {
  id: string;
  companyId: string;
  drawingId: string;
  revisionId: string;
  migrated: boolean;
};

export type DrawingWorkFileSnapshotSourceRow = {
  id: string;
  company_id: string;
  drawing_id: string;
  drawing_revision_id: string;
  source_file_asset_id: string;
  sort_order: number | string;
  removed_at: string | null;
  removed_by: string | null;
  asset_id: string | null;
  content_hash: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_reason: string | null;
};

export type DrawingWorkFileSnapshotActualRow = {
  work_id: string;
  file_binding_id: string;
  ordinal: number | string;
  content_hash: string | null;
  company_id: string | null;
  drawing_id: string | null;
  drawing_revision_id: string | null;
  source_file_asset_id: string | null;
  removed_at: string | null;
  asset_id: string | null;
  asset_content_hash: string | null;
  deleted_at: string | null;
};

const LEGAL_TOMBSTONE_REASONS = new Set([
  "drawing_revision_work_file_removed",
  "drawing_revision_work_file_replaced"
]);

/**
 * DEV-100 snapshot invariant.
 *
 * Active bindings are always strict. Migrated snapshots additionally require an
 * exact match to the active source rows, while retaining auditable tombstones
 * for source rows legitimately removed or replaced by this workflow.
 */
export function collectDrawingWorkFileSnapshotAnomalies(input: {
  scope: DrawingWorkFileSnapshotScope;
  sourceRows: DrawingWorkFileSnapshotSourceRow[];
  actualRows: DrawingWorkFileSnapshotActualRow[];
}) {
  const anomalies = new Set<string>();
  const actualByBinding = new Map<string, DrawingWorkFileSnapshotActualRow>();
  const ordinals = new Set<number>();

  for (const actual of input.actualRows) {
    if (actual.work_id !== input.scope.id) anomalies.add("work_scope_mismatch");
    if (actualByBinding.has(actual.file_binding_id)) anomalies.add("duplicate_binding");
    actualByBinding.set(actual.file_binding_id, actual);

    const ordinal = Number(actual.ordinal);
    if (!Number.isInteger(ordinal) || ordinal < 0) anomalies.add("ordinal_invalid");
    else if (ordinals.has(ordinal)) anomalies.add("duplicate_ordinal");
    else ordinals.add(ordinal);

    if (actual.company_id !== input.scope.companyId || actual.drawing_id !== input.scope.drawingId) {
      anomalies.add("scope_mismatch");
    }
    if (input.scope.migrated && actual.drawing_revision_id !== input.scope.revisionId) {
      anomalies.add("revision_scope_mismatch");
    }
    if (!actual.asset_id || actual.removed_at !== null || actual.deleted_at !== null || !actual.asset_content_hash) {
      anomalies.add("target_asset_invalid");
    }
    if (actual.asset_content_hash && actual.content_hash !== actual.asset_content_hash) {
      anomalies.add("content_hash_mismatch");
    }
  }

  if (!input.scope.migrated) return [...anomalies].sort();

  const expected = input.sourceRows.filter((source) => source.removed_at === null);
  const expectedByBinding = new Map(expected.map((source) => [source.id, source]));

  for (const source of input.sourceRows) {
    if (source.company_id !== input.scope.companyId
      || source.drawing_id !== input.scope.drawingId
      || source.drawing_revision_id !== input.scope.revisionId) {
      anomalies.add("source_scope_mismatch");
    }
    if (!source.asset_id || !source.content_hash || source.asset_id !== source.source_file_asset_id) {
      anomalies.add("source_asset_invalid");
    }

    if (source.removed_at === null) {
      if (source.deleted_at !== null) anomalies.add("active_source_asset_deleted");
      continue;
    }

    if (actualByBinding.has(source.id)) anomalies.add("source_tombstone_still_bound");
    if (source.deleted_at !== null) {
      if (!LEGAL_TOMBSTONE_REASONS.has(source.deleted_reason ?? "")
        || !source.removed_by
        || !source.deleted_by) {
        anomalies.add("source_tombstone_invalid");
      }
    }
  }

  if (input.actualRows.length !== expected.length) anomalies.add("count_mismatch");
  for (const source of expected) {
    const actual = actualByBinding.get(source.id);
    if (!actual) {
      anomalies.add("missing_binding");
      continue;
    }
    if (Number(actual.ordinal) !== Number(source.sort_order)) anomalies.add("ordinal_mismatch");
    if (actual.content_hash !== source.content_hash) anomalies.add("content_hash_mismatch");
  }
  for (const actual of input.actualRows) {
    if (!expectedByBinding.has(actual.file_binding_id)) anomalies.add("extra_binding");
  }

  return [...anomalies].sort();
}
