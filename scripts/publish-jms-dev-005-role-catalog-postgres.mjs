import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { publishRoleCatalog, readRoleCatalog } from './lib/jms-dev-005-role-catalog.mjs'

const scriptRoot = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(scriptRoot, '..')
const catalogPath = join(appRoot, 'config', 'access-control', 'jenfu-role-catalog.v1.json')

function option(name, fallback) {
  const prefix = `--${name}=`
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) || fallback
}

async function main() {
  assert.ok(process.argv.includes('--activate'), 'explicit --activate is required')
  const connectionString = process.env.PDM_JMS_DEV005_CATALOG_DATABASE_URL?.trim()
  assert.ok(connectionString, 'PDM_JMS_DEV005_CATALOG_DATABASE_URL is required')
  const catalog = await readRoleCatalog(catalogPath)
  const client = new pg.Client({ connectionString, application_name: 'ai-pdm-dev-005-role-catalog-publisher' })
  await client.connect()
  try {
    const result = await publishRoleCatalog(client, catalog, {
      activate: true,
      publishedBy: option('published-by', 'ai-pdm-role-catalog-publisher'),
      activationReason: option('reason', 'DEV-005 app-owned role catalog publication'),
    })
    process.stdout.write(`${JSON.stringify({ ...result, productionAssumed: false })}\n`)
  } finally {
    await client.end()
  }
}

try {
  await main()
} catch (error) {
  process.stderr.write(`DEV-005 PostgreSQL catalog publication failed: ${error.code ?? error.message}\n`)
  process.exitCode = 1
}
