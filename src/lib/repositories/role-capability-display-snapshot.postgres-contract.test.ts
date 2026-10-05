import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import roleCatalog from '../../../config/access-control/jenfu-role-catalog.v6.json' with { type: 'json' }
import type { RoleCapabilityCatalog, RoleCapabilityWorkspaceV2 } from '@/lib/ai-pdm-role-capability-contract'
import type { PrivilegedAssignmentWorkspaceSource } from '@/lib/repositories/ai-pdm-role-capability-repository'
import { buildPrivilegedRoleCapabilityWorkspace } from '@/lib/ai-pdm-role-capability-service'
import { createAsyncDatabaseClient } from '@/lib/db-async-provider'
import { canonicalJson } from '@/lib/role-capability-canonical-json'
import { sha256CanonicalJson } from '@/lib/role-capability-canonical-hash.server'
import { getRoleCapabilityDisplaySnapshot, saveRoleCapabilityDisplaySnapshot } from './role-capability-display-snapshot-repository'

const catalog = roleCatalog as RoleCapabilityCatalog
const baseRevision = 'fixture-governance-current'

function baseWorkspace(): RoleCapabilityWorkspaceV2 {
  return {
    contractVersion: 'ai-pdm.role-capability-workspace.v2', applicationId: 'ai-pdm', catalogVersion: catalog.catalogVersion,
    catalogPayloadHash: catalog.catalogSha256, governanceRevision: baseRevision, organizationVersionId: 'fixture-organization-current',
    organizationRevision: 'fixture-organization-revision-current', projectionCursor: 13, selectedRoleId: null,
    roles: catalog.roles.map((catalogRole) => ({
      catalogRole,
      effectiveHolderCount: 0,
      projection: {
        contractVersion: 'orgmaster.role-capability-projection.v1', applicationId: 'ai-pdm', stableRoleId: catalogRole.stableRoleId,
        role: { stableRoleId: catalogRole.stableRoleId, roleCode: catalogRole.roleCode, displayName: catalogRole.displayName, assignable: catalogRole.assignable, riskLevel: catalogRole.risk, recommendationAllowed: catalogRole.recommendationAllowed },
        governanceRevision: baseRevision, organizationVersionId: 'fixture-organization-current', organizationRevision: 'fixture-organization-revision-current',
        changeCursor: 13, adoptionState: 'published', positions: [], manualAssignments: [],
      },
    })),
    dataState: 'current', mutationAllowed: false, sourceDataAt: '2026-09-02T00:05:00.000Z', snapshotStoredAt: null,
    dependency: { status: 'available', decisionCode: 'CURRENT_SOURCE', correlationId: 'fixture-base' },
  }
}

function privilegedSource(): PrivilegedAssignmentWorkspaceSource {
  return {
    contractVersion: 'orgmaster.privileged-assignment-workspace.v1', applicationId: 'ai-pdm', stableRoleId: 'role-system-admin',
    catalogVersion: catalog.catalogVersion, catalogPayloadHash: catalog.catalogSha256, governanceRevision: baseRevision,
    organizationVersionId: 'fixture-organization-current', organizationRevision: 'fixture-organization-revision-current', sourceDataAt: '2026-09-02T00:05:00.000Z',
    mutationAllowed: false, blockers: [],
    role: { stableRoleId: 'role-system-admin', roleCode: 'system_admin', displayName: '系統管理員', status: 'active', assignable: true, riskLevel: 'critical', subjectKind: 'principal', assignmentTier: 'cross_app_override', recommendationAllowed: false, delegationAllowed: false, allowedScopeKinds: ['global'] },
    eligiblePrincipals: [{ employeeId: 'employee-fixture-a', principalAdmissionId: 'admission-privileged-a', principalHint: 'privileged•••A7', accountType: 'human_privileged', status: 'active' }],
    assignments: [{ assignmentId: 'assignment-system-admin-1', employeeId: 'employee-fixture-a', principalAdmissionId: 'admission-privileged-a', principalHint: 'privileged•••A7', status: 'active', validFrom: '2026-09-02T00:00:00.000Z', validTo: null, auditReference: 'audit-system-admin-1' }],
  }
}

