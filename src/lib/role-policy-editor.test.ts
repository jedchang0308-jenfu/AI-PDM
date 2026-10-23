import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { restoreRolePolicyHistory, assertRolePolicyCandidate, rebuildRolePolicyCandidate, applyRolePolicyDraftChanges, buildDefaultRolePolicyCandidate, rolePolicyDiff,
  rolePolicyMappedDenyActions, rolePolicyRegistryHash, rolePolicySource } from '@/lib/role-policy-editor'

const fixedUuid = () => '11111111-1111-4111-8111-111111111111'

describe('DEV-123 role policy domain', () => {
  it('binds the unpublished SQL definition to the actual semantic registry and profile source', () => {
    const sql = readFileSync('db/postgres/087_dev123_role_policy_candidate_validation.sql', 'utf8')
    const literal = /SELECT '(.+)'::jsonb\r?\n\$definition\$/u.exec(sql)?.[1]
    expect(literal).toBeDefined()
    const definition = JSON.parse(literal!)
    const source = rolePolicySource()
    expect(definition.registry_hash).toBe(rolePolicyRegistryHash)
    expect(definition.registry_payload.roleProfiles).toEqual(source.registry.roleProfiles)
    expect(definition.baseline_role_identity_hash).toBe(source.baselineRoleIdentityHash)
    expect(definition.protected_policy_hash).toBe(source.protectedPolicyHash)
  })
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

  it('counts inactive identities in the 64-role bound and rejects oversized change batches without mutation',()=>{
    let sequence=0
    const candidate=applyRolePolicyDraftChanges({candidate:buildDefaultRolePolicyCandidate(),changes:[],
      uuid:()=>`58000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,
      roleChanges:Array.from({length:55},(_,index)=>({type:'create' as const,clientRoleId:`client-boundary-${index+1}`,displayName:`邊界角色 ${index+1}`})),
    }).candidate
    const inactive=applyRolePolicyDraftChanges({candidate,changes:[],roleChanges:[{type:'deactivate',stableRoleId:candidate.roles[9].stableRoleId}]}).candidate
    const before=structuredClone(inactive)
    expect(inactive.roles).toHaveLength(64)
    expect(()=>applyRolePolicyDraftChanges({candidate:inactive,changes:[],uuid:fixedUuid,
      roleChanges:[{type:'create',clientRoleId:'client-over-limit',displayName:'超過上限'}]})).toThrow('ROLE_LIMIT_REACHED')
    expect(()=>applyRolePolicyDraftChanges({candidate:inactive,changes:[],roleChanges:Array.from({length:63},()=>({type:'deactivate' as const,stableRoleId:'role-rd'}))})).toThrow('ROLE_POLICY_CHANGE_LIMIT_REACHED')
    expect(()=>applyRolePolicyDraftChanges({candidate:inactive,roleChanges:[],changes:Array.from({length:1241},()=>({roleRef:{stableRoleId:'role-rd'},groupId:'drawing',actionId:'view',enabled:true}))})).toThrow('ROLE_POLICY_CHANGE_LIMIT_REACHED')
    expect(inactive).toEqual(before)
  })

  it('synchronizes procurement and planning status while preserving identity and capabilities', () => {
    const candidate = buildDefaultRolePolicyCandidate()
    const { candidate: changed } = applyRolePolicyDraftChanges({ candidate, roleChanges: [
      { type: 'deactivate', stableRoleId: 'role-procurement' }
    ], changes: [] })
    expect(changed.roles.find(role => role.stableRoleId === 'role-procurement')?.roleStatus).toBe('inactive')
    expect(changed.roles.find(role => role.stableRoleId === 'role-production-planning')?.roleStatus).toBe('inactive')
  })

  it('saves edits made before deactivation in one batch while keeping an already inactive role read-only', () => {
    const candidate = buildDefaultRolePolicyCandidate()
    const input = {roleRef:{stableRoleId:'role-rd'},groupId:'drawing',actionId:'edit',enabled:false}
    const changed = applyRolePolicyDraftChanges({candidate,
      roleChanges:[{type:'deactivate',stableRoleId:'role-rd'}],changes:[input]}).candidate
    const role = changed.roles.find(role=>role.stableRoleId==='role-rd')!
    expect(role.roleStatus).toBe('inactive')
    expect(role.permissions.some(permission=>permission.code==='pdm.drawing.edit')).toBe(false)
    expect(()=>applyRolePolicyDraftChanges({candidate:changed,roleChanges:[],changes:[{...input,enabled:true}]}))
      .toThrow('ROLE_POLICY_ROLE_READONLY')
    const restored = applyRolePolicyDraftChanges({candidate:changed,
      roleChanges:[{type:'reactivate',stableRoleId:'role-rd'}],changes:[]}).candidate
    expect(restored.roles.find(role=>role.stableRoleId==='role-rd')?.permissions).toEqual(role.permissions)
  })

  it('rejects system changes, alias edits, duplicate names and unsupported external actions', () => {
    const candidate = buildDefaultRolePolicyCandidate()
    expect(() => applyRolePolicyDraftChanges({ candidate, roleChanges: [{ type: 'deactivate', stableRoleId: 'role-system-admin' }], changes: [] })).toThrow('ROLE_POLICY_ROLE_READONLY')
    expect(() => applyRolePolicyDraftChanges({ candidate, roleChanges: [], changes: [{ roleRef: { stableRoleId: 'role-production-planning' }, groupId: 'drawing', actionId: 'view', enabled: true }] })).toThrow('ROLE_POLICY_ROLE_READONLY')
    expect(() => applyRolePolicyDraftChanges({ candidate, uuid: fixedUuid, roleChanges: [{ type: 'create', clientRoleId: 'client-rd', displayName: 'RD' }], changes: [] })).toThrow('ROLE_DISPLAY_NAME_CONFLICT')
    expect(() => applyRolePolicyDraftChanges({ candidate, roleChanges: [], changes: [{ roleRef: { stableRoleId: 'role-external-specialist' }, groupId: 'drawing', actionId: 'download', enabled: true }] })).toThrow('ROLE_POLICY_SCOPE_UNSUPPORTED')
  })

  it('derives a deny for every member of a mapped profile without adding an overlay', () => {
    for (const memberId of ['role-production-planning', 'role-procurement']) {
      const candidate = structuredClone(buildDefaultRolePolicyCandidate())
      const member = candidate.roles.find(role => role.stableRoleId === memberId)!
      member.permissions = member.permissions.filter(permission =>
        permission.code !== 'numbering.drawings.view' && permission.code !== 'pdm.drawing.view')
      member.permissions.push({ kind: 'page', code: 'numbering.drawings.view', allowed: false })
      const before = structuredClone(candidate)

      expect(rolePolicyMappedDenyActions(candidate.roles, candidate.roleProfiles, 'role-procurement'))
        .toContain('pdm.drawing.view')
      expect(member.permissions.find(permission => permission.code === 'pdm.drawing.view')).toBeUndefined()
      expect(candidate).toEqual(before)
    }

    const oldTrue = structuredClone(buildDefaultRolePolicyCandidate())
    for (const memberId of ['role-production-planning', 'role-procurement']) {
      const member = oldTrue.roles.find(role => role.stableRoleId === memberId)!
      member.permissions = member.permissions.filter(permission => permission.code !== 'pdm.drawing.view')
      member.permissions = member.permissions.map(permission =>
        permission.kind === 'page' && permission.code === 'numbering.drawings.view'
          ? { ...permission, allowed: true } : permission)
    }
    const beforeOldTrue = structuredClone(oldTrue)
    expect(rolePolicyMappedDenyActions(oldTrue.roles, oldTrue.roleProfiles, 'role-procurement'))
      .not.toContain('pdm.drawing.view')
    expect(oldTrue).toEqual(beforeOldTrue)
  })
})


describe('DEV-123 candidate security invariants', () => {
  it('rejects rehashed protected identity and frozen-permission tampering', () => {
    const version = 'ai-pdm.role-policy.10000000-0000-4000-8000-000000000015'
    for (const mutate of [
      (candidate: ReturnType<typeof buildDefaultRolePolicyCandidate>) => { candidate.roles[8].subjectKind = 'employee' },
      (candidate: ReturnType<typeof buildDefaultRolePolicyCandidate>) => { candidate.roles[8].roleStatus = 'inactive' },
      (candidate: ReturnType<typeof buildDefaultRolePolicyCandidate>) => { candidate.roles[0].permissions.push({ kind: 'action', code: 'settings.secret.manage', allowed: true }) }
    ]) {
      const candidate = structuredClone(buildDefaultRolePolicyCandidate(version))
      mutate(candidate)
      expect(() => rebuildRolePolicyCandidate({ ...candidate })).toThrow('ROLE_POLICY_CANDIDATE_INVALID')
    }
  })
  it('accepts JSONB object-key reordering and rejects contradictory lifecycle commands', () => {
    const candidate = buildDefaultRolePolicyCandidate('ai-pdm.role-policy.10000000-0000-4000-8000-000000000016')
    candidate.identityHashes = Object.fromEntries(Object.entries(candidate.identityHashes).reverse())
    expect(assertRolePolicyCandidate(candidate)).toBe(candidate)
    expect(() => applyRolePolicyDraftChanges({ candidate, roleChanges: [
      { type: 'deactivate', stableRoleId: 'role-rd' }, { type: 'reactivate', stableRoleId: 'role-rd' }
    ], changes: [] })).toThrow('ROLE_POLICY_DUPLICATE_CHANGE')
  })
})


describe('DEV-123 history restoration', () => {
  it('restores only editable capabilities and preserves current inactive roles and identity', () => {
    const historical = buildDefaultRolePolicyCandidate('ai-pdm.role-policy.10000000-0000-4000-8000-000000000017')
    const current = applyRolePolicyDraftChanges({ candidate: historical, roleChanges: [
      { type: 'deactivate', stableRoleId: 'role-qa' }
    ], changes: [{ roleRef: { stableRoleId: 'role-rd' }, groupId: 'drawing', actionId: 'edit', enabled: false }] }).candidate
    const restored = restoreRolePolicyHistory(current, historical,
      'ai-pdm.role-policy.10000000-0000-4000-8000-000000000018')
    expect(restored.roles[0].permissions).toContainEqual({ kind: 'action', code: 'pdm.drawing.edit', allowed: true })
    expect(restored.roles[2].roleStatus).toBe('inactive')
    expect(restored.roles[8]).toEqual(current.roles[8])
    expect(restored.roleIdentityHash).toBe(current.roleIdentityHash)
    expect(restored.candidateCatalogVersion).not.toBe(historical.candidateCatalogVersion)
  })
})
