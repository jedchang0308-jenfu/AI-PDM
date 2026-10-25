import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const capabilitiesPath = join(root, 'config/access-control/jenfu-active-capabilities.v1.json')
const catalogPath = join(root, 'config/access-control/jenfu-role-catalog.v7.json')
const targetPath = join(root, 'config/access-control/role-policy-editor-registry.v2.json')

const protectedCodes = new Set([
  'accounts.identity.manage', 'accounts.invitation.manage', 'accounts.lifecycle.manage',
  'accounts.session.revoke', 'settings.admin_matrix', 'settings.integration.manage',
  'settings.manage', 'settings.secret.manage', 'settings.storage_evidence.view'
])

const groups = [
  ['drawing', '圖號作業'], ['part', '料號作業'], ['model', '模型／BOM'], ['transfer', '技轉交付']
]
const actions = [
  ['view', '查看'], ['download', '下載'], ['edit', '編輯'], ['review', '審核'], ['publish', '發布']
]

const legacyByAction = {
  'drawing:view': ['numbering.drawings.view', 'numbering.workspace.view', 'submission.view', 'approval.inbox.view'],
  'drawing:download': ['numbering.export.create'],
  'drawing:edit': ['numbering.create', 'numbering.attachments.manage', 'numbering.candidate.review.submit', 'numbering.draft.obsolete', 'numbering.draft.update', 'numbering.duplicate_check', 'numbering.link_variant', 'numbering.task.update', 'numbering.notification.update', 'numbering.workspace.create', 'numbering.workspace.update', 'numbering.workspace.cancel', 'numbering.approval.request', 'numbering.approval.batch.create', 'numbering.recognition.run', 'numbering.recognition.review', 'numbering.recognition.formalize', 'pdm.file_metadata.detect', 'post_release_change', 'submission.create', 'submission.update'],
  'drawing:review': ['numbering.drawing_revision_lifecycle_review', 'approval.request.decide', 'approval.request.apply', 'numbering.draft.admin_confirm', 'submission.review', 'submission.decide', 'submission.lifecycle.decide'],
  'drawing:publish': ['numbering.publish', 'submission.retry'],
  'part:view': ['numbering.search', 'numbering.workspace.view', 'submission.view', 'approval.inbox.view'],
  'part:download': ['numbering.export.create', 'numbering.audit_report.generate', 'numbering.reports'],
  'part:edit': ['numbering.create', 'numbering.attachments.manage', 'numbering.candidate.review.submit', 'numbering.draft.obsolete', 'numbering.draft.update', 'numbering.duplicate_check', 'numbering.link_variant', 'numbering.task.update', 'numbering.notification.update', 'numbering.workspace.create', 'numbering.workspace.update', 'numbering.workspace.cancel', 'numbering.approval.request', 'numbering.approval.batch.create', 'numbering.recognition.run', 'numbering.recognition.review', 'numbering.recognition.formalize', 'pdm.file_metadata.detect', 'post_release_change', 'submission.create', 'submission.update', 'obsolete_part_root'],
  'part:review': ['approval.request.decide', 'approval.request.apply', 'numbering.draft.admin_confirm', 'submission.review', 'submission.decide', 'submission.lifecycle.decide'],
  'part:publish': ['numbering.publish', 'submission.retry'],
  'model:view': ['pdm.shared_model.view'],
  'model:download': ['numbering.export.create'],
  'model:edit': ['pdm.shared_model.manage'],
  'model:review': [],
  'model:publish': ['numbering.publish', 'transfer.package.publish', 'manufacturing.baseline.release', 'submission.retry'],
  'transfer:view': ['transfer.package.view', 'handoff.published.view', 'manufacturing.baseline.view', 'integration.procurement.view', 'submission.view'],
  'transfer:download': ['handoff.published.view', 'manufacturing.baseline.view', 'integration.procurement.view'],
  'transfer:edit': ['transfer.package.create', 'transfer.package.update', 'transfer.package.review.submit', 'transfer.package.review.withdraw', 'manufacturing.baseline.manage', 'submission.create', 'submission.update', 'submission.share'],
  'transfer:review': ['submission.review', 'submission.decide', 'submission.lifecycle.decide', 'approval.request.decide', 'approval.request.apply'],
  'transfer:publish': ['transfer.package.publish', 'manufacturing.baseline.release', 'submission.retry']
}

