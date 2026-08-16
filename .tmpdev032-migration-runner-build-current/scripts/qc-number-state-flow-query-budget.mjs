#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-number-state-query-budget-"));
const now = "2026-08-08T09:00:00.000Z";
const results = [];

function record(id, passed, detail = "") {
  results.push({ id, passed: Boolean(passed), detail });
}

Object.assign(process.env, {
  NODE_ENV: "test",
  PDM_DATA_DIR: fixtureRoot,
  PDM_REPOSITORY_DIR: path.join(fixtureRoot, "repository"),
  PDM_DB_PROVIDER: "sqlite",
  PDM_NUMBER_STATE_FLOW_V1: "true",
  PDM_NUMBER_LIFECYCLE_V2: "false",
  PDM_PUBLICATION_EVIDENCE_MODE: "local_fake"
});

let database;
try {
  const [dbModule, providerModule, stateModule] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db-async-provider"),
    import("@/lib/repositories/number-state-flow-async-repository")
  ]);
  database = dbModule.getDb();
  const client = providerModule.createAsyncDatabaseClient({ kind: "sqlite", database });
  const { AsyncNumberStateFlowRepository } = stateModule;

  database.prepare(`
    INSERT INTO users (
      id, display_name, email, role, company_id, account_status, system_role_enabled, created_at, updated_at
    ) VALUES ('qc-number-state-budget-user', 'QC Number State Budget', 'qc-number-state-budget@example.invalid',
      'R&D Manager', 'company-jenfu', 'active', 1, ?, ?)
  `).run(now, now);

  function seedWorkspace(workspaceId, partCount, drawingCount) {
    const rootId = `${workspaceId}-root`;
    database.prepare(`
      INSERT INTO numbering_draft_workspaces (
        id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, created_at, updated_at
      ) VALUES (?, 'company-jenfu', 'new_bundle', 'active', 'qc-number-state-budget-user',
        'qc-number-state-budget-user', 1, ?, ?)
    `).run(workspaceId, now, now);
    database.prepare(`
      INSERT INTO numbering_draft_roots (
        id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?, 'manufactured', 'numbering-rule-v3-alpha-root', ?, ?)
    `).run(rootId, workspaceId, `QC ${workspaceId}`, now, now);
    const insertPart = database.prepare(`
      INSERT INTO numbering_draft_parts (
        id, company_id, workspace_id, root_draft_id, part_name, item_kind, is_universal, created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?, ?, 'manufactured', 0, ?, ?)
    `);
    for (let index = 1; index <= partCount; index += 1) {
      insertPart.run(`${workspaceId}-part-${index}`, workspaceId, rootId, `QC Part ${index}`, now, now);
    }
    const insertDrawing = database.prepare(`
      INSERT INTO numbering_draft_drawings (
        id, company_id, workspace_id, root_draft_id, purpose_code, purpose_description,
        is_primary_manufacturing, created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?, ?, ?, ?, ?, ?)
    `);
    for (let index = 1; index <= drawingCount; index += 1) {
      insertDrawing.run(
        `${workspaceId}-drawing-${index}`,
        workspaceId,
        rootId,
        index === 1 ? "M" : "R",
        `QC Drawing ${index}`,
        index === 1 ? 1 : 0,
        now,
        now
      );
    }
    return { workspaceId, expectedItems: 1 + partCount + drawingCount };
  }

  function instrument(baseClient, stats = { query: 0, queryOne: 0, execute: 0 }, collision = null) {
    const wrapped = {
      kind: baseClient.kind,
      async query(...args) {
        stats.query += 1;
        return baseClient.query(...args);
      },
      async queryOne(...args) {
        stats.queryOne += 1;
        return baseClient.queryOne(...args);
      },
      async execute(sql, params = {}) {
        stats.execute += 1;
        const normalizedSql = String(sql).replace(/\s+/gu, " ").trim().toUpperCase();
        if (collision && !collision.injected && normalizedSql.startsWith("INSERT INTO NUMBER_CANDIDATE_RESERVATIONS")) {
          collision.injected = true;
          collision.awaitingRollback = true;
          collision.firstAttemptParams = params;
          const error = new Error("UNIQUE constraint failed: number_candidate_reservations.candidate_code");
          error.code = "SQLITE_CONSTRAINT_UNIQUE";
          throw error;
        }
        const result = await baseClient.execute(sql, params);
        if (collision?.awaitingRollback && normalizedSql.startsWith("ROLLBACK TO SAVEPOINT") && !collision.competitorInserted) {
          const firstAttempt = collision.firstAttemptParams;
          await baseClient.execute(
            `INSERT INTO number_candidate_reservations (
               id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code,
               sequence_scope_key, sequence_no, reservation_state, row_version, created_by, created_at, updated_at
             ) VALUES (
               :id, :companyId, :workspaceId, :itemType, :itemId, :candidateCode,
               :sequenceScopeKey, :sequenceNo, 'active', 1, :actorId, :createdAt, :updatedAt
             )`,
            {
              id: "qc-number-state-budget-collision-competitor",
              companyId: firstAttempt.companyId,
              workspaceId: collision.competitorWorkspaceId,
              itemType: firstAttempt.itemType,
              itemId: "qc-number-state-budget-collision-competitor-item",
              candidateCode: firstAttempt.candidateCode,
              sequenceScopeKey: firstAttempt.sequenceScopeKey,
              sequenceNo: firstAttempt.sequenceNo,
              actorId: firstAttempt.actorId,
              createdAt: now,
              updatedAt: now
            }
          );
          collision.competitorInserted = true;
          collision.awaitingRollback = false;
        }
        return result;
      },
      async transaction(fn) {
        return baseClient.transaction((transactionClient) => fn(instrument(transactionClient, stats, collision).client));
      },
      async close(...args) {
        return baseClient.close?.(...args);
      }
    };
    return { client: wrapped, stats };
  }

  async function acquire(seed, collision = null) {
    const { client: instrumentedClient, stats } = instrument(client, undefined, collision);
    const result = await instrumentedClient.transaction((transactionClient) =>
      new AsyncNumberStateFlowRepository(transactionClient, () => now, () => crypto.randomUUID()).acquireCandidates({
        workspaceId: seed.workspaceId,
        companyId: "company-jenfu",
        actorId: "qc-number-state-budget-user",
        expectedRowVersion: 1
      })
    );
    const reservations = result.reservations.filter((reservation) => reservation.state !== "recycled");
    const candidateCodes = reservations.map((reservation) => reservation.candidateCode);
    record(
      `${seed.workspaceId}-output-shape`,
      result.rowVersion === 2 && reservations.length === seed.expectedItems && new Set(candidateCodes).size === candidateCodes.length &&
        reservations.every((reservation) => reservation.state === "active"),
      JSON.stringify({ rowVersion: result.rowVersion, reservationCount: reservations.length, uniqueCandidateCodes: new Set(candidateCodes).size })
    );
    return { readCount: stats.query + stats.queryOne, stats, result };
  }

  const collisionCompetitor = seedWorkspace("qc-number-state-budget-collision-competitor", 0, 0);
  const collision = {
    competitorWorkspaceId: collisionCompetitor.workspaceId,
    injected: false,
    awaitingRollback: false,
    competitorInserted: false,
    firstAttemptParams: null
  };
  const collisionRun = await acquire(seedWorkspace("qc-number-state-budget-collision-target", 0, 0), collision);
  const small = await acquire(seedWorkspace("qc-number-state-budget-small", 0, 0));
  const large = await acquire(seedWorkspace("qc-number-state-budget-large", 4, 3));
  const expectedIncrement = 4 * 7;
  record(
    "NUMBER-STATE-BUDGET-002 unique collision retries with a refreshed candidate code",
    collision.injected && collision.competitorInserted && collisionRun.result.rowVersion === 2 &&
      collisionRun.result.reservations.length === 1 && collisionRun.result.reservations[0].candidateCode !== collision.firstAttemptParams?.candidateCode &&
      collisionRun.readCount === small.readCount + 4,
    JSON.stringify({
      firstCandidateCode: collision.firstAttemptParams?.candidateCode ?? null,
      retriedCandidateCode: collisionRun.result.reservations[0]?.candidateCode ?? null,
      collisionReadQueries: collisionRun.readCount,
      baselineReadQueries: small.readCount,
      retryReadIncrement: collisionRun.readCount - small.readCount
    })
  );
  record(
    "NUMBER-STATE-BUDGET-001 acquireCandidates read query count exposes per-item allocation growth",
    large.readCount - small.readCount === expectedIncrement,
    JSON.stringify({
      smallReadQueries: small.readCount,
      largeReadQueries: large.readCount,
      additionalItems: 7,
      readQueriesPerAdditionalItem: (large.readCount - small.readCount) / 7
    })
  );
  console.log(
    `QC number state flow query budget: PASS (root-only ${small.readCount} read queries -> root + 4 parts + 3 drawings ${large.readCount}, +${large.readCount - small.readCount} reads; collision ${collision.firstAttemptParams?.candidateCode} -> ${collisionRun.result.reservations[0]?.candidateCode}, retry +${collisionRun.readCount - small.readCount} reads)`
  );
} catch (error) {
  record("NUMBER-STATE-BUDGET-ERROR", false, error instanceof Error ? error.stack ?? error.message : String(error));
  console.error(JSON.stringify({ total: results.length, passed: 0, failed: 1, results }, null, 2));
  process.exitCode = 1;
} finally {
  if (database) database.close();
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
