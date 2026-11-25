import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {DEV015_LEGACY_OWNER_FORWARD,executeDev015LegacyOwnerForward} from './dev126-local-native-bootstrap-owner.mjs'
const sql=await readFile(new URL('../../db/postgres/local/110_dev015_legacy_native_owner_alignment.sql',import.meta.url),'utf8')
const revision='a'.repeat(40)
test('legacy forward binds the immutable local source before any database access',async()=>{
  assert.equal(createHash('sha256').update(sql).digest('hex'),DEV015_LEGACY_OWNER_FORWARD.sha256)
  const client={query:async()=>{throw new Error('unexpected database access')}}
  await assert.rejects(executeDev015LegacyOwnerForward(client,sql+' ',revision),{code:'LOCAL_NATIVE_AI_PDM_SOURCE_INVALID'})
})
test('legacy forward refuses a persistent target before opening a transaction',async()=>{
  const queries=[]
  const client={query:async statement=>{queries.push(statement);return {rows:[{database_name:'jenfu_dev',address:'127.0.0.1'}]}}}
  await assert.rejects(executeDev015LegacyOwnerForward(client,sql,revision),{code:'LOCAL_NATIVE_AI_PDM_TARGET_INVALID'})
  assert.equal(queries.length,1)
})
test('legacy forward rejects a missing DEV127 receipt atomically before DDL',async()=>{
  const queries=[]
  const client={query:async statement=>{queries.push(statement);if(statement.startsWith('SELECT current_database'))return {rows:[{database_name:'jenfu_local_test',address:'127.0.0.1'}]};if(statement==='SELECT current_user AS role_name')return {rows:[{role_name:'postgres'}]};return {rows:[]}}}
  await assert.rejects(executeDev015LegacyOwnerForward(client,sql,revision),{code:'LOCAL_NATIVE_AI_PDM_LEGACY_BASELINE_MISMATCH'})
  assert.equal(queries.at(-1),'ROLLBACK')
  assert.equal(queries.includes(sql),false)
})
