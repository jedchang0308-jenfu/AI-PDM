import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const switchCanonical = args.has("--switch-canonical-only");
const discardUnapprovedPartOnlyDrafts = args.has("--discard-unapproved-part-only-drafts");
const confirmedDisposable = args.has("--confirm-disposable-dev-087") || process.env.PDM_DEV087_MIGRATION_AUTHORIZED === "1";
if (apply && !confirmedDisposable) throw new Error("DEV087_APPLY_REQUIRES_DISPOSABLE_OR_AUTHORIZED_CONFIRMATION");
if (switchCanonical && !apply) throw new Error("DEV087_CANONICAL_SWITCH_REQUIRES_APPLY");

function option(name) {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const dataDir = path.resolve(process.env.PDM_DATA_DIR?.trim() || "data");
const dbPath = path.resolve(option("--db") || path.join(dataDir, "ai-pdm.sqlite"));
const expectedCommit = option("--expected-commit") || process.env.PDM_BUILD_COMMIT?.trim() || "local-dev";
const schemaHash = "dev087-v1";

function stableId(namespace, ...values) {
  const hex = crypto.createHash("sha256").update([namespace, ...values].join("\u001f")).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function stableHash(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}
function parseRevision(value) {
  const text = String(value ?? "").trim();
  const match = /^(0|[1-9]\d*)(?:\.([1-9]\d*))?$/u.exec(text);
  if (!match) return null;
  return { major: Number(match[1]), minor: match[2] ? Number(match[2]) : 0, label: match[2] ? `${Number(match[1])}.${Number(match[2])}` : String(Number(match[1])) };
}
function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}
function columnExists(db, table, name) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === name);
}
function canonicalSchemaSql() {
  const schema = fs.readFileSync(path.resolve("db/schema.sql"), "utf8");
  const marker = "-- BEGIN DEV-087 canonical workbench state authority.";
  const endMarker = "-- END DEV-087 canonical workbench state authority.";
  const start = schema.indexOf(marker);
  const end = schema.indexOf(endMarker);
  if (start < 0 || end < start) throw new Error("DEV087_SCHEMA_MARKER_MISSING");
  return schema.slice(start, end + endMarker.length);
}

const db = new Database(dbPath, apply ? undefined : { readonly: true, fileMustExist: true });
db.pragma("foreign_keys=ON");

const plan = {
  version: 1,
  devId: "DEV-087",
  provider: "sqlite",
  dbPath,
  mode: apply ? "apply" : "dry-run",
  expectedCommit,
  schemaHash,
  source: { drawings: 0, revisions: 0, parts: 0, roots: 0, activeWorkspaces: 0, cancelledWorkspaces: 0 },
  target: { aggregates: 0, states: 0, branches: 0, claims: 0, drawingWorks: 0, partWorks: 0, relationWorks: 0, reviewTraces: 0 },
  cleanup: { discardUnapprovedPartOnlyDrafts, legacyCancelled: 0, unapprovedPartOnlyDrafts: 0 },
  quarantine: [],
  operations: [],
  identityHash: "",
  unresolved: 0
};

const drawings = db.prepare("SELECT id, company_id, COALESCE(drawing_number, '') AS code, part_root_id, owner_id, created_by, workspace_id FROM drawings WHERE lifecycle_state NOT IN ('cancelled', 'obsolete', 'merged') ORDER BY company_id, id").all();
const revisions = db.prepare("SELECT id, company_id, drawing_id, revision, lifecycle_state, row_version, approval_request_id, created_by, updated_by, created_at, updated_at, controlled_at, released_at FROM drawing_revisions ORDER BY company_id, drawing_id, updated_at, id").all();
const parts = db.prepare("SELECT id, company_id, part_number, part_name FROM part_numbers ORDER BY company_id, id").all();
const roots = db.prepare("SELECT id, company_id, root_code, core_name FROM part_roots ORDER BY company_id, id").all();
const activeWorkspaces = tableExists(db, "numbering_draft_workspaces")
  ? db.prepare("SELECT id, company_id, owner_id, lifecycle_status, draft_mode, source_drawing_number_id, source_part_number_id, source_root_id FROM numbering_draft_workspaces WHERE lifecycle_status NOT IN ('published', 'cancelled', 'merged', 'obsolete') ORDER BY company_id, id").all()
  : [];
