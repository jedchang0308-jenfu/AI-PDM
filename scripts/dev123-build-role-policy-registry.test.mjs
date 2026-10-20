import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildRolePolicyRegistry } from './dev123-build-role-policy-registry.mjs'

test('DEV-123 registry covers seven presentations, 20 business actions and all 66 legacy codes', () => {
  const capabilities = JSON.parse(readFileSync('config/access-control/jenfu-active-capabilities.v1.json', 'utf8'))
  const catalog = JSON.parse(readFileSync('config/access-control/jenfu-role-catalog.v7.json', 'utf8'))
  const registry = buildRolePolicyRegistry(capabilities, catalog)
  assert.equal(registry.roleProfiles.filter(role => role.assignmentDisposition === 'selectable').length, 7)
  assert.equal(registry.businessActions.length, 20)
  assert.equal(registry.legacyBindings.length, 66)
  assert.equal(registry.protectedBindings.length, 9)
  assert.equal(new Set(registry.businessActions.map(action => action.code)).size, 20)
  assert.deepEqual(registry.roleProfiles[4], {
    stableRoleId: 'role-production-planning', permissionRoleId: 'role-procurement',
    presentationName: '採購／生管（舊生管指派）', presentationOrder: 4,
    assignmentDisposition: 'legacy-only'
  })
})
test('transfer package metadata remains view-only while byte delivery retains download', () => {
  const capabilities = JSON.parse(readFileSync('config/access-control/jenfu-active-capabilities.v1.json', 'utf8'))
  const catalog = JSON.parse(readFileSync('config/access-control/jenfu-role-catalog.v7.json', 'utf8'))
  const registry = buildRolePolicyRegistry(capabilities, catalog)
  const view = registry.businessActions.find(action => action.code === 'pdm.transfer.view')
  const download = registry.businessActions.find(action => action.code === 'pdm.transfer.download')
  assert.deepEqual(download.requiredActions, ['pdm.transfer.view', 'pdm.transfer.download'])
  assert.ok(view.legacyOperationBindings.some(binding => binding.code === 'transfer.package.view'))
  assert.ok(!download.legacyOperationBindings.some(binding => binding.code === 'transfer.package.view'))
  const metadataPaths = [
    'src/app/api/transfer-packages/[id]/route.ts',
    'src/app/api/transfer-packages/[id]/readiness-summary/route.ts'
  ]
  for (const path of metadataPaths) {
    assert.ok(view.routeBindings.some(route => route.method === 'GET' && route.path === path))
    assert.ok(!download.routeBindings.some(route => route.path === path))
  }
  const packageView = registry.legacyBindings.find(binding => binding.code === 'transfer.package.view')
  assert.deepEqual(packageView.requiredActions, ['pdm.transfer.view'])
  assert.ok(download.routeBindings.some(route => route.path === 'src/app/api/handoff/[id]/release-package/route.ts'))
  const handoffView = registry.legacyBindings.find(binding => binding.code === 'handoff.published.view')
  assert.deepEqual(handoffView.requiredActions, ['pdm.transfer.download', 'pdm.transfer.view'])
})
