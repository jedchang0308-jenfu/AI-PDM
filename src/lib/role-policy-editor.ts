import { randomUUID } from 'node:crypto'
import roleCatalogJson from '../../config/access-control/jenfu-role-catalog.v7.json' with { type: 'json' }
import registryJson from '../../config/access-control/role-policy-editor-registry.v2.json' with { type: 'json' }
import { sha256CanonicalJson } from '@/lib/role-capability-canonical-hash.server'

export const ROLE_POLICY_WORKSPACE_CONTRACT = 'ai-pdm.role-policy-workspace.v3' as const
export const ROLE_POLICY_PUBLICATION_FORMAT = 'dynamic-policy-v1' as const
export const ROLE_POLICY_CANONICALIZATION = 'jenfu.canonical-json.v1' as const

export type RolePolicyStatus = 'active' | 'inactive'
export type RolePolicyPermission = { kind: 'page' | 'action'; code: string; allowed: boolean }
export type RolePolicyRole = {
  stableRoleId: string; roleCode: string; displayName: string; assignable: boolean;
  risk: 'normal' | 'high' | 'critical'; subjectKind: 'employee' | 'principal';
  recommendationAllowed: boolean; delegationAllowed: boolean; allowedScopeKinds: string[];
  assignmentTier: 'app_admin' | 'cross_app_override'; permissions: RolePolicyPermission[];
  metadata: Record<string, unknown> | null; roleStatus: RolePolicyStatus; roleDefinitionHash: string;
}
export type RolePolicyProfile = {
  stableRoleId: string; permissionRoleId: string; presentationName: string; presentationOrder: number;
  assignmentDisposition: 'selectable' | 'legacy-only' | 'hidden-protected'
}
export type RolePolicyBusinessAction = {
  groupId: 'drawing' | 'part' | 'model' | 'transfer'; groupLabel: string; groupOrder: number;
  actionId: 'view' | 'download' | 'edit' | 'review' | 'publish'; actionLabel: string; actionOrder: number;
  kind: 'action'; code: string; supportedScopeKinds: string[]; requiredActions: string[];
}
export type RolePolicyRegistry = {
  contractVersion: 'ai-pdm.role-policy-editor-registry.v2'; applicationId: 'ai-pdm';
  roleSchemaId: 'ai-pdm.role-schema.flexible.v2'; roleProfileSchemaId: 'ai-pdm.role-profile-schema.v1';
  policyReaderCompatibilityId: 'ai-pdm.role-policy-reader.grouped.v2';
  limits: { maxRoles: number; maxChanges: number; maxRoleChanges: number; maxRequestBytes: number; maxCandidateBytes: number };
  roleProfiles: RolePolicyProfile[]; customRoleTemplate: Omit<RolePolicyRole, 'stableRoleId' | 'roleCode' | 'displayName' | 'permissions' | 'roleStatus' | 'roleDefinitionHash'> & { assignmentDisposition: 'selectable' };
  defaultTemplate: { templateId: string; grants: Array<{ stableRoleId: string; groupId: string; actionId: string }> };
  businessActions: RolePolicyBusinessAction[];
  legacyBindings: Array<{ kind: 'page' | 'action'; code: string; disposition: 'protected' | 'legacy-reference'; requiredActions: string[] }>;
  protectedBindings: Array<{ kind: 'page' | 'action'; code: string }>;
}
export type RolePolicyCandidate = {
  format: typeof ROLE_POLICY_PUBLICATION_FORMAT; applicationId: 'ai-pdm'; candidateCatalogVersion: string;
  roleSchemaId: RolePolicyRegistry['roleSchemaId']; roleProfileSchemaId: RolePolicyRegistry['roleProfileSchemaId'];
  registryHash: string; baselineRoleIdentityHash: string; roleIdentityHash: string; roleProfileHash: string;
  protectedPolicyHash: string; roles: RolePolicyRole[]; roleProfiles: RolePolicyProfile[];
  identityHashes: Record<string, string>; contentHash: string;
}
export type ActiveRolePolicyTuple = { catalogVersion: string; catalogSha256: string; activationGeneration: string }
export type RolePolicyRoleChange =
  | { type: 'create'; clientRoleId: string; displayName: string }
  | { type: 'deactivate' | 'reactivate'; stableRoleId: string }
