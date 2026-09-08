import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { assertControllerConfig, assertControlHead, assertMutationRequest, assertReleaseCapsule, normalizeInboundEvent, parseEnvelope, processIncident } from './server.mjs'

const H = 'a'.repeat(64)
const config = {
  ownerApplicationId: 'ai-pdm', projectId: 'jenfu-platform-prod', region: 'asia-east1',
  service: 'ai-pdm-prod', repository: 'jedchang0308-jenfu/AI-PDM',
  audience: 'https://release-controller.jenfu.internal/aipdm',
  invokerServiceAccount: 'aipdm-prod-release-invoker@jenfu-platform-prod.iam.gserviceaccount.com',
  controlBucket: 'jenfu-platform-prod-aipdm-release',
}
const canonicalize = (value) => Array.isArray(value) ? '[' + value.map(canonicalize).join(',') + ']' : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}' : JSON.stringify(value)
const signedHead = (overrides = {}) => {
  const core = {
    schemaVersion: 'jenfu.dev012.owner-control-head.v1', inputFingerprint: H,
    ownerApplicationId: config.ownerApplicationId, service: config.service, controlBucket: config.controlBucket,
    releaseId: 'REL-AIPDM-001', sourceRevision: 'b'.repeat(40), sourceLockSha256: H,
    candidateRevision: 'ai-pdm-prod-candidate-1', previousRevision: 'ai-pdm-prod-previous-1',
    ownerRunRef: 'https://api.github.com/repos/jedchang0308-jenfu/AI-PDM/actions/runs/123',
    leaseExpiresAt: '2026-09-07T23:59:00.000Z', deadlineAt: '2026-09-08T00:15:00.000Z',
    state: 'ACTIVE', result: null, ...overrides,
  }
  return { ...core, controlSha256: createHash('sha256').update(canonicalize(core)).digest('hex'), generation: '1' }
}
const event = { correlationId: 'corr-1', ownerApplicationId: 'ai-pdm', sourceLockSha256: H, eventRef: { uri: 'gs://jenfu-platform-prod-aipdm-release/receipts/event.json', sha256: H }, occurredAt: '2026-09-08T00:00:00.000Z' }

function harness(serviceOverrides = {}, providerOverrides = {}) {
  let head = signedHead()
  const receipts = new Map()
  let patches = 0
  let service = { effectiveRevision: head.candidateRevision, trafficPercent: 100, etag: 'etag-1', reconciling: false, ...serviceOverrides }
  const store = {
    async readHead() { return { ...head } },
    async readReceipt(id) { return receipts.get(id) ?? null },
    async compareAndSet(next, generation) {
      assert.equal(String(generation), String(head.generation))
      head = { ...next, generation: String(Number(generation) + 1) }
      return { ...head }
    },
    async publishReceipt(id, receipt) { if (!receipts.has(id)) receipts.set(id, receipt) },
  }
  const provider = {
    async readOwnerRun() { return { status: 'STOPPED' } },
    async getService() { return { ...service } },
    async rollbackTraffic(input) { patches += 1; service = { ...service, effectiveRevision: input.revision, trafficPercent: 100, etag: 'etag-2', reconciling: false }; return { name: 'operations/1' } },
    async waitOperation() { return { done: true } },
    ...providerOverrides,
  }
  return { store, provider, receipts, patches: () => patches, head: () => head }
}

test('S1B-13 single-capsule input and immutable control head', () => {
  assertReleaseCapsule({ releaseCapsuleRef: 'gs://jenfu-platform-prod-aipdm-release/receipts/release.json#sha256=' + H })
  assertControllerConfig(config)
  assertControlHead(signedHead(), config)
  assert.throws(() => assertControlHead({ ...signedHead(), sourceRevision: 'c'.repeat(40) }, config), /integrity mismatch/i)
})
test('S1B-14 event parser and controller owner boundary', () => {
  assert.deepEqual(parseEnvelope(Buffer.from(JSON.stringify(event))), event)
  assert.throws(() => assertControllerConfig({ ...config, service: 'orgmaster-prod' }), /mismatch/i)
  assert.throws(() => parseEnvelope(Buffer.alloc(65537)), /64KiB/)
})

