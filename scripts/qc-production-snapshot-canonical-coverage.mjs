import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

function option(name) {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const sourceInput = option("--source") || process.env.PDM_PRODUCTION_SNAPSHOT;
const targetInput = option("--target") || process.env.PDM_CANONICAL_TARGET || "data/ai-pdm.sqlite";
if (!sourceInput) throw new Error("PRODUCTION_SNAPSHOT_SOURCE_REQUIRED: pass --source=<snapshot.sqlite> or set PDM_PRODUCTION_SNAPSHOT");
const sourcePath = path.resolve(sourceInput);
const targetPath = path.resolve(targetInput);
if (sourcePath.toLowerCase() === targetPath.toLowerCase()) throw new Error("SOURCE_TARGET_MUST_DIFFER");
const outputDir = path.resolve(option("--output-dir") || process.env.PDM_QC_OUTPUT_DIR || ".artifacts/AI_PDM/production-snapshot-local-simulation/coverage");
const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
const target = new Database(targetPath, { readonly: true, fileMustExist: true });

function sorted(values) {
  return [...new Set(values.map(String))].sort((left, right) => left.localeCompare(right));
}
function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}
function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function count(db, table) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}
function scalarRows(db, sql, column = "value") {
  return sorted(db.prepare(sql).all().map((row) => row[column]));
}

const expectedRoots = sorted([
  ...scalarRows(source, "SELECT company_id || '|' || root_code AS value FROM part_roots"),
  ...scalarRows(source, `SELECT workspace.company_id || '|' || reservation.candidate_code AS value
    FROM numbering_draft_workspaces workspace
    JOIN numbering_draft_roots draft ON draft.workspace_id = workspace.id AND draft.company_id = workspace.company_id
    JOIN number_candidate_reservations reservation ON reservation.id = draft.candidate_reservation_id
    WHERE workspace.lifecycle_status = 'active'`)
]);
const actualRoots = scalarRows(target, "SELECT company_id || '|' || root_code AS value FROM part_roots");

const expectedParts = sorted([
  ...scalarRows(source, "SELECT company_id || '|' || part_number AS value FROM part_numbers"),
  ...scalarRows(source, `SELECT workspace.company_id || '|' || reservation.candidate_code AS value
    FROM numbering_draft_workspaces workspace
    JOIN numbering_draft_parts draft ON draft.workspace_id = workspace.id AND draft.company_id = workspace.company_id
    JOIN number_candidate_reservations reservation ON reservation.id = draft.candidate_reservation_id
    WHERE workspace.lifecycle_status = 'active'`)
]);
const actualParts = scalarRows(target, "SELECT company_id || '|' || part_number AS value FROM part_numbers");

const expectedDrawingNumbers = sorted([
  ...scalarRows(source, "SELECT company_id || '|' || drawing_number AS value FROM drawing_numbers"),
  ...scalarRows(source, `SELECT workspace.company_id || '|' || reservation.candidate_code AS value
    FROM numbering_draft_workspaces workspace
    JOIN numbering_draft_drawings draft ON draft.workspace_id = workspace.id AND draft.company_id = workspace.company_id
    JOIN number_candidate_reservations reservation ON reservation.id = draft.candidate_reservation_id
    WHERE workspace.lifecycle_status = 'active'`)
]);
const actualDrawingNumbers = scalarRows(target, "SELECT company_id || '|' || drawing_number AS value FROM drawing_numbers");

const expectedLinks = sorted([
  ...scalarRows(source, `SELECT root.company_id || '|' || drawing.drawing_number || '|' || part.part_number || '|' || link.link_type AS value
    FROM drawing_part_links link
    JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id
    JOIN part_numbers part ON part.id = link.part_number_id
    JOIN part_roots root ON root.id = part.part_root_id`),
  ...scalarRows(source, `SELECT workspace.company_id || '|' || drawing_reservation.candidate_code || '|' || part_reservation.candidate_code || '|' || relation.link_type AS value
    FROM numbering_draft_workspaces workspace
    JOIN numbering_draft_relations relation ON relation.workspace_id = workspace.id AND relation.company_id = workspace.company_id
    JOIN numbering_draft_drawings drawing_draft ON drawing_draft.id = relation.drawing_draft_id
    JOIN number_candidate_reservations drawing_reservation ON drawing_reservation.id = drawing_draft.candidate_reservation_id
    JOIN numbering_draft_parts part_draft ON part_draft.id = relation.part_draft_id
    JOIN number_candidate_reservations part_reservation ON part_reservation.id = part_draft.candidate_reservation_id
    WHERE workspace.lifecycle_status = 'active'`)
]);
const actualLinks = scalarRows(target, `SELECT root.company_id || '|' || drawing.drawing_number || '|' || part.part_number || '|' || link.link_type AS value
  FROM drawing_part_links link
  JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id
  JOIN part_numbers part ON part.id = link.part_number_id
  JOIN part_roots root ON root.id = part.part_root_id`);

