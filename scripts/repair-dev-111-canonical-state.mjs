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
const evidenceRoot = path.resolve(root, "output", "qa", "dev-111-primary-repair");
const runId = `DEV111-CANONICAL-STATE-${new Date().toISOString().replace(/[:.]/gu, "-")}-${mode}`;
const outputDir = path.resolve(String(args.get("--output-dir") ?? path.join(evidenceRoot, runId)));
const expectedFingerprint = String(args.get("--expected-fingerprint") ?? "").trim();
const expectedPlanHash = String(args.get("--expected-plan-hash") ?? "").trim();
const expectedRepairCount = Number(args.get("--expected-repair-count") ?? Number.NaN);
const requiredPartNumber = String(args.get("--require-part") ?? "A0044-P01").trim();
const confirmation = "APPLY_DEV111_CANONICAL_STATE";
const primaryConfirmation = "APPLY_PRIMARY_DEV111_CANONICAL_STATE";
const authorization = "USER_APPROVED_REPAIR_DISAPPEARED_DATA_2026-09-01";
const isApply = mode === "apply";
const isPrimary = databasePath === primaryDatabasePath;

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

assert(["dry-run", "apply"].includes(mode), `DEV111_MODE_INVALID:${mode}`);
assert(args.has("--database") && databasePath.toLowerCase().endsWith(".sqlite"), "DEV111_EXPLICIT_SQLITE_DATABASE_REQUIRED");
assert(fs.existsSync(databasePath), `DEV111_DATABASE_NOT_FOUND:${databasePath}`);
assert(outputDir.startsWith(`${evidenceRoot}${path.sep}`), "DEV111_EVIDENCE_PATH_OUTSIDE_ALLOWED_ROOT");
assert(!fs.existsSync(outputDir), `DEV111_EVIDENCE_PATH_ALREADY_EXISTS:${outputDir}`);
if (isApply) {
  assert(args.get("--confirm") === confirmation, "DEV111_APPLY_CONFIRMATION_REQUIRED");
  assert(expectedFingerprint, "DEV111_EXPECTED_FINGERPRINT_REQUIRED");
  assert(expectedPlanHash, "DEV111_EXPECTED_PLAN_HASH_REQUIRED");
  assert(Number.isInteger(expectedRepairCount) && expectedRepairCount >= 0, "DEV111_EXPECTED_REPAIR_COUNT_REQUIRED");
  if (isPrimary) {
    assert(args.get("--confirm-primary") === primaryConfirmation, "DEV111_PRIMARY_CONFIRMATION_REQUIRED");
    assert(args.get("--authorization") === authorization, "DEV111_PRIMARY_AUTHORIZATION_REQUIRED");
  }
}

fs.mkdirSync(outputDir, { recursive: true });

const relevantTables = [
  "canonical_workbench_states",
  "pdm_workbench_aggregates",
  "part_approved_change_snapshots",
  "part_change_works",
  "pdm_work_review_requests",
  "pdm_review_traces",
  "pdm_work_review_terminal_receipts",
  "platform_command_receipts",
  "part_variant_attributes",
  "part_numbers",
  "part_roots",
  "drawing_part_links",
  "drawing_numbers",
  "drawings"
];
const orderBy = {
  canonical_workbench_states: "id",
  pdm_workbench_aggregates: "id",
  part_approved_change_snapshots: "id",
  part_change_works: "id",
  pdm_work_review_requests: "id",
  pdm_review_traces: "review_cycle_id",
  pdm_work_review_terminal_receipts: "request_id",
  platform_command_receipts: "id",
  part_variant_attributes: "id",
  part_numbers: "id",
  part_roots: "id",
  drawing_part_links: "id",
  drawing_numbers: "id",
  drawings: "id"
};
const snapshotPayloadKeys = new Set([
  "partName", "itemKind", "customSpecification", "isUniversal", "bomUsagePolicy",
  "materialCode", "materialLabel", "colorCode", "colorLabel", "surfaceTreatment",
  "variantNote", "baseUomCode"
]);

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
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

