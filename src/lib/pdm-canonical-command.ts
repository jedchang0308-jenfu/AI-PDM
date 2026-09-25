import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}
export function dev087RequestHash(value: unknown) {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

type ReceiptRow = {
  command_status: "processing" | "completed";
  response_json: string | Record<string, unknown>;
  request_hash: string | null;
  actor_id: string | null;
  principal_id: string | null;
};

function requireSameLegacyActor(row: ReceiptRow, actorId: string, correlationId: string) {
  // A principal receipt must never be replayed through the old command path.
  // Historical terminal receipts without an actor remain readable for audit,
  // but cannot return a result to an arbitrary current user.
  if (!actorId || row.actor_id !== actorId || row.principal_id !== null) {
    throw new CanonicalWorkbenchError("IDEMPOTENCY_KEY_REUSED", "本次操作未執行", 422, correlationId);
  }
}

function commandName(command: string, namespace: "canonical" | "dev087") {
  const normalized = command.trim();
  if (!normalized) throw new Error("CANONICAL_COMMAND_NAME_REQUIRED");
  return namespace === "dev087" ? `dev087:${normalized}` : normalized;
}

export async function replayCanonicalTerminalReceipt<T>(client: AsyncDatabaseClient, input: {
  companyId: string;
  actorId: string;
  command: string;
  idempotencyKey: string;
  request: unknown;
  correlationId: string;
}): Promise<T | null> {
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) return null;
  const canonicalName = commandName(input.command, "canonical");
  const row = await client.queryOne<ReceiptRow>(
    `SELECT command_status, response_json, request_hash, actor_id, principal_id FROM platform_command_receipts
      WHERE company_id = :companyId AND command_name = :commandName AND idempotency_key = :idempotencyKey`,
    { companyId: input.companyId, commandName: canonicalName, idempotencyKey: input.idempotencyKey }
  );
  if (!row) return null;
  requireSameLegacyActor(row, input.actorId, input.correlationId);
  if (row.request_hash !== dev087RequestHash(input.request)) {
    throw new CanonicalWorkbenchError("IDEMPOTENCY_KEY_REUSED", "本次操作未執行", 422, input.correlationId);
  }
  if (row.command_status !== "completed") {
    throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "操作仍在處理中，請稍後再試", 409, input.correlationId);
  }
  return (typeof row.response_json === "string" ? JSON.parse(row.response_json) : row.response_json) as T;
}

export async function replayDev087TerminalReceipt<T>(client: AsyncDatabaseClient, input: {
  companyId: string;
  actorId: string;
  command: string;
  idempotencyKey: string;
  request: unknown;
  correlationId: string;
}): Promise<T | null> {
  return replayCanonicalTerminalReceipt(client, { ...input, command: commandName(input.command, "dev087") });
}

export async function runCanonicalIdempotentCommand<T>(client: AsyncDatabaseClient, input: {
  companyId: string;
  actorId: string;
  command: string;
  idempotencyKey: string;
  request: unknown;
  effectKey: string;
  correlationId: string;
  terminalReview?: boolean;
}, execute: (tx: AsyncDatabaseClient) => Promise<T>): Promise<T> {
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 200) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "缺少有效的 Idempotency-Key", 400, input.correlationId);
  }
  const persistedCommandName = commandName(input.command, "canonical");
  const requestHash = dev087RequestHash(input.request);
  return client.transaction(async (tx) => {
    if (tx.kind === "postgres") {
      const cutover = await tx.queryOne<{ status: string }>(`
        SELECT status FROM ai_pdm_core.read_principal_cutover_for_command_v1(:pdmUserId)
      `, { pdmUserId: input.actorId });
      if (cutover?.status === "principal_active") {
        throw new CanonicalWorkbenchError("WORKBENCH_COMMAND_CONTRACT_RETIRED",
          "請從正式入口重新登入後操作", 410, input.correlationId);
      }
      if (cutover?.status !== "legacy_compatible") {
        throw new CanonicalWorkbenchError("WORKBENCH_PRINCIPAL_MARKER_REQUIRED",
          "目前無法確認帳號的權限來源，請稍後再試", 503, input.correlationId);
      }
    }
    const lock = tx.kind === "postgres" ? " FOR UPDATE" : "";
    const existing = await tx.queryOne<ReceiptRow>(
      `SELECT command_status, response_json, request_hash, actor_id, principal_id FROM platform_command_receipts
        WHERE company_id = :companyId AND command_name = :commandName AND idempotency_key = :idempotencyKey${lock}`,
      { companyId: input.companyId, commandName: persistedCommandName, idempotencyKey: input.idempotencyKey }
    );
    if (existing) {
      requireSameLegacyActor(existing, input.actorId, input.correlationId);
      if (existing.request_hash !== requestHash) throw new CanonicalWorkbenchError("IDEMPOTENCY_KEY_REUSED", "本次操作未執行", 422, input.correlationId);
      if (existing.command_status !== "completed") throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "操作仍在處理中，請稍後再試", 409, input.correlationId);
      return (typeof existing.response_json === "string" ? JSON.parse(existing.response_json) : existing.response_json) as T;
    }
    if (tx.kind !== "postgres") {
      const organizationId = `pdm:${input.companyId}`;
      await tx.execute(
        `INSERT OR IGNORE INTO platform_organization_mappings (platform_organization_id, pdm_company_id, mapping_source, mapping_status)
         VALUES (:organizationId, :companyId, 'current_pdm', 'active')`,
        { organizationId, companyId: input.companyId }
      );
    }
    const mapping = await tx.queryOne<{ platform_organization_id: string }>(
      `SELECT platform_organization_id FROM platform_organization_mappings WHERE pdm_company_id = :companyId`, { companyId: input.companyId }
    );
    if (!mapping) throw new Error("DEV087_PLATFORM_ORGANIZATION_MAPPING_MISSING");
    const receiptId = crypto.randomUUID();
    await tx.execute(
      `INSERT INTO platform_command_receipts (
         id, company_id, command_name, schema_version, idempotency_key, actor_id,
         platform_organization_id, correlation_id, command_status, response_json, request_hash, effect_key
       ) VALUES (
         :id, :companyId, :commandName, 1, :idempotencyKey, :actorId,
         :organizationId, :correlationId, 'processing', '{}', :requestHash, :effectKey
       )`,
      {
        id: receiptId, companyId: input.companyId, commandName: persistedCommandName, idempotencyKey: input.idempotencyKey,
         actorId: input.actorId, organizationId: mapping.platform_organization_id, correlationId: input.correlationId,
        requestHash, effectKey: input.effectKey
      }
    );
    const result = await execute(tx);
    const response = input.terminalReview ? ({ acknowledged: true } as T) : result;
    await tx.execute(
      `UPDATE platform_command_receipts SET command_status = 'completed', response_json = :responseJson,
         completed_at = CURRENT_TIMESTAMP, platform_principal_id = NULL
       WHERE id = :id`,
      { id: receiptId, responseJson: JSON.stringify(response) }
    );
    return response;
  }, { serializable: true });
}

export async function runDev087IdempotentCommand<T>(client: AsyncDatabaseClient, input: {
  companyId: string;
  actorId: string;
  command: string;
  idempotencyKey: string;
  request: unknown;
  effectKey: string;
  correlationId: string;
  terminalReview?: boolean;
}, execute: (tx: AsyncDatabaseClient) => Promise<T>): Promise<T> {
  return runCanonicalIdempotentCommand(client, { ...input, command: commandName(input.command, "dev087") }, execute);
}
