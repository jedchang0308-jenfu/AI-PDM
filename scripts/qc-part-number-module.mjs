import Database from "better-sqlite3";
import { projectFileExists, readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const checks = [];

function assert(condition, message) {
  checks.push({ message, passed: Boolean(condition) });
  if (!condition) {
    throw new Error(message);
  }
}

const sqliteSchema = readProjectFile(root, "db/schema.sql");
const postgresSchema = readProjectFile(root, "db/postgres/001_initial_schema.sql");
const rlsPlan = readProjectFile(root, "db/postgres/002_supabase_rls_plan.sql");
const repository = readProjectFile(root, "src/lib/repositories/numbering-repository.ts");
const dbExports = readProjectFile(root, "src/lib/db.ts");
const sidebar = readProjectFile(root, "src/components/sidebar-nav.tsx");
const navPermissions = readProjectFile(root, "src/lib/numbering-permission-codes.ts");
const partsPage = readProjectFile(root, "src/app/parts/page.tsx");
const drawingsPage = readProjectFile(root, "src/app/numbering/drawings/page.tsx");
const drawingsRoute = readProjectFile(root, "src/app/api/numbering/drawings/route.ts");
const itemRevisionsRoute = readProjectFile(root, "src/app/api/items/[partNumber]/revisions/route.ts");
const itemInsightsAsync = readProjectFile(root, "src/lib/repositories/item-insight-async-repository.ts");
const partCostVisibility = readProjectFile(root, "src/lib/part-cost-visibility.ts");
const partsRoute = readProjectFile(root, "src/app/api/parts/route.ts");
const partDetailRoute = readProjectFile(root, "src/app/api/parts/[partNumber]/route.ts");
const partCostProfileRoute = readProjectFile(root, "src/app/api/parts/[partNumber]/cost-profiles/route.ts");
const partCostResolutionRoute = readProjectFile(root, "src/app/api/parts/[partNumber]/cost-resolution/route.ts");
const partCostDecisionRoute = readProjectFile(root, "src/app/api/parts/[partNumber]/cost-change-requests/[requestId]/route.ts");
const packageJson = readProjectJson(root, "package.json");

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
  "createPartCostProfile",
  "decidePartCostChangeRequest",
  "resolvePartCost"
];
for (const functionName of repositoryFunctions) {
  assert(repository.includes(`export function ${functionName}`), `repository exports ${functionName}`);
  assert(dbExports.includes(functionName), `db.ts re-exports ${functionName}`);
}

const routeFiles = [
  "src/app/api/parts/route.ts",
  "src/app/api/parts/[partNumber]/route.ts",
  "src/app/api/parts/[partNumber]/variant/route.ts",
  "src/app/api/parts/[partNumber]/cost-profiles/route.ts",
  "src/app/api/parts/[partNumber]/cost-resolution/route.ts",
  "src/app/api/parts/[partNumber]/cost-change-requests/[requestId]/route.ts"
];
for (const routeFile of routeFiles) {
  assert(projectFileExists(root, routeFile), `API route exists: ${routeFile}`);
}

