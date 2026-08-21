#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EMPTY_PDM_DETAIL_ACTION_CAPABILITIES } from "@/lib/pdm-detail-action-capabilities";
import { resolvePdmDetailActions } from "@/lib/pdm-detail-action-resolver";
import {
  canEditPdmOwnedResource,
  canEditPdmOwnedResourceInCompany,
  hasPdmNonOwnerEditScope
} from "@/lib/pdm-edit-scope-policy";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const allowedCapabilities = Object.fromEntries(
  Object.entries(EMPTY_PDM_DETAIL_ACTION_CAPABILITIES).map(([key, value]) => [key, { ...value, allowed: true }])
);

for (const role of ["Engineer", "engineer", "rd", "R&D Manager", "Admin", "rd_manager", "pdm_admin", "system_admin"]) {
  assert.equal(hasPdmNonOwnerEditScope({ role }), true, `${role} must have non-owner edit scope`);
}
for (const role of ["Manufacturing", "Procurement", "Reviewer", ""]) {
  assert.equal(hasPdmNonOwnerEditScope({ role }), false, `${role || "empty role"} must not have non-owner edit scope`);
}
assert.equal(hasPdmNonOwnerEditScope({ roles: ["engineer", "rd_manager"] }), true);
assert.equal(canEditPdmOwnedResource({ actorId: "owner", ownerId: "owner", canEditNonOwned: false }), true);
assert.equal(canEditPdmOwnedResource({ actorId: "other", ownerId: "owner", canEditNonOwned: false }), false);
assert.equal(canEditPdmOwnedResource({ actorId: "manager", ownerId: "owner", canEditNonOwned: true }), true);
assert.equal(canEditPdmOwnedResourceInCompany({ actorId: "manager", actorCompanyId: "company-a", ownerId: "owner", resourceCompanyId: "company-a", actor: { role: "R&D Manager" } }), true);
assert.equal(canEditPdmOwnedResourceInCompany({ actorId: "admin", actorCompanyId: "company-a", ownerId: "owner", resourceCompanyId: "company-b", actor: { role: "Admin" } }), false);

function facts(overrides = {}) {
  return {
    entityKey: "candidate:dev081-workspace",
    surface: "drawing",
    stateFamily: "bundle_ready",
    actorId: "manager",
    ownerId: "owner",
    canEditNonOwned: true,
    ownerHref: "/numbering/drawings/dev081/workspace",
    returnTo: "/numbering/drawings",
    capabilities: allowedCapabilities,
    readinessBlockers: [],
    candidate: {
      workspaceId: "dev081-workspace",
      rowVersion: 1,
      lifecycleV2: true,
      requestId: null,
      submittedBy: null,
      decisionCount: 0,
      canUpdate: true,
      canCancel: true,
      canSubmitReview: true,
      canWithdrawReview: false,
      applyFailed: false
    },
    formalDrawing: null,
    review: null,
    ...overrides
  };
}
function actions(model) {
  return [model.primary, ...model.secondary].filter(Boolean);
}
function byKind(model, kind) {
  return actions(model).find((action) => action.kind === kind);
}

const manager = resolvePdmDetailActions(facts());
assert.equal(byKind(manager, "edit")?.enabled, true, "manager non-owner edit must be enabled");
assert.equal(byKind(manager, "submit_review")?.enabled, true, "manager non-owner submit must be enabled when ready");
assert.equal(byKind(manager, "cancel")?.enabled, true, "manager non-owner cancel must be enabled");

const engineer = resolvePdmDetailActions(facts({ actorId: "engineer", canEditNonOwned: true }));
assert.equal(byKind(engineer, "edit")?.enabled, true, "engineer non-owner edit must be enabled");
assert.equal(byKind(engineer, "submit_review")?.enabled, true, "engineer non-owner submit must be enabled when ready");
const nonEngineer = resolvePdmDetailActions(facts({ actorId: "procurement", canEditNonOwned: false }));
assert.equal(byKind(nonEngineer, "edit")?.disabledReasonCode, "PDM_ACTION_OWNER_REQUIRED");
assert.equal(byKind(nonEngineer, "submit_review")?.disabledReasonCode, "PDM_ACTION_OWNER_REQUIRED");

const deniedPermission = resolvePdmDetailActions(facts({ capabilities: EMPTY_PDM_DETAIL_ACTION_CAPABILITIES }));
assert.equal(byKind(deniedPermission, "edit")?.disabledReasonCode, "PDM_ACTION_PERMISSION_REQUIRED");

