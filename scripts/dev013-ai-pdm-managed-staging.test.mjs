import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  assertDev013AiPdmStagingProfile,
  assertInfraTerraformPlan,
  buildActivationPlan,
  buildOwnerReceipt,
  buildRevisionPlan,
  buildRollbackPlan,
  buildSecretPinningActivationPlan,
  buildSecretPinningPlan,
  buildTargetBootstrapReceipt,
  createInfraSourceFreeze,
  createSourceFreeze,
  hardJoinActivation,
  hardJoinRevision,
  hardJoinSecretPinningActivation,
  hardJoinSecretPinningRevision,
  sha256,
} from './lib/dev013-ai-pdm-managed-staging.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
const json = (relative) => JSON.parse(read(relative))
const directPlatformRoot = path.resolve(root, '../Jenfu-Platform')
const commonGitDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim()
const platformRoot = fs.existsSync(directPlatformRoot) ? directPlatformRoot : path.resolve(path.dirname(commonGitDir), '../Jenfu-Platform')
const profile = json('config/release/dev013-ai-pdm-managed-staging.json')
const platformManifest = JSON.parse(fs.readFileSync(path.join(platformRoot, 'config/dev-013/l3-managed-staging.json'), 'utf8'))
const contractLock = json('contracts/jenfu-sso-handoff/v1/contract-lock.json')
const sourceRevision = 'a'.repeat(40)
const sourceTree = 'b'.repeat(40)
const artifactDigest = `${profile.artifact.uri}@sha256:${'c'.repeat(64)}`
const targetOrigin = 'https://ai-pdm-stg-123456789012.asia-east1.run.app'
const brokerOrigin = 'https://jenfu-platform-stg-123456789012.asia-east1.run.app'

function environment(secretVersion = '1') {
  const entries = [
    ...Object.entries(profile.runtime.requiredDatabaseEnvironment).map(([name, value]) => ({ name, value })),
    ...profile.runtime.preservedPlainEnvironmentNames.map((name) => ({ name, value: `preserved-${name.toLowerCase()}` })),
    { name: 'PDM_JENFU_PLATFORM_AUTH_MODE', value: 'off' },
    { name: 'PDM_JENFU_SSO_HANDOFF_MODE', value: 'off' },
  ]
  for (const name of profile.runtime.secretEnvironmentNames) entries.push({ name, valueSource: { secretKeyRef: { secret: profile.boundaries.secretReferences[name], version: secretVersion } } })
  return entries
}

