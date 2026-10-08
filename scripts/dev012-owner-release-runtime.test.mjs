import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { crc32cBase64 } from './lib/dev012-production-migration-runner.mjs'
import { assertRuntimeConfig, buildRuntimeConfig, createOwnerTransport, createAiPdmBuildReadbackTransport, canonicalize, sha256 } from './lib/dev012-owner-release-runtime.mjs'

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
  environment: { requiredPlainEnvironmentNames: ['NODE_ENV'], requiredSecretNames: ['SESSION_SECRET'], allowedSecretIds: { SESSION_SECRET: 'platform-prod-session-pepper' }, candidateOriginEnvironmentName: 'PORTAL_RELEASE_CANDIDATE_ORIGIN', fixedValues: { NODE_ENV: 'production' } },
}

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
function migrationReceiptStorage(delegate) {
  const objects = new Map()
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url)
    if (target.hostname !== 'storage.googleapis.com') return delegate(url, options)
    if (target.pathname.startsWith('/upload/storage/v1/')) {
      assert.equal(options.method, 'POST'); assert.equal(target.searchParams.get('ifGenerationMatch'), '0')
      const name = target.searchParams.get('name')
      if (objects.has(name)) return json({}, 412)
      const bytes = Buffer.from(options.body)
      const row = { bytes, generation: String(objects.size + 1), crc32c: crc32cBase64(bytes) }; objects.set(name, row)
      if (fetchImpl.raceNextWrite) { fetchImpl.raceNextWrite = false; return json({}, 412) }
      return json({ generation: row.generation })
    }
    assert.equal(options.method ?? 'GET', 'GET')
    const name = decodeURIComponent(target.pathname.split('/o/')[1]), row = objects.get(name)
    if (!row) return json({}, 404)
    if (target.searchParams.get('alt') === 'media') return new Response(row.bytes)
    return json({ generation: row.generation, crc32c: row.crc32c })
  }
  fetchImpl.objects = objects
  return fetchImpl
}
test('B24 secondary proof token never changes generic GET or mutation authorization', async () => {
  const primary = 'MODELED-PRIMARY-VERIFIER-TOKEN', secondary = 'MODELED-SECONDARY-BUILDER-TOKEN', calls = []
  const transport = createOwnerTransport({ token: primary, builderReadbackToken: secondary, fetchImpl: async (url, options) => {
    calls.push({ url, ...options }); return json({ status: 'MODELED' })
  } })
  const url = 'https://run.googleapis.com/v2/projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod'
  for (const method of ['GET', 'POST', 'PATCH']) await transport.request(url, { method, ...(method === 'GET' ? {} : { body: '{}' }) })
  assert.equal(calls.length, 3)
  for (const call of calls) assert.equal(call.headers.authorization, `Bearer ${primary}`)
  assert.equal(JSON.stringify(Object.keys(transport)).includes(secondary), false)
})

test('B23 fixed runtime rejects wrong AI target and malformed pre-migration refs before any read', async () => {
  let reads = 0
  const transport = createOwnerTransport({ token: 'x'.repeat(25), fetchImpl: async () => { reads++; throw Error('UNEXPECTED_READ') } })
  const aiProfile = { application: { id: 'ai-pdm' }, artifact: { releaseBucket: 'jenfu-platform-prod-aipdm-release' }, target: { projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName: 'ai-pdm-prod' } }
  const prepare = { uri: `gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-B23-LOCAL/${'c'.repeat(64)}/prepare.json`, sha256: 'd'.repeat(64) }
  for (const refs of [{ prepare, migrate: null }, { prepare, migrate: undefined, terminal: null }, { prepare, migrate: null, terminal: undefined },
    { prepare, migrate: null, terminal: prepare }, { prepare, migrate: null, terminal: null, mode: 'pre_migration' }]) {
    await assert.rejects(transport.readOwnerSourceProof({ profile: aiProfile, sourceRevision: H40, refs, verifyProvider: true }), /DEV121_OWNER_RELEASE_PROOF_(?:INPUT|REF)_INVALID/u)
    assert.equal(reads, 0)
  }
  for (const changed of [{ ...aiProfile, application: { id: 'platform' } }, { ...aiProfile, artifact: { releaseBucket: bucket } }, { ...aiProfile, target: { ...aiProfile.target, serviceName: 'sibling' } }]) {
    await assert.rejects(transport.readOwnerSourceProof({ profile: changed, sourceRevision: H40, refs: { prepare, migrate: null, terminal: null }, verifyProvider: true }), /OWNER_SOURCE_PROOF_TARGET_INVALID/u)
    assert.equal(reads, 0)
  }
})

