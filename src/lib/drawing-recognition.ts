import crypto from "node:crypto";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  DrawingRecognitionError,
  requireSafeRecognitionId,
  type DrawingRecognitionAdapterCompletion,
  type DrawingRecognitionDecisionInput,
  type DrawingRecognitionSourceContextType
} from "@/lib/drawing-recognition-contract";
import { isDrawingRecognitionV1Enabled } from "@/lib/number-state-flow-feature";
import { createPdmCommand, type PdmCommandMetadata } from "@/lib/platform-command";
import { executePdmCommandWithOutbox } from "@/lib/platform-command-service";
import { DrawingRecognitionAsyncRepository } from "@/lib/repositories/drawing-recognition-async-repository";

type ImpactTokenPayload = {
  sessionId: string;
  companyId: string;
  sessionRowVersion: number;
  impactFingerprint: string;
  expiresAt: number;
};

function impactSecret() {
  const configured = process.env.PDM_AUTH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new DrawingRecognitionError("RECOGNITION_IMPACT_SECRET_MISSING", "正式環境缺少寫入確認簽章密鑰。", 503);
  }
  return "dev-only-change-before-production";
}

function impactSignature(encoded: string) {
  return crypto.createHmac("sha256", impactSecret()).update(encoded).digest("base64url");
}

export function issueRecognitionImpactToken(payload: Omit<ImpactTokenPayload, "expiresAt">) {
  const encoded = Buffer.from(JSON.stringify({ ...payload, expiresAt: Date.now() + 10 * 60 * 1_000 }), "utf8").toString("base64url");
  return `${encoded}.${impactSignature(encoded)}`;
}

export function verifyRecognitionImpactToken(token: string, expected: { sessionId: string; companyId: string }) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new DrawingRecognitionError("RECOGNITION_IMPACT_TOKEN_INVALID", "寫入確認已失效，請重新計算。", 409);
  const expectedSignature = impactSignature(encoded);
  if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new DrawingRecognitionError("RECOGNITION_IMPACT_TOKEN_INVALID", "寫入確認已失效，請重新計算。", 409);
  }
  let payload: ImpactTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ImpactTokenPayload;
  } catch {
    throw new DrawingRecognitionError("RECOGNITION_IMPACT_TOKEN_INVALID", "寫入確認已失效，請重新計算。", 409);
  }
  if (payload.sessionId !== expected.sessionId || payload.companyId !== expected.companyId || !Number.isInteger(payload.sessionRowVersion) || payload.expiresAt < Date.now()) {
    throw new DrawingRecognitionError("RECOGNITION_IMPACT_TOKEN_STALE", "寫入確認已逾時，請重新計算。", 409);
  }
  return payload;
}

export function recognitionRolesArePrivileged(roles: string[]) {
  return roles.some((role) => ["rd_manager", "pdm_admin", "system_admin"].includes(role));
}

export async function createDrawingRecognitionSession(input: {
  companyId: string;
  actorId: string;
  sourceContextType: DrawingRecognitionSourceContextType;
  sourceContextId: string;
  sourceAssetIds?: string[];
  drawingId?: string | null;
  drawingRevisionId?: string | null;
  supersedesSessionId?: string | null;
  client?: AsyncDatabaseClient;
}) {
  if (!isDrawingRecognitionV1Enabled()) throw new DrawingRecognitionError("RECOGNITION_FEATURE_DISABLED", "圖面辨識功能尚未啟用。", 404);
  const repository = new DrawingRecognitionAsyncRepository(input.client ?? getAsyncDatabaseClient());
  return repository.createSession({
    companyId: input.companyId,
    actorId: input.actorId,
    sourceContextType: input.sourceContextType,
    sourceContextId: requireSafeRecognitionId(input.sourceContextId, "RECOGNITION_CONTEXT_ID_INVALID"),
    sourceAssetIds: input.sourceAssetIds?.map((id) => requireSafeRecognitionId(id, "RECOGNITION_SOURCE_ID_INVALID")),
    drawingId: input.drawingId ?? null,
    drawingRevisionId: input.drawingRevisionId ?? null,
    supersedesSessionId: input.supersedesSessionId ?? null
  });
}

