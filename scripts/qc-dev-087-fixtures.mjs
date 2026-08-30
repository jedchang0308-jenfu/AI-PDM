import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export { assert };
export const root = process.cwd();
export function read(relativePath) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }

export const ids = {
  company: "company-dev087-a", otherCompany: "company-dev087-b", owner: "user-dev087-owner", reviewer: "user-dev087-reviewer",
  root: "root-dev087-a0002", part: "part-dev087-a0002", drawing: "drawing-dev087-a0002", productionRevision: "revision-dev087-a0002-1",
  drawingNumber: "drawing-number-dev087-a0002",
  rdRevision: "revision-dev087-a0002-1-1", branch: "branch-dev087-a0002-1", aggregateDrawing: "aggregate-dev087-drawing-a0002",
  aggregatePart: "aggregate-dev087-part-a0002",
  stateProduction: "10000000-0000-4000-8000-000000000001", stateRd: "10000000-0000-4000-8000-000000000002",
  statePart: "10000000-0000-4000-8000-000000000003"
};

function insert(db, sql, params) { db.prepare(sql).run(params); }

export function createFixtureDatabase(options = {}) {
  const db = new Database(options.filename ?? ":memory:");
  db.exec(read("db/schema.sql"));
  insert(db, `INSERT OR IGNORE INTO companies (id, company_code, display_name) VALUES (@id, @code, @name)`, { id: ids.company, code: "D87A", name: "DEV087 A" });
  insert(db, `INSERT OR IGNORE INTO companies (id, company_code, display_name) VALUES (@id, @code, @name)`, { id: ids.otherCompany, code: "D87B", name: "DEV087 B" });
  insert(db, `INSERT INTO users (id, display_name, email, role, company_id) VALUES (@id, 'Owner', 'owner-dev087@example.test', 'Engineer', @company)`, { id: ids.owner, company: ids.company });
  insert(db, `INSERT INTO users (id, display_name, email, role, company_id) VALUES (@id, 'Reviewer', 'reviewer-dev087@example.test', 'R&D Manager', @company)`, { id: ids.reviewer, company: ids.company });
  insert(db, `INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, record_status, created_by) VALUES (@id, @company, 'A0002', '本體_BS_右_Xx5', 'manufactured', 'Released', @owner)`, { id: ids.root, company: ids.company, owner: ids.owner });
  insert(db, `INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, record_status, created_by) VALUES (@id, @company, @root, 'A0002-P01', 1, 'P01', '本體_BS_右_Xx5', 'manufactured', 'Released', @owner)`, { id: ids.part, company: ids.company, root: ids.root, owner: ids.owner });
  insert(db, `INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing, record_status, created_by) VALUES (@id, @company, @root, 'A0002-M01', 'M', '製造圖', 1, 1, 'Released', @owner)`, { id: ids.drawingNumber, company: ids.company, root: ids.root, owner: ids.owner });
  insert(db, `INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by) VALUES ('link-dev087-a0002', @drawing, @part, 'primary_manufacturing', @owner)`, { drawing: ids.drawingNumber, part: ids.part, owner: ids.owner });
  insert(db, `INSERT INTO drawings (id, company_id, drawing_number, lifecycle_state, formal_drawing_number_id, part_root_id, purpose_code, purpose_description, sequence_no, owner_id, created_by) VALUES (@id, @company, 'A0002-M01', 'released', @formal, @root, 'M', '製造圖', 1, @owner, @owner)`, { id: ids.drawing, company: ids.company, formal: ids.drawingNumber, root: ids.root, owner: ids.owner });
  insert(db, `INSERT INTO drawing_revisions (id, company_id, drawing_id, revision, lifecycle_state, created_by, controlled_at, released_at) VALUES (@id, @company, @drawing, '1', 'released', @owner, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, { id: ids.productionRevision, company: ids.company, drawing: ids.drawing, owner: ids.owner });
  insert(db, `INSERT INTO drawing_revisions (id, company_id, drawing_id, revision, lifecycle_state, created_by, controlled_at) VALUES (@id, @company, @drawing, '1.1', @lifecycle, @owner, CURRENT_TIMESTAMP)`, { id: ids.rdRevision, company: ids.company, drawing: ids.drawing, owner: ids.owner, lifecycle: options.rdLifecycle ?? "rd_controlled" });
  if (options.canonical === false) return db;
  insert(db, `INSERT INTO pdm_workbench_aggregates (id, company_id, entity_type, canonical_entity_id, open_branch_count) VALUES (@id, @company, 'drawing', @entity, 1)`, { id: ids.aggregateDrawing, company: ids.company, entity: ids.drawing });
  insert(db, `INSERT INTO pdm_workbench_aggregates (id, company_id, entity_type, canonical_entity_id) VALUES (@id, @company, 'part', @entity)`, { id: ids.aggregatePart, company: ids.company, entity: ids.part });
  insert(db, `INSERT INTO drawing_rd_branches (id, company_id, drawing_id, base_production_revision_id, latest_approved_revision_id) VALUES (@id, @company, @drawing, @production, @latest)`, { id: ids.branch, company: ids.company, drawing: ids.drawing, production: ids.productionRevision, latest: ids.rdRevision });
  insert(db, `INSERT INTO drawing_revision_claims (id, company_id, drawing_id, branch_id, target_major, target_minor, target_label, predecessor_revision_id, claim_state) VALUES ('claim-dev087-1-1', @company, @drawing, @branch, 1, 1, '1.1', @predecessor, 'approved')`, { company: ids.company, drawing: ids.drawing, branch: ids.branch, predecessor: ids.productionRevision });
  insert(db, `INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, revision_id) VALUES (@id, @company, 'drawing', @entity, 'drawing_production', @revision)`, { id: ids.stateProduction, company: ids.company, entity: ids.drawing, revision: ids.productionRevision });
  insert(db, `INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, branch_id, revision_id) VALUES (@id, @company, 'drawing', @entity, 'drawing_rd', @branch, @revision)`, { id: ids.stateRd, company: ids.company, entity: ids.drawing, branch: ids.branch, revision: ids.rdRevision });
  insert(db, `INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer) VALUES (@id, @company, 'part', @entity, 'part_formal')`, { id: ids.statePart, company: ids.company, entity: ids.part });
  db.prepare(`UPDATE pdm_workbench_state_authority_control SET mode = 'canonical_only', expected_commit = 'local-dev', schema_hash = 'dev090-v1', row_version = row_version + 1`).run();
  assert.equal(db.pragma("foreign_key_check").length, 0, "fixture foreign keys");
  return db;
}

export function expectSqlFailure(fn, pattern) {
  assert.throws(fn, pattern);
}

export function pass(scope, count) { console.log(`DEV-087 ${scope}: PASS (${count} checks)`); }
