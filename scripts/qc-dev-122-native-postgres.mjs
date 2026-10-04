#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { compileOwnMigrations, bootstrapOwnSchemas, installOwnFixture, installContractFixture, marker, fixtureVersion, sha256 } from './lib/dev122-own-postgres-fixture.mjs';
import { loadSeamAllowlist, mapContractQuery, seamVersion } from './lib/dev122-contract-seam.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextCopyFiles=['package.json','next.config.mjs','tsconfig.json','tsconfig.app.json','tsconfig.next.json','next-env.d.ts'];
const nextCopyDirectories=['src','public','db','config','contracts'];
const previewDiagnosticClock=Date.parse('2026-10-04T05:00:00.000Z');
const previewDiagnosticInputs=[
  {id:'running-fresh',status:'running',age:29999,attempt:2},
  {id:'running-expired',status:'running',age:30001,attempt:2},
  {id:'running-microseconds',status:'running',age:30001,attempt:2,nativeTimestamp:'2026-10-04 04:59:29.999123+00'},
  {id:'running-limit',status:'running',age:30001,attempt:3},
  {id:'queued-fresh',status:'queued',age:119999,attempt:2},
  {id:'queued-expired',status:'queued',age:120001,attempt:2},
  {id:'other-company',status:'running',age:30001,attempt:2,other:true},
  {id:'unsupported',status:'running',age:30001,attempt:2,extension:'step'},
  {id:'replacement-source',status:'running',age:30001,attempt:2,replaced:true},
  {id:'heartbeat-race',status:'running',age:30001,attempt:2},
  {id:'unsupported-kind',status:'running',age:30001,attempt:2,requestedKind:'drawing_pdf'}
].map(input=>({requestedKind:'native_thumbnail_png',...input}));
const suite = process.argv.find(arg => arg.startsWith('--suite='))?.slice(8) ?? 'all';
const runRecognition=process.env.DEV122_RUN_RECOGNITION==='1';
if(process.env.DEV122_RUN_RECOGNITION&&!['0','1'].includes(process.env.DEV122_RUN_RECOGNITION)||runRecognition&&suite!=='ui')throw new Error('DEV122_RECOGNITION_EXECUTOR_REJECTED');
const nativeSelection=process.env.DEV122_NATIVE_SELECTION??'suite';
if(!['suite','root-guard-regression','drawing-root-only','part-root-only','part-root-link','mapping-constraints','file-route-gaps','legacy-compatibility','legacy-part','drawing-old-basis','foundation-gaps','authority-gaps','other-company-scope','drawing-basis-gaps','file-authority-gaps','recognition-protocol','drawing-identity-gaps','drawing-revision-identity'].includes(nativeSelection)||nativeSelection!=='suite'&&suite!==(['file-route-gaps','file-authority-gaps','recognition-protocol'].includes(nativeSelection)?'files':'lifecycle'))throw new Error('DEV122_NATIVE_SELECTION_REJECTED');
const nativeTestPattern=suite==='settings'?'DEV122 actual Next settings prerequisites':suite==='ui'?'DEV122 actual Next UI prerequisites':nativeSelection==='drawing-old-basis'
  ?'rejects old major basis missing|approves minor with legal Released|approves a subsequent major':nativeSelection==='foundation-gaps'
  ?'reads native matrix JSON-|denies the default rd_manager-only|rejects native formal_payload drift':nativeSelection==='authority-gaps'
  ?'no eligible current reviewer|Part reviewer self|legal other-company Principal|Part terminal master|Drawing master .* drift|Drawing current assignment|returns a minor without':nativeSelection==='other-company-scope'
  ?'legal other-company Principal':nativeSelection==='drawing-basis-gaps'
  ?'minor with another numbering|subsequent major after actual production pointer':nativeSelection==='file-authority-gaps'
  ?'Part attachment normal|worker claim excludes native|claimed content rejects native':nativeSelection==='recognition-protocol'
  ?'recognition real-source signed session':nativeSelection==='drawing-identity-gaps'
  ?'Drawing actual frozen|Drawing malformed root|Drawing cross-company master|Drawing immutable assigned':nativeSelection==='drawing-revision-identity'
  ?'Drawing actual frozen revision identity':nativeSelection==='legacy-compatibility'?'historical v1 .* nonrelease basis':nativeSelection==='legacy-part'?'historical v1 part nonrelease basis':nativeSelection==='file-route-gaps'
  ?'canonical preview rejects stale derivative|review package immutable file bytes|no-job canonical preview|canonical recovery races actual':nativeSelection==='mapping-constraints'
  ?'Drawing nonnull master label mismatch|Drawing mapping native unique':nativeSelection==='part-root-link'?'Part real samecompany root drift|Part wrongroot relation link':nativeSelection==='part-root-only'?'Part real samecompany root drift':nativeSelection==='drawing-root-only'?'Drawing real samecompany root drift':nativeSelection==='root-guard-regression'
  ?'Part real samecompany root drift|Drawing real samecompany root drift|historical v1 .* nonrelease basis|creates, edits, submits and approves a part|uses normal Draft creation and release-only|keeps a minor master Draft, then atomically releases|rolls back a post-formalize failure':null;
const diagnosticOnly=process.argv.includes('--diagnostic-only');
const previewDiagnosticChild=process.argv.includes('--preview-diagnostic-child');
const previewImportOnly=process.argv.includes('--preview-import-only');
if (!['lifecycle','files','procurement','ui','settings','all'].includes(suite) || process.argv.slice(2).some(arg => !['--plan-only','--diagnostic-only','--preview-diagnostic-child','--preview-import-only'].includes(arg) && !arg.startsWith('--suite=')) || diagnosticOnly && !['procurement','files'].includes(suite)) throw new Error('DEV122_ARGUMENT_REJECTED');
const entries = compileOwnMigrations(root);
const sourceHead = execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const config = loadSeamAllowlist(root);
const plan = { project:'AIPDM', suite, sourceHead, fixtureVersion, seamVersion, marker,
  evidenceScope:'REAL_BUSINESS_NATIVE_PG_WITH_LOCAL_VERSIONED_CONTRACT_SEAM', producerBoundary:'FIXTURE',
  producerIntegration:'NOT_RUN', production:'NOT_RUN', migrations:entries.map(({sql,...entry})=>entry),
  templates:config.templates.map(({sql,mappedSql,...entry})=>entry),
  primaryActions:['disposable loopback PostgreSQL','own schemas','runtime nonowner DML','actual Next normal UI'],
  primaryDatabaseMutation:false, siblingInput:false };
if (previewDiagnosticChild) await runPreviewDiagnosticChild();
else if (process.argv.includes('--plan-only')) {
  process.stdout.write(JSON.stringify({...plan,status:'PLAN_ONLY',executedCases:0},null,2)+'\n');
} else await run();

