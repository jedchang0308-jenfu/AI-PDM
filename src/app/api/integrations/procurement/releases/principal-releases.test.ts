import { beforeEach, describe, expect, it, vi } from "vitest";
import { NumberStateFlowError } from "@/lib/number-state-flow-contract";

const mocks = vi.hoisted(() => ({ access: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/number-state-flow-api", async original => ({
  ...await original<typeof import("@/lib/number-state-flow-api")>(), requireNumberStateReadAccessAsync: mocks.access
}));
vi.mock("@/lib/handoff-async", () => ({ listManufacturingHandoffEntriesAsync: mocks.list }));
import { GET } from "@/app/api/integrations/procurement/releases/route";
const request = (query = "") => new Request("https://pdm.example/api/integrations/procurement/releases" + query);
beforeEach(() => {
  vi.clearAllMocks();mocks.access.mockResolvedValue({ response: null, company: { companyId: "company-one" } });
  mocks.list.mockResolvedValue([]);
});
describe("procurement release response contract", () => {
  it("preserves access denial before reading the list", async () => {
    const denied = Response.json({ error: { code: "numbering_permission_denied" } }, { status: 403 });
    mocks.access.mockResolvedValueOnce({ response: denied });
    expect(await GET(request())).toBe(denied);expect(mocks.list).not.toHaveBeenCalled();
  });
  it("preserves a genuine empty list with private no-store", async () => {
    const response = await GET(request());expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ integration: "procurement", schema_version: 1, count: 0, entries: [] });
    expect(mocks.list).toHaveBeenCalledWith({ companyId: "company-one", limit: 200 });
  });
  it.each([new Error("SELECT private stack injected"), { sql: "secret" }, null])("does not turn dependency faults into empty success", async fault => {
    mocks.list.mockRejectedValueOnce(fault);
    const response = await GET(request());expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: { code: "number_state_internal", message: "發行清單目前無法讀取，請稍後再試。", retryable: false } });
  });
  it("preserves typed status and retryability", async () => {
    mocks.list.mockRejectedValueOnce(new NumberStateFlowError("number_state_internal", "safe reason", 503, true));
    const response = await GET(request());expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { message: "safe reason", retryable: true } });
  });
});