test('S1B-15 candidate and activation masks', () => {
  assertMutationRequest({ service: config.service, etag: 'e', updateMask: 'template', revision: 'c', trafficPercent: 0 }, 'CREATE_CANDIDATE')
  assertMutationRequest({ service: config.service, etag: 'e', updateMask: 'traffic', revision: 'c', trafficPercent: 100 }, 'ACTIVATE')
  assert.throws(() => assertMutationRequest({ service: config.service, etag: 'e', updateMask: 'template,traffic', revision: 'c', trafficPercent: 100 }, 'ACTIVATE'), /traffic-only/)
})

test('S1B-16 immediate incident starts inside 120 seconds and verifies rollback', async () => {
  const h = harness()
  const receipt = await processIncident({ path: '/events', event, config, store: h.store, provider: h.provider, now: () => new Date('2026-09-08T00:01:30.000Z') })
  assert.equal(receipt.result, 'ROLLBACK_VERIFIED')
  assert.equal(h.patches(), 1)
  assert.match(receipt.deliveryRef.uri, /^gs:\/\//u)
  assert.ok(Date.parse(receipt.actionStartedAt) - Date.parse(receipt.occurredAt) <= 120000)
  assert.equal(h.head().state, 'FINALIZED')
})

test('S1B-17 watchdog normalizes scheduler body, fences stopped owner and is idempotent', async () => {
  const h = harness()
  const normalized = normalizeInboundEvent({ path: '/watchdog', buffer: Buffer.from('{"ownerApplicationId":"ai-pdm"}'), config, head: signedHead(), now: () => new Date('2026-09-08T00:01:00.000Z') })
  const first = await processIncident({ path: '/watchdog', event: normalized, config, store: h.store, provider: h.provider, now: () => new Date('2026-09-08T00:01:00.000Z') })
  const second = await processIncident({ path: '/watchdog', event: normalized, config, store: h.store, provider: h.provider, now: () => new Date('2026-09-08T00:01:01.000Z') })
  assert.equal(first.result, 'ROLLBACK_VERIFIED')
  assert.equal(second.result, 'ROLLBACK_VERIFIED')
  assert.equal(h.patches(), 1)
  const live = harness({}, { async readOwnerRun() { return { status: 'RUNNING' } } })
  assert.equal((await processIncident({ path: '/watchdog', event: normalized, config, store: live.store, provider: live.provider, now: () => new Date('2026-09-08T00:01:00.000Z') })).result, 'OUTCOME_UNKNOWN')
})

test('S1B-18 monitoring envelope and scoped readback are fail closed', async () => {
  const normalized = normalizeInboundEvent({ path: '/events', buffer: Buffer.from(JSON.stringify({ incident: { incident_id: 'abc/1', state: 'open', started_at: 1788825600 } })), config, head: signedHead(), now: () => new Date('2026-09-08T00:00:00.000Z') })
  assert.equal(normalized.ownerApplicationId, 'ai-pdm')
  assert.match(normalized.eventRef.uri, /^monitoring:\/\//u)
  const h = harness({ effectiveRevision: 'ai-pdm-prod-previous-1', trafficPercent: 100 })
  const receipt = await processIncident({ path: '/events', event, config, store: h.store, provider: h.provider, now: () => new Date('2026-09-08T00:00:30.000Z') })
  assert.equal(receipt.result, 'ROLLBACK_VERIFIED')
  assert.equal(h.patches(), 0)
  await assert.rejects(() => processIncident({ path: '/events', event: { ...event, sourceLockSha256: 'c'.repeat(64) }, config, store: h.store, provider: h.provider, now: () => new Date('2026-09-08T00:00:30.000Z') }), /owner control head/)
})
