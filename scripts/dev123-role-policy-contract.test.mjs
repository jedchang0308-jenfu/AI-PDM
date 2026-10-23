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
  assert.equal(typeof command, 'string')
  const paths = command.split(/\s+/u).filter(path => path.endsWith('.test.ts') || path.endsWith('.test.mjs'))
  assert.ok(paths.length > 0)
  assert.equal(new Set(paths).size, paths.length)
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

test('DEV-123 producer exports the exact current/history shape without an enablement state machine', () => {
  const { signatureSha256, ...producer } = manifest.producer
  assert.equal(signature(producer), signatureSha256)
  assert.deepEqual(viewColumns(migration, producer.currentView), producer.columns)
  assert.deepEqual(viewColumns(migration, producer.historyView), producer.columns)
  assert.equal(producer.columns.length, 34)
  assert.equal(manifest.consumer, undefined)
  assert.doesNotMatch(migration + correction, /role_policy_state|activation_generation|confirmation_hash|v_ai_pdm_role_policy_compatibility_v2/u)
  assert.equal((migration.match(/CREATE TABLE ai_pdm_core.role_policy_/gu) ?? []).length, 3)
  assert.doesNotMatch(migration + correction, /UPDATE ai_pdm_core\.readonly_shares[\s\S]*?SET project_scope_key/u)
  assert.match(migration, /BEFORE INSERT ON ai_pdm_core\.readonly_shares/u)
  assert.match(migration, /submission.status = 'Released'/u)
  assert.match(migration, /OLD.status='APPLIED'/u)
  assert.match(correction, /dev123_assert_candidate_v1\(draft\.candidate_json\)/u)
  assert.doesNotMatch(migration + correction, /\b(?:platform|orgmaster)_core\./u)
  assert.match(jobAuthority, /ADD COLUMN initiator_authority_json jsonb/u)
  assert.doesNotMatch(jobAuthority, /\b(?:platform|orgmaster)_core\.|\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/u)
})

test('DEV-123 retains the separate manager authority fence, not consumer readiness', () => {
  const positions = ['orgmaster_contract.lock_ai_pdm_role_policy_authority_v1()',
    'FROM ai_pdm_core.principal_accounts', 'FROM ai_pdm_core.principal_session_records',
    'FROM ai_pdm_core.role_policy_commands WHERE request_id=p_request_id FOR UPDATE',
    'pg_advisory_xact_lock(hashtextextended(p_request_id::text,0))',
    'FROM ai_pdm_core.active_role_catalog active', 'FROM ai_pdm_core.role_policy_drafts WHERE draft_id=p_draft_id FOR UPDATE']
    .map(text => correction.indexOf(text, correction.indexOf('CREATE FUNCTION ai_pdm_core.role_policy_lock_apply_v1')))
  assert.ok(positions.every((value, index) => value >= 0 && (index === 0 || value > positions[index - 1])))
})
