import assert from 'node:assert/strict'
import test from 'node:test'
import { crc32cBase64 } from './lib/dev012-production-migration-runner.mjs'
import { assertRuntimeConfig, buildRuntimeConfig, createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'

const H40 = 'a'.repeat(40)
const H64 = 'b'.repeat(64)
const bucket = 'jenfu-platform-prod-platform-release'
const profile = {
  application: { id: 'platform', repository: 'owner/repo', branch: 'main' },
  target: { projectId: 'jenfu-platform-prod', projectNumber: '9536592944', region: 'asia-east1', serviceName: 'jenfu-platform-prod', runtimeServiceAccount: 'platform-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com', canonicalOrigin: 'https://jenfu-platform-prod-9536592944.asia-east1.run.app', entryPolicy: { ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true } },
  runtime: { containerName: 'platform', cloudSqlProxyContainer: 'cloud-sql-proxy', cloudSqlProxyImage: `proxy@sha256:${'c'.repeat(64)}`, cloudSqlProxyPort: 5432, cloudSqlProxyMaximumConnections: 24, cloudSqlConnectionName: 'p:r:i', network: 'runtime-vpc', subnet: 'runtime-subnet', port: 8080, startupProbePath: '/ready', cpu: '1', memory: '512Mi', concurrency: 20, timeoutSeconds: 60, maxInstances: 1 },
  artifact: { releaseBucket: bucket, repository: 'platform-release', uri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform' },
  identities: { builder: 'platform-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' },
  build: { dockerBuilderImage: 'gcr.io/cloud-builders/docker@sha256:3d00b6c1a9b862621c30fc74d4f2abfc62bcbdee631ed3febd31e7edbdf6252c', dockerfile: 'Dockerfile', dockerTarget: 'runner' },
  migrations: { jobName: 'platform-prod-migration-runner', serviceAccount: 'platform-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com' },
  environment: { requiredPlainEnvironmentNames: ['NODE_ENV'], requiredSecretNames: ['SESSION_SECRET'], allowedSecretIds: { SESSION_SECRET: 'platform-prod-session-pepper' }, candidateOriginEnvironmentName: 'PORTAL_RELEASE_CANDIDATE_ORIGIN' },
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

test('Cloud Build gets the exact regional build resource, pinned builder, source generation and verified provenance', async () => {
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
    if (options.method === 'POST') return json({ name: 'operations/build/NTU1NGU2YTktMWMwZi00OGJkLTg3N2EtN2YwNGQ2NTE5MTVl', metadata: { build: { id: '5554e6a9-1c0f-48bd-877a-7f04d651915e' } } })
    return json(build)
  }
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl, sleep: async () => undefined })
  const result = await transport.createBuild({ profile, intent: { sourceRevision: H40, sourceSha256: H64, releaseId: 'REL-001' }, sourceObject: { ref: { uri: sourceUri, sha256: H64 }, metadata: { generation: '9' } }, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(result.artifactDigest, `${profile.artifact.uri}@sha256:${H64}`)
  assert.equal(seen[1].url, 'https://cloudbuild.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/builds/5554e6a9-1c0f-48bd-877a-7f04d651915e')
  assert.equal(seen[0].body.steps[0].name, profile.build.dockerBuilderImage)
  assert.equal(seen[0].body.steps[0].dir, 'source')
  assert.equal(seen[0].body.source.storageSource.generation, '9')
})

test('Artifact Registry, provenance, SBOM and vulnerability evidence fail closed', async () => {
  const digest = `${profile.artifact.uri}@sha256:${H64}`
  const fetchImpl = async (url, options = {}) => {
    const value = String(url)
    if (value.includes('/dockerImages?')) return json({ dockerImages: [{ name: 'projects/p/locations/r/repositories/x/dockerImages/platform@sha256:abc', uri: digest }] })
    if (value.endsWith(':exportSBOM') && options.method === 'POST') {
      assert.match(value, /containeranalysis\.googleapis\.com\/v1beta1\/projects\/jenfu-platform-prod\/locations\/asia-east1\/resources\//)
      assert.equal(options.body, '{}')
      return json({ discoveryOccurrenceId: 'projects/jenfu-platform-prod/locations/asia-east1/occurrences/sbom-discovery' })
    }
    if (value.includes('/occurrences?')) {
      assert.match(value, /\/v1\/projects\/jenfu-platform-prod\/occurrences\?/u)
      return json({ occurrences: [
      { name: 'projects/jenfu-platform-prod/occurrences/build', kind: 'BUILD' },
      { name: 'projects/jenfu-platform-prod/locations/asia-east1/occurrences/sbom-discovery', kind: 'DISCOVERY', discovery: { analysisStatus: 'FINISHED_SUCCESS' } },
      { name: 'projects/jenfu-platform-prod/occurrences/sbom', kind: 'SBOM_REFERENCE' },
      { name: 'projects/jenfu-platform-prod/occurrences/low', kind: 'VULNERABILITY', vulnerability: { effectiveSeverity: 'LOW' } },
      ] })
    }
    throw new Error(`unexpected ${value}`)
  }
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl, sleep: async () => undefined })
  assert.equal((await transport.readArtifactImage(profile, digest)).uri, digest)
  const evidence = await transport.waitArtifactEvidence({ profile, artifactDigest: digest, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(evidence.status, 'PASS')
  assert.equal(evidence.blockingVulnerabilityCount, 0)

  const blockedTransport = createOwnerTransport({ token: 'x'.repeat(32), sleep: async () => undefined, fetchImpl: async (url, options = {}) => {
    if (String(url).endsWith(':exportSBOM') && options.method === 'POST') return json({ discoveryOccurrenceId: 'projects/jenfu-platform-prod/locations/asia-east1/occurrences/sbom-discovery' })
    return json({ occurrences: [
      { name: 'projects/jenfu-platform-prod/occurrences/build', kind: 'BUILD' },
      { name: 'projects/jenfu-platform-prod/locations/asia-east1/occurrences/sbom-discovery', kind: 'DISCOVERY', discovery: { analysisStatus: 'FINISHED_SUCCESS' } },
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
  const omittedFalse = { ...settled }; delete omittedFalse.reconciling
  assert.equal(transport.assertServiceSettled(omittedFalse), omittedFalse)
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
  const ready = { containers: [{ name: 'platform', image: artifact }, { name: 'cloud-sql-proxy', image: profile.runtime.cloudSqlProxyImage }], conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] }
  assert.equal(transport.assertRevisionReady(profile, ready, artifact), ready)
  assert.throws(() => transport.assertRevisionReady(profile, { containers: ready.containers, conditions: [] }, artifact), /CANDIDATE_REVISION_READBACK_MISMATCH/u)
})

test('runtime config carries a complete secret-safe two-container template', () => {
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } })
  assert.deepEqual(assertRuntimeConfig(profile, runtimeConfig), runtimeConfig.template)
  const mutable = structuredClone(runtimeConfig)
  mutable.template.containers[1].image = 'proxy:latest'
  assert.throws(() => assertRuntimeConfig(profile, mutable), /RUNTIME_CONFIG_READBACK_MISMATCH/u)
})

test('candidate replaces a one-container holding template with the reviewed runtime template at zero traffic', async () => {
  const artifact = `${profile.artifact.uri}@sha256:${H64}`
  const candidateRevision = `${profile.target.serviceName}-${H64.slice(0, 12)}`
  const candidateTag = `candidate-${H64.slice(0, 12)}`
  const candidateUri = `https://${candidateTag}---jenfu-platform-prod-9536592944.asia-east1.run.app`
  const serviceName = `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`
  const settled = { name: serviceName, reconciling: false, generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' } }
  const before = { ...settled, etag: 'e1', template: { serviceAccount: 'holding@example.invalid', containers: [{ name: 'holding', image: 'holding@sha256:' + '0'.repeat(64) }] }, traffic: [{ revision: 'holding-1', percent: 100 }], trafficStatuses: [{ revision: 'holding-1', percent: 100 }] }
  const created = { ...before, etag: 'e2', latestCreatedRevision: candidateRevision }
  const tagged = { ...created, etag: 'e3', traffic: [...before.traffic, { revision: candidateRevision, percent: 0, tag: candidateTag }], trafficStatuses: [...before.trafficStatuses, { revision: candidateRevision, percent: 0, tag: candidateTag, uri: candidateUri }] }
  const reads = [before, created, tagged]
  const patches = []
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (url, options = {}) => {
    if (options.method === 'PATCH') { patches.push(JSON.parse(options.body)); return json({ name: `projects/${profile.target.projectId}/locations/${profile.target.region}/operations/patch-${patches.length}`, done: true, response: {} }) }
    if (String(url).includes('/revisions/')) return json({ name: `${serviceName}/revisions/${candidateRevision}`, service: serviceName, containers: [{ name: 'platform', image: artifact, env: [{ name: profile.environment.candidateOriginEnvironmentName, value: candidateUri }] }, { name: 'cloud-sql-proxy', image: profile.runtime.cloudSqlProxyImage }], conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] })
    return json(reads.shift())
  } })
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } })
  const result = await transport.createCandidate({ profile, artifactDigest: artifact, runtimeConfig, fingerprint: H64, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(result.previousRevision, 'holding-1')
  assert.equal(patches[0].template.containers.find((row) => row.name === 'platform').image, artifact)
  assert.equal(patches[0].template.containers.length, 2)
  assert.deepEqual(patches[1].traffic.filter((row) => !row.tag), before.traffic)
})

test('candidate revision receives one exact full-origin overlay and provider URI must match', async () => {
  const fingerprint = H64
  const candidateRevision = `jenfu-platform-prod-${fingerprint.slice(0, 12)}`
  const tag = `candidate-${fingerprint.slice(0, 12)}`
  const tagUri = `https://${tag}---jenfu-platform-prod-9536592944.asia-east1.run.app`
  const artifactDigest = `${profile.artifact.uri}@sha256:${H64}`
  const settled = { reconciling: false, generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' } }
  const before = { ...settled, name: `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`, etag: 'e1', template: { serviceAccount: profile.target.runtimeServiceAccount, containers: [{ image: 'old@sha256:' + H64, env: [{ name: 'KEEP', value: 'yes' }] }] }, traffic: [{ revision: 'previous-1', percent: 100 }], trafficStatuses: [{ revision: 'previous-1', percent: 100 }] }
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } })
  const expectedTemplate = structuredClone(runtimeConfig.template)
  expectedTemplate.revision = candidateRevision
  const expectedApp = expectedTemplate.containers.find((container) => container.name === profile.runtime.containerName)
  expectedApp.image = artifactDigest
  expectedApp.env.push({ name: profile.environment.candidateOriginEnvironmentName, value: tagUri })
  const created = { ...before, generation: '2', observedGeneration: '2', etag: 'e2', template: expectedTemplate, latestCreatedRevision: candidateRevision }
  const tagged = { ...created, generation: '3', observedGeneration: '3', etag: 'e3', traffic: [...before.traffic, { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidateRevision, percent: 0, tag }], trafficStatuses: [...before.trafficStatuses, { revision: candidateRevision, percent: 0, tag, uri: tagUri }] }
  let serviceGets = 0
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (url, options = {}) => {
    const value = String(url)
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body)
      if (value.includes('updateMask=template')) assert.deepEqual(body.template, expectedTemplate)
      return json({ name: 'projects/p/locations/r/operations/patch', done: true, response: {} })
    }
    if (value.includes('/revisions/')) return json({ name: `${before.name}/revisions/${candidateRevision}`, service: before.name, containers: [{ name: profile.runtime.containerName, image: artifactDigest, env: expectedApp.env }, { name: profile.runtime.cloudSqlProxyContainer, image: profile.runtime.cloudSqlProxyImage }], conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] })
    return json([before, created, tagged][serviceGets++])
  } })
  const result = await transport.createCandidate({ profile, artifactDigest, runtimeConfig, fingerprint, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(result.tagUri, tagUri)
  assert.equal(result.previousRevision, 'previous-1')
})

