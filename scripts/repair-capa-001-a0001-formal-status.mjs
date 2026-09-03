#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const root = process.cwd();
const args = new Map(process.argv.slice(2).map((entry) => {
  const separator = entry.indexOf("=");
  return separator === -1 ? [entry, true] : [entry.slice(0, separator), entry.slice(separator + 1)];
}));
const mode = String(args.get("--mode") ?? "dry-run");
const databasePath = path.resolve(String(args.get("--database") ?? ""));
const primaryDatabasePath = path.resolve(root, "data", "ai-pdm.sqlite");
const evidenceRoot = path.resolve(root, "output", "qa", "capa-001-formal-data-repair");
const runId = `CAPA001-A0001-FORMAL-${new Date().toISOString().replace(/[:.]/gu, "-")}-${mode}`;
const outputDir = path.resolve(String(args.get("--output-dir") ?? path.join(evidenceRoot, runId)));
const expectedFingerprint = String(args.get("--expected-fingerprint") ?? "").trim();
const expectedPlanHash = String(args.get("--expected-plan-hash") ?? "").trim();
const expectedRepairCount = Number(args.get("--expected-repair-count") ?? Number.NaN);
const actorId = String(args.get("--actor") ?? "user-codex-local-admin").trim();
const applyConfirmation = "APPLY_CAPA001_A0001_FORMAL_REPAIR";
const primaryConfirmation = "APPLY_PRIMARY_CAPA001_A0001_FORMAL_REPAIR";
const authorization = "USER_AUTHORIZED_FORMAL_DATA_REPAIR_2026-09-02";
const isApply = mode === "apply";
const isRehearsal = mode === "rehearsal";
const isPrimary = databasePath === primaryDatabasePath;

const target = Object.freeze({
  companyId: "company-jenfu",
  rootId: "13a80f7e-bbeb-4da6-9e3a-ca1e21cafce1",
  rootCode: "A0001",
  partId: "0a81c6e6-089c-4881-926c-819ff141734c",
  partNumber: "A0001-P01",
  drawingNumberId: "8298306b-2575-42a9-9de4-8edf44a9b864",
  drawingNumber: "A0001-M01",
  drawingId: "drawing-formal-8298306b-2575-42a9-9de4-8edf44a9b864",
  linkId: "731e1c73-c6e0-4e79-99da-d0f5d33cc0fb",
  canonicalStateId: "8604a438-de47-41a3-af98-3adad9d8d9f8"
});
const auditId = deterministicUuid("CAPA-001:A0001-P01:formal-data-repair:2026-09-02");
const repairAction = "capa.formal_data_repair.applied";
const relevantTables = [
  "part_roots",
  "part_numbers",
  "drawing_numbers",
  "drawing_part_links",
  "drawings",
  "drawing_revisions",
  "canonical_workbench_states",
  "part_change_works",
  "pdm_work_review_requests",
  "part_approved_change_snapshots",
  "pdm_review_traces",
  "approval_requests",
  "approval_platform_requests",
  "approval_platform_targets",
  "approval_platform_decisions",
  "approval_platform_events",
  "submissions",
  "audit_logs",
  "users"
];

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

