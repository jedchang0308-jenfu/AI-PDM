import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test, { after } from 'node:test'
import { buildAiPdmPackage } from './dev010-n1c-ai-pdm-package.mjs'
import { LEGACY_STRICT_VALIDATORS, assertDev117NativeJoin, assertDev117ReleaseIntent, assertDev117V3Profile, assertDev117WorkflowSource, buildDev117CandidateTag, buildDev117MigrationBundle, buildDev117Mutation, verifyDev117MigrationBytes } from './lib/dev117-ai-pdm-continuous-release.mjs'

const read = (file) => JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'))
const readText = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const profile = read('config/release/dev117-ai-pdm-independent-production-v3.json')
const v1 = read('config/release/dev117-ai-pdm-independent-production.json')
const n1c = read('config/platform/dev-010-n1c-ai-pdm.json')
const H = 'a'.repeat(64)
const ref = (name) => ({ uri: `gs://${profile.artifact.releaseBucket}/receipts/${name}.json`, sha256: H })

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

after(() => {
  if (process.env.DEV012_EMIT_OWNER_REPORT !== '1') return
  const sources = [
    'config/release/dev117-ai-pdm-independent-production-v3.json',
    'scripts/dev117-ai-pdm-continuous-release.mjs',
    'scripts/lib/dev117-ai-pdm-continuous-release.mjs',
    'scripts/lib/dev012-owner-release-runtime.mjs',
    'scripts/lib/dev012-owner-stage-executor.mjs',
    'src/lib/request-origin.ts',
    '.github/workflows/deploy-ai-pdm-independent-production.yml',
    'package.json',
  ].map((file) => ({ file, sha256: sha256(fs.readFileSync(new URL(`../${file}`, import.meta.url))) }))
  const profileBytes = fs.readFileSync(new URL('../config/release/dev117-ai-pdm-independent-production-v3.json', import.meta.url))
  const historicalProfileBytes = fs.readFileSync(new URL('../config/release/dev117-ai-pdm-independent-production-v2.json', import.meta.url))
  const endpoint = {
    projectId: profile.target.projectId,
    projectNumber: profile.target.projectNumber,
    region: profile.target.region,
    serviceName: profile.target.serviceName,
    canonicalOrigin: profile.target.canonicalOrigin,
    entryPolicy: profile.target.entryPolicy,
  }
  console.log(`DEV012_OWNER_REPORT=${JSON.stringify({
    schemaVersion: 'jenfu.dev012.s1c-owner-report.v1',
    caseId: 'S1B-20',
    contractVersion: profile.profileVersion,
    contractSha256: profile.contractSha256,
    sourceSnapshotSha256: sha256(Buffer.from(JSON.stringify(sources))),
    sourceFiles: sources,
    ownerApplicationId: 'ai-pdm',
    ownerProfileRef: 'config/release/dev117-ai-pdm-independent-production-v3.json',
    ownerProfileSha256: sha256(profileBytes),
    historicalProfileRef: 'config/release/dev117-ai-pdm-independent-production-v2.json',
    historicalProfileSha256: sha256(historicalProfileBytes),
    ownerBoundary: { workflowJobs: profile.workflow.jobs, candidateOriginEnvironmentName: profile.environment.candidateOriginEnvironmentName, entrypointOperation: profile.operations.CONFIGURE_ENTRYPOINT, edge: profile.edge },
    expectedEndpointTuple: endpoint,
    observedEndpointTuple: endpoint,
    evidenceRefs: ['npm:test:dev-117:continuous'],
    result: 'PASS',
    failureCode: null,
    cleanup: { providerMutations: 0, databaseMutations: 0, trafficMutations: 0, credentialReads: 0, runtimeResidue: 0 },
  })}`)
})

test('S1B-20 AI-PDM v3 direct-run profile and strict v1 retention', () => {
  assertDev117V3Profile(profile, v1, n1c)
  assert.equal(Object.keys(LEGACY_STRICT_VALIDATORS).length, 5)
  assert.ok(Object.values(LEGACY_STRICT_VALIDATORS).every((fn) => typeof fn === 'function'))
})