test('entrypoint patch uses the exact mask, preserves template/traffic, and unknown outcome is read back once', async () => {
  const tag = 'candidate-bbbbbbbbbbbb'
  const tagUri = `https://${tag}---jenfu-platform-prod-9536592944.asia-east1.run.app`
  const base = { name: `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`, etag: 'e1', reconciling: false, generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' }, ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY', defaultUriDisabled: true, invokerIamDisabled: false, uri: null, urls: [], template: { containers: [{ image: 'old' }] }, traffic: [{ revision: 'previous-1', percent: 100 }, { revision: 'candidate-1', percent: 0, tag }], trafficStatuses: [{ revision: 'previous-1', percent: 100 }, { revision: 'candidate-1', percent: 0, tag, uri: tagUri }] }
  const direct = { ...base, etag: 'e2', generation: '2', observedGeneration: '2', ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true, uri: profile.target.canonicalOrigin, urls: [profile.target.canonicalOrigin] }
  let gets = 0
  let patchCalls = 0
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (url, options = {}) => {
    if (options.method === 'PATCH') {
      patchCalls += 1
      assert.match(String(url), /updateMask=ingress%2CdefaultUriDisabled%2CinvokerIamDisabled/u)
      assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(), ['defaultUriDisabled', 'etag', 'ingress', 'invokerIamDisabled', 'name'])
      throw new TypeError('recorded timeout')
    }
    return json(gets++ === 0 ? base : direct)
  } })
  const result = await transport.configureEntrypoint({ profile, candidate: { candidateRevision: 'candidate-1', tag, tagUri }, previousRevision: 'previous-1', deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(result.changed, true)
  assert.equal(result.templateSha256Before, result.templateSha256After)
  assert.equal(result.trafficSha256Before, result.trafficSha256After)
  assert.equal(result.providerOperationRef.name, 'OUTCOME_UNKNOWN_READBACK_CONFIRMED')
  assert.equal(patchCalls, 1)

  const noOp = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async () => json(direct) })
  assert.equal((await noOp.configureEntrypoint({ profile, candidate: { candidateRevision: 'candidate-1', tag, tagUri }, previousRevision: 'previous-1', deadlineAt: '2999-01-01T00:00:00.000Z' })).changed, false)
})