assert(["dry-run", "rehearsal", "apply"].includes(mode), `CAPA001_MODE_INVALID:${mode}`);
assert(args.has("--database") && databasePath.toLowerCase().endsWith(".sqlite"), "CAPA001_EXPLICIT_SQLITE_DATABASE_REQUIRED");
assert(fs.existsSync(databasePath), `CAPA001_DATABASE_NOT_FOUND:${databasePath}`);
assert(outputDir.startsWith(`${evidenceRoot}${path.sep}`), "CAPA001_EVIDENCE_PATH_OUTSIDE_ALLOWED_ROOT");
assert(!fs.existsSync(outputDir), `CAPA001_EVIDENCE_PATH_ALREADY_EXISTS:${outputDir}`);
if (isRehearsal || isApply) {
  assert(expectedFingerprint, "CAPA001_EXPECTED_FINGERPRINT_REQUIRED");
  assert(expectedPlanHash, "CAPA001_EXPECTED_PLAN_HASH_REQUIRED");
  assert(Number.isInteger(expectedRepairCount) && expectedRepairCount === 4, "CAPA001_EXPECTED_REPAIR_COUNT_MUST_BE_4");
}
if (isApply) {
  assert(isPrimary, "CAPA001_APPLY_PRIMARY_DATABASE_ONLY");
  assert(args.get("--confirm") === applyConfirmation, "CAPA001_APPLY_CONFIRMATION_REQUIRED");
  assert(args.get("--confirm-primary") === primaryConfirmation, "CAPA001_PRIMARY_CONFIRMATION_REQUIRED");
  assert(args.get("--authorization") === authorization, "CAPA001_USER_AUTHORIZATION_REQUIRED");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function hashJson(value) {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function hashFile(filePath) {
  const digest = crypto.createHash("sha256");
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return digest.digest("hex");
}

function deterministicUuid(seed) {
  const bytes = crypto.createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function tableExists(database, table) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function exactRows(database, sql, parameters = []) {
  return database.prepare(sql).all(...parameters);
}

function collectInventory(database) {
  for (const table of relevantTables) assert(tableExists(database, table), `CAPA001_REQUIRED_TABLE_MISSING:${table}`);

  const rootRows = exactRows(database, "SELECT * FROM part_roots WHERE company_id=? AND (id=? OR root_code=?) ORDER BY id", [target.companyId, target.rootId, target.rootCode]);
  const partRows = exactRows(database, "SELECT * FROM part_numbers WHERE company_id=? AND (id=? OR part_number=?) ORDER BY id", [target.companyId, target.partId, target.partNumber]);
  const drawingNumberRows = exactRows(database, "SELECT * FROM drawing_numbers WHERE company_id=? AND (id=? OR drawing_number=?) ORDER BY id", [target.companyId, target.drawingNumberId, target.drawingNumber]);
  const rootParts = exactRows(database, "SELECT id,part_number,record_status FROM part_numbers WHERE company_id=? AND part_root_id=? ORDER BY id", [target.companyId, target.rootId]);
  const rootDrawings = exactRows(database, "SELECT id,drawing_number,record_status FROM drawing_numbers WHERE company_id=? AND part_root_id=? ORDER BY id", [target.companyId, target.rootId]);
  const linkRows = exactRows(database, "SELECT * FROM drawing_part_links WHERE id=? OR drawing_number_id=? OR part_number_id=? ORDER BY id", [target.linkId, target.drawingNumberId, target.partId]);
  const drawingRows = exactRows(database, "SELECT * FROM drawings WHERE company_id=? AND (id=? OR formal_drawing_number_id=?) ORDER BY id", [target.companyId, target.drawingId, target.drawingNumberId]);
  const revisionRows = exactRows(database, "SELECT * FROM drawing_revisions WHERE company_id=? AND drawing_id=? ORDER BY id", [target.companyId, target.drawingId]);
  const canonicalStates = exactRows(database, `SELECT * FROM canonical_workbench_states
    WHERE company_id=? AND (id=? OR canonical_entity_id IN (?,?)) ORDER BY id`, [target.companyId, target.canonicalStateId, target.partId, target.drawingId]);
  const activeWorks = exactRows(database, "SELECT id,row_version FROM part_change_works WHERE company_id=? AND part_id=? ORDER BY id", [target.companyId, target.partId]);
  const activeReviews = exactRows(database, `SELECT id,request_status,review_cycle_id FROM pdm_work_review_requests
    WHERE company_id=? AND canonical_entity_id=? ORDER BY id`, [target.companyId, target.partId]);
  const approvedSnapshots = exactRows(database, `SELECT id,content_hash,formalized_at FROM part_approved_change_snapshots
    WHERE company_id=? AND part_id=? ORDER BY id`, [target.companyId, target.partId]);
  const reviewTraces = exactRows(database, `SELECT review_cycle_id,decision_at FROM pdm_review_traces
    WHERE company_id=? AND canonical_entity_id=? ORDER BY review_cycle_id`, [target.companyId, target.partId]);
  const entityIds = [target.rootId, target.partId, target.drawingNumberId, target.drawingId];
  const entityPlaceholders = entityIds.map(() => "?").join(",");
  const legacyApprovals = exactRows(database, `SELECT id,action_code,entity_type,entity_id,request_status,resolved_at,resolved_by
    FROM approval_requests WHERE company_id=? AND entity_id IN (${entityPlaceholders}) ORDER BY id`, [target.companyId, ...entityIds]);
  const platformTargets = exactRows(database, `SELECT target.*,request.request_status,request.apply_status
    FROM approval_platform_targets target
    JOIN approval_platform_requests request ON request.id=target.request_id
    WHERE request.company_id=? AND target.target_id IN (${entityPlaceholders}) ORDER BY target.id`, [target.companyId, ...entityIds]);
  const submissions = exactRows(database, `SELECT id,drawing_number,revision,status,released_at,source_entity_type,source_entity_id
    FROM submissions WHERE company_id=? AND (drawing_number=? OR source_entity_id IN (?,?)) ORDER BY id`, [target.companyId, target.drawingNumber, target.drawingNumberId, target.drawingId]);
  const releaseAudits = exactRows(database, `SELECT id,actor_id,action,detail_json,created_at FROM audit_logs
    WHERE action='numbering.release.approved' AND detail_json LIKE ? ORDER BY id`, [`%${target.partNumber}%`]);
  const repairAudits = exactRows(database, "SELECT id,actor_id,action,detail_json,created_at FROM audit_logs WHERE id=? OR action=? AND detail_json LIKE ? ORDER BY id", [auditId, repairAction, `%${target.partNumber}%`]);
  const actorRows = exactRows(database, `SELECT id,display_name,role,company_id,account_status,system_role_enabled
    FROM users WHERE id=? ORDER BY id`, [actorId]);
  const quickCheck = database.pragma("quick_check");
  const foreignKeyViolations = database.pragma("foreign_key_check");
  const schema = database.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_master
    WHERE type IN ('table','index','trigger') AND tbl_name IN (${relevantTables.map(() => "?").join(",")})
    ORDER BY type,name`).all(...relevantTables);

  const blockers = [];
  const root = rootRows[0] ?? null;
  const part = partRows[0] ?? null;
  const drawingNumber = drawingNumberRows[0] ?? null;
  const drawing = drawingRows[0] ?? null;
  const actor = actorRows[0] ?? null;
  if (rootRows.length !== 1 || root?.id !== target.rootId || root?.root_code !== target.rootCode) blockers.push(`ROOT_IDENTITY_COUNT_${rootRows.length}`);
  if (partRows.length !== 1 || part?.id !== target.partId || part?.part_number !== target.partNumber || part?.part_root_id !== target.rootId) blockers.push(`PART_IDENTITY_COUNT_${partRows.length}`);
  if (drawingNumberRows.length !== 1 || drawingNumber?.id !== target.drawingNumberId || drawingNumber?.drawing_number !== target.drawingNumber || drawingNumber?.part_root_id !== target.rootId) blockers.push(`DRAWING_NUMBER_IDENTITY_COUNT_${drawingNumberRows.length}`);
  if (rootParts.length !== 1 || rootParts[0]?.id !== target.partId) blockers.push(`ROOT_PART_SCOPE_COUNT_${rootParts.length}`);
  if (rootDrawings.length !== 1 || rootDrawings[0]?.id !== target.drawingNumberId) blockers.push(`ROOT_DRAWING_SCOPE_COUNT_${rootDrawings.length}`);
  if (linkRows.length !== 1 || linkRows[0]?.id !== target.linkId || linkRows[0]?.drawing_number_id !== target.drawingNumberId || linkRows[0]?.part_number_id !== target.partId || linkRows[0]?.link_type !== "primary_manufacturing") blockers.push(`PRIMARY_LINK_SCOPE_COUNT_${linkRows.length}`);
  if (drawingRows.length !== 1 || drawing?.id !== target.drawingId || drawing?.formal_drawing_number_id !== target.drawingNumberId) blockers.push(`UNIFIED_DRAWING_SCOPE_COUNT_${drawingRows.length}`);
  const partFormalStates = canonicalStates.filter((row) => row.entity_type === "part" && row.canonical_entity_id === target.partId && row.data_layer === "part_formal");
  const partWorkStates = canonicalStates.filter((row) => row.entity_type === "part" && row.canonical_entity_id === target.partId && row.data_layer === "part_work");
  if (partFormalStates.length !== 1 || partFormalStates[0]?.id !== target.canonicalStateId || partFormalStates[0]?.handling !== "none") blockers.push(`PART_FORMAL_STATE_COUNT_${partFormalStates.length}`);
  if (partWorkStates.length !== 0) blockers.push(`PART_WORK_STATE_COUNT_${partWorkStates.length}`);
  if (activeWorks.length !== 0) blockers.push(`ACTIVE_PART_WORK_COUNT_${activeWorks.length}`);
  if (activeReviews.length !== 0) blockers.push(`ACTIVE_PART_REVIEW_COUNT_${activeReviews.length}`);
  if (approvedSnapshots.length !== 0 || reviewTraces.length !== 0 || legacyApprovals.length !== 0 || platformTargets.length !== 0 || submissions.length !== 0 || revisionRows.length !== 0 || releaseAudits.length !== 0) blockers.push("RELEASE_EVIDENCE_EMERGED_USE_NORMAL_WORKFLOW");
  if (!actor || actor.company_id !== target.companyId || actor.role !== "Admin" || actor.account_status !== "active" || Number(actor.system_role_enabled) !== 1) blockers.push("REPAIR_ACTOR_NOT_ACTIVE_ADMIN");
  if (quickCheck.length !== 1 || quickCheck[0].quick_check !== "ok") blockers.push("SQLITE_QUICK_CHECK_FAILED");
  if (foreignKeyViolations.length !== 0) blockers.push(`FOREIGN_KEY_VIOLATIONS_${foreignKeyViolations.length}`);

  const statusTuple = [root?.record_status, part?.record_status, drawingNumber?.record_status, drawing?.lifecycle_state];
  const isInitial = canonicalJson(statusTuple) === canonicalJson(["Draft", "Draft", "Draft", "rd_controlled"])
    && drawing?.released_at === null && repairAudits.length === 0;
  const isRepaired = canonicalJson(statusTuple) === canonicalJson(["Released", "Released", "Released", "released"])
    && Boolean(drawing?.released_at) && repairAudits.length === 1 && repairAudits[0]?.id === auditId;
  if (!isInitial && !isRepaired) blockers.push(`LIFECYCLE_PARTIAL_OR_UNEXPECTED:${statusTuple.join("|")}:AUDITS_${repairAudits.length}`);

  const plan = isInitial ? [
    { table: "part_roots", id: target.rootId, field: "record_status", before: "Draft", after: "Released" },
    { table: "part_numbers", id: target.partId, field: "record_status", before: "Draft", after: "Released" },
    { table: "drawing_numbers", id: target.drawingNumberId, field: "record_status", before: "Draft", after: "Released" },
    { table: "drawings", id: target.drawingId, field: "lifecycle_state", before: "rd_controlled", after: "released", releasedAt: "APPLY_TIMESTAMP" }
  ] : [];
  const scopePayload = {
    schema,
    target,
    rootRows,
    partRows,
    drawingNumberRows,
    rootParts,
    rootDrawings,
    linkRows,
    drawingRows,
    revisionRows,
    canonicalStates,
    activeWorks,
    activeReviews,
    approvedSnapshots,
    reviewTraces,
    legacyApprovals,
    platformTargets,
    submissions,
    releaseAudits,
    repairAudits,
    actorRows,
    foreignKeyViolations
  };
  return {
    fingerprint: hashJson(scopePayload),
    planHash: hashJson(plan),
    plan,
    blockers,
    isInitial,
    isRepaired,
    noOp: isRepaired && blockers.length === 0,
    evidence: {
      target,
      statusTuple,
      formalState: partFormalStates[0] ?? null,
      priorApprovalEvidenceFound: false,
      historicalApprovalReconstructed: false,
      activeWorks,
      activeReviews,
      approvedSnapshots,
      reviewTraces,
      legacyApprovals,
      platformTargets,
      submissions,
      revisionRows,
      releaseAudits,
      repairAudits,
      actor: actorRows[0] ?? null,
      quickCheck,
      foreignKeyViolations
    }
  };
}

function tableCounts(database) {
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  return Object.fromEntries(tables.map(({ name }) => [name, Number(database.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get().count)]));
}

function assertReady(inventory, prefix) {
  assert(inventory.blockers.length === 0, `${prefix}_BLOCKED:${inventory.blockers.join(",")}`);
  assert(inventory.isInitial, `${prefix}_INITIAL_STATE_REQUIRED`);
  assert(inventory.plan.length === 4, `${prefix}_REPAIR_COUNT_${inventory.plan.length}`);
}

function assertExpected(inventory, prefix) {
  assert(inventory.fingerprint === expectedFingerprint, `${prefix}_FINGERPRINT_MISMATCH:${expectedFingerprint}:${inventory.fingerprint}`);
  assert(inventory.planHash === expectedPlanHash, `${prefix}_PLAN_HASH_MISMATCH:${expectedPlanHash}:${inventory.planHash}`);
  assert(inventory.plan.length === expectedRepairCount, `${prefix}_REPAIR_COUNT_MISMATCH:${expectedRepairCount}:${inventory.plan.length}`);
}

function verifyBackup(backupPath, expected) {
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
  backup.pragma("query_only=ON");
  try {
    const inventory = collectInventory(backup);
    assert(inventory.fingerprint === expected.fingerprint, "CAPA001_BACKUP_FINGERPRINT_MISMATCH");
    assert(inventory.planHash === expected.planHash, "CAPA001_BACKUP_PLAN_HASH_MISMATCH");
    assert(inventory.plan.length === expected.planCount, "CAPA001_BACKUP_PLAN_COUNT_MISMATCH");
    return {
      path: backupPath,
      sha256: hashFile(backupPath),
      size: fs.statSync(backupPath).size,
      fingerprint: inventory.fingerprint
    };
  } finally {
    backup.close();
  }
}

function applyPlan(database, expectedBefore) {
  database.pragma("foreign_keys=ON");
  database.pragma("busy_timeout=15000");
  const countsBefore = tableCounts(database);
  const schemaVersionBefore = database.pragma("schema_version", { simple: true });
  database.exec("BEGIN IMMEDIATE");
  try {
    const locked = collectInventory(database);
    assertReady(locked, "CAPA001_LOCKED_PRECHECK");
    assertExpected(locked, "CAPA001_LOCKED_PRECHECK");
    assert(locked.fingerprint === expectedBefore.fingerprint, "CAPA001_STATE_CHANGED_AFTER_BACKUP");
    const now = new Date().toISOString();
    const rootUpdate = database.prepare("UPDATE part_roots SET record_status='Released',updated_at=? WHERE company_id=? AND id=? AND root_code=? AND record_status='Draft'").run(now, target.companyId, target.rootId, target.rootCode);
    const partUpdate = database.prepare("UPDATE part_numbers SET record_status='Released',updated_at=? WHERE company_id=? AND id=? AND part_number=? AND part_root_id=? AND record_status='Draft'").run(now, target.companyId, target.partId, target.partNumber, target.rootId);
    const drawingNumberUpdate = database.prepare("UPDATE drawing_numbers SET record_status='Released',updated_at=? WHERE company_id=? AND id=? AND drawing_number=? AND part_root_id=? AND record_status='Draft'").run(now, target.companyId, target.drawingNumberId, target.drawingNumber, target.rootId);
    const drawingUpdate = database.prepare(`UPDATE drawings
      SET lifecycle_state='released',row_version=row_version+1,updated_at=?,released_at=?
      WHERE company_id=? AND id=? AND formal_drawing_number_id=? AND lifecycle_state='rd_controlled' AND released_at IS NULL`).run(now, now, target.companyId, target.drawingId, target.drawingNumberId);
    assert(rootUpdate.changes === 1, `CAPA001_ROOT_UPDATE_COUNT_${rootUpdate.changes}`);
    assert(partUpdate.changes === 1, `CAPA001_PART_UPDATE_COUNT_${partUpdate.changes}`);
    assert(drawingNumberUpdate.changes === 1, `CAPA001_DRAWING_NUMBER_UPDATE_COUNT_${drawingNumberUpdate.changes}`);
    assert(drawingUpdate.changes === 1, `CAPA001_UNIFIED_DRAWING_UPDATE_COUNT_${drawingUpdate.changes}`);

    const auditDetail = {
      capaId: "CAPA-001",
      devId: "DEV-114",
      authorization,
      authorizationScope: "current local primary SQLite A0001 formal-data lifecycle repair",
      repairAuthority: "explicit_user_authorization_in_codex_task",
      actorId,
      executedAt: now,
      reason: "part_formal data layer existed while root, part and drawing lifecycle masters remained Draft; prior approval evidence is absent",
      historicalApprovalReconstructed: false,
      priorApprovalEvidenceFound: false,
      before: { root: "Draft", part: "Draft", drawingNumber: "Draft", drawing: "rd_controlled" },
      after: { root: "Released", part: "Released", drawingNumber: "Released", drawing: "released" },
      target
    };
    const auditInsert = database.prepare(`INSERT INTO audit_logs (id,submission_id,actor_id,action,detail_json,created_at)
      VALUES (?,NULL,?,?,?,?)`).run(auditId, actorId, repairAction, canonicalJson(auditDetail), now);
    assert(auditInsert.changes === 1, `CAPA001_AUDIT_INSERT_COUNT_${auditInsert.changes}`);
    const totalChanges = rootUpdate.changes + partUpdate.changes + drawingNumberUpdate.changes + drawingUpdate.changes + auditInsert.changes;
    assert(totalChanges === 5, `CAPA001_TOTAL_CHANGE_COUNT_${totalChanges}`);

    const after = collectInventory(database);
    assert(after.blockers.length === 0, `CAPA001_POSTCONDITION_BLOCKED:${after.blockers.join(",")}`);
    assert(after.isRepaired && after.noOp && after.plan.length === 0, "CAPA001_POSTCONDITION_NOT_REPAIRED");
    assert(after.evidence.repairAudits.length === 1 && after.evidence.repairAudits[0].id === auditId, "CAPA001_AUDIT_POSTCONDITION_FAILED");
    assert(after.evidence.priorApprovalEvidenceFound === false && after.evidence.historicalApprovalReconstructed === false, "CAPA001_APPROVAL_HISTORY_FABRICATION_GUARD_FAILED");
    const countsAfter = tableCounts(database);
    for (const [table, beforeCount] of Object.entries(countsBefore)) {
      const expectedCount = table === "audit_logs" ? beforeCount + 1 : beforeCount;
      assert(countsAfter[table] === expectedCount, `CAPA001_TABLE_COUNT_CHANGED:${table}:${beforeCount}:${countsAfter[table]}`);
    }
    assert(database.pragma("schema_version", { simple: true }) === schemaVersionBefore, "CAPA001_SCHEMA_VERSION_CHANGED");
    database.exec("COMMIT");
    return { now, totalChanges, updates: { root: 1, part: 1, drawingNumber: 1, drawing: 1, audit: 1 }, after, countsBefore, countsAfter, schemaVersionBefore };
  } catch (error) {
    if (database.inTransaction) database.exec("ROLLBACK");
    throw error;
  }
}

async function createSqliteBackup(sourcePath, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  source.pragma("query_only=ON");
  try {
    await source.backup(destinationPath);
  } finally {
    source.close();
  }
}

fs.mkdirSync(outputDir, { recursive: true });
const runtimeDeclaration = {
  project: root,
  purpose: isApply ? "Authorized CAPA-001 A0001 formal-data lifecycle repair" : isRehearsal ? "CAPA-001 repair rehearsal on task-owned SQLite clone" : "CAPA-001 read-only repair dry-run",
  port: "none",
  owningProcessTree: `single task-owned Node process ${process.pid}; no server or worker started`,
  cleanupCondition: "process exits; rehearsal clone is removed; apply backup and evidence are retained",
  PDM_DATA_DIR: path.resolve(process.env.PDM_DATA_DIR ?? path.dirname(databasePath)),
  PDM_REPOSITORY_DIR: path.resolve(process.env.PDM_REPOSITORY_DIR ?? path.join(path.dirname(databasePath), "repository")),
  mutationScope: isApply ? [databasePath, `${databasePath}-wal`, `${databasePath}-shm`, outputDir] : [outputDir],
  repositoryMutationScope: "none"
};
const manifestPath = path.join(outputDir, "manifest.json");
const manifest = {
  schemaVersion: "capa001-a0001-formal-data-repair-v1",
  capaId: "CAPA-001",
  devId: "DEV-114",
  runId,
  mode,
  status: "IN_PROGRESS",
  databasePath,
  isPrimary,
  authorization: isApply ? authorization : null,
  runtimeDeclaration,
  expected: isRehearsal || isApply ? { fingerprint: expectedFingerprint, planHash: expectedPlanHash, repairCount: expectedRepairCount } : null,
  before: null,
  backup: null,
  rehearsal: null,
  apply: null,
  after: null,
  recovery: null,
  error: null,
  startedAt: new Date().toISOString()
};

console.log(JSON.stringify({ runtimeDeclaration }, null, 2));

try {
  const preflight = new Database(databasePath, { readonly: true, fileMustExist: true });
  preflight.pragma("query_only=ON");
  let before;
  try {
    before = collectInventory(preflight);
  } finally {
    preflight.close();
  }
  manifest.before = before;

  if (before.noOp) {
    manifest.status = "NO_OP";
    manifest.after = before;
  } else if (mode === "dry-run") {
    assertReady(before, "CAPA001_DRY_RUN");
    manifest.status = "READY";
  } else if (isRehearsal) {
    assertReady(before, "CAPA001_REHEARSAL_PRECHECK");
    assertExpected(before, "CAPA001_REHEARSAL_PRECHECK");
    const cloneDir = path.join(outputDir, "task-owned-rehearsal");
    const clonePath = path.join(cloneDir, "ai-pdm.sqlite");
    try {
      await createSqliteBackup(databasePath, clonePath);
      const verified = verifyBackup(clonePath, { fingerprint: before.fingerprint, planHash: before.planHash, planCount: before.plan.length });
      const clone = new Database(clonePath, { fileMustExist: true });
      try {
        manifest.rehearsal = { backup: verified, apply: applyPlan(clone, before) };
      } finally {
        clone.close();
      }
    } finally {
      if (fs.existsSync(clonePath)) fs.unlinkSync(clonePath);
      if (fs.existsSync(cloneDir)) fs.rmdirSync(cloneDir);
    }
    manifest.rehearsal.cloneCleanup = { removed: true, path: clonePath };
    const sourceAfter = new Database(databasePath, { readonly: true, fileMustExist: true });
    sourceAfter.pragma("query_only=ON");
    try {
      const unchanged = collectInventory(sourceAfter);
      assert(unchanged.fingerprint === before.fingerprint, "CAPA001_REHEARSAL_MUTATED_SOURCE");
      manifest.after = unchanged;
    } finally {
      sourceAfter.close();
    }
    manifest.status = "PASS";
  } else {
    assertReady(before, "CAPA001_APPLY_PRECHECK");
    assertExpected(before, "CAPA001_APPLY_PRECHECK");
    const backupPath = path.join(outputDir, "backup", "ai-pdm.sqlite");
    await createSqliteBackup(databasePath, backupPath);
    manifest.backup = { retained: true, ...verifyBackup(backupPath, { fingerprint: before.fingerprint, planHash: before.planHash, planCount: before.plan.length }) };
    const writeDatabase = new Database(databasePath, { fileMustExist: true });
    try {
      manifest.apply = applyPlan(writeDatabase, before);
    } finally {
      writeDatabase.close();
    }
    const finalDatabase = new Database(databasePath, { readonly: true, fileMustExist: true });
    finalDatabase.pragma("query_only=ON");
    try {
      const after = collectInventory(finalDatabase);
      assert(after.noOp && after.isRepaired && after.blockers.length === 0, "CAPA001_FINAL_POSTCONDITION_FAILED");
      manifest.after = after;
    } finally {
      finalDatabase.close();
    }
    manifest.recovery = {
      method: "restore retained SQLite backup only under a separately authorized maintenance window",
      backupPath,
      backupSha256: manifest.backup.sha256,
      warning: "Do not copy over a live SQLite database; stop only the verified primary runtime before any restore."
    };
    manifest.status = "PASS";
  }
} catch (error) {
  manifest.status = "FAILED";
  manifest.error = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
} finally {
  manifest.completedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  status: manifest.status,
  mode,
  databasePath,
  fingerprint: manifest.before?.fingerprint ?? null,
  planHash: manifest.before?.planHash ?? null,
  repairCount: manifest.before?.plan?.length ?? null,
  statusTupleBefore: manifest.before?.evidence?.statusTuple ?? null,
  rehearsalStatusTuple: manifest.rehearsal?.apply?.after?.evidence?.statusTuple ?? null,
  sourceStatusTupleAfter: manifest.after?.evidence?.statusTuple ?? null,
  backup: manifest.backup,
  manifest: manifestPath,
  error: manifest.error?.message ?? null
}, null, 2));
if (!["READY", "PASS", "NO_OP"].includes(manifest.status)) process.exitCode = 2;