const cancelledWorkspaces = tableExists(db, "numbering_draft_workspaces")
  ? db.prepare("SELECT id, company_id FROM numbering_draft_workspaces WHERE lifecycle_status = 'cancelled' ORDER BY company_id, id").all()
  : [];
plan.source = { drawings: drawings.length, revisions: revisions.length, parts: parts.length, roots: roots.length, activeWorkspaces: activeWorkspaces.length, cancelledWorkspaces: cancelledWorkspaces.length };

const revisionsByDrawing = new Map();
for (const revision of revisions) revisionsByDrawing.set(revision.drawing_id, [...(revisionsByDrawing.get(revision.drawing_id) ?? []), revision]);
const drawingByFormalId = new Map();
if (columnExists(db, "drawings", "formal_drawing_number_id")) {
  for (const row of db.prepare("SELECT id, formal_drawing_number_id FROM drawings WHERE formal_drawing_number_id IS NOT NULL").all()) drawingByFormalId.set(row.formal_drawing_number_id, row.id);
}

const approvalRequests = tableExists(db, "approval_platform_requests")
  ? db.prepare("SELECT id, company_id, request_status, apply_status, resolved_at FROM approval_platform_requests ORDER BY id").all()
  : [];
const approvalDecisions = tableExists(db, "approval_platform_decisions")
  ? db.prepare("SELECT id, request_id, decision, decided_at FROM approval_platform_decisions ORDER BY decided_at, id").all()
  : [];
const decisionsByRequest = new Map();
for (const decision of approvalDecisions) decisionsByRequest.set(decision.request_id, [...(decisionsByRequest.get(decision.request_id) ?? []), decision]);
const terminalApprovedRequests = new Map();
for (const request of approvalRequests) {
  const decisions = decisionsByRequest.get(request.id) ?? [];
  const approved = decisions.filter((decision) => decision.decision === "approved");
  const conflicting = decisions.filter((decision) => decision.decision !== "approved");
  if (["approved", "applied"].includes(request.request_status) && request.apply_status === "applied" && request.resolved_at && approved.length > 0 && conflicting.length === 0) {
    terminalApprovedRequests.set(request.id, { ...request, decisions });
  }
}

const operations = [];
const convertedDrawingWorkspaces = new Set();
function add(table, row) { operations.push({ table, row }); }
function quarantine(sourceKind, sourceIdentity, companyId, reasonCode, evidence) {
  plan.quarantine.push({ sourceKind, sourceIdentity, companyId, reasonCode, evidence });
}

function countWhere(table, column, value) {
  if (!tableExists(db, table)) return 0;
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).get(value).count);
}

