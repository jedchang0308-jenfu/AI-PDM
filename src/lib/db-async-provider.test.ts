import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createAsyncDatabaseClient, resolvePdmAsyncDatabaseSearchPath } from "@/lib/db-async-provider";

describe("PostgreSQL runtime search path", () => {
  it("pins local principal sandbox connections to the owned schema and pg_catalog", () => {
    expect(resolvePdmAsyncDatabaseSearchPath({
      NODE_ENV: "development",
      PDM_LOCAL_PRINCIPAL_SANDBOX: "1"
    })).toBe("ai_pdm_core,pg_catalog");
  });

  it("does not add public or enable the local path outside its explicit development lane", () => {
    expect(resolvePdmAsyncDatabaseSearchPath({
      NODE_ENV: "production",
      PDM_LOCAL_PRINCIPAL_SANDBOX: "1"
    })).toBeUndefined();
    expect(resolvePdmAsyncDatabaseSearchPath({
      NODE_ENV: "development",
      PDM_LOCAL_PRINCIPAL_SANDBOX: "0"
    })).toBeUndefined();
  });

  it("keeps the existing DEV010 boundary path", () => {
    expect(resolvePdmAsyncDatabaseSearchPath({
      DEV010_N2_DATABASE_BOUNDARY: "required"
    })).toBe("ai_pdm_core,pg_catalog");
  });
});

describe("SQLite application schema compatibility", () => {
  it("maps the owned ai_pdm_core schema to SQLite main without weakening sibling boundaries", async () => {
    const database = new Database(":memory:");
    database.exec("CREATE TABLE account_session_records (id TEXT PRIMARY KEY)");
    const client = createAsyncDatabaseClient({ kind: "sqlite", database });

    await client.execute(
      "INSERT INTO ai_pdm_core.account_session_records (id) VALUES (:id)",
      { id: "session-1" }
    );

    expect(await client.queryOne<{ id: string }>(
      "SELECT id FROM ai_pdm_core.account_session_records WHERE id = :id",
      { id: "session-1" }
    )).toEqual({ id: "session-1" });
    await expect(client.query("SELECT id FROM orgmaster_core.account_session_records")).rejects.toThrow();
    database.close();
  });
});
