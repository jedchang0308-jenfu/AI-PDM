#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import {
  applyDrawingRevisionLifecycleAdoption,
  planDrawingRevisionLifecycleAdoption,
  redactDrawingRevisionLifecycleAdoptionPlan
} from "../src/lib/drawing-revision-lifecycle-adoption.ts";

const root = process.cwd();
const schema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");
const migrationSource = fs.readFileSync(path.join(root, "scripts", "migrate-dev-053-phase1h-active-workflows.mjs"), "utf8");
const adoptionSource = fs.readFileSync(path.join(root, "src", "lib", "drawing-revision-lifecycle-adoption.ts"), "utf8");
const results = [];
const record = (id, passed, detail = "") => results.push({ id, passed: Boolean(passed), detail });

function seedCandidate(database, suffix, options = {}) {
  const engineer = "phase1h-engineer";
  const rootId = `phase1h-root-${suffix}`;
  const itemId = `phase1h-item-${suffix}`;
  const partId = `phase1h-part-${suffix}`;
  const drawingId = `phase1h-drawing-${suffix}`;
  const drawingNumber = `PHASE1H-${suffix}-M01`;
  const partNumber = `PHASE1H-${suffix}-P01`;
  const submissionId = `phase1h-submission-${suffix}`;
  const submissionFileId = `phase1h-submission-file-${suffix}`;
  const assetId = `phase1h-asset-${suffix}`;
  const packageId = `phase1h-package-${suffix}`;
  const assessmentId = `phase1h-fff-${suffix}`;
  database.prepare(`
    INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, record_status)
    VALUES (:id, 'company-jenfu', :rootCode, :name, 'manufactured', 'Active')
  `).run({ id: rootId, rootCode: `PHASE1H-${suffix}`, name: `Phase 1H ${suffix}` });
  database.prepare(`
    INSERT INTO part_numbers (
      id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name,
      item_kind, is_universal, record_status
    ) VALUES (:id, 'company-jenfu', :rootId, :partNumber, 1, '01', :name, 'manufactured', 0, 'Active')
  `).run({ id: partId, rootId, partNumber, name: `Part ${suffix}` });
  database.prepare(`
    INSERT INTO drawing_numbers (
      id, company_id, part_root_id, drawing_number, purpose_code, purpose_description,
      sequence_no, is_primary_manufacturing, record_status
    ) VALUES (:id, 'company-jenfu', :rootId, :drawingNumber, 'M', '', 1, 1, 'Active')
  `).run({ id: drawingId, rootId, drawingNumber });
  database.prepare(`
    INSERT INTO items (id, company_id, part_number, part_name)
    VALUES (:id, 'company-jenfu', :partNumber, :partName)
  `).run({ id: itemId, partNumber, partName: `Part ${suffix}` });
  database.prepare(`
    INSERT INTO submissions (
      id, company_id, item_id, drawing_number, revision, material, surface_finish,
      document_type, change_description, status, submitted_by, approval_required
    ) VALUES (
      :id, 'company-jenfu', :itemId, :drawingNumber, '0.1', 'SUS304', 'none',
      'Drawing', 'Phase 1H adoption fixture', 'Pending', :submittedBy, 1
    )
  `).run({ id: submissionId, itemId, drawingNumber, submittedBy: engineer });
  database.prepare(`
    INSERT INTO submission_files (
      id, submission_id, file_role, original_filename, local_path, sha256, file_size
    ) VALUES (:id, :submissionId, 'slddrw', :fileName, :localPath, :sha, 128)
  `).run({ id: submissionFileId, submissionId, fileName: `${drawingNumber}.SLDDRW`, localPath: `fixtures/${drawingNumber}.SLDDRW`, sha: `sha-${suffix}` });
  database.prepare(`
    INSERT INTO file_assets (
      id, storage_provider, file_name, file_ext, content_hash, linked_entity_type, linked_entity_id,
      document_category, display_name, revision, uploaded_by
    ) VALUES (
      :id, 'local_repository', :fileName, '.slddrw', :sha, 'submission_file', :submissionFileId,
      'drawing_2d', :fileName, '0.1', :uploadedBy
    )
  `).run({ id: assetId, fileName: `${drawingNumber}.SLDDRW`, sha: `sha-${suffix}`, submissionFileId, uploadedBy: engineer });
  database.prepare(`
    INSERT INTO drawing_revision_packages (
      id, company_id, drawing_number_id, drawing_number, revision, status, source_submission_id, created_by, snapshot_json
    ) VALUES (:id, 'company-jenfu', :drawingId, :drawingNumber, '0.1', 'Pending', :submissionId, :createdBy, '{}')
  `).run({ id: packageId, drawingId, drawingNumber, submissionId, createdBy: engineer });
  database.prepare(`
    INSERT INTO drawing_revision_package_files (
      id, package_id, source_file_asset_id, source_submission_file_id, role, role_source,
      display_name, description, sort_order, is_primary, created_by
    ) VALUES (
      :id, :packageId, :assetId, :submissionFileId, 'drawing_2d', 'user', :displayName, '', 0, 1, :createdBy
    )
  `).run({ id: `phase1h-package-file-${suffix}`, packageId, assetId, submissionFileId, displayName: `${drawingNumber}.SLDDRW`, createdBy: engineer });
  database.prepare(`
    INSERT INTO submission_snapshots (
      id, submission_id, company_id, source_root_id, source_root_code, source_drawing_number_id,
      source_drawing_number, source_part_number_id, source_part_number, rules_version,
      snapshot_hash, snapshot_json, captured_by, captured_at
    ) VALUES (
      :id, :submissionId, 'company-jenfu', :rootId, :rootCode, :drawingId,
      :drawingNumber, :partId, :partNumber, 'phase1h-qc', :snapshotHash, '{}', :capturedBy, datetime('now')
    )
  `).run({
    id: `phase1h-snapshot-${suffix}`, submissionId, rootId, rootCode: `PHASE1H-${suffix}`,
    drawingId, drawingNumber, partId, partNumber, snapshotHash: `snapshot-${suffix}`, capturedBy: engineer
  });
  database.prepare(`
    INSERT INTO submission_part_scopes (
      id, submission_id, company_id, item_id, part_number_id, part_number, part_name,
      link_type, form_state, fit_state, function_state, fff_outcome
    ) VALUES (
      :id, :submissionId, 'company-jenfu', :itemId, :partId, :partNumber, :partName,
      'primary_manufacturing', 'no_impact', 'no_impact', 'no_impact', 'no_impact'
    )
  `).run({ id: `phase1h-scope-${suffix}`, submissionId, itemId, partId, partNumber, partName: `Part ${suffix}` });
  database.prepare(`
    INSERT INTO drawing_revision_fff_assessments (
      id, company_id, drawing_number_id, revision, submission_id,
      form_state, fit_state, function_state, reason_category, assessed_by
    ) VALUES (
      :id, 'company-jenfu', :drawingId, '0.1', :submissionId,
      'no_impact', 'no_impact', 'no_impact', 'none', :assessedBy
    )
  `).run({ id: assessmentId, drawingId, submissionId, assessedBy: engineer });
  if (options.blockedDependency) {
    database.prepare(`
      INSERT INTO discussion_comments (id, submission_id, file_id, author_id, body)
      VALUES (:id, :submissionId, :fileId, :authorId, 'Out-of-scope dependency')
    `).run({ id: `phase1h-discussion-${suffix}`, submissionId, fileId: submissionFileId, authorId: engineer });
  }
  return { packageId, submissionId, assessmentId, partId };
}

