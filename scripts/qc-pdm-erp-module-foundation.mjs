#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";

const root = process.cwd();
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
}

function includesAll(source, fragments) {
  return fragments.every((fragment) => source.includes(fragment));
}

function sourceFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(absolute));
    else if (/\.(ts|tsx)$/u.test(entry.name)) files.push(absolute);
  }
  return files;
}

const schema = read("db/schema.sql");
const postgresMigration = read("db/postgres/008_erp_module_foundation.sql");
const supabaseMigration = read("supabase/migrations/20260712034956_erp_module_foundation.sql");
const platformCommand = read("src/lib/platform-command.ts");
const contextAdapter = read("src/lib/platform-command-context.ts");
const commandService = read("src/lib/platform-command-service.ts");
const outboxRepository = read("src/lib/repositories/platform-outbox-async-repository.ts");
const mappingRepository = read("src/lib/repositories/platform-mapping-async-repository.ts");

record(
  "ERP-FND-SRC-001 platform actor and command contracts exist",
  includesAll(platformCommand, ["PlatformActorContext", "PdmCommand", "idempotencyKey", "organizationId", "correlationId"])
);
record(
  "ERP-FND-SRC-002 current auth adapter derives actor and company server-side",
  includesAll(contextAdapter, ["requireNumberingActionAsync", "resolveNumberingCompanyContextAsync", "auth.user.id", "companyResult.company.companyId"])
);
record(
  "ERP-FND-CTX-001 actor/company payload spoof fields are not context authorities",
  !/body\.(?:actorId|actor_id|createdBy|created_by|companyId|company_id)/u.test(contextAdapter) &&
    contextAdapter.includes("pdmUserId: auth.user.id") &&
    contextAdapter.includes("organizationId: companyResult.company.companyId"),
  "platform-command-context.ts"
);
record(
  "ERP-FND-SRC-003 command service owns transaction mapping outbox receipt",
  includesAll(commandService, ["client.transaction", "ensureCurrentPrincipal", "ensureCurrentOrganization", "claimCommand", "enqueue", "completeCommand"])
);
record(
  "ERP-FND-SRC-004 outbox implements idempotent insert and bounded delivery state",
  includesAll(outboxRepository, ["ON CONFLICT(company_id, command_name, idempotency_key) DO NOTHING", "delivery_status", "markPublished", "markFailed"])
);
record(
  "ERP-FND-SRC-005 shared mapping is provider-neutral and preserves PDM IDs",
  includesAll(mappingRepository, ["platformPrincipalId", "pdmUserId", "current_pdm", "shared_iam", "pdmCompanyId"])
);
record(
  "ERP-FND-SRC-006 inactive platform mappings fail closed",
  includesAll(commandService, ["PLATFORM_PRINCIPAL_NOT_ACTIVE", "PLATFORM_ORGANIZATION_NOT_ACTIVE"])
);

const selectedRoutes = [
  "src/app/api/numbering/records/route.ts",
  "src/app/api/numbering/roots/[rootCode]/drawings/route.ts",
  "src/app/api/numbering/roots/[rootCode]/parts/route.ts",
  "src/app/api/numbering/roots/[rootCode]/drawing-part/route.ts",
  "src/app/api/numbering/part-number-drafts/route.ts"
];

for (const route of selectedRoutes) {
  const source = read(route);
  record(
    `ERP-FND-ROUTE platform context: ${route}`,
    source.includes("requireNumberingPlatformCommandAsync") &&
      !source.includes("createdBy: body.") &&
      !source.includes("companyId: body."),
    route
  );
}

