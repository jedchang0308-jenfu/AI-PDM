import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  principalRead: vi.fn(),
  legacyAccess: vi.fn(),
  workbench: vi.fn(),
  context: vi.fn()
}));

vi.mock("@/lib/principal-company-read", () => ({ withPrincipalCompanyRead: mocks.principalRead }));
vi.mock("@/lib/transfer-package-api", () => ({
  requireTransferPackageAccessAsync: mocks.legacyAccess,
  transferPackageErrorResponse: () => Response.json({ code: "transfer_error" }, { status: 500 })
}));
vi.mock("@/lib/transfer-packages", () => ({
  getTransferPackageWorkbench: mocks.workbench,
  getTransferPackageWorkbenchContext: mocks.context,
  updateTransferPackageHeader: vi.fn()
}));

import { GET as getWorkbench } from "@/app/api/transfer-packages/[id]/route";
import { GET as getContext } from "@/app/api/transfer-packages/workbench-context/route";

const snapshot = { kind: "postgres" };
const company = { companyId: "company-jenfu", companyCode: "JENFU" };

describe("principal-only transfer workbench reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads a package only after its exact Principal view grant and within that snapshot", async () => {
    mocks.principalRead.mockImplementation(async (_request, _company, _permissions, read) =>
      read(snapshot, company));
    mocks.workbench.mockResolvedValue({ id: "package-one" });

    const result = await getWorkbench(
      new Request("https://ai-pdm.test/api/transfer-packages/package-one"),
      { params: Promise.resolve({ id: "package-one" }) });

    expect(result.status).toBe(200);
    expect(mocks.principalRead).toHaveBeenCalledWith(expect.any(Request),
      { state: "absent" }, [{ permissionKind: "action", permissionCode: "transfer.package.view" }],
      expect.any(Function));
    expect(mocks.workbench).toHaveBeenCalledWith("package-one", "company-jenfu", snapshot);
    expect(mocks.legacyAccess).not.toHaveBeenCalled();
  });

  it("keeps source lookup in the authorized create snapshot", async () => {
    mocks.principalRead.mockImplementation(async (_request, _company, _permissions, read) =>
      read(snapshot, company));
    mocks.context.mockResolvedValue({ sourceResolved: true });

    const result = await getContext(new Request(
      "https://ai-pdm.test/api/transfer-packages/workbench-context?sourceType=drawing&sourceId=DR-1"));

    expect(result.status).toBe(200);
    expect(mocks.principalRead).toHaveBeenCalledWith(expect.any(Request),
      { state: "absent" }, [{ permissionKind: "action", permissionCode: "transfer.package.create" }],
      expect.any(Function));
    expect(mocks.context).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-jenfu", client: snapshot, sourceType: "drawing", sourceId: "DR-1"
    }));
    expect(mocks.legacyAccess).not.toHaveBeenCalled();
  });

  it("does not touch package data after a denied grant or mismatched URL", async () => {
    mocks.principalRead.mockResolvedValueOnce(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    const denied = await getWorkbench(
      new Request("https://ai-pdm.test/api/transfer-packages/package-one"),
      { params: Promise.resolve({ id: "package-one" }) });
    expect(denied.status).toBe(403);
    const mismatch = await getContext(new Request("https://ai-pdm.test/api/settings"));
    expect(mismatch.status).toBe(503);
    expect(mocks.workbench).not.toHaveBeenCalled();
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.legacyAccess).not.toHaveBeenCalled();
  });
});
