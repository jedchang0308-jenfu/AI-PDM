#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const requestedSuite = process.argv.includes("--suite")
  ? process.argv[process.argv.indexOf("--suite") + 1]
  : "all";
const results = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
}

function record(suite, id, passed, detail) {
  if (requestedSuite !== "all" && requestedSuite !== suite) return;
  results.push({ suite, id, passed: Boolean(passed), detail });
}

function tableBlock(sql, tableName) {
  const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${tableName}`);
  if (start < 0) return "";
  const end = sql.indexOf(";", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 1);
}

const sqliteSchema = read("db/schema.sql");
const postgresMigration = read("db/postgres/012_number_state_flow_phase1a.sql");
const requiredTables = [
  "numbering_draft_workspaces",
  "number_candidate_reservations",
  "numbering_draft_roots",
  "numbering_draft_parts",
  "numbering_draft_drawings",
  "numbering_draft_relations",
  "number_candidate_events"
];

for (const table of requiredTables) {
  record(
    "schema",
    `NSF-MIG-${table}`,
    tableBlock(sqliteSchema, table).length > 0 && tableBlock(postgresMigration, table).length > 0,
    `${table} must exist in SQLite and PostgreSQL migration 012`
  );
}
record(
  "schema",
  "NSF-MIG-constraints",
  sqliteSchema.includes("idx_number_candidate_reservations_code_exclusive") &&
    sqliteSchema.includes("idx_number_candidate_reservations_item_exclusive") &&
    sqliteSchema.includes("trg_number_candidate_events_no_update") &&
    postgresMigration.includes("idx_number_candidate_reservations_code_exclusive") &&
    postgresMigration.includes("ENABLE ROW LEVEL SECURITY"),
  "candidate partial uniqueness, append-only events, and PostgreSQL RLS are required"
);
record(
  "schema",
  "NSF-MIG-permissions",
  [
    "numbering.workspace.view",
    "numbering.workspace.create",
    "numbering.workspace.update",
    "numbering.workspace.cancel",
    "numbering.candidate.acquire",
    "numbering.candidate.recycle"
  ].every((code) => sqliteSchema.includes(code) && postgresMigration.includes(code)),
  "Phase 1A permission codes must be seeded in both providers"
);

let db = null;
try {
  db = new Database(":memory:");
  db.exec(sqliteSchema);
  db.exec(`
    INSERT OR IGNORE INTO users (
      id, display_name, email, password_hash, role, company_id, account_status, created_at, updated_at
    ) VALUES (
      'nsf-user', 'Number State QC', 'number-state-qc@example.invalid', NULL,
      'Engineer', 'company-jenfu', 'active', datetime('now'), datetime('now')
    );
    INSERT INTO numbering_draft_workspaces (
      id, company_id, draft_mode, lifecycle_status, owner_id, created_by,
      row_version, created_at, updated_at
    ) VALUES (
      'nsf-workspace', 'company-jenfu', 'new_bundle', 'active', 'nsf-user', 'nsf-user',
      1, datetime('now'), datetime('now')
    );
    INSERT INTO number_candidate_reservations (
      id, company_id, workspace_id, draft_item_type, draft_item_id,
      candidate_code, sequence_scope_key, sequence_no, reservation_state,
      row_version, created_by, created_at, updated_at
    ) VALUES (
      'nsf-reservation-1', 'company-jenfu', 'nsf-workspace', 'root', 'nsf-root',
      'A0001', 'company-jenfu:root:numbering-rule-v3-alpha-root', 1, 'active',
      1, 'nsf-user', datetime('now'), datetime('now')
    );
  `);
  let activeCollision = "";
  try {
    db.exec(`
      INSERT INTO number_candidate_reservations (
        id, company_id, workspace_id, draft_item_type, draft_item_id,
        candidate_code, sequence_scope_key, sequence_no, reservation_state,
        row_version, created_by, created_at, updated_at
      ) VALUES (
        'nsf-reservation-collision', 'company-jenfu', 'nsf-workspace', 'root', 'nsf-root-2',
        'A0001', 'company-jenfu:root:numbering-rule-v3-alpha-root', 1, 'active',
        1, 'nsf-user', datetime('now'), datetime('now')
      );
    `);
  } catch (error) {
    activeCollision = String(error);
  }
  record("domain", "NSF-NUM-001", /unique/iu.test(activeCollision), activeCollision || "active duplicate unexpectedly accepted");

  db.exec(`
    UPDATE number_candidate_reservations
    SET reservation_state = 'recycled', recycled_at = datetime('now'), recycled_by = 'nsf-user',
        recycle_reason = 'workspace_cancelled', row_version = row_version + 1, updated_at = datetime('now')
    WHERE id = 'nsf-reservation-1';
    INSERT INTO number_candidate_reservations (
      id, company_id, workspace_id, draft_item_type, draft_item_id,
      candidate_code, sequence_scope_key, sequence_no, reservation_state,
      row_version, created_by, created_at, updated_at
    ) VALUES (
      'nsf-reservation-2', 'company-jenfu', 'nsf-workspace', 'root', 'nsf-root-2',
      'A0001', 'company-jenfu:root:numbering-rule-v3-alpha-root', 1, 'active',
      1, 'nsf-user', datetime('now'), datetime('now')
    );
    INSERT INTO number_candidate_events (
      id, company_id, workspace_id, reservation_id, event_type, actor_id, occurred_at, detail_json
    ) VALUES (
      'nsf-event', 'company-jenfu', 'nsf-workspace', 'nsf-reservation-2',
      'candidate_reserved', 'nsf-user', datetime('now'), '{}'
    );
  `);
  const reused = db.prepare(
    "SELECT count(*) AS count FROM number_candidate_reservations WHERE candidate_code = 'A0001'"
  ).get().count;
  record("domain", "NSF-REC-007", reused === 2, `reservation history count=${reused}`);

  let eventMutation = "";
  try {
    db.prepare("UPDATE number_candidate_events SET detail_json = '{}' WHERE id = 'nsf-event'").run();
  } catch (error) {
    eventMutation = String(error);
  }
  record("domain", "NSF-EVT-append-only", eventMutation.includes("NUMBER_CANDIDATE_EVENT_APPEND_ONLY"), eventMutation);

  const permissions = db.prepare(`
    SELECT r.role_code, p.permission_code
    FROM role_permissions p JOIN roles r ON r.id = p.role_id
    WHERE r.role_code IN ('system_admin', 'pdm_admin', 'rd_manager', 'rd')
      AND p.permission_code = 'numbering.candidate.acquire' AND p.allowed = 1
  `).all();
  record("domain", "NSF-SEC-permission-seed", permissions.length === 4, `seeded roles=${permissions.length}`);
} catch (error) {
  record("domain", "NSF-domain-fixture", false, error instanceof Error ? error.message : String(error));
} finally {
  db?.close();
}

const concurrencyPath = path.join(root, ".tmp", `qc-number-state-${crypto.randomUUID()}.sqlite`);
try {
  fs.mkdirSync(path.dirname(concurrencyPath), { recursive: true });
  const first = new Database(concurrencyPath);
  first.exec(sqliteSchema);
  const second = new Database(concurrencyPath);
  second.pragma("busy_timeout = 20");
  first.exec("BEGIN IMMEDIATE");
  let lockCode = "";
  try {
    second.exec("BEGIN IMMEDIATE");
  } catch (error) {
    lockCode = error && typeof error === "object" && "code" in error ? String(error.code) : String(error);
  }
  first.exec("ROLLBACK");
  record("concurrency", "NSF-CON-001", lockCode === "SQLITE_BUSY", `second writer=${lockCode || "accepted"}`);
  second.close();
  first.close();
} catch (error) {
  record("concurrency", "NSF-CON-fixture", false, error instanceof Error ? error.message : String(error));
} finally {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${concurrencyPath}${suffix}`, { force: true });
}

