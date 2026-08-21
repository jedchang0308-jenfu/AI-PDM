#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import pg from "pg";

const { Pool } = pg;
const root = process.cwd();

const SKIP_TABLES = new Set([
  "account_recovery_requests",
  "account_session_records",
  "employee_login_aliases",
  "employee_login_intents",
  "employee_login_rate_limits",
  "firebase_identity_invitations",
  "auth_identities",
  "secret_references"
]);

const FILE_TABLES = new Set([
  "file_assets",
  "file_derivatives",
  "submission_files",
  "drawing_revision_files",
  "drawing_revision_package_files",
  "drawing_revision_package_supplement_files",
  "master_attachments"
]);

function parseArgs(argv) {
  const args = { output: "", report: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--output") args.output = argv[++index] ?? "";
    else if (value === "--report") args.report = argv[++index] ?? "";
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.output) throw new Error("IMPORT_OUTPUT_REQUIRED");
  return args;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function maskEmail(value) {
  return `masked-${sha256(String(value).trim().toLowerCase()).slice(0, 16)}@example.invalid`;
}

function maskText(value, userIdMap) {
  let text = String(value);
  for (const [source, replacement] of userIdMap.entries()) {
    text = text.replaceAll(source, replacement);
  }
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, (email) => maskEmail(email));
}

function isSensitiveKey(key) {
  return /password|secret|token|private|credential|api[_-]?key|client[_-]?secret|session[_-]?id|provider[_-]?subject|firebase[_-]?uid/iu.test(key);
}

function sanitizeJsonValue(value, userIdMap, key = "") {
  if (isSensitiveKey(key)) return "[MASKED]";
  if (Array.isArray(value)) return value.map((item) => sanitizeJsonValue(item, userIdMap, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizeJsonValue(childValue, userIdMap, childKey)
      ])
    );
  }
  if (typeof value === "string") return maskText(value, userIdMap);
  return value;
}

function sanitizeJson(value, userIdMap) {
  if (value === null || value === undefined) return value;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return JSON.stringify(sanitizeJsonValue(parsed, userIdMap));
  } catch {
    return maskText(value, userIdMap);
  }
}

function normalizeValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value;
  return value;
}

function isJsonColumn(column) {
  return /(?:json|payload|claims|metadata|snapshot|detail|configuration|attributes|observations|context)/iu.test(column);
}

function isSensitiveColumn(column) {
  return /password_hash|session_id_hash|ip_hash|ip_summary|user_agent_hash|user_agent_hint|secret|token|private_key|client_secret|api_key|credential/iu.test(column);
}

function isEmailColumn(column) {
  return /(?:^|_)email(?:$|_)|login_identifier/iu.test(column);
}

function filePlaceholder(table, row, column) {
  const rowId = row.id ? String(row.id) : sha256(JSON.stringify(row)).slice(0, 16);
  const key = `production-snapshot-files-not-exported/${table}/${rowId}`;
  if (column === "storage_provider") return "local_repository";
  if (column === "storage_bucket") return null;
  if (/local_path/iu.test(column)) return path.join(root, "data", "repository", key);
  if (/(?:storage_key|object_key)/iu.test(column)) return key;
  if (/(?:uri|url)/iu.test(column)) return null;
  return undefined;
}

function sanitizeRow(table, row, userIdMap, userLabelMap) {
  const sanitized = { ...row };
  const userId = table === "users" ? String(row.id) : "";
  for (const [column, original] of Object.entries(row)) {
    const value = normalizeValue(original);
    const lowerColumn = column.toLowerCase();
    const fileValue = FILE_TABLES.has(table) ? filePlaceholder(table, row, column) : undefined;
    if (fileValue !== undefined) {
      sanitized[column] = fileValue;
      continue;
    }
    if (table === "users" && column === "id") {
      sanitized[column] = userIdMap.get(userId) ?? `production-user-${sha256(userId).slice(0, 12)}`;
      continue;
    }
    if (table === "users" && column === "display_name") {
      sanitized[column] = userLabelMap.get(userId) ?? "Production User";
      continue;
    }
    if (table === "users" && lowerColumn === "password_hash") {
      sanitized[column] = null;
      continue;
    }
    if (table === "companies" && column === "display_name") {
      sanitized[column] = `Production Simulation ${row.company_code ?? "Company"}`;
      continue;
    }
    if (isSensitiveColumn(column)) {
      sanitized[column] = lowerColumn === "password_hash"
        ? null
        : value === null || value === undefined
          ? value
          : `[MASKED:${sha256(`${table}.${column}:${String(value)}`).slice(0, 32)}]`;
      continue;
    }
    if (isEmailColumn(column) && value !== null && value !== undefined) {
      sanitized[column] = maskEmail(value);
      continue;
    }
    if (isJsonColumn(column)) {
      sanitized[column] = sanitizeJson(value, userIdMap);
      continue;
    }
    if (typeof value === "string") {
      sanitized[column] = userIdMap.get(value) ?? maskText(value, userIdMap);
    } else {
      sanitized[column] = value;
    }
  }
  return sanitized;
}

