import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { assertExpectedPlanInputs, assertPlanAllowlist, assertPlanProfile, loadPlanAllowlist, normalizePlanChanges } from './lib/dev010-n1c-terraform-plan-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contract = loadPlanAllowlist(path.join(root, 'config', 'platform', 'dev-010-n1c-ai-pdm-plan-allowlist.json'))
const allow = contract.profiles.full.addresses
const expectedInputs = {
  source_revision: 'a'.repeat(40),
  foundation_manifest_sha256: 'b'.repeat(64),
  application_image: `asia-east1-docker.pkg.dev/jenfu-platform-nonprod/dev010-n1c/ai-pdm@sha256:${'c'.repeat(64)}`,
  migration_image: `asia-east1-docker.pkg.dev/jenfu-platform-nonprod/dev010-n1c/ai-pdm-migration@sha256:${'d'.repeat(64)}`,
}
const plan = (profileName, addresses = contract.profiles[profileName].addresses) => ({
  variables: Object.fromEntries(Object.entries({ ...contract.requiredVariables, ...contract.profiles[profileName].variables, ...expectedInputs }).map(([name, value]) => [name, { value }])),
  resource_changes: addresses.map((address) => ({ address, change: { actions: ['create'] } })),
})

test('N1C-AI-PLAN-01 reviewed full app plan contains exactly thirteen addresses', () => {
  assert.equal(allow.length, 13)
  assert.equal(new Set(allow).size, 13)
  assert.equal(assertPlanProfile(plan('full'), contract, 'full').status, 'PASS')
  assert.equal(assertPlanProfile(plan('default-off'), contract, 'default-off').changeCount, 0)
})

test('N1C-AI-PLAN-02 native Terraform JSON and staged security subset are accepted', () => {
  const security = contract.profiles.security.addresses
  assert.equal(security.length, 6)
  const native = { resource_changes: security.map((address) => ({ address, change: { actions: ['create'] } })) }
  assert.deepEqual(normalizePlanChanges(native), security.map((address) => ({ address, actions: ['create'] })))
  assert.equal(assertPlanProfile(plan('security'), contract, 'security').changeCount, 6)
})

test('N1C-AI-PLAN-03 source, foundation manifest, and both image digests are exact-bound', () => {
  const required = Object.keys(expectedInputs)
  assert.deepEqual(assertExpectedPlanInputs(plan('full'), expectedInputs, required).boundInputs, required)
  assert.throws(() => assertExpectedPlanInputs(plan('full'), { ...expectedInputs, application_image: 'wrong' }, required), /DEV010_N1C_PLAN_INPUT_MISMATCH/u)
})

test('N1C-AI-PLAN-04 same-project Logging bucket uses the automatically authorized writer', () => {
  const source = fs.readFileSync(path.join(root, 'infra', 'google-cloud', 'dev-010-n1c', 'observability.tf'), 'utf8')
  assert.match(source, /destination\s+=\s+"logging\.googleapis\.com\/\$\{google_logging_project_bucket_config\.application\[0\]\.id\}"/u)
  assert.match(source, /unique_writer_identity\s+=\s+true/u)
})

test('N1C-AI-PLAN-05 workbench signing uses a dedicated version-gated secret', () => {
  const runtime = fs.readFileSync(path.join(root, 'infra', 'google-cloud', 'dev-010-n1c', 'runtime.tf'), 'utf8')
  const security = fs.readFileSync(path.join(root, 'infra', 'google-cloud', 'dev-010-n1c', 'security.tf'), 'utf8')
  assert.match(runtime, /name\s*=\s*"PDM_WORKBENCH_CONTRACT_SECRET"/u)
  assert.match(runtime, /google_secret_manager_secret\.workbench_contract\[0\]\.secret_id/u)
  assert.match(runtime, /workbench_contract_version_ready/u)
  assert.match(security, /secret_id\s*=\s*local\.workbench_contract_secret/u)
  assert.doesNotMatch(runtime, /PDM_WORKBENCH_CONTRACT_SECRET[\s\S]{0,200}session-current/u)
})

test('N1C-AI-PLAN-06 unknown, update, delete, replace, and duplicate allowlist fail closed', () => {
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
