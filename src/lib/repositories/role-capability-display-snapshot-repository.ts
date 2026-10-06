import { getAsyncDatabaseClient, type AsyncDatabaseClient } from '@/lib/db-async-provider'
import { canonicalJson, ROLE_CAPABILITY_CANONICALIZATION_VERSION } from '@/lib/role-capability-canonical-json'
import { sha256CanonicalJson } from '@/lib/role-capability-canonical-hash.server'
import type { RoleCapabilityWorkspaceV2, RoleCapabilityWorkspaceV3 } from '@/lib/ai-pdm-role-capability-contract'

type RoleCapabilitySnapshotPayload = RoleCapabilityWorkspaceV2 | Omit<RoleCapabilityWorkspaceV3, 'managementSurface'>

export type RoleCapabilityDisplaySnapshot = {
  applicationId: string
  contractVersion: string
  readerVersion: string
  catalogVersion: string
  catalogPayloadHash: string
  governanceRevision: string
  organizationVersionId: string
  organizationRevision: string
  projectionCursor: number
  roleCount: number
  sourceDataAt: string
  snapshotStoredAt: string
  canonicalizationVersion: string
  payloadCanonicalJson: string
  payloadSha256: string
  payload: RoleCapabilitySnapshotPayload
}

type SnapshotRow = {
  application_id: string; contract_version: string; reader_version: string; catalog_version: string; catalog_payload_hash: string;
  governance_revision: string; organization_version_id: string; organization_revision: string; projection_cursor: number;
  role_count: number; source_data_at: string | Date; snapshot_stored_at: string | Date; canonicalization_version: string; payload_canonical_json: string; payload_sha256: string
}

function timestamp(value: string | Date) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('ROLE_CAPABILITY_SNAPSHOT_INVALID');
  return parsed.toISOString();
}

function rowToSnapshot(row: SnapshotRow): RoleCapabilityDisplaySnapshot {
  const storedAt = timestamp(row.snapshot_stored_at);
  const sourceAt = timestamp(row.source_data_at);
  const validKey = row.application_id === 'ai-pdm' || row.application_id === 'ai-pdm:role-system-admin'
  const validVersion = (row.contract_version === 'ai-pdm.role-capability-workspace.v2' && row.reader_version === 'ai-pdm.role-capability-reader.v2' && row.role_count === 9)
    || (row.contract_version === 'ai-pdm.role-capability-workspace.v3' && row.reader_version === 'ai-pdm.role-capability-reader.v3' && row.application_id === 'ai-pdm:role-system-admin' && row.role_count === 1)
  if (!validKey || !validVersion || !/^[a-f0-9]{64}$/u.test(row.catalog_payload_hash) || row.canonicalization_version !== ROLE_CAPABILITY_CANONICALIZATION_VERSION  ) throw new Error('ROLE_CAPABILITY_SNAPSHOT_INVALID')
  const payload = JSON.parse(row.payload_canonical_json) as RoleCapabilitySnapshotPayload
  const validPayload = row.contract_version === 'ai-pdm.role-capability-workspace.v2'
    ? payload.contractVersion === row.contract_version && payload.applicationId === 'ai-pdm' && payload.dataState === 'current' && payload.mutationAllowed === false && payload.catalogVersion === row.catalog_version && payload.catalogPayloadHash === row.catalog_payload_hash && !!payload.sourceDataAt && timestamp(payload.sourceDataAt) === sourceAt && payload.roles.length === row.role_count
    : payload.contractVersion === row.contract_version && payload.applicationId === 'ai-pdm' && payload.dataState === 'current' && payload.mutationAllowed === false && payload.catalogVersion === row.catalog_version && payload.catalogPayloadHash === row.catalog_payload_hash && !!payload.sourceDataAt && timestamp(payload.sourceDataAt) === sourceAt && payload.selectedRoleId === 'role-system-admin' && payload.roles.length === row.role_count && !('managementSurface' in payload)
  if (!validPayload) throw new Error('ROLE_CAPABILITY_SNAPSHOT_INVALID')
  if (sha256CanonicalJson(payload) !== row.payload_sha256) throw new Error('ROLE_CAPABILITY_SNAPSHOT_INVALID')
  return {
    applicationId: row.application_id,
    contractVersion: row.contract_version,
    readerVersion: row.reader_version,
    catalogVersion: row.catalog_version,
    catalogPayloadHash: row.catalog_payload_hash,
    governanceRevision: row.governance_revision,
    organizationVersionId: row.organization_version_id,
    organizationRevision: row.organization_revision,
    projectionCursor: row.projection_cursor,
    roleCount: row.role_count,
    sourceDataAt: payload.sourceDataAt!,
    snapshotStoredAt: storedAt,
    canonicalizationVersion: row.canonicalization_version,
    payloadCanonicalJson: row.payload_canonical_json,
    payloadSha256: row.payload_sha256,
    payload,
  }
}