test('production runner is pinned, non-root, and removes the unused vulnerable OS zlib', () => {
  const dockerfile = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8')
  const runtimeImage = 'gcr.io/distroless/nodejs24-debian13:nonroot-amd64@sha256:7924c53f56526359d0f491c22517306d8d92f1b285656a6094398e2c55bbaeca'
  const sanitizerImage = 'alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce'
  assert.ok(dockerfile.includes(`ARG RUNTIME_NODE_IMAGE=${runtimeImage}`))
  assert.ok(dockerfile.includes(`ARG RUNTIME_SANITIZER_IMAGE=${sanitizerImage}`))
  assert.match(dockerfile, /FROM \$\{RUNTIME_NODE_IMAGE\} AS runtime-base/u)
  assert.match(dockerfile, /FROM \$\{RUNTIME_SANITIZER_IMAGE\} AS runtime-sanitizer/u)
  assert.match(dockerfile, /\/rootfs\/usr\/lib\/x86_64-linux-gnu\/libz\.so\.1\.3\.1/u)
  assert.match(dockerfile, /\/rootfs\/var\/lib\/dpkg\/status\.d\/zlib1g\.md5sums/u)
  assert.match(dockerfile, /COPY --from=runtime-sanitizer \/rootfs \//u)
  assert.match(dockerfile, /^FROM scratch AS runner$/mu)
  assert.doesNotMatch(dockerfile, /FROM \$\{NODE_IMAGE\} AS runner/u)
  assert.match(dockerfile, /USER 65532:65532/u)
  assert.match(dockerfile, /ENTRYPOINT \["\/nodejs\/bin\/node"\]/u)
  assert.doesNotMatch(dockerfile.split('AS runner')[1] ?? '', /groupadd|useradd|\/usr\/local\/lib\/node_modules\/npm/u)
})

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
  const resourceUri = `https://${digest}`
  const rowsByKind = {
    BUILD: [{ name: 'projects/jenfu-platform-prod/occurrences/build', resourceUri, kind: 'BUILD' }],
    DISCOVERY: [{ name: 'projects/jenfu-platform-prod/locations/asia-east1/occurrences/sbom-discovery', resourceUri, kind: 'DISCOVERY', discovery: { analysisStatus: 'FINISHED_SUCCESS' } }],
    SBOM_REFERENCE: [{ name: 'projects/jenfu-platform-prod/occurrences/sbom', resourceUri, kind: 'SBOM_REFERENCE' }],
    VULNERABILITY: [{ name: 'projects/jenfu-platform-prod/occurrences/low', resourceUri, kind: 'VULNERABILITY', vulnerability: { effectiveSeverity: 'LOW' } }],
  }
  const requestedKinds = []
  let exportCalls = 0
  const fetchImpl = async (url, options = {}) => {
    const value = String(url)
    if (value.includes('/dockerImages?')) return json({ dockerImages: [{ name: 'projects/p/locations/r/repositories/x/dockerImages/platform@sha256:abc', uri: digest }] })
    if (value.endsWith(':exportSBOM') && options.method === 'POST') {
      assert.match(value, /containeranalysis\.googleapis\.com\/v1beta1\/projects\/jenfu-platform-prod\/locations\/asia-east1\/resources\//)
      assert.equal(options.body, '{}')
      exportCalls += 1
      if (exportCalls === 1) return json({ error: { status: 'INVALID_ARGUMENT' } }, 400)
      return json({ discoveryOccurrenceId: 'projects/jenfu-platform-prod/locations/asia-east1/occurrences/sbom-discovery' })
    }
    if (value.includes('/occurrences?')) {
      assert.match(value, /\/v1\/projects\/jenfu-platform-prod\/occurrences\?/u)
      const filter = new URL(value).searchParams.get('filter') ?? ''
      const match = /^kind="(BUILD|DISCOVERY|SBOM_REFERENCE|VULNERABILITY)" AND resourceUrl="([^"]+)"$/u.exec(filter)
      assert.equal(match?.[2], resourceUri)
      requestedKinds.push(match[1])
      return json({ occurrences: rowsByKind[match[1]] })
    }
    throw new Error(`unexpected ${value}`)
  }
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl, sleep: async () => undefined })
  assert.equal((await transport.readArtifactImage(profile, digest)).uri, digest)
  const evidence = await transport.waitArtifactEvidence({ profile, artifactDigest: digest, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(evidence.status, 'PASS')
  assert.equal(evidence.blockingVulnerabilityCount, 0)
  assert.equal(exportCalls, 2)
  assert.deepEqual(requestedKinds, ['BUILD', 'DISCOVERY', 'SBOM_REFERENCE', 'VULNERABILITY', 'BUILD', 'DISCOVERY', 'SBOM_REFERENCE', 'VULNERABILITY'])

  let invalidExportCalls = 0
  const invalidTransport = createOwnerTransport({ token: 'x'.repeat(32), sleep: async () => undefined, fetchImpl: async (url, options = {}) => {
    if (String(url).endsWith(':exportSBOM') && options.method === 'POST') {
      invalidExportCalls += 1
      return json({ error: { status: 'UNPROCESSABLE_ENTITY' } }, 422)
    }
    const kind = /^kind="([A-Z_]+)"/u.exec(new URL(String(url)).searchParams.get('filter') ?? '')?.[1]
    return json({ occurrences: rowsByKind[kind] ?? [] })
  } })
  await assert.rejects(() => invalidTransport.waitArtifactEvidence({ profile, artifactDigest: digest, deadlineAt: '2999-01-01T00:00:00.000Z' }), /PROVIDER_REQUEST_FAILED:422/u)
  assert.equal(invalidExportCalls, 1)

  const blockedTransport = createOwnerTransport({ token: 'x'.repeat(32), sleep: async () => undefined, fetchImpl: async (url, options = {}) => {
    if (String(url).endsWith(':exportSBOM') && options.method === 'POST') return json({ discoveryOccurrenceId: 'projects/jenfu-platform-prod/locations/asia-east1/occurrences/sbom-discovery' })
    const kind = /^kind="([A-Z_]+)"/u.exec(new URL(String(url)).searchParams.get('filter') ?? '')?.[1]
    const occurrences = kind === 'VULNERABILITY'
      ? [{ name: 'projects/jenfu-platform-prod/occurrences/critical', resourceUri, kind, vulnerability: { effectiveSeverity: 'CRITICAL' } }]
      : rowsByKind[kind] ?? []
    return json({ occurrences })
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
  let listCalls = 0
  const requestedArgs = ['--bundle-ref', `gs://${bucket}/source/migration-bundles/b.json`, '--bundle-sha256', H64, '--source-revision', H40, '--output-ref', `gs://${bucket}/receipts/migrate.json`]
  const executionName = `${jobName}/executions/e1`
  const execution = { name: executionName, template: { containers: [{ name: 'migration', image: 'runner@sha256:' + H64, args: requestedArgs, env: Object.entries(environment).map(([name, value]) => ({ name, value })) }] }, succeededCount: 1, failedCount: 0, completionTime: '2026-09-08T00:00:00Z', conditions: [{ type: 'Completed', state: 'CONDITION_SUCCEEDED' }] }
  const requestedUrls = []
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: migrationReceiptStorage(async (url, options = {}) => {
    requestedUrls.push(String(url))
    if (options.method === 'POST') { runCalls += 1; return json({ name: 'projects/p/locations/r/operations/run-1', done: true, response: { name: 'projects/p/locations/r/executions/e1' } }) }
    if (String(url).endsWith('/executions?pageSize=100')) return json({ executions: listCalls++ === 0 ? [] : [execution] })
    if (String(url).endsWith('/executions/e1')) return json(execution)
    return json(job)
  }) })
  const deployment = { migrationRunnerDigest: `runner@sha256:${H64}`, migrationBundleRef: { uri: `gs://${bucket}/source/migration-bundles/b.json`, sha256: H64 }, sourceRevision: H40 }
  await transport.runMigrationJob({ profile, deployment, outputUri: `gs://${bucket}/receipts/migrate.json`, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(runCalls, 1)
  assert.equal(requestedUrls.some((url) => url.includes('/operations/')), false)
  const drifted = structuredClone(job)
  drifted.template.template.containers[0].env.find((row) => row.name === 'POSTGRES_DATABASE').value = 'jenfu_stg'
  const denied = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async () => json(drifted) })
  await assert.rejects(() => denied.runMigrationJob({ profile, deployment, outputUri: `gs://${bucket}/receipts/migrate.json`, deadlineAt: '2999-01-01T00:00:00.000Z' }), /MIGRATION_JOB_READBACK_MISMATCH/u)

  const principalOnlyFenceRef = {
    uri: `gs://${bucket}/receipts/releases/DEV121-PRINCIPAL-ONLY-MIGRATION-FENCE/fence.json`,
    sha256: H64,
  }
  const fenceEnvironment = {
    DEV121_MIGRATION_FENCE_REF: principalOnlyFenceRef.uri,
    DEV121_MIGRATION_FENCE_SHA256: principalOnlyFenceRef.sha256,
  }
  const fencedExecution = structuredClone(execution)
  fencedExecution.template.containers[0].env = Object.entries({ ...environment, ...fenceEnvironment })
    .map(([name, value]) => ({ name, value }))
  let fencedListCalls = 0
  let fencedRunBody = null
  const fencedTransport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: migrationReceiptStorage(async (url, options = {}) => {
    if (options.method === 'POST') {
      fencedRunBody = JSON.parse(options.body)
      return json({ name: 'projects/p/locations/r/operations/run-fenced' })
    }
    if (String(url).endsWith('/executions?pageSize=100'))
      return json({ executions: fencedListCalls++ === 0 ? [] : [fencedExecution] })
    if (String(url).endsWith('/executions/e1')) return json(fencedExecution)
    return json(job)
  }) })
  await fencedTransport.runMigrationJob({ profile, deployment, principalOnlyFenceRef,
    outputUri: `gs://${bucket}/receipts/migrate.json`, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.deepEqual(fencedRunBody.overrides.containerOverrides[0].env,
    Object.entries(fenceEnvironment).map(([name, value]) => ({ name, value })))

  const wrongExecution = structuredClone(fencedExecution)
  wrongExecution.template.containers[0].env.find((row) =>
    row.name === 'DEV121_MIGRATION_FENCE_SHA256').value = '0'.repeat(64)
  let wrongListCalls = 0
  const wrongTransport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: migrationReceiptStorage(async (url, options = {}) => {
    if (options.method === 'POST') return json({ name: 'projects/p/locations/r/operations/run-wrong' })
    if (String(url).endsWith('/executions?pageSize=100'))
      return json({ executions: wrongListCalls++ === 0 ? [] : [wrongExecution] })
    return json(job)
  }) })
  await assert.rejects(() => wrongTransport.runMigrationJob({ profile, deployment,
    principalOnlyFenceRef, outputUri: `gs://${bucket}/receipts/migrate.json`,
    deadlineAt: '2999-01-01T00:00:00.000Z' }), /MIGRATION_EXECUTION_READBACK_MISMATCH/u)
})

