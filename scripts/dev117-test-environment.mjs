#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const consumers = {
  'git-fixture': ['scripts/dev117-release-efficiency.test.mjs', 'scripts/dev122-openswx-worker-artifact-reuse.test.mjs', 'scripts/dev012-owner-stage-executor.test.mjs'],
  'linked-worktree': ['scripts/dev012-owner-stage-executor.test.mjs'],
  loopback: ['scripts/dev121-principal-only-recovery-server.test.mjs'],
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 5000 })
  if (result.error) throw result.error
  if (result.status !== 0) throw Object.assign(new Error('Git capability probe failed'), { code: `GIT_EXIT_${result.status}` })
  return result.stdout.trim()
}

const nativeProbes = {
  'git-fixture'() {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'aipdm-env-'))
    try {
      git(temporary, ['init', '--quiet'])
      git(temporary, ['config', '--local', 'test.preflight', 'ready'])
      if (git(temporary, ['config', '--local', '--get', 'test.preflight']) !== 'ready') throw new Error('Git config readback failed')
    } finally { fs.rmSync(temporary, { recursive: true, force: true }) }
  },
  'linked-worktree'({ root: projectRoot }) {
    const common = path.resolve(projectRoot, git(projectRoot, ['rev-parse', '--git-common-dir']))
    // Test metadata write authority without registering a worktree or copying the repository.
    const temporary = fs.mkdtempSync(path.join(common, 'aipdm-env-'))
    try { fs.writeFileSync(path.join(temporary, 'probe'), 'ready', { flag: 'wx' }) }
    finally { fs.rmSync(temporary, { recursive: true, force: true }) }
  },
  async loopback() {
    const server = createServer((_request, response) => response.end('ready'))
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      const response = await fetch(`http://127.0.0.1:${server.address().port}`, { signal: AbortSignal.timeout(3000) })
      if (await response.text() !== 'ready') throw new Error('Loopback readback failed')
    } finally {
      if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  },
}

export async function checkTestEnvironment({ root: projectRoot = root, tests, probes = nativeProbes } = {}) {
  const required = Object.keys(consumers).filter(name => !tests || tests.some(file => consumers[name].includes(file)))
  const started = performance.now()
  const checks = []
  for (const capability of required) {
    try {
      await probes[capability]({ root: projectRoot })
      checks.push({ capability, result: 'READY' })
    } catch (error) {
      // Keep provider paths, command output and environment values out of this diagnostic.
      checks.push({ capability, result: 'UNAVAILABLE', code: error.code ?? error.cause?.code ?? error.name ?? 'UNKNOWN' })
    }
  }
  const blocked = checks.some(check => check.result !== 'READY')
  return { schemaVersion: 'aipdm.test-environment.v1', result: blocked ? 'BLOCKED' : 'READY',
    tests: 'NOT_RUN', checks, elapsedMs: Math.round(performance.now() - started), releaseAuthority: false }
}

export async function reportTestEnvironment(options) {
  const report = await checkTestEnvironment(options)
  process.stdout.write(`TEST_ENVIRONMENT_PREFLIGHT=${JSON.stringify(report)}\n`)
  if (report.result === 'BLOCKED') process.stderr.write('TEST_ENVIRONMENT_UNAVAILABLE: no tests started. Run the same command in an approved host/CI environment; use a task-owned short TEMP/TMP if needed. No automatic escalation or test skip.\n')
  return report.result === 'READY'
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!await reportTestEnvironment()) process.exitCode = 2
}
