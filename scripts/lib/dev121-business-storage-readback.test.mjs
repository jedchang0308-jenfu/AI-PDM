import assert from 'node:assert/strict';
import test from 'node:test';
import {collectDev121BusinessStorageReadback} from './dev121-business-storage-readback.mjs';
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
