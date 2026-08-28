import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { AsyncApprovalPlatformRepository } from "../src/lib/repositories/approval-platform-async-repository.ts";

const root = process.cwd();
const sourceDbPath = path.join(root, "data", "ai-pdm.sqlite");
const runId = `DEV101-INBOX-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-101", runId);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev101-inbox-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const fixtureDbPath = path.join(dataDir, "ai-pdm.sqlite");
const checks = [];
const fixtureLedger = [];

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function primaryState() {
  const db = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    const schema = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
    const identities = {
      roots: db.prepare("SELECT id, company_id, root_code FROM part_roots ORDER BY company_id, id").all(),
      parts: db.prepare("SELECT id, company_id, part_root_id, part_number FROM part_numbers ORDER BY company_id, id").all(),
      drawingNumbers: db.prepare("SELECT id, company_id, part_root_id, drawing_number FROM drawing_numbers ORDER BY company_id, id").all(),
      drawings: db.prepare("SELECT id, company_id, drawing_number, formal_drawing_number_id FROM drawings ORDER BY company_id, id").all()
    };
    const residue = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all();
    const foreignKeys = db.pragma("foreign_key_check");
    const payload = { schema, identities, residue, foreignKeys };
    return { ...payload, hash: hash(payload) };
  } finally {
    db.close();
  }
}

function assertSourceInvariants(db) {
  const counts = Object.fromEntries(["part_roots", "part_numbers", "drawing_numbers", "drawings"].map((table) => [
    table,
    Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)
  ]));
  assert.ok(Object.values(counts).every((count) => count > 0), "canonical master counts must be non-zero before fixture mutation");
  const orphanCounts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM part_numbers part LEFT JOIN part_roots root ON root.id = part.part_root_id AND root.company_id = part.company_id WHERE root.id IS NULL) AS part_orphans,
      (SELECT COUNT(*) FROM drawing_numbers drawing LEFT JOIN part_roots root ON root.id = drawing.part_root_id AND root.company_id = drawing.company_id WHERE root.id IS NULL) AS drawing_orphans
  `).get();
  assert.deepEqual(orphanCounts, { part_orphans: 0, drawing_orphans: 0 });
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  return { counts, orphanCounts, migrationResidue: db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all() };
}

