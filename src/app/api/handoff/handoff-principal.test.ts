import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  list: vi.fn()
}));
vi.mock("@/lib/number-state-flow-api", () => ({
  requireNumberStateReadAccessAsync: mocks.authorize
}));
vi.mock("@/lib/handoff-async", () => ({
  listManufacturingHandoffEntriesAsync: mocks.list
}));

import { GET as handoff } from "./route";
import { GET as exportHandoff } from "./export/route";
import { GET as procurement } from "../integrations/procurement/releases/route";

const request = new Request("https://ai-pdm.example.test/api/handoff");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([]);
});

describe("mounted handoff and procurement principal reads", () => {
  it("returns authorization denial without querying business data", async () => {
    mocks.authorize.mockResolvedValue({ response: Response.json({ code: "permission_denied" }, { status: 403 }) });
    for (const route of [handoff, exportHandoff, procurement]) {
      expect((await route(request)).status).toBe(403);
    }
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("uses exact published capabilities and verified company for each read", async () => {
    mocks.authorize.mockResolvedValue({
      response: null, company: { companyId: "company-1" }
    });
    expect((await handoff(request)).status).toBe(200);
    expect((await exportHandoff(request)).status).toBe(200);
    expect((await procurement(request)).status).toBe(200);
    expect(mocks.authorize.mock.calls.map((call) => call[1])).toEqual([
      "handoff.published.view", "handoff.published.view", "integration.procurement.view"
    ]);
    expect(mocks.list.mock.calls.map((call) => call[0])).toEqual([
      { companyId: "company-1" }, { companyId: "company-1" },
      { companyId: "company-1", limit: 200 }
    ]);
  });
});
