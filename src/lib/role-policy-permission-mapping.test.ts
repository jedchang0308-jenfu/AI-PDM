import {describe,it,expect} from 'vitest'
import staticV8 from '../../config/access-control/jenfu-role-catalog.v8.json' with {type:'json'}
import registry from '../../config/access-control/role-policy-editor-registry.v3.json' with {type:'json'}
import {buildLegacyRolePolicyDraft,applyRolePolicyDraftChanges,rolePolicyDiff,type RolePolicyRole} from '@/lib/role-policy-editor'
import {rolePolicyPermissionDecision,projectRolePolicyPermissions,ROLE_POLICY_SEMANTIC_DIFF_VERSION} from '@/lib/role-policy-permission-mapping'
import {approvalActionLabel} from '@/lib/approval-rule-summary'

const before=staticV8.roles.map(role=>({...role,metadata:role.metadata??null,roleStatus:'active'})) as RolePolicyRole[]
const version='ai-pdm.role-policy.10000000-0000-4000-8000-000000000098'
const draft=()=>buildLegacyRolePolicyDraft({roles:structuredClone(before),candidateCatalogVersion:version})
const diff=(candidate:ReturnType<typeof draft>)=>rolePolicyDiff({roles:before,format:'legacy-static-v1'},candidate)

describe('shared runtime/preview permission semantics',()=>{
  it('reports existing RD send-review allow becoming ungranted although neither raw20 key existed before',()=>{
    const original=structuredClone(staticV8),result=diff(draft())
    expect(result.semanticDiffVersion).toBe(ROLE_POLICY_SEMANTIC_DIFF_VERSION)
    expect(result.semanticChanges).toContainEqual(expect.objectContaining({stableRoleId:'role-rd',permissionCode:'numbering.approval.request',
      before:'allowed',after:'not_granted',contexts:expect.arrayContaining([null])}))
    expect(approvalActionLabel('numbering.approval.request')).toBe('送審')
    expect(staticV8).toEqual(original)
  })
  it('includes both alias gains and losses using the same projected permission role as the catalog reader',()=>{
    const candidate=applyRolePolicyDraftChanges({candidate:draft(),roleChanges:[],changes:[
      {roleRef:{stableRoleId:'role-procurement'},groupId:'transfer',actionId:'view',enabled:true},
      {roleRef:{stableRoleId:'role-procurement'},groupId:'transfer',actionId:'download',enabled:true},
    ]}).candidate
    const changes=diff(candidate).semanticChanges
    expect(changes).toContainEqual(expect.objectContaining({stableRoleId:'role-production-planning',permissionCode:'integration.procurement.view',before:'not_granted',after:'allowed'}))
    expect(changes).toContainEqual(expect.objectContaining({stableRoleId:'role-production-planning',permissionCode:'pdm.transfer.download',before:'not_granted',after:'allowed'}))
    expect(changes).toContainEqual(expect.objectContaining({stableRoleId:'role-production-planning',permissionCode:'numbering.tasks',before:'allowed',after:'not_granted'}))
    const identity=candidate.roles[4],permission=candidate.roles[5]
    const effective={stableRoleId:identity.stableRoleId,...projectRolePolicyPermissions(identity,permission,candidate.roles,candidate.roleProfiles)}
    expect(rolePolicyPermissionDecision(effective,'action','integration.procurement.view',true)).toBe('allowed')
    expect(rolePolicyPermissionDecision(effective,'page','numbering.tasks',true)).toBe('not_granted')
  })
  it('retains the server resource-group narrowing and the explicit-deny candidate semantics',()=>{
    const candidate=applyRolePolicyDraftChanges({candidate:draft(),roleChanges:[],changes:[
      {roleRef:{stableRoleId:'role-rd'},groupId:'drawing',actionId:'view',enabled:true},
      {roleRef:{stableRoleId:'role-rd'},groupId:'part',actionId:'view',enabled:true},
    ]}).candidate
    const change=diff(candidate).semanticChanges.find(row=>row.stableRoleId==='role-rd'&&row.permissionCode==='submission.view')!
    expect(change.contexts).toContain(null)
    expect(change.contexts).not.toContainEqual(['drawing'])
    const role={stableRoleId:'role-rd',permissions:[{kind:'action' as const,code:'pdm.drawing.view',allowed:false}]}
    expect(rolePolicyPermissionDecision(role,'action','numbering.workspace.view',true)).toBe('explicit_deny')
    expect(rolePolicyPermissionDecision({...role,permissions:[]},'action','numbering.workspace.view',true)).toBe('not_granted')
  })
  it('preserves protected direct reads and legacy system-admin gates, while reporting real mapped app-admin read gains',()=>{
    const changes=diff(draft()).semanticChanges
    expect(changes.filter(row=>row.stableRoleId==='role-system-admin'&&registry.legacyBindings.some(operation=>operation.kind===row.permissionKind&&operation.code===row.permissionCode))).toEqual([])
    const administrator=before[9]
    for(const permission of administrator.permissions) {
      expect(rolePolicyPermissionDecision(administrator,permission.kind,permission.code,false)).toBe('allowed')
      expect(rolePolicyPermissionDecision(administrator,permission.kind,permission.code,true)).toBe('allowed')
      expect(changes.some(row=>row.stableRoleId===administrator.stableRoleId&&row.permissionKind===permission.kind&&row.permissionCode===permission.code)).toBe(false)
    }
    expect(changes).toContainEqual(expect.objectContaining({stableRoleId:administrator.stableRoleId,permissionCode:'numbering.search',before:'not_granted',after:'allowed'}))
  })
  it('has a human operation label for every known legacy binding',()=>{
    for(const operation of registry.legacyBindings)expect(approvalActionLabel(operation.code)).not.toBe('自訂動作')
  })
  it('includes effective capabilities of a custom role created in the first draft',()=>{
    const candidate=applyRolePolicyDraftChanges({candidate:draft(),uuid:()=> '10000000-0000-4000-8000-000000000099',
      roleChanges:[{type:'create',clientRoleId:'client-reviewer',displayName:'文件查閱員'}],
      changes:[{roleRef:{clientRoleId:'client-reviewer'},groupId:'drawing',actionId:'view',enabled:true}]}).candidate
    expect(diff(candidate).semanticChanges).toContainEqual(expect.objectContaining({
      stableRoleId:'role-custom-10000000-0000-4000-8000-000000000099',permissionCode:'pdm.drawing.view',before:'not_granted',after:'allowed'}))
    expect(staticV8.roles).toHaveLength(10)
  })
})
