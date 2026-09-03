#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { canEditPdmOwnedResource, canEditPdmOwnedResourceInCompany, hasPdmNonOwnerEditScope } from "@/lib/pdm-edit-scope-policy";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

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

const policy = read("src/lib/pdm-edit-scope-policy.ts");
assert.match(policy, /PDM_NON_OWNER_EDIT_ROLES/u);
assert.match(policy, /actorCompanyId === input\.resourceCompanyId/u);
assert.match(policy, /actor\.role, \.\.\.\(actor\.roles/u);

const canonicalState = read("src/lib/pdm-canonical-workbench-state.ts");
assert.match(canonicalState, /record\.workOwnerId === actor\.id \|\| actor\.canEditNonOwned/u);
assert.match(canonicalState, /actor\.permissions\.updateWork/u);
assert.match(canonicalState, /record\.entityType === "drawing"/u);
assert.match(canonicalState, /record\.entityType === "part"/u);
assert.match(canonicalState, /record\.entityType === "relation"\) return \[\]/u);

const routeActor = read("src/lib/pdm-dev087-route.ts");
assert.match(routeActor, /canEditNonOwned: hasPdmNonOwnerEditScope\(\{ role: auth\.user\.role \}\)/u);
assert.match(routeActor, /companyId: company\.company\.companyId/u);
assert.match(routeActor, /canEditMatrix: update\.allowed/u);

const numberState = read("src/lib/number-state-flow.ts");
assert.match(numberState, /canEditPdmOwnedResourceInCompany/u);
assert.match(numberState, /hasPdmNonOwnerEditScope/u);
assert.match(numberState, /companyId: input\.actor\.companyId/u);

const lifecycle = read("src/lib/number-lifecycle-simplification.ts");
assert.match(lifecycle, /assertLifecycleWorkspaceEditScope/u);
assert.match(lifecycle, /canEditPdmOwnedResourceInCompany/u);
assert.match(lifecycle, /input\.metadata\.actor\.organizationId/u);

const partChange = read("src/lib/part-change-work.ts");
assert.match(partChange, /actor\.id !== ownerId && !actor\.canEditNonOwned/u);
assert.match(partChange, /runDev087IdempotentCommand/u);
const partMatrix = read("src/lib/repositories/part-number-matrix-async-repository.ts");
assert.match(partMatrix, /actor\.canEditNonOwned/u);
assert.match(partMatrix, /work_owner_user_id/u);
const drawingChange = read("src/lib/drawing-revision-work.ts");
assert.match(drawingChange, /actor\.id !== owner && !actor\.canEditNonOwned/u);
assert.match(drawingChange, /runDev087IdempotentCommand/u);

const drawingLifecycle = read("src/lib/drawing-revision-lifecycle.ts");
assert.match(drawingLifecycle, /hasPdmNonOwnerEditScope/u);
assert.match(drawingLifecycle, /allowNonSubmitter: hasPdmNonOwnerEditScope/u);
const drawingLifecycleRepository = read("src/lib/repositories/drawing-revision-lifecycle-async-repository.ts");
assert.match(drawingLifecycleRepository, /submitted_by !== input\.actorId && input\.allowNonSubmitter !== true/u);
assert.match(drawingLifecycleRepository, /approval_platform_decisions/u);

const recognition = read("src/lib/drawing-recognition.ts");
assert.match(recognition, /hasPdmNonOwnerEditScope/u);
const partWorkspace = read("src/lib/part-number-matrix-workspace.ts");
assert.match(partWorkspace, /canEditNonOwned: input\.actor\.canEditNonOwned/u);
assert.match(partWorkspace, /issueCanonicalWorkbenchContract/u);

const bom = read("src/lib/bom-create-context.ts");
const permissions = read("src/lib/permissions.ts");
assert.match(bom, /status IN \('Draft','Rejected','PendingReview','Archived'\)/u);
assert.match(bom, /export async function canReadBomDraftRecordAsync/u);
assert.match(bom, /draft\.status !== "Draft" && draft\.status !== "Rejected"/u);
assert.match(permissions, /user\.role !== "Engineer" \|\| submission\.submitted_by === user\.id/u);

for (const file of [
  "src/app/api/numbering/drawings/workbench/route.ts",
  "src/app/api/numbering/drawings/workbench/[rowKey]/route.ts",
  "src/app/api/parts/workbench/route.ts",
  "src/app/api/parts/workbench/[rowKey]/route.ts",
  "src/app/api/pdm/relations/[rootId]/matrix/route.ts",
  "src/app/api/bom/workbench/route.ts",
  "src/app/api/bom/drafts/route.ts"
]) {
  assert.equal(exists(file), true, `${file} must exist in the canonical route set`);
}
assert.match(read("src/app/api/pdm/relations/[rootId]/matrix/route.ts"), /if \(!access\.actor\.canEditMatrix\) /u);
assert.match(read("src/app/api/bom/workbench/route.ts"), /canReadBomDraftRecordAsync/u);
assert.match(read("src/app/api/bom/drafts/route.ts"), /resolveBomOwnerAccessContextAsync/u);

assert.match(read("db/schema.sql"), /role IN \('Engineer', 'R&D Manager', 'Admin'/u);
assert.match(read("db/postgres/040_supervisor_workflow_authority.sql"), /'numbering\.publish'/u);

console.log("QC DEV-081 current canonical engineer/supervisor/admin non-owner edit scope: PASS");
