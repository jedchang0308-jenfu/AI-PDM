import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const checks = [];
function check(id, ok, detail) {
  checks.push({ id, ok: Boolean(ok), detail });
  if (!ok) throw new Error(`${id}: ${detail}`);
}
function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const sqlite = new Database(":memory:");
try {
  sqlite.exec(read("db/schema.sql"));
  const submissionColumns = sqlite.prepare("PRAGMA table_info(submission_files)").all();
  check("schema-submission-source-pointer", submissionColumns.some((column) => column.name === "source_file_asset_id"), "submission_files has source_file_asset_id");
  check("schema-submission-local-path-optional", !submissionColumns.find((column) => column.name === "local_path")?.notnull, "submission_files.local_path is optional for pointer-based submissions");
  const indexRows = sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index'").all();
  const indexes = indexRows.map((row) => row.name);
  check("schema-primary-role-guard", indexes.includes("idx_drawing_revision_package_files_primary_role"), "one primary 2D/3D role is guarded per package");
  check("schema-active-owner-hash-guard", indexRows.some((row) => row.name === "idx_shared_cad_model_versions_active_owner_hash_unique" && row.sql?.includes("UNIQUE")), "one active canonical 3D model is guarded per company, owner and content hash");
} finally {
  sqlite.close();
}

const intake = read("src/lib/pdm-file-ownership.ts");
check("strict-2d-extension", intake.includes('new Set(["slddrw"])'), "SLDDRW is the only required 2D original extension");
check("strict-3d-extensions", intake.includes('new Set(["sldprt", "sldasm"])'), "SLDPRT/SLDASM are the only required 3D CAD extensions");
check("scoped-reuse", intake.includes("smv.company_id = :companyId") && intake.includes("smv.owner_id = :ownerId") && intake.includes("smv.content_hash = :contentHash"), "3D reuse is scoped by company, owner root, and content hash");
check("concurrency-safe-reuse", intake.includes("client.transaction") && intake.includes("ON CONFLICT DO NOTHING") && intake.includes("const winner = await findReusableCadAsset"), "3D reuse inserts inside a transaction and re-reads the canonical winner after conflict");
check("loser-pointer-reconciliation", intake.includes("reconcileDrawingCadAssetPointer") && intake.includes("deleteObject(currentPointer.key)"), "a losing upload receipt points to the canonical object and its unreferenced physical object is removed");
check("formal-pointer-write", read("src/lib/drawing-submission-workbench.ts").includes("sourceFileAssetId: attachment.id"), "formal submissions persist the controlled asset pointer");
check("retired-loose-drawing-upload", read("src/app/api/numbering/drawings/[drawingNumber]/attachments/route.ts").includes("DRAWING_REFERENCE_UPLOAD_RETIRED"), "legacy loose drawing upload returns the retired-route contract");
check("controlled-revision-upload", fs.existsSync(path.join(root, "src/app/api/numbering/drawings/[drawingNumber]/revision-files/route.ts")), "controlled revision upload route exists");
check("candidate-reupload-gate", read("src/lib/number-lifecycle-simplification.ts").includes("必須在本次版次重新上傳"), "candidate required source files cannot be verified from an old file");

const sourceMigration = read("db/postgres/029_pdm_file_ownership_and_3d_reuse.sql");
const targetMigration = read("supabase/migrations/20260810020000_pdm_file_ownership_and_3d_reuse.sql");
check("migration-parity", sourceMigration === targetMigration, "Postgres source and Supabase mirror are byte-identical");

console.log(JSON.stringify({ script: "qc-dev-061-file-ownership", passed: checks.length, checks }, null, 2));
