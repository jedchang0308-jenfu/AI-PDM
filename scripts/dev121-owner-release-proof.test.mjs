import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalize, crc32cBase64, sha256 } from
  './lib/dev012-production-migration-runner.mjs'
import { readOwnerReleaseProof, verifyOwnerProviderReadback } from './lib/dev121-owner-release-proof.mjs'

const revision = 'a'.repeat(40)
const manifest = 'b'.repeat(64)
const releaseId = 'DEV121-OWNER-001'
const bucket = 'jenfu-platform-prod-platform-release'
const root = `gs://${bucket}/receipts/releases/${releaseId}/${'c'.repeat(64)}`
const buildId = '11111111-2222-3333-4444-555555555555'
const archivedSource = Buffer.from('frozen owner source archive')

function sealed(value) {
  return { ...value, receiptSha256: sha256(canonicalize(value)) }
}
function fixture({ sourceLockChange = {}, migrationChange = {}, terminalChange = {},
  chainChange = {}, provenanceChange = {}, includeTerminal = false } = {}) {
  const objects = new Map()
  function put(uri, value) {
    const bytes = Buffer.from(`${canonicalize(value)}\n`)
    objects.set(uri, bytes)
    return { uri, sha256: sha256(bytes) }
  }
  const sourceLock = put(`gs://${bucket}/receipts/source-lock.json`, {
    schemaVersion: 'jenfu.dev012.owner-source-lock.v1',
    ownerApplicationId: 'platform', repository: 'jedchang0308-jenfu/Jenfu-Platform',
    branch: 'main', releaseId, sourceRevision: revision, sourceTree: 'd'.repeat(40),
    sourceSha256: 'e'.repeat(64), migrationManifestSha256: manifest,
    clean: true, remoteRef: 'refs/heads/main', remoteRevision: revision,
    status: 'SOURCE_FROZEN', releaseAuthority: true,
    evidenceScope: 'PRODUCTION_BOUND', observedAt: '2026-09-26T00:00:00.000Z',
    ...sourceLockChange,
  })
  const prerequisites = { sourceLock, authorization: null, readiness: null,
    foundation: null, infra: null, runtimeConfig: null }
  const prepare = put(`${root}/prepare.json`, sealed({
    schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'platform',
    releaseId, sourceRevision: revision, stage: 'prepare', previousReceiptRef: null,
    facts: { prerequisiteRefs: prerequisites }, observedAt: '2026-09-26T00:01:00.000Z',
    status: 'PASS',
  }))
  const migrate = put(`${root}/migrate.json`, sealed({
    schemaVersion: 'jenfu.dev012.migration-receipt.v1', ownerApplicationId: 'platform',
    sourceRevision: revision, database: 'jenfu_prod',
    ledger: 'platform_core.schema_migrations', manifestSha256: manifest,
    baselineCount: 1, minimumLedgerCount: 1,
    ledgerBootstrap: { enabled: false, created: false },
    ledgerCount: 10, applied: 1, replayed: 9,
    crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true },
      { database: 'jenfu_stg', denied: true }],
    boundaryStatus: 'PASS', executionName: 'jobs/migrate/executions/1',
    startedAt: '2026-09-26T00:02:00.000Z',
    completedAt: '2026-09-26T00:03:00.000Z', status: 'PASS',
    ...migrationChange,
  }))
  const candidateRevision = 'platform-revision-one'
  const artifactDigest = `asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform@sha256:${'1'.repeat(64)}`
  const stage = (name, previousReceiptRef, facts) => put(`${root}/${name}.json`, sealed({
    schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'platform',
    releaseId, sourceRevision: revision, stage: name, previousReceiptRef,
    facts: { ...facts, ...(chainChange[name] ?? {}) },
    observedAt: '2026-09-26T00:04:00.000Z', status: 'PASS',
  }))
  const common = { candidateRevision, artifactDigest }
  const sourceObject = { uri: `gs://${bucket}/source/releases/${releaseId}/${'c'.repeat(64)}/source.tar.gz`,
    sha256: sha256(archivedSource), generation: '7',
    crc32c: crc32cBase64(archivedSource) }
  const imageUri = artifactDigest.split('@')[0]
  const provenance = put(`${root}/provenance.json`, {
    schemaVersion: 'jenfu.dev012.build-provenance-receipt.v1',
    ownerApplicationId: 'platform', sourceRevision: revision,
    sourceObject, artifactDigest, status: 'PASS',
    cloudBuild: { name: `projects/jenfu-platform-prod/locations/asia-east1/builds/${buildId}`,
      id: buildId, status: 'SUCCESS', projectId: 'jenfu-platform-prod',
      serviceAccount: 'projects/jenfu-platform-prod/serviceAccounts/platform-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com',
      options: { requestedVerifyOption: 'VERIFIED' },
      sourceProvenance: { resolvedStorageSource: {
        bucket, object: sourceObject.uri.slice(`gs://${bucket}/`.length),
        generation: sourceObject.generation } },
      results: { images: [{ name: `${imageUri}:release-${revision}`,
        digest: artifactDigest.split('@')[1] }] } },
    artifactRegistry: { uri: artifactDigest }, ...provenanceChange,
  })
  const build = stage('build', prepare, { artifactDigest,
    sourceObject, provenanceReceiptRef: provenance })
  const deployment = put(`${root}/deployment-capsule.json`, {
    sourceRevision: revision, artifactDigest, buildReceiptRef: build,
  })
  let terminal = null
  if (includeTerminal) {
    const candidate = stage('candidate', migrate, { ...common,
      migrationReceiptRef: migrate, deploymentCapsuleRef: deployment })
    const entrypoint = stage('entrypoint', candidate, {})
    const verifyStage = stage('verify', entrypoint, { ...common,
      smoke: { status: 'PASS' } })
    const decision = stage('decision', verifyStage, { ...common, decision: 'GO' })
    const activate = stage('activate', decision, { ...common,
      effectiveRevision: candidateRevision })
    const canonical = stage('canonical', activate, { ...common,
      smoke: { status: 'PASS' } })
    const finalize = stage('finalize', canonical, { ...common,
      result: 'RELEASED', temporaryCandidateTags: 0 })
    terminal = stage('terminal', finalize, { ...common,
      result: 'RELEASED', databaseDisposition: 'FORWARD_APPLIED',
      remainingHumanAction: 0, ...terminalChange })
  }
  const fetchImpl = async (url) => {
    const match = /\/b\/([^/]+)\/o\/([^?]+)/u.exec(url)
    const uri = match && `gs://${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`
    const bytes = objects.get(uri)
    if (!bytes) return new Response('', { status: 404 })
    if (url.includes('alt=media')) return new Response(bytes)
    return new Response(JSON.stringify({ generation: '7', crc32c: crc32cBase64(bytes) }))
  }
  return { refs: { prepare, migrate, terminal }, fetchImpl, objects }
}
async function verify(input = fixture()) {
  return readOwnerReleaseProof({ owner: 'platform', sourceRevision: revision,
    refs: input.refs, token: 'x'.repeat(25), fetchImpl: input.fetchImpl })
}

