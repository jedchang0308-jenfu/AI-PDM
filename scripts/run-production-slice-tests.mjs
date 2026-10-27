#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createProductionSlicePlanFromGit, isRdPermissionDatabasePath } from './lib/production-slice-plan.mjs'
import { fullContinuousGroups, localCheckContext, runCheckpointedGroups } from './lib/production-slice-checkpoints.mjs'
import { reportTestEnvironment } from './dev117-test-environment.mjs'

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
  'scripts/dev123-role-policy-release-contract.test.mjs',
  'scripts/dev117-ai-pdm-continuous-release.test.mjs',
  'scripts/dev012-owner-release-runtime.test.mjs',
  'scripts/dev012-owner-stage-executor.test.mjs',
  'scripts/dev012-owner-prerequisite-producer.test.mjs',
  'scripts/dev121-principal-owner-recovery.test.mjs',
  'scripts/dev117-owner-chain-preflight.test.mjs',
  'scripts/dev117-release-control-policy.test.mjs',
  'scripts/dev012-official-source-review.test.mjs',
  'scripts/dev117-release-efficiency.test.mjs',
  'scripts/dev122-applied-continuation-capsule-refresh.test.mjs',
]

const DATABASE_TESTS = [
  'scripts/dev117-production-migration-runner.test.mjs',
  'scripts/lib/dev122-preview-openswx-runtime-readback.test.mjs',
]

const RD_PERMISSION_DATABASE_TESTS = [
  'scripts/dev122-rd-permission-ledger-readback.test.mjs',
  'scripts/dev122-applied-migration-continuation.test.mjs',
]

const AUTHORIZATION_TESTS = [
  'scripts/dev123-build-role-policy-registry.test.mjs',
  'scripts/dev123-role-policy-contract.test.mjs',
  'scripts/lib/dev121-principal-fence-operator.test.mjs',
  'scripts/dev122-rd-permission-ledger-readback.test.mjs',
  'scripts/lib/dev122-rd-permission-state-readback.test.mjs',
]

const WORKER_TESTS = [
  'scripts/dev125-windows-service-contract.test.mjs',
  'scripts/lib/dev121-unlinked-profile-cleanup.test.mjs',
]

const groups = [{ name: 'planner', tests: ['scripts/production-slice-plan.test.mjs'] }]
if (plan.gates.full) {
  groups.push(...fullContinuousGroups(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts['test:dev-117:continuous']))
} else {
  if (plan.gates.releaseCore) groups.push({ name: 'release-core', tests: CORE_TESTS })
  if (plan.gates.database) groups.push({ name: 'database', tests: [
    ...DATABASE_TESTS,
    ...(plan.files.some(isRdPermissionDatabasePath) ? RD_PERMISSION_DATABASE_TESTS : []),
  ] })
  if (plan.gates.authorization) groups.push({ name: 'authorization', tests: AUTHORIZATION_TESTS })
  if (plan.gates.worker) groups.push({ name: 'worker', tests: WORKER_TESTS })
}

const commandFor = group => ({ command: process.execPath, args: ['--test', '--test-concurrency=1', ...group.tests] })
const evidenceRoot = option('--evidence-dir') ?? 'output/qa/release-efficiency'
if (!dryRun && !await reportTestEnvironment({ root, tests: groups.flatMap(group => group.tests) })) process.exit(2)
const results = dryRun ? groups.map(group => ({ name: group.name, status: 'PLANNED' })) : runCheckpointedGroups({
  groups, directory: path.resolve(root, evidenceRoot, 'checkpoints'),
  context: () => localCheckContext(root), reuse: !args.includes('--fresh') && profile !== 'owner',
  onResult: result => process.stdout.write(`PRODUCTION_SLICE_GROUP=${JSON.stringify(result)}\n`),
  execute(group) {
    const command = commandFor(group)
    const result = spawnSync(command.command, command.args, { cwd: root, encoding: 'utf8', windowsHide: true, env: process.env })
    process.stdout.write(result.stdout ?? '')
    process.stderr.write(result.stderr ?? '')
    return { status: !result.error && result.status === 0 && result.signal === null ? 'PASS' : 'FAIL', exitCode: result.status }
  },
})
const failed = results.find(row => row.status === 'FAIL')
if (failed) {
  process.exitCode = failed.exitCode || 1
  results.push(...groups.slice(results.length).map(group => ({ name: group.name, status: 'NOT_RUN' })))
}

const evidence = {
  schemaVersion: 'aipdm.production-slice-test-result.v1',
  profile,
  result: dryRun ? 'PLANNED' : failed ? 'FAIL' : 'PASS',
  plan,
  groups: results,
  environment: process.env.CI ? 'CI' : 'LOCAL',
}
const evidenceSha256 = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
if (!dryRun && evidenceRoot) {
  const absoluteRoot = path.resolve(root, evidenceRoot)
  fs.mkdirSync(absoluteRoot, { recursive: true })
  const target = path.join(absoluteRoot, `production-slice-${plan.headRevision.slice(0, 12)}-${process.pid}-${Date.now()}.json`)
  fs.writeFileSync(target, `${JSON.stringify({ ...evidence, evidenceSha256 }, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write(`PRODUCTION_SLICE_EVIDENCE=${path.relative(root, target)}\n`)
}
process.stdout.write(`PRODUCTION_SLICE_RESULT=${JSON.stringify({ classification: plan.classification, slices: plan.slices, groups: results.map(row => row.name), evidenceSha256, host: os.platform() })}\n`)