async function check(id, description, fn) {
  try {
    const detail = await fn();
    checks.push({ id, description, status: "PASS", detail: detail ?? null });
    console.log(`PASS ${id} ${description}`);
  } catch (error) {
    checks.push({ id, description, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
    console.error(`FAIL ${id} ${description} — ${error instanceof Error ? error.message : String(error)}`);
  }
}

function insertFixtureRequest(requestStatement, branchStatement, base, input) {
  const requestKind = input.requestKind ?? "drawing_rd_void";
  const branchId = requestKind === "drawing_rd_void" ? `branch-${input.id}` : null;
  if (branchId) {
    branchStatement.run({ id: branchId, companyId: base.company_id, drawingId: base.canonical_entity_id });
    fixtureLedger.push({ table: "drawing_rd_branches", id: branchId, status: "open" });
  }
  requestStatement.run({
    id: input.id,
    companyId: base.company_id,
    requestKind,
    entityType: input.entityType ?? "drawing",
    canonicalEntityId: input.canonicalEntityId ?? base.canonical_entity_id,
    workId: null,
    branchId,
    reviewerUserId: input.reviewerUserId ?? base.reviewer_user_id,
    reviewCycleId: `cycle-${input.id}`,
    snapshotPayload: JSON.stringify(input.snapshotPayload ?? { payload: { drawingId: base.canonical_entity_id, migrated: true } }),
    snapshotHash: hash(input.snapshotPayload ?? { id: input.id }),
    requestStatus: input.requestStatus ?? "pending",
    createdAt: input.createdAt
  });
  fixtureLedger.push({ table: "pdm_work_review_requests", id: input.id, requestStatus: input.requestStatus ?? "pending", reviewerUserId: input.reviewerUserId ?? base.reviewer_user_id, createdAt: input.createdAt });
}

const primaryBefore = primaryState();
let fixtureDb;
let client;

try {
  fs.mkdirSync(repositoryDir, { recursive: true });
  fs.copyFileSync(sourceDbPath, fixtureDbPath);
  process.env.PDM_DB_PROVIDER = "sqlite";
  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;

  fixtureDb = new Database(fixtureDbPath);
  fixtureDb.pragma("foreign_keys = ON");
  const sourceInvariants = assertSourceInvariants(fixtureDb);
  const base = fixtureDb.prepare(`
    SELECT request.*
    FROM pdm_work_review_requests request
    JOIN drawings drawing ON drawing.id = request.canonical_entity_id AND drawing.company_id = request.company_id
    WHERE request.request_status = 'pending' AND request.request_kind = 'drawing_revision' AND drawing.drawing_number = 'A0002-M01'
    ORDER BY request.created_at, request.id
    LIMIT 1
  `).get();
  assert.ok(base, "A0002-M01 pending v1 request fixture is required");
  const originalV1Snapshot = fixtureDb.prepare("SELECT snapshot_payload, snapshot_hash FROM pdm_work_review_requests WHERE id = ?").get(base.id);
  const parsedV1 = JSON.parse(originalV1Snapshot.snapshot_payload);
  assert.notEqual(parsedV1.schemaVersion, "pdm-review-package-v2", "existing A0002-M01 must remain v1");
  const otherReviewer = fixtureDb.prepare("SELECT id FROM users WHERE company_id = ? AND id <> ? AND account_status = 'active' ORDER BY id LIMIT 1").get(base.company_id, base.reviewer_user_id)?.id;
  assert.ok(otherReviewer, "other reviewer fixture is required");

  const insert = fixtureDb.prepare(`
    INSERT INTO pdm_work_review_requests (
      id, company_id, request_kind, entity_type, canonical_entity_id, work_id, branch_id,
      reviewer_user_id, review_cycle_id, snapshot_payload, snapshot_hash, request_status,
      row_version, created_at, updated_at
    ) VALUES (
      @id, @companyId, @requestKind, @entityType, @canonicalEntityId, @workId, @branchId,
      @reviewerUserId, @reviewCycleId, @snapshotPayload, @snapshotHash, @requestStatus,
      1, @createdAt, @createdAt
    )
  `);
  const insertBranch = fixtureDb.prepare(`
    INSERT INTO drawing_rd_branches (id, company_id, drawing_id, status, row_version)
    VALUES (@id, @companyId, @drawingId, 'open', 1)
  `);
  const fixtureTransaction = fixtureDb.transaction(() => {
    insertFixtureRequest(insert, insertBranch, base, {
      id: "dev101-v1-same-projection",
      createdAt: "2026-08-27 12:00:01"
    });
    insertFixtureRequest(insert, insertBranch, base, {
      id: "dev101-v2-same-projection",
      createdAt: "2026-08-27 12:00:00",
      snapshotPayload: { schemaVersion: "pdm-review-package-v2", packageHash: "fixture-v2", targets: [] }
    });
    insertFixtureRequest(insert, insertBranch, base, { id: "dev101-other-reviewer", reviewerUserId: otherReviewer, createdAt: "2026-08-27 11:59:59" });
    insertFixtureRequest(insert, insertBranch, base, { id: "dev101-applying-hidden", requestStatus: "applying", createdAt: "2026-08-27 11:59:58" });
    insertFixtureRequest(insert, insertBranch, base, { id: "dev101-apply-failed-hidden", requestStatus: "apply_failed", createdAt: "2026-08-27 11:59:57" });
    for (let index = 0; index < 125; index += 1) {
      const createdAt = new Date(Date.UTC(2026, 7, 27, 10, 0, 0) - index * 1_000).toISOString().replace("T", " ").slice(0, 19);
      insertFixtureRequest(insert, insertBranch, base, {
        id: index === 124 ? "dev101-query-needle-oldest" : `dev101-page-${String(index).padStart(3, "0")}`,
        createdAt
      });
    }
  });
  fixtureTransaction();

  client = createAsyncDatabaseClient({ kind: "sqlite", database: fixtureDb });
  const repository = new AsyncApprovalPlatformRepository(client);
  const drawingRevisionActionCode = "numbering.pdm_drawing_revision_review";
  const voidActionCode = "numbering.pdm_drawing_rd_void_review";

  await check("DEV101-INBOX-001", "existing A0002-M01 v1 request is discoverable for the exact reviewer", async () => {
    const page = await repository.listInbox({ companyId: base.company_id, actorId: base.reviewer_user_id, status: "active", actionCode: drawingRevisionActionCode, query: "A0002-M01", limit: 100 });
    const item = page.items.find((candidate) => candidate.id === base.id);
    assert.ok(item);
    assert.equal(item.source, "pdm_work_review");
    assert.equal(item.actionCode, drawingRevisionActionCode);
    assert.match(item.targetSummary, /A0002-M01/u);
    assert.match(item.targetSummary, /研發版 0\.1/u);
    return { requestId: item.id, targetSummary: item.targetSummary };
  });

  await check("DEV101-INBOX-002", "v1 and v2 use the same canonical inbox row projection", async () => {
    const v1 = (await repository.listInbox({ companyId: base.company_id, actorId: base.reviewer_user_id, actionCode: voidActionCode, query: "dev101-v1-same-projection", limit: 10 })).items[0];
    const v2 = (await repository.listInbox({ companyId: base.company_id, actorId: base.reviewer_user_id, actionCode: voidActionCode, query: "dev101-v2-same-projection", limit: 10 })).items[0];
    assert.ok(v1 && v2);
    assert.deepEqual(Object.keys(v2).sort(), Object.keys(v1).sort());
    for (const key of ["source", "actionCode", "actionTitle", "domainCode", "status"]) assert.equal(v2[key], v1[key], key);
    assert.equal(v2.primaryTarget?.type, v1.primaryTarget?.type);
    assert.equal(v2.primaryTarget?.targetId, v1.primaryTarget?.targetId);
  });

  await check("DEV101-INBOX-003", "actor and actionable-status predicates prevent responsibility leakage", async () => {
    const originalActor = await repository.listInbox({ companyId: base.company_id, actorId: base.reviewer_user_id, status: "all", actionCode: voidActionCode, limit: 500 });
    assert.ok(!originalActor.items.some((item) => ["dev101-other-reviewer", "dev101-applying-hidden", "dev101-apply-failed-hidden"].includes(item.id)));
    const otherActor = await repository.listInbox({ companyId: base.company_id, actorId: otherReviewer, status: "active", actionCode: voidActionCode, limit: 10 });
    assert.deepEqual(otherActor.items.map((item) => item.id), ["dev101-other-reviewer"]);
  });

  await check("DEV101-INBOX-004", "query and action filters are applied before the source limit", async () => {
    const page = await repository.listInbox({ companyId: base.company_id, actorId: base.reviewer_user_id, status: "active", actionCode: voidActionCode, query: "query-needle-oldest", limit: 1 });
    assert.deepEqual(page.items.map((item) => item.id), ["dev101-query-needle-oldest"]);
    const unrelated = await repository.listInbox({ companyId: base.company_id, actorId: base.reviewer_user_id, status: "active", actionCode: "numbering.pdm_part_change_review", limit: 100 });
    assert.equal(unrelated.items.length, 0);
  });

  await check("DEV101-INBOX-005", "cursor pagination remains complete beyond the per-source fetch limit", async () => {
    const seen = new Set();
    let cursor = null;
    let pages = 0;
    let initialSummary = null;
    do {
      const page = await repository.listInbox({ companyId: base.company_id, actorId: base.reviewer_user_id, status: "active", actionCode: voidActionCode, limit: 10, cursor });
      if (!cursor) initialSummary = page.summary;
      for (const item of page.items) {
        assert.ok(!seen.has(item.id), `duplicate cursor row ${item.id}`);
        seen.add(item.id);
      }
      cursor = page.nextCursor;
      pages += 1;
      assert.ok(pages < 30, "cursor did not terminate");
    } while (cursor);
    assert.ok(seen.has("dev101-v1-same-projection"));
    assert.ok(seen.has("dev101-query-needle-oldest"));
    assert.equal(seen.size, 127);
    assert.deepEqual(initialSummary, { total: 127, pending: 127, needsInfo: 0, applyFailed: 0 });
    return { pages, rows: seen.size, initialSummary };
  });

  await check("DEV101-INBOX-006", "existing v1 request snapshot is not rewritten or backfilled", () => {
    const after = fixtureDb.prepare("SELECT snapshot_payload, snapshot_hash FROM pdm_work_review_requests WHERE id = ?").get(base.id);
    assert.deepEqual(after, originalV1Snapshot);
  });

  await check("DEV101-INBOX-007", "anti-false-pass gate rejects removal of the inbox adapter even when detail code remains", async () => {
    const mutantRepository = new AsyncApprovalPlatformRepository(client);
    mutantRepository.listPdmWorkReviewInbox = async () => [];
    const mutantPage = await mutantRepository.listInbox({ companyId: base.company_id, actorId: base.reviewer_user_id, status: "active", actionCode: drawingRevisionActionCode, query: "A0002-M01", limit: 100 });
    assert.equal(mutantPage.items.length, 0, "mutant must reproduce the zero-row regression");
    const restoredPage = await repository.listInbox({ companyId: base.company_id, actorId: base.reviewer_user_id, status: "active", actionCode: drawingRevisionActionCode, query: "A0002-M01", limit: 100 });
    assert.ok(restoredPage.items.some((item) => item.id === base.id), "restored adapter must pass the normal-entry oracle");
    return { mutantExpectedResult: "FAIL", firstFailure: "normal inbox row/count", directDetailCapabilityChanged: false, restoredExpectedResult: "PASS" };
  });

  assert.deepEqual(fixtureDb.pragma("foreign_key_check"), []);
  const primaryAfter = primaryState();
  assert.equal(primaryAfter.hash, primaryBefore.hash, "primary database changed during isolated repository test");
  const report = {
    dev: "DEV-101",
    runId,
    result: checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL",
    checks,
    sourceInvariants,
    fixtureMutationLedger: fixtureLedger,
    primaryBeforeHash: primaryBefore.hash,
    primaryAfterHash: primaryAfter.hash,
    completedAt: new Date().toISOString()
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(outputDir, "report.md"), `# DEV-101 canonical inbox repository QC\n\n- Result: ${report.result}\n- Checks: ${checks.filter((item) => item.status === "PASS").length}/${checks.length}\n- Fixture mutations: ${fixtureLedger.length}\n- Primary invariant: ${primaryBefore.hash === primaryAfter.hash ? "unchanged" : "changed"}\n`, "utf8");
  if (report.result !== "PASS") process.exitCode = 1;
} finally {
  if (client) await client.close();
  if (fixtureDb?.open) fixtureDb.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
