import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { buildRuntimeConfig, canonicalize, migrationSubmissionIntentUri, releasePaths, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { assertStaleControlSafeToSupersede, candidateTagUriMatches, executeOwnerStage } from './lib/dev012-owner-stage-executor.mjs'
import { readPreActivationAbortContinuation } from './lib/dev121-preactivation-abort-continuation.mjs'
import { buildDev117MigrationPackage, buildDev117MigrationBundle } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { assertAiPdmMigrationContent, assertAiPdmMigrationEquivalent, assertAiPdmRepairMigrationMode } from './lib/dev121-owner-release-proof.mjs'
import { createMigrationBundle } from './lib/dev012-production-migration-runner.mjs'
import { UNLINKED_PROFILE_CLEANUP_PREFIX, UNLINKED_PROFILE_CLEANUP_PATH } from './lib/dev121-unlinked-profile-cleanup.mjs'

const H40 = 'a'.repeat(40)
const bucket = 'jenfu-platform-prod-platform-release'
const previousRevision = 'jenfu-platform-prod-previous'
const candidateRevision = 'jenfu-platform-prod-candidate'
const candidateTag = 'candidate-0123456789ab'
const canonicalOrigin = 'https://jenfu-platform-prod-9536592944.asia-east1.run.app'
const candidateOrigin = `https://${candidateTag}---jenfu-platform-prod-9536592944.asia-east1.run.app`
const migrationRunnerDigest = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform-migration-runner@sha256:' + 'c'.repeat(64)

function repairMigrationContentFixture() {
  const profilePath = 'config/release/dev117-ai-pdm-independent-production-v3.json'
  const currentProfile = JSON.parse(readFileSync(new URL(`../${profilePath}`, import.meta.url)))
  const n1c = JSON.parse(readFileSync(new URL('../config/platform/dev-010-n1c-ai-pdm.json', import.meta.url)))
  assert.equal(currentProfile.migrations.entries.length, 35)
  // B24 remains the historical exact 32 -> 33 append contract. Ordinary 084
  // and catalog085 are covered separately; neither enters the paused repair gate.
  currentProfile.migrations.entries = currentProfile.migrations.entries.slice(0, 33)
  const historicalProfile = structuredClone(currentProfile)
  historicalProfile.migrations.entries = historicalProfile.migrations.entries.slice(0, 32)
  const materialize = profile => {
    const { bundle } = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), H40)
    const files = new Map([[profilePath, Buffer.from(`${canonicalize(profile)}\n`)], ...profile.migrations.entries.map(row => [row.path, readFileSync(new URL(`../${row.path}`, import.meta.url))])])
    return { profile, bundle, files }
  }
  const validate = input => assertAiPdmMigrationContent({ files: input.files, bundle: input.bundle, sourceRevision: H40, deadlineAt: '2999-01-01T00:00:00.000Z' })
  const reseal = input => {
    input.files.set(profilePath, Buffer.from(`${canonicalize(input.profile)}\n`))
    const core = { ...input.bundle }; delete core.manifestSha256
    input.bundle.manifestSha256 = sha256(canonicalize(core))
    return input
  }
  return { historical: materialize(historicalProfile), current: materialize(currentProfile), validate, reseal }
}

test('B24 paused worker migration classification preserves exact32 and admits only authentic appended083', () => {
  const fixture = repairMigrationContentFixture()
  const before = fixture.validate(fixture.historical), after = fixture.validate(fixture.current)
  assert.equal(assertAiPdmRepairMigrationMode(before, fixture.validate(fixture.historical)), 'HISTORICAL_EVIDENCE_REUSED')
  assert.equal(assertAiPdmRepairMigrationMode(before, after), 'FORWARD_APPLIED')
  assert.equal(fixture.current.bundle.entries[32].path, 'db/postgres/083_dev121_authorized_first_login_account.sql')
  assert.equal(fixture.current.bundle.entries[32].sourceSha256, 'a99df76b8fc146a916930a05286433568aa432710d2a6eccc1c47f08ba780da9')
  assert.deepEqual(fixture.current.bundle.entries.slice(0, 32), fixture.historical.bundle.entries)
  assert.throws(() => assertAiPdmMigrationEquivalent(before, after), /MIGRATION_INPUT_NOT_EQUIVALENT/u)
  assert.throws(() => assertAiPdmRepairMigrationMode({ ...before }, after), /MIGRATION_INPUT_NOT_EQUIVALENT/u)
  const originalHashes = [before.orderedEntriesSha256, before.profileMigrationsSha256]
  assertAiPdmRepairMigrationMode(before, after)
  assert.deepEqual([before.orderedEntriesSha256, before.profileMigrationsSha256], originalHashes)
})

test('B24 authenticated current bundle rejects historical source and derived SQL drift, deletion and reorder', () => {
  for (const mutation of ['source', 'derived', 'delete', 'reorder']) {
    const fixture = repairMigrationContentFixture(), before = fixture.validate(fixture.historical), next = fixture.current
    if (mutation === 'source') {
      const row = next.bundle.entries[0], changed = Buffer.concat([next.files.get(row.path), Buffer.from('\n-- changed frozen source\n')])
      next.files.set(row.path, changed); row.sourceSha256 = sha256(changed); next.profile.migrations.entries[0].sha256 = row.sourceSha256
    } else if (mutation === 'derived') {
      const row = next.bundle.entries[0], changed = Buffer.concat([Buffer.from(row.sqlBase64, 'base64'), Buffer.from('\n-- changed derived SQL\n')])
      row.sqlBase64 = changed.toString('base64'); row.appliedSha256 = sha256(changed)
    } else if (mutation === 'delete') {
      const removed = next.bundle.entries.shift(); next.profile.migrations.entries.shift(); next.files.delete(removed.path)
      next.bundle.entries.forEach((row, index) => { row.order = index + 1 }); next.profile.migrations.entries.forEach((row, index) => { row.order = index + 1 })
    } else {
      [next.bundle.entries[0], next.bundle.entries[1]] = [next.bundle.entries[1], next.bundle.entries[0]];
      [next.profile.migrations.entries[0], next.profile.migrations.entries[1]] = [next.profile.migrations.entries[1], next.profile.migrations.entries[0]]
      next.bundle.entries.forEach((row, index) => { row.order = index + 1 }); next.profile.migrations.entries.forEach((row, index) => { row.order = index + 1 })
    }
    const content = fixture.validate(fixture.reseal(next))
    assert.throws(() => assertAiPdmRepairMigrationMode(before, content), mutation === 'delete' ? /MIGRATION_INPUT_NOT_EQUIVALENT/u : /MIGRATION_HISTORICAL_PREFIX_INVALID/u, mutation)
  }
})