function migrationRetryHarness({ prior = 'active', fenced = false, unknownPost = false, multipleFresh = false, unknownReadback = false } = {}) {
  const jobName = `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations.jobName}`
  const environment = { OWNER_APPLICATION_ID: profile.application.id, RELEASE_BUCKET: bucket, GOOGLE_CLOUD_PROJECT: profile.target.projectId, GOOGLE_CLOUD_REGION: profile.target.region,
    CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg', POSTGRES_DATABASE: 'jenfu_prod', POSTGRES_IAM_LOGIN: profile.migrations.serviceAccount.replace('.gserviceaccount.com', ''), POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg' }
  const deployment = { migrationRunnerDigest: `runner@sha256:${H64}`, migrationBundleRef: { uri: `gs://${bucket}/source/migration-bundles/retry.json`, sha256: H64 }, sourceRevision: H40 }
  const outputUri = `gs://${bucket}/receipts/retry-migrate.json`
  const principalOnlyFenceRef = fenced ? { uri: `gs://${bucket}/receipts/releases/DEV121-PRINCIPAL-ONLY-MIGRATION-FENCE/retry.json`, sha256: H64 } : null
  const args = ['--bundle-ref', deployment.migrationBundleRef.uri, '--bundle-sha256', H64, '--source-revision', H40, '--output-ref', outputUri]
  const fenceEnv = fenced ? { DEV121_MIGRATION_FENCE_REF: principalOnlyFenceRef.uri, DEV121_MIGRATION_FENCE_SHA256: H64 } : {}
  const container = { name: 'migration', image: deployment.migrationRunnerDigest, env: Object.entries(environment).map(([name, value]) => ({ name, value })), volumeMounts: [{ name: 'cloudsql', mountPath: '/cloudsql' }] }
  const job = { name: jobName, template: { taskCount: 1, parallelism: 1, template: { serviceAccount: profile.migrations.serviceAccount, maxRetries: 0, timeout: '1800s', containers: [container], volumes: [{ name: 'cloudsql', cloudSqlInstance: { instances: [environment.CLOUD_SQL_INSTANCE_CONNECTION_NAME] } }] } } }
  const active = { name: `${jobName}/executions/prior`, createTime: '2026-10-08T00:00:00Z', template: { containers: [{ name: 'migration', image: deployment.migrationRunnerDigest, args, env: Object.entries({ ...environment, ...fenceEnv }).map(([name, value]) => ({ name, value })) }] }, conditions: [{ type: 'Completed', state: 'CONDITION_PENDING' }] }
  const completed = { ...structuredClone(active), completionTime: '2026-10-08T00:00:02Z', succeededCount: 1, failedCount: 0, conditions: [{ type: 'Completed', state: 'CONDITION_SUCCEEDED' }] }
  const failed = { ...structuredClone(completed), succeededCount: 0, failedCount: 1, conditions: [{ type: 'Completed', state: 'CONDITION_FAILED' }] }
  let initial = []
  if (prior === 'active') initial = [active]
  if (prior === 'completed') initial = [completed]
  if (prior === 'failed') initial = [failed]
  if (prior === 'multiple') initial = [active, { ...structuredClone(completed), name: `${jobName}/executions/prior-other` }]
  if (prior === 'unrelated-active' || prior === 'unrelated-completed') {
    const other = structuredClone(prior === 'unrelated-active' ? active : completed)
    other.template.containers[0].args[7] = `gs://${bucket}/receipts/other-attempt.json`; initial = [other]
  }
  if (prior === 'wrong-fence-active') {
    const other = structuredClone(active); other.template.containers[0].env.find(row => row.name === 'DEV121_MIGRATION_FENCE_SHA256').value = 'f'.repeat(64); initial = [other]
  }
  if (prior === 'wrong-base-env-active') {
    const other = structuredClone(active); other.template.containers[0].env.find(row => row.name === 'POSTGRES_DATABASE').value = 'sibling_prod'; initial = [other]
  }
  if (prior === 'wrong-image-active') {
    const other = structuredClone(active); other.template.containers[0].image = 'runner@sha256:' + 'f'.repeat(64); initial = [other]
  }
  const fresh = { ...structuredClone(completed), name: `${jobName}/executions/new` }
  let posts = 0, lists = 0, executionReads = 0, polls = 0
  const fetchImpl = migrationReceiptStorage(async (url, options = {}) => {
    const target = String(url)
    if (target === `https://run.googleapis.com/v2/${jobName}:run`) {
      assert.equal(options.method, 'POST'); posts++
      const body = JSON.parse(options.body)
      assert.deepEqual(body.overrides.containerOverrides[0].args, args)
      if (fenced) assert.deepEqual(body.overrides.containerOverrides[0].env, Object.entries(fenceEnv).map(([name, value]) => ({ name, value })))
      if (unknownPost) throw Error('MODELED_APPLIED_POST_RESPONSE_LOST')
      return json({ name: 'projects/jenfu-platform-prod/locations/asia-east1/operations/retry-run' })
    }
    assert.ok(!options.method || options.method === 'GET')
    if (target === `https://run.googleapis.com/v2/${jobName}/executions?pageSize=100`) {
      lists++
      if (unknownReadback && posts && lists === 2) throw Error('MODELED_UNKNOWN_EXECUTION_READBACK')
      return json({ executions: posts && !unknownReadback ? [...initial, fresh, ...(multipleFresh ? [{ ...fresh, name: `${jobName}/executions/new-other` }] : [])] : initial })
    }
    if (target === `https://run.googleapis.com/v2/${fresh.name}`) { executionReads++; return json(fresh) }
    if (target === `https://run.googleapis.com/v2/${active.name}`) {
      executionReads++; return json(prior === 'failed' ? failed : prior === 'active' && executionReads === 1 ? active : completed)
    }
    assert.equal(target, `https://run.googleapis.com/v2/${jobName}`); return json(job)
  })
  const transport = createOwnerTransport({ token: 'x'.repeat(32), sleep: async () => { polls++; assert.ok(polls <= 3) }, fetchImpl })
  return { transport, input: { profile, deployment, principalOnlyFenceRef, outputUri, deadlineAt: new Date(Date.now() + 30000).toISOString() }, active, completed,
    objects: fetchImpl.objects, counts: () => ({ posts, lists, executionReads, polls }) }
}