const reviewCandidate = { ...facts().candidate, requestId: "review-081", submittedBy: "owner", canWithdrawReview: true };
const locked = resolvePdmDetailActions(facts({
  stateFamily: "in_review",
  candidate: reviewCandidate,
  review: { requestId: "review-081", decisionReady: false, allowedDecisions: [], drift: false }
}));
assert.equal(byKind(locked, "edit")?.disabledReasonCode, "PDM_ACTION_REVIEW_LOCKED");
assert.equal(byKind(locked, "withdraw_review"), undefined, "drawer review context must not expose owner withdrawal");
const ownerSurfaceReview = resolvePdmDetailActions(facts({ stateFamily: "in_review", candidate: reviewCandidate }));
assert.equal(byKind(ownerSurfaceReview, "withdraw_review")?.enabled, true, "manager may withdraw another submitter's undecided review");
const decidedReview = resolvePdmDetailActions(facts({ stateFamily: "in_review", candidate: { ...reviewCandidate, decisionCount: 1 } }));
assert.equal(byKind(decidedReview, "withdraw_review")?.disabledReasonCode, "PDM_ACTION_REVIEW_SCOPE_REQUIRED", "a decided review remains locked");

for (const file of [
  "src/lib/drawing-workbench.ts",
  "src/lib/part-workbench.ts",
  "src/lib/relation-workbench.ts"
]) {
  const source = read(file);
  assert.match(source, /canEditPdmOwnedResource/u, `${file} must use shared owner override policy`);
  assert.match(source, /canEditNonOwned/u, `${file} must carry the server-derived capability`);
}
for (const file of [
  "src/app/api/numbering/drawings/workbench/route.ts",
  "src/app/api/numbering/drawings/workbench/[rowKey]/route.ts",
  "src/app/api/parts/workbench/route.ts",
  "src/app/api/parts/workbench/[rowKey]/route.ts",
  "src/app/api/numbering/relations/route.ts",
  "src/app/api/numbering/relations/[rowKey]/route.ts",
  "src/app/api/pdm/entity-details/[entityKey]/route.ts"
]) {
  assert.match(read(file), /hasPdmNonOwnerEditScope/u, `${file} must derive capability from authenticated actor role`);
}

const lifecycle = read("src/lib/number-lifecycle-simplification.ts");
assert.match(lifecycle, /assertLifecycleWorkspaceEditScope/u);
for (const name of [
  "createNumberingCandidateRevision",
  "updateNumberingCandidateRevision",
  "addNumberingCandidateRevisionFile",
  "verifyExistingNumberingCandidateRevisionFile",
  "removeNumberingCandidateRevisionFile",
  "submitNumberingCandidateBundleReview"
]) {
  const start = lifecycle.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = lifecycle.indexOf("export async function ", start + 24);
  const body = lifecycle.slice(start, next === -1 ? lifecycle.length : next);
  assert.match(body, /assertLifecycleWorkspaceEditScope\(input\.metadata, workspaceId\)/u, `${name} must enforce server-side owner scope`);
}

const numberState = read("src/lib/number-state-flow.ts");
assert.match(numberState, /canEditPdmOwnedResourceInCompany/u);
assert.match(numberState, /canWithdrawReview:[\s\S]{0,240}workspace\.ownerId === actorId \|\| hasPrivilegedScope\(actor\)/u, "manager/admin withdrawal is projected server-side");
assert.match(read("src/lib/repositories/number-state-flow-async-repository.ts"), /owner_id !== input\.actorId && input\.allowNonOwner !== true/u, "legacy withdrawal enforces explicit supervisor override");
assert.match(read("src/lib/repositories/number-lifecycle-simplification-async-repository.ts"), /owner_id !== input\.actorId && input\.allowNonOwner !== true/u, "bundle withdrawal enforces explicit supervisor override");
assert.match(read("src/lib/repositories/drawing-revision-lifecycle-async-repository.ts"), /submitted_by !== input\.actorId && input\.allowNonSubmitter !== true/u, "formal revision withdrawal enforces explicit supervisor override");
assert.match(read("src/lib/drawing-recognition.ts"), /hasPdmNonOwnerEditScope/u, "OCR must share the same role policy");
assert.match(read("db/schema.sql"), /\('rd_manager', 'numbering\.publish'\)/u, "SQLite authority seeds R&D Manager publication");
assert.match(read("db/postgres/040_supervisor_workflow_authority.sql"), /rd_manager[\s\S]*numbering\.publish/u, "PostgreSQL migration grants R&D Manager publication");

const bom = read("src/lib/bom-create-context.ts");
const permissions = read("src/lib/permissions.ts");
assert.match(bom, /draft\.status !== "Draft" && draft\.status !== "Rejected"/u, "BOM edit remains lifecycle-gated");
assert.match(bom, /return canReadBomDraftRecordAsync\(user, draft\)/u, "BOM edit remains company/read-scope gated");
assert.doesNotMatch(bom, /engineerOwnerClause/u, "BOM owner access must not filter ordinary engineers by creator/submission owner");
assert.match(permissions, /user\.role !== "Engineer" \|\| submission\.submitted_by === user\.id/u, "manager/admin BOM access must not be owner-filtered");

console.log("QC DEV-081 engineer/supervisor/admin non-owner edit scope: PASS");
