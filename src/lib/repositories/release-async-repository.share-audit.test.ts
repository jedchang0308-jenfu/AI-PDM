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