test('B24 migration retry adopts one matching active or completed execution and replay submits zero Jobs', async () => {
  for (const prior of ['active', 'completed']) {
    const h = migrationRetryHarness({ prior })
    const first = await h.transport.runMigrationJob(h.input)
    assert.equal(first.name, h.active.name)
    assert.equal(h.counts().posts, 0, prior)
    const second = await h.transport.runMigrationJob(h.input)
    assert.equal(first.name, h.active.name)
    assert.equal(second.name, first.name)
    assert.equal(first.providerOperationRef, null)
    assert.equal(h.counts().posts, 0, prior)
    assert.ok(h.counts().executionReads >= 2)
    assert.equal(h.counts().polls, prior === 'active' ? 1 : 0)
  }
})

test('B24 migration retry rejects multiple matches, unrelated active, wrong fence, base env and image before POST', async () => {
  for (const prior of ['multiple', 'unrelated-active', 'wrong-fence-active', 'wrong-base-env-active', 'wrong-image-active']) {
    const h = migrationRetryHarness({ prior, fenced: prior === 'wrong-fence-active' })
    const attempts = prior === 'wrong-image-active' ? 2 : 1
    for (let attempt = 0; attempt < attempts; attempt += 1)
      await assert.rejects(h.transport.runMigrationJob(h.input), prior === 'multiple' ? /MIGRATION_EXECUTION_CARDINALITY_INVALID/u : /MIGRATION_EXECUTION_ACTIVE/u)
    assert.deepEqual(h.counts(), { posts: 0, lists: attempts, executionReads: 0, polls: 0 }, prior)
    assert.equal(h.objects.size, prior === 'multiple' ? 1 : 0, prior)
    if (prior === 'multiple') {
      const submission = JSON.parse([...h.objects.values()][0].bytes)
      assert.equal(submission.status, 'SUBMISSION_INTENT')
      assert.equal(submission.migrationRunnerDigest, h.input.deployment.migrationRunnerDigest)
      assert.equal(submission.outputUri, h.input.outputUri)
    }
  }
})

test('B24 migration retry observes the matching failure and never submits a replacement', async () => {
  const h = migrationRetryHarness({ prior: 'failed' })
  for (let retry = 0; retry < 2; retry++) await assert.rejects(h.transport.runMigrationJob(h.input), /MIGRATION_EXECUTION_FAILED/u)
  assert.deepEqual(h.counts(), { posts: 0, lists: 2, executionReads: 2, polls: 0 })
})

test('B24 migration permits a new exact Job after unrelated completed history and retains unknown POST cardinality', async () => {
  const allowed = migrationRetryHarness({ prior: 'unrelated-completed' })
  assert.match((await allowed.transport.runMigrationJob(allowed.input)).name, /\/executions\/new$/u)
  assert.equal(allowed.counts().posts, 1)
  const unknown = migrationRetryHarness({ prior: 'none', unknownPost: true })
  const result = await unknown.transport.runMigrationJob(unknown.input)
  assert.equal(result.providerOperationRef, 'OUTCOME_UNKNOWN_EXECUTION_READBACK')
  assert.equal(unknown.counts().posts, 1)
  assert.equal((await unknown.transport.runMigrationJob(unknown.input)).name, result.name)
  assert.equal(unknown.counts().posts, 1)
  const ambiguous = migrationRetryHarness({ prior: 'none', unknownPost: true, multipleFresh: true })
  await assert.rejects(ambiguous.transport.runMigrationJob(ambiguous.input), /MIGRATION_EXECUTION_CARDINALITY_INVALID/u)
  assert.equal(ambiguous.counts().posts, 1)
})

test('B24 durable migration submission without a matching execution remains UNKNOWN and cannot POST again', async () => {
  const h = migrationRetryHarness({ prior: 'none', unknownPost: true, unknownReadback: true })
  await assert.rejects(h.transport.runMigrationJob(h.input), /OUTCOME_UNKNOWN/u)
  assert.equal(h.counts().posts, 1)
  assert.equal(h.objects.size, 1)
  const value = JSON.parse([...h.objects.values()][0].bytes)
  assert.equal(value.schemaVersion, 'jenfu.dev012.migration-submission-intent.v1')
  assert.equal(value.status, 'SUBMISSION_INTENT')
  assert.equal(value.outputUri, h.input.outputUri)
  await assert.rejects(h.transport.runMigrationJob(h.input), /MIGRATION_SUBMISSION_UNKNOWN/u)
  assert.equal(h.counts().posts, 1)
  assert.equal(h.counts().executionReads, 0)
})