function legacyWorkspaceEvidence(workspace) {
  const rootRows = countWhere("numbering_draft_roots", "workspace_id", workspace.id);
  const partRows = countWhere("numbering_draft_parts", "workspace_id", workspace.id);
  const drawingRows = countWhere("numbering_draft_drawings", "workspace_id", workspace.id);
  const formalDrawingRows = countWhere("drawings", "workspace_id", workspace.id);
  const relationRows = countWhere("numbering_draft_relations", "workspace_id", workspace.id);
  const reservationRows = countWhere("number_candidate_reservations", "workspace_id", workspace.id);
  const eventRows = countWhere("number_candidate_events", "workspace_id", workspace.id);
  const revisionDraftRows = countWhere("numbering_candidate_revision_drafts", "workspace_id", workspace.id);
  const publicationEvidenceRows = countWhere("numbering_publication_evidence", "workspace_id", workspace.id);
  const transferRows = countWhere("transfer_package_draft_items", "workspace_id", workspace.id);
  const approvalReservationRows = tableExists(db, "number_candidate_reservations")
    ? Number(db.prepare("SELECT COUNT(*) AS count FROM number_candidate_reservations WHERE workspace_id = ? AND (approval_request_id IS NOT NULL OR reservation_state NOT IN ('active', 'recycled'))").get(workspace.id).count)
    : 0;
  const childIds = [workspace.id];
  for (const table of ["numbering_draft_roots", "numbering_draft_parts", "numbering_draft_drawings", "drawings"]) {
    if (tableExists(db, table)) childIds.push(...db.prepare(`SELECT id FROM ${table} WHERE workspace_id = ?`).all(workspace.id).map((row) => row.id));
  }
  const approvalTargetRows = tableExists(db, "approval_platform_targets") && childIds.length > 0
    ? Number(db.prepare(`SELECT COUNT(*) AS count FROM approval_platform_targets WHERE target_id IN (${childIds.map(() => "?").join(",")})`).get(...childIds).count)
    : 0;
  const legacyApprovalLinkRows = tableExists(db, "approval_platform_legacy_links") && childIds.length > 0
    ? Number(db.prepare(`SELECT COUNT(*) AS count FROM approval_platform_legacy_links WHERE legacy_id IN (${childIds.map(() => "?").join(",")})`).get(...childIds).count)
    : 0;
  const linkedAssetRows = tableExists(db, "file_assets") && childIds.length > 0
    ? Number(db.prepare(`SELECT COUNT(*) AS count FROM file_assets WHERE linked_entity_id IN (${childIds.map(() => "?").join(",")})`).get(...childIds).count)
    : 0;
  const drawingRevisionRows = tableExists(db, "drawing_revisions")
    ? Number(db.prepare("SELECT COUNT(*) AS count FROM drawing_revisions revision JOIN drawings drawing ON drawing.id = revision.drawing_id WHERE drawing.workspace_id = ?").get(workspace.id).count)
    : 0;
  const recognitionRows = tableExists(db, "drawing_recognition_sessions")
    ? Number(db.prepare("SELECT COUNT(*) AS count FROM drawing_recognition_sessions session JOIN drawings drawing ON drawing.id = session.drawing_id WHERE drawing.workspace_id = ?").get(workspace.id).count)
    : 0;
  const controlledNoteRows = tableExists(db, "pdm_controlled_notes")
    ? Number(db.prepare("SELECT COUNT(*) AS count FROM pdm_controlled_notes note JOIN drawings drawing ON drawing.id = note.drawing_id WHERE drawing.workspace_id = ?").get(workspace.id).count)
    : 0;
  const engineeringEvidenceRows = tableExists(db, "pdm_engineering_evidence")
    ? Number(db.prepare("SELECT COUNT(*) AS count FROM pdm_engineering_evidence evidence JOIN drawings drawing ON drawing.id = evidence.drawing_id WHERE drawing.workspace_id = ?").get(workspace.id).count)
    : 0;
  const candidateFileRows = tableExists(db, "numbering_candidate_revision_files")
    ? Number(db.prepare("SELECT COUNT(*) AS count FROM numbering_candidate_revision_files file JOIN numbering_candidate_revision_drafts revision ON revision.id = file.candidate_revision_id WHERE revision.workspace_id = ?").get(workspace.id).count)
    : 0;
  return {
    lifecycleStatus: workspace.lifecycle_status,
    draftMode: workspace.draft_mode,
    rootRows, partRows, drawingRows, formalDrawingRows, relationRows, reservationRows, eventRows,
    revisionDraftRows, publicationEvidenceRows, transferRows, approvalReservationRows, approvalTargetRows, legacyApprovalLinkRows,
    linkedAssetRows, drawingRevisionRows, recognitionRows, controlledNoteRows, engineeringEvidenceRows, candidateFileRows
  };
}

