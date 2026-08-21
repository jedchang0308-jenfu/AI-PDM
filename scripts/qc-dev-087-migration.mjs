import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { assert, createFixtureDatabase, ids, pass } from "./qc-dev-087-fixtures.mjs";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev087-"));
const dbPath = path.join(tempRoot, "fixture.sqlite");
const fixture = createFixtureDatabase({ filename: dbPath, canonical: false, rdLifecycle: "in_review" });
const action = fixture.prepare(`SELECT action_code FROM approval_platform_actions ORDER BY action_code LIMIT 1`).get();
assert.ok(action?.action_code, "fixture approval action");
fixture.prepare(`INSERT INTO approval_platform_requests
  (id, company_id, action_code, domain_code, request_status, title, reason, requested_by, requested_at, resolved_by, resolved_at, apply_status, applied_by, applied_at)
  VALUES ('request-dev087-terminal-approved', @company, @action, 'drawing', 'approved', 'Approved revision', 'migration fixture', @owner, CURRENT_TIMESTAMP, @reviewer, CURRENT_TIMESTAMP, 'applied', @reviewer, CURRENT_TIMESTAMP)`).run({ company: ids.company, action: action.action_code, owner: ids.owner, reviewer: ids.reviewer });
fixture.prepare(`INSERT INTO approval_platform_decisions (id, request_id, approver_role, approver_id, decision, decided_at)
  VALUES ('decision-dev087-terminal-approved', 'request-dev087-terminal-approved', 'R&D Manager', @reviewer, 'approved', CURRENT_TIMESTAMP)`).run({ reviewer: ids.reviewer });
fixture.prepare(`UPDATE drawing_revisions SET approval_request_id = 'request-dev087-terminal-approved', updated_by = @reviewer, submitted_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ id: ids.rdRevision, reviewer: ids.reviewer });

const ruleVersion = fixture.prepare(`SELECT id FROM numbering_rule_versions ORDER BY id LIMIT 1`).get();
assert.ok(ruleVersion?.id, "fixture numbering rule version");
fixture.prepare(`INSERT INTO numbering_draft_workspaces (id, company_id, draft_mode, lifecycle_status, owner_id, created_by)
  VALUES ('workspace-dev087-disposable', @company, 'new_bundle', 'active', @owner, @owner)`).run({ company: ids.company, owner: ids.owner });
fixture.prepare(`INSERT INTO numbering_draft_roots (id, company_id, workspace_id, core_name, item_kind, rule_version_id)
  VALUES ('draft-root-dev087-disposable', @company, 'workspace-dev087-disposable', 'Disposable', 'manufactured', @rule)`).run({ company: ids.company, rule: ruleVersion.id });
fixture.prepare(`INSERT INTO numbering_draft_parts (id, company_id, workspace_id, root_draft_id, part_name, item_kind)
  VALUES ('draft-part-dev087-disposable', @company, 'workspace-dev087-disposable', 'draft-root-dev087-disposable', 'Disposable', 'manufactured')`).run({ company: ids.company });
for (const [id, type, item, code, scope, sequence] of [
  ['reservation-dev087-root', 'root', 'draft-root-dev087-disposable', 'Z9001', 'fixture-root', 9001],
  ['reservation-dev087-part', 'part', 'draft-part-dev087-disposable', 'Z9001-P01', 'fixture-part', 1]
]) fixture.prepare(`INSERT INTO number_candidate_reservations
  (id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code, sequence_scope_key, sequence_no, reservation_state, created_by)
  VALUES (?, ?, 'workspace-dev087-disposable', ?, ?, ?, ?, ?, 'active', ?)`).run(id, ids.company, type, item, code, scope, sequence, ids.owner);
fixture.prepare(`INSERT INTO number_candidate_events (id, company_id, workspace_id, reservation_id, event_type, actor_id)
  VALUES ('event-dev087-workspace', @company, 'workspace-dev087-disposable', NULL, 'workspace_created', @owner)`).run({ company: ids.company, owner: ids.owner });
fixture.prepare(`INSERT INTO number_candidate_events (id, company_id, workspace_id, reservation_id, event_type, actor_id)
  VALUES ('event-dev087-root', @company, 'workspace-dev087-disposable', 'reservation-dev087-root', 'candidate_reserved', @owner)`).run({ company: ids.company, owner: ids.owner });
fixture.close();
function apply(name) {
  const output = path.join(tempRoot, name);
  const result = spawnSync(process.execPath, ["scripts/migrate-dev-087-canonical-workbench.mjs", `--db=${dbPath}`, "--apply", "--confirm-disposable-dev-087", "--discard-unapproved-part-only-drafts", "--switch-canonical-only", "--expected-commit=local-dev", `--output-dir=${output}`], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, `${name}: ${result.stderr || result.stdout}`);
  return JSON.parse(fs.readFileSync(path.join(output, "manifest.json"), "utf8"));
}
try {
  const first = apply("first");
  const second = apply("second");
  assert.equal(first.unresolved, 0);
  assert.equal(first.cleanup.unapprovedPartOnlyDrafts, 1);
  assert.equal(first.target.reviewTraces, 2);
  assert.equal(first.identityHash, second.identityHash);
  const db = new Database(dbPath, { readonly: true });
  try {
    const authority = db.prepare(`SELECT mode, expected_commit, schema_hash FROM pdm_workbench_state_authority_control WHERE id = 1`).get();
    assert.deepEqual(authority, { mode: "canonical_only", expected_commit: "local-dev", schema_hash: "dev087-v1" });
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM canonical_workbench_states WHERE entity_type = 'drawing'`).get().n, 2);
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM drawing_rd_branches`).get().n, 1);
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM drawing_revision_claims`).get().n, 1);
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM pdm_review_traces`).get().n, 2);
    assert.equal(db.prepare(`SELECT COUNT(*) n FROM numbering_draft_workspaces WHERE id = 'workspace-dev087-disposable'`).get().n, 0);
    assert.deepEqual(db.prepare(`SELECT latest_approved_revision_id FROM drawing_rd_branches`).get(), { latest_approved_revision_id: ids.rdRevision });
    assert.equal(db.pragma("foreign_key_check").length, 0);
  } finally {
    db.close();
  }
  pass("migration", 13);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
