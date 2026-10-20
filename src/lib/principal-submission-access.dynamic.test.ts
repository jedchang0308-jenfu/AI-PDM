import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dynamic: vi.fn(), resource: vi.fn(), workspace: vi.fn() }));
vi.mock("@/lib/principal-resource-capability", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/principal-resource-capability")>(),
  isDynamicRolePolicyInSnapshot: mocks.dynamic
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalResourcePermissionsInSnapshot: mocks.resource,
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.workspace
}));

import { authorizePrincipalSubmissionListInSnapshot, authorizePrincipalSubmissionReadInSnapshot } from "@/lib/principal-submission-access";

const verified = {
  profile: { pdmUserId: "profile-one", companyId: "company-one" },
  session: { principalId: "principal-one" }
} as never;

const row = (submission_id: string, project_code: string, source_entity_type: string | null,
  member_id: string | null, linked_entity_type: string | null, file_role = "pdf", document_category: string | null = "drawing_2d") => ({
  submission_id, project_code, source_entity_type, member_id, linked_entity_type,
  id: member_id ?? "", file_role, sha256: "hash", document_category
});

function decisions(permissions: Array<{ permissionCode: string }>, projectCode: string, allowedCodes: string[], roleCode = "custom_inspector") {
  return permissions.map(permission => ({
    allowed: allowedCodes.includes(permission.permissionCode), permissionCode: permission.permissionCode,
    decisionCode: allowedCodes.includes(permission.permissionCode) ? "allowed" : "permission_not_granted",
    roleCode: allowedCodes.includes(permission.permissionCode) ? roleCode : null,
    principalId: "principal-one", assignmentId: "assignment-one", publishedAssignmentVersion: 4,
    projectCode
  }));
}

describe("DEV-123 dynamic submission view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dynamic.mockResolvedValue(true);
  });

  it("filters collection by actual groups and project grants, including NULL mixed history", async () => {
    const snapshot = { kind: "postgres", query: vi.fn(async () => [
      row("drawing-one", "P-DRAW", "drawing_number", "file-drawing", "drawing_number"),
      row("part-one", "P-DRAW", "part_number", "file-part", "part_number", "sldprt", "cad_3d"),
      row("mixed-one", "P-MIX", null, "file-mixed-drawing", "drawing_number"),
      row("mixed-one", "P-MIX", null, "file-mixed-model", "shared_model", "sldasm", "model")
    ]) } as never;
    mocks.resource.mockImplementation(async (_snapshot, _verified, permissions, scope) => {
      const allowed = scope.projectCode === "P-DRAW" ? ["pdm.drawing.view"] : ["pdm.drawing.view"];
      return decisions(permissions, scope.projectCode, allowed);
    });

    await expect(authorizePrincipalSubmissionListInSnapshot(snapshot, verified))
      .resolves.toEqual({ visibleSubmissionIds: ["drawing-one"] });
    expect(mocks.resource).toHaveBeenCalledTimes(2);
    expect(mocks.resource).toHaveBeenCalledWith(snapshot, verified,
      expect.arrayContaining([{ permissionKind: "action", permissionCode: "pdm.drawing.view" },
        { permissionKind: "action", permissionCode: "pdm.part.view" }]),
      { workspaceCode: "company-one", projectCode: "P-DRAW" });
    expect(mocks.resource).toHaveBeenCalledWith(snapshot, verified,
      expect.arrayContaining([{ permissionKind: "action", permissionCode: "pdm.model.view" }]),
      { workspaceCode: "company-one", projectCode: "P-MIX" });
  });

  it("does not expose direct lists to an external specialist even when a view grant exists", async () => {
    const snapshot = { kind: "postgres", query: vi.fn(async () => [
      row("released-one", "P-ONE", "drawing_number", "file-one", "drawing_number")
    ]) } as never;
    mocks.resource.mockImplementation(async (_snapshot, _verified, permissions, scope) =>
      decisions(permissions, scope.projectCode, ["pdm.drawing.view"], "external_specialist"));

    const result = await authorizePrincipalSubmissionListInSnapshot(snapshot, verified);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  it("authorizes detail against the union of parent and actual member groups for a custom role", async () => {
    const resource = { company_id: "company-one", submitted_by: "profile-two", project_code: "P-CAD", status: "Pending" };
    const snapshot = {
      queryOne: vi.fn(async () => resource),
      query: vi.fn(async () => [
        row("submission-one", "P-CAD", "part_number", "file-part", "part_number", "sldprt", "cad_3d")
      ])
    } as never;
    mocks.resource.mockImplementation(async (_snapshot, _verified, permissions, scope) =>
      decisions(permissions, scope.projectCode, ["pdm.part.view", "pdm.model.view"]));

    await expect(authorizePrincipalSubmissionReadInSnapshot(snapshot, verified, "submission-one"))
      .resolves.toEqual(resource);
    expect(mocks.resource).toHaveBeenCalledWith(snapshot, verified, [
      { permissionKind: "action", permissionCode: "pdm.part.view" },
      { permissionKind: "action", permissionCode: "pdm.model.view" }
    ], { workspaceCode: "company-one", projectCode: "P-CAD" });
  });

  it("preserves external share and release requirements on dynamic detail", async () => {
    const resource = { company_id: "company-one", submitted_by: "profile-two", project_code: "P-ONE", status: "Released" };
    const snapshot = {
      queryOne: vi.fn(async () => resource),
      query: vi.fn(async () => [row("submission-one", "P-ONE", "drawing_number", "file-one", "drawing_number")])
    } as never;
    mocks.resource.mockImplementation(async (_snapshot, _verified, permissions, scope) =>
      decisions(permissions, scope.projectCode, ["pdm.drawing.view"], "external_specialist"));

    const result = await authorizePrincipalSubmissionReadInSnapshot(snapshot, verified, "submission-one");
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    expect((snapshot as { queryOne: ReturnType<typeof vi.fn> }).queryOne).toHaveBeenCalledOnce();
  });

  it("fails closed for an unclassifiable member instead of using only its parent group", async () => {
    const snapshot = {
      queryOne: vi.fn(async () => ({ company_id: "company-one", submitted_by: "profile-two", project_code: "P-ONE", status: "Pending" })),
      query: vi.fn(async () => [row("submission-one", "P-ONE", "drawing_number", "file-one", "unknown_asset", "other", "other")])
    } as never;
    const result = await authorizePrincipalSubmissionReadInSnapshot(snapshot, verified, "submission-one");
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(503);
    expect(mocks.resource).not.toHaveBeenCalled();
  });
});