test('reads immutable protected source lock and migration receipt without granting release status', async () => {
  const proof = await verify()
  assert.equal(proof.disposition, 'migration_only')
  assert.equal(proof.sourceRevision, revision)
  assert.equal(proof.migrationManifestSha256, manifest)
  assert.equal(proof.sourceLock.generation, '7')
  assert.equal(proof.migrate.crc32c.length > 0, true)
  assert.equal(Object.hasOwn(proof, 'terminal'), false)
  assert.match(proof.artifactDigest, /@sha256:[a-f0-9]{64}$/u)
  assert.deepEqual(Object.keys(proof.buildChain).sort(),
    ['build', 'deployment', 'provenance'])
  assert.equal(proof.providerClaim.buildId, buildId)
})

test('migration-only build proof fails if its build chain is missing or altered', async () => {
  const missing = fixture()
  missing.objects.delete(`${root}/deployment-capsule.json`)
  await assert.rejects(verify(missing), /MIGRATION_GCS_METADATA_FAILED/u)
  await assert.rejects(verify(fixture({ chainChange: {
    build: { artifactDigest: 'unrelated-image' } } })),
  /DEV121_OWNER_RELEASE_PROOF_STAGE_CHAIN_INVALID/u)
  await assert.rejects(verify(fixture({ provenanceChange: {
    artifactRegistry: { uri: 'unrelated-image' } } })),
  /DEV121_OWNER_RELEASE_PROOF_PROVENANCE_INVALID/u)
})