assert(partsPage.includes("料號模組"), "parts page renders part module workbench");
assert(partsPage.includes("/api/parts"), "parts page calls parts API");
assert(sidebar.includes('href: "/parts"'), "sidebar includes /parts entry");
assert(navPermissions.includes('"/parts": "numbering.search"'), "sidebar permission maps /parts to numbering.search");
assert(partCostVisibility.includes('"Admin", "R&D Manager", "Procurement"'), "part cost amount visibility includes legacy admin, manager, and procurement roles");
assert(partCostVisibility.includes('"system_admin", "pdm_admin", "rd_manager", "procurement"'), "part cost amount visibility includes ACL cost roles");
assert(partCostVisibility.includes("unitCost: null"), "part cost redaction clears standard cost amount");
assert(partCostVisibility.includes("costProfiles: []"), "part cost redaction hides cost profile tier amounts");
assert(repository.includes("PART_COST_TIER_RANGE_OVERLAP"), "repository rejects overlapping cost tiers");
assert(repository.includes("SAME_DRAWING_VARIANT_DETAIL_REQUIRED"), "repository blocks DVT/Release gate when same-drawing variant details are missing");
assert(repository.includes("primaryDrawingHasMultipleLinkedParts"), "repository detects multi-part primary MA drawing links");
assert(repository.includes("partHasVariantDescriptor"), "repository checks material, color, or variant note before DVT/Release");
assert(repository.includes("DrawingModuleLinkedPartRecord"), "drawing module exposes same-root linked part detail contract");
assert(repository.includes("selectDrawingModuleLinkedPartsByRoot"), "drawing module loads same-root parts for drawing detail");
assert(repository.includes("standardCostStatus") && repository.includes("part_standard_costs"), "drawing detail includes active or missing standard cost status");
assert(repository.includes("hasPotentialHardcodedTitleBlockVariantText"), "drawing module detects potential hard-coded material or color title block text");
assert(repository.includes("NO_APPROVED_STANDARD_COST"), "repository reports missing approved standard cost");
assert(repository.includes("NO_PART_COST_TIER_FOR_QUANTITY"), "repository reports missing quantity tier");
assert(repository.includes("status = 'approved'"), "repository resolves only approved cost profiles");
assert(repository.includes("part_standard_costs") && repository.includes("effective_to IS NULL"), "repository maintains active standard cost history");
assert(repository.includes("numbering.part_cost_change.approve"), "repository writes approve audit");
assert(repository.includes("numbering.part_cost_change.reject"), "repository writes reject audit");
assert(partsRoute.includes("redactPartListCosts") && partsRoute.includes("canViewPartCostAmounts(auth)"), "parts list API applies cost amount redaction");
assert(partDetailRoute.includes("redactPartDetailCosts") && partDetailRoute.includes("canViewPartCostAmounts(auth)"), "part detail API applies cost amount redaction");
assert(partCostProfileRoute.includes("redactPartDetailCosts") && partCostProfileRoute.includes("canViewPartCostAmounts(auth)"), "part cost profile create API applies response redaction");
assert(partCostResolutionRoute.includes("resolvePartCost") && partCostResolutionRoute.includes("unitCost: null"), "part cost resolution API resolves and redacts costs");
assert(partCostDecisionRoute.includes("decidePartCostChangeRequest") && partCostDecisionRoute.includes("numbering.approval.batch.decide"), "part cost decision API uses approval decision permission");
assert(partsPage.includes("成本審核") && partsPage.includes("decideCostRequest") && partsPage.includes("cost-change-requests"), "parts page exposes cost review actions");
assert(drawingsRoute.includes("listDrawingModuleRecords"), "drawing API returns drawing module records");
assert(drawingsPage.includes("同主根號料號") && drawingsPage.includes("Title block 變體風險"), "drawing page shows same-root part detail and title block warning");
assert(drawingsPage.includes("standardCostLabel") && drawingsPage.includes("primaryDrawingNumber"), "drawing page renders standard cost status and primary MA link");
assert(itemRevisionsRoute.includes("export async function GET") && !itemRevisionsRoute.includes("export async function POST") && !itemRevisionsRoute.includes("export async function PATCH"), "item revision route is read-only");
assert(!itemRevisionsRoute.includes("createPartCostProfile") && !itemRevisionsRoute.includes("decidePartCostChangeRequest"), "item revision route does not trigger cost review flows");
assert(!itemInsightsAsync.includes("part_cost_change_requests") && !itemInsightsAsync.includes("part_standard_costs"), "item revision history query does not mutate or read cost workflow tables");
assert(projectFileExists(root, "scripts/qc-part-cost-review-e2e.mjs"), "part cost review E2E QC script exists");
assert(packageJson.scripts["qc:part-cost-review-e2e"] === "node scripts/qc-part-cost-review-e2e.mjs", "package script qc:part-cost-review-e2e is registered");
assert(packageJson.scripts["qc:part-number-module"] === "node scripts/qc-part-number-module.mjs", "package script qc:part-number-module is registered");

database.close();

console.log(`qc:part-number-module passed ${checks.length}/${checks.length} checks`);
