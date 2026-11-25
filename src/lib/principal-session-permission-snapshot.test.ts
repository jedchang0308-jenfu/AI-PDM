import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  priority: vi.fn(),
  readAssignments: vi.fn(),
  preparePermissions: vi.fn(),
  employeeName: vi.fn(),
  sharedAdmin: vi.fn()
}));

vi.mock("@/lib/jenfu-principal-role-catalog", () => ({
  requirePublishedPrincipalCatalog: mocks.catalog
}));
vi.mock("@/lib/repositories/access-control-async-repository", () => ({
  AsyncAccessControlRepository: class {
    getEnforcedRolePriority = mocks.priority;
  }
}));
vi.mock("@/lib/repositories/jenfu-entitlement-repository", () => ({
  JenfuEntitlementRepository: class {
    readAssignments = mocks.readAssignments;
    preparePermissions = mocks.preparePermissions;
  },
  JenfuEntitlementRepositoryError: class extends Error {}
}));
vi.mock("@/lib/principal-employee-display-name-repository", () => ({
  readPrincipalChineseEmployeeName: mocks.employeeName
}));
vi.mock("@/lib/shared-daily-system-test-admin", () => ({
  isSharedDailySystemTestAdministrator: mocks.sharedAdmin,
  requireSharedDailySystemTestAdminOperations: vi.fn()
}));

import type { AsyncDatabaseClient } from "./db-async-provider";
import { createPrincipalSessionPermissions, resolvePrincipalSessionPermissions } from "./principal-session-permission-snapshot";

const actor = {
  identityIssuer: "https://issuer.example.test", identitySubject: "subject",
  principalId: "principal", employeeId: "employee", localPrincipalId: "profile",
  companyId: "company-jenfu", sessionSchemaVersion: 2 as const
};
const assignment = (assignmentId: string, roleCode: string, stableRoleId: string) => ({
  assignmentId, roleCode, stableRoleId, scopeKind: "workspace" as const, scopeKey: "current",
  validUntil: null, grantKind: "direct" as const, delegationId: null,
  subjectKind: "employee" as const, targetPrincipalId: null, sourceGrantId: "source"
});
const role = (stableRoleId: string, roleCode: string, allowed: boolean) => ({
  stableRoleId, roleCode, roleStatus: "active" as const,
  permissions: [{ kind: "action" as const, code: "pdm.drawing.view", allowed }]
});

beforeEach(() => {
  vi.clearAllMocks();
  const deniedAssignment = assignment("deny-assignment", "deny-role", "role-deny");
  const allowedAssignment = assignment("allow-assignment", "allow-role", "role-allow");
  const deniedRole = role("role-deny", "deny-role", false);
  const allowedRole = role("role-allow", "allow-role", true);
  mocks.catalog.mockResolvedValue({
    catalogVersion: "ai-pdm.role-policy.fixture", roles: [deniedRole, allowedRole]
  });
  mocks.priority.mockResolvedValue(["deny-role", "allow-role"]);
  mocks.readAssignments.mockResolvedValue({
    assignments: [deniedAssignment, allowedAssignment], sourceVersion: "source",
    nextBoundary: null, evaluatedAt: "2026-11-25T00:00:00.000Z"
  });
  mocks.preparePermissions.mockReturnValue({
    publication: { assignmentVersion: 1, assignmentVersionId: "version-one" },
    preparedAssignments: [
      { assignment: deniedAssignment, role: deniedRole },
      { assignment: allowedAssignment, role: allowedRole }
    ], evaluatedRoles: ["deny-role", "allow-role"]
  });
  mocks.employeeName.mockResolvedValue("測試者");
  mocks.sharedAdmin.mockResolvedValue(false);
});

it("retains same-scope candidates and resolves the effective capability as a role union", async () => {
  const client = {
    kind: "postgres", queryOne: vi.fn().mockResolvedValue({ locked: true })
  } as unknown as AsyncDatabaseClient;
  const { snapshot } = await createPrincipalSessionPermissions(
    client, actor, "human_personal", undefined, "session-hash");
  const candidates = snapshot.permissions["action:numbering.workspace.view:1"];
  expect(snapshot).toMatchObject({ version: 1, resolutionVersion: 2 });
  expect(candidates).toEqual([
    [0, false, "deny-role", "deny-assignment"],
    [0, true, "allow-role", "allow-assignment"]
  ]);
  const [decision] = resolvePrincipalSessionPermissions(snapshot,
    { principalId: actor.principalId, companyId: actor.companyId },
    [{ permissionKind: "action", permissionCode: "numbering.workspace.view", resourceGroup: "drawing" }], {});
  expect(decision).toMatchObject({ allowed: true, roleCode: "allow-role", assignmentId: "allow-assignment" });
});
