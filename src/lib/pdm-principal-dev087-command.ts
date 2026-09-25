import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { dev087RequestHash } from "@/lib/pdm-canonical-command";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";

type PrincipalReceiptRow = {
  id: string;
  actor_id: string | null;
  principal_id: string | null;
  platform_principal_id: string | null;
  platform_organization_id: string | null;
  command_status: string;
  request_hash: string | null;
  effect_key: string | null;
  response_json: unknown;
};

type PrincipalResultEnvelope<T> = {
  actorBinding: { version: 2; actorKind: "human"; principalId: string; companyId: string };
  result: T;
};

function conflict(correlationId: string) {
  return new CanonicalWorkbenchError("IDEMPOTENCY_KEY_REUSED", "本次操作未執行", 422, correlationId);
}

function requireReceiptResult<T>(row: PrincipalReceiptRow, verified: VerifiedPrincipalRequest,
  correlationId: string): T {
  let payload = row.response_json;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload) as unknown; }
    catch { throw conflict(correlationId); }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw conflict(correlationId);
  const envelope = payload as Partial<PrincipalResultEnvelope<T>>;
  if (envelope.actorBinding?.version !== 2 || envelope.actorBinding.actorKind !== "human" ||
      envelope.actorBinding.principalId !== verified.session.principalId ||
      envelope.actorBinding.companyId !== verified.profile.companyId ||
      !Object.prototype.hasOwnProperty.call(envelope, "result")) throw conflict(correlationId);
  return envelope.result as T;
}

/** Execute under the same serializable write transaction that verified the target session. */
export async function runPrincipalDev087Command<T>(
  tx: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest,
  input: {
    command: string; idempotencyKey: string; request: unknown;
    effectKey: string; correlationId: string;
  },
  execute: (client: AsyncDatabaseClient) => Promise<T>
): Promise<T> {
  const { profile, session } = verified;
  if (tx.kind !== "postgres" || tx.transactionScope !== "postgres" ||
      session.contractVersion !== "jenfu.ai-pdm-session.v2" || session.appId !== "ai-pdm" ||
      !session.principalId || !profile.pdmUserId || !profile.companyId ||
      !input.command.trim() || !input.effectKey.trim() ||
      !input.idempotencyKey.trim() || input.idempotencyKey.length > 200) {
    throw new Error("PRINCIPAL_DEV087_CONTEXT_INVALID");
  }
  const isolation = await tx.queryOne<{ level: string }>(
    "SELECT current_setting('transaction_isolation') AS level");
  if (isolation?.level !== "serializable") throw new Error("PRINCIPAL_DEV087_SERIALIZABLE_REQUIRED");
  const commandName = `dev087:${input.command.trim()}`;
  const requestHash = dev087RequestHash(input.request);
  const key = { companyId: profile.companyId, commandName,
    idempotencyKey: input.idempotencyKey };
  const current = await tx.queryOne<PrincipalReceiptRow>(`
    SELECT id,actor_id,principal_id,platform_principal_id,platform_organization_id,
           command_status,request_hash,effect_key,response_json
    FROM ai_pdm_core.platform_command_receipts
    WHERE company_id=:companyId AND command_name=:commandName
      AND idempotency_key=:idempotencyKey
    FOR UPDATE
  `, key);
  if (current) {
    if (current.actor_id !== profile.pdmUserId ||
        current.principal_id !== session.principalId ||
        current.platform_principal_id !== null ||
        current.platform_organization_id !== null ||
        current.request_hash !== requestHash ||
        current.effect_key !== input.effectKey) throw conflict(input.correlationId);
    if (current.command_status !== "completed") {
      throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT",
        "操作仍在處理中，請稍後再試", 409, input.correlationId);
    }
    return requireReceiptResult<T>(current, verified, input.correlationId);
  }
  const receiptId = crypto.randomUUID();
  await tx.execute(`
    INSERT INTO ai_pdm_core.platform_command_receipts
      (id,company_id,command_name,schema_version,idempotency_key,actor_id,principal_id,
       correlation_id,command_status,response_json,request_hash,effect_key)
    VALUES (:id,:companyId,:commandName,1,:idempotencyKey,:actorId,:principalId,
            :correlationId,'processing','{}',:requestHash,:effectKey)
  `, { ...key, id: receiptId, actorId: profile.pdmUserId,
    principalId: session.principalId, correlationId: input.correlationId,
    requestHash, effectKey: input.effectKey });
  const result = await execute(tx);
  if (result === undefined) throw new Error("PRINCIPAL_DEV087_RESULT_REQUIRED");
  const envelope: PrincipalResultEnvelope<T> = {
    actorBinding: { version: 2, actorKind: "human",
      principalId: session.principalId, companyId: profile.companyId },
    result
  };
  const updated = await tx.query<{ id: string }>(`
    UPDATE ai_pdm_core.platform_command_receipts
    SET command_status='completed',response_json=:responseJson,completed_at=CURRENT_TIMESTAMP
    WHERE id=:id AND company_id=:companyId AND actor_id=:actorId
      AND principal_id=:principalId AND platform_principal_id IS NULL
      AND platform_organization_id IS NULL AND command_status='processing'
    RETURNING id
  `, { id: receiptId, companyId: profile.companyId, actorId: profile.pdmUserId,
    principalId: session.principalId, responseJson: JSON.stringify(envelope) });
  if (updated.length !== 1 || updated[0].id !== receiptId) {
    throw new Error("PRINCIPAL_DEV087_RECEIPT_INCOMPLETE");
  }
  return result;
}
