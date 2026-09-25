import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { createAsyncDatabaseClient } from "@/lib/db-async-provider";
import { createPdmCommand, createPlatformActorContext } from "@/lib/platform-command";
import { executePdmCommandWithOutbox } from "@/lib/platform-command-service";
import { PlatformOutboxAsyncRepository } from "@/lib/repositories/platform-outbox-async-repository";

const verifiedActor = {
  identityIssuer: "https://securetoken.google.com/jenfu-test",
  identitySubject: "provider-subject",
  principalId: "principal-verified",
  employeeId: "employee-one",
  localPrincipalId: "pdm-user-one",
  companyId: "company-one",
  sessionSchemaVersion: 2 as const
};

function actor(principalId = verifiedActor.principalId) {
  return createPlatformActorContext({
    pdmUserId: verifiedActor.localPrincipalId,
    organizationId: verifiedActor.companyId,
    principalId,
    authorizationActor: verifiedActor,
    requestId: "request-one"
  });
}

function command() {
  return createPdmCommand({
    commandName: "pdm.test.mutate",
    idempotencyKey: "operation-one",
    actor: actor(),
    payload: { value: 1 }
  });
}

describe("principal-first PDM command actor", () => {
  it("preserves opaque 200, 201 and 255-character verified principal IDs", () => {
    for (const length of [200, 201, 255]) {
      const principalId = "x".repeat(length);
      const context = createPlatformActorContext({
        pdmUserId: verifiedActor.localPrincipalId,
        organizationId: verifiedActor.companyId,
        authorizationActor: { ...verifiedActor, principalId },
        principalId
      });
      expect(context.principalId).toBe(principalId);
      expect(context.platformOrganizationId).toBeNull();
    }
    expect(() => createPlatformActorContext({
      pdmUserId: verifiedActor.localPrincipalId,
      organizationId: verifiedActor.companyId,
      authorizationActor: { ...verifiedActor, principalId: "x".repeat(256) }
    })).toThrow("PLATFORM_PRINCIPAL_ID_INVALID");
    expect(() => createPlatformActorContext({
      pdmUserId: verifiedActor.localPrincipalId,
      organizationId: verifiedActor.companyId,
      authorizationActor: { ...verifiedActor, principalId: "" }
    })).toThrow("PLATFORM_PRINCIPAL_ID_INVALID");
    expect(() => createPlatformActorContext({
      pdmUserId: verifiedActor.localPrincipalId,
      organizationId: verifiedActor.companyId,
      principalId: ""
    })).toThrow("PLATFORM_PRINCIPAL_ID_INVALID");
    expect(() => createPlatformActorContext({
      pdmUserId: verifiedActor.localPrincipalId,
      organizationId: verifiedActor.companyId,
      authorizationActor: verifiedActor,
      platformOrganizationId: "pdm-company:company-one"
    })).toThrow("PLATFORM_ACTOR_LEGACY_ORGANIZATION_FORBIDDEN");
  });

  it("rejects a caller-supplied principal or local profile that differs from the verified actor", () => {
    expect(() => actor("pdm:pdm-user-one")).toThrow("PLATFORM_ACTOR_PRINCIPAL_MISMATCH");
    expect(() => createPlatformActorContext({
      pdmUserId: verifiedActor.localPrincipalId,
      organizationId: verifiedActor.companyId,
      authorizationActor: { ...verifiedActor, principalId: "pdm:pdm-user-one" }
    })).toThrow("PLATFORM_ACTOR_PRINCIPAL_MISMATCH");
    expect(() => createPlatformActorContext({
      pdmUserId: "other-user",
      organizationId: verifiedActor.companyId,
      authorizationActor: verifiedActor
    })).toThrow("PLATFORM_ACTOR_PRINCIPAL_MISMATCH");
  });

  it("does not create a local principal when a verified actor has no matching profile", async () => {
    const execute = vi.fn();
    const client = {
      kind: "postgres",
      transaction: async (run: (database: AsyncDatabaseClient) => Promise<unknown>) => run(client as unknown as AsyncDatabaseClient),
      queryOne: vi.fn(async () => null),
      execute,
      query: vi.fn(async () => []),
      close: vi.fn(async () => undefined)
    } as unknown as AsyncDatabaseClient;
    await expect(executePdmCommandWithOutbox({
      client,
      command: command(),
      execute: vi.fn(async () => ({ ok: true })),
      event: () => ({ aggregateType: "test", aggregateId: "one", eventType: "changed", payload: {} })
    })).rejects.toThrow("PLATFORM_PRINCIPAL_COMMAND_CONTEXT_REQUIRED");
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not commit a principal command from a prior request's actor stamp", async () => {
    const client = {
      kind: "postgres",
      transaction: async (run: (database: AsyncDatabaseClient) => Promise<unknown>) => run(client as unknown as AsyncDatabaseClient),
      queryOne: vi.fn(async () => null),
      execute: vi.fn(async () => undefined),
      query: vi.fn(async () => []),
      close: vi.fn(async () => undefined)
    } as unknown as AsyncDatabaseClient;
    const mutate = vi.fn(async () => ({ ok: true }));
    await expect(executePdmCommandWithOutbox({
      client,
      command: command(),
      execute: mutate,
      event: () => ({ aggregateType: "test", aggregateId: "one", eventType: "changed", payload: {} })
    })).rejects.toThrow("PLATFORM_PRINCIPAL_COMMAND_CONTEXT_REQUIRED");
    expect(client.queryOne).not.toHaveBeenCalled();
    expect(client.execute).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("rejects every unverified PostgreSQL human command before selecting a legacy or principal marker", async () => {
    const unverified = createPdmCommand({ commandName: "pdm.test.mutate",
      idempotencyKey: "operation-unverified",
      actor: createPlatformActorContext({ pdmUserId: verifiedActor.localPrincipalId,
        organizationId: verifiedActor.companyId }), payload: { value: 1 } });
    const client = { kind: "postgres",
      transaction: async (run: (database: AsyncDatabaseClient) => Promise<unknown>) => run(client as unknown as AsyncDatabaseClient),
      queryOne: vi.fn(async (sql: string) => sql.includes("read_principal_cutover_for_command_v1")
        ? { status: "principal_active", principal_id: verifiedActor.principalId } : null)
    } as unknown as AsyncDatabaseClient;
    await expect(executePdmCommandWithOutbox({ client, command: unverified,
      execute: vi.fn(async () => ({ ok: true })),
      event: () => ({ aggregateType: "test", aggregateId: "one", eventType: "changed", payload: {} })
    })).rejects.toThrow("PLATFORM_ACTOR_VERIFICATION_REQUIRED");
    expect(client.queryOne).not.toHaveBeenCalled();
  });

  it("rejects the SQLite-only system sentinel on PostgreSQL before any read or write", async () => {
    const execute = vi.fn(async () => ({ ok: true }));
    const client = { kind: "postgres",
      transaction: async (run: (database: AsyncDatabaseClient) => Promise<unknown>) =>
        run(client as unknown as AsyncDatabaseClient),
      queryOne: vi.fn(async () => null),
      query: vi.fn(async () => []),
      execute: vi.fn(async () => undefined)
    } as unknown as AsyncDatabaseClient;
    const synthetic = createPdmCommand({ commandName: "pdm.test.mutate",
      idempotencyKey: "operation-system-sentinel",
      actor: createPlatformActorContext({ pdmUserId: "system",
        organizationId: "company-jenfu" }), payload: { value: 1 } });
    await expect(executePdmCommandWithOutbox({ client, command: synthetic,
      execute, event: () => ({ aggregateType: "test", aggregateId: "one",
        eventType: "changed", payload: {} })
    })).rejects.toThrow("PLATFORM_ACTOR_VERIFICATION_REQUIRED");
    expect(client.queryOne).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
    expect(client.execute).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("never lets a legacy mapping rewrite a command's asserted principal", async () => {
    const mutate = vi.fn(async () => ({ ok: true }));
    const client = {
      kind: "sqlite",
      transaction: async (run: (database: AsyncDatabaseClient) => Promise<unknown>) =>
        run(client as unknown as AsyncDatabaseClient),
      queryOne: vi.fn(async (sql: string) => sql.includes("FROM platform_principal_mappings")
        ? { platform_principal_id: "principal-from-mapping",
          pdm_user_id: verifiedActor.localPrincipalId, mapping_source: "shared_iam",
          mapping_status: "active", external_subject: verifiedActor.identitySubject }
        : null),
      execute: vi.fn(async () => undefined)
    } as unknown as AsyncDatabaseClient;
    const asserted = createPdmCommand({ commandName: "pdm.test.mutate",
      idempotencyKey: "operation-mapping-mismatch",
      actor: createPlatformActorContext({ pdmUserId: verifiedActor.localPrincipalId,
        organizationId: verifiedActor.companyId, principalId: "principal-from-request" }),
      payload: { value: 1 } });
    await expect(executePdmCommandWithOutbox({ client, command: asserted,
      execute: mutate,
      event: () => ({ aggregateType: "test", aggregateId: "one",
        eventType: "changed", payload: {} })
    })).rejects.toThrow("PLATFORM_ACTOR_PRINCIPAL_MISMATCH");
    expect(mutate).not.toHaveBeenCalled();
    expect(client.execute).not.toHaveBeenCalled();
  });

  it("rejects a legacy PostgreSQL command before consulting mapping or writing", async () => {
    const mutate = vi.fn(async () => ({ ok: true }));
    const client = {
      kind: "postgres",
      transaction: async (run: (database: AsyncDatabaseClient) => Promise<unknown>) => run(client as unknown as AsyncDatabaseClient),
      queryOne: vi.fn(async () => null),
      execute: vi.fn(async () => undefined),
      query: vi.fn(async () => [])
    } as unknown as AsyncDatabaseClient;
    const legacyCommand = createPdmCommand({ commandName: "pdm.test.legacy",
      idempotencyKey: "operation-legacy",
      actor: createPlatformActorContext({ pdmUserId: verifiedActor.localPrincipalId,
        organizationId: verifiedActor.companyId,
        authorizationActor: { ...verifiedActor, sessionSchemaVersion: undefined } }),
      payload: { value: 1 } });
    await expect(executePdmCommandWithOutbox({ client, command: legacyCommand,
      execute: mutate,
      event: () => ({ aggregateType: "test", aggregateId: "one", eventType: "changed", payload: {} })
    })).rejects.toThrow("PLATFORM_ACTOR_VERIFICATION_REQUIRED");
    expect(client.queryOne).not.toHaveBeenCalled();
    expect(client.execute).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("rejects a verified old target session after principal cutover", async () => {
    const oldSessionCommand = createPdmCommand({ commandName: "pdm.test.mutate",
      idempotencyKey: "operation-old-session",
      actor: createPlatformActorContext({ pdmUserId: verifiedActor.localPrincipalId,
        organizationId: verifiedActor.companyId,
        authorizationActor: { ...verifiedActor, sessionSchemaVersion: undefined } }),
      payload: { value: 1 } });
    const client = { kind: "postgres",
      transaction: async (run: (database: AsyncDatabaseClient) => Promise<unknown>) => run(client as unknown as AsyncDatabaseClient),
      queryOne: vi.fn(async (sql: string) => sql.includes("read_principal_cutover_for_command_v1")
        ? { status: "principal_active", principal_id: verifiedActor.principalId } : null)
    } as unknown as AsyncDatabaseClient;
    await expect(executePdmCommandWithOutbox({ client, command: oldSessionCommand,
      execute: vi.fn(async () => ({ ok: true })),
      event: () => ({ aggregateType: "test", aggregateId: "one", eventType: "changed", payload: {} })
    })).rejects.toThrow("PLATFORM_ACTOR_VERIFICATION_REQUIRED");
  });

  it("rejects replay of a receipt created for a different principal", async () => {
    const client = {
      queryOne: vi.fn(async () => ({
        id: "receipt-one",
        command_name: "pdm.test.mutate",
        schema_version: 1,
        command_status: "completed",
        response_json: JSON.stringify({ __platformCommandReceiptVersion: 2, result: { ok: true } }),
        actor_id: verifiedActor.localPrincipalId,
        principal_id: "principal-other",
        platform_principal_id: null,
        platform_organization_id: null
      }))
    } as unknown as AsyncDatabaseClient;
    await expect(new PlatformOutboxAsyncRepository(client).findCompletedCommand(command()))
      .rejects.toThrow("PLATFORM_COMMAND_ACTOR_MISMATCH");
  });

  it("does not replay a legacy receipt without a verified principal binding", async () => {
    const client = {
      queryOne: vi.fn(async () => ({
        id: "receipt-one",
        command_name: "pdm.test.mutate",
        schema_version: 1,
        command_status: "completed",
        response_json: JSON.stringify({ __platformCommandReceiptVersion: 2, result: { ok: true } }),
        actor_id: verifiedActor.localPrincipalId,
        principal_id: null,
        platform_principal_id: verifiedActor.principalId,
        platform_organization_id: null
      }))
    } as unknown as AsyncDatabaseClient;
    await expect(new PlatformOutboxAsyncRepository(client).findCompletedCommand(command()))
      .rejects.toThrow("PLATFORM_COMMAND_ACTOR_MISMATCH");
  });

  it("writes a v2 command and outbox with the canonical principal only", async () => {
    const writes: Array<{ sql: string; params: Record<string, unknown> }> = [];
    const client = {
      queryOne: vi.fn(async (sql: string, params: Record<string, unknown>) => {
        writes.push({ sql, params });
        return { id: "receipt-one" };
      }),
      execute: vi.fn(async (sql: string, params: Record<string, unknown>) => {
        writes.push({ sql, params });
      })
    } as unknown as AsyncDatabaseClient;
    const repository = new PlatformOutboxAsyncRepository(client);
    const principalCommand = command();
    await repository.claimCommand(principalCommand);
    await repository.enqueue({ command: principalCommand, aggregateType: "item",
      aggregateId: "item-one", eventType: "item.changed", payload: {} });
    expect(writes).toHaveLength(2);
    for (const write of writes) {
      expect(write.sql).toContain(":principalId");
      expect(write.params).toMatchObject({ actorId: "pdm-user-one",
        principalId: "principal-verified", platformPrincipalId: null,
        platformOrganizationId: null });
    }
  });

  it("fails the command when an outbox key collides instead of silently dropping its event", async () => {
    const database = new Database(":memory:");
    try {
      database.exec(`CREATE TABLE platform_outbox_events (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL, aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL, event_type TEXT NOT NULL, schema_version INTEGER NOT NULL,
        payload_json TEXT NOT NULL, actor_id TEXT, principal_id TEXT,
        platform_principal_id TEXT, platform_organization_id TEXT,
        correlation_id TEXT NOT NULL, idempotency_key TEXT NOT NULL,
        delivery_status TEXT NOT NULL, attempt_count INTEGER NOT NULL,
        occurred_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(company_id,event_type,idempotency_key)
      )`);
      const client = createAsyncDatabaseClient({ kind: "sqlite", database });
      const repository = new PlatformOutboxAsyncRepository(client);
      const event = { command: command(), aggregateType: "item", aggregateId: "item-one",
        eventType: "item.changed", payload: { id: "item-one" } };
      await repository.enqueue(event);
      await expect(repository.enqueue({ ...event, payload: { id: "item-two" } }))
        .rejects.toThrow("PLATFORM_OUTBOX_IDEMPOTENCY_CONFLICT");
      expect(database.prepare("SELECT COUNT(*) AS count FROM platform_outbox_events").get())
        .toMatchObject({ count: 1 });
    } finally {
      database.close();
    }
  });

  it("completes only its claimed principal receipt in the database", async () => {
    const database = new Database(":memory:");
    try {
      database.exec(`CREATE TABLE platform_command_receipts (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL, command_name TEXT NOT NULL,
        idempotency_key TEXT NOT NULL, actor_id TEXT, principal_id TEXT,
        platform_principal_id TEXT, platform_organization_id TEXT,
        command_status TEXT NOT NULL, response_json TEXT NOT NULL, completed_at TEXT,
        UNIQUE(company_id,command_name,idempotency_key)
      )`);
      const add = database.prepare(`INSERT INTO platform_command_receipts
        (id,company_id,command_name,idempotency_key,actor_id,principal_id,
         platform_principal_id,platform_organization_id,command_status,response_json)
        VALUES (?,?,?,?,?,?,NULL,NULL,'processing','{}')`);
      add.run("receipt-one", "company-one", "pdm.test.mutate", "operation-one",
        "pdm-user-one", "principal-verified");
      add.run("receipt-two", "company-one", "pdm.test.mutate", "operation-two",
        "pdm-user-one", "principal-other");
      const repository = new PlatformOutboxAsyncRepository(
        createAsyncDatabaseClient({ kind: "sqlite", database }));
      await repository.completeCommand(command(), { ok: true });
      const otherCommand = { ...command(), idempotencyKey: "operation-two" };
      await expect(repository.completeCommand(otherCommand, { ok: true }))
        .rejects.toThrow("PLATFORM_COMMAND_RECEIPT_NOT_CLAIMED");
      expect(database.prepare(`SELECT command_status FROM platform_command_receipts WHERE id='receipt-one'`).get())
        .toMatchObject({ command_status: "completed" });
      expect(database.prepare(`SELECT command_status FROM platform_command_receipts WHERE id='receipt-two'`).get())
        .toMatchObject({ command_status: "processing" });
    } finally {
      database.close();
    }
  });

  it("replays only the completed receipt bound to its canonical actor", async () => {
    let claimed: Record<string, unknown> | null = null;
    let completed: Record<string, unknown> | null = null;
    const client = {
      queryOne: vi.fn(async (sql: string, params: Record<string, unknown>) => {
        if (sql.includes("INSERT INTO platform_command_receipts")) {
          claimed = params;
          return { id: "receipt-one" };
        }
        if (sql.includes("UPDATE platform_command_receipts")) {
          completed = params;
          return { id: "receipt-one" };
        }
        if (!claimed || !completed) return null;
        return {
          id: "receipt-one", command_name: "pdm.test.mutate", schema_version: 1,
          command_status: "completed", response_json: completed.responseJson,
          actor_id: claimed.actorId, principal_id: claimed.principalId,
          platform_principal_id: claimed.platformPrincipalId,
          platform_organization_id: claimed.platformOrganizationId
        };
      }),
      execute: vi.fn()
    } as unknown as AsyncDatabaseClient;
    const repository = new PlatformOutboxAsyncRepository(client);
    const principalCommand = command();
    expect(await repository.claimCommand(principalCommand, { request: "same" })).toBe(true);
    await repository.completeCommand(principalCommand, { ok: true }, { request: "same" });
    await expect(repository.findCompletedCommand(principalCommand, { request: "same" }))
      .resolves.toEqual({ completed: true, result: { ok: true } });
    await expect(repository.findCompletedCommand(principalCommand, { request: "changed" }))
      .rejects.toThrow("PLATFORM_COMMAND_ACTOR_MISMATCH");
    await repository.completeCommand(principalCommand, null, { request: "same" });
    await expect(repository.findCompletedCommand(principalCommand, { request: "same" }))
      .resolves.toEqual({ completed: true, result: null });
    await expect(repository.completeCommand(principalCommand, undefined, { request: "same" }))
      .rejects.toThrow("PLATFORM_COMMAND_RESULT_REQUIRED");
    const completeParams = completed as Record<string, unknown> | null;
    if (!completeParams) throw new Error("missing completed receipt");
    const invalidEnvelope = JSON.parse(String(completeParams.responseJson)) as Record<string, unknown>;
    delete invalidEnvelope.result;
    completed = { ...completeParams, responseJson: JSON.stringify(invalidEnvelope) };
    await expect(repository.findCompletedCommand(principalCommand, { request: "same" }))
      .rejects.toThrow("PLATFORM_COMMAND_RECEIPT_INVALID");
  });
});