async function freePort() {
  const server=net.createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));return port;
}
async function portReleased(port) {
  return new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',()=>resolve(true));});
}
function processIdentity(pid) {
  if(process.platform!=='win32')return {pid,executable:process.execPath,startToken:null};
  const script=`$p=Get-Process -Id ${Number(pid)} -ErrorAction Stop; @{pid=$p.Id;executable=$p.Path;startToken=$p.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()} | ConvertTo-Json -Compress`;
  return JSON.parse(execFileSync('powershell',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}));
}
function sameProcess(expected) {
  try{const current=processIdentity(expected.pid);return current.startToken===expected.startToken&&
    path.resolve(current.executable).toLowerCase()===path.resolve(expected.executable).toLowerCase();}catch{return false;}
}
function governorRuntime(action,identity,port=null) {
  const {DEV122_GOVERNOR_SESSION:session,DEV122_GOVERNOR_SCRIPT:script,DEV122_GOVERNOR_PYTHON:python}=process.env;
  if(!session||!script||!python)throw new Error('DEV122_GOVERNOR_RUNTIME_REGISTRATION_REQUIRED');
  const args=[script,'--agent-host','codex','--format','json','session','runtime',action,'--session',session,
    '--pid',String(identity.pid),'--start-token',identity.startToken];
  if(action==='register')args.push('--executable',identity.executable,'--purpose','AI-PDM DEV122 task-owned native validation',
    '--cleanup-condition','DEV122 suite or diagnostic finished',...(port?['--port',String(port)]:[]));
  else args.push('--reason','exited');
  const output=execFileSync(python,args,{cwd:root,encoding:'utf8',windowsHide:true});
  const receipt=JSON.parse(output);
  if(receipt.error||receipt.status==='ERROR'||receipt.status==='FAIL')throw new Error('DEV122_GOVERNOR_REGISTRATION_REJECTED');
  return receipt;
}
function directoryBytes(directory) {
  if(!fs.existsSync(directory))return 0;
  return fs.readdirSync(directory,{withFileTypes:true}).reduce((sum,entry)=>sum+(entry.isDirectory()?directoryBytes(path.join(directory,entry.name)):fs.statSync(path.join(directory,entry.name)).size),0);
}
function prepareNextCopy(runtimeRoot,evidenceRoot) {
  const copyRoot=path.join(runtimeRoot,'app-project'),inputs=[],absentOptionalInputs=[];
  fs.mkdirSync(copyRoot);fs.writeFileSync(path.join(copyRoot,'owner-marker'),marker);
  function copy(relative) {
    if(path.basename(relative)==='.env'||path.basename(relative).startsWith('.env.'))throw new Error('DEV122_NEXT_ENV_INPUT_REJECTED');
    const source=path.join(root,relative),target=path.join(copyRoot,relative),stat=fs.lstatSync(source);
    if(stat.isSymbolicLink())throw new Error('DEV122_NEXT_SOURCE_LINK_REJECTED:'+relative);
    if(stat.isDirectory()){fs.mkdirSync(target,{recursive:true});for(const name of fs.readdirSync(source).sort())copy(path.join(relative,name));return;}
    if(!stat.isFile())throw new Error('DEV122_NEXT_SOURCE_NONREGULAR_REJECTED:'+relative);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
    const sourceHash=sha256(fs.readFileSync(source)),copyHash=sha256(fs.readFileSync(target));
    if(sourceHash!==copyHash)throw new Error('DEV122_NEXT_COPY_HASH_MISMATCH:'+relative);
    inputs.push({path:relative.replaceAll('\\','/'),bytes:stat.size,sourceHash,copyHash});
  }
  for(const relative of nextCopyFiles)copy(relative);
  for(const relative of nextCopyDirectories) {
    if(relative==='public'&&!fs.existsSync(path.join(root,relative))){absentOptionalInputs.push({path:relative,sourceExists:false,copyExists:false});continue;}
    copy(relative);
  }
  const configPath=path.join(copyRoot,'next.config.mjs'),config=fs.readFileSync(configPath,'utf8');
  if(config.split('const nextConfig = {').length!==2)throw new Error('DEV122_NEXT_COPY_CONFIG_SHAPE_INVALID');
  const isolatedConfig=config.replace('const nextConfig = {','const nextConfig = {\n  agentRules: false,');
  fs.writeFileSync(configPath,isolatedConfig);
  const nodeModules=path.join(copyRoot,'node_modules'),dependencyTarget=fs.realpathSync(path.join(root,'node_modules'));
  fs.symlinkSync(dependencyTarget,nodeModules,process.platform==='win32'?'junction':'dir');
  if(fs.realpathSync(nodeModules)!==dependencyTarget||!fs.lstatSync(nodeModules).isSymbolicLink())throw new Error('DEV122_NEXT_JUNCTION_INVALID');
  const receipt={copyRoot,inputs,absentOptionalInputs,configDifference:{only:'agentRules:false',sourceHash:sha256(config),copyHash:sha256(isolatedConfig)},
    dependencyJunction:{path:nodeModules,target:dependencyTarget},hardCapBytes:2*1024*1024*1024,
    sourceConfigBefore:nextCopyFiles.map(relative=>({path:relative,hash:sha256(fs.readFileSync(path.join(root,relative)))}))};
  fs.writeFileSync(path.join(evidenceRoot,'next-source-copy.json'),JSON.stringify(receipt,null,2));return receipt;
}
function nextCopyBytes(copy) {
  function measure(directory) {
    let bytes=0;
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
      const target=path.join(directory,entry.name),stat=fs.lstatSync(target);
      if(stat.isSymbolicLink()) {
        if(target!==copy.dependencyJunction.path||fs.realpathSync(target)!==copy.dependencyJunction.target)throw new Error('DEV122_NEXT_UNEXPECTED_LINK');
        continue; // Never follow the dependency junction for capacity or cleanup.
      }
      if(stat.isDirectory())bytes+=measure(target);else if(stat.isFile())bytes+=stat.size;else throw new Error('DEV122_NEXT_OUTPUT_NONREGULAR');
    }
    return bytes;
  }
  return measure(copy.copyRoot);
}
function nextCapacityAdmission(evidenceRoot) {
  const file=path.join(evidenceRoot,'next-capacity-admission.json');
  const args=[process.env.DEV122_GOVERNOR_SCRIPT,'--agent-host','codex','--format','json','check','--volume','C:/',
    '--action','lint_test','--reserve-gb','2','--session',process.env.DEV122_GOVERNOR_SESSION,
    '--operation-id','dev122-next-ui-bounded2g-20261004','--reserve'];
  let bytes;
  try{bytes=Buffer.from(execFileSync(process.env.DEV122_GOVERNOR_PYTHON,args,{encoding:'utf8',windowsHide:true}));}
  catch(error){bytes=Buffer.from(error.stdout??'');fs.writeFileSync(file,bytes);throw error;}
  fs.writeFileSync(file,bytes);
  const receipt=JSON.parse(bytes),lease=receipt.data?.lease;
  if(receipt.exit_code!==0||!['OK','WARNING'].includes(receipt.status)||lease?.status!=='active'||
    lease.development_operation_id!=='dev122-next-ui-bounded2g-20261004'||lease.operation_kind!=='lint_test'||
    lease.reserved_bytes!==2*1024*1024*1024||Date.parse(lease.expires_at)<=Date.now())throw new Error('DEV122_NEXT_CAPACITY_ADMISSION_INVALID_OR_EXPIRED');
  return {file,hash:sha256(bytes),status:receipt.status,lease};
}
function exactDependencies() {
  const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  const packageJson=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const mismatches=[];
  for(const name of diagnosticOnly?['pg']:Object.keys({...packageJson.dependencies,...packageJson.devDependencies})) {
    const expected=lock.packages['node_modules/'+name]?.version;
    let observed=null;try{observed=JSON.parse(fs.readFileSync(path.join(root,'node_modules',name,'package.json'),'utf8')).version;}catch{}
    if(!expected||observed!==expected)mismatches.push({name,expected,observed});
  }
  if(mismatches.length)throw Object.assign(new Error('DEV122_EXACT_DEPENDENCIES_REQUIRED'),{mismatches});
  return {next:diagnosticOnly?'NOT_RUN':packageJson.dependencies.next,
    scope:diagnosticOnly?'PG_ONLY_DIAGNOSTIC':'ALL_DIRECT_DEPENDENCIES'};
}
function exactImportClosure(names) {
  const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8')),inventory=[],seen=new Set();
  function visit(name,from=path.join(root,'package.json')) {
    const require=createRequire(from);let packagePath;
    try{packagePath=require.resolve(name+'/package.json');}
    catch{let directory=path.dirname(require.resolve(name));while(directory!==path.dirname(directory)){
      const candidate=path.join(directory,'package.json');if(fs.existsSync(candidate)&&JSON.parse(fs.readFileSync(candidate,'utf8')).name===name){packagePath=candidate;break;}directory=path.dirname(directory);}}
    if(!packagePath)throw new Error('DEV122_IMPORT_PACKAGE_METADATA_MISSING:'+name);
    const directory=path.dirname(packagePath),relative=path.relative(root,directory).replaceAll('\\','/');
    if(!relative.startsWith('node_modules/')||relative.includes('../'))throw new Error('DEV122_IMPORT_OUTSIDE_OWN_DEPENDENCIES');
    if(seen.has(packagePath))return;seen.add(packagePath);
    const bytes=fs.readFileSync(packagePath),metadata=JSON.parse(bytes),expected=lock.packages[relative]?.version;
    inventory.push({name,packagePath:relative,expected,installed:metadata.version,metadataHash:sha256(bytes)});
    if(!expected||metadata.version!==expected)throw Object.assign(new Error('DEV122_IMPORT_CLOSURE_VERSION_DRIFT'),{mismatches:inventory});
    for(const dependency of Object.keys(metadata.dependencies||{}))visit(dependency,packagePath);
  }
  for(const name of names)visit(name);return inventory;
}
function postgresBin() {
  const candidates=process.platform==='win32'?['C:/Program Files/PostgreSQL/18/bin','C:/Program Files/PostgreSQL/17/bin']:['/usr/lib/postgresql/18/bin','/usr/lib/postgresql/17/bin'];
  const suffix=process.platform==='win32'?'.exe':'';
  const directory=candidates.find(candidate=>['initdb','pg_ctl','postgres'].every(name=>fs.existsSync(path.join(candidate,name+suffix))));
  if(!directory)throw new Error('DEV122_LOCAL_POSTGRES_BIN_UNAVAILABLE');
  return name=>path.join(directory,name+suffix);
}