function parseObject(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function tableColumns(database, table) {
  return new Set(database.pragma(`table_info(${table})`).map((row) => row.name));
}

function tableRows(database, table) {
  assert(relevantTables.includes(table), `DEV111_UNSAFE_TABLE:${table}`);
  if (table === "platform_command_receipts") {
    return database.prepare(`SELECT * FROM platform_command_receipts
      WHERE command_name IN ('dev087:part.create','dev087:part.update','dev087:part.submit','dev087:review.decision')
      ORDER BY id`).all();
  }
  return database.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy[table]}`).all();
}

function scopedSnapshot(database) {
  const schema = database.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_master
    WHERE type IN ('table','index','trigger')
      AND (tbl_name IN (${relevantTables.map(() => "?").join(",")}) OR name IN (${relevantTables.map(() => "?").join(",")}))
    ORDER BY type,name`).all(...relevantTables, ...relevantTables);
  const rows = Object.fromEntries(relevantTables.map((table) => [table, tableRows(database, table)]));
  const payload = { schema, rows, foreignKeys: database.pragma("foreign_key_check") };
  return {
    hash: hashJson(payload),
    tableHashes: Object.fromEntries(Object.entries(rows).map(([table, entries]) => [table, hashJson(entries)])),
    counts: Object.fromEntries(Object.entries(rows).map(([table, entries]) => [table, entries.length]))
  };
}

function currentPayloadFromRow(row, partColumns) {
  return {
    partName: row.part_name,
    itemKind: row.item_kind,
    customSpecification: row.custom_specification ?? null,
    isUniversal: Boolean(row.is_universal),
    bomUsagePolicy: row.bom_usage_policy,
    materialCode: row.material_code ?? null,
    materialLabel: row.material_label ?? null,
    colorCode: row.color_code ?? null,
    colorLabel: row.color_label ?? null,
    surfaceTreatment: row.surface_treatment ?? null,
    variantNote: row.variant_note ?? null,
    baseUomCode: partColumns.has("base_uom_code") ? row.base_uom_code ?? null : null
  };
}

function projectPayload(current, approved) {
  return Object.fromEntries(Object.keys(approved).map((key) => [key, current[key] ?? null]));
}

