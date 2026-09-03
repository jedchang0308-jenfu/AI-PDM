import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const workspace = process.cwd();
const args = new Map(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.split("=");
  return [key, rest.length ? rest.join("=") : true];
}));
const provider = String(args.get("--provider") ?? "sqlite");
const mode = String(args.get("--mode") ?? "dry-run");
if (!["dry-run", "apply", "rehearsal"].includes(mode)) throw new Error(`DEV106_MODE_INVALID: ${mode}`);
if (provider === "postgres") {
  const migrationPath = path.resolve(workspace, "db/postgres/052_sales_kit_bom.sql");
  if (!fs.existsSync(migrationPath)) throw new Error("DEV106_MIGRATION_NOT_FOUND");
  if (mode !== "rehearsal") throw new Error("DEV106_POSTGRES_REHEARSAL_ONLY");
  console.log(JSON.stringify({ provider, mode, migrationPath, productionWrites: false, sqlHash: hash(fs.readFileSync(migrationPath, "utf8")) }, null, 2));
  process.exit(0);
}

const dataDir = requiredTaskPath("PDM_DATA_DIR");
const repositoryDir = requiredTaskPath("PDM_REPOSITORY_DIR");
const primaryDataDir = path.resolve(workspace, "data");
if (samePath(dataDir, primaryDataDir)) throw new Error("DEV106_PRIMARY_DATA_FORBIDDEN");
if (samePath(repositoryDir, path.resolve(workspace, "repository"))) throw new Error("DEV106_PRIMARY_REPOSITORY_FORBIDDEN");
const databasePath = path.resolve(String(args.get("--database") ?? path.join(dataDir, "ai-pdm.sqlite")));
assertWithin(databasePath, dataDir, "DEV106_DATABASE_OUTSIDE_TASK_DATA");
if (!fs.existsSync(databasePath)) throw new Error(`DEV106_DATABASE_NOT_FOUND: ${databasePath}`);
const evidenceDir = path.resolve(String(args.get("--evidence-dir") ?? path.join(dataDir, "dev-106-migration-evidence")));
assertWithin(evidenceDir, dataDir, "DEV106_EVIDENCE_OUTSIDE_TASK_DATA");
fs.mkdirSync(evidenceDir, { recursive: true });

const db = new Database(databasePath, { readonly: mode === "dry-run", fileMustExist: true });
db.pragma("foreign_keys = ON");
const before = inspect(db);
const plan = { addPurpose: !before.columns.includes("purpose"), invalidRows: before.invalidRows, addGuards: !before.hasPurposeGuards || !before.hasPurposeIndex };
if (mode === "dry-run") {
  db.close();
  write(evidenceDir, "evidence.json", { provider, mode, databasePath, taskDataDir: dataDir, taskRepositoryDir: repositoryDir, productionWrites: false, writes: 0, before, plan });
  console.log(JSON.stringify({ provider, mode, productionWrites: false, writes: 0, plan }, null, 2));
  process.exit(0);
}
if (mode !== "apply") throw new Error("DEV106_SQLITE_MODE_INVALID");
if (!plan.addPurpose && plan.invalidRows === 0 && !plan.addGuards) {
  db.close();
  write(evidenceDir, "evidence.json", { provider, mode, databasePath, taskDataDir: dataDir, taskRepositoryDir: repositoryDir, productionWrites: false, backupPath: null, before, after: before, rerun: { noOp: true, writes: 0 }, writes: 0, foreignKeyViolations: before.foreignKeyViolations });
  console.log(JSON.stringify({ provider, mode, productionWrites: false, backupPath: null, noOp: true, writes: 0 }, null, 2));
  process.exit(0);
}
const backupPath = `${databasePath}.dev106-backup-${Date.now()}`;
fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);
db.exec("BEGIN IMMEDIATE");
try {
  if (plan.addPurpose) db.exec("ALTER TABLE bom_definitions ADD COLUMN purpose TEXT NOT NULL DEFAULT 'manufacturing'");
  db.exec("UPDATE bom_definitions SET purpose = 'manufacturing' WHERE purpose IS NULL");
  db.exec("CREATE INDEX IF NOT EXISTS idx_bom_definitions_company_purpose ON bom_definitions(company_id, purpose, updated_at, id)");
  db.exec("CREATE TRIGGER IF NOT EXISTS trg_bom_definition_purpose_valid_insert BEFORE INSERT ON bom_definitions WHEN NEW.purpose IS NULL OR NEW.purpose NOT IN ('manufacturing','sales_kit') BEGIN SELECT RAISE(ABORT, 'BOM_DEFINITION_PURPOSE_INVALID'); END");
  db.exec("CREATE TRIGGER IF NOT EXISTS trg_bom_definition_purpose_valid_update BEFORE UPDATE OF purpose ON bom_definitions WHEN NEW.purpose IS NULL OR NEW.purpose NOT IN ('manufacturing','sales_kit') BEGIN SELECT RAISE(ABORT, 'BOM_DEFINITION_PURPOSE_INVALID'); END");
  db.exec("CREATE TRIGGER IF NOT EXISTS trg_bom_definition_purpose_immutable BEFORE UPDATE OF purpose ON bom_definitions WHEN NEW.purpose IS NOT OLD.purpose BEGIN SELECT RAISE(ABORT, 'BOM_DEFINITION_PURPOSE_IMMUTABLE'); END");
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  db.close();
  throw error;
}
const after = inspect(db);
const foreignKeyViolations = db.pragma("foreign_key_check");
db.close();
if (foreignKeyViolations.length) throw new Error(`DEV106_FOREIGN_KEY_CHECK_FAILED: ${JSON.stringify(foreignKeyViolations)}`);
const rerun = { addPurpose: !after.columns.includes("purpose"), invalidRows: after.invalidRows, addGuards: !after.hasPurposeGuards || !after.hasPurposeIndex };
write(evidenceDir, "evidence.json", { provider, mode, databasePath, taskDataDir: dataDir, taskRepositoryDir: repositoryDir, productionWrites: false, backupPath, before, after, rerun, foreignKeyViolations, writes: plan.addPurpose ? 1 : 0 });
console.log(JSON.stringify({ provider, mode, productionWrites: false, backupPath, rerun }, null, 2));

function inspect(db) {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bom_definitions'").get();
  if (!table) throw new Error("DEV106_BOM_DEFINITIONS_MISSING");
  const columns = db.prepare("PRAGMA table_info(bom_definitions)").all().map((row) => row.name);
  const invalidRows = columns.includes("purpose")
    ? Number(db.prepare("SELECT COUNT(*) FROM bom_definitions WHERE purpose IS NULL OR purpose NOT IN ('manufacturing','sales_kit')").pluck().get())
    : 0;
  const indexes = db.prepare("PRAGMA index_list(bom_definitions)").all().map((row) => row.name);
  const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='bom_definitions'").all().map((row) => row.name);
  return { columns, definitionCount: Number(db.prepare("SELECT COUNT(*) FROM bom_definitions").pluck().get()), invalidRows, hasPurposeIndex: indexes.includes("idx_bom_definitions_company_purpose"), hasPurposeGuards: triggers.includes("trg_bom_definition_purpose_immutable") && triggers.includes("trg_bom_definition_purpose_valid_insert") && triggers.includes("trg_bom_definition_purpose_valid_update"), foreignKeyViolations: db.pragma("foreign_key_check") };
}

function requiredTaskPath(name) {
  const value = process.env[name];
  if (!value) throw new Error(`DEV106_${name}_REQUIRED`);
  return path.resolve(value);
}

function assertWithin(target, root, code) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(code);
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function write(dir, name, value) {
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function hash(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
