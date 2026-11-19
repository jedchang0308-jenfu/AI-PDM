import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from "vitest";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import {createAsyncDatabaseClient,type AsyncDatabaseClient} from "./db-async-provider";
import {assemblyCrc32} from "./assembly-archive";
import {DrawingAssemblyPackageService,readAssemblyPackage,bindAssemblyPackageMain} from "./drawing-assembly-package";
import {projectAssemblyAnalysisResult} from "./drawing-assembly-bom";
import {currentAssemblySubmission,freezeAssemblyReview,approveAssemblyReview,readAssemblyReviewSnapshot,readAssemblyEffectiveSnapshot,assemblyFrozenResponse} from "./drawing-assembly-review";
import type {DrawingWorkRow} from "./repositories/drawing-revision-work-async-repository";
import type {VerifiedPrincipalRequest} from "./jenfu-principal-request-guard";
import {principalJobInitiatorFromVerifiedRequest} from "./principal-job-authority";
import type {AssemblyPackageRow} from "./drawing-assembly-package";
import {GET as collectionGET,POST as collectionPOST} from "../app/api/pdm/drawing-revision-works/[workId]/assembly-packages/route";
import {PUT as contentPUT} from "../app/api/pdm/drawing-revision-works/[workId]/assembly-packages/[id]/content/route";
import {POST as finalizePOST} from "../app/api/pdm/drawing-revision-works/[workId]/assembly-packages/[id]/finalize/route";
import {claimAssemblyAnalysis,assemblyJobContent,assemblyJobReceipt,finishAssembly,pulseAssembly} from "./assembly-analysis-jobs";

