#!/usr/bin/env node

import Database from "better-sqlite3";
import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

function extractSqlConstant(source, name) {
  const templateMatch = source.match(new RegExp(`export const ${name} = ` + "`" + `([\\s\\S]*?)` + "`", "u"));
  return templateMatch?.[1] ?? "";
}

try {
  const packageJson = readProjectJson(root, "package.json");
  const schema = readProjectFile(root, "db/schema.sql");
  const postgresSchema = readProjectFile(root, "db/postgres/001_initial_schema.sql");
  const rlsPlan = readProjectFile(root, "db/postgres/002_supabase_rls_plan.sql");
  const dbRuntime = readProjectFile(root, "src/lib/db.ts");
  const repository = readProjectFile(root, "src/lib/repositories/shared-3d-baseline-async-repository.ts");
  const service = readProjectFile(root, "src/lib/shared-3d-baseline.ts");
  const releaseWorkflow = readProjectFile(root, "src/lib/submission-release-workflow.ts");
  const partsPage = readProjectFile(root, "src/app/parts/page.tsx");
  const asyncAttachments = readProjectFile(root, "src/lib/repositories/master-attachment-async-repository.ts");
  const syncAttachments = readProjectFile(root, "src/lib/repositories/master-attachment-repository.ts");
  const attachmentPanel = readProjectFile(root, "src/components/master-attachment-panel.tsx");
  const sharedModelRoute = readProjectFile(root, "src/app/api/parts/[partNumber]/shared-models/route.ts");
  const modelBasisRoute = readProjectFile(root, "src/app/api/numbering/drawing-revision-packages/[packageId]/model-basis/route.ts");
  const resolveRoute = readProjectFile(root, "src/app/api/manufacturing-baselines/resolve/route.ts");
  const baselineRoute = readProjectFile(root, "src/app/api/manufacturing-baselines/route.ts");
  const baselineReleaseRoute = readProjectFile(root, "src/app/api/manufacturing-baselines/[baselineId]/release/route.ts");

  record("SHARED-3D-001 package script is registered", packageJson.scripts?.["qc:pdm-shared-3d-ma-baseline"] === "node scripts/qc-pdm-shared-3d-ma-baseline.mjs");
  record(
    "SHARED-3D-002 sqlite schema has shared model and baseline tables",
    includesAll(schema, ["shared_cad_model_versions", "drawing_revision_package_model_links", "manufacturing_baselines", "manufacturing_baseline_items"])
  );
  record(
    "SHARED-3D-003 postgres schema has shared model and baseline tables",
    includesAll(postgresSchema, ["shared_cad_model_versions", "drawing_revision_package_model_links", "manufacturing_baselines", "manufacturing_baseline_items"])
  );
  record("SHARED-3D-004 Supabase RLS plan includes new tables", includesAll(rlsPlan, ["shared_cad_model_versions", "drawing_revision_package_model_links", "manufacturing_baselines", "manufacturing_baseline_items"]));
  record("SHARED-3D-005 runtime sqlite initializer ensures new tables", includesAll(dbRuntime, ["ensureShared3dBaselineSchema", "shared_cad_model_versions", "manufacturing_baselines"]));
  record(
    "SHARED-3D-006 part attachments allow shared CAD categories",
    [asyncAttachments, syncAttachments, attachmentPanel].every((source) => includesAll(source, ["cad_3d", "intermediate"])) &&
      attachmentPanel.includes("共用 3D CAD")
  );
  record(
    "SHARED-3D-007 approval action codes are seeded",
    includesAll(schema, ["pdm.shared_model.release", "pdm.drawing_package.model_exception.confirm", "pdm.manufacturing_baseline.release"])
  );
  record("SHARED-3D-008 repository uses async provider only", repository.includes("AsyncDatabaseClient") && !repository.includes("getDb(") && !repository.includes("better-sqlite3"));
  record(
    "SHARED-3D-009 service enforces model hash/revision and release gates",
    includesAll(service, [
      "SHARED_MODEL_SAME_HASH_NEW_LABEL_REVIEW_REQUIRED",
      "SHARED_MODEL_REVISION_HASH_CONFLICT",
      "MA_PACKAGE_MODEL_BASIS_REQUIRED",
      "BASELINE_REQUIRED_MA_MISSING",
      "BASELINE_IMMUTABLE"
    ])
  );
  record("SHARED-3D-010 service keeps baseline separate from dynamic search", includesAll(service, ["resolveRequiredMaForBaselineAsync", "createManufacturingBaselineDraftAsync", "releaseManufacturingBaselineAsync"]));
  record(
    "SHARED-3D-010B MA package release workflow rechecks model basis",
    includesAll(releaseWorkflow, ["assertDrawingPackageModelBasisForReleaseAsync", "ensureDrawingRevisionPackageForSubmissionAsync"]) &&
      releaseWorkflow.includes("await assertDrawingPackageModelBasisForReleaseAsync(revisionPackage.id);")
  );
  record(
    "SHARED-3D-010A part detail UI exposes shared 3D and baseline workflow",
    includesAll(partsPage, [
      "Shared3dBaselinePanel",
      "共用 3D / MA 製造基準",
      "/api/manufacturing-baselines/resolve",
      "/api/manufacturing-baselines",
      "/model-basis",
      "建立 baseline 草稿",
      "發行 baseline"
    ])
  );
  for (const [name, source] of [
    ["shared-model", sharedModelRoute],
    ["model-basis", modelBasisRoute],
    ["baseline-resolve", resolveRoute],
    ["baseline-create", baselineRoute],
    ["baseline-release", baselineReleaseRoute]
  ]) {
    record(`SHARED-3D-011 ${name} route uses async role guard`, source.includes("requireRoleAsync") && source.includes("Shared3dBaselineError"));
  }

  const insertModelSql = extractSqlConstant(repository, "INSERT_SHARED_MODEL_VERSION_SQL");
  const upsertBasisSql = extractSqlConstant(repository, "UPSERT_PACKAGE_MODEL_BASIS_SQL");
  const insertBaselineSql = extractSqlConstant(repository, "INSERT_MANUFACTURING_BASELINE_SQL");
  const insertBaselineItemSql = extractSqlConstant(repository, "INSERT_MANUFACTURING_BASELINE_ITEM_SQL");
  const releaseBaselineSql = extractSqlConstant(repository, "RELEASE_MANUFACTURING_BASELINE_SQL");
  record("SHARED-3D-012 repository SQL constants are extractable", [insertModelSql, upsertBasisSql, insertBaselineSql, insertBaselineItemSql, releaseBaselineSql].every(Boolean));

  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE shared_cad_model_versions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      owner_scope TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      part_root_id TEXT NOT NULL,
      part_number_id TEXT,
      source_file_asset_id TEXT NOT NULL,
      model_revision TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      hash_algorithm TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      released_by TEXT,
      released_at TEXT,
      release_reason TEXT,
      UNIQUE (company_id, owner_scope, owner_id, model_revision, content_hash)
    );
    CREATE TABLE drawing_revision_package_model_links (
      id TEXT PRIMARY KEY,
      package_id TEXT NOT NULL UNIQUE,
      basis_type TEXT NOT NULL,
      shared_model_version_id TEXT,
      exception_reason TEXT,
      exception_confirmed_by TEXT,
      exception_confirmed_at TEXT,
      review_status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE manufacturing_baselines (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      owner_scope TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      part_root_id TEXT NOT NULL,
      part_number_id TEXT,
      baseline_code TEXT NOT NULL,
      baseline_revision TEXT NOT NULL,
      shared_model_version_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      released_by TEXT,
      released_at TEXT,
      snapshot_json TEXT NOT NULL
    );
    CREATE TABLE manufacturing_baseline_items (
      id TEXT PRIMARY KEY,
      baseline_id TEXT NOT NULL,
      drawing_number_id TEXT NOT NULL,
      drawing_number TEXT NOT NULL,
      package_id TEXT,
      package_revision TEXT,
      inclusion_status TEXT NOT NULL,
      selection_reason TEXT,
      review_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  db.prepare(insertModelSql).run({
    id: "SCM-1",
    companyId: "company-jenfu",
    ownerScope: "part_number",
    ownerId: "part-1",
    partRootId: "root-1",
    partNumberId: "part-1",
    sourceFileAssetId: "file-1",
    modelRevision: "C",
    contentHash: "hash-a",
    hashAlgorithm: "SHA-256",
    status: "Released",
    createdBy: "user-admin-demo",
    createdAt: "2026-07-06T00:00:00.000Z",
    releasedBy: "user-admin-demo",
    releasedAt: "2026-07-06T00:00:00.000Z",
    releaseReason: "QC seed"
  });
  db.prepare(upsertBasisSql).run({
    id: "DPM-1",
    packageId: "PKG-1",
    basisType: "shared_model",
    sharedModelVersionId: "SCM-1",
    exceptionReason: null,
    exceptionConfirmedBy: null,
    exceptionConfirmedAt: null,
    reviewStatus: "confirmed",
    createdBy: "user-admin-demo",
    createdAt: "2026-07-06T00:01:00.000Z",
    updatedAt: "2026-07-06T00:01:00.000Z"
  });
  db.prepare(insertBaselineSql).run({
    id: "MBL-1",
    companyId: "company-jenfu",
    ownerScope: "part_number",
    ownerId: "part-1",
    partRootId: "root-1",
    partNumberId: "part-1",
    baselineCode: "P-0001-MB-1",
    baselineRevision: "1",
    sharedModelVersionId: "SCM-1",
    status: "Draft",
    createdBy: "user-admin-demo",
    createdAt: "2026-07-06T00:02:00.000Z",
    snapshotJson: "{}"
  });
  db.prepare(insertBaselineItemSql).run({
    id: "MBLI-1",
    baselineId: "MBL-1",
    drawingNumberId: "drawing-ma1",
    drawingNumber: "D-0001-MA1",
    packageId: "PKG-1",
    packageRevision: "1",
    inclusionStatus: "included",
    selectionReason: null,
    reviewStatus: "approved",
    createdAt: "2026-07-06T00:03:00.000Z"
  });
  const firstRelease = db.prepare(releaseBaselineSql).run({
    baselineId: "MBL-1",
    releasedBy: "user-admin-demo",
    releasedAt: "2026-07-06T00:04:00.000Z",
    snapshotJson: JSON.stringify({ immutable: true })
  });
  const secondRelease = db.prepare(releaseBaselineSql).run({
    baselineId: "MBL-1",
    releasedBy: "user-admin-demo",
    releasedAt: "2026-07-06T00:05:00.000Z",
    snapshotJson: JSON.stringify({ shouldNotReplace: true })
  });
  const baseline = db.prepare("SELECT status, snapshot_json FROM manufacturing_baselines WHERE id = 'MBL-1'").get();
  record("SHARED-3D-013 SQLite semantics release draft baseline once", firstRelease.changes === 1 && secondRelease.changes === 0, JSON.stringify({ first: firstRelease.changes, second: secondRelease.changes }));
  record("SHARED-3D-014 SQLite semantics released baseline snapshot remains immutable", baseline?.status === "Released" && baseline?.snapshot_json.includes("immutable"), JSON.stringify(baseline));
  db.close();

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
}
