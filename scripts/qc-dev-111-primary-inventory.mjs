#!/usr/bin/env node

/* Read-only inventory for DEV-111 recurrence analysis.  This script never
 * opens the primary database in write mode and writes evidence only under
 * output/qa/dev-111. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const databasePath = path.resolve(process.env.PDM_PRIMARY_SQLITE_PATH ?? path.join(root, "data", "ai-pdm.sqlite"));
const evidencePath = path.resolve(process.env.DEV111_PRIMARY_INVENTORY_PATH ?? path.join(root, "output", "qa", "dev-111", "primary-inventory-2026-09-01.json"));
fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
const fileHash = () => {
  try { return crypto.createHash("sha256").update(fs.readFileSync(databasePath)).digest("hex"); }
  catch { return null; }
};
const beforeHash = fileHash();
const db = new Database(databasePath, { readonly: true, fileMustExist: true });

try {
  db.pragma("query_only=ON");
  db.exec("BEGIN");
  const get = (sql, params = {}) => db.prepare(sql).get(params);
  const logicalHash = () => crypto.createHash("sha256").update(JSON.stringify({
    parts: db.prepare("SELECT * FROM part_numbers ORDER BY company_id,id").all(),
    partAttributes: db.prepare("SELECT * FROM part_variant_attributes ORDER BY part_number_id,id").all(),
    states: db.prepare("SELECT * FROM canonical_workbench_states ORDER BY company_id,entity_type,canonical_entity_id,data_layer,id").all(),
    aggregates: db.prepare("SELECT * FROM pdm_workbench_aggregates ORDER BY company_id,entity_type,canonical_entity_id,id").all(),
    partWorks: db.prepare("SELECT * FROM part_change_works ORDER BY company_id,part_id,id").all(),
    reviewRequests: db.prepare("SELECT * FROM pdm_work_review_requests ORDER BY company_id,canonical_entity_id,id").all(),
    drawingNumbers: db.prepare("SELECT * FROM drawing_numbers ORDER BY company_id,id").all(),
    drawings: db.prepare("SELECT * FROM drawings ORDER BY company_id,id").all(),
    drawingPartLinks: db.prepare("SELECT * FROM drawing_part_links ORDER BY id").all()
  })).digest("hex");
  const beforeLogicalHash = logicalHash();
  const partCoverage = db.prepare(`
    SELECT
      COUNT(*) AS total_parts,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM canonical_workbench_states s WHERE s.company_id = p.company_id AND s.entity_type = 'part' AND s.canonical_entity_id = p.id AND s.data_layer = 'part_formal') THEN 1 ELSE 0 END) AS formal_parts,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM canonical_workbench_states s WHERE s.company_id = p.company_id AND s.entity_type = 'part' AND s.canonical_entity_id = p.id AND s.data_layer = 'part_work') THEN 1 ELSE 0 END) AS work_parts,
      SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM canonical_workbench_states s WHERE s.company_id = p.company_id AND s.entity_type = 'part' AND s.canonical_entity_id = p.id) THEN 1 ELSE 0 END) AS no_state_parts,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM canonical_workbench_states s WHERE s.company_id = p.company_id AND s.entity_type = 'part' AND s.canonical_entity_id = p.id AND s.data_layer = 'part_work')
                 AND NOT EXISTS (SELECT 1 FROM canonical_workbench_states s WHERE s.company_id = p.company_id AND s.entity_type = 'part' AND s.canonical_entity_id = p.id AND s.data_layer = 'part_formal') THEN 1 ELSE 0 END) AS work_only_parts
    FROM part_numbers p`).get();
  const drawingCoverage = get(`
    SELECT
      COUNT(*) AS total_drawing_numbers,
      SUM(CASE WHEN EXISTS (
        SELECT 1 FROM canonical_workbench_states s
        JOIN drawings d ON d.id = s.canonical_entity_id AND d.company_id = s.company_id
        WHERE s.company_id = n.company_id AND s.entity_type = 'drawing' AND d.formal_drawing_number_id = n.id
      ) THEN 1 ELSE 0 END) AS state_backed_drawing_numbers,
      SUM(CASE WHEN NOT EXISTS (
        SELECT 1 FROM canonical_workbench_states s
        JOIN drawings d ON d.id = s.canonical_entity_id AND d.company_id = s.company_id
        WHERE s.company_id = n.company_id AND s.entity_type = 'drawing' AND d.formal_drawing_number_id = n.id
      ) THEN 1 ELSE 0 END) AS no_state_drawing_numbers
    FROM drawing_numbers n`);
  const missingAxes = get(`
    SELECT
      (SELECT COUNT(*) FROM drawing_numbers n WHERE NOT EXISTS (
        SELECT 1 FROM canonical_workbench_states s JOIN drawings d ON d.id = s.canonical_entity_id AND d.company_id = s.company_id
        WHERE s.company_id = n.company_id AND s.entity_type = 'drawing' AND d.formal_drawing_number_id = n.id
      )) AS drawing_axes_without_state,
      (SELECT COUNT(*) FROM part_numbers p WHERE NOT EXISTS (
        SELECT 1 FROM canonical_workbench_states s WHERE s.company_id = p.company_id AND s.entity_type = 'part' AND s.canonical_entity_id = p.id
      )) AS part_axes_without_state,
      (SELECT COUNT(*) FROM drawing_part_links l
        JOIN drawing_numbers n ON n.id = l.drawing_number_id
        JOIN part_numbers p ON p.id = l.part_number_id
       WHERE (NOT EXISTS (
        SELECT 1 FROM canonical_workbench_states s JOIN drawings d ON d.id = s.canonical_entity_id AND d.company_id = s.company_id
        WHERE s.company_id = n.company_id AND s.entity_type = 'drawing' AND d.formal_drawing_number_id = n.id
       ) OR NOT EXISTS (
        SELECT 1 FROM canonical_workbench_states s WHERE s.company_id = p.company_id AND s.entity_type = 'part' AND s.canonical_entity_id = p.id
       ))) AS links_with_non_navigable_axis`);
  const a0044 = get(`
    SELECT p.id, p.part_number, p.record_status,
      (SELECT COUNT(*) FROM canonical_workbench_states s WHERE s.company_id = p.company_id AND s.entity_type = 'part' AND s.canonical_entity_id = p.id AND s.data_layer = 'part_formal') AS formal_state_count,
      (SELECT COUNT(*) FROM canonical_workbench_states s WHERE s.company_id = p.company_id AND s.entity_type = 'part' AND s.canonical_entity_id = p.id AND s.data_layer = 'part_work') AS work_state_count,
      (SELECT COUNT(*) FROM drawing_part_links l WHERE l.part_number_id = p.id) AS relation_link_count
    FROM part_numbers p WHERE p.part_number = 'A0044-P01' LIMIT 1`);
  const a0044NavigationRow = get(`
    SELECT state.id AS row_id, aggregate.id AS aggregate_id, part.id AS part_id,
           part.part_number, part.part_name, state.data_layer, state.handling,
           state.row_version, state.work_id, state.branch_id, state.revision_id
      FROM canonical_workbench_states state
      JOIN pdm_workbench_aggregates aggregate
        ON aggregate.company_id = state.company_id
       AND aggregate.entity_type = state.entity_type
       AND aggregate.canonical_entity_id = state.canonical_entity_id
      JOIN part_numbers part
        ON part.company_id = state.company_id
       AND part.id = state.canonical_entity_id
     WHERE state.entity_type = 'part'
       AND state.data_layer = 'part_formal'
       AND part.part_number = 'A0044-P01'
     LIMIT 1`);
  const a0044Navigation = a0044NavigationRow ? {
    ...a0044NavigationRow,
    listVisible: true,
    detailResolvable: true,
    rowKey: `cw_${a0044NavigationRow.row_id}`,
    detailApiHref: `/api/parts/workbench/${encodeURIComponent(`cw_${a0044NavigationRow.row_id}`)}`,
    listHref: `/parts?detail=${encodeURIComponent(`part:${a0044NavigationRow.part_id}`)}`
  } : null;
  const duplicateLayers = db.prepare(`
    SELECT company_id, entity_type, canonical_entity_id, data_layer, COUNT(*) AS count
      FROM canonical_workbench_states
     WHERE data_layer IN ('part_formal', 'part_work', 'drawing_production')
     GROUP BY company_id, entity_type, canonical_entity_id, data_layer
    HAVING COUNT(*) > 1`).all();
  const orphanWorkStates = get(`
    SELECT COUNT(*) AS count FROM canonical_workbench_states s
     WHERE s.data_layer = 'part_work' AND NOT EXISTS (SELECT 1 FROM part_change_works w WHERE w.id = s.work_id AND w.company_id = s.company_id)`);
  const reviewWithoutState = get(`
    SELECT COUNT(*) AS count FROM pdm_work_review_requests r
     WHERE r.request_status = 'pending' AND NOT EXISTS (
       SELECT 1 FROM canonical_workbench_states s WHERE s.company_id = r.company_id AND (s.work_id = r.work_id OR (r.request_kind = 'drawing_rd_void' AND s.branch_id = r.branch_id))
     )`);
  const quickCheck = db.pragma("quick_check");
  const foreignKeys = db.pragma("foreign_key_check");
  const afterLogicalHash = logicalHash();
  const afterHash = fileHash();
  const report = {
    generatedAt: new Date().toISOString(),
    scope: { databasePath, mode: "readonly", productionConnection: false, primaryWrites: false, port: null },
    fileFingerprint: { before: beforeHash, after: afterHash, unchanged: beforeHash !== null && beforeHash === afterHash, informationalOnly: true },
    logicalFingerprint: { before: beforeLogicalHash, after: afterLogicalHash, unchanged: beforeLogicalHash === afterLogicalHash, readTransaction: true },
    partCoverage,
    drawingCoverage,
    missingAxes,
    a0044,
    a0044Navigation,
    duplicateLayers,
    orphanWorkStates,
    reviewWithoutState,
    quickCheck,
    foreignKeyViolations: foreignKeys,
    result: beforeLogicalHash === afterLogicalHash && quickCheck.length === 1 && quickCheck[0].quick_check === "ok" && foreignKeys.length === 0
      && duplicateLayers.length === 0 && Number(orphanWorkStates.count) === 0 && Number(reviewWithoutState.count) === 0
      && Number(partCoverage.no_state_parts) === 0 && Number(drawingCoverage.no_state_drawing_numbers) === 0
      && Number(missingAxes.links_with_non_navigable_axis) === 0 && Number(a0044?.formal_state_count ?? 0) === 1
      && Number(a0044?.work_state_count ?? -1) === 0 && Boolean(a0044Navigation?.detailResolvable) ? "PASS" : "FAIL"
  };
  fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2));
  if (report.result !== "PASS") throw new Error(`DEV111_PRIMARY_INVENTORY_${report.result}`);
  console.log(`DEV-111 primary inventory: PASS; evidence=${path.relative(root, evidencePath)}`);
} finally {
  if (db.inTransaction) db.exec("ROLLBACK");
  db.close();
}