test('B24 current append rejects a different ordinal, wrong083 bytes, extra entries and mutated branded content', () => {
  for (const mutation of ['path', 'hash', 'extra']) {
    const fixture = repairMigrationContentFixture(), next = fixture.current
    if (mutation === 'path') next.bundle.entries[32].path = 'db/postgres/084_unapproved_forward.sql'
    else if (mutation === 'hash') next.bundle.entries[32].sourceSha256 = 'f'.repeat(64)
    else next.bundle.entries.push({ ...next.bundle.entries[32], order: 34 })
    assert.throws(() => fixture.validate(fixture.reseal(next)), /ARCHIVE_BUNDLE_INVALID/u, mutation)
  }
  const fixture = repairMigrationContentFixture(), before = fixture.validate(fixture.historical), after = fixture.validate(fixture.current)
  after.files.get(fixture.current.bundle.entries[0].path)[0] ^= 1
  assert.throws(() => assertAiPdmRepairMigrationMode(before, after), /MIGRATION_INPUT_NOT_EQUIVALENT/u)
})

function recordedHarness() {
  const objects = new Map()
  let generation = 0
  let service = {
    name: 'projects/jenfu-platform-prod/locations/asia-east1/services/jenfu-platform-prod', etag: 'e1', reconciling: false,
    generation: '1', observedGeneration: '1', terminalCondition: { state: 'CONDITION_SUCCEEDED' },
    ingress: 'INGRESS_TRAFFIC_INTERNAL_ONLY', defaultUriDisabled: true, invokerIamDisabled: false, uri: null, urls: [],
    template: { serviceAccount: 'platform-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com', containers: [{ image: 'old@sha256:' + '0'.repeat(64) }] },
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
      const artifactDigest = `${profile.artifact.uri}@sha256:${'d'.repeat(64)}`
      return { artifactDigest, build: { name: 'projects/p/locations/r/builds/b1', id: 'b1', projectId: profile.target.projectId, status: 'SUCCESS', serviceAccount: `projects/${profile.target.projectId}/serviceAccounts/${profile.identities.builder}`, sourceProvenance: { resolvedStorageSource: { bucket, object: sourceObject.ref.uri.split('/').slice(3).join('/'), generation: sourceObject.metadata.generation } }, results: { images: [{ name: `${profile.artifact.uri}:release-${intent.sourceRevision}`, digest: 'sha256:' + 'd'.repeat(64) }] }, options: { requestedVerifyOption: 'VERIFIED' } } }
    },
    async readArtifactImage(_profile, artifactDigest) { return { name: 'projects/p/dockerImages/i@sha256:x', uri: artifactDigest } },
    async waitArtifactEvidence({ artifactDigest }) { return { resourceUrl: `https://${artifactDigest}`, buildOccurrenceNames: ['build'], discoveryOccurrenceNames: ['discovery'], sbomOccurrenceNames: ['sbom'], vulnerabilityCount: 0, blockingVulnerabilityCount: 0, sbomExport: { resourceUrl: `https://${artifactDigest}`, discoveryOccurrence: 'discovery' }, observedAt: this.now(), status: 'PASS' } },
    async runMigrationJob({ profile, deployment, outputUri }) { return putJson(outputUri, { schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: profile.application.id, sourceRevision: deployment.sourceRevision, manifestSha256: migrationManifestSha256, boundaryStatus: 'PASS', status: 'PASS' }, { bucket, prefix: 'receipts' }) },
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
    application: { id: 'platform', repository: 'owner/repo', branch: 'main' },
    profileVersion: 'CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP', contractSha256: 'f'.repeat(64),
    target: { projectId: 'jenfu-platform-prod', projectNumber: '9536592944', region: 'asia-east1', serviceName: 'jenfu-platform-prod', runtimeServiceAccount: 'platform-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com', canonicalOrigin, entryPolicy: { ingress: 'INGRESS_TRAFFIC_ALL', defaultUriDisabled: false, invokerIamDisabled: true } },
    runtime: { containerName: 'platform', cloudSqlProxyContainer: 'cloud-sql-proxy', cloudSqlProxyImage: `proxy@sha256:${'f'.repeat(64)}`, cloudSqlProxyPort: 5432, cloudSqlProxyMaximumConnections: 24, cloudSqlConnectionName: 'p:r:i', network: 'runtime-vpc', subnet: 'runtime-subnet', port: 8080, startupProbePath: '/ready', cpu: '1', memory: '512Mi', concurrency: 20, timeoutSeconds: 60, maxInstances: 1, poolMax: 4 },
    schemas: { releaseIntent: 'owner.intent.v2', deploymentCapsule: 'owner.deployment.v2' },
    artifact: { releaseBucket: bucket, repository: 'platform-release', uri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform', migrationRunnerUri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform-migration-runner', migrationBundlePrefix: 'source/migration-bundles' },
    identities: { builder: 'platform-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' }, build: { maximumAllowedSeverity: 'MEDIUM' }, workflow: { path: '.github/workflows/deploy.yml' }, environment: { requiredPlainEnvironmentNames: ['NODE_ENV'], requiredSecretNames: ['SESSION_SECRET'], allowedSecretIds: { SESSION_SECRET: 'platform-prod-session-pepper' }, candidateOriginEnvironmentName: 'PORTAL_RELEASE_CANDIDATE_ORIGIN' }, sideEffects: { notification: 'DISABLED' },
  }
  const sourceIdentityBytes = Buffer.from('recorded-source-tree-manifest')
  const sourceArchiveBytes = Buffer.from('recorded-source-archive')
  const migrationBytes = Buffer.from('{"recorded":"migration"}\n')
  const migrationManifestSha256 = sha256('migration-manifest')
  const environment = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: profile.application.repository, GITHUB_REPOSITORY_ID: '1234', GITHUB_REPOSITORY_OWNER_ID: '5678', GITHUB_SHA: H40, GITHUB_WORKFLOW_SHA: H40, GITHUB_WORKFLOW_REF: 'owner/repo/.github/workflows/deploy.yml@refs/heads/main', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.example', GOOGLE_OAUTH_ACCESS_TOKEN: 'x'.repeat(32), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' }
  return { objects, transport, profile, sourceIdentityBytes, sourceArchiveBytes, migrationBytes, migrationManifestSha256, environment, service: () => service }
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
  const intent = { schemaVersion: 'owner.intent.v2', ownerApplicationId: 'platform', releaseId, sourceRevision: H40, sourceSha256: sha256(h.sourceIdentityBytes), sourceLockRef, authorizationPolicyRef, readinessReceiptRef, foundationReceiptRef, infraReceiptRef, runtimeConfigRef, migrationManifestSha256: h.migrationManifestSha256, previousRevision, deadlineAt: '2999-01-01T00:00:00.000Z' }
  const intentResult = await h.transport.putJson(`gs://${bucket}/receipts/intents/${releaseId}.json`, intent, { bucket, prefix: 'receipts' })
  return {
    intentResult,
    input: { capsuleRef: intentResult.ref.uri, capsuleSha256: intentResult.ref.sha256, profile: h.profile, transport: h.transport, environment: h.environment, validateIntent: (value) => value, createSourceIdentity: async () => h.sourceIdentityBytes, createSourceArchive: async () => h.sourceArchiveBytes, buildMigrationBundle: async () => ({ bundle: { manifestSha256: h.migrationManifestSha256 }, bytes: h.migrationBytes, bundleSha256: sha256(h.migrationBytes) }) },
  }
}


