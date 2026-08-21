import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export type SettingsSecretLifecycleStatus = "draft" | "tested" | "active" | "retired" | "revoked";
export type SettingsSecretVaultProvider = "local_test_double" | "windows_dpapi" | "google_secret_manager" | "supabase_vault";
export type SettingsSecretTestStatus = "passed" | "failed" | "blocked";
export type SettingsSecretActivationEventType = "created_draft" | "tested" | "activated" | "retired" | "revoked";
export type SettingsSecretProbeStatus = "pending" | "running" | "passed" | "failed" | "blocked" | "expired";

export type SettingsSecretReference = {
  id: string;
  kind: string;
  provider: string;
  displayName: string;
  vaultProvider: SettingsSecretVaultProvider;
  vaultSecretId: string;
  maskedHint: string;
  fingerprint: string;
  lifecycleStatus: SettingsSecretLifecycleStatus;
  version: number;
  createdBy: string;
  createdAt: string;
  testedAt: string | null;
  activatedBy: string | null;
  activatedAt: string | null;
  retiredBy: string | null;
  retiredAt: string | null;
  revokedBy: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  metadataJson: string;
};

export type SettingsSecretTestRun = {
  id: string;
  secretReferenceId: string;
  kind: string;
  provider: string;
  resultStatus: SettingsSecretTestStatus;
  summary: string;
  redactedError: string | null;
  artifactPath: string | null;
  testedBy: string;
  testedAt: string;
  metadataJson: string;
};

export type SettingsSecretProbeJob = {
  id: string;
  secretReferenceId: string;
  kind: string;
  status: SettingsSecretProbeStatus;
  lockedBy: string | null;
  lockedAt: string | null;
  heartbeatAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  resultCode: string | null;
  readerVersion: string | null;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
};

export type WorkerCapabilityHeartbeat = {
  workerId: string;
  workerKind: string;
  capabilityCode: string;
  status: "ready" | "blocked" | "degraded";
  appliedSecretKind: string | null;
  appliedSecretVersion: number | null;
  appliedSecretFingerprint: string | null;
  readerVersion: string | null;
  issueCode: string | null;
  lastAppliedAt: string | null;
  lastSeenAt: string;
  updatedAt: string;
};

type SettingsSecretReferenceRow = {
  id: string;
  kind: string;
  provider: string;
  display_name: string;
  vault_provider: SettingsSecretVaultProvider;
  vault_secret_id: string;
  masked_hint: string;
  fingerprint: string;
  lifecycle_status: SettingsSecretLifecycleStatus;
  version: number | string;
  created_by: string;
  created_at: string;
  tested_at: string | null;
  activated_by: string | null;
  activated_at: string | null;
  retired_by: string | null;
  retired_at: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  metadata_json: string;
};

type SettingsSecretTestRunRow = {
  id: string;
  secret_reference_id: string;
  kind: string;
  provider: string;
  result_status: SettingsSecretTestStatus;
  summary: string;
  redacted_error: string | null;
  artifact_path: string | null;
  tested_by: string;
  tested_at: string;
  metadata_json: string;
};

type SettingsSecretProbeJobRow = {
  id: string;
  secret_reference_id: string;
  kind: string;
  status: SettingsSecretProbeStatus;
  locked_by: string | null;
  locked_at: string | null;
  heartbeat_at: string | null;
  attempt_count: number | string;
  max_attempts: number | string;
  result_code: string | null;
  reader_version: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
};

type WorkerCapabilityHeartbeatRow = {
  worker_id: string;
  worker_kind: string;
  capability_code: string;
  status: "ready" | "blocked" | "degraded";
  applied_secret_kind: string | null;
  applied_secret_version: number | string | null;
  applied_secret_fingerprint: string | null;
  reader_version: string | null;
  issue_code: string | null;
  last_applied_at: string | null;
  last_seen_at: string;
  updated_at: string;
};