test('distinguishes a released terminal receipt from migration-only evidence', async () => {
  const proof = await verify(fixture({ includeTerminal: true }))
  assert.equal(proof.disposition, 'released')
  assert.equal(proof.candidateRevision, 'platform-revision-one')
  assert.match(proof.artifactDigest, /@sha256:[a-f0-9]{64}$/u)
  assert.equal(Object.keys(proof.releaseChain).length, 10)
})

test('released status requires the complete hash-linked stage chain', async () => {
  await assert.rejects(verify(fixture({ includeTerminal: true,
    chainChange: { decision: { decision: 'NO_GO' } } })),
  /DEV121_OWNER_RELEASE_PROOF_STAGE_CHAIN_INVALID/u)
  await assert.rejects(verify(fixture({ includeTerminal: true,
    chainChange: { activate: { effectiveRevision: 'other-revision' } } })),
  /DEV121_OWNER_RELEASE_PROOF_STAGE_CHAIN_INVALID/u)
  const missing = fixture({ includeTerminal: true })
  missing.objects.delete(`${root}/canonical.json`)
  await assert.rejects(verify(missing), /MIGRATION_GCS_METADATA_FAILED/u)
})

test('build provenance must bind the source object, builder and registry digest', async () => {
  await assert.rejects(verify(fixture({ includeTerminal: true,
    provenanceChange: { artifactRegistry: { uri: 'wrong' } } })),
  /DEV121_OWNER_RELEASE_PROOF_PROVENANCE_INVALID/u)
  await assert.rejects(verify(fixture({ includeTerminal: true,
    provenanceChange: { cloudBuild: { status: 'SUCCESS' } } })),
  /DEV121_OWNER_RELEASE_PROOF_PROVENANCE_INVALID/u)
})

function providerFetch(proof, { buildChange = {}, imageChange = {}, imageStatus = 200,
  sourceBytes = archivedSource } = {}) {
  const source = proof.providerClaim.sourceObject
  const digest = proof.artifactDigest.split('@')[1]
  const build = {
    name: `projects/jenfu-platform-prod/locations/asia-east1/builds/${buildId}`,
    id: buildId, projectId: 'jenfu-platform-prod', status: 'SUCCESS',
    serviceAccount: 'projects/jenfu-platform-prod/serviceAccounts/platform-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com',
    options: { requestedVerifyOption: 'VERIFIED' },
    sourceProvenance: { resolvedStorageSource: { bucket,
      object: source.uri.slice(`gs://${bucket}/`.length),
      generation: source.generation } },
    results: { images: [{ name: `asia-east1-docker.pkg.dev/jenfu-platform-prod/platform-release/platform:release-${revision}`,
      digest }] }, ...buildChange,
  }
  const image = { name: `projects/jenfu-platform-prod/locations/asia-east1/repositories/platform-release/dockerImages/platform@${digest}`,
    uri: proof.artifactDigest, ...imageChange }
  return async (url, options) => {
    assert.equal(options.headers.authorization, 'Bearer provider-readback-token')
    if (url.startsWith('https://storage.googleapis.com/storage/v1/')) {
      if (url.includes('alt=media')) return new Response(sourceBytes)
      return new Response(JSON.stringify({ generation: source.generation,
        crc32c: crc32cBase64(sourceBytes) }))
    }
    assert.equal(options.method, 'GET')
    if (url === `https://cloudbuild.googleapis.com/v1/${build.name}`) {
      return new Response(JSON.stringify(build))
    }
    if (url.startsWith('https://artifactregistry.googleapis.com/v1/')) {
      return new Response(JSON.stringify(image), { status: imageStatus })
    }
    throw new Error('UNEXPECTED_PROVIDER_URL')
  }
}

test('independent provider readback matches the live build and exact registry digest', async () => {
  const proof = await verify(fixture({ includeTerminal: true }))
  const result = await verifyOwnerProviderReadback({ proof,
    token: 'provider-readback-token', fetchImpl: providerFetch(proof) })
  assert.equal(result.status, 'BUILD_IMAGE_VERIFIED')
  assert.equal(result.artifactDigest, proof.artifactDigest)
  assert.equal(result.sourceGeneration, proof.providerClaim.sourceObject.generation)
})

