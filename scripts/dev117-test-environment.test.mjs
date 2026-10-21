import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { checkTestEnvironment } from './dev117-test-environment.mjs'

const ready = () => {}
const available = { 'git-fixture': ready, 'linked-worktree': ready, loopback: ready }

test('reports unavailable capabilities once without turning environment failure into test PASS', async () => {
  const calls = []
  const probes = Object.fromEntries(Object.keys(available).map(name => [name, () => {
    calls.push(name)
    throw Object.assign(new Error('private fixture path must not leak'), { code: name === 'loopback' ? 'EACCES' : 'EPERM' })
  }]))
  const result = await checkTestEnvironment({ probes })
  assert.equal(result.result, 'BLOCKED')
  assert.equal(result.tests, 'NOT_RUN')
  assert.equal(result.releaseAuthority, false)
  assert.deepEqual(calls, Object.keys(available))
  assert.deepEqual(result.checks.map(check => check.code), ['EPERM', 'EPERM', 'EACCES'])
  assert.doesNotMatch(JSON.stringify(result), /private fixture/u)
})

test('one denied or unknown capability blocks even when other probes succeed', async () => {
  for (const capability of Object.keys(available)) {
    const result = await checkTestEnvironment({ probes: { ...available, [capability]: () => { throw new Error('unknown failure') } } })
    assert.equal(result.result, 'BLOCKED')
    assert.equal(result.checks.filter(check => check.result === 'UNAVAILABLE').length, 1)
  }
  assert.equal((await checkTestEnvironment({ probes: available })).result, 'READY')
})

test('pure selected tests do not acquire Git metadata or localhost authority', async () => {
  const result = await checkTestEnvironment({ tests: ['scripts/production-slice-plan.test.mjs'], probes: {} })
  assert.equal(result.result, 'READY')
  assert.deepEqual(result.checks, [])
})

test('shared affected consumers select only capabilities used by those tests', async () => {
  for (const [file, capabilities] of [
    ['scripts/dev117-release-efficiency.test.mjs', ['git-fixture']],
    ['scripts/dev122-openswx-worker-artifact-reuse.test.mjs', ['git-fixture']],
    ['scripts/dev012-owner-stage-executor.test.mjs', ['git-fixture', 'linked-worktree']],
    ['scripts/dev121-principal-only-recovery-server.test.mjs', ['loopback']],
  ]) {
    const result = await checkTestEnvironment({ tests: [file], probes: available })
    assert.deepEqual(result.checks.map(check => check.capability), capabilities)
  }
})

test('CLI fails before launching tests when Git is unavailable', () => {
  const environment = { ...process.env }
  for (const key of Object.keys(environment)) if (key.toUpperCase() === 'PATH') delete environment[key]
  environment.PATH = ''
  const result = spawnSync(process.execPath, ['scripts/dev117-test-environment.mjs'], {
    cwd: new URL('../', import.meta.url), env: environment, encoding: 'utf8', windowsHide: true, timeout: 15000,
  })
  assert.equal(result.status, 2, result.stderr)
  const report = JSON.parse(result.stdout.trim().split('TEST_ENVIRONMENT_PREFLIGHT=')[1])
  assert.equal(report.result, 'BLOCKED')
  assert.equal(report.tests, 'NOT_RUN')
  assert.match(result.stderr, /TEST_ENVIRONMENT_UNAVAILABLE/u)
  assert.doesNotMatch(result.stdout, /TAP version|continuous QC PASS/u)
})

test('all shared suite entrypoints gate execution and QC source-binds the preflight', () => {
  const qc = fs.readFileSync(new URL('./qc-dev-117-continuous-release.mjs', import.meta.url), 'utf8')
  const affected = fs.readFileSync(new URL('./run-production-slice-tests.mjs', import.meta.url), 'utf8')
  const script = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts['test:dev-117:continuous']
  assert.ok(script.startsWith('node scripts/dev117-test-environment.mjs && node --test '))
  assert.ok(qc.indexOf('await reportTestEnvironment') >= 0)
  assert.ok(affected.indexOf('await reportTestEnvironment') >= 0)
  assert.ok(qc.indexOf('await reportTestEnvironment') < qc.indexOf('const run = spawnSync'))
  assert.ok(affected.indexOf('await reportTestEnvironment') < affected.indexOf('const results ='))
  assert.ok(qc.includes("'scripts/dev117-test-environment.mjs', 'scripts/dev117-test-environment.test.mjs'"))
})