function isDisposableUnapprovedPartOnly(workspace, evidence) {
  return workspace.lifecycle_status === "active"
    && workspace.draft_mode === "new_bundle"
    && !workspace.source_root_id && !workspace.source_drawing_number_id && !workspace.source_part_number_id
    && evidence.rootRows === 1 && evidence.partRows === 1
    && evidence.drawingRows === 0 && evidence.formalDrawingRows === 0 && evidence.relationRows === 0
    && evidence.reservationRows === 2 && evidence.eventRows >= 2
    && evidence.revisionDraftRows === 0 && evidence.publicationEvidenceRows === 0 && evidence.transferRows === 0
    && evidence.approvalReservationRows === 0 && evidence.approvalTargetRows === 0 && evidence.legacyApprovalLinkRows === 0
    && evidence.linkedAssetRows === 0 && evidence.drawingRevisionRows === 0 && evidence.recognitionRows === 0
    && evidence.controlledNoteRows === 0 && evidence.engineeringEvidenceRows === 0 && evidence.candidateFileRows === 0;
}

for (const drawing of drawings) {
  const aggregateId = stableId("dev087-aggregate", drawing.company_id, "drawing", drawing.id);
  const all = revisionsByDrawing.get(drawing.id) ?? [];
  const parsed = all.map((row) => ({ row, tuple: parseRevision(row.revision) }));
  parsed.filter((entry) => !entry.tuple).forEach((entry) => quarantine("drawing_revision", entry.row.id, entry.row.company_id, "invalid_revision_label", { revision: entry.row.revision }));
  const productionCandidates = parsed.filter((entry) => entry.tuple?.minor === 0 && entry.row.lifecycle_state === "released")
    .sort((left, right) => right.tuple.major - left.tuple.major || String(right.row.updated_at).localeCompare(String(left.row.updated_at)));
  const production = productionCandidates[0] ?? null;
  // The legacy authority had one RD lineage and no branch identity. Historical
  // controlled minors must therefore not be reinterpreted as parallel branches.
  // Keep only the latest eligible RD revision as the current legacy lineage;
  // every older approved revision remains available through drawing history.
  const currentRd = parsed
    .filter((entry) => entry.tuple && entry.tuple.minor > 0 && ["rd_controlled", "preparing", "correction_required", "in_review"].includes(entry.row.lifecycle_state))
    .filter((entry) => !production || entry.tuple.major >= production.tuple.major)
    .sort((left, right) =>
      right.tuple.major - left.tuple.major
      || right.tuple.minor - left.tuple.minor
      || String(right.row.updated_at).localeCompare(String(left.row.updated_at))
      || String(right.row.id).localeCompare(String(left.row.id))
    );
  const latestLegacyRd = currentRd[0] ?? null;
  const terminalApproved = latestLegacyRd?.row.approval_request_id
    ? terminalApprovedRequests.get(latestLegacyRd.row.approval_request_id)
    : null;
  if (latestLegacyRd?.row.lifecycle_state === "in_review" && !terminalApproved) {
    quarantine("drawing_revision", latestLegacyRd.row.id, latestLegacyRd.row.company_id, "active_review_requires_exact_reviewer_mapping", {
      lifecycleState: latestLegacyRd.row.lifecycle_state,
      approvalRequestId: latestLegacyRd.row.approval_request_id
    });
  }
  const branches = latestLegacyRd && (latestLegacyRd.row.lifecycle_state !== "in_review" || terminalApproved) ? [latestLegacyRd] : [];
  if (drawing.workspace_id && (production || branches.length > 0)) convertedDrawingWorkspaces.add(drawing.workspace_id);
  add("pdm_workbench_aggregates", { id: aggregateId, company_id: drawing.company_id, entity_type: "drawing", canonical_entity_id: drawing.id, open_branch_count: branches.length, row_version: 1 });
  if (production) {
    add("canonical_workbench_states", {
      id: stableId("dev087-state", drawing.company_id, "drawing_production", drawing.id), company_id: drawing.company_id,
      entity_type: "drawing", canonical_entity_id: drawing.id, data_layer: "drawing_production", branch_id: null,
      revision_id: production.row.id, work_id: null, handling: "none", blocker_reason: null, row_version: Number(production.row.row_version || 1)
    });
  }
  for (const entry of branches) {
    const branchId = stableId("dev087-branch", drawing.company_id, drawing.id, entry.row.id);
    const claimId = stableId("dev087-claim", drawing.company_id, drawing.id, entry.tuple.major, entry.tuple.minor);
    const approvedRequest = entry.row.approval_request_id ? terminalApprovedRequests.get(entry.row.approval_request_id) : null;
    const approved = entry.row.lifecycle_state === "rd_controlled" || Boolean(approvedRequest);
    const workId = approved ? null : stableId("dev087-drawing-work", drawing.company_id, branchId);
    const ownerId = entry.row.updated_by || entry.row.created_by || drawing.owner_id || drawing.created_by;
    if (!approved && !ownerId) {
      quarantine("drawing_revision", entry.row.id, entry.row.company_id, "active_work_owner_missing", {});
      continue;
    }
    const predecessor = production && production.tuple.major === entry.tuple.major ? production.row.id : null;
    add("drawing_rd_branches", {
      id: branchId, company_id: drawing.company_id, drawing_id: drawing.id,
      base_production_revision_id: production?.row.id ?? null, latest_approved_revision_id: approved ? entry.row.id : null,
      status: "open", closed_reason: null, closed_at: null, row_version: 1
    });
    add("drawing_revision_claims", {
      id: claimId, company_id: drawing.company_id, drawing_id: drawing.id, branch_id: branchId,
      target_major: entry.tuple.major, target_minor: entry.tuple.minor, target_label: entry.tuple.label,
      predecessor_revision_id: predecessor, claim_state: approved ? "approved" : "work"
    });
    if (workId) add("drawing_revision_works", {
      id: workId, company_id: drawing.company_id, drawing_id: drawing.id, branch_id: branchId, target_claim_id: claimId,
      owner_user_id: ownerId, proposed_payload: JSON.stringify({ drawingId: drawing.id, revisionId: entry.row.id, migrated: true }),
      base_hash: stableHash({ predecessor, revisionId: entry.row.id }), row_version: Number(entry.row.row_version || 1)
    });
    add("canonical_workbench_states", {
      id: stableId("dev087-state", drawing.company_id, "drawing_rd", branchId), company_id: drawing.company_id,
      entity_type: "drawing", canonical_entity_id: drawing.id, data_layer: "drawing_rd", branch_id: branchId,
      revision_id: entry.row.id, work_id: workId, handling: approved ? "none" : "owner", blocker_reason: null,
      row_version: Number(entry.row.row_version || 1)
    });
  }

  for (const entry of parsed.filter((candidate) => candidate.tuple)) {
    const approvedRequest = entry.row.approval_request_id ? terminalApprovedRequests.get(entry.row.approval_request_id) : null;
    const isApprovedLegacyRevision = ["rd_controlled", "released", "superseded"].includes(entry.row.lifecycle_state) || Boolean(approvedRequest);
    if (!isApprovedLegacyRevision) continue;
    const decisionTimes = approvedRequest?.decisions.length
      ? approvedRequest.decisions.map((decision) => ({ identity: decision.id, decidedAt: decision.decided_at }))
      : entry.row.controlled_at
        ? [{ identity: entry.row.id, decidedAt: entry.row.controlled_at }]
        : [];
    for (const decision of decisionTimes) add("pdm_review_traces", {
      review_cycle_id: stableId("dev087-review-cycle", drawing.company_id, entry.row.id, decision.identity),
      company_id: drawing.company_id,
      entity_type: "drawing",
      canonical_entity_id: drawing.id,
      decision_at: decision.decidedAt
    });
  }
}