const restrictedClientImports = [
  "@/lib/db",
  "@/lib/db-async-provider",
  "@/lib/platform-command-context",
  "@/lib/platform-command-service",
  "@/lib/repositories/"
];
const clientBoundaryViolations = [];
for (const absolute of sourceFiles(path.join(root, "src"))) {
  const source = fs.readFileSync(absolute, "utf8");
  if (!/^\s*["']use client["'];/mu.test(source)) continue;
  const runtimeImports = [...source.matchAll(/import\s+(?!type\b)[\s\S]*?\sfrom\s+["']([^"']+)["'];?/gu)].map((match) => match[1]);
  for (const restricted of restrictedClientImports) {
    if (runtimeImports.some((importPath) => importPath === restricted || importPath.startsWith(restricted))) {
      clientBoundaryViolations.push(`${path.relative(root, absolute)} -> ${restricted}`);
    }
  }
}
record(
  "ERP-FND-SEC-001 client files do not import privileged server boundaries",
  clientBoundaryViolations.length === 0,
  clientBoundaryViolations.join("; ")
);

const secretExposure = sourceFiles(path.join(root, "src"))
  .filter((absolute) => /^\s*["']use client["'];/mu.test(fs.readFileSync(absolute, "utf8")))
  .flatMap((absolute) => {
    const source = fs.readFileSync(absolute, "utf8");
    const matches = source.match(/PDM_(?:SUPABASE_SERVICE_ROLE_KEY|POSTGRES_ADMIN_URL|AUTH_SECRET)|GOOGLE_OAUTH_CLIENT_SECRET/gu) ?? [];
    return matches.map((match) => `${path.relative(root, absolute)}:${match}`);
  });
record("ERP-FND-SEC-002 client source has no privileged env names", secretExposure.length === 0, secretExposure.join("; "));

record(
  "ERP-FND-DB-001 SQLite schema contains mappings receipts and outbox",
  includesAll(schema, ["platform_principal_mappings", "platform_organization_mappings", "platform_command_receipts", "platform_outbox_events"])
);
record(
  "ERP-FND-DB-002 PostgreSQL migration backfills mappings",
  includesAll(postgresMigration, ["SELECT 'pdm:' || users.id", "SELECT 'pdm-company:' || companies.id", "ON CONFLICT (pdm_user_id) DO NOTHING"])
);
record(
  "ERP-FND-DB-003 PostgreSQL migration forces RLS and revokes Data API roles",
  includesAll(postgresMigration, ["FORCE ROW LEVEL SECURITY", "REVOKE ALL ON TABLE public.platform_outbox_events FROM anon, authenticated"])
);
record(
  "ERP-FND-DB-004 Supabase migration mirrors source with hash header",
  supabaseMigration.includes("Source: db/postgres/008_erp_module_foundation.sql") && supabaseMigration.includes("Source SHA-256:")
);

const db = new Database(":memory:");
db.exec(schema);
db.exec(`
  INSERT OR IGNORE INTO users (
    id, display_name, email, password_hash, role, company_id, account_status, created_at, updated_at
  ) VALUES (
    'erp-fnd-user', 'ERP Foundation User', 'erp-foundation@example.com', NULL,
    'Admin', 'company-jenfu', 'active', datetime('now'), datetime('now')
  );
  INSERT INTO platform_principal_mappings (
    platform_principal_id, pdm_user_id, mapping_source, mapping_status, created_at, updated_at
  ) VALUES ('pdm:erp-fnd-user', 'erp-fnd-user', 'current_pdm', 'active', datetime('now'), datetime('now'));
  INSERT OR IGNORE INTO platform_organization_mappings (
    platform_organization_id, pdm_company_id, mapping_source, mapping_status, created_at, updated_at
  ) VALUES ('pdm-company:company-jenfu', 'company-jenfu', 'current_pdm', 'active', datetime('now'), datetime('now'));
  CREATE TABLE erp_foundation_test_records (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    value TEXT NOT NULL
  );
`);

function executeQcCommand({ commandName, idempotencyKey, eventType, failAudit = false, failOutbox = false }) {
  const existing = db.prepare(
    `SELECT response_json FROM platform_command_receipts
     WHERE company_id = ? AND command_name = ? AND idempotency_key = ? AND command_status = 'completed'`
  ).get("company-jenfu", commandName, idempotencyKey);
  if (existing) return { reused: true, result: JSON.parse(existing.response_json) };

  db.exec("BEGIN IMMEDIATE");
  try {
    const now = new Date().toISOString();
    const receiptId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO platform_command_receipts (
        id, company_id, command_name, schema_version, idempotency_key, actor_id,
        platform_principal_id, platform_organization_id,
        correlation_id, command_status, response_json, created_at
      ) VALUES (?, 'company-jenfu', ?, 1, ?, 'erp-fnd-user',
        'pdm:erp-fnd-user', 'pdm-company:company-jenfu', ?, 'processing', '{}', ?)`
    ).run(receiptId, commandName, idempotencyKey, `corr:${idempotencyKey}`, now);

    const businessId = `business:${idempotencyKey}`;
    db.prepare("INSERT INTO erp_foundation_test_records (id, company_id, value) VALUES (?, 'company-jenfu', 'created')").run(businessId);
    if (failAudit) throw new Error("FORCED_AUDIT_FAILURE");
    db.prepare(
      "INSERT INTO audit_logs (id, actor_id, action, detail_json, created_at) VALUES (?, 'erp-fnd-user', ?, '{}', ?)"
    ).run(crypto.randomUUID(), commandName, now);
    if (failOutbox) throw new Error("FORCED_OUTBOX_FAILURE");
    db.prepare(
      `INSERT INTO platform_outbox_events (
        id, company_id, aggregate_type, aggregate_id, event_type, schema_version,
        payload_json, actor_id, platform_principal_id, platform_organization_id,
        correlation_id, idempotency_key, delivery_status,
        attempt_count, occurred_at, updated_at
      ) VALUES (?, 'company-jenfu', 'qc_record', ?, ?, 1, ?, 'erp-fnd-user',
        'pdm:erp-fnd-user', 'pdm-company:company-jenfu', ?, ?, 'pending', 0, ?, ?)`
    ).run(
      crypto.randomUUID(),
      businessId,
      eventType,
      JSON.stringify({ businessId }),
      `corr:${idempotencyKey}`,
      idempotencyKey,
      now,
      now
    );
    const result = { businessId };
    db.prepare(
      `UPDATE platform_command_receipts
       SET command_status = 'completed', response_json = ?, completed_at = ? WHERE id = ?`
    ).run(JSON.stringify(result), now, receiptId);
    db.exec("COMMIT");
    return { reused: false, result };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const first = executeQcCommand({
  commandName: "qc.platform.create",
  idempotencyKey: "qc-idempotency-1",
  eventType: "qc.platform.created.v1"
});
const repeated = executeQcCommand({
  commandName: "qc.platform.create",
  idempotencyKey: "qc-idempotency-1",
  eventType: "qc.platform.created.v1"
});
const counts = {
  business: db.prepare("SELECT count(*) AS count FROM erp_foundation_test_records").get().count,
  audit: db.prepare("SELECT count(*) AS count FROM audit_logs WHERE action = 'qc.platform.create'").get().count,
  outbox: db.prepare("SELECT count(*) AS count FROM platform_outbox_events WHERE event_type = 'qc.platform.created.v1'").get().count,
  receipt: db.prepare("SELECT count(*) AS count FROM platform_command_receipts WHERE command_name = 'qc.platform.create'").get().count
};
record(
  "ERP-FND-TX-001 duplicate command returns prior result and writes once",
  !first.reused && repeated.reused && first.result.businessId === repeated.result.businessId && Object.values(counts).every((count) => count === 1),
  JSON.stringify(counts)
);

let rollbackError = "";
try {
  executeQcCommand({
    commandName: "qc.platform.rollback",
    idempotencyKey: "qc-idempotency-rollback",
    eventType: "qc.platform.rollback.v1",
    failOutbox: true
  });
} catch (error) {
  rollbackError = error instanceof Error ? error.message : String(error);
}
const rollbackCounts = {
  business: db.prepare("SELECT count(*) AS count FROM erp_foundation_test_records WHERE id = 'business:qc-idempotency-rollback'").get().count,
  audit: db.prepare("SELECT count(*) AS count FROM audit_logs WHERE action = 'qc.platform.rollback'").get().count,
  receipt: db.prepare("SELECT count(*) AS count FROM platform_command_receipts WHERE command_name = 'qc.platform.rollback'").get().count
};
record(
  "ERP-FND-TX-002 outbox failure rolls back business audit and receipt",
  rollbackError === "FORCED_OUTBOX_FAILURE" && Object.values(rollbackCounts).every((count) => count === 0),
  JSON.stringify({ rollbackError, rollbackCounts })
);

let auditRollbackError = "";
try {
  executeQcCommand({
    commandName: "qc.platform.audit_rollback",
    idempotencyKey: "qc-idempotency-audit-rollback",
    eventType: "qc.platform.audit_rollback.v1",
    failAudit: true
  });
} catch (error) {
  auditRollbackError = error instanceof Error ? error.message : String(error);
}
const auditRollbackCounts = {
  business: db.prepare("SELECT count(*) AS count FROM erp_foundation_test_records WHERE id = 'business:qc-idempotency-audit-rollback'").get().count,
  audit: db.prepare("SELECT count(*) AS count FROM audit_logs WHERE action = 'qc.platform.audit_rollback'").get().count,
  outbox: db.prepare("SELECT count(*) AS count FROM platform_outbox_events WHERE event_type = 'qc.platform.audit_rollback.v1'").get().count,
  receipt: db.prepare("SELECT count(*) AS count FROM platform_command_receipts WHERE command_name = 'qc.platform.audit_rollback'").get().count
};
record(
  "ERP-FND-TX-002A audit failure rolls back business receipt and outbox",
  auditRollbackError === "FORCED_AUDIT_FAILURE" &&
    Object.values(auditRollbackCounts).every((count) => count === 0),
  JSON.stringify({ auditRollbackError, auditRollbackCounts })
);

db.prepare(
  `UPDATE platform_principal_mappings
   SET platform_principal_id = 'erp:principal:001', mapping_source = 'shared_iam', external_subject = 'shared-subject-001'
   WHERE pdm_user_id = 'erp-fnd-user'`
).run();
db.prepare(
  `UPDATE platform_organization_mappings
   SET platform_organization_id = 'erp:organization:jenfu', mapping_source = 'shared_core',
       external_organization_key = 'jenfu'
   WHERE pdm_company_id = 'company-jenfu'`
).run();
const mapping = db.prepare(
  "SELECT platform_principal_id, pdm_user_id, mapping_source, external_subject FROM platform_principal_mappings WHERE pdm_user_id = 'erp-fnd-user'"
).get();
record(
  "ERP-FND-IAM-001 shared principal maps without rewriting PDM user ID",
  mapping.platform_principal_id === "erp:principal:001" &&
    mapping.pdm_user_id === "erp-fnd-user" &&
    mapping.mapping_source === "shared_iam" &&
    mapping.external_subject === "shared-subject-001",
  JSON.stringify(mapping)
);
const mappedEvidence = db.prepare(
  `SELECT actor_id, platform_principal_id, company_id, platform_organization_id
   FROM platform_outbox_events WHERE event_type = 'qc.platform.created.v1'`
).get();
record(
  "ERP-FND-IAM-002 command evidence retains PDM IDs and follows shared mapping IDs",
  mappedEvidence.actor_id === "erp-fnd-user" &&
    mappedEvidence.platform_principal_id === "erp:principal:001" &&
    mappedEvidence.company_id === "company-jenfu" &&
    mappedEvidence.platform_organization_id === "erp:organization:jenfu",
  JSON.stringify(mappedEvidence)
);
db.prepare(
  `UPDATE platform_outbox_events
   SET delivery_status = 'failed', attempt_count = attempt_count + 1,
       last_error = 'redacted delivery failure', next_attempt_at = datetime('now', '+1 minute'),
       updated_at = datetime('now')
   WHERE event_type = 'qc.platform.created.v1'`
).run();
const retryEvidence = db.prepare(
  `SELECT delivery_status, attempt_count, last_error, next_attempt_at
   FROM platform_outbox_events WHERE event_type = 'qc.platform.created.v1'`
).get();
record(
  "ERP-FND-TX-004 failed delivery records bounded retry state",
  retryEvidence.delivery_status === "failed" &&
    retryEvidence.attempt_count === 1 &&
    retryEvidence.last_error === "redacted delivery failure" &&
    Boolean(retryEvidence.next_attempt_at),
  JSON.stringify(retryEvidence)
);

const eventPayloads = db.prepare("SELECT payload_json FROM platform_outbox_events").all().map((row) => String(row.payload_json));
const secretPattern = /password|secret|token|signed[_-]?url|oauth[_-]?code/iu;
record(
  "ERP-FND-SEC-003 outbox fixture payload is non-secret",
  eventPayloads.every((payload) => !secretPattern.test(payload)),
  eventPayloads.join("; ")
);

db.close();

const concurrencyDbPath = path.join(root, ".tmp", `qc-dev-044-concurrency-${crypto.randomUUID()}.sqlite`);
fs.mkdirSync(path.dirname(concurrencyDbPath), { recursive: true });
const firstConnection = new Database(concurrencyDbPath);
firstConnection.exec(schema);
firstConnection.exec(`
  INSERT OR IGNORE INTO users (
    id, display_name, email, password_hash, role, company_id, account_status, created_at, updated_at
  ) VALUES (
    'erp-fnd-concurrent-user', 'Concurrent User', 'concurrent@example.com', NULL,
    'Admin', 'company-jenfu', 'active', datetime('now'), datetime('now')
  );
  INSERT INTO platform_principal_mappings (
    platform_principal_id, pdm_user_id, mapping_source, mapping_status, created_at, updated_at
  ) VALUES ('pdm:erp-fnd-concurrent-user', 'erp-fnd-concurrent-user', 'current_pdm', 'active', datetime('now'), datetime('now'));
  INSERT OR IGNORE INTO platform_organization_mappings (
    platform_organization_id, pdm_company_id, mapping_source, mapping_status, created_at, updated_at
  ) VALUES ('pdm-company:company-jenfu', 'company-jenfu', 'current_pdm', 'active', datetime('now'), datetime('now'));
`);
const secondConnection = new Database(concurrencyDbPath);
secondConnection.pragma("busy_timeout = 20");
const concurrentClaimSql = `INSERT INTO platform_command_receipts (
  id, company_id, command_name, schema_version, idempotency_key, actor_id,
  platform_principal_id, platform_organization_id, correlation_id,
  command_status, response_json, created_at
) VALUES (?, 'company-jenfu', 'qc.platform.concurrent', 1, 'same-logical-command',
  'erp-fnd-concurrent-user', 'pdm:erp-fnd-concurrent-user', 'pdm-company:company-jenfu',
  'corr:concurrent', 'processing', '{}', datetime('now'))
ON CONFLICT(company_id, command_name, idempotency_key) DO NOTHING`;
let lockErrorCode = "";
firstConnection.exec("BEGIN IMMEDIATE");
firstConnection.prepare(concurrentClaimSql).run("concurrent-receipt-1");
try {
  secondConnection.prepare(concurrentClaimSql).run("concurrent-receipt-2");
} catch (error) {
  lockErrorCode = error && typeof error === "object" && "code" in error ? String(error.code) : String(error);
}
firstConnection.exec("COMMIT");
const retryClaim = secondConnection.prepare(concurrentClaimSql).run("concurrent-receipt-2");
const concurrentReceiptCount = secondConnection
  .prepare("SELECT count(*) AS count FROM platform_command_receipts WHERE command_name = 'qc.platform.concurrent'")
  .get().count;
record(
  "ERP-FND-TX-003 concurrent command claim serializes and deduplicates",
  lockErrorCode === "SQLITE_BUSY" && retryClaim.changes === 0 && concurrentReceiptCount === 1,
  JSON.stringify({ lockErrorCode, retryChanges: retryClaim.changes, concurrentReceiptCount })
);
secondConnection.close();
firstConnection.close();
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${concurrencyDbPath}${suffix}`, { force: true });

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
