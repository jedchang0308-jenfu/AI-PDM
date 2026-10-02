import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {buildRuntimeConfig,releasePaths} from './dev012-owner-release-runtime.mjs';
import {crc32cBase64} from './dev012-production-migration-runner.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalize,sha256} from './dev012-production-migration-runner.mjs';
import {collectDev121BusinessStorageReadback,collectDev121MigrationImageReadback,collectDev121FoundationReadback,collectDev121StoragePlanInputs} from './dev121-business-storage-readback.mjs';
import {BUSINESS_STORAGE_TARGET as target,BUSINESS_STORAGE_ROLE as role} from './dev121-business-storage-plan.mjs';
const subject=`serviceAccount:${target.runtimeIdentity}`;
function fixture(){return [
 {projectId:target.projectId,projectNumber:target.projectNumber},
 {projectId:target.projectId,email:target.runtimeIdentity,uniqueId:'12345'},
 {name:target.bucket,projectNumber:target.projectNumber,location:'ASIA-EAST1',storageClass:'STANDARD',iamConfiguration:{uniformBucketLevelAccess:{enabled:true},publicAccessPrevention:'enforced'},softDeletePolicy:{retentionDurationSeconds:'2592000'},metageneration:'1'},
 {name:role,stage:'GA',includedPermissions:['storage.objects.get','storage.objects.create']},
 {bindings:[{role,members:[subject]}]}
];}
async function collect(values,{status=200}={}){let calls=0;const result=await collectDev121BusinessStorageReadback({observedAt:'2026-10-02T04:00:00Z',getJson:async url=>{assert.match(url,/^https:\/\/(cloudresourcemanager|iam|storage)\.googleapis\.com\//);assert.ok(!url.includes('release'));if(url.includes('/storage/v1/b/') && url.includes('?fields=')){const fields=new URL(url).searchParams.get('fields').split(',');assert.ok(fields.includes('billing'));assert.ok(!fields.includes('requesterPays'));}const body=values[calls++];return {status:body===null?404:status,body};}});return {result,calls};}
test('matching direct resources do not claim inherited IAM or release authority',async()=>{const {result,calls}=await collect(fixture());assert.equal(calls,5);assert.equal(result.ownResourcesVerified,true);assert.equal(result.effectiveInheritedIamVerified,false);assert.equal(result.artifactProvenanceVerified,false);assert.equal(result.releaseAuthority,false);assert.equal(result.cloudMutations,0);assert.match(result.evidenceHashes.bucket,/^[a-f0-9]{64}$/);});
test('absent bucket ends preflight without IAM reads',async()=>{const values=fixture();values[2]=null;const {result,calls}=await collect(values);assert.equal(calls,3);assert.equal(result.status,'BUSINESS_STORAGE_NOT_PROVISIONED');assert.equal(result.ownResourcesVerified,false);});
for(const [name,mutate] of [
 ['wrong project',v=>v[0].projectNumber='1'],
 ['disabled runtime',v=>v[1].disabled=true],
 ['wrong runtime',v=>v[1].email='other@example.com'],
 ['wrong bucket owner',v=>v[2].projectNumber='1'],
 ['public prevention relaxed',v=>v[2].iamConfiguration.publicAccessPrevention='inherited'],
 ['requester pays enabled',v=>v[2].billing={requesterPays:true}],
 ['short soft deletion',v=>v[2].softDeletePolicy.retentionDurationSeconds='604800'],
 ['expiration enabled',v=>v[2].lifecycle={rule:[{action:{type:'Delete'}}]}],
 ['extra delete permission',v=>v[3].includedPermissions.push('storage.objects.delete')],
 ['public binding',v=>v[4].bindings.push({role:'roles/storage.objectViewer',members:['allUsers']})],
 ['additional runtime privilege',v=>v[4].bindings.push({role:'roles/storage.admin',members:[subject]})],
 ['conditional runtime grant',v=>v[4].bindings[0].condition={expression:'true'}],
 ['missing runtime grant',v=>v[4].bindings=[]]
])test(`reject ${name}`,async()=>{const values=fixture();mutate(values);await assert.rejects(collect(values),/DEV121_BUSINESS_STORAGE_READBACK_INVALID/);});
test('403 cannot be reported as missing storage',async()=>{await assert.rejects(collect(fixture(),{status:403}),/http:project:403/);});

function migrationFixture(mutate=()=>{}){
 const receipt={schemaVersion:'jenfu.dev012.app-infra-receipt.v1',ownerApplicationId:'ai-pdm',projectId:target.projectId,region:target.region,status:'APPLIED',releaseAuthority:true,evidenceScope:'PRODUCTION_PROVIDER',sourceRevision:'a'.repeat(40),foundationManifestSha256:'b'.repeat(64),migrationRunnerDigest:`asia-east1-docker.pkg.dev/${target.projectId}/aipdm-release/ai-pdm-migration-runner@sha256:${'c'.repeat(64)}`};
 mutate(receipt);receipt.receiptSha256=sha256(canonicalize(receipt));
 const bytes=Buffer.from(JSON.stringify(receipt));
 const infraRef={uri:'gs://jenfu-platform-prod-aipdm-release/receipts/infra/own.json',sha256:sha256(bytes)};
 let calls=0;
 const options={infraRef,observedAt:'2026-10-02T10:00:00Z',readObject:async value=>{assert.equal(value.expectedBucket,'jenfu-platform-prod-aipdm-release');assert.equal(value.expectedPrefix,'receipts');return {bytes,generation:'7'};},getJson:async url=>{calls++;assert.match(url,/^https:\/\/artifactregistry\.googleapis\.com\/v1\/projects\/jenfu-platform-prod\/locations\/asia-east1\/repositories\/aipdm-release\/dockerImages\/ai-pdm-migration-runner%40sha256%3A[a-f0-9]{64}$/u);return {status:200,body:{name:`projects/${target.projectId}/locations/asia-east1/repositories/aipdm-release/dockerImages/ai-pdm-migration-runner@sha256:${'c'.repeat(64)}`,uri:receipt.migrationRunnerDigest}};}};
 return {options,calls:()=>calls};
}
test('migration image GET consumes bound owner infra but never grants apply authority',async()=>{const f=migrationFixture();const result=await collectDev121MigrationImageReadback(f.options);assert.equal(f.calls(),1);assert.equal(result.status,'MIGRATION_IMAGE_VERIFIED');assert.equal(result.infraGeneration,'7');assert.equal(result.releaseAuthority,false);assert.equal(result.artifactProvenanceVerified,false);assert.equal(result.cloudMutations,0);});
for(const [name,mutate] of [
 ['sibling owner',v=>v.ownerApplicationId='orgmaster'],
 ['different project',v=>v.projectId='other'],
 ['synthetic provider',v=>v.evidenceScope='LOCAL_SYNTHETIC'],
 ['unapplied infra',v=>v.status='PLANNED'],
 ['mutable image',v=>v.migrationRunnerDigest='asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner:latest'],
 ['application image as runner',v=>v.migrationRunnerDigest=`asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm@sha256:${'c'.repeat(64)}`]
])test(`migration rejects ${name} before registry request`,async()=>{const f=migrationFixture(mutate);await assert.rejects(collectDev121MigrationImageReadback(f.options),/DEV121_BUSINESS_STORAGE_READBACK_INVALID/);assert.equal(f.calls(),0);});
test('migration rejects tampered bound infra bytes',async()=>{const f=migrationFixture();f.options.infraRef.sha256='d'.repeat(64);await assert.rejects(collectDev121MigrationImageReadback(f.options),/migration_infra_object/);assert.equal(f.calls(),0);});
test('migration registry denial is a failed read, not absence',async()=>{const f=migrationFixture();f.options.getJson=async()=>({status:403});await assert.rejects(collectDev121MigrationImageReadback(f.options),/migration_image_readback/);});
test('migration rejects mismatched registry observation',async()=>{const f=migrationFixture();f.options.getJson=async()=>({status:200,body:{name:'other',uri:'other'}});await assert.rejects(collectDev121MigrationImageReadback(f.options),/migration_image_readback/);});

function foundationFixture(mutate=()=>{}) {
  const manifest={project_id:target.projectId,region:target.region,source_revision:'a'.repeat(40),profile_version:'CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP',entrypoint_mutation_count:0,edge_mutation_count:0,retained_edge_disposition:'RETAINED_UNUSED_EDGE'};
  const receipt={schemaVersion:'jenfu.dev012.foundation-receipt.v1',ownerApplicationId:'shared-foundation',projectId:target.projectId,region:target.region,sourceRevision:'a'.repeat(40),status:'APPLIED',releaseAuthority:true,evidenceScope:'PRODUCTION_PROVIDER',foundationManifest:manifest,foundationManifestSha256:sha256(canonicalize(manifest))};
  mutate(receipt);receipt.receiptSha256=sha256(canonicalize(receipt));
  const bytes=Buffer.from(JSON.stringify(receipt));
  return {foundationRef:{uri:'gs://jenfu-platform-prod-aipdm-release/receipts/foundation.json',sha256:sha256(bytes)},readObject:async()=>({bytes,generation:'7'})};
}
test('foundation receipt derives verified manifest hash without apply authority',async()=>{
  const value=await collectDev121FoundationReadback(foundationFixture());assert.equal(value.status,'FOUNDATION_MANIFEST_VERIFIED');assert.equal(value.releaseAuthority,false);assert.equal(value.cloudMutations,0);assert.equal(value.generation,'7');
});
for(const [name,mutate] of [
  ['synthetic',v=>v.evidenceScope='LOCAL_SYNTHETIC'],['wrong owner',v=>v.ownerApplicationId='ai-pdm'],
  ['wrong project',v=>v.projectId='other'],['unapplied',v=>v.status='PLANNED'],
  ['manifest drift',v=>v.foundationManifest.region='us-central1'],['forged manifest hash',v=>v.foundationManifestSha256='f'.repeat(64)],
  ['wrong manifest revision',v=>v.foundationManifest.source_revision='b'.repeat(40)]
])test(`foundation rejects ${name}`,async()=>{await assert.rejects(collectDev121FoundationReadback(foundationFixture(mutate)),/foundation_receipt/u);});
test('foundation rejects wrong bucket or changed bound bytes',async()=>{
  const wrong=foundationFixture();wrong.foundationRef.uri=wrong.foundationRef.uri.replace('aipdm-release','orgmaster-release');
  await assert.rejects(collectDev121FoundationReadback(wrong),/foundation_input/u);
  const drift=foundationFixture();drift.foundationRef.sha256='d'.repeat(64);
  await assert.rejects(collectDev121FoundationReadback(drift),/foundation_object/u);
});

// Transport fixtures exercise actual frozen Git configs and existing validators.
// These synthetic receipts and provider responses are never Production evidence.
const repositoryRoot=fileURLToPath(new URL('../../',import.meta.url));
const fixtureRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:repositoryRoot,encoding:'utf8',windowsHide:true}).trim();
const fixtureProfile=JSON.parse(fs.readFileSync(new URL('../../config/release/dev117-ai-pdm-independent-production-v3.json',import.meta.url),'utf8'));
function planInputsFixture({intentChange={},prepareRefsChange={},sourceChange={},infraChange={},deploymentChange={},reuse=false,runnerObservedUri=null}={}) {
  const bucket='jenfu-platform-prod-aipdm-release',releaseId='DEV121-STORAGE-JOIN-001';
  const objects=new Map(),put=(uri,value)=>{const bytes=Buffer.from(JSON.stringify(value));objects.set(uri,bytes);return {uri,sha256:sha256(bytes)};};
  const receipt=(name,value)=>put(`gs://${bucket}/receipts/prerequisites/${name}.json`,value);
  const seal=value=>({...value,receiptSha256:sha256(canonicalize(value))});
  const common={ownerApplicationId:'ai-pdm',projectId:target.projectId,region:target.region,sourceRevision:fixtureRevision,releaseId,
    status:'PASS',releaseAuthority:true,evidenceScope:'PRODUCTION_BOUND'};
  const sourceLockRef=receipt('source',{ownerApplicationId:'ai-pdm',sourceRevision:fixtureRevision,releaseId,releaseAuthority:true,evidenceScope:'PRODUCTION_BOUND',schemaVersion:'jenfu.dev012.owner-source-lock.v1',repository:'jedchang0308-jenfu/AI-PDM',
    branch:'main',sourceTree:'d'.repeat(40),sourceSha256:'e'.repeat(64),migrationManifestSha256:'b'.repeat(64),clean:true,
    remoteRef:'refs/heads/main',remoteRevision:fixtureRevision,status:'SOURCE_FROZEN',observedAt:'2026-10-02T00:00:00Z',...sourceChange});
  const authorizationPolicyRef=receipt('authorization',{...common,environment:'production',remainingHumanAction:0,expiresAt:'2999-01-01T00:00:00Z'});
  const readinessReceiptRef=receipt('readiness',{...common,environment:'production',remainingHumanAction:0,expiresAt:'2999-01-01T00:00:00Z'});
  const foundation=JSON.parse(foundationBytes().toString('utf8'));
  const foundationReceiptRef=receipt('foundation',foundation);
  const runnerDigest=fixtureProfile.artifact.migrationRunnerUri+'@sha256:'+'c'.repeat(64);
  const providerInfra={schemaVersion:'jenfu.dev012.app-infra-receipt.v1',ownerApplicationId:'ai-pdm',projectId:target.projectId,region:target.region,
    sourceRevision:reuse?'f'.repeat(40):fixtureRevision,status:'APPLIED',releaseAuthority:true,evidenceScope:'PRODUCTION_PROVIDER',
    foundationManifestSha256:foundation.foundationManifestSha256,migrationRunnerDigest:runnerDigest,...infraChange};
  const providerInfraRef=receipt('provider-infra',seal(providerInfra));
  const infraReceiptRef=reuse?receipt('reuse',seal({...common,schemaVersion:'jenfu.dev012.app-infra-reuse-receipt.v1',status:'APPLIED',
    evidenceScope:'PRODUCTION_PROVIDER_REUSE',mutationProfile:'APP_INFRA_REUSE',reuseBasis:'APPLICATION_SOURCE_ONLY_NO_INFRA_EXECUTABLE_INPUT_CHANGE',
    foundationManifestSha256:foundation.foundationManifestSha256,reusedSourceRevision:'f'.repeat(40),reusedInfraReceiptRef:providerInfraRef,
    migrationRunnerDigest:runnerDigest,controllerImageDigest:'asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/controller@sha256:'+'a'.repeat(64)})):providerInfraRef;
  const plainEnvironment=Object.fromEntries(fixtureProfile.environment.requiredPlainEnvironmentNames.map(name=>[name,'fixture']));
  Object.assign(plainEnvironment,fixtureProfile.environment.fixedValues);
  for(const [name,value] of Object.entries(fixtureProfile.environment.controlledValues))plainEnvironment[name]=value.defaultValue;
  const runtimeConfigRef=receipt('runtime',{...common,status:'VERIFIED',runtimeConfig:buildRuntimeConfig(fixtureProfile,{plainEnvironment,
    secretVersions:Object.fromEntries(fixtureProfile.environment.requiredSecretNames.map(name=>[name,'1']))})});
  const intent={schemaVersion:fixtureProfile.schemas.releaseIntent,ownerApplicationId:'ai-pdm',releaseId,sourceRevision:fixtureRevision,
    sourceSha256:'e'.repeat(64),sourceLockRef,authorizationPolicyRef,readinessReceiptRef,foundationReceiptRef,infraReceiptRef,runtimeConfigRef,
    migrationManifestSha256:'b'.repeat(64),previousRevision:'ai-pdm-prod-previous',deadlineAt:'2999-01-01T00:00:00Z',...intentChange};
  const intentRef=receipt('intent',intent),paths=releasePaths(fixtureProfile,intent,intentRef.sha256);
  const stage=(name,previousReceiptRef,facts)=>put(paths[name],seal({schemaVersion:'jenfu.dev012.stage-receipt.v1',ownerApplicationId:'ai-pdm',
    releaseId,sourceRevision:fixtureRevision,stage:name,previousReceiptRef,facts,observedAt:'2026-10-02T00:00:00Z',status:'PASS'}));
  const prepare=stage('prepare',null,{migrationRunnerDigest:runnerDigest,prerequisiteRefs:{sourceLock:sourceLockRef,authorization:authorizationPolicyRef,
    readiness:readinessReceiptRef,foundation:foundationReceiptRef,infra:infraReceiptRef,runtimeConfig:runtimeConfigRef,...prepareRefsChange}});
  const archived=Buffer.from('synthetic source archive'),artifactDigest=fixtureProfile.artifact.uri+'@sha256:'+'1'.repeat(64);
  const sourceObject={uri:`gs://${bucket}/source/releases/${releaseId}/${intentRef.sha256}/source.tar.gz`,sha256:sha256(archived),generation:'7',crc32c:crc32cBase64(archived)};
  objects.set(sourceObject.uri,archived);
  const buildId='11111111-2222-3333-4444-555555555555';
  const cloudBuild={name:`projects/jenfu-platform-prod/locations/asia-east1/builds/${buildId}`,id:buildId,status:'SUCCESS',projectId:target.projectId,
    serviceAccount:'projects/jenfu-platform-prod/serviceAccounts/aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com',options:{requestedVerifyOption:'VERIFIED'},
    sourceProvenance:{resolvedStorageSource:{bucket,object:sourceObject.uri.slice(`gs://${bucket}/`.length),generation:'7'}},
    results:{images:[{name:fixtureProfile.artifact.uri+':release-'+fixtureRevision,digest:artifactDigest.split('@')[1]}]}};
  const provenance=put(paths.provenance,{schemaVersion:'jenfu.dev012.build-provenance-receipt.v1',ownerApplicationId:'ai-pdm',sourceRevision:fixtureRevision,
    sourceObject,artifactDigest,status:'PASS',cloudBuild,artifactRegistry:{uri:artifactDigest}});
  const build=stage('build',prepare,{artifactDigest,sourceObject,provenanceReceiptRef:provenance});
  put(paths.deployment,{sourceRevision:fixtureRevision,artifactDigest,buildReceiptRef:build,releaseIntentRef:intentRef,
    releaseIntentSha256:intentRef.sha256,migrationRunnerDigest:runnerDigest,deadlineAt:intent.deadlineAt,...deploymentChange});
  const fetchImpl=async url=>{
    if(url.includes('cloudbuild.googleapis.com'))return Response.json(cloudBuild);
    if(url.includes('artifactregistry.googleapis.com')){
      const tail=decodeURIComponent(url.split('/dockerImages/')[1]);
      return Response.json({name:'projects/jenfu-platform-prod/locations/asia-east1/repositories/aipdm-release/dockerImages/'+tail,
        uri:tail.startsWith('ai-pdm-migration-runner@')?(runnerObservedUri??runnerDigest):artifactDigest});
    }
    const match=/\/b\/([^/]+)\/o\/([^?]+)/u.exec(url);
    const uri=match&&`gs://${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`,bytes=objects.get(uri);
    if(!bytes)return new Response('',{status:404});
    if(url.includes('alt=media'))return new Response(bytes);
    return Response.json({generation:'7',crc32c:crc32cBase64(bytes)});
  };
  return {options:{intentRef,root:repositoryRoot,token:'x'.repeat(25),fetchImpl},objects};
}
function foundationBytes() {
  const manifest={project_id:target.projectId,region:target.region,source_revision:'a'.repeat(40),profile_version:'CONTINUOUS_NO_DWELL_V3_DIRECT_RUN_APP',
    entrypoint_mutation_count:0,edge_mutation_count:0,retained_edge_disposition:'RETAINED_UNUSED_EDGE'};
  const core={schemaVersion:'jenfu.dev012.foundation-receipt.v1',ownerApplicationId:'shared-foundation',projectId:target.projectId,region:target.region,
    sourceRevision:'a'.repeat(40),status:'APPLIED',releaseAuthority:true,evidenceScope:'PRODUCTION_PROVIDER',foundationManifest:manifest,foundationManifestSha256:sha256(canonicalize(manifest))};
  return Buffer.from(JSON.stringify({...core,receiptSha256:sha256(canonicalize(core))}));
}
for(const reuse of [false,true])test(`joins frozen owner prepare/build and actual validators (reuse=${reuse}) without apply authority`,async()=>{
  const f=planInputsFixture({reuse}),value=await collectDev121StoragePlanInputs(f.options);
  assert.equal(value.status,'OWNER_PLAN_INPUTS_VERIFIED');assert.equal(value.expectedInputs.source_revision,fixtureRevision);
  assert.equal(value.expectedInputs.application_image_digest,'sha256:'+'1'.repeat(64));
  assert.equal(value.expectedInputs.migration_runner_image_digest,'sha256:'+'c'.repeat(64));
  assert.equal(value.releaseAuthority,false);assert.equal(value.cloudMutations,0);assert.equal(value.planInputProvenanceVerified,true);
});
for(const [name,changes,pattern] of [
  ['expired intent',{intentChange:{deadlineAt:'2020-01-01T00:00:00Z'}},/plan_inputs_expired/],
  ['cross-prepare ref',{prepareRefsChange:{foundation:{uri:'gs://jenfu-platform-prod-aipdm-release/receipts/other.json',sha256:'e'.repeat(64)}}},/plan_inputs_prerequisite_join/],
  ['source identity mismatch',{sourceChange:{sourceSha256:'f'.repeat(64)}},/plan_inputs_source_manifest/],
  ['migration manifest mismatch',{sourceChange:{migrationManifestSha256:'f'.repeat(64)}},/plan_inputs_source_manifest/],
  ['different runner foundation',{infraChange:{foundationManifestSha256:'f'.repeat(64)}},/plan_inputs_infra_join/],
  ['different deployment runner',{deploymentChange:{migrationRunnerDigest:'wrong'}},/plan_inputs_deployment_join/],
  ['different deployment intent',{deploymentChange:{releaseIntentSha256:'f'.repeat(64)}},/plan_inputs_deployment_join/],
  ['different deployment deadline',{deploymentChange:{deadlineAt:'2998-01-01T00:00:00Z'}},/plan_inputs_deployment_join/],
  ['different observed runner',{runnerObservedUri:'wrong'},/migration_image_readback/],
  ['reuse source mismatch',{reuse:true,infraChange:{sourceRevision:'e'.repeat(40)}},/plan_inputs_infra_join/]
])test(`owner plan input join rejects ${name}`,async()=>{const f=planInputsFixture(changes);await assert.rejects(collectDev121StoragePlanInputs(f.options),pattern);});
test('owner plan input join rejects tampered intent bytes',async()=>{const f=planInputsFixture();f.options.intentRef.sha256='f'.repeat(64);await assert.rejects(collectDev121StoragePlanInputs(f.options),/plan_inputs_object_hash/);});

test('owner join rejects an intent expiring during provider observations',async context=>{
  const now=Date.now(),f=planInputsFixture({intentChange:{deadlineAt:new Date(now+60000).toISOString()}});
  const transport=f.options.fetchImpl;
  f.options.fetchImpl=async (url,options)=>{
    const response=await transport(url,options);
    if(url.includes('artifactregistry.googleapis.com') && decodeURIComponent(url).includes('/dockerImages/ai-pdm@'))
      context.mock.method(Date,'now',()=>now+120000);
    return response;
  };
  await assert.rejects(collectDev121StoragePlanInputs(f.options),/plan_inputs_expired/);
});
