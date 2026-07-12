#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const qcMode = process.argv.includes("--qc");
const applyMode = process.argv.includes("--apply");
const dbPath = path.resolve(process.env.PDM_SQLITE_PATH || "data/ai-pdm.sqlite");
const outDir = path.join(root, "output", "qc-pdm-approval-platform-migration-dry-run");
const jsonPath = path.join(outDir, "report.json");
const markdownPath = path.join(outDir, "report.md");
const DEFAULT_COMPANY_ID = "company-jenfu";

function isApplyConfirmed() {
  return process.argv.includes("--confirm-local-approval-platform-migration") && process.env.PDM_APPROVAL_PLATFORM_MIGRATION_APPLY === "YES";
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

function countByStatus(db, tableName, statusColumn) {
  if (!tableExists(db, tableName)) return [];
  return db
    .prepare(`SELECT ${statusColumn} AS status, COUNT(*) AS count FROM ${tableName} GROUP BY ${statusColumn} ORDER BY ${statusColumn}`)
    .all();
}

function allOrEmpty(db, tableName, sql) {
  if (!tableExists(db, tableName)) return [];
  return db.prepare(sql).all();
}

function sourceRecord(
  tableName,
  legacyId,
  actionCode,
  status,
  requestedAt,
  targetSummary,
  payload = {},
  options = {}
) {
  const companyId = options.companyId || DEFAULT_COMPANY_ID;
  const reason = String(options.reason || payload.reason || "Migrated legacy approval record").trim();
  return {
    legacyTable: tableName,
    legacyId,
    companyId,
    actionCode,
    status,
    normalizedStatus: normalizePlatformStatus(status),
    requestedBy: options.requestedBy || null,
    requestedAt,
    resolvedBy: options.resolvedBy || null,
    resolvedAt: options.resolvedAt || null,
    reason,
    targetSummary,
    payload,
    parityHash: hash({ tableName, legacyId, companyId, actionCode, status, requestedAt, targetSummary, payload })
  };
}

function deterministicId(prefix, ...parts) {
  return `${prefix}-${hash(parts).slice(0, 24)}`;
}

function normalizePlatformStatus(value) {
  if (value === "PendingReview" || value === "Pending") return "pending";
  if (value === "Approved") return "approved";
  if (value === "Rejected") return "rejected";
  if (value === "Cancelled") return "cancelled";
  if (["pending", "approved", "rejected", "needs_info", "cancelled", "apply_failed", "applied"].includes(value)) return value;
  return "pending";
}

function collectSourceRecords(db) {
  return [
    ...allOrEmpty(
      db,
      "approval_requests",
      `
      SELECT
        ar.id,
        ar.company_id,
        ar.action_code,
        ar.entity_type,
        ar.entity_id,
        ar.request_status,
        ar.reason,
        ar.requested_by,
        ar.requested_at,
        ar.resolved_by,
        ar.resolved_at,
        COALESCE(pr.root_code, pn.part_number, dn.drawing_number, ar.entity_id) AS target_summary
      FROM approval_requests ar
      LEFT JOIN part_roots pr ON ar.entity_type = 'part_root' AND pr.id = ar.entity_id
      LEFT JOIN part_numbers pn ON ar.entity_type = 'part_number' AND pn.id = ar.entity_id
      LEFT JOIN drawing_numbers dn ON ar.entity_type = 'drawing_number' AND dn.id = ar.entity_id
      ORDER BY ar.requested_at, ar.id
    `
    ).map((row) =>
      sourceRecord("approval_requests", row.id, `numbering.${row.action_code}`, row.request_status, row.requested_at, row.target_summary, {
        entityType: row.entity_type,
        entityId: row.entity_id
      }, {
        companyId: row.company_id,
        requestedBy: row.requested_by,
        resolvedBy: row.resolved_by,
        resolvedAt: row.resolved_at,
        reason: row.reason
      })
    ),
    ...allOrEmpty(
      db,
      "submission_lifecycle_requests",
      `
      SELECT
        r.id,
        r.request_status,
        r.requested_by,
        r.reason,
        r.requested_at,
        r.decided_by,
        r.decided_at,
        s.company_id,
        s.drawing_number,
        i.part_number,
        s.revision
      FROM submission_lifecycle_requests r
      JOIN submissions s ON s.id = r.submission_id
      JOIN items i ON i.id = s.item_id
      WHERE r.action_code = 'obsolete_submission'
      ORDER BY r.requested_at, r.id
    `
    ).map((row) =>
      sourceRecord(
        "submission_lifecycle_requests",
        row.id,
        "submission.obsolete",
        row.request_status,
        row.requested_at,
        [row.drawing_number, row.part_number, row.revision].filter(Boolean).join(" / "),
        {},
        {
          companyId: row.company_id,
          requestedBy: row.requested_by,
          resolvedBy: row.decided_by,
          resolvedAt: row.decided_at,
          reason: row.reason
        }
      )
    ),
    ...allOrEmpty(
      db,
      "bom_review_requests",
      `
      SELECT
        rr.id,
        rr.status,
        rr.lifecycle_action,
        rr.submitted_by,
        rr.reviewed_by,
        rr.submitted_at,
        rr.reviewed_at,
        rr.change_reason,
        sub.company_id,
        bd.draft_name,
        bd.parent_revision
      FROM bom_review_requests rr
      JOIN bom_drafts bd ON bd.id = rr.bom_draft_id
      JOIN submissions sub ON sub.id = bd.parent_submission_id
      ORDER BY rr.submitted_at, rr.id
    `
    ).map((row) =>
      sourceRecord(
        "bom_review_requests",
        row.id,
        row.lifecycle_action === "obsolete" ? "bom.obsolete_review" : "bom.release_review",
        row.status,
        row.submitted_at,
        `${row.draft_name} / ${row.parent_revision}`,
        { lifecycleAction: row.lifecycle_action },
        {
          companyId: row.company_id,
          requestedBy: row.submitted_by,
          resolvedBy: row.reviewed_by,
          resolvedAt: row.reviewed_at,
          reason: row.change_reason
        }
      )
    ),
    ...allOrEmpty(
      db,
      "part_cost_change_requests",
      `
      SELECT
        cr.id,
        cr.request_type,
        cr.review_status,
        cr.requested_by,
        cr.reviewed_by,
        cr.requested_at,
        cr.reviewed_at,
        cr.change_reason,
        pn.company_id,
        pn.part_number,
        pn.part_name
      FROM part_cost_change_requests cr
      JOIN part_numbers pn ON pn.id = cr.part_number_id
      ORDER BY cr.requested_at, cr.id
    `
    ).map((row) =>
      sourceRecord(
        "part_cost_change_requests",
        row.id,
        "part_cost.change_review",
        row.review_status,
        row.requested_at,
        `${row.part_number} / ${row.part_name}`,
        {
          requestType: row.request_type
        },
        {
          companyId: row.company_id,
          requestedBy: row.requested_by,
          resolvedBy: row.reviewed_by,
          resolvedAt: row.reviewed_at,
          reason: row.change_reason
        }
      )
    ),
    ...allOrEmpty(
      db,
      "drawing_revision_package_supplements",
      `
      SELECT
        s.id,
        s.status,
        s.reason_code,
        s.reason_note,
        s.requested_by,
        s.reviewed_by,
        s.requested_at,
        s.reviewed_at,
        p.company_id,
        p.drawing_number,
        p.revision
      FROM drawing_revision_package_supplements s
      JOIN drawing_revision_packages p ON p.id = s.package_id
      ORDER BY s.requested_at, s.id
    `
    ).map((row) =>
      sourceRecord(
        "drawing_revision_package_supplements",
        row.id,
        "drawing_package.supplement_review",
        row.status,
        row.requested_at,
        `${row.drawing_number} / rev ${row.revision}`,
        { reasonCode: row.reason_code },
        {
          companyId: row.company_id,
          requestedBy: row.requested_by,
          resolvedBy: row.reviewed_by,
          resolvedAt: row.reviewed_at,
          reason: row.reason_note || row.reason_code
        }
      )
    )
  ];
}

function buildReport(db, options = {}) {
  const platformLinks = tableExists(db, "approval_platform_legacy_links")
    ? db.prepare("SELECT legacy_table, legacy_id, migration_status FROM approval_platform_legacy_links").all()
    : [];
  const linkSet = new Set(platformLinks.map((link) => `${link.legacy_table}:${link.legacy_id}`));
  const records = collectSourceRecords(db);

  const byTable = new Map();
  for (const record of records) {
    const current = byTable.get(record.legacyTable) ?? { total: 0, linked: 0, statuses: {} };
    current.total += 1;
    current.linked += linkSet.has(`${record.legacyTable}:${record.legacyId}`) ? 1 : 0;
    current.statuses[record.status] = (current.statuses[record.status] ?? 0) + 1;
    byTable.set(record.legacyTable, current);
  }

  const blocked = records.filter((record) => linkSet.has(`${record.legacyTable}:${record.legacyId}`));
  return {
    generatedAt: new Date().toISOString(),
    mode: options.mode ?? (applyMode ? "apply" : "dry-run"),
    databasePath: dbPath,
    mutation: options.mutation ?? "none",
    appliedMigrations: options.appliedMigrations ?? 0,
    totals: {
      legacyRecords: records.length,
      platformLegacyLinks: platformLinks.length,
      alreadyLinked: blocked.length,
      proposedMigrations: records.length - blocked.length
    },
    statusInventory: {
      approval_requests: countByStatus(db, "approval_requests", "request_status"),
      submission_lifecycle_requests: countByStatus(db, "submission_lifecycle_requests", "request_status"),
      bom_review_requests: countByStatus(db, "bom_review_requests", "status"),
      part_cost_change_requests: countByStatus(db, "part_cost_change_requests", "review_status"),
      drawing_revision_package_supplements: countByStatus(db, "drawing_revision_package_supplements", "status")
    },
    byTable: Object.fromEntries(byTable),
    blocked: blocked.map((record) => ({
      legacyTable: record.legacyTable,
      legacyId: record.legacyId,
      reason: "already_linked"
    })),
    proposed: records
      .filter((record) => !linkSet.has(`${record.legacyTable}:${record.legacyId}`))
      .map((record) => ({
        legacyTable: record.legacyTable,
        legacyId: record.legacyId,
        actionCode: record.actionCode,
        status: record.status,
        targetSummary: record.targetSummary,
        parityHash: record.parityHash
      }))
  };
}

function userExists(db, userId) {
  if (!userId || !tableExists(db, "users")) return false;
  return Boolean(db.prepare("SELECT id FROM users WHERE id = ?").get(userId));
}

function userRole(db, userId) {
  if (!userId || !tableExists(db, "users")) return "system";
  return db.prepare("SELECT role FROM users WHERE id = ?").get(userId)?.role ?? "system";
}

function resolveMigrationActorId(db) {
  const explicit = process.env.PDM_APPROVAL_PLATFORM_MIGRATION_ACTOR_ID;
  if (explicit && userExists(db, explicit)) return explicit;
  const admin = db.prepare("SELECT id FROM users WHERE role = 'Admin' ORDER BY created_at ASC, id ASC LIMIT 1").get();
  if (admin?.id) return admin.id;
  const anyUser = db.prepare("SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1").get();
  if (anyUser?.id) return anyUser.id;
  throw new Error("APPROVAL_PLATFORM_MIGRATION_ACTOR_REQUIRED");
}

function validateApplyPreconditions(db, records) {
  if (!isApplyConfirmed()) {
    throw new Error(
      "APPROVAL_PLATFORM_MIGRATION_APPLY_REQUIRES --confirm-local-approval-platform-migration and PDM_APPROVAL_PLATFORM_MIGRATION_APPLY=YES"
    );
  }
  for (const tableName of [
    "approval_platform_actions",
    "approval_platform_requests",
    "approval_platform_targets",
    "approval_platform_impact_snapshots",
    "approval_platform_decisions",
    "approval_platform_events",
    "approval_platform_legacy_links"
  ]) {
    if (!tableExists(db, tableName)) throw new Error(`APPROVAL_PLATFORM_TABLE_MISSING: ${tableName}`);
  }
  const actions = new Set(db.prepare("SELECT action_code FROM approval_platform_actions WHERE enabled = 1").all().map((row) => row.action_code));
  const missingActions = Array.from(new Set(records.map((record) => record.actionCode).filter((actionCode) => !actions.has(actionCode))));
  if (missingActions.length > 0) throw new Error(`APPROVAL_PLATFORM_ACTION_MISSING: ${missingActions.join(", ")}`);
}

function applyLegacyMigrations(db) {
  const records = collectSourceRecords(db);
  validateApplyPreconditions(db, records);

  const actionRows = db.prepare("SELECT action_code, domain_code FROM approval_platform_actions WHERE enabled = 1").all();
  const actionDomains = new Map(actionRows.map((row) => [row.action_code, row.domain_code]));
  const migrationActorId = resolveMigrationActorId(db);
  const now = new Date().toISOString();
  const existingLinks = new Set(
    db.prepare("SELECT legacy_table, legacy_id FROM approval_platform_legacy_links").all().map((row) => `${row.legacy_table}:${row.legacy_id}`)
  );
  const targets = records.filter((record) => !existingLinks.has(`${record.legacyTable}:${record.legacyId}`));

  const insertRequest = db.prepare(`
    INSERT OR IGNORE INTO approval_platform_requests (
      id, company_id, action_code, domain_code, request_status, title, reason, requested_by, requested_at,
      resolved_by, resolved_at, apply_status, payload_json, created_at, updated_at
    ) VALUES (
      @id, @companyId, @actionCode, @domainCode, @requestStatus, @title, @reason, @requestedBy, @requestedAt,
      @resolvedBy, @resolvedAt, @applyStatus, @payloadJson, @createdAt, @updatedAt
    )
  `);
  const insertTarget = db.prepare(`
    INSERT OR IGNORE INTO approval_platform_targets (
      id, request_id, target_role, target_type, target_id, target_code, target_label, target_status, snapshot_json, sort_order, created_at
    ) VALUES (
      @id, @requestId, 'primary', @targetType, @targetId, @targetCode, @targetLabel, @targetStatus, @snapshotJson, 0, @createdAt
    )
  `);
  const insertImpact = db.prepare(`
    INSERT OR IGNORE INTO approval_platform_impact_snapshots (
      id, request_id, snapshot_hash, snapshot_json, captured_by, captured_at
    ) VALUES (
      @id, @requestId, @snapshotHash, @snapshotJson, @capturedBy, @capturedAt
    )
  `);
  const insertDecision = db.prepare(`
    INSERT OR IGNORE INTO approval_platform_decisions (
      id, request_id, approver_role, approver_id, decision, comment, decided_at
    ) VALUES (
      @id, @requestId, @approverRole, @approverId, @decision, @comment, @decidedAt
    )
  `);
  const insertEvent = db.prepare(`
    INSERT OR IGNORE INTO approval_platform_events (
      id, request_id, event_type, actor_id, detail_json, created_at
    ) VALUES (
      @id, @requestId, 'approval_platform.migration.legacy_mirrored', @actorId, @detailJson, @createdAt
    )
  `);
  const insertLink = db.prepare(`
    INSERT OR IGNORE INTO approval_platform_legacy_links (
      id, request_id, legacy_table, legacy_id, legacy_status, parity_hash, migration_status, created_at, updated_at
    ) VALUES (
      @id, @requestId, @legacyTable, @legacyId, @legacyStatus, @parityHash, 'migrated', @createdAt, @updatedAt
    )
  `);

  const write = db.transaction(() => {
    let applied = 0;
    for (const record of targets) {
      const requestId = deterministicId("APR-MIG", record.legacyTable, record.legacyId);
      const requestedBy = userExists(db, record.requestedBy) ? record.requestedBy : migrationActorId;
      const resolvedBy = userExists(db, record.resolvedBy) ? record.resolvedBy : null;
      const requestedAt = record.requestedAt || now;
      const resolvedAt = record.resolvedAt || null;
      const payload = {
        ...record.payload,
        migratedFrom: {
          table: record.legacyTable,
          id: record.legacyId,
          status: record.status,
          parityHash: record.parityHash
        }
      };
      const snapshot = {
        legacyTable: record.legacyTable,
        legacyId: record.legacyId,
        actionCode: record.actionCode,
        status: record.status,
        targetSummary: record.targetSummary,
        payload
      };

      insertRequest.run({
        id: requestId,
        companyId: record.companyId,
        actionCode: record.actionCode,
        domainCode: actionDomains.get(record.actionCode),
        requestStatus: record.normalizedStatus,
        title: `${record.actionCode}: ${record.targetSummary || record.legacyId}`,
        reason: record.reason,
        requestedBy,
        requestedAt,
        resolvedBy,
        resolvedAt,
        applyStatus: "not_required",
        payloadJson: JSON.stringify(payload),
        createdAt: requestedAt,
        updatedAt: resolvedAt || requestedAt
      });
      insertTarget.run({
        id: deterministicId("APT-MIG", record.legacyTable, record.legacyId),
        requestId,
        targetType: record.legacyTable,
        targetId: record.legacyId,
        targetCode: record.targetSummary || record.legacyId,
        targetLabel: record.targetSummary || record.legacyId,
        targetStatus: record.status,
        snapshotJson: JSON.stringify(snapshot),
        createdAt: requestedAt
      });
      insertImpact.run({
        id: deterministicId("APIS-MIG", record.legacyTable, record.legacyId),
        requestId,
        snapshotHash: record.parityHash,
        snapshotJson: JSON.stringify(snapshot),
        capturedBy: requestedBy,
        capturedAt: requestedAt
      });
      if (resolvedBy && ["approved", "rejected", "needs_info"].includes(record.normalizedStatus)) {
        insertDecision.run({
          id: deterministicId("APD-MIG", record.legacyTable, record.legacyId, record.normalizedStatus),
          requestId,
          approverRole: userRole(db, resolvedBy),
          approverId: resolvedBy,
          decision: record.normalizedStatus,
          comment: record.reason,
          decidedAt: resolvedAt || requestedAt
        });
      }
      insertEvent.run({
        id: deterministicId("APE-MIG", record.legacyTable, record.legacyId),
        requestId,
        actorId: migrationActorId,
        detailJson: JSON.stringify({ parityHash: record.parityHash, legacyTable: record.legacyTable, legacyId: record.legacyId }),
        createdAt: now
      });
      insertLink.run({
        id: deterministicId("APL-MIG", record.legacyTable, record.legacyId),
        requestId,
        legacyTable: record.legacyTable,
        legacyId: record.legacyId,
        legacyStatus: record.status,
        parityHash: record.parityHash,
        createdAt: now,
        updatedAt: now
      });
      applied += 1;
    }
    return applied;
  });

  return write();
}

function markdown(report) {
  const rows = Object.entries(report.byTable)
    .map(([table, info]) => `| ${table} | ${info.total} | ${info.linked} | ${JSON.stringify(info.statuses)} |`)
    .join("\n");
  return `# PDM Approval Platform Migration Dry Run

Generated: ${report.generatedAt}

Mode: ${report.mode}

Mutation: ${report.mutation}

| Metric | Count |
|---|---:|
| Legacy records | ${report.totals.legacyRecords} |
| Existing platform legacy links | ${report.totals.platformLegacyLinks} |
| Already linked | ${report.totals.alreadyLinked} |
| Proposed migrations | ${report.totals.proposedMigrations} |
| Applied migrations | ${report.appliedMigrations} |

| Legacy table | Total | Linked | Statuses |
|---|---:|---:|---|
${rows || "| - | 0 | 0 | {} |"}
`;
}

function runApplySelfTest() {
  const schema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");
  const testDb = new Database(":memory:");
  const originalArgv = process.argv;
  const originalApplyEnv = process.env.PDM_APPROVAL_PLATFORM_MIGRATION_APPLY;
  try {
    testDb.pragma("foreign_keys = ON");
    testDb.exec(schema);
    testDb
      .prepare("INSERT INTO users (id, display_name, email, role, company_id) VALUES (?, ?, ?, ?, ?)")
      .run("qc-admin", "QC Admin", "qc-admin@example.invalid", "Admin", DEFAULT_COMPANY_ID);
    testDb
      .prepare(
        `INSERT INTO approval_requests (
          id, company_id, action_code, entity_type, entity_id, request_status, reason, payload_json, requested_by, requested_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "qc-legacy-approval-001",
        DEFAULT_COMPANY_ID,
        "dvt_promotion",
        "part_root",
        "qc-root-001",
        "pending",
        "QC migration self-test",
        "{}",
        "qc-admin",
        "2026-07-08T00:00:00.000Z"
      );

    process.argv = [...process.argv, "--confirm-local-approval-platform-migration"];
    process.env.PDM_APPROVAL_PLATFORM_MIGRATION_APPLY = "YES";
    const applied = applyLegacyMigrations(testDb);
    if (applied !== 1) throw new Error("APPLY_SELF_TEST_EXPECTED_ONE_MIGRATION");
    const after = buildReport(testDb, { mode: "apply-self-test", mutation: "applied", appliedMigrations: applied });
    if (after.totals.proposedMigrations !== 0) throw new Error("APPLY_SELF_TEST_PARITY_FAILED");
    if (after.totals.platformLegacyLinks !== 1) throw new Error("APPLY_SELF_TEST_LINK_MISSING");
  } finally {
    process.argv = originalArgv;
    if (originalApplyEnv === undefined) delete process.env.PDM_APPROVAL_PLATFORM_MIGRATION_APPLY;
    else process.env.PDM_APPROVAL_PLATFORM_MIGRATION_APPLY = originalApplyEnv;
    testDb.close();
  }
}

if (!fs.existsSync(dbPath)) {
  throw new Error(`PDM_SQLITE_NOT_FOUND: ${dbPath}`);
}

if (qcMode && applyMode) {
  throw new Error("QC_MODE_REFUSES_APPLY");
}

const db = new Database(dbPath, { readonly: !applyMode, fileMustExist: true });
try {
  db.pragma("foreign_keys = ON");
  const appliedMigrations = applyMode ? applyLegacyMigrations(db) : 0;
  const report = buildReport(db, {
    mode: applyMode ? "apply" : "dry-run",
    mutation: applyMode ? "applied" : "none",
    appliedMigrations
  });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(markdownPath, markdown(report), "utf8");
  if (qcMode) {
    if (report.mutation !== "none") throw new Error("Dry run mutated data");
    if (!Object.prototype.hasOwnProperty.call(report.statusInventory, "approval_requests")) throw new Error("approval_requests inventory missing");
    if (!Object.prototype.hasOwnProperty.call(report.statusInventory, "bom_review_requests")) throw new Error("BOM inventory missing");
    runApplySelfTest();
  }
  console.log(
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        mutation: report.mutation,
        appliedMigrations: report.appliedMigrations,
        totals: report.totals,
        report: path.relative(root, markdownPath).replaceAll(path.sep, "/")
      },
      null,
      2
    )
  );
} finally {
  db.close();
}
