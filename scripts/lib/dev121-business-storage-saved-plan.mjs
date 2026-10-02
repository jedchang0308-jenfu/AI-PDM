import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readGitBlob} from './dev012-owner-stage-executor.mjs';
import {readGitAuthority} from './dev012-owner-prerequisite-producer.mjs';
import {verifyOfficialMergedSource} from './dev012-official-source-review.mjs';
import {collectDev121StoragePlanInputs} from './dev121-business-storage-readback.mjs';
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
  return {...env,GOOGLE_OAUTH_ACCESS_TOKEN:token,TF_IN_AUTOMATION:'1',TF_INPUT:'0'};
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
  const relative=path.relative(path.resolve(root),path.resolve(outputDirectory));
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
