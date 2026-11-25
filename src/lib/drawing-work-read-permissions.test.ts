import { beforeEach, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "./db-async-provider";
import type { VerifiedPrincipalRequest } from "./jenfu-principal-request-guard";
import type { PrincipalSessionPermissions } from "./principal-session-permission-snapshot";
import { resolvePrincipalSessionPermissions } from "./principal-session-permission-snapshot";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "./jenfu-principal-permission-service";
import { drawingWorkReadPermissions } from "./drawing-work-read-permissions";

const query = vi.fn(() => { throw new Error("No database/upstream authorization reads expected"); });
const client = { kind: "postgres", transactionScope: "postgres", query, queryOne: query } as unknown as AsyncDatabaseClient;
let actor: VerifiedPrincipalRequest;
beforeEach(() => {
  vi.clearAllMocks();
  const permissions: PrincipalSessionPermissions = {
    version: 1, resolutionVersion: 2, sourceVersion: "source", assignmentVersion: 1, assignmentVersionId: "one",
    catalogVersion: "ai-pdm.role-policy.fixture", employeeName: null,
    scopes: [["workspace", "current"]], permissions: {
      "action:numbering.workspace.view:1": [[0, true, "new-reader", "read-grant"]],
      "action:numbering.workspace.update:1": [[0, true, "new-editor-2026", "edit-grant"]],
    },
  };
  actor = { session: { principalId: "principal", contractVersion: "jenfu.ai-pdm-session.v2" },
    profile: { companyId: "company-jenfu", pdmUserId: "editor" }, permissions } as VerifiedPrincipalRequest;
});
it("uses arbitrary matrix role names from the admitted session without additional authority reads", async () => {
  const decisions = await drawingWorkReadPermissions(client, actor);
  expect(decisions[0]).toMatchObject({ allowed: true, roleCode: "new-reader" });
  expect(decisions[1]).toMatchObject({ allowed: true, roleCode: "new-editor-2026" });
  expect(query).not.toHaveBeenCalled();
});
it.each(["deny-first", "allow-first"])("takes the multi-role allow union regardless of %s candidate order", async order => {
  const allow = actor.permissions!.permissions["action:numbering.workspace.update:1"][0];
  const deny: [number, boolean, string, string] = [0, false, "custom-deny", "deny"];
  actor.permissions!.permissions["action:numbering.workspace.update:1"] = order === "deny-first"
    ? [deny, allow] : [allow, deny];
  const decisions = await drawingWorkReadPermissions(client, actor);
  expect(decisions[0].allowed).toBe(true);
  expect(decisions[1]).toMatchObject({ allowed: true, roleCode: "new-editor-2026", assignmentId: "edit-grant" });
});
it("keeps another company's workspace grant outside the drawing company boundary", async () => {
  actor.permissions!.scopes = [["workspace", "company-other"]];
  await expect(drawingWorkReadPermissions(client, actor)).rejects.toMatchObject({ status: 403 });
  const [decision] = await evaluatePrincipalWorkspacePermissionsInSnapshot(client, actor,
    [{ permissionKind: "action", permissionCode: "numbering.workspace.update", resourceGroup: "drawing" }]);
  expect(decision).toMatchObject({ allowed: false, decisionCode: "entitlement_scope_mismatch" });
  expect(query).not.toHaveBeenCalled();
});
it("treats an unbound drawing as company-shared but isolates a bound drawing by project", () => {
  const snapshot: PrincipalSessionPermissions = {
    version: 1, resolutionVersion: 2, sourceVersion: "source", assignmentVersion: 2, assignmentVersionId: "two",
    catalogVersion: "ai-pdm.role-policy.fixture", employeeName: null,
    scopes: [["project", "project-A"]],
    permissions: { "action:numbering.workspace.view:1": [[0, true, "project-reader", "project-grant"]] }
  };
  const permission = [{ permissionKind: "action" as const,
    permissionCode: "numbering.workspace.view", resourceGroup: "drawing" as const }];
  const resolve = (projectCode?: string | null, workspaceCode = "company-jenfu") =>
    resolvePrincipalSessionPermissions(snapshot, { principalId: "principal", companyId: "company-jenfu" },
      permission, { projectCode, workspaceCode })[0];
  expect(resolve(null)).toMatchObject({ allowed: true, assignmentId: "project-grant" });
  expect(resolve("project-A")).toMatchObject({ allowed: true, assignmentId: "project-grant" });
  expect(resolve("project-B")).toMatchObject({ allowed: false, decisionCode: "entitlement_scope_mismatch" });
  expect(resolve(null, "company-other")).toMatchObject({ allowed: false, decisionCode: "entitlement_scope_mismatch" });
  snapshot.scopes.push(["workspace", "current"]);
  snapshot.permissions["action:numbering.workspace.view:1"].push([1, true, "company-reader", "company-grant"]);
  expect(resolve("project-B")).toMatchObject({ allowed: true, assignmentId: "company-grant" });
});
it("does not broaden an unbound non-drawing resource from a project grant", () => {
  const snapshot: PrincipalSessionPermissions = {
    version: 1, resolutionVersion: 2, sourceVersion: "source", assignmentVersion: 2, assignmentVersionId: "two",
    catalogVersion: "ai-pdm.role-policy.fixture", employeeName: null,
    scopes: [["project", "project-A"]],
    permissions: { "action:numbering.workspace.view:2": [[0, true, "project-reader", "project-grant"]] }
  };
  const [decision] = resolvePrincipalSessionPermissions(snapshot,
    { principalId: "principal", companyId: "company-jenfu" },
    [{ permissionKind: "action", permissionCode: "numbering.workspace.view", resourceGroup: "part" }], {});
  expect(decision).toMatchObject({ allowed: false, decisionCode: "entitlement_scope_mismatch" });
});
