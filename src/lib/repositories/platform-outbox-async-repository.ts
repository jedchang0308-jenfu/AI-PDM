import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { canonicalJsonStringify } from "@/lib/canonical-json";
import type { PdmCommand } from "@/lib/platform-command";

type CommandReceiptRow = {
  id: string;
  command_name: string;
  schema_version: number;
  command_status: "processing" | "completed";
  response_json: string | Record<string, unknown>;
  actor_id: string | null;
  principal_id: string | null;
  platform_principal_id: string | null;
  platform_organization_id: string | null;
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
  principalId: string | null;
  platformPrincipalId: string | null;
  platformOrganizationId: string | null;
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
  principal_id: string | null;
  platform_principal_id: string | null;
  platform_organization_id: string | null;
  correlation_id: string;
  idempotency_key: string;
  delivery_status: PlatformOutboxEvent["deliveryStatus"];
  attempt_count: number;
  occurred_at: string;
};

function parseJson<T>(value: string | T): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

type CommandReceiptEnvelope<TResult = unknown> = {
  __platformCommandReceiptVersion: 2;
  payloadHash?: string;
  actorBinding?: {
    version: 2;
    actorKind: "human";
    principalId: string;
    companyId: string;
  };
  result?: TResult;
};

function idempotencyPayloadHash(payload: unknown) {
  return crypto.createHash("sha256").update(canonicalJsonStringify(payload)).digest("hex");
}

function commandPayloadHash(command: PdmCommand<unknown>, idempotencyPayload: unknown) {
  return idempotencyPayloadHash({ commandPayload: command.payload, idempotencyPayload });
}

function verifiedActorBinding(command: PdmCommand<unknown>): CommandReceiptEnvelope["actorBinding"] {
  if (!command.actor.authorizationActor) return undefined;
  return {
    version: 2,
    actorKind: "human",
    principalId: command.actor.principalId,
    companyId: command.actor.organizationId
  };
}

function commandPrincipalColumns(command: PdmCommand<unknown>) {
  const actorId = command.actor.pdmUserId === "system" ? null : command.actor.pdmUserId;
  const canonical = command.actor.authorizationActor?.sessionSchemaVersion === 2;
  if (canonical && !actorId) throw new Error("PLATFORM_COMMAND_ACTOR_MISMATCH");
  return {
    actorId,
    principalId: canonical ? command.actor.principalId : null,
    platformPrincipalId: !canonical && actorId ? command.actor.principalId : null,
    platformOrganizationId: canonical ? null : command.actor.platformOrganizationId
  };
}

