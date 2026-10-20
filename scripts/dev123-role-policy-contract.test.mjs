import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const manifest = JSON.parse(readFileSync('config/access-control/ai-pdm-role-policy-contract-v2.manifest.json', 'utf8'))
const migration = readFileSync('db/postgres/086_dev123_role_policy_editor_v1.sql', 'utf8')

function signature(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function viewColumns(sql, viewName) {
  const replaceStart = sql.indexOf(`CREATE OR REPLACE VIEW ${viewName}`)
  const createStart = sql.indexOf(`CREATE VIEW ${viewName}`)
  const start = replaceStart >= 0 ? replaceStart : createStart
  assert.notEqual(start, -1, `missing ${viewName}`)
  const select = sql.indexOf('SELECT', start)
  const from = sql.indexOf('\nFROM ', select)
  const body = sql.slice(select + 6, from)
  const values = []; let startAt = 0; let depth = 0; let quoted = false
  for (let index = 0; index < body.length; index += 1) {
    const token = body[index]
    if (token === "'" && body[index - 1] !== '\\') quoted = !quoted
    if (quoted) continue
    if (token === '(') depth += 1
    else if (token === ')') depth -= 1
    else if (token === ',' && depth === 0) { values.push(body.slice(startAt, index)); startAt = index + 1 }
  }
  values.push(body.slice(startAt))
  return values.map(value => {
    const expression = value.trim().replace(/\s+/gu, ' ')
    const alias = / AS ([a-z_]+)$/iu.exec(expression)?.[1]
    return alias ?? expression.split('.').at(-1)
  })
}

test('DEV-123 producer manifest and migration expose the exact v2 current/history columns', () => {
  const { signatureSha256, ...producer } = manifest.producer
  assert.equal(signature(producer), signatureSha256)
  assert.deepEqual(viewColumns(migration, manifest.producer.currentView), manifest.producer.columns)
  assert.deepEqual(viewColumns(migration, manifest.producer.historyView), manifest.producer.columns)
  assert.match(migration, /mode, activation_generation[\s\S]+?'DISABLED', 0/u)
  assert.match(migration, /REVOKE ALL ON TABLE[\s\S]*?ai_pdm_core\.role_catalog_publications[\s\S]*?FROM PUBLIC, jenfu_platform_runtime, jenfu_orgmaster_runtime, jenfu_ai_pdm_runtime, jenfu_r1_verifier;/u)
  assert.match(migration, /GRANT SELECT ON TABLE ai_pdm_contract\.v_application_role_catalog_v2/u)
  assert.match(migration, /BEFORE INSERT ON ai_pdm_core\.readonly_shares[\s\S]*dev123_bind_project_scope_key/u)
  assert.match(migration, /UPDATE ai_pdm_core\.readonly_shares share[\s\S]*submission\.project_code[\s\S]*share\.project_scope_key IS NULL/u)
  assert.match(migration, /SELECT NULLIF\(btrim\(submission\.project_code\), ''\)/u)
  assert.doesNotMatch(migration, /\b(?:platform|orgmaster)_core\./u)
})

test('DEV-123 reads the real OrgMaster DEV-058 fourteen-column compatibility_v2 contract when provided', () => {
  const root = process.env.ORGMASTER_DEV058_ROOT
  assert.ok(root, 'ORGMASTER_DEV058_ROOT is required for the bilateral contract check')
  const consumerSql = readFileSync(join(root, 'db/migrations/034_dev058_ai_pdm_role_policy_compatibility_v2.sql'), 'utf8')
  assert.deepEqual(viewColumns(consumerSql, manifest.consumer.view), manifest.consumer.columns)
  assert.match(consumerSql, new RegExp(manifest.consumer.signatureSha256, 'u'))
  assert.match(consumerSql, /'NOT_READY'/u)
  assert.equal(manifest.initialReadiness, 'NOT_READY')
})
