import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), principalRead: vi.fn(), repositoryClient: vi.fn(), detail: vi.fn(),
  decisions: vi.fn(), statusPair: vi.fn()
}));

vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: mocks.token
}));
vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/repositories/numbering-async-repository", () => ({
  AsyncNumberingRepository: class {
    constructor(client: unknown) { mocks.repositoryClient(client); }
    getNumberingRootDetail = mocks.detail;
  }
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.decisions
}));
vi.mock("@/lib/drawing-part-relation-status", () => ({
  projectNumberingRootStatus: vi.fn(() => ({
    humanStatus: { key: "ready_to_submit", phase: "action" },
    relationshipHealth: "healthy", blockerCount: 0
  })),
  projectEffectiveRelationRecordStatus: vi.fn(() => "Active")
}));
vi.mock("@/lib/responsibility-status-projection", () => ({
  projectRoleResponsibilityStatusPair: mocks.statusPair
}));
vi.mock("@/lib/availability-scope", () => ({
  projectDrawingRecordAvailability: vi.fn(),
  projectPartAvailability: vi.fn(),
  projectRelationRootAvailability: vi.fn(() => ({ status: "available" }))
}));

import { GET } from "@/app/api/numbering/roots/[rootCode]/route";

const request = new Request("https://ai-pdm.test/api/numbering/roots/A0001");
const params = { params: Promise.resolve({ rootCode: "A0001" }) };
const snapshot = { transactionScope: "principal-repeatable-read" };
const company = { companyId: "company-jenfu", companyCode: "JENFU" };
const verified = {
  session: { principalId: "principal-1" },
  profile: { pdmUserId: "profile-1" }
};
const permissionCodes = [
  "numbering.draft.update", "numbering.link_variant", "approval.request.decide",
  "numbering.publish", "numbering.candidate.review.submit"
];

describe("Principal-only root detail read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("principal-session");
    mocks.principalRead.mockImplementation(async (_request, _permission, read) =>
      read(snapshot, company, verified));
    mocks.detail.mockResolvedValue({
      root: { id: "root-1", rootCode: "A0001", recordStatus: "Active" },
      drawingNumbers: [], partNumbers: [], links: [], summary: {}
    });
    mocks.decisions.mockImplementation(async (_snapshot, _verified, permissions) =>
      permissions.map(({ permissionCode }, index) => ({
        permissionCode, principalId: "principal-1", allowed: index < 4
      })));
    mocks.statusPair.mockReturnValue({ responsibilityActions: [] });
  });

  it("uses the same verified snapshot and published decisions for action labels", async () => {
    const response = await GET(request, params);
    expect(response.status).toBe(200);
    expect(mocks.principalRead).toHaveBeenCalledWith(request, "numbering.search", expect.any(Function));
    expect(mocks.repositoryClient).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(mocks.detail).toHaveBeenCalledWith("A0001", "company-jenfu");
    expect(mocks.decisions).toHaveBeenCalledWith(snapshot, verified,
      permissionCodes.map((permissionCode) => ({ permissionKind: "action", permissionCode })));
    expect(mocks.statusPair).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "profile-1",
      capabilities: {
        canEdit: true, canManageRelations: true, canReview: true,
        canPublish: true, canRestoreMainDrawing: false, canSubmit: false
      }
    }));
    expect((await response.json()).pdmCompany).toEqual(company);
  });

  it("rejects missing Principal session before reading the root", async () => {
    mocks.token.mockReturnValue(null);
    const response = await GET(request, params);
    expect(response.status).toBe(401);
    expect(mocks.principalRead).not.toHaveBeenCalled();
    expect(mocks.detail).not.toHaveBeenCalled();
  });

  it("preserves denial and fails closed when the Principal read contract is unavailable", async () => {
    mocks.principalRead.mockResolvedValueOnce(Response.json({ code: "permission_not_granted" },
      { status: 403 })).mockResolvedValueOnce(null);
    expect((await GET(request, params)).status).toBe(403);
    expect((await GET(request, params)).status).toBe(503);
    expect(mocks.detail).not.toHaveBeenCalled();
  });

  it("does not evaluate action labels when the root is absent", async () => {
    mocks.detail.mockResolvedValue(null);
    expect((await GET(request, params)).status).toBe(404);
    expect(mocks.decisions).not.toHaveBeenCalled();
  });
});
