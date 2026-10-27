import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { PrincipalJobAuthorityError, type PrincipalJobInitiator } from "@/lib/principal-job-authority";

const mocks = vi.hoisted(() => ({
  read: vi.fn(), putObject: vi.fn(), authority: vi.fn()
}));
vi.mock("@/lib/file-storage", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/file-storage")>(),
  createFileStorageServiceForPointer: () => ({ readObject: mocks.read }),
  createFileStorageService: () => ({ putObject: mocks.putObject })
}));
vi.mock("@/lib/principal-job-authority", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/principal-job-authority")>(),
  requireCurrentPrincipalJobAuthority: mocks.authority
}));

import { completePreviewJobAsync, readClaimedPreviewSourceAsync } from "@/lib/preview-derivatives";

const bytes = Buffer.from("preview-source");
const digest = createHash("sha256").update(bytes).digest("hex");
const initiator: PrincipalJobInitiator = { kind:'verified_principal', principalId:'principal-one',
 employeeId:'employee-one', pdmUserId:'profile-one', companyId:'company-one', identityIssuer:'issuer',
 identitySubject:'subject', profileVersion:1, accountLifecycleVersion:1, authEpoch:1,
 authenticatedAt:'2026-10-23T00:00:00.000Z', sessionIssuedAt:'2026-10-23T00:00:00.000Z' };
let job: Record<string,unknown>; let source: Record<string,unknown>; let companyValid:boolean; let holderValid:boolean;
const queryOne = vi.fn(async (sql:string,params:Record<string,unknown>)=> {
  if(sql.includes("FROM preview_jobs job")) {
    if(!holderValid||!companyValid||job.locked_by!==params.workerId||job.attempt_count!==params.attemptCount||job.source_content_hash!==params.sourceContentHash) return null;
    return job;
  }
  if(sql.includes("statement_timestamp() AS lease_clock")) return {lease_clock:new Date().toISOString()};
  if(sql.includes("FROM file_assets fa JOIN preview_jobs")) return companyValid?source:null;
  if(sql.includes("SELECT fa.id")) return companyValid?{id:"asset-one"}:null;
  if(sql.includes("SELECT * FROM file_assets")) return source;
  return holderValid?{id:"job-one"}:null;
});
const snapshot = {kind:"postgres",queryOne};
const client = {kind:"postgres",queryOne,transaction:vi.fn(async (run:(tx:unknown)=>Promise<unknown>)=>run(snapshot))} as unknown as AsyncDatabaseClient;
beforeEach(()=>{vi.clearAllMocks(); companyValid=true;holderValid=true;
 job={id:"job-one",status:"running",locked_by:"worker-one",company_id:"company-one",source_file_asset_id:"asset-one",source_content_hash:digest,
 attempt_count:1,locked_at:"2026-10-23T00:00:00.000Z",updated_at:new Date().toISOString(),source_extension:"slddrw",metadata_json:JSON.stringify({initiator})};
 source={id:"asset-one",company_id:"company-one",file_ext:"slddrw",linked_entity_type:"drawing_revision",document_category:"drawing_2d",capability_role:"drawing_2d",file_name:"drawing.slddrw",file_size:bytes.length,content_hash:digest,storage_provider:"local_repository",storage_key:"source/one"};
 mocks.read.mockReset().mockResolvedValue(bytes); mocks.authority.mockReset().mockResolvedValue(undefined);
});
const input={jobId:"job-one",workerId:"worker-one",ownerPrincipalId:"principal-one",leaseBasis:{companyId:"company-one",sourceFileAssetId:"asset-one",sourceContentHash:digest,attemptCount:1,lockedAt:"2026-10-23T00:00:00.000Z"}};
describe("claimed preview source boundary",()=> {
 it("delivers verified bytes with original Principal through a read-only snapshot",async()=>{
  expect(await readClaimedPreviewSourceAsync(client,input)).toMatchObject({bytes,contentHash:digest,principalId:"principal-one"});
  expect(client.transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:"repeatable_read",readOnly:true});
 });
 it("rejects a different holder before storage access",async()=>{job.locked_by="other";await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow("PREVIEW_JOB_CLAIM_LOST");expect(mocks.read).not.toHaveBeenCalled()});
 it("rejects wrong company before storage access",async()=>{companyValid=false;await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow("PREVIEW_JOB_CLAIM_LOST");expect(mocks.read).not.toHaveBeenCalled()});
 it("rejects legacy or absent initiator before storage access",async()=>{job.metadata_json="{}";await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow("PREVIEW_JOB_CLAIM_LOST");expect(mocks.read).not.toHaveBeenCalled()});
 it("does not let user A's device read user B's claimed source",async()=>{
  const otherOwner={...input,ownerPrincipalId:"principal-two"};
  await expect(readClaimedPreviewSourceAsync(client,otherOwner)).rejects.toThrow("PREVIEW_JOB_CLAIM_LOST");
  expect(mocks.read).not.toHaveBeenCalled();
 });
 it("rejects stale source hash before storage access",async()=>{source.content_hash="a".repeat(64);await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow("PREVIEW_JOB_CLAIM_LOST");expect(mocks.read).not.toHaveBeenCalled()});
 it("rejects substituted bytes",async()=>{mocks.read.mockResolvedValue(Buffer.from("wrong"));await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow()});
 it("does not deliver after the holder changes during file I/O",async()=>{mocks.read.mockImplementationOnce(async()=>{holderValid=false;return bytes});await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow("PREVIEW_JOB_CLAIM_LOST")});
 it("uses a new observation after storage and rejects a replaced pointer",async()=>{
  mocks.read.mockImplementationOnce(async()=>{source={...source,storage_key:"replacement/key"};return bytes});
  await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow("PREVIEW_JOB_CLAIM_LOST");
  expect(client.transaction).toHaveBeenCalledTimes(2);
 });
 it("rejects a same-actor newer generation after storage",async()=>{
  mocks.read.mockImplementationOnce(async()=>{job={...job,attempt_count:2};return bytes});
  await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow("PREVIEW_JOB_CLAIM_LOST");
 });

 it("rechecks current authority after file I/O and withholds revoked bytes",async()=>{
  mocks.authority.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new PrincipalJobAuthorityError("PRINCIPAL_JOB_RESOURCE_VIEW_DENIED",403));
  await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow("PREVIEW_JOB_CLAIM_LOST");
  expect(mocks.authority).toHaveBeenCalledTimes(2);
 });
 it("keeps an unavailable authority distinct from denied permission",async()=>{
  mocks.authority.mockRejectedValueOnce(new PrincipalJobAuthorityError("PRINCIPAL_JOB_AUTHORITY_UNAVAILABLE",503));
  await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toMatchObject({status:503});
  expect(mocks.read).not.toHaveBeenCalled();
 });
});