test('entrypoint recovery covers pre-patch, 412, candidate-live and already-direct baselines', async () => {
  const tag = 'candidate-cccccccccccc'
  const tagUri = `https://${tag}---jenfu-platform-prod-9536592944.asia-east1.run.app`
  const baseline = {
    name: `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`,
    etag: 'e1', reconciling: false, generation: '1', observedGeneration: '1',
    terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY', defaultUriDisabled: true, invokerIamDisabled: false, uri: null, urls: [],
    template: { containers: [{ image: 'old' }] },
    traffic: [{ revision: 'previous-1', percent: 100 }, { revision: 'candidate-1', percent: 0, tag }],
    trafficStatuses: [{ revision: 'previous-1', percent: 100 }, { revision: 'candidate-1', percent: 0, tag, uri: tagUri }],
  }
  const direct = { ...baseline, etag: 'e2', generation: '2', observedGeneration: '2', ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true, uri: profile.target.canonicalOrigin, urls: [profile.target.canonicalOrigin] }

  let prePatchCalls = 0
  const prePatch = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (_url, options = {}) => {
    if (options.method === 'PATCH') prePatchCalls += 1
    return json(baseline)
  } })
  await assert.rejects(prePatch.configureEntrypoint({ profile, candidate: { candidateRevision: 'candidate-1', tag: 'candidate-dddddddddddd', tagUri }, previousRevision: 'previous-1', deadlineAt: '2999-01-01T00:00:00.000Z' }), /ENTRYPOINT_CANDIDATE_JOIN_INVALID/u)
  assert.equal(prePatchCalls, 0)

  let conflictPatchCalls = 0
  const conflict = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (_url, options = {}) => {
    if (options.method === 'PATCH') { conflictPatchCalls += 1; return json({ error: { code: 412 } }, 412) }
    return json(baseline)
  } })
  await assert.rejects(conflict.configureEntrypoint({ profile, candidate: { candidateRevision: 'candidate-1', tag, tagUri }, previousRevision: 'previous-1', deadlineAt: '2999-01-01T00:00:00.000Z' }), /CONFLICT/u)
  assert.equal(conflictPatchCalls, 1)

  let restoreGets = 0
  let restorePatches = 0
  const restoredService = { ...baseline, etag: 'e3', generation: '3', observedGeneration: '3' }
  const restore = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (_url, options = {}) => {
    if (options.method === 'PATCH') {
      restorePatches += 1
      const body = JSON.parse(options.body)
      assert.deepEqual({ ingress: body.ingress, defaultUriDisabled: body.defaultUriDisabled, invokerIamDisabled: body.invokerIamDisabled }, { ingress: baseline.ingress, defaultUriDisabled: baseline.defaultUriDisabled, invokerIamDisabled: baseline.invokerIamDisabled })
      return json({ name: 'projects/p/locations/r/operations/restore', done: true, response: {} })
    }
    return json(restoreGets++ === 0 ? direct : restoredService)
  } })
  const restored = await restore.restoreEntrypoint({ profile, baseline: restore.entrypointSnapshot(baseline), deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(restored.changed, true)
  assert.equal(restorePatches, 1)
  assert.equal(restored.after.ingress, baseline.ingress)

  let alreadyDirectPatches = 0
  const alreadyDirect = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (_url, options = {}) => {
    if (options.method === 'PATCH') alreadyDirectPatches += 1
    return json(direct)
  } })
  const noChange = await alreadyDirect.restoreEntrypoint({ profile, baseline: alreadyDirect.entrypointSnapshot(direct), deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(noChange.changed, false)
  assert.equal(alreadyDirectPatches, 0)
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


test('internal candidate smoke executes only the app-owned Workflow and returns redacted proof', async () => {
  const tag = 'candidate-' + 'a'.repeat(12)
  const revision = 'jenfu-platform-prod-' + 'a'.repeat(12)
  const digest = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform@sha256:' + H64
  const workflow = 'projects/jenfu-platform-prod/locations/asia-east1/workflows/platform-prod-candidate-smoke'
  const executionName = workflow + '/executions/execution-1'
  let createBody
  const result = {
    schemaVersion: 'jenfu.dev012.internal-candidate-smoke.v1',
    ownerApplicationId: 'platform',
    candidateRevision: revision,
    artifactDigest: digest,
    tokenSource: 'SECRET_MANAGER_EXACT_VERSION',
    tokenExpiresInSeconds: '3600',
    observations: [
      { id: 'auth-mode', status: 200 },
      { id: 'session-create', status: 200 },
      { id: 'session-reload', status: 200 },
      { id: 'authenticated-probe', status: 200 },
      { id: 'unauthenticated-probe', status: 401 },
      { id: 'session-revoked', status: 401 },
    ],
    status: 'PASS',
  }
  const fetchImpl = async (url, options = {}) => {
    if (options.method === 'POST') {
      createBody = JSON.parse(options.body)
      return json({ name: executionName, state: 'ACTIVE' })
    }
    assert.equal(String(url), 'https://workflowexecutions.googleapis.com/v1/' + executionName)
    return json({ name: executionName, state: 'SUCCEEDED', result: JSON.stringify(result) })
  }
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl, sleep: async () => undefined })
  const smokeProfile = {
    application: { id: 'platform' },
    target: { projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName: 'jenfu-platform-prod', canonicalOrigin: 'https://jenfu-platform-prod-9536592944.asia-east1.run.app' },
    artifact: { uri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform' },
    verification: {
      firebaseApiKeyEnvironmentName: 'FIREBASE_API_KEY',
      candidateSmokeMode: 'WORKFLOWS_INTERNAL_OIDC_V1',
      candidateWorkflowName: 'platform-prod-candidate-smoke',
      candidateRefreshTokenSecretId: 'platform-prod-smoke-firebase-refresh-token',
    },
  }
  const smoke = await transport.runInternalCandidateSmoke({
    profile: smokeProfile,
    origin: 'https://' + tag + '---jenfu-platform-prod-abc-de.a.run.app',
    candidateTag: tag,
    candidateRevision: revision,
    artifactDigest: digest,
    deadlineAt: '2999-01-01T00:00:00.000Z',
    environment: { FIREBASE_API_KEY: 'A'.repeat(39) },
  })
  assert.equal(smoke.status, 'PASS')
  assert.equal(smoke.executionName, executionName)
  assert.equal(JSON.parse(createBody.argument).candidateRevision, revision)
  assert.doesNotMatch(JSON.stringify(smoke), /firebaseApiKey|refreshToken|idToken|sessionCookie/u)
})


test('legacy one-field endpoint mutations are not exposed by the V3 transport', () => {
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async () => json({}) })
  assert.equal(transport.prepareCandidateEndpoint, undefined)
  assert.equal(transport.enableCanonicalIngress, undefined)
})