test('recorded provider transport executes the ten immutable owner stages without sibling state', async () => {
  const h = recordedHarness()
  const refFor = async (name, value) => (await h.transport.putJson(`gs://${bucket}/receipts/prerequisites/${name}.json`, value, { bucket, prefix: 'receipts' })).ref
  const common = { releaseAuthority: true, evidenceScope: 'PROVIDER' }
  const sourceLockRef = await refFor('source-lock', { ...common, status: 'SOURCE_FROZEN', sourceRevision: H40, clean: true })
  const authorizationPolicyRef = await refFor('authorization', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' })
  const readinessReceiptRef = await refFor('readiness', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z', projectId: 'jenfu-platform-prod' })
  const foundationReceiptRef = await refFor('foundation', { ...common, status: 'APPLIED', projectId: 'jenfu-platform-prod' })
  const infraReceiptRef = await refFor('infra', { ...common, status: 'APPLIED', projectId: 'jenfu-platform-prod', migrationRunnerDigest })
  const runtimeConfigRef = await refFor('runtime', { ...common, status: 'VERIFIED', projectId: 'jenfu-platform-prod', ...buildRuntimeConfig(h.profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } }) })
  const intent = { schemaVersion: 'owner.intent.v2', ownerApplicationId: 'platform', releaseId: 'REL-RECORDED-001', sourceRevision: H40, sourceSha256: sha256(h.sourceIdentityBytes), sourceLockRef, authorizationPolicyRef, readinessReceiptRef, foundationReceiptRef, infraReceiptRef, runtimeConfigRef, migrationManifestSha256: h.migrationManifestSha256, previousRevision, deadlineAt: '2999-01-01T00:00:00.000Z' }
  const intentResult = await h.transport.putJson(`gs://${bucket}/receipts/intents/release.json`, intent, { bucket, prefix: 'receipts' })
  const input = { capsuleRef: intentResult.ref.uri, capsuleSha256: intentResult.ref.sha256, profile: h.profile, transport: h.transport, environment: h.environment, validateIntent: (value) => value, createSourceIdentity: async () => h.sourceIdentityBytes, createSourceArchive: async () => h.sourceArchiveBytes, buildMigrationBundle: async () => ({ bundle: { manifestSha256: h.migrationManifestSha256 }, bytes: h.migrationBytes, bundleSha256: sha256(h.migrationBytes) }) }
  for (const stage of ['prepare', 'build', 'migrate']) await executeOwnerStage({ ...input, stage })
  const migrationOnlyService = structuredClone(h.service())
  const migrationOnlyObjectCount = h.objects.size
  assert.equal(h.transport.effectiveRevision(h.service()), previousRevision)
  for (const stage of ['prepare', 'build', 'migrate']) await executeOwnerStage({ ...input, stage })
  assert.deepEqual(h.service(), migrationOnlyService)
  assert.equal(h.objects.size, migrationOnlyObjectCount)
  for (const stage of ['candidate', 'entrypoint', 'verify', 'decision', 'activate', 'canonical', 'finalize']) await executeOwnerStage({ ...input, stage })
  const activation = [...h.objects.entries()].find(([uri]) => uri.endsWith('/activate.json'))
  assert.ok(activation)
  assert.equal(JSON.parse(activation[1].bytes.toString()).facts.defaultUriDisabled, false)
  const archivedSource = [...h.objects.entries()].find(([uri]) => uri.endsWith('/source.tar.gz'))
  assert.ok(archivedSource)
  assert.deepEqual(gunzipSync(archivedSource[1].bytes), h.sourceArchiveBytes)
  const terminal = [...h.objects.entries()].find(([uri]) => uri.endsWith('/terminal.json'))
  assert.ok(terminal)
  assert.equal(JSON.parse(terminal[1].bytes.toString()).facts.result, 'RELEASED')
  assert.equal(h.service().trafficStatuses.some((row) => row.tag), false)
  assert.equal(h.transport.effectiveRevision(h.service()), candidateRevision)
})

test('generic sealed released and rolled-back baselines retain profile-bound continuation reads', async () => {
  for (const result of ['RELEASED', 'ROLLED_BACK']) {
    const h = recordedHarness()
    const { intentResult } = await authorizedRecordedInput(h, `REL-GENERIC-${result.replaceAll('_', '-')}`)
    const intent = (await h.transport.readJson(intentResult.ref)).value
    const terminalUri = releasePaths(h.profile, intent, intentResult.ref.sha256).terminal
    const core = { schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: h.profile.application.id,
      releaseId: intent.releaseId, sourceRevision: H40, stage: 'terminal', status: 'PASS', facts: { result } }
    await h.transport.putJson(terminalUri, { ...core, receiptSha256: sha256(canonicalize(core)) }, { bucket, prefix: 'receipts' })
    const jsonReads = [], byteReads = [], beforeCount = h.objects.size, beforeService = structuredClone(h.service())
    let providerReads = 0
    const unexpectedProvider = async () => { providerReads++; throw Error('UNEXPECTED_PROVIDER_READ') }
    const transport = { ...h.transport,
      async readJson(ref, ownerBucket, prefixes) { jsonReads.push({ ref, ownerBucket, prefixes }); return h.transport.readJson(ref) },
      async readBytes(uri, options) { byteReads.push({ uri, options }); return h.transport.readBytes(uri, options) },
      getService: unexpectedProvider, getRevision: unexpectedProvider, readOwnerRun: unexpectedProvider, readOwnerSourceProof: unexpectedProvider }
    assert.equal(await readPreActivationAbortContinuation({ profile: h.profile, transport, baselineIntentRef: intentResult.ref }), null)
    assert.deepEqual(jsonReads, [{ ref: intentResult.ref, ownerBucket: bucket, prefixes: ['receipts'] }])
    assert.deepEqual(byteReads, [{ uri: terminalUri, options: { prefixes: ['receipts'] } }])
    assert.equal(providerReads, 0)
    assert.equal(h.objects.size, beforeCount)
    assert.deepEqual(h.service(), beforeService)
    const aiProfile = { ...h.profile, application: { ...h.profile.application, id: 'ai-pdm' },
      artifact: { ...h.profile.artifact, releaseBucket: 'jenfu-platform-prod-aipdm-release' } }
    await assert.rejects(readPreActivationAbortContinuation({ profile: aiProfile, transport, baselineIntentRef: intentResult.ref }), /IMMUTABLE_REF_INVALID/u)
    assert.equal(jsonReads.length, 1)
    assert.equal(byteReads.length, 1)
    assert.equal(providerReads, 0)
  }
})

