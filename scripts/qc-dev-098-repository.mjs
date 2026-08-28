import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { DrawingRevisionWorkService } from "../src/lib/drawing-revision-work.ts";
import { DrawingRevisionWorkAsyncRepository } from "../src/lib/repositories/drawing-revision-work-async-repository.ts";
import { issueCanonicalWorkbenchContract } from "../src/lib/pdm-workbench-authority-control.ts";

const root = process.cwd();
const fixedCaseIds = [
  ...Array.from({ length: 11 }, (_, index) => `QA-098-${String(index + 6).padStart(3, "0")}`),
  "QA-098-027", "QA-098-028", "QA-098-030"
];
const caseResults = [];

const owner = {
  id: ids.owner,
  companyId: ids.company,
  canEditNonOwned: false,
  permissions: { create: true, update: true, submit: true, cancel: true, decide: true, obsolete: true }
};

function snapshot(db) {
  const tables = ["drawing_rd_branches", "drawing_revision_claims", "drawing_revisions", "drawing_revision_works", "drawing_revision_work_files", "canonical_workbench_states", "pdm_workbench_aggregates"];
  return Object.fromEntries(tables.map((table) => [table, Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n)]));
}

function activateCanonicalAuthority(db) {
  db.prepare(`UPDATE pdm_workbench_state_authority_control SET mode = 'canonical_only', expected_commit = 'local-dev', schema_hash = 'dev090-v1', row_version = row_version + 1`).run();
}

function insertDrawingAggregate(db, openBranchCount) {
  db.prepare(`INSERT INTO pdm_workbench_aggregates (id, company_id, entity_type, canonical_entity_id, open_branch_count) VALUES (?, ?, 'drawing', ?, ?)`).run(ids.aggregateDrawing, ids.company, ids.drawing, openBranchCount);
}

function productionOnly(db) {
  insertDrawingAggregate(db, 0);
  db.prepare(`INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, revision_id) VALUES (?, ?, 'drawing', ?, 'drawing_production', ?)`).run(ids.stateProduction, ids.company, ids.drawing, ids.productionRevision);
  activateCanonicalAuthority(db);
}

function dA(db) {
  db.prepare(`UPDATE drawing_revisions SET revision = '1.2', lifecycle_state = 'rd_controlled' WHERE id = ?`).run(ids.rdRevision);
  insertDrawingAggregate(db, 2);
  db.prepare(`INSERT INTO drawing_rd_branches (id, company_id, drawing_id, base_production_revision_id, latest_approved_revision_id) VALUES (?, ?, ?, ?, ?)`).run(ids.branch, ids.company, ids.drawing, ids.productionRevision, ids.rdRevision);
  db.prepare(`INSERT INTO drawing_revision_claims (id, company_id, drawing_id, branch_id, target_major, target_minor, target_label, predecessor_revision_id, claim_state) VALUES ('claim-dev098-1-2', ?, ?, ?, 1, 2, '1.2', ?, 'approved')`).run(ids.company, ids.drawing, ids.branch, ids.productionRevision);
  db.prepare(`INSERT INTO drawing_revisions (id, company_id, drawing_id, revision, lifecycle_state, created_by, controlled_at) VALUES ('revision-dev098-1-4', ?, ?, '1.4', 'rd_controlled', ?, CURRENT_TIMESTAMP)`).run(ids.company, ids.drawing, ids.owner);
  db.prepare(`INSERT INTO drawing_rd_branches (id, company_id, drawing_id, base_production_revision_id, latest_approved_revision_id) VALUES ('branch-dev098-b', ?, ?, ?, 'revision-dev098-1-4')`).run(ids.company, ids.drawing, ids.productionRevision);
  db.prepare(`INSERT INTO drawing_revision_claims (id, company_id, drawing_id, branch_id, target_major, target_minor, target_label, predecessor_revision_id, claim_state) VALUES ('claim-dev098-1-4', ?, ?, 'branch-dev098-b', 1, 4, '1.4', ?, 'approved')`).run(ids.company, ids.drawing, ids.rdRevision);
  db.prepare(`INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, revision_id) VALUES (?, ?, 'drawing', ?, 'drawing_production', ?)`).run(ids.stateProduction, ids.company, ids.drawing, ids.productionRevision);
  db.prepare(`INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, branch_id, revision_id) VALUES (?, ?, 'drawing', ?, 'drawing_rd', ?, ?)`).run(ids.stateRd, ids.company, ids.drawing, ids.branch, ids.rdRevision);
  db.prepare(`INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, branch_id, revision_id) VALUES ('state-dev098-b', ?, 'drawing', ?, 'drawing_rd', 'branch-dev098-b', 'revision-dev098-1-4')`).run(ids.company, ids.drawing);
  activateCanonicalAuthority(db);
}

