import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLocalListenerVerifier, parseWindowsTcpListeners, validateLocalListenerSnapshot } from '../src/lib/auth/local-sandbox-listener.mjs'

const expected = { port: 12020, processId: 120, executablePath: 'C:\\node\\node.exe' }
const snapshot = () => ({ listeners: [{ address: '127.0.0.1', port: 12020, pid: 110 }], ancestors: [
  { pid: 120, parentPid: 110, startToken: '300', endToken: '300', executablePath: expected.executablePath },
  { pid: 110, parentPid: 100, startToken: '200', endToken: '200', executablePath: expected.executablePath },
] })
const rejects = mutate => { const data = snapshot(); mutate(data); assert.throws(() => validateLocalListenerSnapshot(data, expected), /local_listener_unverified/) }

test('an OS-observed loopback socket may belong to the current Next worker or its unchanged Node parent', () => {
  assert.equal(validateLocalListenerSnapshot(snapshot(), expected), '127.0.0.1')
  const data = snapshot(); data.listeners[0].pid = 120; data.listeners[0].address = '::1'
  assert.equal(validateLocalListenerSnapshot(data, expected), '::1')
})

test('native netstat parser selects only the exact TCP listening port and preserves all its owners', () => {
  const raw = 'Active Connections\r\n Proto Local Address Foreign Address State PID\r\n' +
    ' TCP 127.0.0.1:12020 0.0.0.0:0 LISTENING 120\r\n TCP [::1]:12020 [::]:0 LISTENING 120\r\n' +
    ' TCP 10.0.0.1:12020 10.0.0.2:5555 ESTABLISHED 999\r\n TCP 0.0.0.0:12021 0.0.0.0:0 LISTENING 998'
  assert.deepEqual(parseWindowsTcpListeners(raw, 12020), [
    { address: '127.0.0.1', port: 12020, pid: 120 }, { address: '::1', port: 12020, pid: 120 },
  ])
  assert.throws(() => parseWindowsTcpListeners(raw, 13000), /local_listener_unverified/)
})

test('a socket owned by the continuously running process needs no fabricated start fingerprint', () => {
  const data = { listeners: [{ address: '127.0.0.1', port: 12020, pid: 120 }],
    currentProcess: { pid: 120, executablePath: expected.executablePath } }
  assert.equal(validateLocalListenerSnapshot(data, expected), '127.0.0.1')
  data.listeners[0].pid = 110
  assert.throws(() => validateLocalListenerSnapshot(data, expected), /local_listener_unverified/)
})

test('wildcard, remote, foreign PID, wrong port and mixed loopback/wildcard listeners fail closed', () => {
  rejects(data => { data.listeners[0].address = '0.0.0.0' })
  rejects(data => { data.listeners[0].address = '::' })
  rejects(data => { data.listeners[0].address = '192.168.1.10' })
  rejects(data => { data.listeners[0].pid = 999 })
  rejects(data => { data.listeners[0].port = 1000 })
  rejects(data => { data.listeners.push({ address: '::', port: 12020, pid: 110 }) })
})

test('PID reuse, ancestry cycles, time inversion, different executable and unbounded results are rejected', () => {
  rejects(data => { data.ancestors[1].endToken = '201' })
  rejects(data => { data.ancestors[1].pid = 120 })
  rejects(data => { data.ancestors[1].startToken = '400'; data.ancestors[1].endToken = '400' })
  rejects(data => { data.ancestors[1].executablePath = 'C:\\elsewhere\\node.exe' })
  rejects(data => { data.ancestors[0].parentPid = 111 })
  rejects(data => { data.listeners = Array(9).fill(data.listeners[0]) })
})

test('concurrent checks coalesce; every subsequent observation rechecks a possible rebind', async () => {
  let calls = 0, release
  const config = { origin: 'http://localhost:12020' }
  const check = createLocalListenerVerifier({ ...expected, readSnapshot: async () => {
    calls++; if (calls === 1) await new Promise(resolve => { release = resolve }); return snapshot()
  } })
  const a = check(config), b = check(config)
  await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 1); release()
  assert.deepEqual(await Promise.all([a, b]), ['127.0.0.1', '127.0.0.1'])
  await check(config); assert.equal(calls, 2)
})