test('prepare replay rejects aborted baseline control drift before reusing a cached receipt', async () => {
  const h = recordedHarness()
  const { intentResult, input } = await authorizedRecordedInput(h, 'REL-PREPARE-REPLAY')
  const original = (await h.transport.readJson(intentResult.ref)).value
  const baselineIntent = { ...original, releaseId: 'REL-ABORTED-BASELINE' }
  const baseline = await h.transport.putJson(`gs://${bucket}/receipts/intents/aborted.json`, baselineIntent, { bucket, prefix: 'receipts' })
  const intent = { ...original, baselineIntentRef: baseline.ref }
  const capsule = await h.transport.putJson(`gs://${bucket}/receipts/intents/replay.json`, intent, { bucket, prefix: 'receipts' })
  const seal = (core) => ({ ...core, receiptSha256: sha256(canonicalize(core)) })
  const core = { schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'platform', sourceRevision: H40, status: 'PASS' }
  await h.transport.putJson(releasePaths(h.profile, baselineIntent, baseline.ref.sha256).terminal,
    seal({ ...core, releaseId: baselineIntent.releaseId, stage: 'terminal', facts: { result: 'PRE_ACTIVATION_ABORTED' } }), { bucket, prefix: 'receipts' })
  await h.transport.putJson(releasePaths(h.profile, intent, capsule.ref.sha256).prepare,
    seal({ ...core, releaseId: intent.releaseId, stage: 'prepare', facts: {} }), { bucket, prefix: 'receipts' })
  await h.transport.putJson(`gs://${bucket}/control/active.json`, { result: 'RELEASED' }, { bucket, prefix: 'control' })
  const objectCount = h.objects.size
  await assert.rejects(executeOwnerStage({ ...input, capsuleRef: capsule.ref.uri, capsuleSha256: capsule.ref.sha256, stage: 'prepare' }),
    /DEV121_PREACTIVATION_CONTINUATION_INVALID/u)
  assert.equal(h.objects.size, objectCount)
})

test('principal-only migration intent refuses a fence without a safe recovery revision', async () => {
  const h = recordedHarness()
  const { intentResult, input } = await authorizedRecordedInput(h, 'REL-PRINCIPAL-FENCE')
  const original = await h.transport.readJson(intentResult.ref)
  const principalOnlyFenceRef = {
    uri: `gs://${bucket}/receipts/releases/DEV121-PRINCIPAL-ONLY-MIGRATION-FENCE/fence.json`,
    sha256: 'f'.repeat(64),
  }
  const intent = { ...original.value, principalOnlyFenceRef }
  const capsule = await h.transport.putJson(`gs://${bucket}/receipts/intents/principal-fence.json`,
    intent, { bucket, prefix: 'receipts' })
  const fencedInput = { ...input, capsuleRef: capsule.ref.uri,
    capsuleSha256: capsule.ref.sha256 }
  await assert.rejects(executeOwnerStage({ ...fencedInput, stage: 'prepare' }),
    /DEV121_PRINCIPAL_RECOVERY_INVALID/u)
})

test('candidate tag readback accepts deterministic and provider-derived run.app URLs only', () => {
  const candidate = { tag: candidateTag, tagUri: candidateOrigin }
  const service = { uri: 'https://jenfu-platform-prod-56gnizku7q-de.a.run.app', urls: [canonicalOrigin, 'https://jenfu-platform-prod-56gnizku7q-de.a.run.app'] }
  assert.equal(candidateTagUriMatches(service, candidate, candidateOrigin), true)
  assert.equal(candidateTagUriMatches(service, candidate, `https://${candidateTag}---jenfu-platform-prod-56gnizku7q-de.a.run.app`), true)
  assert.equal(candidateTagUriMatches(service, candidate, `https://${candidateTag}---sibling-56gnizku7q-de.a.run.app`), false)
})

test('expired control is superseded only after terminal owner-run and settled baseline readback', () => {
  const profile = { application: { id: 'platform', repository: 'owner/repo' }, target: { serviceName: 'jenfu-platform-prod' }, artifact: { releaseBucket: bucket } }
  const core = {
    schemaVersion: 'jenfu.dev012.owner-control-head.v1', inputFingerprint: '1'.repeat(64), ownerApplicationId: 'platform',
    service: 'jenfu-platform-prod', controlBucket: bucket, releaseId: 'REL-OLD-001', sourceRevision: H40,
    sourceLockSha256: '2'.repeat(64), candidateRevision, previousRevision, ownerRunRef: 'https://api.github.com/repos/owner/repo/actions/runs/99',
    leaseExpiresAt: '2026-09-08T00:00:00.000Z', deadlineAt: '2026-09-08T02:00:00.000Z', state: 'GO', result: null,
  }
  const current = { ...core, controlSha256: sha256(canonicalize(core)) }
  const ownerRun = { id: '99', status: 'completed', conclusion: 'failure', event: 'workflow_dispatch', headSha: H40 }
  const service = { traffic: [{ revision: previousRevision, percent: 100 }], trafficStatuses: [{ revision: previousRevision, percent: 100 }] }
  const input = { current, profile, intent: { previousRevision }, ownerRun, service, activeRevision: previousRevision, now: '2026-09-08T01:00:00.000Z' }
  assert.equal(assertStaleControlSafeToSupersede(input), true)
  const newCandidate = { tag: 'candidate-newcontrol', candidateRevision: 'jenfu-platform-prod-newcontrol' }
  const taggedService = {
    traffic: [...service.traffic, { revision: newCandidate.candidateRevision, percent: 0, tag: newCandidate.tag }],
    trafficStatuses: [...service.trafficStatuses, { revision: newCandidate.candidateRevision, percent: 0, tag: newCandidate.tag }],
  }
  assert.equal(assertStaleControlSafeToSupersede({ ...input, service: taggedService, candidate: newCandidate, nextState: 'CANDIDATE_CREATED' }), true)
  assert.throws(() => assertStaleControlSafeToSupersede({ ...input, service: taggedService, candidate: { ...newCandidate, tag: 'candidate-wrong' }, nextState: 'CANDIDATE_CREATED' }), /CONTROL_HEAD_TAKEOVER_UNSAFE/u)
  assert.throws(() => assertStaleControlSafeToSupersede({ ...input, ownerRun: { ...ownerRun, status: 'in_progress', conclusion: null } }), /CONTROL_HEAD_TAKEOVER_UNSAFE/u)
  assert.throws(() => assertStaleControlSafeToSupersede({ ...input, service: { ...service, trafficStatuses: [...service.trafficStatuses, { revision: candidateRevision, tag: candidateTag }] } }), /CONTROL_HEAD_TAKEOVER_UNSAFE/u)
  assert.throws(() => assertStaleControlSafeToSupersede({ ...input, activeRevision: candidateRevision }), /CONTROL_HEAD_TAKEOVER_UNSAFE/u)
})

