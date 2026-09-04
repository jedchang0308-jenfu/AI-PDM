import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { canonicalize, loadPackageConfig, sha256 } from './lib/dev010-n2-manifest.mjs'
import {
  assertNoPublicBusinessObjects,
  buildExistingHistoryPlan,
  buildFreshLanePackage,
  buildNamespaceMoveSql,
  classifyMigrationHistory,
  classifyPublicObjects,
} from './lib/dev010-n2-ai-pdm.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = loadPackageConfig(path.join(root, 'config', 'platform', 'dev-010-n2-ai-pdm.json'))
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'qa', 'dev-010', 'n2', 'fixtures', 'ai-pdm-domain.json'), 'utf8'))
const migration = fs.readFileSync(path.join(root, 'db', 'postgres', '062_dev010_neutral_schema_boundary.sql'), 'utf8')
const numberingRepository = fs.readFileSync(path.join(root, 'src', 'lib', 'repositories', 'numbering-async-repository.ts'), 'utf8')
const expected = {
  ai_audit: '08fc29c7b1ccb454bc40735b6f1e4121a6cf0b422141440ec3b11fbdfd409913',
  ai_file: '2ffb3470f0eadbc1a2593e1b8c348a0ede001a0fbb5adec1e4b2a7fea7f16280',
  ai_idempotency: '5dc82b51fd6bcb2dd5ab1458200d0a4a7540aa995c627ed399a8fe0fe168e82f',
  ai_catalog: '04d6ede5341ea4d5cd550c45a54e4e1f558545b20f760b1134347c88b9c5f9c8',
}
const files = [...Array.from({ length: 56 }, (_, index) => {
  const version = String(index + 1).padStart(3, '0')
  return { path: `db/postgres/${version}_fixture.sql`, sha256: sha256(version) }
}).filter((entry) => !entry.path.includes('/054_')), { path: 'db/postgres/062_dev010_neutral_schema_boundary.sql', sha256: sha256('062') }]

test('N2-AI-01 fixture groups have the frozen canonical hashes', () => {
  for (const [group, expectedHash] of Object.entries(expected)) assert.equal(sha256(canonicalize(fixture.groups[group])), expectedHash)
})

test('N2-AI-02 fresh lane excludes provider and retired migrations and folds 004 through 046', () => {
  const plan = buildFreshLanePackage({ files })
  assert.deepEqual(plan.sourceTraceOnly.map((entry) => entry.version), ['002'])
  assert.deepEqual(plan.retiredSourceVersions, ['054'])
  assert.deepEqual(plan.derivedBaselineOverlays.map((entry) => entry.version), ['042'])
  assert.equal(plan.folded.length, 43)
  assert.deepEqual(plan.apply.map((entry) => entry.version), ['001', '003', '047', '048', '049', '050', '051', '052', '053', '055', '056', '062'])
  assert.throws(
    () => buildFreshLanePackage({ files: [...files, { path: 'db/postgres/054_retired.sql', sha256: sha256('retired') }] }),
    /DEV010_N2_AI_RETIRED_MIGRATION_PRESENT/u,
  )
})

test('N2-AI-03 unknown existing checksum fails closed; exact compatibility maps replacement', () => {
  assert.throws(() => classifyMigrationHistory(files, [{ version: '048', checksum: 'f'.repeat(64) }], { entries: [] }), /DEV010_N2_AI_LEDGER_CHECKSUM_UNKNOWN/u)
  const compatibility = { entries: [{ version: '048', replacementVersion: '057', acceptedExistingChecksums: ['f'.repeat(64)] }] }
  const history = classifyMigrationHistory(files, [{ version: '048', checksum: 'f'.repeat(64) }, { version: '054', checksum: 'e'.repeat(64) }], compatibility)
  assert.equal(history.classifications.find((entry) => entry.version === '048').ledgerVersion, '057')
  assert.deepEqual(history.retiredLedgerVersions, ['054'])
  assert.ok(buildExistingHistoryPlan({ files, ledger: [], compatibility: { entries: [] } }).forward.some((entry) => entry.version === '062'))
})

