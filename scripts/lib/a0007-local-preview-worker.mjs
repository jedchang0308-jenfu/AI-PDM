import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export async function configureAndVerifyLocalWorker({page,origin,out}) {
  if(origin!=='http://localhost:1020')throw new Error('LOCAL_TARGET_REQUIRED');
  const post=async(endpoint,data,headers={})=>{
    const r=await page.request.post(origin+endpoint,{data,headers:{origin,'idempotency-key':crypto.randomUUID(),...headers},timeout:120000});
    const b=await r.json().catch(()=>({}));
    if(!r.ok())throw new Error(`${endpoint}:${r.status()}:${b.error?.code??b.error??'failed'}`);
    return b;
  };
  console.log('stage: link task-owned local parser');
  const code=crypto.randomBytes(32).toString('base64url'),token=crypto.randomBytes(32).toString('base64url');
  const deviceId=crypto.randomUUID(),instanceId=crypto.randomUUID(),version='a0007-local-verification';
  await fs.writeFile(path.join(out,'task-device.json'),JSON.stringify({deviceId,instanceId,origin}));
  const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
  const enrollment=await post('/api/settings/windows-service/enrollments',{requestId:crypto.randomUUID(),codeHash:hash(code)});
  await post('/api/windows-service/enroll',{enrollmentId:enrollment.id,code,deviceId,credentialHash:hash(token),name:'A0007 local preview verification',serviceVersion:version,protocolVersion:1});
  const headers={authorization:`Bearer ${token}`};
  const self=await page.request.get(origin+'/api/windows-service/self',{headers,timeout:120000});
  const own=await self.json();
  await post('/api/windows-service/start',{instanceId,expectedRowVersion:own.rowVersion,serviceVersion:version,protocolVersion:1},headers);
  const workerId=`${deviceId}:${instanceId}`;
  const temp=await fs.mkdtemp(path.resolve('.tmp/a0007-worker-'));
  let stopping=false,pulse;
  const originalFetch=globalThis.fetch;
  try {
    if(!process.argv.includes('--resume-native')) {
      process.env.PDM_WINDOWS_DPAPI_SECRET_DIR='C:/Users/user/AppData/Local/AI-PDM/secret-store';
      const {readWindowsDpapiSecret}=await import(pathToFileURL(path.resolve('src/lib/windows-dpapi-secret-provider.ts')).href);
      let key=await readWindowsDpapiSecret('solidworks_document_manager-a2ab3ec5-ecb5-4c3b-ba45-33434c595e06.dpapi');
      const probe=spawnSync('C:/Program Files/AI-PDM Windows Service/extractors/SolidWorksDocumentManagerCredentialProbe.exe',[],{windowsHide:true,encoding:'utf8',env:{...process.env,PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY:key},timeout:30000});
      if(probe.status!==0)throw new Error('EXISTING_LOCAL_KEY_NATIVE_PROBE_FAILED');
      console.log('stage: configure local protected key');
      await post('/api/settings/secrets/solidworks_document_manager/draft',{secretValue:key,autoActivate:true});
      key=null;
    }
    console.log('stage: verify task parser offline (35 seconds, production service untouched)');
    await new Promise(resolve=>setTimeout(resolve,35000));
    const deviceResponse=await page.request.get(origin+'/api/settings/windows-service/devices',{timeout:120000});
    const devices=await deviceResponse.json();
    const offline=devices.devices?.find(item=>item.id===deviceId);
    if(offline?.connection!=='offline')throw new Error('TASK_DEVICE_OFFLINE_NOT_OBSERVED');
    await fs.writeFile(path.join(out,'offline-readback.json'),JSON.stringify({deviceId,connection:offline.connection,lastSeenAt:offline.lastSeenAt}));
    await fs.mkdir(path.join(temp,'service'),{recursive:true});
    await fs.cp('C:/Program Files/AI-PDM Windows Service/extractors',path.join(temp,'extractors'),{recursive:true});
    for(const name of ['worker.mjs','metadata-mapper.mjs','assembly-analysis.mjs'])await fs.copyFile(path.resolve('windows-service/service',name),path.join(temp,'service',name));
    await fs.copyFile('config/solidworks-metadata-field-aliases.json',path.join(temp,'service/solidworks-metadata-field-aliases.json'));
    process.env.ProgramData=path.join(temp,'program-data');
    const heartbeat=()=>post('/api/windows-service/heartbeat',{instanceId},{...headers,'x-pdm-worker-id':workerId});
    await heartbeat();pulse=setInterval(()=>void heartbeat().catch(()=>{stopping=true;}),10000);
    const {runWindowsWorker}=await import(pathToFileURL(path.join(temp,'service/worker.mjs')).href);
    const completed=new Set();
    const targetJobs=new Set(['d8e63d60-124b-400c-b6a9-d01df9491f76','5db3bc17-69f2-49d9-ba11-4afe2e846328']);
    globalThis.fetch=async(...args)=>{
      const response=await originalFetch(...args);
      const url=new URL(args[0] instanceof Request?args[0].url:String(args[0]));
      const job=url.pathname.match(/^\/api\/preview-jobs\/([^/]+)\/complete$/u)?.[1];
      if(url.origin===origin&&job&&targetJobs.has(job)&&response.ok) {
        completed.add(job);
        if(completed.size===targetJobs.size)stopping=true;
      }
      return response;
    };
    const end=Date.now()+(process.argv.includes('--resume-native')?480000:240000);
    console.log('stage: native parser running with bounded deadline');
    await runWindowsWorker({credentials:{baseUrl:origin,token},workerId,isStopping:()=>stopping||Date.now()>end,
      log:(event,facts)=>console.log(JSON.stringify({event,reason:facts.reason})),sleep:ms=>new Promise(resolve=>setTimeout(resolve,Math.min(ms,1000)))});
    const detail=await page.request.get(origin+'/api/numbering/drawings/workbench/cw_d431bb9e-35d0-4232-a278-6fe1f46cef89?sections=primary',{timeout:120000});
    const projection=(await detail.json()).data?.presentation;
    await fs.writeFile(path.join(out,'after-worker.json'),JSON.stringify(projection,null,2));
    const model=projection?.previews?.find(slot=>slot.kind==='three-d');
    if(model?.state!=='ready')throw new Error('A0007_3D_NOT_READY');
    const targets=[{kind:'3D PNG',href:model.mediaHref}];
    const drawing=projection.files?.find(file=>/\.slddrw$/iu.test(file.name));
    if(!drawing)throw new Error('A0007_2D_SOURCE_MISSING');
    targets.push({kind:'2D PNG',href:drawing.downloadHref+'&preview=1'});
    const reads=[];
    for(const target of targets) {
      const media=await page.request.get(origin+target.href,{timeout:120000}),bytes=await media.body();
      const valid=media.ok()&&media.headers()['content-type']==='image/png'&&bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a';
      reads.push({kind:target.kind,status:media.status(),bytes:bytes.length,valid});
      if(!valid)throw new Error('NATIVE_PNG_READ_FAILED:'+target.kind);
    }
    await fs.writeFile(path.join(out,'native-reads.json'),JSON.stringify(reads,null,2));
    await page.reload({timeout:120000});
    await page.locator('[data-preview-media="image"]').waitFor({timeout:120000});
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('img[data-preview-media="image"]')).some(image=>image.complete&&image.naturalWidth>0),null,{timeout:120000});
    await page.locator('[data-pdf-render-state="ready"] canvas').waitFor({timeout:120000});
    await page.screenshot({path:path.join(out,'after-worker.png')});
  } finally {
    globalThis.fetch=originalFetch;
    stopping=true;clearInterval(pulse);
    let revoked=false;
    try {
      const r=await page.request.get(origin+'/api/windows-service/self',{headers,timeout:60000});
      if(r.ok()) {
        const s=await r.json();
        await post(`/api/settings/windows-service/devices/${deviceId}/revoke`,{expectedRowVersion:s.rowVersion});
        revoked=true;
      }
    } finally {
      if(path.dirname(temp)!==path.resolve('.tmp')||!path.basename(temp).startsWith('a0007-worker-'))throw new Error('TASK_TEMP_SCOPE_MISMATCH');
      await fs.rm(temp,{recursive:true,force:true});
      await fs.writeFile(path.join(out,'local-worker-cleanup.json'),JSON.stringify({deviceId,temporaryRemoved:true,workerStopped:true,revoked}));
    }
  }
}
