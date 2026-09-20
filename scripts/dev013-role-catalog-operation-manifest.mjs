#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { readRoleCatalog } from './lib/jms-dev-005-role-catalog.mjs'
import { buildCatalogOperation, encodeCatalogOperation } from './lib/dev013-production-role-catalog-publisher.mjs'

function parse(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    if (!['--source-revision', '--deadline-at', '--output'].includes(key) || !argv[index + 1]) throw new Error('DEV013_CATALOG_MANIFEST_ARGUMENT_INVALID')
    result[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = argv[index + 1]
  }
  if (!result.sourceRevision || !result.deadlineAt || !result.output) throw new Error('DEV013_CATALOG_MANIFEST_ARGUMENT_INVALID')
  return result
}

export async function run({ argv = process.argv.slice(2), cwd = process.cwd() } = {}) {
  const args = parse(argv)
  const catalog = await readRoleCatalog(path.resolve(cwd, 'config/access-control/jenfu-role-catalog.v1.json'))
  const operation = buildCatalogOperation({ sourceRevision: args.sourceRevision, deadlineAt: args.deadlineAt, catalog })
  const encoded = encodeCatalogOperation(operation)
  const output = path.resolve(cwd, args.output)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, encoded.bytes, { flag: 'wx' })
  fs.writeFileSync(`${output}.sha256`, `${encoded.sha256}  ${path.basename(output)}\n`, { flag: 'wx' })
  return { output, sha256: encoded.sha256, operationId: operation.operationId }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then((value) => process.stdout.write(`${JSON.stringify(value)}\n`)).catch((error) => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1 })
}
