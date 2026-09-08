import { canonicalize, crc32cBase64, parseGsUri, sha256 } from './dev012-production-migration-runner.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const APPLICATION_IMAGE_PLACEHOLDER = 'APPLICATION_IMAGE_DIGEST'

export class OwnerReleaseError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code)
    this.code = code
  }
}

function fail(code, detail = '') {
  throw new OwnerReleaseError(code, detail)
}

function sleepDefault(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function typedProviderCode(status) {
  if (status === 401) return 'AUTH_REQUIRED'
  if (status === 403) return 'DENIED'
  if (status === 404) return 'MISSING'
  if (status === 409 || status === 412) return 'CONFLICT'
  if (status === 429) return 'QUOTA_OR_RATE_LIMIT'
  if (status >= 500) return 'OUTCOME_UNKNOWN'
  return 'PROVIDER_REQUEST_FAILED'
}

export function immutableRef(uri, bytes) {
  return { uri, sha256: sha256(bytes) }
}

export function assertImmutableRef(value, bucket, prefixes = ['receipts']) {
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'sha256,uri' || !H64.test(value.sha256 ?? '')) fail('IMMUTABLE_REF_INVALID')
  const match = /^gs:\/\/([^/]+)\/(.+)$/u.exec(value.uri ?? '')
  if (!match || match[1] !== bucket || !prefixes.some((prefix) => match[2].startsWith(`${prefix}/`)) || match[2].includes('..')) fail('IMMUTABLE_REF_INVALID')
  return value
}

export function assertProtectedGitHubContext(profile, intent, environment) {
  const expectedRef = `refs/heads/${profile.application.branch}`
  const expectedWorkflowRef = `${profile.application.repository}/${profile.workflow.path}@${expectedRef}`
  if (environment.GITHUB_ACTIONS !== 'true' || !environment.ACTIONS_ID_TOKEN_REQUEST_URL || !environment.GOOGLE_OAUTH_ACCESS_TOKEN) fail('PROTECTED_WORKFLOW_REQUIRED')
  if (environment.GITHUB_REPOSITORY !== profile.application.repository || environment.GITHUB_SHA !== intent.sourceRevision || environment.GITHUB_WORKFLOW_SHA !== intent.sourceRevision || environment.GITHUB_WORKFLOW_REF !== expectedWorkflowRef || environment.GITHUB_REF !== expectedRef || environment.GITHUB_EVENT_NAME !== 'workflow_dispatch') fail('GITHUB_SOURCE_AUTHORITY_MISMATCH')
  if (!H40.test(environment.GITHUB_SHA ?? '') || !/^[0-9]+$/u.test(environment.GITHUB_REPOSITORY_ID ?? '') || !/^[0-9]+$/u.test(environment.GITHUB_REPOSITORY_OWNER_ID ?? '') || !/^[0-9]+$/u.test(environment.GITHUB_RUN_ID ?? '') || !/^[0-9]+$/u.test(environment.GITHUB_RUN_ATTEMPT ?? '')) fail('GITHUB_PUBLISHER_IDENTITY_MISSING')
  return true
}

function runtimeTemplate(profile, plainEnvironment, secretVersions) {
  const code = 'RUNTIME_CONFIG_READBACK_MISMATCH'
  const requiredPlain = profile.environment?.requiredPlainEnvironmentNames ?? profile.environment?.requiredNames ?? []
  const allowedSecrets = profile.environment?.allowedSecretIds ?? profile.environment?.secretIds ?? {}
  const requiredSecrets = profile.environment?.requiredSecretNames ?? Object.keys(allowedSecrets)
  if (!plainEnvironment || !secretVersions
    || canonicalize(Object.keys(plainEnvironment).sort()) !== canonicalize([...requiredPlain].sort())
    || canonicalize(Object.keys(secretVersions).sort()) !== canonicalize([...requiredSecrets].sort())
    || Object.values(plainEnvironment).some((value) => typeof value !== 'string')
    || Object.values(secretVersions).some((value) => !/^[1-9][0-9]*$/u.test(String(value)))) fail(code)
  const port = profile.runtime.port
  const proxyPort = profile.runtime.cloudSqlProxyPort
  const project = profile.target.projectId
  return {
    serviceAccount: profile.target.runtimeServiceAccount,
    executionEnvironment: 'EXECUTION_ENVIRONMENT_GEN2',
    maxInstanceRequestConcurrency: profile.runtime.concurrency,
    timeout: `${profile.runtime.timeoutSeconds}s`,
    scaling: { minInstanceCount: 0, maxInstanceCount: profile.runtime.maxInstances },
    vpcAccess: {
      egress: 'ALL_TRAFFIC',
      networkInterfaces: [{
        network: `projects/${project}/global/networks/${profile.runtime.network}`,
        subnetwork: `projects/${project}/regions/${profile.target.region}/subnetworks/${profile.runtime.subnet}`,
      }],
    },
    containers: [
      {
        name: profile.runtime.containerName,
        image: APPLICATION_IMAGE_PLACEHOLDER,
        dependsOn: [profile.runtime.cloudSqlProxyContainer],
        ports: [{ name: 'http1', containerPort: port }],
        env: [
          ...requiredPlain.map((name) => ({ name, value: plainEnvironment[name] })),
          ...requiredSecrets.map((name) => ({ name, valueSource: { secretKeyRef: { secret: allowedSecrets[name], version: String(secretVersions[name]) } } })),
        ],
        resources: { limits: { cpu: profile.runtime.cpu, memory: profile.runtime.memory }, cpuIdle: true, startupCpuBoost: true },
        startupProbe: { initialDelaySeconds: 0, timeoutSeconds: 2, periodSeconds: 5, failureThreshold: 24, httpGet: { path: profile.runtime.startupProbePath, port } },
      },
      {
        name: profile.runtime.cloudSqlProxyContainer,
        image: profile.runtime.cloudSqlProxyImage,
        args: ['--address=0.0.0.0', `--port=${proxyPort}`, '--private-ip', '--auto-iam-authn', '--lazy-refresh', '--structured-logs', `--max-connections=${profile.runtime.cloudSqlProxyMaximumConnections}`, profile.runtime.cloudSqlConnectionName],
        resources: { limits: { cpu: '1', memory: '256Mi' }, cpuIdle: true, startupCpuBoost: true },
        startupProbe: { initialDelaySeconds: 1, timeoutSeconds: 2, periodSeconds: 3, failureThreshold: 20, tcpSocket: { port: proxyPort } },
      },
    ],
  }
}

