import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "@/lib/db-async-provider";
import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncReleaseRepository } from "@/lib/repositories/release-async-repository";

function client(kind: "postgres" | "sqlite"): AsyncDatabaseClient {
  return {
    kind,
    query: vi.fn(async () => []),
    queryOne: vi.fn(async () => null),
    execute: vi.fn(async () => undefined),
    transaction: vi.fn(async (run) => run(client(kind))),
    close: vi.fn(async () => undefined)
  } as unknown as AsyncDatabaseClient;
}

describe("async readonly share audit subject", () => {
  it("fails closed before PostgreSQL share creation without Principal/company audit binding", async () => {
    const database = client("postgres");
    const repository = new AsyncReleaseRepository(database);

    await expect(repository.createReadonlyShare({
      submissionId: "submission-one", tokenHash: "a".repeat(64), label: "review",
      expiresAt: "2026-11-01T00:00:00.000Z", createdBy: "profile-one"
    })).rejects.toThrow("PLATFORM_PRINCIPAL_AUDIT_REQUIRED");
    expect(database.execute).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
    expect(database.queryOne).not.toHaveBeenCalled();
  });

  it("fails closed before PostgreSQL share revocation without Principal/company audit binding", async () => {
    const database = client("postgres");
    const repository = new AsyncReleaseRepository(database);

    await expect(repository.revokeReadonlyShare({
      submissionId: "submission-one", shareId: "share-one", revokedBy: "profile-one"
    })).rejects.toThrow("PLATFORM_PRINCIPAL_AUDIT_REQUIRED");
    expect(database.execute).not.toHaveBeenCalled();
    expect(database.query).not.toHaveBeenCalled();
    expect(database.queryOne).not.toHaveBeenCalled();
  });

  it("keeps legacy SQLite compatibility without inventing a Principal audit", async () => {
    const database = client("sqlite");
    const repository = new AsyncReleaseRepository(database);

    await repository.createReadonlyShare({
      submissionId: "submission-one", tokenHash: "a".repeat(64), label: "review",
      expiresAt: "2026-11-01T00:00:00.000Z", createdBy: "profile-one"
    });

    expect(database.execute).toHaveBeenCalledTimes(2);
  });
});


describe("supplier response query SQLite compatibility", () => {
  it.each([
    { shareId: undefined, ids: ["b-new", "a-open", "a-closed"] },
    { shareId: "a", ids: ["a-open", "a-closed"] }
  ])("preserves real SQLite filtering and ordering for $shareId", async input => {
    const database = new Database(":memory:");
    database.exec(`CREATE TABLE users(id TEXT PRIMARY KEY, display_name TEXT);
      CREATE TABLE readonly_shares(id TEXT PRIMARY KEY, label TEXT);
      CREATE TABLE supplier_portal_responses(id TEXT PRIMARY KEY,submission_id TEXT,share_id TEXT,status TEXT,created_at TEXT,closed_by TEXT);
      INSERT INTO readonly_shares VALUES('a','A'),('b','B');
      INSERT INTO supplier_portal_responses VALUES
        ('a-open','submission-one','a','open','2026-09-01',NULL),
        ('a-closed','submission-one','a','closed','2026-09-03',NULL),
        ('b-new','submission-one','b','open','2026-09-02',NULL),
        ('other-submission','submission-other','a','open','2026-09-04',NULL);`);
    try {
      const repository = new AsyncReleaseRepository(createAsyncDatabaseClient({ kind: "sqlite", database }));
      expect((await repository.listSupplierPortalResponses({ submissionId: "submission-one", shareId: input.shareId })).map(row => row.id)).toEqual(input.ids);
      expect(database.prepare("SELECT count(*) AS count FROM supplier_portal_responses").get()).toEqual({count:4});
    } finally { database.close(); }
  });
});
