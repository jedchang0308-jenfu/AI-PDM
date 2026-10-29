import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { LocalSandboxError, isLoopbackHost, requireLoopbackOrigin } from '../../../contracts/local-principal-sandbox/v1/protocol.mjs'

const execute = promisify(execFile)
const fail = () => { throw new LocalSandboxError('local_listener_unverified', 503) }
const validPid = value => Number.isSafeInteger(value) && value > 0

/** Admit only sockets owned by this Node process or its verified Node ancestor.
 * Next development workers can inherit the listener from their parent process.
 * No Host header, environment flag or launcher claim substitutes for OS state.
 */
export function validateLocalListenerSnapshot(snapshot, { port, processId, executablePath }) {
  if (!snapshot || !Array.isArray(snapshot.listeners) || !snapshot.listeners.length || snapshot.listeners.length > 8 ||
    !Number.isSafeInteger(port) || port < 1 || port > 65535 || !validPid(processId) ||
    typeof executablePath !== 'string' || !executablePath) fail()
  const normalize = value => typeof value === 'string' ? value.replaceAll('/', '\\').toLowerCase() : ''
  // The continuously running Node process cannot have its own PID recycled.
  // For its own socket no external process ancestry/fingerprint is necessary.
  if (snapshot.currentProcess) {
    if (snapshot.currentProcess.pid !== processId || normalize(snapshot.currentProcess.executablePath) !== normalize(executablePath) ||
      snapshot.listeners.some(listener => listener.pid !== processId || listener.port !== port || !isLoopbackHost(listener.address))) fail()
    return snapshot.listeners[0].address
  }
  if (!Array.isArray(snapshot.ancestors) || !snapshot.ancestors.length || snapshot.ancestors.length > 9) fail()
  const ancestors = new Map()
  for (let index = 0; index < snapshot.ancestors.length; index++) {
    const current = snapshot.ancestors[index]
    if (!validPid(current.pid) || !validPid(current.parentPid) || ancestors.has(current.pid) ||
      !/^[1-9][0-9]{0,19}$/.test(current.startToken) || current.startToken !== current.endToken ||
      normalize(current.executablePath) !== normalize(executablePath) ||
      (index === 0 ? current.pid !== processId : snapshot.ancestors[index - 1].parentPid !== current.pid ||
        BigInt(current.startToken) > BigInt(snapshot.ancestors[index - 1].startToken))) fail()
    ancestors.set(current.pid, current)
  }
  for (const listener of snapshot.listeners) {
    if (listener.port !== port || !isLoopbackHost(listener.address) || !ancestors.has(listener.pid)) fail()
  }
  return snapshot.listeners[0].address
}

export function parseWindowsTcpListeners(output, port) {
  if (typeof output !== 'string' || Buffer.byteLength(output) > 2 * 1024 * 1024 ||
    !Number.isSafeInteger(port) || port < 1 || port > 65535) fail()
  const listeners = []
  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/)
    if (columns.length !== 5 || columns[0] !== 'TCP' || columns[3] !== 'LISTENING') continue
    const address = /^(?:\[([^\]]+)\]|([^:]+)):(\d+)$/.exec(columns[1])
    if (!address || Number(address[3]) !== port) continue
    const pid = Number(columns[4])
    if (!validPid(pid) || listeners.length >= 8) fail()
    listeners.push({ address: address[1] ?? address[2], port, pid })
  }
  if (!listeners.length) fail()
  return listeners
}

export async function readWindowsLocalListenerSnapshot(port, processId = process.pid) {
  if (process.platform !== 'win32' || !Number.isSafeInteger(port) || port < 1 || port > 65535 || !validPid(processId)) fail()
  let listeners
  try {
    const { stdout } = await execute('netstat.exe', ['-ano', '-p', 'tcp'], {
      encoding: 'utf8', windowsHide: true, timeout: 5000, maxBuffer: 2 * 1024 * 1024,
    })
    listeners = parseWindowsTcpListeners(stdout, port)
  } catch { fail() }
  if (processId === process.pid && listeners.every(listener => listener.pid === process.pid)) {
    return { listeners, currentProcess: { pid: process.pid, executablePath: process.execPath } }
  }
  const encodedListeners = Buffer.from(JSON.stringify(listeners), 'utf8').toString('base64')
  // Only validated numeric values enter the PowerShell program. It does not
  // print command lines, environment variables, credentials or arbitrary paths.
  const script = `
$ErrorActionPreference = 'Stop'
$listeners = @([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedListeners}')) | ConvertFrom-Json)
if ($listeners.Count -lt 1 -or $listeners.Count -gt 8) { throw 'LOCAL_LISTENER_UNVERIFIED' }
$ancestors = @()
$cursor = ${processId}
$selected = [Collections.Generic.HashSet[int]]::new()
for ($depth = 0; $cursor -gt 0 -and $depth -lt 9; $depth++) {
  if (-not $selected.Add($cursor)) { throw 'LOCAL_PROCESS_CYCLE' }
  $before = Get-Process -Id $cursor -ErrorAction Stop
  $start = $before.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()
  $native = Get-CimInstance Win32_Process -Filter ("ProcessId = " + [int]$cursor) -ErrorAction Stop
  $after = Get-Process -Id $cursor -ErrorAction Stop
  if (-not $native -or $after.HasExited) { throw 'LOCAL_PROCESS_CHANGED' }
  $ancestors += [ordered]@{pid=[int]$cursor; parentPid=[int]$native.ParentProcessId;
    startToken=$start; endToken=$after.StartTime.ToUniversalTime().ToFileTimeUtc().ToString(); executablePath=[string]$after.Path}
  if (@($listeners | Where-Object { $_.pid -eq $cursor }).Count -gt 0) { break }
  $cursor = [int]$native.ParentProcessId
}
ConvertTo-Json -InputObject ([ordered]@{listeners=$listeners; ancestors=$ancestors}) -Depth 5 -Compress
`
  try {
    const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8', windowsHide: true, timeout: 8000, maxBuffer: 32 * 1024,
    })
    return JSON.parse(stdout)
  } catch { fail() }
}

export function createLocalListenerVerifier({ readSnapshot = readWindowsLocalListenerSnapshot,
  processId = process.pid, executablePath = process.execPath } = {}) {
  // Coalesce concurrent requests only; never reuse a completed observation after
  // a port rebind, and never establish liveness from a cached receipt.
  const pending = new Map()
  return async config => {
    requireLoopbackOrigin(config.origin)
    const url = new URL(config.origin), port = Number(url.port || (url.protocol === 'https:' ? 443 : 80))
    if (!pending.has(port)) {
      const observation = Promise.resolve().then(() => readSnapshot(port, processId))
        .then(snapshot => validateLocalListenerSnapshot(snapshot, { port, processId, executablePath }))
        .catch(() => fail()).finally(() => pending.delete(port))
      pending.set(port, observation)
    }
    return pending.get(port)
  }
}