test('B24 migration submission readback rejects tampered or resealed source, Job, output, arguments and fence', async () => {
  for (const mutation of ['source', 'job', 'output', 'args', 'bundle', 'fence', 'hash', 'extra']) {
    const h = migrationRetryHarness({ prior: 'completed' })
    await h.transport.runMigrationJob(h.input)
    assert.equal(h.counts().posts, 0)
    const row = [...h.objects.values()][0], value = JSON.parse(row.bytes)
    if (mutation === 'source') value.sourceRevision = 'f'.repeat(40)
    if (mutation === 'job') value.jobName = value.jobName.replace('platform-prod-migration-runner', 'sibling-migration-runner')
    if (mutation === 'output') value.outputUri = `gs://${bucket}/receipts/different-migrate.json`
    if (mutation === 'args') value.args[7] = `gs://${bucket}/receipts/different-migrate.json`
    if (mutation === 'bundle') value.migrationBundleRef.sha256 = 'f'.repeat(64)
    if (mutation === 'fence') value.principalOnlyFenceRef = { uri: `gs://${bucket}/receipts/releases/DEV121-PRINCIPAL-ONLY-MIGRATION-FENCE/forged.json`, sha256: H64 }
    if (mutation === 'extra') value.override = true
    if (mutation !== 'hash') { delete value.receiptSha256; value.receiptSha256 = sha256(canonicalize(value)) } else value.receiptSha256 = 'f'.repeat(64)
    row.bytes = Buffer.from(`${canonicalize(value)}\n`); row.crc32c = crc32cBase64(row.bytes)
    await assert.rejects(h.transport.runMigrationJob(h.input), /MIGRATION_SUBMISSION_INTENT_INVALID/u, mutation)
    assert.deepEqual(h.counts(), { posts: 0, lists: 2, executionReads: 1, polls: 0 }, mutation)
  }
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

test('effective revision accepts a provider-coalesced tagged status only when the explicit 100% target agrees', () => {
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async () => json({}) })
  const coalesced = {
    traffic: [
      { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: 'candidate-1', percent: 100 },
      { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: 'candidate-1', percent: 0, tag: 'candidate-abc' },
    ],
    trafficStatuses: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: 'candidate-1', percent: 100, tag: 'candidate-abc', uri: 'https://candidate.example.invalid' }],
  }
  assert.equal(transport.effectiveRevision(coalesced), 'candidate-1')
  assert.throws(() => transport.effectiveRevision({ ...coalesced, trafficStatuses: [{ revision: 'other-1', percent: 100, tag: 'candidate-abc' }] }), /EFFECTIVE_REVISION_AMBIGUOUS/u)
  assert.throws(() => transport.effectiveRevision({ ...coalesced, traffic: [{ revision: 'candidate-1', percent: 100, tag: 'candidate-abc' }] }), /EFFECTIVE_REVISION_AMBIGUOUS/u)
  assert.throws(() => transport.effectiveRevision({ ...coalesced, trafficStatuses: [{ latestRevision: true, percent: 100 }] }), /EFFECTIVE_REVISION_AMBIGUOUS/u)
})

test('Principal-only activation uses one scaling-and-traffic mutation and never exposes the old revision', async () => {
  const target = {
    target: { projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName: 'ai-pdm-prod' },
    runtime: { containerName: 'ai-pdm' },
  }
  const serviceName = 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod'
  const old = 'ai-pdm-prod-legacy'
  const candidate = 'ai-pdm-prod-abcdef123456'
  const recovery = 'ai-pdm-prod-recovery'
  const tag = 'candidate-abcdef123456'
  const image = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-recovery@sha256:${'a'.repeat(64)}`
  const oldTraffic = { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: old, percent: 100 }
  const tagTraffic = { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidate, tag }
  const before = {
    name: serviceName, uid: 'd65f379b-a342-4eb3-ba22-109aa5f368c5', etag: 'etag-one', generation: '41', observedGeneration: '41',
    reconciling: false, terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    scaling: { scalingMode: 'MANUAL', manualInstanceCount: 0 },
    template: { containers: [{ name: 'ai-pdm', image: 'candidate-image' }] },
    traffic: [oldTraffic, tagTraffic], trafficStatuses: [oldTraffic, tagTraffic],
  }
  let patched = null
  let serviceReads = 0
  const fetchImpl = async (url, options = {}) => {
    if (String(url).endsWith(`/revisions/${recovery}`)) return json({
      name: `${serviceName}/revisions/${recovery}`, service: serviceName,
      conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }],
      containers: [{ name: 'ai-pdm', image }],
    })
    if (options.method === 'PATCH') {
      assert.match(String(url), /updateMask=scaling%2Ctraffic/u)
      patched = JSON.parse(options.body)
      return json({ name: 'projects/jenfu-platform-prod/locations/asia-east1/operations/op-one' })
    }
    serviceReads += 1
    return json(serviceReads === 1 ? before : {
      ...before, etag: 'etag-two', generation: '42', observedGeneration: '42',
      scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 },
      traffic: [
        { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidate, percent: 100 },
        { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidate, tag },
      ],
      trafficStatuses: [{ revision: candidate, percent: 100, tag }],
    })
  }
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl, sleep: async () => undefined })
  const after = await transport.activatePrincipalOnly({ profile: target, oldRevision: old,
    recovery: { revision: recovery, imageDigest: image, serviceUid: before.uid }, candidateRevision: candidate,
    candidateTag: tag, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.deepEqual(Object.keys(patched).sort(), ['etag', 'name', 'scaling', 'traffic'])
  assert.deepEqual(patched.scaling, { scalingMode: 'AUTOMATIC', manualInstanceCount: null,
    maxInstanceCount: 1 })
  assert.equal(patched.traffic.some((row) => row.revision === old), false)
  assert.equal(transport.effectiveRevision(after), candidate)
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
    return json({ name: `projects/${profile.target.projectId}/locations/${profile.target.region}${endpoint}`, service: profile.target.serviceName })
  } })
  assert.equal((await transport.getRevision(profile, revision)).name.endsWith(`/revisions/${revision}`), true)
  await assert.rejects(() => transport.getRevision(profile, 'latest'), /REVISION_TARGET_INVALID/u)
  const artifact = `${profile.artifact.uri}@sha256:${H64}`
  const resolvedProxyImage = `proxy@sha256:${'d'.repeat(64)}`
  const ready = { containers: [{ name: 'platform', image: artifact }, { name: 'cloud-sql-proxy', image: resolvedProxyImage }], conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] }
  assert.equal(transport.assertRevisionReady(profile, ready, artifact), ready)
  assert.equal(transport.assertRevisionReady(profile, ready, artifact, resolvedProxyImage), ready)
  assert.throws(() => transport.assertRevisionReady(profile, ready, artifact, `proxy@sha256:${'e'.repeat(64)}`), /CANDIDATE_REVISION_READBACK_MISMATCH/u)
  const wrongRepository = structuredClone(ready)
  wrongRepository.containers[1].image = `other-proxy@sha256:${'d'.repeat(64)}`
  assert.throws(() => transport.assertRevisionReady(profile, wrongRepository, artifact), /CANDIDATE_REVISION_READBACK_MISMATCH/u)
  assert.throws(() => transport.assertRevisionReady(profile, { containers: ready.containers, conditions: [] }, artifact), /CANDIDATE_REVISION_READBACK_MISMATCH/u)
})

test('runtime config carries a complete secret-safe two-container template', () => {
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } })
  assert.deepEqual(assertRuntimeConfig(profile, runtimeConfig), runtimeConfig.template)
  assert.throws(() => buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'development' }, secretVersions: { SESSION_SECRET: '1' } }), /RUNTIME_CONFIG_READBACK_MISMATCH/u)
  const mutable = structuredClone(runtimeConfig)
  mutable.template.containers[1].image = 'proxy:latest'
  assert.throws(() => assertRuntimeConfig(profile, mutable), /RUNTIME_CONFIG_READBACK_MISMATCH/u)
})

test('candidate accepts a provider-derived tag URI while replacing a holding template at zero traffic', async () => {
  const artifact = `${profile.artifact.uri}@sha256:${H64}`
  const candidateRevision = `${profile.target.serviceName}-${H64.slice(0, 12)}`
  const candidateTag = `candidate-${H64.slice(0, 12)}`
  const candidateUri = `https://${candidateTag}---jenfu-platform-prod-9536592944.asia-east1.run.app`
  const providerUri = 'https://jenfu-platform-prod-56gnizku7q-de.a.run.app'
  const providerCandidateUri = 'https://' + candidateTag + '---jenfu-platform-prod-56gnizku7q-de.a.run.app'
  const serviceName = `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`
  const settled = { name: serviceName, reconciling: false, generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' } }
  const before = { ...settled, etag: 'e1', template: { serviceAccount: 'holding@example.invalid', containers: [{ name: 'holding', image: 'holding@sha256:' + '0'.repeat(64) }] }, traffic: [{ revision: 'holding-1', percent: 100 }], trafficStatuses: [{ revision: 'holding-1', percent: 100 }] }
  const created = { ...before, etag: 'e2', latestCreatedRevision: candidateRevision, uri: providerUri, urls: [profile.target.canonicalOrigin, providerUri] }
  const tagged = { ...created, etag: 'e3', traffic: [...before.traffic, { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidateRevision, percent: 0, tag: candidateTag }], trafficStatuses: [...before.trafficStatuses, { revision: candidateRevision, percent: 0, tag: candidateTag, uri: providerCandidateUri }] }
  const reads = [before, created, created, tagged, tagged]
  const patches = []
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (url, options = {}) => {
    if (options.method === 'PATCH') { patches.push(JSON.parse(options.body)); return json({ name: `projects/${profile.target.projectId}/locations/${profile.target.region}/operations/patch-${patches.length}`, done: true, response: {} }) }
    if (String(url).includes('/revisions/')) return json({ name: `${serviceName}/revisions/${candidateRevision}`, service: serviceName, serviceAccount: patches[0].template.serviceAccount, containers: patches[0].template.containers, conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] })
    return json(reads.shift())
  } })
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } })
  const result = await transport.createCandidate({ profile, artifactDigest: artifact, runtimeConfig, fingerprint: H64, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(result.previousRevision, 'holding-1')
  assert.equal(patches[0].template.containers.find((row) => row.name === 'platform').image, artifact)
  assert.equal(patches[0].template.containers.length, 2)
  assert.deepEqual(patches[1].traffic.filter((row) => !row.tag), before.traffic)
})

