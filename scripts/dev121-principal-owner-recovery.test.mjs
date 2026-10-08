import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRuntimeConfig, canonicalize, createOwnerTransport, releasePaths, sha256, stageReceipt } from './lib/dev012-owner-release-runtime.mjs'
import { executeOwnerStage } from './lib/dev012-owner-stage-executor.mjs'
import { readPreActivationAbortContinuation } from './lib/dev121-preactivation-abort-continuation.mjs'
import { buildReleaseIntent, buildRuntimeConfigReceipt, buildSourceFreeze, executePrerequisiteProducer } from './lib/dev012-owner-prerequisite-producer.mjs'
import { crc32cBase64 } from './lib/dev012-production-migration-runner.mjs'
const H40 = 'a'.repeat(40)
const bucket = 'jenfu-platform-prod-aipdm-release'
const previousRevision = 'ai-pdm-prod-111111111111'
const candidateRevision = 'ai-pdm-prod-222222222222'
const candidateTag = 'candidate-0123456789ab'
const canonicalOrigin = 'https://ai-pdm-prod-9536592944.asia-east1.run.app'
const candidateOrigin = `https://${candidateTag}---ai-pdm-prod-9536592944.asia-east1.run.app`
const migrationRunnerDigest = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner@sha256:' + 'c'.repeat(64)