export const SELECT_SECRET_REFERENCES_BY_KIND_SQL = `
  SELECT *
  FROM secret_references
  WHERE kind = :kind
  ORDER BY version DESC, created_at DESC
`;

export const SELECT_SECRET_REFERENCE_BY_ID_SQL = `
  SELECT *
  FROM secret_references
  WHERE id = :id
`;

export const SELECT_SECRET_REFERENCE_MAX_VERSION_SQL = `
  SELECT MAX(version) AS version
  FROM secret_references
  WHERE kind = :kind
`;

export const SELECT_LATEST_SECRET_TEST_RUN_SQL = `
  SELECT *
  FROM setting_test_runs
  WHERE secret_reference_id = :secretReferenceId
  ORDER BY tested_at DESC
  LIMIT 1
`;

export const INSERT_SECRET_REFERENCE_SQL = `
  INSERT INTO secret_references (
    id,
    kind,
    provider,
    display_name,
    vault_provider,
    vault_secret_id,
    masked_hint,
    fingerprint,
    lifecycle_status,
    version,
    created_by,
    created_at,
    metadata_json
  )
  VALUES (
    :id,
    :kind,
    :provider,
    :displayName,
    :vaultProvider,
    :vaultSecretId,
    :maskedHint,
    :fingerprint,
    :lifecycleStatus,
    :version,
    :createdBy,
    :createdAt,
    :metadataJson
  )
`;

export const INSERT_SECRET_TEST_RUN_SQL = `
  INSERT INTO setting_test_runs (
    id,
    secret_reference_id,
    kind,
    provider,
    result_status,
    summary,
    redacted_error,
    artifact_path,
    tested_by,
    tested_at,
    metadata_json
  )
  VALUES (
    :id,
    :secretReferenceId,
    :kind,
    :provider,
    :resultStatus,
    :summary,
    :redactedError,
    :artifactPath,
    :testedBy,
    :testedAt,
    :metadataJson
  )
`;

export const UPDATE_SECRET_REFERENCE_TESTED_SQL = `
  UPDATE secret_references
  SET lifecycle_status = :lifecycleStatus,
      tested_at = :testedAt
  WHERE id = :id
`;

export const RETIRE_ACTIVE_SECRET_REFERENCES_SQL = `
  UPDATE secret_references
  SET lifecycle_status = 'retired',
      retired_by = :retiredBy,
      retired_at = :retiredAt
  WHERE kind = :kind
    AND lifecycle_status = 'active'
    AND id <> :exceptId
`;

export const ACTIVATE_SECRET_REFERENCE_SQL = `
  UPDATE secret_references
  SET lifecycle_status = 'active',
      activated_by = :activatedBy,
      activated_at = :activatedAt
  WHERE id = :id
`;

export const REVOKE_SECRET_REFERENCE_SQL = `
  UPDATE secret_references
  SET lifecycle_status = 'revoked',
      revoked_by = :revokedBy,
      revoked_at = :revokedAt,
      revoke_reason = :revokeReason
  WHERE id = :id
`;

export const INSERT_SETTING_ACTIVATION_EVENT_SQL = `
  INSERT INTO setting_activation_events (
    id,
    secret_reference_id,
    kind,
    event_type,
    actor_id,
    event_at,
    detail_json
  )
  VALUES (
    :id,
    :secretReferenceId,
    :kind,
    :eventType,
    :actorId,
    :eventAt,
    :detailJson
  )
`;

function mapSecretReference(row: SettingsSecretReferenceRow): SettingsSecretReference {
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    displayName: row.display_name,
    vaultProvider: row.vault_provider,
    vaultSecretId: row.vault_secret_id,
    maskedHint: row.masked_hint,
    fingerprint: row.fingerprint,
    lifecycleStatus: row.lifecycle_status,
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: row.created_at,
    testedAt: row.tested_at,
    activatedBy: row.activated_by,
    activatedAt: row.activated_at,
    retiredBy: row.retired_by,
    retiredAt: row.retired_at,
    revokedBy: row.revoked_by,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
    metadataJson: row.metadata_json
  };
}

