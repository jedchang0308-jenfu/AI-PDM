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
import {
  isWindowsDpapiAvailable,
  readWindowsDpapiSecret,
  WindowsDpapiSecretError,
  writeWindowsDpapiSecret
} from "@/lib/windows-dpapi-secret-provider";

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
  latestProbeJob: {
    id: string;
    status: import("@/lib/repositories/settings-secret-async-repository").SettingsSecretProbeStatus;
    resultCode: string | null;
    readerVersion: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
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
    credentialSource: "worker_environment" | "windows_dpapi" | "google_secret_manager" | "supabase_vault" | "none";
    serviceTokenConfigured: boolean;
    message: string;
    appliedVersion: number | null;
    lastSeenAt: string | null;
    issueCode: string | null;
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

class WindowsDpapiSecretProvider implements SecretProvider {
  async createSecret(input: { kind: SettingsSecretKind; value: string; displayName: string; actorId: string }): Promise<SecretStoreResult> {
    if (!isWindowsDpapiAvailable()) {
      throw new SettingsSecretLifecycleError("WINDOWS_DPAPI_UNAVAILABLE", "目前環境不是 Windows，無法使用本機安全保管庫。", 409);
    }
    try {
      const stored = await writeWindowsDpapiSecret(input.kind, input.value);
      return {
        vaultProvider: "windows_dpapi",
        vaultSecretId: stored.secretId,
        maskedHint: maskSecret(input.value),
        fingerprint: fingerprintSecret(input.value),
        metadata: {
          storageBoundary: stored.storageBoundary,
          plaintextPersisted: false,
          userScope: "windows_current_user"
        }
      };
    } catch (error) {
      throw toLifecycleError(error, "WINDOWS_DPAPI_WRITE_FAILED", "Windows DPAPI 安全保管庫寫入失敗。");
    }
  }
}

function resolveProvider(): SecretProvider {
  const configuredProvider = String(process.env.PDM_SETTINGS_SECRET_PROVIDER ?? "").trim().toLowerCase();
  const provider = configuredProvider || (process.env.NODE_ENV === "production" ? "" : isWindowsDpapiAvailable() ? "windows_dpapi" : "local_test_double");
  if (provider === "google_secret_manager") return new GoogleSecretManagerSecretProvider();
  if (provider === "windows_dpapi") return new WindowsDpapiSecretProvider();
  if (provider === "local_test_double") {
    const testDoubleAllowed = process.env.NODE_ENV === "test" || process.env.PDM_ALLOW_SETTINGS_SECRET_TEST_DOUBLE === "true";
    if (testDoubleAllowed) return new LocalTestDoubleSecretProvider();
    if (isWindowsDpapiAvailable()) return new WindowsDpapiSecretProvider();
    throw new SettingsSecretLifecycleError(
      "SETTINGS_SECRET_TEST_DOUBLE_FORBIDDEN",
      "本機測試替身只允許 automated test；請在 Windows 使用 DPAPI，正式環境使用 Google Secret Manager。",
      409,
      { provider: "local_test_double", expected: isWindowsDpapiAvailable() ? "windows_dpapi" : "google_secret_manager" }
    );
  }
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
    { provider: configuredProvider || null, expected: isWindowsDpapiAvailable() ? "windows_dpapi" : "google_secret_manager" }
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
    if (active.vaultProvider === "local_test_double") {
      return { workQueueState: "ready", workQueueMessage: `v${active.version} 是本機測試替身，不能讀取 SolidWorks 屬性；請重新建立 Windows DPAPI secure version。` };
    }
    return { workQueueState: "ready", workQueueMessage: `v${active.version} 已啟用。` };
  }
  return { workQueueState: "revoked", workQueueMessage: "目前沒有可用的 active secret，請建立新草稿。" };
}

function liveGateFor(client: AsyncDatabaseClient, reference: SettingsSecretReference | null | undefined): SettingsSecretStatus["liveGate"] {
  if (reference?.vaultProvider === "windows_dpapi") {
    return {
      provider: "windows_dpapi",
      status: isWindowsDpapiAvailable() ? "ready" : "blocked",
      message: isWindowsDpapiAvailable()
        ? "Windows DPAPI current-user encrypted blob 已就緒；plaintext 不寫入 DB。"
        : "此 reference 使用 Windows DPAPI，但目前 runtime 不是 Windows。"
    };
  }
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
  return { provider: "local_test_double", status: "mocked", message: "目前只有本機測試替身；不可測試通過、啟用或顯示 ready。" };
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
  return process.env.PDM_ALLOW_WORKER_ENV_SECRET_FALLBACK === "true" && Boolean(String(process.env.PDM_BREAK_GLASS_CHANGE_ID ?? "").trim());
}