function recordedHarness() {
  const objects = new Map()
  const calls = { createBuild: 0, runMigrationJob: 0 }
  let generation = 0
  let service = {
    name: 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod', etag: 'e1', reconciling: false,
    generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY', defaultUriDisabled: true, invokerIamDisabled: false, uri: null, urls: [],
    template: { serviceAccount: 'aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com', containers: [{ image: 'old@sha256:' + '0'.repeat(64) }] },
    traffic: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: previousRevision, percent: 100 }],
    trafficStatuses: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: previousRevision, percent: 100 }],
  }
  const encode = (value) => Buffer.from(`${canonicalize(value)}\n`)
  const readBytes = async (uri, { expectedSha256 = null } = {}) => {
    const row = objects.get(uri)
    if (!row) { const error = new Error('MISSING'); error.code = 'MISSING'; throw error }
    if (expectedSha256 && expectedSha256 !== sha256(row.bytes)) throw new Error('HASH')
    return { bytes: row.bytes, metadata: { generation: String(row.generation), crc32c: row.crc32c }, ref: { uri, sha256: sha256(row.bytes) } }
  }
  const putBytes = async (uri, bytes, options = {}) => {
    const existing = objects.get(uri)
    const expected = String(options.ifGenerationMatch ?? '0')
    if (existing && expected === '0') {
      if (!existing.bytes.equals(bytes)) throw new Error('IMMUTABILITY')
      return { ...(await readBytes(uri)), reused: true }
    }
    if (existing && expected !== String(existing.generation)) throw new Error('CAS')
    const row = { bytes: Buffer.from(bytes), generation: ++generation, crc32c: 'recorded-crc32c' }
    objects.set(uri, row)
    return { ...(await readBytes(uri)), reused: false }
  }
  const putJson = (uri, value, options) => putBytes(uri, encode(value), options)
  const readJson = async (ref) => ({ ...(await readBytes(ref.uri, { expectedSha256: ref.sha256 })), value: JSON.parse((await readBytes(ref.uri)).bytes.toString()) })
  const effectiveRevision = (value) => value.trafficStatuses.find((row) => !row.tag && Number(row.percent) === 100).revision
  const entrypointSnapshot = (value) => ({ ingress: value.ingress, defaultUriDisabled: value.defaultUriDisabled, invokerIamDisabled: value.invokerIamDisabled, uri: value.uri, urls: [...value.urls], serviceEtag: value.etag, generation: String(value.generation) })
  const transport = {
    now: () => '2026-09-08T00:00:00.000Z', readBytes, putBytes, putJson, readJson, effectiveRevision,
    assertServiceSettled(value, code = 'RUN_SERVICE_NOT_SETTLED') { if (value.reconciling !== false || value.terminalCondition?.state !== 'CONDITION_SUCCEEDED' || String(value.generation) !== String(value.observedGeneration)) throw new Error(code); return value },
    entrypointSnapshot,
    assertCanonicalEntrypoint(_profile, value) { if (value.uri !== canonicalOrigin || !value.urls.includes(canonicalOrigin) || value.ingress !== 'INGRESS_TRAFFIC_ALL' || value.defaultUriDisabled === true || value.invokerIamDisabled !== true) throw new Error('ENTRYPOINT_READBACK_MISMATCH'); return value },
    assertRevisionReady(_profile, value, artifactDigest) { if (value.conditions?.find((row) => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED' || value.containers?.[0]?.image !== artifactDigest) throw new Error('CANDIDATE_REVISION_READBACK_MISMATCH'); return value },
    async getService() { return structuredClone(service) },
    async createBuild({ profile, intent, sourceObject }) {
      calls.createBuild += 1
      const artifactDigest = `${profile.artifact.uri}@sha256:${'d'.repeat(64)}`
      return { artifactDigest, build: { name: 'projects/p/locations/r/builds/b1', id: 'b1', projectId: profile.target.projectId, status: 'SUCCESS', serviceAccount: `projects/${profile.target.projectId}/serviceAccounts/${profile.identities.builder}`, sourceProvenance: { resolvedStorageSource: { bucket, object: sourceObject.ref.uri.split('/').slice(3).join('/'), generation: sourceObject.metadata.generation } }, results: { images: [{ name: `${profile.artifact.uri}:release-${intent.sourceRevision}`, digest: 'sha256:' + 'd'.repeat(64) }] }, options: { requestedVerifyOption: 'VERIFIED' } } }
    },
    async readArtifactImage(_profile, artifactDigest) { return { name: 'projects/p/dockerImages/i@sha256:x', uri: artifactDigest } },
    async waitArtifactEvidence({ artifactDigest }) { return { resourceUrl: `https://${artifactDigest}`, buildOccurrenceNames: ['build'], discoveryOccurrenceNames: ['discovery'], sbomOccurrenceNames: ['sbom'], vulnerabilityCount: 0, blockingVulnerabilityCount: 0, sbomExport: { resourceUrl: `https://${artifactDigest}`, discoveryOccurrence: 'discovery' }, observedAt: this.now(), status: 'PASS' } },
    async runMigrationJob({ profile, deployment, outputUri }) { calls.runMigrationJob += 1; return putJson(outputUri, { schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: profile.application.id, sourceRevision: deployment.sourceRevision, manifestSha256: migrationManifestSha256, boundaryStatus: 'PASS', status: 'PASS' }, { bucket, prefix: 'receipts' }) },
    async createCandidate({ artifactDigest }) {
      service = { ...service, etag: 'e2', generation: '2', observedGeneration: '2', latestCreatedRevision: candidateRevision, traffic: [...service.traffic, { revision: candidateRevision, tag: candidateTag }], trafficStatuses: [...service.trafficStatuses, { revision: candidateRevision, tag: candidateTag, uri: candidateOrigin }] }
      return { candidateRevision, tag: candidateTag, tagUri: candidateOrigin, artifactDigest, previousRevision, beforeTraffic: service.traffic.slice(0, 1), etag: 'e2', revisionName: `projects/p/revisions/${candidateRevision}` }
    },
    async getRevision(_profile, revision) { return { name: `projects/p/services/s/revisions/${revision}`, service: 'projects/p/services/s', containers: [{ image: `${profile.artifact.uri}@sha256:${'d'.repeat(64)}` }], conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] } },
    async runAuthenticatedSmoke({ origin }) { return { origin, observations: [{ id: 'session-reload', status: 200 }], status: 'PASS', observedAt: this.now() } },
    async runInternalCandidateSmoke({ origin }) { return { origin, observations: [{ id: 'internal-candidate', status: 200 }], status: 'PASS', observedAt: this.now() } },
    async configureEntrypoint({ candidate }) {
      const before = entrypointSnapshot(service)
      assert.equal(candidate.tagUri, candidateOrigin)
      const templateHash = sha256(canonicalize(service.template)); const trafficHash = sha256(canonicalize(service.traffic))
      service = { ...service, etag: 'e-entry', generation: '3', observedGeneration: '3', ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true, uri: canonicalOrigin, urls: [canonicalOrigin] }
      return { before, after: entrypointSnapshot(service), changed: true, updateMask: 'ingress,defaultUriDisabled,invokerIamDisabled', templateSha256Before: templateHash, templateSha256After: templateHash, trafficSha256Before: trafficHash, trafficSha256After: trafficHash, providerOperationRef: { name: 'operations/entrypoint' } }
    },
    async restoreEntrypoint({ baseline }) {
      const before = entrypointSnapshot(service)
      const changed = before.ingress !== baseline.ingress || before.defaultUriDisabled !== baseline.defaultUriDisabled || before.invokerIamDisabled !== baseline.invokerIamDisabled
      if (changed) service = { ...service, etag: 'e-restore', generation: '6', observedGeneration: '6', ingress: baseline.ingress, defaultUriDisabled: baseline.defaultUriDisabled, invokerIamDisabled: baseline.invokerIamDisabled, uri: baseline.uri, urls: baseline.urls }
      return { changed, before, after: entrypointSnapshot(service), providerOperationRef: changed ? { name: 'operations/restore' } : null }
    },
    async setTraffic({ revision, candidateTag: releaseTag }) {
      service = { ...service, etag: 'e3', generation: '4', observedGeneration: '4', traffic: [{ revision, percent: 100 }, ...(releaseTag ? [{ revision, tag: releaseTag }] : [])], trafficStatuses: [{ revision, percent: 100 }, ...(releaseTag ? [{ revision, tag: releaseTag, uri: candidateOrigin }] : [])] }
      if (service.defaultUriDisabled === false) delete service.defaultUriDisabled
      return structuredClone(service)
    },
    async removeCandidateTag({ candidateRevision: exact, expectedActiveRevision }) { assert.equal(exact, candidateRevision); const tagged = service.traffic.find((row) => row.tag); if (tagged && tagged.revision !== exact) throw new Error('CANDIDATE_TAG_OWNER_MISMATCH'); assert.equal(effectiveRevision(service), expectedActiveRevision); service = { ...service, etag: 'e4', generation: '5', observedGeneration: '5', traffic: service.traffic.filter((row) => !row.tag), trafficStatuses: service.trafficStatuses.filter((row) => !row.tag) }; return structuredClone(service) },
    async publishIncident() { return { messageIds: ['1'] } },
  }
  const profile = {
    application: { id: 'ai-pdm', repository: 'owner/repo', branch: 'main' },
    profileVersion: 'CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP', contractSha256: 'f'.repeat(64),
    target: { projectId: 'jenfu-platform-prod', projectNumber: '9536592944', region: 'asia-east1', serviceName: 'ai-pdm-prod', runtimeServiceAccount: 'aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com', canonicalOrigin, entryPolicy: { ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true } },
    runtime: { containerName: 'ai-pdm', cloudSqlProxyContainer: 'cloud-sql-proxy', cloudSqlProxyImage: `proxy@sha256:${'f'.repeat(64)}`, cloudSqlProxyPort: 5432, cloudSqlProxyMaximumConnections: 24, cloudSqlConnectionName: 'p:r:i', network: 'runtime-vpc', subnet: 'runtime-subnet', port: 8080, startupProbePath: '/ready', cpu: '1', memory: '512Mi', concurrency: 20, timeoutSeconds: 60, maxInstances: 1, poolMax: 4 },
    schemas: { releaseIntent: 'owner.intent.v2', deploymentCapsule: 'owner.deployment.v2' },
    artifact: { releaseBucket: bucket, repository: 'aipdm-release', uri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm', migrationRunnerUri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner', migrationBundlePrefix: 'source/migration-bundles' },
    identities: { builder: 'aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' }, build: { maximumAllowedSeverity: 'MEDIUM' }, workflow: { path: '.github/workflows/deploy.yml' }, environment: { requiredPlainEnvironmentNames: ['NODE_ENV'], requiredSecretNames: ['SESSION_SECRET'], allowedSecretIds: { SESSION_SECRET: 'aipdm-prod-session-pepper' }, candidateOriginEnvironmentName: 'PORTAL_RELEASE_CANDIDATE_ORIGIN' }, sideEffects: { notification: 'DISABLED' },
  }
  const sourceIdentityBytes = Buffer.from('recorded-source-tree-manifest')
  const sourceArchiveBytes = Buffer.from('recorded-source-archive')
  const migrationBytes = Buffer.from('{"recorded":"migration"}\n')
  const migrationManifestSha256 = sha256('migration-manifest')
  const environment = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: profile.application.repository, GITHUB_REPOSITORY_ID: '1234', GITHUB_REPOSITORY_OWNER_ID: '5678', GITHUB_SHA: H40, GITHUB_WORKFLOW_SHA: H40, GITHUB_WORKFLOW_REF: 'owner/repo/.github/workflows/deploy.yml@refs/heads/main', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.example', GOOGLE_OAUTH_ACCESS_TOKEN: 'x'.repeat(32), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' }
  return { objects, calls, transport, profile, sourceIdentityBytes, sourceArchiveBytes, migrationBytes, migrationManifestSha256, environment, service: () => service }
}
async function authorizedRecordedInput(h, releaseId) {
  const refFor = async (name, value) => (await h.transport.putJson(`gs://${bucket}/receipts/prerequisites/${releaseId}-${name}.json`, value, { bucket, prefix: 'receipts' })).ref
  const common = { releaseAuthority: true, evidenceScope: 'PROVIDER' }
  const sourceLockRef = await refFor('source-lock', { ...common, status: 'SOURCE_FROZEN', sourceRevision: H40, clean: true })
  const authorizationPolicyRef = await refFor('authorization', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' })
  const readinessReceiptRef = await refFor('readiness', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z', projectId: 'jenfu-platform-prod' })
  const foundationReceiptRef = await refFor('foundation', { ...common, status: 'APPLIED', projectId: 'jenfu-platform-prod' })
  const infraReceiptRef = await refFor('infra', { ...common, status: 'APPLIED', projectId: 'jenfu-platform-prod', migrationRunnerDigest })
  const runtimeConfigRef = await refFor('runtime', { ...common, status: 'VERIFIED', projectId: 'jenfu-platform-prod', ...buildRuntimeConfig(h.profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } }) })
  const intent = { schemaVersion: 'owner.intent.v2', ownerApplicationId: 'ai-pdm', releaseId, sourceRevision: H40, sourceSha256: sha256(h.sourceIdentityBytes), sourceLockRef, authorizationPolicyRef, readinessReceiptRef, foundationReceiptRef, infraReceiptRef, runtimeConfigRef, migrationManifestSha256: h.migrationManifestSha256, previousRevision, deadlineAt: '2999-01-01T00:00:00.000Z' }
  const intentResult = await h.transport.putJson(`gs://${bucket}/receipts/intents/${releaseId}.json`, intent, { bucket, prefix: 'receipts' })
  return {
    intentResult,
    input: { capsuleRef: intentResult.ref.uri, capsuleSha256: intentResult.ref.sha256, profile: h.profile, transport: h.transport, environment: h.environment, validateIntent: (value) => value, createSourceIdentity: async () => h.sourceIdentityBytes, createSourceArchive: async () => h.sourceArchiveBytes, buildMigrationBundle: async () => ({ bundle: { manifestSha256: h.migrationManifestSha256 }, bytes: h.migrationBytes, bundleSha256: sha256(h.migrationBytes) }) },
  }
}


