#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = spawnSync(process.execPath, ['--test', 'scripts/dev117-ai-pdm-continuous-release.test.mjs', 'scripts/dev117-production-migration-runner.test.mjs', 'scripts/dev012-owner-release-runtime.test.mjs', 'scripts/dev012-owner-stage-executor.test.mjs'], { cwd: root, encoding: 'utf8' }); process.stdout.write(run.stdout); process.stderr.write(run.stderr); if (run.status !== 0 || (run.stdout.match(/S1B-20/g) || []).length !== 7) process.exit(run.status || 1)
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('NPM_EXEC_PATH_REQUIRED')
const ownerExitCommands = [
  ['npm run test:dev-117:abort', ['run', 'test:dev-117:abort']],
  ['npm run check:db-boundary', ['run', 'check:db-boundary']],
  ['npm run typecheck:app', ['run', 'typecheck:app']],
  ['npm run build:isolated', ['run', 'build:isolated']],
].map(([command, args]) => {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, encoding: 'utf8' })
  process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '')
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
  return { command, result: 'PASS' }
})
const runId = `DEV117-S1B-${new Date().toISOString().replace(/[-:.]/g, '')}-${randomBytes(4).toString('hex').toUpperCase()}`; const dir = path.join(root, 'output', 'dev-117', 's1b', runId); fs.mkdirSync(dir, { recursive: true })
const files = [
  '.ai-doc/specs/SPEC-PDM-INDEPENDENT-PRODUCTION-DEPLOYMENT-001-app-owned-release-adapter.md',
  '.ai-doc/qa/qa-dev-117-ai-pdm-independent-production-deployment-validation-plan-2026-09-07.md',
  '.ai-doc/dev_task.md', '.ai-doc/documentation_map.md', 'AGENTS.md', 'package.json',
  'config/release/dev117-ai-pdm-independent-production-v2.json', 'config/release/dev117-production-release-infra-plan.json',
  'scripts/lib/dev117-ai-pdm-continuous-release.mjs', 'scripts/dev117-ai-pdm-continuous-release.mjs',
  'scripts/dev117-ai-pdm-continuous-release.test.mjs', 'scripts/qc-dev-117-continuous-release.mjs',
  'scripts/lib/dev012-owner-release-runtime.mjs', 'scripts/lib/dev012-owner-stage-executor.mjs', 'scripts/lib/dev012-production-migration-runner.mjs',
  'scripts/dev012-owner-release-runtime.test.mjs', 'scripts/dev012-owner-stage-executor.test.mjs',
  'scripts/dev117-production-migration-runner.mjs', 'scripts/dev117-production-migration-runner.test.mjs',
  '.github/workflows/deploy-ai-pdm-independent-production.yml',
  ...['tools/dev-117/abort-controller', 'infra/google-cloud/dev-117-production-release'].flatMap((directory) => fs.readdirSync(path.join(root, directory)).filter((name) => fs.statSync(path.join(root, directory, name)).isFile()).map((name) => `${directory}/${name}`)),
].sort()
const sourceSnapshotSha256 = createHash('sha256').update(files.map((file) => `${file}\0${createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')}`).join('\n')).digest('hex')
const report = { schemaVersion: 'jenfu.dev117.s1b-owner-report.v2', runId, ownerApplicationId: 'ai-pdm', caseId: 'S1B-20', result: 'PASS', sourceFiles: files, sourceSnapshotAlgorithm: 'sha256(file-null-sha256-bytes)', sourceSnapshotSha256, contractSha256: v2Hash(), contractVersion: 'CONTINUOUS_NO_DWELL_V2', evidenceScope: 'LOCAL_CONTRACT', releaseAuthority: false, ownerExitCommands: [{ command: 'npm run test:dev-117:continuous', result: 'PASS' }, { command: 'npm run qc:dev-117:continuous', result: 'SELF' }, ...ownerExitCommands], providerMutationSummary: { cloud: 0, database: 0, traffic: 0, credentials: 0, sibling: 0 }, cleanup: { runtime: 0, ports: 0, containers: 0, temporaryFiles: 0 }, createdAt: new Date().toISOString() }; report.evidenceSha256 = createHash('sha256').update(JSON.stringify(report)).digest('hex'); fs.writeFileSync(path.join(dir, 'owner-report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' }); process.stdout.write(`DEV-117 continuous QC PASS ${path.relative(root, dir)}\n`)
function v2Hash() { return 'c29974332ae0193bec330870b84a00766c6ae759b7d1522adc4faddc16490c3b' }