function receiptEnvelope<TResult>(value: unknown): CommandReceiptEnvelope<TResult> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<CommandReceiptEnvelope<TResult>>;
  return record.__platformCommandReceiptVersion === 2
    ? record as CommandReceiptEnvelope<TResult>
    : null;
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
    principalId: row.principal_id,
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

  async findCompletedCommand<TResult>(command: PdmCommand<unknown>, idempotencyPayload?: unknown): Promise<
    { completed: false } | { completed: true; result: TResult }
  > {
    const row = await this.client.queryOne<CommandReceiptRow>(
      `
      SELECT id, command_name, schema_version, command_status, response_json, actor_id,
             principal_id, platform_principal_id, platform_organization_id
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
    if (!row) return { completed: false };
    if (row.command_name !== command.commandName || Number(row.schema_version) !== command.schemaVersion) {
      throw new Error("PLATFORM_COMMAND_SCHEMA_MISMATCH");
    }
    const expected = commandPrincipalColumns(command);
    if (row.actor_id !== expected.actorId
      || row.principal_id !== expected.principalId
      || row.platform_principal_id !== expected.platformPrincipalId
      || row.platform_organization_id !== expected.platformOrganizationId) {
      throw new Error("PLATFORM_COMMAND_ACTOR_MISMATCH");
    }
    const parsed = parseJson<unknown>(row.response_json as string | unknown);
    const envelope = receiptEnvelope<TResult>(parsed);
    const verifiedBinding = verifiedActorBinding(command);
    if (verifiedBinding && (
      !envelope?.actorBinding
      || envelope.actorBinding.version !== verifiedBinding.version
      || envelope.actorBinding.actorKind !== verifiedBinding.actorKind
      || envelope.actorBinding.principalId !== verifiedBinding.principalId
      || envelope.actorBinding.companyId !== verifiedBinding.companyId
      || envelope.payloadHash !== commandPayloadHash(command, idempotencyPayload)
    )) throw new Error("PLATFORM_COMMAND_ACTOR_MISMATCH");
    if (
      !verifiedBinding &&
      idempotencyPayload !== undefined &&
      envelope?.payloadHash &&
      envelope.payloadHash !== idempotencyPayloadHash(idempotencyPayload)
    ) {
      throw new Error("PLATFORM_COMMAND_IDEMPOTENCY_PAYLOAD_MISMATCH");
    }
    if (row.command_status !== "completed") return { completed: false };
    if (envelope && !Object.prototype.hasOwnProperty.call(envelope, "result")) {
      throw new Error("PLATFORM_COMMAND_RECEIPT_INVALID");
    }
    return { completed: true, result: envelope ? envelope.result as TResult : parsed as TResult };
  }

  async claimCommand(command: PdmCommand<unknown>, idempotencyPayload?: unknown): Promise<boolean> {
    const row = await this.client.queryOne<{ id: string }>(
      `
      INSERT INTO platform_command_receipts (
        id, company_id, command_name, schema_version, idempotency_key,
        actor_id, principal_id, platform_principal_id, platform_organization_id,
        correlation_id, command_status, response_json, created_at
      ) VALUES (
        :id, :companyId, :commandName, :schemaVersion, :idempotencyKey,
        :actorId, :principalId, :platformPrincipalId, :platformOrganizationId,
        :correlationId, 'processing', :responseJson, :createdAt
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
        ...commandPrincipalColumns(command),
        correlationId: command.actor.correlationId,
        responseJson: JSON.stringify({
          __platformCommandReceiptVersion: 2,
          ...(verifiedActorBinding(command)
            ? { payloadHash: commandPayloadHash(command, idempotencyPayload), actorBinding: verifiedActorBinding(command) }
            : idempotencyPayload === undefined ? {} : { payloadHash: idempotencyPayloadHash(idempotencyPayload) })
        } satisfies CommandReceiptEnvelope),
        createdAt: this.clock()
      }
    );
    return Boolean(row);
  }

  async completeCommand<TResult>(command: PdmCommand<unknown>, result: TResult, idempotencyPayload?: unknown): Promise<void> {
    if (result === undefined) throw new Error("PLATFORM_COMMAND_RESULT_REQUIRED");
    const completed = await this.client.queryOne<{ id: string }>(
      `
      UPDATE platform_command_receipts
      SET command_status = 'completed', response_json = :responseJson, completed_at = :completedAt
      WHERE company_id = :companyId
        AND command_name = :commandName
        AND idempotency_key = :idempotencyKey
        AND command_status = 'processing'
        AND actor_id IS NOT DISTINCT FROM :actorId
        AND principal_id IS NOT DISTINCT FROM :principalId
        AND platform_principal_id IS NOT DISTINCT FROM :platformPrincipalId
        AND platform_organization_id IS NOT DISTINCT FROM :platformOrganizationId
      RETURNING id
      `,
      {
        companyId: command.actor.organizationId,
        commandName: command.commandName,
        idempotencyKey: command.idempotencyKey,
        ...commandPrincipalColumns(command),
        responseJson: JSON.stringify({
          __platformCommandReceiptVersion: 2,
          ...(verifiedActorBinding(command)
            ? { payloadHash: commandPayloadHash(command, idempotencyPayload), actorBinding: verifiedActorBinding(command) }
            : idempotencyPayload === undefined ? {} : { payloadHash: idempotencyPayloadHash(idempotencyPayload) }),
          result
        } satisfies CommandReceiptEnvelope<TResult>),
        completedAt: this.clock()
      }
    );
    if (!completed) throw new Error("PLATFORM_COMMAND_RECEIPT_NOT_CLAIMED");
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
    const inserted = await this.client.queryOne<{ id: string }>(
      `
      INSERT INTO platform_outbox_events (
        id, company_id, aggregate_type, aggregate_id, event_type, schema_version,
        payload_json, actor_id, principal_id, platform_principal_id, platform_organization_id,
        correlation_id, idempotency_key, delivery_status,
        attempt_count, occurred_at, updated_at
      ) VALUES (
        :id, :companyId, :aggregateType, :aggregateId, :eventType, :schemaVersion,
        :payloadJson, :actorId, :principalId, :platformPrincipalId, :platformOrganizationId,
        :correlationId, :idempotencyKey, 'pending',
        0, :occurredAt, :occurredAt
      )
      ON CONFLICT(company_id, event_type, idempotency_key) DO NOTHING
      RETURNING id
      `,
      {
        id: this.idFactory(),
        companyId: input.command.actor.organizationId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        schemaVersion: input.command.schemaVersion,
        payloadJson: JSON.stringify(input.payload),
        ...commandPrincipalColumns(input.command),
        correlationId: input.command.actor.correlationId,
        idempotencyKey: eventIdempotencyKey,
        occurredAt: this.clock()
      }
    );
    if (!inserted) throw new Error("PLATFORM_OUTBOX_IDEMPOTENCY_CONFLICT");
  }

  async listPending(limit = 50): Promise<PlatformOutboxEvent[]> {
    const rows = await this.client.query<OutboxRow>(
      `
      SELECT id, company_id, aggregate_type, aggregate_id, event_type, schema_version,
             payload_json, actor_id, principal_id, platform_principal_id, platform_organization_id,
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
