#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { readRoleCatalog } from './lib/jms-dev-005-role-catalog.mjs'
import { metadataAccessToken, parseGsUri, publishGcsJson, readGcsObject } from './lib/dev012-production-migration-runner.mjs'
import {
  assertCatalogOperation,
  assertCatalogRunnerTarget,
  DEV013_CATALOG_TARGET,
  parseCatalogRunnerArgs,
  publishProductionRoleCatalog,
} from './lib/dev013-production-role-catalog-publisher.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = path.join(root, 'config', 'access-control', 'jenfu-role-catalog.v1.json')

export function databaseOptions(environment, token) {
  return {
    host: environment.POSTGRES_SOCKET,
    database: environment.POSTGRES_DATABASE,
    user: environment.POSTGRES_IAM_LOGIN,
    password: token,
    ssl: false,
    application_name: 'dev013-ai-pdm-production-role-catalog-publisher',
    connectionTimeoutMillis: 10_000,
    query_timeout: 35_000,
    statement_timeout: 30_000,
  }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env, fetchImpl = fetch, Client = pg.Client, now = () => new Date().toISOString() } = {}) {
  const args = parseCatalogRunnerArgs(argv)
  assertCatalogRunnerTarget(environment)
  if (environment.SOURCE_REVISION !== args.sourceRevision) throw new Error('DEV013_CATALOG_SOURCE_REVISION_MISMATCH')
  parseGsUri(args.operationRef, DEV013_CATALOG_TARGET.releaseBucket, DEV013_CATALOG_TARGET.operationPrefix)
  parseGsUri(args.outputRef, DEV013_CATALOG_TARGET.releaseBucket, DEV013_CATALOG_TARGET.receiptPrefix)
  const token = await metadataAccessToken(fetchImpl)
  const catalog = await readRoleCatalog(catalogPath)
  const object = await readGcsObject({ uri: args.operationRef, expectedBucket: DEV013_CATALOG_TARGET.releaseBucket, expectedPrefix: DEV013_CATALOG_TARGET.operationPrefix, token, fetchImpl })
  let raw
  try { raw = JSON.parse(object.bytes.toString('utf8')) } catch { throw new Error('DEV013_CATALOG_OPERATION_JSON_INVALID') }
  const operation = assertCatalogOperation(raw, { bytes: object.bytes, operationSha256: args.operationSha256, sourceRevision: args.sourceRevision, catalog, now: new Date(now()) })
  const database = new Client(databaseOptions(environment, token))
  await database.connect()
  try {
    const receipt = await publishProductionRoleCatalog({ database, operation, catalog, now })
    const published = await publishGcsJson({ uri: args.outputRef, expectedBucket: DEV013_CATALOG_TARGET.releaseBucket, expectedPrefix: DEV013_CATALOG_TARGET.receiptPrefix, value: receipt, token, fetchImpl })
    return { ...receipt, outputRef: args.outputRef, outputGeneration: published.generation, outputSha256: published.sha256 }
  } finally {
    await database.end()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then((value) => process.stdout.write(`${JSON.stringify(value)}\n`)).catch((error) => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1 })
}
