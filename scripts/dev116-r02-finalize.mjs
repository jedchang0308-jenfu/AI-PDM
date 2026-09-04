#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildDev116R02Receipt, buildPlatformR107Link } from './lib/dev116-r02-receipt.mjs'
import { joinDev116R02Evidence, resolveProductionEvidencePath } from './lib/dev116-r02-browser-executor.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const allowed = new Set(['--browser-input', '--provider-input', '--receipt-output', '--platform-output'])
const values = new Map()
const args = process.argv.slice(2)
for (let index = 0; index < args.length; index += 1) {
  const name = args[index]
  if (!allowed.has(name)) throw new Error(`DEV116_R02_FINALIZE_ARGUMENT_UNKNOWN:${name}`)
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`DEV116_R02_FINALIZE_ARGUMENT_VALUE_REQUIRED:${name}`)
  if (values.has(name)) throw new Error(`DEV116_R02_FINALIZE_ARGUMENT_DUPLICATE:${name}`)
  values.set(name, value)
  index += 1
}

function scoped(name, label) {
  return resolveProductionEvidencePath(root, values.get(name), label)
}

const browserPath = scoped('--browser-input', 'BROWSER_INPUT')
const providerPath = scoped('--provider-input', 'PROVIDER_INPUT')
const receiptPath = scoped('--receipt-output', 'RECEIPT_OUTPUT')
const platformPath = scoped('--platform-output', 'PLATFORM_OUTPUT')
const observation = joinDev116R02Evidence(
  JSON.parse(fs.readFileSync(browserPath, 'utf8')),
  JSON.parse(fs.readFileSync(providerPath, 'utf8')),
)
const receipt = buildDev116R02Receipt(observation)
const platformLink = buildPlatformR107Link(receipt)
for (const [target, payload] of [[receiptPath, receipt], [platformPath, platformLink]]) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}
process.stdout.write(`${JSON.stringify({ status: 'PASS', platformCaseId: receipt.platformCaseId, pdmCaseId: receipt.pdmCaseId, evidenceSha256: receipt.evidenceSha256, receiptPath, platformPath })}\n`)