function localTableNames(database) {
  return database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => row.name);
}

function localColumns(database, table) {
  return database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all();
}

function localTriggers(database) {
  return database
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL ORDER BY name")
    .all();
}

function dropTriggers(database, triggers) {
  for (const trigger of triggers) database.exec(`DROP TRIGGER IF EXISTS ${quoteIdentifier(trigger.name)}`);
}

function clearLocalTables(database, tables) {
  database.pragma("foreign_keys = OFF");
  for (const table of tables) database.exec(`DELETE FROM ${quoteIdentifier(table)}`);
  const sequence = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
    .get();
  if (sequence) database.exec("DELETE FROM sqlite_sequence");
}

async function postgresTableNames(pool) {
  const result = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
  );
  return result.rows.map((row) => row.table_name);
}

async function postgresColumns(pool, table) {
  const result = await pool.query(
    "SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
    [table]
  );
  return result.rows;
}

function importOrder(database, tables) {
  const tableSet = new Set(tables);
  const dependencies = new Map(tables.map((table) => [table, new Set()]));
  for (const table of tables) {
    for (const foreignKey of database.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`).all()) {
      if (tableSet.has(foreignKey.table) && foreignKey.table !== table) dependencies.get(table).add(foreignKey.table);
    }
  }
  const ordered = [];
  const remaining = new Set(tables);
  while (remaining.size > 0) {
    const ready = [...remaining].filter((table) => [...dependencies.get(table)].every((dependency) => !remaining.has(dependency))).sort();
    if (ready.length === 0) {
      ordered.push(...[...remaining].sort());
      break;
    }
    ordered.push(...ready);
    for (const table of ready) remaining.delete(table);
  }
  return ordered;
}

function addDemoUsers(database) {
  const company = database.prepare("SELECT id FROM companies WHERE upper(company_code) = 'JENFU' LIMIT 1").get();
  const companyId = company?.id ?? "company-jenfu";
  if (!company) {
    database.prepare("INSERT OR IGNORE INTO companies (id, company_code, display_name) VALUES (?, 'JENFU', 'Production Simulation JENFU')").run(companyId);
  }
  const hashPassword = (plain) => {
    const salt = crypto.randomBytes(16);
    return `scrypt:${salt.toString("hex")}:${crypto.scryptSync(plain, salt, 64).toString("hex")}`;
  };
  const users = [
    ["user-engineer-demo", "Demo Engineer", "engineer@example.com", "Engineer"],
    ["user-manager-demo", "R&D Manager", "manager@example.com", "R&D Manager"],
    ["user-manufacturing-demo", "Demo Manufacturing", "manufacturing@example.com", "Manufacturing"],
    ["user-procurement-demo", "Demo Procurement", "procurement@example.com", "Procurement"]
  ];
  const now = new Date().toISOString();
  const upsertUser = database.prepare(
    `INSERT INTO users (id, display_name, email, password_hash, role, company_id, account_status, account_lifecycle_version, system_role_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', 1, 0, ?, ?)
     ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name, password_hash=excluded.password_hash, role=excluded.role, company_id=excluded.company_id, account_status='active', updated_at=excluded.updated_at`
  );
  const membership = database.prepare("INSERT OR IGNORE INTO user_company_memberships (user_id, company_id, is_default, created_at) VALUES (?, ?, 1, ?)");
  const identity = database.prepare(
    `INSERT INTO auth_identities (id, user_id, provider, provider_subject, login_identifier, email_normalized, verified_at, last_login_at, status, identity_lifecycle_version, created_at, updated_at)
     VALUES (?, ?, 'local_password', ?, ?, ?, ?, NULL, 'active', 1, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET provider_subject=excluded.provider_subject, login_identifier=excluded.login_identifier, email_normalized=excluded.email_normalized, status='active', updated_at=excluded.updated_at`
  );
  for (const [id, displayName, email, role] of users) {
    upsertUser.run(id, displayName, email, hashPassword("pdm-demo"), role, companyId, now, now);
    const user = database.prepare("SELECT id FROM users WHERE lower(email) = lower(?)").get(email);
    membership.run(user.id, companyId, now);
    identity.run(`identity-local-${user.id}`, user.id, email, email, email, now, now, now);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = path.resolve(root, args.output);
  const reportPath = path.resolve(root, args.report || `${args.output}.report.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if (fs.existsSync(outputPath)) throw new Error(`IMPORT_OUTPUT_EXISTS:${outputPath}`);

  const pool = new Pool({
    host: process.env.PDM_IMPORT_PG_HOST || "127.0.0.1",
    port: Number(process.env.PDM_IMPORT_PG_PORT || 55432),
    user: process.env.PDM_IMPORT_PG_USER || "postgres",
    database: process.env.PDM_IMPORT_PG_DATABASE || "ai_pdm",
    password: process.env.PGPASSWORD,
    max: 2
  });
  const database = new Database(outputPath);
  const report = {
    version: "production-dump-to-sqlite/v1-masked",
    source: { provider: "cloud_sql_postgres", database: "ai_pdm", productionMutation: false },
    target: { provider: "sqlite", path: path.relative(root, outputPath).replaceAll(path.sep, "/") },
    masking: {
      userIds: true,
      emails: true,
      passwords: true,
      sessions: "skipped",
      authIdentities: "skipped",
      secretReferences: "skipped",
      fileContent: "not exported; pointers rewritten to unavailable local placeholders"
    },
    tables: {},
    localOnlyTables: [],
    productionOnlyTables: [],
    warnings: []
  };

  try {
    database.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
    const tables = localTableNames(database);
    const triggers = localTriggers(database);
    dropTriggers(database, triggers);
    clearLocalTables(database, tables);

    const productionTables = await postgresTableNames(pool);
    const productionTableSet = new Set(productionTables);
    const localTableSet = new Set(tables);
    report.localOnlyTables = tables.filter((table) => !productionTableSet.has(table));
    report.productionOnlyTables = productionTables.filter((table) => !localTableSet.has(table));

    const users = productionTableSet.has("users")
      ? (await pool.query("SELECT id FROM public.users ORDER BY id")).rows
      : [];
    const userIdMap = new Map(users.map((row, index) => [String(row.id), `production-user-${String(index + 1).padStart(4, "0")}`]));
    const userLabelMap = new Map(users.map((row, index) => [String(row.id), `Production User ${String(index + 1).padStart(4, "0")}`]));

    const importableTables = tables.filter((table) => productionTableSet.has(table) && !SKIP_TABLES.has(table));
    for (const table of importableTables) {
      const local = localColumns(database, table);
      const remote = await postgresColumns(pool, table);
      const remoteNames = new Set(remote.map((column) => column.column_name));
      const missingRequired = local
        .filter((column) => column.notnull === 1 && column.dflt_value === null && !remoteNames.has(column.name))
        .map((column) => column.name);
      if (missingRequired.length > 0) throw new Error(`IMPORT_SCHEMA_REQUIRED_COLUMNS_MISSING:${table}:${missingRequired.join(",")}`);
      const columns = local.map((column) => column.name).filter((column) => remoteNames.has(column));
      const rows = (await pool.query(`SELECT * FROM public.${quoteIdentifier(table)}`)).rows;
      const statement = database.prepare(
        `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`
      );
      const insertMany = database.transaction((items) => {
        for (const row of items) {
          const sanitized = sanitizeRow(table, row, userIdMap, userLabelMap);
          statement.run(...columns.map((column) => sanitized[column] ?? null));
        }
      });
      insertMany(rows);
      report.tables[table] = { importedRows: rows.length, skipped: false, columns: columns.length };
    }

    for (const table of SKIP_TABLES) {
      if (productionTableSet.has(table)) {
        const count = Number((await pool.query(`SELECT count(*)::int AS count FROM public.${quoteIdentifier(table)}`)).rows[0].count);
        report.tables[table] = { importedRows: 0, sourceRows: count, skipped: true };
      }
    }

    addDemoUsers(database);
    for (const trigger of triggers) database.exec(trigger.sql);
    database.pragma("foreign_keys = ON");
    const integrity = database.prepare("PRAGMA integrity_check").get();
    const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
    report.integrity = { integrity: Object.values(integrity)[0], foreignKeyViolations: foreignKeys.length };
    if (report.integrity.integrity !== "ok") throw new Error(`IMPORT_SQLITE_INTEGRITY_FAILED:${report.integrity.integrity}`);
    if (foreignKeys.length > 0) throw new Error(`IMPORT_SQLITE_FOREIGN_KEYS_FAILED:${foreignKeys.length}`);
    database.pragma("journal_mode = DELETE");
    database.exec("VACUUM");
    report.demoUsers = ["engineer@example.com", "manager@example.com", "manufacturing@example.com", "procurement@example.com"];
    report.completedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ outputPath, reportPath, importedTables: Object.keys(report.tables).length, integrity: report.integrity }, null, 2));
  } finally {
    database.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
