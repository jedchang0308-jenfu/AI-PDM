import {readGitBlob,assertPreparePrerequisites} from './dev012-owner-stage-executor.mjs';
import {releasePaths,assertImmutableRef} from './dev012-owner-release-runtime.mjs';
import {assertDev117V3Profile,assertDev117ReleaseIntent} from './dev117-ai-pdm-continuous-release.mjs';
import {readOwnerReleaseProof,verifyOwnerProviderReadback} from './dev121-owner-release-proof.mjs';
import {createHash} from 'node:crypto';
import {canonicalize,sha256,readGcsObject} from './dev012-production-migration-runner.mjs';
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

/** One missing artifact observation in the existing owner evidence chain.
 * A hash-bound provider infra receipt supplies the digest; no caller-entered image.
 * This proves image availability, not clean current source, cost or apply authority.
 */
export async function collectDev121MigrationImageReadback({infraRef,readObject,getJson,observedAt=new Date().toISOString()}={}){
  const bucket='jenfu-platform-prod-aipdm-release';
  if(!infraRef || JSON.stringify(Object.keys(infraRef).sort())!==JSON.stringify(['sha256','uri']) ||
    !new RegExp(`^gs://${bucket}/receipts/[A-Za-z0-9._/-]+\\.json$`,'u').test(infraRef.uri??'') ||
    !/^[a-f0-9]{64}$/u.test(infraRef.sha256??'') || typeof readObject!=='function' ||
    typeof getJson!=='function' || !Number.isFinite(Date.parse(observedAt)))fail('migration_input');
  const object=await readObject({uri:infraRef.uri,expectedBucket:bucket,expectedPrefix:'receipts'});
  if(!Buffer.isBuffer(object?.bytes) || sha256(object.bytes)!==infraRef.sha256 ||
    !/^[1-9][0-9]*$/u.test(String(object.generation??'')))fail('migration_infra_object');
  let receipt;
  try{receipt=JSON.parse(object.bytes.toString('utf8'));}catch{fail('migration_infra_json');}
  const core={...receipt};delete core.receiptSha256;
  if(receipt.schemaVersion!=='jenfu.dev012.app-infra-receipt.v1' || receipt.ownerApplicationId!=='ai-pdm' ||
    receipt.projectId!==target.projectId || receipt.region!==target.region || receipt.status!=='APPLIED' ||
    receipt.releaseAuthority!==true || receipt.evidenceScope!=='PRODUCTION_PROVIDER' ||
    receipt.receiptSha256!==sha256(canonicalize(core)) || !/^[a-f0-9]{40}$/u.test(receipt.sourceRevision??'') ||
    !/^[a-f0-9]{64}$/u.test(receipt.foundationManifestSha256??''))fail('migration_infra_receipt');
  const image='ai-pdm-migration-runner';
  const prefix=`asia-east1-docker.pkg.dev/${target.projectId}/aipdm-release/${image}@`;
  if(typeof receipt.migrationRunnerDigest!=='string' || !receipt.migrationRunnerDigest.startsWith(prefix) ||
    !/^sha256:[a-f0-9]{64}$/u.test(receipt.migrationRunnerDigest.slice(prefix.length)))fail('migration_image_owner');
  const digestValue=receipt.migrationRunnerDigest.slice(prefix.length);
  const parent=`projects/${target.projectId}/locations/${target.region}/repositories/aipdm-release/dockerImages/`;
  const name=`${parent}${image}@${digestValue}`;
  const response=await getJson(`https://artifactregistry.googleapis.com/v1/${parent}${encodeURIComponent(`${image}@${digestValue}`)}`);
  if(response?.status!==200 || response.body?.name!==name || response.body?.uri!==receipt.migrationRunnerDigest)fail('migration_image_readback');
  return {schemaVersion:'jenfu.dev121.migration-image-readback.v1',observedAt,ownerApplicationId:'ai-pdm',
    status:'MIGRATION_IMAGE_VERIFIED',infraRef,infraGeneration:String(object.generation),
    infraSourceRevision:receipt.sourceRevision,foundationManifestSha256:receipt.foundationManifestSha256,
    migrationRunnerDigest:receipt.migrationRunnerDigest,imageName:name,imageReadbackSha256:digest(response.body),
    artifactProvenanceVerified:false,releaseAuthority:false,cloudMutations:0,
    limitation:'Hash-bound prior provider infra and exact image availability only; current source/foundation/application image/saved plan remain separate owner proofs.'};
}