const templateActions = {
  'role-rd': ['view', 'download', 'edit'],
  'role-rd-manager': ['view', 'download', 'edit', 'review', 'publish'],
  'role-qa': ['view', 'download'],
  'role-manufacturing': ['view', 'download'],
  'role-procurement': ['view', 'download'],
  'role-external-specialist': ['view'],
  'role-pdm-admin': ['view', 'download', 'edit', 'review', 'publish']
}

function uniqueSorted(values) { return [...new Set(values)].sort() }

export function buildRolePolicyRegistry(activeCapabilities, catalog) {
  assert.equal(activeCapabilities.contractVersion, 'ai-pdm.active-capabilities.v1')
  assert.equal(activeCapabilities.applicationId, 'ai-pdm')
  assert.equal(catalog.applicationId, 'ai-pdm')
  const byCode = new Map(activeCapabilities.capabilities.map(capability => [capability.code, capability]))
  assert.equal(byCode.size, activeCapabilities.capabilities.length)
  for (const code of Object.values(legacyByAction).flat()) {
    assert.ok(byCode.has(code), `unknown legacy capability ${code}`)
  }
  for (const code of protectedCodes) assert.ok(byCode.has(code), `missing protected capability ${code}`)

  const roleProfiles = [
    ['role-rd', 'role-rd', 'RD', 0, 'selectable'],
    ['role-rd-manager', 'role-rd-manager', 'RD主管', 1, 'selectable'],
    ['role-qa', 'role-qa', 'QA/QC', 2, 'selectable'],
    ['role-manufacturing', 'role-manufacturing', '生產人員', 3, 'selectable'],
    ['role-production-planning', 'role-procurement', '採購／生管（舊生管指派）', 4, 'legacy-only'],
    ['role-procurement', 'role-procurement', '採購／生管', 4, 'selectable'],
    ['role-external-specialist', 'role-external-specialist', '外部專員', 5, 'selectable'],
    ['role-pdm-admin', 'role-pdm-admin', 'PDM管理員', 6, 'selectable'],
    ['role-system-admin', 'role-system-admin', '系統管理員', 8, 'hidden-protected']
  ].map(([stableRoleId, permissionRoleId, presentationName, presentationOrder, assignmentDisposition]) => ({
    stableRoleId, permissionRoleId, presentationName, presentationOrder, assignmentDisposition
  }))
  assert.deepEqual(roleProfiles.map(profile => profile.stableRoleId), catalog.roles.map(role => role.stableRoleId))

  const businessActions = groups.flatMap(([groupId, groupLabel], groupOrder) =>
    actions.map(([actionId, actionLabel], actionOrder) => {
      const key = `${groupId}:${actionId}`
      const legacyCodes = legacyByAction[key]
      const routeBindings = legacyCodes.flatMap(code => (byCode.get(code)?.routes ?? []).map(route => ({ legacyCode: code, ...route })))
      const callerBindings = legacyCodes.flatMap(code => (byCode.get(code)?.callers ?? []).map(caller => ({ legacyCode: code, caller })))
      if (key === 'drawing:edit') routeBindings.push({
        legacyCode: 'numbering.attachments.manage', method: 'POST',
        path: 'src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/previews/route.ts',
      })
      if (key === 'drawing:edit') callerBindings.push({
        caller: 'src/app/api/numbering/drawing-revision-packages/[packageId]/model-basis/route.ts',
        condition: 'shared-model-basis-parent-and-model-edit',
      })
      if (key === 'drawing:review') callerBindings.push({
        caller: 'src/app/api/numbering/drawing-revision-packages/[packageId]/model-basis/route.ts',
        condition: 'two-d-only-combined-confirmation-parent-and-model-review',
      })
      if (key === 'model:edit') callerBindings.push({
        caller: 'src/lib/platform-command-service.ts',
        condition: 'canonical-attachment-cad-or-intermediate-parent-and-model-edit',
      })
      // Direct resource checks are conditional on canonical DB targets. They do
      // not add model.review to every generic parent approval operation.
      if (key === 'model:review') callerBindings.push({
        caller: 'src/lib/pdm-principal-review-resource.ts',
        condition: 'submitted-canonical-cad-or-intermediate-parent-and-model-review',
      }, {
        caller: 'src/app/api/numbering/drawing-revision-packages/[packageId]/model-basis/route.ts',
        condition: 'two-d-only-combined-confirmation-parent-and-model-review',
      })
      return {
        groupId, groupLabel, groupOrder, actionId, actionLabel, actionOrder,
        kind: 'action', code: `pdm.${groupId}.${actionId}`, editClass: 'business-role-grid',
        supportedScopeKinds: actionId === 'view' ? ['global', 'project', 'workspace'] : ['global', 'workspace'],
        byteDeliveryClass: actionId === 'download' ? 'original-or-export-bytes' : actionId === 'view' ? 'metadata-or-safe-preview' : 'none',
        requiredActions: actionId === 'download' ? [`pdm.${groupId}.view`, `pdm.${groupId}.download`] : [`pdm.${groupId}.${actionId}`],
        legacyOperationBindings: legacyCodes.map(code => ({ kind: byCode.get(code).kind, code })),
        routeBindings, callerBindings,
        preservedGuards: ['canonical-resource-from-database', 'assignment-scope-and-validity', 'domain-lifecycle-guards']
      }
    }))

  const requiredByLegacy = new Map()
  for (const action of businessActions) {
    for (const binding of action.legacyOperationBindings) {
      const values = requiredByLegacy.get(binding.code) ?? []
      values.push(...action.requiredActions)
      requiredByLegacy.set(binding.code, uniqueSorted(values))
    }
  }
  const legacyBindings = activeCapabilities.capabilities.map(capability => ({
    kind: capability.kind,
    code: capability.code,
    disposition: protectedCodes.has(capability.code) ? 'protected' : 'legacy-reference',
    resourceKind: requiredByLegacy.has(capability.code) ? 'server-resolved' : 'legacy-only',
    operation: requiredByLegacy.has(capability.code) ? 'mapped-by-resource-and-operation' : 'preserve-existing-decision',
    requiredActions: requiredByLegacy.get(capability.code) ?? []
  }))

  return {
    contractVersion: 'ai-pdm.role-policy-editor-registry.v2',
    applicationId: 'ai-pdm',
    roleSchemaId: 'ai-pdm.role-schema.flexible.v2',
    roleProfileSchemaId: 'ai-pdm.role-profile-schema.v1',
    policyReaderCompatibilityId: 'ai-pdm.role-policy-reader.grouped.v2',
    limits: { maxRoles: 64, maxChanges: 1240, maxRoleChanges: 62, maxRequestBytes: 524288, maxCandidateBytes: 1048576 },
    roleProfiles,
    customRoleTemplate: {
      assignable: true, risk: 'normal', subjectKind: 'employee', recommendationAllowed: true,
      delegationAllowed: true, allowedScopeKinds: ['workspace'], assignmentTier: 'app_admin', metadata: null,
      assignmentDisposition: 'selectable'
    },
    defaultTemplate: {
      templateId: 'ai-pdm.seven-role-defaults.v1',
      grants: Object.entries(templateActions).flatMap(([stableRoleId, actionIds]) =>
        groups.flatMap(([groupId]) => actionIds.map(actionId => ({ stableRoleId, groupId, actionId }))))
    },
    businessActions,
    legacyBindings,
    protectedBindings: [...protectedCodes].sort().map(code => ({ kind: byCode.get(code).kind, code })),
    sourceInventory: {
      capabilityContractVersion: activeCapabilities.contractVersion,
      capabilityCount: activeCapabilities.capabilities.length,
      protectedCount: protectedCodes.size,
      legacyReferenceCount: activeCapabilities.capabilities.length - protectedCodes.size,
      businessActionCount: businessActions.length
    }
  }
}

function main() {
  const mode = process.argv[2]
  assert.ok(mode === '--write' || mode === '--check', 'choose --write or --check')
  const built = buildRolePolicyRegistry(
    JSON.parse(readFileSync(capabilitiesPath, 'utf8')),
    JSON.parse(readFileSync(catalogPath, 'utf8'))
  )
  if (mode === '--write') writeFileSync(targetPath, `${JSON.stringify(built, null, 2)}\n`)
  assert.deepEqual(JSON.parse(readFileSync(targetPath, 'utf8')), built)
  process.stdout.write(`${JSON.stringify({ status: 'PASS', roles: built.roleProfiles.length,
    businessActions: built.businessActions.length, legacyBindings: built.legacyBindings.length })}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
