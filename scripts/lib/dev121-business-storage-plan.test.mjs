import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertDev121BusinessStoragePlan,assertDev121BusinessStorageState} from './dev121-business-storage-plan.mjs';
import {profile,expectedInputs,businessStoragePlanFixture as fixture,businessStorageStateFixture as stateFixture} from './dev121-business-storage-fixtures.mjs';
const verify=plan=>assertDev121BusinessStoragePlan(plan,{profile,expectedInputs});
test('actual provider shape has five declarations, two resolved data facts and three managed creates',()=>{
 const plan=fixture();assert.equal(plan.resource_changes.length,3);assert.equal(plan.prior_state.values.root_module.resources.length,2);
 const proof=verify(plan);assert.equal(proof.status,'PLAN_CONTENT_PASS');assert.equal(proof.allowedAddressCount,5);assert.equal(proof.changeCount,3);assert.equal(proof.releaseAuthority,false);assert.equal(proof.providerProvenanceVerified,false);assert.match(proof.planContentSha256,/^[a-f0-9]{64}$/);
});
test('only create computed website/deleted and effective time are allowed',()=>{
 verify(fixture());
 for(const field of ['website','deleted']){const plan=fixture({noOp:true});plan.resource_changes[field==='website'?0:1].change.after_unknown[field]=true;assert.throws(()=>verify(plan));}
 const configured=fixture();configured.configuration.root_module.resources[2].expressions.website=[];assert.throws(()=>verify(configured),/configured_website/);
 const version=fixture();version.resource_changes[0].change.after_unknown.versioning=true;assert.throws(()=>verify(version),/versioning/);
 const config=fixture();delete config.configuration.root_module.resources[2].expressions.versioning;assert.throws(()=>verify(config),/configured_versioning/);
 const duration=fixture();duration.resource_changes[0].change.after_unknown.soft_delete_policy=[{retention_duration_seconds:true}];assert.throws(()=>verify(duration),/soft_delete_policy/);
});
for(const [name,index,field,value] of [
 ['other project',0,'project','jenfu-ai-pdm-prod'],['evidence bucket',0,'name','jenfu-platform-prod-aipdm-release'],['wrong location',0,'location','US'],['public access',0,'public_access_prevention','inherited'],['ACL enabled',0,'uniform_bucket_level_access',false],['force destroy',0,'force_destroy',true],['extra permission',1,'permissions',['storage.objects.get','storage.objects.create','storage.objects.delete']],['disabled role',1,'stage','DISABLED'],['deleted role',1,'deleted',true],['broad role',2,'role','roles/storage.objectAdmin'],['wrong member',2,'member','allUsers'],['wrong binding bucket',2,'bucket','other'],['expiration',0,'lifecycle_rule',[{action:[{type:'Delete'}]}]],['short soft delete',0,'soft_delete_policy',[{retention_duration_seconds:604800}]],['versioning enabled',0,'versioning',[{enabled:true}]]
])test('reject '+name,()=>{const plan=fixture();plan.resource_changes[index].change.after[field]=value;assert.throws(()=>verify(plan));});
test('all observed data identities are checked, including data changes and planned values',()=>{
 for(const [index,field,value] of [[0,'number','12345'],[1,'email','sibling@jenfu-platform-prod.iam.gserviceaccount.com']]){const plan=fixture();plan.prior_state.values.root_module.resources[index].values[field]=value;assert.throws(()=>verify(plan));}
 const plan=fixture();const row=structuredClone(plan.prior_state.values.root_module.resources[0]);plan.planned_values.root_module.resources.push(row);verify(plan);row.values.number='123';assert.throws(()=>verify(plan));
 const withRead=fixture();const source=withRead.prior_state.values.root_module.resources[0];withRead.resource_changes.push({...source,change:{actions:['read'],before:null,after:source.values,after_unknown:{}}});verify(withRead);withRead.resource_changes[3].change.after_unknown.number=true;assert.throws(()=>verify(withRead),/unknown/);
});
test('unknown identity, binding and permissions stay fail closed, including nested permission flags',()=>{
 for(const [index,field] of [[0,'project'],[0,'public_access_prevention'],[1,'permissions'],[2,'member']]){const plan=fixture();plan.resource_changes[index].change.after_unknown[field]=true;assert.throws(()=>verify(plan),/unknown|permissions/);}
 const plan=fixture();plan.resource_changes[1].change.after_unknown.permissions=[false,true];assert.throws(()=>verify(plan),/permissions/);
});
test('four source/artifact bindings are required and exact',()=>{for(const key of Object.keys(expectedInputs)){const plan=fixture();delete plan.variables[key];assert.throws(()=>verify(plan),/PLAN_INPUT/);const changed=fixture();changed.variables[key].value='f'.repeat(64);assert.throws(()=>verify(changed),/PLAN_INPUT/);}assert.throws(()=>assertDev121BusinessStoragePlan(fixture(),{profile,expectedInputs:{...expectedInputs,source_revision:'feature'}}),/input/);});
test('every actual plan section rejects missing, duplicate, extra and nested resources',()=>{
 const modules=[p=>p.configuration.root_module,p=>p.prior_state.values.root_module,p=>p.planned_values.root_module];
 for(const get of modules){for(const mode of ['missing','duplicate','extra','module']){const plan=fixture();const m=get(plan);if(mode==='missing')m.resources.pop();if(mode==='duplicate')m.resources.push(m.resources[0]);if(mode==='extra')m.resources.push({...m.resources[0],address:'google_cloud_run_v2_service.sibling'});if(mode==='module')m.child_modules=[{}];assert.throws(()=>verify(plan));}}
 for(const mode of ['missing','duplicate','extra']){const plan=fixture();if(mode==='missing')plan.resource_changes.pop();if(mode==='duplicate')plan.resource_changes.push(plan.resource_changes[0]);if(mode==='extra')plan.resource_changes[0].address='google_cloud_run_v2_service.sibling';assert.throws(()=>verify(plan));}
 for(const actions of [['update'],['delete'],['delete','create'],['read']]){const plan=fixture();plan.resource_changes[0].change.actions=actions;assert.throws(()=>verify(plan),/DESTROY_OR_REPLACE/);}
});
test('no-op proves existing own state and both safe values; no change is fabricated',()=>{
 verify(fixture({noOp:true}));const plan=fixture({noOp:true});plan.resource_changes[2].change.before.member='allUsers';assert.throws(()=>verify(plan),/member/);
 const missing=fixture({noOp:true});missing.prior_state.values.root_module.resources.pop();assert.throws(()=>verify(missing),/no_op_prior/);
 const existing=fixture();existing.prior_state.values.root_module.resources.push(stateFixture().values.root_module.resources[2]);assert.throws(()=>verify(existing),/create_existing/);
});
test('planned values cannot contradict change values; provider and identity must match',()=>{
 const plan=fixture();plan.planned_values.root_module.resources[0].values.name='other';assert.throws(()=>verify(plan));
 for(const section of ['configuration','planned_values']){const changed=fixture();const row=changed[section].root_module.resources[0];row[section==='configuration'?'provider_config_key':'provider_name']='other';assert.throws(()=>verify(changed),/provider/);}
});
test('state is a complete known observation and rejects unsafe computed outcomes',()=>{
 assert.equal(assertDev121BusinessStorageState(stateFixture(),{profile}).status,'STATE_CONTENT_PASS');
 for(const [index,field,value] of [[2,'website',[{main_page_suffix:'index.html'}]],[2,'versioning',[{enabled:true}]],[3,'deleted',true],[3,'permissions',['storage.objects.get','storage.objects.delete']],[4,'member','allUsers']]){const state=stateFixture();state.values.root_module.resources[index].values[field]=value;assert.throws(()=>assertDev121BusinessStorageState(state,{profile}));}
 for(const mode of ['missing','duplicate','extra','module']){const state=stateFixture();const m=state.values.root_module;if(mode==='missing')m.resources.pop();if(mode==='duplicate')m.resources.push(m.resources[0]);if(mode==='extra')m.resources.push({...m.resources[0],address:'google_storage_bucket.sibling'});if(mode==='module')m.child_modules=[{}];assert.throws(()=>assertDev121BusinessStorageState(state,{profile}));}
});
test('profile target or permissions cannot be broadened',()=>{for(const changed of [{...profile,target:{...profile.target,bucket:'other'}},{...profile,permissions:[...profile.permissions,'storage.objects.delete']}])assert.throws(()=>assertDev121BusinessStoragePlan(fixture(),{profile:changed,expectedInputs}));});

