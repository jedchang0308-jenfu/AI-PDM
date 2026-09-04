import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  assertDev116R02Receipt,
  buildDev116R02Receipt,
  buildPlatformR107Link,
  canonicalize,
  sha256,
} from './lib/dev116-r02-receipt.mjs'

function observation() {
  return {
    releaseId: 'REL-116-20260904',
    observedAt: '2026-09-04T12:00:00.000Z',
    sourceLockSha256: 'a'.repeat(64),
    candidate: {
      sourceRevision: 'b'.repeat(40),
      imageDigest: `sha256:${'c'.repeat(64)}`,
      cloudRunRevision: 'ai-pdm-prod-gh-bbbbbbbb-12345678',
    },
    target: {
      projectId: 'jenfu-platform-prod', instance: 'jenfu-platform-prod-pg', database: 'jenfu_prod',
      region: 'asia-east1', environment: 'production-candidate', trafficPercent: 0,
      databaseIdentitySha256: 'd'.repeat(64),
    },
    actor: {
      subjectSha256: 'e'.repeat(64), role: 'Engineer',
      company: { id: 'company-smoke', code: 'SMOKE', kind: 'production_smoke' },
    },
    flow: {
      entryRoute: '/numbering/drawings', committedObjectIds: ['root-1', 'part-1', 'drawing-1'],
      committedCodes: ['A1000', 'A1000-P01', 'A1000-M01'],
    },
    readback: { api: 'PASS', browserReload: 'PASS', databaseCommit: 'PASS', reloadReadbackSha256: 'f'.repeat(64) },
    jenfuInvariant: { beforeSha256: '1'.repeat(64), afterSha256: '1'.repeat(64), zeroLeakCount: 0 },
    sideEffects: { gcsWriter: 'disabled', outboxConsumer: 'disabled', externalNotification: 'disabled' },
    result: 'PASS',
  }
}

test('builds a candidate-bound R02 receipt and the exact Platform R1-07 link', () => {
  const receipt = buildDev116R02Receipt(observation())
  assert.equal(receipt.claimLevel, 'production-candidate-level4')
  assert.equal(receipt.platformCaseId, 'QA-010-R1-07')
  assert.equal(receipt.pdmCaseId, 'QA-116-R02')
  const { evidenceSha256, ...core } = receipt
  assert.equal(evidenceSha256, sha256(canonicalize(core)))
  const link = buildPlatformR107Link(receipt)
  assert.equal(link.dev116ReceiptSha256, receipt.evidenceSha256)
  assert.deepEqual(link.dev116Receipt, receipt)
  assert.deepEqual(link.company, { id: 'company-smoke', code: 'SMOKE', kind: 'production_smoke' })
  assert.equal(link.jenfuInvariant.beforeSha256, link.jenfuInvariant.afterSha256)
})

test('Jenfu writes or a non-smoke actor cannot be certified as R02', () => {
  const changed = observation()
  changed.actor.company = { id: 'company-jenfu', code: 'JENFU', kind: 'business' }
  assert.throws(() => buildDev116R02Receipt(changed), /DEV116_R02_RECEIPT_INVALID/u)
  const leaked = observation()
  leaked.jenfuInvariant.afterSha256 = '2'.repeat(64)
  assert.throws(() => buildDev116R02Receipt(leaked), /DEV116_R02_RECEIPT_INVALID/u)
})

test('API-only, nonzero traffic, or enabled side effects cannot pass', () => {
  for (const mutate of [
    (input) => { input.readback.browserReload = 'NOT_RUN' },
    (input) => { input.target.trafficPercent = 1 },
    (input) => { input.sideEffects.outboxConsumer = 'enabled' },
  ]) {
    const changed = observation()
    mutate(changed)
    assert.throws(() => buildDev116R02Receipt(changed), /DEV116_R02_RECEIPT_INVALID/u)
  }
})

test('receipt tampering and credential-shaped content fail closed', () => {
  const receipt = buildDev116R02Receipt(observation())
  assert.throws(() => assertDev116R02Receipt({ ...receipt, result: 'FAIL' }), /DEV116_R02_RECEIPT_HASH_MISMATCH/u)
  const changed = observation()
  changed.flow.committedObjectIds[0] = 'person@example.com'
  assert.throws(() => buildDev116R02Receipt(changed), /DEV116_R02_RECEIPT_INVALID|DEV116_R02_RECEIPT_SENSITIVE_DATA/u)
})

test('receipt CLI has no production execution or promotion capability', () => {
  for (const flag of ['--execute', '--deploy', '--migrate', '--promote']) {
    const result = spawnSync(process.execPath, ['scripts/dev116-r02-receipt.mjs', flag], { encoding: 'utf8', windowsHide: true })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, new RegExp(`DEV116_R02_${flag.slice(2).toUpperCase()}_NOT_SUPPORTED`, 'u'))
  }
})
