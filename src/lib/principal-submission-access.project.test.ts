import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ evaluate: vi.fn() }));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalResourcePermissionsInSnapshot: mocks.evaluate,
  evaluatePrincipalWorkspacePermissionsInSnapshot: vi.fn()
}));

import { authorizePrincipalSubmissionReadInSnapshot } from "@/lib/principal-submission-access";

const verified = {
  profile: { pdmUserId: "profile-external", companyId: "company-jenfu" },
  session: { principalId: "principal-external", employeeId: "employee-external" }
} as never;

describe("DEV-123 project-scoped submission read", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the server-read project code to the fresh entitlement decision", async () => {
    const resource = { company_id: "company-jenfu", submitted_by: "profile-owner", project_code: "P-001" };
    const snapshot = { queryOne: vi.fn(async () => resource) } as never;
    mocks.evaluate.mockResolvedValue([{ allowed: true, permissionCode: "submission.view",
      decisionCode: "allowed", roleCode: "external_specialist", principalId: "principal-external" }]);
    await expect(authorizePrincipalSubmissionReadInSnapshot(snapshot, verified, "submission-one"))
      .resolves.toEqual(resource);
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, verified,
      [{ permissionKind: "action", permissionCode: "submission.view" }],
      { workspaceCode: "company-jenfu", projectCode: "P-001" });
  });

  it("does not evaluate a resource owned by another company", async () => {
    const snapshot = { queryOne: vi.fn(async () => ({ company_id: "company-other",
      submitted_by: "profile-owner", project_code: "P-001" })) } as never;
    const result = await authorizePrincipalSubmissionReadInSnapshot(snapshot, verified, "submission-one");
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });
});