for (const watchdogRecovered of [false, true]) test(`owner Principal-only release restores maintenance and preserves forward repair; watchdog already recovered=${watchdogRecovered}`, async () => {
  const h = recordedHarness()
  const uid = 'd65f379b-a342-4eb3-ba22-109aa5f368c5'
  const recoveryRevision = 'ai-pdm-prod-recovery-abcdef123456'
  const image = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-recovery@sha256:${'9'.repeat(64)}`
  let active = false
  const getService = h.transport.getService
  h.transport.getService = async () => ({ ...await getService(), uid,
    scaling: active ? { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 }
      : { scalingMode: 'MANUAL', manualInstanceCount: 0 } })
  const getRevision = h.transport.getRevision
  h.transport.getRevision = async (profile, revision) => revision === recoveryRevision
    ? { name: `projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod/revisions/${revision}`,
      containers: [{ name: 'ai-pdm', image }], conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] }
    : getRevision(profile, revision)
  const proof = await h.transport.putJson(`gs://${bucket}/receipts/releases/DEV121-PRINCIPAL-ONLY-RECOVERY/proof.json`, {
    schemaVersion: 'ai-pdm.principal-only-recovery.v1', sourceRevision: H40,
    projectId: h.profile.target.projectId, region: h.profile.target.region, service: h.profile.target.serviceName,
    serviceUid: uid, oldRevision: previousRevision, recoveryRevision, imageDigest: image, status: 'PASS',
  }, { bucket, prefix: 'receipts' })
  const a = await authorizedRecordedInput(h, 'REL-PRINCIPAL-ONLY-001')
  const original = (await h.transport.readJson(a.intentResult.ref)).value
  const principalOnlyRecovery = { revision: recoveryRevision, imageDigest: image,
    serviceUid: uid, receiptRef: proof.ref }
  const result = await h.transport.putJson(`gs://${bucket}/receipts/intents/REL-PRINCIPAL-BOUND-001.json`,
    { ...original, principalOnlyRecovery, principalOnlyFenceRef: { uri: `gs://${bucket}/receipts/releases/DEV121-PRINCIPAL-ONLY-MIGRATION-FENCE/proof.json`, sha256: '2'.repeat(64) } }, { bucket, prefix: 'receipts' })
  const input = { ...a.input, capsuleRef: result.ref.uri, capsuleSha256: result.ref.sha256,
    verifyRoutineRelease: async () => ({ migrationDisposition: 'UNCHANGED_VERIFIED' }) }
  const setTraffic = h.transport.setTraffic
  const trafficCalls = []
  h.transport.setTraffic = async (args) => { trafficCalls.push(args.revision); return setTraffic(args) }
  h.transport.activatePrincipalOnly = async ({ recovery, candidateRevision, candidateTag }) => {
    assert.deepEqual(recovery, principalOnlyRecovery)
    active = true
    return setTraffic({ revision: candidateRevision, candidateTag })
  }
  for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate']) {
    await executeOwnerStage({ ...input, stage })
  }
  const control = JSON.parse((await h.transport.readBytes(`gs://${bucket}/control/active.json`)).bytes.toString())
  assert.equal(control.previousRevision, recoveryRevision)
  assert.equal(control.candidateRevision, candidateRevision)
  if (watchdogRecovered) await setTraffic({ revision: recoveryRevision })
  const rollback = await executeOwnerStage({ ...input, stage: 'rollback' })
  assert.equal(JSON.parse(rollback.bytes.toString()).facts.result, 'ROLLED_BACK')
  assert.equal(JSON.parse(rollback.bytes.toString()).facts.previousRevision, recoveryRevision)
  assert.deepEqual(trafficCalls, watchdogRecovered ? [] : [recoveryRevision])
  assert.equal(h.transport.effectiveRevision(await h.transport.getService()), recoveryRevision)
  assert.equal(h.service().traffic.some((row) => row.revision === previousRevision), false)
})

