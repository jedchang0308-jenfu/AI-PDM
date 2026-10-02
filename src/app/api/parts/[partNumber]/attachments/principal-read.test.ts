import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), list: vi.fn(), snapshot: {}, company: { companyId: "company-one" } }));
vi.mock("@/lib/principal-numbering-read", () => ({ withPrincipalNumberingCompanyRead: mocks.authorize }));
vi.mock("@/lib/master-attachments-async", () => ({ createMasterAttachmentAsync: vi.fn(), listMasterAttachmentsInCompanyAsync: mocks.list }));
vi.mock("@/lib/numbering-permission-guard", () => ({ requireNumberingActionAsync: vi.fn(() => { throw new Error("LEGACY_GUARD_MUST_NOT_RUN"); }) }));
import { GET as partGET } from "./route";
import { GET as drawingGET } from "@/app/api/numbering/drawings/[drawingNumber]/attachments/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ entity: { id: "entity-one" }, attachments: [] });
  mocks.authorize.mockImplementation(async (_request, _permissions, read) => read(mocks.snapshot, mocks.company));
});
describe("Principal-only attachment listing callers", () => {
  it("passes the verified snapshot/company for normal Part reads", async () => {
    const response = await partGET(new Request("https://pdm.test/api/parts/A0060-P01/attachments"), { params: Promise.resolve({ partNumber: "A0060-P01" }) });
    expect(response.status).toBe(200);
    expect(mocks.authorize.mock.calls[0][1]).toEqual([{ permissionKind: "page", permissionCode: "numbering.search" }]);
    expect(mocks.list).toHaveBeenCalledWith(mocks.snapshot, { entityType: "part_number", entityCode: "A0060-P01", companyId: "company-one", deleted: false });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("requires manage permission alone for deleted attachments", async () => {
    await partGET(new Request("https://pdm.test/api/parts/A0060-P01/attachments?surface=deleted_data"), { params: Promise.resolve({ partNumber: "A0060-P01" }) });
    expect(mocks.authorize.mock.calls[0][1]).toEqual([{ permissionKind: "action", permissionCode: "numbering.attachments.manage" }]);
    expect(mocks.list.mock.calls[0][1].deleted).toBe(true);
  });
  it("applies the same boundary to Drawing reads", async () => {
    const response = await drawingGET(new Request("https://pdm.test/api/numbering/drawings/A0060-M01/attachments"), { params: Promise.resolve({ drawingNumber: "A0060-M01" }) });
    expect(response.status).toBe(200);
    expect(mocks.list.mock.calls[0][1]).toEqual({ entityType: "drawing_number", entityCode: "A0060-M01", companyId: "company-one", deleted: false });
  });
  it("does not read data when grants are denied or revoked", async () => {
    mocks.authorize.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    const response = await partGET(new Request("https://pdm.test/api/parts/A0060-P01/attachments"), { params: Promise.resolve({ partNumber: "A0060-P01" }) });
    expect(response.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("fails closed without a Principal session rather than using legacy auth", async () => {
    mocks.authorize.mockResolvedValue(null);
    const response = await partGET(new Request("https://pdm.test/api/parts/A0060-P01/attachments"), { params: Promise.resolve({ partNumber: "A0060-P01" }) });
    expect(response.status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("does not disclose an out-of-company entity", async () => {
    mocks.list.mockResolvedValue(null);
    const response = await partGET(new Request("https://pdm.test/api/parts/A0060-P01/attachments"), { params: Promise.resolve({ partNumber: "A0060-P01" }) });
    expect(response.status).toBe(404);
  });
});
