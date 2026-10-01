import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { nativeCodeFingerprint, gccPbdsOccurrenceMatches, readGccApplicabilityPolicy, assertGccApplicabilityAssessment } from './lib/dev015-gcc-applicability.mjs'
const inventory = { complete: true, platform: 'linux', arch: 'x64', node: '24.21.0', uid: 65532, gid: 65532, elf: [{ path: '/nodejs/bin/node', bytes: 100, sha256: 'a'.repeat(64), pbdsMarkers: [] }], wasm: [], headers: [], symlinks: [] }
const fingerprint = nativeCodeFingerprint(inventory)
const policy = { cve: 'CVE-2026-102010', ownerApplicationId: 'test', justification: 'VULNERABLE_CODE_NOT_PRESENT', nativeCodeFingerprint: fingerprint, investigatedArtifactDigest: 'test@sha256:' + 'a'.repeat(64), investigatedSourceRevision: 'b'.repeat(40) }
const assessment = { schemaVersion: 'jenfu.dev015.gcc-applicability-assessment.v1', cve: policy.cve, ownerApplicationId: policy.ownerApplicationId, state: 'NOT_AFFECTED', justification: policy.justification, nativeCodeFingerprint: fingerprint, artifactDigest: policy.investigatedArtifactDigest, sourceRevision: policy.investigatedSourceRevision, imageInspectionBuildId: 'image-proof', sourceInspectionBuildId: 'source-proof', nativeClosureBuildId: 'closure-proof', sourceClosureComplete: true }
test('not-affected proof is valid only for unchanged assessed compiled inputs', () => {
  assertGccApplicabilityAssessment(policy, assessment, inventory)
  assertGccApplicabilityAssessment(policy, assessment, { ...inventory, uid: 0, gid: 0, runtimeUser: '65532:65532' })
  assert.throws(() => assertGccApplicabilityAssessment(policy, assessment, { ...inventory, uid: 0, gid: 0, runtimeUser: '0:0' }))
  assertGccApplicabilityAssessment(policy, assessment, { ...inventory, symlinks: [{ path: '/usr/bin/node', target: '/nodejs/bin/node' }] })
  assert.throws(() => assertGccApplicabilityAssessment(policy, assessment, { ...inventory, symlinks: [{ path: '/usr/bin/node', target: '/uninspected/node' }] }))
  for (const mutate of [
    (x) => x.elf[0].sha256 = 'b'.repeat(64),
    (x) => x.elf.push({ path: '/app/unknown.node', bytes: 1, sha256: 'c'.repeat(64), pbdsMarkers: [] }),
    (x) => x.wasm.push({ path: '/app/new.wasm', bytes: 1, sha256: 'c'.repeat(64), pbdsMarkers: [] }),
    (x) => x.headers.push('/usr/include/ext/pb_ds/priority_queue.hpp'),
    (x) => x.elf[0].pbdsMarkers.push('__gnu_pbds'),
    (x) => x.complete = false,
    (x) => x.node = '24.22.0',
    (x) => x.arch = 'arm64',
    (x) => x.uid = 0,
  ]) { const changed = structuredClone(inventory); mutate(changed); assert.throws(() => assertGccApplicabilityAssessment(policy, assessment, changed)) }
})
test('missing, changed, other-owner and incomplete source evidence cannot waive HIGH', () => {
  for (const [key, value] of Object.entries({ cve: 'CVE-OTHER', ownerApplicationId: 'other', state: 'UNDER_INVESTIGATION', justification: 'INLINE_MITIGATIONS_ALREADY_EXIST', nativeCodeFingerprint: 'f'.repeat(64), artifactDigest: 'other', sourceRevision: 'f'.repeat(40), sourceClosureComplete: false, nativeClosureBuildId: null })) {
    assert.throws(() => assertGccApplicabilityAssessment(policy, { ...assessment, [key]: value }, inventory))
  }
})
test('the reviewed policy is fixed to the exact owner repository, project and artifact', () => {
  const p = JSON.parse(fs.readFileSync(new URL('../config/release/dev015-gcc-pbds-applicability.json', import.meta.url), 'utf8'))
  const profile = { application: { id: p.ownerApplicationId, repository: p.repository }, target: { projectId: p.projectId, region: p.region }, artifact: { uri: p.artifactUri, releaseBucket: p.releaseBucket } }
  assert.equal(readGccApplicabilityPolicy(profile).nativeCodeFingerprint, p.nativeCodeFingerprint)
  for (const [section, key] of [['application', 'id'], ['application', 'repository'], ['target', 'projectId'], ['target', 'region'], ['artifact', 'uri'], ['artifact', 'releaseBucket']]) {
    const changed = structuredClone(profile); changed[section][key] = 'other'; assert.throws(() => readGccApplicabilityPolicy(changed))
  }
})
test('only the assessed GCC Debian HIGH occurrence qualifies; unrelated HIGH and CRITICAL still block', () => {
  const occurrence = { kind: 'VULNERABILITY', noteName: 'projects/goog-vulnz/notes/CVE-2026-102010', vulnerability: { effectiveSeverity: 'HIGH', shortDescription: 'CVE-2026-102010', packageIssue: [{ affectedPackage: 'gcc-14', packageType: 'OS', affectedCpeUri: 'cpe:/o:debian:debian_linux:13', affectedVersion: { fullName: '14.2.0-19' } }] } }
  assert.equal(gccPbdsOccurrenceMatches(occurrence), true)
  for (const mutate of [(x) => x.noteName = 'projects/untrusted/notes/CVE-2026-102010', (x) => x.vulnerability.effectiveSeverity = 'CRITICAL', (x) => x.vulnerability.shortDescription = 'CVE-OTHER', (x) => x.vulnerability.packageIssue[0].affectedVersion.fullName = '15.0.0', (x) => x.vulnerability.packageIssue = []]) {
    const changed = structuredClone(occurrence); mutate(changed); assert.equal(gccPbdsOccurrenceMatches(changed), false)
  }
})