// Pure in-memory GCS/Build/Registry responses exercise the actual native proof,
// prerequisite producer and prepare. No provider, server, credential or DB I/O.
function ordinaryAbortFixture() {
  const h = recordedHarness(), objects = new Map(), builds = new Map()
  const profile = { ...h.profile, application: { ...h.profile.application, repository: 'jedchang0308-jenfu/AI-PDM' },
    schemas: { releaseIntent: 'jenfu.dev117.ai-pdm-release-intent.v2', deploymentCapsule: 'jenfu.dev117.ai-pdm-deployment-capsule.v2' },
    environment: { ...h.profile.environment, requiredPlainEnvironmentNames: ['NODE_ENV', 'PDM_JENFU_PLATFORM_AUTH_MODE', 'PDM_JENFU_ENTITLEMENT_MODE', 'PDM_JENFU_SSO_HANDOFF_MODE'],
      controlledValues: { PDM_JENFU_SSO_HANDOFF_MODE: { defaultValue: 'on', allowedValues: ['on'] } } } }
  const modes = { NODE_ENV: 'production', PDM_JENFU_PLATFORM_AUTH_MODE: 'on', PDM_JENFU_ENTITLEMENT_MODE: 'enforce', PDM_JENFU_SSO_HANDOFF_MODE: 'on' }
  const runtime = buildRuntimeConfig(profile, { plainEnvironment: modes, secretVersions: { SESSION_SECRET: '1' } })
  const service = { ...h.service(), name: 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod',
    uid: 'd65f379b-a342-4eb3-ba22-109aa5f368c5', ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false,
    invokerIamDisabled: true, uri: canonicalOrigin, urls: [canonicalOrigin], scaling: { scalingMode: 'AUTOMATIC', maxInstanceCount: 1 } }
  const revisions = new Map(), calls = { provider: 0, puts: 0 }
  const encode = value => Buffer.from(canonicalize(value) + '\n')
  const put = (uri, value) => {
    const bytes = encode(value), row = { bytes, value, ref: { uri, sha256: sha256(bytes) }, metadata: { generation: '7', crc32c: crc32cBase64(bytes) } }
    objects.set(uri, row); return row
  }
  const snapshot = h.transport.entrypointSnapshot(service)
  const buildRecord = (source, id, sourceObject, image) => ({ name: `projects/jenfu-platform-prod/locations/asia-east1/builds/${id}`,
    id, projectId: 'jenfu-platform-prod', status: 'SUCCESS', serviceAccount: 'projects/jenfu-platform-prod/serviceAccounts/aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com',
    options: { requestedVerifyOption: 'VERIFIED' }, sourceProvenance: { resolvedStorageSource: { bucket, object: sourceObject.uri.slice(`gs://${bucket}/`.length), generation: '7' } },
    results: { images: [{ name: `${profile.artifact.uri}:release-${source}`, digest: image.split('@')[1] }] } })
  function release({ source, releaseId, revision, previous, imageDigit, anchorRef = null, released = false }) {
    const lock = put(`gs://${bucket}/receipts/releases/${releaseId}/source-lock.json`, buildSourceFreeze({ profile, releaseId, observedAt: '2026-09-30T00:00:00Z',
      git: { sourceRevision: source, sourceTree: 'f'.repeat(40), branch: 'main', remoteRevision: source, clean: true }, sourceIdentityBytes: h.sourceIdentityBytes, migrationBundle: { bundle: { manifestSha256: h.migrationManifestSha256 } } }))
    const runtimeRow = put(`gs://${bucket}/receipts/releases/${releaseId}/runtime-config.json`, buildRuntimeConfigReceipt({ profile, releaseId, sourceLock: lock.value, plainEnvironment: modes, secretVersions: { SESSION_SECRET: '1' }, observedAt: '2026-09-30T00:00:00Z' }))
    const dummy = put(`gs://${bucket}/receipts/releases/${releaseId}/authority.json`, { status: 'PASS' })
    const intent = { schemaVersion: profile.schemas.releaseIntent, ownerApplicationId: 'ai-pdm', releaseId, sourceRevision: source,
      sourceSha256: sha256(h.sourceIdentityBytes), sourceLockRef: lock.ref, runtimeConfigRef: runtimeRow.ref,
      authorizationPolicyRef: dummy.ref, readinessReceiptRef: dummy.ref, foundationReceiptRef: dummy.ref, infraReceiptRef: dummy.ref,
      migrationManifestSha256: h.migrationManifestSha256, previousRevision: previous, deadlineAt: '2026-10-01T04:00:00Z', ...(anchorRef ? { baselineIntentRef: anchorRef } : {}) }
    const intentRow = put(`gs://${bucket}/receipts/releases/${releaseId}/release-intent.json`, intent), paths = releasePaths(profile, intent, intentRow.ref.sha256)
    const seal = (stage, facts, prev = null) => put(paths[stage], stageReceipt({ profile, intent, stage, previousReceiptRef: prev, facts, observedAt: '2026-09-30T00:00:00Z' }))
    const prerequisiteRefs = { sourceLock: lock.ref, authorization: dummy.ref, readiness: dummy.ref, foundation: dummy.ref, infra: dummy.ref, runtimeConfig: runtimeRow.ref }
    const prepare = seal('prepare', { prerequisiteRefs, previousRevision: previous, entrypointBaseline: snapshot })
    const image = `${profile.artifact.uri}@sha256:${imageDigit.repeat(64)}`
    const sourceUri = `gs://${bucket}/source/releases/${releaseId}/${intentRow.ref.sha256}/source.tar.gz`
    const archived = Buffer.from('frozen archive '+source), sourceObject = { uri: sourceUri, sha256: sha256(archived), generation: '7', crc32c: crc32cBase64(archived) }
    objects.set(sourceUri, { bytes: archived, metadata: { generation: '7', crc32c: sourceObject.crc32c } })
    const buildId = released ? '11111111-2222-3333-4444-555555555555' : '66666666-7777-8888-9999-aaaaaaaaaaaa'
    const cloudBuild = buildRecord(source, buildId, sourceObject, image); builds.set(buildId, cloudBuild)
    const provenance = put(paths.provenance, { schemaVersion: 'jenfu.dev012.build-provenance-receipt.v1', ownerApplicationId: 'ai-pdm', sourceRevision: source, sourceObject, artifactDigest: image, cloudBuild, artifactRegistry: { uri: image }, status: 'PASS' })
    const build = seal('build', { artifactDigest: image, sourceObject, provenanceReceiptRef: provenance.ref }, prepare.ref)
    const deployment = put(paths.deployment, { schemaVersion: profile.schemas.deploymentCapsule, ownerApplicationId: 'ai-pdm', sourceRevision: source,
      artifactDigest: image, releaseIntentRef: intentRow.ref, releaseIntentSha256: intentRow.ref.sha256, buildReceiptRef: build.ref, deadlineAt: intent.deadlineAt })
    const migrationCore = { schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'ai-pdm', sourceRevision: source,
      database: 'jenfu_prod', ledger: 'ai_pdm_core.schema_migrations', manifestSha256: intent.migrationManifestSha256,
      baselineCount: 15, minimumLedgerCount: 0, ledgerBootstrap: { enabled: true, created: false }, ledgerCount: 27, applied: 0, replayed: 27,
      crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true }, { database: 'jenfu_stg', denied: true }], boundaryStatus: 'PASS', executionName: 'own/job/execution',
      startedAt: '2026-09-30T00:02:00Z', completedAt: '2026-09-30T00:03:00Z', status: 'PASS' }
    const migration = put(paths.migrate, { ...migrationCore, receiptSha256: sha256(canonicalize(migrationCore)) })
    const common = { candidateRevision: revision, artifactDigest: image }
    const candidate = seal('candidate', { ...common, previousRevision: previous, beforeTraffic: [{ revision: previous, percent: 100 }], migrationReceiptRef: migration.ref, deploymentCapsuleRef: deployment.ref }, migration.ref)
    const entry = seal('entrypoint', { before: snapshot, after: snapshot, canonicalOrigin, changed: false, updateMask: 'ingress,defaultUriDisabled,invokerIamDisabled', templateSha256Before: 'a'.repeat(64), templateSha256After: 'a'.repeat(64), trafficSha256Before: 'b'.repeat(64), trafficSha256After: 'b'.repeat(64) }, candidate.ref)
    const smoke = { schemaVersion: 'jenfu.dev121.principal-candidate-smoke.v1', ownerApplicationId: 'ai-pdm', status: 'PASS', ...common,
      observations: [{ id: 'auth-mode', status: 200 }, { id: 'platform-session', status: 200 }, { id: 'sso-start', status: 303 }, { id: 'sso-authorize', status: 303 }, { id: 'sso-callback', status: 303 }, { id: 'target-session', status: 200 }, { id: 'authenticated-probe', status: 200 }, { id: 'unauthenticated-probe', status: 401 }, { id: 'session-revoked', status: 401 }] }
    if (released) {
      const verify = seal('verify', { ...common, smoke }, entry.ref), decision = seal('decision', { ...common, decision: 'GO' }, verify.ref)
      const activate = seal('activate', { ...common, effectiveRevision: revision }, decision.ref)
      // Native canonical producer returns the original authenticated smoke shape.
      const canonicalSmoke = { origin: canonicalOrigin, status: 'PASS', observations: smoke.observations, observedAt: '2026-09-30T00:04:00Z', tokenSource: 'GITHUB_PRODUCTION_SECRET', tokenExpiresInSeconds: 3600 }
      const canonical = seal('canonical', { ...common, origin: canonicalOrigin, smoke: canonicalSmoke }, activate.ref)
      const finalize = seal('finalize', { ...common, result: 'RELEASED', temporaryCandidateTags: 0 }, canonical.ref)
      seal('terminal', { ...common, result: 'RELEASED', databaseDisposition: 'FORWARD_APPLIED', remainingHumanAction: 0 }, finalize.ref)
    } else {
      const facts = { result: 'PRE_ACTIVATION_ABORTED', previousRevision: previous, databaseDisposition: 'FORWARD_APPLIED', entrypointRecovery: { changed: false, result: 'BASELINE_ALREADY_ACTIVE', providerOperationRef: null }, recoveryOrder: ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'] }
      const rollback = seal('rollback', facts, entry.ref); seal('terminal', { ...facts }, rollback.ref)
    }
    revisions.set(revision, { name: `${service.name}/revisions/${revision}`, conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }], containers: [{ name: 'ai-pdm', image, env: Object.entries(modes).map(([name,value]) => ({ name,value })) }] })
    return { intent, intentRow, paths, seal, runtimeRow, lock, image, revision }
  }
  const anchor = release({ source: 'b'.repeat(40), releaseId: 'DEV121-RELEASED-ANCHOR', revision: previousRevision, previous: 'ai-pdm-prod-000000000000', imageDigit: 'b', released: true })
  const failed = release({ source: 'a'.repeat(40), releaseId: 'DEV121-FAILED-CANDIDATE', revision: candidateRevision, previous: previousRevision, imageDigit: 'c', anchorRef: anchor.intentRow.ref })
  const controlCore = { schemaVersion: 'jenfu.dev012.owner-control-head.v1', inputFingerprint: sha256(canonicalize({ ownerApplicationId: 'ai-pdm', releaseId: failed.intent.releaseId, sourceRevision: failed.intent.sourceRevision, releaseIntentSha256: failed.intentRow.ref.sha256 })),
    ownerApplicationId: 'ai-pdm', service: 'ai-pdm-prod', controlBucket: bucket, releaseId: failed.intent.releaseId, sourceRevision: failed.intent.sourceRevision,
    sourceLockSha256: failed.intent.sourceLockRef.sha256, candidateRevision, previousRevision, ownerRunRef: 'https://api.github.com/repos/jedchang0308-jenfu/AI-PDM/actions/runs/42', leaseExpiresAt: '2026-09-30T00:02:00Z', deadlineAt: failed.intent.deadlineAt, state: 'FINALIZED', result: 'PRE_ACTIVATION_ABORTED' }
  const control = () => put(`gs://${bucket}/control/active.json`, { ...controlCore, controlSha256: sha256(canonicalize(controlCore)) })
  control()
  const ownerRun = { id: '42', status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', headSha: failed.intent.sourceRevision }
  const fetchImpl = async url => {
    if (url.startsWith('https://cloudbuild.googleapis.com')) { calls.provider++; return Response.json(url.includes('?filter=') ? { builds: [] } : builds.get(url.split('/').at(-1))) }
    if (url.startsWith('https://artifactregistry.googleapis.com')) { calls.provider++; const digest=decodeURIComponent(url.split('/').at(-1)); return Response.json({ name: 'projects/jenfu-platform-prod/locations/asia-east1/repositories/aipdm-release/dockerImages/'+digest, uri: profile.artifact.uri.split('/').slice(0,-1).join('/')+'/'+digest }) }
    const match = /\/b\/([^/]+)\/o\/([^?]+)/u.exec(url), uri = match && 'gs://'+decodeURIComponent(match[1])+'/'+decodeURIComponent(match[2]), row=objects.get(uri)
    if (!row) return new Response('', { status: 404 })
    return url.includes('alt=media') ? new Response(row.bytes) : Response.json({ ...row.metadata,
      bucket: decodeURIComponent(match[1]), name: decodeURIComponent(match[2]), size: String(row.bytes.length) })
  }
  const transport = createOwnerTransport({ token: 'x'.repeat(25), fetchImpl, now: () => '2026-10-03T12:00:00Z' })
  Object.assign(transport, { async readBytes(uri, options={}) { const row=objects.get(uri); if(!row)throw Object.assign(new Error('MISSING'),{code:'MISSING'}); if(options.expectedSha256 && options.expectedSha256!==row.ref.sha256)throw new Error('HASH');return row },
    async readJson(ref) { const row=await this.readBytes(ref.uri,{expectedSha256:ref.sha256});return row },
    async putJson(uri,value) { calls.puts++; return put(uri,value) }, async getService(){return structuredClone(service)}, async getRevision(_p,name){return structuredClone(revisions.get(name))}, async readOwnerRun(){return ownerRun} })
  return { profile, transport, objects, put, service, revisions, calls, anchor, failed, controlCore, control, ownerRun,
    helperInput: { profile, transport, baselineIntentRef: failed.intentRow.ref }, h, runtime, modes, release }
}
async function ordinaryNextRelease(h) {
  const releaseId='DEV121-FRESH-CONTINUATION', source='d'.repeat(40)
  const lock=h.put(`gs://${bucket}/receipts/releases/${releaseId}/source-lock.json`,buildSourceFreeze({profile:h.profile,releaseId,observedAt:'2026-10-03T12:00:00Z',git:{clean:true,branch:'main',sourceRevision:source,sourceTree:'f'.repeat(40),remoteRevision:source},sourceIdentityBytes:h.h.sourceIdentityBytes,migrationBundle:{bundle:{manifestSha256:h.h.migrationManifestSha256}}}))
  const runtime=h.put(`gs://${bucket}/receipts/releases/${releaseId}/runtime-config.json`,buildRuntimeConfigReceipt({profile:h.profile,releaseId,sourceLock:lock.value,plainEnvironment:h.modes,secretVersions:{SESSION_SECRET:'1'},observedAt:'2026-10-03T12:00:00Z'}))
  const authority=await executePrerequisiteProducer({stage:'routine-authority',releaseId,input:{schemaVersion:'jenfu.dev012.routine-owner-authority-input.v1',sourceLockRef:lock.ref,runtimeConfigRef:runtime.ref,baselineIntentRef:h.failed.intentRow.ref,expiresAt:'2999-01-01T00:00:00Z'},profile:h.profile,transport:h.transport,validateIntent:()=>true,observedAt:'2026-10-03T12:00:00Z'})
  const foundation=h.put(`gs://${bucket}/receipts/releases/${releaseId}/foundation.json`,{status:'APPLIED',projectId:'jenfu-platform-prod',releaseAuthority:true,evidenceScope:'PRODUCTION_BOUND'})
  const infra=h.put(`gs://${bucket}/receipts/releases/${releaseId}/infra.json`,{status:'APPLIED',projectId:'jenfu-platform-prod',releaseAuthority:true,evidenceScope:'PRODUCTION_BOUND',migrationRunnerDigest})
  const input={sourceLockRef:lock.ref,runtimeConfigRef:runtime.ref,...authority.refs,foundationReceiptRef:foundation.ref,infraReceiptRef:infra.ref,baselineIntentRef:h.failed.intentRow.ref,previousRevision,deadlineAt:'2999-01-01T00:00:00Z'}
  const values={sourceLock:lock.value,runtimeConfig:runtime.value,authorization:h.objects.get(authority.refs.authorizationPolicyRef.uri).value,readiness:authority.value,foundation:foundation.value,infra:infra.value}
  const intent=buildReleaseIntent({profile:h.profile,releaseId,input,sourceLock:lock.value,prerequisiteValues:values,validateIntent:()=>true})
  const capsule=h.put(`gs://${bucket}/receipts/releases/${releaseId}/release-intent.json`,intent)
  const environment={...h.h.environment,GITHUB_REPOSITORY:h.profile.application.repository,GITHUB_WORKFLOW_REF:h.profile.application.repository+'/'+h.profile.workflow.path+'@refs/heads/main',GITHUB_SHA:source,GITHUB_WORKFLOW_SHA:source}
  return { input:{stage:'prepare',capsuleRef:capsule.ref.uri,capsuleSha256:capsule.ref.sha256,profile:h.profile,transport:h.transport,environment,validateIntent:()=>true},capsule,authority,values }
}