function targetService(secretVersion = '1') {
  return {
    name: `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`,
    uid: 'target-service-uid',
    uri: targetOrigin,
    etag: 'etag-before',
    labels: { ...profile.target.requiredLabels },
    ...profile.target.entryPolicy,
    deletionProtection: true,
    template: {
      revision: 'ai-pdm-stg-existing',
      serviceAccount: profile.target.runtimeServiceAccount,
      scaling: { minInstanceCount: 0, maxInstanceCount: 2 },
      maxInstanceRequestConcurrency: 20,
      vpcAccess: { networkInterfaces: [{ network: profile.runtime.network, subnetwork: profile.runtime.subnetwork }] },
      containers: [
        { name: profile.runtime.applicationContainer, image: 'asia-east1-docker.pkg.dev/jenfu-platform-nonprod/legacy/ai-pdm@sha256:' + 'd'.repeat(64), env: environment(secretVersion), startupProbe: { httpGet: { path: profile.runtime.startupProbePath } } },
        { name: profile.runtime.cloudSqlProxyContainer, image: profile.runtime.cloudSqlProxyImage, args: [profile.target.connectionName, '--auto-iam-authn', '--max-connections=2'], resources: { limits: { cpu: '1', memory: '512Mi' } }, startupProbe: { tcpSocket: { port: 5432 } } },
      ],
    },
    traffic: [{ revision: 'ai-pdm-stg-existing', percent: 100, tag: null, type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION' }],
    latestCreatedRevision: 'ai-pdm-stg-existing',
    latestReadyRevision: 'ai-pdm-stg-existing',
  }
}

function secretVersionReadbacks(version = '1') {
  return Object.fromEntries(Object.entries(profile.boundaries.secretReferences).map(([name, secretId]) => [name, { name: `projects/${profile.target.projectNumber}/secrets/${secretId}/versions/${version}`, state: 'ENABLED' }]))
}

function platformService() {
  return { name: `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.platformBroker.serviceName}`, uri: brokerOrigin, etag: 'platform-etag' }
}

function targetIdentity() {
  return { name: `projects/${profile.target.projectId}/serviceAccounts/${profile.target.runtimeServiceAccount}`, email: profile.target.runtimeServiceAccount, uniqueId: '123456789012345678901', disabled: false }
}

function freeze() {
  return createSourceFreeze({ profile, branch: 'codex/dev-013-ai-pdm', sourceRevision, sourceTree, clean: true, sourceIdentityBytes: Buffer.from('tracked-tree\0') , observedAt: '2026-09-17T00:00:00.000Z' })
}

function applyRevisionPlan(service, plan, etag) {
  return { ...structuredClone(service), etag, labels: structuredClone(plan.mutation.labels), template: structuredClone(plan.mutation.template), latestCreatedRevision: plan.mutation.template.revision, latestReadyRevision: plan.mutation.template.revision }
}

function applySecretPinPlan(service, plan, etag) {
  return applyRevisionPlan(service, plan, etag)
}

function expectCode(callback, code) {
  assert.throws(callback, (error) => error?.code === code)
}

test('profile is bound to the canonical Platform L3 manifest and excludes legacy staging', () => {
  assert.equal(assertDev013AiPdmStagingProfile(profile, platformManifest, contractLock), profile)
  assert.equal(profile.target.projectId, 'jenfu-platform-nonprod')
  assert.ok(profile.excludedTargets.projects.includes('jenfu-ai-pdm-stg-361825'))
})

test('source freeze rejects dirty or non-allowlisted input', () => {
  expectCode(() => createSourceFreeze({ profile, branch: 'codex/dev-013-ai-pdm', sourceRevision, sourceTree, clean: false, sourceIdentityBytes: Buffer.from('x') }), 'DEV013_AIPDM_SOURCE_NOT_FROZEN')
  expectCode(() => createSourceFreeze({ profile, branch: 'feature/untrusted', sourceRevision, sourceTree, clean: true, sourceIdentityBytes: Buffer.from('x') }), 'DEV013_AIPDM_SOURCE_NOT_FROZEN')
})

test('Infra A source freeze and plan gate require the complete eight-address create/read set', () => {
  const sourceFreeze = freeze()
  const foundationReceiptBytes = Buffer.from(`${JSON.stringify({ evidenceRef: { uri: 'gs://evidence/foundation.json' }, sha256: '0'.repeat(64) }, null, 2)}\n`)
  const infraFreeze = createInfraSourceFreeze({ profile, sourceFreeze, foundationReceiptBytes, observedAt: '2026-09-17T00:00:10.000Z' })
  assert.equal(infraFreeze.foundationReceipt.sha256, sha256(foundationReceiptBytes))
  assert.notEqual(infraFreeze.foundationReceipt.sha256, '0'.repeat(64))
  const values = {
    project_id: profile.target.projectId,
    region: profile.target.region,
    source_revision: sourceRevision,
    source_tree: sourceTree,
    platform_manifest_sha256: profile.authorities.platformManifestSha256,
    canonical_contract_sha256: profile.authorities.handoffContractSha256,
    foundation_manifest_sha256: infraFreeze.foundationReceipt.sha256,
  }
  const after = {
    'data.google_project.target': { project_id: profile.target.projectId },
    'data.google_service_account.iac': { project: profile.target.projectId, account_id: profile.terraform.iacServiceAccount.split('@')[0], email: profile.terraform.iacServiceAccount },
    'data.google_service_account.qc': { project: profile.target.projectId, account_id: profile.terraform.qcServiceAccount.split('@')[0], email: profile.terraform.qcServiceAccount },
    'google_artifact_registry_repository.ai_pdm': { project: profile.target.projectId, location: profile.target.region, repository_id: profile.artifact.repository, format: 'DOCKER', description: 'DEV-013 AI-PDM managed staging immutable runtime images', labels: profile.target.requiredLabels },
    'google_artifact_registry_repository_iam_member.iac_writer': { project: profile.target.projectId, location: profile.target.region, repository: profile.artifact.repository, role: 'roles/artifactregistry.writer', member: `serviceAccount:${profile.terraform.iacServiceAccount}` },
    'google_storage_bucket.evidence': { project: profile.target.projectId, name: profile.evidence.bucket, location: profile.target.region, storage_class: 'STANDARD', uniform_bucket_level_access: true, public_access_prevention: 'enforced', force_destroy: false, labels: profile.target.requiredLabels, retention_policy: [{ is_locked: false, retention_period: 2592000 }] },
    'google_storage_bucket_iam_member.iac_writer': { bucket: profile.evidence.bucket, role: 'roles/storage.objectCreator', member: `serviceAccount:${profile.terraform.iacServiceAccount}` },
    'google_storage_bucket_iam_member.qc_reader': { bucket: profile.evidence.bucket, role: 'roles/storage.objectViewer', member: `serviceAccount:${profile.terraform.qcServiceAccount}` },
  }
  const plan = {
    variables: Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value }])),
    resource_changes: [
      ...profile.terraform.dataAddresses.map((address) => ({ address, change: { actions: ['read'], after: after[address] } })),
      ...profile.terraform.resourceAddresses.map((address) => ({ address, change: { actions: ['create'], after: after[address] } })),
    ],
  }
  assert.deepEqual(assertInfraTerraformPlan(plan, infraFreeze, profile), { status: 'PASS', stage: 'OWNER_INFRA_A', sourceRevision, addressCount: 8, releaseAuthority: false })
  const incomplete = structuredClone(plan)
  incomplete.resource_changes.pop()
  expectCode(() => assertInfraTerraformPlan(incomplete, infraFreeze, profile), 'DEV013_AIPDM_INFRA_PLAN_ADDRESS_SET_MISMATCH')
  const update = structuredClone(plan)
  update.resource_changes.at(-1).change.actions = ['update']
  expectCode(() => assertInfraTerraformPlan(update, infraFreeze, profile), 'DEV013_AIPDM_INFRA_PLAN_ACTION_DENIED')
  const wrongBucket = structuredClone(plan)
  wrongBucket.resource_changes.find((change) => change.address === 'google_storage_bucket.evidence').change.after.name = 'wrong-bucket'
  expectCode(() => assertInfraTerraformPlan(wrongBucket, infraFreeze, profile), 'DEV013_AIPDM_INFRA_PLAN_OBJECT_INVALID')
  const tamperedFoundationBytes = Buffer.concat([foundationReceiptBytes, Buffer.from(' ')])
  const tamperedFreeze = createInfraSourceFreeze({ profile, sourceFreeze, foundationReceiptBytes: tamperedFoundationBytes })
  assert.notEqual(tamperedFreeze.foundationReceipt.sha256, infraFreeze.foundationReceipt.sha256)
  expectCode(() => assertInfraTerraformPlan(plan, tamperedFreeze, profile), 'DEV013_AIPDM_INFRA_PLAN_VARIABLE_MISMATCH')
  const terraform = ['versions.tf', 'variables.tf', 'locals.tf', 'main.tf', 'outputs.tf'].map((name) => read(`${profile.terraform.root}/${name}`)).join('\n')
  for (const forbidden of ['google_cloud_run_v2_service', 'google_cloud_run_v2_job', 'google_secret_manager_secret_version', 'ai-pdm-prod', 'jenfu-ai-pdm-stg-361825']) assert.doesNotMatch(terraform, new RegExp(forbidden, 'u'))
})

