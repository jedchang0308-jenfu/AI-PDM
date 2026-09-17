import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export function resolvePortableInvocation(command, args, {
  platform = process.platform,
  searchPath = process.env.PATH ?? process.env.Path ?? '',
  fileExists = fs.existsSync,
} = {}) {
  if (platform !== 'win32' || command !== 'gcloud') return { command, args }
  const gcloudScript = searchPath
    .split(';')
    .map((entry) => entry.trim().replace(/^"|"$/gu, ''))
    .filter(Boolean)
    .map((entry) => path.win32.join(entry, 'gcloud.ps1'))
    .find((candidate) => fileExists(candidate))
  if (!gcloudScript) throw new Error('DEV013_GCLOUD_WINDOWS_SHIM_NOT_FOUND')
  return {
    command: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', gcloudScript, ...args],
  }
}

export function spawnPortableSync(command, args, options = {}, dependencies = {}) {
  const invocation = resolvePortableInvocation(command, args, dependencies)
  const spawn = dependencies.spawnSync ?? spawnSync
  const result = spawn(invocation.command, invocation.args, options)
  if (result?.error && !result.stderr) return { ...result, stderr: result.error.message }
  return result
}
