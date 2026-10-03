import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { assertExpectedPlanInputs } from './dev010-n1c-terraform-plan-contract.mjs';

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
function fields(row,values,{configuration,creating=false}={}) {
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
      for(const name of ['lifecycle_rule','retention_policy','cors']) absentField(name);
      // The provider computes an absent website block on first create. Never
      // accept a configured website or an unknown value on an existing bucket.
      if(creating && row.change.after_unknown?.website===true && configuration && !Object.hasOwn(configuration.expressions??{},'website')) {
        if(values.website!=null && (!Array.isArray(values.website)||values.website.length)) fail('website');
      } else absentField('website');
      if(unknown(row.change.after_unknown?.requester_pays) || values?.requester_pays===true) fail('requester_pays');
      if(unknown(row.change.after_unknown?.versioning) || !Array.isArray(values?.versioning) || values.versioning.length!==1 || values.versioning[0].enabled!==false) fail('versioning');
      break;
    case addresses[3]:
      checkField('project',target.projectId); checkField('role_id','aipdmBusinessImmutableObjects'); checkField('stage','GA');
      if(unknown(row.change.after_unknown?.permissions) || !Array.isArray(values?.permissions)) fail('permissions');
      same([...values.permissions].sort(),permissions,'permissions');
      if((!creating && values.deleted!==false) || values.deleted===true || (unknown(row.change.after_unknown?.deleted) && !(creating && row.change.after_unknown.deleted===true))) fail('role_deleted');
      break;
    case addresses[4]: checkField('bucket',target.bucket); checkField('role',role); checkField('member',`serviceAccount:${target.runtimeIdentity}`); absentField('condition'); break;
    default: fail('address');
  }
}

const dataAddresses=addresses.slice(0,2);
const managedAddresses=addresses.slice(2);
const googleProvider='registry.terraform.io/hashicorp/google';

function assertProfile(profile) {
  if(profile?.schemaVersion!=='jenfu.dev121.business-storage-plan.v1' || profile.ownerApplicationId!=='ai-pdm' || profile.terraformRoot!=='infra/google-cloud/dev-121-business-storage' || profile.backendKey!=='dev-121/business-storage/default.tfstate' || profile.backendBucket!=='tfstate-jenfu-platform-prod') fail('profile');
  for(const [key,value] of Object.entries(target)) same(profile.target?.[key],value,'target:'+key);
  same(profile.profiles?.BUSINESS_STORAGE?.addresses,addresses,'profile_addresses');
  same(profile.provenanceVariables,inputs,'provenance_variables');
  same([...(profile.permissions??[])].sort(),permissions,'profile_permissions');
  same(profile.softDeleteSeconds,2592000,'profile_soft_delete');
}
function rows(module,label,{required=[],configuration=false}={}) {
  if(!module || module.child_modules?.length || Object.keys(module.module_calls??{}).length || !Array.isArray(module.resources)) fail(label+':root_module');
  const result=new Map();
  for(const row of module.resources) {
    if(!addresses.includes(row.address)) fail(label+':UNKNOWN_RESOURCE');
    if(result.has(row.address)) fail(label+':DUPLICATE');
    const data=row.address.startsWith('data.');
    const parts=row.address.split('.');
    if(row.mode!==(data?'data':'managed') || row.type!==parts[data?1:0] || row.name!==parts[data?2:1]) fail(label+':identity');
    if(configuration ? row.provider_config_key!=='google' : row.provider_name!==googleProvider) fail(label+':provider');
    result.set(row.address,row);
  }
  for(const address of required) if(!result.has(address)) fail(label+':PROFILE_MISMATCH');
  return result;
}
function observedFields(row) {
  fields({address:row.address,change:{after_unknown:{}}},row.values);
}

/** The real plan has separate configuration, observations and changes. Already
 * read data sources need not appear in resource_changes. All five declarations,
 * both resolved data facts and exactly three safe managed changes remain required.
 * This checks content only; source/provenance/binary/deadline are owner proofs.
 */
