import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  dev087RequestHash, replayCanonicalTerminalReceipt, runCanonicalIdempotentCommand
} from "@/lib/pdm-canonical-command";

const request = { workId: "work-one", expectedRowVersion: 2 };
const replayInput = {
  companyId: "company-one", actorId: "reviewer-one", command: "review.decision",
  idempotencyKey: "decision-one", request, correlationId: "correlation-one"
};

function completedRow(actorId: string | null, principalId: string | null = null) {
  return { command_status: "completed", response_json: JSON.stringify({ acknowledged: true }),
    request_hash: dev087RequestHash(request), actor_id: actorId, principal_id: principalId };
}

describe("canonical command receipt actor binding", () => {
  it("replays only to the same actor, rejecting unbound and principal receipts", async () => {
    let row = completedRow("reviewer-one");
    const client = { queryOne: vi.fn(async () => row) } as unknown as AsyncDatabaseClient;
    await expect(replayCanonicalTerminalReceipt(client, replayInput))
      .resolves.toEqual({ acknowledged: true });
    await expect(replayCanonicalTerminalReceipt(client, { ...replayInput, actorId: "reviewer-two" }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", status: 422 });
    row = completedRow(null);
    await expect(replayCanonicalTerminalReceipt(client, replayInput))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", status: 422 });
    row = completedRow("reviewer-one", "principal-one");
    await expect(replayCanonicalTerminalReceipt(client, replayInput))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", status: 422 });
  });

  it("does not execute a command when a locked existing receipt belongs to another actor", async () => {
    const execute = vi.fn();
    const client = { kind: "sqlite", queryOne: vi.fn(async () => completedRow("reviewer-one")),
      transaction: async (run: (tx: AsyncDatabaseClient) => Promise<unknown>) => run(client as AsyncDatabaseClient),
      execute } as unknown as AsyncDatabaseClient;
    const mutate = vi.fn();
    await expect(runCanonicalIdempotentCommand(client, {
      ...replayInput, actorId: "reviewer-two", effectKey: "review-one", terminalReview: true
    }, mutate)).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", status: 422 });
    expect(mutate).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("retains the terminal reviewer as receipt actor for a safe retry", async () => {
    const writes: Array<{ sql: string; params?: Record<string, unknown> }> = [];
    const client = { kind: "sqlite",
      transaction: async (run: (tx: AsyncDatabaseClient) => Promise<unknown>) => run(client as AsyncDatabaseClient),
      queryOne: vi.fn(async (sql: string) => sql.includes("FROM platform_organization_mappings")
        ? { platform_organization_id: "pdm-company:company-one" } : null),
      execute: vi.fn(async (sql: string, params?: Record<string, unknown>) => {
        writes.push({ sql, params });
      }) } as unknown as AsyncDatabaseClient;
    await expect(runCanonicalIdempotentCommand(client, {
      ...replayInput, effectKey: "review-one", terminalReview: true
    }, async () => ({ hidden: true }))).resolves.toEqual({ acknowledged: true });
    const insert = writes.find((write) => write.sql.includes("INSERT INTO platform_command_receipts"));
    const complete = writes.find((write) => write.sql.includes("UPDATE platform_command_receipts"));
    expect(insert?.params?.actorId).toBe("reviewer-one");
    expect(complete?.sql).not.toContain("actor_id = NULL");
    expect(complete?.params?.actorId).toBeUndefined();
  });

  it("retire-fences the legacy command after principal cutover", async () => {
    const client = { kind: "postgres",
      transaction: async (run: (tx: AsyncDatabaseClient) => Promise<unknown>) =>
        run(client as AsyncDatabaseClient),
      queryOne: vi.fn(async (sql: string) => sql.includes("read_principal_cutover_for_command_v1")
        ? { status: "principal_active" } : null),
      execute: vi.fn() } as unknown as AsyncDatabaseClient;
    const mutate = vi.fn();
    await expect(runCanonicalIdempotentCommand(client, {
      ...replayInput, effectKey: "review-one"
    }, mutate)).rejects.toMatchObject({ code: "WORKBENCH_COMMAND_CONTRACT_RETIRED", status: 410 });
    expect(mutate).not.toHaveBeenCalled();
    expect(client.execute).not.toHaveBeenCalled();
  });

  it("does not treat a missing or unknown marker as legacy authorization", async () => {
    const mutate = vi.fn();
    let marker: { status: string } | null = null;
    const client = { kind: "postgres",
      transaction: async (run: (tx: AsyncDatabaseClient) => Promise<unknown>) =>
        run(client as AsyncDatabaseClient),
      queryOne: vi.fn(async () => marker),
      execute: vi.fn()
    } as unknown as AsyncDatabaseClient;
    for (marker of [null, { status: "unexpected" }]) {
      await expect(runCanonicalIdempotentCommand(client, {
        ...replayInput, effectKey: "review-one"
      }, mutate)).rejects.toMatchObject({
        code: "WORKBENCH_PRINCIPAL_MARKER_REQUIRED", status: 503
      });
    }
    expect(mutate).not.toHaveBeenCalled();
    expect(client.execute).not.toHaveBeenCalled();
  });

  it("does not create an organization mapping for a PostgreSQL legacy command", async () => {
    const client = { kind: "postgres",
      transaction: async (run: (tx: AsyncDatabaseClient) => Promise<unknown>) =>
        run(client as AsyncDatabaseClient),
      queryOne: vi.fn(async (sql: string) => {
        if (sql.includes("read_principal_cutover_for_command_v1")) return { status: "legacy_compatible" };
        if (sql.includes("FROM platform_organization_mappings")) return {
          platform_organization_id: "existing-organization"
        };
        return null;
      }),
      execute: vi.fn() } as unknown as AsyncDatabaseClient;
    await runCanonicalIdempotentCommand(client, {
      ...replayInput, effectKey: "review-one"
    }, async () => ({ acknowledged: true }));
    expect(client.execute).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO platform_organization_mappings"), expect.anything());
  });
});
