import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  getPreviewDerivativeBytesForSourceAssetAsync,
  previewHeartbeatStaleAfterMs
} from "@/lib/preview-derivatives";
import type { PdmWorkbenchPreviewSummary } from "@/lib/pdm-workbench-contract";
import { compareRevisionCodes } from "@/lib/revision-policy";

type DrawingPreviewRow = {
  rowKey: string;
  drawingId: string;
};

type PartPreviewRow = {
  rowKey: string;
  partRootId: string | null;
  workspaceId: string | null;
};

export type RepresentativeDrawingCandidate = {
  id: string;
  drawingNumber: string | null;
  partRootId: string | null;
  workspaceId: string | null;
  sequenceNo: number | string | null;
  lifecycleState?: string | null;
};

type DrawingSource = {
  drawingId: string;
  drawingNumber: string | null;
  revision: string | null;
  sourceFileAssetId: string | null;
  sourceContentHash: string | null;
};

type PreviewReference = {
  summary: PdmWorkbenchPreviewSummary;
  derivativeId: string | null;
  sourceFileAssetId: string | null;
  sourceContentHash: string | null;
};

type RevisionRow = {
  id: string;
  drawing_id: string;
  revision: string;
  updated_at: string;
};

type RevisionFileRow = {
  drawing_revision_id: string;
  source_file_asset_id: string | null;
  sort_order: number | string;
  is_primary: number | boolean;
  content_hash?: string | null;
};

type DerivativeRow = {
  id: string;
  source_file_asset_id: string;
  source_content_hash: string;
  derivative_kind: string;
  storage_key: string | null;
  mime_type: string | null;
  generator_profile: string;
  status: string;
  created_at: string;
};
type JobRow = {
  source_file_asset_id: string;
  source_content_hash: string;
  status: string;
  updated_at: string;
};
type DerivativeJobProjectionRow = {
  record_kind: "derivative" | "job";
  id: string | null;
  source_file_asset_id: string;
  source_content_hash: string;
  derivative_kind: string | null;
  storage_key: string | null;
  mime_type: string | null;
  generator_profile: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
};

function inClause(prefix: string, values: readonly string[]) {
  return values.map((_, index) => `:${prefix}${index}`).join(", ");
}

function paramsFor(prefix: string, values: readonly string[], base: Record<string, unknown> = {}) {
  return values.reduce<Record<string, unknown>>((params, value, index) => {
    params[`${prefix}${index}`] = value;
    return params;
  }, { ...base });
}

function latestRevision(rows: RevisionRow[]) {
  return rows.reduce<RevisionRow | null>((selected, row) => {
    if (!selected) return row;
    try {
      const comparison = compareRevisionCodes(row.revision, selected.revision, { allowLegacy: true });
      if (comparison !== 0) return comparison > 0 ? row : selected;
    } catch {
      if (row.revision.localeCompare(selected.revision, "zh-Hant", { numeric: true }) > 0) return row;
    }
    if (row.updated_at !== selected.updated_at) return row.updated_at > selected.updated_at ? row : selected;
    return row.id < selected.id ? row : selected;
  }, null);
}

function latestPrimaryFile(rows: RevisionFileRow[]) {
  return rows
    .filter((row) => Number(row.is_primary) === 1 && Boolean(row.source_file_asset_id))
    .sort((left, right) => Number(left.sort_order) - Number(right.sort_order) || String(left.source_file_asset_id).localeCompare(String(right.source_file_asset_id)))[0] ?? null;
}

export function selectRepresentativeDrawing(rows: readonly RepresentativeDrawingCandidate[]) {
  return rows
    .filter((row) => !["obsolete", "merged", "cancelled"].includes(String(row.lifecycleState ?? "").toLowerCase()))
    .filter((row) => row.sequenceNo !== null && row.sequenceNo !== undefined && Number.isFinite(Number(row.sequenceNo)))
    .filter((row) => Boolean(row.drawingNumber))
    .sort((left, right) => Number(left.sequenceNo) - Number(right.sequenceNo)
      || String(left.drawingNumber).localeCompare(String(right.drawingNumber), "zh-Hant", { numeric: true })
      || left.id.localeCompare(right.id))[0] ?? null;
}

