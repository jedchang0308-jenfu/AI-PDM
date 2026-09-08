#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import {
  assertMigrationBundle,
  assertRunnerTarget,
  executeProductionMigration,
  metadataAccessToken,
  parseGsUri,
  parseRunnerArgs,
  publishGcsJson,
  readGcsObject,
} from './lib/dev012-production-migration-runner.mjs'

export const TARGET = Object.freeze({
  ownerApplicationId: 'ai-pdm',
  releaseBucket: 'jenfu-platform-prod-aipdm-release',
  job: 'ai-pdm-prod-migration-runner',
  login: 'aipdm-prod-migrator@jenfu-platform-prod.iam',
  ledger: 'ai_pdm_core.schema_migrations',
  baselineCount: 14,
  migratorRole: 'jenfu_ai_pdm_migrator',
  runtimeRole: 'jenfu_ai_pdm_runtime',
  coreSchema: 'ai_pdm_core',
  siblingCoreSchemas: ['orgmaster_core', 'platform_core'],
})

export function databaseOptions(environment, token, database = 'jenfu_prod') {
  return {
    host: environment.POSTGRES_SOCKET,
    database,
    user: environment.POSTGRES_IAM_LOGIN,
    password: token,
    ssl: false,
    application_name: 'dev012-ai-pdm-production-migrator',
    connectionTimeoutMillis: 10_000,
    query_timeout: 35_000,
    statement_timeout: 30_000,
  }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env, fetchImpl = fetch, Client = pg.Client } = {}) {
  const args = parseRunnerArgs(argv)
  assertRunnerTarget(environment, TARGET)
  parseGsUri(args.bundleRef, TARGET.releaseBucket, 'source/migration-bundles')
  parseGsUri(args.outputRef, TARGET.releaseBucket, 'receipts')
  const token = await metadataAccessToken(fetchImpl)
  const object = await readGcsObject({ uri: args.bundleRef, expectedBucket: TARGET.releaseBucket, expectedPrefix: 'source/migration-bundles', token, fetchImpl })
  let value
  try { value = JSON.parse(object.bytes.toString('utf8')) } catch { throw new Error('MIGRATION_BUNDLE_JSON_INVALID') }
  const bundle = assertMigrationBundle(value, { target: TARGET, sourceRevision: args.sourceRevision, bundleSha256: args.bundleSha256, bytes: object.bytes })
  const database = new Client(databaseOptions(environment, token))
  await database.connect()
  try {
    const receipt = await executeProductionMigration({
      bundle,
      database,
      target: TARGET,
      sourceRevision: args.sourceRevision,
      denyDatabaseConnect: async (databaseName) => {
        const denied = new Client(databaseOptions(environment, token, databaseName))
        try {
          await denied.connect()
          return false
        } catch {
          return true
        } finally {
          await denied.end().catch(() => undefined)
        }
      },
    })
    const publication = await publishGcsJson({ uri: args.outputRef, expectedBucket: TARGET.releaseBucket, expectedPrefix: 'receipts', value: receipt, token, fetchImpl })
    return { ...receipt, outputRef: args.outputRef, outputGeneration: publication.generation, outputSha256: publication.sha256 }
  } finally {
    await database.end()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then((value) => process.stdout.write(`${JSON.stringify(value)}\n`)).catch((error) => {
    process.stderr.write(`${error.code || error.message}\n`)
    process.exitCode = 1
  })
}
