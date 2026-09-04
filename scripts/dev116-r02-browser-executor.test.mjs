import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { buildDev116R02Receipt } from './lib/dev116-r02-receipt.mjs'
import {
  DEV116_R02_BROWSER_ACKNOWLEDGEMENT,
  assertDev010R1PreflightForR02,
  assertPreflightMatchesCandidate,
  buildDev116R02BrowserObservation,
  buildDev116R02CandidateContext,
  buildDev116R02ProviderObservation,
  joinDev116R02Evidence,
  parseDev116R02BrowserArgs,
  readDev116R02Credentials,
} from './lib/dev116-r02-browser-executor.mjs'
import { canonicalize, sha256 } from './lib/dev116-r02-receipt.mjs'

const h = (character) => character.repeat(64)

function candidateContext() {
  return buildDev116R02CandidateContext({
    releaseId: 'REL-116-20260904',
    observedAt: '2026-09-05T01:02:03.000Z',
    sourceLockSha256: h('a'),
    candidate: {
      baseUrl: 'https://candidate---ai-pdm-prod-abc123.a.run.app',
      sourceRevision: 'b'.repeat(40),
      imageDigest: `sha256:${h('c')}`,
      cloudRunRevision: 'ai-pdm-prod-gh-1234-5678',
    },
    target: {
      projectId: 'jenfu-platform-prod', instance: 'jenfu-platform-prod-pg', database: 'jenfu_prod',
      region: 'asia-east1', environment: 'production-candidate', trafficPercent: 0, databaseIdentitySha256: h('d'),
    },
    actor: {
      subjectSha256: h('e'), role: 'Engineer',
      company: { id: 'company-smoke', code: 'SMOKE', kind: 'production_smoke' },
    },
    sideEffects: { gcsWriter: 'disabled', outboxConsumer: 'disabled', externalNotification: 'disabled' },
    status: 'PASS',
  })
}

function preflight() {
  const core = {
    schemaVersion: 'jenfu.dev010.r1.preflight.evidence.v3', releaseId: 'REL-116-20260904', slice: '010-R1A', status: 'READY_FOR_R1_REHEARSAL', riskLane: 3,
    target: {
      preferredNeutralProjectId: 'jenfu-platform-prod', neutralInstance: 'jenfu-platform-prod-pg', neutralDatabase: 'jenfu_prod', region: 'asia-east1',
      availabilityProfile: 'ZONAL_DEDICATED', databaseTier: 'db-custom-1-3840',
    },
    operations: {}, authorization: {}, releaseSourceLockEvidenceSha256: h('a'),
    components: [{ id: 'ai-pdm', branch: '持續優化2', head: 'b'.repeat(40), tree: 'f'.repeat(40), stagedSourceDirtyEntryCount: 0, stagedUnknownRiskEntryCount: 0, missingTrackedN2Files: [], missingCommands: [] }],
    requiredCaseIds: Array.from({ length: 15 }, (_, index) => `QA-010-R1-${String(index + 1).padStart(2, '0')}`),
    blockers: [], productionWrites: false, cloudMutations: 0, trafficChanges: 0,
  }
  return { ...core, evidenceSha256: sha256(canonicalize(core)) }
}

function observations() {
  const context = candidateContext()
  const objectIds = ['root-1', 'part-1', 'drawing-1']
  const committedCodes = ['A0001', 'A0001-P01', 'A0001-M01']
  const reloadReadbackSha256 = sha256(canonicalize({ companyId: 'company-smoke', objectIds, codes: committedCodes }))
  const browser = buildDev116R02BrowserObservation({
    releaseId: context.releaseId, observedAt: '2026-09-05T01:03:03.000Z', sourceLockSha256: context.sourceLockSha256,
    candidate: context.candidate, target: context.target, actor: context.actor,
    flow: { entryRoute: '/numbering/drawings', createRoute: '/numbering/create', committedObjectIds: objectIds, committedCodes, normalNavigation: true },
    readback: { api: 'PASS', browserReload: 'PASS', search: 'PASS', reloadReadbackSha256 },
    sideEffects: context.sideEffects, result: 'BROWSER_PASS',
  })
  const { baseUrl, ...providerCandidate } = context.candidate
  assert.ok(baseUrl)
  const provider = buildDev116R02ProviderObservation({
    releaseId: context.releaseId, observedAt: '2026-09-05T01:04:03.000Z', sourceLockSha256: context.sourceLockSha256,
    candidate: providerCandidate, target: context.target, actor: context.actor,
    flow: { committedObjectIds: objectIds, committedCodes },
    readback: { databaseCommit: 'PASS', reloadReadbackSha256 },
    jenfuInvariant: { beforeSha256: h('f'), afterSha256: h('f'), zeroLeakCount: 0 },
    sideEffects: context.sideEffects, result: 'PROVIDER_PASS',
  })
  return { browser, provider }
}

