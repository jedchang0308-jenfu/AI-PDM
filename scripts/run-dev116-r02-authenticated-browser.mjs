#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { canonicalize, sha256 } from './lib/dev116-r02-receipt.mjs'
import {
  assertPreflightMatchesCandidate,
  buildDev116R02BrowserObservation,
  parseDev116R02BrowserArgs,
  readDev116R02Credentials,
} from './lib/dev116-r02-browser-executor.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function readJson(target) {
  return JSON.parse(fs.readFileSync(target, 'utf8'))
}

function safePath(url) {
  try {
    return new URL(url).pathname
  } catch {
    return 'invalid-url'
  }
}

function requireCreatedBundle(body) {
  const ids = [body?.root?.id, body?.partNumber?.id, body?.drawingNumber?.id]
  const codes = [body?.root?.rootCode, body?.partNumber?.partNumber, body?.drawingNumber?.drawingNumber]
  if (ids.some((item) => typeof item !== 'string' || item.length < 3)
    || codes.some((item) => typeof item !== 'string' || item.length < 3)
    || new Set(ids).size !== 3 || new Set(codes).size !== 3) throw new Error('DEV116_R02_CREATE_RESPONSE_INVALID')
  if (body?.pdmCompany?.companyId !== 'company-smoke'
    || body?.pdmCompany?.companyCode !== 'SMOKE'
    || body?.pdmCompany?.companyKind !== 'production_smoke') throw new Error('DEV116_R02_CREATE_COMPANY_INVALID')
  return { ids, codes }
}

async function run() {
  const options = parseDev116R02BrowserArgs(process.argv.slice(2), { root })
  const { candidate } = assertPreflightMatchesCandidate(readJson(options.preflightPath), readJson(options.candidateContextPath))
  const credentials = readDev116R02Credentials(process.env)
  const browserErrors = []
  const failedResponses = []
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    page.on('pageerror', (error) => browserErrors.push({ kind: 'pageerror', message: error.message.slice(0, 300) }))
    page.on('console', (event) => {
      if (event.type() === 'error') browserErrors.push({ kind: 'console', message: event.text().slice(0, 300) })
    })
    page.on('response', (response) => {
      if (response.status() >= 500) failedResponses.push({ status: response.status(), path: safePath(response.url()) })
    })

    const baseUrl = candidate.candidate.baseUrl
    await page.goto(`${baseUrl}/login?returnTo=${encodeURIComponent('/numbering/drawings')}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.getByLabel('公司電子郵件或工號').fill(credentials.identifier)
    await page.getByLabel('密碼').fill(credentials.password)
    await page.getByRole('button', { name: '登入', exact: true }).click()
    await page.waitForURL((url) => url.origin === baseUrl && url.pathname === '/numbering/drawings', { timeout: 45_000 })
    await page.getByRole('heading', { name: '圖號工作台' }).waitFor({ state: 'visible', timeout: 30_000 })
    const indicator = page.getByTestId('production-smoke-tenant-indicator')
    await indicator.waitFor({ state: 'visible', timeout: 30_000 })
    if ((await indicator.textContent())?.trim() !== '驗證租戶') throw new Error('DEV116_R02_SMOKE_INDICATOR_INVALID')
    if (await page.getByRole('option', { name: /鉦富|久方|JENFU|MAXIMA/u }).count()) throw new Error('DEV116_R02_BUSINESS_TENANT_OPTION_VISIBLE')

    await page.getByRole('link', { name: '建立編號', exact: true }).first().click()
    await page.waitForURL((url) => url.origin === baseUrl && url.pathname === '/numbering/create', { timeout: 30_000 })
    const marker = `${candidate.releaseId.replace(/[^A-Za-z0-9]/gu, '').slice(-12)}-${candidate.candidate.cloudRunRevision.slice(-12)}-${Date.now().toString(36)}`
    const displayName = `R02正式候選驗證件 ${marker}`
    await page.getByLabel('主要名詞').fill(displayName)
    await page.getByLabel('確定品名').fill(displayName)
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return response.request().method() === 'POST' && url.origin === baseUrl && url.pathname === '/api/numbering/records'
    }, { timeout: 30_000 })
    await page.getByRole('button', { name: '建立編號', exact: true }).click()
    const createResponse = await responsePromise
    const createBody = await createResponse.json().catch(() => null)
    if (createResponse.status() !== 201) throw new Error(`DEV116_R02_CREATE_HTTP_${createResponse.status()}`)
    const bundle = requireCreatedBundle(createBody)
    await page.getByRole('heading', { name: '編號已建立' }).waitFor({ state: 'visible', timeout: 30_000 })
    await page.getByRole('link', { name: '查看建立結果' }).click()
    await page.waitForURL((url) => url.origin === baseUrl && url.pathname === '/numbering/drawings', { timeout: 30_000 })
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.getByText(bundle.codes[2], { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.goto(`${baseUrl}/numbering/search?query=${encodeURIComponent(bundle.codes[0])}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.getByText(bundle.codes[0], { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.screenshot({ path: options.screenshotPath, fullPage: true })
    if (browserErrors.length || failedResponses.length) throw new Error('DEV116_R02_BROWSER_RUNTIME_ERROR')

    const reloadReadbackSha256 = sha256(canonicalize({ companyId: 'company-smoke', objectIds: bundle.ids, codes: bundle.codes }))
    const observation = buildDev116R02BrowserObservation({
      releaseId: candidate.releaseId,
      observedAt: new Date().toISOString(),
      sourceLockSha256: candidate.sourceLockSha256,
      candidate: candidate.candidate,
      target: candidate.target,
      actor: candidate.actor,
      flow: {
        entryRoute: '/numbering/drawings',
        createRoute: '/numbering/create',
        committedObjectIds: bundle.ids,
        committedCodes: bundle.codes,
        normalNavigation: true,
      },
      readback: { api: 'PASS', browserReload: 'PASS', search: 'PASS', reloadReadbackSha256 },
      sideEffects: candidate.sideEffects,
      result: 'BROWSER_PASS',
    })
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true })
    fs.writeFileSync(options.outputPath, `${JSON.stringify(observation, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify({ status: 'BROWSER_PASS_PROVIDER_OBSERVATION_REQUIRED', releaseId: observation.releaseId, evidenceSha256: observation.evidenceSha256, outputPath: options.outputPath, screenshotPath: options.screenshotPath })}\n`)
    await context.close()
  } finally {
    if (browser) await browser.close().catch(() => {})
    credentials.identifier = ''
    credentials.password = ''
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'DEV116_R02_BROWSER_EXECUTOR_FAILED'}\n`)
  process.exitCode = 1
})
