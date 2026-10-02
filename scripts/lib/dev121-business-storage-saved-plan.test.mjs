import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareDev121BusinessStoragePlan,storageTerraformEnvironment,verifyStorageSourceProtection} from './dev121-business-storage-saved-plan.mjs';
const profile=JSON.parse(fs.readFileSync(new URL('../../config/release/dev121-business-storage-plan.json',import.meta.url),'utf8'));
const expectedInputs={source_revision:'a'.repeat(40),foundation_manifest_sha256:'b'.repeat(64),application_image_digest:'sha256:'+'c'.repeat(64),migration_runner_image_digest:'sha256:'+'d'.repeat(64)};
function plan(){
 const values=[{project_id:'jenfu-platform-prod',number:'9536592944'},
 {project:'jenfu-platform-prod',account_id:'aipdm-prod-runtime',email:profile.target.runtimeIdentity},
 {project:'jenfu-platform-prod',name:profile.target.bucket,location:'ASIA-EAST1',storage_class:'STANDARD',uniform_bucket_level_access:true,public_access_prevention:'enforced',force_destroy:false,soft_delete_policy:[{retention_duration_seconds:2592000}],lifecycle_rule:[],retention_policy:[],website:[],cors:[],requester_pays:false,versioning:[]},
 {project:'jenfu-platform-prod',role_id:'aipdmBusinessImmutableObjects',stage:'GA',permissions:['storage.objects.get','storage.objects.create'],deleted:false},
 {bucket:profile.target.bucket,role:'projects/jenfu-platform-prod/roles/aipdmBusinessImmutableObjects',member:'serviceAccount:'+profile.target.runtimeIdentity,condition:[]}];
 return {variables:Object.fromEntries(Object.entries(expectedInputs).map(([key,value])=>[key,{value}])),resource_changes:profile.profiles.BUSINESS_STORAGE.addresses.map((address,index)=>({address,change:{actions:[index<2?'read':'create'],before:null,after:values[index],after_unknown:{}}}))};
}
function fixture(t){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'dev121-saved-plan-test-'));
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 fs.mkdirSync(path.join(temp,'source'));
 const calls=[];
 const inputs={status:'OWNER_PLAN_INPUTS_VERIFIED',planInputProvenanceVerified:true,expectedInputs,releaseId:'DEV121-TEST',deadlineAt:'2099-01-01T00:00:00Z'};
 const source={git:{sourceRevision:expectedInputs.source_revision,sourceTree:'e'.repeat(40)},review:{status:'OFFICIAL_MERGED_PR_VERIFIED'},profile:structuredClone(profile),files:Object.fromEntries(['main.tf','versions.tf','.terraform.lock.hcl'].map(name=>[name,Buffer.from(name)]))};
 const dependencies={snapshot:async()=>source,collect:async()=>structuredClone(inputs),backendRead:async()=>({bucket:'tfstate-jenfu-platform-prod',prefix:'dev-121/business-storage'}),terraform:(args,{cwd,env})=>{
   calls.push({args,cwd,env});
   if(args[0]==='plan')fs.writeFileSync(args.find(value=>value.startsWith('-out=')).slice(5),'saved binary');
   return args[0]==='show'?JSON.stringify(plan()):'';
 }};
 return {temp,calls,inputs,source,dependencies,args:{root:path.join(temp,'source'),intentRef:{uri:'gs://bound/intent',sha256:'f'.repeat(64)},outputDirectory:path.join(temp,'evidence'),token:'oauth-token-for-test-only',githubToken:'github-token-for-test-only'}};
}
test('real execution sequence validates actual binary, retains it and never applies',async t=>{
 const f=fixture(t);const receipt=await prepareDev121BusinessStoragePlan(f.args,f.dependencies);
 assert.deepEqual(f.calls.map(call=>call.args[0]),['init','plan','show']);
 assert.ok(f.calls[0].args.includes('-backend-config=prefix=dev-121/business-storage'));
 assert.equal(f.calls[0].env.HOME,f.args.outputDirectory);assert.equal(f.calls[0].env.USERPROFILE,f.args.outputDirectory);assert.equal(fs.readFileSync(f.calls[0].env.TF_CLI_CONFIG_FILE,'utf8'),'disable_checkpoint = true\n');
 assert.equal(receipt.status,'SAVED_PLAN_VERIFIED_NOT_APPLIED');assert.equal(receipt.applyExecuted,false);assert.equal(receipt.releaseAuthority,false);
 assert.match(receipt.binarySha256,/^[a-f0-9]{64}$/);assert.equal(fs.readFileSync(receipt.planFile,'utf8'),'saved binary');
 assert.equal(fs.existsSync(path.join(f.args.outputDirectory,'plan.json')),true);
 assert.equal(JSON.stringify(receipt).includes(f.args.token),false);
});
test('credential and terraform argument pollution cannot enter subprocess',()=>{
 const env=storageTerraformEnvironment('memory-only-test-token-123',{PATH:'tools',SystemRoot:'windows',HOME:'credential-home',GOOGLE_APPLICATION_CREDENTIALS:'key.json',GOOGLE_CREDENTIALS:'key',GOOGLE_IMPERSONATE_SERVICE_ACCOUNT:'sibling',TF_CLI_CONFIG_FILE:'evil.rc',TF_CLI_ARGS_plan:'-destroy',TF_VAR_source_revision:'bad',DEV121_STORAGE_GITHUB_TOKEN:'secret'});
 assert.deepEqual(env,{PATH:'tools',SystemRoot:'windows',GOOGLE_OAUTH_ACCESS_TOKEN:'memory-only-test-token-123',TF_IN_AUTOMATION:'1',TF_INPUT:'0'});
});
test('wrong source and backend profile fail before Terraform',async t=>{
 const f=fixture(t);f.source.git.sourceRevision='0'.repeat(40);await assert.rejects(prepareDev121BusinessStoragePlan(f.args,f.dependencies),/SOURCE_INPUT_MISMATCH/);assert.equal(f.calls.length,0);
 f.source.git.sourceRevision=expectedInputs.source_revision;f.source.profile.backendBucket='other';await assert.rejects(prepareDev121BusinessStoragePlan(f.args,f.dependencies),/FIXED_BACKEND/);assert.equal(fs.existsSync(f.args.outputDirectory),false);
});
test('existing output and output inside source are rejected without execution',async t=>{
 const f=fixture(t);await assert.rejects(prepareDev121BusinessStoragePlan({...f.args,outputDirectory:f.temp},f.dependencies),/NEW_ABSOLUTE/);
 await assert.rejects(prepareDev121BusinessStoragePlan({...f.args,outputDirectory:path.join(f.args.root,'output')},f.dependencies),/OUTPUT_INSIDE_SOURCE/);assert.equal(f.calls.length,0);
});
test('actual unsafe plan fails with evidence retained and no apply',async t=>{
 const f=fixture(t);const execute=f.dependencies.terraform;f.dependencies.terraform=(args,options)=>{const result=execute(args,options);if(args[0]!=='show')return result;const unsafe=JSON.parse(result);unsafe.resource_changes[2].change.after.public_access_prevention='inherited';return JSON.stringify(unsafe);};
 await assert.rejects(prepareDev121BusinessStoragePlan(f.args,f.dependencies),/public_access_prevention/);
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.args.outputDirectory,'saved-plan.json'))).status,'PLAN_FAILED_NOT_APPLIED');assert.equal(f.calls.some(call=>call.args[0]==='apply'),false);
});
test('expired provider inputs during plan prevent verified receipt',async t=>{
 const f=fixture(t);let reads=0;f.dependencies.collect=async()=>{if(++reads===2)throw new Error('DEV121_STORAGE_INPUTS_EXPIRED');return structuredClone(f.inputs);};
 await assert.rejects(prepareDev121BusinessStoragePlan(f.args,f.dependencies),/EXPIRED/);assert.equal(JSON.parse(fs.readFileSync(path.join(f.args.outputDirectory,'saved-plan.json'))).status,'PLAN_FAILED_NOT_APPLIED');
});
test('binary changed while show/verification ran is rejected',async t=>{
 const f=fixture(t);const execute=f.dependencies.terraform;f.dependencies.terraform=(args,options)=>{const result=execute(args,options);if(args[0]==='show')fs.appendFileSync(args[2],'tampered');return result;};
 await assert.rejects(prepareDev121BusinessStoragePlan(f.args,f.dependencies),/BINARY_PLAN_CHANGED/);
});