const expectedPartLayers = sorted([
  ...scalarRows(source, "SELECT company_id || '|' || part_number || '|part_formal|none' AS value FROM part_numbers"),
  ...scalarRows(source, `SELECT workspace.company_id || '|' || reservation.candidate_code || '|part_work|owner' AS value
    FROM numbering_draft_workspaces workspace
    JOIN numbering_draft_parts draft ON draft.workspace_id = workspace.id AND draft.company_id = workspace.company_id
    JOIN number_candidate_reservations reservation ON reservation.id = draft.candidate_reservation_id
    WHERE workspace.lifecycle_status = 'active'`)
]);
const actualPartLayers = scalarRows(target, `SELECT part.company_id || '|' || part.part_number || '|' || state.data_layer || '|' || state.handling AS value
  FROM canonical_workbench_states state
  JOIN part_numbers part ON part.id = state.canonical_entity_id AND part.company_id = state.company_id
  WHERE state.entity_type = 'part'`);

const expectedDrawingLayers = scalarRows(source, `SELECT company_id || '|' || drawing_number || '|0.1|drawing_rd|owner' AS value
  FROM drawings WHERE lifecycle_state NOT IN ('cancelled', 'obsolete', 'merged')`);
const actualDrawingLayers = scalarRows(target, `SELECT drawing.company_id || '|' || drawing.drawing_number || '|' || revision.revision || '|' || state.data_layer || '|' || state.handling AS value
  FROM canonical_workbench_states state
  JOIN drawings drawing ON drawing.id = state.canonical_entity_id AND drawing.company_id = state.company_id
  JOIN drawing_revisions revision ON revision.id = state.revision_id AND revision.drawing_id = drawing.id
  WHERE state.entity_type = 'drawing'`);

const expectedPartWorks = sorted(source.prepare(`SELECT workspace.company_id, reservation.candidate_code AS part_number,
    workspace.owner_id, draft.part_name, draft.item_kind, draft.custom_specification, draft.is_universal
  FROM numbering_draft_workspaces workspace
  JOIN numbering_draft_parts draft ON draft.workspace_id = workspace.id AND draft.company_id = workspace.company_id
  JOIN number_candidate_reservations reservation ON reservation.id = draft.candidate_reservation_id
  WHERE workspace.lifecycle_status = 'active' ORDER BY workspace.company_id, reservation.candidate_code`).all().map((row) => JSON.stringify({
  companyId: row.company_id,
  partNumber: row.part_number,
  ownerId: row.owner_id,
  payload: {
    partName: row.part_name,
    itemKind: row.item_kind,
    customSpecification: row.custom_specification ?? null,
    isUniversal: Boolean(row.is_universal),
    bomUsagePolicy: "undecided"
  }
})));
const actualPartWorks = sorted(target.prepare(`SELECT part.company_id, part.part_number, work.owner_user_id,
    work.proposed_payload
  FROM part_change_works work
  JOIN part_numbers part ON part.id = work.part_id AND part.company_id = work.company_id
  JOIN canonical_workbench_states state ON state.work_id = work.id AND state.company_id = work.company_id
  WHERE state.entity_type = 'part' AND state.data_layer = 'part_work' AND state.handling = 'owner'
  ORDER BY part.company_id, part.part_number`).all().map((row) => JSON.stringify({
  companyId: row.company_id,
  partNumber: row.part_number,
  ownerId: row.owner_user_id,
  payload: JSON.parse(row.proposed_payload)
})));

const expectedBindings = scalarRows(source, `SELECT workspace.company_id || '|' || drawing_reservation.candidate_code || '|' || root_reservation.candidate_code AS value
  FROM numbering_draft_workspaces workspace
  JOIN numbering_draft_drawings drawing_draft ON drawing_draft.workspace_id = workspace.id AND drawing_draft.company_id = workspace.company_id
  JOIN number_candidate_reservations drawing_reservation ON drawing_reservation.id = drawing_draft.candidate_reservation_id
  JOIN numbering_draft_roots root_draft ON root_draft.id = drawing_draft.root_draft_id
  JOIN number_candidate_reservations root_reservation ON root_reservation.id = root_draft.candidate_reservation_id
  WHERE workspace.lifecycle_status = 'active'`);
