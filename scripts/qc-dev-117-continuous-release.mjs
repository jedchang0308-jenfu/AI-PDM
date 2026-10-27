#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { assertSharpImageQcSummary } from './lib/dev122-sharp-ci-evidence.mjs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { reportTestEnvironment } from './dev117-test-environment.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (!/^\/output export-ignore$/mu.test(fs.readFileSync(path.join(root, '.gitattributes'), 'utf8'))) throw new Error('PRODUCTION_SOURCE_ARCHIVE_OUTPUT_BOUNDARY_MISSING')
if (!await reportTestEnvironment({ root })) process.exit(2)
const npmCli = process.env.npm_execpath
if (!npmCli) throw new Error('NPM_EXEC_PATH_REQUIRED')
const run = spawnSync(process.execPath, [npmCli, 'run', 'test:dev-117:continuous'], { cwd: root, encoding: 'utf8' })
process.stdout.write(run.stdout ?? '')
process.stderr.write(run.stderr ?? '')
if (run.error) throw run.error
if (run.status !== 0) process.exit(run.status || 1)
const imageTempPrefix = path.resolve(os.tmpdir(), 'aipdm-dev122-sharp-');
const imageTemp = fs.mkdtempSync(imageTempPrefix);
const imageScope = { project: 'AI-PDM', purpose: 'DEV122 patched sharp converter and static preview contract CI', port: null, parentPid: process.pid, executable: process.execPath, PDM_DATA_DIR: path.join(imageTemp, 'unused-data'), PDM_REPOSITORY_DIR: path.join(imageTemp, 'unused-repository'), mutationScope: 'IMAGE_ONLY_NO_SCHEMA_OR_FIXTURES', cleanupCondition: 'Finite own Node CLI exits; own temp removed' };
console.log('DEV122_SHARP_RUNTIME_DECLARED=' + JSON.stringify(imageScope));
try {
  for (const [name, args] of [
    ['canonical-preview-contract', ['--experimental-transform-types', '--experimental-loader', './scripts/qc-ts-path-loader.mjs', 'scripts/qc-dev-065-canonical-preview-contract.mjs']],
    ['part-preview-image-only', ['--conditions=react-server', '--experimental-transform-types', '--experimental-loader', './scripts/qc-ts-path-loader.mjs', 'scripts/qc-dev-065-part-preview.mjs', '--image-only']],
  ]) {
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 180000, windowsHide: true, env: { ...process.env, PDM_DATA_DIR: imageScope.PDM_DATA_DIR, PDM_REPOSITORY_DIR: imageScope.PDM_REPOSITORY_DIR } });
    process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
    console.log('DEV122_SHARP_RUNTIME_EXIT=' + JSON.stringify({ name, pid: result.pid, exitCode: result.status, signal: result.signal, processStopped: Number.isInteger(result.status) && result.signal === null }));
    if (result.error) throw result.error;
    if (result.status !== 0 || result.signal !== null) throw new Error('DEV122_SHARP_IMAGE_QC_FAILED:' + name);
    if (name === 'part-preview-image-only') assertSharpImageQcSummary(result.stdout, JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies.sharp);
  }
} finally {
  if (!path.resolve(imageTemp).startsWith(imageTempPrefix)) throw new Error('DEV122_SHARP_TEMP_SCOPE_DRIFT');
  fs.rmSync(imageTemp, { recursive: true, force: true });
  console.log('DEV122_SHARP_RUNTIME_CLEANUP=' + JSON.stringify({ taskTempRemoved: !fs.existsSync(imageTemp), port: null }));
}
const ownerExitCommands = [
  ['npm run check:dev-121:role-catalog-v7', ['run', 'check:dev-121:role-catalog-v7']],
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
const files = [...new Set([
  '.gitattributes', 'AGENTS.md', 'package.json',
  '.ai-doc/dev_task.md', '.ai-doc/documentation_map.md',
  '.ai-doc/specs/DEV-121-target-authorization-boundary.md',
  '.ai-doc/specs/SPEC-PDM-INDEPENDENT-PRODUCTION-DEPLOYMENT-001-app-owned-release-adapter.md',
  '.ai-doc/qa/qa-dev-117-ai-pdm-independent-production-deployment-validation-plan-2026-09-07.md',
  '.github/workflows/deploy-ai-pdm-independent-production.yml',
  '.github/workflows/deploy-ai-pdm-principal-migrations-production.yml',
  '.github/workflows/read-ai-pdm-rd-permission-state-production.yml',
  'config/release/dev117-ai-pdm-independent-production-v3.json',
  'config/release/dev117-production-release-infra-plan.json',
  'scripts/dev117-test-environment.mjs', 'scripts/dev117-test-environment.test.mjs',
  'scripts/lib/dev012-official-source-review.mjs',
  'scripts/dev012-verify-official-source.mjs', 'scripts/dev012-official-source-review.test.mjs',
  'scripts/qc-dev-117-continuous-release.mjs',
  ...collectFiles('infra/google-cloud/dev-117-production-release'),
  ...collectFiles('tools/dev-117/abort-controller'),
  ...collectFiles('scripts').filter((file) => /\/(?:dev012|dev015|dev117|dev121|dev122-(?:applied|rd-permission)|production-slice|run-production-slice)/u.test(file)),
])].sort()
function collectFiles(directory) {
  const absolute = path.join(root, directory)
  if (!fs.existsSync(absolute)) throw new Error(`SOURCE_ROOT_MISSING:${directory}`)
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`
    return entry.isDirectory() ? collectFiles(relative) : [relative]
  })
}
const sourceSnapshotSha256 = createHash('sha256').update(files.map((file) => `${file}\0${createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')}`).join('\n')).digest('hex')
const report = { schemaVersion: 'jenfu.dev117.s1b-owner-report.v2', runId, ownerApplicationId: 'ai-pdm', caseId: 'S1B-20', result: 'PASS', sourceFiles: files, sourceSnapshotAlgorithm: 'sha256(file-null-sha256-bytes)', sourceSnapshotSha256, contractSha256: currentContractHash(), contractVersion: 'CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP', evidenceScope: 'LOCAL_CONTRACT', releaseAuthority: false, ownerExitCommands: [{ command: 'npm run test:dev-117:continuous', result: 'PASS' }, { command: 'npm run qc:dev-117:continuous', result: 'SELF' }, ...ownerExitCommands], providerMutationSummary: { cloud: 0, database: 0, traffic: 0, credentials: 0, sibling: 0 }, cleanup: { runtime: 0, ports: 0, containers: 0, temporaryFiles: 0 }, createdAt: new Date().toISOString() }; report.evidenceSha256 = createHash('sha256').update(JSON.stringify(report)).digest('hex'); fs.writeFileSync(path.join(dir, 'owner-report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' }); process.stdout.write(`DEV-117 continuous QC PASS ${path.relative(root, dir)}\n`)
function currentContractHash() {
  return JSON.parse(fs.readFileSync(path.join(root, 'config/release/dev117-ai-pdm-independent-production-v3.json'), 'utf8')).contractSha256
}