/** Read the existing provider foundation receipt; never create or apply foundation. */
export async function collectDev121FoundationReadback({foundationRef,readObject,observedAt=new Date().toISOString()}={}) {
  const bucket='jenfu-platform-prod-aipdm-release';
  if(!foundationRef || JSON.stringify(Object.keys(foundationRef).sort())!==JSON.stringify(['sha256','uri']) ||
    !new RegExp(`^gs://${bucket}/receipts/[A-Za-z0-9._/-]+\\.json$`,'u').test(foundationRef.uri??'') ||
    !/^[a-f0-9]{64}$/u.test(foundationRef.sha256??'') || typeof readObject!=='function' ||
    !Number.isFinite(Date.parse(observedAt)))fail('foundation_input');
  const object=await readObject({uri:foundationRef.uri,expectedBucket:bucket,expectedPrefix:'receipts'});
  if(!Buffer.isBuffer(object?.bytes) || sha256(object.bytes)!==foundationRef.sha256 ||
    !/^[1-9][0-9]*$/u.test(String(object.generation??'')))fail('foundation_object');
  let receipt;try{receipt=JSON.parse(object.bytes.toString('utf8'));}catch{fail('foundation_json');}
  const core={...receipt};delete core.receiptSha256;
  const manifest=receipt.foundationManifest;
  if(receipt.schemaVersion!=='jenfu.dev012.foundation-receipt.v1' || receipt.ownerApplicationId!=='shared-foundation' ||
    receipt.projectId!==target.projectId || receipt.region!==target.region || receipt.status!=='APPLIED' ||
    receipt.releaseAuthority!==true || receipt.evidenceScope!=='PRODUCTION_PROVIDER' ||
    receipt.receiptSha256!==sha256(canonicalize(core)) || !/^[a-f0-9]{40}$/u.test(receipt.sourceRevision??'') ||
    !manifest || Array.isArray(manifest) || manifest.project_id!==target.projectId || manifest.region!==target.region ||
    manifest.source_revision!==receipt.sourceRevision || manifest.profile_version!=='CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP' ||
    manifest.entrypoint_mutation_count!==0 || manifest.edge_mutation_count!==0 || manifest.retained_edge_disposition!=='RETAINED_UNUSED_EDGE' ||
    receipt.foundationManifestSha256!==sha256(canonicalize(manifest)))fail('foundation_receipt');
  return {schemaVersion:'jenfu.dev121.foundation-readback.v1',observedAt,status:'FOUNDATION_MANIFEST_VERIFIED',
    foundationRef,generation:String(object.generation),foundationSourceRevision:receipt.sourceRevision,
    foundationManifestSha256:receipt.foundationManifestSha256,projectId:target.projectId,region:target.region,
    releaseAuthority:false,cloudMutations:0,
    limitation:'Hash-bound existing provider receipt only; current source/application/runner/plan inputs must be joined before any storage apply.'};
}

/** Join four plan inputs from one existing owner prepare/build chain, GET only.
 * This does not attest backend, saved plan, effective IAM, costs or apply authority.
 */
