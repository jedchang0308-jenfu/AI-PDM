import { authenticateWindowsServiceDevice, windowsServiceDeviceErrorResponse } from "./windows-service-device-auth";
import { assemblyJobContent, claimAssemblyAnalysis, finishAssembly, pulseAssembly, readAssemblyLease } from "./assembly-analysis-jobs";

const headers = {"cache-control":"private, no-store"};
async function limitedJson(request:Request, limit:number) {
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error(),{status:400});
  const chunks:Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > limit) { await reader.cancel(); throw Object.assign(new Error(),{status:413}); }
      chunks.push(part.value);
    }
    try {return JSON.parse(Buffer.concat(chunks).toString("utf8"));} catch {throw Object.assign(new Error(),{status:400});}
  } finally { reader.releaseLock(); }
}
export async function assemblyJobRequest(request:Request, operation:"claim"|"content"|"heartbeat"|"complete", jobId?:string) {
  const auth = await authenticateWindowsServiceDevice(request);
  if ("response" in auth) return auth.response;
  try {
    if (operation === "claim") {
      const body = await limitedJson(request,4096);
      if (body?.protocolVersion !== 1 || body.workerId !== auth.actor.id ||
          typeof body.parserVersion !== "string" || !/^[a-zA-Z0-9._-]{1,120}$/u.test(body.parserVersion))
        return Response.json({error:"ASSEMBLY_PROTOCOL_REQUIRED"},{status:400,headers});
      return Response.json({job:await claimAssemblyAnalysis(auth.actor,body.parserVersion)},{headers});
    }
    if (!jobId || !/^[a-zA-Z0-9-]{1,128}$/u.test(jobId)) return Response.json({error:"ASSEMBLY_JOB_NOT_FOUND"},{status:404,headers});
    const lease = readAssemblyLease(request);
    if (operation === "content") return await assemblyJobContent(auth.actor,jobId,lease);
    if (operation === "heartbeat") return Response.json(await pulseAssembly(auth.actor,jobId,lease),{headers});
    const body = await limitedJson(request,8 * 1024 * 1024);
    return Response.json(await finishAssembly(auth.actor,jobId,lease,body),{headers});
  } catch (error) {return windowsServiceDeviceErrorResponse(error);}
}
