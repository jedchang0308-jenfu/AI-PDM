import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { assert, createFixtureDatabase, ids, pass } from "./qc-dev-087-fixtures.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev087-revision-01-"));
const dbPath = path.join(tempRoot, "fixture.sqlite");
const outputRoot = path.join(tempRoot, "migration");
const db = createFixtureDatabase({ filename: dbPath, canonical: false });

function insertWorkspaceGraph() {
  const rule = db.prepare("SELECT id FROM numbering_rule_versions ORDER BY id LIMIT 1").get();
  assert.ok(rule?.id, "fixture numbering rule");
  db.prepare(`INSERT INTO numbering_draft_workspaces
    (id, company_id, draft_mode, lifecycle_status, owner_id, created_by)
    VALUES ('workspace-revision-01', ?, 'new_bundle', 'active', ?, ?)`).run(ids.company, ids.owner, ids.owner);
  for (const row of [
    ["reservation-revision-01-root", "root", "draft-revision-01-root", "Z9101", "revision-01-root", 9101],
    ["reservation-revision-01-part", "part", "draft-revision-01-part", "Z9101-P01", "revision-01-part", 1],
    ["reservation-revision-01-drawing", "drawing", "draft-revision-01-drawing", "Z9101-M01", "revision-01-drawing", 1]
  ]) {
    db.prepare(`INSERT INTO number_candidate_reservations
      (id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code, sequence_scope_key, sequence_no, reservation_state, created_by)
      VALUES (?, ?, 'workspace-revision-01', ?, ?, ?, ?, ?, 'active', ?)`).run(row[0], ids.company, row[1], row[2], row[3], row[4], row[5], ids.owner);
  }
  db.prepare(`INSERT INTO numbering_draft_roots
    (id, company_id, workspace_id, core_name, item_kind, rule_version_id, candidate_reservation_id)
    VALUES ('draft-revision-01-root', ?, 'workspace-revision-01', 'Revision 0.1', 'manufactured', ?, 'reservation-revision-01-root')`).run(ids.company, rule.id);
  db.prepare(`INSERT INTO numbering_draft_parts
    (id, company_id, workspace_id, root_draft_id, part_name, item_kind, candidate_reservation_id)
    VALUES ('draft-revision-01-part', ?, 'workspace-revision-01', 'draft-revision-01-root', 'Revision 0.1', 'manufactured', 'reservation-revision-01-part')`).run(ids.company);
  db.prepare(`INSERT INTO numbering_draft_drawings
    (id, company_id, workspace_id, root_draft_id, purpose_code, purpose_description, is_primary_manufacturing, candidate_reservation_id)
    VALUES ('draft-revision-01-drawing', ?, 'workspace-revision-01', 'draft-revision-01-root', 'M', 'Revision 0.1', 1, 'reservation-revision-01-drawing')`).run(ids.company);
  db.prepare(`INSERT INTO numbering_draft_relations
    (id, company_id, workspace_id, drawing_draft_id, part_draft_id, link_type, is_primary)
    VALUES ('relation-revision-01', ?, 'workspace-revision-01', 'draft-revision-01-drawing', 'draft-revision-01-part', 'primary_manufacturing', 1)`).run(ids.company);
  db.prepare(`INSERT INTO drawings
    (id, company_id, drawing_number, lifecycle_state, workspace_id, drawing_draft_id, candidate_reservation_id,
     purpose_code, purpose_description, sequence_no, is_primary_manufacturing, owner_id, created_by)
    VALUES ('drawing-revision-01', ?, 'Z9101-M01', 'drawing_preparation', 'workspace-revision-01',
      'draft-revision-01-drawing', 'reservation-revision-01-drawing', 'M', 'Revision 0.1', 1, 1, ?, ?)`).run(ids.company, ids.owner, ids.owner);
  for (const [eventId, reservationId, eventType] of [
    ["event-revision-01-workspace", null, "workspace_created"],
    ["event-revision-01-root", "reservation-revision-01-root", "candidate_reserved"],
    ["event-revision-01-part", "reservation-revision-01-part", "candidate_reserved"],
    ["event-revision-01-drawing", "reservation-revision-01-drawing", "candidate_reserved"]
  ]) {
    db.prepare(`INSERT INTO number_candidate_events
      (id, company_id, workspace_id, reservation_id, event_type, actor_id)
      VALUES (?, ?, 'workspace-revision-01', ?, ?, ?)`).run(eventId, ids.company, reservationId, eventType, ids.owner);
  }
}