const repositorySource = read("src/lib/repositories/number-state-flow-async-repository.ts");
const serviceSource = read("src/lib/number-state-flow.ts");
const apiSource = [
  read("src/lib/number-state-flow-api.ts"),
  read("src/app/api/numbering/draft-workspaces/route.ts"),
  read("src/app/api/numbering/draft-workspaces/[id]/route.ts"),
  read("src/app/api/numbering/draft-workspaces/[id]/candidate-numbers/route.ts"),
  read("src/app/api/numbering/draft-workspaces/[id]/cancel/route.ts")
].join("\n");
record(
  "api",
  "NSF-API-routes",
  ["numbering.workspace.create", "numbering.workspace.view", "numbering.workspace.update", "numbering.workspace.cancel", "numbering.candidate.acquire"]
    .every((code) => apiSource.includes(code)),
  "Phase 1A routes must enforce distinct server permissions"
);
record(
  "api",
  "NSF-API-contract",
  apiSource.includes("private, no-store") && apiSource.includes("expectedRowVersion") && apiSource.includes("Idempotency-Key"),
  "routes must expose no-store, optimistic version, and idempotency contracts"
);
record(
  "api",
  "NSF-CMD-boundary",
  [
    "pdm.numbering.create_draft_workspace",
    "pdm.numbering.acquire_candidate_numbers",
    "pdm.numbering.cancel_draft_workspace",
    "pdm.numbering.draft_workspace.created.v1",
    "pdm.numbering.candidate_reserved.v1",
    "pdm.numbering.candidate_recycled.v1"
  ].every((value) => serviceSource.includes(value)) &&
    serviceSource.includes("executePdmCommandWithOutbox") &&
    repositorySource.includes("INSERT INTO audit_logs"),
  "business, audit, receipt and outbox must share the PdmCommand transaction boundary"
);
record(
  "api",
  "NSF-NUM-bounded-retry",
  repositorySource.includes("MAX_CANDIDATE_ALLOCATION_ATTEMPTS = 3") &&
    repositorySource.includes("FOR UPDATE") &&
    repositorySource.includes("numbering_recovery_reservations"),
  "allocator must serialize PostgreSQL scopes, exclude recovery reservations, and bound retries"
);
record(
  "api",
  "NSF-MIG-classifier",
  repositorySource.includes("classifyLegacyNumberingDryRun") &&
    repositorySource.includes("ambiguous_report_only") &&
    !repositorySource.includes("UPDATE part_number_drafts SET"),
  "legacy classifier must be deterministic and non-destructive"
);
record(
  "api",
  "NSF-PG-list-null-filter-safe",
  repositorySource.includes("const where = [\"company_id = :companyId\"]") &&
    repositorySource.includes("where.push(\"owner_id = :ownerId\")") &&
    repositorySource.includes("where.push(\"lifecycle_status = :lifecycleStatus\")") &&
    !repositorySource.includes(":ownerId IS NULL OR owner_id = :ownerId") &&
    !repositorySource.includes(":lifecycleStatus IS NULL OR lifecycle_status = :lifecycleStatus"),
  "workspace list filters must omit nullable PostgreSQL parameters instead of using IS NULL guards"
);

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ suite: requestedSuite, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
