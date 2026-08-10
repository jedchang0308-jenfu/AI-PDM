import crypto from "node:crypto";
import { createAuditLogAsync } from "@/lib/audit-async";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  GoogleSecretManagerError,
  GoogleSecretManagerProvider,
  getGoogleSecretManagerConfig,
  isGoogleSecretManagerReadEnabled,
  isGoogleSecretManagerWriteEnabled
} from "@/lib/google-secret-manager";
import {
  AsyncSettingsSecretRepository,
  type SettingsSecretLifecycleStatus,
  type SettingsSecretReference,
  type SettingsSecretTestRun,
  type SettingsSecretVaultProvider
} from "@/lib/repositories/settings-secret-async-repository";

export type SettingsSecretKind = "solidworks_document_manager";

type SecretKindDefinition = {
  kind: SettingsSecretKind;
  provider: string;
  displayName: string;
  minimumLength: number;
};

const supportedSecretKinds: SecretKindDefinition[] = [
  {
    kind: "solidworks_document_manager",
    provider: "solidworks_document_manager",
    displayName: "SolidWorks Document Manager API key",
    minimumLength: 8
  }
];

export type RedactedSecretVersionSummary = {
  id: string;
  version: number;
  lifecycleStatus: SettingsSecretLifecycleStatus;
  vaultProvider: SettingsSecretVaultProvider;
  maskedHint: string;
  fingerprint: string;
  createdAt: string;
  testedAt: string | null;
  activatedAt: string | null;
  revokedAt: string | null;
};

export type SettingsSecretStatus = {
  kind: SettingsSecretKind;
  provider: string;
  displayName: string;
  configured: boolean;
  active: RedactedSecretVersionSummary | null;
  latest: RedactedSecretVersionSummary | null;
  latestTestRun: SettingsSecretTestRun | null;
  draftCount: number;
  testedCount: number;
  revokedCount: number;
  workQueueState: "missing" | "draft_needs_test" | "tested_needs_activation" | "ready" | "revoked";
  workQueueMessage: string;
  liveGate: {
    provider: SettingsSecretVaultProvider;
    status: "mocked" | "blocked" | "ready";
    message: string;
  };
  workerReadiness: {
    status: "ready" | "blocked" | "unknown";
    credentialSource: "worker_environment" | "google_secret_manager" | "supabase_vault" | "none";
    serviceTokenConfigured: boolean;
    message: string;
  };
  workerPresence: {
    status: "online" | "offline" | "unknown";
    lastSeenAt: string | null;
    message: string;
  };
};

type SecretStoreResult = {
  vaultProvider: SettingsSecretVaultProvider;
  vaultSecretId: string;
  maskedHint: string;
  fingerprint: string;
  metadata: Record<string, unknown>;
};

export class SettingsSecretLifecycleError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

interface SecretProvider {
  createSecret(input: { kind: SettingsSecretKind; value: string; displayName: string; actorId: string }): Promise<SecretStoreResult>;
}

class LocalTestDoubleSecretProvider implements SecretProvider {
  async createSecret(input: { kind: SettingsSecretKind; value: string; displayName: string; actorId: string }): Promise<SecretStoreResult> {
    return {
      vaultProvider: "local_test_double",
      vaultSecretId: `local-test-double:${input.kind}:${crypto.randomUUID()}`,
      maskedHint: maskSecret(input.value),
      fingerprint: fingerprintSecret(input.value),
      metadata: {
        liveGate: "google_secret_manager_live_verification_required",
        storageBoundary: "secret_material_not_persisted_by_local_test_double"
      }
    };
  }
}

