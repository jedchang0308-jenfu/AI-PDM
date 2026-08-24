import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { AsyncBomWorkbenchRepository } from "../src/lib/repositories/bom-workbench-async-repository.ts";

const root = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev095-manual-bom-"));
const databasePath = path.join(tempRoot, "manual-bom.sqlite");
const database = new Database(databasePath);
const now = "2026-08-24T08:00:00.000Z";
let idSequence = 0;
const nextId = () => `dev095-${String(++idSequence).padStart(4, "0")}`;

try {
  database.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
  database.prepare("INSERT INTO companies (id, company_code, display_name) VALUES (?, ?, ?)").run(
    "dev095-company",
    "DEV095",
    "DEV-095 isolated company"
  );
  database.prepare(
    "INSERT INTO users (id, display_name, email, role, company_id) VALUES (?, ?, ?, ?, ?)"
  ).run("dev095-engineer", "DEV-095 Engineer", "dev095-engineer@example.invalid", "Engineer", "dev095-company");
  database.prepare(
    "INSERT INTO users (id, display_name, email, role, company_id) VALUES (?, ?, ?, ?, ?)"
  ).run("dev095-manager", "DEV-095 Manager", "dev095-manager@example.invalid", "R&D Manager", "dev095-company");

  database.prepare(
    `INSERT INTO part_roots (
      id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "dev095-root",
    "dev095-company",
    "Z9500",
    "DEV-095 manual BOM regression",
    "manufactured",
    "Released",
    "numbering-rule-v3-alpha-root",
    "dev095-engineer"
  );
  const insertPartNumber = database.prepare(
    `INSERT INTO part_numbers (
      id, company_id, part_root_id, part_number, sequence_no, sequence_code,
      part_name, item_kind, bom_usage_policy, record_status, rule_version_id, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertPartNumber.run(
    "dev095-parent-part",
    "dev095-company",
    "dev095-root",
    "Z9500-P01",
    1,
    "01",
    "Manual BOM parent",
    "manufactured",
    "available",
    "Released",
    "numbering-rule-v3-alpha-root",
    "dev095-engineer"
  );
  insertPartNumber.run(
    "dev095-child-part",
    "dev095-company",
    "dev095-root",
    "Z9500-P02",
    2,
    "02",
    "Manual BOM child",
    "manufactured",
    "not_required",
    "Released",
    "numbering-rule-v3-alpha-root",
    "dev095-engineer"
  );

  const insertItem = database.prepare(
    "INSERT INTO items (id, company_id, part_number, part_name, current_revision) VALUES (?, ?, ?, ?, ?)"
  );
  insertItem.run("dev095-parent-item", "dev095-company", "Z9500-P01", "Manual BOM parent", "1");
  insertItem.run("dev095-child-item", "dev095-company", "Z9500-P02", "Manual BOM child", "A");
  database.prepare(
    `INSERT INTO submissions (
      id, company_id, item_id, drawing_number, revision, material, surface_finish,
      document_type, change_description, status, submitted_by, released_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "dev095-child-submission",
    "dev095-company",
    "dev095-child-item",
    "Z9500-M02",
    "A",
    "SUS304",
    "None",
    "Drawing",
    "DEV-095 isolated released child",
    "Released",
    "dev095-engineer",
    now,
    now,
    now
  );

  const client = createAsyncDatabaseClient({ kind: "sqlite", database });
  const repository = new AsyncBomWorkbenchRepository(client, () => now, nextId);
  const createInput = {
    companyId: "dev095-company",
    ownerPartNumberId: "dev095-parent-part",
    ownerPartNumber: "Z9500-P01",
    legacyItemId: "dev095-parent-item",
    bomRevision: "1",
    source: "manual",
    actorId: "dev095-engineer",
    idempotencyKey: "dev095-manual-create",
    requestFingerprint: "dev095-manual-create-v1",
    draftName: "DEV-095 manual BOM regression"
  };

  const created = await repository.createCanonicalDraft(createInput);
  assert.equal(created.replayed, false);
  assert.equal(created.draft.source, "manual");
  assert.equal(created.draft.identity_authority, "canonical_part_number");
  assert.equal(created.draft.lines.length, 0);

  const replayed = await repository.createCanonicalDraft(createInput);
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.draft.id, created.draft.id);

  const saved = await repository.saveDraftTree({
    draftId: created.draft.id,
    actorId: "dev095-engineer",
    reason: "DEV-095 retained manual BOM path",
    expectedEditorVersion: 0,
    lines: [
      {
        id: "dev095-line-1",
        nodeType: "item",
        partNumber: "Z9500-P02",
        revision: "A",
        quantity: 2,
        sequenceNo: 1
      }
    ],
    floatingTopics: []
  });
  assert.equal(saved?.source, "manual");
  assert.equal(saved?.editor_version, 1);
  assert.equal(saved?.line_count, 1);
  assert.equal(saved?.lines[0]?.source, "manual");

  const review = await repository.submitReview({
    draftId: created.draft.id,
    actorId: "dev095-engineer",
    changeReason: "Verify retained manual BOM release flow"
  });
  assert.equal(review?.status, "PendingReview");
  assert.equal(review?.lifecycle_action, "release");

  const approval = await repository.approveReview({
    reviewId: review.id,
    actorId: "dev095-manager",
    decisionReason: "DEV-095 isolated regression passed"
  });
  assert.equal(approval?.review?.status, "Approved");
  assert.equal(approval?.draft?.status, "Released");
  assert.ok(approval?.snapshotId);

  const snapshot = database
    .prepare(
      `SELECT bom_draft_id, owner_part_number_id, bom_revision, line_count, line_snapshot_json
       FROM bom_release_snapshots WHERE id = ?`
    )
    .get(approval.snapshotId);
  assert.equal(snapshot.bom_draft_id, created.draft.id);
  assert.equal(snapshot.owner_part_number_id, "dev095-parent-part");
  assert.equal(snapshot.bom_revision, "1");
  assert.equal(snapshot.line_count, 1);
  assert.equal(JSON.parse(snapshot.line_snapshot_json)[0].part_number, "Z9500-P02");

  const counts = Object.fromEntries(
    ["bom_drafts", "bom_lines_tree", "bom_review_requests", "bom_release_snapshots", "bom_create_effects"].map(
      (table) => [table, Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)]
    )
  );
  assert.deepEqual(counts, {
    bom_drafts: 1,
    bom_lines_tree: 1,
    bom_review_requests: 1,
    bom_release_snapshots: 1,
    bom_create_effects: 1
  });
  assert.deepEqual(database.pragma("foreign_key_check"), []);

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        databaseScope: "task-owned temporary SQLite",
        createSource: created.draft.source,
        idempotentReplay: replayed.replayed,
        savedLineCount: saved.line_count,
        reviewStatus: review.status,
        releaseStatus: approval.draft.status,
        snapshotId: approval.snapshotId,
        counts,
        foreignKeyCheck: []
      },
      null,
      2
    )
  );
} finally {
  database.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
