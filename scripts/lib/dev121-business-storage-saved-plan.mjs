import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readGitBlob} from './dev012-owner-stage-executor.mjs';
import {readGitAuthority} from './dev012-owner-prerequisite-producer.mjs';
import {verifyOfficialMergedSource} from './dev012-official-source-review.mjs';
import {collectDev121StoragePlanInputs,collectDev121BusinessStorageReadback} from './dev121-business-storage-readback.mjs';
import {canonicalize,readGcsObject,publishGcsJson} from './dev012-production-migration-runner.mjs';
import {assertDev121BusinessStoragePlan} from './dev121-business-storage-plan.mjs';

const ROOT='infra/google-cloud/dev-121-business-storage';
const FILES=['main.tf','versions.tf','.terraform.lock.hcl'];
const BACKEND={bucket:'tfstate-jenfu-platform-prod',prefix:'dev-121/business-storage'};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fail(code){throw new Error(`DEV121_STORAGE_SAVED_PLAN_${code}`);}

/** Only a temporary OAuth token is passed. Never inherit Terraform arguments,
 * variable files, credential/key paths, impersonation, plugin or CLI config. */
export function storageTerraformEnvironment(token,base=process.env){
  if(typeof token!=='string'||token.length<20)fail('TOKEN_REQUIRED');
  const env={};
  for(const [key,value] of Object.entries(base))if(['PATH','SYSTEMROOT','WINDIR','TEMP','TMP','PATHEXT','COMSPEC'].includes(key.toUpperCase()))env[key]=value;
  return {...env,GOOGLE_OAUTH_ACCESS_TOKEN:token,TF_IN_AUTOMATION:'1',TF_INPUT:'0',TF_WORKSPACE:'default'};
}

export function runStorageTerraform(args,{cwd,env}){
  const result=spawnSync('terraform',args,{cwd,env,encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024,timeout:300000});
  // Provider output may contain secrets. Never echo it on failure.
  if(result.error||result.status!==0)fail(`TERRAFORM_${args[0].toUpperCase()}_FAILED`);
  return result.stdout;
}

async function readBackend({token,fetchImpl=fetch}){
  const response=await fetchImpl(`https://storage.googleapis.com/storage/v1/b/${BACKEND.bucket}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`}});
  if(response.status!==200)fail('BACKEND_READ_FAILED');
  const body=await response.json();
  if(body.name!==BACKEND.bucket||String(body.projectNumber)!=='9536592944'||body.location!=='ASIA-EAST1'||body.iamConfiguration?.uniformBucketLevelAccess?.enabled!==true||body.iamConfiguration?.publicAccessPrevention!=='enforced'||body.versioning?.enabled!==true)fail('BACKEND_INVALID');
  return {bucket:body.name,projectNumber:String(body.projectNumber),location:body.location,versioning:true,private:true,prefix:BACKEND.prefix};
}

