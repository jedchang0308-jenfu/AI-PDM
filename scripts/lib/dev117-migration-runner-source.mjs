import { spawnSync } from 'node:child_process'

const H40 = /^[a-f0-9]{40}$/u

export const MIGRATION_RUNNER_EXECUTABLE_INPUTS = Object.freeze([
  'config/release/dev012-ai-pdm-production-data-cutover.json',
  'infra/google-cloud/dev-117-production-release/migration-runner.Dockerfile',
  'infra/google-cloud/dev-117-production-release/migration-runner/package-lock.json',
  'infra/google-cloud/dev-117-production-release/migration-runner/package.json',
  'scripts/dev012-production-data-cutover-runtime.mjs',
  'scripts/dev117-production-migration-runner.mjs',
  'scripts/lib/dev012-production-data-cutover.mjs',
  'scripts/lib/dev012-production-migration-runner.mjs',
  'scripts/lib/dev121-ai-pdm-quiescence.mjs',
  'scripts/lib/dev121-migration-fence.mjs',
  'scripts/lib/dev121-unlinked-profile-cleanup.mjs',
  'scripts/lib/dev122-preview-openswx-runtime-readback.mjs',
  'scripts/lib/dev122-rd-permission-state-readback.mjs',
  'scripts/lib/dev125-openswx-retirement-cleanup.mjs',
])

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function gitSucceeded(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
  return !result.error && result.status === 0
}

export function assertMigrationRunnerSourceCompatibility({
  root,
  currentSourceRevision,
  runnerSourceRevision,
  ancestorRunner = null,
  compatibilityRunner = null,
}) {
  if (!H40.test(currentSourceRevision ?? '') || !H40.test(runnerSourceRevision ?? '') || !root) {
    fail('MIGRATION_RUNNER_SOURCE_COMPATIBILITY_INVALID')
  }
  const isAncestor = ancestorRunner ?? ((ancestor, descendant) =>
    gitSucceeded(root, ['merge-base', '--is-ancestor', ancestor, descendant]))
  const inputsEqual = compatibilityRunner ?? ((ancestor, descendant, inputPaths) =>
    gitSucceeded(root, ['diff', '--quiet', `${ancestor}..${descendant}`, '--', ...inputPaths]))
  if (!isAncestor(runnerSourceRevision, currentSourceRevision) ||
      !inputsEqual(runnerSourceRevision, currentSourceRevision, MIGRATION_RUNNER_EXECUTABLE_INPUTS)) {
    fail('MIGRATION_RUNNER_SOURCE_REFRESH_REQUIRED')
  }
  return {
    currentSourceRevision,
    runnerSourceRevision,
    compatibilityPaths: [...MIGRATION_RUNNER_EXECUTABLE_INPUTS],
  }
}

