import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { SqliteDatabase } from "@/lib/db-provider";

/**
 * The only writer allowed to promote a part to assembly based on a native
 * SolidWorks assembly upload.  It deliberately derives the target from the
 * locked work/revision/formal relation; a client supplied part id is never
 * accepted.
 */
export type SldasmAssemblyEvidenceResult = {
  status: "promoted" | "already_assembly" | "no_target" | "blocked_relation";
  targetPartNumberId: string | null;
  drawingNumberId: string | null;
  reason?: "missing_primary_relation" | "ambiguous_primary_relation" | "cross_company_relation" | "terminal_part";
};

type EvidenceRow = {
  part_id: string;
  part_company_id: string;
  part_structure_type: string;
  part_record_status: string;
  drawing_number_id: string;
  drawing_company_id: string;
  drawing_status: string;
  link_type: string;
  drawing_is_primary: number | string | boolean;
};

const EVIDENCE_SQL = `
  SELECT p.id AS part_id,
         p.company_id AS part_company_id,
         p.structure_type AS part_structure_type,
         p.record_status AS part_record_status,
         drawing.id AS drawing_number_id,
         drawing.company_id AS drawing_company_id,
         drawing.record_status AS drawing_status,
         link.link_type,
         drawing.is_primary_manufacturing AS drawing_is_primary
    FROM drawing_revision_works work
    JOIN canonical_workbench_states state ON state.work_id = work.id
      AND state.company_id = work.company_id
      AND state.entity_type = 'drawing'
    JOIN drawing_revisions revision ON revision.id = state.revision_id
    JOIN drawings canonical_drawing ON canonical_drawing.id = revision.drawing_id
    JOIN drawing_numbers drawing ON drawing.id = canonical_drawing.formal_drawing_number_id
    JOIN drawing_revision_work_files work_file ON work_file.work_id = work.id
    JOIN drawing_revision_files file ON file.id = work_file.file_binding_id
    JOIN file_assets asset ON asset.id = file.source_file_asset_id
    JOIN drawing_part_links link ON link.drawing_number_id = drawing.id
      AND link.link_type = 'primary_manufacturing'
    JOIN part_numbers p ON p.id = link.part_number_id
   WHERE work.id = :workId
     AND work.company_id = :companyId
     AND revision.company_id = :companyId
     AND canonical_drawing.company_id = :companyId
     AND drawing.company_id = :companyId
     AND p.company_id = :companyId
     AND file.role = 'cad_3d'
     AND file.is_primary = 1
     AND file.removed_at IS NULL
     AND lower(asset.file_ext) = 'sldasm'
     AND drawing.purpose_code IN ('MA', 'M')
     AND drawing.is_primary_manufacturing = 1
     AND drawing.record_status NOT IN ('Obsolete', 'Merged')
     AND p.record_status NOT IN ('Obsolete', 'Merged')
`;

const DRAWING_EVIDENCE_SQL = `
  SELECT p.id AS part_id, p.company_id AS part_company_id, p.structure_type AS part_structure_type,
         p.record_status AS part_record_status, drawing.id AS drawing_number_id,
         drawing.company_id AS drawing_company_id, drawing.record_status AS drawing_status,
         link.link_type, drawing.is_primary_manufacturing AS drawing_is_primary
    FROM drawing_numbers drawing
    JOIN drawings canonical_drawing ON canonical_drawing.formal_drawing_number_id = drawing.id
      AND canonical_drawing.company_id = drawing.company_id
    JOIN canonical_workbench_states state ON state.canonical_entity_id = canonical_drawing.id
      AND state.company_id = canonical_drawing.company_id AND state.entity_type = 'drawing'
      AND state.revision_id IS NOT NULL
    JOIN drawing_revisions revision ON revision.id = state.revision_id
      AND revision.company_id = state.company_id
    JOIN drawing_revision_files file ON file.drawing_revision_id = revision.id
      AND file.company_id = revision.company_id AND file.role = 'cad_3d'
      AND file.is_primary = 1 AND file.removed_at IS NULL
    JOIN file_assets asset ON asset.id = file.source_file_asset_id AND asset.deleted_at IS NULL
    JOIN drawing_part_links link ON link.drawing_number_id = drawing.id
      AND link.link_type = 'primary_manufacturing'
    JOIN part_numbers p ON p.id = link.part_number_id
   WHERE drawing.id = :drawingNumberId AND drawing.company_id = :companyId
     AND drawing.is_primary_manufacturing = 1 AND drawing.record_status NOT IN ('Obsolete', 'Merged')
     AND lower(asset.file_ext) = 'sldasm'
`;

function uniqueRows(rows: EvidenceRow[]) {
  const byPart = new Map<string, EvidenceRow>();
  for (const row of rows) {
    if (row.part_company_id !== row.drawing_company_id) return { crossCompany: true, rows: [] as EvidenceRow[] };
    byPart.set(row.part_id, row);
  }
  return { crossCompany: false, rows: [...byPart.values()] };
}

function resultFromRows(rows: EvidenceRow[], crossCompany: boolean): SldasmAssemblyEvidenceResult {
  if (crossCompany) return { status: "blocked_relation", targetPartNumberId: null, drawingNumberId: null, reason: "cross_company_relation" };
  if (rows.length === 0) return { status: "no_target", targetPartNumberId: null, drawingNumberId: null, reason: "missing_primary_relation" };
  if (rows.length !== 1) return { status: "blocked_relation", targetPartNumberId: null, drawingNumberId: null, reason: "ambiguous_primary_relation" };
  const row = rows[0];
  if (["Obsolete", "Merged"].includes(row.part_record_status)) {
    return { status: "blocked_relation", targetPartNumberId: null, drawingNumberId: row.drawing_number_id, reason: "terminal_part" };
  }
  return {
    status: row.part_structure_type === "assembly" ? "already_assembly" : "promoted",
    targetPartNumberId: row.part_id,
    drawingNumberId: row.drawing_number_id
  };
}

