#!/usr/bin/env node

import path from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import {
  DEV013_AI_PDM_FIXTURE_TARGET,
  applyDev013AiPdmFixture,
  assertDev013AiPdmFixtureEnvironment,
  buildDev013AiPdmFixture,
  readDev013AiPdmRoleCatalog,
  summarizeDev013AiPdmFixture,
} from './lib/dev013-ai-pdm-l3-fixture-bootstrap.mjs'

export async function run(env = process.env) {
  const { identitySubject } = assertDev013AiPdmFixtureEnvironment(env)
  const fixture = buildDev013AiPdmFixture(identitySubject)
  const catalog = readDev013AiPdmRoleCatalog()
  const client = new pg.Client({
    host: env.DEV013_DATABASE_HOST ?? '127.0.0.1',
    port: Number.parseInt(env.DEV013_DATABASE_PORT ?? '5432', 10),
    database: DEV013_AI_PDM_FIXTURE_TARGET.database,
    user: DEV013_AI_PDM_FIXTURE_TARGET.databaseUser,
    password: undefined,
    ssl: false,
    connectionTimeoutMillis: 60_000,
    query_timeout: 35_000,
    statement_timeout: 30_000,
    application_name: 'ai-pdm-dev013-l3-fixture-bootstrap',
  })
  await client.connect()
  try {
    return summarizeDev013AiPdmFixture(fixture, await applyDev013AiPdmFixture(client, fixture, catalog))
  } finally {
    await client.end().catch(() => undefined)
  }
}

function safeCode(error) {
  const value = error instanceof Error ? error.message : 'DEV013_FIXTURE_BOOTSTRAP_FAILED'
  return /^[A-Z0-9_:-]+$/u.test(value) ? value : 'DEV013_FIXTURE_BOOTSTRAP_FAILED'
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run().then((receipt) => process.stdout.write(`${JSON.stringify(receipt)}\n`)).catch((error) => {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 'jenfu.dev013.ai-pdm-l3-fixture-receipt.v1', status: 'FAIL', code: safeCode(error) })}\n`)
    process.exitCode = 1
  })
}