function sourceSummary(
  source: DrawingSource,
  sourceKind: PdmWorkbenchPreviewSummary["sourceKind"],
  rowKey: string,
  derivatives: DerivativeRow[],
  jobs: JobRow[]
): PreviewReference {
  const base = {
    sourceKind,
    sourceDrawingNumber: source.drawingNumber,
    sourceRevision: source.revision,
    alt: sourceKind === "root_representative_latest_3d"
      ? `代表圖 ${source.drawingNumber ?? "未指定"} 的 3D 預覽`
      : `3D 預覽：${source.drawingNumber ?? "圖號"}`
  } as const;
  if (!source.sourceFileAssetId) return { summary: { ...base, state: "missing", href: null }, derivativeId: null, sourceFileAssetId: null, sourceContentHash: null };
  if (!source.sourceContentHash) return { summary: { ...base, state: "unavailable", href: null }, derivativeId: null, sourceFileAssetId: source.sourceFileAssetId, sourceContentHash: null };

  const usable = derivatives
    .filter((row) => row.source_file_asset_id === source.sourceFileAssetId)
    .filter((row) => row.source_content_hash === source.sourceContentHash)
    .filter((row) => row.status === "ready" && row.storage_key && row.mime_type?.toLowerCase() === "image/png")
    .filter((row) => row.derivative_kind === "model_preview_png" || row.derivative_kind === "thumbnail_png")
    .filter((row) => row.generator_profile !== "fake_preview_worker")
    .sort((left, right) => Number(right.derivative_kind === "model_preview_png") - Number(left.derivative_kind === "model_preview_png") || right.created_at.localeCompare(left.created_at) || left.id.localeCompare(right.id));
  const ready = usable[0];
  if (ready) {
    const encodedRowKey = encodeURIComponent(rowKey);
    return {
      summary: { ...base, state: "ready", href: `${sourceKind === "drawing_latest_3d" ? "/api/numbering/drawings/workbench" : "/api/parts/workbench"}/${encodedRowKey}/preview` },
      derivativeId: ready.id,
      sourceFileAssetId: source.sourceFileAssetId,
      sourceContentHash: source.sourceContentHash
    };
  }

  const sourceJobs = jobs.filter((row) => row.source_file_asset_id === source.sourceFileAssetId && row.source_content_hash === source.sourceContentHash);
  const latestJob = sourceJobs.sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];
  if (latestJob?.status === "queued" || latestJob?.status === "running") {
    const stale = Date.now() - new Date(latestJob.updated_at).getTime() > previewHeartbeatStaleAfterMs;
    return { summary: { ...base, state: stale ? "delayed" : "pending", href: null }, derivativeId: null, sourceFileAssetId: source.sourceFileAssetId, sourceContentHash: source.sourceContentHash };
  }
  if (latestJob?.status === "failed" || latestJob?.status === "skipped" || latestJob?.status === "cancelled") {
    return { summary: { ...base, state: "failed", href: null }, derivativeId: null, sourceFileAssetId: source.sourceFileAssetId, sourceContentHash: source.sourceContentHash };
  }
  const staleDerivative = derivatives.some((row) => row.source_file_asset_id === source.sourceFileAssetId && (row.status !== "ready" || row.source_content_hash !== source.sourceContentHash));
  return { summary: { ...base, state: staleDerivative ? "unavailable" : "missing", href: null }, derivativeId: null, sourceFileAssetId: source.sourceFileAssetId, sourceContentHash: source.sourceContentHash };
}