export async function ensureDrawingRecognitionSessionForSourceContext(input: {
  companyId: string;
  actorId: string;
  sourceContextType: DrawingRecognitionSourceContextType;
  sourceContextId: string;
  sourceAssetIds?: string[];
  drawingId?: string | null;
  drawingRevisionId?: string | null;
  client?: AsyncDatabaseClient;
}) {
  if (!isDrawingRecognitionV1Enabled()) return null;
  return createDrawingRecognitionSession(input);
}

export async function getDrawingRecognitionProjection(input: {
  sessionId: string;
  companyId: string;
  actorId: string;
  roles: string[];
  client?: AsyncDatabaseClient;
}) {
  if (!isDrawingRecognitionV1Enabled()) throw new DrawingRecognitionError("RECOGNITION_FEATURE_DISABLED", "圖面辨識功能尚未啟用。", 404);
  const repository = new DrawingRecognitionAsyncRepository(input.client ?? getAsyncDatabaseClient());
  await repository.assertSessionScope({
    sessionId: requireSafeRecognitionId(input.sessionId, "RECOGNITION_SESSION_ID_INVALID"),
    companyId: input.companyId,
    actorId: input.actorId,
    privileged: recognitionRolesArePrivileged(input.roles)
  });
  return repository.getProjection(input.sessionId, input.companyId);
}

export async function getLatestDrawingRecognitionForDrawing(input: {
  drawingNumber: string;
  companyId: string;
  actorId: string;
  roles: string[];
  client?: AsyncDatabaseClient;
}) {
  const repository = new DrawingRecognitionAsyncRepository(input.client ?? getAsyncDatabaseClient());
  const latest = await repository.latestForDrawingNumber(input.drawingNumber, input.companyId);
  if (!latest) return null;
  await repository.assertSessionScope({ sessionId: latest.id, companyId: input.companyId, actorId: input.actorId, privileged: recognitionRolesArePrivileged(input.roles) });
  return latest;
}

export async function saveDrawingRecognitionDecisions(input: {
  sessionId: string;
  companyId: string;
  actorId: string;
  roles: string[];
  expectedRowVersion: number;
  decisions: DrawingRecognitionDecisionInput[];
  client?: AsyncDatabaseClient;
}) {
  const repository = new DrawingRecognitionAsyncRepository(input.client ?? getAsyncDatabaseClient());
  await repository.assertSessionScope({ sessionId: input.sessionId, companyId: input.companyId, actorId: input.actorId, privileged: recognitionRolesArePrivileged(input.roles) });
  return repository.saveDecisions(input);
}

export async function getDrawingRecognitionObservation(input: {
  sessionId: string;
  observationId: string;
  companyId: string;
  actorId: string;
  roles: string[];
  client?: AsyncDatabaseClient;
}) {
  const repository = new DrawingRecognitionAsyncRepository(input.client ?? getAsyncDatabaseClient());
  await repository.assertSessionScope({ sessionId: input.sessionId, companyId: input.companyId, actorId: input.actorId, privileged: recognitionRolesArePrivileged(input.roles) });
  return repository.getObservationEvidence(input);
}

export async function rerunDrawingRecognition(input: {
  sessionId: string;
  companyId: string;
  actorId: string;
  roles: string[];
  client?: AsyncDatabaseClient;
}) {
  const repository = new DrawingRecognitionAsyncRepository(input.client ?? getAsyncDatabaseClient());
  await repository.assertSessionScope({ sessionId: input.sessionId, companyId: input.companyId, actorId: input.actorId, privileged: recognitionRolesArePrivileged(input.roles) });
  const previous = await repository.getProjection(input.sessionId, input.companyId);
  if (["queued", "extracting"].includes(previous.status)) {
    throw new DrawingRecognitionError("RECOGNITION_RERUN_NOT_READY", "目前辨識仍在執行，不需要重跑。", 409);
  }
  return repository.createSession({
    companyId: input.companyId,
    actorId: input.actorId,
    sourceContextType: previous.sourceContextType,
    sourceContextId: previous.sourceContextId,
    sourceAssetIds: previous.sources.map((source) => source.fileAssetId),
    drawingId: previous.drawingId,
    drawingRevisionId: previous.drawingRevisionId,
    supersedesSessionId: previous.id
  });
}

