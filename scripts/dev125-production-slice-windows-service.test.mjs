import assert from 'node:assert/strict'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('DEV-125 Windows production-slice route tests run in the required worker group', () => {
  const result = spawnSync(process.execPath, [
    'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts', '--configLoader', 'runner', '--no-cache',
    'src/lib/production-slice.windows-service.test.ts',
    'src/components/windows-service-settings.self-link.test.tsx',
    'src/lib/windows-service-caller-revocation.test.ts',
    'src/lib/windows-service-key-lease.test.ts',
    'src/lib/preview-worker-source.principal.test.ts',
    'src/lib/principal-job-authority.test.ts',
    'src/lib/principal-recognition-capability.test.ts',
    'src/lib/settings-secret-lifecycle.principal.test.ts',
    'src/app/api/settings-secret-probe-jobs/claim/route.test.ts',
  ], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  assert.equal(result.status, 0, `${result.stdout ?? ''}\n${result.stderr ?? ''}`)
})

test('DEV-125 installed worker claims an authorized job before requesting its credential', () => {
  const env = { ...process.env }
  // A nested node:test process must start its own runner rather than inherit
  // the parent's child-worker mode and exit without collecting these cases.
  delete env.NODE_TEST_CONTEXT
  const result = spawnSync(process.execPath, ['--test', 'windows-service/tests/worker.test.mjs'], {
    cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, env,
  })
  assert.equal(result.status, 0, `${result.stdout ?? ''}\n${result.stderr ?? ''}`)
  assert.match(result.stdout, /no active native credential leaves queued business work unclaimed/u)
  assert.match(result.stdout, /lease denial stops the worker without completing the business job as failed/u)
  assert.match(result.stdout, /\btests [1-9][0-9]*\b/u)
  assert.match(result.stdout, /\bfail 0\b/u)
})
