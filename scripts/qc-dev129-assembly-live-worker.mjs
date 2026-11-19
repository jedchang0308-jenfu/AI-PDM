import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";

const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
/** Uses the installed worker loop and real native executable. Only fixture
 * admission, empty unrelated queues and the in-memory key broker are adapters.
 * Package/lease/content/completion requests go through the actual route handlers. */
export async function verifyAssemblyLiveWorker({archivePath,extractorPath,dispatch,readDocumentManagerKey,validateKeyLease,
  onDeviceCredential,outputDirectory,timeoutMs=240000}) {
  const root=process.cwd(),temporaryBase=path.join(root,".tmp");
  await fs.mkdir(temporaryBase,{recursive:true});
  const temporary=await fs.mkdtemp(path.join(temporaryBase,"dev129-live-worker-"));
  const previousFetch=globalThis.fetch,previousProgramData=process.env.ProgramData;
  const workerId="test-device:instance",token=randomBytes(32).toString("base64url");
  const origin="https://dev129-task-owned.invalid";
  const calls=[],logs=[];let stopped=false,completion=null,keyMaterial=null,workerFailure=null;
  let workerPromise;
  try {
    const bytes=await fs.readFile(archivePath),archiveSha256=digest(bytes);
    const service=path.join(temporary,"install","service"),extractors=path.join(temporary,"install","extractors");
    await fs.mkdir(service,{recursive:true});await fs.mkdir(extractors,{recursive:true});
    for(const name of ["worker.mjs","metadata-mapper.mjs","assembly-analysis.mjs"])await fs.copyFile(path.join(root,"windows-service/service",name),path.join(service,name));
    await fs.copyFile(path.join(root,"config/solidworks-metadata-field-aliases.json"),path.join(service,"solidworks-metadata-field-aliases.json"));
    const executedExtractor=path.join(extractors,"AipdmAssemblyAnalyzer.exe");
    await fs.copyFile(extractorPath,executedExtractor);
    const nativeExecutableSha256=digest(await fs.readFile(executedExtractor));
    process.env.ProgramData=path.join(temporary,"program-data");
    onDeviceCredential(token,workerId);
    globalThis.fetch=async(address,init={})=>{
      const request=address instanceof Request?address:new Request(address,init);
      const url=new URL(request.url);
      assert.equal(url.origin,origin,"worker attempted a non-fixture endpoint");
      assert.equal(request.headers.get("authorization"),`Bearer ${token}`);
      assert.equal(request.headers.get("x-pdm-worker-id"),workerId);
      if(request.signal.aborted)throw new DOMException("Aborted","AbortError");
      let response;
      if(url.pathname==="/api/settings-secret-probe-jobs/claim" || url.pathname==="/api/recognition-jobs/claim")response=new Response(null,{status:204});
      else if(url.pathname==="/api/preview-jobs/claim")response=Response.json({job:null});
      else if(url.pathname==="/api/preview-workers/solidworks-document-manager-key") {
        if(url.searchParams.get("readiness")==="1")response=Response.json({available:true});
        else {
          assert.equal(url.searchParams.get("kind"),"assembly_analysis");
          await validateKeyLease(request,url.searchParams.get("jobId"));
          try {keyMaterial=await readDocumentManagerKey();}
          catch {throw Object.assign(new Error("DEV129_AUTHORIZED_KEY_READ_UNAVAILABLE"),{status:403});}
          assert.ok(typeof keyMaterial==="string" && keyMaterial.length>0 && keyMaterial.length<16384,"authorized key reader returned no key");
          response=Response.json({key:keyMaterial,version:"task-owned-memory-only"});
        }
      } else if(["/api/preview-workers/heartbeat","/api/recognition-workers/heartbeat"].includes(url.pathname))response=Response.json({ok:true});
      else {
        const submitted=request.method==="POST" && url.pathname.endsWith("/complete")?await request.clone().json():null;
        response=await dispatch(request);
        if(submitted) {
          const json=JSON.stringify(submitted);assert.ok(!keyMaterial || !json.includes(keyMaterial),"native result included credential material");
          if(outputDirectory) {await fs.mkdir(outputDirectory,{recursive:true});await fs.writeFile(path.join(outputDirectory,"native-result-attempt.json"),JSON.stringify(submitted,null,2)+"\n",{flag:"wx"}).catch(error=>{if(error.code!=="EEXIST")throw error;});}
          if(response.ok)completion=submitted;
          stopped=true;
        }
      }
      calls.push({method:request.method,path:url.pathname,status:response.status});
      return response;
    };
    const {runWindowsWorker}=await import(pathToFileURL(path.join(service,"worker.mjs")).href);
    const deadline=Date.now()+timeoutMs;
    workerPromise=runWindowsWorker({credentials:{baseUrl:origin,token},workerId,isStopping:()=>stopped||Date.now()>deadline,
      log:(event,facts)=>{const reason=String(facts?.reason??"");logs.push({event,reason:(keyMaterial&&reason.includes(keyMaterial)?"CREDENTIAL_ERROR_REDACTED":reason).replace(/[^a-zA-Z0-9_.:-]/gu,"_").slice(0,180)});},
      sleep:async ms=>{if(Date.now()>deadline)stopped=true;await new Promise(resolve=>setTimeout(resolve,Math.min(ms,100)));}}).catch(error=>{workerFailure=error;});
    await workerPromise;
    if(workerFailure)throw workerFailure;
    assert.ok(completion,`worker did not deliver a result (${logs.map(value=>value.reason).join(",")})`);
    assert.ok(calls.some(call=>call.path==="/api/assembly-analysis-jobs/claim" && call.status===200));
    assert.ok(calls.some(call=>call.path.endsWith("/content") && call.status===200));
    assert.ok(calls.some(call=>call.path.endsWith("/complete") && call.status===200));
    if(outputDirectory) {
      await fs.mkdir(outputDirectory,{recursive:true});
      await fs.writeFile(path.join(outputDirectory,"native-result.json"),JSON.stringify(completion,null,2)+"\n",{flag:"wx"});
      await fs.writeFile(path.join(outputDirectory,"worker-requests.json"),JSON.stringify(calls,null,2)+"\n",{flag:"wx"});
    }
    return {archiveSha256,archiveBytes:bytes.length,result:completion,calls,logs,
      nativeExecutableSha256,layer:"real installed-worker loop/native/actual route dispatch; fixture Principal and device admission; in-memory key broker"};
  } finally {
    stopped=true;if(workerPromise)await workerPromise;
    globalThis.fetch=previousFetch;
    if(previousProgramData===undefined)delete process.env.ProgramData;else process.env.ProgramData=previousProgramData;
    keyMaterial=null;
    if(path.dirname(temporary)!==temporaryBase || !path.basename(temporary).startsWith("dev129-live-worker-"))throw new Error("LIVE_WORKER_CLEANUP_SCOPE_INVALID");
    await fs.rm(temporary,{recursive:true,force:true});
  }
}
