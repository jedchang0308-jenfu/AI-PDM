import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmCommand } from "@/lib/platform-command";

type CommandReceiptRow = {
  id: string;
  command_status: "processing" | "completed";
  response_json: string | Record<string, unknown>;
};

export type PlatformOutboxEvent = {
  id: string;
  companyId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
  actorId: string | null;
  platformPrincipalId: string | null;
  platformOrganizationId: string;
  correlationId: string;
  idempotencyKey: string;
  deliveryStatus: "pending" | "publishing" | "published" | "failed";
  attemptCount: number;
  occurredAt: string;
};

type OutboxRow = {
  id: string;
  company_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  schema_version: number;
  payload_json: string | Record<string, unknown>;
  actor_id: string | null;
  platform_principal_id: string | null;
  platform_organization_id: string;
  correlation_id: string;
  idempotency_key: string;
  delivery_status: PlatformOutboxEvent["deliveryStatus"];
  attempt_count: number;
  occurred_at: string;
};

function parseJson<T>(value: string | T): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

function mapOutbox(row: OutboxRow): PlatformOutboxEvent {
  return {
    id: row.id,
    companyId: row.company_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    schemaVersion: Number(row.schema_version),
    payload: parseJson<Record<string, unknown>>(row.payload_json),
    actorId: row.actor_id,
    platformPrincipalId: row.platform_principal_id,
    platformOrganizationId: row.platform_organization_id,
    correlationId: row.correlation_id,
    idempotencyKey: row.idempotency_key,
    deliveryStatus: row.delivery_status,
    attemptCount: Number(row.attempt_count),
    occurredAt: row.occurred_at
  };
}

export class PlatformOutboxAsyncRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async findCompletedCommand<TResult>(command: PdmCommand<unknown>): Promise<TResult | null> {
    const row = await this.client.queryOne<CommandReceiptRow>(
      `
      SELECT id, command_status, response_json
      FROM platform_command_receipts
      WHERE company_id = :companyId
        AND command_name = :commandName
        AND idempotency_key = :idempotencyKey
      `,
      {
        companyId: command.actor.organizationId,
        commandName: command.commandName,
        idempotencyKey: command.idempotencyKey
      }
    );
    if (!row || row.command_status !== "completed") return null;
    return parseJson<TResult>(row.response_json as string | TResult);
  }

  async claimCommand(command: PdmCommand<unknown>): Promise<boolean> {
    const row = await this.client.queryOne<{ id: string }>(
      `
      INSERT INTO platform_command_receipts (
        id, company_id, command_name, schema_version, idempotency_key,
        actor_id, platform_principal_id, platform_organization_id,
        correlation_id, command_status, response_json, created_at
      ) VALUES (
        :id, :companyId, :commandName, :schemaVersion, :idempotencyKey,
        :actorId, :platformPrincipalId, :platformOrganizationId,
        :correlationId, 'processing', '{}', :createdAt
      )
      ON CONFLICT(company_id, command_name, idempotency_key) DO NOTHING
      RETURNING id
      `,
      {
        id: this.idFactory(),
        companyId: command.actor.organizationId,
        commandName: command.commandName,
        schemaVersion: command.schemaVersion,
        idempotencyKey: command.idempotencyKey,
        actorId: command.actor.pdmUserId === "system" ? null : command.actor.pdmUserId,
        platformPrincipalId: command.actor.pdmUserId === "system" ? null : command.actor.principalId,
        platformOrganizationId: command.actor.platformOrganizationId,
        correlationId: command.actor.correlationId,
        createdAt: this.clock()
      }
    );
    return Boolean(row);
  }

  async completeCommand<TResult>(command: PdmCommand<unknown>, result: TResult): Promise<void> {
    await this.client.execute(
      `
      UPDATE platform_command_receipts
      SET command_status = 'completed', response_json = :responseJson, completed_at = :completedAt
      WHERE company_id = :companyId
        AND command_name = :commandName
        AND idempotency_key = :idempotencyKey
        AND command_status = 'processing'
      `,
      {
        companyId: command.actor.organizationId,
        commandName: command.commandName,
        idempotencyKey: command.idempotencyKey,
        responseJson: JSON.stringify(result),
        completedAt: this.clock()
      }
    );
  }

  async enqueue(input: {
    command: PdmCommand<unknown>;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    idempotencyKeySuffix?: string;
  }): Promise<void> {
    const eventIdempotencyKey = input.idempotencyKeySuffix
      ? `${input.command.idempotencyKey}:${input.idempotencyKeySuffix}`
      : input.command.idempotencyKey;
    await this.client.execute(
      `
      INSERT INTO platform_outbox_events (
        id, company_id, aggregate_type, aggregate_id, event_type, schema_version,
        payload_json, actor_id, platform_principal_id, platform_organization_id,
        correlation_id, idempotency_key, delivery_status,
        attempt_count, occurred_at, updated_at
      ) VALUES (
        :id, :companyId, :aggregateType, :aggregateId, :eventType, :schemaVersion,
        :payloadJson, :actorId, :platformPrincipalId, :platformOrganizationId,
        :correlationId, :idempotencyKey, 'pending',
        0, :occurredAt, :occurredAt
      )
      ON CONFLICT(company_id, event_type, idempotency_key) DO NOTHING
      `,
      {
        id: this.idFactory(),
        companyId: input.command.actor.organizationId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        schemaVersion: input.command.schemaVersion,
        payloadJson: JSON.stringify(input.payload),
        actorId: input.command.actor.pdmUserId === "system" ? null : input.command.actor.pdmUserId,
        platformPrincipalId:
          input.command.actor.pdmUserId === "system" ? null : input.command.actor.principalId,
        platformOrganizationId: input.command.actor.platformOrganizationId,
        correlationId: input.command.actor.correlationId,
        idempotencyKey: eventIdempotencyKey,
        occurredAt: this.clock()
      }
    );
  }

  async listPending(limit = 50): Promise<PlatformOutboxEvent[]> {
    const rows = await this.client.query<OutboxRow>(
      `
      SELECT id, company_id, aggregate_type, aggregate_id, event_type, schema_version,
             payload_json, actor_id, platform_principal_id, platform_organization_id,
             correlation_id, idempotency_key, delivery_status,
             attempt_count, occurred_at
      FROM platform_outbox_events
      WHERE delivery_status IN ('pending', 'failed')
        AND (next_attempt_at IS NULL OR next_attempt_at <= :now)
      ORDER BY occurred_at ASC, id ASC
      LIMIT :limit
      `,
      { now: this.clock(), limit: Math.max(1, Math.min(200, Math.trunc(limit))) }
    );
    return rows.map(mapOutbox);
  }

  async markPublished(eventId: string): Promise<void> {
    const now = this.clock();
    await this.client.execute(
      `UPDATE platform_outbox_events
       SET delivery_status = 'published', published_at = :now, last_error = NULL, updated_at = :now
       WHERE id = :eventId`,
      { eventId, now }
    );
  }

  async markFailed(eventId: string, redactedError: string, nextAttemptAt: string): Promise<void> {
    await this.client.execute(
      `UPDATE platform_outbox_events
       SET delivery_status = 'failed', attempt_count = attempt_count + 1,
           last_error = :lastError, next_attempt_at = :nextAttemptAt, updated_at = :now
       WHERE id = :eventId`,
      {
        eventId,
        lastError: redactedError.slice(0, 1000),
        nextAttemptAt,
        now: this.clock()
      }
    );
  }
}
