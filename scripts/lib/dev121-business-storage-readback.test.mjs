import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalize,sha256} from './dev012-production-migration-runner.mjs';
import {collectDev121BusinessStorageReadback,collectDev121MigrationImageReadback} from './dev121-business-storage-readback.mjs';
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
