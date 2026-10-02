import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
const mocks = vi.hoisted(()=>({read:vi.fn()}));
vi.mock("@/lib/file-storage", async original=>({...await original<typeof import("@/lib/file-storage")>(),
  createFileStorageServiceForPointer:()=>({readObject:mocks.read})}));
import { readClaimedPreviewSourceAsync } from "@/lib/preview-derivatives";
const bytes = Buffer.from("preview-source");
const digest = createHash("sha256").update(bytes).digest("hex");
let job: Record<string,unknown>; let source: Record<string,unknown>; let companyValid:boolean; let holderValid:boolean;
const queryOne = vi.fn(async (sql:string)=> {
  if(sql.includes("SELECT * FROM preview_jobs")) return job;
  if(sql.includes("SELECT fa.id")) return companyValid?{id:"asset-one"}:null;
  if(sql.includes("SELECT * FROM file_assets")) return source;
  return holderValid?{id:"job-one"}:null;
});
const client = {queryOne,transaction:vi.fn(async (run:(tx:unknown)=>Promise<unknown>)=>run({queryOne}))} as unknown as AsyncDatabaseClient;
beforeEach(()=>{vi.clearAllMocks(); companyValid=true;holderValid=true;
 job={id:"job-one",status:"running",locked_by:"worker-one",company_id:"company-one",source_file_asset_id:"asset-one",source_content_hash:digest,
 metadata_json:JSON.stringify({initiator:{kind:"verified_principal",principalId:"principal-one"}})};
 source={id:"asset-one",file_name:"drawing.slddrw",file_size:bytes.length,content_hash:digest,storage_provider:"local_repository",storage_key:"source/one"};
 mocks.read.mockResolvedValue(bytes);
});
const input={jobId:"job-one",workerId:"worker-one"};
describe("claimed preview source boundary",()=> {
 it("delivers verified bytes with original Principal through a read-only snapshot",async()=>{
  expect(await readClaimedPreviewSourceAsync(client,input)).toMatchObject({bytes,contentHash:digest,principalId:"principal-one"});
  expect(client.transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:"repeatable_read",readOnly:true});
 });
 it("rejects a different holder before storage access",async()=>{job.locked_by="other";await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow("FORBIDDEN");expect(mocks.read).not.toHaveBeenCalled()});
 it("rejects wrong company before storage access",async()=>{companyValid=false;await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow("FORBIDDEN");expect(mocks.read).not.toHaveBeenCalled()});
 it("rejects legacy or absent initiator before storage access",async()=>{job.metadata_json="{}";await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow("FORBIDDEN");expect(mocks.read).not.toHaveBeenCalled()});
 it("rejects stale source hash before storage access",async()=>{source.content_hash="a".repeat(64);await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow("FORBIDDEN");expect(mocks.read).not.toHaveBeenCalled()});
 it("rejects substituted bytes",async()=>{mocks.read.mockResolvedValue(Buffer.from("wrong"));await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow()});
 it("does not deliver after the holder changes during file I/O",async()=>{holderValid=false;await expect(readClaimedPreviewSourceAsync(client,input)).rejects.toThrow("FORBIDDEN")});
});
