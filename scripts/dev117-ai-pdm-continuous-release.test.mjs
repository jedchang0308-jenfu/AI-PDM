import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { buildAiPdmPackage } from './dev010-n1c-ai-pdm-package.mjs'
import { LEGACY_STRICT_VALIDATORS, assertDev117ContinuousProfile, assertDev117NativeJoin, assertDev117ReleaseIntent, assertDev117WorkflowSource, buildDev117CandidateTag, buildDev117MigrationBundle, buildDev117Mutation, verifyDev117MigrationBytes } from './lib/dev117-ai-pdm-continuous-release.mjs'

const read = (file) => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))
const readText = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const v2 = read('config/release/dev117-ai-pdm-independent-production-v2.json')
const v1 = read('config/release/dev117-ai-pdm-independent-production.json')
const n1c = read('config/platform/dev-010-n1c-ai-pdm.json')
const H = 'a'.repeat(64)
const ref = (name) => ({ uri: `gs://${v2.artifact.releaseBucket}/receipts/${name}.json`, sha256: H })

test('S1B-20 AI-PDM continuous profile and strict v1 retention', () => {
  assertDev117ContinuousProfile(v2, v1, n1c)
  assert.equal(Object.keys(LEGACY_STRICT_VALIDATORS).length, 5)
  assert.ok(Object.values(LEGACY_STRICT_VALIDATORS).every((fn) => typeof fn === 'function'))
})

test('S1B-20 AI-PDM current 14-entry migration classification and bytes', () => {
  const files = new Map(v2.migrations.entries.map((entry) => [entry.path, fs.readFileSync(new URL(`../${entry.path}`, import.meta.url))]))
  assert.equal(verifyDev117MigrationBytes(v2, files), true)
  const bundle = buildDev117MigrationBundle(v2, buildAiPdmPackage(n1c), 'a'.repeat(40))
  assert.equal(bundle.bundle.entries.length, 14)
  assert.equal(bundle.bundle.baselineCount, 14)
})

test('S1B-20 AI-PDM release intent is exact, owner-bound and immutable', () => {
  const intent = { schemaVersion: v2.schemas.releaseIntent, ownerApplicationId: 'ai-pdm', releaseId: 'REL-AIPDM-001', sourceRevision: 'b'.repeat(40), sourceSha256: H, sourceLockRef: ref('source'), authorizationPolicyRef: ref('authorization'), readinessReceiptRef: ref('readiness'), foundationReceiptRef: ref('foundation'), infraReceiptRef: ref('infra'), runtimeConfigRef: ref('runtime'), migrationManifestSha256: H, previousRevision: 'ai-pdm-prod-prev', deadlineAt: '2026-09-08T01:00:00.000Z' }
  assert.equal(assertDev117ReleaseIntent(intent, v2), intent)
  assert.throws(() => assertDev117ReleaseIntent({ ...intent, ownerApplicationId: 'platform' }, v2), /release intent invalid/i)
})

test('S1B-20 AI-PDM single-capsule workflow and mutation masks', () => {
  assert.equal(assertDev117WorkflowSource(fs.readFileSync(new URL('../.github/workflows/deploy-ai-pdm-independent-production.yml', import.meta.url), 'utf8')), true)
  assert.equal(buildDev117Mutation({ operation: 'CREATE_CANDIDATE', service: 'ai-pdm-prod', updateMask: 'template', revision: 'candidate-1', trafficPercent: 0, etag: 'e' }).trafficPercent, 0)
  assert.equal(buildDev117CandidateTag({ service: 'ai-pdm-prod', revision: 'ai-pdm-prod-candidate-1', tag: `candidate-${'a'.repeat(12)}`, beforeTraffic: [{ revision: 'ai-pdm-prod-prev', percent: 100 }], etag: 'e' }).traffic.at(-1).percent, 0)
  assert.throws(() => buildDev117Mutation({ operation: 'ACTIVATE', service: 'ai-pdm-prod', updateMask: 'template,traffic', revision: 'latest', trafficPercent: 100, etag: 'e' }), /target invalid|traffic-only/)
})

test('S1B-20 AI-PDM DEV-116 exact candidate join', () => {
  const join = { sourceLock: { environment: 'production' }, artifact: { evidenceScope: 'PROVIDER' }, candidate: { revision: 'candidate-1' }, dev116R02: { schemaVersion: v2.dependencies.dev116ReceiptSchema, candidateRevision: 'candidate-1' }, machineDecision: { decision: 'GO' }, activation: { revision: 'candidate-1' }, canonical: { revision: 'candidate-1' } }
  assert.equal(assertDev117NativeJoin(join, v2), true)
  assert.throws(() => assertDev117NativeJoin({ ...join, dev116R02: { ...join.dev116R02, candidateRevision: 'other' } }, v2), /do not join/)
})

test('S1B-20 AI-PDM production login contains no application TOTP flow', () => {
  const clientAuth = readText('src/lib/firebase-client-auth.ts')
  const loginPage = readText('src/app/login/page.tsx')
  const styles = readText('src/app/globals.css')
  assert.match(clientAuth, /signInWithEmailAndPassword/u)
  assert.doesNotMatch(clientAuth, /TotpMultiFactorGenerator|getMultiFactorResolver|totp_required/u)
  assert.doesNotMatch(loginPage, /completeFirebaseTotp|totpChallenge|totpCode/u)
  assert.doesNotMatch(styles, /\.totp-enrollment-/u)
})
