#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-number-state-approval-budget-"));
const now = "2026-08-08T09:30:00.000Z";
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
  const actorId = "qc-number-state-approval-budget-user";

  database.prepare(`
    INSERT INTO users (
      id, display_name, email, role, company_id, account_status, system_role_enabled, created_at, updated_at
    ) VALUES (?, 'QC Number State Approval Budget', ?, 'R&D Manager', 'company-jenfu', 'active', 1, ?, ?)
  `).run(actorId, "qc-number-state-approval-budget@example.invalid", now, now);

  function seedWorkspace(workspaceId, partCount, drawingCount) {
    const rootId = `${workspaceId}-root`;
    database.prepare(`
      INSERT INTO numbering_draft_workspaces (
        id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, created_at, updated_at
      ) VALUES (?, 'company-jenfu', 'new_bundle', 'active', ?, ?, 1, ?, ?)
    `).run(workspaceId, actorId, actorId, now, now);
    database.prepare(`
      INSERT INTO numbering_draft_roots (
        id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?, 'manufactured', 'numbering-rule-v3-alpha-root', ?, ?)
    `).run(rootId, workspaceId, `QC Approval ${workspaceId}`, now, now);
    const insertPart = database.prepare(`
      INSERT INTO numbering_draft_parts (
        id, company_id, workspace_id, root_draft_id, part_name, item_kind, is_universal, created_at, updated_at
      ) VALUES (?, 'company-jenfu', ?, ?, ?, 'manufactured', 0, ?, ?)
    `);
    for (let index = 1; index <= partCount; index += 1) {
      insertPart.run(`${workspaceId}-part-${index}`, workspaceId, rootId, `QC Approval Part ${index}`, now, now);
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
        `QC Approval Drawing ${index}`,
        index === 1 ? 1 : 0,
        now,
        now
      );
    }
    return { workspaceId, partCount, drawingCount, expectedItems: 1 + partCount + drawingCount };
  }

  function classify(sql) {
    const normalized = String(sql).replace(/\s+/gu, " ").trim().toUpperCase();
    if (normalized.startsWith("INSERT INTO APPROVAL_PLATFORM_TARGETS")) return "target_insert";
    if (normalized.startsWith("INSERT INTO NUMBER_CANDIDATE_EVENTS")) return "candidate_event_insert";
    if (normalized.startsWith("INSERT INTO APPROVAL_PLATFORM_IMPACT_SNAPSHOTS")) return "impact_snapshot_insert";
    if (normalized.startsWith("INSERT INTO APPROVAL_PLATFORM_EVENTS")) return "approval_event_insert";
    if (normalized.startsWith("INSERT INTO AUDIT_LOGS")) return "audit_insert";
    if (normalized.startsWith("INSERT INTO APPROVAL_PLATFORM_REQUESTS")) return "approval_request_insert";
    if (normalized.startsWith("UPDATE APPROVAL_PLATFORM_REQUESTS")) return "request_update";
    return "other_execute";
  }

  function instrument(baseClient, stats) {
    return {
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
        stats.trace.push(classify(sql));
        return baseClient.execute(sql, params);
      },
      async close(...args) {
        return baseClient.close?.(...args);
      }
    };
  }

  async function acquire(workspaceId) {
    return client.transaction((transactionClient) =>
      new AsyncNumberStateFlowRepository(transactionClient, () => now, () => crypto.randomUUID()).acquireCandidates({
        workspaceId,
        companyId: "company-jenfu",
        actorId,
        expectedRowVersion: 1
      })
    );
  }

  async function submit(seed) {
    const stats = { query: 0, queryOne: 0, execute: 0, trace: [] };
    const result = await client.transaction((transactionClient) =>
      new AsyncNumberStateFlowRepository(instrument(transactionClient, stats), () => now, () => crypto.randomUUID()).submitCandidateReview({
        workspaceId: seed.workspaceId,
        companyId: "company-jenfu",
        actorId,
        expectedRowVersion: 2,
        reason: "QC approval write budget characterization"
      })
    );
    const targetRows = database.prepare(`
      SELECT target_type, target_id, target_status, sort_order
      FROM approval_platform_targets
      WHERE request_id = ?
      ORDER BY sort_order ASC
    `).all(result.requestId);
    const eventRows = database.prepare(`
      SELECT event_type, actor_id
      FROM approval_platform_events
      WHERE request_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(result.requestId);
    const expectedTargetTypes = [
      "numbering_draft_workspace",
      "numbering_draft_root",
      ...Array.from({ length: seed.partCount }, () => "numbering_draft_part"),
      ...Array.from({ length: seed.drawingCount }, () => "numbering_draft_drawing")
    ];
    record(
      `${seed.workspaceId}-output-contract`,
      result.workspace.rowVersion === 2 && result.workspace.latestApproval?.status === "pending" &&
        result.workspace.reservations.length === seed.expectedItems &&
        result.workspace.reservations.every((reservation) => reservation.state === "review_locked") &&
        targetRows.length === seed.expectedItems && targetRows.every((row, index) => row.sort_order === index && row.target_type === expectedTargetTypes[index]) &&
        eventRows.length === 1 && eventRows[0].event_type === "approval_platform.request.submitted",
      JSON.stringify({
        rowVersion: result.workspace.rowVersion,
        reservationCount: result.workspace.reservations.length,
        targetCount: targetRows.length,
        eventTypes: eventRows.map((row) => row.event_type)
      })
    );
    return {
      stats,
      result,
      targetInsertCount: stats.trace.filter((entry) => entry === "target_insert").length,
      candidateEventInsertCount: stats.trace.filter((entry) => entry === "candidate_event_insert").length
    };
  }

  const smallSeed = seedWorkspace("qc-number-state-approval-budget-small", 0, 0);
  const largeSeed = seedWorkspace("qc-number-state-approval-budget-large", 3, 2);
  await acquire(smallSeed.workspaceId);
  await acquire(largeSeed.workspaceId);
  const small = await submit(smallSeed);
  const large = await submit(largeSeed);
  const additionalItems = largeSeed.expectedItems - smallSeed.expectedItems;
  record(
    "APPROVAL-WRITE-BUDGET-001 target/event writes grow linearly with added candidate items",
    large.stats.execute - small.stats.execute === additionalItems * 2 &&
      large.targetInsertCount - small.targetInsertCount === additionalItems &&
      large.candidateEventInsertCount - small.candidateEventInsertCount === additionalItems,
    JSON.stringify({
      smallExecuteCount: small.stats.execute,
      largeExecuteCount: large.stats.execute,
      additionalItems,
      executeIncrementPerItem: (large.stats.execute - small.stats.execute) / additionalItems,
      targetInsertIncrement: large.targetInsertCount - small.targetInsertCount,
      candidateEventInsertIncrement: large.candidateEventInsertCount - small.candidateEventInsertCount
    })
  );
  const largeTrace = large.stats.trace;
  const firstTarget = largeTrace.indexOf("target_insert");
  const impact = largeTrace.indexOf("impact_snapshot_insert");
  const requestUpdate = largeTrace.indexOf("request_update");
  const firstCandidateEvent = largeTrace.indexOf("candidate_event_insert");
  const approvalEvent = largeTrace.indexOf("approval_event_insert");
  const audit = largeTrace.indexOf("audit_insert");
  record(
    "APPROVAL-WRITE-BUDGET-002 existing target/event ordering is characterized",
    firstTarget >= 0 && impact > firstTarget && requestUpdate > impact && firstCandidateEvent > requestUpdate && approvalEvent > firstCandidateEvent && audit > approvalEvent,
    JSON.stringify({ trace: largeTrace })
  );
  console.log(
    `QC number state flow approval write budget: PASS (root-only ${small.stats.execute} writes/${small.targetInsertCount} targets/${small.candidateEventInsertCount} candidate events -> root + 3 parts + 2 drawings ${large.stats.execute} writes/${large.targetInsertCount} targets/${large.candidateEventInsertCount} candidate events; +${large.stats.execute - small.stats.execute} writes, order preserved)`
  );
} catch (error) {
  record("APPROVAL-WRITE-BUDGET-ERROR", false, error instanceof Error ? error.stack ?? error.message : String(error));
  console.error(JSON.stringify({ total: results.length, passed: 0, failed: 1, results }, null, 2));
  process.exitCode = 1;
} finally {
  if (database) database.close();
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