for (const part of parts) {
  add("pdm_workbench_aggregates", { id: stableId("dev087-aggregate", part.company_id, "part", part.id), company_id: part.company_id, entity_type: "part", canonical_entity_id: part.id, open_branch_count: 0, row_version: 1 });
  add("canonical_workbench_states", { id: stableId("dev087-state", part.company_id, "part_formal", part.id), company_id: part.company_id, entity_type: "part", canonical_entity_id: part.id, data_layer: "part_formal", branch_id: null, revision_id: null, work_id: null, handling: "none", blocker_reason: null, row_version: Number(part.row_version || 1) });
}
for (const root of roots) {
  add("pdm_workbench_aggregates", { id: stableId("dev087-aggregate", root.company_id, "relation", root.id), company_id: root.company_id, entity_type: "relation", canonical_entity_id: root.id, open_branch_count: 0, row_version: 1 });
  add("canonical_workbench_states", { id: stableId("dev087-state", root.company_id, "relation_formal", root.id), company_id: root.company_id, entity_type: "relation", canonical_entity_id: root.id, data_layer: "relation_formal", branch_id: null, revision_id: null, work_id: null, handling: "none", blocker_reason: null, row_version: 1 });
}

for (const workspace of activeWorkspaces) {
  if (convertedDrawingWorkspaces.has(workspace.id)) continue;
  const evidence = legacyWorkspaceEvidence(workspace);
  if (discardUnapprovedPartOnlyDrafts && isDisposableUnapprovedPartOnly(workspace, evidence)) {
    plan.operations.push({ kind: "delete_legacy_workspace_graph", table: "numbering_draft_workspaces", sourceIdentity: workspace.id, companyId: workspace.company_id, expectedLifecycle: "active", evidence });
    plan.cleanup.unapprovedPartOnlyDrafts += 1;
  } else {
    quarantine("numbering_draft_workspace", workspace.id, workspace.company_id, isDisposableUnapprovedPartOnly(workspace, evidence) ? "explicit_unapproved_draft_disposal_required" : "legacy_workspace_not_uniquely_mappable", {
      ...evidence,
      sourceDrawingNumberId: workspace.source_drawing_number_id,
      sourcePartNumberId: workspace.source_part_number_id,
      sourceRootId: workspace.source_root_id
    });
  }
}

