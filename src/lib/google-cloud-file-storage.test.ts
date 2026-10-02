import crypto from "node:crypto";
import {describe,it,expect,vi} from "vitest";
import {GoogleCloudFileStorageAdapter,type GcsTransport} from "@/lib/google-cloud-file-storage";
import {storagePointerFromStoredObject,storagePointerFromRecord,createConfiguredFileStorageService,createFileStorageServiceForPointer} from "@/lib/file-storage";
const config={projectId:"jenfu-platform-prod",bucket:"jenfu-platform-prod-aipdm-files"};
const bytes=Buffer.from("synthetic immutable Principal file");
const digest=crypto.createHash("sha256").update(bytes).digest("hex");
const key="master-attachments/company-one/part-one/upload-one/file.txt";
function fixture(options:{race?:boolean;unknownOutcome?:boolean;corrupt?:boolean;wrongBucket?:boolean}={}) {
  const objects=new Map<string,{bytes:Buffer;generation:string}>();
  let creates=0;
  const request=vi.fn(async (target: string|URL|Request,init?:RequestInit) => {
    const url=new URL(target instanceof Request?target.url:String(target));
    expect(url.origin).toBe("https://storage.googleapis.com");
    if (init?.method==="POST") {
      creates++;
      expect(url.searchParams.get("ifGenerationMatch")).toBe("0");
      const body=Buffer.from(await new Response(init.body).arrayBuffer()).toString();
      expect(body).toContain('"sha256":"'+digest+'"');
      expect(body).toContain(bytes.toString());
      objects.set(url.searchParams.get("name")!,{bytes,generation:"10"});
      if (options.unknownOutcome) throw new Error("SIMULATED_UNKNOWN_WRITE_OUTCOME");
      return new Response("{}",{status:options.race?412:200});
    }
    const objectKey=decodeURIComponent(url.pathname.split("/o/")[1]);
    const row=objects.get(objectKey);
    const generation=url.searchParams.get("generation");
    if (!row || (generation && generation!==row.generation)) return new Response("{}",{status:404});
    if (url.searchParams.get("alt")==="media") return new Response(new Uint8Array(options.corrupt?Buffer.from("corrupt"):row.bytes));
    return Response.json({name:objectKey,bucket:options.wrongBucket?"sibling-private-bucket":config.bucket,
      size:String(row.bytes.length),generation:row.generation,metageneration:"1",metadata:{sha256:digest}});
  });
  const transport={request:request as typeof fetch,accessToken:async()=>"synthetic-test-token"} satisfies GcsTransport;
  return {objects,request,transport,creates:()=>creates,adapter:new GoogleCloudFileStorageAdapter(config,transport)};
}
describe("private immutable GCS storage",()=> {
  it("creates once, verifies content and replays with a pinned generation",async()=> {
    const f=fixture();
    const first=await f.adapter.putObject({key,bytes,contentType:"text/plain"});
    const replay=await f.adapter.putObject({key,bytes});
    expect(replay).toEqual(first);expect(f.creates()).toBe(1);
    expect(first).toMatchObject({generation:"10",bucket:config.bucket,sha256:digest});
    const pointer=storagePointerFromStoredObject(first);
    expect(pointer).toMatchObject({generation:"10",key});
    expect(storagePointerFromRecord({storage_provider:"google_cloud_storage",storage_key:key,original_path:first.localPath})).toMatchObject({generation:"10",bucket:config.bucket,key});
    expect(await f.adapter.readObject(key)).toEqual(bytes);
    const media=f.request.mock.calls.filter(([url])=>String(url).includes("alt=media"));
    expect(media.every(([url])=>new URL(String(url)).searchParams.get("generation")==="10")).toBe(true);
  });
  it("never overwrites an existing immutable key with different bytes",async()=> {
    const f=fixture();f.objects.set(key,{bytes,generation:"10"});
    await expect(f.adapter.putObject({key,bytes:Buffer.from("replacement")})).rejects.toThrow("GCS_IMMUTABLE_OBJECT_CONFLICT");
    expect(f.creates()).toBe(0);
  });
  it("recovers a concurrent 412 by exact content readback",async()=> {
    const f=fixture({race:true});
    expect(await f.adapter.putObject({key,bytes})).toMatchObject({generation:"10",sha256:digest});
    expect(f.creates()).toBe(1);
  });
  it("does not blindly retry an unknown upload outcome; the next command reads it back",async()=> {
    const f=fixture({unknownOutcome:true});
    await expect(f.adapter.putObject({key,bytes})).rejects.toThrow("SIMULATED_UNKNOWN_WRITE_OUTCOME");
    expect(await f.adapter.putObject({key,bytes})).toMatchObject({generation:"10",sha256:digest});
    expect(f.creates()).toBe(1);
  });
  it("never reads a newer generation as fallback for a missing pinned object",async()=> {
    const f=fixture();f.objects.set(key,{bytes,generation:"11"});
    const pinned=new GoogleCloudFileStorageAdapter({...config,generation:"10"},f.transport);
    await expect(pinned.readObject(key)).rejects.toThrow("GCS_OBJECT_NOT_FOUND");
    expect(f.request.mock.calls.every(([url])=>!String(url).includes("alt=media"))).toBe(true);
  });
  it("rejects provider bucket or content mismatches",async()=> {
    const wrong=fixture({wrongBucket:true});wrong.objects.set(key,{bytes,generation:"10"});
    await expect(wrong.adapter.readObject(key)).rejects.toThrow("GCS_OBJECT_READBACK_MISMATCH");
    const corrupt=fixture({corrupt:true});corrupt.objects.set(key,{bytes,generation:"10"});
    await expect(corrupt.adapter.readObject(key)).rejects.toThrow("GCS_OBJECT_CONTENT_MISMATCH");
  });
  it("does not expose a signed URL or permit runtime deletion",async()=> {
    const f=fixture();
    expect(await f.adapter.createDownloadUrl({key})).toMatchObject({mode:"server_stream",url:null,auditRequired:true});
    await expect(f.adapter.deleteObject()).rejects.toThrow("GCS_RUNTIME_DELETE_FORBIDDEN");
    expect(f.request).not.toHaveBeenCalled();
  });
  it("rejects path traversal before obtaining a token or making a request",async()=> {
    const f=fixture();
    for(const invalid of ["../secret","x/../secret","x/..","/secret","x\\secret","x/./secret"]) {
      await expect(f.adapter.putObject({key:invalid,bytes})).rejects.toThrow("GCS_OBJECT_KEY_INVALID");
    }
    expect(f.request).not.toHaveBeenCalled();
  });
  it("keeps live storage closed without workload identity and rejects sibling or unpinned pointers",()=> {
    const env={NODE_ENV:"test" as const,PDM_STORAGE_PROVIDER:"google_cloud_storage",PDM_GCS_PROJECT_ID:config.projectId,PDM_GCS_BUCKET:config.bucket,PDM_GCS_LIVE_ENABLED:"1"};
    expect(()=>createConfiguredFileStorageService(env)).toThrow("GCS_WORKLOAD_IDENTITY_REQUIRED");
    expect(()=>createConfiguredFileStorageService({...env,K_SERVICE:"ai-pdm-prod",GOOGLE_APPLICATION_CREDENTIALS:"forbidden-key.json"})).toThrow("key files are forbidden");
    expect(()=>createFileStorageServiceForPointer({provider:"google_cloud_storage",bucket:"sibling-private-bucket",generation:"10"},{...env,K_SERVICE:"ai-pdm-prod"})).toThrow("GCS_POINTER_OWNER_MISMATCH");
    expect(()=>createFileStorageServiceForPointer({provider:"google_cloud_storage",bucket:config.bucket},{...env,K_SERVICE:"ai-pdm-prod"})).toThrow("GCS_PINNED_GENERATION_REQUIRED");
    expect(()=>storagePointerFromRecord({storage_provider:"google_cloud_storage",storage_key:key,storage_generation:"20",original_path:`gcs://${config.bucket}/${key}?generation=10`})).toThrow("GCS_POINTER_READBACK_MISMATCH");
  });
});
