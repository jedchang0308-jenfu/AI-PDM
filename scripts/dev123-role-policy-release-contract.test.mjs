import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {buildDev117MigrationBundle,buildDev117MigrationPackage} from './lib/dev117-ai-pdm-continuous-release.mjs'
import {assertAiPdmMigrationContent} from './lib/dev121-owner-release-proof.mjs'
import {canonicalize,sha256} from './lib/dev012-production-migration-runner.mjs'

const profilePath='config/release/dev117-ai-pdm-independent-production-v3.json'
const sourceRevision='a'.repeat(40), deadlineAt='2999-01-01T00:00:00.000Z'
function fixture() {
  const profile=JSON.parse(readFileSync(profilePath,'utf8'))
  const n1c=JSON.parse(readFileSync('config/platform/dev-010-n1c-ai-pdm.json','utf8'))
  const {bundle}=buildDev117MigrationBundle(profile,buildDev117MigrationPackage(profile,n1c),sourceRevision)
  const files=new Map([[profilePath,Buffer.from(canonicalize(profile))],
    ...profile.migrations.entries.map(entry=>[entry.path,readFileSync(entry.path)])])
  return {profile,bundle,files,sourceRevision,deadlineAt}
}
function reseal(input) {
  const core={...input.bundle}; delete core.manifestSha256
  input.bundle.manifestSha256=sha256(canonicalize(core))
  input.files.set(profilePath,Buffer.from(canonicalize(input.profile)))
  return input
}
test('DEV-123 owner proof accepts the exact complete 38-entry source and preserves the 35-entry prefix',()=>{
  const input=fixture()
  assert.equal(input.bundle.entries.length,38)
  assert.equal(input.bundle.baselineCount,15)
  assert.doesNotThrow(()=>assertAiPdmMigrationContent(input))
  const previous=structuredClone(input.profile)
  previous.migrations.entries=previous.migrations.entries.slice(0,35)
  const n1c=JSON.parse(readFileSync('config/platform/dev-010-n1c-ai-pdm.json','utf8'))
  const prefix=buildDev117MigrationBundle(previous,buildDev117MigrationPackage(previous,n1c),sourceRevision)
  assert.deepEqual(input.bundle.entries.slice(0,35),prefix.bundle.entries)
})
test('DEV-123 owner proof rejects a substituted source or applied SQL in every appended migration',()=>{
  for(const index of [35,36,37]) for(const kind of ['source','applied']) {
    const input=fixture(), entry=input.bundle.entries[index]
    if(kind==='source') {
      const bytes=Buffer.concat([input.files.get(entry.path),Buffer.from('\n-- forged source\n')])
      input.files.set(entry.path,bytes); entry.sourceSha256=sha256(bytes)
      input.profile.migrations.entries[index].sha256=entry.sourceSha256
    } else {
      const bytes=Buffer.concat([Buffer.from(entry.sqlBase64,'base64'),Buffer.from('\n-- forged applied SQL\n')])
      entry.sqlBase64=bytes.toString('base64'); entry.appliedSha256=sha256(bytes)
    }
    assert.throws(()=>assertAiPdmMigrationContent(reseal(input)),/ARCHIVE_BUNDLE_INVALID/u,`${index}:${kind}`)
  }
})
test('DEV-123 source authority rejects incomplete, reordered and extended migration bundles',()=>{
  for(const mutation of ['partial36','partial37','reorder','extra']) {
    const input=fixture()
    if(mutation.startsWith('partial')) input.bundle.entries=input.bundle.entries.slice(0,Number(mutation.slice(7)))
    else if(mutation==='reorder') [input.bundle.entries[35],input.bundle.entries[36]]=[input.bundle.entries[36],input.bundle.entries[35]]
    else input.bundle.entries.push({...input.bundle.entries[37],order:39})
    assert.throws(()=>assertAiPdmMigrationContent(reseal(input)),/ARCHIVE_BUNDLE_INVALID/u,mutation)
  }
})
