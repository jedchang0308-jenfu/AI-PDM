import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from "vitest";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createAsyncDatabaseClient,type AsyncDatabaseClient} from "./db-async-provider";
import {assemblyCrc32} from "./assembly-archive";
import {DrawingAssemblyPackageService,readAssemblyPackage,bindAssemblyPackageMain,assemblyJson} from "./drawing-assembly-package";
import {projectAssemblyAnalysisResult,addAssemblyQuantities} from "./drawing-assembly-bom";
import {currentAssemblySubmission,freezeAssemblyReview,approveAssemblyReview,readAssemblyReviewSnapshot,readAssemblyEffectiveSnapshot,assemblyFrozenResponse} from "./drawing-assembly-review";
import type {DrawingWorkRow,DrawingRevisionWorkAsyncRepository as CanonicalWorkRepository} from "./repositories/drawing-revision-work-async-repository";
import type {VerifiedPrincipalRequest} from "./jenfu-principal-request-guard";
import {principalJobInitiatorFromVerifiedRequest} from "./principal-job-authority";
import type {AssemblyPackageRow} from "./drawing-assembly-package";
import {GET as collectionGET,POST as collectionPOST} from "../app/api/pdm/drawing-revision-works/[workId]/assembly-packages/route";
import {PUT as contentPUT} from "../app/api/pdm/drawing-revision-works/[workId]/assembly-packages/[id]/content/route";
import {POST as finalizePOST} from "../app/api/pdm/drawing-revision-works/[workId]/assembly-packages/[id]/finalize/route";
import {claimAssemblyAnalysis,assemblyJobContent,assemblyJobReceipt,finishAssembly,pulseAssembly,verifyAssemblyLease,readAssemblyLease} from "./assembly-analysis-jobs";

const state=vi.hoisted(()=>({client:null as unknown as AsyncDatabaseClient,allowed:true,bytes:true,revoked:false,updateAllowed:true,realWorkRepo:false,deviceToken:"",workerId:"test-device:instance"}));
const verified={session:{contractVersion:"jenfu.ai-pdm-session.v2",appId:"ai-pdm",principalId:"principal",employeeId:"employee",identityIssuer:"fixture-issuer",identitySubject:"fixture-subject",profileVersion:1,accountLifecycleVersion:1,authEpoch:0,authenticatedAt:"2026-11-19T00:00:00Z",issuedAt:"2026-11-19T00:00:00Z"},profile:{pdmUserId:"user",companyId:"company"}} as VerifiedPrincipalRequest;
vi.mock("@/lib/db-async-provider",async original=>({...await original<typeof import("./db-async-provider")>(),getAsyncDatabaseClient:()=>state.client}));
vi.mock("@/lib/jenfu-principal-http",async original=>({...await original<typeof import("./jenfu-principal-http")>(),principalRequestInput:async(token:string)=>({fixtureToken:token}),principalSessionTokenFromRequest:(request:Request)=>request.headers.get("x-fixture-principal")}));
vi.mock("@/lib/jenfu-principal-request-guard",async original=>({...await original<typeof import("./jenfu-principal-request-guard")>(),withVerifiedJenfuPrincipalRequest:async(input:{database?:AsyncDatabaseClient;fixtureToken?:string},execute:(tx:AsyncDatabaseClient,actor:VerifiedPrincipalRequest)=>unknown,options:unknown)=>{
  const actor=input.fixtureToken==='reviewer'?{...verified,session:{...verified.session,principalId:'reviewer-principal'},profile:{...verified.profile,pdmUserId:'reviewer'}}:verified;
  return (input.database??state.client).transaction(tx=>execute(tx,actor),options as never);
}}));
vi.mock("@/lib/jenfu-principal-permission-service",()=>({evaluatePrincipalWorkspacePermissionsInSnapshot:async(_tx:unknown,actor:VerifiedPrincipalRequest,permissions:{permissionCode:string}[])=>permissions.map(p=>{
  const allowed=state.allowed && (state.updateAllowed || !['numbering.workspace.update','numbering.candidate.review.submit'].includes(p.permissionCode));
  return {...p,allowed,roleCode:"Engineer",principalId:actor.session.principalId,decisionCode:allowed?'allowed':'permission_not_granted'};
}),evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot:async()=>[{allowed:!state.revoked,roleCode:"Engineer"}]}));
vi.mock("@/lib/principal-resource-capability",()=>({authorizeDynamicResourceCapabilityInSnapshot:async()=>state.bytes?null:new Response(null,{status:403}),isDynamicRolePolicyInSnapshot:async()=>false}));
vi.mock("@/lib/repositories/pdm-principal-reviewer-selector",()=>({selectPrincipalReviewerInSnapshot:async()=>"reviewer"}));
vi.mock("@/lib/principal-job-authority",async original=>({...await original<typeof import("./principal-job-authority")>(),requireCurrentPrincipalJobAuthority:async()=>{if(state.revoked)throw Object.assign(new Error("REVOKED"),{status:403});}}));
vi.mock("@/lib/pdm-workbench-authority-control",()=>({verifyCanonicalWorkbenchCommandContract:async()=>{},issueCanonicalWorkbenchContract:async()=>"fixture-contract"}));
vi.mock("@/lib/preview-derivatives",()=>({isNativeSolidWorksPreviewSource:(ext:string)=>ext==="sldasm",ensureAutomaticPreviewJobsForSourceAssetsAsync:async()=>{}}));
vi.mock("@/lib/sldasm-assembly-evidence",()=>({reconcileSldasmAssemblyEvidence:async()=>{}}));
vi.mock("@/lib/windows-service-device-auth",async original=>({...await original<typeof import("./windows-service-device-auth")>(),authenticateWindowsServiceDevice:async(request:Request)=>{
  if(state.revoked || !state.deviceToken || request.headers.get("authorization")!==`Bearer ${state.deviceToken}` || request.headers.get("x-pdm-worker-id")!==state.workerId)return {response:Response.json({error:"FIXTURE_DEVICE_UNAUTHORIZED"},{status:403})};
  return {actor:{kind:"windows_service_device",id:state.workerId,deviceId:"test-device",companyId:"company",ownerPrincipalId:"principal",instanceId:"instance"}};
}}));
vi.mock("@/lib/repositories/drawing-revision-work-async-repository",async original=>{
  const source=await original<typeof import("./repositories/drawing-revision-work-async-repository")>();
  return {...source,DrawingRevisionWorkAsyncRepository:class extends source.DrawingRevisionWorkAsyncRepository {
    async readWork(tx:AsyncDatabaseClient,companyId:string,id:string,lock=false){return state.realWorkRepo?super.readWork(tx,companyId,id,lock):tx.queryOne<import("./repositories/drawing-revision-work-async-repository").DrawingWorkRow>(`SELECT * FROM drawing_revision_works WHERE company_id=:companyId AND id=:id${lock?" FOR UPDATE":""}`,{companyId,id});}
    async assertWorkMutationBasis(...args:Parameters<CanonicalWorkRepository['assertWorkMutationBasis']>){if(state.realWorkRepo)return super.assertWorkMutationBasis(...args);if('handling' in args[1] && args[1].handling!=="owner")throw new Error("WORK_NOT_EDITABLE");return undefined as never;}
    async assertWorkFileSnapshot(...args:Parameters<CanonicalWorkRepository['assertWorkFileSnapshot']>){if(state.realWorkRepo)return super.assertWorkFileSnapshot(...args);}
  }};
});