test('candidate accepts an omitted provider tag URI only while the default URI is disabled', async () => {
  const fingerprint = H64
  const candidateRevision = `jenfu-platform-prod-${fingerprint.slice(0, 12)}`
  const tag = `candidate-${fingerprint.slice(0, 12)}`
  const tagUri = `https://${tag}---jenfu-platform-prod-9536592944.asia-east1.run.app`
  const artifactDigest = `${profile.artifact.uri}@sha256:${H64}`
  const settled = { reconciling: false, generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' } }
  const before = { ...settled, name: `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`, etag: 'e1', defaultUriDisabled: true, template: { serviceAccount: profile.target.runtimeServiceAccount, containers: [{ image: 'old@sha256:' + H64, env: [{ name: 'KEEP', value: 'yes' }] }] }, traffic: [{ revision: 'previous-1', percent: 100 }], trafficStatuses: [{ revision: 'previous-1', percent: 100 }] }
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } })
  const expectedTemplate = structuredClone(runtimeConfig.template)
  expectedTemplate.revision = candidateRevision
  const expectedApp = expectedTemplate.containers.find((container) => container.name === profile.runtime.containerName)
  expectedApp.image = artifactDigest
  expectedApp.env.push({ name: profile.environment.candidateOriginEnvironmentName, value: tagUri })
  const created = { ...before, generation: '2', observedGeneration: '2', etag: 'e2', template: expectedTemplate, latestCreatedRevision: candidateRevision }
  const tagged = { ...created, generation: '3', observedGeneration: '3', etag: 'e3', traffic: [...before.traffic, { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidateRevision, tag }], trafficStatuses: [...before.trafficStatuses, { revision: candidateRevision, tag }] }
  let serviceGets = 0
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async (url, options = {}) => {
    const value = String(url)
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body)
      if (value.includes('updateMask=template')) assert.deepEqual(body.template, expectedTemplate)
      return json({ name: 'projects/p/locations/r/operations/patch', done: true, response: {} })
    }
    if (value.includes('/revisions/')) return json({ name: `${before.name}/revisions/${candidateRevision}`, service: before.name, serviceAccount: expectedTemplate.serviceAccount, containers: expectedTemplate.containers, conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] })
    return json([before, created, created, tagged, tagged][serviceGets++])
  } })
  const result = await transport.createCandidate({ profile, artifactDigest, runtimeConfig, fingerprint, deadlineAt: '2999-01-01T00:00:00.000Z' })
  assert.equal(result.tagUri, tagUri)
  assert.equal(result.previousRevision, 'previous-1')
})

