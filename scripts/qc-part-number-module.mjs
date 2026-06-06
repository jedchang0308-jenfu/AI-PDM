import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  checks.push({ message, passed: Boolean(condition) });
  if (!condition) {
    throw new Error(message);
  }
}

const sqliteSchema = read("db/schema.sql");
const postgresSchema = read("db/postgres/001_initial_schema.sql");
const rlsPlan = read("db/postgres/002_supabase_rls_plan.sql");
const repository = read("src/lib/repositories/numbering-repository.ts");
const dbExports = read("src/lib/db.ts");
const sidebar = read("src/components/sidebar-nav.tsx");
const navPermissions = read("src/lib/numbering-permission-codes.ts");
const partsPage = read("src/app/parts/page.tsx");
const packageJson = JSON.parse(read("package.json"));

const expectedTables = [
  "part_variant_attributes",
  "part_cost_profiles",
  "part_cost_tiers",
  "part_standard_costs",
  "part_cost_change_requests"
];

for (const table of expectedTables) {
  assert(sqliteSchema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `SQLite schema includes ${table}`);
  assert(postgresSchema.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `Postgres schema includes ${table}`);
  assert(rlsPlan.includes(`'${table}'`), `Supabase RLS baseline includes ${table}`);
}

const database = new Database(":memory:");
database.exec("PRAGMA foreign_keys = ON;");
database.exec(sqliteSchema);

for (const table of expectedTables) {
  const row = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  assert(row?.name === table, `SQLite can create ${table}`);
}

const standardColumns = database.prepare("PRAGMA table_info(part_standard_costs)").all().map((column) => column.name);
assert(standardColumns.includes("part_number_id"), "part_standard_costs references part_number_id");
assert(!standardColumns.includes("drawing_number_id"), "part_standard_costs does not reference drawing_number_id");

const costProfileColumns = database.prepare("PRAGMA table_info(part_cost_profiles)").all().map((column) => column.name);
assert(costProfileColumns.includes("cost_type"), "part_cost_profiles keeps multiple cost type profiles");
assert(costProfileColumns.includes("status"), "part_cost_profiles keeps approval status");

const repositoryFunctions = [
  "listPartModuleRecords",
  "getPartModuleDetail",
  "upsertPartVariantAttributes",
  "createPartCostProfile"
];
for (const functionName of repositoryFunctions) {
  assert(repository.includes(`export function ${functionName}`), `repository exports ${functionName}`);
  assert(dbExports.includes(functionName), `db.ts re-exports ${functionName}`);
}

const routeFiles = [
  "src/app/api/parts/route.ts",
  "src/app/api/parts/[partNumber]/route.ts",
  "src/app/api/parts/[partNumber]/variant/route.ts",
  "src/app/api/parts/[partNumber]/cost-profiles/route.ts"
];
for (const routeFile of routeFiles) {
  assert(fs.existsSync(path.join(root, routeFile)), `API route exists: ${routeFile}`);
}

assert(partsPage.includes("料號模組"), "parts page renders part module workbench");
assert(partsPage.includes("/api/parts"), "parts page calls parts API");
assert(sidebar.includes('href: "/parts"'), "sidebar includes /parts entry");
assert(navPermissions.includes('"/parts": "numbering.search"'), "sidebar permission maps /parts to numbering.search");
assert(packageJson.scripts["qc:part-number-module"] === "node scripts/qc-part-number-module.mjs", "package script qc:part-number-module is registered");

database.close();

console.log(`qc:part-number-module passed ${checks.length}/${checks.length} checks`);
