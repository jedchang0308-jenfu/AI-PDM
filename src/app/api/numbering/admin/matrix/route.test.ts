import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listMatrix: vi.fn(),
  requireAction: vi.fn(),
  requirePage: vi.fn()
}));

vi.mock("@/lib/auth-async", () => ({
  forbidden: () => Response.json({ error: "forbidden" }, { status: 403 })
}));

vi.mock("@/lib/numbering-permission-guard", () => ({
  requireNumberingActionAsync: mocks.requireAction,
  requireNumberingPageAsync: mocks.requirePage
}));

vi.mock("@/lib/numbering-async", () => ({
  applyNumberingRuleTemplateAsync: vi.fn(),
  listNumberingAdminMatrixAsync: mocks.listMatrix,
  revokeNumberingApprovalDelegationAsync: vi.fn(),
  revokeNumberingUserRoleAssignmentAsync: vi.fn(),
  saveNumberingRolePriorityAsync: vi.fn(),
  upsertNumberingAdminRoleAsync: vi.fn(),
  upsertNumberingApprovalDelegationAsync: vi.fn(),
  upsertNumberingApprovalRuleAsync: vi.fn(),
  upsertNumberingRolePermissionAsync: vi.fn(),
  upsertNumberingRoleScopeAsync: vi.fn(),
  upsertNumberingUserRoleAssignmentAsync: vi.fn()
}));

import { GET } from "@/app/api/numbering/admin/matrix/route";

describe("DEV-013 numbering admin matrix authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAction.mockResolvedValue({
      user: { id: "user-1", role: "Admin" },
      response: null,
      permission: { allowed: true }
    });
    mocks.listMatrix.mockResolvedValue({ roles: [] });
  });

  it("loads the matrix through the catalog's settings.admin_matrix action permission", async () => {
    const response = await GET(new Request("https://ai-pdm.example/api/numbering/admin/matrix"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ roles: [] });
    expect(mocks.requireAction).toHaveBeenCalledWith(expect.any(Request), "settings.admin_matrix");
    expect(mocks.requirePage).not.toHaveBeenCalled();
  });
});
