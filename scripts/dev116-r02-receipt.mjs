#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildDev116R02Receipt, buildPlatformR107Link } from './lib/dev116-r02-receipt.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
for (const flag of ['--execute', '--deploy', '--migrate', '--promote']) {
  if (args.includes(flag)) throw new Error(`DEV116_R02_${flag.slice(2).toUpperCase()}_NOT_SUPPORTED`)
}

function value(name) {
  const inline = args.find((item) => item.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function resolveEvidencePath(name) {
  const raw = value(name)
  if (!raw) throw new Error(`DEV116_R02_${name.slice(2).replaceAll('-', '_').toUpperCase()}_REQUIRED`)
  const target = path.resolve(root, raw)
  const evidenceRoot = path.resolve(root, 'output', 'production-release')
  if (!target.startsWith(`${evidenceRoot}${path.sep}`)) throw new Error('DEV116_R02_PATH_OUT_OF_SCOPE')
  return target
}

const inputPath = resolveEvidencePath('--input')
const receiptPath = resolveEvidencePath('--receipt-output')
const platformPath = resolveEvidencePath('--platform-output')
const observation = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
const receipt = buildDev116R02Receipt(observation)
const platformLink = buildPlatformR107Link(receipt)
for (const [target, payload] of [[receiptPath, receipt], [platformPath, platformLink]]) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}
process.stdout.write(`${JSON.stringify({ status: 'PASS', platformCaseId: receipt.platformCaseId, pdmCaseId: receipt.pdmCaseId, claimLevel: receipt.claimLevel, evidenceSha256: receipt.evidenceSha256, receiptPath, platformPath })}\n`)