const state=vi.hoisted(()=>({client:null as unknown as AsyncDatabaseClient,allowed:true,bytes:true,revoked:false}));
const verified={session:{contractVersion:"jenfu.ai-pdm-session.v2",appId:"ai-pdm",principalId:"principal",employeeId:"employee",identityIssuer:"fixture-issuer",identitySubject:"fixture-subject",profileVersion:1,accountLifecycleVersion:1,authEpoch:0,authenticatedAt:"2026-11-19T00:00:00Z",issuedAt:"2026-11-19T00:00:00Z"},profile:{pdmUserId:"user",companyId:"company"}} as VerifiedPrincipalRequest;
vi.mock("@/lib/db-async-provider",async original=>({...await original<typeof import("./db-async-provider")>(),getAsyncDatabaseClient:()=>state.client}));
vi.mock("@/lib/jenfu-principal-http",async original=>({...await original<typeof import("./jenfu-principal-http")>(),principalRequestInput:async()=>({}),principalSessionTokenFromRequest:(request:Request)=>request.headers.get("x-fixture-principal")}));
vi.mock("@/lib/jenfu-principal-request-guard",async original=>({...await original<typeof import("./jenfu-principal-request-guard")>(),withVerifiedJenfuPrincipalRequest:async(input:{database:AsyncDatabaseClient},execute:(tx:AsyncDatabaseClient,actor:VerifiedPrincipalRequest)=>unknown,options:unknown)=>input.database.transaction(tx=>execute(tx,verified),options as never)}));
vi.mock("@/lib/jenfu-principal-permission-service",()=>({evaluatePrincipalWorkspacePermissionsInSnapshot:async(_tx:unknown,_v:unknown,permissions:{permissionCode:string}[])=>permissions.map(p=>({...p,allowed:state.allowed,roleCode:"Engineer"})),evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot:async()=>[{allowed:!state.revoked,roleCode:"Engineer"}]}));
vi.mock("@/lib/principal-resource-capability",()=>({authorizeDynamicResourceCapabilityInSnapshot:async()=>state.bytes?null:new Response(null,{status:403})}));
vi.mock("@/lib/principal-job-authority",async original=>({...await original<typeof import("./principal-job-authority")>(),requireCurrentPrincipalJobAuthority:async()=>{if(state.revoked)throw Object.assign(new Error("REVOKED"),{status:403});}}));
vi.mock("@/lib/pdm-workbench-authority-control",()=>({verifyCanonicalWorkbenchCommandContract:async()=>{},issueCanonicalWorkbenchContract:async()=>"fixture-contract"}));
vi.mock("@/lib/preview-derivatives",()=>({isNativeSolidWorksPreviewSource:(ext:string)=>ext==="sldasm",ensureAutomaticPreviewJobsForSourceAssetsAsync:async()=>{}}));
vi.mock("@/lib/sldasm-assembly-evidence",()=>({reconcileSldasmAssemblyEvidence:async()=>{}}));
vi.mock("@/lib/repositories/drawing-revision-work-async-repository",()=>({DrawingRevisionWorkAsyncRepository:class {
  async readWork(tx:AsyncDatabaseClient,companyId:string,id:string,lock=false){return tx.queryOne(`SELECT * FROM drawing_revision_works WHERE company_id=:companyId AND id=:id${lock?" FOR UPDATE":""}`,{companyId,id});}
  async assertWorkMutationBasis(_tx:AsyncDatabaseClient,work:{handling:string}){if(work.handling!=="owner")throw new Error("WORK_NOT_EDITABLE");}
  async assertWorkFileSnapshot(){}
}}));

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
  beforeEach(()=>{state.allowed=true;state.bytes=true;state.revoked=false;});
  it("rejects no session and denied workspace permission through normal route handlers",async()=>{
    expect((await collectionGET(new Request("http://localhost/api/pdm/drawing-revision-works/work/assembly-packages"),{params:Promise.resolve({workId:"work"})})).status).toBe(401);
    state.allowed=false;expect((await collectionGET(request(),{params:Promise.resolve({workId:"work"})})).status).toBe(403);state.allowed=true;
  });
  it("matches exact same-company materials, retains multi-material drawing ambiguity and unknown purpose",async()=>{
    await state.client.execute(`INSERT INTO part_numbers VALUES('p1','company','P1','Draft'),('p2','company','P2','Released'),('foreign','other','P1','Released');
      INSERT INTO drawing_numbers VALUES('d1','company','D1');INSERT INTO drawing_part_links VALUES('p1','d1'),('p2','d1');`);
    const pkg={id:"mapping-fixture",company_id:"company",archive_sha256:"a".repeat(64),main_entry_key:"main",initiator_authority_json:JSON.stringify(principalJobInitiatorFromVerifiedRequest(verified))} as AssemblyPackageRow;
    const row=(key:string,cadPartNumber:string|null,drawingNumber:string|null)=>({occurrenceKey:key,parentKey:"root",entryKey:key,configuration:"Default",quantity:"1",unit:"EA",disposition:"material",cadPartNumber,drawingNumber});
    const result=await projectAssemblyAnalysisResult(state.client,pkg,{version:1,parserVersion:"fixture",status:"complete",mainEntryKey:"main",mainCandidates:["main"],configurationNames:["Default"],configurations:[{name:"Default",references:{status:"passed",issues:[]},bom:{rows:[row("one","P1",null),row("many",null,"D1"),row("unknown",null,null)]}}]});
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
    const result={version:1,parserVersion:"fixture",status:"complete",mainEntryKey:pkg.main_entry_key,mainCandidates:[pkg.main_entry_key],configurationNames:["Default"],configurations:[{name:"Default",references:{status:"passed",issues:[]},bom:{rows:[{rowKey:"row",parentKey:null,entryKey:pkg.main_entry_key,configuration:"Default",quantity:"1",unit:"EA",disposition:"needs_number"}]}}]};
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
    const result={version:1,parserVersion:"fixture",status:"complete",mainEntryKey:pkg.main_entry_key,mainCandidates:[pkg.main_entry_key],configurationNames:["Default"],configurations:[{name:"Default",references:{status:"passed",issues:[]},bom:{rows:[]}}]};
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
    const receipt=await verifyAssemblyPackageBrowser(dispatch,process.env.DEV129_BROWSER_ZIP);console.log(JSON.stringify({browserReceipt:receipt}));
  },90000);
  it("limits a claimed ZIP to the current device lease and preserves completion readback",async()=>{
    const current=await service().get("fixture",request(),"work");
    const bytes=zip("worker-fixture");
    const started=await service().start("fixture",request(),"work",{fileName:"worker.zip",byteSize:bytes.length,activePackageId:current.data?.packageId??null},"worker-zip");
    const id=started.data!.packageId;
    await service().content("fixture",request(),"work",id,`bytes 0-${bytes.length-1}/${bytes.length}`,bytes);
    await service().finalize("fixture",request(),"work",id);
    const owner={id:"test-device:instance",companyId:"company",ownerPrincipalId:"principal"};
    expect(await claimAssemblyAnalysis({...owner,ownerPrincipalId:"other"},"fixture")).toBeNull();
    const first=await claimAssemblyAnalysis(owner,"fixture");
    expect(first?.packageId).toBe(id);
    const initialLease={...first!.leaseBasis,archiveSha256:first!.archiveSha256!};
    await expect(pulseAssembly({...owner,id:"other-device"},first!.jobId,initialLease)).rejects.toMatchObject({status:403});
    await state.client.execute("UPDATE drawing_assembly_analysis SET lease_expires_at=CURRENT_TIMESTAMP-interval '1 second' WHERE id=:id",{id:first!.jobId});
    const reclaimed=await claimAssemblyAnalysis(owner,"fixture");
    expect(reclaimed?.leaseBasis.version).toBe(initialLease.version+1);
    const lease={...reclaimed!.leaseBasis,archiveSha256:reclaimed!.archiveSha256!};
    await expect(assemblyJobContent(owner,first!.jobId,initialLease)).rejects.toMatchObject({status:403});
    await pulseAssembly(owner,first!.jobId,lease);
    expectSameArchive(Buffer.from(await (await assemblyJobContent(owner,first!.jobId,lease)).arrayBuffer()),bytes);
    const main=reclaimed!.mainEntryKey!;
    const raw={version:1,parserVersion:"fixture",status:"complete",mainEntryKey:main,mainCandidates:[main],configurationNames:["Default"],
      configurations:[{name:"Default",references:{status:"passed",issues:[]},bom:{rows:[]}}]};
    const completed=await finishAssembly(owner,first!.jobId,lease,raw);
    expect((await assemblyJobReceipt(owner,first!.jobId)).completion?.resultDigest).toBe(completed.resultDigest);
    await expect(assemblyJobContent(owner,first!.jobId,lease)).rejects.toMatchObject({status:403});
  });
});
