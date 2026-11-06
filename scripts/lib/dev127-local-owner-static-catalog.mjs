import {readFileSync} from 'node:fs'
import {canonicalCatalog} from './jms-dev-005-role-catalog.mjs'
import {hash,fail,inspectLocalDev127Catalog} from './dev127-local-owner-sql.mjs'
import v7 from '../../config/access-control/jenfu-role-catalog.v7.json' with {type:'json'}
import v8 from '../../config/access-control/jenfu-role-catalog.v8.json' with {type:'json'}
import policy from '../../config/access-control/dev127-protected-policy-source.v1.json' with {type:'json'}
import registry from '../../config/access-control/role-policy-editor-registry.v3.json' with {type:'json'}

export const STATIC_V8_MIGRATION='db/postgres/local/098_dev127_static_admin_catalog_v8.sql'
export const STATIC_V8_LEDGER='ai-pdm-local-dev127-static-admin-v8-v1'
export const STATIC_V8_KIND='STATIC_ADDITIVE_APPLICATION_ADMIN_V8'
export const staticV8Profiles=[...v7.roles.map((role,index)=>({stableRoleId:role.stableRoleId,permissionRoleId:role.stableRoleId,
  presentationName:role.displayName,presentationOrder:index,assignmentDisposition:role.stableRoleId==='role-system-admin'?'hidden-protected':'selectable'})),registry.roleProfiles[9]]
export const staticV8Payload={catalog:v8,roleProfiles:staticV8Profiles}
const staticDiff={preservedLegacyRoles:9,changedLegacyPermissions:0,changedLegacyProfiles:0,addedProtectedRole:'role-application-system-admin',businessPolicyPublished:false}
const equal=(a,b)=>hash(a)===hash(b)
export function assertStaticV8Source() {
  if(v8.roles.length!==10 || !equal(v8.roles.slice(0,9),v7.roles) || !equal(v8.roles[9],policy.applicationAdministratorRole) ||
    hash(canonicalCatalog(v8))!==v8.catalogSha256)fail('STATIC_V8_SOURCE_INVALID')
  return staticV8Payload
}
const requestCore=plan=>({operation:STATIC_V8_KIND,commandId:plan.commandId,sourceRevision:plan.sourceRevision,
  bindingSha256:plan.bindingSha256,expectedActive:plan.expectedActive,catalogPayloadSha256:hash(staticV8Payload)})
