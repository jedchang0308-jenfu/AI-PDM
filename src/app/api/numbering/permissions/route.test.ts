import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthAsync: vi.fn(),
  checkNumberingPermissionsAsync: vi.fn(),
  numberingUserScopeFromVerifiedSession: vi.fn((user: unknown) => user)
}));

vi.mock("@/lib/auth-async", () => ({ requireAuthAsync: mocks.requireAuthAsync }));
vi.mock("@/lib/numbering-permission-async", () => ({ checkNumberingPermissionsAsync: mocks.checkNumberingPermissionsAsync }));
vi.mock("@/lib/numbering-permission-codes", () => ({
  NUMBERING_ACTION_PERMISSION_CODES: ["numbering.publish"],
  NUMBERING_PAGE_PERMISSION_CODES: ["numbering.search"]
}));
vi.mock("@/lib/numbering-permission-guard", () => ({ numberingUserScopeFromVerifiedSession: mocks.numberingUserScopeFromVerifiedSession }));
vi.mock("@/lib/number-state-flow-api", () => ({ numberStateFlowJson: (value: unknown) => Response.json(value) }));

import { GET } from "@/app/api/numbering/permissions/route";

describe("numbering permission projection", () => {
  afterEach(() => vi.clearAllMocks());

  it("binds every batched permission to the verified session company workspace", async () => {
    const session = { principalId: "principal-1" };
    const user = { id: "user-1", role: "Engineer", company_id: "company-jenfu" };
    mocks.requireAuthAsync.mockResolvedValue({ user, session, response: null });
    mocks.numberingUserScopeFromVerifiedSession.mockReturnValue(user);
    mocks.checkNumberingPermissionsAsync.mockImplementation(async (inputs: readonly { permissionCode: string }[]) =>
      inputs.map(() => ({ allowed: false, permissionKind: "page", permissionCode: "", roleCode: null, evaluatedRoles: [], reason: "missing_permission", decisionCode: "permission_not_granted" }))
    );

    await GET(new Request("https://ai-pdm.test/api/numbering/permissions"));

    expect(mocks.numberingUserScopeFromVerifiedSession).toHaveBeenCalledWith(user, session);
    expect(mocks.checkNumberingPermissionsAsync).toHaveBeenCalledWith([
      { user, permissionKind: "page", permissionCode: "numbering.search", workspaceCode: "company-jenfu" },
      { user, permissionKind: "action", permissionCode: "numbering.publish", workspaceCode: "company-jenfu" }
    ]);
  });
});