function mapSecretTestRun(row: SettingsSecretTestRunRow): SettingsSecretTestRun {
  return {
    id: row.id,
    secretReferenceId: row.secret_reference_id,
    kind: row.kind,
    provider: row.provider,
    resultStatus: row.result_status,
    summary: row.summary,
    redactedError: row.redacted_error,
    artifactPath: row.artifact_path,
    testedBy: row.tested_by,
    testedAt: row.tested_at,
    metadataJson: row.metadata_json
  };
}

function mapProbeJob(row: SettingsSecretProbeJobRow): SettingsSecretProbeJob {
  return {
    id: row.id,
    secretReferenceId: row.secret_reference_id,
    kind: row.kind,
    status: row.status,
    lockedBy: row.locked_by,
    lockedAt: row.locked_at,
    heartbeatAt: row.heartbeat_at,
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    resultCode: row.result_code,
    readerVersion: row.reader_version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at
  };
}

function mapHeartbeat(row: WorkerCapabilityHeartbeatRow): WorkerCapabilityHeartbeat {
  return {
    workerId: row.worker_id,
    workerKind: row.worker_kind,
    capabilityCode: row.capability_code,
    status: row.status,
    appliedSecretKind: row.applied_secret_kind,
    appliedSecretVersion: row.applied_secret_version == null ? null : Number(row.applied_secret_version),
    appliedSecretFingerprint: row.applied_secret_fingerprint,
    readerVersion: row.reader_version,
    issueCode: row.issue_code,
    lastAppliedAt: row.last_applied_at,
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at
  };
}

