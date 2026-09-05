#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const terraformRoot = path.join(root, 'infra', 'google-cloud', 'dev-010-n1c')
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dev010-n1c-ai-pdm-qc-'))
const commands = []

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  })
  commands.push({ command: `${command} ${args.join(' ')}`, status: result.status })
  if (result.status !== 0) throw new Error(`DEV010_N1C_AI_PDM_QC_FAILED: ${command} ${args.join(' ')}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`)
}

try {
  run(process.execPath, ['scripts/dev010-n1c-source-freeze.mjs'])
  run(process.execPath, ['--test', 'scripts/dev010-n1c-source-freeze.test.mjs', 'scripts/dev010-n1c-ai-pdm-package.test.mjs'])
  run(process.execPath, ['--experimental-transform-types', '--experimental-loader', './scripts/qc-ts-path-loader.mjs', '--test', 'scripts/dev010-n1c-normal-entry.test.mjs'])
  run(process.execPath, ['scripts/check-shared-database-boundary.mjs', `--base=${JSON.parse(fs.readFileSync(path.join(root, 'config', 'platform', 'dev-010-n1c-ai-pdm.json'), 'utf8')).repository.inspectionHead}`])
  run('terraform', ['fmt', '-check', '-recursive', terraformRoot])
  const terraformData = path.join(tempRoot, 'data')
  fs.mkdirSync(terraformData)
  const env = { ...process.env, TF_DATA_DIR: terraformData }
  run('terraform', [`-chdir=${terraformRoot}`, 'init', '-backend=false', '-input=false', '-lockfile=readonly', '-no-color'], { env })
  run('terraform', [`-chdir=${terraformRoot}`, 'validate', '-no-color'], { env })
  run(process.execPath, ['scripts/dev010-n1c-ai-pdm-package.mjs'])
  run('npm.cmd', ['run', 'typecheck:app'])
  run('npm.cmd', ['run', 'build:isolated'])
  process.stdout.write(`${JSON.stringify({ commands, providerExecution: 'NOT_RUN', status: 'PASS' })}\n`)
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
