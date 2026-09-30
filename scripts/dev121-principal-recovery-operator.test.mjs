import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { executeRecoveryOperation } from './dev121-principal-recovery-operator.mjs'

const sourceRevision = 'a'.repeat(40)
const oldRevision = 'ai-pdm-prod-oldrevision'
const digest = 'b'.repeat(64)
const imageDigest = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-recovery@sha256:${digest}`
const bucket = 'jenfu-platform-prod-aipdm-release'
const profile = { target: { projectId: 'jenfu-platform-prod', region: 'asia-east1',
  serviceName: 'ai-pdm-prod', runtimeServiceAccount: 'aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com' },
artifact: { releaseBucket: bucket },
identities: { builder: 'aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' },
runtime: { containerName: 'ai-pdm' }, build: { maximumAllowedSeverity: 'MEDIUM' } }
const sourceProof = { schemaVersion: 'jenfu.dev012.official-merged-source.v1',
  repository: 'jedchang0308-jenfu/AI-PDM', branch: 'main', sourceRevision,
  sourceTree: 'c'.repeat(40), reviewMode: 'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED',
  pullRequestNumber: 158, requiredChecks: ['DEV-012 Isolated PostgreSQL Cutover', 'Production Slice QC'],
  branchProtected: true, rulesetId: 24077878,
  status: 'OFFICIAL_MERGED_PR_VERIFIED' }
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

function harness() {
  const oldTraffic = { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: oldRevision, percent: 100 }
  let service = { name: 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod',
    uid: 'd65f379b-a342-4eb3-ba22-109aa5f368c5', etag: 'etag-one',
    generation: '10', observedGeneration: '10', reconciling: false,
    terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    scaling: { scalingMode: 'AUTOMATIC' },
    ingress: 'INGRESS_TRAFFIC_ALL', invokerIamDisabled: true,
    defaultUriDisabled: false, traffic: [oldTraffic], trafficStatuses: [oldTraffic] }
  const calls = []
  let receipt = null
  let buildRequest = null
  let revisionRequest = null
  const transport = {
    async readBytes() {
      if (receipt) return receipt
      const error = new Error('missing'); error.code = 'MISSING'; throw error
    },
    async getService() { return structuredClone(service) },
    effectiveRevision(value) { return value.trafficStatuses.find((row) => Number(row.percent) === 100).revision },
    async putBytes(uri, bytes) {
      assert.match(uri, /source\/releases\/DEV121-RECOVERY/u)
      calls.push('source')
      return { ref: { uri, sha256: hash(bytes) }, metadata: { generation: '42' } }
    },
    async request(url, options) {
      if (url.includes('cloudbuild.googleapis.com')) {
        assert.equal(options.method, 'POST')
        buildRequest = JSON.parse(options.body)
        calls.push('build')
        return { name: 'operations/build-one' }
      }
      assert.match(url, /artifactregistry.googleapis.com/u)
      calls.push('artifact')
      return { dockerImages: [{ uri: imageDigest }] }
    },
    async waitBuild() {
      return { status: 'SUCCESS', projectId: 'jenfu-platform-prod',
        serviceAccount: buildRequest.serviceAccount,
        options: { requestedVerifyOption: 'VERIFIED' },
        sourceProvenance: { resolvedStorageSource: { ...buildRequest.source.storageSource } },
        results: { images: [{ name: buildRequest.images[0], digest: `sha256:${digest}` }] } }
    },
    async waitArtifactEvidence() { calls.push('scan'); return { status: 'PASS' } },
    async patchService(_profile, request, mask) {
      assert.equal(mask, 'template')
      assert.equal(service.traffic[0].revision, oldRevision)
      revisionRequest = request
      calls.push('revision')
      service = { ...service, etag: 'etag-two', generation: '11', observedGeneration: '11',
        latestCreatedRevision: request.template.revision }
      return { response: structuredClone(service) }
    },
    async getRevision(_profile, name) {
      assert.equal(name, revisionRequest.template.revision)
      return { name: `${service.name}/revisions/${name}`,
        serviceAccount: revisionRequest.template.serviceAccount,
        conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }],
        containers: [{ name: 'ai-pdm', image: imageDigest,
          startupProbe: { httpGet: { path: '/login', port: 8080 } } }] }
    },
    async putJson(uri, proof) {
      calls.push('receipt')
      const bytes = Buffer.from(`${JSON.stringify(proof)}\n`)
      receipt = { bytes, ref: { uri, sha256: hash(bytes) }, metadata: { generation: '43' } }
      return receipt
    },
  }
  return { transport, calls, service: () => service }
}

test('owner recovery operator builds once, creates only an untagged revision, and reuses the immutable proof', async () => {
  const h = harness()
  const input = { profile, sourceRevision, archive: Buffer.from('official-source-archive'),
    sourceProof, transport: h.transport }
  const first = await executeRecoveryOperation(input)
  assert.equal(first.status, 'PASS')
  assert.equal(first.imageDigest, imageDigest)
  assert.deepEqual(h.calls, ['source', 'build', 'artifact', 'scan', 'revision', 'receipt'])
  assert.equal(h.service().traffic[0].revision, oldRevision)
  assert.equal(h.service().trafficStatuses.some((row) => row.tag), false)
  const second = await executeRecoveryOperation(input)
  assert.equal(second.status, 'REUSED_PASS')
  assert.deepEqual(h.calls, ['source', 'build', 'artifact', 'scan', 'revision', 'receipt'])
})

test('owner recovery operator refuses a non-official source before a provider mutation', async () => {
  const h = harness()
  await assert.rejects(executeRecoveryOperation({ profile, sourceRevision,
    archive: Buffer.from('source'), sourceProof: { ...sourceProof, branchProtected: false },
    transport: h.transport }), /DEV121_RECOVERY_OPERATOR_SOURCE_INVALID/u)
  assert.deepEqual(h.calls, [])
})
