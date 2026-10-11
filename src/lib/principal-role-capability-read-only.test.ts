import { beforeEach, describe, expect, it, vi } from "vitest";
import roleCatalog from "../../config/access-control/jenfu-role-catalog.v7.json" with { type: "json" };

const mocks = vi.hoisted(() => ({ workspace: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/repositories/ai-pdm-role-capability-repository", () => ({
  getRoleCapabilityWorkspace: mocks.workspace,
  getPrivilegedAssignmentWorkspace: vi.fn(),
  AiPdmRoleCapabilityRepositoryError: class extends Error {
    constructor(readonly code: string) { super(code); }
  }
}));
vi.mock("@/lib/repositories/role-capability-display-snapshot-repository", () => ({
  getRoleCapabilityDisplaySnapshot: vi.fn(() => null),
  saveRoleCapabilityDisplaySnapshot: mocks.save
}));

import { readRoleCapabilityWorkspace } from "@/lib/ai-pdm-role-capability-service";

describe("Principal-only role governance display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ORGMASTER_PUBLIC_BASE_URL", "https://orgmaster.example.com");
    mocks.save.mockReturnValue({ snapshotStoredAt: "2026-09-28T00:01:00.000Z" });
  });

  it("pins the v7 source catalog and never offers AI-PDM mutation", async () => {
    mocks.workspace.mockResolvedValue({
      contractVersion: "ai-pdm.role-capability-workspace.v2", applicationId: "ai-pdm",
      catalogVersion: roleCatalog.catalogVersion, catalogPayloadHash: roleCatalog.catalogSha256,
      dataState: "current", mutationAllowed: false,
      governanceRevision: "governance-one", organizationVersionId: "organization-one",
      organizationRevision: "organization-revision-one", projectionCursor: 1,
      sourceDataAt: "2026-09-28T00:00:00.000Z", selectedRoleId: null,
      roles: roleCatalog.roles.map((catalogRole) => ({
        catalogRole, effectiveHolderCount: 0,
        projection: {
          contractVersion: "orgmaster.role-capability-projection.v1", applicationId: "ai-pdm",
          stableRoleId: catalogRole.stableRoleId, governanceRevision: "governance-one",
          organizationVersionId: "organization-one", organizationRevision: "organization-revision-one",
          changeCursor: 1
        }
      }))
    });

    const result = await readRoleCapabilityWorkspace();

    expect(result.catalogVersion).toBe("ai-pdm.role-catalog.2026-10-10.v7");
    expect(result.dataState).toBe("current");
    expect(result.mutationAllowed).toBe(false);
    expect(result.managementSurface?.href).toBe(
      "https://orgmaster.example.com/?panels=governance&focus=governance&details=none&governanceSection=assignments");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ mutationAllowed: false }));
  });
});