test('entrypoint patch uses the exact mask, preserves template/traffic, and unknown outcome is read back once', async () => {
  const tag = 'candidate-bbbbbbbbbbbb'
  const tagUri = `https://${tag}---jenfu-platform-prod-9536592944.asia-east1.run.app`
  const base = { name: `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`, etag: 'e1', reconciling: false, generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' }, ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY', defaultUriDisabled: true, invokerIamDisabled: false, uri: null, urls: [], template: { containers: [{ image: 'old' }] }, traffic: [{ revision: 'previous-1', percent: 100 }, { revision: 'candidate-1', percent: 0, tag }], trafficStatuses: [{ revision: 'previous-1', percent: 100 }, { revision: 'candidate-1', percent: 0, tag }] }
  const providerUri = 'https://jenfu-platform-prod-provider-de.a.run.app'
  const direct = { ...base, etag: 'e2', generation: '2', observedGeneration: '2', ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: undefined, invokerIamDisabled: true, uri: providerUri, urls: [profile.target.canonicalOrigin, providerUri], trafficStatuses: base.trafficStatuses.map((row) => row.tag === tag ? { ...row, uri: tagUri } : row) }
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
  const providerUri = 'https://jenfu-platform-prod-provider-de.a.run.app'
  const direct = { ...baseline, etag: 'e2', generation: '2', observedGeneration: '2', ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: undefined, invokerIamDisabled: true, uri: providerUri, urls: [profile.target.canonicalOrigin, providerUri] }

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
  const canonicalWorkflow = 'projects/9536592944/locations/asia-east1/workflows/platform-prod-candidate-smoke'
  const executionName = canonicalWorkflow + '/executions/execution-1'
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
    if (String(url).startsWith('https://run.googleapis.com/v2/projects/jenfu-platform-prod/locations/asia-east1/services/jenfu-platform-prod')) {
      return json({ uri: 'https://jenfu-platform-prod-abc-de.a.run.app' })
    }
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
    target: { projectId: 'jenfu-platform-prod', projectNumber: '9536592944', region: 'asia-east1', serviceName: 'jenfu-platform-prod', canonicalOrigin: 'https://jenfu-platform-prod-9536592944.asia-east1.run.app' },
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
    origin: 'https://' + tag + '---jenfu-platform-prod-9536592944.asia-east1.run.app',
    candidateTag: tag,
    candidateRevision: revision,
    artifactDigest: digest,
    deadlineAt: '2999-01-01T00:00:00.000Z',
    environment: { FIREBASE_API_KEY: 'A'.repeat(39) },
  })
  assert.equal(smoke.status, 'PASS')
  assert.equal(smoke.executionName, executionName)
  assert.equal(JSON.parse(createBody.argument).candidateRevision, revision)
  assert.equal(JSON.parse(createBody.argument).candidateOrigin, 'https://' + tag + '---jenfu-platform-prod-abc-de.a.run.app')
  assert.doesNotMatch(JSON.stringify(smoke), /firebaseApiKey|refreshToken|idToken|sessionCookie/u)
})


test('legacy one-field endpoint mutations are not exposed by the V3 transport', () => {
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: async () => json({}) })
  assert.equal(transport.prepareCandidateEndpoint, undefined)
  assert.equal(transport.enableCanonicalIngress, undefined)
})

test('candidate readback verifies exact workload environment, Secret versions and absence of loader overrides', () => {
  const runtimeConfig = buildRuntimeConfig(profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } })
  const artifact = profile.artifact.uri + '@sha256:' + H64
  const origin = 'https://candidate-bbbbbbbbbbbb---jenfu-platform-prod-9536592944.asia-east1.run.app'
  const expected = structuredClone(runtimeConfig.template)
  expected.containers[0].image = artifact
  expected.containers[0].env.push({ name: profile.environment.candidateOriginEnvironmentName, value: origin })
  const ready = { ...expected, conditions: [{ type:'Ready',state:'CONDITION_SUCCEEDED' }] }
  const transport = createOwnerTransport({ token:'x'.repeat(32) })
  const binding = { runtimeConfig, origin }
  assert.equal(transport.assertRevisionReady(profile, ready, artifact, null, binding), ready)
  const reordered = structuredClone(ready)
  reordered.containers.reverse()
  reordered.containers.find(row => row.name === profile.runtime.containerName).env.reverse()
  assert.equal(transport.assertRevisionReady(profile, reordered, artifact, null, binding), reordered)
  const qualified = structuredClone(ready)
  qualified.containers[0].env.find(row => row.valueSource).valueSource.secretKeyRef.secret = 'projects/' + profile.target.projectNumber + '/secrets/' + profile.environment.allowedSecretIds.SESSION_SECRET
  assert.equal(transport.assertRevisionReady(profile, qualified, artifact, null, binding), qualified)
  const changes = [
    row => row.containers[0].env.push({name:'LD_PRELOAD',value:'/tmp/untrusted.so'}),
    row => row.containers[0].env.push({name:'NODE_OPTIONS',value:'--require=/tmp/untrusted.cjs'}),
    row => row.containers[0].env.pop(),
    row => row.containers[0].env.push(row.containers[0].env[0]),
    row => { row.containers[0].env.find(value => value.valueSource).valueSource.secretKeyRef.version = 'latest' },
    row => { row.containers[0].env.find(value => value.valueSource).valueSource.secretKeyRef.secret = 'orgmaster-prod-session-current' },
    row => { row.containers[0].command = ['/untrusted'] },
    row => { row.containers[0].args = ['--require=/tmp/untrusted.cjs'] },
    row => { row.containers[1].args = ['--unsafe'] },
    row => { row.containers[0].volumeMounts = [{name:'extra',mountPath:'/app'}] },
    row => { row.volumes = [{name:'extra',emptyDir:{}}] },
    row => { row.serviceAccount = 'orgmaster-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com' },
  ]
  for (const change of changes) {
    const drifted = structuredClone(ready)
    change(drifted)
    assert.throws(() => transport.assertRevisionReady(profile, drifted, artifact, null, binding), { code:'CANDIDATE_RUNTIME_READBACK_MISMATCH' })
  }
})

test('runtime config cannot inject alternate native loaders through plain or Secret bindings', () => {
  for (const name of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'LD_AUDIT', 'NODE_OPTIONS', 'NODE_PATH', 'GLIBC_TUNABLES', 'GCONV_PATH', 'VIPS_PATH', 'SHARP_FORCE_GLOBAL_LIBVIPS']) {
    for (const kind of ['plain', 'secret']) {
      const changed = structuredClone(profile)
      const plainEnvironment = { NODE_ENV: 'production' }
      const secretVersions = { SESSION_SECRET: '1' }
      if (kind === 'plain') {
        changed.environment.requiredPlainEnvironmentNames.push(name)
        plainEnvironment[name] = '/unreviewed/loader.so'
      } else {
        changed.environment.requiredSecretNames.push(name)
        changed.environment.allowedSecretIds[name] = 'platform-prod-injected-loader'
        secretVersions[name] = '1'
      }
      assert.throws(() => buildRuntimeConfig(changed, { plainEnvironment, secretVersions }), /RUNTIME_CONFIG_READBACK_MISMATCH/u)
    }
  }
})