test('latest aliases require enabled metadata readback and a numeric-pinned revision before bootstrap', () => {
  const initial = targetService('latest')
  const identity = targetIdentity()
  expectCode(() => buildTargetBootstrapReceipt({ profile, targetService: initial, targetIdentity: identity, secretVersionReadbacks: secretVersionReadbacks() }), 'DEV013_AIPDM_SECRET_VERSION_READBACK_INVALID')
  expectCode(() => buildRevisionPlan({ profile, sourceFreeze: freeze(), platformService: platformService(), targetService: initial, targetIdentity: identity, artifactDigest, mode: 'off' }), 'DEV013_AIPDM_SECRET_REFERENCE_INVALID')
  expectCode(() => buildSecretPinningPlan({ profile, targetService: initial, targetIdentity: identity, secretVersionReadbacks: Object.fromEntries(Object.entries(secretVersionReadbacks()).map(([name, value]) => [name, { ...value, state: 'DISABLED' }])) }), 'DEV013_AIPDM_SECRET_VERSION_READBACK_INVALID')
  const wrongProjectReadbacks = Object.fromEntries(Object.entries(secretVersionReadbacks()).map(([name, value]) => [name, { ...value, name: value.name.replace(profile.target.projectNumber, '9999999999999') }]))
  expectCode(() => buildSecretPinningPlan({ profile, targetService: initial, targetIdentity: identity, secretVersionReadbacks: wrongProjectReadbacks }), 'DEV013_AIPDM_SECRET_VERSION_READBACK_INVALID')
  const pin = buildSecretPinningPlan({ profile, targetService: initial, targetIdentity: identity, secretVersionReadbacks: secretVersionReadbacks(), observedAt: '2026-09-17T00:00:20.000Z' })
  const pinnedRefs = Object.fromEntries(pin.mutation.template.containers[0].env.filter((entry) => entry.valueSource).map((entry) => [entry.name, entry.valueSource.secretKeyRef]))
  for (const [name, ref] of Object.entries(pinnedRefs)) assert.deepEqual(ref, { secret: profile.boundaries.secretReferences[name], version: '1' })
  const candidateService = applySecretPinPlan(initial, pin, 'etag-pin')
  const candidate = hardJoinSecretPinningRevision({ profile, plan: pin, targetService: candidateService, targetIdentity: identity })
  const activation = buildSecretPinningActivationPlan({ profile, secretPinningRevision: candidate, currentService: candidateService })
  const activeService = { ...structuredClone(candidateService), etag: 'etag-pin-active', traffic: structuredClone(activation.mutation.traffic) }
  const active = hardJoinSecretPinningActivation({ profile, activationPlan: activation, targetService: activeService, targetIdentity: identity })
  assert.equal(active.status, 'NUMERIC_SECRET_REVISION_ACTIVE')
  const bootstrap = buildTargetBootstrapReceipt({ profile, targetService: activeService, targetIdentity: identity, secretVersionReadbacks: secretVersionReadbacks() })
  assert.equal(bootstrap.schemaVersion, 'jenfu.dev013.l3-target-bootstrap-receipt.v2')
  assert.deepEqual(bootstrap.boundaries.secretReferences, active.secretReferences)
})