record("DEV053-1H-ADOPT-001 migration command is dry-run by default and local apply is double-gated",
  migrationSource.includes('process.argv.includes("--apply")') &&
  migrationSource.includes('process.argv.includes("--confirm-local-phase1h-adoption")') &&
  migrationSource.includes("PHASE1H_ADOPTION_DEFAULT_DATABASE_APPLY_FORBIDDEN") &&
  migrationSource.includes("readonly: !apply"));
record("DEV053-1H-ADOPT-002 adopter re-runs guards inside one transaction and locks PostgreSQL candidates",
  adoptionSource.includes("client.transaction") && adoptionSource.includes("FOR UPDATE OF package, submission") &&
  adoptionSource.includes("planDrawingRevisionLifecycleAdoption(transactionClient)") &&
  adoptionSource.includes("DRAWING_LIFECYCLE_ADOPTION_STATE_CHANGED"));
record("DEV053-1H-ADOPT-003 adopter never copies or replays a legacy decision",
  !adoptionSource.includes("INSERT INTO approval_platform_decisions") &&
  !adoptionSource.includes("INSERT INTO approval_steps") &&
  adoptionSource.includes("legacy_decision_present"));
record("DEV053-1H-ADOPT-004 reports redact fixture identities and omit business payload",
  adoptionSource.includes("redactDrawingRevisionLifecycleAdoptionPlan") &&
  adoptionSource.includes("fixtureKey") && !migrationSource.includes("candidate.packageId"));

const database = new Database(":memory:");
database.pragma("foreign_keys = ON");
database.exec(schema);
database.exec(`
  INSERT INTO users (id, display_name, email, role, company_id, account_status, system_role_enabled)
  VALUES
    ('phase1h-engineer', 'Phase 1H Engineer', 'phase1h.engineer@example.invalid', 'Engineer', 'company-jenfu', 'active', 1),
    ('phase1h-manager', 'Phase 1H Manager', 'phase1h.manager@example.invalid', 'R&D Manager', 'company-jenfu', 'active', 1);
`);
const client = createAsyncDatabaseClient({ kind: "sqlite", database });

