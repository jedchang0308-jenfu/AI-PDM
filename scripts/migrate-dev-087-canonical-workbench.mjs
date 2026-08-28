import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const repairWorkFiles = args.has("--repair-work-files");
const switchCanonical = args.has("--switch-canonical-only");
const discardUnapprovedPartOnlyDrafts = args.has("--discard-unapproved-part-only-drafts");
const retainUnmappedLegacy = args.has("--retain-unmapped-legacy");
const initializeMissingDrawingRevisions01 = args.has("--initialize-missing-drawing-revisions-0.1");
const softArchiveUnapprovedPartOnlyDrafts = args.has("--soft-archive-unapproved-part-only-drafts");
const preserveCancelledLegacyHistory = args.has("--preserve-cancelled-legacy-history");
const backfillActiveNumberingIdentities = args.has("--backfill-active-numbering-identities");
const confirmedDisposable = args.has("--confirm-disposable-dev-087") || process.env.PDM_DEV087_MIGRATION_AUTHORIZED === "1";
if (apply && !confirmedDisposable) throw new Error("DEV087_APPLY_REQUIRES_DISPOSABLE_OR_AUTHORIZED_CONFIRMATION");
if (retainUnmappedLegacy && apply && !confirmedDisposable) throw new Error("DEV087_RETAIN_LEGACY_REQUIRES_EXPLICIT_CONFIRMATION");
if (retainUnmappedLegacy && discardUnapprovedPartOnlyDrafts) throw new Error("DEV087_RETAIN_LEGACY_CANNOT_DISCARD_LEGACY_DRAFTS");
if (softArchiveUnapprovedPartOnlyDrafts && discardUnapprovedPartOnlyDrafts) throw new Error("DEV087_SOFT_ARCHIVE_CANNOT_DISCARD_LEGACY_DRAFTS");
if (backfillActiveNumberingIdentities && (softArchiveUnapprovedPartOnlyDrafts || discardUnapprovedPartOnlyDrafts)) {
  throw new Error("DEV087_ACTIVE_NUMBERING_BACKFILL_CANNOT_DISCARD_OR_ARCHIVE_ACTIVE_DRAFTS");
}
if (switchCanonical && !apply) throw new Error("DEV087_CANONICAL_SWITCH_REQUIRES_APPLY");