export async function getRoleCapabilityDisplaySnapshot(applicationId = 'ai-pdm', client: AsyncDatabaseClient = getAsyncDatabaseClient()) {
  const row = await client.queryOne<SnapshotRow>('SELECT * FROM role_capability_display_snapshots WHERE application_id = :applicationId', { applicationId })
  if (!row) return null
  try { return rowToSnapshot(row) } catch { return null }
}

export async function saveRoleCapabilityDisplaySnapshot(workspace: RoleCapabilityWorkspaceV2 | RoleCapabilityWorkspaceV3, snapshotStoredAt = new Date().toISOString(), applicationId = workspace.contractVersion === 'ai-pdm.role-capability-workspace.v3' ? 'ai-pdm:role-system-admin' : 'ai-pdm', client: AsyncDatabaseClient = getAsyncDatabaseClient()) {
  if (!workspace.sourceDataAt || workspace.dataState !== 'current' || workspace.mutationAllowed !== false) throw new Error('ROLE_CAPABILITY_SNAPSHOT_INVALID')
  const { managementSurface: _managementSurface, ...payload } = workspace
  const payloadCanonicalJson = canonicalJson(payload)
  const payloadSha256 = sha256CanonicalJson(payload)
  const readerVersion = workspace.contractVersion === 'ai-pdm.role-capability-workspace.v3' ? 'ai-pdm.role-capability-reader.v3' : 'ai-pdm.role-capability-reader.v2'
  await client.execute(`
    INSERT INTO role_capability_display_snapshots (
      application_id, contract_version, reader_version, catalog_version, catalog_payload_hash,
      governance_revision, organization_version_id, organization_revision, projection_cursor,
      source_data_at, snapshot_stored_at, canonicalization_version, payload_canonical_json, payload_sha256, role_count
    ) VALUES (:applicationId, :contractVersion, :readerVersion, :catalogVersion, :catalogPayloadHash, :governanceRevision, :organizationVersionId, :organizationRevision, :projectionCursor, :sourceDataAt, :snapshotStoredAt, :canonicalizationVersion, :payloadCanonicalJson, :payloadSha256, :roleCount)
    ON CONFLICT(application_id) DO UPDATE SET
      contract_version=excluded.contract_version, reader_version=excluded.reader_version,
      catalog_version=excluded.catalog_version, catalog_payload_hash=excluded.catalog_payload_hash,
      governance_revision=excluded.governance_revision, organization_version_id=excluded.organization_version_id,
      organization_revision=excluded.organization_revision, projection_cursor=excluded.projection_cursor,
      source_data_at=excluded.source_data_at, snapshot_stored_at=excluded.snapshot_stored_at,
      canonicalization_version=excluded.canonicalization_version,
      payload_canonical_json=excluded.payload_canonical_json, payload_sha256=excluded.payload_sha256,
      role_count=excluded.role_count
  `, { applicationId, contractVersion: workspace.contractVersion, readerVersion, catalogVersion: workspace.catalogVersion, catalogPayloadHash: workspace.catalogPayloadHash, governanceRevision: workspace.governanceRevision, organizationVersionId: workspace.organizationVersionId, organizationRevision: workspace.organizationRevision, projectionCursor: workspace.projectionCursor, sourceDataAt: workspace.sourceDataAt, snapshotStoredAt, canonicalizationVersion: ROLE_CAPABILITY_CANONICALIZATION_VERSION, payloadCanonicalJson, payloadSha256, roleCount: workspace.roles.length })
  return getRoleCapabilityDisplaySnapshot(applicationId, client)
}
