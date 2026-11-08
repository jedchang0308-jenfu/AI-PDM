import { createHash } from 'node:crypto'
import source from '../../config/access-control/administrative-capability-definition.v1.json' with { type: 'json' }
import type { JenfuApplicationRole } from '@/lib/jenfu-entitlement-contract'

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]))
  }
  return value
}

export const AI_PDM_ADMINISTRATIVE_DEFINITION_SHA256 =
  createHash('sha256').update(JSON.stringify(canonical(source))).digest('hex')

if (AI_PDM_ADMINISTRATIVE_DEFINITION_SHA256 !== 'a1f299753dc62591eafef37d49db692ab75bda808211bb3389d1a8933a5c6959'
  || source.schemaVersion !== 'jenfu.administrative-capability-definition.v1'
  || source.applicationId !== 'ai-pdm'
  || source.minimumAssuranceLevel !== 'aal1'
  || source.subjectKind !== 'principal'
  || source.scopeKind !== 'global') throw new Error('AI_PDM_ADMINISTRATIVE_DEFINITION_INVALID')

export const AI_PDM_ADMINISTRATIVE_DEFINITION_VERSION = source.definitionVersion
export const AI_PDM_ADMINISTRATIVE_PROFILE_ID = source.profileId

const administrativeRole: JenfuApplicationRole & { roleStatus: 'active' } = {
  stableRoleId: source.profileId,
  roleCode: 'application_system_admin',
  displayName: source.displayName,
  assignable: false,
  risk: 'critical',
  subjectKind: 'principal',
  recommendationAllowed: false,
  delegationAllowed: false,
  allowedScopeKinds: ['global'],
  assignmentTier: 'app_admin',
  permissions: source.capabilities.map(capability => ({ ...capability, kind: capability.kind as 'page' | 'action', allowed: true })),
  roleDefinitionHash: AI_PDM_ADMINISTRATIVE_DEFINITION_SHA256,
  roleStatus: 'active',
}

export const aiPdmAdministrativeRole = Object.freeze(administrativeRole)