export function assertDev121BusinessStoragePlan(plan,{profile,expectedInputs}={}) {
  assertProfile(profile);
  for(const name of inputs) {
    const expression=name==='source_revision'?/^[a-f0-9]{40}$/u:name.endsWith('_digest')?/^sha256:[a-f0-9]{64}$/u:/^[a-f0-9]{64}$/u;
    if(!expression.test(expectedInputs?.[name]??'')) fail('input:'+name);
  }
  assertExpectedPlanInputs(plan,expectedInputs,inputs);
  if(plan.complete!==true || plan.errored!==false) fail('incomplete_plan');
  const config=rows(plan.configuration?.root_module,'configuration',{required:addresses,configuration:true});
  const bucketConfig=config.get(addresses[2]).expressions;
  if(!bucketConfig || Object.hasOwn(bucketConfig,'website')) fail('configured_website');
  same(bucketConfig.versioning,[{enabled:{constant_value:false}}],'configured_versioning');
  const prior=rows(plan.prior_state?.values?.root_module,'prior_state',{required:dataAddresses});
  const planned=rows(plan.planned_values?.root_module,'planned_values',{required:managedAddresses});
  if(!Array.isArray(plan.resource_changes)) fail('raw_plan_required');
  const changes=new Map();
  for(const row of plan.resource_changes) {
    if(!addresses.includes(row.address)) fail('changes:UNKNOWN_RESOURCE');
    if(changes.has(row.address)) fail('changes:DUPLICATE');
    const declaration=config.get(row.address);
    if(row.mode!==declaration.mode || row.type!==declaration.type || row.name!==declaration.name || row.provider_name!==googleProvider) fail('changes:identity');
    const action=row.change?.actions;
    if(!Array.isArray(action) || action.length!==1 || !(row.mode==='data'?['read','no-op']:['create','no-op']).includes(action[0])) fail('DESTROY_OR_REPLACE_FORBIDDEN');
    if(action[0]==='create' && (row.change.before!=null || prior.has(row.address))) fail('create_existing_resource');
    fields(row,row.change.after,{configuration:declaration,creating:action[0]==='create'});
    if(action[0]==='no-op') {
      if(!prior.has(row.address)) fail('no_op_prior_missing');
      fields(row,row.change.before);
    }
    changes.set(row.address,row);
  }
  for(const address of managedAddresses) if(!changes.has(address)) fail('changes:PROFILE_MISMATCH');
  for(const [address,row] of prior) {
    observedFields(row);
    if(row.mode==='managed' && changes.get(address)?.change.actions[0]!=='no-op') fail('prior_managed_action');
  }
  for(const [address,row] of planned) {
    if(row.mode==='data') observedFields(row);
    else {
      const change=changes.get(address);
      fields(change,row.values,{configuration:config.get(address),creating:change.change.actions[0]==='create'});
      // Both views must describe the same planned resource, not parallel inputs.
      if(!isDeepStrictEqual(row.values,change.change.after)) fail('planned_change_mismatch');
    }
  }
  for(const address of dataAddresses) {
    const facts=[prior.get(address),planned.get(address)].filter(Boolean);
    if(changes.has(address)) facts.push({address,values:changes.get(address).change.after});
    for(const fact of facts) observedFields(fact);
  }
  return {status:'PLAN_CONTENT_PASS',profile:'BUSINESS_STORAGE',allowedAddressCount:addresses.length,
    changeCount:changes.size,observedAddresses:[...config.keys()].sort(),
    planContentSha256:createHash('sha256').update(JSON.stringify(plan)).digest('hex'),releaseAuthority:false,providerProvenanceVerified:false};
}

/** Completed Terraform state is an observation, not a synthetic no-op plan. */
export function assertDev121BusinessStorageState(state,{profile}={}) {
  assertProfile(profile);
  const resources=rows(state?.values?.root_module,'state',{required:addresses});
  for(const row of resources.values()) observedFields(row);
  return {status:'STATE_CONTENT_PASS',observedAddresses:[...resources.keys()].sort(),releaseAuthority:false};
}
