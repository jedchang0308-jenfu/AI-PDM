import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, copyFile, writeFile, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

test('a fresh linked worktree delegates its own source and arguments to the common Platform controller', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pdm-local-caller-'))
  try {
    const owner = path.join(root, 'AI_PDM')
    const worktree = path.join(root, 'task-pdm')
    const platform = path.join(root, 'Jenfu-Platform')
    await mkdir(owner)
    await mkdir(path.join(platform, 'scripts'), { recursive: true })
    const git = args => execFileSync('git', ['-C', owner, ...args], { windowsHide: true, stdio: 'pipe' })
    git(['init', '--quiet'])
    await writeFile(path.join(owner, 'README.md'), 'isolated caller fixture\n')
    git(['add', 'README.md'])
    git(['-c', 'user.name=Local Test', '-c', 'user.email=local@example.invalid', 'commit', '--quiet', '-m', 'fixture'])
    git(['worktree', 'add', '--quiet', '--detach', worktree])
    await mkdir(path.join(worktree, 'scripts'))
    await copyFile(new URL('./local-sandbox-client.mjs', import.meta.url), path.join(worktree, 'scripts', 'local-sandbox-client.mjs'))
    await writeFile(path.join(platform, 'scripts', 'dev-local-daily.mjs'),
      'export async function runDailyLocal(args, root, request) { console.log(JSON.stringify({ args, root, request })) }\n')
    const child = spawnSync(process.execPath, ['scripts/local-sandbox-client.mjs', '--status', '--no-browser'],
      { cwd: worktree, encoding: 'utf8', windowsHide: true, timeout: 10_000 })
    assert.equal(child.status, 0, child.stderr)
    const result = JSON.parse(child.stdout)
    assert.deepEqual(result.args, ['--status', '--no-browser'])
    // Git expands Windows 8.3 TEMP aliases; compare the actual directories.
    assert.equal(await realpath(result.root), await realpath(platform))
    assert.equal(await realpath(result.request.ownerWorktree), await realpath(worktree))
    assert.equal(result.request.app, 'ai-pdm')
    assert.deepEqual(Object.keys(result.request).sort(), ['app', 'ownerWorktree'])
  } finally {
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('pdm-local-caller-')) throw new Error('TEST_CLEANUP_TARGET_INVALID')
    await rm(root, { recursive: true, force: true })
  }
})
