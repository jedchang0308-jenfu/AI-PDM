import crypto from "node:crypto";
import { Compute } from "google-auth-library";
import type { FileStorageService, PutObjectInput, StoredObject, StorageObjectMetadata, DownloadUrl, CreateDownloadUrlInput } from "@/lib/file-storage";

type Config = {projectId:string;bucket:string;generation?:string|null};
type ObjectMetadata = {name:string;bucket:string;size:string;generation:string;metageneration?:string;metadata?:{sha256?:string}};
export type GcsTransport = {request:typeof fetch;accessToken:()=>Promise<string>};
const credentials = new Compute({scopes:["https://www.googleapis.com/auth/devstorage.read_write"]});
const defaultTransport: GcsTransport = {request:(...args)=>fetch(...args),accessToken:async()=> {
  // Compute uses only the attached workload's metadata server, not local ADC/key files.
  if (!process.env.K_SERVICE || process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("GCS_WORKLOAD_IDENTITY_REQUIRED");
  const result=await credentials.getAccessToken();
  if (!result.token) throw new Error("GCS_WORKLOAD_TOKEN_UNAVAILABLE");
  return result.token;
}};
function keyOf(key:string) {
  if (!key || key.startsWith("/") || /[\\\u0000-\u001f\u007f]/u.test(key) || key.split("/").some(p=>!p||p==="."||p==="..")) throw new Error("GCS_OBJECT_KEY_INVALID");
  return key;
}
const hash=(bytes:Buffer)=>crypto.createHash("sha256").update(bytes).digest("hex");

/** Private immutable blobs; human authorization remains in the Principal API.
 * Creation is ifGenerationMatch=0. Replays verify bytes, never overwrite or delete.
 * Exact generations flow through the existing durable pointer fields/URI.
 */
export class GoogleCloudFileStorageAdapter implements FileStorageService {
  readonly provider="google_cloud_storage" as const;
  constructor(private readonly config:Config,private readonly transport:GcsTransport=defaultTransport) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/u.test(config.projectId) || !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/u.test(config.bucket)) throw new Error("GCS_TARGET_INVALID");
    if (config.generation!=null && !/^[1-9][0-9]*$/u.test(config.generation)) throw new Error("GCS_GENERATION_INVALID");
  }
  private pointer(key:string,generation:string) {
    return `gcs://${this.config.bucket}/${key.split("/").map(encodeURIComponent).join("/")}?generation=${generation}`;
  }
  private async request(url:string,init:RequestInit={}) {
    const token=await this.transport.accessToken();
    return this.transport.request(url,{...init,headers:{...init.headers,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000)});
  }
  private url(key:string) {
    return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.config.bucket)}/o/${encodeURIComponent(keyOf(key))}`;
  }
  private async metadata(key:string,generation=this.config.generation):Promise<ObjectMetadata|null> {
    const query=new URLSearchParams({fields:"name,bucket,size,generation,metageneration,metadata"});
    if (generation) query.set("generation",generation);
    const response=await this.request(`${this.url(key)}?${query}`);
    if (response.status===404) return null;
    if (!response.ok) throw new Error(`GCS_METADATA_READ_FAILED:${response.status}`);
    const value=await response.json() as ObjectMetadata;
    if (value.name!==key || value.bucket!==this.config.bucket || !/^[1-9][0-9]*$/u.test(value.generation??"") || !/^[0-9]+$/u.test(value.size??"") || !Number.isSafeInteger(Number(value.size)) || (generation && generation!==value.generation)) throw new Error("GCS_OBJECT_READBACK_MISMATCH");
    return value;
  }
  private async bytes(key:string,metadata:ObjectMetadata) {
    const response=await this.request(`${this.url(key)}?alt=media&generation=${metadata.generation}`);
    if (!response.ok) throw new Error(`GCS_OBJECT_READ_FAILED:${response.status}`);
    const bytes=Buffer.from(await response.arrayBuffer());
    if (bytes.length!==Number(metadata.size) || (metadata.metadata?.sha256 && hash(bytes)!==metadata.metadata.sha256)) throw new Error("GCS_OBJECT_CONTENT_MISMATCH");
    return bytes;
  }
  private stored(key:string,bytes:Buffer,metadata:ObjectMetadata):StoredObject {
    return {provider:this.provider,bucket:this.config.bucket,key,localPath:this.pointer(key,metadata.generation),bytes:bytes.length,sha256:hash(bytes),generation:metadata.generation,metageneration:metadata.metageneration};
  }
  async putObject(input:PutObjectInput):Promise<StoredObject> {
    const key=keyOf(input.key);
    const digest=hash(input.bytes);
    const before=await this.metadata(key,null);
    if (before) {
      if (hash(await this.bytes(key,before))!==digest) throw new Error("GCS_IMMUTABLE_OBJECT_CONFLICT");
      return this.stored(key,input.bytes,before);
    }
    const boundary="pdm-"+crypto.randomUUID();
    const metadata={name:key,contentType:input.contentType??"application/octet-stream",cacheControl:"private,no-store",metadata:{sha256:digest}};
    const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${metadata.contentType}\r\n\r\n`),input.bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const query=new URLSearchParams({uploadType:"multipart",name:key,ifGenerationMatch:"0"});
    const response=await this.request(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.config.bucket)}/o?${query}`,{method:"POST",headers:{"Content-Type":`multipart/related; boundary=${boundary}`},body:new Uint8Array(body)});
    if (!response.ok && response.status!==412) throw new Error(`GCS_OBJECT_CREATE_FAILED:${response.status}`);
    // 412 means another attempt created this immutable key. Read back instead
    // of overwriting; an unknown write outcome is recovered by the same replay.
    const after=await this.metadata(key,null);
    if (!after || hash(await this.bytes(key,after))!==digest) throw new Error("GCS_IMMUTABLE_OBJECT_CONFLICT");
    return this.stored(key,input.bytes,after);
  }
  async getObjectMetadata(key:string):Promise<StorageObjectMetadata|null> {
    const value=await this.metadata(key);
    return value?{provider:this.provider,bucket:this.config.bucket,key,localPath:this.pointer(key,value.generation),bytes:Number(value.size),generation:value.generation,metageneration:value.metageneration}:null;
  }
  async readObject(key:string) {
    const value=await this.metadata(key);
    if (!value) throw new Error("GCS_OBJECT_NOT_FOUND");
    return this.bytes(key,value);
  }
  async verifyObjectHash(key:string,expected:string) {
    return hash(await this.readObject(key))===expected.toLowerCase();
  }
  async createDownloadUrl(input:CreateDownloadUrlInput):Promise<DownloadUrl> {
    keyOf(input.key);
    return {provider:this.provider,bucket:this.config.bucket,key:input.key,mode:"server_stream",url:null,
      expiresInSeconds:0,expiresAt:null,auditRequired:true,authorizationHeaderRequired:true};
  }
  async deleteObject():Promise<void> { throw new Error("GCS_RUNTIME_DELETE_FORBIDDEN"); }
}
