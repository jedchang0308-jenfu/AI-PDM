import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptRoot = resolve(fileURLToPath(new URL('.', import.meta.url)))
const appRoot = resolve(scriptRoot, '..')
const migrationPath = join(appRoot, 'db', 'postgres', '053_jenfu_role_catalog_publication.sql')

function main() {
  assert.ok(existsSync(migrationPath), `missing ${migrationPath}`)
  const sql = readFileSync(migrationPath, 'utf8')
  const normalized = sql.toLowerCase()
  for (const marker of [
    'begin;',
    "pg_advisory_xact_lock(hashtext('ai-pdm:dev-005:role-catalog-publication'))",
    'set local role jenfu_platform_migrator',
    'create schema if not exists ai_pdm_contract',
    'create table if not exists ai_pdm_contract.role_catalog_publications',
    'create table if not exists ai_pdm_contract.role_catalog_entries',
    'create table if not exists ai_pdm_contract.active_role_catalog',
    'create unique index if not exists role_catalog_one_active_version',
    'create or replace view ai_pdm_contract.v_application_role_catalog_v1',
    'revoke all on all tables in schema ai_pdm_contract',
    'grant select on ai_pdm_contract.v_application_role_catalog_v1',
    'commit;',
  ]) assert.ok(normalized.includes(marker), `missing migration marker: ${marker}`)

  assert.doesNotMatch(normalized, /\binsert\s+into\b|\bupdate\s+\S+\s+set\b|\bdelete\s+from\b|\bdrop\s+table\b|\btruncate\b/u, 'S1 migration must remain additive and publication-only')
  assert.match(normalized, /application_id\s+text\s+primary key/u)
  assert.match(normalized, /display_order\s+integer\s+not null/u)
  assert.match(normalized, /status\s+in\s*\('draft',\s*'active',\s*'retired'\)/u)
  assert.match(normalized, /where\s+p\.application_id\s*=\s*'ai-pdm'/u)
  process.stdout.write(`${JSON.stringify({ status: 'PASS', migration: '053_jenfu_role_catalog_publication.sql', additive: true, authoritySwitch: false, runtimeDml: false, orgMasterReadModelOnly: true })}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`DEV-005 migration QC failed: ${error.message}\n`)
  process.exitCode = 1
}