export async function verifyStorageSourceProtection({token,fetchImpl=fetch}){
  const read=async suffix=>{
    const response=await fetchImpl(`https://api.github.com/repos/jedchang0308-jenfu/AI-PDM/${suffix}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
    if(response.status!==200)fail('ADMIN_SOURCE_READ_FAILED');
    return response.json();
  };
  const [protection,ruleset]=await Promise.all([read('branches/main/protection'),read('rulesets/24077878')]);
  const contexts=protection.required_status_checks?.contexts;
  if(protection.enforce_admins?.enabled!==true||protection.allow_force_pushes?.enabled!==false||protection.allow_deletions?.enabled!==false||protection.required_pull_request_reviews?.required_approving_review_count!==0||!Array.isArray(contexts)||!['DEV-012 Isolated PostgreSQL Cutover','Production Slice QC'].every(value=>contexts.includes(value))||ruleset.id!==24077878||ruleset.enforcement!=='active'||!Array.isArray(ruleset.bypass_actors)||ruleset.bypass_actors.length!==0)fail('ADMIN_SOURCE_PROTECTION_INVALID');
  return {rulesetId:24077878,adminEnforced:true,bypassActors:0,status:'SOURCE_ADMIN_PROTECTION_VERIFIED'};
}

async function sourceSnapshot(root,token){
  const ownerProfile=JSON.parse(readGitBlob(root,'config/release/dev117-ai-pdm-independent-production-v3.json'));
  const git=readGitAuthority(root,ownerProfile);
  const review=await verifyOfficialMergedSource({repository:ownerProfile.application.repository,branch:ownerProfile.application.branch,revision:git.sourceRevision,sourceTree:git.sourceTree,token,rulesetId:24077878});
  const adminProtection=await verifyStorageSourceProtection({token});
  return {git,review:{...review,adminProtection},profile:JSON.parse(readGitBlob(root,'config/release/dev121-business-storage-plan.json',git.sourceRevision)),files:Object.fromEntries(FILES.map(name=>[name,readGitBlob(root,`${ROOT}/${name}`,git.sourceRevision)]))};
}

/** Produces a real saved plan, never applies it. CLI has no target/backend/var
 * overrides. Test dependencies are transports, not accepted command inputs. */
export async function prepareDev121BusinessStoragePlan({root,intentRef,outputDirectory,token,githubToken},dependencies={}){
  const collect=dependencies.collect??collectDev121StoragePlanInputs;
  const snapshot=dependencies.snapshot??sourceSnapshot;
  const backendRead=dependencies.backendRead??readBackend;
  const terraform=dependencies.terraform??runStorageTerraform;
  const env=storageTerraformEnvironment(token);
  if(typeof githubToken!=='string'||githubToken.length<20)fail('GITHUB_TOKEN_REQUIRED');
  if(!path.isAbsolute(outputDirectory)||fs.existsSync(outputDirectory))fail('NEW_ABSOLUTE_OUTPUT_REQUIRED');
  root=fs.realpathSync(root);
  const requestedParent=path.dirname(outputDirectory);
  // mkdir is non-recursive: the direct parent must already exist. Resolve all
  // ancestor junctions before checking ownership; reject a linked direct parent.
  if(fs.lstatSync(requestedParent).isSymbolicLink())fail('OUTPUT_PARENT_LINK');
  outputDirectory=path.join(fs.realpathSync(requestedParent),path.basename(outputDirectory));
  if(fs.existsSync(outputDirectory))fail('NEW_ABSOLUTE_OUTPUT_REQUIRED');
  const relative=path.relative(root,outputDirectory);
  if(relative===''||!relative.startsWith('..')&&!path.isAbsolute(relative))fail('OUTPUT_INSIDE_SOURCE');
  const source=await snapshot(root,githubToken);
  const inputs=await collect({root,intentRef,token});
  if(inputs.status!=='OWNER_PLAN_INPUTS_VERIFIED'||inputs.planInputProvenanceVerified!==true||inputs.expectedInputs?.source_revision!==source.git.sourceRevision)fail('SOURCE_INPUT_MISMATCH');
  const profile=source.profile;
  if(profile.terraformRoot!==ROOT||profile.backendKey!==`${BACKEND.prefix}/default.tfstate`||profile.backendBucket!==BACKEND.bucket)fail('FIXED_BACKEND_PROFILE_REQUIRED');
  if(Object.keys(source.files).sort().join(',')!==[...FILES].sort().join(','))fail('SOURCE_FILES_INVALID');
  for(const bytes of Object.values(source.files))if(!Buffer.isBuffer(bytes)||bytes.length===0)fail('SOURCE_FILES_INVALID');
  const backend=await backendRead({token});
  // Only create an isolated directory after every source/provider precondition.
  fs.mkdirSync(outputDirectory,{recursive:false});
  const work=path.join(outputDirectory,'terraform');
  fs.mkdirSync(work);
  // Terraform still needs a home/config location. Make it task-owned instead
  // of allowing its default discovery to reach user CLI credentials/plugins.
  const cliConfig=path.join(outputDirectory,'terraform.rc');
  fs.writeFileSync(cliConfig,'disable_checkpoint = true\n',{flag:'wx'});
  Object.assign(env,{HOME:outputDirectory,USERPROFILE:outputDirectory,APPDATA:outputDirectory,TF_CLI_CONFIG_FILE:cliConfig});
  const binary=path.join(work,'business.tfplan');
  const receiptPath=path.join(outputDirectory,'saved-plan.json');
  const journal={schemaVersion:'jenfu.dev121.business-storage-saved-plan.v1',status:'PLAN_STARTED',releaseAuthority:false,applyExecuted:false,outputDirectory,sourceRevision:source.git.sourceRevision,intentRef,backend};
  const write=()=>fs.writeFileSync(receiptPath,JSON.stringify(journal,null,2)+'\n');
  write();
  try{
    for(const [name,bytes] of Object.entries(source.files))fs.writeFileSync(path.join(work,name),bytes,{flag:'wx'});
    const execute=args=>terraform(args,{cwd:work,env});
    execute(['init','-input=false','-no-color','-lockfile=readonly',`-backend-config=bucket=${BACKEND.bucket}`,`-backend-config=prefix=${BACKEND.prefix}`]);
    execute(['plan','-input=false','-no-color','-lock-timeout=60s',`-out=${binary}`,...Object.entries(inputs.expectedInputs).map(([key,value])=>`-var=${key}=${value}`)]);
    const bytes=fs.readFileSync(binary);
    if(bytes.length===0)fail('EMPTY_BINARY_PLAN');
    const binarySha256=hash(bytes);
    const plan=JSON.parse(execute(['show','-json',binary]));
    const content=assertDev121BusinessStoragePlan(plan,{profile,expectedInputs:inputs.expectedInputs});
    // Network observations may outlive their deadline; do not emit a usable plan
    // if any prerequisite expired or changed while Terraform was running.
    const current=await collect({root,intentRef,token});
    if(JSON.stringify(current.expectedInputs)!==JSON.stringify(inputs.expectedInputs)||current.releaseId!==inputs.releaseId||current.deadlineAt!==inputs.deadlineAt||current.status!=='OWNER_PLAN_INPUTS_VERIFIED')fail('INPUTS_CHANGED');
    if(hash(fs.readFileSync(binary))!==binarySha256)fail('BINARY_PLAN_CHANGED');
    Object.assign(journal,{status:'SAVED_PLAN_VERIFIED_NOT_APPLIED',releaseId:inputs.releaseId,deadlineAt:inputs.deadlineAt,expectedInputs:inputs.expectedInputs,sourceTree:source.git.sourceTree,officialSource:source.review,sourceFiles:Object.fromEntries(Object.entries(source.files).map(([name,value])=>[name,hash(value)])),planFile:binary,binarySha256,content,planInputProvenanceVerified:true,providerResourcesVerified:false,effectiveInheritedIamVerified:false});
    fs.writeFileSync(path.join(outputDirectory,'plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
    const sourceFiles=checkFiles(work,source);
    const backendStateSha256=backendSnapshot(work);
    const bound={schemaVersion:'jenfu.dev121.business-storage-bound-plan.v1',ownerApplicationId:'ai-pdm',status:'SAVED_PLAN_PROVIDER_BOUND',sourceRevision:source.git.sourceRevision,sourceTree:source.git.sourceTree,releaseId:inputs.releaseId,deadlineAt:inputs.deadlineAt,intentRef,expectedInputs:inputs.expectedInputs,backend,backendStateSha256,sourceFiles,binarySha256,planContentSha256:content.planContentSha256,releaseAuthority:false};
    const uri=planReceiptUri(bound);
    const published=await (dependencies.publish??publishGcsJson)({uri,expectedBucket:RELEASE_BUCKET,expectedPrefix:'receipts/releases',value:bound,token});
    if(published.sha256!==hash(Buffer.from(canonicalize(bound)+'\n'))||!/^[1-9][0-9]*$/u.test(String(published.generation??'')))fail('PLAN_RECEIPT_PUBLISH_INVALID');
    journal.status='SAVED_PLAN_PROVIDER_BOUND_NOT_APPLIED';
    journal.providerPlanRef={uri,sha256:published.sha256};
    journal.providerPlanGeneration=String(published.generation);
    write();
    return journal;
  }catch(error){
    journal.status='PLAN_FAILED_NOT_APPLIED';
    // Keep binary/state/recovery evidence, but never make a failed plan usable.
    journal.failureCode=String(error.message).startsWith('DEV121_')?String(error.message).split(':')[0]:'PLAN_EXECUTION_FAILED';
    write();
    throw error;
  }
}

const RELEASE_BUCKET='jenfu-platform-prod-aipdm-release';
function backendSnapshot(work){
  if(fs.lstatSync(path.join(work,'.terraform')).isSymbolicLink())fail('BACKEND_LINK');
  const file=path.join(work,'.terraform','terraform.tfstate');
  if(fs.lstatSync(file).isSymbolicLink())fail('BACKEND_LINK');
  const bytes=fs.readFileSync(file);
  const backend=JSON.parse(bytes).backend;
  if(backend?.type!=='gcs'||backend.config?.bucket!==BACKEND.bucket||backend.config?.prefix!==BACKEND.prefix)fail('BACKEND_DRIFT');
  for(const key of ['access_token','credentials','impersonate_service_account','impersonate_service_account_delegates','encryption_key','kms_encryption_key','storage_custom_endpoint']){
    const value=backend.config[key];
    if(value!=null&&value!==''&&!(Array.isArray(value)&&value.length===0))fail('BACKEND_CREDENTIAL_OR_ENDPOINT');
  }
  return hash(bytes);
}
function checkFiles(work,source){
  const hashes={};
  for(const [name,bytes] of Object.entries(source.files)){
    const file=path.join(work,name);
    if(fs.lstatSync(file).isSymbolicLink()||!fs.readFileSync(file).equals(bytes))fail('FROZEN_FILES_CHANGED');
    hashes[name]=hash(bytes);
  }
  return hashes;
}
function assertSameInputs(actual,expected){
  if(actual.status!=='OWNER_PLAN_INPUTS_VERIFIED'||actual.planInputProvenanceVerified!==true||canonicalize(actual.expectedInputs)!==canonicalize(expected.expectedInputs)||actual.releaseId!==expected.releaseId||actual.deadlineAt!==expected.deadlineAt)fail('INPUTS_CHANGED');
}
function planReceiptUri(value){
  if(!/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(value.releaseId??'')||!/^[a-f0-9]{64}$/u.test(value.binarySha256??''))fail('PLAN_RECEIPT_BINDING');
  return `gs://${RELEASE_BUCKET}/receipts/releases/${value.releaseId}/business-storage/plan-${value.binarySha256}.json`;
}

export async function applyDev121BusinessStoragePlan({root,planRef,planDirectory,token,githubToken},dependencies={}){
  const env=storageTerraformEnvironment(token);
  if(typeof githubToken!=='string'||githubToken.length<20)fail('GITHUB_TOKEN_REQUIRED');
  if(!path.isAbsolute(planDirectory))fail('ABSOLUTE_PLAN_DIRECTORY_REQUIRED');
  root=fs.realpathSync(root);planDirectory=fs.realpathSync(planDirectory);
  const relative=path.relative(root,planDirectory);
  if(relative===''||!relative.startsWith('..')&&!path.isAbsolute(relative))fail('OUTPUT_INSIDE_SOURCE');
  const attemptFile=path.join(planDirectory,'apply-attempt.json');
  if(fs.existsSync(attemptFile))fail('PRIOR_APPLY_ATTEMPT_REQUIRES_READBACK');
  if(!planRef||Object.keys(planRef).sort().join(',')!=='sha256,uri'||!/^[a-f0-9]{64}$/u.test(planRef.sha256??''))fail('BOUND_PLAN_REF_REQUIRED');
  const read=dependencies.readObject??readGcsObject;
  const object=await read({uri:planRef.uri,expectedBucket:RELEASE_BUCKET,expectedPrefix:'receipts/releases',token});
  if(!Buffer.isBuffer(object.bytes)||hash(object.bytes)!==planRef.sha256||!/^[1-9][0-9]*$/u.test(String(object.generation??'')))fail('PLAN_RECEIPT_OBJECT_INVALID');
  const bound=JSON.parse(object.bytes);
  if(bound.schemaVersion!=='jenfu.dev121.business-storage-bound-plan.v1'||bound.ownerApplicationId!=='ai-pdm'||bound.status!=='SAVED_PLAN_PROVIDER_BOUND'||planRef.uri!==planReceiptUri(bound)||bound.backend?.bucket!==BACKEND.bucket||bound.backend?.prefix!==BACKEND.prefix)fail('PLAN_RECEIPT_BINDING');
  const source=await (dependencies.snapshot??sourceSnapshot)(root,githubToken);
  if(bound.sourceRevision!==source.git.sourceRevision||bound.sourceTree!==source.git.sourceTree)fail('SOURCE_INPUT_MISMATCH');
  const inputs=await (dependencies.collect??collectDev121StoragePlanInputs)({root,intentRef:bound.intentRef,token});
  assertSameInputs(inputs,bound);
  await (dependencies.backendRead??readBackend)({token});
  const work=path.join(planDirectory,'terraform');
  if(fs.lstatSync(work).isSymbolicLink())fail('WORK_DIRECTORY_LINK');
  if(canonicalize(checkFiles(work,source))!==canonicalize(bound.sourceFiles))fail('FROZEN_FILES_CHANGED');
  if(backendSnapshot(work)!==bound.backendStateSha256)fail('BACKEND_DRIFT');
  const binary=path.join(work,'business.tfplan');
  if(fs.lstatSync(binary).isSymbolicLink()||hash(fs.readFileSync(binary))!==bound.binarySha256)fail('BINARY_PLAN_CHANGED');
  const cliConfig=path.join(planDirectory,'apply-terraform.rc');
  fs.writeFileSync(cliConfig,'disable_checkpoint = true\n',{flag:'wx'});
  Object.assign(env,{HOME:planDirectory,USERPROFILE:planDirectory,APPDATA:planDirectory,TF_CLI_CONFIG_FILE:cliConfig});
  const terraform=dependencies.terraform??runStorageTerraform;
  const execute=args=>terraform(args,{cwd:work,env});
  const plan=JSON.parse(execute(['show','-json',binary]));
  const content=assertDev121BusinessStoragePlan(plan,{profile:source.profile,expectedInputs:inputs.expectedInputs});
  if(content.planContentSha256!==bound.planContentSha256||hash(fs.readFileSync(binary))!==bound.binarySha256)fail('BINARY_PLAN_CHANGED');
  const fresh=await (dependencies.collect??collectDev121StoragePlanInputs)({root,intentRef:bound.intentRef,token});
  assertSameInputs(fresh,bound);
  checkFiles(work,source);
  if(backendSnapshot(work)!==bound.backendStateSha256||hash(fs.readFileSync(binary))!==bound.binarySha256)fail('PLAN_CHANGED_BEFORE_APPLY');
  const journal={schemaVersion:'jenfu.dev121.business-storage-apply.v1',ownerApplicationId:'ai-pdm',status:'APPLY_STARTED',releaseAuthority:false,planRef,planGeneration:String(object.generation),sourceRevision:source.git.sourceRevision,binarySha256:bound.binarySha256,applyExecuted:true,effectiveInheritedIamVerified:false};
  fs.writeFileSync(attemptFile,JSON.stringify(journal,null,2)+'\n',{flag:'wx'});
  const write=()=>fs.writeFileSync(attemptFile,JSON.stringify(journal,null,2)+'\n');
  let applied=false;
  try{
    // No vars, targets, auto-approve or replanning: this exact binary only.
    execute(['apply','-input=false','-no-color','-lock-timeout=60s',binary]);applied=true;
    const rawState=execute(['state','pull']);
    const state=JSON.parse(rawState);
    if(typeof state.lineage!=='string'||!state.lineage||!Number.isInteger(state.serial)||state.serial<1)fail('STATE_READBACK_INVALID');
    const actual=JSON.parse(execute(['show','-json']));
    const output=JSON.parse(execute(['output','-json']));
    const binding=output.business_storage_binding?.value;
    const expected={project_id:'jenfu-platform-prod',project_number:'9536592944',region:'asia-east1',bucket:'jenfu-platform-prod-aipdm-files',runtime_identity:'aipdm-prod-runtime@jenfu-platform-prod.iam.gserviceaccount.com',permissions:['storage.objects.create','storage.objects.get'],...inputs.expectedInputs};
    if(!binding||canonicalize({...binding,permissions:[...(binding.permissions??[])].sort()})!==canonicalize(expected)||canonicalize(actual.values?.outputs?.business_storage_binding?.value)!==canonicalize(binding))fail('OUTPUT_READBACK_INVALID');
    if(actual.values?.root_module?.child_modules?.length)fail('STATE_EXTRA_MODULES');
    const resources=actual.values?.root_module?.resources;
    if(!Array.isArray(resources))fail('STATE_READBACK_INVALID');
    assertDev121BusinessStoragePlan({variables:Object.fromEntries(Object.entries(inputs.expectedInputs).map(([key,value])=>[key,{value}])),resource_changes:resources.map(row=>({address:row.address,change:{actions:['no-op'],before:row.values,after:row.values,after_unknown:{}}}))},{profile:source.profile,expectedInputs:inputs.expectedInputs});
    const getJson=async url=>{const response=await fetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`}});return {status:response.status,body:response.status===200?await response.json():null};};
    const provider=await (dependencies.resourceReadback??collectDev121BusinessStorageReadback)({getJson});
    if(provider.status!=='OWN_BUSINESS_STORAGE_RESOURCES_MATCH'||provider.ownResourcesVerified!==true)fail('PROVIDER_READBACK_INVALID');
    fs.writeFileSync(path.join(planDirectory,'post-apply-state.json'),rawState,{flag:'wx'});
    fs.writeFileSync(path.join(planDirectory,'post-apply-output.json'),JSON.stringify(output,null,2)+'\n',{flag:'wx'});
    Object.assign(journal,{status:'OWN_STORAGE_APPLIED_NOT_RELEASED',releaseId:bound.releaseId,stateLineage:state.lineage,stateSerial:state.serial,stateSha256:hash(rawState),outputSha256:hash(canonicalize(output)),provider,providerResourcesVerified:true});
    const uri=`gs://${RELEASE_BUCKET}/receipts/releases/${bound.releaseId}/business-storage/apply-${bound.binarySha256}.json`;
    const published=await (dependencies.publish??publishGcsJson)({uri,expectedBucket:RELEASE_BUCKET,expectedPrefix:'receipts/releases',value:journal,token});
    journal.providerReceiptRef={uri,sha256:published.sha256};write();return journal;
  }catch{
    journal.status=applied?'APPLIED_READBACK_OR_RECEIPT_FAILED':'APPLY_OUTCOME_UNKNOWN';
    journal.requiresProviderReadbackBeforeRetry=true;write();
    fail(journal.status);
  }
}