function verifiedCurrentV8({catalogRows,publications,identities}) {
  if(publications.length!==1 || publications[0].catalog_version!==v8.catalogVersion || publications[0].catalog_sha256!==v8.catalogSha256 ||
    publications[0].status!=='active' || publications[0].publication_format!=='legacy-static-v1' ||
    publications[0].application_id!=='ai-pdm' || publications[0].contract_version!==v8.contractVersion ||
    publications[0].publication_catalog_version!==v8.catalogVersion || publications[0].base_catalog_version!==v7.catalogVersion ||
    publications[0].base_catalog_sha256!==v7.catalogSha256 || publications[0].role_profile_schema_id!=='ai-pdm.static-role-profiles.v1' ||
    publications[0].role_profile_hash!==hash(staticV8Profiles) ||
    ['canonicalization_version','role_schema_id','baseline_role_identity_hash','role_identity_hash','protected_policy_hash','registry_hash'].some(key=>publications[0][key]!==null) ||
    !equal(publications[0].role_profiles,staticV8Profiles) || catalogRows.length!==10 || identities.length!==10)return false
  const fields={stableRoleId:'stable_role_id',roleCode:'role_code',displayName:'display_name',assignable:'assignable',risk:'risk',
    subjectKind:'subject_kind',recommendationAllowed:'recommendation_allowed',delegationAllowed:'delegation_allowed',
    allowedScopeKinds:'allowed_scope_kinds',assignmentTier:'assignment_tier',permissions:'permissions',metadata:'metadata',roleDefinitionHash:'role_definition_hash'}
  return v8.roles.every((role,index)=>{
    const row=catalogRows[index],profile=staticV8Profiles[index],claim=identities.find(value=>value.stable_role_id===role.stableRoleId)
    const {permissions:_p,roleDefinitionHash:_h,roleStatus:_s,...identity}=role;identity.metadata??=null
    return row && Object.entries(fields).every(([key,column])=>equal(row[column]??null,role[key]??null)) &&
      row.display_order===index && row.role_status==='active' && row.lifecycle==='active' && row.publication_format==='legacy-static-v1' &&
      row.catalog_version===v8.catalogVersion && row.catalog_sha256===v8.catalogSha256 && row.application_id==='ai-pdm' &&
      row.permission_role_id===profile.permissionRoleId && row.presentation_name===profile.presentationName &&
      row.presentation_order===profile.presentationOrder && row.assignment_disposition===profile.assignmentDisposition &&
      claim && equal(claim.identity_json,identity) && claim.identity_hash===hash(identity) &&
      claim.first_catalog_version===(index<9?v7.catalogVersion:v8.catalogVersion)
  })
}
export async function planLocalStaticV8(database,{commandId,sourceRevision,bindingSha256}) {
  assertStaticV8Source()
  const inspected=await inspectLocalDev127Catalog(database)
  const {summary}=inspected
  const alreadyCurrent=verifiedCurrentV8(inspected.snapshot)
  if(!alreadyCurrent && (!Object.values(summary.sourceV7).filter(value=>typeof value==='boolean').every(Boolean) ||
    summary.counts.dynamic_publications!==0 || summary.counts.open_drafts!==0 || summary.counts.commands!==0 ||
    summary.active.publicationFormatIsNull!==true || summary.active.roleProfilesIsNull!==true))fail('STATIC_V7_BASELINE_REQUIRED')
  const core={schemaVersion:'ai-pdm.dev127.local-static-catalog-plan.v1',operation:STATIC_V8_KIND,state:alreadyCurrent?'ALREADY_CURRENT':'PLANNED',
    commandId,sourceRevision,bindingSha256,expectedActive:{catalogVersion:alreadyCurrent?v8.catalogVersion:v7.catalogVersion,catalogSha256:alreadyCurrent?v8.catalogSha256:v7.catalogSha256},
    catalogPayloadSha256:hash(staticV8Payload),snapshotSha256:summary.snapshotSha256,
    migrationSha256:hash(readFileSync(new URL('../../'+STATIC_V8_MIGRATION,import.meta.url))),
    resultingActive:{catalogVersion:v8.catalogVersion,catalogSha256:v8.catalogSha256},
    diff:staticDiff}
  const plan={...core,requestHash:hash(requestCore(core))}
  return {...plan,planSha256:hash(plan)}
}
export function assertLocalStaticV8Plan(plan) {
  const {planSha256,...core}=plan??{}
  const keys=['schemaVersion','operation','state','commandId','sourceRevision','bindingSha256','expectedActive','catalogPayloadSha256',
    'snapshotSha256','migrationSha256','resultingActive','diff','requestHash','planSha256'].sort()
  if(plan?.schemaVersion!=='ai-pdm.dev127.local-static-catalog-plan.v1' || plan.operation!==STATIC_V8_KIND || !['PLANNED','ALREADY_CURRENT'].includes(plan.state) ||
    !equal(Object.keys(plan).sort(),keys) || !/^[a-f0-9]{40}$/u.test(plan.sourceRevision??'') ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(plan.commandId??'') ||
    ['bindingSha256','snapshotSha256','migrationSha256'].some(key=>!/^[a-f0-9]{64}$/u.test(plan[key]??'')) ||
    !equal(plan.diff,staticDiff) ||
    planSha256!==hash(core) || plan.catalogPayloadSha256!==hash(assertStaticV8Source()) || plan.requestHash!==hash(requestCore(plan)) ||
    !equal(plan.expectedActive,plan.state==='PLANNED'?{catalogVersion:v7.catalogVersion,catalogSha256:v7.catalogSha256}:{catalogVersion:v8.catalogVersion,catalogSha256:v8.catalogSha256}) ||
    !equal(plan.resultingActive,{catalogVersion:v8.catalogVersion,catalogSha256:v8.catalogSha256}))fail('STATIC_V8_PLAN_INVALID')
  return plan
}
export async function readLocalStaticV8Receipt(database,plan) {
  assertLocalStaticV8Plan(plan)
  await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    await database.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
    const {rows:[relation]}=await database.query("SELECT to_regclass('ai_pdm_core.dev127_static_catalog_commands')::text AS name")
    if(!relation?.name){await database.query('COMMIT');return null}
    const {rows}=await database.query('SELECT request_hash,source_revision,binding_sha256,result_json FROM ai_pdm_core.dev127_static_catalog_commands WHERE request_id=$1',[plan.commandId])
    const ledger=(await database.query('SELECT btrim(checksum_sha256) AS checksum,source_revision FROM ai_pdm_core.schema_migrations WHERE version=$1',[STATIC_V8_LEDGER])).rows
    await database.query('COMMIT')
    if(!rows.length)return null
    const row=rows[0]
    if(rows.length!==1 || ledger.length!==1 || ledger[0].checksum!==plan.migrationSha256 || ledger[0].source_revision!==plan.sourceRevision ||
      row.request_hash!==plan.requestHash || row.source_revision!==plan.sourceRevision ||
      row.binding_sha256!==plan.bindingSha256 || !equal(row.result_json?.active,plan.resultingActive) ||
      row.result_json?.commandId!==plan.commandId || row.result_json?.status!=='ACTIVE')fail('STATIC_V8_RECEIPT_INVALID')
    return row.result_json
  }catch(error){await database.query('ROLLBACK').catch(()=>{});throw error}
}
export async function commitLocalStaticV8({database,plan,migrationSql,revalidate,readAfterUnknown}) {
  assertLocalStaticV8Plan(plan)
  if(plan.state!=='PLANNED')fail('STATIC_V8_READ_ONLY_CURRENT')
  if(hash(migrationSql)!==plan.migrationSha256)fail('STATIC_V8_SOURCE_CHANGED')
  const original=await readLocalStaticV8Receipt(database,plan)
  if(original)return {state:'SUCCEEDED',result:original,disposition:'ORIGINAL_STATIC_COMMAND_REPLAY'}
  await database.query('BEGIN ISOLATION LEVEL READ COMMITTED')
  let commitStarted=false
  try {
    await database.query("SELECT pg_advisory_xact_lock(hashtext('ai-pdm-dev127-local-owner'))")
    await revalidate(database)
    await database.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
    const {rows}=await database.query('SELECT name,btrim(checksum_sha256) AS checksum FROM ai_pdm_core.schema_migrations WHERE version=$1',[STATIC_V8_LEDGER])
    if(rows.length)fail('STATIC_V8_LEDGER_CONFLICT')
    await database.query(migrationSql)
    await database.query('INSERT INTO ai_pdm_core.schema_migrations(version,name,checksum_sha256,source_revision) VALUES($1,$2,$3,$4)',
      [STATIC_V8_LEDGER,'dev127_static_admin_catalog_v8',plan.migrationSha256,plan.sourceRevision])
    const {rows:[row]}=await database.query('SELECT ai_pdm_core.dev127_publish_static_v8($1::uuid,$2,$3,$4,$5) AS result',
      [plan.commandId,plan.sourceRevision,plan.bindingSha256,plan.expectedActive.catalogVersion,plan.expectedActive.catalogSha256])
    commitStarted=true
    await database.query('COMMIT')
    return {state:'SUCCEEDED',result:row.result,disposition:'STATIC_ADDITIVE_APPLICATION_ADMIN_V8'}
  }catch(error){
    await database.query('ROLLBACK').catch(()=>{})
    if(!commitStarted || ['40001','22023','23505','42501'].includes(error?.code))throw error
    let receipt
    try{receipt=await readAfterUnknown(plan)}catch{fail('STATIC_V8_COMMIT_OUTCOME_UNKNOWN')}
    if(receipt)return{state:'SUCCEEDED',result:receipt,disposition:'UNKNOWN_COMMIT_CONFIRMED_BY_STATIC_RECEIPT'}
    fail('STATIC_V8_COMMIT_OUTCOME_UNKNOWN')
  }
}
