#!/usr/bin/env node

import fs from 'node:fs'
import { createConnection } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import {
  createTaskOwnedNextTsconfig,
  getFreePort,
  removeTaskOwnedWorkspaceTempDir,
  restoreNextEnv,
  snapshotNextEnv,
  startNextApp,
  stopNextApp,
  waitForNextAppReady,
} from './qc-next-app-runner.mjs'

const root = process.cwd()
const providedBaseUrl = process.env.DEV008_BROWSER_BASE_URL?.replace(/\/$/u, '')
const originalEnv = new Map()
const envKeys = ['NODE_ENV', 'PDM_AUTH_MODE', 'PDM_ENABLE_LOCAL_QUICK_LOGIN', 'PDM_DB_PROVIDER', 'PDM_DATA_DIR', 'PDM_REPOSITORY_DIR', 'PDM_RELEASE_MODE', 'PDM_NEXT_DIST_DIR', 'PDM_NEXT_TSCONFIG_PATH']
for (const key of envKeys) originalEnv.set(key, process.env[key])

let app = null
let port = null
let taskRoot = null
let nextDistDir = null
let nextTsconfig = null
let nextEnvSnapshot = null
let baseUrl = providedBaseUrl

async function portReleased(checkPort) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const released = await new Promise((resolve) => {
      const socket = createConnection({ host: '127.0.0.1', port: checkPort })
      socket.once('connect', () => { socket.destroy(); resolve(false) })
      socket.once('error', () => resolve(true))
      socket.setTimeout(1000, () => { socket.destroy(); resolve(true) })
    })
    if (released) return true
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  return false
}

try {
  if (!baseUrl) {
    port = await getFreePort()
    baseUrl = `http://127.0.0.1:${port}`
    taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-pdm-dev008-browser-'))
    nextDistDir = `.tmp/qc-jms-dev-008-browser-${port}`
    nextTsconfig = createTaskOwnedNextTsconfig(root, `dev008-${port}`, nextDistDir)
    nextEnvSnapshot = snapshotNextEnv(root)
    Object.assign(process.env, {
      NODE_ENV: 'development',
      PDM_AUTH_MODE: 'demo',
      PDM_ENABLE_LOCAL_QUICK_LOGIN: 'true',
      PDM_DB_PROVIDER: 'sqlite',
      PDM_DATA_DIR: path.join(taskRoot, 'data'),
      PDM_REPOSITORY_DIR: path.join(taskRoot, 'repository'),
      PDM_RELEASE_MODE: 'local_stub',
      PDM_NEXT_DIST_DIR: nextDistDir,
      PDM_NEXT_TSCONFIG_PATH: nextTsconfig.relativePath,
    })
    console.log(JSON.stringify({ runtimeDeclaration: {
      project: root,
      purpose: 'DEV-008 settings workflow route verification',
      port,
      owningProcessTree: `runner ${process.pid} -> task-owned Next.js child`,
      cleanupCondition: 'exact Next.js child stopped, port released, task fixture, isolated Next dist and tsconfig removed',
      primaryWrites: false,
    } }))
    app = startNextApp(root, 'dev', port)
    await waitForNextAppReady(baseUrl, app.getOutput, 120000)
  }

  const response = await fetch(`${baseUrl}/settings/workflow`, { redirect: 'manual' })
  if (![200, 307, 308].includes(response.status)) throw new Error(`DEV008_BROWSER_ROUTE_FAILED:${response.status}`)
  console.log(`DEV008_BROWSER_ROUTE_OK url=${baseUrl}/settings/workflow status=${response.status} mutationBoundary=server`)
} finally {
  if (app?.child) await stopNextApp(app.child)
  if (nextEnvSnapshot) {
    const restored = await restoreNextEnv(nextEnvSnapshot)
    if (!restored.restored) throw new Error(`DEV008_NEXT_ENV_RESTORE_FAILED:${restored.error ?? 'unknown'}`)
  }
  if (nextDistDir) {
    const removed = removeTaskOwnedWorkspaceTempDir(root, nextDistDir)
    if (!removed.removed) throw new Error(`DEV008_NEXT_DIST_CLEANUP_FAILED:${removed.path}`)
  }
  if (nextTsconfig?.absolutePath) fs.rmSync(nextTsconfig.absolutePath, { force: true })
  if (taskRoot) fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 })
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  if (port && !(await portReleased(port))) throw new Error(`DEV008_TASK_PORT_NOT_RELEASED:${port}`)
}
