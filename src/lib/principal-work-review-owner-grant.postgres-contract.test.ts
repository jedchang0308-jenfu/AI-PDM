import path from "node:path";
import fs from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
vi.mock("@/lib/jenfu-principal-request-guard", async original => ({
  ...await original<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: async (input: { database:AsyncDatabaseClient;token:string },
    run:(client:AsyncDatabaseClient,verified:VerifiedPrincipalRequest)=>Promise<unknown>,
    options:{readOnly?:boolean;isolationLevel?:"repeatable_read"|"serializable"}={}) =>
    input.database.transaction(client=>run(client, {
      profile:{pdmUserId:input.token===ownerToken?"qc-profile-owner":"qc-profile-legacy",companyId:"company-jenfu"},
      session:{contractVersion:"jenfu.ai-pdm-session.v2",appId:"ai-pdm",sessionId:"review-qc",
        identityIssuer:input.token===ownerToken?"issuer-race-binder-first":"issuer-legacy",
        identitySubject:input.token===ownerToken?"subject-race-binder-first":"subject-legacy",
        principalId:input.token===ownerToken?process.env.DEV057_FLOW_OWNER_PRINCIPAL_ID!:"principal-legacy",
        employeeId:input.token===ownerToken?"employee-three":"employee-legacy",authEpoch:1,profileVersion:1,
        assuranceLevel:"aal2",issuedAt:"2026-10-01T00:00:00Z",expiresAt:"2026-10-01T01:00:00Z"}
    }),{readOnly:options.readOnly!==false,isolationLevel:options.isolationLevel??"repeatable_read"})
}));
import { POST as createRecord } from "@/app/api/numbering/records/route";
import { POST as createPartWork } from "@/app/api/pdm/parts/[partId]/change-works/route";
import { GET as readPartWork, PATCH as updatePartWork } from "@/app/api/pdm/part-change-works/[workId]/route";
import { POST as submitPart } from "@/app/api/pdm/part-change-works/[workId]/submit/route";
import { GET as readDrawingWork } from "@/app/api/pdm/drawing-revision-works/[workId]/route";
import { POST as uploadDrawingFile } from "@/app/api/pdm/drawing-revision-works/[workId]/files/route";
import { POST as submitDrawing } from "@/app/api/pdm/drawing-revision-works/[workId]/submit/route";
import { GET as inbox } from "@/app/api/approvals/inbox/route";
import { GET as readReview } from "@/app/api/pdm/review-requests/[requestId]/route";
import { POST as decideReview } from "@/app/api/pdm/review-requests/[requestId]/decisions/route";
import { issueCanonicalWorkbenchContract } from "@/lib/pdm-workbench-authority-control";
const enabled=process.env.DEV057_NATIVE_REVIEW_PROBE==="1" && process.env.DEV057_CONTRACT_PHASE==="flow";
const db=enabled?getAsyncDatabaseClient():null;
const header=Buffer.from(JSON.stringify({type:"JENFU-AI-PDM-PRINCIPAL",version:2})).toString("base64url");
const ownerToken=header+".owner.signature", reviewerToken=header+".reviewer.signature";
function request(url:string,token=ownerToken,method="GET",body?:object,version=1,contract="",key=url) {
  return new Request("https://ai-pdm.test"+url,{method,headers:{cookie:"pdm_session="+token,
    "content-type":"application/json","if-match":String(version),"x-pdm-workbench-contract":contract,"idempotency-key":key},
    body:body?JSON.stringify(body):undefined});
}
async function ok<T>(response:Response,status=200):Promise<T>{
  expect(response.status,await response.clone().text()).toBe(status);return response.json();
}
type Work={data:{workId:string;rowVersion:number;payload:Record<string,unknown>};meta:{contractToken:string}};
type Submission={data:{requestId:string;rowVersion:number}};
async function contract(actorId:string){
  return db!.transaction(tx=>issueCanonicalWorkbenchContract(tx,{companyId:"company-jenfu",actorId}),{readOnly:true});
}
async function completeReview(submission:Submission,decision:"approve"|"return_for_correction") {
  const id=submission.data.requestId,params={params:Promise.resolve({requestId:id})};
  const pending=await ok<Record<string,unknown>>(await inbox(request("/api/approvals/inbox",reviewerToken)));
  expect(JSON.stringify(pending)).toContain(id);
  await ok(await readReview(request("/api/pdm/review-requests/"+id,reviewerToken),params));
  const ownerAttempt=await decideReview(request("/api/pdm/review-requests/"+id+"/decisions",ownerToken,"POST",
    {decision},submission.data.rowVersion,await contract("qc-profile-owner")),params);
  expect(ownerAttempt.status).toBe(404);
  expect(await db!.queryOne("SELECT id FROM pdm_work_review_requests WHERE id=:id",{id})).toBeTruthy();
  const reviewerContract=await contract("qc-profile-legacy");
  const perform=()=>decideReview(request("/api/pdm/review-requests/"+id+"/decisions",reviewerToken,"POST",
    {decision},submission.data.rowVersion,reviewerContract),params);
  await ok(await perform());await ok(await perform());
  expect(await db!.queryOne("SELECT id FROM pdm_work_review_requests WHERE id=:id",{id})).toBeNull();
  const receipt=await db!.queryOne<{principal_id:string;actor_id:string;command_status:string}>(
    "SELECT principal_id,actor_id,command_status FROM platform_command_receipts WHERE effect_key=:effect AND command_name=:commandName",
    {effect:"review:"+id,commandName:"dev087:review.decision"});
  expect(receipt).toMatchObject({principal_id:"principal-legacy",actor_id:"qc-profile-legacy",command_status:"completed"});
}
beforeAll(async()=>{
  if(!enabled)return;
  const dsn=new URL(process.env.DEV121_NUMBERING_POSTGRES_URL!);
  expect(dsn.hostname).toBe("127.0.0.1");expect(dsn.pathname).toMatch(/^\/dev121_numbering_[a-f0-9]{16}$/u);
  const taskRoot=process.env.DEV057_FILE_QC_ROOT!;
  expect(path.resolve(process.env.PDM_DATA_DIR!)).toBe(path.join(taskRoot,"aipdm-numbering-data"));
  await fs.access(path.join(taskRoot,"cluster","PG_VERSION"));
});
afterAll(async()=>{await db?.close();});
describe.runIf(enabled)("OrgMaster grant v3 -> actual Principal part/drawing work and review on native PostgreSQL",()=>{
  it("creates, edits, submits and approves a part; only the assigned Principal can decide, with exact replay",async()=>{
    const created=await ok<{partNumber:{id:string}}>(await createRecord(request("/api/numbering/records",ownerToken,"POST",
      {coreName:"DEV057 part review",itemKind:"purchased",structureType:"single_part",drawingRequested:false})),201);
    const partId=created.partNumber.id;
    const start=await ok<{data:{workId:string;rowVersion:number}}>(await createPartWork(request("/api/pdm/parts/"+partId+"/change-works",ownerToken,"POST",{},1,
      await contract("qc-profile-owner")),{params:Promise.resolve({partId})}));
    const workId=start.data.workId,params={params:Promise.resolve({workId})};
    let work=await ok<Work>(await readPartWork(request("/api/pdm/part-change-works/"+workId),params));
    await ok(await updatePartWork(request("/api/pdm/part-change-works/"+workId,ownerToken,"PATCH",
      {...work.data.payload,partName:"Principal reviewed part"},work.data.rowVersion,work.meta.contractToken),params));
    work=await ok<Work>(await readPartWork(request("/api/pdm/part-change-works/"+workId),params));
    const submission=await ok<Submission>(await submitPart(request("/api/pdm/part-change-works/"+workId+"/submit",ownerToken,"POST",{},
      work.data.rowVersion,work.meta.contractToken),params));
    await completeReview(submission,"approve");
    expect(await db!.queryOne("SELECT part_name FROM part_numbers WHERE id=:id",{id:partId})).toMatchObject({part_name:"Principal reviewed part"});
    expect(await db!.queryOne("SELECT id FROM part_change_works WHERE id=:id",{id:workId})).toBeNull();
  });
  it("uploads two native drawing files, submits the first revision and returns it for correction without changing its owner",async()=>{
    const created=await ok<{drawingNumber:{id:string}}>(await createRecord(request("/api/numbering/records",ownerToken,"POST",
      {coreName:"DEV057 drawing review",itemKind:"manufactured",structureType:"single_part",drawingRequested:true,drawingPurposeCode:"M"},1,"","drawing-number-one")),201);
    const row=await db!.queryOne<{id:string}>(`SELECT work.id FROM drawing_revision_works work JOIN drawings d ON d.id=work.drawing_id
      WHERE d.formal_drawing_number_id=:id`,{id:created.drawingNumber.id});
    expect(row).toBeTruthy();const workId=row!.id,params={params:Promise.resolve({workId})};
    for(const name of ["synthetic.SLDDRW","synthetic.SLDPRT"]){
      const work=await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/"+workId),params));
      const form=new FormData();form.set("file",new File(["task-owned synthetic "+name],name,{type:"application/octet-stream"}));
      await ok(await uploadDrawingFile(new Request("https://ai-pdm.test/api/pdm/drawing-revision-works/"+workId+"/files",{
        method:"POST",headers:{cookie:"pdm_session="+ownerToken,"if-match":String(work.data.rowVersion),
          "x-pdm-workbench-contract":work.meta.contractToken,"idempotency-key":"upload-"+name},body:form}),params));
    }
    const work=await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/"+workId),params));
    const submission=await ok<Submission>(await submitDrawing(request("/api/pdm/drawing-revision-works/"+workId+"/submit",ownerToken,"POST",{},
      work.data.rowVersion,work.meta.contractToken),params));
    await completeReview(submission,"return_for_correction");
    const refreshed=await ok<Work>(await readDrawingWork(request("/api/pdm/drawing-revision-works/"+workId),params));
    expect(refreshed.data.workId).toBe(workId);
    expect(await db!.queryOne("SELECT owner_user_id FROM drawing_revision_works WHERE id=:id",{id:workId})).toMatchObject({owner_user_id:"qc-profile-owner"});
  });
});
