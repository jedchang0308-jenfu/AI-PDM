import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...rest] = argument.split("=");
    return [key, rest.length > 0 ? rest.join("=") : true];
  })
);
const databaseArgument = args.get("--database");
if (typeof databaseArgument !== "string" || !databaseArgument.trim()) {
  throw new Error("DEV095_DATABASE_REQUIRED: pass --database=<absolute-or-relative-sqlite-path>");
}

const workspace = process.cwd();
const databasePath = path.resolve(databaseArgument);
const primaryPath = path.resolve(workspace, "data", "ai-pdm.sqlite");
const isPrimary = normalizedPath(databasePath) === normalizedPath(primaryPath);
const apply = args.get("--apply") === true;
const beforeHash = sha256(databasePath);

if (isPrimary) {
  const expectedHash = String(args.get("--expected-sha256") ?? "").toLowerCase();
  if (args.get("--allow-primary") !== true || expectedHash !== beforeHash.toLowerCase()) {
    throw new Error(
      "DEV095_PRIMARY_GUARD: primary migration requires --allow-primary and --expected-sha256=<current SHA-256>"
    );
  }
}

const database = new Database(databasePath, { readonly: !apply, fileMustExist: true });
const before = inspect(database);

if (!apply) {
  database.close();
  console.log(JSON.stringify({ mode: "dry-run", databasePath, isPrimary, sha256: beforeHash, before }, null, 2));
  process.exit(0);
}

if (before.retired) {
  database.close();
  console.log(JSON.stringify({ mode: "apply", replayed: true, databasePath, isPrimary, sha256: beforeHash, before }, null, 2));
  process.exit(0);
}

const backupPath = `${databasePath}.dev095-backup-${timestamp()}`;
fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);

const schema = fs.readFileSync(path.join(workspace, "db", "schema.sql"), "utf8");
database.pragma("foreign_keys = OFF");
try {
  database.exec("BEGIN IMMEDIATE");
  database.exec(`
    DELETE FROM bom_create_effects
    WHERE draft_id IN (SELECT id FROM bom_drafts WHERE source IN ('cad_reference', 'solidworks_xls'));
    DELETE FROM bom_release_snapshots
    WHERE bom_draft_id IN (SELECT id FROM bom_drafts WHERE source IN ('cad_reference', 'solidworks_xls'));
    DELETE FROM bom_drafts WHERE source IN ('cad_reference', 'solidworks_xls');
    DELETE FROM bom_headers WHERE source = 'cad_references';
    DELETE FROM file_references WHERE reference_type = 'assembly_component';
    DROP TABLE IF EXISTS bom_import_jobs;
    DROP TABLE IF EXISTS bom_import_profiles;
  `);

  rebuildTable(database, schema, "file_references");
  rebuildTable(database, schema, "bom_headers");
  rebuildTable(database, schema, "bom_drafts");
  rebuildTable(database, schema, "bom_lines_tree", { source: "'manual'", source_priority: "30" });
  rebuildTable(database, schema, "bom_draft_floating_topics", { source: "'manual'" });
  rebuildTable(database, schema, "bom_release_snapshots");

  database.exec(schema);
  database.exec("COMMIT");
} catch (error) {
  try {
    database.exec("ROLLBACK");
  } catch {
    // Preserve the migration failure.
  }
  throw error;
} finally {
  database.pragma("foreign_keys = ON");
}

const after = inspect(database);
const foreignKeyViolations = database.pragma("foreign_key_check");
database.close();
if (!after.retired || foreignKeyViolations.length > 0) {
  throw new Error(`DEV095_POSTCHECK_FAILED: ${JSON.stringify({ after, foreignKeyViolations })}`);
}

console.log(
  JSON.stringify(
    {
      mode: "apply",
      replayed: false,
      databasePath,
      isPrimary,
      backupPath,
      beforeSha256: beforeHash,
      afterSha256: sha256(databasePath),
      before,
      after,
      foreignKeyViolations
    },
    null,
    2
  )
);

function rebuildTable(databaseHandle, canonicalSchema, tableName, expressions = {}) {
  const oldColumns = new Set(
    databaseHandle.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map((column) => column.name)
  );
  if (oldColumns.size === 0) return;

  const tempName = `${tableName}_dev095_retired`;
  databaseHandle.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(tempName)}`);
  const createSql = extractCreateTable(canonicalSchema, tableName).replace(
    `CREATE TABLE IF NOT EXISTS ${tableName}`,
    `CREATE TABLE ${quoteIdentifier(tempName)}`
  );
  databaseHandle.exec(createSql);

  const newColumns = databaseHandle
    .prepare(`PRAGMA table_info(${quoteIdentifier(tempName)})`)
    .all()
    .map((column) => column.name);
  const copiedColumns = newColumns.filter((column) => oldColumns.has(column));
  const targets = copiedColumns.map(quoteIdentifier).join(", ");
  const values = copiedColumns
    .map((column) => expressions[column] ?? quoteIdentifier(column))
    .join(", ");
  if (copiedColumns.length > 0) {
    databaseHandle.exec(
      `INSERT INTO ${quoteIdentifier(tempName)} (${targets}) SELECT ${values} FROM ${quoteIdentifier(tableName)}`
    );
  }
  databaseHandle.exec(`DROP TABLE ${quoteIdentifier(tableName)}`);
  databaseHandle.exec(`ALTER TABLE ${quoteIdentifier(tempName)} RENAME TO ${quoteIdentifier(tableName)}`);
}

function extractCreateTable(canonicalSchema, tableName) {
  const marker = `CREATE TABLE IF NOT EXISTS ${tableName} (`;
  const start = canonicalSchema.indexOf(marker);
  if (start < 0) throw new Error(`DEV095_SCHEMA_TABLE_NOT_FOUND: ${tableName}`);
  const end = canonicalSchema.indexOf("\n);", start);
  if (end < 0) throw new Error(`DEV095_SCHEMA_TABLE_UNTERMINATED: ${tableName}`);
  return canonicalSchema.slice(start, end + 3);
}

function inspect(databaseHandle) {
  const tableNames = new Set(
    databaseHandle.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name)
  );
  const columnNames = (tableName) =>
    new Set(databaseHandle.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map((row) => row.name));
  const scalar = (sql) => Number(databaseHandle.prepare(sql).pluck().get() ?? 0);
  const legacy = {
    assemblyReferences: tableNames.has("file_references")
      ? scalar("SELECT COUNT(*) FROM file_references WHERE reference_type = 'assembly_component'")
      : 0,
    legacyDrafts: tableNames.has("bom_drafts")
      ? scalar("SELECT COUNT(*) FROM bom_drafts WHERE source IN ('cad_reference', 'solidworks_xls')")
      : 0,
    legacyHeaders: tableNames.has("bom_headers")
      ? scalar("SELECT COUNT(*) FROM bom_headers WHERE source = 'cad_references'")
      : 0
  };
  const residue = {
    bomImportProfiles: tableNames.has("bom_import_profiles"),
    bomImportJobs: tableNames.has("bom_import_jobs"),
    draftSourceRevisionPackage: tableNames.has("bom_drafts") && columnNames("bom_drafts").has("source_revision_package_id"),
    snapshotSourceRevisionPackage:
      tableNames.has("bom_release_snapshots") && columnNames("bom_release_snapshots").has("source_revision_package_id")
  };
  return {
    legacy,
    residue,
    retired: Object.values(legacy).every((count) => count === 0) && !Object.values(residue).some(Boolean)
  };
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function normalizedPath(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}