function zip(main="first-main",size=0) {
  const files=[{name:"Assembly/Main.SLDASM",bytes:Buffer.from(main)},...(size?[{name:"Assets/padding.bin",bytes:Buffer.alloc(size,37)}]:[])];
  const locals:Buffer[]=[],centrals:Buffer[]=[];let offset=0;
  for(const file of files) {
    const name=Buffer.from(file.name),crc=assemblyCrc32(file.bytes),local=Buffer.alloc(30),central=Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(file.bytes.length,18);local.writeUInt32LE(file.bytes.length,22);local.writeUInt16LE(name.length,26);
    central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(file.bytes.length,20);central.writeUInt32LE(file.bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
    locals.push(local,name,file.bytes);centrals.push(central,name);offset+=local.length+name.length+file.bytes.length;
  }
  const cd=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,cd,end]);
}
const request=(method="GET",url="http://localhost/api/pdm/drawing-revision-works/work/assembly-packages",body?:BodyInit,headers:Record<string,string>={})=>new Request(url,{method,body,headers:{"x-fixture-principal":"fixture",...headers}});
function expectSameArchive(actual:Buffer,expected:Buffer){expect(actual.length).toBe(expected.length);expect(crypto.createHash("sha256").update(actual).digest("hex")).toBe(crypto.createHash("sha256").update(expected).digest("hex"));}
const service=()=>new DrawingAssemblyPackageService(state.client);
let firstId:string;let firstBytes:Buffer;let firstAccepted=false,mainBound=false;
describe.skipIf(!process.env.DEV129_TEST_PG)("DEV-129 native PostgreSQL package paths (fixture admission)",()=>{
  beforeAll(async()=>{
    if(!/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/postgres$/u.test(process.env.DEV129_TEST_PG??""))throw new Error("TASK_OWNED_PG_REQUIRED");
    state.client=createAsyncDatabaseClient({kind:"postgres",connectionString:process.env.DEV129_TEST_PG,searchPath:"ai_pdm_core,pg_catalog"});
    await state.client.execute(`CREATE ROLE jenfu_ai_pdm_migrator;CREATE ROLE jenfu_ai_pdm_runtime;CREATE SCHEMA ai_pdm_core AUTHORIZATION jenfu_ai_pdm_migrator;GRANT USAGE ON SCHEMA ai_pdm_core TO jenfu_ai_pdm_runtime;
      CREATE TABLE companies(id text PRIMARY KEY);CREATE TABLE users(id text PRIMARY KEY,company_id text);CREATE TABLE part_roots(id text PRIMARY KEY,company_id text);CREATE TABLE drawings(id text PRIMARY KEY,company_id text,part_root_id text);
      CREATE TABLE drawing_revisions(id text PRIMARY KEY,company_id text,drawing_id text);
      CREATE TABLE drawing_revision_works(id text PRIMARY KEY,company_id text,drawing_id text,revision_id text,owner_user_id text,handling text,row_version integer,target_label text,updated_at timestamptz);
      CREATE TABLE canonical_workbench_states(company_id text,work_id text,handling text,row_version integer,updated_at timestamptz);
      CREATE TABLE file_assets(id text PRIMARY KEY,storage_provider text,original_path text,storage_bucket text,storage_key text,storage_generation text,storage_metageneration text,file_name text,file_ext text,mime_type text,file_size bigint,content_hash text,linked_entity_type text,linked_entity_id text,document_category text,display_name text,description text,revision text,uploaded_by text,deleted_at timestamptz,deleted_by text,deleted_reason text,updated_at timestamptz);
      CREATE TABLE drawing_revision_files(id text PRIMARY KEY,company_id text,drawing_revision_id text,source_file_asset_id text,role text,role_source text,display_name text,description text,sort_order integer,is_primary integer,created_by text,removed_at timestamptz,removed_by text,updated_at timestamptz);
      CREATE TABLE drawing_revision_work_files(work_id text,file_binding_id text,ordinal integer,content_hash text);
      CREATE TABLE platform_command_receipts(id text PRIMARY KEY,company_id text,command_name text,schema_version integer,idempotency_key text,actor_id text,principal_id text,platform_principal_id text,platform_organization_id text,correlation_id text,command_status text,response_json text,request_hash text,effect_key text,completed_at timestamptz,UNIQUE(company_id,command_name,idempotency_key));
      CREATE TABLE part_numbers(id text PRIMARY KEY,company_id text,part_number text,record_status text);
      CREATE TABLE drawing_numbers(id text PRIMARY KEY,company_id text,drawing_number text);
      CREATE TABLE drawing_part_links(part_number_id text,drawing_number_id text);
      CREATE TABLE pdm_work_review_requests(id text,company_id text,request_kind text,entity_type text,canonical_entity_id text,work_id text,branch_id text,reviewer_user_id text,review_cycle_id text,snapshot_payload text,snapshot_hash text,request_status text,row_version integer);
      INSERT INTO companies VALUES('company'),('other');INSERT INTO users VALUES('user','company');INSERT INTO part_roots VALUES('root','company');INSERT INTO drawings VALUES('drawing','company','root');INSERT INTO drawing_revisions VALUES('revision','company','drawing');
      INSERT INTO drawing_revision_works VALUES('work','company','drawing','revision','user','owner',1,'1.1',CURRENT_TIMESTAMP);
      INSERT INTO canonical_workbench_states VALUES('company','work','owner',1,CURRENT_TIMESTAMP);
      GRANT ALL ON ALL TABLES IN SCHEMA ai_pdm_core TO jenfu_ai_pdm_migrator;`);
    await state.client.execute(await fs.readFile("db/postgres/109_dev129_assembly_packages.sql","utf8"));
  },30000);
  afterAll(async()=>{await state.client?.close();});
  beforeEach(()=>{state.allowed=true;state.bytes=true;state.revoked=false;state.updateAllowed=true;state.realWorkRepo=false;});
  it("rejects no session and denied workspace permission through normal route handlers",async()=>{
    expect((await collectionGET(new Request("http://localhost/api/pdm/drawing-revision-works/work/assembly-packages"),{params:Promise.resolve({workId:"work"})})).status).toBe(401);
    state.allowed=false;expect((await collectionGET(request(),{params:Promise.resolve({workId:"work"})})).status).toBe(403);state.allowed=true;
  });
  it("matches exact same-company materials, retains multi-material drawing ambiguity and unknown purpose",async()=>{
    await state.client.execute(`INSERT INTO part_numbers VALUES('p1','company','P1','Draft'),('p2','company','P2','Released'),('foreign','other','P1','Released');
      INSERT INTO drawing_numbers VALUES('d1','company','D1');INSERT INTO drawing_part_links VALUES('p1','d1'),('p2','d1');`);
    const pkg={id:"mapping-fixture",company_id:"company",archive_sha256:"a".repeat(64),main_entry_key:"main",initiator_authority_json:JSON.stringify(principalJobInitiatorFromVerifiedRequest(verified))} as AssemblyPackageRow;
    const row=(key:string,cadPartNumber:string|null,drawingNumber:string|null)=>({occurrenceKey:key,parentKey:"root",entryKey:key,configuration:"Default",quantity:"1",unit:"EA",disposition:"material",cadPartNumber,drawingNumber});
    const result=await projectAssemblyAnalysisResult(state.client,pkg,{version:1,parserVersion:"solidworks-document-manager.assembly.v2",status:"complete",mainEntryKey:"main",mainCandidates:["main"],configurationNames:["Default"],configurations:[{name:"Default",references:{status:"passed",issues:[]},bom:{rows:[row("one","P1",null),row("many",null,"D1"),row("unknown",null,null)]}}]});
    expect(result.configurations[0].bom.rows.find(row=>row.entryKey==="one")).toMatchObject({partId:"p1",disposition:"matched"});
    expect(result.configurations[0].bom.rows.find(row=>row.entryKey==="many")).toMatchObject({partId:null,disposition:"conflict"});
    expect(result.configurations[0].bom.rows.find(row=>row.entryKey==="unknown")).toMatchObject({partId:null,disposition:"needs_purpose"});
  });
  it("uploads >32 MiB sequentially, reads offset on replay, finalizes once, downloads exact bytes",async()=>{
    firstBytes=zip("first-main",33*1024*1024);
    const start=await collectionPOST(request("POST",undefined,JSON.stringify({fileName:"pack.zip",byteSize:firstBytes.length,activePackageId:null}),{"Idempotency-Key":"upload-first"}),{params:Promise.resolve({workId:"work"})});expect(start.status).toBe(201);
    const created=await start.json();firstId=created.data.packageId;expect(created.data.nextOffset).toBe(0);expect(JSON.stringify(created)).not.toContain("sessionUri");
    const again=await service().start("fixture",request(),"work",{fileName:"pack.zip",byteSize:firstBytes.length,activePackageId:null},"upload-first");expect(again.data?.packageId).toBe(firstId);
    await expect(service().start("fixture",request(),"work",{fileName:"changed.zip",byteSize:firstBytes.length},"upload-first")).rejects.toMatchObject({status:409});
    let offset=0;const url=`http://localhost/api/pdm/drawing-revision-works/work/assembly-packages/${firstId}/content`;
    while(offset<firstBytes.length){const chunk=firstBytes.subarray(offset,Math.min(firstBytes.length,offset+8*1024*1024));const args={params:Promise.resolve({workId:"work",id:firstId})};const res=await contentPUT(request("PUT",url,new Uint8Array(chunk),{"Content-Range":`bytes ${offset}-${offset+chunk.length-1}/${firstBytes.length}`}),args);expect(res.status).toBe(200);const received=await res.json();expect(received.nextOffset).toBe(offset+chunk.length);
      if(offset===0){const replay=await contentPUT(request("PUT",url,new Uint8Array(chunk),{"Content-Range":`bytes 0-${chunk.length-1}/${firstBytes.length}`}),args);expect((await replay.json()).nextOffset).toBe(chunk.length);}offset+=chunk.length;}
    const finalized=await finalizePOST(request("POST",url.replace(/content$/u,"finalize")),{params:Promise.resolve({workId:"work",id:firstId})});expect(finalized.status).toBe(202);expect((await finalized.json()).data.status).toBe("queued");
    await service().finalize("fixture",request(),"work",firstId);
    firstAccepted=true;
    expect((await state.client.queryOne<{n:string}>("SELECT count(*) AS n FROM drawing_assembly_analysis"))?.n).toBe("1");
    const download=await service().download("fixture",request(),"work",firstId);expectSameArchive(Buffer.from(await download.arrayBuffer()),firstBytes);
    state.bytes=false;await expect(service().download("fixture",request(),"work",firstId)).rejects.toMatchObject({status:403});state.bytes=true;
    await expect(service().get("fixture",request(),"other-work",firstId)).rejects.toMatchObject({status:404});
  },60000);
  it("binds one controlled main, survives completion retry and freezes the exact review archive",async context=>{
    if(!firstAccepted){console.log("NOT_RUN main/freeze: package intake prerequisite failed");context.skip();return;}
    let pkg=(await readAssemblyPackage(state.client,"company",firstId))!;
    expect(await bindAssemblyPackageMain({client:state.client,companyId:"company",packageId:firstId,selectionVersion:1,mainEntryKey:pkg.main_entry_key!})).toEqual({bound:true,conflict:false});
    mainBound=true;
    expect(await bindAssemblyPackageMain({client:state.client,companyId:"company",packageId:firstId,selectionVersion:1,mainEntryKey:pkg.main_entry_key!})).toEqual({bound:true,conflict:false});
    expect((await state.client.queryOne<{n:string}>("SELECT count(*) AS n FROM drawing_revision_files WHERE role='cad_3d' AND removed_at IS NULL"))?.n).toBe("1");
    const result={version:1,parserVersion:"solidworks-document-manager.assembly.v2",status:"complete",mainEntryKey:pkg.main_entry_key,mainCandidates:[pkg.main_entry_key],configurationNames:["Default"],configurations:[{name:"Default",references:{status:"passed",issues:[]},bom:{rows:[{rowKey:"row",parentKey:null,entryKey:pkg.main_entry_key,configuration:"Default",quantity:"1",unit:"EA",disposition:"needs_number"}]}}]};
    await state.client.execute(`UPDATE drawing_assembly_packages SET configurations_json='["Default"]' WHERE id=:id`,{id:firstId});
    await state.client.execute(`UPDATE drawing_assembly_analysis SET status='complete',result_json=:result,result_digest='digest' WHERE package_id=:id`,{id:firstId,result:JSON.stringify(result)});
    const work=(await state.client.queryOne<DrawingWorkRow>("SELECT * FROM drawing_revision_works WHERE id='work'"))!;
    expect((await currentAssemblySubmission(state.client,work))?.archiveSha256).toBe(crypto.createHash("sha256").update(firstBytes).digest("hex"));
    await state.client.execute(`INSERT INTO pdm_work_review_requests VALUES('review','company','drawing_revision','drawing','drawing','work',NULL,'reviewer','cycle','{}','review-hash','pending',1)`);
    await state.client.transaction(tx=>freezeAssemblyReview(tx,work,"review"));
    const frozen=await readAssemblyReviewSnapshot(state.client,"company","review");expect(frozen?.bom.Default.rows[0].quantity).toBe("1");
    const edited=await service().bom("fixture",request(),"work",firstId,"Default",{configuration:"Default",rowKey:"row",draftVersion:1,quantity:"2.50"});expect(edited.data.rows[0].quantity).toBe("2.5");
    await expect(service().bom("fixture",request(),"work",firstId,"Default",{rowKey:"row",draftVersion:1,quantity:"3"})).rejects.toMatchObject({status:409});
    expect((await readAssemblyReviewSnapshot(state.client,"company","review"))?.bom.Default.rows[0].quantity).toBe("1");
    const review={...frozen!.reviewAssignment!};await state.client.transaction(tx=>approveAssemblyReview(tx,work,review));
    expect(await state.client.queryOne("SELECT id FROM drawing_assembly_review_snapshots WHERE effective_at IS NOT NULL")).toBeTruthy();
    await expect(state.client.execute("UPDATE drawing_assembly_review_snapshots SET snapshot_json='{}'")).rejects.toThrow(/IMMUTABLE/u);
  });
  it("keeps previous active download during replacement and rejects stale submission after new intake",async context=>{
    if(!mainBound){console.log("NOT_RUN replacement conflict: controlled main prerequisite failed");context.skip();return;}
    const bytes=zip("second-main");const start=await service().start("fixture",request(),"work",{fileName:"new.zip",byteSize:bytes.length,activePackageId:firstId},"second");const id=start.data!.packageId;
    const collection=await service().get("fixture",request(),"work");expect(collection.data?.packageId).toBe(id);expect(collection.previousActive?.packageId).toBe(firstId);
    const work=(await state.client.queryOne<DrawingWorkRow>("SELECT * FROM drawing_revision_works WHERE id='work'"))!;await expect(currentAssemblySubmission(state.client,work)).rejects.toMatchObject({status:409});
    await service().content("fixture",request(),"work",id,`bytes 0-${bytes.length-1}/${bytes.length}`,bytes);await service().finalize("fixture",request(),"work",id);
    expectSameArchive(Buffer.from(await (await service().download("fixture",request(),"work",firstId)).arrayBuffer()),firstBytes);
    const pkg=(await readAssemblyPackage(state.client,"company",id))!;expect(await bindAssemblyPackageMain({client:state.client,companyId:"company",packageId:id,selectionVersion:1,mainEntryKey:pkg.main_entry_key!})).toEqual({bound:false,conflict:true});
    await expect(service().select("fixture",request(),"work",id,{
      selectionVersion:1,acceptPrimaryReplacement:true,conflictingPrimaryBindingId:"stale-main"
    },"stale-binding")).rejects.toMatchObject({status:409});
    await expect(currentAssemblySubmission(state.client,work)).rejects.toMatchObject({status:409});
    state.revoked=true;await expect(bindAssemblyPackageMain({client:state.client,companyId:"company",packageId:id,selectionVersion:1,mainEntryKey:pkg.main_entry_key!,confirmPrimaryReplacement:true})).rejects.toMatchObject({status:403});state.revoked=false;
    expect(await bindAssemblyPackageMain({client:state.client,companyId:"company",packageId:id,selectionVersion:1,mainEntryKey:pkg.main_entry_key!,confirmPrimaryReplacement:true})).toEqual({bound:true,conflict:false});
    expect((await state.client.queryOne<{n:string}>("SELECT count(*) AS n FROM drawing_revision_files WHERE role='cad_3d' AND removed_at IS NULL"))?.n).toBe("1");
  });
  it("retains frozen review and effective ZIP bytes after the real owning work is deleted",async()=>{
    await state.client.execute(`INSERT INTO drawings VALUES('history-drawing','company','root');INSERT INTO drawing_revisions VALUES('history-revision','company','history-drawing');
      INSERT INTO drawing_revision_works VALUES('history-work','company','history-drawing','history-revision','user','owner',1,'2.1',CURRENT_TIMESTAMP);
      INSERT INTO canonical_workbench_states VALUES('company','history-work','owner',1,CURRENT_TIMESTAMP);`);
    const bytes=zip("history-main"),started=await service().start("fixture",request(),"history-work",{fileName:"history.zip",byteSize:bytes.length,activePackageId:null},"history-upload");
    const id=started.data!.packageId;
    await service().content("fixture",request(),"history-work",id,`bytes 0-${bytes.length-1}/${bytes.length}`,bytes);await service().finalize("fixture",request(),"history-work",id);
    const pkg=(await readAssemblyPackage(state.client,"company",id))!;
    await bindAssemblyPackageMain({client:state.client,companyId:"company",packageId:id,selectionVersion:1,mainEntryKey:pkg.main_entry_key!});
    const result={version:1,parserVersion:"solidworks-document-manager.assembly.v2",status:"complete",mainEntryKey:pkg.main_entry_key,mainCandidates:[pkg.main_entry_key],configurationNames:["Default"],configurations:[{name:"Default",references:{status:"passed",issues:[]},bom:{rows:[]}}]};
    await state.client.execute(`UPDATE drawing_assembly_packages SET configurations_json='["Default"]' WHERE id=:id`,{id});
    await state.client.execute(`UPDATE drawing_assembly_analysis SET status='complete',result_json=:result,result_digest='history-digest' WHERE package_id=:id`,{id,result:JSON.stringify(result)});
    const work=(await state.client.queryOne<DrawingWorkRow>("SELECT * FROM drawing_revision_works WHERE id='history-work'"))!;
    await state.client.execute(`INSERT INTO pdm_work_review_requests VALUES('history-review','company','drawing_revision','drawing','history-drawing','history-work',NULL,'reviewer','history-cycle','{}','history-review-hash','pending',1)`);
    await state.client.transaction(tx=>freezeAssemblyReview(tx,work,"history-review"));
    const review=(await readAssemblyReviewSnapshot(state.client,"company","history-review"))!.reviewAssignment!;
    await state.client.transaction(tx=>approveAssemblyReview(tx,work,review));
    await state.client.execute(`UPDATE canonical_workbench_states SET work_id=NULL,handling='none' WHERE work_id='history-work';DELETE FROM pdm_work_review_requests WHERE id='history-review';DELETE FROM drawing_revision_works WHERE id='history-work'`);
    expect((await state.client.queryOne<{active_work_id:string|null}>("SELECT active_work_id FROM drawing_assembly_packages WHERE id=:id",{id}))?.active_work_id).toBeNull();
    const history=(await readAssemblyEffectiveSnapshot(state.client,"company","history-revision"))!;expect(history.packageId).toBe(id);
    expect((await readAssemblyReviewSnapshot(state.client,"company","history-review"))?.archiveSha256).toBe(history.archiveSha256);
    const download=await assemblyFrozenResponse(state.client,verified,history,"download","");expectSameArchive(Buffer.from(await (await download()).arrayBuffer()),bytes);
  });
  it.skipIf(!process.env.DEV129_BROWSER_ZIP)("uploads and downloads the supplied ZIP through the real panel and route handlers",async()=>{
    const helperPath=process.cwd().replaceAll("\\","/")+"/scripts/qc-dev129-assembly-browser.mjs";
    const {verifyAssemblyPackageBrowser}=await import(/* webpackIgnore: true */ helperPath);
    const dispatch=async(request:Request)=>{
      const base="/api/pdm/drawing-revision-works/work/assembly-packages";
      const suffix=new URL(request.url).pathname.slice(base.length).split("/").filter(Boolean);
      const id=suffix[0]??"";
      const file=suffix.length===0?"route":suffix.length===1?"[id]/route":`[id]/${suffix[1]}/route`;
      const routePath=process.cwd().replaceAll("\\","/")+`/src/app/api/pdm/drawing-revision-works/[workId]/assembly-packages/${file}.ts`;
      const handlers=await import(/* webpackIgnore: true */ routePath);
      const handler=handlers[request.method];if(!handler)return new Response(null,{status:405});
      return handler(request,{params:Promise.resolve({workId:"work",id})});
    };
    const receipt=await verifyAssemblyPackageBrowser(dispatch,process.env.DEV129_BROWSER_ZIP,{fileName:process.env.DEV129_BROWSER_FILE_NAME??"UJoint-browser.zip",receivedArchivePath:process.env.DEV129_BROWSER_RECEIVED_ARCHIVE??null});console.log(JSON.stringify({browserReceipt:receipt}));
  },90000);
  it("limits a claimed ZIP to the current device lease and preserves completion readback",async()=>{
    const current=await service().get("fixture",request(),"work");
    const bytes=zip("worker-fixture");
    const started=await service().start("fixture",request(),"work",{fileName:"worker.zip",byteSize:bytes.length,activePackageId:current.data?.packageId??null},"worker-zip");
    const id=started.data!.packageId;
    await service().content("fixture",request(),"work",id,`bytes 0-${bytes.length-1}/${bytes.length}`,bytes);
    await service().finalize("fixture",request(),"work",id);
    const owner={id:"test-device:instance",companyId:"company",ownerPrincipalId:"principal"};
    await expect(claimAssemblyAnalysis(owner,"solidworks-document-manager.assembly.v1")).rejects.toMatchObject({status:426});
    await expect(claimAssemblyAnalysis(owner,"unrecognized-parser")).rejects.toMatchObject({status:426});
    expect(await claimAssemblyAnalysis({...owner,ownerPrincipalId:"other"},"solidworks-document-manager.assembly.v2")).toBeNull();
    const first=await claimAssemblyAnalysis(owner,"solidworks-document-manager.assembly.v2");
    expect(first?.packageId).toBe(id);
    const initialLease={...first!.leaseBasis,archiveSha256:first!.archiveSha256!};
    await expect(pulseAssembly({...owner,id:"other-device"},first!.jobId,initialLease)).rejects.toMatchObject({status:403});
    await state.client.execute("UPDATE drawing_assembly_analysis SET lease_expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE id=:id",{id:first!.jobId});
    const reclaimed=await claimAssemblyAnalysis(owner,"solidworks-document-manager.assembly.v2");
    expect(reclaimed?.leaseBasis.version).toBe(initialLease.version+1);
    const lease={...reclaimed!.leaseBasis,archiveSha256:reclaimed!.archiveSha256!};
    await expect(assemblyJobContent(owner,first!.jobId,initialLease)).rejects.toMatchObject({status:403});
    await pulseAssembly(owner,first!.jobId,lease);
    expectSameArchive(Buffer.from(await (await assemblyJobContent(owner,first!.jobId,lease)).arrayBuffer()),bytes);
    const main=reclaimed!.mainEntryKey!;
    const raw={version:1,parserVersion:"solidworks-document-manager.assembly.v2",status:"complete",mainEntryKey:main,mainCandidates:[main],configurationNames:["Default"],
      configurations:[{name:"Default",references:{status:"passed",issues:[]},bom:{rows:[]}}]};
    const completed=await finishAssembly(owner,first!.jobId,lease,raw);
    expect((await assemblyJobReceipt(owner,first!.jobId)).completion?.resultDigest).toBe(completed.resultDigest);
    await expect(assemblyJobContent(owner,first!.jobId,lease)).rejects.toMatchObject({status:403});
  });
  it.skipIf(!process.env.DEV129_LIVE_ARCHIVE)("runs a live CAD package through the real UI, installed background worker, draft persistence and historical download",async()=>{
    const archivePath=path.resolve(process.env.DEV129_LIVE_ARCHIVE!);
    const extractorPath=path.resolve(process.env.DEV129_LIVE_EXTRACTOR??".tmp/dev129-native/AipdmAssemblyAnalyzer.exe");
    const keyReaderPath=process.env.DEV129_LIVE_DM_KEY_MODULE;
    if(!keyReaderPath)throw new Error("DEV129_LIVE_DM_KEY_MODULE_REQUIRED");
    const readKeyModule=await import(/* webpackIgnore: true */ pathToFileURL(path.resolve(keyReaderPath)).href);
    if(typeof readKeyModule.readAuthorizedDocumentManagerKey!=="function")throw new Error("DEV129_LIVE_KEY_READER_INVALID");
    const evidence=path.resolve(process.env.DEV129_LIVE_OUTPUT??path.join("output/qa/dev129-live-worker",new Date().toISOString().replace(/[:.]/gu,"-")));
    await fs.mkdir(evidence,{recursive:true});
    const source=await fs.readFile(archivePath),sourceHash=crypto.createHash("sha256").update(source).digest("hex");
    if(process.env.DEV129_LIVE_ARCHIVE_SHA256)expect(sourceHash).toBe(process.env.DEV129_LIVE_ARCHIVE_SHA256);
    const {installDev129SubmitFixture}=await import(/* webpackIgnore: true */ pathToFileURL(path.resolve("scripts/lib/dev129-submit-postgres-fixture.mjs")).href);
    await installDev129SubmitFixture(state.client,"live");state.realWorkRepo=true;
    const dispatch=async(request:Request)=>{
      const pathname=new URL(request.url).pathname;
      const base="/api/pdm/drawing-revision-works/live-work/assembly-packages";
      let routePath:string,params:Record<string,string>;
      if(pathname.startsWith(base)) {
        const suffix=pathname.slice(base.length).split("/").filter(Boolean),id=suffix[0]??"";
        const file=suffix.length===0?"route":suffix.length===1?"[id]/route":`[id]/${suffix[1]}/route`;
        routePath=`src/app/api/pdm/drawing-revision-works/[workId]/assembly-packages/${file}.ts`;params={workId:"live-work",id};
      } else if(pathname==="/api/pdm/drawing-revision-works/live-work") {
        routePath="src/app/api/pdm/drawing-revision-works/[workId]/route.ts";params={workId:"live-work"};
      } else if(pathname.startsWith("/api/assembly-analysis-jobs/")) {
        const suffix=pathname.slice("/api/assembly-analysis-jobs/".length).split("/");
        routePath=suffix[0]==="claim"?"src/app/api/assembly-analysis-jobs/claim/route.ts":`src/app/api/assembly-analysis-jobs/[jobId]/${suffix[1]}/route.ts`;params={jobId:suffix[0]};
      } else if(pathname.startsWith("/api/windows-service/jobs/assembly_analysis/")) {
        routePath="src/app/api/windows-service/jobs/[kind]/[jobId]/route.ts";params={kind:"assembly_analysis",jobId:pathname.split("/").at(-1)!};
      } else return new Response(null,{status:404});
      const handlers=await import(/* webpackIgnore: true */ pathToFileURL(path.resolve(routePath)).href);
      const handler=handlers[request.method];return handler?handler(request,{params:Promise.resolve(params)}):new Response(null,{status:405});
    };
    const helperPath=path.resolve("scripts/qc-dev129-assembly-live-worker.mjs"),browserPath=path.resolve("scripts/qc-dev129-assembly-browser.mjs");
    const {verifyAssemblyLiveWorker}=await import(/* webpackIgnore: true */ pathToFileURL(helperPath).href);
    const {verifyAssemblyPackageBrowser}=await import(/* webpackIgnore: true */ pathToFileURL(browserPath).href);
    const actor={id:"test-device:instance",companyId:"company",ownerPrincipalId:"principal"};
    let native: {result:{status:string;configurations:{name:string;references:{status:string;issues:unknown[]};bom:{rows:unknown[]}}[]};nativeExecutableSha256:string;layer:string}|null=null;
    const browserReceipt=await verifyAssemblyPackageBrowser(dispatch,archivePath,{workId:"live-work",fileName:path.basename(archivePath),
      inputDirectory:process.env.DEV129_UPLOAD_DIRECTORY??null,inputFiles:process.env.DEV129_UPLOAD_FILES?JSON.parse(process.env.DEV129_UPLOAD_FILES):null,
      canonical:process.env.DEV129_UPLOAD_CANONICAL==="1",
      receivedArchivePath:path.resolve(process.env.DEV129_LIVE_RECEIVED_ARCHIVE??".tmp/dev129-desktop-oracle/received.zip"),
      afterUpload:async({page}:{page:import("playwright").Page})=>{
        native=await verifyAssemblyLiveWorker({archivePath,extractorPath,dispatch,readDocumentManagerKey:readKeyModule.readAuthorizedDocumentManagerKey,
          onDeviceCredential:(token:string,workerId:string)=>{state.deviceToken=token;state.workerId=workerId;},
          validateKeyLease:async(request:Request,jobId:string)=>verifyAssemblyLease(actor,jobId,readAssemblyLease(request)),outputDirectory:evidence});
        const summary=(await service().get("fixture",request(),"live-work")).data!;
        const configuration=summary.deliveryConfigurations[0];expect(configuration).toBeTruthy();
        const draft=await service().bom("fixture",request(),"live-work",summary.packageId,configuration);
        expect(draft.data.rows.length).toBeGreaterThan(0);
        if(process.env.DEV129_LIVE_EXPECTED_BOM) {
          const oracle=JSON.parse(await fs.readFile(process.env.DEV129_LIVE_EXPECTED_BOM,"utf8")) as {sourceSha256:string;topConfiguration:string;components:{relativePath:string;configuration:string;quantity:string}[]};
          expect(sourceHash).toBe(oracle.sourceSha256);expect(configuration).toBe(oracle.topConfiguration);
          const stored=(await readAssemblyPackage(state.client,"company",summary.packageId))!;
          const manifest=assemblyJson<{entries:{entryKey:string;relativePath:string}[]}>(stored.manifest_json,{entries:[]});
          const entryNames=new Map(manifest.entries.map(entry=>[entry.entryKey,entry.relativePath]));
          const totals=new Map<string,string>();
          for(const row of draft.data.rows) {
            const entry=row.entryKey?entryNames.get(row.entryKey):null;expect(entry,"CAD occurrence must resolve to the received package").toBeTruthy();
            expect(row.quantity,"independent CAD count must have a known quantity").not.toBeNull();expect(row.unit).toBe("EA");
            const key=JSON.stringify([entry,row.configuration]);totals.set(key,totals.has(key)?addAssemblyQuantities(totals.get(key)!,row.quantity!):row.quantity!);
          }
          const actual=[...totals].map(([key,quantity])=>{const [relativePath,configuration]=JSON.parse(key) as string[];return {relativePath,configuration,quantity};}).sort((a,b)=>a.relativePath.localeCompare(b.relativePath));
          expect(actual).toEqual([...oracle.components].sort((a,b)=>a.relativePath.localeCompare(b.relativePath)));
          await fs.writeFile(path.join(evidence,"independent-bom-comparison.json"),JSON.stringify({expected:oracle,actual,match:true},null,2)+"\n",{flag:"wx"});
        }
        await page.getByRole("button",{name:/^BOM 草稿/u}).click({timeout:15000});
        await page.locator(".dev129-bom").getByText(new RegExp(`^${draft.data.rows.length} 列 ·`)).waitFor({timeout:15000});
        await page.screenshot({path:path.join(evidence,"persisted-bom.png"),fullPage:true});
        await fs.writeFile(path.join(evidence,"persisted-bom.json"),JSON.stringify(draft.data,null,2)+"\n",{flag:"wx"});
        return {status:summary.status,configuration,rows:draft.data.rows.length,primaryBindingId:summary.primaryBindingId};
      }});
    if(!native)throw new Error("LIVE_WORKER_DID_NOT_RUN");
    const outcome=native as {result:{status:string;configurations:{name:string;references:{status:string;issues:unknown[]};bom:{rows:unknown[]}}[]};nativeExecutableSha256:string;layer:string};
    const pkg=(await service().get("fixture",request(),"live-work")).data!;
    expect(pkg.archiveSha256).toBe(sourceHash);expect(pkg.primaryBindingId).toBeTruthy();
    const accepted=(await readAssemblyPackage(state.client,"company",pkg.packageId))!;
    const mainManifest=assemblyJson<{entries:{entryKey:string;relativePath:string}[]}>(accepted.manifest_json,{entries:[]});
    const mainPath=mainManifest.entries.find(entry=>entry.entryKey===pkg.mainEntryKey)?.relativePath;
    if(process.env.DEV129_LIVE_EXPECTED_MAIN)expect(mainPath).toBe(process.env.DEV129_LIVE_EXPECTED_MAIN);
    const bindInput={client:state.client,companyId:"company",packageId:pkg.packageId,selectionVersion:pkg.selectionVersion,mainEntryKey:pkg.mainEntryKey!};
    expect(await bindAssemblyPackageMain(bindInput)).toEqual({bound:true,conflict:false});
    expect(await bindAssemblyPackageMain(bindInput)).toEqual({bound:true,conflict:false});
    expect((await readAssemblyPackage(state.client,"company",pkg.packageId))?.primary_binding_id).toBe(pkg.primaryBindingId);
    const configurations=outcome.result.configurations.map(config=>({name:config.name,references:config.references.status,issues:config.references.issues.length,nativeRows:config.bom.rows.length}));
    const referencesPassed=configurations.length>0&&configurations.every(config=>config.references==="passed");
    const work=(await state.client.queryOne<DrawingWorkRow>("SELECT * FROM drawing_revision_works WHERE id='live-work'"))!;
    const persistence=await state.client.queryOne<{status:string;raw_result_json:string;result_json:string;result_digest:string}>(`SELECT status,raw_result_json,result_json,result_digest FROM drawing_assembly_analysis WHERE package_id=:id AND selection_version=:version`,{id:pkg.packageId,version:pkg.selectionVersion});
    expect(persistence?.result_digest).toBeTruthy();expect(persistence?.raw_result_json).toBeTruthy();expect(persistence?.result_json).toBeTruthy();
    let frozenDownload=false;
    if(referencesPassed) {
      expect((await currentAssemblySubmission(state.client,work))?.archiveSha256).toBe(sourceHash);
      await state.client.execute(`INSERT INTO pdm_work_review_requests(id,company_id,request_kind,entity_type,canonical_entity_id,work_id,branch_id,reviewer_user_id,review_cycle_id,snapshot_payload,snapshot_hash,request_status,row_version) VALUES('live-review','company','drawing_revision','drawing','live-drawing','live-work',NULL,'reviewer','live-cycle','{}','live-review-hash','pending',1)`);
      await state.client.transaction(tx=>freezeAssemblyReview(tx,work,"live-review"));
      const review=(await readAssemblyReviewSnapshot(state.client,"company","live-review"))!.reviewAssignment!;
      await state.client.transaction(tx=>approveAssemblyReview(tx,work,review));
      await state.client.execute(`UPDATE canonical_workbench_states SET work_id=NULL,handling='none' WHERE work_id='live-work';DELETE FROM pdm_work_review_requests WHERE id='live-review';DELETE FROM drawing_revision_works WHERE id='live-work'`);
      const frozen=(await readAssemblyEffectiveSnapshot(state.client,"company","live-revision"))!;
      const download=await assemblyFrozenResponse(state.client,verified,frozen,"download","");expectSameArchive(Buffer.from(await (await download()).arrayBuffer()),source);frozenDownload=true;
    } else await expect(currentAssemblySubmission(state.client,work)).rejects.toMatchObject({status:409});
    const receipt={sourceArchive:path.basename(archivePath),sourceSha256:sourceHash,byteSize:source.length,nativeExecutableSha256:outcome.nativeExecutableSha256,
      nativeStatus:outcome.result.status,configurations,referencesPassed,originalDownloadEqual:true,frozenDownload,browserReceipt,
      realCanonicalRepository:true,mainPath,samePackageBindingReplayStable:true,evidenceLayer:outcome.layer,fullSubmitApproval:"NOT_RUN: isolated fixture does not replace existing 2D/reviewer/human admission acceptance"};
    await fs.writeFile(path.join(evidence,"receipt.json"),JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({liveCadReceipt:receipt,evidenceDirectory:evidence}));
    if(process.env.DEV129_LIVE_REQUIRE_PASSED==="1")expect(referencesPassed,"native reference checks remain unresolved; receipt and draft retained").toBe(true);
  },300000);
  it.skipIf(!process.env.DEV129_SUBMIT_ARCHIVE)("runs canonical UI submit transaction with missing 2D, stale package rejection and immutable review freeze",async()=>{
    const archivePath=path.resolve(process.env.DEV129_SUBMIT_ARCHIVE!);
    const nativePath=path.resolve(process.env.DEV129_SUBMIT_NATIVE_RESULT??"output/qa/dev129-live-worker/a0054-v2-20261119-1342/native-result.json");
    const nativeReceiptPath=path.join(path.dirname(nativePath),"receipt.json");
    const original=await fs.readFile(archivePath),hash=crypto.createHash("sha256").update(original).digest("hex");
    const nativeReceipt=JSON.parse(await fs.readFile(nativeReceiptPath,"utf8")) as {sourceSha256:string;nativeExecutableSha256:string;referencesPassed:boolean};
    expect(hash).toBe(nativeReceipt.sourceSha256);expect(nativeReceipt.referencesPassed).toBe(true);
    const raw=JSON.parse(await fs.readFile(nativePath,"utf8"));expect(raw.parserVersion).toBe("solidworks-document-manager.assembly.v2");
    const fixtureModulePath=path.resolve("scripts/lib/dev129-submit-postgres-fixture.mjs");
    const {installDev129SubmitFixture}=await import(/* webpackIgnore: true */ pathToFileURL(fixtureModulePath).href);await installDev129SubmitFixture(state.client);
    state.realWorkRepo=true;
    const priorShared=process.env.PDM_SHARED_WORK_REVIEW_WRITE_ENABLED;process.env.PDM_SHARED_WORK_REVIEW_WRITE_ENABLED="0";
    const evidence=path.resolve(process.env.DEV129_SUBMIT_OUTPUT??path.join("output/qa/dev129-submit",new Date().toISOString().replace(/[:.]/gu,"-")));
    await fs.mkdir(evidence,{recursive:true});
    const actor={id:"test-device:instance",companyId:"company",ownerPrincipalId:"principal"};
    const base="/api/pdm/drawing-revision-works/submit-work",unselectedPaths=new Set<string>();
    const dispatch=async(request:Request)=>{
      const pathname=new URL(request.url).pathname;let routePath:string,params:Record<string,string>;
      if(pathname.startsWith("/api/pdm/drawing-revision-works/")) {
        const suffix=pathname.slice("/api/pdm/drawing-revision-works/".length).split("/");const workId=suffix.shift()!;
        const tail=suffix[0]==="assembly-packages"?suffix.length===1?"assembly-packages/route":suffix.length===2?"assembly-packages/[id]/route":`assembly-packages/[id]/${suffix[2]}/route`:suffix.length?`${suffix[0]}/route`:"route";
        routePath=`src/app/api/pdm/drawing-revision-works/[workId]/${tail}.ts`;params={workId,id:suffix[1]??""};
      } else if(pathname.startsWith("/api/pdm/review-requests/")) {
        const suffix=pathname.slice("/api/pdm/review-requests/".length).split("/");const requestId=suffix.shift()!;
        const tail=suffix.length===0?"route":suffix.length===1?"assembly-package/route":`assembly-package/${suffix[1]}/route`;
        routePath=`src/app/api/pdm/review-requests/[requestId]/${tail}.ts`;params={requestId};
      } else {
        unselectedPaths.add(pathname);return Response.json({code:"NOT_IN_SELECTED_FIXTURE_SCOPE"},{status:503});
      }
      const handlers=await import(/* webpackIgnore: true */ pathToFileURL(path.resolve(routePath)).href),handler=handlers[request.method];
      return handler?handler(request,{params:Promise.resolve(params)}):new Response(null,{status:405});
    };
    const workRequest=(method="GET",tail="",body?:BodyInit,headers:Record<string,string>={})=>request(method,"http://localhost"+base+tail,body,headers);
    const upload=async(key:string,activePackageId:string|null)=>{
      const started=await service().start("fixture",workRequest(),"submit-work",{fileName:path.basename(archivePath),byteSize:original.length,activePackageId},key);
      const id=started.data!.packageId;
      for(let offset=0;offset<original.length;offset+=8*1024*1024){const bytes=original.subarray(offset,Math.min(original.length,offset+8*1024*1024));await service().content("fixture",workRequest(),"submit-work",id,`bytes ${offset}-${offset+bytes.length-1}/${original.length}`,bytes);}
      await service().finalize("fixture",workRequest(),"submit-work",id);return id;
    };
    const complete=async(id:string)=>{
      const job=await claimAssemblyAnalysis(actor,raw.parserVersion);expect(job?.packageId).toBe(id);
      await finishAssembly(actor,job!.jobId,{...job!.leaseBasis,archiveSha256:job!.archiveSha256!},raw);
    };
    try {
      const first=await upload("submit-initial",null);await complete(first);
      const initial=await dispatch(workRequest());expect(initial.status).toBe(200);
      const {verifyAssemblySubmitBrowser}=await import(/* webpackIgnore: true */ pathToFileURL(path.resolve("scripts/qc-dev129-assembly-submit-browser.mjs")).href);
      const {extractAssemblyArchiveEntry}=await import("./assembly-archive");const {createAssemblyStorageService}=await import("./assembly-storage");
      const pkg=(await readAssemblyPackage(state.client,"company",first))!;
      const manifest=assemblyJson<import("./assembly-archive").AssemblyArchiveManifest>(pkg.manifest_json,null!);
      const twoD=manifest.entries.find(entry=>entry.relativePath.toLowerCase().endsWith(".slddrw"));if(!twoD)throw new Error("AUTHORIZED_2D_ROLE_FIXTURE_MISSING");
      const object=assemblyJson<import("./assembly-storage").AssemblyStoredObject>(pkg.storage_object_json,null!);
      const twoDBytes=await extractAssemblyArchiveEntry(await createAssemblyStorageService().openObject(object),manifest,twoD.entryKey,10*1024*1024);
      const receipt=await verifyAssemblySubmitBrowser({dispatch,workId:"submit-work",outputDirectory:evidence,
        exercise:async({page,origin,calls}:{page:import("playwright").Page;origin:string;calls:{method:string;path:string;status:number}[]})=>{
          const submit=page.getByRole("button",{name:"送審",exact:true});await submit.waitFor({timeout:15000});expect(await submit.isDisabled()).toBe(true);
          const initialData=await (await page.request.get(origin+base)).json();
          const commandHeaders={"if-match":`"${initialData.data.rowVersion}"`,"idempotency-key":crypto.randomUUID(),"x-pdm-workbench-contract":initialData.meta.contractToken,"content-type":"application/json"};
          const denied=await page.request.post(origin+base+"/submit",{headers:commandHeaders,data:"{}"});expect(denied.status()).toBe(422);expect((await denied.json()).error.code).toBe("DRAWING_2D_REQUIRED");
          expect((await state.client.queryOne<{n:string}>("SELECT count(*) AS n FROM pdm_work_review_requests"))?.n).toBe("0");
          state.updateAllowed=false;expect((await page.request.get(origin+base+"/assembly-packages")).status()).toBe(200);
          expect((await page.request.post(origin+base+"/assembly-packages",{headers:{"idempotency-key":"denied"},data:{fileName:"denied.zip",byteSize:original.length,activePackageId:first}})).status()).toBe(403);
          state.bytes=false;expect((await page.request.get(origin+base+`/assembly-packages/${first}/download`)).status()).toBe(403);state.bytes=true;state.updateAllowed=true;
          expect((await page.request.get(origin+"/api/pdm/drawing-revision-works/foreign-work/assembly-packages/"+first)).status()).toBe(404);
          await page.getByLabel("加入本版檔案",{exact:true}).setInputFiles({name:twoD.relativePath,mimeType:"application/octet-stream",buffer:twoDBytes});
          await page.getByText("本版次 2D 與 3D 主檔已齊備。",{exact:true}).waitFor({timeout:15000});
          const supplemented=(await service().get("fixture",workRequest(),"submit-work")).data!;
          expect(supplemented.packageId).not.toBe(first);
          const fresh=await upload("submit-replacement",supplemented.packageId);expect(fresh).not.toBe(first);
          const before=await (await page.request.get(origin+base)).json();
          const stale=await page.request.post(origin+base+"/submit",{headers:{...commandHeaders,"if-match":`"${before.data.rowVersion}"`,"idempotency-key":crypto.randomUUID()},data:"{}"});expect(stale.status()).toBe(409);
          expect((await state.client.queryOne<{n:string}>("SELECT count(*) AS n FROM pdm_work_review_requests"))?.n).toBe("0");
          await complete(fresh);await page.reload();await submit.waitFor({timeout:15000});await page.waitForFunction(()=>!(document.querySelector('button.primary-button') as HTMLButtonElement|null)?.disabled);
          expect(await submit.isEnabled()).toBe(true);await page.screenshot({path:path.join(evidence,"ready-for-submit.png"),fullPage:true});
          const [submitted]=await Promise.all([page.waitForResponse(response=>response.url()===origin+base+"/submit"&&response.request().method()==="POST"),submit.click()]);
          const body=await submitted.json();expect(submitted.status(),JSON.stringify(body)).toBe(200);const requestId=body.data.requestId;expect(requestId).toBeTruthy();
          const review=await state.client.queryOne<{snapshot_payload:string;snapshot_hash:string;work_id:string}>("SELECT snapshot_payload,snapshot_hash,work_id FROM pdm_work_review_requests WHERE id=:id",{id:requestId});
          const {verifyReviewPackageIntegrity}=await import("./pdm-review-package");const envelope=verifyReviewPackageIntegrity(JSON.parse(review!.snapshot_payload),review!.snapshot_hash);expect(envelope.schemaVersion).toBe("pdm-review-package-v2");
          const frozen=(await readAssemblyReviewSnapshot(state.client,"company",requestId))!;expect(frozen.packageId).toBe(fresh);expect(frozen.packageId).not.toBe(first);expect(frozen.archiveSha256).toBe(hash);expect(frozen.reviewSnapshotHash).toBe(review!.snapshot_hash);
          expect((await state.client.queryOne<{handling:string}>("SELECT handling FROM canonical_workbench_states WHERE work_id='submit-work'"))?.handling).toBe("review_owner");
          expect((await page.request.get(origin+`/api/pdm/review-requests/${requestId}/assembly-package`)).status()).toBe(404);
          const reviewSummary=await page.request.get(origin+`/api/pdm/review-requests/${requestId}/assembly-package`,{headers:{"x-fixture-principal":"reviewer"}});expect(reviewSummary.status()).toBe(200);expect((await reviewSummary.json()).data.packageId).toBe(fresh);
          const frozenDownload=await page.request.get(origin+`/api/pdm/review-requests/${requestId}/assembly-package/download`,{headers:{"x-fixture-principal":"reviewer"}});expect(frozenDownload.status()).toBe(200);expectSameArchive(Buffer.from(await frozenDownload.body()),original);
          await fs.writeFile(path.join(evidence,"review-package.json"),JSON.stringify(envelope,null,2)+"\n",{flag:"wx"});await fs.writeFile(path.join(evidence,"assembly-freeze.json"),JSON.stringify(frozen,null,2)+"\n",{flag:"wx"});
          return {missing2dUiDisabled:true,missing2dApiStatus:denied.status(),replacementBeforeScanStatus:stale.status(),submitStatus:submitted.status(),requestId,previousPackageId:first,submittedPackageId:fresh,packageHash:review!.snapshot_hash,strictV2:true,reviewerFrozenDownloadEqual:true,actualSubmitCalls:calls.filter(call=>call.method==="POST"&&call.path===base+"/submit").length};
        }});
      await fs.writeFile(path.join(evidence,"receipt.json"),JSON.stringify({sourceSha256:hash,reusedNativeExecutableSha256:nativeReceipt.nativeExecutableSha256,...receipt,
        evidenceBoundary:"real canonical workspace, work repository, required-file checks, submit transaction, strict v2 package and sidecar; fixture Principal/role/reviewer providers; 2D sample validates existing role gate only",unselectedPaths:[...unselectedPaths]},null,2)+"\n",{flag:"wx"});
      console.log(JSON.stringify({submitIntegrationReceipt:receipt,evidenceDirectory:evidence}));
    } finally {if(priorShared===undefined)delete process.env.PDM_SHARED_WORK_REVIEW_WRITE_ENABLED;else process.env.PDM_SHARED_WORK_REVIEW_WRITE_ENABLED=priorShared;state.realWorkRepo=false;}
  },120000);
});
