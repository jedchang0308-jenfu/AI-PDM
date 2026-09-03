import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const platformCandidates = [
  process.env.JENFU_MANAGEMENT_SYSTEM_ROOT?.trim(),
  path.resolve(root, '..', 'Jenfu-Management-system'),
  path.resolve(root, '..', '..', '..', 'Jenfu-Management-system'),
].filter(Boolean)
const platformRoot = platformCandidates.find((candidate) => fs.existsSync(path.join(candidate, 'contracts', 'jenfu-platform-governance-availability', 'v2', 'contract-manifest.json'))) ?? platformCandidates[0]
const localDir = path.join(root, 'contracts', 'jenfu-platform-governance-availability', 'v2')
const centralDir = path.join(platformRoot, 'contracts', 'jenfu-platform-governance-availability', 'v2')
const manifestPath = path.join(localDir, 'contract-manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const normalized = (value) => value.toString('utf8').replaceAll('\r\n', '\n')
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

assert.equal(manifest.contractVersion, 'jenfu.platform-governance-availability.v2')
assert.equal(manifest.hashAlgorithm, 'sha256')
// rootFileCount includes contract-manifest.json itself; the manifest lists the
// other root files plus fixtures in its hash inventory.
assert.equal(manifest.rootFileCount, manifest.files.filter((item) => !item.path.startsWith('fixtures/')).length + 1)
assert.equal(manifest.fixtureFileCount, manifest.files.filter((item) => item.path.startsWith('fixtures/')).length)
assert.equal(manifest.files.length, manifest.fileCount)

const entries = []
for (const item of manifest.files) {
  assert.match(item.path, /^(?:[^/]+|[^/]+\/[^/]+)$/u, `invalid relative contract path: ${item.path}`)
  const localPath = path.join(localDir, item.path)
  const centralPath = path.join(centralDir, item.path)
  assert.ok(fs.existsSync(localPath), `missing local contract file: ${item.path}`)
  assert.ok(fs.existsSync(centralPath), `missing central contract file: ${item.path}`)
  const localBytes = fs.readFileSync(localPath)
  const centralBytes = fs.readFileSync(centralPath)
  assert.equal(normalized(localBytes), normalized(centralBytes), `DEV009_CONTRACT_DRIFT:${item.path}`)
  assert.equal(sha256(normalized(localBytes)), item.sha256, `DEV009_CONTRACT_HASH_DRIFT:${item.path}`)
  entries.push(`${item.path}\0${item.sha256}\n`)
  JSON.parse(localBytes.toString('utf8'))
}
assert.equal(sha256(entries.sort().join('')), manifest.sha256)

function assertNoRawIdentityKeys(value, location = '$') {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawIdentityKeys(item, `${location}[${index}]`))
    return
  }
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!/^(?:issuer|subject|token|cookie|fingerprint)$/iu.test(key), `raw identity field at ${location}.${key}`)
    assertNoRawIdentityKeys(child, `${location}.${key}`)
  }
}

const fixtures = ['workspace.current-system-admin.json', 'workspace.stale-system-admin.json', 'workspace.unavailable.json']
for (const fixtureName of fixtures) {
  const fixture = JSON.parse(fs.readFileSync(path.join(localDir, 'fixtures', fixtureName), 'utf8'))
  assert.equal(fixture.contractVersion, 'ai-pdm.role-capability-workspace.v3', `${fixtureName}: v3 contract required`)
  assert.equal(fixture.applicationId, 'ai-pdm', `${fixtureName}: application mismatch`)
  assert.equal(fixture.selectedRoleId, 'role-system-admin', `${fixtureName}: selected role mismatch`)
  assert.equal(fixture.roles.length, 1, `${fixtureName}: only privileged role may be projected`)
  assert.equal(fixture.mutationAllowed, false, `${fixtureName}: privileged projection must be read-only`)
  assert.equal(fixture.roles[0].managementKind, 'privileged_principal', `${fixtureName}: management kind mismatch`)
  assert.equal(fixture.roles[0].catalogRole.subjectKind, 'principal', `${fixtureName}: principal subject required`)
  assert.equal(fixture.roles[0].catalogRole.assignmentTier, 'cross_app_override', `${fixtureName}: tier mismatch`)
  assert.equal(fixture.roles[0].catalogRole.recommendationAllowed, false, `${fixtureName}: recommendation must be disabled`)
  assert.equal(fixture.roles[0].catalogRole.delegationAllowed, false, `${fixtureName}: delegation must be disabled`)
  assert.deepEqual(fixture.roles[0].catalogRole.allowedScopeKinds, ['global'], `${fixtureName}: global scope required`)
  for (const assignment of fixture.roles[0].manualAssignments) {
    assert.match(assignment.principalHint, /•••/u, `${fixtureName}: principal hint must be redacted`)
    assert.doesNotMatch(assignment.principalHint, /(?:issuer|subject|token|cookie|fingerprint)/iu)
  }
  assertNoRawIdentityKeys(fixture)
}

const sourceFixture = JSON.parse(fs.readFileSync(path.join(localDir, 'fixtures', 'privileged.view-only.json'), 'utf8'))
assert.equal(sourceFixture.contractVersion, 'orgmaster.privileged-assignment-workspace.v1')
assert.equal(sourceFixture.mutationAllowed, false)
assert.equal(sourceFixture.role.recommendationAllowed, false)
assert.equal(sourceFixture.role.delegationAllowed, false)
assert.deepEqual(sourceFixture.role.allowedScopeKinds, ['global'])
assertNoRawIdentityKeys(sourceFixture)

console.log(`DEV009_CONTRACT_OK aggregate=${manifest.sha256} files=${manifest.fileCount} v3Fixtures=${fixtures.length}`)
