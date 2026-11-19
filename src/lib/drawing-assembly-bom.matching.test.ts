import {beforeEach,describe,it,expect,vi} from "vitest";
import type {AsyncDatabaseClient} from "./db-async-provider";
import type {AssemblyPackageRow} from "./drawing-assembly-package";
import type {AssemblyAnalysisResult} from "./assembly-analysis-result";
const state=vi.hoisted(()=>({allowed:true,localAdmin:false}));
vi.mock("@/lib/jenfu-principal-permission-service",()=>({evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot:async()=>[{allowed:state.allowed}]}));
vi.mock("@/lib/shared-daily-system-test-admin",async original=>({...await original<typeof import("./shared-daily-system-test-admin")>(),isSharedDailySystemTestAdministrator:async()=>state.localAdmin}));
vi.mock("@/lib/jenfu-principal-role-catalog",async()=>({requirePublishedPrincipalCatalog:async()=>(await import("../../config/access-control/jenfu-role-catalog.v7.json")).default}));
vi.mock("@/lib/principal-job-authority",()=>({parsePrincipalJobInitiator:()=>({principalId:"actor",companyId:"company"})}));
import {projectAssemblyAnalysisResult} from "./drawing-assembly-bom";
beforeEach(()=>{state.allowed=true;state.localAdmin=false;});
describe("assembly filename matching",()=>{
 const candidate={id:"part",part_number:"A0033-P01",drawing_number:null,root_code:"A0033"};
 const pkg={id:"pkg",company_id:"company",archive_sha256:"a".repeat(64),main_entry_key:"main",manifest_json:JSON.stringify({entries:[{entryKey:"part-file",relativePath:"Parts/A0033.SLDPRT"}]})} as AssemblyPackageRow;
 const row={occurrenceKey:"one",parentKey:"main",entryKey:"part-file",reference:"ignored.SLDPRT",configuration:"Default",quantity:"1",unit:"EA",disposition:"material"};
 const raw=(rows:unknown[])=>({mainEntryKey:"main",configurations:[{name:"Default",bom:{rows}}]}) as AssemblyAnalysisResult;
 function client(candidates:unknown[]=[candidate]){return {query:vi.fn(async()=>candidates)} as unknown as AsyncDatabaseClient;}
 it("matches a unique existing root from the verified manifest and aggregates repeated instances",async()=>{
  const db=client();const result=await projectAssemblyAnalysisResult(db,pkg,raw([row,{...row,occurrenceKey:"two"}]));
  expect(result.configurations[0].bom.rows).toHaveLength(1);
  expect(result.configurations[0].bom.rows[0]).toMatchObject({partNumber:"A0033-P01",quantity:"2",disposition:"matched",sourceEvidence:{matchBasis:"exact_manifest_filename",matchedFilename:"A0033"}});
  expect(db.query).toHaveBeenCalledWith(expect.stringContaining("p.company_id=:companyId"),expect.objectContaining({companyId:"company",n0:"A0033"}));
 });
 it("keeps multiple material variants ambiguous and unknown roots unresolved",async()=>{
  const result=await projectAssemblyAnalysisResult(client([candidate,{...candidate,id:"second",part_number:"A0033-P02"}]),pkg,raw([row]));
  expect(result.configurations[0].bom.rows[0]).toMatchObject({partId:null,disposition:"conflict"});
  expect((await projectAssemblyAnalysisResult(client([]),pkg,raw([row]))).configurations[0].bom.rows[0].disposition).toBe("needs_purpose");
 });
 it("does not guess from reference text, override explicit CAD identity, or match virtual parts",async()=>{
  for(const change of [{entryKey:"not-in-manifest"},{cadPartNumber:"TBD"},{virtual:true}]){
   const db=client([]);await projectAssemblyAnalysisResult(db,pkg,raw([{...row,...change}]));
   expect(vi.mocked(db.query).mock.calls.some(([sql])=>sql.includes("part_roots"))).toBe(false);
  }
 });
 it("does not query PDM materials without current read permission",async()=>{
  state.allowed=false;const db=client();const result=await projectAssemblyAnalysisResult(db,pkg,raw([row]));
  expect(db.query).not.toHaveBeenCalled();expect(result.configurations[0].bom.rows[0].partId).toBeNull();
 });
 it("uses the explicitly enabled shared-daily administrator's published legacy operations",async()=>{
  state.allowed=false;state.localAdmin=true;
  const result=await projectAssemblyAnalysisResult(client(),pkg,raw([row]));
  expect(result.configurations[0].bom.rows[0]).toMatchObject({partNumber:"A0033-P01",disposition:"matched"});
 });
});