test('operator reads actual admin enforcement and zero ruleset bypass actors',async()=>{
 const protection={enforce_admins:{enabled:true},allow_force_pushes:{enabled:false},allow_deletions:{enabled:false},required_pull_request_reviews:{required_approving_review_count:0},required_status_checks:{contexts:['DEV-012 Isolated PostgreSQL Cutover','Production Slice QC']}};
 const ruleset={id:24077878,enforcement:'active',bypass_actors:[]};
 const fetchImpl=async url=>({status:200,json:async()=>url.endsWith('/protection')?structuredClone(protection):structuredClone(ruleset)});
 assert.equal((await verifyStorageSourceProtection({token:'test-only-github-token',fetchImpl})).adminEnforced,true);
 protection.enforce_admins.enabled=false;await assert.rejects(verifyStorageSourceProtection({token:'test-only-github-token',fetchImpl}),/ADMIN_SOURCE_PROTECTION_INVALID/);
 protection.enforce_admins.enabled=true;ruleset.bypass_actors.push({actor_id:1});await assert.rejects(verifyStorageSourceProtection({token:'test-only-github-token',fetchImpl}),/ADMIN_SOURCE_PROTECTION_INVALID/);
 await assert.rejects(verifyStorageSourceProtection({token:'test-only-github-token',fetchImpl:async()=>({status:403})}),/ADMIN_SOURCE_READ_FAILED/);
});

test('junction parent cannot route an outside output into the source checkout',async t=>{
 const f=fixture(t);const junction=path.join(f.temp,'junction');
 fs.symlinkSync(f.args.root,junction,process.platform==='win32'?'junction':'dir');
 await assert.rejects(prepareDev121BusinessStoragePlan({...f.args,outputDirectory:path.join(junction,'outside-looking')},f.dependencies),/OUTPUT_PARENT_LINK|OUTPUT_INSIDE_SOURCE/);
 assert.equal(f.calls.length,0);assert.equal(fs.existsSync(path.join(f.args.root,'outside-looking')),false);
 // Also cover an unlinked child reached through a linked ancestor.
 fs.mkdirSync(path.join(f.args.root,'child'));
 await assert.rejects(prepareDev121BusinessStoragePlan({...f.args,outputDirectory:path.join(junction,'child','output')},f.dependencies),/OUTPUT_INSIDE_SOURCE/);
 assert.equal(f.calls.length,0);
});
