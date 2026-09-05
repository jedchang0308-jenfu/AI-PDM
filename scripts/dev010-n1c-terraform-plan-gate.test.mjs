import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { assertPlanAllowlist, assertPlanProfile, loadPlanAllowlist, normalizePlanChanges } from './lib/dev010-n1c-terraform-plan-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contract = loadPlanAllowlist(path.join(root, 'config', 'platform', 'dev-010-n1c-ai-pdm-plan-allowlist.json'))
const allow = contract.profiles.full.addresses
const plan = (profileName, addresses = contract.profiles[profileName].addresses) => ({
  variables: Object.fromEntries(Object.entries({ ...contract.requiredVariables, ...contract.profiles[profileName].variables }).map(([name, value]) => [name, { value }])),
  resource_changes: addresses.map((address) => ({ address, change: { actions: ['create'] } })),
})

test('N1C-AI-PLAN-01 reviewed full app plan contains exactly eleven addresses', () => {
  assert.equal(allow.length, 11)
  assert.equal(new Set(allow).size, 11)
  assert.equal(assertPlanProfile(plan('full'), contract, 'full').status, 'PASS')
  assert.equal(assertPlanProfile(plan('default-off'), contract, 'default-off').changeCount, 0)
})

test('N1C-AI-PLAN-02 native Terraform JSON and staged security subset are accepted', () => {
  const security = contract.profiles.security.addresses
  assert.equal(security.length, 4)
  const native = { resource_changes: security.map((address) => ({ address, change: { actions: ['create'] } })) }
  assert.deepEqual(normalizePlanChanges(native), security.map((address) => ({ address, actions: ['create'] })))
  assert.equal(assertPlanProfile(plan('security'), contract, 'security').changeCount, 4)
})

test('N1C-AI-PLAN-03 unknown, update, delete, replace, and duplicate allowlist fail closed', () => {
  assert.throws(() => assertPlanAllowlist([{ address: 'google_sql_database_instance.second', actions: ['create'] }], allow), /DEV010_N1C_UNKNOWN_RESOURCE/u)
  assert.throws(() => assertPlanAllowlist([{ address: allow[0], actions: ['update'] }], allow), /DEV010_N1C_DESTROY_OR_REPLACE_FORBIDDEN/u)
  assert.throws(() => assertPlanAllowlist([{ address: allow[0], actions: ['delete'] }], allow), /DEV010_N1C_DESTROY_OR_REPLACE_FORBIDDEN/u)
  assert.throws(() => assertPlanAllowlist([{ address: allow[0], actions: ['delete', 'create'] }], allow), /DEV010_N1C_DESTROY_OR_REPLACE_FORBIDDEN/u)
  assert.throws(() => assertPlanAllowlist([], [allow[0], allow[0]]), /DEV010_N1C_INVALID_PLAN_ALLOWLIST/u)
  assert.throws(() => assertPlanProfile(plan('full', []), contract, 'full'), /DEV010_N1C_PLAN_PROFILE_MISMATCH/u)
  const wrongTarget = plan('full')
  wrongTarget.variables.project_id.value = 'jenfu-ai-pdm-prod'
  assert.throws(() => assertPlanProfile(wrongTarget, contract, 'full'), /DEV010_N1C_PLAN_VARIABLE_MISMATCH/u)
})
