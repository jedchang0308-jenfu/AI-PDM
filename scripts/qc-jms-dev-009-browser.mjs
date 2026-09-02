#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createConnection } from 'node:net'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import roleCatalog from '../config/access-control/jenfu-role-catalog.v1.json' with { type: 'json' }
import currentPrivilegedWorkspace from '../contracts/jenfu-platform-governance-availability/v2/fixtures/workspace.current-system-admin.json' with { type: 'json' }
import stalePrivilegedWorkspace from '../contracts/jenfu-platform-governance-availability/v2/fixtures/workspace.stale-system-admin.json' with { type: 'json' }
import unavailablePrivilegedWorkspace from '../contracts/jenfu-platform-governance-availability/v2/fixtures/workspace.unavailable.json' with { type: 'json' }
import { chromium } from 'playwright'
import { createTaskOwnedNextTsconfig, getFreePort, removeTaskOwnedWorkspaceTempDir, restoreNextEnv, snapshotNextEnv, startNextApp, stopNextApp, waitForNextAppReady } from './qc-next-app-runner.mjs'

const root = process.cwd()
const runId = `DEV009-S3-${new Date().toISOString().replace(/[:.]/gu, '-')}`
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-pdm-dev009-browser-'))
const dataDir = path.join(taskRoot, 'data')
const repositoryDir = path.join(taskRoot, 'repository')
const evidenceDir = path.resolve(process.env.DEV009_BROWSER_EVIDENCE_DIR ?? path.join(root, 'output', 'qa', 'dev-009', 'browser-real', runId))
const screenshotDir = path.join(evidenceDir, 'screenshots')
const reportPath = path.join(evidenceDir, 'report.json')
const latestPath = path.join(root, 'output', 'qa', 'dev-009', 'browser-real', 'latest.json')
const sourceFiles = [
  'package.json', 'package-lock.json',
  'config/access-control/jenfu-role-catalog.v1.json',
  'contracts/jenfu-platform-governance-availability/v2/contract-manifest.json',
  'contracts/jenfu-platform-governance-availability/v2/fixtures/workspace.current-system-admin.json',
  'contracts/jenfu-platform-governance-availability/v2/fixtures/workspace.stale-system-admin.json',
  'contracts/jenfu-platform-governance-availability/v2/fixtures/workspace.unavailable.json',
  'src/app/api/settings/access/role-capabilities/route.ts',
  'src/components/access-governance/role-capability-settings.tsx',
  'src/lib/ai-pdm-role-capability-contract.ts',
  'src/lib/ai-pdm-role-capability-service.ts',
  'scripts/qc-jms-dev-009-browser.mjs', 'scripts/qc-next-app-runner.mjs',
]
const checks = []
const screenshots = []
const pageErrors = []
const consoleErrors = []
const expectedConsoleErrors = []
const apiRequests = []
const originalEnv = new Map()
const envKeys = ['NODE_ENV', 'PDM_AUTH_MODE', 'PDM_ENABLE_LOCAL_QUICK_LOGIN', 'PDM_DB_PROVIDER', 'PDM_DATA_DIR', 'PDM_REPOSITORY_DIR', 'PDM_RELEASE_MODE', 'ORGMASTER_PUBLIC_BASE_URL', 'PDM_NEXT_DIST_DIR', 'PDM_NEXT_TSCONFIG_PATH']
for (const key of envKeys) originalEnv.set(key, process.env[key])
const nextEnvSnapshot = snapshotNextEnv(root)
let app = null
let browser = null
let browserVersion = null
let port = null
let baseUrl = ''
let nextDistDir = ''
let nextTsconfig = null
let failure = null
let cleanupFailure = null
const cleanup = { browserClosed: false, appStopped: false, portReleased: false, nextEnvRestored: false, nextDistRemoved: false, taskTsconfigRemoved: false, taskFixtureRemoved: false }

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const clone = (value) => JSON.parse(JSON.stringify(value))

function gitValue(args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).stdout.trim()
}

function candidateManifest() {
  const files = sourceFiles.map((relativePath) => {
    const bytes = fs.readFileSync(path.join(root, relativePath))
    return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) }
  })
  return {
    files,
    fileCount: files.length,
    bytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
    sha256: sha256(Buffer.from(files.map((entry) => `${entry.path}\0${entry.sha256}\n`).join(''), 'utf8')),
  }
}

function jsonResponse(body, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'cache-control': 'no-store' } }
}