class GoogleSecretManagerSecretProvider implements SecretProvider {
  async createSecret(input: { kind: SettingsSecretKind; value: string; displayName: string; actorId: string }): Promise<SecretStoreResult> {
    if (getAsyncDatabaseClient().kind !== "postgres") {
      throw new SettingsSecretLifecycleError("GCP_SECRET_MANAGER_POSTGRES_REQUIRED", "Google Secret Manager 正式 provider 需要 Cloud SQL/Postgres runtime。", 409);
    }
    const config = getGoogleSecretManagerConfig();
    if (!config) throw new SettingsSecretLifecycleError("GCP_SECRET_MANAGER_CONFIG_MISSING", "Google Secret Manager 尚未設定 project 與 SolidWorks secret ID。", 409);
    try {
      const versionName = await new GoogleSecretManagerProvider(config).addVersion(input.value);
      return {
        vaultProvider: "google_secret_manager",
        vaultSecretId: versionName,
        maskedHint: maskSecret(input.value),
        fingerprint: fingerprintSecret(input.value),
        metadata: {
          secretName: `projects/${config.projectId}/secrets/${config.secretId}`,
          versionName,
          storageBoundary: "google_secret_manager",
          plaintextPersisted: false
        }
      };
    } catch (error) {
      throw toLifecycleError(error, "GCP_SECRET_MANAGER_WRITE_FAILED", "Google Secret Manager 寫入失敗。");
    }
  }
}

function resolveProvider(): SecretProvider {
  const configuredProvider = String(process.env.PDM_SETTINGS_SECRET_PROVIDER ?? "").trim().toLowerCase();
  const provider = configuredProvider || (process.env.NODE_ENV === "production" ? "" : "local_test_double");
  if (provider === "google_secret_manager") return new GoogleSecretManagerSecretProvider();
  if (provider === "local_test_double") return new LocalTestDoubleSecretProvider();
  if (provider === "supabase_vault") {
    throw new SettingsSecretLifecycleError(
      "SUPABASE_VAULT_PROVIDER_SUPERSEDED",
      "Supabase Vault 僅保留歷史 reference 診斷；新 secret 必須使用 Google Secret Manager。",
      409,
      { provider: "supabase_vault", replacement: "google_secret_manager" }
    );
  }
  throw new SettingsSecretLifecycleError(
    configuredProvider ? "SETTINGS_SECRET_PROVIDER_INVALID" : "GCP_SECRET_MANAGER_CONFIG_REQUIRED",
    "正式環境必須明確設定 PDM_SETTINGS_SECRET_PROVIDER=google_secret_manager。",
    409,
    { provider: configuredProvider || null, expected: "google_secret_manager" }
  );
}

function getKindDefinition(kind: string): SecretKindDefinition {
  const definition = supportedSecretKinds.find((item) => item.kind === kind);
  if (!definition) {
    throw new SettingsSecretLifecycleError("UNSUPPORTED_SECRET_KIND", "不支援的 secret 類型。", 404, { kind });
  }
  return definition;
}

function maskSecret(value: string) {
  const trimmed = value.trim();
  const suffix = trimmed.length >= 4 ? trimmed.slice(-4) : "****";
  return `len:${trimmed.length};ending:${suffix}`;
}

function fingerprintSecret(value: string) {
  const pepper = process.env.PDM_SECRET_FINGERPRINT_PEPPER || process.env.PDM_AUTH_SECRET || "dev-only-secret-fingerprint-pepper";
  return crypto.createHmac("sha256", pepper).update(value.trim()).digest("hex");
}

function redactReference(reference: SettingsSecretReference | null | undefined): RedactedSecretVersionSummary | null {
  if (!reference) return null;
  return {
    id: reference.id,
    version: reference.version,
    lifecycleStatus: reference.lifecycleStatus,
    vaultProvider: reference.vaultProvider,
    maskedHint: reference.maskedHint,
    fingerprint: reference.fingerprint,
    createdAt: reference.createdAt,
    testedAt: reference.testedAt,
    activatedAt: reference.activatedAt,
    revokedAt: reference.revokedAt
  };
}