export type RolePolicyCapabilityChange = {
  roleRef: { stableRoleId: string } | { clientRoleId: string };
  groupId: string; actionId: string; enabled: boolean
}

const registry = registryJson as unknown as RolePolicyRegistry
const baseCatalog = roleCatalogJson as unknown as { applicationId: string; catalogVersion: string; catalogSha256: string; roles: Omit<RolePolicyRole, 'roleStatus'>[] }

function ascii(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0 }
function permissionKey(permission: RolePolicyPermission) { return `${permission.kind}:${permission.code}` }
function normalizedPermissions(permissions: RolePolicyPermission[]) {
  return [...permissions].sort((left, right) => ascii(permissionKey(left), permissionKey(right)))
}
type RoleIdentitySource = Omit<RolePolicyRole, 'permissions' | 'roleStatus' | 'roleDefinitionHash'> &
  Partial<Pick<RolePolicyRole, 'permissions' | 'roleStatus' | 'roleDefinitionHash'>>

function identity(role: RoleIdentitySource) {
  return {
    stableRoleId: role.stableRoleId, roleCode: role.roleCode, displayName: role.displayName,
    assignable: role.assignable, risk: role.risk, subjectKind: role.subjectKind,
    recommendationAllowed: role.recommendationAllowed, delegationAllowed: role.delegationAllowed,
    allowedScopeKinds: [...role.allowedScopeKinds].sort(ascii), assignmentTier: role.assignmentTier,
    metadata: role.metadata ?? null
  }
}
function roleDefinitionPayload(role: Omit<RolePolicyRole, 'roleDefinitionHash'>) {
  return { ...identity(role), roleStatus: role.roleStatus, permissions: normalizedPermissions(role.permissions) }
}
function withRoleHash(role: Omit<RolePolicyRole, 'roleDefinitionHash'>): RolePolicyRole {
  return { ...role, permissions: normalizedPermissions(role.permissions),
    allowedScopeKinds: [...role.allowedScopeKinds].sort(ascii),
    roleDefinitionHash: sha256CanonicalJson(roleDefinitionPayload(role)) }
}

export function validateRolePolicyRegistry(value: RolePolicyRegistry = registry) {
  if (value.contractVersion !== 'ai-pdm.role-policy-editor-registry.v2' || value.applicationId !== 'ai-pdm' ||
      value.roleSchemaId !== 'ai-pdm.role-schema.flexible.v2' || value.roleProfileSchemaId !== 'ai-pdm.role-profile-schema.v1' ||
      value.policyReaderCompatibilityId !== 'ai-pdm.role-policy-reader.grouped.v2') throw new Error('ROLE_POLICY_REGISTRY_INVALID')
  if (value.roleProfiles.length !== 9 || value.roleProfiles.filter(profile => profile.assignmentDisposition === 'selectable').length !== 7 ||
      value.businessActions.length !== 20 || value.legacyBindings.length !== 66 || value.protectedBindings.length !== 9) {
    throw new Error('ROLE_POLICY_REGISTRY_COVERAGE_INVALID')
  }
  const actionKeys = new Set<string>()
  for (const action of value.businessActions) {
    const key = `${action.groupId}:${action.actionId}`
    if (actionKeys.has(key) || action.code !== `pdm.${action.groupId}.${action.actionId}` || action.kind !== 'action') {
      throw new Error('ROLE_POLICY_REGISTRY_ACTION_INVALID')
    }
    actionKeys.add(key)
  }
  const baselineIds = baseCatalog.roles.map(role => role.stableRoleId)
  if (JSON.stringify(value.roleProfiles.map(profile => profile.stableRoleId)) !== JSON.stringify(baselineIds)) {
    throw new Error('ROLE_POLICY_REGISTRY_PROFILE_INVALID')
  }
  return value
}

