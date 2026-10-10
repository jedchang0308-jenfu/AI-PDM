import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { SECRET_VERSION_IAM_ROLE, SECRET_VERSION_IAM_ADDRESSES, SECRET_VERSION_IAM_SECRETS, SECRET_VERSION_IAM_MEMBERS,
  assertSecretVersionIamTerraformPlan, assertSecretVersionIamPolicyPair, readSecretVersionIamLivePolicy,
  readSecretVersionIamContinuation, assertSecretVersionIamContinuation, executeSecretVersionIamContinuation } from './lib/dev122-openswx-secret-version-iam.mjs'
import { secretVersionIamHarness, secretVersionTerraformFixture } from '../qa/dev-122/fixtures/secret-version-iam-fixture.mjs'
const clone = structuredClone

test('exact twelve-address gate admits retained seven no-ops and new five create/no-op, with canonical same-project Secret IDs', () => {
  assert.equal(assertSecretVersionIamTerraformPlan(secretVersionTerraformFixture()).length, 12)
  for (const project of ['jenfu-platform-prod', '9536592944']) {
    const plan = secretVersionTerraformFixture()
    for (const row of plan.resource_changes.filter(row => row.change.after.secret_id)) { row.change.after.secret_id = `projects/${project}/secrets/${row.change.after.secret_id}`; row.change.actions = ['no-op'] }
    assert.equal(assertSecretVersionIamTerraformPlan(plan).length, 12)
  }
  for (const mutate of [
    p => p.resource_changes.pop(), p => p.resource_changes.push(clone(p.resource_changes[0])),
    p => p.resource_changes[7].address = 'google_project_iam_custom_role.other',
    p => p.resource_changes[0].change.actions = ['create'],
    ...['update', 'delete', 'delete,create'].map(action => p => { p.resource_changes[7].change.actions = action.split(',') }),
    p => p.resource_changes[7].change.importing = { id: 'x' },
    p => p.resource_changes[7].previous_address = 'moved',
    p => p.resource_changes[7].change.after.permissions.push('secretmanager.versions.access'),
    p => p.resource_changes[7].change.after_unknown.permissions = [true],
    p => p.resource_changes[8].change.after_unknown.secret_id = true,
    p => p.resource_changes[8].change.after_unknown.role = true,
    p => p.resource_changes[8].change.after.condition = [{ expression: 'true' }],
    p => p.resource_changes[8].change.after.member = SECRET_VERSION_IAM_MEMBERS[1],
    ...['foreign', '9536592945'].map(project => p => { p.resource_changes[8].change.after.secret_id = `projects/${project}/secrets/${SECRET_VERSION_IAM_SECRETS[0]}` }),
    p => p.resource_changes[8].change.after.project = 'other-project',
    p => p.resource_changes[8].provider_name = 'other/provider',
    p => p.resource_drift = [{}], p => p.deferred_changes = [{}],
  ]) { const plan = secretVersionTerraformFixture(); mutate(plan); assert.throws(() => assertSecretVersionIamTerraformPlan(plan)) }
})

test('Secret policy v3 readback requests only exact role, project and two Secret policies', async () => {
  const h = await secretVersionIamHarness()
  await readSecretVersionIamLivePolicy(h.transport)
  assert.equal(h.calls.length, 4)
  assert.ok(h.calls.every(row => row.url.includes(':getIamPolicy') || row.url.endsWith(SECRET_VERSION_IAM_ROLE)))
  assert.ok(h.calls.filter(row => row.url.includes('secretmanager')).every(row => row.url.endsWith(':getIamPolicy?options.requestedPolicyVersion=3') && !row.options.method))
})

test('policy pair preserves unrelated conditional bindings, rejects privilege or project drift', async () => {
  const h = await secretVersionIamHarness(), { before, after } = h.proof
  assert.ok(assertSecretVersionIamPolicyPair(before, after).projectBindingsSha256)
  for (const mutate of [
    p => p.projectPolicy.bindings.push({ role: 'roles/owner', members: ['user:x'] }),
    p => p.secretVersionRole.includedPermissions.push('secretmanager.versions.access'),
    p => p.secretVersionRole.stage = 'DISABLED',
    p => p.secretPolicies[SECRET_VERSION_IAM_SECRETS[0]].bindings[0].condition.expression = 'false',
    p => p.secretPolicies[SECRET_VERSION_IAM_SECRETS[0]].bindings[1].condition = { expression: 'true' },
    p => p.secretPolicies[SECRET_VERSION_IAM_SECRETS[0]].bindings[1].members.push('user:x'),
    p => p.secretPolicies[SECRET_VERSION_IAM_SECRETS[0]].bindings.push(clone(p.secretPolicies[SECRET_VERSION_IAM_SECRETS[0]].bindings[1])),
  ]) { const bad = clone(after); mutate(bad); assert.throws(() => assertSecretVersionIamPolicyPair(before, bad)) }
})