export async function reconcileSldasmAssemblyEvidence(
  client: Pick<AsyncDatabaseClient, "kind" | "query" | "queryOne" | "execute">,
  input: { companyId: string; workId: string; actorId: string | null }
): Promise<SldasmAssemblyEvidenceResult> {
  const rows = await client.query<EvidenceRow>(EVIDENCE_SQL + (client.kind === "postgres" ? " FOR UPDATE" : ""), input);
  const selection = uniqueRows(rows);
  const result = resultFromRows(selection.rows, selection.crossCompany);
  if (result.status !== "promoted" || !result.targetPartNumberId) return result;
  await client.execute(
    `UPDATE part_numbers SET structure_type = 'assembly', updated_at = CURRENT_TIMESTAMP
      WHERE id = :partId AND company_id = :companyId AND structure_type <> 'assembly'`,
    { companyId: input.companyId, partId: result.targetPartNumberId }
  );
  await client.execute(
    `INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
      VALUES (:id, NULL, :actorId, 'pdm.sldasm.assembly_promoted', :detail, CURRENT_TIMESTAMP)`,
    {
      id: crypto.randomUUID(),
      actorId: input.actorId,
      detail: JSON.stringify({ companyId: input.companyId, workId: input.workId, targetPartNumberId: result.targetPartNumberId, drawingNumberId: result.drawingNumberId, evidence: "formal_primary_sldasm" })
    }
  );
  return result;
}

export async function reconcileSldasmAssemblyEvidenceForDrawing(
  client: Pick<AsyncDatabaseClient, "kind" | "query" | "queryOne" | "execute">,
  input: { companyId: string; drawingNumberId: string; actorId: string | null }
): Promise<SldasmAssemblyEvidenceResult> {
  const rows = await client.query<EvidenceRow>(DRAWING_EVIDENCE_SQL + (client.kind === "postgres" ? " FOR UPDATE" : ""), input);
  const selection = uniqueRows(rows);
  const result = resultFromRows(selection.rows, selection.crossCompany);
  if (result.status !== "promoted" || !result.targetPartNumberId) return result;
  await client.execute(`UPDATE part_numbers SET structure_type = 'assembly', updated_at = CURRENT_TIMESTAMP WHERE id = :partId AND company_id = :companyId AND structure_type <> 'assembly'`, { companyId: input.companyId, partId: result.targetPartNumberId });
  await client.execute(`INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at) VALUES (:id, NULL, :actorId, 'pdm.sldasm.assembly_promoted', :detail, CURRENT_TIMESTAMP)`, {
    id: crypto.randomUUID(), actorId: input.actorId,
    detail: JSON.stringify({ companyId: input.companyId, drawingNumberId: input.drawingNumberId, targetPartNumberId: result.targetPartNumberId, evidence: "formal_primary_sldasm" })
  });
  return result;
}

/** SQLite synchronous adapter used by legacy numbering writers and QC. */
export function reconcileSldasmAssemblyEvidenceSync(
  database: SqliteDatabase,
  input: { companyId: string; workId: string; actorId: string | null }
): SldasmAssemblyEvidenceResult {
  const rows = database.prepare(EVIDENCE_SQL.replace(/:([A-Za-z0-9_]+)/gu, "@$1")).all(input) as EvidenceRow[];
  const selection = uniqueRows(rows);
  const result = resultFromRows(selection.rows, selection.crossCompany);
  if (result.status !== "promoted" || !result.targetPartNumberId) return result;
  database.prepare(`UPDATE part_numbers SET structure_type = 'assembly', updated_at = CURRENT_TIMESTAMP WHERE id = @partId AND company_id = @companyId AND structure_type <> 'assembly'`).run({ companyId: input.companyId, partId: result.targetPartNumberId });
  database.prepare(`INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at) VALUES (@id, NULL, @actorId, 'pdm.sldasm.assembly_promoted', @detail, CURRENT_TIMESTAMP)`).run({ id: crypto.randomUUID(), actorId: input.actorId, detail: JSON.stringify({ companyId: input.companyId, workId: input.workId, targetPartNumberId: result.targetPartNumberId, drawingNumberId: result.drawingNumberId, evidence: "formal_primary_sldasm" }) });
  return result;
}

export function reconcileSldasmAssemblyEvidenceForDrawingSync(
  database: SqliteDatabase,
  input: { companyId: string; drawingNumberId: string; actorId: string | null }
): SldasmAssemblyEvidenceResult {
  const rows = database.prepare(DRAWING_EVIDENCE_SQL.replace(/:([A-Za-z0-9_]+)/gu, "@$1")).all(input) as EvidenceRow[];
  const selection = uniqueRows(rows);
  const result = resultFromRows(selection.rows, selection.crossCompany);
  if (result.status !== "promoted" || !result.targetPartNumberId) return result;
  database.prepare(`UPDATE part_numbers SET structure_type = 'assembly', updated_at = CURRENT_TIMESTAMP WHERE id = @partId AND company_id = @companyId AND structure_type <> 'assembly'`).run({ companyId: input.companyId, partId: result.targetPartNumberId });
  database.prepare(`INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at) VALUES (@id, NULL, @actorId, 'pdm.sldasm.assembly_promoted', @detail, CURRENT_TIMESTAMP)`).run({ id: crypto.randomUUID(), actorId: input.actorId, detail: JSON.stringify({ companyId: input.companyId, drawingNumberId: input.drawingNumberId, targetPartNumberId: result.targetPartNumberId, evidence: "formal_primary_sldasm" }) });
  return result;
}
