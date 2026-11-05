import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { applicationAdministratorRole, applyRolePolicyDraftChanges, upgradeRolePolicyCandidate, rebuildRolePolicyCandidate } from '@/lib/role-policy-editor'
import * as legacy from '@/lib/role-policy-editor-legacy-v1'
import { JenfuEntitlementRepository } from '@/lib/repositories/jenfu-entitlement-repository'

const id = '10000000-0000-4000-8000-000000000001'
const version = 'ai-pdm.role-policy.' + id
const actor = { identityIssuer: 'test-issuer', identitySubject: 'test-subject', principalId: 'principal-a', employeeId: 'employee-a', localPrincipalId: 'user-a', companyId: 'company-a' }

function fixture(changes: Record<string, unknown> = {}, proof = true) {
  const grant = { contract_version: 'jenfu.orgmaster.ai-pdm-principal-grants.v5', assignment_version_id: 'publication-a', assignment_version: 3,
    assignment_id: id, grant_kind: 'direct', delegation_id: null, application_id: 'ai-pdm', principal_id: actor.principalId,
    employee_id: actor.employeeId, subject_kind: 'principal', target_principal_id: actor.principalId,
    stable_role_id: applicationAdministratorRole.stableRoleId, role_code: applicationAdministratorRole.roleCode,
    catalog_version: 'ai-pdm.role-policy.old-issuance-version', scope_kind: 'global', scope_key: null,
    valid_from: '2026-01-01T00:00:00Z', valid_until: null, published_at: '2026-01-01T00:00:00Z',
    source_assignment_id: id, source_grant_id: id, admin_catalog_sha256: 'a'.repeat(64),
    role_definition_hash: applicationAdministratorRole.roleDefinitionHash, ...changes }
  const account = { contract_version: 'organization.active-principal.v1', principal_issuer: actor.identityIssuer,
    principal_subject: actor.identitySubject, principal_id: actor.principalId, employee_id: actor.employeeId, employee_status: 'active' }
  const client = { kind: 'postgres', query: async (sql: string) => sql.includes('v_active_principal_accounts_v1') ? [account] : [grant],
    queryOne: async () => ({ valid: proof }) }
  return new JenfuEntitlementRepository(client as never, { catalogVersion: version,
    roles: [{ ...applicationAdministratorRole, allowedScopeKinds: ['global'], metadata: undefined }] })
}
function permission(repository: JenfuEntitlementRepository, code: string, kind: 'page'|'action' = 'action') {
  return repository.evaluatePermission({ actor, permissionKind: kind, permissionCode: code, rolePriority: [] })
}

describe('DEV-127 exact application administrator authority', () => {
  it('accepts immutable issuance provenance after an unrelated catalog publication and grants only management/read', async () => {
    for (const code of ['settings.admin_matrix', 'pdm.drawing.view', 'pdm.shared_model.view', 'handoff.published.view']) {
      await expect(permission(fixture(), code)).resolves.toMatchObject({ decisionCode: 'allowed' })
    }
    await expect(permission(fixture(), 'numbering.drawings.view', 'page')).resolves.toMatchObject({ decisionCode: 'allowed' })
    for (const code of ['pdm.drawing.edit', 'pdm.drawing.download', 'pdm.drawing.review', 'pdm.drawing.publish', 'numbering.create']) {
      await expect(permission(fixture(), code)).rejects.toMatchObject({ code: 'permission_not_granted' })
    }
  })
  it.each([
    { principal_id: 'same-employee-other-principal' }, { employee_id: 'other-employee' }, { application_id: 'financial-management-system' },
    { target_principal_id: 'other-principal' }, { subject_kind: 'employee' }, { grant_kind: 'delegated', delegation_id: 'delegation-a' },
    { source_grant_id: 'not-a-uuid' }, { source_assignment_id: 'other' }, { admin_catalog_sha256: 'wrong' },
    { role_definition_hash: 'f'.repeat(64) }, { scope_kind: 'workspace', scope_key: 'current' },
    { valid_until: '2026-01-02T00:00:00Z' }, { role_code: 'platform_super_admin' }
  ])('rejects incompatible authority %j', async changes => {
    await expect(permission(fixture(changes), 'settings.admin_matrix')).rejects.toMatchObject({ code: 'entitlement_contract_mismatch' })
  })
  it('rejects unknown issuance history instead of taking legacy permissions', async () => {
    await expect(permission(fixture({}, false), 'settings.admin_matrix')).rejects.toMatchObject({ code: 'entitlement_contract_mismatch' })
  })
})

describe('DEV-127 additive protected catalog', () => {
  it('preserves every dynamic legacy/custom permission, status, identity and profile while appending once', () => {
    const old = legacy.applyRolePolicyDraftChanges({ candidate: legacy.buildDefaultRolePolicyCandidate(version),
      roleChanges: [{ type: 'create', clientRoleId: 'client-custom', displayName: '既有自訂角色' }],
      changes: [{ roleRef: { clientRoleId: 'client-custom' }, groupId: 'drawing', actionId: 'view', enabled: true }], uuid: () => id }).candidate
    const next = upgradeRolePolicyCandidate(old)
    expect(next.roles.slice(0, -1)).toEqual(old.roles)
    expect(next.roleProfiles.slice(0, -1)).toEqual(old.roleProfiles)
    expect(upgradeRolePolicyCandidate(next)).toEqual(next)
    expect(next.roles.at(-1)).toEqual(applicationAdministratorRole)
    expect(() => applyRolePolicyDraftChanges({ candidate: next, roleChanges: [{ type: 'deactivate', stableRoleId: applicationAdministratorRole.stableRoleId }], changes: [] })).toThrow('ROLE_POLICY_ROLE_READONLY')
    const tampered = structuredClone(next)
    tampered.roles.at(-1)!.permissions.push({ kind: 'action', code: 'pdm.drawing.edit', allowed: true })
    expect(() => rebuildRolePolicyCandidate(tampered)).toThrow('ROLE_POLICY_CANDIDATE_INVALID')
  })
  it('pins the complete producer package and the exact 23-column PDM projection', () => {
    const consumer = JSON.parse(readFileSync('config/access-control/orgmaster-administration-v1.manifest.json', 'utf8'))
    const bytes = readFileSync(consumer.producerManifestPath)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(consumer.producerManifestSha256)
    const producer = JSON.parse(bytes.toString())
    expect(consumer.projection).toEqual(producer.projections.pdm)
    expect(consumer.projection.columns).toHaveLength(23)
    for (const [name, hash] of Object.entries(producer.files)) expect(createHash('sha256').update(readFileSync('contracts/orgmaster-administration/v1/' + name)).digest('hex')).toBe(hash)
  })
  it('keeps the portable SQL fixture tied to the executable legacy and current editors', () => {
    const fixture = JSON.parse(readFileSync('config/access-control/dev127-consumer-postgres-fixture.v1.json','utf8'))
    expect(legacy.assertRolePolicyCandidate(fixture.legacy)).toEqual(fixture.legacy)
    expect(upgradeRolePolicyCandidate({...fixture.legacy,candidateCatalogVersion:fixture.upgraded.candidateCatalogVersion})).toEqual(fixture.upgraded)
    expect(fixture.baseCatalog).toEqual(legacy.rolePolicySource().baseCatalog)
  })
})