function collectInventory(database) {
  const partColumns = tableColumns(database, "part_numbers");
  const baseUomSelection = partColumns.has("base_uom_code") ? ", p.base_uom_code" : "";
  const noStateParts = database.prepare(`SELECT p.id,p.company_id,p.part_root_id,p.part_number,p.part_name,p.item_kind,
      p.custom_specification,p.is_universal,p.bom_usage_policy,p.record_status,p.updated_at${baseUomSelection},
      v.material_code,v.material_label,v.color_code,v.color_label,v.surface_treatment,v.variant_note,
      (SELECT COUNT(*) FROM drawing_part_links link WHERE link.part_number_id=p.id) AS relation_link_count
    FROM part_numbers p
    LEFT JOIN part_variant_attributes v ON v.part_number_id=p.id
    WHERE NOT EXISTS (
      SELECT 1 FROM canonical_workbench_states state
      WHERE state.company_id=p.company_id AND state.entity_type='part' AND state.canonical_entity_id=p.id
    )
    ORDER BY p.company_id,p.part_number,p.id`).all();
  const repairable = [];
  const blocked = [];

  for (const part of noStateParts) {
    const blockers = [];
    const aggregates = database.prepare(`SELECT * FROM pdm_workbench_aggregates
      WHERE company_id=? AND entity_type='part' AND canonical_entity_id=? ORDER BY id`).all(part.company_id, part.id);
    const works = database.prepare("SELECT id,row_version FROM part_change_works WHERE company_id=? AND part_id=? ORDER BY id").all(part.company_id, part.id);
    const reviews = database.prepare(`SELECT id,request_status,review_cycle_id FROM pdm_work_review_requests
      WHERE company_id=? AND entity_type='part' AND canonical_entity_id=? ORDER BY id`).all(part.company_id, part.id);
    const snapshots = database.prepare(`SELECT * FROM part_approved_change_snapshots
      WHERE company_id=? AND part_id=? ORDER BY formalized_at DESC,id DESC`).all(part.company_id, part.id);
    const snapshot = snapshots[0] ?? null;
    const stateId = deterministicUuid(`DEV111:part_formal:${part.company_id}:${part.id}`);
    const stateIdCollision = database.prepare("SELECT id,company_id,entity_type,canonical_entity_id,data_layer FROM canonical_workbench_states WHERE id=?").get(stateId) ?? null;
    const root = database.prepare("SELECT id FROM part_roots WHERE company_id=? AND id=?").get(part.company_id, part.part_root_id) ?? null;

    if (aggregates.length !== 1) blockers.push(`AGGREGATE_COUNT_${aggregates.length}`);
    if (aggregates.length === 1 && Number(aggregates[0].open_branch_count) !== 0) blockers.push(`OPEN_BRANCH_COUNT_${aggregates[0].open_branch_count}`);
    if (works.length !== 0) blockers.push(`ACTIVE_WORK_COUNT_${works.length}`);
    if (reviews.length !== 0) blockers.push(`ACTIVE_REVIEW_COUNT_${reviews.length}`);
    if (!snapshot) blockers.push("APPROVED_SNAPSHOT_MISSING");
    if (!root) blockers.push("PART_ROOT_MISSING");
    if (stateIdCollision) blockers.push("DETERMINISTIC_STATE_ID_COLLISION");

    let trace = null;
    let decisionReceipts = [];
    let submitReceipt = null;
    let terminalReceipt = null;
    let currentPayload = null;
    let approvedPayload = null;
    let expectedContentHash = null;
    if (snapshot) {
      const beforePayload = parseObject(snapshot.before_payload);
      approvedPayload = parseObject(snapshot.after_payload);
      if (!beforePayload) blockers.push("BEFORE_PAYLOAD_INVALID");
      if (!approvedPayload) blockers.push("AFTER_PAYLOAD_INVALID");
      if (approvedPayload && Object.keys(approvedPayload).some((key) => !snapshotPayloadKeys.has(key))) blockers.push("AFTER_PAYLOAD_UNSUPPORTED_KEY");
      currentPayload = currentPayloadFromRow(part, partColumns);
      if (approvedPayload && hashJson(projectPayload(currentPayload, approvedPayload)) !== hashJson(approvedPayload)) blockers.push("CURRENT_MASTER_DIFFERS_FROM_APPROVED_SNAPSHOT");

      const traces = database.prepare(`SELECT * FROM pdm_review_traces
        WHERE company_id=? AND entity_type='part' AND canonical_entity_id=? AND decision_at=?
        ORDER BY review_cycle_id`).all(part.company_id, part.id, snapshot.formalized_at);
      if (traces.length !== 1) blockers.push(`MATCHING_REVIEW_TRACE_COUNT_${traces.length}`);
      trace = traces[0] ?? null;
      if (trace && beforePayload && approvedPayload) {
        expectedContentHash = hashJson({ reviewCycleId: trace.review_cycle_id, before: beforePayload, after: approvedPayload });
        if (snapshot.content_hash !== expectedContentHash) blockers.push("APPROVED_SNAPSHOT_HASH_MISMATCH");
        decisionReceipts = database.prepare(`SELECT id,command_name,effect_key,response_json,completed_at
          FROM platform_command_receipts
          WHERE company_id=? AND command_name='dev087:review.decision' AND effect_key=? AND command_status='completed'
          ORDER BY id`).all(part.company_id, `review:${trace.review_cycle_id}`);
        if (decisionReceipts.length < 1 || decisionReceipts.some((receipt) => parseObject(receipt.response_json)?.acknowledged !== true)) {
          blockers.push("APPROVAL_DECISION_RECEIPT_MISSING_OR_INVALID");
        }
        const submitReceipts = database.prepare(`SELECT id,effect_key,response_json,completed_at
          FROM platform_command_receipts
          WHERE company_id=? AND command_name='dev087:part.submit' AND command_status='completed'
          ORDER BY id`).all(part.company_id).filter((receipt) => parseObject(receipt.response_json)?.reviewCycleId === trace.review_cycle_id);
        if (submitReceipts.length !== 1) blockers.push(`SUBMIT_RECEIPT_COUNT_${submitReceipts.length}`);
        submitReceipt = submitReceipts[0] ?? null;
        const requestId = submitReceipt ? parseObject(submitReceipt.response_json)?.requestId : null;
        if (typeof requestId !== "string" || !requestId) blockers.push("SUBMIT_REQUEST_ID_MISSING");
        if (requestId) {
          terminalReceipt = database.prepare("SELECT * FROM pdm_work_review_terminal_receipts WHERE company_id=? AND request_id=?").get(part.company_id, requestId) ?? null;
          if (!terminalReceipt || terminalReceipt.decided_at !== trace.decision_at) blockers.push("TERMINAL_REVIEW_RECEIPT_MISSING_OR_MISMATCHED");
        }
      }
    }

    const evidence = {
      companyId: part.company_id,
      partId: part.id,
      partNumber: part.part_number,
      recordStatus: part.record_status,
      relationLinkCount: Number(part.relation_link_count),
      aggregate: aggregates[0] ?? null,
      snapshot: snapshot ? { id: snapshot.id, contentHash: snapshot.content_hash, formalizedAt: snapshot.formalized_at } : null,
      reviewTrace: trace,
      submitReceipt: submitReceipt ? { id: submitReceipt.id, effectKey: submitReceipt.effect_key, completedAt: submitReceipt.completed_at } : null,
      decisionReceipts: decisionReceipts.map((receipt) => ({ id: receipt.id, effectKey: receipt.effect_key, completedAt: receipt.completed_at })),
      terminalReceipt,
      currentPayload,
      approvedPayload,
      expectedContentHash,
      stateId,
      blockers
    };
    if (blockers.length === 0) repairable.push(evidence);
    else blocked.push(evidence);
  }

  const numberedDrawingsWithoutState = database.prepare(`SELECT number.id,number.company_id,number.drawing_number,COUNT(drawing.id) AS drawing_count
    FROM drawing_numbers number
    LEFT JOIN drawings drawing ON drawing.company_id=number.company_id AND drawing.formal_drawing_number_id=number.id
    WHERE NOT EXISTS (
      SELECT 1 FROM canonical_workbench_states state
      JOIN drawings state_drawing ON state_drawing.id=state.canonical_entity_id AND state_drawing.company_id=state.company_id
      WHERE state.company_id=number.company_id AND state.entity_type='drawing' AND state_drawing.formal_drawing_number_id=number.id
    )
    GROUP BY number.id,number.company_id,number.drawing_number
    ORDER BY number.company_id,number.drawing_number`).all();
  const unnumberedDraftDrawings = database.prepare(`SELECT drawing.id,drawing.company_id,drawing.drawing_number,drawing.created_at
    FROM drawings drawing
    WHERE drawing.formal_drawing_number_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM canonical_workbench_states state WHERE state.company_id=drawing.company_id AND state.entity_type='drawing' AND state.canonical_entity_id=drawing.id)
    ORDER BY drawing.company_id,drawing.id`).all();
  const duplicateLayers = database.prepare(`SELECT company_id,entity_type,canonical_entity_id,data_layer,COUNT(*) AS count
    FROM canonical_workbench_states
    GROUP BY company_id,entity_type,canonical_entity_id,data_layer
    HAVING COUNT(*)>1
    ORDER BY company_id,entity_type,canonical_entity_id,data_layer`).all();
  const requiredPart = database.prepare(`SELECT part.id,part.company_id,part.part_number,
      (SELECT COUNT(*) FROM canonical_workbench_states state
       WHERE state.company_id=part.company_id AND state.entity_type='part' AND state.canonical_entity_id=part.id AND state.data_layer='part_formal') AS formal_state_count,
      (SELECT COUNT(*) FROM canonical_workbench_states state
       WHERE state.company_id=part.company_id AND state.entity_type='part' AND state.canonical_entity_id=part.id AND state.data_layer='part_work') AS work_state_count
    FROM part_numbers part WHERE part.part_number=? ORDER BY part.company_id,part.id`).all(requiredPartNumber);
  const quickCheck = database.pragma("quick_check");
  const foreignKeyViolations = database.pragma("foreign_key_check");
  const plan = repairable.map((entry) => ({
    companyId: entry.companyId,
    partId: entry.partId,
    partNumber: entry.partNumber,
    stateId: entry.stateId,
    dataLayer: "part_formal",
    handling: "none",
    rowVersion: 2,
    createdAt: entry.snapshot.formalizedAt,
    updatedAt: entry.snapshot.formalizedAt,
    sourceSnapshotId: entry.snapshot.id,
    sourceReviewCycleId: entry.reviewTrace.review_cycle_id
  }));
  const globalBlockers = [];
  if (requiredPart.length !== 1) globalBlockers.push(`REQUIRED_PART_COUNT_${requiredPart.length}`);
  if (blocked.length > 0) globalBlockers.push(`AMBIGUOUS_PARTS_WITHOUT_STATE_${blocked.length}`);
  if (numberedDrawingsWithoutState.length > 0) globalBlockers.push(`NUMBERED_DRAWINGS_WITHOUT_STATE_${numberedDrawingsWithoutState.length}`);
  if (duplicateLayers.length > 0) globalBlockers.push(`DUPLICATE_STATE_LAYERS_${duplicateLayers.length}`);
  if (quickCheck.length !== 1 || quickCheck[0].quick_check !== "ok") globalBlockers.push("SQLITE_QUICK_CHECK_FAILED");
  if (foreignKeyViolations.length > 0) globalBlockers.push(`FOREIGN_KEY_VIOLATIONS_${foreignKeyViolations.length}`);
  const requiredFormal = requiredPart.length === 1 && Number(requiredPart[0].formal_state_count) === 1 && Number(requiredPart[0].work_state_count) === 0;
  const noOp = plan.length === 0 && globalBlockers.length === 0 && requiredFormal;
  return {
    summary: {
      partsWithoutState: noStateParts.length,
      repairableParts: repairable.length,
      blockedParts: blocked.length,
      numberedDrawingsWithoutState: numberedDrawingsWithoutState.length,
      excludedUnnumberedDraftDrawings: unnumberedDraftDrawings.length,
      duplicateStateLayers: duplicateLayers.length,
      foreignKeyViolations: foreignKeyViolations.length
    },
    repairable,
    blocked,
    numberedDrawingsWithoutState,
    excludedUnnumberedDraftDrawings: unnumberedDraftDrawings,
    duplicateLayers,
    requiredPart,
    quickCheck,
    foreignKeyViolations,
    plan,
    planHash: hashJson(plan),
    globalBlockers,
    noOp
  };
}

