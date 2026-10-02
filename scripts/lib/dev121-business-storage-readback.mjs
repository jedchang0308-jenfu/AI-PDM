import {createHash} from 'node:crypto';
import {BUSINESS_STORAGE_TARGET as target,BUSINESS_STORAGE_PERMISSIONS as permissions,BUSINESS_STORAGE_ROLE as role} from './dev121-business-storage-plan.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(field){throw new Error(`DEV121_BUSINESS_STORAGE_READBACK_INVALID:${field}`);}
function equal(actual,expected,field){if(JSON.stringify(actual)!==JSON.stringify(expected))fail(field);}

/** Fixed-target GETs only; getJson is the operator's transport, not a target override.
 * Own resource readback does not prove artifact provenance or inherited IAM.
 */
export async function collectDev121BusinessStorageReadback({getJson,observedAt=new Date().toISOString()}={}){
  if(typeof getJson!=='function' || !Number.isFinite(Date.parse(observedAt)))fail('input');
  const read=async(resource,url,{missing=false}={})=>{
    const result=await getJson(url);
    if(missing && result?.status===404)return null;
    if(result?.status!==200 || !result.body || typeof result.body!=='object' || Array.isArray(result.body))fail(`http:${resource}:${result?.status??'unavailable'}`);
    return result.body;
  };
  const project=await read('project',`https://cloudresourcemanager.googleapis.com/v1/projects/${target.projectId}?fields=projectId,projectNumber,parent`);
  equal(project.projectId,target.projectId,'project');equal(String(project.projectNumber),target.projectNumber,'project_number');
  const account=await read('runtime',`https://iam.googleapis.com/v1/projects/${target.projectId}/serviceAccounts/${encodeURIComponent(target.runtimeIdentity)}?fields=projectId,email,uniqueId,disabled`);
  equal(account.projectId,target.projectId,'runtime_project');equal(account.email,target.runtimeIdentity,'runtime_identity');
  if(account.disabled===true || typeof account.uniqueId!=='string' || !/^[0-9]+$/u.test(account.uniqueId))fail('runtime_disabled_or_unverified');
  const core={schemaVersion:'jenfu.dev121.business-storage-readback.v1',observedAt,target,runtimeUniqueId:account.uniqueId,
    ownResourcesVerified:false,effectiveInheritedIamVerified:false,artifactProvenanceVerified:false,releaseAuthority:false,cloudMutations:0};
  const bucket=await read('bucket',`https://storage.googleapis.com/storage/v1/b/${target.bucket}?fields=name,projectNumber,location,storageClass,iamConfiguration,softDeletePolicy,lifecycle,retentionPolicy,versioning,billing,metageneration`,{missing:true});
  if(!bucket)return {...core,status:'BUSINESS_STORAGE_NOT_PROVISIONED',missingResource:target.bucket};
  equal(bucket.name,target.bucket,'bucket');equal(String(bucket.projectNumber),target.projectNumber,'bucket_project');equal(bucket.location,'ASIA-EAST1','bucket_location');equal(bucket.storageClass,'STANDARD','storage_class');
  equal(bucket.iamConfiguration?.uniformBucketLevelAccess?.enabled,true,'uniform_access');equal(bucket.iamConfiguration?.publicAccessPrevention,'enforced','public_access');
  equal(String(bucket.softDeletePolicy?.retentionDurationSeconds),'2592000','soft_delete');
  if(bucket.lifecycle?.rule?.length || bucket.retentionPolicy || bucket.versioning?.enabled===true || bucket.billing?.requesterPays===true)fail('unexpected_lifecycle_policy');
  const roleValue=await read('role',`https://iam.googleapis.com/v1/${role}?fields=name,includedPermissions,stage,deleted,etag`);
  equal(roleValue.name,role,'role_name');equal(roleValue.stage,'GA','role_stage');
  if(roleValue.deleted===true || !Array.isArray(roleValue.includedPermissions))fail('role_state');
  equal([...roleValue.includedPermissions].sort(),permissions,'role_permissions');
  const policy=await read('bucket_iam',`https://storage.googleapis.com/storage/v1/b/${target.bucket}/iam?optionsRequestedPolicyVersion=3`);
  if(!Array.isArray(policy.bindings))fail('iam_bindings');
  const subject=`serviceAccount:${target.runtimeIdentity}`;
  const direct=[];
  for(const binding of policy.bindings){
    if(!Array.isArray(binding.members))fail('iam_members');
    if(binding.members.some(member=>['allUsers','allAuthenticatedUsers'].includes(member)))fail('public_iam');
    if(binding.members.includes(subject))direct.push(binding);
  }
  if(direct.length!==1 || direct[0].role!==role || direct[0].condition!=null)fail('runtime_bucket_grants');
  return {...core,status:'OWN_BUSINESS_STORAGE_RESOURCES_MATCH',ownResourcesVerified:true,
    evidenceHashes:{project:digest(project),runtime:digest(account),bucket:digest(bucket),role:digest(roleValue),bucketPolicy:digest(policy)},
    bucketMetageneration:String(bucket.metageneration??''),roleEtag:roleValue.etag??null,bucketPolicyEtag:policy.etag??null,
    runtimeBucketBinding:{role,member:subject,permissions},
    limitation:'Direct bucket binding only; project/ancestor/group IAM and source/plan/artifact provenance remain separate owner evidence.'};
}
