import type { JenfuApplicationRole, JenfuApplicationRoleCatalog } from '@/lib/jenfu-entitlement-contract'

export const AI_PDM_ROLE_CAPABILITY_VIEW_VERSION = 'ai-pdm.role-capability-view.v1' as const
export const AI_PDM_ROLE_CAPABILITY_WORKSPACE_VERSION = 'ai-pdm.role-capability-workspace.v2' as const
export const AI_PDM_PRIVILEGED_ROLE_CAPABILITY_WORKSPACE_VERSION = 'ai-pdm.role-capability-workspace.v3' as const
export type RoleCapabilityOperation = 'set_position_adoptions' | 'set_assignment_sources'

export type RoleCapabilityEmployee = {
  employeeId: string
  displayName: string
  assignmentType: 'regular' | 'acting'
  assignmentValidUntil: string | null
  sourceSelected: boolean
  effectiveHolder: boolean
  sourceCount: number
  status: 'active' | 'inactive'
}

export type RoleCapabilityPosition = {
  positionId: string
  displayName: string
  departmentName: string | null
  status: 'active' | 'inactive'
  recommended: boolean
  adopted: boolean
  recommendationVersion: string | null
  employees: RoleCapabilityEmployee[]
}

export type RoleCapabilityProjection = {
  contractVersion: 'orgmaster.role-capability-projection.v1'
  applicationId: 'ai-pdm'
  stableRoleId: string
  role: {
    stableRoleId: string
    roleCode: string
    displayName: string
    assignable: boolean
    riskLevel: 'normal' | 'high' | 'critical'
    recommendationAllowed: boolean
  }
  governanceRevision: string
  organizationVersionId: string
  organizationRevision: string
  changeCursor: number
  adoptionState: 'uninitialized' | 'published'
  positions: RoleCapabilityPosition[]
  manualAssignments: []
}

export type RoleCapabilityView = {
  contractVersion: typeof AI_PDM_ROLE_CAPABILITY_VIEW_VERSION
  applicationId: 'ai-pdm'
  catalogVersion: string
  governanceRevision: string
  organizationVersionId: string
  organizationRevision: string
  projectionCursor: number
  selectedRoleId: string | null
  roles: Array<{
    catalogRole: JenfuApplicationRole
    projection: RoleCapabilityProjection
    effectiveHolderCount: number
  }>
}

export type RoleCapabilityWorkspaceV2 = Omit<RoleCapabilityView, 'contractVersion'> & {
  contractVersion: typeof AI_PDM_ROLE_CAPABILITY_WORKSPACE_VERSION
  dataState: 'current' | 'stale_snapshot' | 'unavailable'
  mutationAllowed: boolean
  sourceDataAt: string | null
  snapshotStoredAt: string | null
  catalogPayloadHash: string
  dependency: { status: 'available' | 'unavailable'; decisionCode: string; correlationId: string }
}

export type RoleCapabilityPrivilegedAssignment = {
  assignmentId: string
  employeeId: string
  principalAdmissionId: string
  principalHint: string
  status: 'active' | 'revoked'
  validFrom: string
  validTo: string | null
  auditReference: string
}

export type RoleCapabilityPrivilegedCatalogRole = {
  stableRoleId: 'role-system-admin'
  roleCode: 'system_admin'
  displayName: string
  status: 'active'
  assignable: true
  riskLevel: 'critical'
  subjectKind: 'principal'
  assignmentTier: 'cross_app_override'
  recommendationAllowed: false
  delegationAllowed: false
  allowedScopeKinds: ['global']
}

export type RoleCapabilityPrivilegedRole = {
  catalogRole: RoleCapabilityPrivilegedCatalogRole
  effectiveHolderCount: number
  holderCountLabel: string
  managementKind: 'privileged_principal'
  manualAssignments: RoleCapabilityPrivilegedAssignment[]
}

export type RoleCapabilityManagementSurface = {
  label: '前往 OrgMaster 角色指派'
  href?: string
}

export type RoleCapabilityWorkspaceV3 = {
  contractVersion: typeof AI_PDM_PRIVILEGED_ROLE_CAPABILITY_WORKSPACE_VERSION
  applicationId: 'ai-pdm'
  catalogVersion: string
  catalogPayloadHash: string
  governanceRevision: string
  organizationVersionId: string
  organizationRevision: string
  projectionCursor: number
  selectedRoleId: 'role-system-admin'
  roles: RoleCapabilityPrivilegedRole[]
  dataState: 'current' | 'stale_snapshot' | 'unavailable'
  mutationAllowed: false
  sourceDataAt: string | null
  snapshotStoredAt: string | null
  dependency: { status: 'available' | 'unavailable'; decisionCode: string; correlationId: string }
  managementSurface?: RoleCapabilityManagementSurface
}

export type RoleCapabilityMutationInput = {
  stableRoleId: string
  operation: RoleCapabilityOperation
  adoptedPositionIds?: string[]
  changes?: Array<{ employeeId: string; positionId: string; selected: boolean }>
  baseProjectionCursor: number
  reason: string
  commandId?: string
  expectedCatalogVersion: string
  expectedCatalogPayloadHash: string
  expectedGovernanceRevision: string
  expectedOrganizationRevision: string
  requestHash?: string
}

export type RoleCapabilityMutationResponse = {
  status: 'applied' | 'replayed' | 'noop' | 'changes_pending'
  authorizationEffect: 'committed' | 'not_committed'
  sessionRefresh?: 'completed' | 'pending'
  auditReference?: string | null
  governanceRevision: string
  changeCursor: number
  projection: RoleCapabilityProjection
  impact?: {
    affectedEmployeeCount: number
    removedSourceCount: number
    addedSourceCount: number
    willRevokeHolderCount: number
    revokedEmployeeIds: string[]
  }
  receipt?: Record<string, unknown>
}

export type RoleCapabilityCatalog = Pick<JenfuApplicationRoleCatalog, 'contractVersion' | 'applicationId' | 'catalogVersion' | 'roles' | 'catalogSha256'>