for (const workspace of cancelledWorkspaces) {
  const source = db.prepare("SELECT id, company_id, owner_id, lifecycle_status, draft_mode, source_root_id, source_drawing_number_id, source_part_number_id FROM numbering_draft_workspaces WHERE id = ?").get(workspace.id);
  const evidence = legacyWorkspaceEvidence(source);
  const safeCancelled = evidence.revisionDraftRows === 0 && evidence.publicationEvidenceRows === 0 && evidence.transferRows === 0
    && evidence.approvalReservationRows === 0 && evidence.approvalTargetRows === 0 && evidence.legacyApprovalLinkRows === 0
    && evidence.linkedAssetRows === 0 && evidence.drawingRevisionRows === 0 && evidence.recognitionRows === 0
    && evidence.controlledNoteRows === 0 && evidence.engineeringEvidenceRows === 0 && evidence.candidateFileRows === 0;
  if (safeCancelled) {
    plan.operations.push({ kind: "delete_legacy_workspace_graph", table: "numbering_draft_workspaces", sourceIdentity: workspace.id, companyId: workspace.company_id, expectedLifecycle: "cancelled", evidence });
    plan.cleanup.legacyCancelled += 1;
  } else {
    quarantine("numbering_draft_workspace", workspace.id, workspace.company_id, "legacy_cancelled_cleanup_not_safe", evidence);
  }
}

