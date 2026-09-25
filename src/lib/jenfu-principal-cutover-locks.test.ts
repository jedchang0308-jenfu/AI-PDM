import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  lockPrincipalCutoverOwnerSources, PRINCIPAL_CUTOVER_LOCKED_RELATIONS
} from "@/lib/jenfu-principal-cutover-locks";

const INPUT_HASH = "a".repeat(64);
const COHORT_HASH = "b".repeat(64);

function client(isolation = "read committed", receipt: Record<string, unknown> | null = null) {
  const calls: Array<{ sql: string; params?: unknown }> = [];
  const connection = {
    kind: "postgres",
    queryOne: vi.fn(async (sql: string) => sql.includes("principal_identity_operations")
      ? receipt : { isolation_level: isolation, read_only: "off" }),
    execute: vi.fn(async (sql: string, params?: unknown) => {
      calls.push({ sql, params });
    })
  } as unknown as AsyncDatabaseClient;
  return { connection, calls };
}

describe("principal cutover owner lock order", () => {
  it("serializes operation, then sorted subjects, then the complete fixed relation manifest", async () => {
    const { connection, calls } = client();
    const result = await lockPrincipalCutoverOwnerSources(
      connection, "operation-one", ["user-z", "user-a"], INPUT_HASH, COHORT_HASH);
    expect(result).toEqual({ status: "locked" });
    expect(calls[0].sql).toContain("aipdm-dev121-cutover-operation");
    expect(calls.slice(1, 3).map((call) => call.params))
      .toEqual([{ pdmUserId: "user-a" }, { pdmUserId: "user-z" }]);
    expect(calls.slice(3).map((call) => call.sql.trim()))
      .toEqual(PRINCIPAL_CUTOVER_LOCKED_RELATIONS.map((relation) =>
        `LOCK TABLE ${relation} IN SHARE ROW EXCLUSIVE MODE`));
  });

  it("reads a committed replay without taking cohort or table locks", async () => {
    const { connection, calls } = client("read committed", {
      operation_kind: "cutover", input_hash: INPUT_HASH,
      cohort_hash: COHORT_HASH, result_json: { committed: true }
    });
    expect(await lockPrincipalCutoverOwnerSources(
      connection, "operation-one", ["user-a"], INPUT_HASH, COHORT_HASH))
      .toEqual({ status: "replayed", result: { committed: true } });
    expect(calls).toHaveLength(1);
  });

  it("does not replay a different input under the same operation ID", async () => {
    const { connection, calls } = client("read committed", {
      operation_kind: "cutover", input_hash: "c".repeat(64),
      cohort_hash: COHORT_HASH, result_json: {}
    });
    await expect(lockPrincipalCutoverOwnerSources(
      connection, "operation-one", ["user-a"], INPUT_HASH, COHORT_HASH))
      .rejects.toThrow("PRINCIPAL_CUTOVER_OPERATION_CONFLICT");
    expect(calls).toHaveLength(1);
  });

  it("rejects stale-snapshot isolation before acquiring a lock", async () => {
    const { connection, calls } = client("repeatable read");
    await expect(lockPrincipalCutoverOwnerSources(
      connection, "operation-one", ["user-a"], INPUT_HASH, COHORT_HASH))
      .rejects.toThrow("PRINCIPAL_CUTOVER_ISOLATION_INVALID");
    expect(calls).toHaveLength(0);
  });
});
