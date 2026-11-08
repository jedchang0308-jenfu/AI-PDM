import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { applicationAdministratorRole, applyRolePolicyDraftChanges, upgradeRolePolicyCandidate, rebuildRolePolicyCandidate } from '@/lib/role-policy-editor'
import { AI_PDM_ADMINISTRATIVE_DEFINITION_SHA256, AI_PDM_ADMINISTRATIVE_DEFINITION_VERSION,
  AI_PDM_ADMINISTRATIVE_PROFILE_ID, aiPdmAdministrativeRole } from '@/lib/administrative-capability-definition'
import * as legacy from '@/lib/role-policy-editor-legacy-v1'
import { JenfuEntitlementRepository } from '@/lib/repositories/jenfu-entitlement-repository'
import staticV8 from '../../config/access-control/jenfu-role-catalog.v8.json' with {type:'json'}

const id = '10000000-0000-4000-8000-000000000001'
const version = 'ai-pdm.role-policy.' + id
const actor = { identityIssuer: 'test-issuer', identitySubject: 'test-subject', principalId: 'principal-a', employeeId: 'employee-a', localPrincipalId: 'user-a', companyId: 'company-a' }

function fixture(changes: Record<string, unknown> = {}) {
  const grant = { contract_version: 'jenfu.orgmaster.ai-pdm-principal-grants.v6', assignment_version_id: 'administration-v1', assignment_version: 1,
    assignment_id: id, grant_kind: 'direct', delegation_id: null, application_id: 'ai-pdm', principal_id: actor.principalId,
    employee_id: actor.employeeId, subject_kind: 'principal', target_principal_id: actor.principalId,
    stable_role_id: AI_PDM_ADMINISTRATIVE_PROFILE_ID, role_code: 'application_system_admin',
    catalog_version: AI_PDM_ADMINISTRATIVE_DEFINITION_VERSION, scope_kind: 'global', scope_key: null,
    valid_from: '2026-01-01T00:00:00Z', valid_until: null, published_at: '2026-01-01T00:00:00Z',
    source_assignment_id: id, source_grant_id: id, admin_catalog_sha256: AI_PDM_ADMINISTRATIVE_DEFINITION_SHA256,
    role_definition_hash: AI_PDM_ADMINISTRATIVE_DEFINITION_SHA256, ...changes }
  const account = { contract_version: 'organization.active-principal.v1', principal_issuer: actor.identityIssuer,
    principal_subject: actor.identitySubject, principal_id: actor.principalId, employee_id: actor.employeeId, employee_status: 'active' }
  const queries: string[] = []
  const queryOne = vi.fn(async () => null)
  const client = { kind: 'postgres', query: async (sql: string) => {
    queries.push(sql)
    return sql.includes('read_ai_pdm_active_principal_') ? [account] : [grant]
  }, queryOne }
  const repository = new JenfuEntitlementRepository(client as never, {
    catalogVersion: 'ai-pdm.role-policy.current-catalog-is-independent', roles: []
  })
  return { repository, queries, queryOne }
}
function permission(repository: JenfuEntitlementRepository, code: string, kind: 'page'|'action' = 'action') {
  return repository.evaluatePermission({ actor, permissionKind: kind, permissionCode: code, rolePriority: [] })
}

describe('DEV-127 exact application administrator authority', () => {
  it('pins the independent administrative capability definition version and hash', () => {
    expect(AI_PDM_ADMINISTRATIVE_DEFINITION_VERSION).toBe('ai-pdm.administration.2026-11-08.v1')
    expect(AI_PDM_ADMINISTRATIVE_DEFINITION_SHA256).toBe('a1f299753dc62591eafef37d49db692ab75bda808211bb3389d1a8933a5c6959')
    expect(aiPdmAdministrativeRole.stableRoleId).toBe(AI_PDM_ADMINISTRATIVE_PROFILE_ID)
    expect(aiPdmAdministrativeRole.roleDefinitionHash).toBe(AI_PDM_ADMINISTRATIVE_DEFINITION_SHA256)
  })
  it('uses the typed v6 grant reader and fixed definition without a dynamic/static catalog publication proof', async () => {
    const f = fixture()
    await expect(permission(f.repository, 'settings.admin_matrix')).resolves.toMatchObject({ decisionCode: 'allowed' })
    await expect(permission(f.repository, 'pdm.drawing.view')).resolves.toMatchObject({ decisionCode: 'allowed' })
    await expect(permission(f.repository, 'pdm.drawing.edit')).rejects.toMatchObject({ code: 'permission_not_granted' })
    expect(f.queries.some(sql => sql.includes('read_ai_pdm_principal_effective_grants_v6'))).toBe(true)
    expect(f.queries.some(sql => sql.includes('read_ai_pdm_principal_effective_grants_v5'))).toBe(false)
    expect(f.queries.some(sql => sql.includes('v_role_policy_publications_v1'))).toBe(false)
    expect(f.queryOne).not.toHaveBeenCalled()
  })
  it('accepts the fixed definition even when the active business role catalog is independent', async () => {
    const f = fixture()
    for (const code of ['settings.admin_matrix', 'pdm.drawing.view', 'pdm.shared_model.view', 'handoff.published.view']) {
      await expect(permission(f.repository, code)).resolves.toMatchObject({ decisionCode: 'allowed' })
    }
    await expect(permission(f.repository, 'numbering.drawings.view', 'page')).resolves.toMatchObject({ decisionCode: 'allowed' })
    for (const code of ['pdm.drawing.edit', 'pdm.drawing.download', 'pdm.drawing.review', 'pdm.drawing.publish', 'numbering.create']) {
      await expect(permission(f.repository, code)).rejects.toMatchObject({ code: 'permission_not_granted' })
    }
  })
  it.each([
    { principal_id: 'same-employee-other-principal' }, { employee_id: 'other-employee' }, { application_id: 'financial-management-system' },
    { target_principal_id: 'other-principal' }, { subject_kind: 'employee' }, { grant_kind: 'delegated', delegation_id: 'delegation-a' },
    { source_grant_id: 'not-a-uuid' }, { source_assignment_id: 'other' },
    { catalog_version: 'ai-pdm.administration.2026-11-07.v1' }, { admin_catalog_sha256: 'f'.repeat(64) },
    { role_definition_hash: 'e'.repeat(64) }, { scope_kind: 'workspace', scope_key: 'current' },
    { valid_until: '2026-01-02T00:00:00Z' }, { role_code: 'platform_super_admin' }
  ])('rejects incompatible authority %j', async changes => {
    await expect(permission(fixture(changes).repository, 'settings.admin_matrix')).rejects.toMatchObject({ code: 'entitlement_contract_mismatch' })
  })
  it('rejects a grant that still declares the previous typed reader contract', async () => {
    await expect(permission(fixture({ contract_version: 'jenfu.orgmaster.ai-pdm-principal-grants.v5' }).repository,
      'settings.admin_matrix')).rejects.toMatchObject({ code: 'entitlement_contract_mismatch' })
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