function normalWorkspace() {
  return {
    contractVersion: 'ai-pdm.role-capability-workspace.v2', applicationId: 'ai-pdm', catalogVersion: roleCatalog.catalogVersion, catalogPayloadHash: roleCatalog.catalogSha256,
    governanceRevision: 'browser-fixture-governance', organizationVersionId: 'browser-fixture-organization', organizationRevision: 'browser-fixture-organization-revision', projectionCursor: 13, selectedRoleId: null,
    roles: roleCatalog.roles.map((catalogRole) => ({
      catalogRole, effectiveHolderCount: 0,
      projection: {
        contractVersion: 'orgmaster.role-capability-projection.v1', applicationId: 'ai-pdm', stableRoleId: catalogRole.stableRoleId,
        role: { stableRoleId: catalogRole.stableRoleId, roleCode: catalogRole.roleCode, displayName: catalogRole.displayName, assignable: catalogRole.assignable, riskLevel: catalogRole.risk, recommendationAllowed: catalogRole.recommendationAllowed },
        governanceRevision: 'browser-fixture-governance', organizationVersionId: 'browser-fixture-organization', organizationRevision: 'browser-fixture-organization-revision', changeCursor: 13,
        adoptionState: 'published', positions: [], manualAssignments: [],
      },
    })),
    dataState: 'current', mutationAllowed: true, sourceDataAt: '2026-09-02T00:05:00.000Z', snapshotStoredAt: null,
    dependency: { status: 'available', decisionCode: 'CURRENT_SOURCE', correlationId: 'browser-fixture' },
  }
}

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

async function capture(page, name) {
  const target = path.join(screenshotDir, `${name}.png`)
  await page.screenshot({ path: target, fullPage: true })
  screenshots.push(path.relative(root, target).replaceAll('\\', '/'))
}

function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

async function assertPrivilegedBoundary(page) {
  const main = page.locator('.access-role-main')
  assert.equal(await page.getByText('尚未採用職位', { exact: true }).count(), 0)
  assert.equal(await main.getByText('職位設定', { exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: /開啟職位設定/u }).count(), 0)
}

async function runScenario({ name, viewport, fixture, responseStatus = 200, task }) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  page.on('pageerror', (error) => pageErrors.push({ scenario: name, message: error.message }))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (responseStatus === 503 && /^Failed to load resource: the server responded with a status of 503 \(Service Unavailable\)$/u.test(text)) {
      expectedConsoleErrors.push({ scenario: name, code: 'ORGMASTER_UNAVAILABLE', text })
    } else consoleErrors.push({ scenario: name, text })
  })
  await page.route('**/api/auth/me', async (route) => {
    apiRequests.push({ scenario: name, method: route.request().method(), path: '/api/auth/me', responseStatus: 200, fixture: 'shell-auth' })
    await route.fulfill(jsonResponse({ user: { id: 'user-dev009-qc', display_name: 'DEV-009 QC', email: 'dev009-qc@example.invalid', role: 'Admin' } }))
  })
  await page.route('**/api/numbering/permissions', async (route) => {
    apiRequests.push({ scenario: name, method: route.request().method(), path: '/api/numbering/permissions', responseStatus: 200, fixture: 'shell-permissions' })
    await route.fulfill(jsonResponse({ generatedAt: '2026-09-02T00:00:00.000Z', pages: {}, actions: {} }))
  })
  await page.route('**/api/settings/access/role-capabilities*', async (route) => {
    const url = new URL(route.request().url())
    const selected = url.searchParams.get('stableRoleId')
    apiRequests.push({ scenario: name, method: route.request().method(), path: `${url.pathname}${url.search}`, responseStatus: selected === 'role-system-admin' ? responseStatus : 200 })
    const body = selected === 'role-system-admin' ? clone(fixture) : normalWorkspace()
    if (selected === 'role-system-admin' && responseStatus >= 400) body.error = 'ORGMASTER_UNAVAILABLE'
    await route.fulfill(jsonResponse(body, selected === 'role-system-admin' ? responseStatus : 200))
  })
  try {
    await page.goto(`${baseUrl}/settings/workflow`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.getByTestId('role-capability-page').waitFor({ state: 'visible', timeout: 30000 })
    assert.equal(await page.getByRole('button', { name: /系統管理員/u }).count(), 1)
    await page.getByRole('button', { name: /系統管理員/u }).click()
    await page.getByTestId('privileged-role-capability').waitFor({ state: 'visible', timeout: 30000 })
    await assertPrivilegedBoundary(page)
    await task(page)
    assert.equal(await noHorizontalOverflow(page), true)
    await capture(page, name)
  } finally {
    await context.close()
  }
}

