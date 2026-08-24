import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

const deletedPaths = [
  "src/components/bom-create-workflow.tsx",
  "src/app/bom/new/page.tsx",
  "src/app/api/bom/create-context/route.ts",
  "src/app/api/bom/drafts/from-assembly/route.ts",
  "src/app/api/bom/drafts/import-xls/route.ts",
  "scripts/qc-dev-060-bom-create.mjs",
  "scripts/qc-dev-074-bom-controlled-cad-source.mjs",
  "scripts/qc-bom-workbench-solidworks-xls-import.mjs"
];
for (const relativePath of deletedPaths) assert.equal(exists(relativePath), false, `${relativePath} must remain deleted`);

const sourceFiles = [
  ...walk(path.join(root, "src")),
  ...walk(path.join(root, "scripts")).filter(
    (filePath) =>
      ![
        "migrate-dev-095-legacy-assembly-bom-retirement.mjs",
        "qc-dev-095-assembly-retirement.mjs",
        "qc-dev-095-primary-invariant.mjs"
      ].includes(path.basename(filePath))
  )
];
const forbiddenSourceTerms = [
  "assembly_component",
  "solidworks_xls",
  "/bom/new",
  "/api/bom/create-context",
  "/api/bom/drafts/from-assembly",
  "/api/bom/drafts/import-xls",
  "materializeBomDraftFromReferences",
  "createBomWorkbenchDraftFromAssembly",
  "createBomWorkbenchDraftFromSolidWorksXls",
  "bom_import_jobs",
  "bom_import_profiles"
];
const sourceResidue = sourceFiles.flatMap((filePath) => {
  const source = fs.readFileSync(filePath, "utf8");
  return forbiddenSourceTerms.filter((term) => source.includes(term)).map((term) => ({ filePath, term }));
});
assert.deepEqual(sourceResidue, [], `legacy assembly intake residue remains: ${JSON.stringify(sourceResidue)}`);

const schema = read("db/schema.sql");
const bomSchema = schema.slice(schema.indexOf("CREATE TABLE IF NOT EXISTS file_references"), schema.indexOf("CREATE TABLE IF NOT EXISTS item_locks"));
for (const term of ["assembly_component", "cad_references", "cad_reference", "solidworks_xls", "bom_import_jobs", "bom_import_profiles", "source_revision_package_id"]) {
  assert.equal(bomSchema.includes(term), false, `fresh BOM schema must not include ${term}`);
}
assert.match(schema, /source_file_role IN \([^)]*'sldasm'/, "SLDASM must remain a legal CAD file role");
assert.match(read("src/lib/types.ts"), /export type BomWorkbenchSource = "manual";/, "BOM workbench source must be manual-only");
assert.equal(
  read("src/app/styles/responsive.css").includes("grid-template-columns: minmax(230px, 0.66fr) minmax(0, 1.34fr)"),
  false,
  "retired split-pane tablet layout must not compress the BOM list"
);

const draftsRoute = read("src/app/api/bom/drafts/route.ts");
assert.match(draftsRoute, /body\.source === "manual"/, "canonical draft creation must be manual-only");
assert.match(draftsRoute, /BOM_MANUAL_SOURCE_SUBMISSION_FORBIDDEN/, "legacy source-bound payloads must be rejected");
const submissionBomRoute = read("src/app/api/submissions/[id]/bom/route.ts");
assert.match(submissionBomRoute, /BOM_MATERIALIZATION_RETIRED/, "legacy materialize query must return a retirement error");

const packageJson = JSON.parse(read("package.json"));
for (const retiredScript of [
  "qc:dev-060-bom-create",
  "qc:dev-074:bom-controlled-cad-source",
  "qc:bom-workbench-solidworks-xls-import"
]) {
  assert.equal(packageJson.scripts[retiredScript], undefined, `${retiredScript} must be removed`);
}
assert.ok(packageJson.scripts["pdm:dev-095:retirement-dry-run"], "DEV-095 dry-run command is required");
assert.ok(packageJson.scripts["pdm:dev-095:retirement-apply"], "DEV-095 apply command is required");

const postgresMigration = read("db/postgres/047_retire_legacy_assembly_bom_intake.sql");
for (const term of ["DROP TABLE IF EXISTS bom_import_jobs", "DROP TABLE IF EXISTS bom_import_profiles", "DROP COLUMN IF EXISTS source_revision_package_id"]) {
  assert.ok(postgresMigration.includes(term), `PostgreSQL migration must include ${term}`);
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev095-qc-"));
try {
  const fixturePath = path.join(tempRoot, "legacy.sqlite");
  const fixture = new Database(fixturePath);
  fixture.exec(schema);
  fixture.pragma("foreign_keys = OFF");
  fixture.pragma("ignore_check_constraints = ON");
  fixture.exec(`
    ALTER TABLE bom_drafts ADD COLUMN source_revision_package_id TEXT;
    ALTER TABLE bom_release_snapshots ADD COLUMN source_revision_package_id TEXT;
    CREATE TABLE bom_import_profiles (id TEXT PRIMARY KEY);
    CREATE TABLE bom_import_jobs (id TEXT PRIMARY KEY);
    INSERT INTO file_references (
      id, submission_id, source_filename, source_file_role, referenced_filename,
      reference_type, quantity, extraction_method, confidence
    ) VALUES ('legacy-reference', 'missing-submission', 'assembly.SLDASM', 'sldasm', 'child.SLDPRT',
      'assembly_component', 1, 'legacy-fixture', 'high');
    INSERT INTO bom_headers (
      id, parent_item_id, parent_submission_id, parent_revision, status, source, line_count
    ) VALUES ('legacy-header', 'missing-item', 'missing-submission', 'A', 'Draft', 'cad_references', 0);
    INSERT INTO bom_drafts (
      id, draft_name, source, status, is_active, line_count, review_attempt, editor_version
    ) VALUES ('legacy-draft', 'Legacy assembly draft', 'solidworks_xls', 'Draft', 0, 0, 0, 0);
    INSERT INTO bom_drafts (
      id, draft_name, source, status, is_active, line_count, review_attempt, editor_version
    ) VALUES ('manual-draft', 'Retained manual draft', 'manual', 'Draft', 0, 0, 0, 0);
  `);
  fixture.close();

  const migrationScript = path.join(root, "scripts", "migrate-dev-095-legacy-assembly-bom-retirement.mjs");
  const first = JSON.parse(
    execFileSync(process.execPath, [migrationScript, `--database=${fixturePath}`, "--apply"], {
      cwd: root,
      encoding: "utf8"
    })
  );
  assert.equal(first.replayed, false, "first retirement migration must apply");
  assert.equal(first.after.retired, true, "legacy fixture must be fully retired");
  assert.deepEqual(first.foreignKeyViolations, [], "retired fixture must pass foreign_key_check");
  const migratedFixture = new Database(fixturePath, { readonly: true });
  try {
    assert.deepEqual(
      migratedFixture.prepare("SELECT id, source, status FROM bom_drafts ORDER BY id").all(),
      [{ id: "manual-draft", source: "manual", status: "Draft" }],
      "retirement migration must preserve an unrelated manual BOM draft"
    );
  } finally {
    migratedFixture.close();
  }

  const second = JSON.parse(
    execFileSync(process.execPath, [migrationScript, `--database=${fixturePath}`, "--apply"], {
      cwd: root,
      encoding: "utf8"
    })
  );
  assert.equal(second.replayed, true, "retirement migration must be rerunnable");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log("DEV-095 assembly legacy workflow retirement QC passed");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}
