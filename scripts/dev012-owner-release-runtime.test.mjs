import assert from 'node:assert/strict'
import test from 'node:test'
import { crc32cBase64 } from './lib/dev012-production-migration-runner.mjs'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'

const H40 = 'a'.repeat(40)
const H64 = 'b'.repeat(64)
const bucket = 'jenfu-platform-prod-platform-release'
const profile = {
  application: { id: 'platform', repository: 'owner/repo', branch: 'main' },
  target: { projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName: 'jenfu-platform-prod' },
  artifact: { releaseBucket: bucket, repository: 'platform-release', uri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform' },
  identities: { builder: 'platform-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' },
  build: { dockerBuilderImage: 'gcr.io/cloud-builders/docker@sha256:3d00b6c1a9b862621c30fc74d4f2abfc62bcbdee631ed3febd31e7edbdf6252c', dockerfile: 'Dockerfile', dockerTarget: 'runner' },
  migrations: { jobName: 'platform-prod-migration-runner', serviceAccount: 'platform-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com' },
}

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

test('owner transport reads a generation-bound object from any explicitly allowed prefix', async () => {
  const bytes = Buffer.from('{"ok":true}\n')
  const fetchImpl = async (url) => url.includes('alt=media')
    ? new Response(bytes)
    : json({ generation: '7', crc32c: crc32cBase64(bytes) })
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl })
  const result = await transport.readBytes(`gs://${bucket}/source/releases/source.tgz`, { prefixes: ['receipts', 'source'] })
  assert.equal(result.metadata.generation, '7')
  assert.equal(result.bytes.equals(bytes), true)
})

