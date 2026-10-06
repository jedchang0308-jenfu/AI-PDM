import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { dev087RequestHash } from "@/lib/pdm-canonical-command";
import { DrawingRevisionWorkAsyncRepository } from "@/lib/repositories/drawing-revision-work-async-repository";

function fakeClient(kind: "postgres" | "sqlite" = "postgres") {
  const query = vi.fn();
  return {
    client: { kind, transactionScope: kind === "postgres" ? "postgres" : "local",
      query, queryOne: vi.fn(), execute: vi.fn() } as unknown as AsyncDatabaseClient,
    query
  };
}

function formalMasterRow(overrides: Record<string, unknown> = {}) {
  return {
    drawing_id: "drawing-one",
    drawing_company_id: "company-one",
    formal_drawing_number_id: "master-one",
    mapped_drawing_number: "D-001",
    master_id: "master-one",
    master_company_id: "company-one",
    master_drawing_number: "D-001",
    master_status: "Draft",
    master_updated_at: "2026-10-03 01:02:03",
    master_purpose_code: "M",
    master_purpose_description: "Main",
    master_is_primary_manufacturing: 1,
    formal_number_match_count: 1,
    ...overrides
  };
}

describe("Drawing revision mapped master lifecycle basis", () => {
  it("locks the exact same-company mapping and normalizes the master hash fields", async () => {
    const { client, query } = fakeClient();
    query.mockResolvedValueOnce([formalMasterRow()]);
    const basis = await new DrawingRevisionWorkAsyncRepository(client)
      .readMasterLifecycleBasis(client, {
        companyId: "company-one", drawingId: "drawing-one", targetMinor: 0,
        required: true
      });
    expect(basis).toEqual({
      intent: "production_release",
      masterId: "master-one",
      masterStatus: "Draft",
      masterHash: dev087RequestHash({
        id: "master-one", recordStatus: "Draft",
        updatedAt: "2026-10-03T01:02:03.000Z",
        purposeCode: "M", purposeDescription: "Main",
        isPrimaryManufacturing: true
      }),
      formalRowVersion: null
    });
    expect(query.mock.calls[0]?.[0]).toContain(
      "drawing.company_id = :companyId");
    expect(query.mock.calls[0]?.[0]).toContain(
      "master.company_id = drawing.company_id");
    expect(query.mock.calls[0]?.[0]).toContain(
      "FOR UPDATE OF drawing, master");
  });

  it("allows an unmapped minor to retain the existing RD-only path but rejects an unmapped major", async () => {
    const minor = fakeClient();
    minor.query.mockResolvedValueOnce([]);
    await expect(new DrawingRevisionWorkAsyncRepository(minor.client)
      .readMasterLifecycleBasis(minor.client, {
        companyId: "company-one", drawingId: "drawing-one", targetMinor: 1
      })).resolves.toBeNull();

    const major = fakeClient();
    major.query.mockResolvedValueOnce([]);
    await expect(new DrawingRevisionWorkAsyncRepository(major.client)
      .readMasterLifecycleBasis(major.client, {
        companyId: "company-one", drawingId: "drawing-one", targetMinor: 0,
        required: true
      })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects missing, duplicate, cross-company, and mismatched formal-number mappings", async () => {
    const cases = [
      [],
      [formalMasterRow(), formalMasterRow({ master_id: "master-two" })],
      [formalMasterRow({ master_company_id: "company-other" })],
      [formalMasterRow({ formal_number_match_count: 2 })],
      [formalMasterRow({ mapped_drawing_number: "D-OTHER" })]
    ];
    for (const rows of cases) {
      const { client, query } = fakeClient();
      query.mockResolvedValueOnce(rows);
      await expect(new DrawingRevisionWorkAsyncRepository(client)
        .readMasterLifecycleBasis(client, {
          companyId: "company-one", drawingId: "drawing-one", targetMinor: 0,
          required: true
        })).rejects.toMatchObject({ status: 409 });
    }
  });

  it.each(["Obsolete", "Merged", "MainDrawingInvalid", "PendingAdminConfirm",
    "Cancelled"])("does not revive terminal or admin-gated master status %s", async (status) => {
    const { client, query } = fakeClient();
    query.mockResolvedValueOnce([formalMasterRow({ master_status: status })]);
    await expect(new DrawingRevisionWorkAsyncRepository(client)
      .readMasterLifecycleBasis(client, {
        companyId: "company-one", drawingId: "drawing-one", targetMinor: 0,
        required: true
      })).rejects.toMatchObject({ status: 409 });
  });

  it("allows rejected correction data and blocks a PendingReview with another open request", async () => {
    const rejected = fakeClient();
    rejected.query.mockResolvedValueOnce([
      formalMasterRow({ master_status: "Rejected" })
    ]);
    await expect(new DrawingRevisionWorkAsyncRepository(rejected.client)
      .readMasterLifecycleBasis(rejected.client, {
        companyId: "company-one", drawingId: "drawing-one", targetMinor: 0,
        required: true
      })).resolves.toMatchObject({ masterStatus: "Rejected" });

    const pending = fakeClient();
    pending.query.mockResolvedValueOnce([
      formalMasterRow({ master_status: "PendingReview" })
    ]).mockResolvedValueOnce([{ id: "other-active-review" }]);
    await expect(new DrawingRevisionWorkAsyncRepository(pending.client)
      .readMasterLifecycleBasis(pending.client, {
        companyId: "company-one", drawingId: "drawing-one", targetMinor: 0,
        required: true
      })).rejects.toMatchObject({ status: 409 });
    expect(pending.query).toHaveBeenCalledTimes(2);
  });

  it("updates only the exact mapped master after rechecking its frozen basis", async () => {
    const { client, query } = fakeClient();
    const row = formalMasterRow();
    const lifecycleBasis = {
      intent: "production_release" as const,
      masterId: "master-one",
      masterStatus: "Draft",
      masterHash: dev087RequestHash({
        id: "master-one", recordStatus: "Draft",
        updatedAt: "2026-10-03T01:02:03.000Z",
        purposeCode: "M", purposeDescription: "Main",
        isPrimaryManufacturing: true
      }),
      formalRowVersion: null
    };
    query.mockResolvedValueOnce([row]).mockResolvedValueOnce([
      { id: "master-one" }
    ]);
    await new DrawingRevisionWorkAsyncRepository(client)
      .releaseMasterForProduction(client, {
        companyId: "company-one", drawingId: "drawing-one", lifecycleBasis
      });
    expect(query.mock.calls[1]?.[0]).toContain("UPDATE drawing_numbers");
    expect(query.mock.calls[1]?.[0]).toContain(
      "WHERE id = :masterId AND company_id = :companyId");
    expect(query.mock.calls[1]?.[0]).not.toContain("part_root");
    expect(query.mock.calls[1]?.[1]).toMatchObject({
      masterId: "master-one", companyId: "company-one", expectedStatus: "Draft"
    });
  });

  it("fails closed if the exact master update returns no row", async () => {
    const { client, query } = fakeClient();
    const lifecycleBasis = {
      intent: "production_release" as const,
      masterId: "master-one",
      masterStatus: "Draft",
      masterHash: dev087RequestHash({
        id: "master-one", recordStatus: "Draft",
        updatedAt: "2026-10-03T01:02:03.000Z",
        purposeCode: "M", purposeDescription: "Main",
        isPrimaryManufacturing: true
      }),
      formalRowVersion: null
    };
    query.mockResolvedValueOnce([formalMasterRow()]).mockResolvedValueOnce([]);
    await expect(new DrawingRevisionWorkAsyncRepository(client)
      .releaseMasterForProduction(client, {
        companyId: "company-one", drawingId: "drawing-one", lifecycleBasis
      })).rejects.toMatchObject({ status: 409 });
  });
});
