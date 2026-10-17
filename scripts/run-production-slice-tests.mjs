#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createProductionSlicePlanFromGit } from './lib/production-slice-plan.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}
const profile = option('--profile') ?? 'ci'
if (!['ci', 'owner'].includes(profile)) throw new Error('PRODUCTION_SLICE_PROFILE_INVALID')
const dryRun = args.includes('--dry-run')
const plan = createProductionSlicePlanFromGit({ root, base: option('--base'), head: option('--head') })

const CORE_TESTS = [
  'scripts/dev117-ai-pdm-continuous-release.test.mjs',
  'scripts/dev117-production-migration-runner.test.mjs',
  'scripts/dev012-owner-release-runtime.test.mjs',
  'scripts/dev012-owner-stage-executor.test.mjs',
  'scripts/dev012-owner-prerequisite-producer.test.mjs',
  'scripts/dev012-official-source-review.test.mjs',
  'scripts/dev015-gcc-applicability.test.mjs',
  'scripts/dev015-gcc-aligned-new-applicability.test.mjs',
  'scripts/dev015-aligned-new-loader-inspection.test.mjs',
]

const AUTHORIZATION_TESTS = [
  'scripts/lib/dev121-principal-fence-operator.test.mjs',
  'scripts/dev122-rd-permission-ledger-readback.test.mjs',
  'scripts/dev121-principal-candidate-smoke.test.mjs',
  'scripts/dev121-principal-only-recovery-server.test.mjs',
  'scripts/dev121-principal-owner-recovery.test.mjs',
  'scripts/lib/dev121-ai-pdm-quiescence.test.mjs',
  'scripts/lib/dev121-migration-fence.test.mjs',
  'scripts/lib/dev121-principal-only-release.test.mjs',
  'scripts/lib/dev121-principal-forward-repair.test.mjs',
  'scripts/lib/dev121-principal-recovery-operator.test.mjs',
  'scripts/dev121-principal-recovery-operator.test.mjs',
]

const WORKER_TESTS = [
  'scripts/dev117-ai-pdm-program-only-baseline.test.mjs',
  'scripts/dev122-openswx-worker-artifact-reuse.test.mjs',
  'scripts/dev122-openswx-owner-release.test.mjs',
  'scripts/dev122-openswx-bootstrap.test.mjs',
  'scripts/lib/dev121-unlinked-profile-cleanup.test.mjs',
]

const groups = [{ name: 'planner', tests: ['scripts/production-slice-plan.test.mjs'] }]
if (plan.gates.full) {
  groups.push({ name: 'legacy-full-continuous', npmScript: 'test:dev-117:continuous' })
} else {
  if (profile === 'owner' || plan.gates.releaseCore) groups.push({ name: 'release-core', tests: CORE_TESTS })
  if (plan.gates.authorization) groups.push({ name: 'authorization', tests: AUTHORIZATION_TESTS })
  if (plan.gates.worker) groups.push({ name: 'worker', tests: WORKER_TESTS })
}

const npmCli = process.env.npm_execpath
const commandFor = group => group.npmScript
  ? { command: process.execPath, args: [npmCli, 'run', group.npmScript] }
  : { command: process.execPath, args: ['--test', '--test-concurrency=1', ...group.tests] }
if (groups.some(group => group.npmScript) && !npmCli) throw new Error('NPM_EXEC_PATH_REQUIRED')

const results = []
for (const group of groups) {
  const command = commandFor(group)
  if (dryRun) {
    results.push({ name: group.name, status: 'PLANNED', command: [command.command, ...command.args] })
    continue
  }
  const result = spawnSync(command.command, command.args, { cwd: root, encoding: 'utf8', windowsHide: true, env: process.env })
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  results.push({ name: group.name, status: result.status === 0 && result.signal === null ? 'PASS' : 'FAIL', exitCode: result.status, signal: result.signal })
  if (result.error) throw result.error
  if (result.status !== 0 || result.signal !== null) {
    process.stderr.write(`PRODUCTION_SLICE_GROUP_FAILED=${group.name}\n`)
    process.exit(result.status || 1)
  }
}

const evidence = {
  schemaVersion: 'aipdm.production-slice-test-result.v1',
  profile,
  result: dryRun ? 'PLANNED' : 'PASS',
  plan,
  groups: results,
  environment: process.env.CI ? 'CI' : 'LOCAL',
}
const evidenceSha256 = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
const evidenceRoot = option('--evidence-dir')
if (!dryRun && evidenceRoot) {
  const absoluteRoot = path.resolve(root, evidenceRoot)
  fs.mkdirSync(absoluteRoot, { recursive: true })
  const target = path.join(absoluteRoot, `production-slice-${plan.headRevision.slice(0, 12)}-${process.pid}-${Date.now()}.json`)
  fs.writeFileSync(target, `${JSON.stringify({ ...evidence, evidenceSha256 }, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write(`PRODUCTION_SLICE_EVIDENCE=${path.relative(root, target)}\n`)
}
process.stdout.write(`PRODUCTION_SLICE_RESULT=${JSON.stringify({ classification: plan.classification, slices: plan.slices, groups: results.map(row => row.name), evidenceSha256, host: os.platform() })}\n`)