test('aligned-new assessment requires source identity; unrelated or escalated scanner findings still reject before inspection', async () => {
  const digest = `${profile.artifact.uri}@sha256:${H64}`
  const occurrence = { name: 'projects/jenfu-platform-prod/occurrences/aligned-new', resourceUri: `https://${digest}`, kind: 'VULNERABILITY', noteName: 'projects/goog-vulnz/notes/CVE-2026-95619', vulnerability: { effectiveSeverity: 'HIGH', shortDescription: 'CVE-2026-95619', packageIssue: [{ affectedPackage: 'gcc-14', packageType: 'OS', affectedCpeUri: 'cpe:/o:debian:debian_linux:13', affectedVersion: { fullName: '14.2.0-19' } }] } }
  let writes = 0
  const make = (finding) => createOwnerTransport({ token: 'x'.repeat(32), sleep: async () => undefined, fetchImpl: async (url, options = {}) => {
    if (options.method === 'POST') { writes += 1; throw new Error('UNEXPECTED_WRITE') }
    const kind = /^kind="([A-Z_]+)"/u.exec(new URL(String(url)).searchParams.get('filter') ?? '')?.[1]
    return json({ occurrences: kind === 'VULNERABILITY' ? [finding] : kind === 'DISCOVERY' ? [{ kind, resourceUri: `https://${digest}`, discovery: { analysisStatus: 'FINISHED_SUCCESS' } }] : [] })
  } })
  await assert.rejects(() => make(occurrence).waitArtifactEvidence({ profile, artifactDigest: digest, deadlineAt: '2999-01-01T00:00:00.000Z' }), /ARTIFACT_POLICY_FAILED/u)
  for (const mutate of [
    row => row.vulnerability.effectiveSeverity = 'CRITICAL',
    row => row.noteName = 'projects/goog-vulnz/notes/CVE-OTHER',
    row => row.vulnerability.packageIssue[0].affectedPackage = 'unrelated-package',
    row => row.vulnerability.packageIssue[0].affectedVersion.fullName = '14.2.0-20',
  ]) {
    const changed = structuredClone(occurrence); mutate(changed)
    await assert.rejects(() => make(changed).waitArtifactEvidence({ profile, sourceRevision: H40, artifactDigest: digest, deadlineAt: '2999-01-01T00:00:00.000Z' }), /ARTIFACT_POLICY_FAILED/u)
  }
  assert.equal(writes, 0)
})


test('B27 build readback uses verifier only for fixed live GETs and retains builder mutations', async () => {
  const builder = 'MODELED-B27-BUILDER-TOKEN', verifier = 'MODELED-B27-VERIFIER-TOKEN', calls = []
  const service = 'https://run.googleapis.com/v2/projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod'
  const job = 'https://run.googleapis.com/v2/projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata'
  const scheduler = 'https://cloudscheduler.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/jobs/aipdm-prod-openswx-dispatch'
  const ownProfile = { application: { id: 'ai-pdm' }, target: { projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName: 'ai-pdm-prod' }, artifact: { releaseBucket: 'jenfu-platform-prod-aipdm-release' } }
  const transport = createAiPdmBuildReadbackTransport({ token: builder, verifierReadbackToken: verifier, fetchImpl: async (url, options) => {
    calls.push({ url, method: options.method ?? 'GET', token: options.headers.authorization, redirect: options.redirect })
    if (url.endsWith('/revisions/ai-pdm-prod-0123456789ab')) return json({ name: url.slice('https://run.googleapis.com/v2/'.length), service: 'ai-pdm-prod' })
    return json({ ok: true })
  } })
  for (const url of [scheduler, job, service, `${service}/revisions/ai-pdm-prod-0123456789ab`, `${job}/executions?pageSize=100`, `${job}/executions?pageSize=100&pageToken=next`, `${job}/executions/execution-one`, `${job.replace('jenfu-platform-prod', '9536592944')}/executions/execution-one`]) {
    await transport.request(url)
    assert.equal(calls.at(-1).token, `Bearer ${verifier}`)
    assert.equal(calls.at(-1).redirect, 'error')
  }
  await transport.getService(ownProfile)
  await transport.getRevision(ownProfile, 'ai-pdm-prod-0123456789ab')
  assert.equal(calls.at(-1).token, `Bearer ${verifier}`)
  for (const [url, options] of [[scheduler, { method: 'POST' }], [job, { method: 'PATCH', body: '{}' }], [service, { method: 'DELETE' }], [job + ':run', { method: 'POST' }], [scheduler + ':resume', { method: 'POST' }], [job + ':getIamPolicy', {}], [job + '/executions?pageSize=100&filter=other', {}], [job + '/executions?pageSize=100&pageSize=100', {}], [job + '/executions?pageSize=100#fragment', {}], [service.replace('ai-pdm-prod', 'jenfu-platform-prod'), {}], [service.replace('jenfu-platform-prod', 'other-project'), {}], [service.replace('run.googleapis.com', 'runXgoogleapisXcom') + '/revisions/ai-pdm-prod-0123456789ab', {}], [service + '/revisions/latest', {}], ['https://cloudbuild.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/builds/own-build', {}], ['https://artifactregistry.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/repositories/aipdm-release', {}], ['https://secretmanager.googleapis.com/v1/projects/jenfu-platform-prod/secrets/own/versions/1:access', {}]]) {
    await transport.request(url, options)
    assert.equal(calls.at(-1).token, `Bearer ${builder}`, url)
  }
  const before = calls.length
  for (const changed of [{ ...ownProfile, application: { id: 'platform' } }, { ...ownProfile, target: { ...ownProfile.target, projectId: 'other-project' } }, { ...ownProfile, target: { ...ownProfile.target, serviceName: 'jenfu-platform-prod' } }, { ...ownProfile, artifact: { releaseBucket: 'other-bucket' } }]) {
    assert.throws(() => transport.getService(changed), { code: 'BUILD_READBACK_TARGET_INVALID' })
    assert.throws(() => transport.readOwnerSourceProof({ profile: changed }), { code: 'BUILD_READBACK_TARGET_INVALID' })
  }
  assert.throws(() => transport.getRevision(ownProfile, 'latest'), { code: 'BUILD_READBACK_TARGET_INVALID' })
  assert.equal(calls.length, before)
  for (const value of ['', builder]) assert.throws(() => createAiPdmBuildReadbackTransport({ token: builder, verifierReadbackToken: value }), { code: 'BUILD_READBACK_TOKEN_INVALID' })
})

test('B27 verifier denial and timeout fail without a mutation or builder fallback', async () => {
  for (const mode of ['denied', 'timeout']) {
    const calls = []
    const transport = createAiPdmBuildReadbackTransport({ token: 'MODELED-B27-BUILDER-TOKEN', verifierReadbackToken: 'MODELED-B27-VERIFIER-TOKEN', fetchImpl: async (url, options) => {
      calls.push({ url, method: options.method ?? 'GET', token: options.headers.authorization })
      if (mode === 'timeout') throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
      return json({}, 403)
    } })
    await assert.rejects(transport.request('https://cloudscheduler.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/jobs/aipdm-prod-openswx-dispatch'), { code: mode === 'denied' ? 'DENIED' : 'OUTCOME_UNKNOWN' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].method, 'GET')
    assert.equal(calls[0].token, 'Bearer MODELED-B27-VERIFIER-TOKEN')
  }
})