test('target bootstrap receipt proves only the exact off-mode provider target', async () => {
  const bootstrap = buildTargetBootstrapReceipt({ profile, targetService: targetService(), targetIdentity: targetIdentity(), secretVersionReadbacks: secretVersionReadbacks(), observedAt: '2026-09-17T00:00:30.000Z' })
  assert.equal(bootstrap.status, 'TARGET_BOOTSTRAP_READY')
  assert.equal(bootstrap.runtime.ssoHandoffMode, 'off')
  const validatorPath = path.join(platformRoot, 'scripts/lib/dev013-l3-contract.mjs')
  const { assertTargetBootstrapReceipt } = await import(pathToFileURL(validatorPath))
  assert.equal(assertTargetBootstrapReceipt(bootstrap, 'ai-pdm', platformManifest), bootstrap)
  const enabled = targetService()
  enabled.template.containers[0].env.find((entry) => entry.name === 'PDM_JENFU_SSO_HANDOFF_MODE').value = 'on'
  assert.throws(() => buildTargetBootstrapReceipt({ profile, targetService: enabled, targetIdentity: targetIdentity(), secretVersionReadbacks: secretVersionReadbacks() }), /DEV013_AIPDM_TARGET_BOOTSTRAP_INVALID/u)
})

test('off/on publication, exact hard joins, activation and rollback remain owner-scoped', () => {
  const sourceFreeze = freeze()
  const initial = targetService()
  const identity = targetIdentity()
  const broker = platformService()

  const offPlan = buildRevisionPlan({ profile, sourceFreeze, platformService: broker, targetService: initial, targetIdentity: identity, artifactDigest, mode: 'off', observedAt: '2026-09-17T00:01:00.000Z' })
  assert.equal(offPlan.mutation.updateMask, 'labels,template')
  assert.equal(offPlan.mutation.trafficChanges, 0)
  assert.equal(offPlan.mutation.etag, 'etag-before')
  assert.equal(offPlan.callback, `${targetOrigin}${profile.target.callbackPath}`)
  const offEnv = Object.fromEntries(offPlan.mutation.template.containers[0].env.filter((item) => 'value' in item).map((item) => [item.name, item.value]))
  assert.equal(offEnv.PDM_JENFU_SSO_HANDOFF_MODE, 'off')
  assert.equal(offEnv.PDM_JENFU_PLATFORM_AUTH_MODE, 'on')
  assert.equal(offEnv.PDM_JENFU_SSO_BROKER_ORIGIN, brokerOrigin)
  assert.equal(offEnv.PDM_PUBLIC_BASE_URL, targetOrigin)

  const afterOff = applyRevisionPlan(initial, offPlan, 'etag-off')
  const floor = hardJoinRevision({ profile, plan: offPlan, platformService: broker, targetService: afterOff, targetIdentity: identity, observedAt: '2026-09-17T00:02:00.000Z' })
  assert.equal(floor.status, 'SECURITY_FLOOR_READY')

  const onPlan = buildRevisionPlan({ profile, sourceFreeze, platformService: broker, targetService: afterOff, targetIdentity: identity, artifactDigest, mode: 'on', rollbackFloor: floor, observedAt: '2026-09-17T00:03:00.000Z' })
  const afterOn = applyRevisionPlan(afterOff, onPlan, 'etag-on')
  const enabledRevision = hardJoinRevision({ profile, plan: onPlan, platformService: broker, targetService: afterOn, targetIdentity: identity, observedAt: '2026-09-17T00:04:00.000Z' })
  assert.equal(enabledRevision.status, 'ENABLED_REVISION_READY')

  const activation = buildActivationPlan({ profile, enabledRevisionReceipt: enabledRevision, currentService: afterOn, observedAt: '2026-09-17T00:05:00.000Z' })
  assert.deepEqual(activation.mutation.traffic, [{ revision: enabledRevision.revision, percent: 100, tag: null }])
  assert.equal(activation.mutation.templateChanges, 0)
  const activeService = { ...structuredClone(afterOn), etag: 'etag-active', traffic: structuredClone(activation.mutation.traffic) }
  const active = hardJoinActivation({ profile, activationPlan: activation, platformService: broker, targetService: activeService, targetIdentity: identity, observedAt: '2026-09-17T00:06:00.000Z' })
  assert.equal(active.status, 'OWNER_READY_FOR_L3_BROWSER')
  const notReady = { ...structuredClone(activeService), latestReadyRevision: floor.revision }
  assert.throws(() => hardJoinActivation({ profile, activationPlan: activation, platformService: broker, targetService: notReady, targetIdentity: identity }), /DEV013_AIPDM_ACTIVE_HARD_JOIN_INVALID/u)

  const ownerReceipt = buildOwnerReceipt({ profile, enabledReceipt: active, observedAt: '2026-09-17T00:07:00.000Z' })
  assert.equal(ownerReceipt.target.runtimeServiceAccount.uniqueId, identity.uniqueId)
  assert.equal(ownerReceipt.hardJoin.existingStateSha256, offPlan.before.stateSha256)
  assert.equal(ownerReceipt.rollback.status, 'READY')

  const rollback = buildRollbackPlan({ profile, enabledReceipt: active, rollbackFloor: floor, currentService: activeService, observedAt: '2026-09-17T00:08:00.000Z' })
  assert.equal(rollback.mutation.updateMask, 'traffic')
  assert.equal(rollback.mutation.templateChanges, 0)
  assert.equal(rollback.mutation.traffic[0].revision, floor.revision)
  assert.equal(rollback.artifactDigest, artifactDigest)
  assert.equal(rollback.sourceRevision, sourceRevision)
})