function summarizeWorkQueue(references: SettingsSecretReference[]): Pick<SettingsSecretStatus, "workQueueState" | "workQueueMessage"> {
  const active = references.find((reference) => reference.lifecycleStatus === "active");
  const latest = references[0] ?? null;
  if (!latest) {
    return { workQueueState: "missing", workQueueMessage: "尚未建立 SolidWorks CAD reader secret 草稿。" };
  }
  if (latest.lifecycleStatus === "draft") {
    return { workQueueState: "draft_needs_test", workQueueMessage: `v${latest.version} 草稿待測試，尚不能啟用。` };
  }
  if (latest.lifecycleStatus === "tested" && !active) {
    return { workQueueState: "tested_needs_activation", workQueueMessage: `v${latest.version} 已測試，待 Admin 啟用。` };
  }
  if (active) {
    return { workQueueState: "ready", workQueueMessage: `v${active.version} 已啟用。` };
  }
  return { workQueueState: "revoked", workQueueMessage: "目前沒有可用的 active secret，請建立新草稿。" };
}

function liveGateFor(client: AsyncDatabaseClient, reference: SettingsSecretReference | null | undefined): SettingsSecretStatus["liveGate"] {
  if (reference?.vaultProvider === "google_secret_manager") {
    const configured = Boolean(getGoogleSecretManagerConfig());
    const ready = client.kind === "postgres" && configured && isGoogleSecretManagerReadEnabled();
    return {
      provider: "google_secret_manager",
      status: ready ? "ready" : "blocked",
      message: ready
        ? "Google Secret Manager exact version 已就緒；worker 只能透過 server-side broker 讀取。"
        : "Google Secret Manager reference 已存在，但 Cloud SQL、project/secret 設定或 read gate 尚未就緒。"
    };
  }
  if (reference?.vaultProvider === "supabase_vault") {
    return { provider: "supabase_vault", status: "blocked", message: "此為歷史 Supabase Vault reference；新設定已切換至 Google Secret Manager。" };
  }
  if ((process.env.PDM_SETTINGS_SECRET_PROVIDER ?? "").trim().toLowerCase() === "google_secret_manager") {
    return { provider: "google_secret_manager", status: "blocked", message: "Google Secret Manager live target 尚未完成，無法建立可用 secret。" };
  }
  return { provider: "local_test_double", status: "mocked", message: "目前使用本機 test double；正式環境需切換 Google Secret Manager。" };
}

function workerEnvironmentSecret() {
  return [
    process.env.PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY,
    process.env.PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY,
    process.env.SOLIDWORKS_DOCUMENT_MANAGER_KEY
  ]
    .map((value) => String(value ?? "").trim())
    .find(Boolean) ?? "";
}

function workerServiceTokenConfigured() {
  return String(process.env.PDM_PREVIEW_WORKER_TOKEN ?? "").trim().length >= 32;
}

function workerEnvironmentFallbackAllowed() {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.PDM_ALLOW_WORKER_ENV_SECRET_FALLBACK === "true" && Boolean(String(process.env.PDM_BREAK_GLASS_CHANGE_ID ?? "").trim());
}