function insertPartOnlyWorkspace() {
  const rule = db.prepare("SELECT id FROM numbering_rule_versions ORDER BY id LIMIT 1").get();
  db.prepare(`INSERT INTO numbering_draft_workspaces
    (id, company_id, draft_mode, lifecycle_status, owner_id, created_by)
    VALUES ('workspace-part-only', ?, 'new_bundle', 'active', ?, ?)`).run(ids.company, ids.owner, ids.owner);
  for (const row of [
    ["reservation-part-only-root", "root", "draft-part-only-root", "Z9201", "part-only-root", 9201],
    ["reservation-part-only-part", "part", "draft-part-only-part", "Z9201-P01", "part-only-part", 1]
  ]) {
    db.prepare(`INSERT INTO number_candidate_reservations
      (id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code, sequence_scope_key, sequence_no, reservation_state, created_by)
      VALUES (?, ?, 'workspace-part-only', ?, ?, ?, ?, ?, 'active', ?)`).run(row[0], ids.company, row[1], row[2], row[3], row[4], row[5], ids.owner);
  }
  db.prepare(`INSERT INTO numbering_draft_roots
    (id, company_id, workspace_id, core_name, item_kind, rule_version_id, candidate_reservation_id)
    VALUES ('draft-part-only-root', ?, 'workspace-part-only', 'Part only', 'manufactured', ?, 'reservation-part-only-root')`).run(ids.company, rule.id);
  db.prepare(`INSERT INTO numbering_draft_parts
    (id, company_id, workspace_id, root_draft_id, part_name, item_kind, candidate_reservation_id)
    VALUES ('draft-part-only-part', ?, 'workspace-part-only', 'draft-part-only-root', 'Part only', 'manufactured', 'reservation-part-only-part')`).run(ids.company);
  for (const [eventId, reservationId, eventType] of [
    ["event-part-only-workspace", null, "workspace_created"],
    ["event-part-only-root", "reservation-part-only-root", "candidate_reserved"],
    ["event-part-only-part", "reservation-part-only-part", "candidate_reserved"]
  ]) {
    db.prepare(`INSERT INTO number_candidate_events
      (id, company_id, workspace_id, reservation_id, event_type, actor_id)
      VALUES (?, ?, 'workspace-part-only', ?, ?, ?)`).run(eventId, ids.company, reservationId, eventType, ids.owner);
  }
}

function insertCancelledHistory() {
  db.prepare(`INSERT INTO numbering_draft_workspaces
    (id, company_id, draft_mode, lifecycle_status, owner_id, created_by, cancelled_at, cancelled_by, cancel_reason)
    VALUES ('workspace-cancelled-history', ?, 'new_bundle', 'cancelled', ?, ?, CURRENT_TIMESTAMP, ?, 'fixture_cancelled')`).run(ids.company, ids.owner, ids.owner, ids.owner);
}

