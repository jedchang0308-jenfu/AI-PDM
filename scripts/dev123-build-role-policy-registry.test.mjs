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