function captureControlledSource() {
  const files=['package.json','package-lock.json','next.config.mjs','next-env.d.ts','tsconfig.json','tsconfig.app.json','tsconfig.next.json',
    'scripts/qc-dev-122-native-postgres.mjs','scripts/qc-dev-122-native-browser.mjs','scripts/qc-ts-path-loader.mjs',
    'scripts/lib/dev122-own-postgres-fixture.mjs','scripts/lib/dev122-contract-seam.mjs','scripts/lib/dev122-contract-seam-preload.mjs',
    'scripts/run-drawing-recognition-worker.mjs','scripts/run-solidworks-document-manager-credential-probe.mjs',
    'scripts/run-solidworks-document-manager-metadata-extractor.mjs','scripts/solidworks-document-manager-credential-probe.cs','scripts/solidworks-document-manager-metadata-exporter.cs',
    'config/solidworks-metadata-field-aliases.json','config/local/dev122-native-postgres.v1.json','.ai-doc/specs/DEV-122-ai-pdm-internal-function-issues.md'];
  function visit(relative) {
    for(const name of fs.readdirSync(path.join(root,relative)).sort()) {
      const source=relative+'/'+name,stat=fs.lstatSync(path.join(root,source));
      if(stat.isSymbolicLink())throw new Error('DEV122_SOURCE_BINDING_LINK_REJECTED');
      if(stat.isDirectory())visit(source);else if(stat.isFile())files.push(source);else throw new Error('DEV122_SOURCE_BINDING_NONREGULAR');
    }
  }
  visit('src');visit('db/postgres');
  const bindings=files.sort().map(source=>({source,hash:sha256(fs.readFileSync(path.join(root,source)))}));
  return {project:'AIPDM',sourceHead,scope:'fixed own source/config/runner/fixture/seam and all own src/Postgres migrations; no data/environment inputs',
    bindings,hash:sha256(Buffer.from(JSON.stringify(bindings)))};
}
async function run() {
  const runId=crypto.randomBytes(8).toString('hex'),database='dev122_'+runId;
  const runtimeRoot=path.join(root,'.tmp','dev122',runId),evidenceRoot=path.join(root,'output','qa','dev-122',runId);
  const pgPort=await freePort(),nextPort=await freePort();
  fs.mkdirSync(runtimeRoot,{recursive:true});fs.mkdirSync(evidenceRoot,{recursive:true});
  fs.writeFileSync(path.join(runtimeRoot,'owner-marker'),marker);
  const dataDir=path.join(runtimeRoot,'data'),repositoryDir=path.join(runtimeRoot,'repository'),distDir=path.join(runtimeRoot,'next-dist');
  for(const directory of [dataDir,repositoryDir,distDir])fs.mkdirSync(directory);
  const manifest={...plan,runId,status:'RUNNING',dependencies:null,executedCases:0,
    runtimeDeclaration:{project:'AIPDM',purpose:`DEV122 ${suite}`,ports:{postgres:pgPort,next:nextPort},
      boundedExpectedClusterBytes:200*1024*1024,logLimitBytes:16*1024*1024,
      owningProcessTree:{runner:process.pid,children:[]},cleanupCondition:'finally stop exact owned children/PG cluster; verify ports released; remove marked task directory',
      PDM_DATA_DIR:dataDir,PDM_REPOSITORY_DIR:repositoryDir,mutationScope:runtimeRoot,
      postgres:{host:'127.0.0.1',database,user:'dev122_runtime',schema:['ai_pdm_core','ai_pdm_contract'],marker}},
    cases:[],firstFailure:null,cleanup:{childrenStopped:false,pgStopped:false,portsReleased:false,tempRemoved:false}};
  const save=()=>fs.writeFileSync(path.join(evidenceRoot,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  manifest.controlledSourceBefore=captureControlledSource();
  fs.writeFileSync(path.join(evidenceRoot,'source-binding-before.json'),JSON.stringify(manifest.controlledSourceBefore,null,2));
  save(); // Persist before every runtime starts.
  const children=[];let pgStarted=false,admin=null,bootstrap=null,bin,grantFixtureChannel=null,nextCopy=null,nextCapTimer=null,nextCapFailure=null;
  const env={...process.env,DEV122_SOURCE_ROOT:root,DEV122_RUNTIME_ROOT:runtimeRoot,DEV122_EVIDENCE_ROOT:evidenceRoot,
    DEV122_NATIVE_SUITE:suite,DEV122_LOCAL_CONTRACT_SEAM:seamVersion,PDM_DEPLOYMENT_ENV:'local',
    PDM_DB_PROVIDER:'postgres',PDM_POSTGRES_URL:`postgresql://dev122_runtime@127.0.0.1:${pgPort}/${database}`,
    DEV010_N2_DATABASE_BOUNDARY:'required',PDM_DATA_DIR:dataDir,PDM_REPOSITORY_DIR:repositoryDir,
    PDM_NEXT_DIST_DIR:path.relative(root,distDir).replaceAll('\\','/'),PDM_NEXT_TSCONFIG_PATH:path.relative(root,path.join(runtimeRoot,'next-tsconfig.json')).replaceAll('\\','/'),
    PDM_AUTH_MODE:'firebase_bff',PDM_JENFU_PLATFORM_AUTH_MODE:'on',PDM_JENFU_ENTITLEMENT_MODE:'enforce',JENFU_FIREBASE_PROJECT_ID:'dev122-local-fixture',
    PDM_FIREBASE_PROJECT_ID:'dev122-local-fixture',JENFU_IDENTITY_ISSUER:'https://securetoken.google.com/dev122-local-fixture',
    JENFU_IDENTITY_AUDIENCE:'dev122-local-fixture',PDM_SESSION_ISSUER:'dev122-local-fixture',PDM_SESSION_AUDIENCE:'ai-pdm',
    PDM_SESSION_CURRENT_KEY_ID:'dev122-local',PDM_SESSION_CURRENT_SECRET:crypto.randomBytes(48).toString('hex'),
    PDM_DEV087_FAULT_PROFILE:'',PDM_LOCAL_FAKE_PREVIEW_WORKER:'0',PDM_REVIEW_PACKAGE_V2_WRITE:'true',
    DEV122_APP_ORIGIN:`http://127.0.0.1:${nextPort}`,NODE_OPTIONS:`--import=${pathToFileURL(path.join(root,'scripts/lib/dev122-contract-seam-preload.mjs')).href}`};
  for(const name of ['K_SERVICE','GOOGLE_CLOUD_PROJECT','GOOGLE_APPLICATION_CREDENTIALS','PDM_CLOUD_SQL_DATABASE','PDM_SESSION_PREVIOUS_KEY_ID','PDM_SESSION_PREVIOUS_SECRET','DEV122_NEXT_PROJECT_ROOT'])delete env[name];
  if(suite==='settings') {
    // Empty, read-only local settings proof; never inherit a credential/provider or a full-function bypass.
    Object.assign(env,{DEV122_BROWSER_FLOW:'settings',DEV122_BROWSER_PREFLIGHT:'0',DEV122_BROWSER_VIEWPORT:'all',
      PDM_PRODUCTION_SLICE_MODE:'official-numbering-draft',PDM_LOCAL_FULL_FUNCTION_VALIDATION:'false',
      PDM_SETTINGS_SECRET_PROVIDER:'google_secret_manager',PDM_ENABLE_GCP_SECRET_READS:'false',PDM_ENABLE_GCP_SECRET_WRITES:'false',
      PDM_ALLOW_WORKER_ENV_SECRET_FALLBACK:'false',PDM_DISABLE_SECRET_MANAGEMENT:'false'});
    for(const name of ['PDM_GCP_PROJECT_ID','PDM_SOLIDWORKS_DOCUMENT_MANAGER_SECRET_ID','PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY',
      'PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY','SOLIDWORKS_DOCUMENT_MANAGER_KEY','PDM_WORKLOAD_AUTH_CREDENTIALS',
      'PDM_WORKER_SERVICE_TOKEN','PDM_BREAK_GLASS_CHANGE_ID','PDM_WINDOWS_DPAPI_SECRET_DIR'])delete env[name];
    manifest.settingsBoundary={flow:'settings',slice:'official-numbering-draft',provider:'google_secret_manager',
      readEnabled:false,writeEnabled:false,credentialInput:'NOT_RUN',nativeProperties:'PENDING_HUMAN_PRODUCTION_VALIDATION',
      summaryOnlyRole:'UNREACHABLE_UNDER_COMMITTED_CATALOG_V5_UNIT_LAYER_ONLY',resultSeeded:false};save();
  }
  manifest.authorizationModes={inherited:Object.fromEntries(['PDM_AUTH_MODE','PDM_JENFU_PLATFORM_AUTH_MODE','PDM_JENFU_ENTITLEMENT_MODE'].map(name=>[name,process.env[name]??null])),
    effective:{PDM_AUTH_MODE:env.PDM_AUTH_MODE,PDM_JENFU_PLATFORM_AUTH_MODE:env.PDM_JENFU_PLATFORM_AUTH_MODE,PDM_JENFU_ENTITLEMENT_MODE:env.PDM_JENFU_ENTITLEMENT_MODE}};
  if(env.PDM_AUTH_MODE!=='firebase_bff'||env.PDM_JENFU_PLATFORM_AUTH_MODE!=='on'||env.PDM_JENFU_ENTITLEMENT_MODE!=='enforce')throw new Error('DEV122_AUTHORIZATION_MODE_PREFLIGHT_FAILED');
  save();
  const isolatedTsconfig={extends:'../../../tsconfig.next.json',compilerOptions:{incremental:false,baseUrl:'../../..',paths:{'@/*':['src/*']}},
    include:['../../../next-env.d.ts','../../../src/**/*.ts','../../../src/**/*.tsx', './next-dist/types/**/*.ts','./next-dist/dev/types/**/*.ts'],exclude:['../../../node_modules','../../../output','../../../backups']};
  if(path.resolve(runtimeRoot,isolatedTsconfig.compilerOptions.baseUrl)!==root)throw new Error('DEV122_NEXT_ALIAS_ROOT_INVALID');
  fs.writeFileSync(path.join(runtimeRoot,'next-tsconfig.json'),JSON.stringify(isolatedTsconfig));
  manifest.nextTsconfig={path:path.join(runtimeRoot,'next-tsconfig.json'),hash:sha256(Buffer.from(JSON.stringify(isolatedTsconfig))),aliasRoot:root};save();
  async function child(label,args,{wait=true,childEnv=env,childCwd=root,allowNonzero=false}={}) {
    manifest.runtimeDeclaration.owningProcessTree.children.push({label,plannedExecutable:process.execPath,args,pid:null});save();
    const processChild=spawn(process.execPath,args,{cwd:childCwd,env:childEnv,stdio:['ignore','pipe','pipe'],windowsHide:true});children.push(processChild);
    const declaration=manifest.runtimeDeclaration.owningProcessTree.children.at(-1);declaration.pid=processChild.pid;
    processChild.dev122Identity=declaration;
    const log=fs.createWriteStream(path.join(evidenceRoot,label+'.log'));
    processChild.stdout.pipe(log);processChild.stderr.pipe(log);
    const done=new Promise((resolve,reject)=>{processChild.once('error',reject);processChild.once('exit',code=>{log.end();resolve(code);});});
    done.catch(()=>{}); // Attach immediately; the controller still awaits the original outcome.
    processChild.dev122Done=done;
    if(processChild.pid)Object.assign(declaration,processIdentity(processChild.pid));
    declaration.governor=governorRuntime('register',declaration,label==='next'?nextPort:null);
    fs.writeFileSync(path.join(runtimeRoot,`governor-child-${processChild.pid}.ready`),marker);save();
    if(!wait)return processChild;
    const code=await done;if(code!==0&&!allowNonzero)throw Object.assign(new Error(`DEV122_CHILD_FAILED:${label}`),{exitCode:code});return code;
  }
  try {
    manifest.dependencies=exactDependencies();save();
    if(diagnosticOnly&&suite==='files') {
      manifest.importClosure=exactImportClosure(['pg','google-auth-library']);
      manifest.sourceBindings=['src/lib/preview-derivatives.ts','src/lib/file-storage.ts','src/lib/google-cloud-file-storage.ts','scripts/qc-ts-path-loader.mjs',
        'scripts/lib/dev122-contract-seam-preload.mjs','db/postgres/079_dev122_canonical_review_lifecycle.sql'].map(source=>({source,hash:sha256(fs.readFileSync(path.join(root,source)))}));save();
      await child('preview-import-preflight',['--experimental-transform-types','--loader','./scripts/qc-ts-path-loader.mjs',
        'scripts/qc-dev-122-native-postgres.mjs','--suite=files','--diagnostic-only','--preview-diagnostic-child','--preview-import-only'],{childEnv:{...env,NODE_OPTIONS:''}});
    }
    const {default:pg}=await import('pg');bin=postgresBin();
    const cluster=path.join(runtimeRoot,'cluster');
    execFileSync(bin('initdb'),['-D',cluster,'-U','dev122_bootstrap','--auth=trust','--encoding=UTF8','--no-locale'],{windowsHide:true,stdio:'pipe'});
    // Loopback binding is in pg_ctl options; never accept an external DSN.
    // PostgreSQL is a background process: inherited pipe handles keep Windows
    // execFileSync waiting for EOF after pg_ctl exits. Its bounded log is -l.
    execFileSync(bin('pg_ctl'),['-D',cluster,'-l',path.join(evidenceRoot,'postgres.log'),'-o',`-h 127.0.0.1 -p ${pgPort}`,'-t','30','-w','start'],{windowsHide:true,stdio:'ignore',timeout:40000});pgStarted=true;
    manifest.runtimeDeclaration.owningProcessTree.postgres=processIdentity(Number(fs.readFileSync(path.join(cluster,'postmaster.pid'),'utf8').split('\n')[0]));save();
    manifest.runtimeDeclaration.owningProcessTree.postgres.governor=governorRuntime('register',manifest.runtimeDeclaration.owningProcessTree.postgres,pgPort);save();
    bootstrap=new pg.Client({host:'127.0.0.1',port:pgPort,user:'dev122_bootstrap',database:'postgres'});await bootstrap.connect();
    await bootstrapOwnSchemas(bootstrap,database);await bootstrap.end();bootstrap=null;
    admin=new pg.Client({host:'127.0.0.1',port:pgPort,user:'dev122_bootstrap',database});await admin.connect();
    process.env.DEV122_SOURCE_ROOT=root;
    await installOwnFixture(admin,entries,sourceHead,evidenceRoot);
    manifest.clusterBytes=directoryBytes(cluster);
    if(manifest.clusterBytes>=200*1024*1024||fs.statSync(path.join(evidenceRoot,'postgres.log')).size>=16*1024*1024)throw new Error('DEV122_DIAGNOSTIC_CAPACITY_LIMIT');
    if(!diagnosticOnly){manifest.effectiveFixtureReadback=await installContractFixture(admin);save();await seedPrincipals(admin,evidenceRoot);}
    // Negative mapping checks must fail closed without executing provider SQL.
    for(const sql of ['SELECT * FROM orgmaster_contract.unknown_v1','SELECT * FROM ORGMASTER_CONTRACT.v_active_principal_accounts_v1','SELECT * FROM "orgmaster_contract".v_active_principal_accounts_v1','DELETE FROM orgmaster_contract.v_active_principal_accounts_v1','SELECT * FROM other_core.secrets','SELECT * FROM OTHER_CORE.secrets']) {
      let rejected=false;try{mapContractQuery(sql,config);}catch{rejected=true;}if(!rejected)throw new Error('DEV122_SEAM_NEGATIVE_FAILED');
    }
    if(['procurement','all'].includes(suite))await captureProcurementQueryProbe(admin,evidenceRoot);
    if(diagnosticOnly&&suite==='files') {
      await seedPreviewDiagnosticInputs(admin,evidenceRoot);
      await child('preview-helper-probe',['--experimental-transform-types','--loader','./scripts/qc-ts-path-loader.mjs',
        'scripts/qc-dev-122-native-postgres.mjs','--suite=files','--diagnostic-only','--preview-diagnostic-child'],{childEnv:{...env,NODE_OPTIONS:''}});
    }
    if(!diagnosticOnly)grantFixtureChannel=await serveGrantFixtureChannel(admin,runtimeRoot,evidenceRoot);
    else {await admin.end();admin=null;}
    if(diagnosticOnly){manifest.status='DIAGNOSTIC_ONLY';}
    else {
    manifest.executedCases=null;save(); // Unknown until the actual Vitest report is read.
    manifest.nativeSelection={suite,source:'src/lib/dev122-native-business.postgres-contract.test.ts',
      testNamePattern:nativeTestPattern,
      sourceApplicability:['ui','settings'].includes(suite)?'Only actual Next prerequisites selected; P/G receipts require separate source applicability review':'Selected native suite'};save();
    const nativeExitCode=await child('native-business',['node_modules/vitest/vitest.mjs','run','src/lib/dev122-native-business.postgres-contract.test.ts',
      ...(nativeTestPattern?['--testNamePattern',nativeTestPattern]:[]),
      '--exclude','**/.tmp/**','--exclude','**/output/**','--reporter=json','--outputFile='+path.join(evidenceRoot,'vitest.json')],{allowNonzero:true});
    manifest.nativeBusiness={exitCode:nativeExitCode,report:path.join(evidenceRoot,'vitest.json'),log:path.join(evidenceRoot,'native-business.log')};save();
    let tests;
    try{tests=JSON.parse(fs.readFileSync(manifest.nativeBusiness.report,'utf8'));}
    catch(error){throw Object.assign(new Error('DEV122_NATIVE_REPORT_UNREADABLE'),{cause:error,exitCode:nativeExitCode});}
    const assertions=tests.testResults?.flatMap(result=>result.assertionResults)??[];
    const completed=assertions.filter(test=>['passed','failed'].includes(test.status));
    const expectedDescribe=suite==='files'?'DEV122 F01 actual signed':suite==='procurement'?'DEV122 I01 actual signed':suite==='settings'?'DEV122 actual Next settings prerequisites':suite==='ui'?'DEV122 actual Next UI prerequisites':null;
    manifest.executedCases=completed.length;
    manifest.cases=completed;manifest.skippedCases=assertions.filter(test=>!['passed','failed'].includes(test.status)).length;
    Object.assign(manifest.nativeSelection,{selected:assertions.filter(test=>test.status!=='pending'&&test.status!=='skipped').length,
      executed:completed.length,skipped:manifest.skippedCases});
    manifest.nativeBusiness.passed=completed.filter(test=>test.status==='passed').length;
    manifest.nativeBusiness.failed=completed.filter(test=>test.status==='failed').length;
    const firstFailed=completed.find(test=>test.status==='failed');
    if(firstFailed)manifest.firstFailure={message:firstFailed.failureMessages?.[0]||firstFailed.fullName||firstFailed.title,
      stack:firstFailed.failureMessages?.join('\n')??null,code:null,test:firstFailed.fullName||firstFailed.title};
    save();
    const exactNativeFile=path.join(root,'src/lib/dev122-native-business.postgres-contract.test.ts');
    if(tests.testResults.some(result=>path.resolve(result.name)!==exactNativeFile&&result.assertionResults.some(test=>['passed','failed'].includes(test.status))))throw new Error('DEV122_NATIVE_EXECUTED_SOURCE_PATH_MISMATCH');
    if(expectedDescribe&&completed.some(test=>!(test.fullName||[...(test.ancestorTitles||[]),test.title].join(' ')).includes(expectedDescribe)))throw new Error('DEV122_SUITE_CASE_SCOPE_MISMATCH');
    if(!manifest.executedCases)throw new Error('DEV122_ZERO_NATIVE_CASES');
    if(manifest.executedCases!==tests.numPassedTests+tests.numFailedTests)throw new Error('DEV122_NATIVE_CASE_COUNT_MISMATCH');
    if(nativeExitCode!==0||manifest.nativeBusiness.failed)throw Object.assign(new Error('DEV122_CHILD_FAILED:native-business'),{exitCode:nativeExitCode});
    if(['ui','settings','all'].includes(suite)) {
      manifest.nextCapacityAdmission=nextCapacityAdmission(evidenceRoot);save();
      nextCopy=prepareNextCopy(runtimeRoot,evidenceRoot);manifest.nextSourceCopy=nextCopy;save();
      const nextEnv={...env,DEV122_NEXT_PROJECT_ROOT:nextCopy.copyRoot,PDM_NEXT_DIST_DIR:'.tmp/next-dist',PDM_NEXT_TSCONFIG_PATH:'tsconfig.next.json'};
      const uiGalleryFlags={PDM_WORKBENCH_PREVIEW_GALLERY_V1:'true',PDM_UNIFIED_DRAWING_WORKBENCH_V1:'true',
        PDM_NUMBER_LIFECYCLE_V2:'true',PDM_NUMBER_STATE_FLOW_V1:'true'};
      if(suite!=='settings')Object.assign(nextEnv,uiGalleryFlags);manifest.nextGalleryFlags={scope:'own Next child only',values:uiGalleryFlags,
        applicable:suite!=='settings',preflight:suite==='settings'?null:Object.keys(uiGalleryFlags).every(name=>nextEnv[name]==='true')};save();
      const recognitionWorkerId='dev122-original-recognition-cli',recognitionToken=crypto.randomBytes(32).toString('base64url');
      const licenseNames=['PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY','PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY','SOLIDWORKS_DOCUMENT_MANAGER_KEY'];
      const recognitionPurposes=['recognition_jobs','recognition_heartbeat','settings_secret_probe','solidworks_credential'];
      if(runRecognition) {
        const references=await admin.query("SELECT COUNT(*) AS count FROM ai_pdm_core.secret_references WHERE kind='solidworks_document_manager' AND lifecycle_status='active'");
        if(Number(references.rows[0].count)!==0)throw new Error('DEV122_RECOGNITION_ACTIVE_SECRET_REF_NOT_ZERO');
        Object.assign(nextEnv,{PDM_DRAWING_RECOGNITION_V1:'true',PDM_ALLOW_WORKER_ENV_SECRET_FALLBACK:'false',PDM_DRAWING_RECOGNITION_FIXTURE_MODE:'false',
          PDM_WORKLOAD_AUTH_CREDENTIALS:JSON.stringify({schemaVersion:'ai-pdm.workload-credentials.v1',workloads:[{id:recognitionWorkerId,token:recognitionToken,
            purposes:recognitionPurposes,capabilities:['solidworks_document_manager']}]})});
        for(const name of licenseNames)delete nextEnv[name];
        manifest.recognition={layer:'ORIGINAL_UNMODIFIED_WORKER_CLI_AND_ACTUAL_NEXT_WORKLOAD_ROUTES',producerBoundary:'FIXTURE',production:'NOT_RUN',
          workerId:recognitionWorkerId,purposes:recognitionPurposes,capabilities:['solidworks_document_manager'],
          activeOwnSecretReferences:0,fallback:false,fixtureMode:false,licenseEnvironmentPresent:licenseNames.map(name=>({name,present:Boolean(nextEnv[name])})),
          workerSource:{path:'scripts/run-drawing-recognition-worker.mjs',hash:sha256(fs.readFileSync(path.join(root,'scripts/run-drawing-recognition-worker.mjs')))},cases:[]};save();
      }
      const nextChild=await child('next',[path.join(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(nextPort)],
        {wait:false,childCwd:nextCopy.copyRoot,childEnv:nextEnv});
      nextCapTimer=setInterval(()=>{
        try{const bytes=nextCopyBytes(nextCopy);manifest.nextSourceCopy.observedBytes=bytes;
          if(bytes>=nextCopy.hardCapBytes)throw new Error('DEV122_NEXT_COPY_CAP_EXCEEDED');
        }catch(error){nextCapFailure??=error;
          if(sameProcess(nextChild.dev122Identity)) {
            try{if(process.platform==='win32')execFileSync('taskkill',['/PID',String(nextChild.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else nextChild.kill('SIGTERM');}
            catch(cleanupError){manifest.nextSourceCopy.capStopError=cleanupError.message;}
          }
        }
      },1000);
      const deadline=Date.now()+120_000;let ready=false;
      while(Date.now()<deadline){if(nextCapFailure)throw nextCapFailure;try{const response=await fetch(env.DEV122_APP_ORIGIN+'/api/health/ready',{signal:AbortSignal.timeout(5000)});if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
      if(!ready)throw new Error('DEV122_NEXT_STARTUP_FAILED');
      manifest.beforeUiOwnedReadback=await grantFixtureChannel.readOwnedSnapshot();save();
      const browserExitCode=await child('normal-browser',['scripts/qc-dev-122-native-browser.mjs'],{childEnv:{...env,NODE_OPTIONS:''},allowNonzero:true});
      manifest.afterUiOwnedReadback=await grantFixtureChannel.readOwnedSnapshot();
      if(suite==='settings')manifest.settingsOwnedRowsUnchanged=
        JSON.stringify(manifest.beforeUiOwnedReadback.rows)===JSON.stringify(manifest.afterUiOwnedReadback.rows);
      const browserReceiptPath=path.join(root,'output','playwright','dev122',runId,'receipt.json');
      const browserReceipt=JSON.parse(fs.readFileSync(browserReceiptPath,'utf8'));
      manifest.browser={receipt:browserReceiptPath,exitCode:browserExitCode,status:browserReceipt.status,executedCases:browserReceipt.cases.length,
        progress:browserReceipt.progress,cleanup:browserReceipt.cleanup};
      manifest.firstFailure??=browserReceipt.firstFailure??null;save();
      if(browserExitCode!==0)throw Object.assign(new Error('DEV122_CHILD_FAILED:normal-browser'),{exitCode:browserExitCode});
      if(suite==='settings'&&!manifest.settingsOwnedRowsUnchanged)throw new Error('DEV122_SETTINGS_OWNED_ROWS_CHANGED');
      if(runRecognition) {
        const workerEnv={...env,NODE_OPTIONS:'',PDM_WORKLOAD_ID:recognitionWorkerId,PDM_WORKLOAD_CREDENTIAL:recognitionToken,
          PDM_DRAWING_RECOGNITION_WORKER_BASE_URL:env.DEV122_APP_ORIGIN,PDM_DRAWING_RECOGNITION_FIXTURE_MODE:'false',PDM_ALLOW_WORKER_ENV_SECRET_FALLBACK:'false',
          TEMP:path.join(runtimeRoot,'worker-temp'),TMP:path.join(runtimeRoot,'worker-temp')};
        for(const name of [...licenseNames,'PDM_DRAWING_RECOGNITION_METADATA_CMD','PDM_DRAWING_RECOGNITION_METADATA_ARGS',
          'PDM_SOLIDWORKS_DOCUMENT_MANAGER_PROBE_CMD','PDM_SOLIDWORKS_DOCUMENT_MANAGER_PROBE_ARGS'])delete workerEnv[name];
        fs.mkdirSync(workerEnv.TEMP,{recursive:true});
        async function originalWorker(label){
          const wrapper=path.join(runtimeRoot,label+'.mjs'),workerRoot=root;
          fs.writeFileSync(wrapper,`import fs from 'node:fs';import path from 'node:path';const ready=path.join(process.env.DEV122_RUNTIME_ROOT,'governor-child-'+process.pid+'.ready');const deadline=Date.now()+15000;while(!fs.existsSync(ready)){if(Date.now()>deadline)throw new Error('DEV122_RECOGNITION_GOVERNOR_HANDSHAKE_TIMEOUT');await new Promise(r=>setTimeout(r,50));}if(fs.readFileSync(ready,'utf8')!=='${marker}')throw new Error('DEV122_RECOGNITION_OWNER_MARKER_MISMATCH');await import(${JSON.stringify(pathToFileURL(path.join(workerRoot,'scripts/run-drawing-recognition-worker.mjs')).href)});`);
          const worker=await child(label,[wrapper,'--once'],{wait:false,childEnv:workerEnv,childCwd:workerRoot});
          let timer;const exitCode=await Promise.race([worker.dev122Done,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('DEV122_RECOGNITION_WORKER_45S_TIMEOUT')),45000);})]).finally(()=>clearTimeout(timer));
          if(exitCode!==0)throw new Error('DEV122_RECOGNITION_ORIGINAL_WORKER_FAILED:'+label);return exitCode;
        }
        const broker=await fetch(env.DEV122_APP_ORIGIN+'/api/preview-workers/solidworks-document-manager-key',{
          headers:{authorization:'Bearer '+recognitionToken,'x-pdm-worker-id':recognitionWorkerId},signal:AbortSignal.timeout(30000)});
        manifest.recognition.broker={status:broker.status,cacheControl:broker.headers.get('cache-control'),contentType:broker.headers.get('content-type')};save();
        if(broker.status!==404)throw new Error('DEV122_RECOGNITION_ISOLATED_BROKER_BOUNDARY_MISMATCH');
        const brokerBody=await broker.json();manifest.recognition.broker.body=brokerBody;save();
        if(brokerBody.error!=='DOCUMENT_MANAGER_LICENSE_KEY_NOT_AVAILABLE')throw new Error('DEV122_RECOGNITION_BROKER_SAFE_CODE_MISMATCH');
        const inputs=JSON.parse(fs.readFileSync(path.join(runtimeRoot,'recognition-cli-inputs.json'),'utf8'));
        if(inputs.length!==3)throw new Error('DEV122_RECOGNITION_INPUT_COUNT_MISMATCH');
        for(const input of inputs) {
          if(sha256(fs.readFileSync(input.originalPath))!==input.sourceHash||sha256(fs.readFileSync(input.uploadedPath))!==input.sourceHash)throw new Error('DEV122_RECOGNITION_SOURCE_BEFORE_MISMATCH');
          const before=(await admin.query('SELECT id,status,attempt_count,not_before,source_set_fingerprint FROM ai_pdm_core.drawing_recognition_sessions WHERE id=$1',[input.session.id])).rows[0];
          if(before.status!=='queued'||Date.parse(before.not_before)>Date.now())throw new Error('DEV122_RECOGNITION_SESSION_NOT_ELIGIBLE');
          const exitCode=await originalWorker('recognition-worker-'+input.extension.toLowerCase());
          const after=(await admin.query('SELECT id,status,attempt_count,locked_by,initiator_principal_id,source_set_fingerprint FROM ai_pdm_core.drawing_recognition_sessions WHERE id=$1',[input.session.id])).rows[0];
          const adapters=(await admin.query('SELECT adapter_code,adapter_version,status,observation_count,diagnostics_json FROM ai_pdm_core.drawing_recognition_adapter_results WHERE session_id=$1 ORDER BY adapter_code',[input.session.id])).rows;
          const observations=(await admin.query('SELECT location_kind,raw_text FROM ai_pdm_core.drawing_recognition_observations WHERE session_id=$1 ORDER BY location_kind',[input.session.id])).rows;
          const capability=(await admin.query('SELECT worker_id,capability_code,status,issue_code FROM ai_pdm_core.worker_capability_heartbeats WHERE worker_id=$1',[recognitionWorkerId])).rows;
          const output={input,before,after,exitCode,adapters,observations,capability,
            sourceAfterHash:sha256(fs.readFileSync(input.originalPath)),uploadedAfterHash:sha256(fs.readFileSync(input.uploadedPath)),
            filenameLayer:'FILENAME_AND_ROLE_OBSERVATIONS_ONLY_NO_BINARY_EXTRACTION',sourceContentLayer:'SEPARATE_ACTUAL_NATIVE_PROTOCOL_READBACK_1d87cfc9c86c8e92',
            nativeMetadataLayer:'ISOLATED_NO_ACTIVE_BROKER_KEY_SUCCESSFUL_EXTRACTION_BLOCKED',assertionsPassed:false};
          manifest.recognition.cases.push(output);save();
          if(after.status!=='extraction_partial'||after.attempt_count!==1||after.locked_by!==null||after.initiator_principal_id!=='dev122-principal-owner'||after.source_set_fingerprint!==input.session.sourceSetFingerprint||
            adapters.length!==2||!adapters.some(row=>row.adapter_code==='filename.v1'&&row.status==='succeeded'&&row.observation_count===2)||
            !adapters.some(row=>row.adapter_code==='native-metadata-bridge.v1'&&row.status==='unsupported'&&
              (typeof row.diagnostics_json==='string'?JSON.parse(row.diagnostics_json):row.diagnostics_json)?.includes('native_metadata_license_missing'))||
            observations.length!==2||output.sourceAfterHash!==input.sourceHash||output.uploadedAfterHash!==input.sourceHash||
            !capability.some(row=>row.status==='blocked'&&row.issue_code==='native_metadata_license_missing'))throw new Error('DEV122_RECOGNITION_ORIGINAL_OUTPUT_READBACK_MISMATCH');
          output.assertionsPassed=true;save();
        }
        if(sha256(fs.readFileSync(path.join(root,manifest.recognition.workerSource.path)))!==manifest.recognition.workerSource.hash)throw new Error('DEV122_RECOGNITION_WORKER_SOURCE_CHANGED');
        manifest.recognition.executedCases=manifest.recognition.cases.length;
        manifest.recognition.assertionsPassed=manifest.recognition.cases.every(item=>item.assertionsPassed);
        manifest.afterRecognitionOwnedReadback=await grantFixtureChannel.readOwnedSnapshot();save();
      }
      if(nextCapFailure)throw nextCapFailure;
    }
    manifest.status='PARTIAL_NOT_ACCEPTED';
    const implementedCoverage={lifecycle:['P-01','P-02A','P-02B','P-02C','P-03A','P-03B','P-04A','P-04B','G-01','G-02','TX-01A','TX-01B','TX-01C'],
      files:['F-01A','F-01B','F-01C','F-01D','F-01E','F-01F'],procurement:['I-01A','I-01B','I-01C','I-01D']};
    manifest.coverage={partial:suite==='settings'?['UI-01','F-01F']:suite==='all'?[...Object.values(implementedCoverage).flat(),'UI-01']:suite==='ui'?['UI-01','F-01C']:implementedCoverage[suite],
      notRun:['remaining exact variants in all 29 QA groups','automatic integrated CAD worker daemon','recognition source/output boundary'],
      acceptanceComplete:false,workerOutputBoundary:'PROTOCOL_FIXTURE unless exact actual extractor evidence is attached'};
    }
  } catch(error) {
    manifest.status='FAIL';manifest.runnerFailure={message:error.message,exitCode:error.exitCode??null};
    manifest.firstFailure??={message:error.message,code:error.code??null,stack:error.stack,mismatches:error.mismatches??null,
      fixtureMigration:error.fixtureMigration??null,fixtureSourceHash:error.fixtureSourceHash??null,fixtureCompiledHash:error.fixtureCompiledHash??null};
  } finally {
    clearInterval(nextCapTimer);
    try{await grantFixtureChannel?.close();}catch(error){manifest.status='FAIL';manifest.fixtureRecoveryFailure={message:error.message};}
    await admin?.end().catch(()=>{});await bootstrap?.end().catch(()=>{});
    for(const processChild of children.reverse()) {
      if(processChild.exitCode!==null)continue;
      if(process.platform==='win32'){
        if(!sameProcess(processChild.dev122Identity)){manifest.cleanup.identityMismatch=true;continue;}
        execFileSync('taskkill',['/PID',String(processChild.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
      }
      else processChild.kill('SIGTERM');
      await processChild.dev122Done.catch(()=>{});
    }
    manifest.cleanup.childrenStopped=children.every(child=>child.exitCode!==null||child.signalCode!==null);
    for(const processChild of children)if(processChild.dev122Identity?.governor&&!sameProcess(processChild.dev122Identity)) {
      try{processChild.dev122Identity.governorRelease=governorRuntime('release',processChild.dev122Identity);}catch(error){manifest.cleanup.governorReleaseError=error.message;}
    }
    if(pgStarted){try{
      const identity=manifest.runtimeDeclaration.owningProcessTree.postgres;
      if(process.platform==='win32'&&!sameProcess(identity))throw new Error('DEV122_PG_IDENTITY_MISMATCH');
      execFileSync(bin('pg_ctl'),['-D',path.join(runtimeRoot,'cluster'),'-m','fast','-t','30','-w','stop'],{windowsHide:true,stdio:'ignore',timeout:40000});manifest.cleanup.pgStopped=true;
    }catch(error){manifest.cleanup.pgError=error.message;}}
    else manifest.cleanup.pgStopped=true;
    manifest.cleanup.portsReleased=await portReleased(pgPort)&&await portReleased(nextPort);
    if(nextCopy) {
      try {
        manifest.nextSourceCopy.sourceConfigAfter=nextCopyFiles.map(relative=>({path:relative,hash:sha256(fs.readFileSync(path.join(root,relative)))}));
        if(JSON.stringify(manifest.nextSourceCopy.sourceConfigBefore)!==JSON.stringify(manifest.nextSourceCopy.sourceConfigAfter))throw new Error('DEV122_SOURCE_CONFIG_MUTATED');
        if(!manifest.cleanup.childrenStopped||!manifest.cleanup.portsReleased||fs.readFileSync(path.join(nextCopy.copyRoot,'owner-marker'),'utf8')!==marker||
          fs.realpathSync(nextCopy.dependencyJunction.path)!==nextCopy.dependencyJunction.target)throw new Error('DEV122_NEXT_COPY_CLEANUP_SCOPE_INVALID');
        fs.unlinkSync(nextCopy.dependencyJunction.path);manifest.nextSourceCopy.junctionRemoved=true;
      }catch(error){manifest.status='FAIL';manifest.cleanup.nextCopyError=error.message;}
    }
    const pgIdentity=manifest.runtimeDeclaration.owningProcessTree.postgres;
    if(pgIdentity?.governor&&manifest.cleanup.pgStopped&&manifest.cleanup.portsReleased&&!sameProcess(pgIdentity)) {
      try{pgIdentity.governorRelease=governorRuntime('release',pgIdentity);}catch(error){manifest.cleanup.governorReleaseError=error.message;}
    }
    if(manifest.cleanup.childrenStopped&&manifest.cleanup.pgStopped&&manifest.cleanup.portsReleased&&!manifest.cleanup.nextCopyError&&
      path.dirname(runtimeRoot)===path.join(root,'.tmp','dev122')&&fs.readFileSync(path.join(runtimeRoot,'owner-marker'),'utf8')===marker) {
      fs.rmSync(runtimeRoot,{recursive:true});manifest.cleanup.tempRemoved=!fs.existsSync(runtimeRoot);
    }
    manifest.controlledSourceAfter=captureControlledSource();
    manifest.sourceUnchanged=manifest.controlledSourceBefore.hash===manifest.controlledSourceAfter.hash;
    fs.writeFileSync(path.join(evidenceRoot,'source-binding-after.json'),JSON.stringify(manifest.controlledSourceAfter,null,2));
    if(!manifest.sourceUnchanged){manifest.status='FAIL';manifest.firstFailure??={message:'DEV122_CONTROLLED_SOURCE_CHANGED'};}
    if(!Object.values(manifest.cleanup).every(value=>value===true))manifest.status='FAIL';save();
    if(manifest.nextCapacityAdmission&&manifest.cleanup.childrenStopped&&manifest.cleanup.portsReleased&&manifest.cleanup.tempRemoved) {
      try {
        const receipt=JSON.parse(execFileSync(process.env.DEV122_GOVERNOR_PYTHON,[process.env.DEV122_GOVERNOR_SCRIPT,'--agent-host','codex','--format','json',
          'lease','release',manifest.nextCapacityAdmission.lease.lease_id,'--reason',manifest.status==='FAIL'?'failed':'completed'],{encoding:'utf8',windowsHide:true}));
        manifest.nextCapacityRelease=receipt;
        if(receipt.exit_code!==0)throw new Error('DEV122_NEXT_CAPACITY_RELEASE_FAILED');
      }catch(error){manifest.status='FAIL';manifest.cleanup.capacityReleaseError=error.message;}
      save();
    }
  }
  process.stdout.write(JSON.stringify({status:manifest.status,evidence:path.join(evidenceRoot,'manifest.json'),executedCases:manifest.executedCases,firstFailure:manifest.firstFailure,cleanup:manifest.cleanup})+'\n');
  process.exitCode=['PASS','DIAGNOSTIC_ONLY'].includes(manifest.status)?0:1;
}

async function serveGrantFixtureChannel(admin,runtimeRoot,evidenceRoot) {
  if(path.dirname(runtimeRoot)!==path.join(root,'.tmp','dev122')||fs.readFileSync(path.join(runtimeRoot,'owner-marker'),'utf8')!==marker)throw new Error('DEV122_FIXTURE_CHANNEL_SCOPE_INVALID');
  const identity=(await admin.query('SELECT current_database() AS database,current_user AS identity')).rows[0];
  if(identity.identity!=='dev122_bootstrap'||identity.database!=='dev122_'+path.basename(runtimeRoot))throw new Error('DEV122_FIXTURE_CHANNEL_IDENTITY_INVALID');
  const select=`SELECT assignment_id,principal_id,application_id,scope_kind,scope_key,CAST(valid_until AS TEXT) AS valid_until
    FROM ai_pdm_contract.dev122_fixture_principal_effective_grants_rows_v4
    WHERE assignment_id=$1 AND principal_id=$2 AND application_id=$3 AND scope_kind=$4 AND scope_key=$5`;
  const keys=['dev122-assignment-reviewer','dev122-principal-reviewer','ai-pdm','workspace','company-jenfu'];
  const original=(await admin.query(select,keys)).rows;
  if(original.length!==1)throw new Error('DEV122_FIXTURE_CHANNEL_ASSIGNMENT_INVALID');
  const originalUntil=original[0].valid_until;
  const update=`UPDATE ai_pdm_contract.dev122_fixture_principal_effective_grants_rows_v4 SET valid_until=$1::timestamptz
    WHERE assignment_id=$3 AND principal_id=$4 AND application_id=$5 AND scope_kind=$6 AND scope_key=$7
      AND valid_until IS NOT DISTINCT FROM $2::timestamptz RETURNING CAST(valid_until AS TEXT) AS valid_until`;
  const requestPath=path.join(runtimeRoot,'grant-fixture-request.json'),resultPath=path.join(runtimeRoot,'grant-fixture-result.json');
  let active=null,closed=false,busy=null,failure=null;
  async function mutate(action,nonce) {
    if(action==='expire'&&active!==null)throw new Error('DEV122_FIXTURE_CHANNEL_ALREADY_EXPIRED');
    if(action==='restore'&&active===null)throw new Error('DEV122_FIXTURE_CHANNEL_NOT_EXPIRED');
    const before=(await admin.query(select,keys)).rows;
    const expected=action==='expire'?originalUntil:active;
    const replacement=action==='expire'?new Date(Date.now()-1000).toISOString():originalUntil;
    // Set the recovery token before provider write; unknown outcomes get readback.
    if(action==='expire')active=replacement;
    let changed,error=null;
    try{changed=await admin.query(update,[replacement,expected,...keys]);}catch(caught){error=caught;}
    const after=(await admin.query(select,keys)).rows;
    fs.appendFileSync(path.join(evidenceRoot,'grant-fixture-mutations.jsonl'),JSON.stringify({project:'AIPDM',purpose:'exact reviewer role-assignment negative input; never business runtime authority',
      action,nonce,sql:update,binds:[replacement,expected,...keys],rowCount:changed?.rowCount??null,before,after,providerError:error?.code??null})+'\n');
    if(action==='expire'&&after.length===1){
      if(after[0].valid_until===originalUntil)active=null;
      else if(Date.parse(after[0].valid_until)===Date.parse(replacement))active=after[0].valid_until;
    }
    if(action==='restore'&&after.length===1&&after[0].valid_until===originalUntil)active=null;
    if(error)throw error;
    if(changed.rowCount!==1||after.length!==1)throw new Error('DEV122_FIXTURE_CHANNEL_CAS_FAILED');
    if(action==='restore'){if(after[0].valid_until!==originalUntil)throw new Error('DEV122_FIXTURE_CHANNEL_RESTORE_READBACK_FAILED');active=null;}
    return {before,after,rowCount:changed.rowCount};
  }
  function writeResult(value){fs.writeFileSync(resultPath+'.tmp',JSON.stringify(value));fs.renameSync(resultPath+'.tmp',resultPath);}
  async function snapshot(nonce) {
    const queries=[];let begun=false;
    try {
      await admin.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;
      const catalog='SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname=$1 ORDER BY tablename';
      const tables=(await admin.query(catalog,['ai_pdm_core'])).rows;
      queries.push({sql:catalog,binds:['ai_pdm_core'],rowCount:tables.length});
      const rows={};
      for(const {tablename} of tables) {
        const quoted='"'+tablename.replaceAll('"','""')+'"';
        const sql=`SELECT to_jsonb(row) AS row FROM ai_pdm_core.${quoted} row ORDER BY to_jsonb(row)::text`;
        const result=await admin.query(sql);rows[tablename]=result.rows;
        queries.push({sql,binds:[],rowCount:result.rowCount});
      }
      await admin.query('COMMIT');begun=false;
      const receipt={project:'AIPDM',action:'owned-lifecycle-snapshot',nonce,identity,readOnly:true,isolation:'repeatable read',schema:'ai_pdm_core',queries,rows};
      const bytes=JSON.stringify(receipt);
      fs.writeFileSync(path.join(evidenceRoot,'owned-lifecycle-snapshot-'+nonce+'.json'),bytes+'\n');
      return {rows,tableCount:tables.length,readOnly:true,isolation:'repeatable read',snapshotHash:sha256(Buffer.from(bytes))};
    } catch(error) {
      fs.writeFileSync(path.join(evidenceRoot,'owned-lifecycle-snapshot-'+nonce+'-failure.json'),JSON.stringify({nonce,identity,queries,
        error:{message:error.message,code:error.code??null,stack:error.stack}})+'\n');
      throw error;
    } finally {if(begun)await admin.query('ROLLBACK');}
  }
  const timer=setInterval(()=>{
    if(closed||busy||!fs.existsSync(requestPath))return;
    busy=(async()=>{
      let request;
      try{
        request=JSON.parse(fs.readFileSync(requestPath,'utf8'));
        if(Object.keys(request).sort().join(',')!=='action,nonce'||!['expire','restore','owned-lifecycle-snapshot'].includes(request.action)
          ||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(request.nonce))throw new Error('DEV122_FIXTURE_CHANNEL_REQUEST_INVALID');
        fs.unlinkSync(requestPath);
        const result=request.action==='owned-lifecycle-snapshot'?await snapshot(request.nonce):await mutate(request.action,request.nonce);
        writeResult({nonce:request.nonce,action:request.action,status:'APPLIED',...result});
      }catch(error){failure=error;writeResult({nonce:request?.nonce??null,action:request?.action??null,status:'FAIL',message:error.message});}
    })().finally(()=>{busy=null;});
  },50);
  return {async readOwnedSnapshot(){if(closed||busy)throw new Error('DEV122_FIXTURE_OBSERVER_BUSY');
    busy=snapshot(crypto.randomUUID());try{return await busy;}finally{busy=null;}},
    async close(){if(closed)return;closed=true;clearInterval(timer);await busy;
    if(active!==null)await mutate('restore','parent-finally-recovery');
    if(failure)throw failure;
    fs.writeFileSync(path.join(evidenceRoot,'grant-fixture-recovery.json'),JSON.stringify({restored:true,originalUntil,after:(await admin.query(select,keys)).rows}));
  }};
}

async function seedPrincipals(admin,evidenceRoot) {
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'config/access-control/jenfu-role-catalog.v5.json'),'utf8'));
  const now=new Date(Date.now()-60_000).toISOString();
  const ledger=[];
  await admin.query(`INSERT INTO ai_pdm_core.companies(id,company_code,display_name) VALUES
    ('company-jenfu','JENFU','DEV122 isolated Jenfu'),('company-dev122-other','DEV122OTHER','DEV122 isolated other') ON CONFLICT DO NOTHING;
    UPDATE ai_pdm_core.pdm_workbench_state_authority_control SET mode='canonical_only',schema_hash='dev090-v1',expected_commit='local-dev';`);
  for(const [index,identity] of ((suite==='settings'||['authority-gaps','other-company-scope'].includes(nativeSelection))?['owner','reviewer','denied','other']:['owner','reviewer','denied']).entries()) {
    const profile='dev122-profile-'+identity,principal='dev122-principal-'+identity,employee='dev122-employee-'+identity;
    const company=identity==='other'?'company-dev122-other':'company-jenfu';
    await admin.query(`INSERT INTO ai_pdm_core.users(id,display_name,email,role,company_id,account_status,system_role_enabled)
      VALUES ($1,$2,$3,'Engineer',$4,'suspended',0)`,[profile,'DEV122 '+identity,identity+'@dev122.invalid',company]);
    await admin.query(`INSERT INTO ai_pdm_core.principal_accounts(principal_id,pdm_user_id,company_id,employee_id,account_type,
      account_status,lifecycle_version,profile_version,system_role_enabled,minimum_assurance)
      VALUES ($1,$2,$4,$3,'human_personal','active',1,1,true,'aal1')`,[principal,profile,employee,company]);
    await admin.query(`INSERT INTO ai_pdm_contract.dev122_fixture_active_principal_accounts_v1
      VALUES ('organization.active-principal.v1',$1,$2,$3,$4,'active',1,$5,'human_personal')`,
      ['https://securetoken.google.com/dev122-local-fixture','dev122-subject-'+identity,principal,employee,now]);
    await admin.query(`INSERT INTO ai_pdm_contract.dev122_fixture_principal_auth_state_v3 VALUES ($1,1,NULL)`,[principal]);
    const role=catalog.roles.find(role=>role.roleCode===(identity==='denied'?'qa':suite==='settings'&&['owner','other'].includes(identity)?'pdm_admin':'rd_manager'));
    if(suite==='settings'&&['owner','other'].includes(identity)&&(!role?.assignable||role.subjectKind!=='employee'||
      !role.allowedScopeKinds.includes('workspace')||!['settings.manage','settings.secret.manage'].every(code=>
        role.permissions.some(permission=>permission.code===code&&permission.kind==='action'&&permission.allowed))))
      throw new Error('DEV122_SETTINGS_INITIAL_CATALOG_ROLE_INVALID');
    await admin.query(`INSERT INTO ai_pdm_contract.dev122_fixture_principal_effective_grants_rows_v4 VALUES
      ('jenfu.orgmaster.ai-pdm-principal-grants.v4',$1,1,$2,'direct',NULL,'ai-pdm',$3,$4,'employee',NULL,$5,$6,$7,'workspace',$9,$8,NULL,$8)`,
      ['dev122-grant-version-'+identity,'dev122-assignment-'+identity,principal,employee,role.stableRoleId,role.roleCode,catalog.catalogVersion,now,company]);
    const identityReadback=(await admin.query(`SELECT account.principal_id,account.company_id,account.employee_id,account.pdm_user_id,
      grants.assignment_id,grants.assignment_version_id,grants.assignment_version,grants.published_at,grants.role_code,grants.catalog_version,grants.scope_kind,grants.scope_key,
      typed.principal_issuer,typed.principal_subject,typed.account_type
      FROM ai_pdm_core.principal_accounts account JOIN ai_pdm_contract.dev122_fixture_principal_effective_grants_rows_v4 grants USING(principal_id,employee_id)
      JOIN ai_pdm_contract.dev122_fixture_active_principal_accounts_v1 typed USING(principal_id,employee_id) WHERE account.principal_id=$1`,[principal])).rows;
    if(identityReadback.length!==1||identityReadback[0].company_id!==company||identityReadback[0].scope_key!==company||identityReadback[0].role_code!==role.roleCode)
      throw new Error('DEV122_INITIAL_IDENTITY_SCOPE_READBACK_FAILED');
    ledger.push({profile,principal,employee,roleCode:role.roleCode,company,identityReadback,producerBoundary:'FIXTURE',
      reason:'legal initial Principal identity/grant fixture before sessions and commands',outcomeSeeded:false});
    if(suite==='ui'&&identity==='owner') {
      const manufacturing=catalog.roles.find(item=>item.roleCode==='manufacturing');
      if(!manufacturing?.assignable||manufacturing.subjectKind!=='employee'||!manufacturing.allowedScopeKinds.includes('workspace')||
        !manufacturing.permissions.some(item=>item.code==='numbering.drawings.view'&&item.kind==='page'&&item.allowed))
        throw new Error('DEV122_UI_MANUFACTURING_CATALOG_PRECONDITION_INVALID');
      const sql=`INSERT INTO ai_pdm_contract.dev122_fixture_principal_effective_grants_rows_v4 VALUES
        ('jenfu.orgmaster.ai-pdm-principal-grants.v4',$1,1,$2,'direct',NULL,'ai-pdm',$3,$4,'employee',NULL,$5,$6,$7,'workspace','company-jenfu',$8,NULL,$8) RETURNING *`;
      const values=['dev122-grant-version-owner','dev122-assignment-owner-manufacturing',principal,employee,
        manufacturing.stableRoleId,manufacturing.roleCode,catalog.catalogVersion,now];
      const inserted=(await admin.query(sql,values)).rows;
      const readback=(await admin.query(`SELECT * FROM ai_pdm_contract.dev122_fixture_principal_effective_grants_rows_v4
        WHERE principal_id=$1 ORDER BY assignment_id`,[principal])).rows;
      if(inserted.length!==1||readback.length!==2||new Set(readback.map(row=>row.assignment_id)).size!==2||
        readback.some(row=>row.assignment_version_id!=='dev122-grant-version-owner'||Number(row.assignment_version)!==1||
          row.principal_id!==principal||row.employee_id!==employee||row.subject_kind!=='employee'||row.target_principal_id!==null||
          row.scope_kind!=='workspace'||row.scope_key!=='company-jenfu'||row.catalog_version!==catalog.catalogVersion||
          new Date(row.published_at).toISOString()!==now))throw new Error('DEV122_UI_MULTI_ROLE_READBACK_INVALID');
      ledger.push({reason:'UI-only lawful committed role union before sessions or commands',producerBoundary:'FIXTURE',
        catalogHash:sha256(fs.readFileSync(path.join(root,'config/access-control/jenfu-role-catalog.v5.json'))),
        consumerCardinality:'listEffectiveAssignments loops rows; duplicate role/scope rejected; published snapshot requires same version/id/time',
        consumerSources:['src/lib/repositories/jenfu-entitlement-repository.ts','src/lib/jenfu-principal-published-grant-validation.ts',
          'src/lib/jenfu-entitlement-contract.ts'],sql,values,inserted,readback,outcomeSeeded:false});
    }
  }
  // Roles are enforced ranking data, not actor-role authorization fallback.
  for(const role of catalog.roles)await admin.query(`INSERT INTO ai_pdm_core.roles
    (id,role_code,title,system_defined,enabled) VALUES ($1,$2,$3,1,1) ON CONFLICT(role_code) DO NOTHING`,
    [role.stableRoleId,role.roleCode,role.displayName]);
  await admin.query(`INSERT INTO ai_pdm_core.role_priority_versions(id,version_code,priority_json,status)
    VALUES ('dev122-priority','dev122-priority-v1',$1,'active')`,
    [JSON.stringify(['system_admin','pdm_admin','rd_manager',...catalog.roles.map(role=>role.roleCode).filter(code=>!['system_admin','pdm_admin','rd_manager'].includes(code))])]);
  fs.writeFileSync(path.join(evidenceRoot,'fixture-mutation-ledger.json'),JSON.stringify(ledger,null,2));
}

async function captureProcurementQueryProbe(admin,evidenceRoot) {
  const file='src/lib/repositories/handoff-async-repository.ts';
  const bytes=fs.readFileSync(path.join(root,file)),source=bytes.toString('utf8');
  const match=source.match(/SELECT_ASYNC_MANUFACTURING_HANDOFF_SUBMISSION_IDS_SQL = `([\s\S]*?)`;/u);
  if(!match)throw new Error('DEV122_HANDOFF_QUERY_MISSING');
  const sourceHash=sha256(bytes),originalHash='18eea85c40968bd1d8b3e601ab877554b1758dd647f347c77af5282e8a21763d';
  const phase=sourceHash===originalHash?'ORIGINAL_BEFORE_FIX':'CURRENT_AFTER_FIX';
  const cases=[];
  for(const submittedBy of [null,'dev122-profile-owner']) {
    const params={companyId:'company-jenfu',submittedBy,limit:200},values=[],indexes=new Map();
    const query=match[1].replace(/(?<!:)([:@])([A-Za-z_][A-Za-z0-9_]*)/gu,(_whole,_prefix,name)=>{
      if(!indexes.has(name)){values.push(params[name]);indexes.set(name,values.length);}return '$'+indexes.get(name);
    });
    try{cases.push({submittedBy,query,values,sqlState:null,rows:(await admin.query(query,values)).rows});}
    catch(error){cases.push({submittedBy,query,values,sqlState:error.code,message:error.message});}
  }
  fs.writeFileSync(path.join(evidenceRoot,phase==='ORIGINAL_BEFORE_FIX'?'original-procurement-query.json':'procurement-query-probe.json'),
    JSON.stringify({phase,source:file,sourceHash,cases,
      originalFirstFailure:phase==='CURRENT_AFTER_FIX'?'output/qa/dev-122/22c3044c81ac3bc7/original-procurement-query.json':null,
      formalIncidentRootCause:'UNKNOWN'},null,2));
  if(phase==='CURRENT_AFTER_FIX'&&cases.some(test=>test.sqlState))throw new Error('DEV122_FIXED_HANDOFF_NATIVE_QUERY_FAILED');
}

async function seedPreviewDiagnosticInputs(admin,evidenceRoot) {
  const ledger=[];
  async function seed(sql,values=[]) {await admin.query(sql,values);ledger.push({purpose:'explicit legal preview input, no release outcome',sql,values});}
  await seed(`INSERT INTO ai_pdm_core.companies(id,company_code,display_name) VALUES
    ('company-jenfu','JENFU','DEV122 diagnostic Jenfu'),('company-dev122-other','DEV122OTHER','DEV122 diagnostic other') ON CONFLICT DO NOTHING`);
  await seed(`INSERT INTO ai_pdm_core.users(id,company_id,display_name,email,role) VALUES
    ('dev122-preview-profile','company-jenfu','DEV122 diagnostic','preview@dev122.invalid','Engineer')`);
  for(const other of [false,true]) {
    const company=other?'company-dev122-other':'company-jenfu',id=other?'dev122-preview-other':'dev122-preview-own';
    await seed(`INSERT INTO ai_pdm_core.part_roots(id,company_id,root_code,core_name,item_kind) VALUES($1,$2,$3,'DEV122 diagnostic','purchased')`,[id,company,other?'DEV122OTHER':'DEV122OWN']);
    await seed(`INSERT INTO ai_pdm_core.part_numbers(id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,item_kind)
      VALUES($1,$2,$1,$3,0,'00','DEV122 diagnostic','purchased')`,[id,company,other?'DEV122OTHER-P00':'DEV122OWN-P00']);
  }
  for(const input of previewDiagnosticInputs) {
    const asset='dev122-asset-'+input.id,job='dev122-job-'+input.id,extension=input.extension||'slddrw';
    await seed(`INSERT INTO ai_pdm_core.file_assets(id,file_name,file_ext,file_size,content_hash,linked_entity_type,linked_entity_id)
      VALUES($1,$2,$3,16,$4,'part_number',$5)`,[asset,input.id+'.'+extension,extension,input.replaced?'b'.repeat(64):'a'.repeat(64),input.other?'dev122-preview-other':'dev122-preview-own']);
    await seed(`INSERT INTO ai_pdm_core.preview_jobs(id,company_id,source_file_asset_id,source_content_hash,requested_kind,source_extension,
      status,attempt_count,idempotency_key,created_by,updated_at,locked_by,locked_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$1,'dev122-preview-profile',$9,'dev122-original-worker',$9)`,
      [job,input.other?'company-dev122-other':'company-jenfu',asset,'a'.repeat(64),input.requestedKind,extension,input.status,input.attempt,input.nativeTimestamp||new Date(previewDiagnosticClock-input.age).toISOString()]);
  }
  fs.writeFileSync(path.join(evidenceRoot,'preview-input-ledger.json'),JSON.stringify(ledger,null,2));
}

async function runPreviewDiagnosticChild() {
  if(!diagnosticOnly||suite!=='files')throw new Error('DEV122_PREVIEW_CHILD_SCOPE_INVALID');
  const evidence=process.env.DEV122_EVIDENCE_ROOT,runtime=process.env.DEV122_RUNTIME_ROOT;
  if(path.dirname(runtime)!==path.join(root,'.tmp','dev122')||fs.readFileSync(path.join(runtime,'owner-marker'),'utf8')!==marker)throw new Error('DEV122_PREVIEW_CHILD_MARKER_INVALID');
  const registrationMarker=path.join(runtime,`governor-child-${process.pid}.ready`),registrationDeadline=Date.now()+15000;
  while(!fs.existsSync(registrationMarker)&&Date.now()<registrationDeadline)await new Promise(resolve=>setTimeout(resolve,50));
  if(!fs.existsSync(registrationMarker)||fs.readFileSync(registrationMarker,'utf8')!==marker)throw new Error('DEV122_PREVIEW_CHILD_REGISTRATION_TIMEOUT');
  const metadata=exactImportClosure(['pg','google-auth-library']);
  const helper=await import(pathToFileURL(path.join(root,'src/lib/preview-derivatives.ts')).href);
  fs.writeFileSync(path.join(evidence,'preview-import-preflight.json'),JSON.stringify({project:'AIPDM',status:'IMPORT_ONLY',
    sourceHash:sha256(fs.readFileSync(path.join(root,'src/lib/preview-derivatives.ts'))),metadata,
    actualExports:['recoverStalePreviewJobsAsync','ensureAutomaticPreviewJobsForSourceAssetsAsync','claimPreviewJobAsync'].map(name=>({name,type:typeof helper[name]})),
    nextRuntime:'NOT_LOADED',executedAcceptanceCases:0},null,2));
  if(previewImportOnly)return;
  const {default:pg}=await import('pg'),dsn=new URL(process.env.PDM_POSTGRES_URL);
  if(dsn.username!=='dev122_runtime'||dsn.hostname!=='127.0.0.1'||!/^\/dev122_[a-f0-9]{16}$/u.test(dsn.pathname))throw new Error('DEV122_DIAGNOSTIC_RUNTIME_DSN_INVALID');
  const provider=new pg.Client({connectionString:dsn.href}),queries=[],cases=[];
  await provider.connect();
  const identity=(await provider.query(`SELECT current_user AS identity,rolsuper,rolcreatedb,
    pg_has_role(current_user,'jenfu_ai_pdm_migrator','member') AS migrator,
    has_database_privilege(current_user,current_database(),'CREATE') AS ddl
    FROM pg_roles WHERE rolname=current_user`)).rows[0];
  if(identity.identity!=='dev122_runtime'||identity.rolsuper||identity.rolcreatedb||identity.migrator||identity.ddl)throw new Error('DEV122_DIAGNOSTIC_RUNTIME_PRIVILEGE_INVALID');
  let race=false;
  async function query(sql,params={}) {
    const indexes=new Map(),values=[];
    const normalized=Array.isArray(params)?sql:sql.replace(/(?<!:)([:@])([A-Za-z_][A-Za-z0-9_]*)/gu,(_whole,_prefix,name)=>{
      if(!indexes.has(name)){values.push(params[name]);indexes.set(name,values.length);}return '$'+indexes.get(name);
    });
    const entry={sql,normalized,values:Array.isArray(params)?params:values,sqlState:null,rowCount:null};queries.push(entry);
    try {
      const result=await provider.query(normalized,entry.values);entry.rowCount=result.rowCount;
      if(race&&/SELECT job\.id,job\.status,job\.attempt_count,job\.updated_at,CAST\(job\.updated_at AS TEXT\) AS previous_updated_at FROM preview_jobs job/u.test(sql)) {
        race=false;
        await provider.query(`UPDATE ai_pdm_core.preview_jobs SET updated_at=$1 WHERE id='dev122-job-heartbeat-race'`,[new Date(previewDiagnosticClock).toISOString()]);
        const heartbeat=(await provider.query(`SELECT updated_at FROM ai_pdm_core.preview_jobs WHERE id='dev122-job-heartbeat-race'`)).rows[0];
        fs.appendFileSync(path.join(evidence,'preview-race-ledger.jsonl'),JSON.stringify({purpose:'fresh native heartbeat after scoped SELECT before CAS UPDATE',
          jobId:'dev122-job-heartbeat-race',requestedTimestamp:new Date(previewDiagnosticClock).toISOString(),actualNativeTimestamp:heartbeat.updated_at})+'\n');
      }
      return result.rows;
    } catch(error){entry.sqlState=error.code||'UNKNOWN';entry.message=error.message;throw error;}
  }
  const client={kind:'postgres',query,queryOne:async(...args)=>(await query(...args))[0]||null,execute:async(...args)=>{await query(...args);},
    transaction:async(fn)=>{await provider.query('BEGIN');try{const result=await fn(client);await provider.query('COMMIT');return result;}catch(error){await provider.query('ROLLBACK');throw error;}}};
  const OriginalDate=globalThis.Date;
  class DiagnosticDate extends OriginalDate {
    constructor(...args){if(args.length)super(...args);else super(previewDiagnosticClock);}
    static now(){return previewDiagnosticClock;}
    static [Symbol.hasInstance](value){return value instanceof OriginalDate;}
  }
  async function rows(){return query('SELECT id,company_id,status,attempt_count,updated_at,CAST(updated_at AS TEXT) AS previous_updated_at,completed_at,error_code,source_content_hash,requested_kind,source_extension FROM preview_jobs ORDER BY id');}
  async function reset(allRunning=false) {
    const ledger=[];
    for(const input of previewDiagnosticInputs) {
      const id='dev122-job-'+input.id;
      const removeSql='DELETE FROM preview_jobs WHERE id=:id';await query(removeSql,{id});ledger.push({sql:removeSql,params:{id}});
      const sql=`INSERT INTO preview_jobs(id,company_id,source_file_asset_id,source_content_hash,requested_kind,source_extension,status,attempt_count,
        idempotency_key,created_by,updated_at,locked_by,locked_at) VALUES(:id,:companyId,:assetId,:sourceHash,:kind,:extension,:status,:attempt,
        :id,'dev122-preview-profile',:updated,'dev122-original-worker',:updated)`;
      const params={id,companyId:input.other?'company-dev122-other':'company-jenfu',assetId:'dev122-asset-'+input.id,sourceHash:'a'.repeat(64),
        kind:input.requestedKind,extension:input.extension||'slddrw',status:allRunning?'running':input.status,attempt:input.attempt,
        updated:input.nativeTimestamp||new OriginalDate(previewDiagnosticClock-input.age).toISOString()};
      await query(sql,params);ledger.push({sql,params});
    }
    const readback=await rows();
    for(const input of previewDiagnosticInputs) {
      const row=readback.find(candidate=>candidate.id==='dev122-job-'+input.id);
      const actualAge=previewDiagnosticClock-new OriginalDate(row?.updated_at).getTime();
      if(!row||actualAge!==input.age||Number(row.attempt_count)!==input.attempt||row.status!==(allRunning?'running':input.status)
        ||row.source_content_hash!=='a'.repeat(64)||row.requested_kind!==input.requestedKind||row.source_extension!==(input.extension||'slddrw')
        ||row.company_id!==(input.other?'company-dev122-other':'company-jenfu'))throw new Error('DEV122_PREVIEW_INPUT_READBACK_INVALID:'+input.id);
      if(input.nativeTimestamp&&!/\.999123[+-]/u.test(row.previous_updated_at))throw new Error('DEV122_PREVIEW_MICROSECOND_TOKEN_INVALID:'+input.id);
    }
    fs.appendFileSync(path.join(evidence,'preview-reset-ledger.jsonl'),JSON.stringify({purpose:'isolated actual-helper input reset by exact owned IDs; native UPDATE trigger retained',
      allRunning,ledger,readback,exactAgeAttemptStatusHashKindScopeVerified:true})+'\n');
  }
  const dateProof=[];
  function assert(condition,label){if(!condition)throw new Error('DEV122_FIXED_PREVIEW_ASSERTION:'+label);}
  function rowById(rows,id){return rows.find(row=>row.id==='dev122-job-'+id);}
  function unchanged(before,after,ids){for(const id of ids)assert(JSON.stringify(rowById(before,id))===JSON.stringify(rowById(after,id)),'unchanged:'+id);}
  async function capture(name,fn,verify){const before=await rows(),firstQuery=queries.length;let result=null,error=null;
    try{result=await fn();}catch(caught){error={sqlState:caught.code||'UNKNOWN',message:caught.message};}
    const after=await rows();
    if(!error)try{verify?.(before,result,after);}catch(caught){error={sqlState:'ASSERTION',message:caught.message};}
    cases.push({name,before,result,error,after,queries:queries.slice(firstQuery),assertionsPassed:!error});}
  try {
    globalThis.Date=DiagnosticDate;
    await reset();
    for(const id of ['running-fresh','queued-fresh']) {
      const row=rowById(await rows(),id),value=row.updated_at;
      dateProof.push({id,typeof:typeof value,tag:Object.prototype.toString.call(value),constructor:value.constructor.name,
        diagnosticInstanceof:value instanceof DiagnosticDate,getTime:value.getTime(),dateParse:Date.parse(value),
        actualAge:previewDiagnosticClock-value.getTime(),lossyAge:previewDiagnosticClock-Date.parse(value)});
      assert(value instanceof DiagnosticDate,'transparent Date mock:'+id);
      assert(previewDiagnosticClock-value.getTime()===(id==='running-fresh'?29999:119999),'native millisecond age:'+id);
    }
    await capture('legacy noScope call performs zero queries and mutations',async()=>{
      const beforeCount=queries.length,result=await helper.recoverStalePreviewJobsAsync(client);
      assert(queries.length===beforeCount,'noScope zero queries');return result;},
      (before,result,after)=>{assert(result.recovered===0&&result.queuedUnclaimed===0,'noScope result');unchanged(before,after,previewDiagnosticInputs.map(input=>input.id));});
    await reset(true);
    await capture('canonical mutable preparation repairs only exact authorized source',()=>helper.ensureAutomaticPreviewJobsForSourceAssetsAsync(client,
      {companyId:'company-jenfu',sourceFileAssetIds:['dev122-asset-running-expired'],actorUserId:'dev122-preview-profile'}),
      (before,result,after)=>{assert(rowById(after,'running-expired').status==='queued','canonical source recovered');
        assert(rowById(after,'running-expired').attempt_count===2,'read preserves attempt');
        assert(result.length===1&&result[0].sourceFileAssetId==='dev122-asset-running-expired','canonical actual result');
        unchanged(before,after,previewDiagnosticInputs.filter(input=>input.id!=='running-expired').map(input=>input.id));});
    await reset(true);
    await capture('actual workload claim repairs supported sources and claims each job once',async()=>{
      const claims=[];for(let i=0;i<2;i++)claims.push(await helper.claimPreviewJobAsync(client,
        {workerId:'dev122-diagnostic-worker',supportedKinds:['native_thumbnail_png'],supportedExtensions:['slddrw']}));return claims;},
      (before,result,after)=>{assert(result.every(Boolean),'two actual claims');assert(new Set(result.map(claim=>claim.jobId)).size===2,'no duplicate claim');
        assert(result.every(claim=>!['unsupported','unsupported-kind','replacement-source','running-limit','running-fresh'].some(id=>claim.jobId==='dev122-job-'+id)),'claim source/kind/attempt bounds');
        for(const claim of result){const row=after.find(row=>row.id===claim.jobId);assert(row.status==='running'&&row.attempt_count===3,'claim exactly one attempt');}
        unchanged(before,after,['running-fresh','unsupported','unsupported-kind','replacement-source']);assert(rowById(after,'running-limit').status==='failed','exhausted terminal');});
    await reset();race=true;
    const authorizedAssets=previewDiagnosticInputs.filter(input=>!input.other).map(input=>'dev122-asset-'+input.id);
    await capture('scoped recovery respects millisecond boundaries and actual CAS returned rows',()=>helper.recoverStalePreviewJobsAsync(client,
      {companyId:'company-jenfu',sourceFileAssetIds:authorizedAssets}),
      (before,result,after)=>{assert(result.recovered===4&&result.queuedUnclaimed===1,'CAS actual count');
        unchanged(before,after,['running-fresh','queued-fresh','other-company','unsupported','unsupported-kind','replacement-source']);
        assert(rowById(after,'running-expired').status==='queued'&&rowById(after,'running-expired').attempt_count===2,'attempt2 requeue');
        assert(/\.999123[+-]/u.test(rowById(before,'running-microseconds').previous_updated_at),'six-digit native CAS token');
        assert(rowById(after,'running-microseconds').status==='queued'&&rowById(after,'running-microseconds').attempt_count===2,'six-digit timestamp CAS recovered');
        assert(rowById(after,'running-limit').status==='failed'&&rowById(after,'running-limit').attempt_count===3,'attempt3 terminal');
        assert(rowById(after,'queued-expired').status==='failed','unclaimed terminal');
        assert(rowById(after,'heartbeat-race').status==='running'&&rowById(after,'heartbeat-race').attempt_count===2,'fresh heartbeat CAS preserved');
        assert(new OriginalDate(rowById(after,'heartbeat-race').updated_at).getTime()>previewDiagnosticClock,'actual native heartbeat timestamp');});
    await capture('terminal jobs remain terminal on repeated scoped recovery',()=>helper.recoverStalePreviewJobsAsync(client,
      {companyId:'company-jenfu',sourceFileAssetIds:authorizedAssets}),
      (before,result,after)=>{assert(result.recovered===0&&result.queuedUnclaimed===0,'second recovery no effects');unchanged(before,after,previewDiagnosticInputs.map(input=>input.id));});
  } finally {
    globalThis.Date=OriginalDate;
    fs.writeFileSync(path.join(evidence,'preview-query-probe.json'),JSON.stringify({project:'AIPDM',phase:'CURRENT_AFTER_RECOVERY_FIX',
      originalFirstFailure:'output/qa/dev-122/1b21d829b000a62d/original-preview-diagnostic.json',
      evidenceScope:'DIAGNOSTIC_ONLY',producerBoundary:'FIXTURE',production:'NOT_RUN',runtimeIdentity:identity,fixedClock:new OriginalDate(previewDiagnosticClock).toISOString(),
      sourceHash:sha256(fs.readFileSync(path.join(root,'src/lib/preview-derivatives.ts'))),inputBindings:previewDiagnosticInputs,dateProof,cases,restoredOriginalDate:globalThis.Date===OriginalDate,acceptanceCases:0},null,2));
    await provider.end();
  }
  if(cases.some(test=>test.error))throw new Error('DEV122_FIXED_PREVIEW_NATIVE_PROBE_FAILED');
}