test('browser execution requires scoped evidence paths and explicit candidate-write acknowledgement', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dev116-r02-args-'))
  try {
    const args = parseDev116R02BrowserArgs([
      '--preflight', 'output/production-release/preflight.json',
      '--candidate-context', 'output/production-release/candidate.json',
      '--output', 'output/production-release/browser.json',
      '--screenshot', 'output/production-release/browser.png',
      '--acknowledgement', DEV116_R02_BROWSER_ACKNOWLEDGEMENT,
    ], { root })
    assert.ok(args.outputPath.endsWith(path.join('output', 'production-release', 'browser.json')))
    assert.throws(() => parseDev116R02BrowserArgs(['--identifier', 'smoke@example.invalid'], { root }), /CREDENTIAL_ARGUMENT_FORBIDDEN/u)
    assert.throws(() => parseDev116R02BrowserArgs([], { root }), /WRITE_ACKNOWLEDGEMENT_REQUIRED/u)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('credentials are environment-only and never become evidence fields', () => {
  const credentials = readDev116R02Credentials({ PDM_DEV116_R02_LOGIN_IDENTIFIER: 'smoke@example.invalid', PDM_DEV116_R02_LOGIN_PASSWORD: 'secret-value' })
  assert.equal(credentials.identifier, 'smoke@example.invalid')
  assert.equal(credentials.password, 'secret-value')
  assert.throws(() => readDev116R02Credentials({}), /LOGIN_IDENTIFIER_REQUIRED/u)
  assert.doesNotMatch(JSON.stringify(candidateContext()), /smoke@example|secret-value/u)
})

test('only a hash-bound ready DEV-010 preflight matching the exact candidate can execute', () => {
  const ready = preflight()
  const context = candidateContext()
  assert.equal(assertPreflightMatchesCandidate(ready, context).candidate.target.projectId, 'jenfu-platform-prod')
  const blockedCore = { ...ready, status: 'BLOCKED', blockers: [{ code: 'DEV010_R1_RTO_INVALID' }] }
  delete blockedCore.evidenceSha256
  const blocked = { ...blockedCore, evidenceSha256: sha256(canonicalize(blockedCore)) }
  assert.throws(() => assertDev010R1PreflightForR02(blocked), /PREFLIGHT_INVALID:status/u)
  const drifted = structuredClone(context)
  drifted.candidate.sourceRevision = '9'.repeat(40)
  const { evidenceSha256, ...driftCore } = drifted
  drifted.evidenceSha256 = sha256(canonicalize(driftCore))
  assert.notEqual(drifted.evidenceSha256, evidenceSha256)
  assert.throws(() => assertPreflightMatchesCandidate(ready, drifted), /PREFLIGHT_CANDIDATE_MISMATCH/u)
})

test('legacy target, nonzero traffic, or enabled side effect cannot form candidate context', () => {
  const base = candidateContext()
  for (const mutate of [
    (value) => { value.target.projectId = 'jenfu-ai-pdm-prod' },
    (value) => { value.target.trafficPercent = 1 },
    (value) => { value.sideEffects.gcsWriter = 'enabled' },
  ]) {
    const value = structuredClone(base)
    mutate(value)
    const { evidenceSha256, ...core } = value
    value.evidenceSha256 = sha256(canonicalize(core))
    assert.notEqual(value.evidenceSha256, evidenceSha256)
    assert.throws(() => assertPreflightMatchesCandidate(preflight(), value), /CANDIDATE_CONTEXT_INVALID/u)
  }
})

test('browser and independent provider observations join into the existing R02 receipt', () => {
  const { browser, provider } = observations()
  const observation = joinDev116R02Evidence(browser, provider)
  const receipt = buildDev116R02Receipt(observation)
  assert.equal(receipt.result, 'PASS')
  assert.equal(receipt.claimLevel, 'production-candidate-level4')
  assert.equal(receipt.target.projectId, 'jenfu-platform-prod')
  assert.deepEqual(receipt.flow.committedObjectIds, ['root-1', 'part-1', 'drawing-1'])
})

test('provider mismatch or Jenfu drift fails before a Level 4 receipt exists', () => {
  const { browser, provider } = observations()
  const mismatch = structuredClone(provider)
  mismatch.flow.committedCodes[2] = 'A9999-M01'
  const { evidenceSha256, ...mismatchCore } = mismatch
  mismatch.evidenceSha256 = sha256(canonicalize(mismatchCore))
  assert.notEqual(mismatch.evidenceSha256, evidenceSha256)
  assert.throws(() => joinDev116R02Evidence(browser, mismatch), /BROWSER_PROVIDER_MISMATCH:committedCodes/u)
  const jenfuDrift = structuredClone(provider)
  jenfuDrift.jenfuInvariant.afterSha256 = h('0')
  const { evidenceSha256: oldHash, ...jenfuCore } = jenfuDrift
  jenfuDrift.evidenceSha256 = sha256(canonicalize(jenfuCore))
  assert.notEqual(jenfuDrift.evidenceSha256, oldHash)
  assert.throws(() => joinDev116R02Evidence(browser, jenfuDrift), /PROVIDER_OBSERVATION_INVALID:jenfuInvariant/u)
})

test('browser runner observes the UI POST but cannot call API, deploy, migrate, promote, or cleanup', () => {
  const source = fs.readFileSync(new URL('./run-dev116-r02-authenticated-browser.mjs', import.meta.url), 'utf8')
  const library = fs.readFileSync(new URL('./lib/dev116-r02-browser-executor.mjs', import.meta.url), 'utf8')
  assert.match(source, /getByRole\('link', \{ name: '建立編號'/u)
  assert.match(source, /waitForResponse/u)
  assert.doesNotMatch(source, /fetch\s*\(|page\.request|request\.post|gcloud|terraform|--promote|--migrate|--deploy|delete|cleanup/iu)
  assert.match(library, /PDM_DEV116_R02_LOGIN_IDENTIFIER/u)
  assert.match(library, /PDM_DEV116_R02_LOGIN_PASSWORD/u)
  assert.match(source, /readDev116R02Credentials\(process\.env\)/u)
  assert.doesNotMatch(source, /process\.stdout\.write\([^\n]*(identifier|password)/u)
})
