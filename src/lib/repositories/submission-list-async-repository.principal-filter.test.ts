import { describe, expect, it, vi } from "vitest";
import { AsyncDashboardRepository } from "@/lib/repositories/dashboard-async-repository";
import { AsyncSubmissionListRepository } from "@/lib/repositories/submission-list-async-repository";

type TestDb = { kind: "postgres" | "sqlite"; query: ReturnType<typeof vi.fn> };
function client(kind: "postgres" | "sqlite" = "postgres"): TestDb {
  return { kind, query: vi.fn(async () => []), queryOne: vi.fn(async () => null),
    execute: vi.fn(async () => undefined), transaction: vi.fn(), close: vi.fn() } as unknown as TestDb;
}

describe("DEV-123 SQL filtering for dynamic submission scope", () => {
  it("applies visible IDs before list grouping and pagination", async () => {
    const db = client();
    await new AsyncSubmissionListRepository(db as never).listSubmissions({ companyId: "company-one",
      visibleSubmissionIds: ["submission-one", "submission-two"], limit: 11, offset: 20 });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql.indexOf("jsonb_array_elements_text")).toBeLessThan(sql.indexOf("GROUP BY"));
    expect(sql.indexOf("GROUP BY")).toBeLessThan(sql.indexOf("LIMIT :limit"));
    expect(params).toMatchObject({ visibleSubmissionIdsJson: '["submission-one","submission-two"]' });
  });

  it("applies visible IDs to search SQL before result limiting", async () => {
    const db = client();
    await new AsyncSubmissionListRepository(db as never).searchSubmissions({ query: "drawing", companyId: "company-one",
      visibleSubmissionIds: ["submission-one"] });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql.indexOf("jsonb_array_elements_text")).toBeLessThan(sql.indexOf("GROUP BY"));
    expect(sql.indexOf("GROUP BY")).toBeLessThan(sql.indexOf("LIMIT :limit"));
    expect(params).toMatchObject({ visibleSubmissionIdsJson: '["submission-one"]' });
  });

  it("applies the same visible IDs before dashboard status aggregation", async () => {
    const db = client();
    await new AsyncDashboardRepository(db as never).getDashboardMetrics({ companyId: "company-one", visibleSubmissionIds: [] });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql.indexOf("jsonb_array_elements_text")).toBeLessThan(sql.indexOf("GROUP BY"));
    expect(params).toMatchObject({ visibleSubmissionIdsJson: "[]" });
  });

  it("uses SQLite JSON table filtering when the scoped development adapter is active", async () => {
    const db = client("sqlite");
    await new AsyncSubmissionListRepository(db as never).listSubmissions({ visibleSubmissionIds: [] });
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain("json_each(:visibleSubmissionIdsJson)");
  });
});
