import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalize, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { executeOwnerStage } from './lib/dev012-owner-stage-executor.mjs'

const H40 = 'a'.repeat(40)
const bucket = 'jenfu-platform-prod-platform-release'
const previousRevision = 'jenfu-platform-prod-previous'
const candidateRevision = 'jenfu-platform-prod-candidate'
const migrationRunnerDigest = 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform-migration-runner@sha256:' + 'c'.repeat(64)

function recordedHarness() {
  const objects = new Map()
  let generation = 0
  let service = {
    name: 'projects/jenfu-platform-prod/locations/asia-east1/services/jenfu-platform-prod', etag: 'e1', reconciling: false,
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
  const transport = {
    now: () => '2026-09-08T00:00:00.000Z', readBytes, putBytes, putJson, readJson, effectiveRevision,
    assertRevisionReady(value, artifactDigest) { if (value.conditions?.find((row) => row.type === 'Ready')?.state !== 'CONDITION_SUCCEEDED' || value.containers?.[0]?.image !== artifactDigest) throw new Error('CANDIDATE_REVISION_READBACK_MISMATCH'); return value },
    async getService() { return structuredClone(service) },
    async createBuild({ profile, intent, sourceObject }) {
      const artifactDigest = `${profile.artifact.uri}@sha256:${'d'.repeat(64)}`
      return { artifactDigest, build: { name: 'projects/p/locations/r/builds/b1', id: 'b1', projectId: profile.target.projectId, status: 'SUCCESS', serviceAccount: `projects/${profile.target.projectId}/serviceAccounts/${profile.identities.builder}`, sourceProvenance: { resolvedStorageSource: { bucket, object: sourceObject.ref.uri.split('/').slice(3).join('/'), generation: sourceObject.metadata.generation } }, results: { images: [{ name: `${profile.artifact.uri}:release-${intent.sourceRevision}`, digest: 'sha256:' + 'd'.repeat(64) }] }, options: { requestedVerifyOption: 'VERIFIED' } } }
    },
    async readArtifactImage(_profile, artifactDigest) { return { name: 'projects/p/dockerImages/i@sha256:x', uri: artifactDigest } },
    async waitArtifactEvidence({ artifactDigest }) { return { resourceUrl: `https://${artifactDigest}`, buildOccurrenceNames: ['build'], discoveryOccurrenceNames: ['discovery'], sbomOccurrenceNames: ['sbom'], vulnerabilityCount: 0, blockingVulnerabilityCount: 0, sbomExport: { resourceUrl: `https://${artifactDigest}`, discoveryOccurrence: 'discovery' }, observedAt: this.now(), status: 'PASS' } },
    async runMigrationJob({ profile, deployment, outputUri }) { return putJson(outputUri, { schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: profile.application.id, sourceRevision: deployment.sourceRevision, manifestSha256: migrationManifestSha256, boundaryStatus: 'PASS', status: 'PASS' }, { bucket, prefix: 'receipts' }) },
    async createCandidate({ artifactDigest }) {
      service = { ...service, etag: 'e2', latestCreatedRevision: candidateRevision, traffic: [...service.traffic, { revision: candidateRevision, percent: 0, tag: 'candidate-fixed' }], trafficStatuses: [...service.trafficStatuses, { revision: candidateRevision, percent: 0, tag: 'candidate-fixed', uri: 'https://candidate.example.test' }] }
      return { candidateRevision, tag: 'candidate-fixed', tagUri: 'https://candidate.example.test', artifactDigest, previousRevision, beforeTraffic: service.traffic.slice(0, 1), etag: 'e2', revisionName: `projects/p/revisions/${candidateRevision}` }
    },
    async getRevision(_profile, revision) { return { name: `projects/p/services/s/revisions/${revision}`, service: 'projects/p/services/s', containers: [{ image: `${profile.artifact.uri}@sha256:${'d'.repeat(64)}` }], conditions: [{ type: 'Ready', state: 'CONDITION_SUCCEEDED' }] } },
    async runAuthenticatedSmoke({ origin }) { return { origin, observations: [{ id: 'session-reload', status: 200 }], status: 'PASS', observedAt: this.now() } },
    async setTraffic({ revision, candidateTag }) { service = { ...service, etag: 'e3', traffic: [{ revision, percent: 100 }, { revision, percent: 0, tag: candidateTag }], trafficStatuses: [{ revision, percent: 100 }, { revision, percent: 0, tag: candidateTag, uri: 'https://candidate.example.test' }] }; return structuredClone(service) },
    async removeCandidateTag({ candidateRevision: exact, expectedActiveRevision }) { assert.equal(exact, candidateRevision); assert.equal(effectiveRevision(service), expectedActiveRevision); service = { ...service, etag: 'e4', traffic: service.traffic.filter((row) => !row.tag), trafficStatuses: service.trafficStatuses.filter((row) => !row.tag) }; return structuredClone(service) },
    async publishIncident() { return { messageIds: ['1'] } },
  }
  const profile = {
    application: { id: 'platform', repository: 'owner/repo', branch: 'main' },
    target: { projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName: 'jenfu-platform-prod', runtimeServiceAccount: 'platform-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com', canonicalOrigin: 'https://manage.example.test' },
    runtime: { poolMax: 4 }, schemas: { releaseIntent: 'owner.intent.v2', deploymentCapsule: 'owner.deployment.v2' },
    artifact: { releaseBucket: bucket, repository: 'platform-release', uri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform', migrationRunnerUri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform-migration-runner', migrationBundlePrefix: 'source/migration-bundles' },
    identities: { builder: 'platform-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com' }, build: { maximumAllowedSeverity: 'MEDIUM' }, workflow: { path: '.github/workflows/deploy.yml' }, sideEffects: { notification: 'DISABLED' },
  }
  const sourceBytes = Buffer.from('recorded-source-archive')
  const migrationBytes = Buffer.from('{"recorded":"migration"}\n')
  const migrationManifestSha256 = sha256('migration-manifest')
  const environment = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: profile.application.repository, GITHUB_REPOSITORY_ID: '1234', GITHUB_REPOSITORY_OWNER_ID: '5678', GITHUB_SHA: H40, GITHUB_WORKFLOW_SHA: H40, GITHUB_WORKFLOW_REF: 'owner/repo/.github/workflows/deploy.yml@refs/heads/main', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.actions.example', GOOGLE_OAUTH_ACCESS_TOKEN: 'x'.repeat(32), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' }
  return { objects, transport, profile, sourceBytes, migrationBytes, migrationManifestSha256, environment, service: () => service }
}

