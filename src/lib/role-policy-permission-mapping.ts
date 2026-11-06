import registry from '../../config/access-control/role-policy-editor-registry.v3.json' with {type:'json'}

export type PolicyPermission = {kind:'page'|'action';code:string;allowed:boolean}
export type PolicyResourceGroup = 'drawing'|'part'|'model'|'transfer'
type PolicyRole = {stableRoleId:string;permissions:PolicyPermission[];roleStatus?:'active'|'inactive'}
type PolicyProfile = {stableRoleId:string;permissionRoleId:string}
export type PolicyPermissionDecision = 'allowed'|'explicit_deny'|'not_granted'
export type RolePolicySemanticChange={stableRoleId:string;permissionKind:'page'|'action';permissionCode:string;
  before:PolicyPermissionDecision;after:PolicyPermissionDecision;contexts:Array<PolicyResourceGroup[]|null>}
export const ROLE_POLICY_SEMANTIC_DIFF_VERSION='ai-pdm.role-policy-semantic-diff.v1'

// The runtime and first-conversion preview share exactly this operation mapping.
function permissionRequirements(kind:'page'|'action',code:string,resourceGroup?:PolicyResourceGroup,resourceGroups?:readonly PolicyResourceGroup[]) {
  const business=registry.businessActions.find(action=>action.kind===kind&&action.code===code)
  if(business)return business.requiredActions.map(code=>({kind:'action' as const,code}))
  const legacy=registry.legacyBindings.find(binding=>binding.kind===kind&&binding.code===code)
  if(!legacy)return null
  if(legacy.disposition==='protected'||legacy.requiredActions.length===0)return [{kind,code}]
  if(resourceGroups!==undefined) {
    const groups=[...new Set(resourceGroups)]
    if(!groups.length||groups.some(group=>!['drawing','part','model','transfer'].includes(group)))return null
    const required=legacy.requiredActions.filter(action=>action.startsWith('pdm.model.')||groups.some(group=>action.startsWith('pdm.'+group+'.')))
    return required.length?required.map(code=>({kind:'action' as const,code})):null
  }
  const required=resourceGroup?legacy.requiredActions.filter(action=>action.startsWith('pdm.'+resourceGroup+'.')||action.startsWith('pdm.model.')):legacy.requiredActions
  return required.length?required.map(code=>({kind:'action' as const,code})):null
}

/** Permission candidate only: caller retains Principal, grant, scope and priority checks. */
export function rolePolicyPermissionDecision(role:PolicyRole,kind:'page'|'action',code:string,dynamic:boolean,
  resourceGroup?:PolicyResourceGroup,resourceGroups?:readonly PolicyResourceGroup[]):PolicyPermissionDecision {
  if(role.roleStatus==='inactive')return 'not_granted'
  const administratorRead=role.stableRoleId==='role-application-system-admin'&&
    role.permissions.some(permission=>permission.kind===kind&&permission.code===code&&permission.allowed)
  const requirements=administratorRead||!dynamic?[{kind,code}]:permissionRequirements(kind,code,resourceGroup,resourceGroups)
  if(!requirements)return 'not_granted'
  const permissions=requirements.map(required=>role.permissions.find(entry=>entry.kind===required.kind&&entry.code===required.code))
  // Explicit deny remains a candidate even if another required action is absent.
  if(permissions.some(permission=>permission?.allowed===false))return 'explicit_deny'
  return permissions.every(permission=>permission?.allowed===true)?'allowed':'not_granted'
}

export function mappedRolePolicyDenyActions(roles:PolicyRole[],profiles:PolicyProfile[],permissionRoleId:string) {
  const members=new Set(profiles.filter(profile=>profile.permissionRoleId===permissionRoleId).map(profile=>profile.stableRoleId))
  const denied=new Set(roles.filter(role=>members.has(role.stableRoleId)).flatMap(role=>
    role.permissions.filter(permission=>!permission.allowed).map(permission=>permission.kind+':'+permission.code)))
  return registry.businessActions.filter(action=>action.legacyOperationBindings.some(binding=>denied.has(binding.kind+':'+binding.code))).map(action=>action.code)
}

export function projectRolePolicyPermissions(identity:PolicyRole,permission:PolicyRole,roles:PolicyRole[],profiles:PolicyProfile[]) {
  const permissions=new Map(permission.permissions.map(value=>[value.kind+':'+value.code,value]))
  for(const code of mappedRolePolicyDenyActions(roles,profiles,permission.stableRoleId))permissions.set('action:'+code,{kind:'action',code,allowed:false})
  return {permissions:[...permissions.values()],roleStatus:identity.roleStatus==='inactive'||permission.roleStatus==='inactive'?'inactive' as const:'active' as const}
}

export function legacyRolePolicySemanticChanges(before:PolicyRole[],after:PolicyRole[],profiles:PolicyProfile[]) {
  const changes=new Map<string,RolePolicySemanticChange>()
  for(const stableRoleId of new Set([...before,...after].map(role=>role.stableRoleId))) {
    const prior=before.find(role=>role.stableRoleId===stableRoleId)
    const identity=after.find(role=>role.stableRoleId===stableRoleId)
    const profile=profiles.find(value=>value.stableRoleId===stableRoleId)
    const permission=after.find(role=>role.stableRoleId===profile?.permissionRoleId)
    if(!identity||!profile||!permission)throw new Error('ROLE_POLICY_SEMANTIC_DIFF_UNAVAILABLE')
    const projected={stableRoleId:identity.stableRoleId,...projectRolePolicyPermissions(identity,permission,after,profiles)}
    for(const operation of [...registry.legacyBindings,...registry.businessActions]) {
      const groups=[...new Set(operation.requiredActions.map(code=>code.split('.')[1]))] as PolicyResourceGroup[]
      const contexts:Array<PolicyResourceGroup[]|null>=[null]
      for(let mask=1;mask<2**groups.length;mask++)contexts.push(groups.filter((_,index)=>(mask&(1<<index))!==0))
      for(const resourceGroups of contexts) {
        const kind=operation.kind as 'page'|'action'
        const from=prior?rolePolicyPermissionDecision(prior,kind,operation.code,false):'not_granted'
        const to=rolePolicyPermissionDecision(projected,kind,operation.code,true,undefined,resourceGroups??undefined)
        if(from!==to) {
          const key=[stableRoleId,kind,operation.code,from,to].join(':')
          const change=changes.get(key)??{stableRoleId,permissionKind:kind,permissionCode:operation.code,before:from,after:to,contexts:[]}
          change.contexts.push(resourceGroups);changes.set(key,change)
        }
      }
    }
  }
  return [...changes.values()]
}