test('Cloud Build uses the regional operation API, pinned builder, exact source generation and verified provenance', async () => {
  const sourceUri = `gs://${bucket}/source/releases/R/source.tgz`
  const buildTag = `${profile.artifact.uri}:release-${H40}`
  const seen = []
  const build = {
    status: 'SUCCESS', projectId: profile.target.projectId,
    serviceAccount: `projects/${profile.target.projectId}/serviceAccounts/${profile.identities.builder}`,
    options: { requestedVerifyOption: 'VERIFIED' },
    sourceProvenance: { resolvedStorageSource: { bucket, object: 'source/releases/R/source.tgz', generation: '9' } },
    results: { images: [{ name: buildTag, digest: `sha256:${H64}` }] },
  }
  const fetchImpl = async (url, options = {}) => {
    seen.push({ url: String(url), method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null })
    if (options.method === 'POST') return json({ name: 'projects/jenfu-platform-prod/locations/asia-east1/operations/build-1', done: false })
    return json({ done: true, response: build })
  }
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl, sleep: async () => undefined })
  const result = await transport.createBuild({ profile, intent: { sourceRevision: H40, sourceSha256: H64, releaseId: 'REL-001' }, sourceObject: { ref: { uri: sourceUri, sha256: H64 }, metadata: { generation: '9' } }, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(result.artifactDigest, `${profile.artifact.uri}@sha256:${H64}`)
  assert.match(seen[1].url, /^https:\/\/cloudbuild\.googleapis\.com\/v1\/projects\//u)
  assert.equal(seen[0].body.steps[0].name, profile.build.dockerBuilderImage)
  assert.equal(seen[0].body.source.storageSource.generation, '9')
})

test('Artifact Registry, provenance, SBOM and vulnerability evidence fail closed', async () => {
  const digest = `${profile.artifact.uri}@sha256:${H64}`
  const fetchImpl = async (url, options = {}) => {
    const value = String(url)
    if (value.includes('/dockerImages?')) return json({ dockerImages: [{ name: 'projects/p/locations/r/repositories/x/dockerImages/platform@sha256:abc', uri: digest }] })
    if (value.endsWith(':exportSBOM') && options.method === 'POST') {
      assert.match(value, /containeranalysis\.googleapis\.com\/v1beta1\/projects\/jenfu-platform-prod\/resources\//)
      assert.equal(options.body, '{}')
      return json({ discoveryOccurrenceId: 'projects/jenfu-platform-prod/occurrences/sbom-discovery' })
    }
    if (value.includes('/occurrences?')) return json({ occurrences: [
      { name: 'projects/jenfu-platform-prod/occurrences/build', kind: 'BUILD' },
      { name: 'projects/jenfu-platform-prod/occurrences/sbom-discovery', kind: 'DISCOVERY', discovery: { discovered: { analysisStatus: 'FINISHED_SUCCESS' } } },
      { name: 'projects/jenfu-platform-prod/occurrences/sbom', kind: 'SBOM_REFERENCE' },
      { name: 'projects/jenfu-platform-prod/occurrences/low', kind: 'VULNERABILITY', vulnerability: { effectiveSeverity: 'LOW' } },
    ] })
    throw new Error(`unexpected ${value}`)
  }
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl, sleep: async () => undefined })
  assert.equal((await transport.readArtifactImage(profile, digest)).uri, digest)
  const evidence = await transport.waitArtifactEvidence({ profile, artifactDigest: digest, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(evidence.status, 'PASS')
  assert.equal(evidence.blockingVulnerabilityCount, 0)

  const blockedTransport = createOwnerTransport({ token: 'x'.repeat(32), sleep: async () => undefined, fetchImpl: async (url, options = {}) => {
    if (String(url).endsWith(':exportSBOM') && options.method === 'POST') return json({ discoveryOccurrenceId: 'projects/jenfu-platform-prod/occurrences/sbom-discovery' })
    return json({ occurrences: [
      { name: 'projects/jenfu-platform-prod/occurrences/build', kind: 'BUILD' },
      { name: 'projects/jenfu-platform-prod/occurrences/sbom-discovery', kind: 'DISCOVERY', discovery: { discovered: { analysisStatus: 'FINISHED_SUCCESS' } } },
      { name: 'projects/jenfu-platform-prod/occurrences/critical', kind: 'VULNERABILITY', vulnerability: { effectiveSeverity: 'CRITICAL' } },
    ] })
  } })
  await assert.rejects(() => blockedTransport.waitArtifactEvidence({ profile, artifactDigest: digest, deadlineAt: '2999-01-01T00:00:00.000Z' }), /ARTIFACT_POLICY_FAILED/u)
})

test('migration job readback rejects mutable target fields before jobs.run', async () => {
  const jobName = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/platform-prod-migration-runner'
  const environment = {
    OWNER_APPLICATION_ID: 'platform', RELEASE_BUCKET: bucket, GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod', GOOGLE_CLOUD_REGION: 'asia-east1',
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg', POSTGRES_DATABASE: 'jenfu_prod',
    POSTGRES_IAM_LOGIN: 'platform-prod-migrator@jenfu-platform-prod.iam', POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg',
  }
  const job = { name: jobName, template: { taskCount: 1, parallelism: 1, template: { serviceAccount: profile.migrations.serviceAccount, maxRetries: 0, timeout: '1800s', containers: [{ name: 'migration', image: `runner@sha256:${H64}`, env: Object.entries(environment).map(([name, value]) => ({ name, value })), volumeMounts: [{ name: 'cloudsql', mountPath: '/cloudsql' }] }], volumes: [{ name: 'cloudsql', cloudSqlInstance: { instances: ['jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'] } }] } } }
  let runCalls = 0
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (url, options = {}) => {
    if (options.method === 'POST') { runCalls += 1; return json({ name: 'projects/p/locations/r/operations/run-1', done: true, response: { name: 'projects/p/locations/r/executions/e1' } }) }
    if (String(url).endsWith('/executions/e1')) return json({ name: 'projects/p/locations/r/executions/e1', succeededCount: 1, failedCount: 0, completionTime: '2026-09-08T00:00:00Z', terminalCondition: { state: 'CONDITION_SUCCEEDED' } })
    return json(job)
  } })
  const deployment = { migrationRunnerDigest: `runner@sha256:${H64}`, migrationBundleRef: { uri: `gs://${bucket}/source/migration-bundles/b.json`, sha256: H64 }, sourceRevision: H40 }
  await transport.runMigrationJob({ profile, deployment, outputUri: `gs://${bucket}/receipts/migrate.json`, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(runCalls, 1)
  const drifted = structuredClone(job)
  drifted.template.template.containers[0].env.find((row) => row.name === 'POSTGRES_DATABASE').value = 'jenfu_stg'
  const denied = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async () => json(drifted) })
  await assert.rejects(() => denied.runMigrationJob({ profile, deployment, outputUri: `gs://${bucket}/receipts/migrate.json`, deadlineAt: '2999-01-01T00:00:00.000Z' }), /MIGRATION_JOB_READBACK_MISMATCH/u)
})