test('sealed receipt reader proves real historical/official joins without provider IAM or new worker build', async () => {
  const h = await secretVersionIamHarness()
  const row = await readSecretVersionIamContinuation({ ...h.args, transport: { ...h.transport, request: async () => { throw Error('PROVIDER_FORBIDDEN') } } })
  assert.deepEqual(row.ref, h.proof.continuationRef); assert.equal(h.calls.length, 0)
  assert.equal(row.value.workerBuildRef, undefined)
  await assertSecretVersionIamContinuation(h.args)
  assert.ok(h.calls.length > 0)
})

test('forged refs, source, approval, request, binary, window and policy receipts stop before provider mutation', async () => {
  const mutations = [
    ['continuationRef', v => v.actor = 'other'], ['continuationRef', v => v.extra = true],
    ['sourceLockRef', v => v.clean = false], ['sourceLockRef', v => v.repository = 'other/repo'],
    ['approvedPlanRef', v => v.plan.sourceHashes.at(-1).sha256 = '0'.repeat(64)],
    ['humanApprovalRef', v => v.permissions.push('secretmanager.versions.access')],
    ['capacityGateRef', v => v.status = 'FAIL'],
    ['inputRef', v => v.sourceRevision = '0'.repeat(40)],
    ['requestRef', v => v.binaryPlanSha256 = '0'.repeat(64)],
    ['requestRef', v => v.requestedAt = 'invalid'], ['binaryPlanReceiptRef', v => v.actor = 'other'],
    ['beforeReadbackRef', v => v.projectPolicy.bindings.push({ role: 'roles/editor', members: ['user:x'] })],
    ['afterReadbackRef', v => v.secretPolicies[SECRET_VERSION_IAM_SECRETS[0]].bindings[1].condition = { expression: 'true' }],
    ['afterReadbackRef', v => v.observedAt = new Date(Date.now() + 600001).toISOString()],
  ]
  for (const [key, mutate] of mutations) {
    const h = await secretVersionIamHarness(); mutate(h.objects.get(h.proof[key].uri).value)
    const count = h.objects.size
    await assert.rejects(readSecretVersionIamContinuation(h.args), undefined, key)
    assert.equal(h.objects.size, count); assert.equal(h.calls.length, 0)
  }
  const h = await secretVersionIamHarness(); h.objects.get(h.proof.binaryPlanRef.uri).bytes = Buffer.from('changed binary')
  await assert.rejects(readSecretVersionIamContinuation(h.args))
  await assert.rejects(readSecretVersionIamContinuation({ ...h.args, sourceLockRef: { uri: 'gs://other/x', sha256: 'a'.repeat(64) } }))
})

const executeArgs = h => ({ inputRef: h.proof.inputRef, transport: h.transport, readSource: h.args.readSource, root: path.resolve('.'), oauthToken: 'FIXTURE_OAUTH_NOT_A_REAL_TOKEN', verifyActor: async () => ({ email: h.args.normalActor }), terraformRunner: () => { throw Error('TERRAFORM_FORBIDDEN_ON_REPLAY') } })
test('terminal replay verifies live provider policies without Terraform or new immutable writes', async () => {
  const h = await secretVersionIamHarness(), count = h.objects.size
  const row = await executeSecretVersionIamContinuation(executeArgs(h))
  assert.deepEqual(row.ref, h.proof.continuationRef); assert.equal(h.objects.size, count)
})

test('unknown apply request continues with provider readback only and never reapplies binary', async () => {
  const h = await secretVersionIamHarness()
  h.objects.delete(h.proof.continuationRef.uri)
  const row = await executeSecretVersionIamContinuation(executeArgs(h))
  assert.equal(row.value.mutation, 'READBACK_ONLY')
  assert.deepEqual(row.value.requestRef, h.proof.requestRef)
  assert.deepEqual(row.value.binaryPlanReceiptRef, h.proof.binaryPlanReceiptRef)
})

test('invalid or half-sealed request cannot trigger Terraform or receipt publication', async () => {
  for (const key of ['requestRef', 'binaryPlanReceiptRef']) {
    const h = await secretVersionIamHarness(); h.objects.delete(h.proof[key].uri)
    const count = h.objects.size
    await assert.rejects(executeSecretVersionIamContinuation(executeArgs(h)))
    assert.equal(h.objects.size, count); assert.equal(h.calls.length, 0)
  }
})