test('rollback reports no database mutation when migrate receipt was never produced', async () => {
  const h = recordedHarness()
  const refFor = async (name, value) => (await h.transport.putJson(`gs://${bucket}/receipts/prerequisites/rollback-${name}.json`, value, { bucket, prefix: 'receipts' })).ref
  const common = { releaseAuthority: true, evidenceScope: 'PROVIDER' }
  const sourceLockRef = await refFor('source-lock', { ...common, status: 'SOURCE_FROZEN', sourceRevision: H40, clean: true })
  const authorizationPolicyRef = await refFor('authorization', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' })
  const readinessReceiptRef = await refFor('readiness', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z', projectId: 'jenfu-platform-prod' })
  const foundationReceiptRef = await refFor('foundation', { ...common, status: 'APPLIED', projectId: 'jenfu-platform-prod' })
  const infraReceiptRef = await refFor('infra', { ...common, status: 'APPLIED', projectId: 'jenfu-platform-prod', migrationRunnerDigest })
  const runtimeConfigRef = await refFor('runtime', { ...common, status: 'VERIFIED', projectId: 'jenfu-platform-prod', ...buildRuntimeConfig(h.profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } }) })
  const intent = { schemaVersion: 'owner.intent.v2', ownerApplicationId: 'platform', releaseId: 'REL-RECORDED-ROLLBACK', sourceRevision: H40, sourceSha256: sha256(h.sourceIdentityBytes), sourceLockRef, authorizationPolicyRef, readinessReceiptRef, foundationReceiptRef, infraReceiptRef, runtimeConfigRef, migrationManifestSha256: h.migrationManifestSha256, previousRevision, deadlineAt: '2999-01-01T00:00:00.000Z' }
  const intentResult = await h.transport.putJson(`gs://${bucket}/receipts/intents/rollback.json`, intent, { bucket, prefix: 'receipts' })
  const input = { capsuleRef: intentResult.ref.uri, capsuleSha256: intentResult.ref.sha256, profile: h.profile, transport: h.transport, environment: h.environment, validateIntent: (value) => value, createSourceIdentity: async () => h.sourceIdentityBytes, createSourceArchive: async () => h.sourceArchiveBytes, buildMigrationBundle: async () => ({ bundle: { manifestSha256: h.migrationManifestSha256 }, bytes: h.migrationBytes, bundleSha256: sha256(h.migrationBytes) }) }
  await executeOwnerStage({ ...input, stage: 'prepare' })
  await executeOwnerStage({ ...input, stage: 'rollback' })
  const terminal = [...h.objects.entries()].find(([uri]) => uri.includes(intentResult.ref.sha256) && uri.endsWith('/terminal.json'))
  assert.ok(terminal)
  const value = JSON.parse(terminal[1].bytes.toString())
  assert.equal(value.facts.result, 'PRE_ACTIVATION_ABORTED')
  assert.equal(value.facts.databaseDisposition, 'NOT_APPLIED')
})
test('B24 rollback reports UNKNOWN after a durable migration submission and rejects a tampered intent', async () => {
  const createSubmitted = async (releaseId) => {
    const h = recordedHarness()
    h.profile.migrations = { jobName: 'platform-prod-migration-runner', serviceAccount: 'platform-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com' }
    const { input, intentResult } = await authorizedRecordedInput(h, releaseId)
    await executeOwnerStage({ ...input, stage: 'prepare' })
    await executeOwnerStage({ ...input, stage: 'build' })
    const intent = JSON.parse(h.objects.get(intentResult.ref.uri).bytes.toString())
    const paths = releasePaths(h.profile, intent, intentResult.ref.sha256)
    const deployment = JSON.parse(h.objects.get(paths.deployment).bytes.toString())
    const submissionUri = migrationSubmissionIntentUri(h.profile, paths.migrate)
    const args = [
      '--bundle-ref', deployment.migrationBundleRef.uri,
      '--bundle-sha256', deployment.migrationBundleRef.sha256,
      '--source-revision', deployment.sourceRevision,
      '--output-ref', paths.migrate,
    ]
    const submission = {
      schemaVersion: 'jenfu.dev012.migration-submission-intent.v1',
      ownerApplicationId: h.profile.application.id,
      sourceRevision: deployment.sourceRevision,
      jobName: 'projects/' + h.profile.target.projectId + '/locations/' + h.profile.target.region + '/jobs/' + h.profile.migrations.jobName,
      migrationRunnerDigest: deployment.migrationRunnerDigest,
      migrationBundleRef: deployment.migrationBundleRef,
      outputUri: paths.migrate,
      args,
      principalOnlyFenceRef: null,
      deadlineAt: intent.deadlineAt,
      status: 'SUBMISSION_INTENT',
      observedAt: h.transport.now(),
    }
    submission.receiptSha256 = sha256(canonicalize(submission))
    const saved = await h.transport.putJson(submissionUri, submission, { bucket, prefix: 'receipts', ifGenerationMatch: '0' })
    return { h, input, intentResult, saved }
  }

  const valid = await createSubmitted('REL-RECORDED-UNKNOWN-MIGRATION')
  await executeOwnerStage({ ...valid.input, stage: 'rollback' })
  const terminal = [...valid.h.objects.entries()].find(([uri]) => uri.includes(valid.intentResult.ref.sha256) && uri.endsWith('/terminal.json'))
  const rollback = [...valid.h.objects.entries()].find(([uri]) => uri.includes(valid.intentResult.ref.sha256) && uri.endsWith('/rollback.json'))
  for (const row of [terminal, rollback]) {
    assert.ok(row)
    const value = JSON.parse(row[1].bytes.toString())
    assert.equal(value.facts.databaseDisposition, 'UNKNOWN')
    assert.deepEqual(value.facts.migrationSubmissionIntentRef, valid.saved.ref)
  }

  const tampered = await createSubmitted('REL-RECORDED-TAMPERED-SUBMISSION')
  const row = tampered.h.objects.get(tampered.saved.ref.uri)
  const value = JSON.parse(row.bytes.toString()); value.jobName += '-sibling'
  row.bytes = Buffer.from(canonicalize(value) + '\n')
  await assert.rejects(executeOwnerStage({ ...tampered.input, stage: 'rollback' }), /MIGRATION_SUBMISSION_INTENT_INVALID/u)
})
test('post-activation rollback switches to the previous revision without rebinding the candidate tag', async () => {
  const h = recordedHarness()
  const { input, intentResult } = await authorizedRecordedInput(h, 'REL-RECORDED-ACTIVE-ROLLBACK')
  for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'entrypoint', 'verify', 'decision', 'activate']) await executeOwnerStage({ ...input, stage })
  await executeOwnerStage({ ...input, stage: 'rollback' })
  const terminal = [...h.objects.entries()].find(([uri]) => uri.includes(intentResult.ref.sha256) && uri.endsWith('/terminal.json'))
  assert.ok(terminal)
  const value = JSON.parse(terminal[1].bytes.toString())
  assert.equal(value.facts.result, 'ROLLED_BACK')
  assert.equal(value.facts.databaseDisposition, 'FORWARD_APPLIED')
  assert.equal(h.transport.effectiveRevision(h.service()), previousRevision)
  assert.equal(h.service().trafficStatuses.some((row) => row.tag), false)
  assert.equal(h.service().ingress, 'INGRESS_TRAFFIC_INTERNAL_ONLY')
  assert.equal(h.service().defaultUriDisabled, true)
})

