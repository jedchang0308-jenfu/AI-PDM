import { readFileSync } from 'node:fs'
import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'
import source from '../../config/access-control/dev127-protected-policy-source.v1.json' with { type: 'json' }
import registry from '../../config/access-control/role-policy-editor-registry.v3.json' with { type: 'json' }

export const DEV127_OPERATION = 'ai-pdm.role-policy-catalog-upgrade-operation.v1'
export const DEV127_RECEIPT = 'ai-pdm.role-policy-catalog-upgrade-receipt.v1'
export const DEV127_SOURCE_POLICY_SHA256 = sha256(readFileSync(new URL('../../config/access-control/dev127-protected-policy-source.v1.json', import.meta.url)))
export const DEV127_JOB = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner'
export const DEV127_SERVICE = 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod'
export const DEV127_BUCKET = 'jenfu-platform-prod-aipdm-release'
export const DEV127_MIGRATOR = 'aipdm-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com'
const H40 = /^[a-f0-9]{40}$/u, H64 = /^[a-f0-9]{64}$/u
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
const fail = code => { throw Object.assign(new Error(code), { code }) }
const json = value => typeof value === 'string' ? JSON.parse(value) : value
const same = (left,right) => canonicalize(left) === canonicalize(right)
const hash = value => sha256(canonicalize(value))
const permissionOrder = (left,right) => `${left.kind}:${left.code}` < `${right.kind}:${right.code}` ? -1 : `${left.kind}:${left.code}` > `${right.kind}:${right.code}` ? 1 : 0
function identity(role) {
  return {stableRoleId:role.stableRoleId,roleCode:role.roleCode,displayName:role.displayName,assignable:role.assignable,
    risk:role.risk,subjectKind:role.subjectKind,recommendationAllowed:role.recommendationAllowed,delegationAllowed:role.delegationAllowed,
    allowedScopeKinds:[...role.allowedScopeKinds].sort(),assignmentTier:role.assignmentTier,metadata:role.metadata??null}
}
export function dev127CommandId(intentRef) {
  if (!H64.test(intentRef?.sha256??'')) fail('DEV127_CAPSULE_BINDING_INVALID')
  const value=hash({operation:'DEV-127-owner-catalog-upgrade',intentRef}).slice(0,32).split('')
  value[12]='5';value[16]=((parseInt(value[16],16)&3)|8).toString(16)
  const text=value.join('')
  return `${text.slice(0,8)}-${text.slice(8,12)}-${text.slice(12,16)}-${text.slice(16,20)}-${text.slice(20)}`
}
export function buildDev127UpgradeCandidate(rows, commandId) {
  if (!uuid.test(commandId??'') || !Array.isArray(rows) || rows.length<9 || rows.length>65) fail('DEV127_CATALOG_SOURCE_INVALID')
  const first=rows[0]
  if (!['dynamic-policy-v1','dynamic-policy-v2'].includes(first.publication_format) || !H64.test(String(first.catalog_sha256))) fail('DEV127_DYNAMIC_CATALOG_REQUIRED')
  const tuple={catalogVersion:first.catalog_version,catalogSha256:String(first.catalog_sha256)}
  const roles=[],profiles=[]
  for(const [index,row] of rows.entries()) {
    if (row.application_id!=='ai-pdm' || row.contract_version!=='jenfu.platform-entitlement.v1' || Number(row.display_order)!==index ||
        row.catalog_version!==tuple.catalogVersion || String(row.catalog_sha256)!==tuple.catalogSha256 || row.publication_format!==first.publication_format) fail('DEV127_CATALOG_SOURCE_INVALID')
    const role={stableRoleId:row.stable_role_id,roleCode:row.role_code,displayName:row.display_name,assignable:row.assignable,
      risk:row.risk,subjectKind:row.subject_kind,recommendationAllowed:row.recommendation_allowed,delegationAllowed:row.delegation_allowed,
      allowedScopeKinds:json(row.allowed_scope_kinds),assignmentTier:row.assignment_tier,metadata:json(row.metadata),
      permissions:json(row.permissions),roleStatus:row.role_status}
    const normalized={...identity(role),roleStatus:role.roleStatus,permissions:[...role.permissions].sort(permissionOrder)}
    const complete={...normalized,roleDefinitionHash:hash(normalized)}
    if(complete.roleDefinitionHash!==String(row.role_definition_hash)) fail('DEV127_CATALOG_ROLE_HASH_INVALID')
    roles.push(complete)
    profiles.push({stableRoleId:row.stable_role_id,permissionRoleId:row.permission_role_id,presentationName:row.presentation_name,
      presentationOrder:Number(row.presentation_order),assignmentDisposition:row.assignment_disposition})
  }
  const administrator=roles.find(role=>role.stableRoleId==='role-application-system-admin')
  if(administrator) {
    if(!same(administrator,source.applicationAdministratorRole) || !same(profiles.find(profile=>profile.stableRoleId===administrator.stableRoleId),registry.roleProfiles[9])) fail('DEV127_PROTECTED_ROLE_CONFLICT')
  } else {
    if(first.publication_format!=='dynamic-policy-v1') fail('DEV127_PROTECTED_ROLE_MISSING')
    roles.push(source.applicationAdministratorRole);profiles.push(registry.roleProfiles[9])
  }
  const core={format:'dynamic-policy-v2',applicationId:'ai-pdm',candidateCatalogVersion:administrator?tuple.catalogVersion:'ai-pdm.role-policy.'+commandId,
    roleSchemaId:registry.roleSchemaId,roleProfileSchemaId:registry.roleProfileSchemaId,registryHash:source.registryHash,
    baselineRoleIdentityHash:source.baselineRoleIdentityHash,roleIdentityHash:hash(roles.map(identity)),roleProfileHash:hash(profiles),
    protectedPolicyHash:source.protectedPolicyHash,roles,roleProfiles:profiles}
  const candidate={...core,identityHashes:Object.fromEntries(roles.map(role=>[role.stableRoleId,hash(identity(role))])),contentHash:hash(core)}
  if(administrator && candidate.contentHash!==tuple.catalogSha256) fail('DEV127_CATALOG_CONTENT_HASH_INVALID')
  return {state:administrator?'ALREADY_CURRENT':'PLANNED',expectedActive:tuple,candidate,candidateSha256:hash(candidate)}
}
export function dev127UpgradeRequestHash(plan) {
  return hash({operation:'DEV-127-upgrade-v2',expectedCatalogVersion:plan.expectedActive.catalogVersion,
    expectedCatalogSha256:plan.expectedActive.catalogSha256,candidate:plan.candidate})
}
export function assertDev127Operation(value, {bytes,sha256:expectedSha256,sourceRevision,runnerSourceRevision,outputRef}) {
  const keys=['schemaVersion','phase','ownerApplicationId','sourceRevision','migrationRunnerSourceRevision','migrationRunnerDigest',
    'releaseCapsuleRef','deploymentCapsuleRef','basisRef','commandId','planReceiptRef','sourcePolicySha256','outputRef'].sort()
  if(!Buffer.isBuffer(bytes)||sha256(bytes)!==expectedSha256 || !same(Object.keys(value??{}).sort(),keys) ||
    value.schemaVersion!==DEV127_OPERATION || value.ownerApplicationId!=='ai-pdm' || !['plan','commit','status'].includes(value.phase) ||
    !H40.test(sourceRevision??'') || value.sourceRevision!==sourceRevision || value.migrationRunnerSourceRevision!==runnerSourceRevision ||
    !H40.test(runnerSourceRevision??'') || value.sourcePolicySha256!==DEV127_SOURCE_POLICY_SHA256 ||
    !/^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/aipdm-release\/ai-pdm-migration-runner@sha256:[a-f0-9]{64}$/u.test(value.migrationRunnerDigest??'') ||
    value.commandId!==dev127CommandId(value.releaseCapsuleRef) || value.outputRef!==outputRef) fail('DEV127_OPERATION_BINDING_INVALID')
  for(const ref of [value.releaseCapsuleRef,value.deploymentCapsuleRef,value.basisRef,...(value.planReceiptRef?[value.planReceiptRef]:[])]) {
    if(!same(Object.keys(ref??{}).sort(),['sha256','uri']) || !ref.uri?.startsWith(`gs://${DEV127_BUCKET}/receipts/`) || !H64.test(ref.sha256??'')) fail('DEV127_OPERATION_BINDING_INVALID')
  }
  if((value.phase==='plan')!==(value.planReceiptRef===null)) fail('DEV127_OPERATION_BINDING_INVALID')
  return value
}
export function assertDev127Plan(plan,operation) {
  if(plan?.schemaVersion!==DEV127_RECEIPT || plan.phase!=='plan' || !['PLANNED','ALREADY_CURRENT'].includes(plan.state) ||
    plan.commandId!==operation.commandId || plan.sourceRevision!==operation.sourceRevision ||
    !same(plan.releaseCapsuleRef,operation.releaseCapsuleRef) || plan.sourcePolicySha256!==DEV127_SOURCE_POLICY_SHA256 ||
    hash(plan.candidate)!==plan.candidateSha256 || !H64.test(plan.expectedActive?.catalogSha256??'') ||
    plan.requestHash!==dev127UpgradeRequestHash(plan)) fail('DEV127_PLAN_BINDING_INVALID')
  return plan
}
export async function readDev127CommandReceipt(database,plan,commandId) {
  await database.query('BEGIN READ ONLY')
  let rows
  try {
    await database.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
    ;({rows}=await database.query('SELECT actor_principal_id,request_hash,result_json FROM ai_pdm_core.role_policy_commands WHERE request_id=$1',[commandId]))
    await database.query('COMMIT')
  }catch(error){await database.query('ROLLBACK').catch(()=>{});throw error}
  if(rows.length>1) fail('DEV127_COMMAND_RECEIPT_INVALID')
  if(!rows.length)return null
  const row=rows[0]
  if(row.actor_principal_id!=='owner:DEV-127' || String(row.request_hash)!==plan.requestHash)fail('DEV127_COMMAND_ID_REUSE')
  const result=json(row.result_json)
  if(result?.status!=='ACTIVE' || result.applyCommandId!==commandId || result.catalogVersion!==plan.candidate.candidateCatalogVersion || result.catalogSha256!==plan.candidate.contentHash)fail('DEV127_COMMAND_RECEIPT_INVALID')
  return result
}
export async function executeDev127CatalogSql({database,operation,plan=null,readAfterUnknown}) {
  if(operation.phase==='plan') {
    await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    try {
      await database.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
      const {rows}=await database.query('SELECT * FROM ai_pdm_contract.v_application_role_catalog_v3 ORDER BY display_order')
      const result=buildDev127UpgradeCandidate(rows,operation.commandId)
      await database.query('SELECT ai_pdm_core.dev127_assert_candidate_v2($1::jsonb)',[JSON.stringify(result.candidate)])
      await database.query('COMMIT')
      return {...result,requestHash:dev127UpgradeRequestHash(result)}
    } catch(error){await database.query('ROLLBACK').catch(()=>{});throw error}
  }
  assertDev127Plan(plan,operation)
  const prior=await readDev127CommandReceipt(database,plan,operation.commandId)
  if(prior)return{state:'SUCCEEDED',result:prior,disposition:'ORIGINAL_COMMAND_REPLAY'}
  if(operation.phase==='status')return{state:'NOT_COMMITTED',result:null,disposition:'READ_ONLY_COMMAND_STATUS'}
  if(plan.state==='ALREADY_CURRENT') {
    const current=await executeDev127CatalogSql({database,operation:{...operation,phase:'plan'}})
    if(current.state!=='ALREADY_CURRENT')fail('DEV127_PROTECTED_ROLE_MISSING')
    return{state:'ALREADY_CURRENT',result:current.expectedActive,disposition:'READ_ONLY_CURRENT_CATALOG'}
  }
  let commitStarted=false
  try {
    await database.query('BEGIN ISOLATION LEVEL READ COMMITTED')
    await database.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
    const {rows:[row]}=await database.query('SELECT ai_pdm_core.role_policy_upgrade_v2($1,$2,$3,$4::jsonb) AS result',
      [operation.commandId,plan.expectedActive.catalogVersion,plan.expectedActive.catalogSha256,JSON.stringify(plan.candidate)])
    commitStarted=true
    await database.query('COMMIT')
    return{state:'SUCCEEDED',result:row.result,disposition:'FORWARD_ADDITIVE_CATALOG_UPGRADE'}
  }catch(error){
    await database.query('ROLLBACK').catch(()=>{})
    if(!commitStarted || ['40001','22023','23505','42501'].includes(error?.code))throw error
    const readback=await readAfterUnknown(plan,operation.commandId)
    if(readback)return{state:'SUCCEEDED',result:readback,disposition:'UNKNOWN_COMMIT_CONFIRMED_BY_PG_RECEIPT'}
    fail('DEV127_COMMIT_OUTCOME_UNKNOWN')
  }
}
