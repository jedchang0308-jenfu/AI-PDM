import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalize, crc32cBase64, sha256 } from
  './lib/dev012-production-migration-runner.mjs'
import { readOwnerReleaseProof } from './lib/dev121-owner-release-proof.mjs'

const revision = 'a'.repeat(40)
const manifest = 'b'.repeat(64)
const releaseId = 'DEV121-OWNER-001'
const bucket = 'jenfu-platform-prod-platform-release'
const root = `gs://${bucket}/receipts/releases/${releaseId}/${'c'.repeat(64)}`

function sealed(value) {
  return { ...value, receiptSha256: sha256(canonicalize(value)) }
}
function fixture({ sourceLockChange = {}, migrationChange = {}, terminalChange = {},
  includeTerminal = false } = {}) {
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
    baselineCount: 1, minimumLedgerCount: 1, ledgerBootstrap: false,
    ledgerCount: 10, applied: 1, replayed: 9,
    crossDatabaseDenials: [{ database: 'jenfu_dev', denied: true },
      { database: 'jenfu_stg', denied: true }],
    boundaryStatus: 'PASS', executionName: 'jobs/migrate/executions/1',
    startedAt: '2026-09-26T00:02:00.000Z',
    completedAt: '2026-09-26T00:03:00.000Z', status: 'PASS',
    ...migrationChange,
  }))
  const terminal = includeTerminal ? put(`${root}/terminal.json`, sealed({
    schemaVersion: 'jenfu.dev012.stage-receipt.v1', ownerApplicationId: 'platform',
    releaseId, sourceRevision: revision, stage: 'terminal',
    previousReceiptRef: { uri: `${root}/finalize.json`, sha256: 'f'.repeat(64) },
    facts: { result: 'RELEASED', databaseDisposition: 'FORWARD_APPLIED',
      remainingHumanAction: 0, candidateRevision: 'platform-revision-one',
      artifactDigest: `asia-east1-docker.pkg.dev/project/repo/image@sha256:${'1'.repeat(64)}`,
      ...terminalChange }, observedAt: '2026-09-26T00:04:00.000Z', status: 'PASS',
  })) : null
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
})

test('distinguishes a released terminal receipt from migration-only evidence', async () => {
  const proof = await verify(fixture({ includeTerminal: true }))
  assert.equal(proof.disposition, 'released')
  assert.equal(proof.candidateRevision, 'platform-revision-one')
  assert.match(proof.artifactDigest, /@sha256:[a-f0-9]{64}$/u)
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