function assertReady(inventory, prefix) {
  assert(inventory.globalBlockers.length === 0, `${prefix}_BLOCKED:${inventory.globalBlockers.join(",")}`);
  assert(inventory.plan.length > 0, `${prefix}_EMPTY_PLAN`);
  assert(inventory.repairable.some((entry) => entry.partNumber === requiredPartNumber), `${prefix}_REQUIRED_PART_NOT_REPAIRABLE:${requiredPartNumber}`);
}

function assertExpected(inventory, fingerprint, prefix) {
  assert(fingerprint === expectedFingerprint, `${prefix}_FINGERPRINT_MISMATCH:${expectedFingerprint}:${fingerprint}`);
  assert(inventory.planHash === expectedPlanHash, `${prefix}_PLAN_HASH_MISMATCH:${expectedPlanHash}:${inventory.planHash}`);
  assert(inventory.plan.length === expectedRepairCount, `${prefix}_REPAIR_COUNT_MISMATCH:${expectedRepairCount}:${inventory.plan.length}`);
}

function verifyBackup(backupPath, expected) {
  const database = new Database(backupPath, { readonly: true, fileMustExist: true });
  database.pragma("query_only=ON");
  try {
    const snapshot = scopedSnapshot(database);
    const inventory = collectInventory(database);
    assert(snapshot.hash === expected.hash, `DEV111_BACKUP_FINGERPRINT_MISMATCH:${expected.hash}:${snapshot.hash}`);
    assert(inventory.planHash === expected.planHash, "DEV111_BACKUP_PLAN_HASH_MISMATCH");
    assert(inventory.plan.length === expected.planCount, "DEV111_BACKUP_PLAN_COUNT_MISMATCH");
    assert(inventory.foreignKeyViolations.length === 0, "DEV111_BACKUP_FOREIGN_KEY_FAILED");
    assert(inventory.quickCheck.length === 1 && inventory.quickCheck[0].quick_check === "ok", "DEV111_BACKUP_QUICK_CHECK_FAILED");
    return { sha256: hashFile(backupPath), size: fs.statSync(backupPath).size, fingerprint: snapshot.hash };
  } finally {
    database.close();
  }
}