function workerReadinessFor(client: AsyncDatabaseClient, active: SettingsSecretReference | null): SettingsSecretStatus["workerReadiness"] {
  const serviceTokenConfigured = workerServiceTokenConfigured();
  if (workerEnvironmentSecret() && workerEnvironmentFallbackAllowed()) {
    return {
      status: serviceTokenConfigured ? "ready" : "blocked",
      credentialSource: "worker_environment",
      serviceTokenConfigured,
      message: serviceTokenConfigured ? "worker 已可讀取本機環境金鑰。" : "已找到本機環境金鑰，但 PDM preview worker token 尚未設定。"
    };
  }
  if (workerEnvironmentSecret() && !workerEnvironmentFallbackAllowed()) {
    return {
      status: "blocked",
      credentialSource: "none",
      serviceTokenConfigured,
      message: "正式環境已阻擋 worker-local key；請改用 Google Secret Manager broker。"
    };
  }
  if (active?.vaultProvider === "google_secret_manager") {
    const secretReadReady = client.kind === "postgres" && Boolean(getGoogleSecretManagerConfig()) && isGoogleSecretManagerReadEnabled();
    return {
      status: secretReadReady && serviceTokenConfigured ? "ready" : "blocked",
      credentialSource: "google_secret_manager",
      serviceTokenConfigured,
      message:
        secretReadReady && serviceTokenConfigured
          ? "Google Secret Manager exact version 與 2D worker service token 均已就緒。"
          : "Google Secret Manager reference 已存在，但 Cloud SQL、read gate、runtime ADC 或 worker token 尚未就緒。"
    };
  }
  if (active?.vaultProvider === "supabase_vault") {
    return {
      status: "blocked",
      credentialSource: "supabase_vault",
      serviceTokenConfigured,
      message: "歷史 Supabase Vault reference 已永久停用讀取，請建立 Google Secret Manager version。"
    };
  }
  return {
    status: "blocked",
    credentialSource: "none",
    serviceTokenConfigured,
    message: active?.vaultProvider === "local_test_double" ? "目前只有本機 test-double metadata，worker 沒有可讀取的 secret。" : "尚未啟用可供 2D worker 讀取的 SolidWorks Document Manager key。"
  };
}

