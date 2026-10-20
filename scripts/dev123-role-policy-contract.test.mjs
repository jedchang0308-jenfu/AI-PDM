import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const manifest = JSON.parse(readFileSync('config/access-control/ai-pdm-role-policy-contract-v2.manifest.json', 'utf8'))
const migration = readFileSync('db/postgres/086_dev123_role_policy_editor_v1.sql', 'utf8')
const correction = readFileSync('db/postgres/087_dev123_role_policy_candidate_validation.sql', 'utf8')
const jobAuthority = readFileSync('db/postgres/088_dev123_recognition_job_authority.sql', 'utf8')

test('DEV-123 fixed verification entry names existing exact test files', () => {
  const command = JSON.parse(readFileSync('package.json', 'utf8')).scripts['test:dev-123:contracts']
  const paths = command.split(/\s+/u).filter(path => path.endsWith('.test.ts') || path.endsWith('.test.mjs'))
  assert.ok(paths.length >= 25)
  for (const path of paths) assert.ok(existsSync(path), `missing fixed-entry test: ${path}`)
})

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
  assert.match(correction, /UPDATE ai_pdm_core\.readonly_shares SET project_scope_key=NULL WHERE project_scope_key IS NOT NULL/u)
  assert.match(correction, /mode='DISABLED' AND activation_generation=0/u)
  assert.match(correction, /LOCK TABLE ai_pdm_core\.readonly_shares IN ACCESS EXCLUSIVE MODE/u)
  assert.match(correction, /dev123_assert_candidate_v1\(draft\.candidate_json\)/u)
  assert.match(correction, /dev123_json_sha256_v1\(p_candidate - ARRAY\['contentHash','identityHashes'\]\)/u)
  assert.match(migration, /SELECT NULLIF\(btrim\(submission\.project_code\), ''\)/u)
  assert.doesNotMatch(migration, /\b(?:platform|orgmaster)_core\./u)
  assert.match(jobAuthority, /ADD COLUMN initiator_authority_json jsonb/u)
  assert.doesNotMatch(jobAuthority, /\b(?:platform|orgmaster)_core\.|\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/u)
})

test('DEV-123 reads the real OrgMaster DEV-058 fourteen-column compatibility_v2 contract when provided', () => {
  const root = process.env.ORGMASTER_DEV058_ROOT
  assert.ok(root, 'ORGMASTER_DEV058_ROOT is required for the bilateral contract check')
  const consumerSql = readFileSync(join(root, 'db/migrations/034_dev058_ai_pdm_role_policy_compatibility_v2.sql'), 'utf8')
  assert.deepEqual(viewColumns(consumerSql, manifest.consumer.view), manifest.consumer.columns)
  assert.match(consumerSql, new RegExp(manifest.consumer.signatureSha256, 'u'))
  assert.match(consumerSql, /'NOT_READY'/u)
  const consumerAcl = readFileSync(join(root, 'db/migrations/035_dev058_ai_pdm_compatibility_definer_read.sql'), 'utf8')
  assert.match(consumerAcl, /GRANT SELECT ON orgmaster_contract\.v_ai_pdm_role_policy_compatibility_v2 TO jenfu_ai_pdm_migrator;/u)
  assert.doesNotMatch(consumerAcl, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON (?:TABLE )?orgmaster_core\./iu)
  assert.doesNotMatch(consumerSql, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON (?:TABLE )?orgmaster_core\./iu)

  assert.equal(manifest.initialReadiness, 'NOT_READY')
})

test('DEV-123 pins the bilateral manager fence and obtains all apply locks before fresh admission', () => {
  const root = process.env.ORGMASTER_DEV058_ROOT
  assert.ok(root)
  const owner = readFileSync(join(root, 'contracts/ai-pdm-role-policy-manager/v1/contract-manifest.json'))
  const consumer = readFileSync('config/access-control/orgmaster-role-policy-manager-v1.manifest.json')
  assert.deepEqual(consumer, owner)
  const ownerSql = readFileSync(join(root, 'db/migrations/035_dev058_ai_pdm_compatibility_definer_read.sql'), 'utf8')
  assert.ok(ownerSql.includes(createHash('sha256').update(owner).digest('hex')))
  assert.ok(correction.includes('PERFORM orgmaster_contract.lock_ai_pdm_role_policy_authority_v1()'))
  const positions = ['orgmaster_contract.lock_ai_pdm_role_policy_authority_v1()',
    'FROM ai_pdm_core.principal_accounts', 'FROM ai_pdm_core.principal_session_records',
    'FROM ai_pdm_core.role_policy_commands WHERE request_id=p_request_id FOR UPDATE',
    "FROM ai_pdm_core.role_policy_state WHERE application_id='ai-pdm' FOR UPDATE",
    'FROM ai_pdm_core.active_role_catalog active', 'FROM ai_pdm_core.role_policy_drafts WHERE draft_id=p_draft_id FOR UPDATE']
    .map(text => correction.indexOf(text, correction.indexOf('CREATE FUNCTION ai_pdm_core.role_policy_lock_apply_v1')))
  assert.ok(positions.every((value, index) => value >= 0 && (index === 0 || value > positions[index - 1])))
  assert.doesNotMatch(correction, /\b(?:platform|orgmaster)_core\./u)
})
