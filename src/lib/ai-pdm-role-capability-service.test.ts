import { afterEach, describe, expect, it, vi } from 'vitest'
import roleCatalog from '../../config/access-control/jenfu-role-catalog.v1.json' with { type: 'json' }
import type { RoleCapabilityCatalog, RoleCapabilityWorkspaceV2 } from '@/lib/ai-pdm-role-capability-contract'
import type { PrivilegedAssignmentWorkspaceSource } from '@/lib/repositories/ai-pdm-role-capability-repository'
import { buildManagementSurface, buildPrivilegedRoleCapabilityWorkspace } from '@/lib/ai-pdm-role-capability-service'

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
    dataState: 'current', mutationAllowed: true, sourceDataAt: '2026-09-02T00:05:00.000Z', snapshotStoredAt: null,
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

describe('DEV-009 S3 AI-PDM privileged consumer', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('projects redacted privileged holders into a read-only workspace v3', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ORGMASTER_PUBLIC_BASE_URL', 'http://localhost:5000')
    const workspace = buildPrivilegedRoleCapabilityWorkspace(baseWorkspace(), privilegedSource())
    expect(workspace.contractVersion).toBe('ai-pdm.role-capability-workspace.v3')
    expect(workspace.mutationAllowed).toBe(false)
    expect(workspace.roles[0]).toMatchObject({
      managementKind: 'privileged_principal', effectiveHolderCount: 1, holderCountLabel: '特權身分 1 個',
      manualAssignments: [{ principalAdmissionId: 'admission-privileged-a', principalHint: 'privileged•••A7' }],
    })
    expect(workspace.managementSurface?.href).toBe('http://localhost:5000/?panels=governance&focus=governance&details=none&governanceSection=assignments')
    expect(JSON.stringify(workspace)).not.toMatch(/"(?:issuer|subject|token|cookie|fingerprint)"\s*:/iu)
  })

  it('fails closed when the privileged role policy drifts', () => {
    const source = privilegedSource()
    source.role!.assignmentTier = 'cross_app_override'
    const changed = { ...source, role: { ...source.role!, recommendationAllowed: true } } as unknown as PrivilegedAssignmentWorkspaceSource
    expect(() => buildPrivilegedRoleCapabilityWorkspace(baseWorkspace(), changed)).toThrow('ORGMASTER_CATALOG_MISMATCH')
  })

  it('fails closed when the source is not explicitly read-only', () => {
    const changed = { ...privilegedSource(), mutationAllowed: true } as unknown as PrivilegedAssignmentWorkspaceSource
    expect(() => buildPrivilegedRoleCapabilityWorkspace(baseWorkspace(), changed)).toThrow('ORGMASTER_CONTRACT_INVALID')
  })

  it('does not emit a clickable CTA for an invalid production base URL', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ORGMASTER_PUBLIC_BASE_URL', 'https://user:secret@example.com')
    expect(buildManagementSurface()).toBeUndefined()
    vi.stubEnv('ORGMASTER_PUBLIC_BASE_URL', 'http://orgmaster.example.com')
    expect(buildManagementSurface()).toBeUndefined()
  })
})