test('fresh finite executor applies only validated saved binary once and removes its task-owned Terraform directory, including unknown apply response', async () => {
  const { default: syncFs } = await import('node:fs')
  for (const unknown of [false, true]) {
    const h = await secretVersionIamHarness(), paths = []
    for (const key of ['continuationRef', 'requestRef', 'binaryPlanReceiptRef', 'beforeReadbackRef', 'afterReadbackRef', 'binaryPlanRef', 'terraformPlanRef']) h.objects.delete(h.proof[key].uri)
    const request = h.transport.request; let applied = false, applyCount = 0
    h.transport.request = async (url, options) => {
      if (!applied && url === 'https://iam.googleapis.com/v1/' + SECRET_VERSION_IAM_ROLE) throw Object.assign(Error('missing'), { code: 'MISSING' })
      if (!applied) for (const secret of SECRET_VERSION_IAM_SECRETS) if (url.includes(`/secrets/${secret}:getIamPolicy?`)) return clone(h.proof.before.secretPolicies[secret])
      return request(url, options)
    }
    const runner = (args, options) => {
      paths.push(options.cwd)
      assert.equal(options.env.GOOGLE_APPLICATION_CREDENTIALS, undefined)
      assert.ok(!args.some(arg => /target|backend-config|var|destroy/u.test(arg)))
      if (args[0] === 'plan') syncFs.writeFileSync(path.join(options.cwd, 'owned.tfplan'), 'SAVED_TEST_BINARY')
      if (args[0] === 'show') return { status: 0, stdout: JSON.stringify(secretVersionTerraformFixture()) }
      if (args[0] === 'apply') { applied = true; applyCount++; assert.equal(args.at(-1), 'owned.tfplan'); if (unknown) return { status: 1, stdout: '' } }
      return { status: 0, stdout: '{}' }
    }
    const row = await executeSecretVersionIamContinuation({ ...executeArgs(h), terraformRunner: runner })
    assert.equal(row.value.mutation, unknown ? 'UNKNOWN_APPLY_THEN_READBACK' : 'APPLY_THEN_READBACK')
    assert.equal(applyCount, 1)
    for (const dir of new Set(paths)) await assert.rejects(fs.stat(dir), { code: 'ENOENT' })
    await executeSecretVersionIamContinuation(executeArgs(h)); assert.equal(applyCount, 1)
  }
})


const nativeEtagPlan = async () => JSON.parse(await fs.readFile(new URL('../qa/dev-122/fixtures/secret-version-iam-native-etag-plan.json', import.meta.url), 'utf8'))
test('native retained Scheduler etag-only refresh admits the actual seven no-ops and five approved creates', async () => {
  const plan = await nativeEtagPlan()
  assert.equal(assertSecretVersionIamTerraformPlan(plan).length, 12)
  assert.equal(plan.resource_drift.length, 2)
  for (const drift of plan.resource_drift) {
    const retained = plan.resource_changes.find(row => row.address === drift.address)
    assert.deepEqual(retained.change.actions, ['no-op'])
    assert.deepEqual(drift.change.after, retained.change.before)
    assert.deepEqual(retained.change.before, retained.change.after)
  }
})
test('native retained etag exception rejects policy changes, unknowns and inconsistent no-op joins', async () => {
  const match = p => p.resource_changes.find(row => row.address === p.resource_drift[0].address)
  const mutations = [
    p => p.resource_drift.push(clone(p.resource_drift[0])),
    p => p.resource_drift[1] = clone(p.resource_drift[0]),
    p => p.resource_drift = {},
    p => p.resource_drift[0].address = 'google_project_iam_member.verifier_prebuild_list_readback',
    p => p.resource_drift[0].address = SECRET_VERSION_IAM_ADDRESSES[0],
    p => p.resource_drift[0].provider_name = 'foreign/provider',
    p => p.resource_drift[0].type = 'google_project_iam_binding',
    p => p.resource_drift[0].mode = 'data',
    p => p.resource_drift[0].change.actions = ['no-op'],
    p => p.resource_drift[0].change.importing = { id: 'foreign' },
    p => p.resource_drift[0].previous_address = 'moved',
    p => p.resource_drift[0].change.after_unknown = { etag: true },
    p => match(p).change.after_unknown = { member: true },
    p => match(p).provider_name = 'foreign/provider',
    p => match(p).type = 'google_project_iam_binding',
    p => match(p).mode = 'data',
    p => match(p).change.actions = ['update'],
    p => p.resource_drift[0].change.before.etag = '',
    p => p.resource_drift[0].change.after.etag = ' ',
    p => p.resource_drift[0].change.before.etag = p.resource_drift[0].change.after.etag,
    p => p.resource_drift[0].change.after.member = 'user:unapproved@example.invalid',
    p => p.resource_drift[0].change.after.role = 'roles/owner',
    p => p.resource_drift[0].change.after.project = 'another-project',
    p => p.resource_drift[0].change.after.condition = [{ expression: 'true' }],
    p => p.resource_drift[0].change.after.extra = 'unapproved',
    p => match(p).change.before.etag = 'other-known-etag',
    p => match(p).change.after.etag = 'other-known-etag',
  ]
  for (const mutate of mutations) {
    const plan = await nativeEtagPlan(); mutate(plan)
    assert.throws(() => assertSecretVersionIamTerraformPlan(plan))
  }
})