test('completion flags must be exact known booleans',()=>{
 for(const [key,values] of [['complete',[undefined,false,'true',1]],['errored',[undefined,true,'false',0]]])for(const value of values){const plan=fixture();if(value===undefined)delete plan[key];else plan[key]=value;assert.throws(()=>verify(plan),/incomplete_plan/);}
});

test('provider-persisted binding bucket and full identity are exact in state and no-op plan',()=>{
 const state=stateFixture();assert.equal(state.values.root_module.resources[4].values.bucket,'b/'+profile.target.bucket);
 assert.equal(assertDev121BusinessStorageState(state,{profile}).status,'STATE_CONTENT_PASS');verify(fixture({noOp:true}));
 const bare=stateFixture();bare.values.root_module.resources[4].values.bucket=profile.target.bucket;
 assert.throws(()=>assertDev121BusinessStorageState(bare,{profile}),/binding_bucket/);
});
test('binding aliases never widen bucket, owner role, runtime or persisted identity',()=>{
 for(const bucket of ['b/other','b/'+profile.target.bucket+'/', 'gs://'+profile.target.bucket,'B/'+profile.target.bucket,'b/b/'+profile.target.bucket]){
  const state=stateFixture();state.values.root_module.resources[4].values.bucket=bucket;assert.throws(()=>assertDev121BusinessStorageState(state,{profile}));
 }
 for(const id of [undefined,'b/other/projects/jenfu-platform-prod/roles/aipdmBusinessImmutableObjects/serviceAccount:'+profile.target.runtimeIdentity,'b/'+profile.target.bucket+'/roles/storage.objectAdmin/serviceAccount:'+profile.target.runtimeIdentity]){
  const state=stateFixture();state.values.root_module.resources[4].values.id=id;assert.throws(()=>assertDev121BusinessStorageState(state,{profile}));
 }
 const create=fixture();create.resource_changes[2].change.after.bucket='b/'+profile.target.bucket;assert.throws(()=>verify(create),/binding_bucket/);
 const knownWrongId=fixture();knownWrongId.resource_changes[2].change.after.id='b/other';knownWrongId.resource_changes[2].change.after_unknown.id=false;assert.throws(()=>verify(knownWrongId),/id/);
 const knownCorrectId=fixture();knownCorrectId.resource_changes[2].change.after.id='b/'+profile.target.bucket+'/projects/jenfu-platform-prod/roles/aipdmBusinessImmutableObjects/serviceAccount:'+profile.target.runtimeIdentity;knownCorrectId.resource_changes[2].change.after_unknown.id=false;knownCorrectId.planned_values.root_module.resources[2].values.id=knownCorrectId.resource_changes[2].change.after.id;verify(knownCorrectId);
 const unknown=fixture({noOp:true});unknown.resource_changes[2].change.after_unknown.id=true;assert.throws(()=>verify(unknown),/unknown/);
});