test('ordinary abort producer and prepare certify the native released Principal chain, preserve control, and recheck cached prepare',async()=>{
  const h=ordinaryAbortFixture(), result=await ordinaryNextRelease(h), priorControl=h.objects.get('gs://'+bucket+'/control/active.json').bytes
  assert.equal(h.calls.provider,4)
  const prepare=await executeOwnerStage(result.input)
  assert.equal(prepare.value.facts.preActivationAbortBasis.serviceUid,h.service.uid)
  assert.deepEqual(result.values.authorization.preActivationAbortBasis,result.values.readiness.preActivationAbortBasis)
  assert.deepEqual(h.objects.get('gs://'+bucket+'/control/active.json').bytes,priorControl)
  assert.equal((await executeOwnerStage(result.input)).ref.sha256,prepare.ref.sha256)
  assert.equal(h.calls.provider,4,'prepare must use only GCS/Run and not ask verifier for Build/Registry')
  h.service.uid='e65f379b-a342-4eb3-ba22-109aa5f368c5'
  await assert.rejects(executeOwnerStage(result.input),/PREPARE_BASELINE_MISMATCH/)
})

test('ordinary abort rejects non-Principal or incomplete native chain and current control/run/traffic/entry drift',async()=>{
  const mutations=[
    h=>h.objects.delete(h.anchor.paths.decision), h=>h.objects.delete(h.failed.paths.deployment),
    h=>h.objects.delete(h.failed.paths.migrate),h=>h.put(h.failed.paths.activate,{result:'ACTIVATED'}),
    h=>{h.ownerRun.status='in_progress'},h=>{h.ownerRun.headSha='f'.repeat(40)},
    h=>{h.controlCore.leaseExpiresAt='2999-01-01T00:00:00Z';h.control()},h=>{h.controlCore.inputFingerprint='f'.repeat(64);h.control()},
    h=>{h.service.trafficStatuses.push({revision:candidateRevision,percent:0,tag:'candidate'})},h=>{h.service.traffic=[{revision:candidateRevision,percent:100}]},
    h=>{h.service.scaling={scalingMode:'MANUAL',manualInstanceCount:0}},h=>{h.service.scaling.maxInstanceCount=2},
    h=>{h.service.ingress='INGRESS_TRAFFIC_INTERNAL_ONLY'},h=>{h.service.urls=['https://wrong.run.app']},h=>{h.service.reconciling=true},
    h=>{h.revisions.get(previousRevision).containers[0].image=h.failed.image},
    h=>{h.revisions.get(previousRevision).containers[0].env.find(e=>e.name==='PDM_JENFU_ENTITLEMENT_MODE').value='shadow'},
    h=>{h.revisions.get(previousRevision).containers[0].env.push({name:'PDM_JENFU_SSO_HANDOFF_MODE',value:'off'})},
    h=>{const row=h.objects.get(h.anchor.paths.verify);h.put(h.anchor.paths.verify,{...row.value,facts:{...row.value.facts,smoke:{...row.value.facts.smoke,schemaVersion:'legacy.smoke'}}})},
    h=>{const row=h.objects.get(h.anchor.paths.migrate);const {receiptSha256,...core}=row.value;core.ledgerCount=19;core.replayed=19;h.put(h.anchor.paths.migrate,{...core,receiptSha256:sha256(canonicalize(core))})},
  ]
  for(const mutate of mutations){const h=ordinaryAbortFixture();mutate(h);await assert.rejects(readPreActivationAbortContinuation(h.helperInput),/CONTINUATION|OWNER_RELEASE_PROOF|MISSING|HASH|MIGRATION_GCS_METADATA_FAILED:404/)}
})