export async function collectDev121StoragePlanInputs({intentRef,root,token,fetchImpl=fetch,observedAt=new Date().toISOString()}={}) {
  const bucket='jenfu-platform-prod-aipdm-release';
  if(typeof root!=='string' || typeof token!=='string' || token.length<20 ||
    typeof fetchImpl!=='function' || !Number.isFinite(Date.parse(observedAt)))fail('plan_inputs_input');
  const readObject=options=>readGcsObject({...options,token,fetchImpl});
  const read=async ref=>{
    assertImmutableRef(ref,bucket);
    const object=await readObject({uri:ref.uri,expectedBucket:bucket,expectedPrefix:'receipts'});
    if(sha256(object.bytes)!==ref.sha256)fail('plan_inputs_object_hash');
    let value;try{value=JSON.parse(object.bytes.toString('utf8'));}catch{fail('plan_inputs_json');}
    return {value,ref,generation:String(object.generation)};
  };
  const intentObject=await read(intentRef),intent=intentObject.value;
  const config=repositoryPath=>JSON.parse(readGitBlob(root,repositoryPath,intent.sourceRevision).toString('utf8'));
  const profile=config('config/release/dev117-ai-pdm-independent-production-v3.json');
  assertDev117V3Profile(profile,config('config/release/dev117-ai-pdm-independent-production.json'),config('config/platform/dev-010-n1c-ai-pdm.json'));
  assertDev117ReleaseIntent(intent,profile);
  if(Date.parse(intent.deadlineAt)<=Date.now())fail('plan_inputs_expired');
  const paths=releasePaths(profile,intent,intentRef.sha256);
  const prepareObject=await readObject({uri:paths.prepare,expectedBucket:bucket,expectedPrefix:'receipts'});
  const prepareRef={uri:paths.prepare,sha256:sha256(prepareObject.bytes)};
  const proof=await readOwnerReleaseProof({owner:'ai-pdm',sourceRevision:intent.sourceRevision,
    refs:{prepare:prepareRef,migrate:null,terminal:null},mode:'pre_migration',token,fetchImpl});
  const prepare=JSON.parse(prepareObject.bytes.toString('utf8'));
  const fields={sourceLock:'sourceLockRef',authorization:'authorizationPolicyRef',readiness:'readinessReceiptRef',
    foundation:'foundationReceiptRef',infra:'infraReceiptRef',runtimeConfig:'runtimeConfigRef'};
  const values={},objects={};
  for(const [name,field] of Object.entries(fields)) {
    if(canonicalize(prepare.facts.prerequisiteRefs[name])!==canonicalize(intent[field]))fail('plan_inputs_prerequisite_join');
    const object=await read(intent[field]);objects[name]=object;values[name]=object.value;
    if(name!=='foundation' && values[name].ownerApplicationId && values[name].ownerApplicationId!=='ai-pdm')fail('plan_inputs_owner');
    if(name!=='foundation' && values[name].sourceRevision && values[name].sourceRevision!==intent.sourceRevision)fail('plan_inputs_source');
    if(name!=='foundation' && values[name].releaseId && values[name].releaseId!==intent.releaseId)fail('plan_inputs_release');
  }
  if(values.sourceLock.sourceSha256!==intent.sourceSha256 ||
    values.sourceLock.migrationManifestSha256!==intent.migrationManifestSha256)fail('plan_inputs_source_manifest');
  const derived=assertPreparePrerequisites({intent,profile,values});
  const foundation=await collectDev121FoundationReadback({foundationRef:intent.foundationReceiptRef,readObject,observedAt});
  const reuse=values.infra.schemaVersion==='jenfu.dev012.app-infra-reuse-receipt.v1';
  const infraRef=reuse?values.infra.reusedInfraReceiptRef:intent.infraReceiptRef;
  const getJson=async url=>{
    const response=await fetchImpl(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`}});
    return {status:response.status,body:response.status===200?await response.json():null};
  };
  const runner=await collectDev121MigrationImageReadback({infraRef,readObject,getJson,observedAt});
  if(runner.foundationManifestSha256!==foundation.foundationManifestSha256 ||
    runner.migrationRunnerDigest!==derived.migrationRunnerDigest ||
    runner.migrationRunnerDigest!==prepare.facts.migrationRunnerDigest ||
    runner.infraSourceRevision!==(reuse?values.infra.reusedSourceRevision:intent.sourceRevision))fail('plan_inputs_infra_join');
  const deploymentRef={uri:proof.buildChain.deployment.ref,sha256:proof.buildChain.deployment.sha256};
  const deployment=(await read(deploymentRef)).value;
  if(canonicalize(deployment.releaseIntentRef)!==canonicalize(intentRef) || deployment.releaseIntentSha256!==intentRef.sha256 ||
    deployment.migrationRunnerDigest!==runner.migrationRunnerDigest || deployment.deadlineAt!==intent.deadlineAt)fail('plan_inputs_deployment_join');
  const provider=await verifyOwnerProviderReadback({proof,token,fetchImpl});
  if([intent.deadlineAt,values.authorization.expiresAt,values.readiness.expiresAt].some(value=>Date.parse(value)<=Date.now()))fail('plan_inputs_expired');
  return {schemaVersion:'jenfu.dev121.business-storage-plan-inputs.v1',status:'OWNER_PLAN_INPUTS_VERIFIED',observedAt,
    ownerApplicationId:'ai-pdm',projectId:target.projectId,region:target.region,releaseId:intent.releaseId,deadlineAt:intent.deadlineAt,
    expectedInputs:{source_revision:proof.sourceRevision,foundation_manifest_sha256:foundation.foundationManifestSha256,
      application_image_digest:provider.artifactDigest.split('@')[1],migration_runner_image_digest:runner.migrationRunnerDigest.split('@')[1]},
    intent:intentObject.ref,intentGeneration:intentObject.generation,prepare:proof.prepare,
    prerequisites:Object.fromEntries(Object.entries(objects).map(([name,object])=>[name,{ref:object.ref,generation:object.generation}])),
    application:provider,foundation,runner,planInputProvenanceVerified:true,releaseAuthority:false,cloudMutations:0,
    limitation:'One source-frozen owner prepare/build input chain only; cost, official source acceptance for the storage change, backend, saved binary plan, effective IAM and apply remain separately required.'};
}