test('candidate-tag cleanup distinguishes the candidate from the active rollback target', async () => {
  const before = { name: 'projects/jenfu-platform-prod/locations/asia-east1/services/jenfu-platform-prod', etag: 'e1', reconciling: false, generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' }, traffic: [{ revision: 'previous-1', percent: 100 }, { revision: 'candidate-1', percent: 0, tag: 'candidate-abc' }], trafficStatuses: [{ revision: 'previous-1', percent: 100 }, { revision: 'candidate-1', percent: 0, tag: 'candidate-abc' }] }
  const after = { ...before, etag: 'e2', traffic: [{ revision: 'previous-1', percent: 100 }], trafficStatuses: [{ revision: 'previous-1', percent: 100 }] }
  let gets = 0
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (_url, options = {}) => {
    if (options.method === 'PATCH') return json({ name: 'projects/p/locations/r/operations/patch-1', done: true, response: {} })
    gets += 1
    return json(gets === 1 ? before : after)
  } })
  const readback = await transport.removeCandidateTag({ profile, tag: 'candidate-abc', candidateRevision: 'candidate-1', expectedActiveRevision: 'previous-1', deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(transport.effectiveRevision(readback), 'previous-1')
})

test('Cloud Run service readback requires a reconciled successful observed generation', () => {
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async () => json({}) })
  const settled = { reconciling: false, generation: '8', observedGeneration: '8', terminalCondition: { state: 'CONDITION_SUCCEEDED' } }
  assert.equal(transport.assertServiceSettled(settled), settled)
  assert.throws(() => transport.assertServiceSettled({ ...settled, observedGeneration: '7' }), /RUN_SERVICE_NOT_SETTLED/u)
  assert.throws(() => transport.assertServiceSettled({ ...settled, terminalCondition: { state: 'CONDITION_FAILED' } }), /RUN_SERVICE_NOT_SETTLED/u)
})

test('Cloud Run revision readback stays bound to the exact service path', async () => {
  const revision = 'jenfu-platform-prod-candidate'
  const endpoint = `/services/${profile.target.serviceName}/revisions/${revision}`
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (url) => {
    assert.equal(String(url).endsWith(endpoint), true)
    return json({ name: `projects/${profile.target.projectId}/locations/${profile.target.region}${endpoint}`, service: `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}` })
  } })
  assert.equal((await transport.getRevision(profile, revision)).name.endsWith(`/revisions/${revision}`), true)
  await assert.rejects(() => transport.getRevision(profile, 'latest'), /REVISION_TARGET_INVALID/u)
  const artifact = `${profile.artifact.uri}@sha256:${H64}`
  const ready = { containers: [{ image: artifact }], conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] }
  assert.equal(transport.assertRevisionReady(ready, artifact), ready)
  assert.throws(() => transport.assertRevisionReady({ containers: [{ image: artifact }], conditions: [] }, artifact), /CANDIDATE_REVISION_READBACK_MISMATCH/u)
})

test('authenticated smoke refreshes a short-lived Firebase ID token without exposing it', async () => {
  let meCalls = 0
  let refreshAuthorization
  const idToken = 'header.payload.' + 'x'.repeat(120)
  const fetchImpl = async (url, options = {}) => {
    const value = String(url)
    if (value.startsWith('https://securetoken.googleapis.com/')) {
      refreshAuthorization = options.headers?.authorization
      assert.match(String(options.body), /grant_type=refresh_token/u)
      return json({ id_token: idToken, expires_in: '3600', user_id: 'smoke-user' })
    }
    const path = new URL(value).pathname
    if (path === '/api/auth/firebase/session') return new Response('{}', { status: 200, headers: { 'set-cookie': 'jenfu_session=opaque; Secure; HttpOnly; SameSite=Lax' } })
    if (path === '/api/auth/me') { meCalls += 1; return json({}, meCalls === 1 ? 200 : 401) }
    if (path === '/api/auth/logout' || path === '/api/auth/mode' || path === '/api/data') return json({})
    if (path === '/api/private') return json({}, 401)
    throw new Error('unexpected ' + value)
  }
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl })
  const smokeProfile = {
    verification: {
      refreshTokenEnvironmentName: 'FIREBASE_REFRESH_TOKEN',
      firebaseApiKeyEnvironmentName: 'FIREBASE_API_KEY',
      authModePath: '/api/auth/mode', sessionPath: '/api/auth/firebase/session', mePath: '/api/auth/me', logoutPath: '/api/auth/logout',
      authenticatedProbes: [{ id: 'database-read', path: '/api/data', expectedStatus: 200 }],
      negativeProbes: [{ id: 'unauthenticated', path: '/api/private', expectedStatus: 401 }],
    },
  }
  const result = await transport.runAuthenticatedSmoke({ profile: smokeProfile, origin: 'https://candidate.example.test', environment: { FIREBASE_REFRESH_TOKEN: 'r'.repeat(80), FIREBASE_API_KEY: 'A'.repeat(39) } })
  assert.equal(result.status, 'PASS')
  assert.equal(result.tokenSource, 'FIREBASE_REFRESH_TOKEN')
  assert.equal(refreshAuthorization, undefined)
  assert.doesNotMatch(JSON.stringify(result), /header\.payload/u)
})
