#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev067-query-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  PDM_DATA_DIR: fixtureRoot,
  PDM_REPOSITORY_DIR: path.join(fixtureRoot, "repository"),
  PDM_DB_PROVIDER: "sqlite",
  PDM_NUMBER_STATE_FLOW_V1: "true",
  PDM_NUMBER_LIFECYCLE_V2: "true",
  PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
  PDM_UNIFIED_PART_RELATION_WORKBENCH_V1: "true",
  PDM_UNIFIED_ENTITY_DETAIL_V1: "true",
  PDM_AUTH_SECRET: "dev067-query-secret"
});

let database;
try {
  const [{ getDb }, provider, detailModule, unifiedModule] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db-async-provider"),
    import("@/lib/pdm-entity-detail"),
    import("@/lib/repositories/unified-drawing-async-repository")
  ]);
  database = getDb();
  const baseClient = provider.createAsyncDatabaseClient({ kind: "sqlite", database });
  const now = "2026-08-12T08:00:00.000Z";
  const runId = crypto.randomUUID();
  const run = (sql, ...params) => database.prepare(sql).run(...params);

  run(`INSERT INTO users (id, display_name, email, role, company_id, account_status, system_role_enabled, created_at, updated_at)
       VALUES (?, ?, ?, 'R&D Manager', 'company-jenfu', 'active', 1, ?, ?)`, "dev067-query-user", "DEV-067 Query", "dev067-query@example.invalid", now, now);
  run(`INSERT INTO user_company_memberships (user_id, company_id, is_default, created_at) VALUES (?, 'company-jenfu', 1, ?)`, "dev067-query-user", now);
  run(`INSERT INTO numbering_draft_workspaces (id, company_id, draft_mode, lifecycle_status, owner_id, created_by, row_version, created_at, updated_at)
       VALUES ('dev067-query-workspace', 'company-jenfu', 'new_bundle', 'active', 'dev067-query-user', 'dev067-query-user', 1, ?, ?)`, now, now);
  run(`INSERT INTO numbering_draft_roots (id, company_id, workspace_id, core_name, item_kind, rule_version_id, created_at, updated_at)
       VALUES ('dev067-query-draft-root', 'company-jenfu', 'dev067-query-workspace', 'Query Fixture', 'manufactured', 'numbering-rule-v3-alpha-root', ?, ?)`, now, now);
  run(`INSERT INTO numbering_draft_drawings (id, company_id, workspace_id, root_draft_id, purpose_code, purpose_description, is_primary_manufacturing, created_at, updated_at)
       VALUES ('dev067-query-draft-drawing', 'company-jenfu', 'dev067-query-workspace', 'dev067-query-draft-root', 'M', 'Query Fixture', 1, ?, ?)`, now, now);
  run(`INSERT INTO number_candidate_reservations (id, company_id, workspace_id, draft_item_type, draft_item_id, candidate_code, sequence_scope_key, sequence_no, reservation_state, row_version, created_by, created_at, updated_at)
       VALUES ('dev067-query-reservation', 'company-jenfu', 'dev067-query-workspace', 'drawing', 'dev067-query-draft-drawing', 'A0067-M01', 'dev067:drawings', 1, 'active', 1, 'dev067-query-user', ?, ?)`, now, now);
  run("UPDATE numbering_draft_drawings SET candidate_reservation_id = 'dev067-query-reservation' WHERE id = 'dev067-query-draft-drawing'");
  run(`INSERT INTO numbering_candidate_revision_drafts (id, company_id, workspace_id, drawing_draft_id, candidate_reservation_id, revision, policy_snapshot_json, lifecycle_status, row_version, created_by, created_at, updated_by, updated_at)
       VALUES ('dev067-query-revision', 'company-jenfu', 'dev067-query-workspace', 'dev067-query-draft-drawing', 'dev067-query-reservation', '0.1', '{}', 'draft', 1, 'dev067-query-user', ?, 'dev067-query-user', ?)`, now, now);
  run(`INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, record_status, created_by, created_at, updated_at)
       VALUES ('dev067-query-root', 'company-jenfu', 'A0067', 'Query Fixture', 'manufactured', 'Active', 'dev067-query-user', ?, ?)`, now, now);
  run(`INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, series_code, record_status, created_by, created_at, updated_at)
       VALUES ('dev067-query-part', 'company-jenfu', 'dev067-query-root', 'A0067-P01', 1, '01', 'Query Fixture', 'manufactured', 'JF', 'Active', 'dev067-query-user', ?, ?)`, now, now);
  run(`INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing, record_status, created_by, created_at, updated_at)
       VALUES ('dev067-query-drawing', 'company-jenfu', 'dev067-query-root', 'A0067-M01', 'M', 'Query Fixture', 1, 1, 'Active', 'dev067-query-user', ?, ?)`, now, now);
  run(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
       VALUES ('dev067-query-link', 'dev067-query-drawing', 'dev067-query-part', 'primary_manufacturing', 'dev067-query-user', ?)`, now);

  const unified = new unifiedModule.UnifiedDrawingAsyncRepository(baseClient);
  await unified.synchronizeWorkspace({ workspaceId: "dev067-query-workspace", companyId: "company-jenfu" });

  const countReads = (client, metrics = { count: 0 }) => {
    return {
      kind: client.kind,
      query: (...args) => { metrics.count += 1; return client.query(...args); },
      queryOne: (...args) => { metrics.count += 1; return client.queryOne(...args); },
      execute: (...args) => client.execute(...args),
      transaction: (fn) => client.transaction((transactionClient) => fn(countReads(transactionClient, metrics))),
      close: (...args) => client.close(...args),
      readCount: () => metrics.count
    };
  };

  async function measure(entityKey, surface) {
    const counted = countReads(baseClient);
    const service = new detailModule.PdmEntityDetailService(counted);
    const response = await service.read({ entityKey, surface, companyId: "company-jenfu", actorId: "dev067-query-user" });
    return { response, count: counted.readCount() };
  }

  const candidate = await measure("candidate:dev067-query-workspace", "drawing");
  const drawing = await measure("drawing:drawing-dev067-query-draft-drawing", "drawing");
  const part = await measure("part:dev067-query-part", "part");
  const relation = await measure("root:dev067-query-root", "relation");
  assert.ok(candidate.response.projections.drawing, "candidate Drawing projection exists");
  assert.ok(drawing.response.projections.drawing, "formal Drawing projection exists");
  assert.ok(part.response.projections.part, "Part projection exists");
  assert.ok(relation.response.projections.relation, "Relation projection exists");
  assert.ok(candidate.count <= 16, `candidate Drawing detail query budget exceeded: ${candidate.count}`);
  assert.ok(drawing.count <= 16, `formal Drawing detail query budget exceeded: ${drawing.count}`);
  assert.ok(part.count <= 16, `Part detail query budget exceeded: ${part.count}`);
  assert.ok(relation.count <= 24, `Relation detail query budget exceeded: ${relation.count}`);

  for (let index = 2; index <= 20; index += 1) {
    const suffix = String(index).padStart(2, "0");
    run(`INSERT INTO numbering_draft_parts (id, company_id, workspace_id, root_draft_id, part_name, item_kind, series_code, created_at, updated_at)
         VALUES (?, 'company-jenfu', 'dev067-query-workspace', 'dev067-query-draft-root', ?, 'manufactured', 'JF', ?, ?)`, `dev067-query-draft-part-${suffix}`, `Query Part ${suffix}`, now, now);
    run(`INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, series_code, record_status, created_by, created_at, updated_at)
         VALUES (?, 'company-jenfu', 'dev067-query-root', ?, ?, ?, ?, 'manufactured', 'JF', 'Active', 'dev067-query-user', ?, ?)`, `dev067-query-part-${suffix}`, `A0067-P${suffix}`, index, suffix, `Query Part ${suffix}`, now, now);
    run(`INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing, record_status, created_by, created_at, updated_at)
         VALUES (?, 'company-jenfu', 'dev067-query-root', ?, 'R', 'Query Fixture', ?, 0, 'Active', 'dev067-query-user', ?, ?)`, `dev067-query-drawing-${suffix}`, `A0067-R${suffix}`, index, now, now);
    run(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
         VALUES (?, ?, ?, 'reference', 'dev067-query-user', ?)`, `dev067-query-link-${suffix}`, `dev067-query-drawing-${suffix}`, `dev067-query-part-${suffix}`, now);
  }
  const expandedCandidate = await measure("candidate:dev067-query-workspace", "drawing");
  const expandedDrawing = await measure("drawing:drawing-dev067-query-draft-drawing", "drawing");
  const expandedPart = await measure("part:dev067-query-part", "part");
  const expandedRelation = await measure("root:dev067-query-root", "relation");
  assert.equal(expandedCandidate.count, candidate.count, "candidate query count must not grow from 1 to 20 children");
  assert.equal(expandedDrawing.count, drawing.count, "Drawing query count must not grow from 1 to 20 linked Parts");
  assert.equal(expandedPart.count, part.count, "Part query count must not grow from 1 to 20 linked Drawings");
  assert.equal(expandedRelation.count, relation.count, "Relation query count must not grow from 1 to 20 nodes");

  const result = {
    suite: "DEV-067 unified entity detail query budget",
    runId,
    passed: true,
    budgets: {
      drawingOwner: { budget: 16, baseline: candidate.count, representative: expandedCandidate.count },
      formalDrawingOwner: { budget: 16, baseline: drawing.count, representative: expandedDrawing.count },
      partOwner: { budget: 16, baseline: part.count, representative: expandedPart.count },
      relationOwner: { budget: 24, baseline: relation.count, representative: expandedRelation.count }
    },
    fixture: { baselineChildren: 1, representativeChildren: 20, relationNodes: 20 }
  };
  if (process.env.DEV067_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.DEV067_EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.DEV067_EVIDENCE_DIR, "query-budget.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  console.log(`QC DEV-067 query budget: PASS (candidate/formal-drawing/part/relation=${candidate.count}/${drawing.count}/${part.count}/${relation.count})`);
} finally {
  try { await database?.close?.(); } catch {}
  const resolved = path.resolve(fixtureRoot);
  if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(resolved, { recursive: true, force: true });
}