test('hard join fails closed on provider identity, origin, callback, digest, source, mode or existing-state drift', () => {
  const sourceFreeze = freeze()
  const initial = targetService()
  const identity = targetIdentity()
  const broker = platformService()
  const plan = buildRevisionPlan({ profile, sourceFreeze, platformService: broker, targetService: initial, targetIdentity: identity, artifactDigest, mode: 'off' })
  const applied = applyRevisionPlan(initial, plan, 'etag-off')
  const mutations = [
    (value) => { value.template.serviceAccount = 'other@jenfu-platform-nonprod.iam.gserviceaccount.com' },
    (value) => { value.uri = 'https://ai-pdm-stg-999999999999.asia-east1.run.app' },
    (value) => { value.template.containers[0].image = profile.artifact.uri + '@sha256:' + 'e'.repeat(64) },
    (value) => { value.template.containers[0].env.find((entry) => entry.name === 'DEV013_L3_SOURCE_REVISION').value = 'f'.repeat(40) },
    (value) => { value.template.containers[0].env.find((entry) => entry.name === 'PDM_JENFU_SSO_HANDOFF_MODE').value = 'on' },
    (value) => { value.template.vpcAccess.networkInterfaces[0].subnetwork = 'wrong-subnetwork' },
  ]
  for (const mutate of mutations) {
    const drifted = structuredClone(applied)
    mutate(drifted)
    assert.throws(() => hardJoinRevision({ profile, plan, platformService: broker, targetService: drifted, targetIdentity: identity }))
  }
  const wrongIdentity = { ...identity, uniqueId: '999999999999999999999' }
  assert.throws(() => hardJoinRevision({ profile, plan, platformService: broker, targetService: applied, targetIdentity: wrongIdentity }))
})

