import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { PdmWorkReviewAsyncRepository } from
  "@/lib/repositories/pdm-work-review-async-repository";

describe("legacy reviewer selection during principal cutover", () => {
  it("never selects a principal-active account from historical users.role", async () => {
    const database = new Database(":memory:");
    try {
      database.exec(`
        CREATE TABLE users (id TEXT PRIMARY KEY, company_id TEXT, role TEXT,
          account_status TEXT, system_role_enabled INTEGER);
        CREATE TABLE user_company_memberships (user_id TEXT, company_id TEXT);
        CREATE TABLE user_role_assignments (user_id TEXT, role_id TEXT, revoked_at TEXT);
        CREATE TABLE roles (id TEXT PRIMARY KEY, role_code TEXT, enabled INTEGER);
        CREATE TABLE principal_identity_cutovers (pdm_user_id TEXT PRIMARY KEY, status TEXT);
        INSERT INTO users VALUES
          ('principal-reviewer','company-one','R&D Manager','active',1),
          ('legacy-reviewer','company-one','Admin','active',1);
        INSERT INTO principal_identity_cutovers VALUES
          ('principal-reviewer','principal_active');
      `);
      // Execute the production SQL against an isolated relational database.
      // Only schema qualification is removed for SQLite's in-memory fixture.
      const client = {
        kind: "postgres",
        query: async <T>(sql: string, params: Record<string, unknown>) =>
          database.prepare(sql.replaceAll("ai_pdm_core.", "")).all(params) as T[]
      } as AsyncDatabaseClient;
      const repository = new PdmWorkReviewAsyncRepository(client);
      const input = { companyId: "company-one", ownerUserId: "owner" };
      expect(await repository.selectReviewer(client, input)).toBe("legacy-reviewer");

      database.prepare(`INSERT INTO principal_identity_cutovers VALUES
        ('legacy-reviewer','principal_active')`).run();
      await expect(repository.selectReviewer(client, input))
        .rejects.toThrow("找不到可指派的審核負責人");
    } finally {
      database.close();
    }
  });
});