test('ordinary continuation refuses missing/unequal frozen basis, including cached receipt and live environment drift',async()=>{
  for(const scenario of ['authorization','readiness','cached','environment']){
    const h=ordinaryAbortFixture(), next=await ordinaryNextRelease(h)
    const prepare=await executeOwnerStage(next.input)
    if(scenario==='environment')h.revisions.get(previousRevision).containers[0].env.push({name:'UNREVIEWED_RUNTIME_FIELD',value:'changed'})
    else if(scenario==='cached'){const {receiptSha256,...core}=prepare.value;delete core.facts.preActivationAbortBasis;h.put(prepare.ref.uri,{...core,receiptSha256:sha256(canonicalize(core))})}
    else {const key=scenario==='authorization'?'authorizationPolicyRef':'readinessReceiptRef';const ref=next.capsule.value[key],row=h.objects.get(ref.uri);const value={...row.value};if(scenario==='authorization')delete value.preActivationAbortBasis;else value.preActivationAbortBasis={...value.preActivationAbortBasis,serviceUid:'f'.repeat(36)};const updated=h.put(ref.uri,value);const intent={...next.capsule.value,[key]:updated.ref};const capsule=h.put(next.capsule.ref.uri,intent);next.input.capsuleSha256=capsule.ref.sha256}
    await assert.rejects(executeOwnerStage(next.input),/PREPARE_BASELINE_MISMATCH/)
  }
})