test('rollback rejects a pre-DEV-013 or different-build floor', () => {
  const sourceFreeze = freeze()
  const initial = targetService()
  const identity = targetIdentity()
  const broker = platformService()
  const offPlan = buildRevisionPlan({ profile, sourceFreeze, platformService: broker, targetService: initial, targetIdentity: identity, artifactDigest, mode: 'off' })
  const floor = hardJoinRevision({ profile, plan: offPlan, platformService: broker, targetService: applyRevisionPlan(initial, offPlan, 'etag-off'), targetIdentity: identity })
  const tampered = { ...floor, artifactDigest: profile.artifact.uri + '@sha256:' + '9'.repeat(64) }
  expectCode(() => buildRevisionPlan({ profile, sourceFreeze, platformService: broker, targetService: applyRevisionPlan(initial, offPlan, 'etag-off'), targetIdentity: identity, artifactDigest, mode: 'on', rollbackFloor: tampered }), 'DEV013_AIPDM_ROLLBACK_FLOOR_INVALID')
})

test('owner receipt is accepted by the canonical Platform L3 validator', async () => {
  const sourceFreeze = freeze()
  const identity = targetIdentity()
  const broker = platformService()
  const initial = targetService()
  const offPlan = buildRevisionPlan({ profile, sourceFreeze, platformService: broker, targetService: initial, targetIdentity: identity, artifactDigest, mode: 'off' })
  const afterOff = applyRevisionPlan(initial, offPlan, 'etag-off')
  const floor = hardJoinRevision({ profile, plan: offPlan, platformService: broker, targetService: afterOff, targetIdentity: identity })
  const onPlan = buildRevisionPlan({ profile, sourceFreeze, platformService: broker, targetService: afterOff, targetIdentity: identity, artifactDigest, mode: 'on', rollbackFloor: floor })
  const afterOn = applyRevisionPlan(afterOff, onPlan, 'etag-on')
  const enabledRevision = hardJoinRevision({ profile, plan: onPlan, platformService: broker, targetService: afterOn, targetIdentity: identity })
  const activation = buildActivationPlan({ profile, enabledRevisionReceipt: enabledRevision, currentService: afterOn })
  const activeService = { ...structuredClone(afterOn), etag: 'etag-active', traffic: structuredClone(activation.mutation.traffic) }
  const active = hardJoinActivation({ profile, activationPlan: activation, platformService: broker, targetService: activeService, targetIdentity: identity })
  const ownerReceipt = buildOwnerReceipt({ profile, enabledReceipt: active })
  const validatorPath = path.join(platformRoot, 'scripts/lib/dev013-l3-contract.mjs')
  const { assertOwnerReceipt } = await import(pathToFileURL(validatorPath))
  assert.equal(assertOwnerReceipt(ownerReceipt, 'ai-pdm', platformManifest), ownerReceipt)
})

