import { describe, expect, it } from 'vitest'
import { applyRolePolicyDraftChanges, buildDefaultRolePolicyCandidate, rolePolicyDiff,
  rolePolicyRegistryHash, rolePolicySource } from '@/lib/role-policy-editor'

const fixedUuid = () => '11111111-1111-4111-8111-111111111111'

describe('DEV-123 role policy domain', () => {
  it('builds a stable nine identity, seven profile and 20 action default candidate', () => {
    const source = rolePolicySource()
    expect(source.registry.businessActions).toHaveLength(20)
    expect(source.registry.roleProfiles.filter(profile => profile.assignmentDisposition === 'selectable')).toHaveLength(7)
    expect(source.defaultCandidate.roles).toHaveLength(9)
    expect(source.defaultCandidate.roles[4].stableRoleId).toBe('role-production-planning')
    expect(source.defaultCandidate.roles[5].stableRoleId).toBe('role-procurement')
    expect(rolePolicyRegistryHash).toMatch(/^[a-f0-9]{64}$/u)
  })

  it('creates a custom role with server identity and saves its capability in one candidate', () => {
    const before = buildDefaultRolePolicyCandidate()
    const result = applyRolePolicyDraftChanges({ candidate: before, uuid: fixedUuid,
      roleChanges: [{ type: 'create', clientRoleId: 'client-new-reviewer', displayName: '文件審查員' }],
      changes: [{ roleRef: { clientRoleId: 'client-new-reviewer' }, groupId: 'drawing', actionId: 'review', enabled: true }] })
    expect(result.roleBindings).toEqual([{ clientRoleId: 'client-new-reviewer',
      stableRoleId: 'role-custom-11111111-1111-4111-8111-111111111111', roleCode: 'custom_11111111111141118111111111111111' }])
    const custom = result.candidate.roles.at(-1)!
    expect(custom.permissions).toContainEqual({ kind: 'action', code: 'pdm.drawing.review', allowed: true })
    expect(rolePolicyDiff(before, result.candidate).roleChanges).toHaveLength(1)
  })

  it('synchronizes procurement and planning status while preserving identity and capabilities', () => {
    const candidate = buildDefaultRolePolicyCandidate()
    const { candidate: changed } = applyRolePolicyDraftChanges({ candidate, roleChanges: [
      { type: 'deactivate', stableRoleId: 'role-procurement' }
    ], changes: [] })
    expect(changed.roles.find(role => role.stableRoleId === 'role-procurement')?.roleStatus).toBe('inactive')
    expect(changed.roles.find(role => role.stableRoleId === 'role-production-planning')?.roleStatus).toBe('inactive')
  })

  it('rejects system changes, alias edits, duplicate names and unsupported external actions', () => {
    const candidate = buildDefaultRolePolicyCandidate()
    expect(() => applyRolePolicyDraftChanges({ candidate, roleChanges: [{ type: 'deactivate', stableRoleId: 'role-system-admin' }], changes: [] })).toThrow('ROLE_POLICY_ROLE_READONLY')
    expect(() => applyRolePolicyDraftChanges({ candidate, roleChanges: [], changes: [{ roleRef: { stableRoleId: 'role-production-planning' }, groupId: 'drawing', actionId: 'view', enabled: true }] })).toThrow('ROLE_POLICY_ROLE_READONLY')
    expect(() => applyRolePolicyDraftChanges({ candidate, uuid: fixedUuid, roleChanges: [{ type: 'create', clientRoleId: 'client-rd', displayName: 'RD' }], changes: [] })).toThrow('ROLE_DISPLAY_NAME_CONFLICT')
    expect(() => applyRolePolicyDraftChanges({ candidate, roleChanges: [], changes: [{ roleRef: { stableRoleId: 'role-external-specialist' }, groupId: 'drawing', actionId: 'download', enabled: true }] })).toThrow('ROLE_POLICY_SCOPE_UNSUPPORTED')
  })
})