function semanticRegistry(value = validateRolePolicyRegistry()) {
  return {
    contractVersion: value.contractVersion,
    roleProfiles: [...value.roleProfiles].sort((left, right) => ascii(left.stableRoleId, right.stableRoleId)),
    defaultTemplate: { templateId: value.defaultTemplate.templateId,
      grants: [...value.defaultTemplate.grants].sort((left, right) => ascii(`${left.stableRoleId}:${left.groupId}:${left.actionId}`, `${right.stableRoleId}:${right.groupId}:${right.actionId}`)) },
    businessActions: value.businessActions.map(action => ({
      groupId: action.groupId, actionId: action.actionId, kind: action.kind, code: action.code,
      editClass: 'business-role-grid', supportedScopeKinds: [...action.supportedScopeKinds].sort(ascii),
      requiredActions: [...action.requiredActions].sort(ascii)
    })).sort((left, right) => ascii(`${left.groupId}:${left.actionId}`, `${right.groupId}:${right.actionId}`)),
    legacyBindings: value.legacyBindings.map(binding => ({ kind: binding.kind, code: binding.code,
      disposition: binding.disposition, requiredActions: [...binding.requiredActions].sort(ascii) }))
      .sort((left, right) => ascii(`${left.kind}:${left.code}`, `${right.kind}:${right.code}`)),
    protectedBindings: [...value.protectedBindings].sort((left, right) => ascii(`${left.kind}:${left.code}`, `${right.kind}:${right.code}`))
  }
}

export const rolePolicyRegistry = validateRolePolicyRegistry()
export const rolePolicyRegistryHash = sha256CanonicalJson(semanticRegistry())
export const baselineRoleIdentityHash = sha256CanonicalJson(baseCatalog.roles.map(identity))
export const roleProfileHash = sha256CanonicalJson(rolePolicyRegistry.roleProfiles)

function systemAdminPermissions() {
  const source = baseCatalog.roles.find(role => role.stableRoleId === 'role-system-admin')
  if (!source) throw new Error('ROLE_POLICY_SYSTEM_ADMIN_MISSING')
  const permissions = new Map(source.permissions.map(permission => [permissionKey(permission), permission]))
  for (const action of rolePolicyRegistry.businessActions) permissions.set(`action:${action.code}`, { kind: 'action', code: action.code, allowed: true })
  return normalizedPermissions([...permissions.values()])
}

export const protectedPolicyHash = sha256CanonicalJson({
  systemAdmin: { ...identity(baseCatalog.roles[8]), roleStatus: 'active', permissions: systemAdminPermissions() },
  frozenEntries: baseCatalog.roles.slice(0, 8).map(role => ({ stableRoleId: role.stableRoleId,
    permissions: normalizedPermissions(role.permissions) }))
})

function equalCanonical(left: unknown, right: unknown) {
  return sha256CanonicalJson(left) === sha256CanonicalJson(right)
}