test('existing direct/Firebase login, handoff, permission, logout and startup guards remain present', () => {
  const identityContract = read('src/lib/jenfu-platform-identity-contract.ts')
  const handoff = read('src/lib/jenfu-sso-handoff.ts')
  const login = read('src/app/login/page.tsx')
  const start = read('src/app/api/auth/jenfu-sso/start/route.ts')
  const callback = read('src/app/api/auth/jenfu-sso/callback/route.ts')
  const permission = read('src/app/api/approvals/requests/[requestId]/decisions/route.ts')
  const logout = read('src/app/api/auth/logout/route.ts')
  const readiness = read('src/app/api/health/ready/route.ts')
  assert.match(identityContract, /checkRevoked: true/)
  assert.match(handoff, /readPrincipalAuthState/)
  assert.match(handoff, /state[.]revokedBefore/)
  assert.match(handoff, /authTime: Math[.]floor\(Date[.]parse\(handoff[.]authentication[.]authenticatedAt\)/)
  assert.match(handoff, /assuranceLevel: assurance[.]assuranceLevel/)
  assert.match(login, /firebase_bff/)
  assert.match(login, /api\/auth\/jenfu-sso\/start/)
  assert.match(start, /jenfuSsoStart/)
  assert.match(callback, /jenfuSsoCallback/)
  assert.match(permission, /requirePdmRouteAuthorizationAsync/)
  assert.match(permission, /permissionCode/)
  assert.match(logout, /revokeAccountSessionBySessionIdAsync/)
  assert.match(logout, /createLogoutCookie/)
  assert.match(readiness, /verifyAsyncDatabaseReadiness/)
  assert.match(readiness, /status: "ready"/)
})