try {
  const adoptable = seedCandidate(database, "A");
  const before = await planDrawingRevisionLifecycleAdoption(client);
  record("DEV053-1H-ADOPT-005 one complete active workflow is adoptable",
    before.candidateCount === 1 && before.adoptableCount === 1 && before.blockedCount === 0,
    JSON.stringify(redactDrawingRevisionLifecycleAdoptionPlan(before)));

  const applied = await applyDrawingRevisionLifecycleAdoption(client);
  const workflow = database.prepare(`
    SELECT * FROM drawing_revision_lifecycle_workflows WHERE package_id = ?
  `).get(adoptable.packageId);
  const revisionPackage = database.prepare(`
    SELECT lifecycle_state, status FROM drawing_revision_packages WHERE id = ?
  `).get(adoptable.packageId);
  const durableScopes = database.prepare(`
    SELECT COUNT(*) AS count FROM drawing_revision_package_part_scopes WHERE package_id = ?
  `).get(adoptable.packageId).count;
  const nativeRequest = database.prepare(`
    SELECT action_code, request_status FROM approval_platform_requests WHERE id = ?
  `).get(workflow?.approval_request_id);
  const reviewerCount = database.prepare(`
    SELECT COUNT(*) AS count FROM drawing_revision_lifecycle_reviewers WHERE workflow_id = ?
  `).get(workflow?.id).count;
  const copiedDecisionCount = database.prepare(`
    SELECT COUNT(*) AS count FROM approval_platform_decisions WHERE request_id = ?
  `).get(workflow?.approval_request_id).count;
  const impactSnapshotRow = database.prepare(`
    SELECT snapshot_json FROM approval_platform_impact_snapshots WHERE request_id = ?
  `).get(workflow?.approval_request_id);
  const impactSnapshot = JSON.parse(impactSnapshotRow?.snapshot_json ?? "{}");
  record("DEV053-1H-ADOPT-006 apply creates native transient authority and durable scope without replay",
    applied.adoptedCount === 1 && workflow?.origin === "adopted_active" && workflow?.state === "active" &&
    revisionPackage?.lifecycle_state === "in_review" && revisionPackage?.status === "Pending" &&
    durableScopes === 1 && nativeRequest?.action_code === "numbering.drawing_revision_lifecycle_review" &&
    nativeRequest?.request_status === "pending" && reviewerCount === 1 && copiedDecisionCount === 0,
    JSON.stringify({ adoptedCount: applied.adoptedCount, revisionPackage, durableScopes, nativeRequest, reviewerCount, copiedDecisionCount }));
  record("DEV053-1H-ADOPT-010 adopted review snapshot carries durable parts and files for the UI",
    impactSnapshot.drawing?.number === "PHASE1H-A-M01" && impactSnapshot.drawing?.revision === "0.1" &&
    Array.isArray(impactSnapshot.parts) && impactSnapshot.parts.length === 1 &&
    Array.isArray(impactSnapshot.files) && impactSnapshot.files.length === 1,
    JSON.stringify({ drawing: impactSnapshot.drawing, parts: impactSnapshot.parts?.length ?? 0, files: impactSnapshot.files?.length ?? 0 }));

  const legacyStillPresent = database.prepare("SELECT COUNT(*) AS count FROM submissions WHERE id = ?").get(adoptable.submissionId).count === 1;
  const legacyLinkCount = database.prepare(`
    SELECT COUNT(*) AS count FROM approval_platform_legacy_links WHERE legacy_id = ? AND migration_status = 'migrated'
  `).get(adoptable.submissionId).count;
  record("DEV053-1H-ADOPT-007 adoption suppresses by bridge but does not delete active legacy graph",
    legacyStillPresent && legacyLinkCount === 1, JSON.stringify({ legacyStillPresent, legacyLinkCount }));

  const replay = await applyDrawingRevisionLifecycleAdoption(client);
  record("DEV053-1H-ADOPT-008 exact replay is idempotent", replay.adoptedCount === 0, JSON.stringify(replay));

  const blocked = seedCandidate(database, "B", { blockedDependency: true });
  const blockedPlan = await planDrawingRevisionLifecycleAdoption(client);
  const codes = blockedPlan.candidates.flatMap((candidate) => candidate.blockers.map((blocker) => blocker.code));
  let applyBlocked = false;
  try {
    await applyDrawingRevisionLifecycleAdoption(client);
  } catch (error) {
    applyBlocked = String(error).includes("DRAWING_LIFECYCLE_ADOPTION_BLOCKED");
  }
  const blockedPackage = database.prepare("SELECT lifecycle_state FROM drawing_revision_packages WHERE id = ?").get(blocked.packageId);
  const workflowCount = database.prepare("SELECT COUNT(*) AS count FROM drawing_revision_lifecycle_workflows").get().count;
  record("DEV053-1H-ADOPT-009 one blocker prevents the complete activation set",
    blockedPlan.candidateCount === 1 && blockedPlan.blockedCount === 1 && codes.includes("discussion_dependency") &&
    applyBlocked && blockedPackage?.lifecycle_state === null && workflowCount === 1,
    JSON.stringify({ codes, applyBlocked, blockedPackage, workflowCount }));
} catch (error) {
  record("DEV053-1H-ADOPT-RUNTIME", false, error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
} finally {
  await client.close();
  database.close();
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