for (const item of plan.quarantine) add("pdm_workbench_migration_quarantine", {
  id: stableId("dev087-quarantine", item.sourceKind, item.sourceIdentity), company_id: item.companyId,
  source_kind: item.sourceKind, source_identity: item.sourceIdentity, reason_code: item.reasonCode,
  evidence_payload: JSON.stringify(item.evidence), resolution: null, resolved_at: null
});

plan.target = {
  aggregates: operations.filter((entry) => entry.table === "pdm_workbench_aggregates").length,
  states: operations.filter((entry) => entry.table === "canonical_workbench_states").length,
  branches: operations.filter((entry) => entry.table === "drawing_rd_branches").length,
  claims: operations.filter((entry) => entry.table === "drawing_revision_claims").length,
  drawingWorks: operations.filter((entry) => entry.table === "drawing_revision_works").length,
  partWorks: operations.filter((entry) => entry.table === "part_change_works").length,
  relationWorks: operations.filter((entry) => entry.table === "relation_change_works").length,
  reviewTraces: operations.filter((entry) => entry.table === "pdm_review_traces").length
};
plan.unresolved = plan.quarantine.length;
plan.identityHash = stableHash(operations.map((entry) => ({ table: entry.table, id: entry.row.id })).sort((a, b) => `${a.table}:${a.id}`.localeCompare(`${b.table}:${b.id}`)));

function insertOperation(database, operation) {
  if (operation.kind === "delete_legacy_workspace_graph") {
    const current = database.prepare("SELECT id, company_id, owner_id, lifecycle_status, draft_mode, source_root_id, source_drawing_number_id, source_part_number_id FROM numbering_draft_workspaces WHERE id = :sourceIdentity AND company_id = :companyId").get(operation);
    if (!current || current.lifecycle_status !== operation.expectedLifecycle) throw new Error(`DEV087_LEGACY_CLEANUP_SOURCE_CHANGED:${operation.sourceIdentity}`);
    const actualEvidence = legacyWorkspaceEvidence(current);
    if (stableHash(actualEvidence) !== stableHash(operation.evidence)) throw new Error(`DEV087_LEGACY_CLEANUP_EVIDENCE_CHANGED:${operation.sourceIdentity}`);
    database.prepare("DELETE FROM drawings WHERE workspace_id = :sourceIdentity AND company_id = :companyId AND NOT EXISTS (SELECT 1 FROM drawing_revisions revision WHERE revision.drawing_id = drawings.id)").run(operation);
    database.prepare("DELETE FROM numbering_draft_relations WHERE workspace_id = :sourceIdentity AND company_id = :companyId").run(operation);
    database.prepare("DELETE FROM numbering_draft_drawings WHERE workspace_id = :sourceIdentity AND company_id = :companyId").run(operation);
    database.prepare("DELETE FROM numbering_draft_parts WHERE workspace_id = :sourceIdentity AND company_id = :companyId").run(operation);
    database.prepare("DELETE FROM numbering_draft_roots WHERE workspace_id = :sourceIdentity AND company_id = :companyId").run(operation);
    database.prepare("DELETE FROM number_candidate_events WHERE workspace_id = :sourceIdentity AND company_id = :companyId").run(operation);
    database.prepare("DELETE FROM number_candidate_reservations WHERE workspace_id = :sourceIdentity AND company_id = :companyId").run(operation);
    const deleted = database.prepare("DELETE FROM numbering_draft_workspaces WHERE id = :sourceIdentity AND company_id = :companyId AND lifecycle_status = :expectedLifecycle").run(operation);
    if (deleted.changes !== 1) throw new Error(`DEV087_LEGACY_CLEANUP_INCOMPLETE:${operation.sourceIdentity}`);
    return;
  }
  if (!operation.row) throw new Error(`DEV087_UNKNOWN_MIGRATION_OPERATION:${operation.kind ?? "missing_row"}`);
  const entries = Object.entries(operation.row);
  const columns = entries.map(([key]) => key);
  const params = Object.fromEntries(entries);
  database.prepare(`INSERT OR IGNORE INTO ${operation.table} (${columns.join(", ")}) VALUES (${columns.map((column) => `:${column}`).join(", ")})`).run(params);
}