async function workerPresenceFor(client: AsyncDatabaseClient): Promise<SettingsSecretStatus["workerPresence"]> {
  const recentCutoff = new Date(Date.now() - 30_000).toISOString();
  const recent = await client.queryOne<{ updated_at: string; locked_by: string | null }>(
    `
      SELECT updated_at, locked_by
      FROM preview_jobs
      WHERE requested_kind = 'native_thumbnail_png'
        AND status = 'running'
        AND updated_at >= :recentCutoff
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    { recentCutoff }
  );
  if (recent) {
    return {
      status: "online",
      lastSeenAt: recent.updated_at,
      message: `2D worker 最近有 claim/heartbeat（${recent.locked_by ? "trusted worker" : "worker"}）。`
    };
  }
  const historical = await client.queryOne<{ id: string }>(
    "SELECT id FROM preview_jobs WHERE requested_kind = 'native_thumbnail_png' LIMIT 1"
  );
  return historical
    ? { status: "offline", lastSeenAt: null, message: "最近沒有 2D worker claim/heartbeat；3D worker 狀態不會替代此判定。" }
    : { status: "unknown", lastSeenAt: null, message: "尚無 2D worker claim/heartbeat 證據；請由 worker 自動回報。" };
}

async function readGoogleSecretManagerSecret(client: AsyncDatabaseClient, versionName: string) {
  if (client.kind !== "postgres") {
    throw new SettingsSecretLifecycleError("GCP_SECRET_MANAGER_POSTGRES_REQUIRED", "Google Secret Manager 讀取需要 Cloud SQL/Postgres runtime。", 409);
  }
  const config = getGoogleSecretManagerConfig();
  if (!config) throw new SettingsSecretLifecycleError("GCP_SECRET_MANAGER_CONFIG_MISSING", "Google Secret Manager 尚未設定 project 與 SolidWorks secret ID。", 409);
  try {
    return await new GoogleSecretManagerProvider(config).accessVersion(versionName);
  } catch (error) {
    throw toLifecycleError(error, "GCP_SECRET_MANAGER_READ_FAILED", "Google Secret Manager 讀取失敗。");
  }
}

export async function resolveActiveSolidWorksDocumentManagerKey() {
  const environmentSecret = workerEnvironmentSecret();
  if (environmentSecret && workerEnvironmentFallbackAllowed()) return { value: environmentSecret, source: "worker_environment" as const };

  const client = getAsyncDatabaseClient();
  const repository = new AsyncSettingsSecretRepository(client);
  const active = (await repository.listReferencesByKind("solidworks_document_manager")).find((reference) => reference.lifecycleStatus === "active");
  if (!active) return null;
  if (active.vaultProvider === "google_secret_manager") {
    return { value: await readGoogleSecretManagerSecret(client, active.vaultSecretId), source: "google_secret_manager" as const };
  }
  return null;
}

async function resolveSecretReferenceValue(client: AsyncDatabaseClient, reference: SettingsSecretReference) {
  const environmentSecret = workerEnvironmentSecret();
  if (environmentSecret && workerEnvironmentFallbackAllowed()) return { value: environmentSecret, source: "worker_environment" as const };
  if (reference.vaultProvider === "google_secret_manager") {
    return { value: await readGoogleSecretManagerSecret(client, reference.vaultSecretId), source: "google_secret_manager" as const };
  }
  return null;
}

function toLifecycleError(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof SettingsSecretLifecycleError) return error;
  if (error instanceof GoogleSecretManagerError) {
    return new SettingsSecretLifecycleError(error.code, error.message, error.status);
  }
  return new SettingsSecretLifecycleError(fallbackCode, fallbackMessage, 502);
}

async function createLifecycleEvent(
  repository: AsyncSettingsSecretRepository,
  input: {
    secretReferenceId: string;
    kind: SettingsSecretKind;
    eventType: "created_draft" | "tested" | "activated" | "retired" | "revoked";
    actorId: string;
    eventAt: string;
    detail?: Record<string, unknown>;
  }
) {
  await repository.insertActivationEvent({
    id: `setting-event-${crypto.randomUUID()}`,
    secretReferenceId: input.secretReferenceId,
    kind: input.kind,
    eventType: input.eventType,
    actorId: input.actorId,
    eventAt: input.eventAt,
    detailJson: JSON.stringify(input.detail ?? {})
  });
}

export async function listSettingsSecretStatuses(): Promise<SettingsSecretStatus[]> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncSettingsSecretRepository(client);
  const statuses: SettingsSecretStatus[] = [];

  for (const definition of supportedSecretKinds) {
    const references = await repository.listReferencesByKind(definition.kind);
    const active = references.find((reference) => reference.lifecycleStatus === "active") ?? null;
    const latest = references[0] ?? null;
    const latestTestRun = latest ? await repository.getLatestTestRun(latest.id) : null;
    const workQueue = summarizeWorkQueue(references);
    const workerPresence = await workerPresenceFor(client);

    statuses.push({
      kind: definition.kind,
      provider: definition.provider,
      displayName: definition.displayName,
      configured: Boolean(active),
      active: redactReference(active),
      latest: redactReference(latest),
      latestTestRun,
      draftCount: references.filter((reference) => reference.lifecycleStatus === "draft").length,
      testedCount: references.filter((reference) => reference.lifecycleStatus === "tested").length,
      revokedCount: references.filter((reference) => reference.lifecycleStatus === "revoked").length,
      ...workQueue,
      liveGate: liveGateFor(client, active ?? latest),
      workerReadiness: workerReadinessFor(client, active),
      workerPresence
    });
  }

  return statuses;
}

export async function createSettingsSecretDraft(input: {
  kind: string;
  secretValue: string;
  actorId: string;
}): Promise<SettingsSecretReference> {
  const definition = getKindDefinition(input.kind);
  const secretValue = String(input.secretValue ?? "").trim();
  if (secretValue.length < definition.minimumLength) {
    throw new SettingsSecretLifecycleError("SECRET_VALUE_TOO_SHORT", "Secret 長度不足，請確認輸入完整 API/license key。", 400);
  }

  const client = getAsyncDatabaseClient();
  const provider = resolveProvider();
  const repository = new AsyncSettingsSecretRepository(client);
  const now = new Date().toISOString();
  let stored: SecretStoreResult;
  try {
    stored = await provider.createSecret({ kind: definition.kind, value: secretValue, displayName: definition.displayName, actorId: input.actorId });
  } catch (error) {
    throw toLifecycleError(error, "SETTINGS_SECRET_PROVIDER_WRITE_FAILED", "Secret provider 寫入失敗。");
  }
  const version = await repository.getNextVersion(definition.kind);
  const reference: SettingsSecretReference = {
    id: `secret-ref-${crypto.randomUUID()}`,
    kind: definition.kind,
    provider: definition.provider,
    displayName: definition.displayName,
    vaultProvider: stored.vaultProvider,
    vaultSecretId: stored.vaultSecretId,
    maskedHint: stored.maskedHint,
    fingerprint: stored.fingerprint,
    lifecycleStatus: "draft",
    version,
    createdBy: input.actorId,
    createdAt: now,
    testedAt: null,
    activatedBy: null,
    activatedAt: null,
    retiredBy: null,
    retiredAt: null,
    revokedBy: null,
    revokedAt: null,
    revokeReason: null,
    metadataJson: JSON.stringify(stored.metadata)
  };

  await repository.insertReference(reference);
  await createLifecycleEvent(repository, {
    secretReferenceId: reference.id,
    kind: definition.kind,
    eventType: "created_draft",
    actorId: input.actorId,
    eventAt: now,
    detail: { version, vaultProvider: reference.vaultProvider, fingerprint: reference.fingerprint }
  });
  await createAuditLogAsync({
    actorId: input.actorId,
    action: "SettingsSecretDraftCreated",
    detail: {
      kind: definition.kind,
      version,
      vaultProvider: reference.vaultProvider,
      fingerprint: reference.fingerprint,
      maskedHint: reference.maskedHint
    }
  });

  return reference;
}

export async function testSettingsSecretReference(input: { secretReferenceId: string; actorId: string }): Promise<SettingsSecretTestRun> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncSettingsSecretRepository(client);
  const reference = await repository.getReferenceById(input.secretReferenceId);
  if (!reference) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_FOUND", "找不到 secret version。", 404);
  if (reference.lifecycleStatus !== "draft" && reference.lifecycleStatus !== "tested") {
    throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_TESTABLE", "只有草稿或已測試版本可執行測試。", 409);
  }

  const now = new Date().toISOString();
  const isLocalDouble = reference.vaultProvider === "local_test_double";
  const isGoogleSecretManager = reference.vaultProvider === "google_secret_manager";
  let resultStatus: SettingsSecretTestRun["resultStatus"] = isLocalDouble ? "passed" : "blocked";
  let summary = isLocalDouble
    ? "本機 test double 已驗證 secret metadata lifecycle 與 redaction 邊界。"
    : isGoogleSecretManager
      ? "Google Secret Manager exact version 已建立；仍需 server-side read probe。"
      : "歷史 Supabase Vault reference 不作為新的正式 provider。";
  let redactedError: string | null = isLocalDouble ? null : isGoogleSecretManager ? "GCP_SECRET_MANAGER_PROVIDER_PROBE_REQUIRED" : "SUPABASE_VAULT_PROVIDER_SUPERSEDED";
  if (!isLocalDouble && isGoogleSecretManager) {
    try {
      const resolved = await resolveSecretReferenceValue(client, reference);
      if (resolved?.value) {
        resultStatus = "passed";
        summary = "Google Secret Manager exact version 可由 server-side worker credential broker 讀取。";
        redactedError = null;
      } else {
        redactedError = "GCP_SECRET_MANAGER_SECRET_NOT_FOUND";
      }
    } catch (error) {
      resultStatus = "blocked";
      redactedError = error instanceof SettingsSecretLifecycleError ? error.code : "GCP_SECRET_MANAGER_PROVIDER_PROBE_FAILED";
      summary = "Google Secret Manager exact version 尚未能由 server-side worker credential broker 讀取。";
    }
  }
  const testRun: SettingsSecretTestRun = {
    id: `setting-test-${crypto.randomUUID()}`,
    secretReferenceId: reference.id,
    kind: reference.kind,
    provider: reference.provider,
    resultStatus,
    summary,
    redactedError,
    artifactPath: null,
    testedBy: input.actorId,
    testedAt: now,
    metadataJson: JSON.stringify({
      liveGate: isLocalDouble
        ? "google_secret_manager_live_verification_required"
        : resultStatus === "passed"
          ? isGoogleSecretManager
            ? "server_side_google_secret_manager_read_verified"
            : "server_side_historical_vault_read_verified"
          : "provider_probe_required",
      plaintextPersisted: false
    })
  };

  await repository.insertTestRun(testRun);
  if (testRun.resultStatus === "passed") {
    await repository.markReferenceTested(reference.id, now);
  }
  await createLifecycleEvent(repository, {
    secretReferenceId: reference.id,
    kind: reference.kind as SettingsSecretKind,
    eventType: "tested",
    actorId: input.actorId,
    eventAt: now,
    detail: { version: reference.version, resultStatus: testRun.resultStatus }
  });
  await createAuditLogAsync({
    actorId: input.actorId,
    action: "SettingsSecretTestRun",
    detail: {
      kind: reference.kind,
      version: reference.version,
      resultStatus: testRun.resultStatus,
      fingerprint: reference.fingerprint
    }
  });

  return testRun;
}

export async function activateSettingsSecretReference(input: { secretReferenceId: string; actorId: string }): Promise<SettingsSecretReference> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncSettingsSecretRepository(client);
  const reference = await repository.getReferenceById(input.secretReferenceId);
  if (!reference) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_FOUND", "找不到 secret version。", 404);
  if (reference.lifecycleStatus !== "tested") {
    throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_TESTED", "只有已測試通過的 secret version 可以啟用。", 409);
  }

  const now = new Date().toISOString();
  await client.transaction(async (transactionClient) => {
    const transactionRepository = new AsyncSettingsSecretRepository(transactionClient);
    await transactionRepository.retireActiveReferences(reference.kind, reference.id, input.actorId, now);
    await transactionRepository.activateReference(reference.id, input.actorId, now);
    await createLifecycleEvent(transactionRepository, {
      secretReferenceId: reference.id,
      kind: reference.kind as SettingsSecretKind,
      eventType: "activated",
      actorId: input.actorId,
      eventAt: now,
      detail: { version: reference.version, retiredPriorActive: true }
    });
  });
  await createAuditLogAsync({
    actorId: input.actorId,
    action: "SettingsSecretActivated",
    detail: { kind: reference.kind, version: reference.version, fingerprint: reference.fingerprint }
  });

  const activated = await repository.getReferenceById(reference.id);
  if (!activated) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_FOUND", "啟用後找不到 secret version。", 500);
  return activated;
}

export async function revokeSettingsSecretReference(input: { secretReferenceId: string; actorId: string; reason?: string }): Promise<SettingsSecretReference> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncSettingsSecretRepository(client);
  const reference = await repository.getReferenceById(input.secretReferenceId);
  if (!reference) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_FOUND", "找不到 secret version。", 404);
  if (reference.lifecycleStatus === "revoked" || reference.lifecycleStatus === "retired") {
    throw new SettingsSecretLifecycleError("SECRET_REFERENCE_ALREADY_INACTIVE", "此 secret version 已非有效狀態。", 409);
  }

  const now = new Date().toISOString();
  const reason = String(input.reason ?? "Admin revoked from settings center").trim().slice(0, 500);
  await repository.revokeReference(reference.id, input.actorId, now, reason);
  await createLifecycleEvent(repository, {
    secretReferenceId: reference.id,
    kind: reference.kind as SettingsSecretKind,
    eventType: "revoked",
    actorId: input.actorId,
    eventAt: now,
    detail: { version: reference.version, reason }
  });
  await createAuditLogAsync({
    actorId: input.actorId,
    action: "SettingsSecretRevoked",
    detail: { kind: reference.kind, version: reference.version, fingerprint: reference.fingerprint, reason }
  });

  const revoked = await repository.getReferenceById(reference.id);
  if (!revoked) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_FOUND", "撤銷後找不到 secret version。", 500);
  return revoked;
}

export function redactSettingsSecretReference(reference: SettingsSecretReference): RedactedSecretVersionSummary {
  return redactReference(reference) as RedactedSecretVersionSummary;
}