async function resolveForDrawings(
  client: AsyncDatabaseClient,
  rows: Array<{ rowKey: string; drawingId: string; sourceKind: PdmWorkbenchPreviewSummary["sourceKind"] }>,
  companyId: string
) {
  const result = new Map<string, PreviewReference>();
  if (rows.length === 0) return result;
  const drawingIds = [...new Set(rows.map((row) => row.drawingId).filter(Boolean))];
  if (drawingIds.length === 0) return result;
  const drawingParams = paramsFor("drawing", drawingIds, { companyId });
  const drawings = await client.query<{ id: string; drawing_number: string | null }>(
    `SELECT id, drawing_number FROM drawings WHERE company_id = :companyId AND id IN (${inClause("drawing", drawingIds)})`,
    drawingParams
  );
  const knownIds = drawings.map((row) => row.id);
  const sourceProjection = knownIds.length === 0 ? [] : await client.query<RevisionRow & RevisionFileRow>(
    `SELECT
       dr.id,
       dr.drawing_id,
       dr.revision,
       dr.updated_at,
       drf.drawing_revision_id,
       drf.source_file_asset_id,
       drf.sort_order,
       drf.is_primary,
       fa.content_hash
     FROM drawing_revisions dr
     LEFT JOIN drawing_revision_files drf
       ON drf.company_id = dr.company_id
      AND drf.drawing_revision_id = dr.id
      AND drf.removed_at IS NULL
      AND drf.role = 'cad_3d'
     LEFT JOIN file_assets fa
       ON fa.id = drf.source_file_asset_id
      AND fa.deleted_at IS NULL
     WHERE dr.company_id = :companyId
       AND dr.drawing_id IN (${inClause("revisionDrawing", knownIds)})
       AND dr.lifecycle_state NOT IN ('cancelled', 'superseded')`,
    paramsFor("revisionDrawing", knownIds, { companyId })
  );
  const latestByDrawing = new Map<string, RevisionRow>();
  for (const drawingId of knownIds) {
    const selected = latestRevision(sourceProjection.filter((row) => row.drawing_id === drawingId));
    if (selected) latestByDrawing.set(drawingId, selected);
  }
  const revisionIds = [...latestByDrawing.values()].map((row) => row.id);
  const files = sourceProjection.filter((row) => revisionIds.includes(row.drawing_revision_id));
  const assetIds = [...new Set(files.map((row) => row.source_file_asset_id).filter((value): value is string => Boolean(value)))];
  const derivativeJobs = assetIds.length === 0 ? [] : await client.query<DerivativeJobProjectionRow>(
    `SELECT
       'derivative' AS record_kind,
       id,
       source_file_asset_id,
       source_content_hash,
       derivative_kind,
       storage_key,
       mime_type,
       generator_profile,
       status,
       created_at,
       NULL AS updated_at
     FROM file_derivatives
     WHERE company_id = :companyId
       AND source_file_asset_id IN (${inClause("derivative", assetIds)})
     UNION ALL
     SELECT
       'job' AS record_kind,
       NULL AS id,
       source_file_asset_id,
       source_content_hash,
       NULL AS derivative_kind,
       NULL AS storage_key,
       NULL AS mime_type,
       NULL AS generator_profile,
       status,
       NULL AS created_at,
       updated_at
     FROM preview_jobs
     WHERE company_id = :companyId
       AND source_file_asset_id IN (${inClause("job", assetIds)})`,
    paramsFor("job", assetIds, paramsFor("derivative", assetIds, { companyId }))
  );
  const derivatives: DerivativeRow[] = derivativeJobs
    .filter((row): row is DerivativeJobProjectionRow & { record_kind: "derivative"; id: string; derivative_kind: string; generator_profile: string; created_at: string } =>
      row.record_kind === "derivative" && Boolean(row.id && row.derivative_kind && row.generator_profile && row.created_at))
    .map((row) => ({
      id: row.id,
      source_file_asset_id: row.source_file_asset_id,
      source_content_hash: row.source_content_hash,
      derivative_kind: row.derivative_kind,
      storage_key: row.storage_key,
      mime_type: row.mime_type,
      generator_profile: row.generator_profile,
      status: row.status,
      created_at: row.created_at
    }));
  const jobs: JobRow[] = derivativeJobs
    .filter((row): row is DerivativeJobProjectionRow & { record_kind: "job"; updated_at: string } => row.record_kind === "job" && Boolean(row.updated_at))
    .map((row) => ({
      source_file_asset_id: row.source_file_asset_id,
      source_content_hash: row.source_content_hash,
      status: row.status,
      updated_at: row.updated_at
    }));
  for (const row of rows) {
    const drawing = drawings.find((item) => item.id === row.drawingId);
    const revision = latestByDrawing.get(row.drawingId);
    const file = revision ? latestPrimaryFile(files.filter((item) => item.drawing_revision_id === revision.id)) : null;
    result.set(row.rowKey, sourceSummary({
      drawingId: row.drawingId,
      drawingNumber: drawing?.drawing_number ?? null,
      revision: revision?.revision ?? null,
      sourceFileAssetId: file?.source_file_asset_id ?? null,
      sourceContentHash: file?.content_hash ?? null
    }, row.sourceKind, row.rowKey, derivatives, jobs));
  }
  return result;
}