const actualBindings = scalarRows(target, `SELECT drawing.company_id || '|' || drawing.drawing_number || '|' || root.root_code AS value
  FROM drawings drawing
  JOIN drawing_numbers number ON number.id = drawing.formal_drawing_number_id
  JOIN part_roots root ON root.id = drawing.part_root_id AND root.id = number.part_root_id
  WHERE drawing.workspace_id IS NOT NULL AND drawing.lifecycle_state NOT IN ('cancelled', 'obsolete', 'merged')`);

const sourceWorkspaceLifecycle = scalarRows(source, `SELECT lifecycle_status || '|' || COALESCE(cancel_reason, '') || '|' || COUNT(*) AS value
  FROM numbering_draft_workspaces GROUP BY lifecycle_status, cancel_reason`);
const targetWorkspaceLifecycle = scalarRows(target, `SELECT lifecycle_status || '|' || COALESCE(cancel_reason, '') || '|' || COUNT(*) AS value
  FROM numbering_draft_workspaces GROUP BY lifecycle_status, cancel_reason`);

const parityTables = [
  "file_assets",
  "file_references",
  "file_derivatives",
  "drawing_revision_files",
  "numbering_candidate_revision_files",
  "bom_headers",
  "bom_lines",
  "bom_drafts",
  "approval_platform_requests",
  "approval_platform_decisions",
  "approval_requests",
  "submissions",
  "release_packages",
  "manufacturing_baselines",
  "drawing_recognition_sessions"
];
const parityCounts = Object.fromEntries(parityTables.map((table) => [table, { source: count(source, table), target: count(target, table) }]));
const expectedPartLayerBreakdown = {
  formal: Number(source.prepare("SELECT COUNT(*) AS count FROM part_numbers").get().count),
  work: Number(source.prepare(`SELECT COUNT(*) AS count
    FROM numbering_draft_workspaces workspace
    JOIN numbering_draft_parts draft ON draft.workspace_id = workspace.id AND draft.company_id = workspace.company_id
    WHERE workspace.lifecycle_status = 'active'`).get().count)
};
const actualPartLayerBreakdown = Object.fromEntries(target.prepare(`SELECT
    CASE state.data_layer WHEN 'part_formal' THEN 'formal' WHEN 'part_work' THEN 'work' ELSE state.data_layer END AS layer,
    COUNT(*) AS count
  FROM canonical_workbench_states state WHERE state.entity_type = 'part' GROUP BY state.data_layer`).all().map((row) => [row.layer, Number(row.count)]));
const expectedDrawingLayerBreakdown = [{ layer: "rd", revision: "0.1", label: "研發版 0.1", handling: "owner", count: expectedDrawingLayers.length }];
const actualDrawingLayerBreakdown = target.prepare(`SELECT
    CASE state.data_layer WHEN 'drawing_rd' THEN 'rd' WHEN 'drawing_production' THEN 'production' ELSE state.data_layer END AS layer,
    revision.revision, state.handling, COUNT(*) AS count
  FROM canonical_workbench_states state
  JOIN drawing_revisions revision ON revision.id = state.revision_id AND revision.company_id = state.company_id
  WHERE state.entity_type = 'drawing'
  GROUP BY state.data_layer, revision.revision, state.handling
  ORDER BY state.data_layer, revision.revision, state.handling`).all().map((row) => ({
    layer: row.layer,
    revision: row.revision,
    label: `${row.layer === "production" ? "量產版" : "研發版"} ${row.revision}`,
    handling: row.handling,
    count: Number(row.count)
  }));

const checks = [];
function exactSet(id, expected, actual) {
  const missing = difference(expected, actual);
  const extra = difference(actual, expected);
  checks.push({ id, status: missing.length === 0 && extra.length === 0 ? "PASS" : "FAIL", expectedCount: expected.length, actualCount: actual.length, missing, extra, expectedHash: hash(expected), actualHash: hash(actual) });
}
function booleanCheck(id, pass, detail) {
  checks.push({ id, status: pass ? "PASS" : "FAIL", ...detail });
}

exactSet("active-root-identity-coverage", expectedRoots, actualRoots);
exactSet("active-part-identity-coverage", expectedParts, actualParts);
exactSet("active-drawing-number-identity-coverage", expectedDrawingNumbers, actualDrawingNumbers);
exactSet("active-relation-link-coverage", expectedLinks, actualLinks);
exactSet("part-workbench-layer-coverage", expectedPartLayers, actualPartLayers);
exactSet("drawing-workbench-revision-coverage", expectedDrawingLayers, actualDrawingLayers);
exactSet("part-work-payload-owner-coverage", expectedPartWorks, actualPartWorks);
exactSet("drawing-master-binding-coverage", expectedBindings, actualBindings);
exactSet("legacy-lifecycle-semantic-parity", sourceWorkspaceLifecycle, targetWorkspaceLifecycle);
for (const [table, counts] of Object.entries(parityCounts)) booleanCheck(`source-parity:${table}`, counts.source === counts.target, counts);

