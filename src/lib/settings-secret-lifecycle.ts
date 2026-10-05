import { requireCurrentSettingsSecretActivationAuthority, SettingsSecretActivationDenied } from "@/lib/settings-secret-activation-authority";
import { deriveSettingsSecretWorkflow, type SettingsSecretWorkflow } from "@/lib/settings-secret-workflow";
import type { SettingsSecretActivationIntent } from "@/lib/repositories/settings-secret-async-repository";
import crypto from "node:crypto";
import { isWorkerPurposeConfigured, type VerifiedWorkloadActor } from "@/lib/worker-service-auth";
import { createAuditLogAsync } from "@/lib/audit-async";
import { createPdmCommand, type PdmCommandMetadata } from "@/lib/platform-command";
import { executePdmCommandWithOutbox } from "@/lib/platform-command-service";
import { PlatformOutboxAsyncRepository } from "@/lib/repositories/platform-outbox-async-repository";
import { withVerifiedJenfuPrincipalRequest, type VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
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
  type SettingsSecretProbeJob,
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
  workflow: SettingsSecretWorkflow | null;
  nativeWorker: { online: boolean; lastSeenAt: string | null; workerId: string | null };
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
    const configured = client.kind === "postgres" && Boolean(getGoogleSecretManagerConfig()) &&
      isGoogleSecretManagerReadEnabled() && isGoogleSecretManagerWriteEnabled();
    return { provider: "google_secret_manager", status: "blocked", message: configured
      ? "Google Secret Manager 設定已就緒；尚未建立金鑰版本，請先建立草稿、測試並啟用。Worker 上線狀態需另行確認。"
      : "Google Secret Manager 尚缺 Cloud SQL、project/secret 設定或 read/write gate；尚無金鑰版本。" };
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
  return isWorkerPurposeConfigured("settings_secret_probe");
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

    const dmHeartbeat = await repository.getLatestWorkerCapabilityHeartbeat("solidworks_document_manager");
    const heartbeatAge = dmHeartbeat ? Date.now() - new Date(dmHeartbeat.lastSeenAt).getTime() : NaN;
    const intent = client.kind === "postgres" && latest ? await repository.getLatestIntent(latest.id) : null;
    const matchingHeartbeat = client.kind === "postgres" && active ? await repository.getMatchingDocumentManagerHeartbeat(active) : null;
    const workflow = latest ? deriveSettingsSecretWorkflow({ reference: latest, active, intent, job: latestProbe,
      heartbeat: matchingHeartbeat ?? dmHeartbeat }) : null;
    statuses.push({
      kind: definition.kind,
      workflow, nativeWorker: { online: Boolean(dmHeartbeat && heartbeatAge >= 0 && heartbeatAge <= 30_000),
        lastSeenAt: dmHeartbeat?.lastSeenAt ?? null, workerId: dmHeartbeat?.workerId ?? null },
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

function requireSecretCommand(metadata: PdmCommandMetadata) {
  if (!metadata || metadata.actor.authorizationActor?.sessionSchemaVersion !== 2 ||
      !metadata.principalRequest || !metadata.principalAuthorization ||
      metadata.principalAuthorization.permissionCode !== "settings.secret.manage" ||
      getAsyncDatabaseClient().kind !== "postgres") {
    throw new SettingsSecretLifecycleError("SETTINGS_SECRET_PRINCIPAL_CONTEXT_REQUIRED", "需要已驗證的 Principal 命令。", 403);
  }
}

function humanSecurityActor(verified: VerifiedPrincipalRequest) {
  return { kind: "human" as const, principalId: verified.session.principalId,
    profileVersion: verified.session.profileVersion };
}

async function executeSecretCommand<TResult>(metadata: PdmCommandMetadata, commandName: string,
  payload: Record<string, unknown>, execute: (client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) => Promise<TResult>,
  event: (result: TResult) => { aggregateId: string; payload: Record<string, unknown> }) {
  requireSecretCommand(metadata);
  const command = createPdmCommand({ commandName, idempotencyKey: metadata.idempotencyKey,
    actor: metadata.actor, payload });
  let completed;
  try { completed = await executePdmCommandWithOutbox({ client: getAsyncDatabaseClient(), command,
    principalRequest: metadata.principalRequest, principalAuthorization: metadata.principalAuthorization,
    serializable: true,
    execute: async (snapshot, _decision, verified) => {
      if (!verified) throw new SettingsSecretLifecycleError("SETTINGS_SECRET_PRINCIPAL_CONTEXT_REQUIRED", "需要 Principal。", 403);
      await new AsyncSettingsSecretRepository(snapshot).lockKind("solidworks_document_manager");
      return execute(snapshot, verified);
    },
    event: result => ({ aggregateType: "settings_secret", eventType: commandName, ...event(result) }) }); }
  catch (error) {
    // The shared command verifies current grants inside the write snapshot.
    // Preserve that explicit denial; unrelated dependency failures stay errors.
    if (error instanceof Error && error.message === "PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED") {
      throw new SettingsSecretLifecycleError("SETTINGS_SECRET_PERMISSION_DENIED", "沒有設定管理權限。", 403);
    }
    throw error;
  }
  return completed.result;
}

async function auditSecretCommand(client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest,
  action: string, detail: Record<string, unknown>) {
  await createAuditLogAsync({ actorId: verified.profile.pdmUserId, companyId: verified.profile.companyId,
    scopeKind: "tenant", action, detail: { ...detail, securityActor: humanSecurityActor(verified) } }, client);
}

/** Provider I/O is outside the SQL transaction. Replays are checked before it;
 * command-time admission is rechecked before publishing any database effect.
 * A provider version orphaned by a failed commit remains unreferenced, never active.
 */
async function workflowInSnapshot(repository: AsyncSettingsSecretRepository, reference: SettingsSecretReference,
  job?: SettingsSecretProbeJob | null): Promise<SettingsSecretWorkflow> {
  const references = await repository.listReferencesByKind(reference.kind);
  const current = references.find(item => item.id === reference.id) ?? reference;
  const active = references.find(item => item.lifecycleStatus === "active") ?? null;
  const intent = await repository.getLatestIntent(reference.id);
  const heartbeat = active ? await repository.getMatchingDocumentManagerHeartbeat(active) : null;
  return deriveSettingsSecretWorkflow({reference:current,active,intent,
    job:job ?? await repository.getLatestProbeJob(reference.id),
    heartbeat:heartbeat ?? await repository.getLatestWorkerCapabilityHeartbeat("solidworks_document_manager"),
    now:Date.parse(await repository.databaseNow())});
}

export type SettingsSecretDraftResult = SettingsSecretReference & {
  workflow: SettingsSecretWorkflow; intent: SettingsSecretActivationIntent | null; probeJob: SettingsSecretProbeJob | null;
};

export async function createSettingsSecretDraft(input: { kind: string; secretValue: string; autoActivate?: boolean }, metadata: PdmCommandMetadata): Promise<SettingsSecretDraftResult> {
  requireSecretCommand(metadata);
  const autoActivate = strictAutoActivate(input.autoActivate);
  const definition = getKindDefinition(input.kind);
  const secretValue = String(input.secretValue ?? "").trim();
  if (secretValue.length < definition.minimumLength) {
    throw new SettingsSecretLifecycleError("SECRET_VALUE_TOO_SHORT", "Secret 長度不足，請確認輸入完整 API/license key。", 400);
  }
  const payload = { kind: definition.kind, fingerprint: fingerprintSecret(secretValue), autoActivate };
  const command = createPdmCommand({ commandName: "pdm.settings_secret.create_draft",
    idempotencyKey: metadata.idempotencyKey, actor: metadata.actor, payload });
  const client = getAsyncDatabaseClient();
  const replay = await withVerifiedJenfuPrincipalRequest({ ...metadata.principalRequest!, database: client }, async (snapshot, verified) => {
    if (verified.session.principalId !== metadata.actor.principalId ||
        verified.profile.companyId !== metadata.actor.organizationId ||
        verified.profile.pdmUserId !== metadata.actor.pdmUserId) {
      throw new SettingsSecretLifecycleError("SETTINGS_SECRET_PRINCIPAL_CONTEXT_REQUIRED", "Principal 不一致。", 403);
    }
    const [decision] = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
      [{ permissionKind: "action", permissionCode: "settings.secret.manage" }]);
    if (!decision?.allowed) throw new SettingsSecretLifecycleError("SETTINGS_SECRET_PERMISSION_DENIED", "沒有設定管理權限。", 403);
    return new PlatformOutboxAsyncRepository(snapshot).findCompletedCommand<SettingsSecretDraftResult>(command);
  });
  if (replay.completed) return replay.result;
  let stored: SecretStoreResult;
  try { stored = await resolveProvider().createSecret({ kind: definition.kind, value: secretValue,
    displayName: definition.displayName, actorId: metadata.actor.pdmUserId }); }
  catch (error) {
    const safe=toLifecycleError(error,"SETTINGS_SECRET_PROVIDER_WRITE_FAILED","Secret provider 寫入失敗。");
    throw new SettingsSecretLifecycleError(safe.code,safe.message,safe.status,{...safe.details,retryable:false});
  }
  return executeSecretCommand(metadata, command.commandName, payload, async (snapshot, verified) => {
    const repository = new AsyncSettingsSecretRepository(snapshot);
    const now = await repository.databaseNow();
    const reference: SettingsSecretReference = {
      id: `secret-ref-${crypto.randomUUID()}`, kind: definition.kind, provider: definition.provider,
      displayName: definition.displayName, vaultProvider: stored.vaultProvider, vaultSecretId: stored.vaultSecretId,
      maskedHint: stored.maskedHint, fingerprint: stored.fingerprint, lifecycleStatus: "draft",
      version: await repository.getNextVersion(definition.kind), createdBy: verified.profile.pdmUserId, createdAt: now,
      testedAt: null, activatedBy: null, activatedAt: null, retiredBy: null, retiredAt: null,
      revokedBy: null, revokedAt: null, revokeReason: null,
      metadataJson: JSON.stringify({ ...stored.metadata, securityActor: humanSecurityActor(verified), companyId: verified.profile.companyId })
    };
    await repository.insertReference(reference);
    const probeJob = autoActivate ? await createTypedProbeJob(repository, reference, verified, now) : null;
    const intent = probeJob ? await recordActivationConsent(snapshot, repository, reference, probeJob, verified, now) : null;
    await createLifecycleEvent(repository, { secretReferenceId: reference.id, kind: definition.kind,
      eventType: "created_draft", actorId: verified.profile.pdmUserId, eventAt: now,
      detail: { version: reference.version, vaultProvider: reference.vaultProvider, securityActor: humanSecurityActor(verified), companyId: verified.profile.companyId } });
    await auditSecretCommand(snapshot, verified, "SettingsSecretDraftCreated",
      { secretReferenceId: reference.id, kind: definition.kind, version: reference.version, vaultProvider: reference.vaultProvider });
    return {...reference,intent,probeJob,workflow:await workflowInSnapshot(repository,reference,probeJob)};
  }, reference => ({ aggregateId: reference.id, payload: { secretReferenceId: reference.id, kind: reference.kind, version: reference.version } }));
}

function strictAutoActivate(value: unknown): boolean {
  if (value !== undefined && typeof value !== "boolean") throw new SettingsSecretLifecycleError("INVALID_AUTO_ACTIVATE", "autoActivate 必須是 boolean。", 400);
  return value === true;
}

function requireReferenceCompany(reference: SettingsSecretReference, companyId: string) {
  let metadata;
  try { metadata = JSON.parse(reference.metadataJson); } catch {
    throw new SettingsSecretLifecycleError("SECRET_REFERENCE_PROVENANCE_REQUIRED", "缺少可信任的版本 provenance。", 409);
  }
  if (!metadata || metadata.companyId !== companyId) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_SCOPE_MISMATCH", "版本不屬於目前公司。", 403);
  const actor = metadata.securityActor;
  if (actor?.kind !== "human" || typeof actor.principalId !== "string" || !actor.principalId.trim() ||
    !Number.isSafeInteger(actor.profileVersion) || actor.profileVersion < 1) {
    throw new SettingsSecretLifecycleError("SECRET_REFERENCE_PROVENANCE_REQUIRED", "缺少可信任的版本 provenance。", 409);
  }
}

async function createTypedProbeJob(repository: AsyncSettingsSecretRepository, reference: SettingsSecretReference,
  verified: VerifiedPrincipalRequest, now: string) {
  return repository.enqueueProbeJob({ id: `secret-probe-${crypto.randomUUID()}`, secretReferenceId: reference.id,
    kind: reference.kind, createdBy: verified.profile.pdmUserId, createdAt: now,
    companyId: verified.profile.companyId, initiatorPrincipalId: verified.session.principalId,
    initiatorProfileVersion: verified.session.profileVersion, purpose: "settings_secret_probe" });
}

async function recordActivationConsent(snapshot: AsyncDatabaseClient, repository: AsyncSettingsSecretRepository,
  reference: SettingsSecretReference, job: SettingsSecretProbeJob, verified: VerifiedPrincipalRequest, now: string) {
  requireReferenceCompany(reference, verified.profile.companyId);
  probeProvenance(job);
  if (job.companyId !== verified.profile.companyId) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_SCOPE_MISMATCH", "probe 公司不符。", 403);
  const existing = await repository.getLatestIntent(reference.id, true);
  if (existing?.probeJobId === job.id) return existing; // Never rewrite the first consent or original initiator.
  if (existing) {
    await repository.updateIntent(existing.id,"superseded","probe_replaced",now);
    await auditSecretCommand(snapshot,verified,"SettingsSecretActivationConsentSuperseded",{intentId:existing.id,probeJobId:existing.probeJobId});
  }
  const newer = await repository.newestConsentedVersion(reference.kind) > reference.version;
  if (!newer) await repository.supersedePending(reference.kind, reference.id, now);
  const intent: SettingsSecretActivationIntent = { id: `secret-intent-${crypto.randomUUID()}`,
    secretReferenceId: reference.id, probeJobId: job.id, kind: reference.kind, companyId: verified.profile.companyId,
    consentPrincipalId: verified.session.principalId, consentEmployeeId: verified.session.employeeId,
    consentPdmUserId: verified.profile.pdmUserId, identityIssuer: verified.session.identityIssuer,
    identitySubject: verified.session.identitySubject, profileVersion: verified.session.profileVersion,
    accountLifecycleVersion: verified.session.accountLifecycleVersion, authEpoch: verified.session.authEpoch,
    authenticatedAt: verified.session.authenticatedAt, sessionIssuedAt: verified.session.issuedAt,
    requestedAt: now, state: newer ? "superseded" : "pending", safeResultCode: newer ? "newer_consent" : null,
    activatedAt: null, activationTestRunId: null, updatedAt: now };
  await repository.insertIntent(intent);
  await auditSecretCommand(snapshot, verified, "SettingsSecretActivationConsentRecorded", {
    intentId: intent.id, secretReferenceId: reference.id, probeJobId: job.id, state: intent.state,
    probeInitiator: probeProvenance(job), consentActor: humanSecurityActor(verified) });
  return intent;
}

export async function enqueueSettingsSecretProbe(input: { secretReferenceId: string; autoActivate?: boolean }, metadata: PdmCommandMetadata) {
  const autoActivate = strictAutoActivate(input.autoActivate);
  return executeSecretCommand(metadata, "pdm.settings_secret.probe.enqueue", { ...input, autoActivate }, async (snapshot, verified) => {
    const repository = new AsyncSettingsSecretRepository(snapshot);
    const reference = await repository.getReferenceById(input.secretReferenceId, true);
    if (!reference) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_FOUND", "找不到 secret version。", 404);
    requireReferenceCompany(reference, verified.profile.companyId);
    if (!["draft", "tested"].includes(reference.lifecycleStatus)) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_TESTABLE", "只有草稿或已測試版本可執行測試。", 409);
    if (reference.vaultProvider === "local_test_double") throw new SettingsSecretLifecycleError("SECRET_TEST_DOUBLE_NOT_ACTIVATABLE", "測試替身不能執行原生 probe。", 409);
    const now = await repository.databaseNow();
    const pendingIntent = await repository.getLatestIntent(reference.id,true);
    if (pendingIntent) {
      const priorJob = await repository.getProbeJobById(pendingIntent.probeJobId,true);
      if (priorJob && ["failed","blocked","expired"].includes(priorJob.status)) {
        await activatePendingIntent(snapshot,repository,reference,priorJob,pendingIntent,now);
      }
    }
    let job = await repository.getActiveTypedProbeJob(reference.id);
    if (!job && autoActivate) {
      const latest = await repository.getLatestProbeJob(reference.id);
      if (latest?.status === "passed") job = latest;
    }
    if (job) {
      probeProvenance(job);
      if (job.companyId !== verified.profile.companyId) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_SCOPE_MISMATCH", "probe 公司不符。", 403);
    } else {
      job = await createTypedProbeJob(repository, reference, verified, now);
      await auditSecretCommand(snapshot, verified, "SettingsSecretProbeQueued",
        { kind: reference.kind, version: reference.version, secretReferenceId: reference.id, probeJobId: job.id });
    }
    if (autoActivate) {
      const intent = await recordActivationConsent(snapshot, repository, reference, job, verified, now);
      if (intent.state === "pending" && job.status === "passed") {
        await activatePendingIntent(snapshot, repository, reference, job, intent, now);
      }
    }
    return {...job,workflow:await workflowInSnapshot(repository,reference,job)};
  }, job => ({ aggregateId: job.secretReferenceId, payload: { probeJobId: job.id, secretReferenceId: job.secretReferenceId,
    purpose: job.purpose, initiatorPrincipalId: job.initiatorPrincipalId, companyId: job.companyId } }));
}

export const resumeSettingsSecretActivation = (input: { secretReferenceId: string }, metadata: PdmCommandMetadata) =>
  enqueueSettingsSecretProbe({ ...input, autoActivate: true }, metadata);

async function activateTestedReferenceInSnapshot(snapshot: AsyncDatabaseClient, repository: AsyncSettingsSecretRepository,
  reference: SettingsSecretReference, probe: SettingsSecretProbeJob,
  human: { principalId: string; pdmUserId: string; companyId: string }, now: string,
  detail: Record<string, unknown>) {
  requireReferenceCompany(reference, human.companyId);
  probeProvenance(probe);
  if (reference.lifecycleStatus !== "tested" || ["local_test_double","supabase_vault"].includes(reference.vaultProvider) ||
    probe.status !== "passed" || probe.companyId !== human.companyId || probe.secretReferenceId !== reference.id) {
    throw new SettingsSecretLifecycleError("SECRET_NATIVE_PROBE_REQUIRED", "需要同一版本的原生 probe。", 409);
  }
  const latestProbe = await repository.getLatestProbeJob(reference.id);
  if (latestProbe?.id !== probe.id) throw new SettingsSecretLifecycleError("SECRET_NATIVE_PROBE_REQUIRED","需要最新同版本測試。",409);
  const testRun = probe.completionTestRunId ? await repository.getTestRunById(probe.completionTestRunId) : await repository.getLatestTestRun(reference.id);
  let proof;
  try { proof = testRun && JSON.parse(testRun.metadataJson); } catch { proof = null; }
  if (!testRun || testRun.resultStatus !== "passed" || testRun.secretReferenceId !== reference.id ||
    proof?.probeJobId !== probe.id || proof?.companyId !== human.companyId || proof?.securityActor?.kind !== "workload" ||
    proof?.securityActor?.purpose !== "settings_secret_probe") {
    throw new SettingsSecretLifecycleError("SECRET_NATIVE_PROBE_REQUIRED", "需要可信任的同版本測試 receipt。", 409);
  }
  await repository.retireActiveReferences(reference.kind, reference.id, human.pdmUserId, now);
  await repository.activateReference(reference.id, human.pdmUserId, now);
  await createLifecycleEvent(repository, { secretReferenceId: reference.id, kind: reference.kind as SettingsSecretKind,
    eventType: "activated", actorId: human.pdmUserId, eventAt: now,
    detail: { ...detail, version: reference.version, companyId: human.companyId } });
  await createAuditLogAsync({ actorId: human.pdmUserId, companyId: human.companyId, scopeKind: "tenant",
    action: "SettingsSecretActivated", detail: { ...detail, secretReferenceId: reference.id, version: reference.version } }, snapshot);
  return testRun;
}

async function activatePendingIntent(snapshot: AsyncDatabaseClient, repository: AsyncSettingsSecretRepository,
  reference: SettingsSecretReference, job: SettingsSecretProbeJob, intent: SettingsSecretActivationIntent, now: string) {
  if (intent.state !== "pending" || intent.probeJobId !== job.id || intent.secretReferenceId !== reference.id ||
    job.secretReferenceId !== reference.id || intent.kind !== reference.kind || job.kind !== reference.kind ||
    intent.companyId !== job.companyId) return;
  let safeCode: string | null = null;
  let state: "blocked" | "superseded" = "blocked";
  if (await repository.newestConsentedVersion(reference.kind) > reference.version) { safeCode = "newer_consent"; state = "superseded"; }
  else if (["retired","revoked"].includes(reference.lifecycleStatus)) safeCode = "reference_inactive";
  else if (["failed","blocked","expired"].includes(job.status)) safeCode = "native_probe_not_passed";
  else if (job.status !== "passed") return;
  if (!safeCode) {
    try {
      const human = await requireCurrentSettingsSecretActivationAuthority(snapshot, intent);
      const testRun = await activateTestedReferenceInSnapshot(snapshot, repository, reference, job, human, now,
        { intentId: intent.id, consentPrincipalId: intent.consentPrincipalId, consentProfileVersion: intent.profileVersion,
          probeInitiator: probeProvenance(job), securityActor: { kind: "workload", id: job.lockedBy, purpose: "settings_secret_probe" } });
      await repository.updateIntent(intent.id, "activated", null, now, testRun.id);
      return;
    } catch (error) {
      if (error instanceof SettingsSecretActivationDenied) safeCode = error.code;
      else if (error instanceof SettingsSecretLifecycleError && ["SECRET_NATIVE_PROBE_REQUIRED","SECRET_REFERENCE_SCOPE_MISMATCH","SECRET_REFERENCE_PROVENANCE_REQUIRED"].includes(error.code)) safeCode = "native_proof_invalid";
      else throw error; // Dependency/unknown failure rolls back probe completion and activation together.
    }
  }
  await repository.updateIntent(intent.id, state, safeCode, now);
  await createAuditLogAsync({ actorId: intent.consentPdmUserId, companyId: intent.companyId, scopeKind: "tenant",
    action: "SettingsSecretActivationBlocked", detail: { intentId: intent.id, secretReferenceId: reference.id, safeCode,
      consentPrincipalId: intent.consentPrincipalId, probeInitiator: probeProvenance(job) } }, snapshot);
}

export async function reconcilePendingSettingsSecretActivation() {
  return getAsyncDatabaseClient().transaction(async snapshot => {
    const repository = new AsyncSettingsSecretRepository(snapshot);
    await repository.lockKind("solidworks_document_manager");
    const intent = await repository.getPendingIntentForReconciliation();
    if (!intent) return;
    const job = await repository.getProbeJobById(intent.probeJobId, true);
    const reference = await repository.getReferenceById(intent.secretReferenceId, true);
    if (!job || !reference) throw new Error("SETTINGS_SECRET_INTENT_BINDING_MISSING");
    await activatePendingIntent(snapshot, repository, reference, job, intent, await repository.databaseNow());
  }, { isolationLevel: "serializable", readOnly: false });
}

function probeProvenance(job: SettingsSecretProbeJob) {
  if (!job.companyId?.trim() || !job.initiatorPrincipalId?.trim() || job.initiatorPrincipalId.length > 255 ||
      /[\u0000-\u001f\u007f]/u.test(job.initiatorPrincipalId) ||
      !Number.isSafeInteger(job.initiatorProfileVersion) || Number(job.initiatorProfileVersion) < 1 ||
      job.purpose !== "settings_secret_probe") {
    throw new SettingsSecretLifecycleError("SECRET_PROBE_PRINCIPAL_PROVENANCE_REQUIRED", "歷史 probe 缺少可信任的 Principal；保持停用。", 409);
  }
  return { kind: "human" as const, principalId: job.initiatorPrincipalId, profileVersion: job.initiatorProfileVersion };
}

function requireProbeWorker(actor: VerifiedWorkloadActor) {
  if (actor.kind !== "workload" || !actor.id || !actor.purposes.includes("settings_secret_probe") ||
      !actor.capabilities.includes("solidworks_document_manager")) {
    throw new SettingsSecretLifecycleError("WORKLOAD_FORBIDDEN", "Worker purpose/capability 不符。", 403);
  }
}

function requireProbeLease(job: SettingsSecretProbeJob, actor: VerifiedWorkloadActor, leaseAttempt?: number) {
  probeProvenance(job);
  if (leaseAttempt !== undefined && (!Number.isSafeInteger(leaseAttempt) || leaseAttempt < 1 || leaseAttempt !== job.attemptCount)) {
    throw new SettingsSecretLifecycleError("SECRET_PROBE_JOB_LOCKED", "probe attempt 已被接手。", 409);
  }
  if (job.status !== "running" || job.lockedBy !== actor.id ||
      new Date(job.updatedAt).getTime() < Date.now() - 60_000 || !Number.isFinite(new Date(job.updatedAt).getTime())) {
    throw new SettingsSecretLifecycleError("SECRET_PROBE_JOB_LOCKED", "probe lease 已過期、被接手或已完成。", 409);
  }
}

const safeProbeResultCodes = new Set(["native_metadata_credential_probe_failed","native_metadata_license_missing",
  "native_metadata_credential_unavailable","native_metadata_not_configured"]);
function normalizedProbeResult(input: { status: "passed" | "failed" | "blocked"; resultCode: string | null; readerVersion: string | null; summary?: string }) {
  if (!["passed","failed","blocked"].includes(input.status) ||
    (input.readerVersion !== null && input.readerVersion.match(/^[A-Za-z0-9._:-]{1,120}$/u)?.[0] !== input.readerVersion)) {
    throw new SettingsSecretLifecycleError("INVALID_PROBE_RESULT", "probe 結果格式不符。", 400);
  }
  const summary=input.status === "passed" ? "SolidWorks Document Manager application probe 通過。" : "SolidWorks Document Manager application probe 未通過。";
  if (input.summary !== undefined && ![summary,"SolidWorks Document Manager 原生 credential probe 已完成。"].includes(input.summary)) {
    throw new SettingsSecretLifecycleError("INVALID_PROBE_RESULT","probe 摘要格式不符。",400);
  }
  return { status: input.status, resultCode: input.status === "passed" ? null :
    safeProbeResultCodes.has(input.resultCode ?? "") ? input.resultCode : "native_metadata_credential_probe_failed",
    readerVersion:input.readerVersion,summary:input.summary ?? summary };
}

export async function completeSettingsSecretProbe(input: {
  probeJobId: string; worker: VerifiedWorkloadActor; status: "passed" | "failed" | "blocked";
  resultCode: string | null; readerVersion: string | null; summary?: string; leaseAttempt?: number;
}) {
  requireProbeWorker(input.worker);
  const result = normalizedProbeResult(input);
  return getAsyncDatabaseClient().transaction(async snapshot => {
    const repository = new AsyncSettingsSecretRepository(snapshot);
    await repository.lockKind("solidworks_document_manager");
    const job = await repository.getProbeJobById(input.probeJobId, true);
    if (!job) throw new SettingsSecretLifecycleError("SECRET_PROBE_JOB_NOT_FOUND", "找不到 probe job。", 404);
    const digest = crypto.createHash("sha256").update(JSON.stringify({ workerId: input.worker.id,
      referenceId: job.secretReferenceId, attempt: input.leaseAttempt ?? null, ...result })).digest("hex");
    if (["passed","failed","blocked"].includes(job.status)) {
      if (job.lockedBy === input.worker.id && job.completionDigest === digest && job.completionTestRunId &&
        (input.leaseAttempt === undefined || input.leaseAttempt === job.attemptCount)) {
        const saved = await repository.getTestRunById(job.completionTestRunId);
        if (saved) {
          const reference = await repository.getReferenceById(job.secretReferenceId);
          if (!reference) throw new Error("SETTINGS_SECRET_RECEIPT_REFERENCE_MISSING");
          return {...saved,workflow:await workflowInSnapshot(repository,reference,job)};
        }
      }
      throw new SettingsSecretLifecycleError("SECRET_PROBE_RESULT_CONFLICT", "已完成結果與本次回報不符。", 409);
    }
    requireProbeLease(job, input.worker, input.leaseAttempt);
    const intent = await repository.getLatestIntent(job.secretReferenceId, true);
    if (input.leaseAttempt === undefined && await repository.getLatestIntent(job.secretReferenceId)) throw new SettingsSecretLifecycleError("PROBE_PROTOCOL_UPGRADE_REQUIRED", "此工作需要支援 fencing 的 worker。", 409);
    const reference = await repository.getReferenceById(job.secretReferenceId, true);
    if (!reference) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_FOUND", "找不到 secret version。", 404);
    if (!intent && !["draft","tested"].includes(reference.lifecycleStatus)) {
      throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_TESTABLE","此版本已非可測試狀態。",409);
    }
    const completedAt = await repository.databaseNow();
    if (!await repository.completeProbeJob({ id: job.id, workerId: input.worker.id, status: result.status,
      resultCode: result.resultCode, readerVersion: result.readerVersion, completedAt, leaseAttempt: input.leaseAttempt })) {
      throw new SettingsSecretLifecycleError("SECRET_PROBE_JOB_LOCKED", "probe job 狀態已變更。", 409);
    }
    const provenance = { probeJobId: job.id, companyId: job.companyId, initiator: probeProvenance(job),
      securityActor: { kind: "workload", id: input.worker.id, purpose: "settings_secret_probe" },
      leaseAttempt: job.attemptCount, readerVersion: result.readerVersion, provider: reference.vaultProvider,
      referenceVersion: reference.version, referenceFingerprint: reference.fingerprint, plaintextPersisted: false };
    const testRun: SettingsSecretTestRun = { id: `setting-test-${crypto.randomUUID()}`, secretReferenceId: reference.id,
      kind: reference.kind, provider: reference.provider, resultStatus: result.status, summary: result.summary,
      redactedError: result.resultCode, artifactPath: null, testedBy: job.createdBy, testedAt: completedAt,
      metadataJson: JSON.stringify(provenance) };
    await repository.insertTestRun(testRun);
    await repository.saveCompletionReceipt(job.id, digest, testRun.id);
    const completedJob = { ...job, status: result.status, completionTestRunId: testRun.id };
    if (result.status === "passed" && ["draft","tested"].includes(reference.lifecycleStatus)) {
      await repository.markReferenceTested(reference.id, completedAt);
      reference.lifecycleStatus = "tested";
    }
    await createLifecycleEvent(repository, { secretReferenceId: reference.id, kind: reference.kind as SettingsSecretKind,
      eventType: "tested", actorId: job.createdBy, eventAt: completedAt,
      detail: { ...provenance, resultStatus: result.status, resultCode: result.resultCode } });
    await createAuditLogAsync({ actorId: job.createdBy, companyId: job.companyId, scopeKind: "tenant",
      action: "SettingsSecretProbeCompleted", detail: { ...provenance, secretReferenceId: reference.id, resultStatus: result.status } }, snapshot);
    if (intent) await activatePendingIntent(snapshot, repository, reference, completedJob, intent, completedAt);
    return {...testRun,workflow:await workflowInSnapshot(repository,reference,completedJob)};
  }, { isolationLevel: "serializable", readOnly: false });
}

export async function resolveSettingsSecretProbeCredential(probeJobId: string, worker: VerifiedWorkloadActor, leaseAttempt?: number) {
  requireProbeWorker(worker);
  const client = getAsyncDatabaseClient();
  const repository = new AsyncSettingsSecretRepository(client);
  const job = await repository.getProbeJobById(probeJobId);
  if (!job) throw new SettingsSecretLifecycleError("SECRET_PROBE_JOB_NOT_FOUND", "找不到 probe job。", 404);
  requireProbeLease(job, worker, leaseAttempt);
  if (leaseAttempt === undefined && await repository.getLatestIntent(job.secretReferenceId)) {
    throw new SettingsSecretLifecycleError("PROBE_PROTOCOL_UPGRADE_REQUIRED", "此工作需要新版 worker。", 409);
  }
  const reference = await repository.getReferenceById(job.secretReferenceId);
  if (!reference) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_FOUND", "找不到 secret version。", 404);
  if (!["draft", "tested"].includes(reference.lifecycleStatus) ||
      ["local_test_double", "supabase_vault"].includes(reference.vaultProvider)) {
    throw new SettingsSecretLifecycleError("SECRET_PROVIDER_NOT_READABLE", "此版本不可執行原生 probe。", 409);
  }
  const resolved = await resolveSecretReferenceValue(client, reference);
  if (!resolved?.value) throw new SettingsSecretLifecycleError("SECRET_VALUE_NOT_AVAILABLE", "secure provider 尚未提供此版本。", 409);
  // Network reads do not hold a database lock. A lease or reference may have
  // changed while the provider answered; never return bytes to a former holder.
  const currentJob = await repository.getProbeJobById(probeJobId);
  if (!currentJob) throw new SettingsSecretLifecycleError("SECRET_PROBE_JOB_NOT_FOUND", "找不到 probe job。", 404);
  requireProbeLease(currentJob, worker, leaseAttempt);
  if (leaseAttempt === undefined && await repository.getLatestIntent(job.secretReferenceId)) {
    throw new SettingsSecretLifecycleError("PROBE_PROTOCOL_UPGRADE_REQUIRED", "此工作需要新版 worker。", 409);
  }
  const currentReference = await repository.getReferenceById(job.secretReferenceId);
  if (!currentReference || currentReference.vaultSecretId !== reference.vaultSecretId || currentReference.fingerprint !== reference.fingerprint ||
      currentReference.version !== reference.version || !["draft", "tested"].includes(currentReference.lifecycleStatus)) {
    throw new SettingsSecretLifecycleError("SECRET_PROVIDER_NOT_READABLE", "此版本已不可執行 probe。", 409);
  }
  return {value:resolved.value,version:reference.version,fingerprint:reference.fingerprint,source:resolved.source,
    secretReferenceId:reference.id,probeJobId,leaseAttempt:currentJob.attemptCount};
}

export async function activateSettingsSecretReference(input: { secretReferenceId: string }, metadata: PdmCommandMetadata): Promise<SettingsSecretReference> {
  return executeSecretCommand(metadata, "pdm.settings_secret.activate", input, async (snapshot, verified) => {
    const repository = new AsyncSettingsSecretRepository(snapshot);
    const reference = await repository.getReferenceById(input.secretReferenceId, true);
    if (!reference) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_FOUND", "找不到 secret version。", 404);
    requireReferenceCompany(reference, verified.profile.companyId);
    const probe = await repository.getLatestProbeJob(reference.id);
    if (!probe) throw new SettingsSecretLifecycleError("SECRET_NATIVE_PROBE_REQUIRED", "需要同一版本的原生 probe。", 409);
    const now = await repository.databaseNow();
    await activateTestedReferenceInSnapshot(snapshot, repository, reference, probe,
      { principalId: verified.session.principalId, pdmUserId: verified.profile.pdmUserId, companyId: verified.profile.companyId }, now,
      { securityActor: humanSecurityActor(verified) });
    await repository.supersedePending(reference.kind, reference.id, now);
    const pending = await repository.getLatestIntent(reference.id, true);
    if (pending) {
      const proof = await repository.getLatestTestRun(reference.id);
      await repository.updateIntent(pending.id, "activated", null, now, proof?.id ?? null);
    }
    return { ...reference, lifecycleStatus: "active", activatedBy: verified.profile.pdmUserId, activatedAt: now };
  }, reference => ({ aggregateId: reference.id, payload: { secretReferenceId: reference.id, kind: reference.kind, version: reference.version } }));
}

export async function revokeSettingsSecretReference(input: { secretReferenceId: string; reason?: string }, metadata: PdmCommandMetadata): Promise<SettingsSecretReference> {
  const reason = String(input.reason ?? "Admin revoked from settings center").trim().slice(0, 500);
  return executeSecretCommand(metadata, "pdm.settings_secret.revoke", { secretReferenceId: input.secretReferenceId, reason }, async (snapshot, verified) => {
    const repository = new AsyncSettingsSecretRepository(snapshot);
    const reference = await repository.getReferenceById(input.secretReferenceId, true);
    if (!reference) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_NOT_FOUND", "找不到 secret version。", 404);
    requireReferenceCompany(reference, verified.profile.companyId);
    if (["revoked", "retired"].includes(reference.lifecycleStatus)) throw new SettingsSecretLifecycleError("SECRET_REFERENCE_ALREADY_INACTIVE", "此版本已非有效狀態。", 409);
    const now = new Date().toISOString();
    await repository.revokeReference(reference.id, verified.profile.pdmUserId, now, reason);
    const pending = await repository.getLatestIntent(reference.id, true);
    if (pending) await repository.updateIntent(pending.id, "blocked", "reference_inactive", now);
    await createLifecycleEvent(repository, { secretReferenceId: reference.id, kind: reference.kind as SettingsSecretKind,
      eventType: "revoked", actorId: verified.profile.pdmUserId, eventAt: now,
      detail: { version: reference.version, reason, companyId: verified.profile.companyId, securityActor: humanSecurityActor(verified) } });
    await auditSecretCommand(snapshot, verified, "SettingsSecretRevoked", { secretReferenceId: reference.id, kind: reference.kind, version: reference.version, reason });
    return { ...reference, lifecycleStatus: "revoked", revokedBy: verified.profile.pdmUserId, revokedAt: now, revokeReason: reason };
  }, reference => ({ aggregateId: reference.id, payload: { secretReferenceId: reference.id, kind: reference.kind, version: reference.version } }));
}

export function redactSettingsSecretReference(reference: SettingsSecretReference): RedactedSecretVersionSummary {
  return redactReference(reference) as RedactedSecretVersionSummary;
}