const connectionString = process.env.DEV121_ROLE_DISPLAY_POSTGRES_URL
describe.skipIf(!connectionString)('DEV-121 actual 056 snapshot PostgreSQL contract', () => {
  const database = connectionString ? createAsyncDatabaseClient({kind:'postgres',connectionString,maxConnections:1,searchPath:'ai_pdm_core,pg_catalog',applicationName:'dev121-role-display-contract'}) : null
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => { await database?.close() })
  it('persists read-only v2 with PostgreSQL Date timestamps and equivalent UTC source time', async () => {
    if (!database) throw new Error('DEV121_ROLE_DISPLAY_POSTGRES_URL_REQUIRED')
    const workspace=baseWorkspace(); workspace.sourceDataAt='2026-09-02T08:05:00.000+08:00'
    const actual=await saveRoleCapabilityDisplaySnapshot(workspace,'2026-10-05T10:05:00.000+08:00','ai-pdm',database)
    expect(actual?.payload).toEqual(workspace); expect(actual?.sourceDataAt).toBe(workspace.sourceDataAt)
    expect(actual?.snapshotStoredAt).toBe('2026-10-05T02:05:00.000Z')
    const row=await database.queryOne<{source_data_at:Date,snapshot_stored_at:Date}>('SELECT source_data_at,snapshot_stored_at FROM role_capability_display_snapshots WHERE application_id=:id',{id:'ai-pdm'})
    expect(row?.source_data_at).toBeInstanceOf(Date); expect(row?.snapshot_stored_at).toBeInstanceOf(Date)
    expect(await getRoleCapabilityDisplaySnapshot('ai-pdm',database)).toEqual(actual)
  })
  it('round trips the real privileged v3 builder and omits transient management links', async () => {
    if (!database) throw new Error('DEV121_ROLE_DISPLAY_POSTGRES_URL_REQUIRED')
    vi.stubEnv('NODE_ENV','development');vi.stubEnv('ORGMASTER_PUBLIC_BASE_URL','http://localhost:5000')
    const workspace=buildPrivilegedRoleCapabilityWorkspace(baseWorkspace(),privilegedSource())
    expect(workspace.managementSurface).toBeDefined()
    const actual=await saveRoleCapabilityDisplaySnapshot(workspace,'2026-10-05T02:06:00.000Z','ai-pdm:role-system-admin',database)
    const {managementSurface:_,...redacted}=workspace
    expect(actual?.payload).toEqual(redacted);expect(actual?.readerVersion).toBe('ai-pdm.role-capability-reader.v3')
    expect(actual?.roleCount).toBe(1);expect(actual?.payload.mutationAllowed).toBe(false)
    expect(actual?.payloadCanonicalJson).not.toMatch(/managementSurface|http:\/\/localhost|"(?:issuer|subject|token|cookie|fingerprint)"\s*:/u)
    expect(await getRoleCapabilityDisplaySnapshot('ai-pdm:role-system-admin',database)).toEqual(actual)
  })
  it('discards corrupted hashes, inconsistent source timestamps and writable payloads', async () => {
    if (!database) throw new Error('DEV121_ROLE_DISPLAY_POSTGRES_URL_REQUIRED')
    const workspace=baseWorkspace()
    await saveRoleCapabilityDisplaySnapshot(workspace,'2026-10-05T02:07:00.000Z','ai-pdm',database)
    await database.execute('UPDATE role_capability_display_snapshots SET payload_sha256=$1 WHERE application_id=$2',['0'.repeat(64),'ai-pdm'])
    expect(await getRoleCapabilityDisplaySnapshot('ai-pdm',database)).toBeNull()
    await saveRoleCapabilityDisplaySnapshot(workspace,'2026-10-05T02:07:00.000Z','ai-pdm',database)
    await database.execute('UPDATE role_capability_display_snapshots SET source_data_at=$1 WHERE application_id=$2',['2026-09-02T00:06:00.000Z','ai-pdm'])
    expect(await getRoleCapabilityDisplaySnapshot('ai-pdm',database)).toBeNull()
    await saveRoleCapabilityDisplaySnapshot(workspace,'2026-10-05T02:07:00.000Z','ai-pdm',database)
    const writable={...workspace,mutationAllowed:true}
    await database.execute('UPDATE role_capability_display_snapshots SET payload_canonical_json=$1,payload_sha256=$2 WHERE application_id=$3',[canonicalJson(writable),sha256CanonicalJson(writable),'ai-pdm'])
    expect(await getRoleCapabilityDisplaySnapshot('ai-pdm',database)).toBeNull()
  })
})
