import { createHash } from 'node:crypto';
import { assertPlanProfile, assertExpectedPlanInputs } from './dev010-n1c-terraform-plan-contract.mjs';

const target = Object.freeze({projectId:'jenfu-platform-prod',projectNumber:'9536592944',region:'asia-east1',bucket:'jenfu-platform-prod-aipdm-files',runtimeIdentity:'aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com'});
const addresses = ['data.google_project.current','data.google_service_account.runtime','google_storage_bucket.business','google_project_iam_custom_role.business_objects','google_storage_bucket_iam_member.runtime_objects'];
const inputs = ['source_revision','foundation_manifest_sha256','application_image_digest','migration_runner_image_digest'];
const permissions = ['storage.objects.create','storage.objects.get'];
const role = 'projects/jenfu-platform-prod/roles/aipdmBusinessImmutableObjects';
export { target as BUSINESS_STORAGE_TARGET, permissions as BUSINESS_STORAGE_PERMISSIONS, role as BUSINESS_STORAGE_ROLE };
function fail(field) { throw new Error(`DEV121_BUSINESS_STORAGE_PLAN_INVALID:${field}`); }
function same(actual,expected,field) { if(JSON.stringify(actual)!==JSON.stringify(expected)) fail(field); }
function unknown(value) { if(value==null || value===false) return false; if(value===true || typeof value!=='object') return true; return Object.values(value).some(unknown); }
function check(row,field,expected,values=row.change.after) {
  if(unknown(row.change.after_unknown?.[field])) fail(`unknown:${row.address}:${field}`);
  same(values?.[field],expected,`${row.address}:${field}`);
}
function absent(row,field,values=row.change.after) {
  if(unknown(row.change.after_unknown?.[field])) fail(`unknown:${row.address}:${field}`);
  const value=values?.[field];
  if(value!=null && !(Array.isArray(value)&&value.length===0)) fail(`${row.address}:${field}`);
}
function fields(row,values) {
  const checkField=(name,value)=>check(row,name,value,values);
  const absentField=name=>absent(row,name,values);
  switch(row.address) {
    case addresses[0]: checkField('project_id',target.projectId); checkField('number',target.projectNumber); break;
    case addresses[1]: checkField('project',target.projectId); checkField('account_id','aipdm-prod-runtime'); checkField('email',target.runtimeIdentity); break;
    case addresses[2]:
      checkField('project',target.projectId); checkField('name',target.bucket); checkField('location','ASIA-EAST1'); checkField('storage_class','STANDARD');
      checkField('uniform_bucket_level_access',true); checkField('public_access_prevention','enforced'); checkField('force_destroy',false);
      const soft=values?.soft_delete_policy;
      const softUnknown=row.change.after_unknown?.soft_delete_policy;
      if(softUnknown!=null && softUnknown!==false && !Array.isArray(softUnknown) || Array.isArray(softUnknown)&&softUnknown.some(value=>unknown(value?.retention_duration_seconds)) || !Array.isArray(soft) || soft.length!==1 || soft[0].retention_duration_seconds!==2592000) fail('soft_delete_policy');
      for(const name of ['lifecycle_rule','retention_policy','website','cors']) absentField(name);
      if(unknown(row.change.after_unknown?.requester_pays) || values?.requester_pays===true) fail('requester_pays');
      if(unknown(row.change.after_unknown?.versioning) || values?.versioning?.some(value=>value.enabled===true)) fail('versioning');
      break;
    case addresses[3]:
      checkField('project',target.projectId); checkField('role_id','aipdmBusinessImmutableObjects'); checkField('stage','GA');
      if(unknown(row.change.after_unknown?.permissions) || !Array.isArray(values?.permissions)) fail('permissions');
      same([...values.permissions].sort(),permissions,'permissions');
      if(values.deleted===true || unknown(row.change.after_unknown?.deleted)) fail('role_deleted');
      break;
    case addresses[4]: checkField('bucket',target.bucket); checkField('role',role); checkField('member',`serviceAccount:${target.runtimeIdentity}`); absentField('condition'); break;
    default: fail('address');
  }
}

/** Plan-content checking only. The operator must derive expectedInputs from verified
 * owner source/foundation/image readbacks, bind the saved plan digest and source files,
 * and produce live resource/effective-IAM evidence separately. CLI strings and synthetic
 * fixtures do not establish provenance, cost approval, backend ownership or release authority.
 */
export function assertDev121BusinessStoragePlan(plan,{profile,expectedInputs}={}) {
  if(profile?.schemaVersion!=='jenfu.dev121.business-storage-plan.v1' || profile.ownerApplicationId!=='ai-pdm' || profile.terraformRoot!=='infra/google-cloud/dev-121-business-storage' || profile.backendKey!=='dev-121/business-storage/default.tfstate' || profile.backendBucket!=='tfstate-jenfu-platform-prod') fail('profile');
  for(const [key,value] of Object.entries(target)) same(profile.target?.[key],value,`target:${key}`);
  same(profile.profiles?.BUSINESS_STORAGE?.addresses,addresses,'profile_addresses');
  same(profile.provenanceVariables,inputs,'provenance_variables');
  same([...(profile.permissions??[])].sort(),permissions,'profile_permissions');
  same(profile.softDeleteSeconds,2592000,'profile_soft_delete');
  for(const name of inputs) {
    const expression=name==='source_revision'?/^[a-f0-9]{40}$/u:name.endsWith('_digest')?/^sha256:[a-f0-9]{64}$/u:/^[a-f0-9]{64}$/u;
    if(!expression.test(expectedInputs?.[name]??'')) fail(`input:${name}`);
  }
  assertExpectedPlanInputs(plan,expectedInputs,inputs);
  const result=assertPlanProfile(plan,profile,'BUSINESS_STORAGE');
  if(!Array.isArray(plan.resource_changes)) fail('raw_plan_required');
  for(const row of plan.resource_changes) {
    const action=row.change?.actions;
    same(action,[row.address.startsWith('data.')?(action?.[0]==='no-op'?'no-op':'read'):(action?.[0]==='no-op'?'no-op':'create')],'action');
    fields(row,row.change.after);
    if(action[0]==='no-op') fields(row,row.change.before);
  }
  return {...result,status:'PLAN_CONTENT_PASS',planContentSha256:createHash('sha256').update(JSON.stringify(plan)).digest('hex'),releaseAuthority:false,providerProvenanceVerified:false};
}