test('build-only preparation has no live mutation and a later exact-source run reuses its immutable build', async () => {
  const h = recordedHarness()
  const {intentResult,input} = await authorizedRecordedInput(h,'REL-BUILD-ONLY')
  const before=structuredClone(h.service())
  for (const name of ['runMigrationJob','createCandidate','setTraffic','configureEntrypoint','publishIncident']) h.transport[name]=async()=>{throw Error('UNEXPECTED_LIVE_MUTATION:'+name)}
  await executeOwnerStage({...input,stage:'prepare'})
  const first=await executeOwnerStage({...input,stage:'build'})
  const objectCount=h.objects.size
  h.transport.createBuild=async()=>{throw Error('BUILD_MUST_BE_REUSED')}
  const environment={...h.environment,GITHUB_RUN_ID:'124'}
  await executeOwnerStage({...input,environment,stage:'prepare'})
  const repeated=await executeOwnerStage({...input,environment,stage:'build'})
  assert.deepEqual(first.ref,repeated.ref)
  assert.deepEqual(h.service(),before)
  assert.equal(h.objects.size,objectCount)
  assert.equal([...h.objects.keys()].some(uri=>uri.includes('/control/')||uri.endsWith('/terminal.json')||uri.endsWith('/migrate.json')),false)
  await assert.rejects(executeOwnerStage({...input,environment:{...environment,GITHUB_SHA:'b'.repeat(40)},stage:'build'}))
})

test('build-only continuation revalidates current prerequisites and live baseline before migration', async () => {
  for (const scenario of ['prerequisite','revision','entrypoint']) {
    const h=recordedHarness()
    const {input}=await authorizedRecordedInput(h,'REL-RESUME-'+scenario.toUpperCase())
    await executeOwnerStage({...input,stage:'prepare'})
    await executeOwnerStage({...input,stage:'build'})
    if(scenario==='prerequisite') {
      const read=h.transport.readJson
      h.transport.readJson=async(ref,...args)=>{
        if(ref.uri.endsWith('-authorization.json')) throw Error('AUTHORIZATION_READ_FAILED')
        return read(ref,...args)
      }
    } else {
      const read=h.transport.getService
      h.transport.getService=async()=>{
        const value=await read()
        if(scenario==='revision') value.trafficStatuses[0].revision='another-release'
        else value.defaultUriDisabled=false
        return value
      }
    }
    await assert.rejects(executeOwnerStage({...input,environment:{...h.environment,GITHUB_RUN_ID:'124'},stage:'prepare'}), scenario==='prerequisite'?/AUTHORIZATION_READ_FAILED/:/PREPARE_BASELINE_MISMATCH/)
    assert.equal([...h.objects.keys()].some(uri=>uri.endsWith('/migrate.json')),false)
  }
})

test('B24 normal migration executor submits once and replays the same immutable receipt without a second Job', async () => {
  const h = recordedHarness(), { input } = await authorizedRecordedInput(h, 'REL-B24-MIGRATION-REPLAY')
  let submissions = 0
  const run = h.transport.runMigrationJob
  h.transport.runMigrationJob = async args => { submissions++; return run(args) }
  await executeOwnerStage({ ...input, stage: 'prepare' })
  await executeOwnerStage({ ...input, stage: 'build' })
  const first = await executeOwnerStage({ ...input, stage: 'migrate' })
  const count = h.objects.size, baseline = structuredClone(h.service())
  const second = await executeOwnerStage({ ...input, stage: 'migrate' })
  assert.equal(first.value.schemaVersion, 'jenfu.dev012.migration-receipt.v1')
  assert.equal(first.value.status, 'PASS')
  assert.deepEqual(second.ref, first.ref)
  assert.equal(submissions, 1)
  assert.equal(h.objects.size, count)
  assert.deepEqual(h.service(), baseline)
  const terminal = await executeOwnerStage({ ...input, stage: 'rollback' })
  assert.equal(JSON.parse(terminal.bytes).facts.databaseDisposition, 'FORWARD_APPLIED')
  assert.equal(submissions, 1)
})

test('B24 malformed standard migration readback is denied without resubmitting an existing Job receipt', async () => {
  const h = recordedHarness(), { input } = await authorizedRecordedInput(h, 'REL-B24-MIGRATION-DENIED')
  let submissions = 0
  const run = h.transport.runMigrationJob
  h.transport.runMigrationJob = async args => { submissions++; return run(args) }
  await executeOwnerStage({ ...input, stage: 'prepare' })
  await executeOwnerStage({ ...input, stage: 'build' })
  const first = await executeOwnerStage({ ...input, stage: 'migrate' })
  const original = h.objects.get(first.ref.uri)
  original.bytes = Buffer.from(`${canonicalize({ ...first.value, manifestSha256: 'f'.repeat(64) })}\n`)
  const count = h.objects.size
  await assert.rejects(executeOwnerStage({ ...input, stage: 'migrate' }), /MIGRATION_RECEIPT_INVALID/u)
  assert.equal(submissions, 1)
  assert.equal(h.objects.size, count)
  assert.equal([...h.objects.keys()].some(uri => uri.endsWith('/candidate.json')), false)
})

test('B23 expired current AI capsule stops actual protected build before publication or a paid build', async () => {
  const h = recordedHarness(), { input } = await authorizedRecordedInput(h, 'REL-B23-EXPIRED')
  const row = await h.transport.readJson({ uri: input.capsuleRef, sha256: input.capsuleSha256 })
  const expired = { ...row.value, ownerApplicationId: 'ai-pdm', deadlineAt: new Date(Date.now() - 1).toISOString() }
  const aiProfile = { ...h.profile, application: { ...h.profile.application, id: 'ai-pdm' } }
  const saved = await h.transport.putJson(`gs://${bucket}/receipts/intents/REL-B23-EXPIRED-AI.json`, expired)
  let builds = 0, writes = 0, candidates = 0
  const transport = { ...h.transport, createBuild: async () => { builds++; throw Error('EXPIRED_BUILD') }, putJson: async () => { writes++; throw Error('EXPIRED_PUBLICATION') },
    putBytes: async () => { writes++; throw Error('EXPIRED_SOURCE') }, createCandidate: async () => { candidates++; throw Error('EXPIRED_CANDIDATE') } }
  await assert.rejects(executeOwnerStage({ ...input, profile: aiProfile, capsuleRef: saved.ref.uri, capsuleSha256: saved.ref.sha256, transport, stage: 'build' }), /RELEASE_INTENT_INVALID|OWNER_DEADLINE/u)
  assert.deepEqual({ builds, writes, candidates }, { builds: 0, writes: 0, candidates: 0 })
})

