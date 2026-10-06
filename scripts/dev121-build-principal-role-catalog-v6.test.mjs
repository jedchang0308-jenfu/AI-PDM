
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { buildPrincipalRoleCatalogV6 } from './dev121-build-principal-role-catalog-v6.mjs'
import { buildV6Migration } from './dev121-build-principal-role-catalog-v6-migration.mjs'
const read = p => JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'))
const source=read('config/access-control/jenfu-role-catalog.v5.json')
const inventory=read('config/access-control/jenfu-active-capabilities.v1.json')
test('v6 gives only the privileged role every exact registered kind/code and preserves eight roles',()=>{
 const actual=buildPrincipalRoleCatalogV6(source,inventory)
 assert.equal(actual.catalogSha256,'bdc8d2b8f717e4af9d48cf882d1a564a5caaabaaaacdcf20bc5db36a5b6960af')
 assert.equal(actual.roles.find(r=>r.roleCode==='system_admin').permissions.length,66)
 assert.ok(actual.roles.find(r=>r.roleCode==='system_admin').permissions.every(p=>p.allowed===true))
 assert.deepEqual(actual.roles.filter(r=>r.roleCode!=='system_admin'),source.roles.filter(r=>r.roleCode!=='system_admin'))
 assert.ok(!actual.roles.some(r=>r.permissions.some(p=>p.code.includes('*'))))
})
test('unknown additions, missing registrations and wrong permission kind do not auto grant',()=>{
 for(const mutate of [x=>x.capabilities.push({kind:'action',code:'new.future.permission'}),
 x=>x.capabilities.pop(),x=>{x.capabilities[0].kind='page'},x=>x.capabilities.push(x.capabilities[0])]){
 const changed=structuredClone(inventory);mutate(changed);assert.throws(()=>buildPrincipalRoleCatalogV6(source,changed))
 }
})
test('080 final publication guard runs only after first activation or idempotent replay converge',()=>{
 const actual=buildV6Migration(fs.readFileSync(new URL('../db/postgres/070_dev121_principal_role_catalog_v5.sql',import.meta.url),'utf8'),source,read('config/access-control/jenfu-role-catalog.v6.json'))
 const branch=actual.indexOf("IF current_version = previous_version")
 const insert=actual.indexOf("INSERT INTO ai_pdm_core.role_catalog_publications")
 const guard=actual.indexOf("(SELECT contract_version FROM ai_pdm_core.role_catalog_publications WHERE catalog_version=next_version)")
 assert.ok(branch>=0 && insert>branch && guard>insert)
 assert.equal(actual.split("catalog_version=next_version) IS DISTINCT FROM catalog->>'contractVersion'").length,2)
 assert.ok(actual.includes("DEV121_CATALOG_V5_BASELINE_MISMATCH")&&actual.includes("DEV121_CATALOG_V6_READBACK_FAILED"))
})
