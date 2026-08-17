#!/usr/bin/env node

import assert from "node:assert/strict";

const { lockPdmEntityScopeAsync, lockPdmDraftWorkspaceScopeAsync, assertPdmEntityWriteAllowedAsync, PdmReviewLockError } = await import("@/lib/pdm-review-lock");

function fakeClient({ activeTarget = null, activeReservation = null } = {}) {
  const calls = [];
  return {
    kind: "postgres",
    calls,
    async query(sql) { calls.push({ method: "query", sql }); return []; },
    async queryOne(sql, params) {
      calls.push({ method: "queryOne", sql, params });
      if (sql.includes("approval_platform_targets")) return activeTarget;
      if (sql.includes("number_candidate_reservations") && sql.includes("reservation_state")) return activeReservation;
      return { id: "locked" };
    },
    async execute(sql) { calls.push({ method: "execute", sql }); },
    async transaction(fn) { return fn(this); },
    async close() {}
  };
}

const entityClient = fakeClient();
await lockPdmEntityScopeAsync(entityClient, [
  { type: "relation", id: "rel-2", companyId: "company-jenfu" },
  { type: "part_number", id: "part-2", companyId: "company-jenfu" },
  { type: "workspace", id: "workspace-2", companyId: "company-jenfu" },
  { type: "drawing_number", id: "drawing-2", companyId: "company-jenfu" },
  { type: "part_root", id: "root-2", companyId: "company-jenfu" }
]);
const entityLocks = entityClient.calls.filter((call) => call.method === "queryOne" && call.sql.includes("FOR UPDATE"));
assert.deepEqual(
  entityLocks.map((call) => call.sql.match(/FROM ([a-z_]+)/u)?.[1]),
  ["numbering_draft_workspaces", "part_roots", "drawing_numbers", "part_numbers", "numbering_draft_relations"],
  "canonical lock order is workspace -> root -> drawing -> part -> relation"
);

const workspaceClient = fakeClient();
await lockPdmDraftWorkspaceScopeAsync(workspaceClient, { companyId: "company-jenfu", workspaceId: "workspace-1" });
const workspaceLocks = workspaceClient.calls.filter((call) => call.sql.includes("FOR UPDATE"));
assert.equal(workspaceLocks.length, 7, "workspace scope locks all seven canonical families");
assert.deepEqual(
  workspaceLocks.map((call) => call.sql.match(/FROM ([a-z_]+)/u)?.[1]),
  ["numbering_draft_workspaces", "numbering_draft_roots", "numbering_draft_drawings", "numbering_draft_parts", "numbering_candidate_revision_drafts", "number_candidate_reservations", "numbering_draft_relations"]
);

const deniedClient = fakeClient({ activeTarget: { id: "target-1" } });
await assert.rejects(
  () => assertPdmEntityWriteAllowedAsync(deniedClient, {
    companyId: "company-jenfu",
    targetIds: ["part-1"],
    targetRefs: [{ type: "part_number", id: "part-1" }]
  }),
  (error) => error instanceof PdmReviewLockError && error.status === 409
);

console.log("QC DEV-067 review lock: PASS (canonical order, workspace scope order, active review write rejection)");
