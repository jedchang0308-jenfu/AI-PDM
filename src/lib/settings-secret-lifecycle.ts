import crypto from "node:crypto";
import { createAuditLogAsync } from "@/lib/audit-async";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
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
        liveGate: "supabase_vault_live_verification_required",
        storageBoundary: "secret_material_not_persisted_by_local_test_double"
      }
    };
  }
}

class SupabaseVaultSecretProvider implements SecretProvider {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async createSecret(input: { kind: SettingsSecretKind; value: string; displayName: string; actorId: string }): Promise<SecretStoreResult> {
    if (this.client.kind !== "postgres" || process.env.PDM_ENABLE_SUPABASE_VAULT_WRITES !== "true") {
      throw new SettingsSecretLifecycleError(
        "SUPABASE_VAULT_LIVE_GATE_REQUIRED",
        "Supabase Vault 寫入需要 Postgres runtime 與明確的 PDM_ENABLE_SUPABASE_VAULT_WRITES=true。",
        409,
        { provider: "supabase_vault" }
      );
    }

    const secretName = `pdm/${input.kind}/${crypto.randomUUID()}`;
    const row = await this.client.queryOne<{ vault_secret_id: string }>(
      "SELECT vault.create_secret(:secretValue, :secretName, :description) AS vault_secret_id",
      {
        secretValue: input.value,
        secretName,
        description: `${input.displayName} managed by PDM settings center`
      }
    );

    if (!row?.vault_secret_id) {
      throw new SettingsSecretLifecycleError("SUPABASE_VAULT_WRITE_FAILED", "Supabase Vault 未回傳 secret reference。", 502);
    }

    return {
      vaultProvider: "supabase_vault",
      vaultSecretId: row.vault_secret_id,
      maskedHint: maskSecret(input.value),
      fingerprint: fingerprintSecret(input.value),
      metadata: { secretName }
    };
  }
}

function resolveProvider(client: AsyncDatabaseClient): SecretProvider {
  const provider = (process.env.PDM_SETTINGS_SECRET_PROVIDER ?? "local_test_double").trim().toLowerCase();
  if (provider === "supabase_vault") return new SupabaseVaultSecretProvider(client);
  return new LocalTestDoubleSecretProvider();
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

function liveGateFor(reference: SettingsSecretReference | null | undefined): SettingsSecretStatus["liveGate"] {
  if (reference?.vaultProvider === "supabase_vault") {
    return { provider: "supabase_vault", status: "ready", message: "已使用 Supabase Vault reference；production 前仍需 live smoke evidence。" };
  }
  if ((process.env.PDM_SETTINGS_SECRET_PROVIDER ?? "local_test_double").trim().toLowerCase() === "supabase_vault") {
    return { provider: "supabase_vault", status: "blocked", message: "Supabase Vault live target 尚未完成，無法寫入 secret。" };
  }
  return { provider: "local_test_double", status: "mocked", message: "目前使用本機 test double；production 啟用前需補 Supabase Vault live 驗證。" };
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
      liveGate: liveGateFor(active ?? latest)
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
  const provider = resolveProvider(client);
  const repository = new AsyncSettingsSecretRepository(client);
  const now = new Date().toISOString();
  const stored = await provider.createSecret({ kind: definition.kind, value: secretValue, displayName: definition.displayName, actorId: input.actorId });
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
  const testRun: SettingsSecretTestRun = {
    id: `setting-test-${crypto.randomUUID()}`,
    secretReferenceId: reference.id,
    kind: reference.kind,
    provider: reference.provider,
    resultStatus: isLocalDouble ? "passed" : "blocked",
    summary: isLocalDouble
      ? "本機 test double 已驗證 secret metadata lifecycle 與 redaction 邊界。"
      : "Supabase Vault reference 已存在；仍需 provider-specific live probe。",
    redactedError: isLocalDouble ? null : "SUPABASE_VAULT_PROVIDER_PROBE_REQUIRED",
    artifactPath: null,
    testedBy: input.actorId,
    testedAt: now,
    metadataJson: JSON.stringify({
      liveGate: isLocalDouble ? "supabase_vault_live_verification_required" : "provider_probe_required",
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