export async function calculateDrawingRecognitionImpact(input: {
  sessionId: string;
  companyId: string;
  actorId: string;
  roles: string[];
  expectedRowVersion: number;
  client?: AsyncDatabaseClient;
}) {
  const repository = new DrawingRecognitionAsyncRepository(input.client ?? getAsyncDatabaseClient());
  await repository.assertSessionScope({ sessionId: input.sessionId, companyId: input.companyId, actorId: input.actorId, privileged: recognitionRolesArePrivileged(input.roles) });
  const impact = await repository.calculateImpact(input);
  return {
    ...impact,
    impactToken: issueRecognitionImpactToken({
      sessionId: impact.sessionId,
      companyId: input.companyId,
      sessionRowVersion: impact.sessionRowVersion,
      impactFingerprint: impact.impactFingerprint
    })
  };
}

export async function formalizeDrawingRecognition(input: {
  sessionId: string;
  companyId: string;
  actorId: string;
  roles: string[];
  impactToken: string;
  reason?: string | null;
  metadata: PdmCommandMetadata;
  client?: AsyncDatabaseClient;
}) {
  const client = input.client ?? getAsyncDatabaseClient();
  const repository = new DrawingRecognitionAsyncRepository(client);
  await repository.assertSessionScope({ sessionId: input.sessionId, companyId: input.companyId, actorId: input.actorId, privileged: recognitionRolesArePrivileged(input.roles) });
  const token = verifyRecognitionImpactToken(input.impactToken, { sessionId: input.sessionId, companyId: input.companyId });
  const command = createPdmCommand({
    commandName: "drawing_recognition.formalize.v1",
    idempotencyKey: input.metadata.idempotencyKey,
    actor: input.metadata.actor,
    payload: {
      sessionId: input.sessionId,
      sessionRowVersion: token.sessionRowVersion,
      impactFingerprint: token.impactFingerprint,
      reason: input.reason?.trim() || null
    }
  });
  const execution = await executePdmCommandWithOutbox({
    client,
    command,
    idempotencyPayload: command.payload,
    execute: async (transaction) => new DrawingRecognitionAsyncRepository(transaction).applyFormalization({
      sessionId: input.sessionId,
      companyId: input.companyId,
      actorId: input.actorId,
      expectedRowVersion: token.sessionRowVersion,
      idempotencyKey: input.metadata.idempotencyKey,
      expectedImpactFingerprint: token.impactFingerprint,
      requirePostReleaseReason: input.reason
    }),
    event: (result) => ({
      aggregateType: "drawing_recognition_session",
      aggregateId: input.sessionId,
      eventType: "drawing_recognition.formalized.v1",
      payload: result
    })
  });
  return { ...execution.result, reusedFromCommandReceipt: execution.reusedFromCommandReceipt };
}

export async function claimDrawingRecognitionJob(input: { workerId: string; maxAttempts?: number; client?: AsyncDatabaseClient }) {
  return new DrawingRecognitionAsyncRepository(input.client ?? getAsyncDatabaseClient()).claimJob({
    workerId: requireSafeRecognitionId(input.workerId, "RECOGNITION_WORKER_ID_INVALID"),
    maxAttempts: Math.max(1, Math.min(input.maxAttempts ?? 2, 5))
  });
}

export async function heartbeatDrawingRecognitionJob(input: { sessionId: string; workerId: string; client?: AsyncDatabaseClient }) {
  return new DrawingRecognitionAsyncRepository(input.client ?? getAsyncDatabaseClient()).heartbeatJob(input);
}

export async function completeDrawingRecognitionJob(input: {
  sessionId: string;
  workerId: string;
  sourceSetFingerprint: string;
  results: DrawingRecognitionAdapterCompletion[];
  client?: AsyncDatabaseClient;
}) {
  return new DrawingRecognitionAsyncRepository(input.client ?? getAsyncDatabaseClient()).completeJob(input);
}