function workerReadinessFor(
  client: AsyncDatabaseClient,
  active: SettingsSecretReference | null,
  latestProbe: import("@/lib/repositories/settings-secret-async-repository").SettingsSecretProbeJob | null,
  heartbeat: import("@/lib/repositories/settings-secret-async-repository").WorkerCapabilityHeartbeat | null
): SettingsSecretStatus["workerReadiness"] {
  const serviceTokenConfigured = workerServiceTokenConfigured();
  const appliedVersion = heartbeat?.appliedSecretVersion ?? null;
  const lastSeenAt = heartbeat?.lastSeenAt ?? null;
  const issueCode = heartbeat?.issueCode ?? null;
  const recentHeartbeat = Boolean(lastSeenAt && Date.parse(lastSeenAt) >= Date.now() - 30_000);
  const exactVersionAck = Boolean(active && heartbeat?.appliedSecretVersion === active.version && heartbeat.appliedSecretFingerprint === active.fingerprint);
  const realProbePassed = latestProbe?.status === "passed";
  const base = { serviceTokenConfigured, appliedVersion, lastSeenAt, issueCode };
  if (active?.vaultProvider === "local_test_double") return { status: "blocked", credentialSource: "none", ...base, message: "本機測試替身不可啟用；請從此 UI 建立 Windows DPAPI secure version。" };
  if (active?.vaultProvider === "google_secret_manager") {
    const secretReadReady = client.kind === "postgres" && Boolean(getGoogleSecretManagerConfig()) && isGoogleSecretManagerReadEnabled();
    return {
      status: secretReadReady && serviceTokenConfigured && realProbePassed && recentHeartbeat && exactVersionAck ? "ready" : "blocked",
      credentialSource: "google_secret_manager",
      ...base,
      message: secretReadReady && serviceTokenConfigured && realProbePassed && recentHeartbeat && exactVersionAck
        ? "Google Secret Manager exact version、原生 probe、worker online 與 exact-version ack 均通過。"
        : issueCode ?? "尚未滿足 active、real probe、worker online 與 exact-version ack 四項必要條件。"
    };
  }
  if (active?.vaultProvider === "windows_dpapi") {
    const secureReadReady = isWindowsDpapiAvailable();
    return {
      status: secureReadReady && serviceTokenConfigured && realProbePassed && recentHeartbeat && exactVersionAck ? "ready" : "blocked",
      credentialSource: "windows_dpapi",
      ...base,
      message: secureReadReady && serviceTokenConfigured && realProbePassed && recentHeartbeat && exactVersionAck
        ? "Windows DPAPI、原生 probe、worker online 與 exact-version ack 均通過。"
        : issueCode ?? "等待 Windows DPAPI 原生 probe 與 worker exact-version ack。"
    };
  }
  if (active?.vaultProvider === "supabase_vault") {
    return {
      status: "blocked",
      credentialSource: "supabase_vault",
      ...base,
      message: "歷史 Supabase Vault reference 已永久停用讀取，請建立 Google Secret Manager version。"
    };
  }
  return {
    status: "blocked",
    credentialSource: "none",
    ...base,
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
  if (environmentSecret && workerEnvironmentFallbackAllowed()) return { value: environmentSecret, source: "worker_environment" as const, version: null, fingerprint: fingerprintSecret(environmentSecret) };

  const client = getAsyncDatabaseClient();
  const repository = new AsyncSettingsSecretRepository(client);
  const active = (await repository.listReferencesByKind("solidworks_document_manager")).find((reference) => reference.lifecycleStatus === "active");
  if (!active) return null;
  if (active.vaultProvider === "google_secret_manager") {
    return { value: await readGoogleSecretManagerSecret(client, active.vaultSecretId), source: "google_secret_manager" as const, version: active.version, fingerprint: active.fingerprint };
  }
  if (active.vaultProvider === "windows_dpapi") {
    try {
      return { value: await readWindowsDpapiSecret(active.vaultSecretId), source: "windows_dpapi" as const, version: active.version, fingerprint: active.fingerprint };
    } catch (error) {
      throw toLifecycleError(error, "WINDOWS_DPAPI_READ_FAILED", "Windows DPAPI secret 讀取失敗。");
    }
  }
  return null;
}

async function resolveSecretReferenceValue(client: AsyncDatabaseClient, reference: SettingsSecretReference) {
  const environmentSecret = workerEnvironmentSecret();
  if (environmentSecret && workerEnvironmentFallbackAllowed()) return { value: environmentSecret, source: "worker_environment" as const };
  if (reference.vaultProvider === "google_secret_manager") {
    return { value: await readGoogleSecretManagerSecret(client, reference.vaultSecretId), source: "google_secret_manager" as const };
  }
  if (reference.vaultProvider === "windows_dpapi") {
    try {
      return { value: await readWindowsDpapiSecret(reference.vaultSecretId), source: "windows_dpapi" as const };
    } catch (error) {
      throw toLifecycleError(error, "WINDOWS_DPAPI_READ_FAILED", "Windows DPAPI secret 讀取失敗。");
    }
  }
  return null;
}

function toLifecycleError(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof SettingsSecretLifecycleError) return error;
  if (error instanceof GoogleSecretManagerError) {
    return new SettingsSecretLifecycleError(error.code, error.message, error.status);
  }
  if (error instanceof WindowsDpapiSecretError) {
    return new SettingsSecretLifecycleError(error.code, error.message, 409);
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
    const latestProbe = latest ? await repository.getLatestProbeJob(latest.id) : null;
    const activeProbe = active ? await repository.getLatestProbeJob(active.id) : latestProbe;
    const capabilityHeartbeat = await repository.getLatestWorkerCapabilityHeartbeat("solidworks_2d_preview_png");
    const workQueue = summarizeWorkQueue(references);
    const workerPresence = capabilityHeartbeat
      ? Date.parse(capabilityHeartbeat.lastSeenAt) >= Date.now() - 30_000
        ? { status: "online" as const, lastSeenAt: capabilityHeartbeat.lastSeenAt, message: `2D 預覽 worker capability heartbeat 在線（${capabilityHeartbeat.status}）。` }
        : { status: "offline" as const, lastSeenAt: capabilityHeartbeat.lastSeenAt, message: "2D 預覽 worker 最近未回報 capability heartbeat。" }
      : await workerPresenceFor(client);

    statuses.push({
      kind: definition.kind,
      provider: definition.provider,
      displayName: definition.displayName,
      configured: Boolean(active && active.vaultProvider !== "local_test_double"),
      active: redactReference(active),
      latest: redactReference(latest),
      latestTestRun,
      latestProbeJob: latestProbe
        ? {
            id: latestProbe.id,
            status: latestProbe.status,
            resultCode: latestProbe.resultCode,
            readerVersion: latestProbe.readerVersion,
            createdAt: latestProbe.createdAt,
            updatedAt: latestProbe.updatedAt
          }
        : null,
      draftCount: references.filter((reference) => reference.lifecycleStatus === "draft").length,
      testedCount: references.filter((reference) => reference.lifecycleStatus === "tested").length,
      revokedCount: references.filter((reference) => reference.lifecycleStatus === "revoked").length,
      ...workQueue,
      liveGate: liveGateFor(client, active ?? latest),
      workerReadiness: workerReadinessFor(client, active, activeProbe, capabilityHeartbeat),
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
  void input;
  throw new SettingsSecretLifecycleError("SECRET_PROBE_ASYNC_REQUIRED", "Secret 測試已改為 worker 原生 probe queue，請使用 enqueueSettingsSecretProbe。", 409);
}

export async function enqueueSettingsSecretProbe(input: { secretReferenceId: string; actorId: string }) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncSettingsSecretRepository(client);
  const reference = await repository.getReferenceById(input.secretReferenceId);
  if (!reference) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_FOUND", "找不到 secret version。", 404);
  if (reference.lifecycleStatus !== "draft" && reference.lifecycleStatus !== "tested") {
    throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_TESTABLE", "只有草稿或已測試版本可執行測試。", 409);
  }
  if (reference.vaultProvider === "local_test_double") {
    throw new SettingsSecretLifecycleError("SECRET_TEST_DOUBLE_NOT_ACTIVATABLE", "本機測試替身只供模擬，不能通過原生 probe 或啟用。", 409);
  }
  const existing = await repository.getLatestProbeJob(reference.id);
  if (existing && (existing.status === "pending" || existing.status === "running")) return existing;
  const now = new Date().toISOString();
  const job = await repository.enqueueProbeJob({
    id: `secret-probe-${crypto.randomUUID()}`,
    secretReferenceId: reference.id,
    kind: reference.kind,
    createdBy: input.actorId,
    createdAt: now
  });
  await createAuditLogAsync({
    actorId: input.actorId,
    action: "SettingsSecretProbeQueued",
    detail: { kind: reference.kind, version: reference.version, fingerprint: reference.fingerprint, probeJobId: job.id }
  });
  return job;
}

export async function completeSettingsSecretProbe(input: {
  probeJobId: string;
  workerId: string;
  status: "passed" | "failed" | "blocked";
  resultCode: string | null;
  readerVersion: string | null;
  summary?: string;
}) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncSettingsSecretRepository(client);
  const job = await repository.getProbeJobById(input.probeJobId);
  if (!job) throw new SettingsSecretLifecycleError("SECRET_PROBE_JOB_NOT_FOUND", "找不到 probe job。", 404);
  if (job.status !== "running" || job.lockedBy !== input.workerId) throw new SettingsSecretLifecycleError("SECRET_PROBE_JOB_LOCKED", "probe job 已被其他 worker 接手或已完成。", 409);
  const reference = await repository.getReferenceById(job.secretReferenceId);
  if (!reference) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_FOUND", "找不到 probe 對應 secret version。", 404);
  const completedAt = new Date().toISOString();
  const updated = await repository.completeProbeJob({
    id: job.id,
    workerId: input.workerId,
    status: input.status,
    resultCode: input.resultCode,
    readerVersion: input.readerVersion,
    completedAt
  });
  if (!updated) throw new SettingsSecretLifecycleError("SECRET_PROBE_JOB_LOCKED", "probe job 狀態已變更。", 409);
  const testRun: SettingsSecretTestRun = {
    id: `setting-test-${crypto.randomUUID()}`,
    secretReferenceId: reference.id,
    kind: reference.kind,
    provider: reference.provider,
    resultStatus: input.status,
    summary: input.summary ?? (input.status === "passed" ? "SolidWorks Document Manager 原生 credential probe 通過。" : "SolidWorks Document Manager 原生 credential probe 未通過。"),
    redactedError: input.resultCode,
    artifactPath: null,
    testedBy: reference.createdBy,
    testedAt: completedAt,
    metadataJson: JSON.stringify({
      probeJobId: job.id,
      readerVersion: input.readerVersion,
      provider: reference.vaultProvider,
      plaintextPersisted: false
    })
  };
  await repository.insertTestRun(testRun);
  if (input.status === "passed") await repository.markReferenceTested(reference.id, completedAt);
  await createLifecycleEvent(repository, {
    secretReferenceId: reference.id,
    kind: reference.kind as SettingsSecretKind,
    eventType: "tested",
    actorId: reference.createdBy,
    eventAt: completedAt,
    detail: { version: reference.version, resultStatus: input.status, probeJobId: job.id, resultCode: input.resultCode, workerId: input.workerId }
  });
  return testRun;
}

export async function resolveSettingsSecretProbeCredential(probeJobId: string, workerId: string) {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncSettingsSecretRepository(client);
  const job = await repository.getProbeJobById(probeJobId);
  if (!job) throw new SettingsSecretLifecycleError("SECRET_PROBE_JOB_NOT_FOUND", "找不到 probe job。", 404);
  const reference = await repository.getReferenceById(job.secretReferenceId);
  if (!reference) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_FOUND", "找不到 probe 對應 secret version。", 404);
  if (job.status !== "running" || job.lockedBy !== workerId) throw new SettingsSecretLifecycleError("SECRET_PROBE_JOB_NOT_RUNNING", "probe job 尚未由此 worker claim。", 409);
  if (reference.vaultProvider === "local_test_double" || reference.vaultProvider === "supabase_vault") {
    throw new SettingsSecretLifecycleError("SECRET_PROVIDER_NOT_READABLE", "此 provider 不可執行原生 probe。", 409);
  }
  const resolved = await resolveSecretReferenceValue(client, reference);
  if (!resolved?.value) throw new SettingsSecretLifecycleError("SECRET_VALUE_NOT_AVAILABLE", "secure provider 尚未提供此版本的 secret。", 409);
  return { value: resolved.value, version: reference.version, fingerprint: reference.fingerprint, source: resolved.source };
}

export async function activateSettingsSecretReference(input: { secretReferenceId: string; actorId: string }): Promise<SettingsSecretReference> {
  const client = getAsyncDatabaseClient();
  const repository = new AsyncSettingsSecretRepository(client);
  const reference = await repository.getReferenceById(input.secretReferenceId);
  if (!reference) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_FOUND", "找不到 secret version。", 404);
  if (reference.lifecycleStatus !== "tested") {
    throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_TESTED", "只有已測試通過的 secret version 可以啟用。", 409);
  }
  if (reference.vaultProvider === "local_test_double") {
    throw new SettingsSecretLifecycleError("SECRET_TEST_DOUBLE_NOT_ACTIVATABLE", "本機測試替身不能啟用。", 409);
  }
  const latestProbe = await repository.getLatestProbeJob(reference.id);
  if (!latestProbe || latestProbe.status !== "passed") {
    throw new SettingsSecretLifecycleError("SECRET_NATIVE_PROBE_REQUIRED", "必須先完成同一版本的真實 SolidWorks Document Manager probe。", 409);
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
