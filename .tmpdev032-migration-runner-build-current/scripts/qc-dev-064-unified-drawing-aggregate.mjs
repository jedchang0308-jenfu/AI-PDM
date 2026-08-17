#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev064-unified-drawing-"));
const results = [];

function record(id, passed, detail = "") {
  results.push({ id, passed: Boolean(passed), detail });
}

function captureFailure(run) {
  try {
    run();
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

Object.assign(process.env, {
  NODE_ENV: "test",
  PDM_DATA_DIR: fixtureRoot,
  PDM_REPOSITORY_DIR: path.join(fixtureRoot, "repository"),
  PDM_DB_PROVIDER: "sqlite",
  PDM_NUMBER_STATE_FLOW_V1: "true",
  PDM_NUMBER_LIFECYCLE_V2: "true",
  PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true"
});

let database;
try {
  const [{ getDb }, providerModule, unifiedDrawingModule] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db-async-provider"),
    import("@/lib/repositories/unified-drawing-async-repository")
  ]);
  database = getDb();
  const client = providerModule.createAsyncDatabaseClient({ kind: "sqlite", database });
  const repository = new unifiedDrawingModule.UnifiedDrawingAsyncRepository(client);
  const now = "2026-08-11T08:00:00.000Z";

  database.prepare(`INSERT INTO users (
      id, display_name, email, role, company_id, account_status, system_role_enabled, created_at, updated_at
    ) VALUES ('dev064-user', 'DEV-064 User', 'dev064@example.invalid', 'R&D Manager',
      'company-jenfu', 'active', 1, ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at)
                    VALUES ('dev064-user', 'company-jenfu', 1, ?)` ).run(now);
  database.prepare(`INSERT INTO numbering_draft_workspaces (
      id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, created_at, updated_at
    ) VALUES ('dev064-workspace', 'company-jenfu', 'new_bundle', 'active',
      'dev064-user', 'dev064-user', 1, ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_draft_roots (
      id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
    ) VALUES ('dev064-draft-root', 'company-jenfu', 'dev064-workspace', '統一圖號測試', 'manufactured',
      'numbering-rule-v3-alpha-root', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_draft_drawings (
      id, company_id, workspace_id, root_draft_id, purpose_code, purpose_description,
      is_primary_manufacturing, created_at, updated_at
    ) VALUES ('dev064-draft-drawing', 'company-jenfu', 'dev064-workspace', 'dev064-draft-root',
      'M', '統一資料層', 1, ?, ?)` ).run(now, now);
  await repository.synchronizeWorkspace({ workspaceId: "dev064-workspace", companyId: "company-jenfu" });
  const unnumberedDrawing = database.prepare(`SELECT * FROM drawings WHERE drawing_draft_id = 'dev064-draft-drawing'`).get();
  database.prepare(`INSERT INTO number_candidate_reservations (
      id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code,
      sequence_scope_key, sequence_no, reservation_state, row_version, created_by, created_at, updated_at
    ) VALUES ('dev064-reservation', 'company-jenfu', 'dev064-workspace', 'drawing',
      'dev064-draft-drawing', 'A0064-M01', 'dev064:drawing', 1, 'active', 1, 'dev064-user', ?, ?)` ).run(now, now);
  database.prepare(`UPDATE numbering_draft_drawings
                    SET candidate_reservation_id = 'dev064-reservation'
                    WHERE id = 'dev064-draft-drawing'`).run();
  database.prepare(`INSERT INTO numbering_candidate_revision_drafts (
      id, company_id, workspace_id, drawing_draft_id, candidate_reservation_id, revision,
      policy_snapshot_json, lifecycle_status, row_version, created_by, created_at,
      updated_by, updated_at
    ) VALUES ('dev064-candidate-revision', 'company-jenfu', 'dev064-workspace',
      'dev064-draft-drawing', 'dev064-reservation', '0.1', '{"source":"candidate"}',
      'draft', 1, 'dev064-user', ?, 'dev064-user', ?)` ).run(now, now);
  database.prepare(`INSERT INTO file_assets (
      id, storage_provider, storage_key, file_name, file_ext, mime_type, file_size,
      content_hash, linked_entity_type, linked_entity_id, document_category,
      display_name, sync_status, created_at, updated_at
    ) VALUES ('dev064-asset', 'local_repository', 'dev064/first.slddrw', 'first.slddrw',
      'slddrw', 'application/octet-stream', 64, 'dev064-hash',
      'numbering_candidate_revision', 'dev064-candidate-revision', 'drawing',
      'first.slddrw', 'local_only', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_candidate_revision_files (
      id, company_id, candidate_revision_id, source_file_asset_id, role, role_source,
      display_name, sort_order, is_primary, created_by, created_at, updated_at
    ) VALUES ('dev064-candidate-file', 'company-jenfu', 'dev064-candidate-revision',
      'dev064-asset', 'drawing_2d', 'user', 'first.slddrw', 0, 1,
      'dev064-user', ?, ?)` ).run(now, now);

  await repository.synchronizeWorkspace({ workspaceId: "dev064-workspace", companyId: "company-jenfu" });
  const initialDrawing = database.prepare(`SELECT * FROM drawings WHERE drawing_draft_id = 'dev064-draft-drawing'`).get();
  const initialRevision = database.prepare(`SELECT * FROM drawing_revisions WHERE source_candidate_revision_id = 'dev064-candidate-revision'`).get();
  const initialFile = database.prepare(`SELECT * FROM drawing_revision_files WHERE source_candidate_file_id = 'dev064-candidate-file'`).get();
  record(
    "DEV064-CORE-001 candidate state materializes one Drawing, one DrawingRevision and one file relation",
    unnumberedDrawing?.id === "drawing-dev064-draft-drawing" &&
      initialDrawing?.id === unnumberedDrawing?.id &&
      initialDrawing?.lifecycle_state === "drawing_preparation" &&
      initialDrawing?.drawing_number === "A0064-M01" &&
      initialRevision?.drawing_id === initialDrawing?.id &&
      initialRevision?.lifecycle_state === "preparing" &&
      initialFile?.drawing_revision_id === initialRevision?.id,
    JSON.stringify({ beforeNumber: unnumberedDrawing?.id, afterNumber: initialDrawing?.id, state: initialDrawing?.lifecycle_state, revision: initialRevision?.id })
  );

  database.prepare(`INSERT INTO part_roots (
      id, company_id, root_code, core_name, item_kind, record_status, rule_version_id,
      created_by, created_at, updated_at
    ) VALUES ('dev064-formal-root', 'company-jenfu', 'A0064', '統一圖號測試', 'manufactured',
      'Active', 'numbering-rule-v3-alpha-root', 'dev064-user', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO approval_platform_requests (
      id, company_id, action_code, domain_code, request_status, title, reason,
      requested_by, requested_at, resolved_by, resolved_at, apply_status,
      apply_attempts, applied_by, applied_at, payload_json, created_at, updated_at
    ) VALUES ('dev064-approval', 'company-jenfu', 'numbering.candidate_publication_review',
      'numbering', 'applied', 'DEV-064 approval', 'QC', 'dev064-user', ?,
      'dev064-user', ?, 'applied', 1, 'dev064-user', ?, '{}', ?, ?)` ).run(now, now, now, now, now);
  database.prepare(`INSERT INTO drawing_numbers (
      id, company_id, part_root_id, drawing_number, purpose_code, purpose_description,
      sequence_no, is_primary_manufacturing, record_status, rule_version_id,
      created_by, created_at, updated_at
    ) VALUES ('dev064-formal-drawing', 'company-jenfu', 'dev064-formal-root', 'A0064-M01',
      'M', '統一資料層', 1, 1, 'Active', 'numbering-rule-v3-alpha-root',
      'dev064-user', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO drawing_revision_packages (
      id, company_id, drawing_number_id, drawing_number, revision, status,
      lifecycle_state, created_by, created_at, updated_at
    ) VALUES ('dev064-package', 'company-jenfu', 'dev064-formal-drawing', 'A0064-M01',
      '0.1', 'Pending', 'rd_controlled', 'dev064-user', ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO drawing_revision_package_files (
      id, package_id, source_file_asset_id, role, role_source, display_name,
      sort_order, is_primary, created_by, created_at
    ) VALUES ('dev064-package-file', 'dev064-package', 'dev064-asset', 'drawing_2d',
      'system', 'first.slddrw', 0, 1, 'dev064-user', ?)` ).run(now);
  database.prepare(`UPDATE number_candidate_reservations
                    SET reservation_state = 'promoted', approval_request_id = 'dev064-approval',
                        promoted_master_type = 'drawing_number', promoted_master_id = 'dev064-formal-drawing',
                        promoted_at = ?, row_version = 2, updated_at = ?
                    WHERE id = 'dev064-reservation'`).run(now, now);
  database.prepare(`UPDATE numbering_candidate_revision_drafts
                    SET lifecycle_status = 'promoted', approval_request_id = 'dev064-approval',
                        review_snapshot_hash = 'dev064-review-hash',
                        formal_drawing_number_id = 'dev064-formal-drawing',
                        formal_revision_package_id = 'dev064-package', promoted_at = ?,
                        row_version = 2, updated_by = 'dev064-user', updated_at = ?
                    WHERE id = 'dev064-candidate-revision'`).run(now, now);
  database.prepare(`UPDATE numbering_draft_workspaces
                    SET lifecycle_status = 'published', published_at = ?, published_by = 'dev064-user',
                        row_version = 2, updated_at = ?
                    WHERE id = 'dev064-workspace'`).run(now, now);

  await repository.synchronizeWorkspace({ workspaceId: "dev064-workspace", companyId: "company-jenfu" });
  const promotedDrawing = database.prepare(`SELECT * FROM drawings WHERE workspace_id = 'dev064-workspace'`).get();
  const promotedRevision = database.prepare(`SELECT * FROM drawing_revisions WHERE drawing_id = ?`).get(promotedDrawing.id);
  const promotedFile = database.prepare(`SELECT * FROM drawing_revision_files WHERE drawing_revision_id = ?`).get(promotedRevision.id);
  const drawingCount = database.prepare(`SELECT COUNT(*) AS count FROM drawings WHERE workspace_id = 'dev064-workspace'`).get().count;
  const revisionCount = database.prepare(`SELECT COUNT(*) AS count FROM drawing_revisions WHERE drawing_id = ?`).get(promotedDrawing.id).count;
  const fileCount = database.prepare(`SELECT COUNT(*) AS count FROM drawing_revision_files WHERE drawing_revision_id = ?`).get(promotedRevision.id).count;
  record(
    "DEV064-CORE-002 promotion changes lifecycle pointers without copying the Drawing identity",
    promotedDrawing.id === initialDrawing.id && drawingCount === 1 && revisionCount === 1 && fileCount === 1 &&
      promotedDrawing.formal_drawing_number_id === "dev064-formal-drawing" &&
      promotedDrawing.lifecycle_state === "rd_controlled" &&
      promotedRevision.id === initialRevision.id && promotedRevision.lifecycle_state === "rd_controlled" &&
      promotedFile.source_candidate_file_id === "dev064-candidate-file" &&
      promotedFile.source_package_file_id === "dev064-package-file",
    JSON.stringify({ drawingId: promotedDrawing.id, drawingCount, revisionCount, fileCount, state: promotedDrawing.lifecycle_state })
  );

  const byCanonicalId = await repository.findByIdOrFormalId({ drawingId: promotedDrawing.id, companyId: "company-jenfu" });
  const byLegacyFormalId = await repository.findByIdOrFormalId({ drawingId: "dev064-formal-drawing", companyId: "company-jenfu" });
  const byLegacyWorkspace = await repository.findFirstByWorkspace({ workspaceId: "dev064-workspace", companyId: "company-jenfu" });
  record(
    "DEV064-CORE-003 canonical and legacy detail keys resolve to the same Drawing",
    byCanonicalId?.id === promotedDrawing.id && byLegacyFormalId?.id === promotedDrawing.id && byLegacyWorkspace?.id === promotedDrawing.id,
    JSON.stringify({ canonical: byCanonicalId?.id, formal: byLegacyFormalId?.id, workspace: byLegacyWorkspace?.id })
  );

  database.prepare(`INSERT INTO numbering_draft_workspaces (
      id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, created_at, updated_at
    ) VALUES ('dev064-multi-workspace', 'company-jenfu', 'new_bundle', 'active',
      'dev064-user', 'dev064-user', 1, ?, ?)` ).run(now, now);
  database.prepare(`INSERT INTO numbering_draft_roots (
      id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
    ) VALUES ('dev064-multi-root', 'company-jenfu', 'dev064-multi-workspace', '多圖測試',
      'manufactured', 'numbering-rule-v3-alpha-root', ?, ?)` ).run(now, now);
  for (const [id, purposeCode, description] of [
    ["dev064-multi-drawing-m", "M", "製造圖"],
    ["dev064-multi-drawing-r", "R", "參考圖"]
  ]) {
    database.prepare(`INSERT INTO numbering_draft_drawings (
        id, company_id, workspace_id, root_draft_id, purpose_code, purpose_description,
        is_primary_manufacturing, created_at, updated_at
      ) VALUES (?, 'company-jenfu', 'dev064-multi-workspace', 'dev064-multi-root', ?, ?, 0, ?, ?)`)
      .run(id, purposeCode, description, now, now);
  }
  await repository.synchronizeWorkspace({ workspaceId: "dev064-multi-workspace", companyId: "company-jenfu" });
  const multiDrawingRows = database.prepare(`SELECT id, drawing_draft_id FROM drawings
    WHERE workspace_id = 'dev064-multi-workspace' ORDER BY drawing_draft_id`).all();
  record(
    "DEV064-CORE-004 one workspace with multiple drawings creates one stable Drawing identity per drawing",
    multiDrawingRows.length === 2 &&
      multiDrawingRows.every((row) => row.id === `drawing-${row.drawing_draft_id}`),
    JSON.stringify(multiDrawingRows)
  );

  const contentGuard = captureFailure(() => database.prepare(`UPDATE drawing_revisions
    SET policy_snapshot_json = '{"tampered":true}' WHERE id = ?`).run(promotedRevision.id));
  const transitionGuard = captureFailure(() => database.prepare(`UPDATE drawing_revisions
    SET lifecycle_state = 'preparing' WHERE id = ?`).run(promotedRevision.id));
  const fileGuard = captureFailure(() => database.prepare(`DELETE FROM drawing_revision_files WHERE id = ?`).run(promotedFile.id));
  const numberGuard = captureFailure(() => database.prepare(`UPDATE drawings
    SET drawing_number = 'A0064-M99' WHERE id = ?`).run(promotedDrawing.id));
  record(
    "DEV064-POLICY-001 canonical identity and controlled revisions reject forbidden mutations in the data layer",
    contentGuard.includes("DRAWING_REVISION_CONTROLLED_IMMUTABLE") &&
      transitionGuard.includes("DRAWING_REVISION_STATE_TRANSITION_DENIED") &&
      fileGuard.includes("DRAWING_REVISION_FILES_CONTROLLED_IMMUTABLE") &&
      numberGuard.includes("DRAWING_NUMBER_IMMUTABLE"),
    JSON.stringify({ contentGuard, transitionGuard, fileGuard, numberGuard })
  );

  const repositorySource = fs.readFileSync(path.join(root, "src/lib/repositories/drawing-workbench-async-repository.ts"), "utf8");
  const componentSource = fs.readFileSync(path.join(root, "src/components/drawing-workbench.tsx"), "utf8");
  const postgresMigration = fs.readFileSync(path.join(root, "db/postgres/030_unified_drawing_aggregate.sql"), "utf8");
  const dbSource = fs.readFileSync(path.join(root, "src/lib/db.ts"), "utf8");
  record(
    "DEV064-CONTRACT-001 workbench identity authority and shared detail frame use the canonical aggregate",
    repositorySource.includes("FROM drawings canonical") &&
      !repositorySource.includes("UNION ALL") &&
      repositorySource.includes("readUnifiedDetail") &&
      componentSource.includes("<WorkspaceDrawer") &&
      componentSource.includes("detail?.candidate") &&
      componentSource.includes("detail?.drawing"),
    "canonical SQL source plus shared candidate/formal detail routing"
  );
  record(
    "DEV064-MIGRATION-001 SQLite bootstrap and PostgreSQL migration carry the same aggregate and guards",
    dbSource.includes("dev-064-unified-drawing-aggregate-v1") &&
      postgresMigration.includes("CREATE TABLE IF NOT EXISTS drawings") &&
      postgresMigration.includes("CREATE TABLE IF NOT EXISTS drawing_revisions") &&
      postgresMigration.includes("CREATE TABLE IF NOT EXISTS drawing_revision_files") &&
      postgresMigration.includes("DRAWING_NUMBER_IMMUTABLE") &&
      postgresMigration.includes("DRAWING_REVISION_STATE_TRANSITION_DENIED") &&
      postgresMigration.includes("DRAWING_REVISION_FILES_CONTROLLED_IMMUTABLE"),
    "local backfill marker and PostgreSQL DDL present"
  );
} catch (error) {
  record("DEV064-fixture", false, error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
} finally {
  try { database?.close(); } catch {}
  const resolvedFixture = path.resolve(fixtureRoot);
  const resolvedTemp = path.resolve(os.tmpdir());
  if (resolvedFixture.startsWith(`${resolvedTemp}${path.sep}`)) {
    fs.rmSync(resolvedFixture, { recursive: true, force: true });
  }
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