async function runBrowserChecks() {
  port = await getFreePort()
  baseUrl = `http://127.0.0.1:${port}`
  nextDistDir = `.tmp/qc-jms-dev-009-browser-${port}`
  nextTsconfig = createTaskOwnedNextTsconfig(root, `dev009-${port}`, nextDistDir)
  Object.assign(process.env, {
    NODE_ENV: 'development', PDM_AUTH_MODE: 'demo', PDM_ENABLE_LOCAL_QUICK_LOGIN: 'true', PDM_DB_PROVIDER: 'sqlite',
    PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, PDM_RELEASE_MODE: 'local_stub', ORGMASTER_PUBLIC_BASE_URL: 'http://localhost:5000',
    PDM_NEXT_DIST_DIR: nextDistDir, PDM_NEXT_TSCONFIG_PATH: nextTsconfig.relativePath,
  })
  fs.mkdirSync(screenshotDir, { recursive: true })
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root, purpose: 'DEV-009 S3 multi-viewport real Chromium role capability degradation flow', port,
    owningProcessTree: `runner ${process.pid} -> task-owned Next.js child`,
    cleanupCondition: 'browser closed, exact Next.js child stopped, port released, task fixture, isolated Next dist and tsconfig removed',
    dataDir, repositoryDir, primaryWrites: false,
  } }))
  app = startNextApp(root, 'dev', port)
  await waitForNextAppReady(baseUrl, app.getOutput, 120000)
  browser = await chromium.launch({ headless: true })
  browserVersion = browser.version()

  await runScenario({ name: '01-1440-current', viewport: { width: 1440, height: 1000 }, fixture: currentPrivilegedWorkspace, task: async (page) => {
    const privilegedText = await page.getByTestId('privileged-role-capability').innerText()
    assert.match(privilegedText, /由 OrgMaster 管理/u)
    assert.match(privilegedText, /特權身分 1 個/u)
    assert.match(privilegedText, /privileged•••A7/u)
    assert.equal(await page.getByRole('link', { name: '前往 OrgMaster 角色指派' }).getAttribute('href'), 'http://localhost:5000/?panels=governance&focus=governance&details=none&governanceSection=assignments')
    checks.push({ id: 'QA-009-S3-01', label: '1440 current system_admin is OrgMaster-managed, redacted and read-only', status: 'PASS', viewport: '1440x1000' })
    await page.getByRole('button', { name: /研發人員/u }).click()
    await page.getByTestId('privileged-role-capability').waitFor({ state: 'hidden', timeout: 30000 })
    const ordinaryEmptyState = page.locator('.access-role-main').getByText('尚未採用職位', { exact: true })
    await ordinaryEmptyState.waitFor({ state: 'visible', timeout: 30000 })
    assert.equal(await ordinaryEmptyState.count(), 1)
    checks.push({ id: 'QA-009-S3-02', label: 'switching back restores ordinary Position projection boundary', status: 'PASS', viewport: '1440x1000' })
  } })

  for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await runScenario({ name: `current-${viewport.width}`, viewport, fixture: currentPrivilegedWorkspace, task: async (page) => {
      assert.equal(await page.getByRole('link', { name: '前往 OrgMaster 角色指派' }).count(), 1)
      assert.match(await page.getByTestId('privileged-role-capability').innerText(), /特權身分 1 個/u)
      checks.push({ id: `QA-009-S3-${viewport.width === 1024 ? '03' : '04'}`, label: `${viewport.width} viewport preserves privileged read-only boundary without overflow`, status: 'PASS', viewport: `${viewport.width}x${viewport.height}` })
    } })
  }

  await runScenario({ name: '05-stale-snapshot', viewport: { width: 1440, height: 1000 }, fixture: stalePrivilegedWorkspace, task: async (page) => {
    const text = await page.getByTestId('privileged-role-capability').innerText()
    assert.match(text, /最後成功快照/u)
    assert.match(text, /資料時間：2026-09-02T00:05:00.000Z/u)
    assert.match(text, /目前僅可查看，無法修改/u)
    assert.match(text, /privileged•••A7/u)
    checks.push({ id: 'QA-009-S3-05', label: 'stale snapshot remains visible with explicit authority data time and read-only state', status: 'PASS', viewport: '1440x1000' })
  } })

  await runScenario({ name: '06-unavailable', viewport: { width: 1440, height: 1000 }, fixture: unavailablePrivilegedWorkspace, responseStatus: 503, task: async (page) => {
    const text = await page.getByTestId('privileged-role-capability').innerText()
    assert.match(text, /OrgMaster 目前無法使用/u)
    assert.match(text, /不以快照授權/u)
    assert.equal(await page.getByRole('button', { name: /儲存|發布|修改/u }).count(), 0)
    checks.push({ id: 'QA-009-S3-06', label: 'OrgMaster unavailable fails closed without privileged mutation controls', status: 'PASS', viewport: '1440x1000' })
  } })

  const invalidNavigation = clone(currentPrivilegedWorkspace)
  delete invalidNavigation.managementSurface
  await runScenario({ name: '07-invalid-navigation-base', viewport: { width: 1440, height: 1000 }, fixture: invalidNavigation, task: async (page) => {
    assert.equal(await page.getByRole('link', { name: '前往 OrgMaster 角色指派' }).count(), 0)
    assert.match(await page.getByTestId('privileged-role-capability').innerText(), /請從 OrgMaster 開啟角色治理 → 角色指派/u)
    checks.push({ id: 'QA-009-S3-07', label: 'missing trusted navigation surface falls back to safe guidance without a link', status: 'PASS', viewport: '1440x1000' })
  } })

  assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.map((entry) => `${entry.scenario}: ${entry.message}`).join(' | ')}`)
  assert.equal(consoleErrors.length, 0, `console errors: ${consoleErrors.map((entry) => `${entry.scenario}: ${entry.text}`).join(' | ')}`)
}

try {
  await runBrowserChecks()
} catch (error) {
  failure = error instanceof Error ? error : new Error(String(error))
  checks.push({ id: 'QA-009-S3-FAILURE', label: 'browser runtime', status: 'FAIL', error: failure.message })
} finally {
  await browser?.close().then(() => { cleanup.browserClosed = true }).catch((error) => { cleanupFailure ??= error instanceof Error ? error : new Error(String(error)) })
  if (!browser) cleanup.browserClosed = true
  if (app?.child) {
    await stopNextApp(app.child).then(() => { cleanup.appStopped = true }).catch((error) => { cleanupFailure ??= error instanceof Error ? error : new Error(String(error)) })
  } else cleanup.appStopped = true
  const restored = await restoreNextEnv(nextEnvSnapshot)
  cleanup.nextEnvRestored = restored.restored
  if (!restored.restored) cleanupFailure ??= new Error(`next-env restore failed: ${restored.error ?? 'unknown'}`)
  if (nextDistDir) {
    const removed = removeTaskOwnedWorkspaceTempDir(root, nextDistDir)
    cleanup.nextDistRemoved = removed.removed
    if (!removed.removed) cleanupFailure ??= new Error(`isolated Next dist cleanup failed: ${removed.path}`)
  } else cleanup.nextDistRemoved = true
  if (nextTsconfig?.absolutePath) {
    try { fs.rmSync(nextTsconfig.absolutePath, { force: true }); cleanup.taskTsconfigRemoved = !fs.existsSync(nextTsconfig.absolutePath) } catch (error) { cleanupFailure ??= error instanceof Error ? error : new Error(String(error)) }
  } else cleanup.taskTsconfigRemoved = true
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  cleanup.portReleased = port ? await portReleased(port) : true
  if (!cleanup.portReleased) cleanupFailure ??= new Error(`task-owned port not released: ${port}`)
  try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); cleanup.taskFixtureRemoved = !fs.existsSync(taskRoot) } catch (error) { cleanupFailure ??= error instanceof Error ? error : new Error(String(error)) }
}

const candidate = candidateManifest()
const status = !failure && !cleanupFailure && checks.every((check) => check.status === 'PASS') && Object.values(cleanup).every(Boolean) ? 'PASS' : 'FAIL'
const report = {
  runner: 'DEV-009-S3-browser', status, execution: 'task-owned-next-dev-real-chromium', generatedAt: new Date().toISOString(),
  source: { gitHead: gitValue(['rev-parse', 'HEAD']), branch: gitValue(['rev-parse', '--abbrev-ref', 'HEAD']), dirtyFiles: gitValue(['status', '--short']).split(/\r?\n/u).filter(Boolean), candidate },
  browser: { name: 'chromium', version: browserVersion },
  runtime: { project: root, port, baseUrl, primaryWrites: false, primaryPortsTouched: [], cleanup },
  route: '/settings/workflow', viewports: ['1440x1000', '1024x768', '390x844'], checks, screenshots, apiRequests, pageErrors, consoleErrors, expectedConsoleErrors,
  failure: failure?.message ?? cleanupFailure?.message ?? null,
}
fs.mkdirSync(evidenceDir, { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const reportBytes = fs.readFileSync(reportPath)
fs.mkdirSync(path.dirname(latestPath), { recursive: true })
fs.writeFileSync(latestPath, `${JSON.stringify({
  status, reportPath: path.relative(root, reportPath).replaceAll('\\', '/'), reportSha256: sha256(reportBytes),
  candidateSha256: candidate.sha256, generatedAt: report.generatedAt,
}, null, 2)}\n`, 'utf8')
if (status !== 'PASS') {
  console.error(`DEV009_BROWSER_FAILED evidence=${reportPath} error=${report.failure}`)
  process.exitCode = 1
} else {
  console.log(`DEV009_BROWSER_OK execution=${report.execution} checks=${checks.length} evidence=${reportPath}`)
}
