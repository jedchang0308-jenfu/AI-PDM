import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ token: vi.fn(), read: vi.fn(), list: vi.fn(), series: vi.fn(), codes: vi.fn(), evaluate: vi.fn(), snapshots: [] as unknown[] }));
vi.mock("@/lib/jenfu-principal-http", () => ({ principalSessionTokenFromRequest: mocks.token }));
vi.mock("@/lib/principal-numbering-read", () => ({ withPrincipalNumberingCompanyRead: mocks.read }));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({ evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate }));
vi.mock("@/lib/numbering-permission-guard", () => ({ canUserUseNumberingActionAsync: vi.fn(() => { throw new Error("legacy ACL must not run"); }) }));
vi.mock("@/lib/repositories/numbering-async-repository", () => ({ AsyncNumberingRepository: class {
  constructor(snapshot: unknown) { mocks.snapshots.push(snapshot); }
  listPartModuleRecords = mocks.list; listProductSeriesOptions = mocks.series; listSeriesCodeOptions = mocks.codes;
} }));
import { GET } from "@/app/api/parts/route";
import { resolvePrincipalHumanStatusRoleCapabilitiesInSnapshot } from "@/lib/numbering-human-status-viewer";
const snapshot = { transactionScope: "postgres" };
const company = { companyId: "company-jenfu", companyCode: "JENFU" };
const verified = { session: { principalId: "principal-jed" }, profile: { pdmUserId: "historical-jed", role: "system_admin" } };
describe("Principal part list and viewer capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.snapshots.length = 0;
    mocks.token.mockReturnValue("principal-session");
    mocks.read.mockImplementation(async (_request, _permission, read) => read(snapshot, company, verified));
    mocks.list.mockResolvedValue([]); mocks.series.mockResolvedValue(["series-a"]); mocks.codes.mockResolvedValue(["A"]);
    mocks.evaluate.mockImplementation(async (_snapshot, _verified, permissions) => permissions.map(({ permissionCode }: { permissionCode: string }) =>
      ({ principalId: "principal-jed", permissionCode, allowed: false })));
  });
  it("reads parts, options and capabilities in the authorized company snapshot", async () => {
    const request = new Request("https://example.test/api/parts?query=A0060&limit=5");
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ parts: [], productSeriesOptions: ["series-a"], seriesCodeOptions: ["A"], pdmCompany: company });
    expect(mocks.read).toHaveBeenCalledWith(request, "numbering.search", expect.any(Function));
    expect(mocks.snapshots).toEqual([snapshot]);
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-jenfu", query: "A0060", limit: 5 }));
    expect(mocks.series).toHaveBeenCalledWith("company-jenfu");
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, verified, expect.any(Array));
  });
  it("does not read business data when the Principal is denied", async () => {
    mocks.read.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    expect((await GET(new Request("https://example.test/api/parts"))).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.evaluate).not.toHaveBeenCalled();
  });
  it("requires a Principal session without invoking a legacy guard", async () => {
    mocks.token.mockReturnValue(null);
    expect((await GET(new Request("https://example.test/api/parts"))).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("never derives viewer actions from historical system_admin", async () => {
    const result = await resolvePrincipalHumanStatusRoleCapabilitiesInSnapshot(snapshot as never, verified as never);
    expect(Object.values(result).every(value => value === false)).toBe(true);
  });
  it("rejects capability decisions belonging to another Principal", async () => {
    mocks.evaluate.mockImplementation(async (_snapshot, _verified, permissions) => permissions.map(({ permissionCode }: { permissionCode: string }) =>
      ({ principalId: "principal-other", permissionCode, allowed: true })));
    await expect(resolvePrincipalHumanStatusRoleCapabilitiesInSnapshot(snapshot as never, verified as never)).rejects.toThrow("principal_dependency_unavailable");
  });
});
