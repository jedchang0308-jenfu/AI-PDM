import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  list: vi.fn(),
  listPublishedTransferHandoffs: vi.fn()
}));
vi.mock("@/lib/number-state-flow-api", async original => ({
  ...await original<typeof import("@/lib/number-state-flow-api")>(),
  requireNumberStateReadAccessAsync: mocks.authorize
}));
vi.mock("@/lib/handoff-async", () => ({
  listManufacturingHandoffEntriesAsync: mocks.list
}));
vi.mock("@/lib/transfer-package-phase1d", async original => ({
  ...await original<typeof import("@/lib/transfer-package-phase1d")>(),
  listPublishedTransferHandoffs: mocks.listPublishedTransferHandoffs
}));

import { GET as handoff } from "./route";
import { GET as exportHandoff } from "./export/route";
import { GET as procurement } from "../integrations/procurement/releases/route";
import { GET as exportTechnicalTransfer } from "../technical-transfer/[id]/export/route";

const request = new Request("https://ai-pdm.example.test/api/handoff");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([]);
  mocks.listPublishedTransferHandoffs.mockResolvedValue([]);
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

  it("serializes a Postgres released_at Date and preserves handoff CSV quoting", async () => {
    mocks.authorize.mockResolvedValue({ response: null, company: { companyId: "company-1" } });
    mocks.list.mockResolvedValue([{
      id: "submission-1",
      drawing_number: 'DWG"1',
      revision: "A\r\nB",
      part_number: "PART-1",
      part_name: "Part 1",
      material: "Steel",
      surface_finish: "None",
      document_type: "PDF",
      released_at: new Date("2026-10-24T01:02:03.000Z"),
      change_description: 'Changed "quoted"\r\nline',
      release_package: null,
      files: [],
      approvals: []
    }]);

    const response = await exportHandoff(request);
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(csv).toContain('"2026-10-24T01:02:03.000Z"');
    expect(csv).toContain('"DWG""1"');
    expect(csv).toContain('"A\r\nB"');
    expect(csv).toContain('"Changed ""quoted""\r\nline"');
  });

  it("serializes a Postgres publishedAt Date and preserves transfer CSV quoting", async () => {
    mocks.authorize.mockResolvedValue({ response: null, company: { companyId: "company-1" } });
    mocks.listPublishedTransferHandoffs.mockResolvedValue([{
      id: "transfer-1",
      packageCode: "TP-1",
      title: "Published transfer",
      caseType: "drawing_revision",
      publishedAt: new Date("2026-10-24T02:03:04.000Z"),
      items: [{ type: "drawing_number", id: "drawing-1", code: 'DWG"1\r\nA' }]
    }]);

    const response = await exportTechnicalTransfer(request, {
      params: Promise.resolve({ id: "transfer-1" })
    });
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(csv).toContain('"2026-10-24T02:03:04.000Z"');
    expect(csv).toContain('"DWG""1\r\nA"');
  });
});