test('migration-only image gets provider readback without becoming released', async () => {
  const proof = await verify()
  const result = await verifyOwnerProviderReadback({ proof,
    token: 'provider-readback-token', fetchImpl: providerFetch(proof) })
  assert.equal(proof.disposition, 'migration_only')
  assert.equal(result.status, 'BUILD_IMAGE_VERIFIED')
  assert.equal(result.artifactDigest, proof.artifactDigest)
})

test('provider readback rejects build or image drift and missing provider access', async () => {
  const proof = await verify(fixture({ includeTerminal: true }))
  await assert.rejects(verifyOwnerProviderReadback({ proof,
    token: 'provider-readback-token', fetchImpl: providerFetch(proof, {
      buildChange: { results: { images: [] } } }) }),
  /DEV121_OWNER_RELEASE_PROOF_PROVIDER_BUILD_MISMATCH/u)
  await assert.rejects(verifyOwnerProviderReadback({ proof,
    token: 'provider-readback-token', fetchImpl: providerFetch(proof, {
      imageChange: { uri: 'wrong' } }) }),
  /DEV121_OWNER_RELEASE_PROOF_PROVIDER_IMAGE_MISMATCH/u)
  await assert.rejects(verifyOwnerProviderReadback({ proof,
    token: 'provider-readback-token', fetchImpl: providerFetch(proof, {
      imageStatus: 403 }) }),
  /DEV121_OWNER_RELEASE_PROOF_PROVIDER_READBACK_FAILED/u)
  await assert.rejects(verifyOwnerProviderReadback({ proof,
    token: 'provider-readback-token', fetchImpl: providerFetch(proof, {
      sourceBytes: Buffer.from('tampered owner source archive') }) }),
  /DEV121_OWNER_RELEASE_PROOF_PROVIDER_SOURCE_MISMATCH/u)
})

test('provider readback rejects malformed claims before any provider request', async () => {
  const proof = await verify(fixture({ includeTerminal: true }))
  let requests = 0
  const fetchImpl = async () => { requests += 1; throw new Error('UNEXPECTED_REQUEST') }
  for (const change of [
    { artifactDigest: null },
    { providerClaim: { ...proof.providerClaim, buildId: 'invalid' } },
    { providerClaim: { ...proof.providerClaim,
      sourceObject: { ...proof.providerClaim.sourceObject, uri: null } } },
  ]) {
    await assert.rejects(verifyOwnerProviderReadback({ proof: { ...proof, ...change },
      token: 'provider-readback-token', fetchImpl }),
    /DEV121_OWNER_RELEASE_PROOF_PROVIDER_INPUT_INVALID/u)
  }
  assert.equal(requests, 0)
})

test('rejects sibling bucket, wrong protected branch, manifest drift and rollback', async () => {
  const sibling = fixture()
  sibling.refs.prepare = { ...sibling.refs.prepare,
    uri: sibling.refs.prepare.uri.replace(bucket, 'jenfu-platform-prod-orgmaster-release') }
  await assert.rejects(verify(sibling), /DEV121_OWNER_RELEASE_PROOF_REF_INVALID/u)
  await assert.rejects(verify(fixture({ sourceLockChange: { branch: 'feature' } })),
    /DEV121_OWNER_RELEASE_PROOF_SOURCE_LOCK_INVALID/u)
  await assert.rejects(verify(fixture({ migrationChange: {
    manifestSha256: '0'.repeat(64) } })), /DEV121_OWNER_RELEASE_PROOF_MIGRATION_INVALID/u)
  await assert.rejects(verify(fixture({ migrationChange: {
    minimumLedgerCount: 11 } })), /DEV121_OWNER_RELEASE_PROOF_MIGRATION_INVALID/u)
  await assert.rejects(verify(fixture({ migrationChange: {
    replayed: 8 } })), /DEV121_OWNER_RELEASE_PROOF_MIGRATION_INVALID/u)
  await assert.rejects(verify(fixture({ includeTerminal: true,
    terminalChange: { result: 'ROLLED_BACK' } })),
    /DEV121_OWNER_RELEASE_PROOF_TERMINAL_INVALID/u)
})

test('rejects object replacement even when its JSON claims the same revision', async () => {
  const input = fixture()
  input.objects.set(input.refs.migrate.uri,
    Buffer.from(`${canonicalize({ schemaVersion: 'forged', sourceRevision: revision })}\n`))
  await assert.rejects(verify(input), /DEV121_OWNER_RELEASE_PROOF_OBJECT_HASH_MISMATCH/u)
})