const foreignKeys = target.prepare("PRAGMA foreign_key_check").all();
booleanCheck("target-foreign-key-check", foreignKeys.length === 0, { violations: foreignKeys });
const integrity = target.pragma("integrity_check");
booleanCheck("target-integrity-check", integrity.length === 1 && integrity[0].integrity_check === "ok", { result: integrity });
const relationCurrentRows = Number(target.prepare("SELECT COUNT(*) AS count FROM canonical_workbench_states WHERE entity_type = 'relation' OR data_layer IN ('relation_formal', 'relation_work')").get().count);
booleanCheck("relation-current-authority-retired", relationCurrentRows === 0, { actualCount: relationCurrentRows });
const duplicatePartLayers = target.prepare(`SELECT company_id, canonical_entity_id, data_layer, COUNT(*) AS count
  FROM canonical_workbench_states WHERE entity_type = 'part'
  GROUP BY company_id, canonical_entity_id, data_layer HAVING COUNT(*) > 1`).all();
booleanCheck("part-layer-uniqueness", duplicatePartLayers.length === 0, { duplicates: duplicatePartLayers });
const unresolved = Number(target.prepare("SELECT COUNT(*) AS count FROM pdm_workbench_migration_quarantine WHERE resolved_at IS NULL").get().count);
booleanCheck("migration-unresolved-zero", unresolved === 0, { actualCount: unresolved });

const summary = {
  status: checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
  generatedAt: new Date().toISOString(),
  sourcePath,
  targetPath,
  expected: {
    roots: expectedRoots.length,
    parts: expectedParts.length,
    drawingNumbers: expectedDrawingNumbers.length,
    drawingPartLinks: expectedLinks.length,
    partWorkbenchRows: expectedPartLayers.length,
    drawingWorkbenchRows: expectedDrawingLayers.length,
    partWorks: expectedPartWorks.length,
    drawingBindings: expectedBindings.length,
    partLayerBreakdown: expectedPartLayerBreakdown,
    drawingLayerBreakdown: expectedDrawingLayerBreakdown
  },
  actual: {
    roots: actualRoots.length,
    parts: actualParts.length,
    drawingNumbers: actualDrawingNumbers.length,
    drawingPartLinks: actualLinks.length,
    partWorkbenchRows: actualPartLayers.length,
    drawingWorkbenchRows: actualDrawingLayers.length,
    partWorks: actualPartWorks.length,
    drawingBindings: actualBindings.length,
    partLayerBreakdown: actualPartLayerBreakdown,
    drawingLayerBreakdown: actualDrawingLayerBreakdown
  },
  sourceBusinessFingerprint: hash({ roots: expectedRoots, parts: expectedParts, drawings: expectedDrawingNumbers, links: expectedLinks, partLayers: expectedPartLayers, drawingLayers: expectedDrawingLayers, partWorks: expectedPartWorks, bindings: expectedBindings, lifecycle: sourceWorkspaceLifecycle, parityCounts }),
  targetBusinessFingerprint: hash({ roots: actualRoots, parts: actualParts, drawings: actualDrawingNumbers, links: actualLinks, partLayers: actualPartLayers, drawingLayers: actualDrawingLayers, partWorks: actualPartWorks, bindings: actualBindings, lifecycle: targetWorkspaceLifecycle, parityCounts }),
  parityCounts,
  checks
};

fs.mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, "coverage.json");
const markdownPath = path.join(outputDir, "coverage.md");
fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
const lines = [
  "# Production snapshot → canonical coverage",
  "",
  `- Status: **${summary.status}**`,
  `- Source: \`${sourcePath}\``,
  `- Target: \`${targetPath}\``,
  "",
  "| Gate | Result | Expected | Actual |",
  "|---|---:|---:|---:|",
  ...checks.map((check) => `| ${check.id} | ${check.status} | ${check.expectedCount ?? check.source ?? "-"} | ${check.actualCount ?? check.target ?? "-"} |`),
  ""
];
fs.writeFileSync(markdownPath, `${lines.join("\n")}\n`, "utf8");
console.log(JSON.stringify({ status: summary.status, expected: summary.expected, actual: summary.actual, failed: checks.filter((check) => check.status === "FAIL").map((check) => check.id), jsonPath, markdownPath }, null, 2));
source.close();
target.close();
if (summary.status !== "PASS") process.exitCode = 1;