export function buildRuntimeConfig(profile, { plainEnvironment, secretVersions }) {
  const template = runtimeTemplate(profile, plainEnvironment, secretVersions)
  return {
    runtimeServiceAccount: profile.target.runtimeServiceAccount,
    applicationContainerName: profile.runtime.containerName,
    cloudSqlProxyContainerName: profile.runtime.cloudSqlProxyContainer,
    cloudSqlProxyImage: profile.runtime.cloudSqlProxyImage,
    plainEnvironment: structuredClone(plainEnvironment),
    secretVersions: structuredClone(secretVersions),
    serviceTemplateSha256: sha256(canonicalize(template)),
    template,
  }
}

export function assertRuntimeConfig(profile, runtimeConfig) {
  const code = 'RUNTIME_CONFIG_READBACK_MISMATCH'
  const template = runtimeConfig?.template
  const appName = profile?.runtime?.containerName
  const proxyName = profile?.runtime?.cloudSqlProxyContainer
  const proxyImage = profile?.runtime?.cloudSqlProxyImage
  if (!runtimeConfig || runtimeConfig.runtimeServiceAccount !== profile?.target?.runtimeServiceAccount
    || runtimeConfig.applicationContainerName !== appName
    || runtimeConfig.cloudSqlProxyContainerName !== proxyName
    || runtimeConfig.cloudSqlProxyImage !== proxyImage
    || !H64.test(runtimeConfig.serviceTemplateSha256 ?? '')
    || runtimeConfig.serviceTemplateSha256 !== sha256(canonicalize(template))
    || template?.revision != null) fail(code)
  let expected
  try { expected = runtimeTemplate(profile, runtimeConfig.plainEnvironment, runtimeConfig.secretVersions) } catch { fail(code) }
  if (canonicalize(template) !== canonicalize(expected)) fail(code)
  return structuredClone(template)
}

export function releasePaths(profile, intent, intentSha256) {
  if (!H64.test(intentSha256) || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(intent.releaseId ?? '')) fail('RELEASE_PATH_INPUT_INVALID')
  const root = `receipts/releases/${intent.releaseId}/${intentSha256}`
  const uri = (name) => `gs://${profile.artifact.releaseBucket}/${root}/${name}.json`
  return {
    root,
    prepare: uri('prepare'),
    build: uri('build'),
    provenance: uri('provenance'),
    sbom: uri('sbom'),
    scan: uri('scan'),
    deployment: uri('deployment-capsule'),
    migrate: uri('migrate'),
    candidate: uri('candidate'),
    verify: uri('verify'),
    decision: uri('decision'),
    activate: uri('activate'),
    canonical: uri('canonical'),
    finalize: uri('finalize'),
    rollback: uri('rollback'),
    terminal: uri('terminal'),
    control: `gs://${profile.artifact.releaseBucket}/control/active.json`,
  }
}