function applyPlan(database, beforeInventory, beforeSnapshot) {
  database.pragma("foreign_keys=ON");
  database.pragma("busy_timeout=15000");
  database.exec("BEGIN IMMEDIATE");
  try {
    const lockedSnapshot = scopedSnapshot(database);
    const lockedInventory = collectInventory(database);
    assertReady(lockedInventory, "DEV111_LOCKED_PRECHECK");
    assertExpected(lockedInventory, lockedSnapshot.hash, "DEV111_LOCKED_PRECHECK");
    assert(lockedSnapshot.hash === beforeSnapshot.hash, "DEV111_STATE_CHANGED_AFTER_BACKUP");
    assert(lockedInventory.planHash === beforeInventory.planHash, "DEV111_PLAN_CHANGED_AFTER_BACKUP");

    const insert = database.prepare(`INSERT INTO canonical_workbench_states
      (id,company_id,entity_type,canonical_entity_id,data_layer,branch_id,revision_id,work_id,handling,blocker_reason,row_version,created_at,updated_at)
      VALUES (@stateId,@companyId,'part',@partId,'part_formal',NULL,NULL,NULL,'none',NULL,@rowVersion,@createdAt,@updatedAt)`);
    const inserted = [];
    for (const entry of lockedInventory.plan) {
      const result = insert.run(entry);
      assert(result.changes === 1, `DEV111_INSERT_COUNT_INVALID:${entry.partNumber}:${result.changes}`);
      inserted.push({ ...entry, changes: result.changes });
    }

    const afterSnapshot = scopedSnapshot(database);
    const afterInventory = collectInventory(database);
    for (const table of relevantTables) {
      if (table === "canonical_workbench_states") continue;
      assert(afterSnapshot.tableHashes[table] === lockedSnapshot.tableHashes[table], `DEV111_UNAUTHORIZED_TABLE_MUTATION:${table}`);
    }
    assert(afterSnapshot.counts.canonical_workbench_states === lockedSnapshot.counts.canonical_workbench_states + inserted.length, "DEV111_STATE_COUNT_POSTCONDITION_FAILED");
    assert(afterInventory.plan.length === 0, `DEV111_REPAIR_PLAN_REMAINS:${afterInventory.plan.length}`);
    assert(afterInventory.blocked.length === 0, `DEV111_BLOCKED_PART_REMAINS:${afterInventory.blocked.length}`);
    assert(afterInventory.numberedDrawingsWithoutState.length === 0, `DEV111_DRAWING_STATE_GAP_REMAINS:${afterInventory.numberedDrawingsWithoutState.length}`);
    assert(afterInventory.requiredPart.length === 1 && Number(afterInventory.requiredPart[0].formal_state_count) === 1 && Number(afterInventory.requiredPart[0].work_state_count) === 0, "DEV111_REQUIRED_PART_POSTCONDITION_FAILED");
    assert(afterInventory.foreignKeyViolations.length === 0, "DEV111_POSTCONDITION_FOREIGN_KEY_FAILED");
    assert(afterInventory.quickCheck.length === 1 && afterInventory.quickCheck[0].quick_check === "ok", "DEV111_POSTCONDITION_QUICK_CHECK_FAILED");
    for (const entry of inserted) {
      const row = database.prepare(`SELECT * FROM canonical_workbench_states
        WHERE id=? AND company_id=? AND entity_type='part' AND canonical_entity_id=? AND data_layer='part_formal'`).get(entry.stateId, entry.companyId, entry.partId);
      assert(row && row.handling === "none" && Number(row.row_version) === 2 && row.work_id === null && row.branch_id === null && row.revision_id === null, `DEV111_STATE_ROW_POSTCONDITION_FAILED:${entry.partNumber}`);
    }
    database.exec("COMMIT");
    return { inserted, lockedFingerprint: lockedSnapshot.hash, afterFingerprint: afterSnapshot.hash, afterInventory };
  } catch (error) {
    if (database.inTransaction) database.exec("ROLLBACK");
    throw error;
  }
}