if (apply) {
  db.exec(canonicalSchemaSql());
  if (!columnExists(db, "platform_command_receipts", "request_hash")) db.exec("ALTER TABLE platform_command_receipts ADD COLUMN request_hash TEXT");
  if (!columnExists(db, "platform_command_receipts", "effect_key")) db.exec("ALTER TABLE platform_command_receipts ADD COLUMN effect_key TEXT");
  db.transaction(() => {
    const hasLegacyCleanup = plan.operations.some((operation) => operation.kind === "delete_legacy_workspace_graph");
    if (hasLegacyCleanup) db.exec("DROP TRIGGER IF EXISTS trg_number_candidate_events_no_delete");
    try {
      for (const operation of operations) insertOperation(db, operation);
      for (const cleanupOperation of plan.operations) insertOperation(db, cleanupOperation);
      if (switchCanonical) {
        if (plan.unresolved !== 0) throw new Error(`DEV087_UNRESOLVED_QUARANTINE:${plan.unresolved}`);
        const control = db.prepare("SELECT mode, row_version FROM pdm_workbench_state_authority_control WHERE id = 1").get();
        if (!["legacy_only", "shadow_compare", "cutover_window", "canonical_only"].includes(control.mode)) throw new Error("DEV087_AUTHORITY_MODE_INVALID");
        db.prepare("UPDATE pdm_workbench_state_authority_control SET mode = 'canonical_only', expected_commit = ?, schema_hash = ?, row_version = row_version + 1, switched_at = datetime('now') WHERE id = 1").run(expectedCommit, schemaHash);
      } else {
        db.prepare("UPDATE pdm_workbench_state_authority_control SET mode = CASE WHEN mode = 'legacy_only' THEN 'shadow_compare' ELSE mode END, schema_hash = ?, row_version = row_version + 1, switched_at = datetime('now') WHERE id = 1").run(schemaHash);
      }
    } finally {
      if (hasLegacyCleanup) db.exec(`CREATE TRIGGER IF NOT EXISTS trg_number_candidate_events_no_delete
        BEFORE DELETE ON number_candidate_events
        BEGIN
          SELECT RAISE(ABORT, 'NUMBER_CANDIDATE_EVENT_APPEND_ONLY');
        END`);
    }
  })();
  const targetCounts = {};
  for (const table of ["pdm_workbench_aggregates", "canonical_workbench_states", "drawing_rd_branches", "drawing_revision_claims", "drawing_revision_works", "part_change_works", "relation_change_works", "pdm_review_traces", "pdm_workbench_migration_quarantine"]) {
    targetCounts[table] = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  }
  plan.appliedTargetCounts = targetCounts;
  plan.authority = db.prepare("SELECT mode, expected_commit, schema_hash, row_version FROM pdm_workbench_state_authority_control WHERE id = 1").get();
}

const runId = `${new Date().toISOString().replace(/[-:.]/gu, "").replace("Z", "Z")}-${apply ? "apply" : "dry-run"}`;
const outputDir = path.resolve(option("--output-dir") || path.join("output", "qa", "dev-087-migration", runId));
fs.mkdirSync(outputDir, { recursive: true });
const manifestPath = path.join(outputDir, "manifest.json");
fs.writeFileSync(manifestPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: plan.unresolved === 0 ? "PASS" : "QUARANTINE", apply, switchCanonical, unresolved: plan.unresolved, identityHash: plan.identityHash, manifestPath }, null, 2));
db.close();
if (plan.unresolved !== 0) process.exitCode = 2;