function runMigration(name) {
  const outputDir = path.join(outputRoot, name);
  const result = spawnSync(process.execPath, [
    "scripts/migrate-dev-087-canonical-workbench.mjs",
    `--db=${dbPath}`,
    "--apply",
    "--confirm-disposable-dev-087",
    "--initialize-missing-drawing-revisions-0.1",
    "--soft-archive-unapproved-part-only-drafts",
    "--preserve-cancelled-legacy-history",
    "--switch-canonical-only",
    "--expected-commit=local-dev",
    `--output-dir=${outputDir}`
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, `${name}: ${result.stderr || result.stdout}`);
  return JSON.parse(fs.readFileSync(path.join(outputDir, "manifest.json"), "utf8"));
}

try {
  insertWorkspaceGraph();
  insertPartOnlyWorkspace();
  insertCancelledHistory();
  db.close();

  const first = runMigration("first");
  const second = runMigration("second");
  const third = runMigration("third");
  assert.equal(first.unresolved, 0, "first run unresolved");
  assert.equal(first.initialRevisionBackfill.plannedRows, 1, "first run plans one 0.1 revision");
  assert.equal(first.initialRevisionBackfill.rejectedRows, 0, "first run has no rejected revision backfill");
  assert.equal(first.cleanup.softArchivedPartOnlyDrafts, 1, "first run soft archives part-only draft");
  assert.equal(first.cleanup.preservedCancelledHistory, 1, "first run preserves existing cancelled history");
  assert.equal(second.initialRevisionBackfill.verifiedExistingRows, 1, "second run verifies owned 0.1 revision");
  assert.equal(second.cleanup.softArchivedPartOnlyDrafts, 0, "second run does not repeat soft archive");
  assert.equal(second.cleanup.preservedCancelledHistory, 2, "second run preserves both cancelled histories");
  assert.equal(second.identityHash, third.identityHash, "settled rerun identity is stable");

  const verified = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    assert.deepEqual(verified.prepare(`SELECT revision, lifecycle_state, approval_request_id FROM drawing_revisions
      WHERE drawing_id = 'drawing-revision-01'`).get(), { revision: "0.1", lifecycle_state: "preparing", approval_request_id: null });
    assert.deepEqual(verified.prepare(`SELECT data_layer, handling FROM canonical_workbench_states
      WHERE canonical_entity_id = 'drawing-revision-01'`).get(), { data_layer: "drawing_rd", handling: "owner" });
    assert.equal(verified.prepare("SELECT COUNT(*) count FROM drawing_revision_works WHERE drawing_id = 'drawing-revision-01'").get().count, 1);
    assert.equal(verified.prepare("SELECT COUNT(*) count FROM drawing_revision_claims WHERE drawing_id = 'drawing-revision-01' AND target_label = '0.1'").get().count, 1);
    assert.deepEqual(verified.prepare("SELECT lifecycle_status, cancel_reason FROM numbering_draft_workspaces WHERE id = 'workspace-part-only'").get(), {
      lifecycle_status: "cancelled",
      cancel_reason: "dev087_canonical_cutover_unapproved_part_only_draft"
    });
    assert.equal(verified.prepare("SELECT COUNT(*) count FROM number_candidate_reservations WHERE workspace_id = 'workspace-part-only' AND reservation_state = 'recycled'").get().count, 2);
    assert.equal(verified.prepare("SELECT COUNT(*) count FROM number_candidate_events WHERE workspace_id = 'workspace-part-only' AND event_type = 'candidate_recycled'").get().count, 2);
    assert.equal(verified.prepare("SELECT COUNT(*) count FROM numbering_draft_parts WHERE workspace_id = 'workspace-part-only'").get().count, 1, "soft archive preserves draft rows");
    assert.equal(verified.prepare("SELECT COUNT(*) count FROM numbering_draft_workspaces WHERE id = 'workspace-cancelled-history'").get().count, 1, "cancelled history is retained");
    assert.equal(verified.prepare("SELECT COUNT(*) count FROM pdm_workbench_migration_quarantine WHERE resolution = 'preserved_cancelled_history'").get().count, 2);
    assert.deepEqual(verified.prepare("SELECT mode, expected_commit, schema_hash FROM pdm_workbench_state_authority_control WHERE id = 1").get(), {
      mode: "canonical_only",
      expected_commit: "local-dev",
      schema_hash: "dev090-v1"
    });
    assert.equal(verified.pragma("foreign_key_check").length, 0, "foreign keys");
    assert.equal(verified.pragma("integrity_check")[0].integrity_check, "ok", "integrity check");
  } finally {
    verified.close();
  }
  pass("initial-revision-0.1-backfill", 24);
} finally {
  if (db.open) db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