test('a subsequent ordinary abort remains fail closed instead of treating an aborted predecessor as RELEASED',async()=>{
  const h=ordinaryAbortFixture()
  const second=h.release({ source:'d'.repeat(40),releaseId:'DEV121-SECOND-ABORT',revision:'ai-pdm-prod-333333333333',previous:previousRevision,imageDigit:'d',anchorRef:h.failed.intentRow.ref })
  Object.assign(h.controlCore,{releaseId:second.intent.releaseId,sourceRevision:second.intent.sourceRevision,
    sourceLockSha256:second.intent.sourceLockRef.sha256,candidateRevision:second.revision,
    inputFingerprint:sha256(canonicalize({ownerApplicationId:'ai-pdm',releaseId:second.intent.releaseId,sourceRevision:second.intent.sourceRevision,releaseIntentSha256:second.intentRow.ref.sha256}))})
  h.control();h.ownerRun.headSha=second.intent.sourceRevision
  await assert.rejects(readPreActivationAbortContinuation({...h.helperInput,baselineIntentRef:second.intentRow.ref}),/MISSING|OWNER_RELEASE_PROOF_TERMINAL_INVALID/)
  assert.equal(h.calls.puts,0)
})


test('an unexpired sealed preactivation-abort capsule rejects every normal stage before provider mutation',async()=>{
  const h=recordedHarness(), {input}=await authorizedRecordedInput(h,'REL-TERMINAL-ABORT-NONREUSE')
  for(const stage of ['prepare','build','migrate','candidate','entrypoint'])await executeOwnerStage({...input,stage})
  await executeOwnerStage({...input,stage:'rollback'})
  const objectCount=h.objects.size, calls=[]
  for(const name of ['createBuild','runMigrationJob','createCandidate','configureEntrypoint','setTraffic','activatePrincipalOnly','removeCandidateTag','restoreEntrypoint','runAuthenticatedSmoke','runInternalCandidateSmoke','putJson','putBytes']){
    const original=h.transport[name]
    h.transport[name]=async(...args)=>{calls.push(name);return original?.(...args)}
  }
  for(const stage of ['prepare','build','migrate','candidate','entrypoint','verify','decision','activate','canonical','finalize']){
    await assert.rejects(executeOwnerStage({...input,stage}),/RELEASE_ALREADY_PREACTIVATION_ABORTED/)
  }
  assert.deepEqual(calls,[])
  assert.equal(h.objects.size,objectCount)
  assert.equal(h.service().traffic.some(row=>row.tag),false)
  assert.equal(h.transport.effectiveRevision(h.service()),previousRevision)
})