const runtimeDeclaration = {
  project: root,
  purpose: isApply ? "Authorized DEV-111 canonical Part navigation-state repair" : "DEV-111 canonical Part navigation-state read-only dry-run",
  port: "none",
  owningProcessTree: `single task-owned Node process ${process.pid}; no server or worker started`,
  cleanupCondition: "process exits; no runtime remains; backup and evidence are retained as CAPA records",
  PDM_DATA_DIR: path.resolve(process.env.PDM_DATA_DIR ?? path.dirname(databasePath)),
  PDM_REPOSITORY_DIR: path.resolve(process.env.PDM_REPOSITORY_DIR ?? path.join(path.dirname(databasePath), "repository")),
  mutationScope: isApply ? [databasePath, `${databasePath}-wal`, `${databasePath}-shm`, outputDir] : [outputDir],
  repositoryMutationScope: "none"
};
const manifestPath = path.join(outputDir, "manifest.json");
const manifest = {
  schemaVersion: "dev111-canonical-state-repair-v1",
  devId: "DEV-111",
  capaId: "CAPA-PDM-2026-09-01-001",
  runId,
  mode,
  status: "IN_PROGRESS",
  authorization: isPrimary && isApply ? authorization : null,
  databasePath,
  isPrimary,
  requiredPartNumber,
  runtimeDeclaration,
  expected: isApply ? { fingerprint: expectedFingerprint, planHash: expectedPlanHash, repairCount: expectedRepairCount } : null,
  before: null,
  backup: null,
  apply: null,
  after: null,
  error: null,
  startedAt: new Date().toISOString()
};

