import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  principalRead: vi.fn(),
  readiness: vi.fn()
}));

vi.mock("@/lib/principal-company-read", () => ({ withPrincipalCompanyRead: mocks.principalRead }));
vi.mock("@/lib/transfer-package-phase1d", () => ({ buildTransferPackageReadiness: mocks.readiness }));

import { GET } from "@/app/api/transfer-packages/[id]/readiness-summary/route";

const snapshot = { kind: "postgres" };
const company = { companyId: "company-jenfu", companyCode: "JENFU" };

describe("Principal-only transfer readiness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads readiness in the same snapshot as the Principal view grant", async () => {
    mocks.principalRead.mockImplementation(async (_request, _company, _permissions, read) =>
      read(snapshot, company));
    mocks.readiness.mockResolvedValue({ ready: true, packageId: "package-one" });

    const result = await GET(new Request(
      "https://ai-pdm.test/api/transfer-packages/package-one/readiness-summary"),
    { params: Promise.resolve({ id: "package-one" }) });

    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.principalRead).toHaveBeenCalledWith(expect.any(Request),
      { state: "absent" }, [{ permissionKind: "action", permissionCode: "transfer.package.view" }],
      expect.any(Function));
    expect(mocks.readiness).toHaveBeenCalledWith("package-one", "company-jenfu", snapshot);
  });

  it("never reads package data on denial or a mismatched route", async () => {
    mocks.principalRead.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    const denied = await GET(new Request(
      "https://ai-pdm.test/api/transfer-packages/package-one/readiness-summary"),
    { params: Promise.resolve({ id: "package-one" }) });
    const mismatch = await GET(new Request("https://ai-pdm.test/api/settings"),
      { params: Promise.resolve({ id: "package-one" }) });

    expect(denied.status).toBe(403);
    expect(mismatch.status).toBe(503);
    expect(mocks.principalRead).toHaveBeenCalledTimes(1);
    expect(mocks.readiness).not.toHaveBeenCalled();
  });
});