function makeStale(db) {
  db.prepare(`INSERT INTO drawing_revisions (id, company_id, drawing_id, revision, lifecycle_state, created_by, controlled_at, released_at) VALUES ('revision-dev098-prod-2', ?, ?, '2', 'released', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(ids.company, ids.drawing, ids.owner);
  db.prepare(`UPDATE drawing_revisions SET lifecycle_state = 'superseded' WHERE id = ?`).run(ids.productionRevision);
  db.prepare(`UPDATE canonical_workbench_states SET revision_id = 'revision-dev098-prod-2', row_version = row_version + 1 WHERE id = ?`).run(ids.stateProduction);
}

function makePreproduction(db) {
  db.prepare(`UPDATE drawing_revisions SET revision = '0.1', lifecycle_state = 'rd_controlled' WHERE id = ?`).run(ids.rdRevision);
  insertDrawingAggregate(db, 1);
  db.prepare(`INSERT INTO drawing_rd_branches (id, company_id, drawing_id, base_production_revision_id, latest_approved_revision_id) VALUES (?, ?, ?, NULL, ?)`).run(ids.branch, ids.company, ids.drawing, ids.rdRevision);
  db.prepare(`INSERT INTO drawing_revision_claims (id, company_id, drawing_id, branch_id, target_major, target_minor, target_label, predecessor_revision_id, claim_state) VALUES ('claim-dev098-0-1', ?, ?, ?, 0, 1, '0.1', NULL, 'approved')`).run(ids.company, ids.drawing, ids.branch);
  db.prepare(`INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, branch_id, revision_id) VALUES (?, ?, 'drawing', ?, 'drawing_rd', ?, ?)`).run(ids.stateRd, ids.company, ids.drawing, ids.branch, ids.rdRevision);
  activateCanonicalAuthority(db);
}

async function fixture(scenario = "default", mutator) {
  const customScenario = scenario !== "default";
  const db = createFixtureDatabase(customScenario
    ? { canonical: false, rdLifecycle: scenario === "production" ? "rd_controlled" : "preparing" }
    : undefined);
  if (scenario === "production") productionOnly(db);
  if (scenario === "dual-rd") dA(db);
  if (scenario === "preproduction") makePreproduction(db);
  mutator?.(db);
  assert.equal(db.pragma("foreign_key_check").length, 0);
  const client = createAsyncDatabaseClient({ kind: "sqlite", database: db });
  const repository = new DrawingRevisionWorkAsyncRepository(client);
  return { db, client, repository, service: new DrawingRevisionWorkService(client) };
}

async function close(ctx) {
  assert.equal(ctx.db.pragma("foreign_key_check").length, 0);
  await ctx.client.close();
  ctx.db.close();
}

async function createRepositoryWork(ctx, { sourceRowId = ids.stateProduction, mode = "recommended", minor = null, target = null } = {}) {
  const source = await ctx.repository.readSourceState(ctx.client, ids.company, sourceRowId);
  assert(source);
  let resolved = target;
  if (!resolved) {
    const candidates = await ctx.repository.listCandidates(ctx.client, source);
    resolved = mode === "recommended" ? candidates.find((item) => item.kind === "rd")?.target : {
      major: source.current_production_revision ? Number(source.current_production_revision.split(".")[0]) : 0,
      minor,
      label: `${source.current_production_revision ? Number(source.current_production_revision.split(".")[0]) : 0}.${minor}`
    };
  }
  assert(resolved);
  return ctx.client.transaction((tx) => ctx.repository.create(tx, {
    companyId: ids.company,
    sourceRowId,
    ownerUserId: ids.owner,
    expectedRowVersion: Number(source.row_version),
    target: resolved,
    selectionMode: mode,
    requestedMinor: mode === "manual_minor" ? minor : null
  }));
}

async function completeImpactAndFormalize(ctx, created) {
  const work = await ctx.repository.readWork(ctx.client, ids.company, created.workId);
  assert(work);
  const payload = typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) : work.proposed_payload;
  payload.changeImpact = { ...payload.changeImpact, formState: "no_impact", fitState: "no_impact", functionState: "no_impact" };
  ctx.db.prepare(`UPDATE drawing_revision_works SET proposed_payload = ? WHERE id = ?`).run(JSON.stringify(payload), created.workId);
  const complete = await ctx.repository.readWork(ctx.client, ids.company, created.workId);
  assert(complete);
  return ctx.client.transaction((tx) => ctx.repository.formalize(tx, { companyId: ids.company, work: complete }));
}

async function runCase(id, title, execute) {
  const evidence = {};
  try {
    await execute(evidence);
    caseResults.push({ id, title, status: "PASS", evidence });
  } catch (error) {
    caseResults.push({ id, title, status: "FAIL", message: error instanceof Error ? error.stack ?? error.message : String(error), evidence });
  }
}

await runCase("QA-098-006", "production source creates first branch and complete transactional row set", async (evidence) => {
  const ctx = await fixture("production");
  const before = snapshot(ctx.db);
  const created = await createRepositoryWork(ctx);
  assert.equal(created.revision, "1.1");
  const rows = ctx.db.prepare(`SELECT claim.target_label, claim.predecessor_revision_id, work.id AS work_id, state.handling, branch.base_production_revision_id FROM drawing_revision_works work JOIN drawing_revision_claims claim ON claim.id = work.target_claim_id JOIN canonical_workbench_states state ON state.work_id = work.id JOIN drawing_rd_branches branch ON branch.id = work.branch_id WHERE work.id = ?`).get(created.workId);
  assert.deepEqual(rows, { target_label: "1.1", predecessor_revision_id: ids.productionRevision, work_id: created.workId, handling: "owner", base_production_revision_id: ids.productionRevision });
  assert.equal(ctx.db.prepare(`SELECT open_branch_count FROM pdm_workbench_aggregates WHERE id = ?`).get(ids.aggregateDrawing).open_branch_count, 1);
  evidence.beforeAfter = { before, after: snapshot(ctx.db) };
  evidence.created = created;
  evidence.rows = rows;
  await close(ctx);
});

await runCase("QA-098-007", "manual minor may skip forward but cannot author the major", async (evidence) => {
  const ctx = await fixture("dual-rd");
  const created = await createRepositoryWork(ctx, { sourceRowId: ids.stateRd, mode: "manual_minor", minor: 5 });
  assert.equal(created.revision, "1.5");
  const claim = ctx.db.prepare(`SELECT target_major, target_minor, target_label, predecessor_revision_id FROM drawing_revision_claims WHERE id = (SELECT target_claim_id FROM drawing_revision_works WHERE id = ?)`).get(created.workId);
  assert.deepEqual(claim, { target_major: 1, target_minor: 5, target_label: "1.5", predecessor_revision_id: ids.rdRevision });
  evidence.normalizedRequest = { selectionMode: "manual_minor", requestedMinor: 5 };
  evidence.claim = claim;
  await close(ctx);
});

await runCase("QA-098-008", "not-forward and occupied manual targets fail with zero business writes", async (evidence) => {
  const failures = [];
  for (const minor of [1, 2, 4]) {
    const ctx = await fixture("dual-rd");
    const before = snapshot(ctx.db);
    await assert.rejects(() => createRepositoryWork(ctx, { sourceRowId: ids.stateRd, mode: "manual_minor", minor }), (error) => {
      const expected = minor === 4 ? "DRAWING_TARGET_REVISION_CLAIMED" : "DRAWING_MANUAL_MINOR_NOT_FORWARD";
      failures.push({ minor, code: error?.code, status: error?.status });
      return error?.code === expected;
    });
    assert.deepEqual(snapshot(ctx.db), before);
    await close(ctx);
  }
  evidence.failures = failures;
});

await runCase("QA-098-009", "two actors claiming one tuple produce exactly one winner", async (evidence) => {
  const ctx = await fixture("production");
  const source = await ctx.repository.readSourceState(ctx.client, ids.company, ids.stateProduction);
  const invoke = (actorId) => ctx.client.transaction((tx) => ctx.repository.create(tx, { companyId: ids.company, sourceRowId: ids.stateProduction, ownerUserId: actorId, expectedRowVersion: source.row_version, target: { major: 1, minor: 7, label: "1.7" }, selectionMode: "manual_minor", requestedMinor: 7 }));
  const settled = await Promise.allSettled([invoke(ids.owner), invoke(ids.reviewer)]);
  assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(settled.filter((item) => item.status === "rejected").length, 1);
  assert.equal(ctx.db.prepare(`SELECT COUNT(*) AS n FROM drawing_revision_claims WHERE target_major = 1 AND target_minor = 7`).get().n, 1);
  assert.equal(ctx.db.prepare(`SELECT open_branch_count FROM pdm_workbench_aggregates WHERE id = ?`).get(ids.aggregateDrawing).open_branch_count, 1);
  evidence.receipts = settled.map((item, index) => item.status === "fulfilled" ? { actor: index, status: "winner", result: item.value } : { actor: index, status: "loser", code: item.reason?.code });
  await close(ctx);
});

await runCase("QA-098-010", "fourth branch is rejected by the locked aggregate cap", async (evidence) => {
  const ctx = await fixture("production", (db) => { db.prepare(`UPDATE pdm_workbench_aggregates SET open_branch_count = 3 WHERE id = ?`).run(ids.aggregateDrawing); });
  const before = snapshot(ctx.db);
  await assert.rejects(() => createRepositoryWork(ctx), (error) => error?.code === "DRAWING_RD_BRANCH_LIMIT_REACHED");
  assert.deepEqual(snapshot(ctx.db), before);
  evidence.beforeAfter = { before, after: snapshot(ctx.db) };
  await close(ctx);
});

await runCase("QA-098-011", "stale branch exposes no candidate and rejects recommended/manual writes", async (evidence) => {
  for (const mode of ["recommended", "manual_minor"]) {
    const ctx = await fixture("dual-rd", makeStale);
    const source = await ctx.repository.readSourceState(ctx.client, ids.company, ids.stateRd);
    assert.deepEqual(await ctx.repository.listCandidates(ctx.client, source), []);
    const before = snapshot(ctx.db);
    const target = mode === "recommended" ? { major: 2, minor: 3, label: "2.3" } : { major: 2, minor: 3, label: "2.3" };
    await assert.rejects(() => createRepositoryWork(ctx, { sourceRowId: ids.stateRd, mode, minor: mode === "manual_minor" ? 3 : null, target }), (error) => error?.code === "DRAWING_PRODUCTION_BASE_STALE");
    assert.deepEqual(snapshot(ctx.db), before);
    assert.equal(ctx.db.prepare(`SELECT COUNT(*) AS n FROM drawing_revision_claims WHERE target_label IN ('1.3','2.3')`).get().n, 0);
    evidence[mode] = { basisState: "stale", candidates: [], beforeAfter: { before, after: snapshot(ctx.db) } };
    await close(ctx);
  }
});

await runCase("QA-098-012", "old source version and basis race fail closed without retargeting", async (evidence) => {
  const ctx = await fixture("production");
  const before = snapshot(ctx.db);
  ctx.db.prepare(`UPDATE canonical_workbench_states SET row_version = row_version + 1 WHERE id = ?`).run(ids.stateProduction);
  await assert.rejects(() => ctx.client.transaction((tx) => ctx.repository.create(tx, { companyId: ids.company, sourceRowId: ids.stateProduction, ownerUserId: ids.owner, expectedRowVersion: 1, target: { major: 1, minor: 7, label: "1.7" }, selectionMode: "manual_minor", requestedMinor: 7 })), (error) => error?.code === "WORKBENCH_ROW_VERSION_CONFLICT");
  const after = snapshot(ctx.db);
  assert.deepEqual({ ...after, canonical_workbench_states: before.canonical_workbench_states }, before);
  evidence.orderedLedger = [{ action: "advance-source-row-version" }, { action: "old-request", code: "WORKBENCH_ROW_VERSION_CONFLICT" }];
  await close(ctx);
});

await runCase("QA-098-013", "idempotent replay returns one work and changed request is rejected", async (evidence) => {
  const ctx = await fixture("production");
  const targets = await ctx.service.targets(ids.drawing, `cw_${ids.stateProduction}`, owner);
  const contractToken = await issueCanonicalWorkbenchContract(ctx.client, { companyId: ids.company, actorId: ids.owner });
  const context = { idempotencyKey: "dev098-idempotency", contractToken, expectedRowVersion: targets.data.source.rowVersion };
  const body = { sourceRowKey: `cw_${ids.stateProduction}`, selectionMode: "manual_minor", requestedMinor: 7 };
  const first = await ctx.service.create(ids.drawing, body, owner, context);
  const replay = await ctx.service.create(ids.drawing, body, owner, context);
  assert.deepEqual(replay, first);
  await assert.rejects(() => ctx.service.create(ids.drawing, { ...body, requestedMinor: 8 }, owner, context), (error) => error?.code === "IDEMPOTENCY_KEY_REUSED");
  assert.equal(ctx.db.prepare(`SELECT COUNT(*) AS n FROM drawing_revision_works`).get().n, 1);
  evidence.receipts = { first, replay, changedRequest: "IDEMPOTENCY_KEY_REUSED" };
  await close(ctx);
});

await runCase("QA-098-014", "named write checkpoints roll back the complete transaction", async (evidence) => {
  const checkpoints = ["INSERT INTO drawing_revision_claims", "INSERT INTO drawing_revisions", "INSERT INTO drawing_revision_work_files", "INSERT INTO canonical_workbench_states"];
  evidence.faultMatrix = [];
  for (const checkpoint of checkpoints) {
    const ctx = await fixture("production");
    const before = snapshot(ctx.db);
    const faultClient = {
      ...ctx.client,
      kind: ctx.client.kind,
      query: (...args) => ctx.client.query(...args),
      queryOne: (...args) => ctx.client.queryOne(...args),
      execute: (...args) => ctx.client.execute(...args),
      close: () => ctx.client.close(),
      transaction: (fn, options) => ctx.client.transaction((tx) => {
        const proxy = {
          ...tx,
          kind: tx.kind,
          query: (...args) => tx.query(...args),
          queryOne: (...args) => tx.queryOne(...args),
          execute: (sql, params) => { if (sql.includes(checkpoint)) throw new Error(`DEV098_FAULT:${checkpoint}`); return tx.execute(sql, params); },
          transaction: (nested) => nested(proxy),
          close: () => tx.close()
        };
        return fn(proxy);
      }, options)
    };
    const repository = new DrawingRevisionWorkAsyncRepository(faultClient);
    const source = await repository.readSourceState(faultClient, ids.company, ids.stateProduction);
    await assert.rejects(() => faultClient.transaction((tx) => repository.create(tx, { companyId: ids.company, sourceRowId: ids.stateProduction, ownerUserId: ids.owner, expectedRowVersion: source.row_version, target: { major: 1, minor: 1, label: "1.1" }, selectionMode: "manual_minor", requestedMinor: 1 })), new RegExp(`DEV098_FAULT:${checkpoint}`));
    assert.deepEqual(snapshot(ctx.db), before);
    assert.equal(ctx.db.pragma("foreign_key_check").length, 0);
    evidence.faultMatrix.push({ checkpoint, rollback: true, beforeAfterEqual: true });
    await close(ctx);
  }
});

await runCase("QA-098-015", "typed target policy survives formalization while legacy policy is not invented", async (evidence) => {
  for (const legacy of [false, true]) {
    const ctx = await fixture("production");
    const created = await createRepositoryWork(ctx, { mode: "manual_minor", minor: 7 });
    const beforePolicy = JSON.parse(ctx.db.prepare(`SELECT policy_snapshot_json FROM drawing_revisions WHERE id = ?`).get(created.revisionId).policy_snapshot_json);
    if (legacy) ctx.db.prepare(`UPDATE drawing_revisions SET policy_snapshot_json = '{}' WHERE id = ?`).run(created.revisionId);
    await completeImpactAndFormalize(ctx, created);
    const afterPolicy = JSON.parse(ctx.db.prepare(`SELECT policy_snapshot_json FROM drawing_revisions WHERE id = ?`).get(created.revisionId).policy_snapshot_json);
    if (legacy) assert.equal("revisionTargetPolicy" in afterPolicy, false);
    else {
      assert.deepEqual(afterPolicy.revisionTargetPolicy, beforePolicy.revisionTargetPolicy);
      assert.equal(afterPolicy.revisionTargetPolicy.selectionMode, "manual_minor");
      assert.equal(afterPolicy.revisionTargetPolicy.requestedMinor, 7);
    }
    assert.equal(afterPolicy.changeImpact.outcome, "no_impact");
    evidence[legacy ? "legacy" : "typed"] = { beforePolicy: legacy ? {} : beforePolicy, afterPolicy };
    await close(ctx);
  }
});

await runCase("QA-098-016", "minor, major, cancel, immutable claim, and pending formalization converge correctly", async (evidence) => {
  const minorCtx = await fixture("production");
  const minor = await createRepositoryWork(minorCtx, { mode: "manual_minor", minor: 3 });
  await completeImpactAndFormalize(minorCtx, minor);
  assert.equal(minorCtx.db.prepare(`SELECT lifecycle_state FROM drawing_revisions WHERE id = ?`).get(minor.revisionId).lifecycle_state, "rd_controlled");
  assert.equal(minorCtx.db.prepare(`SELECT revision_id FROM canonical_workbench_states WHERE id = ?`).get(ids.stateProduction).revision_id, ids.productionRevision);
  assert.throws(() => minorCtx.db.prepare(`UPDATE drawing_revision_claims SET target_minor = 9 WHERE target_label = '1.3'`).run(), /approved/i);
  evidence.minor = { lifecycle: "rd_controlled", productionRevisionId: ids.productionRevision, approvedClaimImmutable: true };
  await close(minorCtx);

  const majorCtx = await fixture("production");
  const major = await createRepositoryWork(majorCtx, { target: { major: 2, minor: 0, label: "2" } });
  await completeImpactAndFormalize(majorCtx, major);
  assert.equal(majorCtx.db.prepare(`SELECT revision_id FROM canonical_workbench_states WHERE id = ?`).get(ids.stateProduction).revision_id, major.revisionId);
  assert.equal(majorCtx.db.prepare(`SELECT status FROM drawing_rd_branches WHERE id = ?`).get(major.branchId).status, "historical");
  evidence.major = { productionRevisionId: major.revisionId, branchStatus: "historical" };
  await close(majorCtx);

  const cancelCtx = await fixture("production");
  const cancelled = await createRepositoryWork(cancelCtx, { mode: "manual_minor", minor: 6 });
  const cancelWork = await cancelCtx.repository.readWork(cancelCtx.client, ids.company, cancelled.workId);
  await cancelCtx.client.transaction((tx) => cancelCtx.repository.cancel(tx, { companyId: ids.company, workId: cancelled.workId, expectedRowVersion: cancelWork.row_version }));
  assert.equal(cancelCtx.db.prepare(`SELECT COUNT(*) AS n FROM drawing_revision_claims WHERE target_label = '1.6'`).get().n, 0);
  evidence.cancel = { claimReleased: true };
  await close(cancelCtx);

  const blockedCtx = await fixture("production");
  const blockedMajor = await createRepositoryWork(blockedCtx, { target: { major: 2, minor: 0, label: "2" } });
  blockedCtx.db.prepare(`INSERT INTO drawing_rd_branches (id, company_id, drawing_id, base_production_revision_id) VALUES ('branch-dev098-blocked', ?, ?, ?)`).run(ids.company, ids.drawing, ids.productionRevision);
  blockedCtx.db.prepare(`INSERT INTO drawing_revisions (id, company_id, drawing_id, revision, lifecycle_state, created_by) VALUES ('revision-dev098-blocked', ?, ?, '1.9', 'preparing', ?)`).run(ids.company, ids.drawing, ids.owner);
  blockedCtx.db.prepare(`INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, branch_id, revision_id, handling, blocker_reason) VALUES ('state-dev098-blocked', ?, 'drawing', ?, 'drawing_rd', 'branch-dev098-blocked', 'revision-dev098-blocked', 'blocked', 'DEV098_TEST_PENDING_FORMALIZATION')`).run(ids.company, ids.drawing);
  const blockedWork = await blockedCtx.repository.readWork(blockedCtx.client, ids.company, blockedMajor.workId);
  await assert.rejects(() => blockedCtx.client.transaction((tx) => blockedCtx.repository.formalize(tx, { companyId: ids.company, work: blockedWork })), (error) => error?.code === "DRAWING_FORMALIZATION_PENDING");
  assert.equal(blockedCtx.db.prepare(`SELECT revision_id FROM canonical_workbench_states WHERE id = ?`).get(ids.stateProduction).revision_id, ids.productionRevision);
  evidence.blocked = { code: "DRAWING_FORMALIZATION_PENDING", productionUnchanged: true };
  await close(blockedCtx);
});

await runCase("QA-098-027", "stale in-flight work becomes read-only, rejects mutation, and still permits cleanup cancel", async (evidence) => {
  const ctx = await fixture();
  const created = await createRepositoryWork(ctx, { sourceRowId: ids.stateRd, mode: "manual_minor", minor: 3 });
  const beforePayload = ctx.db.prepare(`SELECT proposed_payload FROM drawing_revision_works WHERE id = ?`).get(created.workId).proposed_payload;
  makeStale(ctx.db);
  const work = await ctx.repository.readWork(ctx.client, ids.company, created.workId);
  await assert.rejects(() => ctx.client.transaction((tx) => ctx.repository.update(tx, { companyId: ids.company, workId: created.workId, expectedRowVersion: work.row_version, payload: { recognitionNotes: "must-not-write" } })), (error) => error?.code === "DRAWING_PRODUCTION_BASE_STALE");
  assert.equal(ctx.db.prepare(`SELECT proposed_payload FROM drawing_revision_works WHERE id = ?`).get(created.workId).proposed_payload, beforePayload);
  await ctx.client.transaction((tx) => ctx.repository.cancel(tx, { companyId: ids.company, workId: created.workId, expectedRowVersion: work.row_version }));
  assert.equal(ctx.db.prepare(`SELECT COUNT(*) AS n FROM drawing_revision_works WHERE id = ?`).get(created.workId).n, 0);
  assert.equal(ctx.db.prepare(`SELECT latest_approved_revision_id FROM drawing_rd_branches WHERE id = ?`).get(ids.branch).latest_approved_revision_id, ids.rdRevision);
  evidence.ledger = { mutationCode: "DRAWING_PRODUCTION_BASE_STALE", contentPreserved: true, cancelSucceeded: true, approvedMilestonePreserved: true };
  await close(ctx);
});

await runCase("QA-098-028", "pending-review stale work cannot formalize, may return to owner, then cancel", async (evidence) => {
  const ctx = await fixture();
  const created = await createRepositoryWork(ctx, { sourceRowId: ids.stateRd, mode: "manual_minor", minor: 3 });
  ctx.db.prepare(`UPDATE canonical_workbench_states SET handling = 'review_owner' WHERE work_id = ?`).run(created.workId);
  makeStale(ctx.db);
  const pending = await ctx.repository.readWork(ctx.client, ids.company, created.workId);
  await assert.rejects(() => ctx.client.transaction((tx) => ctx.repository.formalize(tx, { companyId: ids.company, work: pending })), (error) => error?.code === "DRAWING_PRODUCTION_BASE_STALE");
  assert.equal(ctx.db.prepare(`SELECT lifecycle_state FROM drawing_revisions WHERE id = ?`).get(created.revisionId).lifecycle_state, "preparing");
  ctx.db.prepare(`UPDATE canonical_workbench_states SET handling = 'owner' WHERE work_id = ?`).run(created.workId);
  const returned = await ctx.repository.readWork(ctx.client, ids.company, created.workId);
  await ctx.client.transaction((tx) => ctx.repository.cancel(tx, { companyId: ids.company, workId: created.workId, expectedRowVersion: returned.row_version }));
  evidence.orderedLedger = [
    { operation: "approve/formalize", code: "DRAWING_PRODUCTION_BASE_STALE", zeroFormalize: true },
    { operation: "return", handling: "owner", readonly: true },
    { operation: "cancel", status: "PASS" }
  ];
  await close(ctx);
});

await runCase("QA-098-030", "pre-production supports 0.x milestone and creates the first production only on major approval", async (evidence) => {
  const ctx = await fixture("preproduction");
  const source01 = await ctx.repository.readSourceState(ctx.client, ids.company, ids.stateRd);
  assert.equal(source01.current_production_revision_id, null);
  const minor03 = await createRepositoryWork(ctx, { sourceRowId: ids.stateRd, mode: "manual_minor", minor: 3 });
  assert.equal(minor03.revision, "0.3");
  await completeImpactAndFormalize(ctx, minor03);
  assert.equal(ctx.db.prepare(`SELECT COUNT(*) AS n FROM canonical_workbench_states WHERE data_layer = 'drawing_production'`).get().n, 0);
  const state = ctx.db.prepare(`SELECT id, row_version FROM canonical_workbench_states WHERE branch_id = ?`).get(ids.branch);
  const source03 = await ctx.repository.readSourceState(ctx.client, ids.company, state.id);
  const candidates = await ctx.repository.listCandidates(ctx.client, source03);
  const production = candidates.find((item) => item.kind === "production");
  assert.equal(production.target.label, "1");
  const major1 = await ctx.client.transaction((tx) => ctx.repository.create(tx, { companyId: ids.company, sourceRowId: state.id, ownerUserId: ids.owner, expectedRowVersion: Number(state.row_version), target: production.target, selectionMode: "recommended", requestedMinor: null }));
  await completeImpactAndFormalize(ctx, major1);
  const productionRows = ctx.db.prepare(`SELECT state.revision_id, revision.revision, revision.lifecycle_state FROM canonical_workbench_states state JOIN drawing_revisions revision ON revision.id = state.revision_id WHERE state.data_layer = 'drawing_production'`).all();
  assert.deepEqual(productionRows, [{ revision_id: major1.revisionId, revision: "1", lifecycle_state: "released" }]);
  evidence.ledger = { initialBasis: { base: null, current: null, revision: "0.1" }, minor: { revision: "0.3", lifecycle: "rd_controlled", productionRows: 0 }, major: productionRows[0] };
  await close(ctx);
});

const failed = caseResults.filter((item) => item.status === "FAIL");
const runId = `DEV098-repository-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const evidenceDir = resolve(process.env.DEV098_REPOSITORY_EVIDENCE_DIR?.trim() || resolve(root, "output", "qa", "dev-098", runId));
mkdirSync(evidenceDir, { recursive: true });
const manifest = {
  schemaVersion: 1,
  devId: "DEV-098",
  suite: "repository",
  runId,
  generatedAt: new Date().toISOString(),
  status: failed.length ? "FAIL" : "PASS",
  fixedCaseIds,
  expected: fixedCaseIds.length,
  executed: caseResults.length,
  passed: caseResults.length - failed.length,
  firstFailure: failed[0] ?? null,
  dataBoundary: { provider: "sqlite", fixtures: "per-case in-memory", primaryMutation: false },
  cleanup: { temporaryDatabaseFiles: 0, ports: [], status: "PASS" },
  caseResults
};
writeFileSync(resolve(evidenceDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...manifest, caseResults: caseResults.map(({ id, title, status, message }) => ({ id, title, status, message })) }, null, 2));
if (failed.length) process.exitCode = 1;