export async function resolveDrawingWorkbenchPreviewReferences(client: AsyncDatabaseClient, rows: readonly DrawingPreviewRow[], companyId: string) {
  return resolveForDrawings(client, rows.map((row) => ({ ...row, sourceKind: "drawing_latest_3d" as const })), companyId);
}

export async function resolvePartWorkbenchPreviewReferences(client: AsyncDatabaseClient, rows: readonly PartPreviewRow[], companyId: string) {
  const result = new Map<string, PreviewReference>();
  if (rows.length === 0) return result;
  const roots = [...new Set(rows.map((row) => row.partRootId).filter((value): value is string => Boolean(value)))];
  const workspaces = [...new Set(rows.filter((row) => !row.partRootId).map((row) => row.workspaceId).filter((value): value is string => Boolean(value)))];
  const params = paramsFor("root", roots, paramsFor("workspace", workspaces, { companyId }));
  if (roots.length === 0 && workspaces.length === 0) {
    for (const row of rows) result.set(row.rowKey, sourceSummary({ drawingId: "", drawingNumber: null, revision: null, sourceFileAssetId: null, sourceContentHash: null }, "root_representative_latest_3d", row.rowKey, [], []));
    return result;
  }
  const drawings = await client.query<{ id: string; drawing_number: string | null; part_root_id: string | null; workspace_id: string | null; sequence_no: number | string | null; lifecycle_state: string | null }>(
    `SELECT id, drawing_number, part_root_id, workspace_id, sequence_no, lifecycle_state FROM drawings WHERE company_id = :companyId AND lifecycle_state NOT IN ('obsolete', 'merged', 'cancelled') AND sequence_no IS NOT NULL AND ((part_root_id IN (${roots.length ? inClause("root", roots) : "NULL"})) OR (workspace_id IN (${workspaces.length ? inClause("workspace", workspaces) : "NULL"})))`,
    params
  );
  const selectedByKey = new Map<string, RepresentativeDrawingCandidate>();
  for (const drawing of drawings) {
    const key = drawing.part_root_id ? `root:${drawing.part_root_id}` : drawing.workspace_id ? `workspace:${drawing.workspace_id}` : null;
    if (!key) continue;
    const selected = selectRepresentativeDrawing([selectedByKey.get(key), {
      id: drawing.id,
      drawingNumber: drawing.drawing_number,
      partRootId: drawing.part_root_id,
      workspaceId: drawing.workspace_id,
      sequenceNo: drawing.sequence_no,
      lifecycleState: drawing.lifecycle_state
    }].filter((item): item is RepresentativeDrawingCandidate => Boolean(item)) );
    if (selected) selectedByKey.set(key, selected);
  }
  const selectedRows = rows.map((row) => {
    const key = row.partRootId ? `root:${row.partRootId}` : row.workspaceId ? `workspace:${row.workspaceId}` : null;
    const selected = key ? selectedByKey.get(key) : null;
    return selected ? { rowKey: row.rowKey, drawingId: selected.id, sourceKind: "root_representative_latest_3d" as const } : null;
  }).filter((row): row is { rowKey: string; drawingId: string; sourceKind: "root_representative_latest_3d" } => Boolean(row));
  const resolved = await resolveForDrawings(client, selectedRows, companyId);
  for (const row of rows) {
    const found = resolved.get(row.rowKey);
    if (found) result.set(row.rowKey, found);
    else result.set(row.rowKey, sourceSummary({ drawingId: "", drawingNumber: null, revision: null, sourceFileAssetId: null, sourceContentHash: null }, "root_representative_latest_3d", row.rowKey, [], []));
  }
  return result;
}

export async function readPdmWorkbenchPreviewBytesAsync(client: AsyncDatabaseClient, reference: PreviewReference) {
  if (reference.summary.state !== "ready" || !reference.derivativeId || !reference.sourceFileAssetId || !reference.sourceContentHash) return null;
  return getPreviewDerivativeBytesForSourceAssetAsync(client, {
    derivativeId: reference.derivativeId,
    sourceFileAssetId: reference.sourceFileAssetId,
    sourceContentHash: reference.sourceContentHash
  });
}

export type { PreviewReference };
