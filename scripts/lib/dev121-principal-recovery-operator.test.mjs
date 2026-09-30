import assert from 'node:assert/strict'
import test from 'node:test'
import { recoveryBuildRequest, assertRecoveryBuildReadback,
  recoveryRevisionRequest, assertRecoveryRevisionReadback,
  recoveryProof, recoveryProofSha256 } from './dev121-principal-recovery-operator.mjs'

const sourceRevision = 'a'.repeat(40)
const oldRevision = 'ai-pdm-prod-oldrevision'
const imageDigest = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-recovery@sha256:${'b'.repeat(64)}`
const profile = { target: { projectId: 'jenfu-platform-prod', region: 'asia-east1',
  serviceName: 'ai-pdm-prod', runtimeServiceAccount: 'aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com' },
artifact: { releaseBucket: 'jenfu-platform-prod-aipdm-release' },
identities: { builder: 'aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' },
runtime: { containerName: 'ai-pdm' } }
const sourceObject = { ref: { uri: `gs://${profile.artifact.releaseBucket}/source/releases/DEV121-RECOVERY/${sourceRevision}/source.tar.gz`, sha256: 'c'.repeat(64) },
  metadata: { generation: '42' } }
const oldTraffic = { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: oldRevision, percent: 100 }
const before = { name: 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod',
  uid: 'd65f379b-a342-4eb3-ba22-109aa5f368c5', etag: 'etag-one',
  generation: '10', observedGeneration: '10', reconciling: false,
  terminalCondition: { state: 'CONDITION_SUCCEEDED' },
  scaling: { scalingMode: 'AUTOMATIC' },
  traffic: [oldTraffic], trafficStatuses: [oldTraffic] }

test('recovery build binds official source generation and a distinct static image', () => {
  const request = recoveryBuildRequest({ profile, sourceRevision, sourceObject })
  assert.deepEqual(request.source.storageSource, { bucket: profile.artifact.releaseBucket,
    object: `source/releases/DEV121-RECOVERY/${sourceRevision}/source.tar.gz`, generation: '42' })
  assert.equal(request.steps[0].dir, 'source')
  assert.equal(request.images[0], `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-recovery:dev121-recovery-${sourceRevision}`)
  const build = { status: 'SUCCESS', projectId: 'jenfu-platform-prod', serviceAccount: request.serviceAccount,
    options: { requestedVerifyOption: 'VERIFIED' },
    sourceProvenance: { resolvedStorageSource: { ...request.source.storageSource } },
    results: { images: [{ name: request.images[0], digest: `sha256:${'b'.repeat(64)}` }] } }
  assert.equal(assertRecoveryBuildReadback({ request, build, sourceRevision }), imageDigest)
  assert.throws(() => recoveryBuildRequest({ profile, sourceRevision,
    sourceObject: { ...sourceObject, ref: { ...sourceObject.ref, uri: sourceObject.ref.uri.replace(sourceRevision, 'd'.repeat(40)) } } }),
  /DEV121_RECOVERY_OPERATOR_BUILD_INPUT_INVALID/u)
  assert.throws(() => assertRecoveryBuildReadback({ request, build: {
    ...build, sourceProvenance: { resolvedStorageSource: { ...request.source.storageSource, generation: '43' } } }, sourceRevision }),
  /DEV121_RECOVERY_OPERATOR_BUILD_READBACK_INVALID/u)
})

test('recovery revision is isolated and keeps old traffic pinned at zero tag exposure', () => {
  const request = recoveryRevisionRequest({ profile, service: before,
    oldRevision, sourceRevision, imageDigest })
  assert.deepEqual(Object.keys(request).sort(), ['etag', 'name', 'template'])
  assert.equal(request.template.containers.length, 1)
  assert.equal(request.template.containers[0].image, imageDigest)
  assert.equal(request.template.containers[0].env, undefined)
  assert.equal(request.template.volumes, undefined)
  const after = { ...before, etag: 'etag-two', generation: '11', observedGeneration: '11',
    latestCreatedRevision: request.template.revision }
  const revision = { name: `${before.name}/revisions/${request.template.revision}`,
    serviceAccount: request.template.serviceAccount,
    conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }],
    containers: [{ name: 'ai-pdm', image: imageDigest,
      startupProbe: { httpGet: { path: '/login', port: 8080 } } }] }
  assert.equal(assertRecoveryRevisionReadback({ before, after, revision, request,
    imageDigest, oldRevision }), request.template.revision)
  for (const changed of [
    { after: { ...after, traffic: [{ ...oldTraffic, revision: request.template.revision }] } },
    { after: { ...after, uid: 'replacement-service' } },
    { after: { ...after, scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 } } },
    { revision: { ...revision, containers: [{ ...revision.containers[0], env: [{ name: 'SECRET', value: 'bad' }] }] } },
  ]) assert.throws(() => assertRecoveryRevisionReadback({ before, after,
    revision, request, imageDigest, oldRevision, ...changed }),
  /DEV121_RECOVERY_OPERATOR_REVISION_READBACK_INVALID/u)
  assert.throws(() => recoveryRevisionRequest({ profile,
    service: { ...before, traffic: [oldTraffic, { revision: 'tagged', tag: 'candidate', percent: 0 }] },
    oldRevision, sourceRevision, imageDigest }), /DEV121_RECOVERY_OPERATOR_REVISION_INPUT_INVALID/u)
})

test('immutable proof joins the only safe rollback revision to the service UID', () => {
  const proof = recoveryProof({ sourceRevision, serviceUid: before.uid, oldRevision,
    recoveryRevision: `ai-pdm-prod-recovery-${sourceRevision.slice(0, 12)}`, imageDigest })
  assert.equal(proof.status, 'PASS')
  assert.match(recoveryProofSha256(proof), /^[a-f0-9]{64}$/u)
  assert.throws(() => recoveryProof({ sourceRevision, serviceUid: before.uid,
    oldRevision, recoveryRevision: oldRevision, imageDigest }),
  /DEV121_RECOVERY_OPERATOR_PROOF_INPUT_INVALID/u)
})
