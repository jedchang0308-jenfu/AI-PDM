import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const templatePath = join(root, 'db/postgres/066_dev121_principal_role_catalog_v4.sql')
const catalogPath = join(root, 'config/access-control/jenfu-role-catalog.v5.json')
const targetPath = join(root, 'db/postgres/070_dev121_principal_role_catalog_v5.sql')

function replaceOnce(source, before, after) {
  assert.ok(source.includes(before), `migration template missing ${before}`)
  assert.equal(source.split(before).length, 2, `migration template has duplicate ${before}`)
  return source.replace(before, after)
}

export function buildV5Migration(template, catalog) {
  assert.equal(catalog.catalogVersion, 'ai-pdm.role-catalog.2026-09-28.v5')
  assert.equal(catalog.catalogSha256,
    '4f05dd4228b51e5086f30886330f48f1f137e37d383a26114bb34f5874d39197')
  assert.equal(catalog.roles.length, 9)
  let sql = template.replaceAll('\r\n', '\n')
  sql = replaceOnce(sql, '-- Owner release: apply after migration 065; publish v4 without service traffic.',
    '-- Owner release: publish v5 after migration 069, before Principal-only service traffic.')
  sql = replaceOnce(sql, 'dev121-principal-role-catalog-v4', 'dev121-principal-role-catalog-v5')
  sql = sql.replace(/catalog jsonb := \$dev121_catalog\$[^\n]+\$dev121_catalog\$::jsonb;/u,
    `catalog jsonb := $dev121_catalog$${JSON.stringify(catalog)}$dev121_catalog$::jsonb;`)
  assert.ok(sql.includes(catalog.catalogSha256), 'catalog payload replacement failed')
  sql = replaceOnce(sql, "previous_version text := 'ai-pdm.role-catalog.2026-09-03.v3';",
    "previous_version text := 'ai-pdm.role-catalog.2026-09-25.v4';")
  sql = replaceOnce(sql, "previous_hash text := '46376639b7aec06798786b9d1a113ba604cf90ca31541a9464ecce7a49d116c8';",
    "previous_hash text := '32f3593d7a0d2a5cad4875181a62b8f5c49a06c9cbba8835cd1b82e9b44ca08a';")
  sql = sql.replaceAll('DEV121_CATALOG_V3_BASELINE_MISMATCH', 'DEV121_CATALOG_V4_BASELINE_MISMATCH')
    .replaceAll('DEV121_CATALOG_V4_READBACK_FAILED', 'DEV121_CATALOG_V5_READBACK_FAILED')
    .replaceAll('principal-first catalog v4', 'principal-only catalog v5')
    .replaceAll('principal-first explicit DEV-087 capabilities', 'principal-only reviewed active workflow capabilities')
  assert.ok(!sql.includes('DEV121_CATALOG_V3_BASELINE_MISMATCH'))
  return sql
}

function main() {
  const mode = process.argv[2]
  assert.ok(mode === '--write' || mode === '--check', 'choose --write or --check')
  const template = readFileSync(templatePath, 'utf8')
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  const sql = buildV5Migration(template, catalog)
  if (mode === '--write') writeFileSync(targetPath, sql)
  assert.equal(readFileSync(targetPath, 'utf8').replaceAll('\r\n', '\n'), sql)
  process.stdout.write(`${JSON.stringify({ status: 'PASS', migration: '070',
    catalogVersion: catalog.catalogVersion, catalogSha256: catalog.catalogSha256 })}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
