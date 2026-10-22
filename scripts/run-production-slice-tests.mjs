#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createProductionSlicePlanFromGit } from './lib/production-slice-plan.mjs'
import { localCheckContext, runCheckpointedGroups, summarizeCheckResults } from './lib/production-slice-checkpoints.mjs'
import { checkTestEnvironment } from './dev117-test-environment.mjs'

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

const groups = plan.testGroups

const commandFor = group => ({ command: process.execPath, args: ['--test', '--test-concurrency=1', ...group.tests] })
const evidenceRoot = option('--evidence-dir') ?? 'output/qa/release-efficiency'
const environments = new Map()
if (!dryRun) {
  for (const group of groups) {
    const report = await checkTestEnvironment({ root, tests: group.tests })
    environments.set(group.name, report)
    process.stdout.write(`TEST_ENVIRONMENT_PREFLIGHT=${JSON.stringify({ group: group.name, ...report })}\n`)
  }
}
const results = dryRun ? groups.map(group => ({ name: group.name, status: 'PLANNED' })) : runCheckpointedGroups({
  groups, directory: path.resolve(root, evidenceRoot, 'checkpoints'),
  context: () => localCheckContext(root), reuse: !args.includes('--fresh') && profile !== 'owner',
  preflight: group => environments.get(group.name).result === 'READY' ? null : { status: 'BLOCKED', exitCode: 2, reason: 'TEST_ENVIRONMENT_UNAVAILABLE' },
  onResult: result => process.stdout.write(`PRODUCTION_SLICE_GROUP=${JSON.stringify(result)}\n`),
  execute(group) {
    const command = commandFor(group)
    // This CLI may itself be exercised by node:test. Its children must start a
    // fresh test runner rather than inherit the parent's internal test context.
    const environment = { ...process.env }
    delete environment.NODE_TEST_CONTEXT
    const result = spawnSync(command.command, command.args, { cwd: root, encoding: 'utf8', windowsHide: true, env: environment })
    process.stdout.write(result.stdout ?? '')
    process.stderr.write(result.stderr ?? '')
    return { status: !result.error && result.status === 0 && result.signal === null ? 'PASS' : 'FAIL', exitCode: result.status }
  },
})
const summary = dryRun ? { result: 'PLANNED', firstFailure: null, failures: [], blocked: [], exitCode: 0 } : summarizeCheckResults(results)
process.exitCode = summary.exitCode

const evidence = {
  schemaVersion: 'aipdm.production-slice-test-result.v1',
  profile,
  ...summary,
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
process.stdout.write(`PRODUCTION_SLICE_RESULT=${JSON.stringify({ result: summary.result, firstFailure: summary.firstFailure?.name ?? null, classification: plan.classification, slices: plan.slices, groups: results.map(row => ({ name: row.name, status: row.status })), evidenceSha256, host: os.platform() })}\n`)
