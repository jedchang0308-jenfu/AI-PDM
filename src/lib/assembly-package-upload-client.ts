import { invalidatePdmPermissions, pdmPermissionFetch } from "./pdm-permission-client";

export type AssemblyUpload = {packageId:string;fileName:string;status:string;nextOffset:number;chunkBytes:number};
type Options = { signal?:AbortSignal; onProgress?:(bytes:number)=>void; fetcher?:typeof fetch; idempotencyKey?:string };
export class AssemblyHttpError extends Error {
  constructor(message:string, readonly status:number) { super(message); }
}
export async function assemblyRequest<T>(url:string, init:RequestInit = {}, fetcher:typeof fetch = pdmPermissionFetch):Promise<T> {
  const res = await fetcher(url,{cache:"no-store",...init});
  const body = await res.json().catch(()=>null);
  if (!res.ok) throw new AssemblyHttpError(body?.error?.message || (typeof body?.error === "string" ? body.error : "組立包處理失敗"),res.status);
  return body as T;
}
function recoverable(error: unknown) {
  return error instanceof TypeError || error instanceof AssemblyHttpError && (error.status===409 || error.status===429 || error.status>=500);
}
const wait = (attempt:number) => new Promise(resolve=>setTimeout(resolve,Math.min(5000,250*2**attempt)));
export async function uploadAssemblyPackage(base:string,file:File,activePackageId:string|null,options:Options={}) {
  const {signal,onProgress,fetcher} = options;
  const request = <T>(url:string, init:RequestInit={})=>assemblyRequest<T>(url,{...init,signal},fetcher);
  // A chunk only advances the durable byte offset. Refresh permissions on a
  // denial, and let finalize invalidate the workspace after the ZIP is accepted.
  const transfer:typeof fetch = fetcher ?? (async(input,init)=>{
    const response=await fetch(input,init);
    if (response.status===401) invalidatePdmPermissions("unauthenticated");
    if (response.status===403) invalidatePdmPermissions("forbidden");
    return response;
  });
  const key = options.idempotencyKey ?? crypto.randomUUID();
  const start = {method:"POST",headers:{"content-type":"application/json","idempotency-key":key},
    body:JSON.stringify({fileName:file.name,byteSize:file.size,activePackageId})};
  let session:AssemblyUpload;
  for (let attempt=0;;attempt++) {
    try { session=(await request<{data:AssemblyUpload}>(base,start)).data;break; }
    catch (error) { if (signal?.aborted || attempt>=2 || !recoverable(error)) throw error; await wait(attempt); }
  }
  const url = base+"/"+encodeURIComponent(session.packageId);
  const get = async()=> (await request<{data:AssemblyUpload}>(url)).data;
  if (!Number.isSafeInteger(session.chunkBytes) || session.chunkBytes<=0) throw new Error("組立包分段大小無效");
  let offset=session.nextOffset;
  let retries=0;
  while (offset<file.size) {
    const end=Math.min(offset+session.chunkBytes,file.size);
    let next:number;
    try {
      const res=await assemblyRequest<{nextOffset:number}>(url+"/content",{method:"PUT",signal,
        headers:{"content-range":`bytes ${offset}-${end-1}/${file.size}`,"content-type":"application/octet-stream"},body:file.slice(offset,end)},transfer);
      next=res.nextOffset;
    } catch (error) {
      if (signal?.aborted || retries>=3 || !recoverable(error)) throw error;
      await wait(retries);
      next=(await get()).nextOffset;
    }
    if (!Number.isSafeInteger(next) || next<offset || next>end) throw new Error("組立包續傳位置無效");
    retries=next===offset ? retries+1 : 0;
    if (retries>3) throw new Error("傳輸中斷，請重試");
    offset=next;
    onProgress?.(offset);
  }
  for (let attempt=0;;attempt++) {
    try { await request(url+"/finalize",{method:"POST"}); break; }
    catch (error) {
      if (signal?.aborted || !recoverable(error)) throw error;
      const readback = await get();
      if (["complete","queued","running","needs_input","blocked"].includes(readback.status)) break;
      if (readback.status!=="uploading" || attempt>=3) throw error;
      await wait(attempt);
    }
  }
  return session.packageId;
}
