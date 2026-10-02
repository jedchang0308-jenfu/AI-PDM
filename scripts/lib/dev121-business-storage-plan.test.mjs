import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertDev121BusinessStoragePlan} from './dev121-business-storage-plan.mjs';
const profile=JSON.parse(fs.readFileSync(new URL('../../config/release/dev121-business-storage-plan.json',import.meta.url),'utf8'));
const expectedInputs={source_revision:'a'.repeat(40),foundation_manifest_sha256:'b'.repeat(64),application_image_digest:'sha256:'+'c'.repeat(64),migration_runner_image_digest:'sha256:'+'d'.repeat(64)};
function fixture(){
  const values=[
    {project_id:'jenfu-platform-prod',number:'9536592944'},
    {project:'jenfu-platform-prod',account_id:'aipdm-prod-runtime',email:profile.target.runtimeIdentity},
    {project:'jenfu-platform-prod',name:profile.target.bucket,location:'ASIA-EAST1',storage_class:'STANDARD',uniform_bucket_level_access:true,public_access_prevention:'enforced',force_destroy:false,soft_delete_policy:[{retention_duration_seconds:2592000}],lifecycle_rule:[],retention_policy:[],website:[],cors:[],requester_pays:false,versioning:[]},
    {project:'jenfu-platform-prod',role_id:'aipdmBusinessImmutableObjects',stage:'GA',permissions:['storage.objects.get','storage.objects.create'],deleted:false},
    {bucket:profile.target.bucket,role:'projects/jenfu-platform-prod/roles/aipdmBusinessImmutableObjects',member:'serviceAccount:'+profile.target.runtimeIdentity,condition:[]},
  ];
  return {variables:Object.fromEntries(Object.entries(expectedInputs).map(([key,value])=>[key,{value}])),resource_changes:profile.profiles.BUSINESS_STORAGE.addresses.map((address,index)=>({address,change:{actions:[index<2?'read':'create'],before:null,after:values[index],after_unknown:{}}}))};
}
const verify=plan=>assertDev121BusinessStoragePlan(plan,{profile,expectedInputs});
test('exact source-bound private bucket plan is content-only proof',()=>{const proof=verify(fixture());assert.equal(proof.status,'PLAN_CONTENT_PASS');assert.equal(proof.releaseAuthority,false);assert.equal(proof.providerProvenanceVerified,false);assert.match(proof.planContentSha256,/^[a-f0-9]{64}$/);});
test('computed policy effective timestamp is allowed while duration must be known',()=>{const plan=fixture();plan.resource_changes[2].change.after_unknown.soft_delete_policy=[{effective_time:true}];verify(plan);plan.resource_changes[2].change.after_unknown.soft_delete_policy=[{retention_duration_seconds:true}];assert.throws(()=>verify(plan),/soft_delete_policy/);});
for(const [name,index,field,value] of [
 ['other project',2,'project','jenfu-ai-pdm-prod'],['evidence bucket',2,'name','jenfu-platform-prod-aipdm-release'],
 ['wrong location',2,'location','US'],['public access prevention relaxed',2,'public_access_prevention','inherited'],
 ['ACL enabled',2,'uniform_bucket_level_access',false],['force destroy',2,'force_destroy',true],
 ['wrong project number',0,'number','12345'],['wrong runtime',1,'email','sibling@jenfu-platform-prod.iam.gserviceaccount.com'],
 ['extra delete permission',3,'permissions',['storage.objects.get','storage.objects.create','storage.objects.delete']],
 ['disabled role',3,'stage','DISABLED'],['broad role',4,'role','roles/storage.objectAdmin'],['wrong member',4,'member','allUsers'],
 ['wrong binding bucket',4,'bucket','jenfu-platform-prod-aipdm-release'],
 ['unexpected expiration',2,'lifecycle_rule',[{action:[{type:'Delete'}]}]],['short soft delete',2,'soft_delete_policy',[{retention_duration_seconds:604800}]],
 ]) test(`reject ${name}`,()=>{const plan=fixture();plan.resource_changes[index].change.after[field]=value;assert.throws(()=>verify(plan));});
test('unknown identity/security values fail closed',()=>{for(const [index,field] of [[0,'number'],[2,'public_access_prevention'],[3,'permissions'],[4,'member']]){const plan=fixture();plan.resource_changes[index].change.after_unknown[field]=true;assert.throws(()=>verify(plan),/unknown|permissions/);}});
test('all four input bindings are required and exact',()=>{for(const key of Object.keys(expectedInputs)){const plan=fixture();delete plan.variables[key];assert.throws(()=>verify(plan),/PLAN_INPUT/);const changed=fixture();changed.variables[key].value='f'.repeat(64);assert.throws(()=>verify(changed),/PLAN_INPUT/);}assert.throws(()=>assertDev121BusinessStoragePlan(fixture(),{profile,expectedInputs:{...expectedInputs,source_revision:'feature'}}),/input/);});
test('incomplete, duplicate, unknown, update/delete/replace plans reject',()=>{
 const missing=fixture();missing.resource_changes.pop();assert.throws(()=>verify(missing),/PROFILE_MISMATCH/);
 const duplicate=fixture();duplicate.resource_changes.push(duplicate.resource_changes[0]);assert.throws(()=>verify(duplicate),/DUPLICATE/);
 const unknown=fixture();unknown.resource_changes[2].address='google_cloud_run_v2_service.sibling';assert.throws(()=>verify(unknown),/UNKNOWN_RESOURCE/);
 for(const actions of [['update'],['delete'],['delete','create']]){const plan=fixture();plan.resource_changes[2].change.actions=actions;assert.throws(()=>verify(plan),/DESTROY_OR_REPLACE/);}
});
test('no-op requires the same permitted before and after target',()=>{const plan=fixture();for(const row of plan.resource_changes){row.change.actions=['no-op'];row.change.before=structuredClone(row.change.after);}verify(plan);plan.resource_changes[4].change.before.member='allUsers';assert.throws(()=>verify(plan),/member/);});
test('profile target/permissions cannot be broadened to make a bad plan pass',()=>{for(const changed of [{...profile,target:{...profile.target,bucket:'other'}},{...profile,permissions:[...profile.permissions,'storage.objects.delete']}])assert.throws(()=>assertDev121BusinessStoragePlan(fixture(),{profile:changed,expectedInputs}));});
