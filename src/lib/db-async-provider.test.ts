import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createAsyncDatabaseClient } from "@/lib/db-async-provider";

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
