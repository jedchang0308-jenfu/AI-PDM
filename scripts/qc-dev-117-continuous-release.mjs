#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { assertSharpImageQcSummary } from './lib/dev122-sharp-ci-evidence.mjs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (!/^\/output export-ignore$/mu.test(fs.readFileSync(path.join(root, '.gitattributes'), 'utf8'))) throw new Error('PRODUCTION_SOURCE_ARCHIVE_OUTPUT_BOUNDARY_MISSING')
const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'scripts/dev117-ai-pdm-program-only-baseline.test.mjs', 'scripts/dev122-openswx-worker-artifact-reuse.test.mjs', 'scripts/lib/dev122-sharp-ci-evidence.test.mjs', 'scripts/dev122-openswx-owner-release.test.mjs', 'scripts/dev122-openswx-bootstrap.test.mjs', 'scripts/dev117-ai-pdm-continuous-release.test.mjs', 'scripts/dev117-production-migration-runner.test.mjs', 'scripts/dev012-owner-release-runtime.test.mjs', 'scripts/dev015-gcc-applicability.test.mjs', 'scripts/dev015-gcc-aligned-new-applicability.test.mjs', 'scripts/dev015-aligned-new-loader-inspection.test.mjs', 'scripts/dev012-owner-stage-executor.test.mjs', 'scripts/dev121-principal-candidate-smoke.test.mjs', 'scripts/dev121-principal-only-recovery-server.test.mjs', 'scripts/lib/dev121-principal-only-release.test.mjs', 'scripts/lib/dev121-principal-recovery-operator.test.mjs', 'scripts/dev121-principal-recovery-operator.test.mjs'], { cwd: root, encoding: 'utf8' }); process.stdout.write(run.stdout); process.stderr.write(run.stderr); if (run.status !== 0 || (run.stdout.match(/S1B-20/g) || []).length < 10) process.exit(run.status || 1)
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
  'scripts/lib/dev117-ai-pdm-program-only-baseline.mjs', 'scripts/dev117-ai-pdm-program-only-baseline.test.mjs',
  'scripts/lib/dev122-openswx-worker-artifact-reuse.mjs', 'scripts/dev122-openswx-worker-artifact-reuse.test.mjs',
  'config/release/dev122-openswx-worker.json', 'scripts/lib/dev122-openswx-owner-release.mjs', 'scripts/dev122-openswx-owner-release.test.mjs',
  'scripts/dev122-openswx-bootstrap.mjs', 'scripts/lib/dev122-openswx-bootstrap.mjs', 'scripts/dev122-openswx-bootstrap.test.mjs',
  ...['main.tf', 'backend.tf', 'versions.tf', 'README.md'].map(name => `infra/google-cloud/dev-122-openswx-worker/${name}`),
  '.ai-doc/specs/SPEC-PDM-INDEPENDENT-PRODUCTION-DEPLOYMENT-001-app-owned-release-adapter.md',
  '.ai-doc/qa/qa-dev-117-ai-pdm-independent-production-deployment-validation-plan-2026-09-07.md',
  '.ai-doc/dev_task.md', '.ai-doc/documentation_map.md', '.gitattributes', 'AGENTS.md', 'package.json',
  'config/platform/dev-010-n1c-ai-pdm.json',
  'config/release/dev012-ai-pdm-production-data-cutover.json',
  'config/release/dev117-ai-pdm-independent-production-v2.json',
  'config/release/dev117-ai-pdm-independent-production-v3.json',
  'config/release/dev117-production-release-infra-plan.json',
  'db/postgres/064_release_cancelled_drawing_number_claims.sql',
  'qa/dev-010/n1c/fixtures/ai-pdm-staging-v1.json',
  'scripts/dev010-n1c-ai-pdm-package.mjs',
  'scripts/dev010-n1c-ai-pdm-package.test.mjs',
  'scripts/lib/dev117-ai-pdm-continuous-release.mjs', 'scripts/dev117-ai-pdm-continuous-release.mjs',
  'scripts/dev117-ai-pdm-continuous-release.test.mjs', 'scripts/qc-dev-117-continuous-release.mjs',
  'scripts/lib/dev012-owner-release-runtime.mjs', 'scripts/lib/dev012-owner-stage-executor.mjs', 'scripts/lib/dev015-gcc-applicability.mjs', 'scripts/dev015-native-image-inventory.cjs', 'scripts/dev015-gcc-applicability.test.mjs', 'scripts/dev015-gcc-aligned-new-applicability.test.mjs', 'scripts/dev015-aligned-new-loader-inspection.test.mjs', 'config/release/dev015-gcc-pbds-applicability.json', 'config/release/dev015-gcc-aligned-new-applicability.json', 'scripts/lib/dev015-gcc-aligned-new-applicability.mjs', 'scripts/dev015-aligned-new-loader-inspection.cjs', 'scripts/lib/dev012-production-data-cutover.mjs', 'scripts/lib/dev012-production-migration-runner.mjs',
  'scripts/lib/dev121-principal-candidate-smoke.mjs', 'scripts/dev121-principal-candidate-smoke.test.mjs',
  'scripts/dev121-principal-only-recovery-server.mjs', 'scripts/dev121-principal-only-recovery-server.test.mjs',
  'scripts/lib/dev121-principal-only-release.mjs', 'scripts/lib/dev121-principal-only-release.test.mjs',
  'scripts/dev121-principal-recovery-operator.mjs', 'scripts/dev121-principal-recovery-operator.test.mjs',
  'scripts/lib/dev121-principal-recovery-operator.mjs', 'scripts/lib/dev121-principal-recovery-operator.test.mjs',
  'scripts/dev012-owner-release-runtime.test.mjs', 'scripts/dev012-owner-stage-executor.test.mjs',
  'scripts/dev117-production-migration-runner.mjs', 'scripts/dev117-production-migration-runner.test.mjs',
  'scripts/lib/dev121-unlinked-profile-cleanup.mjs', 'scripts/lib/dev121-unlinked-profile-cleanup.test.mjs',
  'src/lib/firebase-client-auth.ts', 'src/app/login/page.tsx', 'src/app/globals.css',
  '.github/workflows/deploy-ai-pdm-independent-production.yml',
  '.github/workflows/deploy-ai-pdm-principal-migrations-production.yml',
  ...['tools/dev-117/abort-controller', 'infra/google-cloud/dev-117-production-release'].flatMap((directory) => fs.readdirSync(path.join(root, directory)).filter((name) => fs.statSync(path.join(root, directory, name)).isFile()).map((name) => `${directory}/${name}`)),
].sort()
const sourceSnapshotSha256 = createHash('sha256').update(files.map((file) => `${file}\0${createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')}`).join('\n')).digest('hex')
const report = { schemaVersion: 'jenfu.dev117.s1b-owner-report.v2', runId, ownerApplicationId: 'ai-pdm', caseId: 'S1B-20', result: 'PASS', sourceFiles: files, sourceSnapshotAlgorithm: 'sha256(file-null-sha256-bytes)', sourceSnapshotSha256, contractSha256: currentContractHash(), contractVersion: 'CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP', evidenceScope: 'LOCAL_CONTRACT', releaseAuthority: false, ownerExitCommands: [{ command: 'npm run test:dev-117:continuous', result: 'PASS' }, { command: 'npm run qc:dev-117:continuous', result: 'SELF' }, ...ownerExitCommands], providerMutationSummary: { cloud: 0, database: 0, traffic: 0, credentials: 0, sibling: 0 }, cleanup: { runtime: 0, ports: 0, containers: 0, temporaryFiles: 0 }, createdAt: new Date().toISOString() }; report.evidenceSha256 = createHash('sha256').update(JSON.stringify(report)).digest('hex'); fs.writeFileSync(path.join(dir, 'owner-report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' }); process.stdout.write(`DEV-117 continuous QC PASS ${path.relative(root, dir)}\n`)
function currentContractHash() { return '857f8a94ab13f63071156f85e76e5c675b348588b1126c147e0e54b431b6e8c5' }
