import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()

export function checkEnvironmentFingerprint(environment) {
  // Tool tracing changes for every invocation, including an otherwise identical
  // resumed shell. Keep all actual execution inputs (including TEMP/LOCALAPPDATA).
  return hash(Object.entries(environment).filter(([name]) => name !== 'CODEX_TOOL_CALL_ID').sort(([a], [b]) => a.localeCompare(b)))
}

export function localCheckContext(root, environment = process.env) {
  // A cached local PASS is not provider evidence. CI/owner workflows never read it.
  if (environment.CI || environment.GITHUB_ACTIONS) return null
  try {
    if (git(root, ['status', '--porcelain=v1', '--untracked-files=all'])) return null
    let dependencyLock = null
    for (let directory = root; ; directory = path.dirname(directory)) {
      const candidate = path.join(directory, 'node_modules', '.package-lock.json')
      if (fs.existsSync(candidate)) { dependencyLock = hash(fs.readFileSync(candidate)); break }
      if (directory === path.dirname(directory)) break
    }
    if (!dependencyLock) return null
    const sparsePath = git(root, ['rev-parse', '--git-path', 'info/sparse-checkout'])
    const sparse = fs.existsSync(path.resolve(root, sparsePath)) ? hash(fs.readFileSync(path.resolve(root, sparsePath))) : null
    return { revision: git(root, ['rev-parse', 'HEAD']), tree: git(root, ['rev-parse', 'HEAD^{tree}']),
      platform: os.platform(), arch: os.arch(), node: process.version, executable: process.execPath, root,
      dependencyLock, sparse, environmentSha256: checkEnvironmentFingerprint(environment) }
  } catch { return null }
}

export function fullContinuousGroups(script) {
  const command = typeof script === 'string' ? script.replace(/^node scripts\/dev117-test-environment\.mjs && /u, '') : ''
  if (!/^node --test (?:scripts\/[A-Za-z0-9_./-]+\.test\.mjs)(?: scripts\/[A-Za-z0-9_./-]+\.test\.mjs)*$/u.test(command)) throw new Error('PRODUCTION_SLICE_FULL_COMMAND_INVALID')
  return [...new Set(command.slice('node --test '.length).split(' '))].map(file => ({ name: `full:${file}`, tests: [file] }))
}

// Each group is persisted immediately, including failure. No mutable "PASS" file
// or overwrite: an interruption can lose only its currently unfinished group.
export function summarizeCheckResults(results) {
  const failures = results.filter(row => row.status === 'FAIL')
  const blocked = results.filter(row => !['PASS', 'REUSED', 'FAIL'].includes(row.status))
  const firstFailure = failures[0] ?? null
  return { result: firstFailure ? 'FAIL' : blocked.length ? 'BLOCKED' : 'PASS', firstFailure,
    failures, blocked, exitCode: firstFailure ? (Number.isInteger(firstFailure.exitCode) && firstFailure.exitCode > 0 ? firstFailure.exitCode : 1) : blocked.length ? 2 : 0 }
}

export function runCheckpointedGroups({ groups, execute, context, directory, reuse = true, now = Date.now, onResult = () => {}, preflight = () => null }) {
  // Validate the entire dependency order before executing even the first group.
  if (!Array.isArray(groups) || groups.length === 0) throw new Error('PRODUCTION_SLICE_DEPENDENCY_INVALID')
  const names = new Set()
  for (const group of groups) {
    if (!group.name || names.has(group.name) || !Array.isArray(group.dependsOn ?? []) ||
      (group.dependsOn ?? []).some(name => !names.has(name))) throw new Error('PRODUCTION_SLICE_DEPENDENCY_INVALID')
    names.add(group.name)
  }
  fs.mkdirSync(directory, { recursive: true })
  const results = []
  for (const group of groups) {
    const before = context()
    const key = hash({ group, context: before })
    const blockedBy = (group.dependsOn ?? []).filter(name => !['PASS', 'REUSED'].includes(results.find(row => row.name === name)?.status))
    let admission
    try { admission = blockedBy.length ? { status: 'BLOCKED', reason: 'DEPENDENCY_FAILED', blockedBy } : preflight(group) }
    catch { admission = { status: 'BLOCKED', reason: 'PREFLIGHT_ERROR' } }
    if (admission && admission.status !== 'BLOCKED') admission = { status: 'BLOCKED', reason: 'PREFLIGHT_INVALID' }
    let previous = null, previousFile = null
    if (!admission && reuse && before) {
      const candidates = fs.readdirSync(directory).filter(file => file.startsWith(`${key}-`) && file.endsWith('.json')).map(file => {
        let record = null
        try { record = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) } catch {}
        return { file, record, timestamp: Number(file.slice(key.length + 1).split('-')[0]) }
      }).sort((a, b) => b.timestamp - a.timestamp || Number(a.record?.status === 'PASS') - Number(b.record?.status === 'PASS'))
      for (const { file, record } of candidates) {
        try {
          const { checksum, ...core } = record
          const age = now() - record.completedAt
          if (checksum === hash(core) && record.key === key && record.status === 'PASS' && record.releaseAuthority === false && age >= 0 && age < 24 * 60 * 60 * 1000 && hash(record.context) === hash(before) && hash(record.group) === hash(group)) { previous = record; previousFile = file }
        } catch { /* incomplete, old or corrupt evidence is not reusable */ }
        // The newest failed/corrupt observation invalidates an older PASS.
        break
      }
    }
    if (previous) {
      const result = { name: group.name, status: 'REUSED', evidence: path.join(directory, previousFile) }
      results.push(result); onResult(result); continue
    }
    let result
    try { result = admission ?? execute(group) } catch { result = { status: 'FAIL', exitCode: 1, reason: 'EXECUTION_ERROR' } }
    const after = context()
    const stable = before && after && hash(before) === hash(after)
    const core = { schemaVersion: 'aipdm.local-checkpoint.v1', key, group, context: stable ? before : null,
      completedAt: now(), status: result?.status === 'BLOCKED' ? 'BLOCKED' : result?.status === 'PASS' && (result.exitCode === undefined || result.exitCode === 0) ? 'PASS' : 'FAIL', exitCode: result?.exitCode ?? null,
      ...(result?.reason ? { reason: result.reason } : {}), ...(result?.blockedBy ? { blockedBy: result.blockedBy } : {}),
      releaseAuthority: false, scope: 'LOCAL_CHECK_ONLY' }
    const file = path.join(directory, `${key}-${core.completedAt}-${randomUUID()}.json`)
    fs.writeFileSync(file, `${JSON.stringify({ ...core, checksum: hash(core) }, null, 2)}\n`, { flag: 'wx' })
    const saved = { name: group.name, status: core.status, exitCode: core.exitCode, evidence: file,
      ...(core.reason ? { reason: core.reason } : {}), ...(core.blockedBy ? { blockedBy: core.blockedBy } : {}) }
    results.push(saved); onResult(saved)
  }
  return results
}
