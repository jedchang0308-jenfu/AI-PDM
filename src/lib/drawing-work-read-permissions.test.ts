import { beforeEach, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "./db-async-provider";
import type { VerifiedPrincipalRequest } from "./jenfu-principal-request-guard";
import type { PrincipalSessionPermissions } from "./principal-session-permission-snapshot";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "./jenfu-principal-permission-service";
import { drawingWorkReadPermissions } from "./drawing-work-read-permissions";

const query = vi.fn(() => { throw new Error("No database/upstream authorization reads expected"); });
const client = { kind: "postgres", transactionScope: "postgres", query, queryOne: query } as unknown as AsyncDatabaseClient;
let actor: VerifiedPrincipalRequest;
beforeEach(() => {
  vi.clearAllMocks();
  const permissions: PrincipalSessionPermissions = {
    version: 1, sourceVersion: "source", assignmentVersion: 1, assignmentVersionId: "one",
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
it("keeps explicit denial and role priority for edit while allowing a separate view grant", async () => {
  actor.permissions!.permissions["action:numbering.workspace.update:1"].unshift([0, false, "custom-deny", "deny"]);
  const decisions = await drawingWorkReadPermissions(client, actor);
  expect(decisions[0].allowed).toBe(true);
  expect(decisions[1]).toMatchObject({ allowed: false, decisionCode: "permission_explicit_deny" });
});
it.each(["other-company", "project-only"])("does not promote a %s grant into workspace authority", async scope => {
  actor.permissions!.scopes = scope === "project-only" ? [["project", "project-A"]] : [["workspace", "company-other"]];
  await expect(drawingWorkReadPermissions(client, actor)).rejects.toMatchObject({ status: 403 });
  const [decision] = await evaluatePrincipalWorkspacePermissionsInSnapshot(client, actor,
    [{ permissionKind: "action", permissionCode: "numbering.workspace.update", resourceGroup: "drawing" }]);
  expect(decision).toMatchObject({ allowed: false, decisionCode: "entitlement_scope_mismatch" });
  expect(query).not.toHaveBeenCalled();
});
