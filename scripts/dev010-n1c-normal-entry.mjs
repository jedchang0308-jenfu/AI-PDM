#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadN1cAiPdmConfig } from './dev010-n1c-ai-pdm-package.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function assertNormalEntryContract(config = loadN1cAiPdmConfig()) {
  const hosting = JSON.parse(fs.readFileSync(path.join(root, 'config', 'platform', 'firebase-hosting.dev-010-n1c.json'), 'utf8'))
  if (config.target.canonicalOrigin !== 'https://jenfu-platform-nonprod-pdm.web.app' || hosting.hosting.site !== config.target.hostingSite) throw new Error('DEV010_N1C_NORMAL_ENTRY_ORIGIN_MISMATCH')
  if (hosting.hosting.rewrites?.length !== 1 || hosting.hosting.rewrites[0]?.run?.serviceId !== config.target.service || hosting.hosting.rewrites[0]?.run?.region !== config.target.region || hosting.hosting.rewrites[0]?.run?.pinTag !== false) throw new Error('DEV010_N1C_NORMAL_ENTRY_REWRITE_MISMATCH')
  const headers = new Map(hosting.hosting.headers?.[0]?.headers?.map((item) => [item.key.toLowerCase(), item.value]) ?? [])
  if (headers.get('cache-control') !== 'private, no-store, max-age=0' || headers.get('x-robots-tag') !== 'noindex, nofollow') throw new Error('DEV010_N1C_NORMAL_ENTRY_CACHE_OR_INDEX_POLICY_MISMATCH')
  return { canonicalOrigin: config.target.canonicalOrigin, service: config.target.service, site: hosting.hosting.site, status: 'PASS' }
}

export function assertOperationId(operationId, config = loadN1cAiPdmConfig()) {
  if (!new RegExp(config.fixture.operationIdPattern, 'u').test(operationId)) throw new Error('DEV010_N1C_OPERATION_ID_INVALID')
  return operationId
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.includes('--execute')) throw new Error('DEV010_N1C_PROVIDER_EXECUTION_REQUIRES_MANAGED_RELEASE_ADAPTER')
  process.stdout.write(`${JSON.stringify({ ...assertNormalEntryContract(), mode: 'dry-run', providerExecution: 'NOT_RUN' })}\n`)
}