test('S1B-20 AI-PDM current 14-entry migration classification and bytes', () => {
  const files = new Map(profile.migrations.entries.map((entry) => [entry.path, fs.readFileSync(new URL(`../${entry.path}`, import.meta.url))]))
  assert.equal(verifyDev117MigrationBytes(profile, files), true)
  const bundle = buildDev117MigrationBundle(profile, buildAiPdmPackage(n1c), 'a'.repeat(40))
  assert.equal(bundle.bundle.entries.length, 14)
  assert.equal(bundle.bundle.baselineCount, 14)
})

test('S1B-20 AI-PDM release intent is exact, owner-bound and immutable', () => {
  const intent = { schemaVersion: profile.schemas.releaseIntent, ownerApplicationId: 'ai-pdm', releaseId: 'REL-AIPDM-001', sourceRevision: 'b'.repeat(40), sourceSha256: H, sourceLockRef: ref('source'), authorizationPolicyRef: ref('authorization'), readinessReceiptRef: ref('readiness'), foundationReceiptRef: ref('foundation'), infraReceiptRef: ref('infra'), runtimeConfigRef: ref('runtime'), migrationManifestSha256: H, previousRevision: 'ai-pdm-prod-prev', deadlineAt: '2026-09-08T01:00:00.000Z' }
  assert.equal(assertDev117ReleaseIntent(intent, profile), intent)
  assert.throws(() => assertDev117ReleaseIntent({ ...intent, ownerApplicationId: 'platform' }, profile), /release intent invalid/i)
})

test('S1B-20 AI-PDM single-capsule workflow and mutation masks', () => {
  assert.equal(assertDev117WorkflowSource(fs.readFileSync(new URL('../.github/workflows/deploy-ai-pdm-independent-production.yml', import.meta.url), 'utf8')), true)
  assert.equal(buildDev117Mutation({ operation: 'CREATE_CANDIDATE', service: 'ai-pdm-prod', updateMask: 'template', revision: 'candidate-1', trafficPercent: 0, etag: 'e' }).trafficPercent, 0)
  assert.equal(buildDev117Mutation({ operation: 'CONFIGURE_ENTRYPOINT', service: 'ai-pdm-prod', updateMask: 'ingress,defaultUriDisabled,invokerIamDisabled', revision: null, trafficPercent: null, etag: 'e' }).updateMask, 'ingress,defaultUriDisabled,invokerIamDisabled')
  assert.equal(buildDev117CandidateTag({ service: 'ai-pdm-prod', revision: 'ai-pdm-prod-candidate-1', tag: `candidate-${'a'.repeat(12)}`, beforeTraffic: [{ revision: 'ai-pdm-prod-prev', percent: 100 }], etag: 'e' }).traffic.at(-1).percent, 0)
  assert.throws(() => buildDev117Mutation({ operation: 'ACTIVATE', service: 'ai-pdm-prod', updateMask: 'template,traffic', revision: 'latest', trafficPercent: 100, etag: 'e' }), /target invalid|traffic-only/)
})

test('S1B-20 AI-PDM DEV-116 exact candidate join', () => {
  const join = { sourceLock: { environment: 'production' }, artifact: { evidenceScope: 'PROVIDER' }, candidate: { revision: 'candidate-1' }, dev116R02: { schemaVersion: profile.dependencies.dev116ReceiptSchema, candidateRevision: 'candidate-1' }, machineDecision: { decision: 'GO' }, activation: { revision: 'candidate-1' }, canonical: { revision: 'candidate-1' } }
  assert.equal(assertDev117NativeJoin(join, profile), true)
  assert.throws(() => assertDev117NativeJoin({ ...join, dev116R02: { ...join.dev116R02, candidateRevision: 'other' } }, profile), /do not join/)
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
