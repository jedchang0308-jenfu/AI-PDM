import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
test('DEV-123 owner and consumer use the exact separate manager authority contract', () => {
  const root = process.env.ORGMASTER_DEV058_ROOT
  assert.ok(root, 'ORGMASTER_DEV058_ROOT identifies the actual owner source for this integration check')
  const owner = readFileSync(join(root, 'contracts/ai-pdm-role-policy-manager/v1/contract-manifest.json'))
  const consumer = readFileSync('config/access-control/orgmaster-role-policy-manager-v1.manifest.json')
  assert.deepEqual(JSON.parse(consumer), JSON.parse(owner))
  const ownerSql = readFileSync(join(root, 'db/migrations/035_dev058_ai_pdm_compatibility_definer_read.sql'), 'utf8')
  assert.ok(ownerSql.includes(createHash('sha256').update(owner).digest('hex')))
})