test('N2-AI-04 public object classifier rejects unknown objects', () => {
  assert.deepEqual(classifyPublicObjects([{ identity: 'companies', kind: 'table', extensionOwned: false }]).business.length, 1)
  assert.throws(() => classifyPublicObjects([{ identity: 'mystery', kind: 'type', extensionOwned: false }]), /DEV010_N2_AI_PUBLIC_OBJECT_UNKNOWN/u)
  assert.deepEqual(assertNoPublicBusinessObjects({ publicBusinessObjectCount: 0, unknownExtensionObjectCount: 0 }).status, 'PASS')
})

test('N2-AI-05 namespace SQL is deterministic and rejects injection', () => {
  assert.equal(buildNamespaceMoveSql([{ kind: 'TABLE', identity: 'companies' }]), 'ALTER TABLE public.companies SET SCHEMA ai_pdm_core;\n')
  assert.throws(() => buildNamespaceMoveSql([{ kind: 'TABLE', identity: 'companies;DROP TABLE users' }]), /DEV010_N2_AI_NAMESPACE_PLAN_INVALID/u)
})

test('N2-AI-06 migration imports the immutable ledger and enforces empty public schema', () => {
  assert.match(migration, /INSERT INTO ai_pdm_core\.schema_migrations/u)
  assert.match(migration, /DROP TABLE public\.pdm_schema_migrations/u)
  assert.match(migration, /DEV010_N2_PUBLIC_BUSINESS_OBJECT_REMAINS/u)
  for (const view of [
    'v_r1_company_scope_v1',
    'v_r1_numbering_objects_v1',
    'v_r1_numbering_relations_v1',
    'v_r1_sequence_state_v1',
    'v_r1_numbering_create_audit_v1',
    'v_r1_command_effect_v1',
  ]) {
    assert.match(migration, new RegExp(`CREATE OR REPLACE VIEW ai_pdm_contract\\.${view}[\\s\\S]+?security_barrier = true`, 'u'))
  }
  assert.match(migration, /GRANT SELECT ON TABLE[\s\S]+ai_pdm_contract\.v_r1_command_effect_v1[\s\S]+TO jenfu_r1_verifier/u)
  assert.doesNotMatch(migration, /GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]+ai_pdm_core\.[^;]+jenfu_r1_verifier/iu)
  assert.doesNotMatch(migration, /GRANT (?:USAGE|SELECT|ALL)[^;]+SEQUENCES[^;]+jenfu_r1_verifier/iu)
  assert.doesNotMatch(migration, /GRANT (?:EXECUTE|ALL)[^;]+FUNCTION[^;]+jenfu_r1_verifier/iu)
  assert.doesNotMatch(migration, /detail_json\s+AS|response_json\s+AS|payload_json\s+AS/iu)
  assert.equal(config.connectionBudget.poolMax, 8)
})

test('N2-AI-07 draft reversal cancels canonical drawing work before deleting numbering masters', () => {
  const cancelPosition = numberingRepository.indexOf('await drawingWorkRepository.cancel(client')
  const revisionDeletePosition = numberingRepository.indexOf('DELETE FROM drawing_revisions', cancelPosition)
  const drawingDeletePosition = numberingRepository.indexOf('DELETE FROM drawings', revisionDeletePosition)
  assert.ok(cancelPosition > 0)
  assert.ok(revisionDeletePosition > cancelPosition)
  assert.ok(drawingDeletePosition > revisionDeletePosition)
  assert.match(numberingRepository, /DELETE FROM canonical_workbench_states[\s\S]+entity_type = 'part'/u)
  assert.match(numberingRepository, /DELETE FROM pdm_workbench_aggregates[\s\S]+entity_type = 'drawing'/u)
})