console.log(JSON.stringify({ runtimeDeclaration }, null, 2));

try {
  const preflightDatabase = new Database(databasePath, { readonly: true, fileMustExist: true });
  preflightDatabase.pragma("query_only=ON");
  let beforeSnapshot;
  let beforeInventory;
  try {
    beforeSnapshot = scopedSnapshot(preflightDatabase);
    beforeInventory = collectInventory(preflightDatabase);
  } finally {
    preflightDatabase.close();
  }
  manifest.before = { fingerprint: beforeSnapshot.hash, snapshot: beforeSnapshot, inventory: beforeInventory };

  if (beforeInventory.noOp) {
    manifest.status = "NO_OP";
  } else if (!isApply) {
    assertReady(beforeInventory, "DEV111_DRY_RUN");
    manifest.status = "READY";
  } else {
    assertReady(beforeInventory, "DEV111_PRECHECK");
    assertExpected(beforeInventory, beforeSnapshot.hash, "DEV111_PRECHECK");
    const backupDir = path.join(outputDir, "backup");
    const backupPath = path.join(backupDir, "ai-pdm.sqlite");
    fs.mkdirSync(backupDir, { recursive: true });
    const source = new Database(databasePath, { readonly: true, fileMustExist: true });
    source.pragma("query_only=ON");
    try {
      await source.backup(backupPath);
    } finally {
      source.close();
    }
    manifest.backup = { path: backupPath, retained: true, ...verifyBackup(backupPath, { hash: beforeSnapshot.hash, planHash: beforeInventory.planHash, planCount: beforeInventory.plan.length }) };

    const writeDatabase = new Database(databasePath, { fileMustExist: true });
    try {
      manifest.apply = applyPlan(writeDatabase, beforeInventory, beforeSnapshot);
    } finally {
      writeDatabase.close();
    }

    const afterDatabase = new Database(databasePath, { readonly: true, fileMustExist: true });
    afterDatabase.pragma("query_only=ON");
    try {
      const afterSnapshot = scopedSnapshot(afterDatabase);
      const afterInventory = collectInventory(afterDatabase);
      assert(afterInventory.noOp, "DEV111_FINAL_NO_OP_POSTCONDITION_FAILED");
      manifest.after = { fingerprint: afterSnapshot.hash, snapshot: afterSnapshot, inventory: afterInventory };
    } finally {
      afterDatabase.close();
    }
    const rollbackSql = manifest.apply.inserted.map((entry) => `DELETE FROM canonical_workbench_states WHERE id='${entry.stateId}' AND company_id='${entry.companyId}' AND entity_type='part' AND canonical_entity_id='${entry.partId}' AND data_layer='part_formal';`).join("\n");
    fs.writeFileSync(path.join(outputDir, "rollback.sql"), `${rollbackSql}\n`, "utf8");
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
  planHash: manifest.before?.inventory?.planHash ?? null,
  repairCount: manifest.before?.inventory?.plan?.length ?? null,
  repairedParts: manifest.apply?.inserted?.map((entry) => entry.partNumber) ?? [],
  summary: manifest.after?.inventory?.summary ?? manifest.before?.inventory?.summary ?? null,
  backup: manifest.backup,
  manifest: manifestPath,
  error: manifest.error?.message ?? null
}, null, 2));
if (!["READY", "PASS", "NO_OP"].includes(manifest.status)) process.exitCode = 2;