export function createOwnerTransport({ token, fetchImpl = fetch, sleep = sleepDefault, now = () => new Date().toISOString() }) {
  if (typeof token !== 'string' || token.length < 20) fail('PROVIDER_TOKEN_INVALID')
  const authHeaders = { authorization: `Bearer ${token}` }

  async function request(url, options = {}) {
    let response
    try {
      response = await fetchImpl(url, { ...options, headers: { ...authHeaders, ...(options.headers ?? {}) }, signal: options.signal ?? AbortSignal.timeout(30_000) })
    } catch (error) {
      fail('OUTCOME_UNKNOWN', error?.name ?? 'network')
    }
    if (!response.ok) fail(typedProviderCode(response.status), String(response.status))
    if (response.status === 204) return null
    const text = await response.text()
    return text ? JSON.parse(text) : null
  }

  async function readBytes(uri, { prefixes = ['receipts'], expectedSha256 = null } = {}) {
    const bucket = profileBucket(uri)
    const matchingPrefix = prefixes.find((prefix) => {
      try { return parseGsUri(uri, bucket, prefix).object.startsWith(`${prefix}/`) } catch { return false }
    })
    if (!matchingPrefix) fail('GCS_PREFIX_DENIED')
    const parsed = parseGsUri(uri, bucket, matchingPrefix)
    const base = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(parsed.bucket)}/o/${encodeURIComponent(parsed.object)}`
    const metadata = await request(base)
    if (!/^[1-9][0-9]*$/u.test(String(metadata?.generation ?? '')) || typeof metadata?.crc32c !== 'string') fail('GCS_METADATA_INVALID')
    let mediaResponse
    try {
      mediaResponse = await fetchImpl(`${base}?alt=media&generation=${encodeURIComponent(metadata.generation)}`, { headers: authHeaders, signal: AbortSignal.timeout(30_000) })
    } catch (error) {
      fail('OUTCOME_UNKNOWN', error?.name ?? 'gcs-media')
    }
    if (!mediaResponse.ok) fail(typedProviderCode(mediaResponse.status), `gcs-media-${mediaResponse.status}`)
    const bytes = Buffer.from(await mediaResponse.arrayBuffer())
    if (crc32cBase64(bytes) !== metadata.crc32c || (expectedSha256 && sha256(bytes) !== expectedSha256)) fail('GCS_READBACK_HASH_MISMATCH')
    return { bytes, metadata, ref: immutableRef(uri, bytes) }
  }

  function profileBucket(uri) {
    const match = /^gs:\/\/([^/]+)\//u.exec(uri ?? '')
    if (!match) fail('GCS_URI_INVALID')
    return match[1]
  }

  async function readJson(ref, bucket, prefixes = ['receipts']) {
    assertImmutableRef(ref, bucket, prefixes)
    const result = await readBytes(ref.uri, { prefixes, expectedSha256: ref.sha256 })
    let value
    try { value = JSON.parse(result.bytes.toString('utf8')) } catch { fail('GCS_JSON_INVALID') }
    return { ...result, value }
  }

  async function putBytes(uri, bytes, { bucket, prefix, contentType = 'application/octet-stream', ifGenerationMatch = '0' }) {
    parseGsUri(uri, bucket, prefix)
    const object = uri.slice(`gs://${bucket}/`.length)
    const endpoint = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(object)}&ifGenerationMatch=${encodeURIComponent(ifGenerationMatch)}`
    let response
    try {
      response = await fetchImpl(endpoint, { method: 'POST', headers: { ...authHeaders, 'content-type': contentType }, body: bytes, signal: AbortSignal.timeout(60_000) })
    } catch (error) {
      fail('OUTCOME_UNKNOWN', error?.name ?? 'gcs-write')
    }
    if (response.status === 412 && ifGenerationMatch === '0') {
      const existing = await readBytes(uri, { prefixes: [prefix], expectedSha256: sha256(bytes) })
      if (!existing.bytes.equals(bytes)) fail('GCS_IMMUTABILITY_CONFLICT')
      return { ...existing, reused: true }
    }
    if (!response.ok) fail(typedProviderCode(response.status), `gcs-write-${response.status}`)
    const written = await response.json()
    const readback = await readBytes(uri, { prefixes: [prefix], expectedSha256: sha256(bytes) })
    if (String(written.generation) !== String(readback.metadata.generation) || !readback.bytes.equals(bytes)) fail('GCS_WRITE_READBACK_MISMATCH')
    return { ...readback, reused: false }
  }

  async function putJson(uri, value, options) {
    return putBytes(uri, Buffer.from(`${canonicalize(value)}\n`, 'utf8'), { ...options, contentType: 'application/json' })
  }

  async function waitOperation(operation, deadlineAt, apiRoot = 'https://run.googleapis.com/v2') {
    if (!operation?.name || !Number.isFinite(Date.parse(deadlineAt))) fail('OPERATION_OR_DEADLINE_INVALID')
    if (!['https://run.googleapis.com/v2', 'https://cloudbuild.googleapis.com/v1'].includes(apiRoot)) fail('OPERATION_API_ROOT_INVALID')
    let current = operation
    while (current.done !== true) {
      if (Date.now() >= Date.parse(deadlineAt)) fail('OPERATION_TIMEOUT')
      await sleep(1000)
      current = await request(`${apiRoot}/${operation.name}`)
    }
    if (current.error) fail('PROVIDER_OPERATION_FAILED', String(current.error.code ?? 'unknown'))
    return current.response ?? current
  }

  async function getService(profile) {
    return request(`https://run.googleapis.com/v2/projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`)
  }

  function assertServiceSettled(service, code = 'RUN_SERVICE_NOT_SETTLED') {
    if (
      service?.reconciling !== false ||
      service?.terminalCondition?.state !== 'CONDITION_SUCCEEDED' ||
      service?.generation == null ||
      service?.observedGeneration == null ||
      String(service.observedGeneration) !== String(service.generation)
    ) fail(code)
    return service
  }

  async function getRevision(profile, revision) {
    if (!revision?.startsWith(`${profile.target.serviceName}-`) || revision === 'latest') fail('REVISION_TARGET_INVALID')
    const value = await request(`https://run.googleapis.com/v2/projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}/revisions/${revision}`)
    if (!String(value?.name ?? '').endsWith(`/revisions/${revision}`) || value.service !== `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}`) fail('REVISION_READBACK_MISMATCH')
    return value
  }

  function assertRevisionReady(profile, revision, artifactDigest) {
    const ready = revision?.conditions?.find((row) => row.type === 'Ready')
    const containers = revision?.containers
    const app = containers?.find((container) => container.name === profile.runtime.containerName)
    const proxy = containers?.find((container) => container.name === profile.runtime.cloudSqlProxyContainer)
    if (containers?.length !== 2 || app?.image !== artifactDigest || proxy?.image !== profile.runtime.cloudSqlProxyImage
      || ready?.state !== 'CONDITION_SUCCEEDED') fail('CANDIDATE_REVISION_READBACK_MISMATCH')
    return revision
  }

  async function patchService(profile, service, updateMask, deadlineAt) {
    if (!['template', 'traffic'].includes(updateMask) || service?.name !== `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}` || !service.etag) fail('RUN_MUTATION_INVALID')
    const operation = await request(`https://run.googleapis.com/v2/${service.name}?updateMask=${encodeURIComponent(updateMask)}&allowMissing=false`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(service) })
    return waitOperation(operation, deadlineAt)
  }

  async function createCandidate({ profile, artifactDigest, runtimeConfig, fingerprint, deadlineAt }) {
    if (!artifactDigest.startsWith(`${profile.artifact.uri}@sha256:`) || !H64.test(fingerprint)) fail('CANDIDATE_INPUT_INVALID')
    const before = await getService(profile)
    assertServiceSettled(before, 'CANDIDATE_BASELINE_INVALID')
    if (before.reconciling !== false || !before.etag || !Array.isArray(before.traffic) || before.traffic.some((row) => row.latestRevision === true || row.tag)) fail('CANDIDATE_BASELINE_INVALID')
    const candidateRevision = `${profile.target.serviceName}-${fingerprint.slice(0, 12)}`
    const template = assertRuntimeConfig(profile, runtimeConfig)
    template.revision = candidateRevision
    const app = template.containers.find((container) => container.name === profile.runtime.containerName)
    if (!app) fail('CANDIDATE_TEMPLATE_INVALID')
    app.image = artifactDigest
    await patchService(profile, { name: before.name, etag: before.etag, template }, 'template', deadlineAt)
    const created = await getService(profile)
    assertServiceSettled(created, 'CANDIDATE_REVISION_READBACK_MISMATCH')
    if (created.latestCreatedRevision !== `projects/${profile.target.projectId}/locations/${profile.target.region}/services/${profile.target.serviceName}/revisions/${candidateRevision}` && created.latestCreatedRevision !== candidateRevision) fail('CANDIDATE_REVISION_READBACK_MISMATCH')
    const tag = `candidate-${fingerprint.slice(0, 12)}`
    const traffic = [...before.traffic, { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: candidateRevision, percent: 0, tag }]
    await patchService(profile, { name: created.name, etag: created.etag, traffic }, 'traffic', deadlineAt)
    const tagged = await getService(profile)
    assertServiceSettled(tagged, 'CANDIDATE_TAG_READBACK_MISMATCH')
    const tagStatus = tagged.trafficStatuses?.find((row) => row.tag === tag)
    const generalBefore = before.traffic.map(({ tag: _tag, ...row }) => row)
    const generalAfter = tagged.traffic?.filter((row) => !row.tag).map(({ tag: _tag, ...row }) => row)
    if (!tagStatus?.uri || tagStatus.revision !== candidateRevision || Number(tagStatus.percent) !== 0 || canonicalize(generalAfter) !== canonicalize(generalBefore)) fail('CANDIDATE_TAG_READBACK_MISMATCH')
    const revision = await getRevision(profile, candidateRevision)
    assertRevisionReady(profile, revision, artifactDigest)
    return { candidateRevision, tag, tagUri: tagStatus.uri, artifactDigest, previousRevision: effectiveRevision(before), beforeTraffic: before.traffic, etag: tagged.etag, revisionName: revision.name }
  }

  function effectiveRevision(service) {
    const row = service.trafficStatuses?.find((item) => !item.tag && Number(item.percent) === 100)
    if (!row?.revision || row.latestRevision === true) fail('EFFECTIVE_REVISION_AMBIGUOUS')
    return row.revision
  }

  async function setTraffic({ profile, revision, candidateTag = null, deadlineAt }) {
    const before = await getService(profile)
    assertServiceSettled(before, 'TRAFFIC_BASELINE_INVALID')
    const traffic = [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision, percent: 100 }]
    if (candidateTag) traffic.push({ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision, percent: 0, tag: candidateTag })
    await patchService(profile, { name: before.name, etag: before.etag, traffic }, 'traffic', deadlineAt)
    const after = await getService(profile)
    assertServiceSettled(after, 'TRAFFIC_READBACK_MISMATCH')
    if (effectiveRevision(after) !== revision) fail('TRAFFIC_READBACK_MISMATCH')
    return after
  }

  async function removeCandidateTag({ profile, tag, candidateRevision, expectedActiveRevision, deadlineAt }) {
    const before = await getService(profile)
    assertServiceSettled(before, 'CANDIDATE_TAG_CLEANUP_FAILED')
    const tagged = before.traffic?.find((row) => row.tag === tag)
    if (tagged && tagged.revision !== candidateRevision) fail('CANDIDATE_TAG_OWNER_MISMATCH')
    if (!tagged) {
      if (effectiveRevision(before) !== expectedActiveRevision) fail('CANDIDATE_TAG_CLEANUP_FAILED')
      return before
    }
    const traffic = before.traffic.filter((row) => row.tag !== tag)
    await patchService(profile, { name: before.name, etag: before.etag, traffic }, 'traffic', deadlineAt)
    const after = await getService(profile)
    assertServiceSettled(after, 'CANDIDATE_TAG_CLEANUP_FAILED')
    if (after.traffic?.some((row) => row.tag === tag) || effectiveRevision(after) !== expectedActiveRevision) fail('CANDIDATE_TAG_CLEANUP_FAILED')
    return after
  }

  async function runMigrationJob({ profile, deployment, outputUri, deadlineAt }) {
    const jobName = `projects/${profile.target.projectId}/locations/${profile.target.region}/jobs/${profile.migrations.jobName}`
    const job = await request(`https://run.googleapis.com/v2/${jobName}`)
    const container = job.template?.template?.containers?.find((item) => item.name === 'migration')
    const environment = Object.fromEntries((container?.env ?? []).map((row) => [row.name, row.value]))
    const connectionName = 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg'
    const expectedEnvironment = {
      OWNER_APPLICATION_ID: profile.application.id,
      RELEASE_BUCKET: profile.artifact.releaseBucket,
      GOOGLE_CLOUD_PROJECT: profile.target.projectId,
      GOOGLE_CLOUD_REGION: profile.target.region,
      CLOUD_SQL_INSTANCE_CONNECTION_NAME: connectionName,
      POSTGRES_DATABASE: 'jenfu_prod',
      POSTGRES_IAM_LOGIN: profile.migrations.serviceAccount.replace('.gserviceaccount.com', ''),
      POSTGRES_SOCKET: `/cloudsql/${connectionName}`,
    }
    const volume = job.template?.template?.volumes?.find((item) => item.name === 'cloudsql')
    const mount = container?.volumeMounts?.find((item) => item.name === 'cloudsql')
    if (job.name !== jobName || job.template?.template?.serviceAccount !== profile.migrations.serviceAccount || container?.image !== deployment.migrationRunnerDigest || canonicalize(environment) !== canonicalize(expectedEnvironment) || canonicalize(volume?.cloudSqlInstance?.instances) !== canonicalize([connectionName]) || mount?.mountPath !== '/cloudsql' || job.template?.taskCount !== 1 || job.template?.parallelism !== 1 || job.template?.template?.maxRetries !== 0 || job.template?.template?.timeout !== '1800s') fail('MIGRATION_JOB_READBACK_MISMATCH')
    const args = ['--bundle-ref', deployment.migrationBundleRef.uri, '--bundle-sha256', deployment.migrationBundleRef.sha256, '--source-revision', deployment.sourceRevision, '--output-ref', outputUri]
    const operation = await request(`https://run.googleapis.com/v2/${jobName}:run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ overrides: { containerOverrides: [{ name: 'migration', args }] } }) })
    const execution = await waitOperation(operation, deadlineAt)
    const executionName = execution.name
    const readback = await request(`https://run.googleapis.com/v2/${executionName}`)
    if (Number(readback.failedCount ?? 0) !== 0 || Number(readback.succeededCount ?? 0) !== 1 || readback.completionTime == null || readback.terminalCondition?.state !== 'CONDITION_SUCCEEDED') fail('MIGRATION_EXECUTION_FAILED')
    return readback
  }

  async function createBuild({ profile, intent, sourceObject, deadlineAt }) {
    assertImmutableRef(sourceObject.ref, profile.artifact.releaseBucket, ['source'])
    if (!/^[1-9][0-9]*$/u.test(String(sourceObject.metadata?.generation ?? '')) || profile.build?.dockerBuilderImage !== 'gcr.io/cloud-builders/docker@sha256:3d00b6c1a9b862621c30fc74d4f2abfc62bcbdee631ed3febd31e7edbdf6252c' || !/^[A-Za-z0-9._/-]+$/u.test(profile.build?.dockerfile ?? '') || !/^[A-Za-z0-9._-]+$/u.test(profile.build?.dockerTarget ?? '')) fail('BUILD_PROFILE_INVALID')
    const parsed = parseGsUri(sourceObject.ref.uri, profile.artifact.releaseBucket, 'source')
    const tag = `${profile.artifact.uri}:release-${intent.sourceRevision}`
    const args = ['build', '--pull=false', '--no-cache', '--file', profile.build.dockerfile, '--target', profile.build.dockerTarget, '--build-arg', `SOURCE_REVISION=${intent.sourceRevision}`, '--build-arg', `SOURCE_TREE=${intent.sourceSha256}`, '--build-arg', 'SOURCE_CREATED_AT=1970-01-01T00:00:00Z', '--build-arg', `SOURCE_VERSION=${intent.releaseId}`, '--build-arg', 'SOURCE_STATE=frozen', '--tag', tag, '.']
    const body = {
      source: { storageSource: { bucket: parsed.bucket, object: parsed.object, generation: String(sourceObject.metadata.generation) } },
      steps: [{ name: profile.build.dockerBuilderImage, args }],
      images: [tag],
      timeout: '1800s',
      queueTtl: '300s',
      logsBucket: `gs://${profile.artifact.releaseBucket}/logs/cloud-build`,
      serviceAccount: `projects/${profile.target.projectId}/serviceAccounts/${profile.identities.builder}`,
      options: { logging: 'GCS_ONLY', logStreamingOption: 'STREAM_OFF', requestedVerifyOption: 'VERIFIED' },
      tags: ['dev-012', profile.application.id, intent.releaseId.toLowerCase()],
    }
    const operation = await request(`https://cloudbuild.googleapis.com/v1/projects/${profile.target.projectId}/locations/${profile.target.region}/builds`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const build = await waitOperation(operation, deadlineAt, 'https://cloudbuild.googleapis.com/v1')
    const result = build.results?.images?.find((row) => row.name === tag)
    if (build.status !== 'SUCCESS' || build.projectId !== profile.target.projectId || build.serviceAccount !== body.serviceAccount || build.options?.requestedVerifyOption !== 'VERIFIED' || build.sourceProvenance?.resolvedStorageSource?.bucket !== parsed.bucket || build.sourceProvenance?.resolvedStorageSource?.object !== parsed.object || String(build.sourceProvenance?.resolvedStorageSource?.generation) !== String(sourceObject.metadata.generation) || !/^sha256:[a-f0-9]{64}$/u.test(result?.digest ?? '')) fail('BUILD_READBACK_MISMATCH')
    return { build, request: body, tag, artifactDigest: `${profile.artifact.uri}@${result.digest}` }
  }

  async function readArtifactImage(profile, artifactDigest) {
    if (!artifactDigest.startsWith(`${profile.artifact.uri}@sha256:`)) fail('ARTIFACT_OWNER_MISMATCH')
    const parent = `projects/${profile.target.projectId}/locations/${profile.target.region}/repositories/${profile.artifact.repository}`
    let pageToken = ''
    for (let page = 0; page < 20; page += 1) {
      const query = new URLSearchParams({ pageSize: '100' })
      if (pageToken) query.set('pageToken', pageToken)
      const response = await request(`https://artifactregistry.googleapis.com/v1/${parent}/dockerImages?${query}`)
      const found = (response.dockerImages ?? []).find((row) => row.uri === artifactDigest)
      if (found) return found
      pageToken = response.nextPageToken ?? ''
      if (!pageToken) break
    }
    fail('ARTIFACT_READBACK_MISSING')
  }

  async function listOccurrences(profile, artifactDigest) {
    const resourceUrl = `https://${artifactDigest}`
    const occurrences = []
    let pageToken = ''
    for (let page = 0; page < 20; page += 1) {
      const query = new URLSearchParams({ filter: `resourceUrl=\"${resourceUrl}\"`, pageSize: '100' })
      if (pageToken) query.set('pageToken', pageToken)
      const response = await request(`https://containeranalysis.googleapis.com/v1/projects/${profile.target.projectId}/occurrences?${query}`)
      occurrences.push(...(response.occurrences ?? []))
      pageToken = response.nextPageToken ?? ''
      if (!pageToken) break
    }
    return { resourceUrl, occurrences }
  }

  async function exportSbom(profile, artifactDigest) {
    const resourceUrl = `https://${artifactDigest}`
    const resourceName = `projects/${profile.target.projectId}/resources/${resourceUrl}`
    const response = await request(`https://containeranalysis.googleapis.com/v1beta1/${resourceName}:exportSBOM`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    if (!new RegExp(`^projects/${profile.target.projectId}/occurrences/[^/]+$`, 'u').test(response?.discoveryOccurrenceId ?? '')) fail('SBOM_EXPORT_READBACK_MISMATCH')
    return { resourceUrl, discoveryOccurrenceId: response.discoveryOccurrenceId }
  }

  async function waitArtifactEvidence({ profile, artifactDigest, deadlineAt }) {
    if (!Number.isFinite(Date.parse(deadlineAt))) fail('OPERATION_OR_DEADLINE_INVALID')
    const sbomExport = await exportSbom(profile, artifactDigest)
    let last = null
    while (Date.now() < Date.parse(deadlineAt)) {
      last = await listOccurrences(profile, artifactDigest)
      const build = last.occurrences.filter((row) => row.kind === 'BUILD')
      const discoveries = last.occurrences.filter((row) => row.kind === 'DISCOVERY')
      const sbom = last.occurrences.filter((row) => row.kind === 'SBOM_REFERENCE')
      const vulnerabilities = last.occurrences.filter((row) => row.kind === 'VULNERABILITY')
      const failed = discoveries.filter((row) => ['FINISHED_FAILED', 'FINISHED_UNSUPPORTED', 'ANALYSIS_ERROR'].includes(row.discovery?.discovered?.analysisStatus))
      const complete = discoveries.filter((row) => row.discovery?.discovered?.analysisStatus === 'FINISHED_SUCCESS')
      const blocking = vulnerabilities.filter((row) => ['HIGH', 'CRITICAL'].includes(row.vulnerability?.effectiveSeverity ?? row.vulnerability?.severity))
      if (failed.length || blocking.length) fail('ARTIFACT_POLICY_FAILED')
      if (build.length && complete.length && (sbom.length || complete.some((row) => row.name === sbomExport.discoveryOccurrenceId))) return { resourceUrl: last.resourceUrl, buildOccurrenceNames: build.map((row) => row.name).sort(), discoveryOccurrenceNames: complete.map((row) => row.name).sort(), sbomOccurrenceNames: sbom.map((row) => row.name).sort(), vulnerabilityCount: vulnerabilities.length, blockingVulnerabilityCount: 0, sbomExport, observedAt: now(), status: 'PASS' }
      await sleep(5000)
    }
    fail('ARTIFACT_ANALYSIS_TIMEOUT', String(last?.occurrences?.length ?? 0))
  }

  async function runHttpSuite({ origin, suite, expectedRevision, expectedArtifactDigest, environment = process.env }) {
    const base = new URL(origin)
    if (base.protocol !== 'https:') fail('HTTP_SUITE_ORIGIN_INVALID')
    const observations = []
    for (const probe of suite?.probes ?? []) {
      const url = new URL(probe.path, base)
      if (url.origin !== base.origin) fail('HTTP_SUITE_REDIRECT_SCOPE_INVALID')
      const headers = {}
      for (const [name, binding] of Object.entries(probe.headers ?? {})) {
        if (!binding?.environmentName || typeof environment[binding.environmentName] !== 'string') fail('HTTP_SUITE_CREDENTIAL_MISSING', binding?.environmentName)
        headers[name] = environment[binding.environmentName]
      }
      const response = await fetchImpl(url, { method: probe.method ?? 'GET', headers, redirect: 'manual', body: probe.body ? JSON.stringify(probe.body) : undefined, signal: AbortSignal.timeout(probe.timeoutMs ?? 20_000) })
      if (response.status !== probe.expectedStatus || response.headers.get('location')) fail('HTTP_SUITE_PROBE_FAILED', probe.id)
      const observedRevision = response.headers.get('x-jenfu-revision')
      const observedArtifact = response.headers.get('x-jenfu-artifact-digest')
      if (probe.requireProvenance !== false && (observedRevision !== expectedRevision || observedArtifact !== expectedArtifactDigest)) fail('HTTP_SUITE_PROVENANCE_MISMATCH', probe.id)
      observations.push({ id: probe.id, status: response.status, revision: observedRevision, artifactDigest: observedArtifact })
    }
    if (!suite?.probes?.length) fail('HTTP_SUITE_EMPTY')
    return { origin: base.origin, observations, status: 'PASS', observedAt: now() }
  }

  async function runAuthenticatedSmoke({ profile, origin, environment = process.env }) {
    const definition = profile.verification
    const base = new URL(origin)
    if (base.protocol !== 'https:' || !definition?.refreshTokenEnvironmentName || !definition?.firebaseApiKeyEnvironmentName || !Array.isArray(definition.authenticatedProbes) || !Array.isArray(definition.negativeProbes)) fail('AUTH_SMOKE_PROFILE_INVALID')
    const refreshToken = environment[definition.refreshTokenEnvironmentName]
    const firebaseApiKey = environment[definition.firebaseApiKeyEnvironmentName]
    if (typeof refreshToken !== 'string' || refreshToken.length < 20 || refreshToken.length > 4096) fail('HTTP_SUITE_CREDENTIAL_MISSING', definition.refreshTokenEnvironmentName)
    if (typeof firebaseApiKey !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/u.test(firebaseApiKey)) fail('HTTP_SUITE_CREDENTIAL_MISSING', definition.firebaseApiKeyEnvironmentName)
    let tokenResponse
    try {
      tokenResponse = await fetchImpl(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebaseApiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
      })
    } catch (error) {
      fail('AUTH_SMOKE_TOKEN_REFRESH_FAILED', error?.name ?? 'network')
    }
    if (!tokenResponse.ok) fail('AUTH_SMOKE_TOKEN_REFRESH_FAILED', String(tokenResponse.status))
    const tokenValue = await tokenResponse.json()
    const idToken = tokenValue?.id_token
    const expiresIn = Number(tokenValue?.expires_in)
    if (typeof idToken !== 'string' || idToken.length < 100 || idToken.length > 16384 || !Number.isFinite(expiresIn) || expiresIn < 300) fail('AUTH_SMOKE_TOKEN_REFRESH_INVALID')
    const call = async (path, options = {}) => {
      const url = new URL(path, base)
      if (url.origin !== base.origin) fail('HTTP_SUITE_REDIRECT_SCOPE_INVALID')
      const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), ...options })
      if (response.headers.get('location')) fail('HTTP_SUITE_PROBE_FAILED', path)
      return response
    }
    const observations = []
    let response = await call(definition.authModePath)
    if (response.status !== 200) fail('AUTH_SMOKE_MODE_FAILED')
    observations.push({ id: 'auth-mode', status: response.status })
    response = await call(definition.sessionPath, { method: 'POST', headers: { origin: base.origin, 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) })
    const setCookie = response.headers.get('set-cookie')
    if (response.status !== 200 || !setCookie) fail('AUTH_SMOKE_SESSION_FAILED')
    const cookie = setCookie.split(';', 1)[0]
    observations.push({ id: 'session-create', status: response.status })
    response = await call(definition.mePath, { headers: { cookie } })
    if (response.status !== 200) fail('AUTH_SMOKE_RELOAD_FAILED')
    observations.push({ id: 'session-reload', status: response.status })
    for (const probe of definition.authenticatedProbes) {
      response = await call(probe.path, { method: probe.method ?? 'GET', headers: { cookie, ...(probe.body ? { 'content-type': 'application/json' } : {}) }, body: probe.body ? JSON.stringify(probe.body) : undefined })
      if (response.status !== probe.expectedStatus) fail('HTTP_SUITE_PROBE_FAILED', probe.id)
      observations.push({ id: probe.id, status: response.status })
    }
    for (const probe of definition.negativeProbes) {
      response = await call(probe.path, { method: probe.method ?? 'GET', headers: probe.body ? { 'content-type': 'application/json' } : {}, body: probe.body ? JSON.stringify(probe.body) : undefined })
      if (response.status !== probe.expectedStatus) fail('HTTP_SUITE_PROBE_FAILED', probe.id)
      observations.push({ id: probe.id, status: response.status })
    }
    response = await call(definition.logoutPath, { method: 'POST', headers: { origin: base.origin, cookie, 'content-type': 'application/json' }, body: '{}' })
    if (response.status !== 200) fail('AUTH_SMOKE_LOGOUT_FAILED')
    response = await call(definition.mePath, { headers: { cookie } })
    if (response.status !== 401) fail('AUTH_SMOKE_REVOCATION_FAILED')
    observations.push({ id: 'session-revoked', status: response.status })
    return { origin: base.origin, tokenSource: 'FIREBASE_REFRESH_TOKEN', tokenExpiresInSeconds: expiresIn, observations, status: 'PASS', observedAt: now() }
  }

  async function publishIncident(profile, event) {
    const topic = `${profile.application.id === 'ai-pdm' ? 'aipdm' : profile.application.id}-prod-release-incident`
    return request(`https://pubsub.googleapis.com/v1/projects/${profile.target.projectId}/topics/${topic}:publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ data: Buffer.from(canonicalize(event)).toString('base64'), attributes: { ownerApplicationId: profile.application.id } }] }) })
  }

  return { request, readBytes, readJson, putBytes, putJson, waitOperation, getService, assertServiceSettled, getRevision, assertRevisionReady, patchService, createCandidate, effectiveRevision, setTraffic, removeCandidateTag, runMigrationJob, createBuild, readArtifactImage, listOccurrences, exportSbom, waitArtifactEvidence, runHttpSuite, runAuthenticatedSmoke, publishIncident, now }
}

export function stageReceipt({ profile, intent, stage, previousReceiptRef = null, facts, observedAt }) {
  const core = {
    schemaVersion: 'jenfu.dev012.stage-receipt.v1',
    ownerApplicationId: profile.application.id,
    releaseId: intent.releaseId,
    sourceRevision: intent.sourceRevision,
    stage,
    previousReceiptRef,
    facts,
    observedAt,
    status: 'PASS',
  }
  return { ...core, receiptSha256: sha256(canonicalize(core)) }
}

export function assertPassReceipt(value, ownerApplicationId, sourceRevision) {
  if (value?.status !== 'PASS' || value.ownerApplicationId !== ownerApplicationId || value.sourceRevision !== sourceRevision) fail('RECEIPT_JOIN_INVALID')
  return value
}

export { canonicalize, sha256 }