test('recorded provider transport executes the nine immutable owner stages without sibling state', async () => {
  const h = recordedHarness()
  const refFor = async (name, value) => (await h.transport.putJson(`gs://${bucket}/receipts/prerequisites/${name}.json`, value, { bucket, prefix: 'receipts' })).ref
  const common = { releaseAuthority: true, evidenceScope: 'PROVIDER' }
  const sourceLockRef = await refFor('source-lock', { ...common, status: 'SOURCE_FROZEN', sourceRevision: H40, clean: true })
  const authorizationPolicyRef = await refFor('authorization', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z' })
  const readinessReceiptRef = await refFor('readiness', { ...common, status: 'PASS', environment: 'production', remainingHumanAction: 0, expiresAt: '2999-01-01T00:00:00.000Z', projectId: 'jenfu-platform-prod' })
  const foundationReceiptRef = await refFor('foundation', { ...common, status: 'APPLIED', projectId: 'jenfu-platform-prod' })
  const infraReceiptRef = await refFor('infra', { ...common, status: 'APPLIED', projectId: 'jenfu-platform-prod', migrationRunnerDigest })
  const runtimeConfigRef = await refFor('runtime', { ...common, status: 'VERIFIED', projectId: 'jenfu-platform-prod', runtimeServiceAccount: h.profile.target.runtimeServiceAccount, serviceTemplateSha256: sha256(canonicalize({ serviceAccount: h.profile.target.runtimeServiceAccount })) })
  const intent = { schemaVersion: 'owner.intent.v2', ownerApplicationId: 'platform', releaseId: 'REL-RECORDED-001', sourceRevision: H40, sourceSha256: sha256(h.sourceBytes), sourceLockRef, authorizationPolicyRef, readinessReceiptRef, foundationReceiptRef, infraReceiptRef, runtimeConfigRef, migrationManifestSha256: h.migrationManifestSha256, previousRevision, deadlineAt: '2999-01-01T00:00:00.000Z' }
  const intentResult = await h.transport.putJson(`gs://${bucket}/receipts/intents/release.json`, intent, { bucket, prefix: 'receipts' })
  const input = { capsuleRef: intentResult.ref.uri, capsuleSha256: intentResult.ref.sha256, profile: h.profile, transport: h.transport, environment: h.environment, validateIntent: (value) => value, createSourceArchive: async () => h.sourceBytes, buildMigrationBundle: async () => ({ bundle: { manifestSha256: h.migrationManifestSha256 }, bytes: h.migrationBytes, bundleSha256: sha256(h.migrationBytes) }) }
  for (const stage of ['prepare', 'build', 'migrate', 'candidate', 'verify', 'decision', 'activate', 'canonical', 'finalize']) await executeOwnerStage({ ...input, stage })
  const terminal = [...h.objects.entries()].find(([uri]) => uri.endsWith('/terminal.json'))
  assert.ok(terminal)
  assert.equal(JSON.parse(terminal[1].bytes.toString()).facts.result, 'RELEASED')
  assert.equal(h.service().trafficStatuses.some((row) => row.tag), false)
  assert.equal(h.transport.effectiveRevision(h.service()), candidateRevision)
})
