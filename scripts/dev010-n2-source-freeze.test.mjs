import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  assertPackageConfig,
  assertSourceDrift,
  buildCandidateSourceManifest,
  buildGitSourceManifest,
  calculateConnectionBudget,
  canonicalize,
  loadPackageConfig,
  redactEvidence,
  sha256,
  validateDependencyGraph,
} from './lib/dev010-n2-manifest.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configRelative = [
  'config/dev-010/n2/platform-package.json',
  'config/dev-010/n2/orgmaster-package.json',
  'config/platform/dev-010-n2-ai-pdm.json',
].find((candidate) => fs.existsSync(path.join(projectRoot, ...candidate.split('/'))))
const config = loadPackageConfig(path.join(projectRoot, ...configRelative.split('/')))

test('N2-SOURCE-01 package config has the exact closed schema', () => {
  assert.equal(assertPackageConfig(structuredClone(config)).devId, 'DEV-010')
})

test('N2-SOURCE-02 canonical JSON and SHA-256 are deterministic', () => {
  assert.equal(canonicalize({ b: 2, a: [1, { d: 4, c: 3 }] }), '{"a":[1,{"c":3,"d":4}],"b":2}')
  assert.equal(sha256('DEV-010'), '659e863abe1ee63a9de5174e22af462b8155b1383ad346c13eab7c7ab047992c')
  assert.equal(buildGitSourceManifest({ root: projectRoot, head: config.repository.head, files: config.baseline.files }).aggregateSha256, config.baseline.aggregateSha256)
})

test('N2-SOURCE-03 unknown keys fail closed', () => {
  assert.throws(() => assertPackageConfig({ ...structuredClone(config), surprise: true }), /DEV010_N2_MANIFEST_UNKNOWN_KEY/u)
})

test('N2-SOURCE-04 duplicate paths, versions, and signatures fail closed', () => {
  const duplicatePath = structuredClone(config)
  duplicatePath.baseline.files.push(duplicatePath.baseline.files[0])
  assert.throws(() => assertPackageConfig(duplicatePath), /DEV010_N2_DUPLICATE_PATH/u)
  if (config.provides.length) {
    const duplicateContract = structuredClone(config)
    duplicateContract.provides.push(structuredClone(duplicateContract.provides[0]))
    assert.throws(() => assertPackageConfig(duplicateContract), /DEV010_N2_DUPLICATE_VERSION/u)
  }
})

test('N2-SOURCE-05 absolute or parent traversal paths fail closed', () => {
  for (const invalid of ['C:/secrets/db.txt', '../secrets/db.txt', '/etc/passwd']) {
    const changed = structuredClone(config)
    changed.baseline.files[0] = invalid
    assert.throws(() => assertPackageConfig(changed), /DEV010_N2_ABSOLUTE_SECRET_PATH/u)
  }
})

test('N2-SOURCE-06 source drift accepts only allowlisted files', () => {
  const baseline = { head: 'a'.repeat(40), files: [{ path: 'a.ts', sha256: '1'.repeat(64) }] }
  const candidate = { head: 'a'.repeat(40), files: [{ path: 'a.ts', sha256: '2'.repeat(64) }] }
  assert.deepEqual(assertSourceDrift(baseline, candidate, { modify: ['a.ts'], new: [], outputPrefixes: [] }), { drift: ['a.ts'], status: 'PASS' })
  assert.throws(() => assertSourceDrift(baseline, candidate, { modify: [], new: [], outputPrefixes: [] }), /DEV010_N2_HASH_MISMATCH/u)
  const descendant = { ...candidate, head: 'b'.repeat(40) }
  assert.throws(() => assertSourceDrift(baseline, descendant, { modify: ['a.ts'], new: [], outputPrefixes: [] }), /DEV010_N2_HEAD_MISMATCH/u)
  assert.deepEqual(assertSourceDrift(baseline, descendant, { modify: ['a.ts'], new: [], outputPrefixes: [] }, { allowDescendantHead: true }), { drift: ['a.ts'], status: 'PASS' })
})

test('N2-SOURCE-07 local connection budget is 21 required and 70 allowed', () => {
  assert.deepEqual(calculateConnectionBudget({
    applications: [
      { appId: 'platform', effectiveMaxInstances: 1, poolsPerInstance: 1, poolMax: 4 },
      { appId: 'orgmaster', effectiveMaxInstances: 1, poolsPerInstance: 1, poolMax: 6 },
      { appId: 'ai-pdm', effectiveMaxInstances: 1, poolsPerInstance: 1, poolMax: 8 },
    ],
    databaseMaxConnections: 100,
    migrationAdminReserve: 3,
    reserveRatio: 0.3,
  }), { allowedConnections: 70, applicationConnections: 18, requiredConnections: 21, reserveConnections: 30, status: 'PASS' })
  assert.throws(() => calculateConnectionBudget({
    applications: [
      { appId: 'platform', effectiveMaxInstances: 1, poolsPerInstance: 1, poolMax: 20 },
      { appId: 'orgmaster', effectiveMaxInstances: 1, poolsPerInstance: 1, poolMax: 24 },
      { appId: 'ai-pdm', effectiveMaxInstances: 1, poolsPerInstance: 1, poolMax: 24 },
    ], databaseMaxConnections: 100, migrationAdminReserve: 3, reserveRatio: 0.3,
  }), /DEV010_N2_CONNECTION_BUDGET_EXCEEDED/u)
})

test('N2-SOURCE-08 evidence redaction removes connection secrets', () => {
  const redacted = JSON.stringify(redactEvidence({ connectionUrl: 'postgresql://fixture:nope@127.0.0.1/db', authorization: 'Bearer abc.def', nested: { password: 'nope' } }))
  assert.doesNotMatch(redacted, /postgresql:\/\/|abc\.def|nope/u)
})

test('N2-SOURCE-09 graph validation rejects self dependencies and cycles', () => {
  assert.throws(() => validateDependencyGraph([config]), /DEV010_N2_GRAPH_INCOMPLETE/u)
})

test('N2-SOURCE-10 clean candidate hashes Git bytes and dirty candidate hashes working bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dev010-n2-candidate-'))
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    execFileSync('git', ['config', 'user.email', 'dev010@example.invalid'], { cwd: root })
    execFileSync('git', ['config', 'user.name', 'DEV-010'], { cwd: root })
    fs.writeFileSync(path.join(root, 'fixture.txt'), 'one\ntwo\n')
    execFileSync('git', ['add', 'fixture.txt'], { cwd: root })
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root })
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    fs.writeFileSync(path.join(root, 'fixture.txt'), 'one\r\ntwo\r\n')
    const clean = buildCandidateSourceManifest({ root, head, files: ['fixture.txt'], workingPaths: [] })
    const dirty = buildCandidateSourceManifest({ root, head, files: ['fixture.txt'], workingPaths: ['fixture.txt'] })
    assert.equal(clean.files[0].sha256, sha256('one\ntwo\n'))
    assert.equal(dirty.files[0].sha256, sha256('one\r\ntwo\r\n'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
