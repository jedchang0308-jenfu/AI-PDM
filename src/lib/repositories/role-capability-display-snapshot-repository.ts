import { getDb } from '@/lib/db'
import { canonicalJson, ROLE_CAPABILITY_CANONICALIZATION_VERSION, sha256CanonicalJson } from '@/lib/role-capability-canonical-json'
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
  role_count: number; source_data_at: string; snapshot_stored_at: string; canonicalization_version: string; payload_canonical_json: string; payload_sha256: string
}

function rowToSnapshot(row: SnapshotRow): RoleCapabilityDisplaySnapshot {
  const validKey = row.application_id === 'ai-pdm' || row.application_id === 'ai-pdm:role-system-admin'
  const validVersion = (row.contract_version === 'ai-pdm.role-capability-workspace.v2' && row.reader_version === 'ai-pdm.role-capability-reader.v2' && row.role_count === 9)
    || (row.contract_version === 'ai-pdm.role-capability-workspace.v3' && row.reader_version === 'ai-pdm.role-capability-reader.v3' && row.application_id === 'ai-pdm:role-system-admin' && row.role_count === 1)
  if (!validKey || !validVersion || !/^[a-f0-9]{64}$/u.test(row.catalog_payload_hash) || row.canonicalization_version !== ROLE_CAPABILITY_CANONICALIZATION_VERSION || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(row.source_data_at) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(row.snapshot_stored_at)) throw new Error('ROLE_CAPABILITY_SNAPSHOT_INVALID')
  const payload = JSON.parse(row.payload_canonical_json) as RoleCapabilitySnapshotPayload
  const validPayload = row.contract_version === 'ai-pdm.role-capability-workspace.v2'
    ? payload.contractVersion === row.contract_version && payload.applicationId === 'ai-pdm' && payload.dataState === 'current' && payload.mutationAllowed === true && payload.catalogVersion === row.catalog_version && payload.catalogPayloadHash === row.catalog_payload_hash && payload.sourceDataAt === row.source_data_at && payload.roles.length === row.role_count
    : payload.contractVersion === row.contract_version && payload.applicationId === 'ai-pdm' && payload.dataState === 'current' && payload.mutationAllowed === false && payload.catalogVersion === row.catalog_version && payload.catalogPayloadHash === row.catalog_payload_hash && payload.sourceDataAt === row.source_data_at && payload.selectedRoleId === 'role-system-admin' && payload.roles.length === row.role_count && !('managementSurface' in payload)
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
    sourceDataAt: row.source_data_at,
    snapshotStoredAt: row.snapshot_stored_at,
    canonicalizationVersion: row.canonicalization_version,
    payloadCanonicalJson: row.payload_canonical_json,
    payloadSha256: row.payload_sha256,
    payload,
  }
}

export function getRoleCapabilityDisplaySnapshot(applicationId = 'ai-pdm') {
  const row = getDb().prepare('SELECT * FROM role_capability_display_snapshots WHERE application_id = ?').get(applicationId) as SnapshotRow | undefined
  if (!row) return null
  try { return rowToSnapshot(row) } catch { return null }
}

export function saveRoleCapabilityDisplaySnapshot(workspace: RoleCapabilityWorkspaceV2 | RoleCapabilityWorkspaceV3, snapshotStoredAt = new Date().toISOString(), applicationId = workspace.contractVersion === 'ai-pdm.role-capability-workspace.v3' ? 'ai-pdm:role-system-admin' : 'ai-pdm') {
  if (!workspace.sourceDataAt) throw new Error('ROLE_CAPABILITY_SNAPSHOT_INVALID')
  const payload = workspace.contractVersion === 'ai-pdm.role-capability-workspace.v3'
    ? (({ managementSurface: _managementSurface, ...persisted }) => persisted)(workspace)
    : workspace
  const payloadCanonicalJson = canonicalJson(payload)
  const payloadSha256 = sha256CanonicalJson(payload)
  const readerVersion = workspace.contractVersion === 'ai-pdm.role-capability-workspace.v3' ? 'ai-pdm.role-capability-reader.v3' : 'ai-pdm.role-capability-reader.v2'
  getDb().prepare(`
    INSERT INTO role_capability_display_snapshots (
      application_id, contract_version, reader_version, catalog_version, catalog_payload_hash,
      governance_revision, organization_version_id, organization_revision, projection_cursor,
      source_data_at, snapshot_stored_at, canonicalization_version, payload_canonical_json, payload_sha256, role_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(application_id) DO UPDATE SET
      contract_version=excluded.contract_version, reader_version=excluded.reader_version,
      catalog_version=excluded.catalog_version, catalog_payload_hash=excluded.catalog_payload_hash,
      governance_revision=excluded.governance_revision, organization_version_id=excluded.organization_version_id,
      organization_revision=excluded.organization_revision, projection_cursor=excluded.projection_cursor,
      source_data_at=excluded.source_data_at, snapshot_stored_at=excluded.snapshot_stored_at,
      canonicalization_version=excluded.canonicalization_version,
      payload_canonical_json=excluded.payload_canonical_json, payload_sha256=excluded.payload_sha256,
      role_count=excluded.role_count
  `).run(applicationId, workspace.contractVersion, readerVersion, workspace.catalogVersion, workspace.catalogPayloadHash, workspace.governanceRevision, workspace.organizationVersionId, workspace.organizationRevision, workspace.projectionCursor, workspace.sourceDataAt, snapshotStoredAt, ROLE_CAPABILITY_CANONICALIZATION_VERSION, payloadCanonicalJson, payloadSha256, workspace.roles.length)
  return getRoleCapabilityDisplaySnapshot(applicationId)
}
