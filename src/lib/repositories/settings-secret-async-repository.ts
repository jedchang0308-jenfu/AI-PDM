import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export type SettingsSecretLifecycleStatus = "draft" | "tested" | "active" | "retired" | "revoked";
export type SettingsSecretVaultProvider = "local_test_double" | "supabase_vault";
export type SettingsSecretTestStatus = "passed" | "failed" | "blocked";
export type SettingsSecretActivationEventType = "created_draft" | "tested" | "activated" | "retired" | "revoked";

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
}