function ordinaryPrebuildAbortFixture() {
  const h = ordinaryAbortFixture()
  for (const stage of ['build', 'provenance', 'deployment', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']) h.objects.delete(h.failed.paths[stage])
  const facts = { result: 'PRE_ACTIVATION_ABORTED', previousRevision, databaseDisposition: 'NOT_APPLIED',
    entrypointRecovery: { changed: false, result: 'NOT_REQUIRED' }, recoveryOrder: ['TRAFFIC_ROLLBACK', 'TAG_CLEANUP', 'ENTRYPOINT_BASELINE_RESTORE'] }
  const rollback = h.failed.seal('rollback', facts)
  h.failed.seal('terminal', facts, rollback.ref)
  h.controlCore.candidateRevision = null
  h.control()
  return h
}

test('prebuild abort permits a fresh frozen capsule while keeping the aborted capsule and provider state immutable', async () => {
  const h = ordinaryPrebuildAbortFixture(), originalControl = h.objects.get('gs://' + bucket + '/control/active.json').bytes
  const basis = await readPreActivationAbortContinuation({ ...h.helperInput, verifyProvider: true })
  assert.equal(basis.kind, 'PRINCIPAL_ORDINARY_ABORT')
  assert.equal(basis.authorityBasis.schemaVersion, 'ai-pdm.principal-prebuild-abort-basis.v1')
  assert.equal(basis.authorityBasis.databaseDisposition, 'NOT_APPLIED')
  assert.equal(basis.authorityBasis.failedSourceLockRef.sha256, h.failed.lock.ref.sha256)
  assert.equal(h.calls.provider, 3, 'failed tag is empty; only the released anchor has Build/Registry proof')
  assert.equal(h.calls.puts, 0)
  const next = await ordinaryNextRelease(h)
  assert.deepEqual(next.values.authorization.preActivationAbortBasis, next.values.readiness.preActivationAbortBasis)
  const prepare = await executeOwnerStage(next.input)
  assert.deepEqual(prepare.value.facts.preActivationAbortBasis, basis.authorityBasis)
  assert.equal((await executeOwnerStage(next.input)).ref.sha256, prepare.ref.sha256)
  assert.deepEqual(h.objects.get('gs://' + bucket + '/control/active.json').bytes, originalControl)
  assert.equal(h.objects.get(h.failed.paths.terminal).value.facts.result, 'PRE_ACTIVATION_ABORTED')
  assert.deepEqual(h.objects.get(h.failed.intentRow.ref.uri).value, h.failed.intent)
})

test('prebuild abort rejects missing seals, later-stage evidence, unknown reads and failed source/control/provider drift', async () => {
  const mutateSeal = (h, stage, change) => { const row = h.objects.get(h.failed.paths[stage]); const { receiptSha256, ...core } = structuredClone(row.value); change(core); h.put(row.ref.uri, { ...core, receiptSha256: sha256(canonicalize(core)) }) }
  const mutations = [
    ...['build', 'provenance', 'deployment', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize'].map(stage => h => h.put(h.failed.paths[stage], { arbitrary: 'present' })),
    ...['prepare', 'rollback', 'terminal'].map(stage => h => h.objects.delete(h.failed.paths[stage])),
    h => mutateSeal(h, 'prepare', core => { core.previousReceiptRef = h.anchor.lock.ref }),
    h => mutateSeal(h, 'rollback', core => { core.previousReceiptRef = h.anchor.lock.ref }),
    h => mutateSeal(h, 'terminal', core => { core.previousReceiptRef = null }),
    h => mutateSeal(h, 'rollback', core => { core.facts.databaseDisposition = 'FORWARD_APPLIED' }),
    h => mutateSeal(h, 'rollback', core => { core.facts.entrypointRecovery.changed = true }),
    h => mutateSeal(h, 'rollback', core => { core.facts.previousRevision = candidateRevision }),
    h => mutateSeal(h, 'prepare', core => { core.facts.prerequisiteRefs.sourceLock = h.anchor.lock.ref }),
    h => { const row = h.failed.lock; h.put(row.ref.uri, { ...row.value, clean: false }) },
    h => { const row = h.failed.lock; const updated = h.put(row.ref.uri, { ...row.value, sourceSha256: 'f'.repeat(64) });
      h.transport.readJson = async ref => ref.uri === row.ref.uri ? updated : h.objects.get(ref.uri) },
    h => { h.ownerRun.conclusion = 'cancelled' }, h => { h.ownerRun.headSha = 'f'.repeat(40) },
    h => { h.controlCore.candidateRevision = candidateRevision; h.control() },
    h => { h.controlCore.leaseExpiresAt = '2999-01-01T00:00:00Z'; h.control() },
    h => { h.controlCore.inputFingerprint = 'f'.repeat(64); h.control() },
    h => { h.service.trafficStatuses.push({ revision: candidateRevision, tag: 'unknown', percent: 0 }) },
    h => { h.service.scaling.maxInstanceCount = 2 }, h => { h.service.uid = 'invalid' },
    h => { h.service.invokerIamDisabled = false }, h => { h.service.reconciling = true },
    h => { h.revisions.get(previousRevision).containers[0].image = h.failed.image },
    h => { h.revisions.get(previousRevision).containers[0].env.find(row => row.name === 'PDM_JENFU_ENTITLEMENT_MODE').value = 'shadow' },
    h => h.objects.delete(h.anchor.paths.decision),
    h => { const original = h.transport.readBytes; h.transport.readBytes = async (uri, options) => {
      if (uri === h.failed.paths.build) throw Object.assign(new Error('UNKNOWN_READ'), { code: 'OUTCOME_UNKNOWN' }); return original.call(h.transport, uri, options) } },
  ]
  for (const mutate of mutations) { const h = ordinaryPrebuildAbortFixture(); mutate(h); await assert.rejects(readPreActivationAbortContinuation(h.helperInput)); assert.equal(h.calls.puts, 0) }
})

test('prebuild continuation rechecks the frozen authority basis and cached prepare against live provider state', async () => {
  for (const scenario of ['authorization', 'readiness', 'cached', 'environment']) {
    const h = ordinaryPrebuildAbortFixture(), next = await ordinaryNextRelease(h), prepare = await executeOwnerStage(next.input)
    if (scenario === 'environment') h.revisions.get(previousRevision).containers[0].env.push({ name: 'UNREVIEWED_RUNTIME_FIELD', value: 'changed' })
    else if (scenario === 'cached') { const { receiptSha256, ...core } = structuredClone(prepare.value); delete core.facts.preActivationAbortBasis; h.put(prepare.ref.uri, { ...core, receiptSha256: sha256(canonicalize(core)) }) }
    else { const key = scenario === 'authorization' ? 'authorizationPolicyRef' : 'readinessReceiptRef'; const ref = next.capsule.value[key], value = structuredClone(h.objects.get(ref.uri).value);
      if (scenario === 'authorization') delete value.preActivationAbortBasis; else value.preActivationAbortBasis.serviceUid = 'unknown';
      const updated = h.put(ref.uri, value), capsule = h.put(next.capsule.ref.uri, { ...next.capsule.value, [key]: updated.ref }); next.input.capsuleSha256 = capsule.ref.sha256 }
    await assert.rejects(executeOwnerStage(next.input), /PREPARE_BASELINE_MISMATCH/)
  }
})


test('prebuild authority requires a successful exact failed-tag Build list with no unknown or existing build', async () => {
  for (const response of [{ builds: [{ id: 'unknown-build' }] }, { nextPageToken: 'more' }, { builds: {} }, { builds: null }, { nextPageToken: null }, { nextPageToken: 0 }, { unknown: true }, [], 'not-a-list', true, null]) {
    const h = ordinaryPrebuildAbortFixture(), original = h.transport.request
    h.transport.request = async (url, ...args) => { if (url.includes('/builds?filter=')) {
      if (response === null) throw Object.assign(new Error('UNKNOWN_LIST'), { code: 'OUTCOME_UNKNOWN' }); return response }
      return original.call(h.transport, url, ...args) }
    await assert.rejects(readPreActivationAbortContinuation({ ...h.helperInput, verifyProvider: true }))
    assert.equal(h.calls.puts, 0)
  }
})

test('prebuild prepare re-queries failed-tag Build absence after the producer and on cached replay', async () => {
  for (const cached of [false, true]) {
    for (const outcome of ['build-present', 'unknown']) {
      const h = ordinaryPrebuildAbortFixture(), next = await ordinaryNextRelease(h)
      if (cached) await executeOwnerStage(next.input)
      const original = h.transport.request, putsBefore = h.calls.puts, objectsBefore = h.objects.size
      let queries = 0
      h.transport.request = async (url, ...args) => {
        if (url.includes('/builds?filter=')) {
          queries++
          assert.equal(new URL(url).searchParams.get('filter'), 'tags=' + h.failed.intent.releaseId.toLowerCase())
          assert.equal(new URL(url).searchParams.get('pageSize'), '1')
          if (outcome === 'unknown') throw Object.assign(new Error('UNKNOWN_LIST'), { code: 'OUTCOME_UNKNOWN' })
          return { builds: [{ id: 'newly-observed-failed-build' }] }
        }
        return original.call(h.transport, url, ...args)
      }
      await assert.rejects(executeOwnerStage(next.input), outcome === 'unknown' ? /UNKNOWN_LIST/ : /DEV121_PREACTIVATION_CONTINUATION_INVALID/)
      assert.equal(queries, 1, 'cold and cached prepare both require fresh exact-tag absence')
      assert.equal(h.calls.puts, putsBefore, 'reject before any new receipt or control write')
      assert.equal(h.objects.size, objectsBefore)
    }
  }
})