async function privateCleanupOwnerFixture() {
  const h = recordedHarness()
  const ownBucket = 'jenfu-platform-prod-aipdm-release'
  h.profile = { ...h.profile, application: { ...h.profile.application, id: 'ai-pdm' },
    artifact: { ...h.profile.artifact, releaseBucket: ownBucket } }
  const sqlBytes = Buffer.from('SELECT 34;\n')
  const operationId = '33333333-3333-4333-8333-333333333333'
  const operation = { schemaVersion: 'ai-pdm.unlinked-profile-cleanup-operation.v1', ownerApplicationId: 'ai-pdm', sourceRevision: H40,
    migrationSourceSha256: sha256(sqlBytes), operationId, targetProfileId: 'synthetic-unused-profile', targetCompanyId: 'synthetic-company' }
  const privateObject = await h.transport.putJson(`gs://${ownBucket}/${UNLINKED_PROFILE_CLEANUP_PREFIX}/${operationId}.json`, operation)
  const operationRef = { ...privateObject.ref, generation: String(privateObject.metadata.generation) }
  const entries = Array.from({ length: 34 }, (_, index) => {
    const bytes = Buffer.from(`SELECT ${index + 1};\n`)
    return { order: index + 1, version: `ai-pdm-${String(index + 1).padStart(3, '0')}`, name: `synthetic_${index + 1}`,
      path: `db/postgres/${String(index + 1).padStart(3, '0')}_synthetic.sql`, sourceSha256: sha256(bytes), appliedSha256: sha256(bytes), sqlBase64: bytes.toString('base64') }
  })
  Object.assign(entries.at(-1), { version: 'ai-pdm-084', name: 'dev121_unlinked_legacy_profile_cleanup', path: UNLINKED_PROFILE_CLEANUP_PATH })
  h.profile.migrations = { ledger: 'ai_pdm_core.schema_migrations', baselineCount: 15,
    entries: entries.map(entry => ({ order: entry.order, path: entry.path, sha256: entry.sourceSha256 })) }
  const bundleInput = { target: { ownerApplicationId: 'ai-pdm', ledger: 'ai_pdm_core.schema_migrations', baselineCount: 15 }, sourceRevision: H40, entries, unlinkedProfileCleanupRef: operationRef }
  const migration = createMigrationBundle(bundleInput)
  const baseInput = { ...bundleInput }; delete baseInput.unlinkedProfileCleanupRef
  const baseline = createMigrationBundle(baseInput)
  const refFor = async (name, value) => (await h.transport.putJson(`gs://${ownBucket}/receipts/prerequisites/private-${name}.json`, value)).ref
  const common = { releaseAuthority: true, evidenceScope: 'PROVIDER' }
  const sourceLockRef = await refFor('source-lock', { ...common, status: 'SOURCE_FROZEN', sourceRevision: H40, clean: true,
    sourceSha256: sha256(h.sourceIdentityBytes), migrationManifestSha256: baseline.bundle.manifestSha256 })
  const authorizationPolicyRef = await refFor('authorization', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' })
  const readinessReceiptRef = await refFor('readiness', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z', projectId: h.profile.target.projectId })
  const foundationReceiptRef = await refFor('foundation', { ...common, status: 'APPLIED', projectId: h.profile.target.projectId })
  const infraReceiptRef = await refFor('infra', { ...common, status: 'APPLIED', projectId: h.profile.target.projectId, migrationRunnerDigest })
  const runtimeConfigRef = await refFor('runtime', { ...common, status: 'VERIFIED', projectId: h.profile.target.projectId, ...buildRuntimeConfig(h.profile, { plainEnvironment: { NODE_ENV: 'production' }, secretVersions: { SESSION_SECRET: '1' } }) })
  const intent = { schemaVersion: 'owner.intent.v2', ownerApplicationId: 'ai-pdm', releaseId: 'REL-PRIVATE-CLEANUP-SYNTHETIC', sourceRevision: H40,
    sourceSha256: sha256(h.sourceIdentityBytes), sourceLockRef, authorizationPolicyRef, readinessReceiptRef, foundationReceiptRef, infraReceiptRef, runtimeConfigRef,
    migrationManifestSha256: migration.bundle.manifestSha256, previousRevision, deadlineAt: '2999-01-01T00:00:00.000Z', unlinkedProfileCleanupRef: operationRef }
  const capsule = await h.transport.putJson(`gs://${ownBucket}/receipts/intents/private-synthetic.json`, intent)
  const input = { capsuleRef: capsule.ref.uri, capsuleSha256: capsule.ref.sha256, profile: h.profile, transport: h.transport, environment: h.environment,
    validateIntent: value => value, createSourceIdentity: async () => h.sourceIdentityBytes, createSourceArchive: async () => h.sourceArchiveBytes,
    readWorkerSource: (path, revision) => { assert.equal(path, UNLINKED_PROFILE_CLEANUP_PATH); assert.equal(revision, H40); return sqlBytes },
    buildMigrationBundle: async (revision, context) => {
      assert.equal(revision, H40)
      if (context === undefined) return baseline
      assert.deepEqual(context, { unlinkedProfileCleanupRef: operationRef })
      return migration
    } }
  let submissions = 0
  h.transport.runMigrationJob = async ({ profile, deployment, outputUri }) => {
    submissions++
    return h.transport.putJson(outputUri, { schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: profile.application.id,
      sourceRevision: deployment.sourceRevision, manifestSha256: migration.bundle.manifestSha256, boundaryStatus: 'PASS', status: 'PASS',
      unlinkedProfileCleanup: { operationRef, result: { status: 'DELETED', auditId: 'dev121-unlinked-profile-cleanup-v2-' + 'c'.repeat(64), priorRowSha256: 'd'.repeat(64) } } })
  }
  return { h, input, intent, capsule, operationRef, migration, baseline, bundleInput, submissions: () => submissions }
}

test('private cleanup owner keeps protected context, immutable binding and exact build/migrate replay without target overrides', async () => {
  const f = await privateCleanupOwnerFixture()
  await assert.rejects(executeOwnerStage({ ...f.input, stage: 'prepare', environment: { ...f.input.environment, GITHUB_SHA: 'e'.repeat(40) } }), /GITHUB_SOURCE_AUTHORITY_MISMATCH/u)
  const writes = f.h.objects.size
  await assert.rejects(executeOwnerStage({ ...f.input, stage: 'prepare', readWorkerSource: () => Buffer.from('changed SQL') }), /UNLINKED_PROFILE_CLEANUP_SOURCE_INVALID/u)
  assert.equal(f.h.objects.size, writes)
  for (const stage of ['prepare', 'build', 'migrate']) await executeOwnerStage({ ...f.input, stage })
  const first = await executeOwnerStage({ ...f.input, stage: 'migrate' })
  assert.equal(first.value.unlinkedProfileCleanup.result.status, 'DELETED')
  assert.equal(f.submissions(), 1)
  const privateReads = []
  const read = f.h.transport.readBytes
  f.h.transport.readBytes = async (uri, options) => { privateReads.push({ uri, options }); return read(uri, options) }
  await executeOwnerStage({ ...f.input, stage: 'build' })
  assert.ok(privateReads.some(row => row.uri === f.operationRef.uri && row.options.expectedGeneration === f.operationRef.generation))
  assert.equal(f.submissions(), 1)
})

test('private cleanup owner rejects a mismatched migration bundle before Job submission', async () => {
  const f = await privateCleanupOwnerFixture()
  await executeOwnerStage({ ...f.input, stage: 'prepare' })
  await executeOwnerStage({ ...f.input, stage: 'build' })
  const deploymentPath = releasePaths(f.h.profile, f.intent, f.capsule.ref.sha256).deployment
  const deployment = JSON.parse(f.h.objects.get(deploymentPath).bytes.toString())
  const bundleRow = f.h.objects.get(deployment.migrationBundleRef.uri)
  const wrong = JSON.parse(bundleRow.bytes.toString())
  wrong.unlinkedProfileCleanupRef.generation = '999999'
  const core = { ...wrong }; delete core.manifestSha256
  wrong.manifestSha256 = sha256(canonicalize(core))
  bundleRow.bytes = Buffer.from(canonicalize(wrong) + '\n')
  // A coherent malicious deployment hash must still fail the frozen intent join.
  deployment.migrationBundleRef.sha256 = sha256(bundleRow.bytes)
  f.h.objects.get(deploymentPath).bytes = Buffer.from(canonicalize(deployment) + '\n')
  await assert.rejects(executeOwnerStage({ ...f.input, stage: 'migrate' }), /UNLINKED_PROFILE_CLEANUP_BUNDLE_MISMATCH/u)
  assert.equal(f.submissions(), 0)
})

test('private cleanup owner rejects an absent or wrong private result without a duplicate Job', async () => {
  for (const scenario of ['absent', 'wrong-ref']) {
    const f = await privateCleanupOwnerFixture()
    for (const stage of ['prepare', 'build', 'migrate']) await executeOwnerStage({ ...f.input, stage })
    const migratePath = releasePaths(f.h.profile, f.intent, f.capsule.ref.sha256).migrate
    const row = f.h.objects.get(migratePath)
    const receipt = JSON.parse(row.bytes.toString())
    if (scenario === 'absent') delete receipt.unlinkedProfileCleanup
    else receipt.unlinkedProfileCleanup.operationRef.generation = '999999'
    row.bytes = Buffer.from(canonicalize(receipt) + '\n')
    await assert.rejects(executeOwnerStage({ ...f.input, stage: 'migrate' }), /UNLINKED_PROFILE_CLEANUP_RECEIPT_INVALID/u)
    await assert.rejects(executeOwnerStage({ ...f.input, stage: 'candidate' }), /UNLINKED_PROFILE_CLEANUP_RECEIPT_INVALID/u)
    assert.equal(f.submissions(), 1)
  }
})

test('every private cleanup stage rejects coherently hashed invalid BASE source locks before provider effects', async () => {
  const scenarios = ['missing-base', 'wrong-base', 'missing-source-sha', 'wrong-source-sha', 'wrong-source-revision', 'dirty-source']
  for (const stage of ['prepare', 'build', 'migrate']) {
    for (const scenario of scenarios) {
      const f = await privateCleanupOwnerFixture()
      if (stage !== 'prepare') await executeOwnerStage({ ...f.input, stage: 'prepare' })
      if (stage === 'migrate') await executeOwnerStage({ ...f.input, stage: 'build' })
      const sourceLockRow = f.h.objects.get(f.intent.sourceLockRef.uri)
      const lock = JSON.parse(sourceLockRow.bytes.toString())
      if (scenario === 'missing-base') delete lock.migrationManifestSha256
      if (scenario === 'wrong-base') lock.migrationManifestSha256 = 'f'.repeat(64)
      if (scenario === 'missing-source-sha') delete lock.sourceSha256
      if (scenario === 'wrong-source-sha') lock.sourceSha256 = 'f'.repeat(64)
      if (scenario === 'wrong-source-revision') lock.sourceRevision = 'f'.repeat(40)
      if (scenario === 'dirty-source') lock.clean = false
      sourceLockRow.bytes = Buffer.from(canonicalize(lock) + '\n')
      const intent = structuredClone(f.intent)
      intent.sourceLockRef.sha256 = sha256(sourceLockRow.bytes)
      const capsuleRow = f.h.objects.get(f.capsule.ref.uri)
      capsuleRow.bytes = Buffer.from(canonicalize(intent) + '\n')
      const capsuleSha256 = sha256(capsuleRow.bytes)
      let writes = 0, builds = 0, jobs = 0
      const transport = { ...f.h.transport,
        putBytes: async () => { writes++; throw Error('UNEXPECTED_PRIVATE_STAGE_WRITE') },
        putJson: async () => { writes++; throw Error('UNEXPECTED_PRIVATE_STAGE_WRITE') },
        createBuild: async () => { builds++; throw Error('UNEXPECTED_PAID_BUILD') },
        runMigrationJob: async () => { jobs++; throw Error('UNEXPECTED_MIGRATION_JOB') } }
      await assert.rejects(executeOwnerStage({ ...f.input, stage, capsuleSha256, transport }),
        { code: 'UNLINKED_PROFILE_CLEANUP_SOURCE_LOCK_INVALID' }, `${stage}/${scenario}`)
      assert.deepEqual({ writes, builds, jobs }, { writes: 0, builds: 0, jobs: 0 }, `${stage}/${scenario}`)
    }
  }
})

test('every private cleanup stage rejects a coherent intent BOUND manifest mismatch before provider effects', async () => {
  for (const stage of ['prepare', 'build', 'migrate']) {
    const f = await privateCleanupOwnerFixture()
    const intent = { ...f.intent, migrationManifestSha256: 'f'.repeat(64) }
    const row = f.h.objects.get(f.capsule.ref.uri)
    row.bytes = Buffer.from(canonicalize(intent) + '\n')
    let writes = 0, builds = 0, jobs = 0
    const transport = { ...f.h.transport,
      putBytes: async () => { writes++; throw Error('UNEXPECTED_PRIVATE_STAGE_WRITE') },
      putJson: async () => { writes++; throw Error('UNEXPECTED_PRIVATE_STAGE_WRITE') },
      createBuild: async () => { builds++; throw Error('UNEXPECTED_PAID_BUILD') },
      runMigrationJob: async () => { jobs++; throw Error('UNEXPECTED_MIGRATION_JOB') } }
    await assert.rejects(executeOwnerStage({ ...f.input, stage, capsuleSha256: sha256(row.bytes), transport }),
      { code: 'UNLINKED_PROFILE_CLEANUP_SOURCE_LOCK_INVALID' })
    assert.deepEqual({ writes, builds, jobs }, { writes: 0, builds: 0, jobs: 0 })
  }
})
