#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import pg from 'pg'
import { canonicalize, sha256 } from './lib/dev012-production-data-cutover.mjs'
import { readDatabaseCatalog } from './dev128-masked-local-snapshot-runner.mjs'

const { Client } = pg
const LOCAL_ONLY_TABLES = new Set([
  'local_native_bootstrap_receipts',
  'local_sandbox_principal_session_bindings',
  'local_sandbox_target_metadata',
  'local_test_admin_install_receipts'
])
const DEFAULT_PROFILE = 'C:\\VIBE CODING\\.local\\AI_PDM\\test-admin-1020\\sandbox\\control\\owner-connection.json'
const OUTPUT = path.resolve('config/release/dev128-masked-local-production-catalog-shape.json')

function fail(code) { const error = new Error(code); error.code = code; throw error }

function structuralCatalog(catalog) {
  const tables = catalog.tables
    .filter((table) => !LOCAL_ONLY_TABLES.has(table.name))
    .map(({ name, columns, primaryKey }) => ({ name, columns, primaryKey }))
  const tableNames = new Set(tables.map((table) => table.name))
  const foreignKeys = catalog.foreignKeys
    .filter((item) => tableNames.has(item.childTable) && tableNames.has(item.parentTable))
    .map(({ childTable, parentTable, constraintName, deferrable, childColumns, parentColumns }) => ({
      childTable, parentTable, constraintName, deferrable, childColumns, parentColumns
    }))
  return {
    schemaVersion: 'jenfu.dev128.ai-pdm-production-catalog-shape.v1',
    ownerApplicationId: 'ai-pdm',
    database: 'jenfu_prod',
    schema: 'ai_pdm_core',
    tables,
    foreignKeys
  }
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length > 1 || (argv[0] && argv[0] !== '--write')) fail('DEV128_CATALOG_FREEZE_ARGUMENTS_INVALID')
  const profile = JSON.parse(await readFile(DEFAULT_PROFILE, 'utf8'))
  if (profile.host !== '127.0.0.1' || profile.port !== 58420 || typeof profile.password !== 'string' || profile.password.length < 32) fail('DEV128_CATALOG_FREEZE_SOURCE_INVALID')
  const database = new Client({ ...profile, ssl: false, application_name: 'dev128-catalog-shape-freeze' })
  try {
    await database.connect()
    await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const source = await readDatabaseCatalog(database, 'ai_pdm_core')
    await database.query('COMMIT')
    const core = structuralCatalog(source)
    if (core.tables.length !== 170 || core.tables.some((table) => LOCAL_ONLY_TABLES.has(table.name))) fail('DEV128_CATALOG_FREEZE_TABLE_SET_INVALID')
    const artifact = { ...core, shapeSha256: sha256(canonicalize(core)) }
    if (argv[0] === '--write') await writeFile(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'w' })
    process.stdout.write(`${JSON.stringify({ status: argv[0] === '--write' ? 'WRITTEN' : 'CHECKED', tableCount: artifact.tables.length, foreignKeyCount: artifact.foreignKeys.length, shapeSha256: artifact.shapeSha256, output: OUTPUT })}\n`)
  } finally {
    await database.end().catch(() => undefined)
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.code ?? 'DEV128_CATALOG_FREEZE_FAILED'}\n`)
  process.exitCode = 1
})
