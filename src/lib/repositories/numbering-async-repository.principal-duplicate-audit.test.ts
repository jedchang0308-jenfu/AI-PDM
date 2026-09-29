import { describe, expect, it } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";

type Write = { sql: string; params: Record<string, unknown> };

function fakePostgres() {
  const writes: Write[] = [];
  const client = {
    kind: "postgres",
    query: async () => [],
    queryOne: async () => null,
    execute: async (sql: string, params: Record<string, unknown>) => {
      writes.push({ sql, params });
    },
    transaction: async (run: (client: AsyncDatabaseClient) => Promise<unknown>) => run(client as AsyncDatabaseClient)
  } as unknown as AsyncDatabaseClient;
  return { client, writes };
}

describe("Principal duplicate-check audit", () => {
  it("requires a verified security subject before PostgreSQL reads or writes", async () => {
    const { client, writes } = fakePostgres();
    const repository = new AsyncNumberingRepository(client, () => "2026-09-29T00:00:00Z",
      () => "event-1");
    await expect(repository.checkNumberingDuplicates({
      companyId: "company-jenfu", coreName: "motor", createdBy: "profile-1"
    })).rejects.toThrow("NUMBERING_DUPLICATE_CHECK_PRINCIPAL_REQUIRED");
    expect(writes).toEqual([]);
  });

  it("rejects a missing verified company before a PostgreSQL query", async () => {
    const { client, writes } = fakePostgres();
    const repository = new AsyncNumberingRepository(client);
    await expect(repository.checkNumberingDuplicates({
      coreName: "motor", createdBy: "profile-1"
    }, { principalId: "principal-1", profileVersion: 7 }))
      .rejects.toThrow("NUMBERING_DUPLICATE_CHECK_PRINCIPAL_REQUIRED");
    expect(writes).toEqual([]);
  });

  it("keeps the profile FK but stamps the audit security actor as Principal", async () => {
    const { client, writes } = fakePostgres();
    const repository = new AsyncNumberingRepository(client, () => "2026-09-29T00:00:00Z",
      () => crypto.randomUUID());
    const result = await repository.checkNumberingDuplicates({
      companyId: "company-jenfu", coreName: "motor", createdBy: "profile-1"
    }, { principalId: "principal-1", profileVersion: 7 });
    expect(result.matches).toEqual([]);
    const event = writes.find(({ sql }) => sql.includes("INSERT INTO duplicate_check_events"));
    const audit = writes.find(({ sql }) => sql.includes("INSERT INTO audit_logs"));
    expect(event?.params.createdBy).toBe("profile-1");
    expect(audit?.params.actorId).toBe("profile-1");
    expect(audit?.sql).toContain("company_id");
    expect(audit?.params.companyId).toBe("company-jenfu");
    expect(audit?.params.scopeKind).toBe("tenant");
    expect(JSON.parse(String(audit?.params.detailJson)).securityActor).toEqual({
      principalId: "principal-1", profileVersion: 7,
      actorKind: "human", reason: "numbering_duplicate_check"
    });
  });
});