function option(name) {
  const prefix = `${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const dataDir = path.resolve(process.env.PDM_DATA_DIR?.trim() || "data");
const dbPath = path.resolve(option("--db") || path.join(dataDir, "ai-pdm.sqlite"));
const expectedCommit = option("--expected-commit") || process.env.PDM_BUILD_COMMIT?.trim() || "local-dev";
const schemaHash = "dev090-v1";

function stableId(namespace, ...values) {
  const hex = crypto.createHash("sha256").update([namespace, ...values].join("\u001f")).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function stableHash(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}
function canonicalHash(value) {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
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
  version: 2,
  devId: "DEV-087",
  provider: "sqlite",
  dbPath,
  mode: apply ? "apply" : "dry-run",
  expectedCommit,
  schemaHash,
  source: { drawings: 0, revisions: 0, parts: 0, roots: 0, activeWorkspaces: 0, cancelledWorkspaces: 0, recoverableSoftArchivedWorkspaces: 0, migratedDrawingWorks: 0, expectedDrawingWorkFiles: 0, existingDrawingWorkFiles: 0 },
  target: { aggregates: 0, states: 0, branches: 0, claims: 0, initialRevisions: 0, drawingWorks: 0, drawingWorkFiles: 0, partWorks: 0, relationWorks: 0, reviewTraces: 0, partRoots: 0, partNumbers: 0, drawingNumbers: 0, drawingPartLinks: 0, drawingIdentityBindings: 0 },
  initialRevisionBackfill: { requested: initializeMissingDrawingRevisions01, revision: "0.1", plannedRows: 0, verifiedExistingRows: 0, rejectedRows: 0 },
  activeNumberingBackfill: {
    requested: backfillActiveNumberingIdentities,
    eligibleWorkspaces: 0,
    drawingBundles: 0,
    partOnlyBundles: 0,
    recoveredSoftArchivedWorkspaces: 0,
    rejectedWorkspaces: 0
  },
  cleanup: {
    discardUnapprovedPartOnlyDrafts,
    retainUnmappedLegacy,
    softArchiveUnapprovedPartOnlyDrafts,
    preserveCancelledLegacyHistory,
    legacyCancelled: 0,
    preservedCancelledHistory: 0,
    unapprovedPartOnlyDrafts: 0,
    softArchivedPartOnlyDrafts: 0,
    retainedLegacy: 0
  },
  quarantine: [],
  operations: [],
  identityHash: "",
  unresolved: 0,
  workFileRepair: { requested: repairWorkFiles, plannedRows: 0, completedRows: 0 }
};

const drawings = db.prepare(`SELECT id, company_id, COALESCE(drawing_number, '') AS code, lifecycle_state,
    workspace_id, drawing_draft_id, candidate_reservation_id, formal_drawing_number_id, part_root_id,
    owner_id, created_by, row_version, created_at, updated_at, controlled_at, released_at
  FROM drawings WHERE lifecycle_state NOT IN ('cancelled', 'obsolete', 'merged') ORDER BY company_id, id`).all();
const revisions = db.prepare("SELECT id, company_id, drawing_id, revision, lifecycle_state, row_version, approval_request_id, created_by, updated_by, created_at, updated_at, controlled_at, released_at FROM drawing_revisions ORDER BY company_id, drawing_id, updated_at, id").all();
const parts = db.prepare("SELECT id, company_id, part_number, part_name, record_status FROM part_numbers ORDER BY company_id, id").all();
const roots = db.prepare("SELECT id, company_id, root_code, core_name FROM part_roots ORDER BY company_id, id").all();
const activeWorkspaces = tableExists(db, "numbering_draft_workspaces")
  ? db.prepare("SELECT id, company_id, owner_id, created_by, row_version, lifecycle_status, draft_mode, source_drawing_number_id, source_part_number_id, source_root_id FROM numbering_draft_workspaces WHERE lifecycle_status NOT IN ('published', 'cancelled', 'merged', 'obsolete') ORDER BY company_id, id").all()
  : [];
const cancelledWorkspaces = tableExists(db, "numbering_draft_workspaces")
  ? db.prepare("SELECT id, company_id FROM numbering_draft_workspaces WHERE lifecycle_status = 'cancelled' ORDER BY company_id, id").all()
  : [];
const recoverableSoftArchivedWorkspaces = backfillActiveNumberingIdentities && tableExists(db, "numbering_draft_workspaces")
  ? db.prepare(`SELECT id, company_id, owner_id, created_by, row_version, lifecycle_status, draft_mode,
      source_drawing_number_id, source_part_number_id, source_root_id, cancel_reason
    FROM numbering_draft_workspaces
    WHERE lifecycle_status = 'cancelled' AND cancel_reason = 'dev087_canonical_cutover_unapproved_part_only_draft'
    ORDER BY company_id, id`).all()
  : [];
plan.source = {
  ...plan.source,
  drawings: drawings.length,
  revisions: revisions.length,
  parts: parts.length,
  roots: roots.length,
  activeWorkspaces: activeWorkspaces.length,
  cancelledWorkspaces: cancelledWorkspaces.length,
  recoverableSoftArchivedWorkspaces: recoverableSoftArchivedWorkspaces.length
};

const revisionFileRowsByRevision = new Map();
if (tableExists(db, "drawing_revision_files") && tableExists(db, "file_assets")) {
  const revisionFileRows = db.prepare(`SELECT file.id AS file_id, file.company_id, revision.drawing_id, file.drawing_revision_id,
      file.source_file_asset_id, file.sort_order, file.removed_at, asset.id AS asset_id, asset.content_hash, asset.deleted_at
    FROM drawing_revision_files file
    JOIN drawing_revisions revision ON revision.id = file.drawing_revision_id AND revision.company_id = file.company_id
    LEFT JOIN file_assets asset ON asset.id = file.source_file_asset_id
    ORDER BY file.company_id, file.drawing_revision_id, file.sort_order, file.id`).all();
  for (const row of revisionFileRows) revisionFileRowsByRevision.set(row.drawing_revision_id, [...(revisionFileRowsByRevision.get(row.drawing_revision_id) ?? []), row]);
}

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
const legacyPackageApprovals = tableExists(db, "drawing_revision_package_review_approvals")
  ? db.prepare(`SELECT approval.approval_request_id, approval.company_id, approval.candidate_revision_id,
        approval.approved_at, revision.drawing_id
      FROM drawing_revision_package_review_approvals approval
      JOIN drawing_revisions revision ON revision.source_candidate_revision_id = approval.candidate_revision_id
      ORDER BY approval.company_id, approval.approved_at, approval.approval_request_id`).all()
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
function addWorkFileSnapshotOperation(work, source) {
  operations.push({
    kind: "insert_work_file_snapshot",
    table: "drawing_revision_work_files",
    row: { work_id: work.id, file_binding_id: source.file_id, ordinal: Number(source.sort_order), content_hash: source.content_hash },
    source: { companyId: work.company_id, drawingId: work.drawing_id, revisionId: work.revision_id, fileBindingId: source.file_id, fileAssetId: source.source_file_asset_id }
  });
}
function quarantine(sourceKind, sourceIdentity, companyId, reasonCode, evidence) {
  plan.quarantine.push({ sourceKind, sourceIdentity, companyId, reasonCode, evidence });
}

function countWhere(table, column, value) {
  if (!tableExists(db, table)) return 0;
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).get(value).count);
}

function validateSourceRevisionFiles(work, rows) {
  const ordinals = new Set();
  for (const row of rows) {
    if (row.company_id !== work.company_id || row.drawing_id !== work.drawing_id || row.drawing_revision_id !== work.revision_id) return { reasonCode: "work_file_source_scope_mismatch", row };
    if (row.removed_at !== null || !row.asset_id || row.deleted_at !== null || !row.content_hash) return { reasonCode: "work_file_source_asset_missing_or_deleted", row };
    if (ordinals.has(Number(row.sort_order))) return { reasonCode: "work_file_duplicate_ordinal", row };
    ordinals.add(Number(row.sort_order));
  }
  return null;
}

function parseMigratedWorkPayload(work) {
  try {
    const payload = typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) : work.proposed_payload;
    if (!payload || typeof payload !== "object" || payload.migrated !== true) return null;
    return payload;
  } catch {
    return { migrated: true, invalid: true };
  }
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

function activeNumberingBackfillCandidate(workspace) {
  const softArchiveReason = "dev087_canonical_cutover_unapproved_part_only_draft";
  const isRecovery = workspace.lifecycle_status === "cancelled" && workspace.cancel_reason === softArchiveReason;
  const evidence = legacyWorkspaceEvidence(workspace);
  const rootRows = db.prepare(`SELECT draft.*, reservation.id AS reservation_id, reservation.candidate_code,
      reservation.sequence_no, reservation.reservation_state, reservation.approval_request_id,
      reservation.promoted_master_id, reservation.recycled_by, reservation.recycle_reason
    FROM numbering_draft_roots draft
    JOIN number_candidate_reservations reservation ON reservation.id = draft.candidate_reservation_id
    WHERE draft.workspace_id = ? AND draft.company_id = ?`).all(workspace.id, workspace.company_id);
  const partRows = db.prepare(`SELECT draft.*, reservation.id AS reservation_id, reservation.candidate_code,
      reservation.sequence_no, reservation.reservation_state, reservation.approval_request_id,
      reservation.promoted_master_id, reservation.recycled_by, reservation.recycle_reason
    FROM numbering_draft_parts draft
    JOIN number_candidate_reservations reservation ON reservation.id = draft.candidate_reservation_id
    WHERE draft.workspace_id = ? AND draft.company_id = ?`).all(workspace.id, workspace.company_id);
  const drawingRows = db.prepare(`SELECT draft.*, reservation.id AS reservation_id, reservation.candidate_code,
      reservation.sequence_no, reservation.reservation_state, reservation.approval_request_id,
      reservation.promoted_master_id, reservation.recycled_by, reservation.recycle_reason
    FROM numbering_draft_drawings draft
    JOIN number_candidate_reservations reservation ON reservation.id = draft.candidate_reservation_id
    WHERE draft.workspace_id = ? AND draft.company_id = ?`).all(workspace.id, workspace.company_id);
  const relationRows = db.prepare("SELECT * FROM numbering_draft_relations WHERE workspace_id = ? AND company_id = ?").all(workspace.id, workspace.company_id);
  const projectedDrawings = db.prepare(`SELECT id, company_id, drawing_number, lifecycle_state, workspace_id,
      drawing_draft_id, candidate_reservation_id, formal_drawing_number_id, part_root_id
    FROM drawings WHERE workspace_id = ? AND company_id = ?`).all(workspace.id, workspace.company_id);
  const projectedRevisions = db.prepare(`SELECT revision.id, revision.company_id, revision.drawing_id,
      revision.revision, revision.lifecycle_state, revision.approval_request_id
    FROM drawing_revisions revision
    JOIN drawings drawing ON drawing.id = revision.drawing_id AND drawing.company_id = revision.company_id
    WHERE drawing.workspace_id = ? AND drawing.company_id = ?
    ORDER BY revision.id`).all(workspace.id, workspace.company_id);
  const reservations = [...rootRows, ...partRows, ...drawingRows];
  const ownerExists = Boolean(workspace.owner_id)
    && Boolean(db.prepare("SELECT 1 FROM users WHERE id = ? AND company_id = ?").get(workspace.owner_id, workspace.company_id));
  const graphShapeValid = workspace.draft_mode === "new_bundle"
    && !workspace.source_root_id && !workspace.source_drawing_number_id && !workspace.source_part_number_id
    && rootRows.length === 1 && partRows.length === 1
    && (drawingRows.length === 0 || drawingRows.length === 1)
    && relationRows.length === drawingRows.length && projectedDrawings.length === drawingRows.length
    && evidence.rootRows === 1 && evidence.partRows === 1 && evidence.drawingRows === drawingRows.length
    && evidence.formalDrawingRows === drawingRows.length && evidence.relationRows === relationRows.length
    && evidence.reservationRows === 2 + drawingRows.length
    && evidence.eventRows >= evidence.reservationRows + 1
    && evidence.revisionDraftRows === 0 && evidence.publicationEvidenceRows === 0 && evidence.transferRows === 0
    && evidence.approvalReservationRows === 0 && evidence.approvalTargetRows === 0 && evidence.legacyApprovalLinkRows === 0
    && evidence.linkedAssetRows === 0 && evidence.drawingRevisionRows === projectedRevisions.length
    && projectedRevisions.length <= drawingRows.length
    && projectedRevisions.every((revision) => revision.id === stableId("dev087-initial-revision-0.1", workspace.company_id, revision.drawing_id)
      && revision.revision === "0.1" && revision.lifecycle_state === "preparing" && revision.approval_request_id === null)
    && evidence.recognitionRows === 0
    && evidence.controlledNoteRows === 0 && evidence.engineeringEvidenceRows === 0 && evidence.candidateFileRows === 0;
  const lifecycleValid = workspace.lifecycle_status === "active" || isRecovery;
  const reservationsValid = reservations.every((row) => row.approval_request_id === null && row.promoted_master_id === null
    && (isRecovery
      ? row.reservation_state === "recycled" && row.recycled_by === workspace.owner_id && row.recycle_reason === softArchiveReason
      : row.reservation_state === "active" && row.recycled_by === null && row.recycle_reason === null));
  const recoveryEventsValid = !isRecovery || reservations.every((row) => Boolean(db.prepare(`SELECT 1 FROM number_candidate_events
    WHERE id = ? AND company_id = ? AND workspace_id = ? AND reservation_id = ?
      AND event_type = 'candidate_recycled'`).get(
    stableId("dev087-soft-archive-event", workspace.company_id, workspace.id, row.reservation_id),
    workspace.company_id,
    workspace.id,
    row.reservation_id
  )));
  const root = rootRows[0] ?? null;
  const part = partRows[0] ?? null;
  const drawing = drawingRows[0] ?? null;
  const relation = relationRows[0] ?? null;
  const projectedDrawing = projectedDrawings[0] ?? null;
  const referencesValid = Boolean(root && part)
    && part.root_draft_id === root.id
    && (!drawing || (drawing.root_draft_id === root.id
      && projectedDrawing?.drawing_draft_id === drawing.id
      && projectedDrawing?.candidate_reservation_id === drawing.reservation_id
      && projectedDrawing?.drawing_number === drawing.candidate_code
      && projectedDrawing?.lifecycle_state !== "cancelled"
      && relation?.drawing_draft_id === drawing.id
      && relation?.part_draft_id === part.id));
  const partSequenceCode = root && part && part.candidate_code.startsWith(`${root.candidate_code}-`)
    ? part.candidate_code.slice(root.candidate_code.length + 1)
    : null;
  const targetIds = root && part ? {
    root: `part-root-${root.reservation_id}`,
    part: `part-number-${part.reservation_id}`,
    drawing: drawing ? `drawing-number-${drawing.reservation_id}` : null,
    relation: relation ? `drawing-part-link-${relation.id}` : null
  } : null;
  const collisionChecks = targetIds ? [
    ["part_roots", "root_code", root.candidate_code, targetIds.root],
    ["part_numbers", "part_number", part.candidate_code, targetIds.part],
    ...(drawing ? [["drawing_numbers", "drawing_number", drawing.candidate_code, targetIds.drawing]] : [])
  ] : [];
  const collisions = collisionChecks.flatMap(([table, column, code, expectedId]) => {
    const row = db.prepare(`SELECT id FROM ${table} WHERE company_id = ? AND ${column} = ?`).get(workspace.company_id, code);
    return row && row.id !== expectedId ? [{ table, column, code, expectedId, actualId: row.id }] : [];
  });
  const valid = lifecycleValid && graphShapeValid && ownerExists && reservationsValid && recoveryEventsValid
    && referencesValid && Boolean(partSequenceCode) && collisions.length === 0;
  return {
    valid,
    reasonCode: !lifecycleValid ? "active_numbering_workspace_lifecycle_invalid"
      : !graphShapeValid ? "active_numbering_workspace_graph_invalid"
        : !ownerExists ? "active_numbering_workspace_owner_missing"
          : !reservationsValid ? "active_numbering_reservation_state_invalid"
            : !recoveryEventsValid ? "active_numbering_soft_archive_provenance_invalid"
              : !referencesValid ? "active_numbering_workspace_reference_invalid"
                : !partSequenceCode ? "active_numbering_part_sequence_invalid"
                  : collisions.length > 0 ? "active_numbering_master_collision" : null,
    isRecovery,
    evidence: { workspace, graph: evidence, rootRows, partRows, drawingRows, relationRows, projectedDrawings, projectedRevisions, collisions },
    root,
    part,
    drawing,
    relation,
    projectedDrawing,
    partSequenceCode,
    targetIds
  };
}

const evaluatedActiveNumberingWorkspaceIds = new Set();
const backfilledActiveNumberingWorkspaceIds = new Set();
if (backfillActiveNumberingIdentities) {
  for (const workspace of [...activeWorkspaces, ...recoverableSoftArchivedWorkspaces]) {
    evaluatedActiveNumberingWorkspaceIds.add(workspace.id);
    const candidate = activeNumberingBackfillCandidate(workspace);
    if (!candidate.valid) {
      plan.activeNumberingBackfill.rejectedWorkspaces += 1;
      quarantine("numbering_draft_workspace", workspace.id, workspace.company_id, candidate.reasonCode, candidate.evidence);
      continue;
    }
    const { root, part, drawing, relation, projectedDrawing, targetIds } = candidate;
    const payload = {
      partName: part.part_name,
      itemKind: part.item_kind,
      customSpecification: part.custom_specification ?? null,
      isUniversal: Boolean(part.is_universal),
      bomUsagePolicy: "undecided"
    };
    const workId = stableId("dev087-part-work", workspace.company_id, targetIds.part);
    add("part_roots", {
      id: targetIds.root,
      company_id: workspace.company_id,
      root_code: root.candidate_code,
      core_name: root.core_name,
      item_kind: root.item_kind,
      record_status: "Draft",
      rule_version_id: root.rule_version_id,
      created_by: workspace.created_by,
      created_at: root.created_at,
      updated_at: root.updated_at
    });
    add("part_numbers", {
      id: targetIds.part,
      company_id: workspace.company_id,
      part_root_id: targetIds.root,
      part_number: part.candidate_code,
      sequence_no: Number(part.sequence_no),
      sequence_code: candidate.partSequenceCode,
      part_name: part.part_name,
      item_kind: part.item_kind,
      structure_type: "single_part",
      is_universal: part.is_universal ? 1 : 0,
      bom_usage_policy: "undecided",
      custom_specification: part.custom_specification ?? null,
      series_code: part.series_code ?? null,
      record_status: "Draft",
      universal_reason: part.universal_reason ?? null,
      rule_version_id: root.rule_version_id,
      created_by: workspace.created_by,
      created_at: part.created_at,
      updated_at: part.updated_at
    });
    add("pdm_workbench_aggregates", {
      id: stableId("dev087-aggregate", workspace.company_id, "part", targetIds.part),
      company_id: workspace.company_id,
      entity_type: "part",
      canonical_entity_id: targetIds.part,
      open_branch_count: 0,
      row_version: 1
    });
    add("part_change_works", {
      id: workId,
      company_id: workspace.company_id,
      part_id: targetIds.part,
      owner_user_id: workspace.owner_id,
      proposed_payload: JSON.stringify(payload),
      base_formal_row_version: null,
      base_hash: canonicalHash(payload),
      row_version: 1,
      created_at: part.created_at,
      updated_at: part.updated_at
    });
    add("canonical_workbench_states", {
      id: stableId("dev087-state", workspace.company_id, "part_work", targetIds.part),
      company_id: workspace.company_id,
      entity_type: "part",
      canonical_entity_id: targetIds.part,
      data_layer: "part_work",
      branch_id: null,
      revision_id: null,
      work_id: workId,
      handling: "owner",
      blocker_reason: null,
      row_version: 1
    });
    if (drawing) {
      add("drawing_numbers", {
        id: targetIds.drawing,
        company_id: workspace.company_id,
        part_root_id: targetIds.root,
        drawing_number: drawing.candidate_code,
        purpose_code: drawing.purpose_code,
        purpose_description: drawing.purpose_description,
        sequence_no: Number(drawing.sequence_no),
        is_primary_manufacturing: drawing.is_primary_manufacturing ? 1 : 0,
        record_status: "Draft",
        rule_version_id: root.rule_version_id,
        created_by: workspace.created_by,
        created_at: drawing.created_at,
        updated_at: drawing.updated_at
      });
      operations.push({
        kind: "bind_drawing_number_identity",
        table: "drawings",
        sourceIdentity: projectedDrawing.id,
        companyId: workspace.company_id,
        workspaceId: workspace.id,
        drawingDraftId: drawing.id,
        candidateReservationId: drawing.reservation_id,
        drawingNumber: drawing.candidate_code,
        formalDrawingNumberId: targetIds.drawing,
        partRootId: targetIds.root
      });
      add("drawing_part_links", {
        id: targetIds.relation,
        drawing_number_id: targetIds.drawing,
        part_number_id: targetIds.part,
        link_type: relation.link_type,
        created_by: workspace.created_by,
        created_at: relation.created_at
      });
      plan.activeNumberingBackfill.drawingBundles += 1;
    } else {
      plan.activeNumberingBackfill.partOnlyBundles += 1;
    }
    if (candidate.isRecovery) {
      plan.operations.push({
        kind: "restore_soft_archived_part_only_workspace",
        table: "numbering_draft_workspaces",
        sourceIdentity: workspace.id,
        companyId: workspace.company_id,
        ownerId: workspace.owner_id,
        reason: "dev087_canonical_cutover_unapproved_part_only_draft",
        evidence: candidate.evidence.graph
      });
      plan.activeNumberingBackfill.recoveredSoftArchivedWorkspaces += 1;
    }
    plan.activeNumberingBackfill.eligibleWorkspaces += 1;
    backfilledActiveNumberingWorkspaceIds.add(workspace.id);
  }
}

function initialRevisionBackfillCandidate(drawing, existingRevisions) {
  const revisionId = stableId("dev087-initial-revision-0.1", drawing.company_id, drawing.id);
  const ownerId = drawing.owner_id || drawing.created_by;
  const evidence = {
    sourceKind: drawing.workspace_id ? "active_legacy_workspace" : "draft_formal_drawing",
    drawingLifecycleState: drawing.lifecycle_state,
    revision: "0.1",
    ownerPresent: Boolean(ownerId),
    controlledEvidenceAbsent: drawing.controlled_at === null && drawing.released_at === null,
    sourceFingerprint: ""
  };
  if (existingRevisions.length > 0) {
    const existing = existingRevisions.find((row) => row.id === revisionId);
    if (!existing || existingRevisions.length !== 1) return { eligible: false, owned: false, reasonCode: null, evidence };
    const matches = existing.company_id === drawing.company_id
      && existing.drawing_id === drawing.id
      && existing.revision === "0.1"
      && existing.lifecycle_state === "preparing"
      && existing.approval_request_id === null;
    evidence.sourceFingerprint = stableHash({ drawingId: drawing.id, revisionId, existing: true, matches });
    return matches
      ? { eligible: true, owned: true, ownerId, revisionId, evidence }
      : { eligible: false, owned: true, reasonCode: "initial_revision_backfill_target_drift", evidence };
  }
  if (!ownerId || !drawing.code || drawing.controlled_at !== null || drawing.released_at !== null) {
    evidence.sourceFingerprint = stableHash({ drawingId: drawing.id, ownerId: ownerId ?? null, codePresent: Boolean(drawing.code), controlledAt: drawing.controlled_at, releasedAt: drawing.released_at });
    return { eligible: false, owned: true, reasonCode: "initial_revision_backfill_source_incomplete", evidence };
  }
  const ownerExists = tableExists(db, "users") && Boolean(db.prepare("SELECT 1 FROM users WHERE id = ? AND company_id = ?").get(ownerId, drawing.company_id));
  if (!ownerExists) {
    evidence.ownerPresent = false;
    evidence.sourceFingerprint = stableHash({ drawingId: drawing.id, ownerId, ownerExists });
    return { eligible: false, owned: true, reasonCode: "initial_revision_backfill_owner_missing", evidence };
  }
  if (drawing.workspace_id) {
    const workspaceRows = db.prepare(`SELECT workspace.id AS workspace_id, workspace.company_id, workspace.owner_id,
        workspace.lifecycle_status, workspace.draft_mode, workspace.source_root_id, workspace.source_drawing_number_id,
        workspace.source_part_number_id, draft.id AS draft_id, draft.candidate_reservation_id,
        reservation.id AS reservation_id, reservation.company_id AS reservation_company_id,
        reservation.candidate_code, reservation.reservation_state, reservation.approval_request_id,
        reservation.promoted_master_id
      FROM numbering_draft_workspaces workspace
      JOIN numbering_draft_drawings draft ON draft.workspace_id = workspace.id AND draft.company_id = workspace.company_id
      JOIN number_candidate_reservations reservation ON reservation.id = draft.candidate_reservation_id
      WHERE workspace.id = ? AND workspace.company_id = ?`).all(drawing.workspace_id, drawing.company_id);
    const row = workspaceRows[0];
    const graph = legacyWorkspaceEvidence({
      id: drawing.workspace_id,
      company_id: drawing.company_id,
      lifecycle_status: row?.lifecycle_status,
      draft_mode: row?.draft_mode
    });
    const graphValid = workspaceRows.length === 1 && row
      && row.lifecycle_status === "active" && row.draft_mode === "new_bundle"
      && row.source_root_id === null && row.source_drawing_number_id === null && row.source_part_number_id === null
      && row.company_id === drawing.company_id && row.reservation_company_id === drawing.company_id
      && row.owner_id === ownerId && row.draft_id === drawing.drawing_draft_id
      && row.candidate_reservation_id === drawing.candidate_reservation_id
      && row.reservation_id === drawing.candidate_reservation_id && row.candidate_code === drawing.code
      && row.reservation_state === "active" && row.approval_request_id === null && row.promoted_master_id === null
      && graph.rootRows === 1 && graph.partRows === 1 && graph.drawingRows === 1 && graph.formalDrawingRows === 1
      && graph.relationRows === 1 && graph.reservationRows === 3 && graph.eventRows >= 4
      && graph.revisionDraftRows === 0 && graph.publicationEvidenceRows === 0 && graph.transferRows === 0
      && graph.approvalReservationRows === 0 && graph.approvalTargetRows === 0 && graph.legacyApprovalLinkRows === 0
      && graph.linkedAssetRows === 0 && graph.drawingRevisionRows === 0 && graph.recognitionRows === 0
      && graph.controlledNoteRows === 0 && graph.engineeringEvidenceRows === 0 && graph.candidateFileRows === 0;
    evidence.sourceFingerprint = stableHash({ drawingId: drawing.id, revisionId, workspaceRows, graph });
    if (!graphValid) return { eligible: false, owned: true, reasonCode: "initial_revision_backfill_workspace_fingerprint_mismatch", evidence };
  } else {
    const formal = drawing.formal_drawing_number_id
      ? db.prepare("SELECT id, company_id, part_root_id, drawing_number, record_status FROM drawing_numbers WHERE id = ? AND company_id = ?").get(drawing.formal_drawing_number_id, drawing.company_id)
      : null;
    const linkedApprovalRows = formal && tableExists(db, "approval_platform_targets")
      ? Number(db.prepare("SELECT COUNT(*) AS count FROM approval_platform_targets WHERE target_id IN (?, ?)").get(drawing.id, formal.id).count)
      : 0;
    const linkedLegacyApprovalRows = formal && tableExists(db, "approval_platform_legacy_links")
      ? Number(db.prepare("SELECT COUNT(*) AS count FROM approval_platform_legacy_links WHERE legacy_id IN (?, ?)").get(drawing.id, formal.id).count)
      : 0;
    const formalValid = formal
      && formal.company_id === drawing.company_id && formal.drawing_number === drawing.code
      && formal.part_root_id === drawing.part_root_id && formal.record_status === "Draft"
      && linkedApprovalRows === 0 && linkedLegacyApprovalRows === 0;
    evidence.sourceFingerprint = stableHash({ drawingId: drawing.id, revisionId, formal, linkedApprovalRows, linkedLegacyApprovalRows });
    if (!formalValid) return { eligible: false, owned: true, reasonCode: "initial_revision_backfill_formal_fingerprint_mismatch", evidence };
  }
  return { eligible: true, owned: true, ownerId, revisionId, evidence };
}

const existingMigratedWorkIds = new Set();
const existingWorkFileRowsByWork = new Map();
if (tableExists(db, "drawing_revision_works")) {
  const migratedWorks = db.prepare("SELECT id, company_id, drawing_id, proposed_payload FROM drawing_revision_works ORDER BY company_id, id").all();
  for (const work of migratedWorks) {
    const payload = parseMigratedWorkPayload(work);
    if (!payload || !work.drawing_id || !payload.revisionId) continue;
    existingMigratedWorkIds.add(work.id);
    if (tableExists(db, "drawing_revision_work_files")) {
      existingWorkFileRowsByWork.set(work.id, db.prepare("SELECT work_id, file_binding_id, ordinal, content_hash FROM drawing_revision_work_files WHERE work_id = ? ORDER BY ordinal, file_binding_id").all(work.id));
    }
  }
}
plan.source.migratedDrawingWorks = existingMigratedWorkIds.size;
plan.source.expectedDrawingWorkFiles = [...revisionFileRowsByRevision.values()].reduce((sum, rows) => sum + rows.length, 0);
plan.source.existingDrawingWorkFiles = [...existingWorkFileRowsByWork.values()].reduce((sum, rows) => sum + rows.length, 0);

for (const drawing of drawings) {
  const aggregateId = stableId("dev087-aggregate", drawing.company_id, "drawing", drawing.id);
  let all = revisionsByDrawing.get(drawing.id) ?? [];
  if (initializeMissingDrawingRevisions01) {
    const candidate = initialRevisionBackfillCandidate(drawing, all);
    if (candidate.eligible && candidate.owned) {
      const initialRevision = {
        id: candidate.revisionId,
        company_id: drawing.company_id,
        drawing_id: drawing.id,
        revision: "0.1",
        lifecycle_state: "preparing",
        policy_snapshot_json: "{}",
        row_version: 1,
        approval_request_id: null,
        created_by: candidate.ownerId,
        updated_by: candidate.ownerId,
        created_at: drawing.created_at,
        updated_at: drawing.updated_at,
        controlled_at: null,
        released_at: null
      };
      add("drawing_revisions", initialRevision);
      plan.initialRevisionBackfill[candidate.evidence.sourceKind === "existing" ? "verifiedExistingRows" : all.length === 0 ? "plannedRows" : "verifiedExistingRows"] += 1;
      if (all.length === 0) all = [initialRevision];
    } else if (candidate.owned && candidate.reasonCode) {
      plan.initialRevisionBackfill.rejectedRows += 1;
      quarantine("drawing", drawing.id, drawing.company_id, candidate.reasonCode, candidate.evidence);
    }
  }
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
    const sourceWork = { id: stableId("dev087-drawing-work", drawing.company_id, stableId("dev087-branch", drawing.company_id, drawing.id, entry.row.id)), company_id: drawing.company_id, drawing_id: drawing.id, revision_id: entry.row.id };
    const sourceFiles = revisionFileRowsByRevision.get(entry.row.id) ?? [];
    if (workId) {
      const sourceIssue = validateSourceRevisionFiles(sourceWork, sourceFiles);
      if (sourceIssue) {
        quarantine("drawing_revision_work_files", entry.row.id, entry.row.company_id, sourceIssue.reasonCode, { revisionId: entry.row.id, file: sourceIssue.row });
        continue;
      }
      const existingRows = existingWorkFileRowsByWork.get(workId) ?? null;
      if (existingRows) {
        const expectedByBinding = new Map(sourceFiles.map((sourceFile) => [sourceFile.file_id, sourceFile]));
        const existingByBinding = new Map(existingRows.map((row) => [row.file_binding_id, row]));
        const missing = sourceFiles.filter((sourceFile) => {
          const existing = existingByBinding.get(sourceFile.file_id);
          return !existing || Number(existing.ordinal) !== Number(sourceFile.sort_order) || existing.content_hash !== sourceFile.content_hash;
        });
        const extra = existingRows.filter((row) => !expectedByBinding.has(row.file_binding_id));
        const duplicateBindings = existingRows.filter((row, index) => existingRows.findIndex((candidate) => candidate.file_binding_id === row.file_binding_id) !== index);
        const duplicateOrdinals = existingRows.filter((row, index) => existingRows.findIndex((candidate) => Number(candidate.ordinal) === Number(row.ordinal)) !== index);
        const targetDrift = existingRows.filter((row) => {
          const expected = expectedByBinding.get(row.file_binding_id);
          return expected && (Number(row.ordinal) !== Number(expected.sort_order) || row.content_hash !== expected.content_hash);
        });
        if (extra.length > 0 || duplicateBindings.length > 0 || duplicateOrdinals.length > 0 || targetDrift.length > 0) {
          quarantine("drawing_revision_work_files", workId, entry.row.company_id, "work_file_snapshot_target_drift", {
            workId,
            expectedCount: sourceFiles.length,
            existingCount: existingRows.length,
            extra: extra.map((row) => row.file_binding_id),
            duplicateBindings: duplicateBindings.map((row) => row.file_binding_id),
            duplicateOrdinals: duplicateOrdinals.map((row) => row.ordinal),
            targetDrift: targetDrift.map((row) => row.file_binding_id)
          });
          continue;
        }
        if (missing.length > 0 || existingRows.length !== sourceFiles.length) {
          if (!repairWorkFiles) {
            quarantine("drawing_revision_work_files", workId, entry.row.company_id, "work_file_snapshot_incomplete", {
              workId,
              expectedCount: sourceFiles.length,
              existingCount: existingRows.length,
              missing: missing.map((sourceFile) => sourceFile.file_id),
              extra: []
            });
            continue;
          }
          for (const sourceFile of missing) {
            addWorkFileSnapshotOperation(sourceWork, sourceFile);
            plan.workFileRepair.plannedRows += 1;
          }
        }
      }
    }
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
    if (workId) {
      add("drawing_revision_works", {
        id: workId, company_id: drawing.company_id, drawing_id: drawing.id, branch_id: branchId, target_claim_id: claimId,
      owner_user_id: ownerId, proposed_payload: JSON.stringify({ drawingId: drawing.id, revisionId: entry.row.id, migrated: true }),
      base_hash: stableHash({ predecessor, revisionId: entry.row.id }), row_version: Number(entry.row.row_version || 1)
      });
      if (!existingWorkFileRowsByWork.has(workId)) {
        for (const sourceFile of sourceFiles) addWorkFileSnapshotOperation(sourceWork, sourceFile);
      }
    }
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

// The canonical trace intentionally keeps only the number and time of
// completed reviews. Package/snapshot/workflow payloads are not retained.
for (const approval of legacyPackageApprovals) add("pdm_review_traces", {
  review_cycle_id: stableId("dev087-package-review-trace", approval.company_id, approval.approval_request_id),
  company_id: approval.company_id,
  entity_type: "drawing",
  canonical_entity_id: approval.drawing_id,
  decision_at: approval.approved_at
});

const existingPartWorkPartIds = tableExists(db, "part_change_works")
  ? new Set(db.prepare("SELECT part_id FROM part_change_works ORDER BY part_id").all().map((row) => row.part_id))
  : new Set();
for (const part of parts) {
  if (existingPartWorkPartIds.has(part.id)) continue;
  add("pdm_workbench_aggregates", { id: stableId("dev087-aggregate", part.company_id, "part", part.id), company_id: part.company_id, entity_type: "part", canonical_entity_id: part.id, open_branch_count: 0, row_version: 1 });
  add("canonical_workbench_states", { id: stableId("dev087-state", part.company_id, "part_formal", part.id), company_id: part.company_id, entity_type: "part", canonical_entity_id: part.id, data_layer: "part_formal", branch_id: null, revision_id: null, work_id: null, handling: "none", blocker_reason: null, row_version: Number(part.row_version || 1) });
}

for (const workspace of activeWorkspaces) {
  if (backfillActiveNumberingIdentities && evaluatedActiveNumberingWorkspaceIds.has(workspace.id)) continue;
  if (convertedDrawingWorkspaces.has(workspace.id)) continue;
  const evidence = legacyWorkspaceEvidence(workspace);
  if (softArchiveUnapprovedPartOnlyDrafts && isDisposableUnapprovedPartOnly(workspace, evidence)) {
    plan.operations.push({
      kind: "soft_archive_unapproved_part_only_workspace",
      table: "numbering_draft_workspaces",
      sourceIdentity: workspace.id,
      companyId: workspace.company_id,
      ownerId: workspace.owner_id,
      expectedRowVersion: Number(workspace.row_version),
      expectedLifecycle: "active",
      reason: "dev087_canonical_cutover_unapproved_part_only_draft",
      evidence
    });
    plan.cleanup.softArchivedPartOnlyDrafts += 1;
  } else if (discardUnapprovedPartOnlyDrafts && isDisposableUnapprovedPartOnly(workspace, evidence)) {
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
  if (backfillActiveNumberingIdentities && evaluatedActiveNumberingWorkspaceIds.has(workspace.id)) continue;
  const source = db.prepare("SELECT id, company_id, owner_id, lifecycle_status, draft_mode, source_root_id, source_drawing_number_id, source_part_number_id, cancelled_at, updated_at FROM numbering_draft_workspaces WHERE id = ?").get(workspace.id);
  const evidence = legacyWorkspaceEvidence(source);
  const safeCancelled = evidence.revisionDraftRows === 0 && evidence.publicationEvidenceRows === 0 && evidence.transferRows === 0
    && evidence.approvalReservationRows === 0 && evidence.approvalTargetRows === 0 && evidence.legacyApprovalLinkRows === 0
    && evidence.linkedAssetRows === 0 && evidence.drawingRevisionRows === 0 && evidence.recognitionRows === 0
    && evidence.controlledNoteRows === 0 && evidence.engineeringEvidenceRows === 0 && evidence.candidateFileRows === 0;
  if (safeCancelled && preserveCancelledLegacyHistory) {
    const quarantineId = stableId("dev087-quarantine", "numbering_draft_workspace", workspace.id);
    const existingResolvedHistory = tableExists(db, "pdm_workbench_migration_quarantine")
      ? db.prepare(`SELECT resolved_at FROM pdm_workbench_migration_quarantine
          WHERE id = ? AND source_kind = 'numbering_draft_workspace' AND source_identity = ?
            AND resolution = 'preserved_cancelled_history' AND resolved_at IS NOT NULL`).get(quarantineId, workspace.id)
      : null;
    add("pdm_workbench_migration_quarantine", {
      id: quarantineId,
      company_id: workspace.company_id,
      source_kind: "numbering_draft_workspace",
      source_identity: workspace.id,
      reason_code: "legacy_cancelled_history_preserved",
      evidence_payload: JSON.stringify(evidence),
      resolution: "preserved_cancelled_history",
      resolved_at: existingResolvedHistory?.resolved_at || source.cancelled_at || source.updated_at
    });
    plan.cleanup.preservedCancelledHistory += 1;
  } else if (safeCancelled && !retainUnmappedLegacy) {
    plan.operations.push({ kind: "delete_legacy_workspace_graph", table: "numbering_draft_workspaces", sourceIdentity: workspace.id, companyId: workspace.company_id, expectedLifecycle: "cancelled", evidence });
    plan.cleanup.legacyCancelled += 1;
  } else {
    quarantine("numbering_draft_workspace", workspace.id, workspace.company_id, safeCancelled ? "legacy_cancelled_retained" : "legacy_cancelled_cleanup_not_safe", evidence);
  }
}

const legacyResolution = retainUnmappedLegacy ? "retained_legacy_source" : null;
const legacyResolvedAt = retainUnmappedLegacy ? new Date().toISOString() : null;
for (const item of plan.quarantine) add("pdm_workbench_migration_quarantine", {
  id: stableId("dev087-quarantine", item.sourceKind, item.sourceIdentity), company_id: item.companyId,
  source_kind: item.sourceKind, source_identity: item.sourceIdentity, reason_code: item.reasonCode,
  evidence_payload: JSON.stringify(item.evidence), resolution: legacyResolution, resolved_at: legacyResolvedAt
});

if (retainUnmappedLegacy) plan.cleanup.retainedLegacy = plan.quarantine.length;

plan.target = {
  aggregates: operations.filter((entry) => entry.table === "pdm_workbench_aggregates").length,
  states: operations.filter((entry) => entry.table === "canonical_workbench_states").length,
  branches: operations.filter((entry) => entry.table === "drawing_rd_branches").length,
  claims: operations.filter((entry) => entry.table === "drawing_revision_claims").length,
  initialRevisions: operations.filter((entry) => entry.table === "drawing_revisions").length,
  drawingWorks: operations.filter((entry) => entry.table === "drawing_revision_works").length,
  drawingWorkFiles: operations.filter((entry) => entry.table === "drawing_revision_work_files").length,
  partWorks: operations.filter((entry) => entry.table === "part_change_works").length,
  relationWorks: operations.filter((entry) => entry.table === "relation_change_works").length,
  reviewTraces: operations.filter((entry) => entry.table === "pdm_review_traces").length,
  partRoots: operations.filter((entry) => entry.table === "part_roots").length,
  partNumbers: operations.filter((entry) => entry.table === "part_numbers").length,
  drawingNumbers: operations.filter((entry) => entry.table === "drawing_numbers").length,
  drawingPartLinks: operations.filter((entry) => entry.table === "drawing_part_links").length,
  drawingIdentityBindings: operations.filter((entry) => entry.kind === "bind_drawing_number_identity").length
};
plan.unresolved = retainUnmappedLegacy ? 0 : plan.quarantine.length;
plan.unresolvedBeforeResolution = plan.quarantine.length;
plan.identityHash = stableHash(operations.map((entry) => ({
  table: entry.table,
  kind: entry.kind ?? null,
  identity: entry.row?.id ?? entry.sourceIdentity ?? `${entry.row?.work_id ?? ""}:${entry.row?.file_binding_id ?? ""}`
})).sort((a, b) => `${a.table}:${a.identity}:${a.kind ?? ""}`.localeCompare(`${b.table}:${b.identity}:${b.kind ?? ""}`)));

function insertOperation(database, operation) {
  if (operation.kind === "bind_drawing_number_identity") {
    const current = database.prepare(`SELECT id, company_id, drawing_number, workspace_id, drawing_draft_id,
        candidate_reservation_id, formal_drawing_number_id, part_root_id
      FROM drawings WHERE id = :sourceIdentity AND company_id = :companyId`).get(operation);
    if (!current || current.drawing_number !== operation.drawingNumber || current.workspace_id !== operation.workspaceId
      || current.drawing_draft_id !== operation.drawingDraftId || current.candidate_reservation_id !== operation.candidateReservationId) {
      throw new Error(`DEV087_DRAWING_IDENTITY_BINDING_SOURCE_CHANGED:${operation.sourceIdentity}`);
    }
    if (current.formal_drawing_number_id === operation.formalDrawingNumberId && current.part_root_id === operation.partRootId) return;
    if (current.formal_drawing_number_id !== null || current.part_root_id !== null) {
      throw new Error(`DEV087_DRAWING_IDENTITY_BINDING_TARGET_DRIFT:${operation.sourceIdentity}`);
    }
    const updated = database.prepare(`UPDATE drawings
      SET formal_drawing_number_id = :formalDrawingNumberId, part_root_id = :partRootId
      WHERE id = :sourceIdentity AND company_id = :companyId
        AND formal_drawing_number_id IS NULL AND part_root_id IS NULL`).run(operation);
    if (updated.changes !== 1) throw new Error(`DEV087_DRAWING_IDENTITY_BINDING_FAILED:${operation.sourceIdentity}`);
    return;
  }
  if (operation.kind === "restore_soft_archived_part_only_workspace") {
    const current = database.prepare(`SELECT id, company_id, owner_id, lifecycle_status, cancel_reason
      FROM numbering_draft_workspaces WHERE id = :sourceIdentity AND company_id = :companyId`).get(operation);
    if (!current || current.owner_id !== operation.ownerId || current.lifecycle_status !== "cancelled" || current.cancel_reason !== operation.reason) {
      throw new Error(`DEV087_SOFT_ARCHIVE_RESTORE_SOURCE_CHANGED:${operation.sourceIdentity}`);
    }
    const actualEvidence = legacyWorkspaceEvidence({
      ...current,
      draft_mode: "new_bundle"
    });
    if (stableHash(actualEvidence) !== stableHash(operation.evidence)) {
      throw new Error(`DEV087_SOFT_ARCHIVE_RESTORE_EVIDENCE_CHANGED:${operation.sourceIdentity}`);
    }
    const reservations = database.prepare(`SELECT id, reservation_state, approval_request_id, promoted_master_id,
        recycled_by, recycle_reason
      FROM number_candidate_reservations WHERE workspace_id = :sourceIdentity AND company_id = :companyId ORDER BY id`).all(operation);
    if (reservations.length !== 2 || reservations.some((row) => row.reservation_state !== "recycled"
      || row.approval_request_id !== null || row.promoted_master_id !== null
      || row.recycled_by !== operation.ownerId || row.recycle_reason !== operation.reason)) {
      throw new Error(`DEV087_SOFT_ARCHIVE_RESTORE_RESERVATION_CHANGED:${operation.sourceIdentity}`);
    }
    const restoredAt = new Date().toISOString();
    for (const reservation of reservations) {
      const archiveEventId = stableId("dev087-soft-archive-event", operation.companyId, operation.sourceIdentity, reservation.id);
      const archiveEvent = database.prepare(`SELECT 1 FROM number_candidate_events
        WHERE id = ? AND company_id = ? AND workspace_id = ? AND reservation_id = ? AND event_type = 'candidate_recycled'`).get(
        archiveEventId,
        operation.companyId,
        operation.sourceIdentity,
        reservation.id
      );
      if (!archiveEvent) throw new Error(`DEV087_SOFT_ARCHIVE_RESTORE_PROVENANCE_MISSING:${reservation.id}`);
      const restored = database.prepare(`UPDATE number_candidate_reservations
        SET reservation_state = 'active', row_version = row_version + 1,
            recycled_at = NULL, recycled_by = NULL, recycle_reason = NULL, updated_at = :restoredAt
        WHERE id = :reservationId AND company_id = :companyId AND reservation_state = 'recycled'
          AND recycled_by = :ownerId AND recycle_reason = :reason`).run({
        reservationId: reservation.id,
        companyId: operation.companyId,
        ownerId: operation.ownerId,
        reason: operation.reason,
        restoredAt
      });
      if (restored.changes !== 1) throw new Error(`DEV087_SOFT_ARCHIVE_RESTORE_RESERVATION_FAILED:${reservation.id}`);
      database.prepare(`INSERT OR IGNORE INTO number_candidate_events
        (id, company_id, workspace_id, reservation_id, event_type, actor_id, occurred_at, detail_json)
        VALUES (:id, :companyId, :workspaceId, :reservationId, 'candidate_reserved', :actorId, :occurredAt, :detailJson)`).run({
        id: stableId("dev087-soft-archive-correction-event", operation.companyId, operation.sourceIdentity, reservation.id),
        companyId: operation.companyId,
        workspaceId: operation.sourceIdentity,
        reservationId: reservation.id,
        actorId: operation.ownerId,
        occurredAt: restoredAt,
        detailJson: JSON.stringify({ reason: "dev087_soft_archive_correction", supersedesEventId: archiveEventId })
      });
    }
    const restoredWorkspace = database.prepare(`UPDATE numbering_draft_workspaces
      SET lifecycle_status = 'active', row_version = row_version + 1,
          cancelled_at = NULL, cancelled_by = NULL, cancel_reason = NULL, updated_at = :restoredAt
      WHERE id = :sourceIdentity AND company_id = :companyId
        AND lifecycle_status = 'cancelled' AND cancel_reason = :reason`).run({ ...operation, restoredAt });
    if (restoredWorkspace.changes !== 1) throw new Error(`DEV087_SOFT_ARCHIVE_RESTORE_WORKSPACE_FAILED:${operation.sourceIdentity}`);
    return;
  }
  if (operation.kind === "soft_archive_unapproved_part_only_workspace") {
    const current = database.prepare(`SELECT id, company_id, owner_id, created_by, row_version, lifecycle_status, draft_mode,
        source_root_id, source_drawing_number_id, source_part_number_id
      FROM numbering_draft_workspaces WHERE id = :sourceIdentity AND company_id = :companyId`).get(operation);
    if (!current || current.lifecycle_status !== operation.expectedLifecycle || Number(current.row_version) !== Number(operation.expectedRowVersion)
      || current.owner_id !== operation.ownerId) {
      throw new Error(`DEV087_LEGACY_SOFT_ARCHIVE_SOURCE_CHANGED:${operation.sourceIdentity}`);
    }
    const actualEvidence = legacyWorkspaceEvidence(current);
    if (stableHash(actualEvidence) !== stableHash(operation.evidence) || !isDisposableUnapprovedPartOnly(current, actualEvidence)) {
      throw new Error(`DEV087_LEGACY_SOFT_ARCHIVE_EVIDENCE_CHANGED:${operation.sourceIdentity}`);
    }
    const reservations = database.prepare(`SELECT id, reservation_state, approval_request_id, promoted_master_id
      FROM number_candidate_reservations WHERE workspace_id = :sourceIdentity AND company_id = :companyId ORDER BY id`).all(operation);
    if (reservations.length !== 2 || reservations.some((row) => row.reservation_state !== "active" || row.approval_request_id !== null || row.promoted_master_id !== null)) {
      throw new Error(`DEV087_LEGACY_SOFT_ARCHIVE_RESERVATION_CHANGED:${operation.sourceIdentity}`);
    }
    const archivedAt = new Date().toISOString();
    for (const reservation of reservations) {
      const updated = database.prepare(`UPDATE number_candidate_reservations
        SET reservation_state = 'recycled', row_version = row_version + 1,
            recycled_at = :archivedAt, recycled_by = :ownerId, recycle_reason = :reason, updated_at = :archivedAt
        WHERE id = :reservationId AND company_id = :companyId AND reservation_state = 'active'`).run({
        reservationId: reservation.id,
        companyId: operation.companyId,
        archivedAt,
        ownerId: operation.ownerId,
        reason: operation.reason
      });
      if (updated.changes !== 1) throw new Error(`DEV087_LEGACY_SOFT_ARCHIVE_RESERVATION_UPDATE_FAILED:${reservation.id}`);
      database.prepare(`INSERT OR IGNORE INTO number_candidate_events
        (id, company_id, workspace_id, reservation_id, event_type, actor_id, occurred_at, detail_json)
        VALUES (:id, :companyId, :workspaceId, :reservationId, 'candidate_recycled', :actorId, :occurredAt, :detailJson)`).run({
        id: stableId("dev087-soft-archive-event", operation.companyId, operation.sourceIdentity, reservation.id),
        companyId: operation.companyId,
        workspaceId: operation.sourceIdentity,
        reservationId: reservation.id,
        actorId: operation.ownerId,
        occurredAt: archivedAt,
        detailJson: JSON.stringify({ reason: operation.reason })
      });
    }
    const archived = database.prepare(`UPDATE numbering_draft_workspaces
      SET lifecycle_status = 'cancelled', row_version = row_version + 1,
          cancelled_at = :archivedAt, cancelled_by = :ownerId, cancel_reason = :reason, updated_at = :archivedAt
      WHERE id = :sourceIdentity AND company_id = :companyId AND lifecycle_status = 'active' AND row_version = :expectedRowVersion`).run({
      ...operation,
      archivedAt
    });
    if (archived.changes !== 1) throw new Error(`DEV087_LEGACY_SOFT_ARCHIVE_INCOMPLETE:${operation.sourceIdentity}`);
    return;
  }
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
  if (operation.kind === "insert_work_file_snapshot") {
    const source = database.prepare(`SELECT file.id AS file_binding_id, file.company_id, revision.drawing_id, file.drawing_revision_id,
        file.source_file_asset_id, file.sort_order, file.removed_at, asset.id AS asset_id, asset.content_hash, asset.deleted_at
      FROM drawing_revision_files file
      JOIN drawing_revisions revision ON revision.id = file.drawing_revision_id AND revision.company_id = file.company_id
      LEFT JOIN file_assets asset ON asset.id = file.source_file_asset_id
      WHERE file.id = :fileBindingId AND file.company_id = :companyId`).get(operation.source);
    if (!source || source.drawing_id !== operation.source.drawingId || source.drawing_revision_id !== operation.source.revisionId
      || source.removed_at !== null || !source.asset_id || source.deleted_at !== null || !source.content_hash
      || source.content_hash !== operation.row.content_hash || Number(source.sort_order) !== Number(operation.row.ordinal)) {
      throw new Error(`DEV092_WORK_FILE_SOURCE_DRIFT:${operation.row.work_id}:${operation.row.file_binding_id}`);
    }
    const existing = database.prepare("SELECT work_id, file_binding_id, ordinal, content_hash FROM drawing_revision_work_files WHERE work_id = :work_id AND file_binding_id = :file_binding_id").get(operation.row);
    if (existing && (Number(existing.ordinal) !== Number(operation.row.ordinal) || existing.content_hash !== operation.row.content_hash)) {
      throw new Error(`DEV092_WORK_FILE_TARGET_DRIFT:${operation.row.work_id}:${operation.row.file_binding_id}`);
    }
    database.prepare("INSERT OR IGNORE INTO drawing_revision_work_files (work_id, file_binding_id, ordinal, content_hash) VALUES (:work_id, :file_binding_id, :ordinal, :content_hash)").run(operation.row);
    return;
  }
  if (!operation.row) throw new Error(`DEV087_UNKNOWN_MIGRATION_OPERATION:${operation.kind ?? "missing_row"}`);
  const entries = Object.entries(operation.row);
  const columns = entries.map(([key]) => key);
  const params = Object.fromEntries(entries);
  database.prepare(`INSERT OR IGNORE INTO ${operation.table} (${columns.join(", ")}) VALUES (${columns.map((column) => `:${column}`).join(", ")})`).run(params);
  const identityColumn = operation.table === "pdm_review_traces" ? "review_cycle_id" : "id";
  const identityValue = operation.row[identityColumn];
  if (!identityValue) throw new Error(`DEV087_TARGET_IDENTITY_MISSING:${operation.table}`);
  const target = database.prepare(`SELECT ${columns.join(", ")} FROM ${operation.table} WHERE ${identityColumn} = ?`).get(identityValue);
  if (!target) throw new Error(`DEV087_TARGET_INSERT_CONFLICT:${operation.table}:${identityValue}`);
  const drift = entries.filter(([column, expected]) => {
    const actual = target[column];
    if (actual === null || expected === null) return actual !== expected;
    return String(actual) !== String(expected);
  });
  if (drift.length > 0) {
    throw new Error(`DEV087_TARGET_ROW_DRIFT:${operation.table}:${identityValue}:${drift.map(([column]) => column).join(",")}`);
  }
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
  for (const table of ["part_roots", "part_numbers", "drawing_numbers", "drawing_part_links", "pdm_workbench_aggregates", "canonical_workbench_states", "drawing_rd_branches", "drawing_revision_claims", "drawing_revision_works", "drawing_revision_work_files", "part_change_works", "relation_change_works", "pdm_review_traces", "pdm_workbench_migration_quarantine"]) {
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