function assertCandidateRoles(roles: RolePolicyRole[], profiles: RolePolicyProfile[]) {
  const invalid = (): never => { throw new Error('ROLE_POLICY_CANDIDATE_INVALID') }
  if (!Array.isArray(roles) || !Array.isArray(profiles) || roles.length < baseCatalog.roles.length ||
      roles.length > rolePolicyRegistry.limits.maxRoles || profiles.length !== roles.length) invalid()
  const ids = new Set<string>(); const codes = new Set<string>(); const names = new Set<string>()
  const reservedNames = new Set([...baseCatalog.roles.map(role => role.displayName),
    ...rolePolicyRegistry.roleProfiles.map(profile => profile.presentationName)])
  const actions = new Map(rolePolicyRegistry.businessActions.map(action => ['action:' + action.code, action]))
  for (let index = 0; index < roles.length; index += 1) {
    const role = roles[index]; const profile = profiles[index]
    if (!role || !profile || typeof role.displayName !== 'string' ||
        normalizeName(role.displayName) !== role.displayName ||
        ids.has(role.stableRoleId) || codes.has(role.roleCode) || names.has(role.displayName) ||
        !['active', 'inactive'].includes(role.roleStatus) || !Array.isArray(role.permissions)) invalid()
    ids.add(role.stableRoleId); codes.add(role.roleCode); names.add(role.displayName)
    const builtin = baseCatalog.roles[index]
    if (builtin) {
      if (!equalCanonical(identity(role), identity(builtin)) ||
          !equalCanonical(profile, rolePolicyRegistry.roleProfiles[index])) invalid()
    } else {
      const match = /^role-custom-([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/u.exec(role.stableRoleId)
      const { assignmentDisposition: _disposition, ...template } = rolePolicyRegistry.customRoleTemplate
      if (!match || role.roleCode !== 'custom_' + match[1].replaceAll('-', '') ||
          reservedNames.has(role.displayName) ||
          !equalCanonical(identity(role), { stableRoleId: role.stableRoleId, roleCode: role.roleCode,
            displayName: role.displayName, ...template }) ||
          !equalCanonical(profile, { stableRoleId: role.stableRoleId, permissionRoleId: role.stableRoleId,
            presentationName: role.displayName, presentationOrder: index - 2, assignmentDisposition: 'selectable' })) invalid()
    }
    const permissionKeys = new Set<string>()
    for (const permission of role.permissions) {
      if (!permission || Object.keys(permission).sort().join(',') !== 'allowed,code,kind' ||
          !['page', 'action'].includes(permission.kind) || typeof permission.code !== 'string' ||
          typeof permission.allowed !== 'boolean' || permissionKeys.has(permissionKey(permission))) invalid()
      permissionKeys.add(permissionKey(permission))
      const action = actions.get(permissionKey(permission))
      if (!builtin && (!action || permission.allowed !== true)) invalid()
      if (action && role.stableRoleId === 'role-external-specialist' && action.actionId !== 'view') invalid()
    }
    if (role.stableRoleId === 'role-system-admin') {
      if (role.roleStatus !== 'active' ||
          !equalCanonical(normalizedPermissions(role.permissions), systemAdminPermissions())) invalid()
    } else if (builtin) {
      const frozen = role.permissions.filter(permission => !actions.has(permissionKey(permission)))
      if (!equalCanonical(normalizedPermissions(frozen), normalizedPermissions(builtin.permissions))) invalid()
    }
    if (role.stableRoleId === 'role-production-planning' &&
        role.permissions.some(permission => actions.has(permissionKey(permission)))) invalid()
  }
  if (roles[4].roleStatus !== roles[5].roleStatus) invalid()
}

function completeCandidate(roles: RolePolicyRole[], profiles: RolePolicyProfile[], candidateCatalogVersion: string): RolePolicyCandidate {
  assertCandidateRoles(roles, profiles)
  const roleIdentityHash = sha256CanonicalJson(roles.map(identity))
  const identityHashes = Object.fromEntries(roles.map(role => [role.stableRoleId, sha256CanonicalJson(identity(role))]))
  const withoutContent = {
    format: ROLE_POLICY_PUBLICATION_FORMAT, applicationId: 'ai-pdm' as const, candidateCatalogVersion,
    roleSchemaId: rolePolicyRegistry.roleSchemaId, roleProfileSchemaId: rolePolicyRegistry.roleProfileSchemaId,
    registryHash: rolePolicyRegistryHash, baselineRoleIdentityHash, roleIdentityHash,
    roleProfileHash: sha256CanonicalJson(profiles), protectedPolicyHash, roles, roleProfiles: profiles
  }
  return { ...withoutContent, identityHashes, contentHash: sha256CanonicalJson(withoutContent) }
}

export function rebuildRolePolicyCandidate(input: {
  roles: RolePolicyRole[]; roleProfiles: RolePolicyProfile[]; candidateCatalogVersion: string
}) {
  return completeCandidate(input.roles.map(role => withRoleHash({ ...identity(role),
    permissions: role.permissions, roleStatus: role.roleStatus })), input.roleProfiles, input.candidateCatalogVersion)
}

export function assertRolePolicyCandidate(value: RolePolicyCandidate) {
  const rebuilt = rebuildRolePolicyCandidate({ roles: value.roles, roleProfiles: value.roleProfiles,
    candidateCatalogVersion: value.candidateCatalogVersion })
  if (value.format !== ROLE_POLICY_PUBLICATION_FORMAT || value.applicationId !== 'ai-pdm' ||
      value.roleSchemaId !== rolePolicyRegistry.roleSchemaId ||
      value.roleProfileSchemaId !== rolePolicyRegistry.roleProfileSchemaId ||
      value.registryHash !== rolePolicyRegistryHash || value.baselineRoleIdentityHash !== baselineRoleIdentityHash ||
      value.protectedPolicyHash !== protectedPolicyHash || value.contentHash !== rebuilt.contentHash ||
      value.roleIdentityHash !== rebuilt.roleIdentityHash || value.roleProfileHash !== rebuilt.roleProfileHash ||
      !equalCanonical(value.identityHashes, rebuilt.identityHashes) ||
      value.roles.some((role, index) => role.roleDefinitionHash !== rebuilt.roles[index].roleDefinitionHash)) {
    throw new Error('ROLE_POLICY_CANDIDATE_INVALID')
  }
  return value
}

export function buildDefaultRolePolicyCandidate(candidateCatalogVersion = 'ai-pdm.role-policy.00000000-0000-4000-8000-000000000000') {
  const grants = new Set(rolePolicyRegistry.defaultTemplate.grants.map(grant => `${grant.stableRoleId}:${grant.groupId}:${grant.actionId}`))
  const roles = baseCatalog.roles.map((source): RolePolicyRole => {
    const permissions = [...source.permissions]
    if (source.stableRoleId === 'role-system-admin') permissions.push(...systemAdminPermissions())
    else if (source.stableRoleId !== 'role-production-planning') {
      for (const action of rolePolicyRegistry.businessActions) {
        if (grants.has(`${source.stableRoleId}:${action.groupId}:${action.actionId}`)) {
          permissions.push({ kind: 'action', code: action.code, allowed: true })
        }
      }
    }
    const deduplicated = new Map(permissions.map(permission => [permissionKey(permission), permission]))
    return withRoleHash({ ...identity(source), permissions: [...deduplicated.values()], roleStatus: 'active' })
  })
  return completeCandidate(roles, rolePolicyRegistry.roleProfiles, candidateCatalogVersion)
}

function normalizeName(value: string) {
  const normalized = value.normalize('NFC').trim()
  if (!normalized || [...normalized].length > 80 || normalized.includes('\u0000')) throw new Error('ROLE_DISPLAY_NAME_INVALID')
  return normalized
}
function actionFor(groupId: string, actionId: string) {
  const action = rolePolicyRegistry.businessActions.find(candidate => candidate.groupId === groupId && candidate.actionId === actionId)
  if (!action) throw new Error('ROLE_POLICY_ACTION_UNKNOWN')
  return action
}

export function applyRolePolicyDraftChanges(input: {
  candidate: RolePolicyCandidate; roleChanges: RolePolicyRoleChange[]; changes: RolePolicyCapabilityChange[];
  uuid?: () => string
}) {
  if (input.roleChanges.length > rolePolicyRegistry.limits.maxRoleChanges || input.changes.length > rolePolicyRegistry.limits.maxChanges) {
    throw new Error('ROLE_POLICY_CHANGE_LIMIT_REACHED')
  }
  const roles = input.candidate.roles.map(role => ({ ...role, permissions: [...role.permissions] }))
  const profiles = input.candidate.roleProfiles.map(profile => ({ ...profile }))
  const roleById = new Map(roles.map(role => [role.stableRoleId, role]))
  const clientBindings = new Map<string, { stableRoleId: string; roleCode: string }>()
  const seenRoleChanges = new Set<string>()
  const names = new Set([...roles.map(role => role.displayName.normalize('NFC')), ...profiles.map(profile => profile.presentationName.normalize('NFC'))])
  const uuid = input.uuid ?? randomUUID

  for (const change of input.roleChanges) {
    const key = change.type === 'create' ? `create:${change.clientRoleId}` : `status:${change.stableRoleId}`
    if (seenRoleChanges.has(key)) throw new Error('ROLE_POLICY_DUPLICATE_CHANGE')
    seenRoleChanges.add(key)
    if (change.type === 'create') {
      if (!/^client-[a-z0-9][a-z0-9-]{0,79}$/u.test(change.clientRoleId) || clientBindings.has(change.clientRoleId)) throw new Error('ROLE_POLICY_CLIENT_ROLE_INVALID')
      const displayName = normalizeName(change.displayName)
      if (names.has(displayName)) throw new Error('ROLE_DISPLAY_NAME_CONFLICT')
      if (roles.length >= rolePolicyRegistry.limits.maxRoles) throw new Error('ROLE_LIMIT_REACHED')
      const generated = uuid().toLowerCase()
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(generated)) throw new Error('ROLE_POLICY_UUID_INVALID')
      const stableRoleId = `role-custom-${generated}`
      const roleCode = `custom_${generated.replaceAll('-', '')}`
      const template = rolePolicyRegistry.customRoleTemplate
      const role = withRoleHash({ stableRoleId, roleCode, displayName, assignable: template.assignable,
        risk: template.risk, subjectKind: template.subjectKind, recommendationAllowed: template.recommendationAllowed,
        delegationAllowed: template.delegationAllowed, allowedScopeKinds: [...template.allowedScopeKinds],
        assignmentTier: template.assignmentTier, metadata: template.metadata, permissions: [], roleStatus: 'active' })
      roles.push(role); roleById.set(stableRoleId, role); names.add(displayName)
      profiles.push({ stableRoleId, permissionRoleId: stableRoleId, presentationName: displayName,
        presentationOrder: Math.max(...profiles.filter(profile => profile.assignmentDisposition === 'selectable')
          .map(profile => profile.presentationOrder)) + 1,
        assignmentDisposition: 'selectable' })
      clientBindings.set(change.clientRoleId, { stableRoleId, roleCode })
      continue
    }
    const role = roleById.get(change.stableRoleId)
    const profile = profiles.find(candidate => candidate.stableRoleId === change.stableRoleId)
    if (!role || !profile || profile.assignmentDisposition !== 'selectable' || role.stableRoleId === 'role-system-admin') throw new Error('ROLE_POLICY_ROLE_READONLY')
    const status: RolePolicyStatus = change.type === 'deactivate' ? 'inactive' : 'active'
    role.roleStatus = status
    if (role.stableRoleId === 'role-procurement') {
      const alias = roleById.get('role-production-planning')
      if (!alias) throw new Error('ROLE_POLICY_ALIAS_MISSING')
      alias.roleStatus = status
    }
  }

  const seenCapabilities = new Set<string>()
  for (const change of input.changes) {
    const action = actionFor(change.groupId, change.actionId)
    const stableRoleId = 'stableRoleId' in change.roleRef ? change.roleRef.stableRoleId : clientBindings.get(change.roleRef.clientRoleId)?.stableRoleId
    if (!stableRoleId) throw new Error('ROLE_POLICY_ROLE_REF_UNKNOWN')
    const role = roleById.get(stableRoleId)
    const profile = profiles.find(candidate => candidate.stableRoleId === stableRoleId)
    if (!role || !profile || profile.permissionRoleId !== stableRoleId || profile.assignmentDisposition !== 'selectable' ||
        role.stableRoleId === 'role-system-admin' || role.roleStatus !== 'active') throw new Error('ROLE_POLICY_ROLE_READONLY')
    if (role.stableRoleId === 'role-external-specialist' && action.actionId !== 'view') throw new Error('ROLE_POLICY_SCOPE_UNSUPPORTED')
    const key = `${stableRoleId}:${action.groupId}:${action.actionId}`
    if (seenCapabilities.has(key)) throw new Error('ROLE_POLICY_DUPLICATE_CHANGE')
    seenCapabilities.add(key)
    const permissionKeyValue = `action:${action.code}`
    const existing = role.permissions.findIndex(permission => permissionKey(permission) === permissionKeyValue)
    if (change.enabled) {
      if (existing < 0) role.permissions.push({ kind: 'action', code: action.code, allowed: true })
      else if (role.permissions[existing].allowed !== true) throw new Error('ROLE_POLICY_EXPLICIT_DENY_PROTECTED')
    } else if (existing >= 0 && role.permissions[existing].allowed) role.permissions.splice(existing, 1)
  }

  const rehashed = roles.map(role => withRoleHash({ ...identity(role), permissions: role.permissions, roleStatus: role.roleStatus }))
  const candidate = completeCandidate(rehashed, profiles, input.candidate.candidateCatalogVersion)
  if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') > rolePolicyRegistry.limits.maxCandidateBytes) throw new Error('ROLE_POLICY_CANDIDATE_TOO_LARGE')
  return { candidate, roleBindings: [...clientBindings].map(([clientRoleId, binding]) => ({ clientRoleId, ...binding })) }
}

/** Restore editable actions only; current identity, lifecycle and protected entries remain authoritative. */
export function restoreRolePolicyHistory(current: RolePolicyCandidate, history: RolePolicyCandidate,
  candidateCatalogVersion: string) {
  assertRolePolicyCandidate(current); assertRolePolicyCandidate(history)
  const historyRoles = new Map(history.roles.map(role => [role.stableRoleId, role]))
  const editable = new Set(rolePolicyRegistry.businessActions.map(action => 'action:' + action.code))
  const roles = current.roles.map(role => {
    const prior = historyRoles.get(role.stableRoleId)
    const profile = current.roleProfiles.find(value => value.stableRoleId === role.stableRoleId)!
    if (!prior || role.roleStatus === 'inactive' || profile.assignmentDisposition !== 'selectable') return role
    if (!equalCanonical(identity(role), identity(prior))) throw new Error('ROLE_POLICY_HISTORY_IDENTITY_CONFLICT')
    return { ...role, permissions: [...role.permissions.filter(permission => !editable.has(permissionKey(permission))),
      ...prior.permissions.filter(permission => editable.has(permissionKey(permission)))] }
  })
  const profiles = [...current.roleProfiles]
  for (const prior of history.roles) {
    if (current.roles.some(role => role.stableRoleId === prior.stableRoleId)) continue
    // A historical identity is retained as inactive until an explicit restore.
    roles.push({ ...prior, roleStatus: 'inactive' })
    profiles.push({ stableRoleId: prior.stableRoleId, permissionRoleId: prior.stableRoleId,
      presentationName: prior.displayName, presentationOrder: profiles.length - 2,
      assignmentDisposition: 'selectable' })
  }
  return rebuildRolePolicyCandidate({ roles, roleProfiles: profiles, candidateCatalogVersion })
}

export function rolePolicyDiff(before: { roles: RolePolicyRole[]; format: 'legacy-static-v1' | typeof ROLE_POLICY_PUBLICATION_FORMAT }, after: RolePolicyCandidate) {
  const beforeRoles = new Map(before.roles.map(role => [role.stableRoleId, role]))
  const roleChanges: Array<Record<string, unknown>> = []
  const capabilityChanges: Array<Record<string, unknown>> = []
  for (const role of after.roles) {
    const prior = beforeRoles.get(role.stableRoleId)
    if (!prior) roleChanges.push({ type: 'create', stableRoleId: role.stableRoleId, displayName: role.displayName })
    else if (prior.roleStatus !== role.roleStatus) roleChanges.push({ type: role.roleStatus === 'active' ? 'reactivate' : 'deactivate', stableRoleId: role.stableRoleId })
    const priorPermissions = new Map((prior?.permissions ?? []).map(permission => [permissionKey(permission), permission.allowed]))
    const nextPermissions = new Map(role.permissions.map(permission => [permissionKey(permission), permission.allowed]))
    for (const action of rolePolicyRegistry.businessActions) {
      const key = `action:${action.code}`
      if (priorPermissions.get(key) !== nextPermissions.get(key)) capabilityChanges.push({ stableRoleId: role.stableRoleId,
        groupId: action.groupId, actionId: action.actionId, before: priorPermissions.get(key) === true, after: nextPermissions.get(key) === true })
    }
  }
  return { roleChanges, capabilityChanges, profileChanges: [],
    policyTransition: before.format === after.format ? 'dynamic-update' : 'legacy-to-dynamic',
    scopeImpact: 'application-global' as const }
}

export function rolePolicyConfirmationHash(input: {
  draftId: string; revision: number; contentHash: string; expectedActive: ActiveRolePolicyTuple;
  compatibilityRevision: string; diff: ReturnType<typeof rolePolicyDiff>
}) {
  return sha256CanonicalJson({ contractVersion: 'ai-pdm.role-policy-confirmation.v1', ...input,
    registryHash: rolePolicyRegistryHash })
}

export function rolePolicySource() {
  return { registry: rolePolicyRegistry, registryHash: rolePolicyRegistryHash, baselineRoleIdentityHash,
    protectedPolicyHash, roleProfileHash, baseCatalog, defaultCandidate: buildDefaultRolePolicyCandidate() }
}