export class AsyncSettingsSecretRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async listReferencesByKind(kind: string): Promise<SettingsSecretReference[]> {
    const rows = await this.client.query<SettingsSecretReferenceRow>(SELECT_SECRET_REFERENCES_BY_KIND_SQL, { kind });
    return rows.map(mapSecretReference);
  }

  async getReferenceById(id: string): Promise<SettingsSecretReference | null> {
    const row = await this.client.queryOne<SettingsSecretReferenceRow>(SELECT_SECRET_REFERENCE_BY_ID_SQL, { id });
    return row ? mapSecretReference(row) : null;
  }

  async getNextVersion(kind: string): Promise<number> {
    const row = await this.client.queryOne<{ version: number | string | null }>(SELECT_SECRET_REFERENCE_MAX_VERSION_SQL, { kind });
    return Number(row?.version ?? 0) + 1;
  }

  async insertReference(input: SettingsSecretReference): Promise<void> {
    await this.client.execute(INSERT_SECRET_REFERENCE_SQL, {
      id: input.id,
      kind: input.kind,
      provider: input.provider,
      displayName: input.displayName,
      vaultProvider: input.vaultProvider,
      vaultSecretId: input.vaultSecretId,
      maskedHint: input.maskedHint,
      fingerprint: input.fingerprint,
      lifecycleStatus: input.lifecycleStatus,
      version: input.version,
      createdBy: input.createdBy,
      createdAt: input.createdAt,
      metadataJson: input.metadataJson
    });
  }

  async insertTestRun(input: SettingsSecretTestRun): Promise<void> {
    await this.client.execute(INSERT_SECRET_TEST_RUN_SQL, {
      id: input.id,
      secretReferenceId: input.secretReferenceId,
      kind: input.kind,
      provider: input.provider,
      resultStatus: input.resultStatus,
      summary: input.summary,
      redactedError: input.redactedError,
      artifactPath: input.artifactPath,
      testedBy: input.testedBy,
      testedAt: input.testedAt,
      metadataJson: input.metadataJson
    });
  }

  async getLatestTestRun(secretReferenceId: string): Promise<SettingsSecretTestRun | null> {
    const row = await this.client.queryOne<SettingsSecretTestRunRow>(SELECT_LATEST_SECRET_TEST_RUN_SQL, { secretReferenceId });
    return row ? mapSecretTestRun(row) : null;
  }

  async markReferenceTested(id: string, testedAt: string): Promise<void> {
    await this.client.execute(UPDATE_SECRET_REFERENCE_TESTED_SQL, {
      id,
      lifecycleStatus: "tested",
      testedAt
    });
  }

  async retireActiveReferences(kind: string, exceptId: string, actorId: string, retiredAt: string): Promise<void> {
    await this.client.execute(RETIRE_ACTIVE_SECRET_REFERENCES_SQL, {
      kind,
      exceptId,
      retiredBy: actorId,
      retiredAt
    });
  }

  async activateReference(id: string, actorId: string, activatedAt: string): Promise<void> {
    await this.client.execute(ACTIVATE_SECRET_REFERENCE_SQL, {
      id,
      activatedBy: actorId,
      activatedAt
    });
  }

  async revokeReference(id: string, actorId: string, revokedAt: string, reason: string): Promise<void> {
    await this.client.execute(REVOKE_SECRET_REFERENCE_SQL, {
      id,
      revokedBy: actorId,
      revokedAt,
      revokeReason: reason
    });
  }

  async insertActivationEvent(input: {
    id: string;
    secretReferenceId: string;
    kind: string;
    eventType: SettingsSecretActivationEventType;
    actorId: string;
    eventAt: string;
    detailJson: string;
  }): Promise<void> {
    await this.client.execute(INSERT_SETTING_ACTIVATION_EVENT_SQL, {
      id: input.id,
      secretReferenceId: input.secretReferenceId,
      kind: input.kind,
      eventType: input.eventType,
      actorId: input.actorId,
      eventAt: input.eventAt,
      detailJson: input.detailJson
    });
  }

  async enqueueProbeJob(input: { id: string; secretReferenceId: string; kind: string; createdBy: string; createdAt: string; maxAttempts?: number }): Promise<SettingsSecretProbeJob> {
    await this.client.execute(
      `INSERT INTO settings_secret_probe_jobs (id, secret_reference_id, kind, status, attempt_count, max_attempts, created_by, created_at, updated_at)
       VALUES (:id, :secretReferenceId, :kind, 'pending', 0, :maxAttempts, :createdBy, :createdAt, :createdAt)`,
      { ...input, maxAttempts: input.maxAttempts ?? 2 }
    );
    const job = await this.getProbeJobById(input.id);
    if (!job) throw new Error("SETTINGS_SECRET_PROBE_JOB_CREATE_FAILED");
    return job;
  }

  async getProbeJobById(id: string): Promise<SettingsSecretProbeJob | null> {
    const row = await this.client.queryOne<SettingsSecretProbeJobRow>("SELECT * FROM settings_secret_probe_jobs WHERE id = :id", { id });
    return row ? mapProbeJob(row) : null;
  }

  async getLatestProbeJob(secretReferenceId: string): Promise<SettingsSecretProbeJob | null> {
    const row = await this.client.queryOne<SettingsSecretProbeJobRow>(
      "SELECT * FROM settings_secret_probe_jobs WHERE secret_reference_id = :secretReferenceId ORDER BY created_at DESC LIMIT 1",
      { secretReferenceId }
    );
    return row ? mapProbeJob(row) : null;
  }

  async claimProbeJob(workerId: string, now: string): Promise<SettingsSecretProbeJob | null> {
    return this.client.transaction(async (transactionClient) => {
      const staleCutoff = new Date(Date.parse(now) - 60_000).toISOString();
      await transactionClient.execute(
        "UPDATE settings_secret_probe_jobs SET status = 'expired', result_code = 'probe_attempt_limit_exceeded', completed_at = :now, updated_at = :now WHERE status = 'running' AND updated_at < :staleCutoff AND attempt_count >= max_attempts",
        { now, staleCutoff }
      );
      const candidate = await transactionClient.queryOne<SettingsSecretProbeJobRow>(
        `SELECT * FROM settings_secret_probe_jobs
         WHERE status = 'pending' OR (status = 'running' AND updated_at < :staleCutoff AND attempt_count < max_attempts)
         ORDER BY created_at ASC LIMIT 1`,
        { staleCutoff }
      );
      if (!candidate) return null;
      await transactionClient.execute(
        `UPDATE settings_secret_probe_jobs SET status = 'running', locked_by = :workerId, locked_at = :now,
          heartbeat_at = :now, attempt_count = attempt_count + 1, updated_at = :now
         WHERE id = :id AND (status = 'pending' OR (status = 'running' AND updated_at < :staleCutoff))`,
        { workerId, now, id: candidate.id, staleCutoff }
      );
      const row = await transactionClient.queryOne<SettingsSecretProbeJobRow>("SELECT * FROM settings_secret_probe_jobs WHERE id = :id", { id: candidate.id });
      return row?.status === "running" && row.locked_by === workerId ? mapProbeJob(row) : null;
    });
  }

  async heartbeatProbeJob(id: string, workerId: string, now: string): Promise<boolean> {
    await this.client.execute(
      "UPDATE settings_secret_probe_jobs SET heartbeat_at = :now, updated_at = :now WHERE id = :id AND status = 'running' AND locked_by = :workerId",
      { id, workerId, now }
    );
    const row = await this.getProbeJobById(id);
    return row?.status === "running" && row.lockedBy === workerId;
  }

  async completeProbeJob(input: { id: string; workerId: string; status: Exclude<SettingsSecretProbeStatus, "pending" | "running" | "expired">; resultCode: string | null; readerVersion: string | null; completedAt: string }): Promise<boolean> {
    await this.client.execute(
      `UPDATE settings_secret_probe_jobs SET status = :status, result_code = :resultCode, reader_version = :readerVersion,
        completed_at = :completedAt, updated_at = :completedAt WHERE id = :id AND status = 'running' AND locked_by = :workerId`,
      input
    );
    const row = await this.getProbeJobById(input.id);
    return row?.status === input.status && row.lockedBy === input.workerId;
  }

  async upsertWorkerCapabilityHeartbeat(input: WorkerCapabilityHeartbeat): Promise<void> {
    await this.client.execute(
      `INSERT INTO worker_capability_heartbeats
        (worker_id, worker_kind, capability_code, status, applied_secret_kind, applied_secret_version,
         applied_secret_fingerprint, reader_version, issue_code, last_applied_at, last_seen_at, updated_at)
       VALUES (:workerId, :workerKind, :capabilityCode, :status, :appliedSecretKind, :appliedSecretVersion,
         :appliedSecretFingerprint, :readerVersion, :issueCode, :lastAppliedAt, :lastSeenAt, :updatedAt)
       ON CONFLICT(worker_id, capability_code) DO UPDATE SET
         worker_kind = excluded.worker_kind, status = excluded.status,
         applied_secret_kind = excluded.applied_secret_kind, applied_secret_version = excluded.applied_secret_version,
         applied_secret_fingerprint = excluded.applied_secret_fingerprint, reader_version = excluded.reader_version,
         issue_code = excluded.issue_code, last_applied_at = excluded.last_applied_at,
         last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at`,
      input
    );
  }

  async getLatestWorkerCapabilityHeartbeat(capabilityCode: string): Promise<WorkerCapabilityHeartbeat | null> {
    const row = await this.client.queryOne<WorkerCapabilityHeartbeatRow>(
      "SELECT * FROM worker_capability_heartbeats WHERE capability_code = :capabilityCode ORDER BY last_seen_at DESC LIMIT 1",
      { capabilityCode }
    );
    return row ? mapHeartbeat(row) : null;
  }
}
