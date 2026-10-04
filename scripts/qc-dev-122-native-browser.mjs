#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root=process.cwd(),runtime=path.resolve(process.env.DEV122_RUNTIME_ROOT||''),origin=process.env.DEV122_APP_ORIGIN;
assert.equal(path.dirname(runtime),path.join(root,'.tmp','dev122'));
assert.equal(fs.readFileSync(path.join(runtime,'owner-marker'),'utf8'),'AIPDM_DEV122_LOCAL_V1');
assert.equal(path.resolve(process.env.PDM_DATA_DIR),path.join(runtime,'data'));
assert.equal(path.resolve(process.env.PDM_REPOSITORY_DIR),path.join(runtime,'repository'));
const url=new URL(origin);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');
const preflight=process.env.DEV122_BROWSER_PREFLIGHT==='1';
const sessions=JSON.parse(fs.readFileSync(path.join(runtime,'signed-sessions.json'),'utf8'));
const fixtures=JSON.parse(fs.readFileSync(path.join(runtime,'browser-fixtures.json'),'utf8'));
assert.deepEqual(fixtures.map(item=>item.width),[1440,390]);
const viewportSelection=process.env.DEV122_BROWSER_VIEWPORT??'all';assert.ok(['all','390'].includes(viewportSelection),'DEV122_BROWSER_VIEWPORT_REJECTED');
const selectedFixtures=fixtures.filter(item=>viewportSelection==='all'||item.width===390);
const flowSelection=process.env.DEV122_BROWSER_FLOW??'full';assert.ok(['full','attachments','lifecycle'].includes(flowSelection),'DEV122_BROWSER_FLOW_REJECTED');
const output=path.join(root,'output','playwright','dev122',path.basename(runtime));fs.mkdirSync(output,{recursive:true});
const receipt={project:'AIPDM',scope:'REAL_BUSINESS_NATIVE_PG_WITH_LOCAL_VERSIONED_CONTRACT_SEAM',producerBoundary:'FIXTURE',
  production:'NOT_RUN',selection:{requested:viewportSelection,flow:flowSelection,skippedFlows:flowSelection!=='full'?['previous creation/matrix/first-release/terminal-gallery/attachment receipts require source applicability review']:[],selectedWidths:selectedFixtures.map(item=>item.width),skippedWidths:fixtures.filter(item=>!selectedFixtures.includes(item)).map(item=>item.width)},runtime:{origin,taskRoot:runtime,purpose:'DEV122 actual Next normal UI',port:Number(url.port),
    processTreeOwner:process.pid,cleanupCondition:'finally close verified task-owned browser and contexts'},status:'RUNNING',cases:[],cleanup:false};
const save=()=>fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2));save();
let browser,browserServer,browserIdentity,browserRegistered=false;
function identity(pid){return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${Number(pid)} -ErrorAction Stop; @{pid=$p.Id;executable=$p.Path;startToken=$p.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()}|ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}));}
function nativeProcessState(pid){const script=`Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class Dev122BrowserFingerprint {
  [StructLayout(LayoutKind.Sequential)] public struct FileTime { public uint Low; public uint High; }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr process, out FileTime creation, out FileTime exit, out FileTime kernel, out FileTime user);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder path, ref uint size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static string[] Read(uint pid) { IntPtr p=OpenProcess(0x1000,false,pid); if(p==IntPtr.Zero) {
      int error=Marshal.GetLastWin32Error();
      if(error==87) { try { using(var existing=System.Diagnostics.Process.GetProcessById((int)pid)) {} }
        catch(ArgumentException) { return new string[]{"absent","","","OpenProcess:87;GetProcessById:ArgumentException"}; } }
      throw new Exception("OpenProcess:"+error);
    }
    try { uint code; if(!GetExitCodeProcess(p,out code))throw new Exception("GetExitCodeProcess:"+Marshal.GetLastWin32Error());
      FileTime c,e,k,u; if(!GetProcessTimes(p,out c,out e,out k,out u))throw new Exception("GetProcessTimes:"+Marshal.GetLastWin32Error());
      string token=(((ulong)c.High<<32)|c.Low).ToString();
      if(code!=259)return new string[]{"exited",token,"","GetExitCodeProcess:"+code};
      var path=new StringBuilder(4096); uint size=4096; if(!QueryFullProcessImageName(p,0,path,ref size))throw new Exception("QueryFullProcessImageName:"+Marshal.GetLastWin32Error());
      return new string[]{"running",token,path.ToString(),"GetExitCodeProcess:259"}; } finally {CloseHandle(p);} }
}
'@; $proof=[Dev122BrowserFingerprint]::Read(${Number(pid)}); @{pid=${Number(pid)};state=$proof[0];startToken=$proof[1];executable=$proof[2];proof=$proof[3]}|ConvertTo-Json -Compress`;
  return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}));}
function browserExitProof(expected){const actual=nativeProcessState(expected.pid);
  if(actual.state==='absent')return {processDead:true,actual};
  if(actual.startToken!==expected.startToken)return {processDead:false,pidReused:true,actual};
  if(actual.state==='exited')return {processDead:true,actual};
  assert.equal(actual.executable,expected.executable,'NATIVE_BROWSER_CLEANUP_FINGERPRINT_MISMATCH');
  return {processDead:false,actual};
}
function governor(action){const args=[process.env.DEV122_GOVERNOR_SCRIPT,'--agent-host','codex','--format','json','session','runtime',action,
  '--session',process.env.DEV122_GOVERNOR_SESSION,'--pid',String(browserIdentity.pid),'--start-token',browserIdentity.startToken];
  if(action==='register')args.push('--executable',browserIdentity.executable,'--purpose','AI-PDM DEV122 own headless Chromium process tree',
    '--cleanup-condition','Browser contexts/server closed and loopback websocket port released','--port',String(receipt.browserDeclaration.port));
  else args.push('--reason','exited');
  let raw;
  try{raw=execFileSync(process.env.DEV122_GOVERNOR_PYTHON,args,{encoding:'utf8',windowsHide:true});}
  catch(error){receipt.browserDeclaration.governorFailure={action,exitCode:error.status,stdout:String(error.stdout??''),stderr:String(error.stderr??'')};save();throw error;}
  receipt.browserDeclaration.governorRaw??={};receipt.browserDeclaration.governorRaw[action]=raw;save();
  const result=JSON.parse(raw);
  if(result.exit_code!==0)throw new Error('DEV122_BROWSER_GOVERNOR_REJECTED');return result;
}
async function freePort(){const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function released(port){return new Promise(resolve=>{const socket=net.connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(false);});socket.once('error',()=>resolve(true));});}
try {
  const browserTemp=path.join(runtime,'browser-temp');fs.mkdirSync(browserTemp);
  process.env.TEMP=browserTemp;process.env.TMP=browserTemp;
  receipt.browserDeclaration={project:'AIPDM',purpose:'DEV122 task-owned headless browser and local Playwright websocket',
    port:await freePort(),TEMP:browserTemp,PDM_DATA_DIR:process.env.PDM_DATA_DIR,PDM_REPOSITORY_DIR:process.env.PDM_REPOSITORY_DIR,
    owningProcessTree:{parent:process.pid,chromium:null},websocketController:identity(process.pid),
    cleanupCondition:'Close own contexts/browserServer; verify fingerprint dead and port released'};save();
  browserServer=await chromium.launchServer({headless:true,host:'127.0.0.1',port:receipt.browserDeclaration.port});
  const alias=identity(browserServer.process().pid);receipt.browserDeclaration.powerShellAlias=alias;save();
  const native=nativeProcessState(alias.pid);receipt.browserDeclaration.nativeFingerprint=native;save();
  assert.equal(native.state,'running','NATIVE_BROWSER_NOT_RUNNING');
  assert.equal(native.pid,alias.pid,'NATIVE_BROWSER_PID_MISMATCH');
  assert.equal(native.startToken,alias.startToken,'NATIVE_BROWSER_START_TOKEN_MISMATCH');
  assert.ok(path.isAbsolute(native.executable),'NATIVE_BROWSER_EXECUTABLE_NOT_ABSOLUTE');
  browserIdentity={pid:native.pid,startToken:native.startToken,executable:native.executable};
  receipt.browserDeclaration.owningProcessTree.chromium=browserIdentity;save();
  receipt.browserDeclaration.governorRegister=governor('register');browserRegistered=true;save();
  browser=await chromium.connect(browserServer.wsEndpoint());
  for(const fixture of selectedFixtures) {
    const context=await browser.newContext({viewport:{width:fixture.width,height:fixture.height},acceptDownloads:true});
    const page=await context.newPage(),errors=[],requests=[],alerts=[],apiChecks=[],overflowMetrics=[],navigationRoutes=[],frameworkAnnouncements=[],observedPageTitles=[],consoleReadbacks=[];
    const previewContexts=new Map(fixture.terminalAssetIds.map(id=>[id,[fixture.drawingWorkId]]));
    const progress=(step,data)=>{receipt.progress??=[];receipt.progress.push({viewport:fixture.width,step,data,navigationRoutes:[...navigationRoutes]});save();};
    const waitResponse=predicate=>{const pending=page.waitForResponse(predicate);void pending.catch(error=>{
      receipt.responseWaitFailures??=[];receipt.responseWaitFailures.push({observedAt:Date.now(),viewport:fixture.width,
        pathname:new URL(page.url()).pathname,predicate:String(predicate),message:error.message});
      try{save();}catch(saveError){errors.push('RESPONSE_WAIT_FAILURE_SAVE_FAILED:'+saveError.message);}
    });return pending;};
    const waitDownload=()=>{const pending=page.waitForEvent('download');void pending.catch(error=>{
      receipt.downloadWaitFailures??=[];receipt.downloadWaitFailures.push({observedAt:Date.now(),viewport:fixture.width,
        pathname:new URL(page.url()).pathname,message:error.message});
      try{save();}catch(saveError){errors.push('DOWNLOAD_WAIT_FAILURE_SAVE_FAILED:'+saveError.message);}
    });return pending;};
    page.on('framenavigated',frame=>{if(frame===page.mainFrame()&&frame.url().startsWith(origin))navigationRoutes.push({pathname:new URL(frame.url()).pathname,search:new URL(frame.url()).search});});
    let expectedSaveFailure=null,expectedSaveFailureReached=0;
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(['error','warning'].includes(message.type())) {
      consoleReadbacks.push({observedAt:Date.now(),viewport:fixture.width,type:message.type(),text:message.text(),location:message.location(),pathname:new URL(page.url()).pathname});
      receipt.consoleReadbacks??=[];receipt.consoleReadbacks.push(consoleReadbacks.at(-1));save();
    }});
    page.on('dialog',dialog=>{alerts.push(dialog.message());void dialog.dismiss();});
    page.on('response',response=>{if(response.url().startsWith(origin+'/api/')){
      const responseUrl=new URL(response.url());requests.push({url:responseUrl.pathname,status:response.status()});
      if(response.status()>=400)apiChecks.push((async()=>{
        let rawText=null,bodyReadError=null;
        try{rawText=await response.text();}catch(error){bodyReadError={message:error.message};}
        let body=null;try{body=JSON.parse(rawText);}catch{}
        const readback={observedAt:Date.now(),viewport:fixture.width,method:response.request().method(),
          pathname:responseUrl.pathname,query:responseUrl.search,status:response.status(),cacheControl:response.headers()['cache-control']??null,
          contentType:response.headers()['content-type']??null,body,rawText,bodyReadError};
        receipt.apiErrorReadbacks??=[];receipt.apiErrorReadbacks.push(readback);save();
        if(bodyReadError){errors.push(`API_BODY_READ_FAILED:${response.status()}:${responseUrl.pathname}:${bodyReadError.message}`);return;}
        const assetId=decodeURIComponent(responseUrl.pathname.split('/').at(-1));
        const expectedTerminal=response.status()===409 && responseUrl.pathname.startsWith('/api/pdm/file-assets/')
          && previewContexts.has(assetId) && responseUrl.searchParams.get('preview')==='1'
          && previewContexts.get(assetId).includes(responseUrl.searchParams.get('contextId')) && body?.error?.code==='PREVIEW_FAILED' && body.error.retryable===false;
        const expectedAuthFailure=expectedSaveFailure===responseUrl.pathname&&response.request().method()==='PATCH'
          &&response.status()===401&&body?.code==='auth_session_invalid';
        readback.expectedClassification=expectedTerminal?'exact terminal preview':expectedAuthFailure?'exact intentionally missing signed session':null;save();
        if(expectedAuthFailure)expectedSaveFailureReached+=1;
        if(!expectedTerminal&&!expectedAuthFailure)errors.push(`UNEXPECTED_API_RESPONSE:${response.status()}:${responseUrl.pathname}:${body?.error?.code??body?.code??'NO_SAFE_CODE'}`);
      })().catch(error=>{errors.push(`API_READBACK_FAILED:${error.message}`);receipt.apiReadbackFailures??=[];
        receipt.apiReadbackFailures.push({pathname:responseUrl.pathname,status:response.status(),message:error.message});save();}));
    }});
    await context.addCookies([{name:'__session',value:sessions.owner,url:origin,httpOnly:true,sameSite:'Lax'}]);
    const navigate=async name=>{
      const link=page.getByRole('navigation',{name:'主導覽',exact:true}).getByRole('link',{name,exact:true});
      try{await link.waitFor({state:'visible',timeout:5000});}
      catch(error){const desktop=page.getByRole('button',{name:'展開左側導覽',exact:true});
        const mobile=page.getByRole('button',{name:'展開主導覽',exact:true});
        if(await desktop.isVisible())await desktop.click();else if(await mobile.isVisible())await mobile.click();else throw error;}
      await link.click();
    };
    const healthy=async()=>{
      await Promise.all(apiChecks);assert.deepEqual(errors,[],'UNEXPECTED_PAGE_ERROR_OR_API_RESPONSE');assert.deepEqual(alerts,[],'UNEXPECTED_DIALOG');
      for(const message of consoleReadbacks) {
        if(message.type==='error') {
          const location=new URL(message.location.url||origin,origin);
          const expected=(receipt.apiErrorReadbacks??[]).find(item=>item.viewport===fixture.width&&item.expectedClassification&&item.pathname===location.pathname
            &&Math.abs(item.observedAt-message.observedAt)<5000&&message.text.includes('status of '+item.status));
          message.classification=expected?{reason:expected.expectedClassification,requestPath:expected.pathname,status:expected.status,body:expected.body}:null;
          assert.ok(expected,'UNEXPECTED_CONSOLE_ERROR:'+message.text);
        }else if(/hydration|unique.*key|Each child|uncaught/iu.test(message.text))throw new Error('UNEXPECTED_REACT_WARNING:'+message.text);
      }
      receipt.nextDevIndicatorReadbacks??=[];receipt.nextDevIndicatorReadbacks.push({viewport:fixture.width,pathname:new URL(page.url()).pathname,
        observedAt:Date.now(),portals:await page.locator('nextjs-portal').evaluateAll(elements=>elements.map(element=>({text:element.shadowRoot?.textContent??element.textContent,
          accessibleControls:[...(element.shadowRoot?.querySelectorAll('[aria-label]')??[])].map(control=>({role:control.getAttribute('role'),label:control.getAttribute('aria-label')}))}))),
        consoleMessages:consoleReadbacks});save();
      const liveAlerts=await page.getByRole('alert').evaluateAll(elements=>elements.map(element=>{
        const root=element.getRootNode(),text=element.textContent?.trim()||'';
        const isNext=root instanceof ShadowRoot&&root.host.tagName==='NEXT-ROUTE-ANNOUNCER'
          &&element.id==='__next-route-announcer__'&&element.getAttribute('role')==='alert'&&element.getAttribute('aria-live')==='assertive';
        const heading=document.querySelector('h1');
        return {text,isNext,title:document.title.trim(),h1:(heading?.innerText||heading?.textContent||'').trim()};
      }));
      for(const item of liveAlerts.filter(item=>item.isNext)) {
        for(const source of ['title','h1'])if(item[source])observedPageTitles.push({title:item[source],source,pathname:new URL(page.url()).pathname});
        const accepted=!item.text||observedPageTitles.some(observed=>observed.title===item.text);
        frameworkAnnouncements.push({...item,accepted});
        receipt.alertReadbacks??=[];receipt.alertReadbacks.push({viewport:fixture.width,pathname:new URL(page.url()).pathname,
          item,accepted,observedPageTitles:[...observedPageTitles]});save();
        assert.ok(accepted,'UNEXPECTED_NEXT_ROUTE_ANNOUNCEMENT');
      }
      assert.deepEqual(liveAlerts.filter(item=>!item.isNext&&item.text).map(item=>item.text),[],'UNEXPECTED_PRODUCT_ALERT');
    };
    const screenshot=async name=>{await healthy();
      const metrics=await page.evaluate(()=>({viewport:window.innerWidth,documentWidth:document.documentElement.scrollWidth,
        bodyWidth:document.body.scrollWidth,matrix:document.querySelector('.part-number-matrix-scroll')?
          {clientWidth:document.querySelector('.part-number-matrix-scroll').clientWidth,scrollWidth:document.querySelector('.part-number-matrix-scroll').scrollWidth}:null}));
      overflowMetrics.push({name,...metrics});assert.ok(metrics.documentWidth<=metrics.viewport+1,'UNEXPECTED_OUTER_HORIZONTAL_OVERFLOW');
      await page.screenshot({path:path.join(output,`${fixture.width}-${name}.png`),fullPage:true});};
    const exercisePartAttachments=async(partNumber,partId)=>{
      await page.waitForURL(location=>location.pathname==='/parts/'+partNumber+'/attachments');
      const attachmentBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSf8AAAAASUVORK5CYII=','base64');
      const attachmentName=`dev122-ui-${fixture.width}.png`,attachmentHash=createHash('sha256').update(attachmentBytes).digest('hex');
      await page.getByRole('region',{name:'附件上傳',exact:true}).locator('input[type="file"]').setInputFiles({name:attachmentName,mimeType:'image/png',buffer:attachmentBytes});
      const attachmentPath='/api/parts/'+partNumber+'/attachments';
      const uploadAttachment=waitResponse(response=>new URL(response.url()).pathname===attachmentPath&&response.request().method()==='POST');
      await page.getByRole('button',{name:'上傳 1 個附件',exact:true}).focus();await page.keyboard.press('Enter');
      const attachmentResponse=await uploadAttachment,attachmentBody=await attachmentResponse.json();assert.equal(attachmentResponse.status(),201,JSON.stringify(attachmentBody));
      assert.equal(attachmentBody.attachment.contentHash,attachmentHash);assert.equal(attachmentBody.attachment.entityId,partId);
      const attachmentId=attachmentBody.attachment.id;
      const listedAttachment=waitResponse(response=>new URL(response.url()).pathname===attachmentPath&&response.request().method()==='GET'&&!new URL(response.url()).search);
      await page.reload({waitUntil:'domcontentloaded'});const listedAttachmentResponse=await listedAttachment,listedAttachmentBody=await listedAttachmentResponse.json();
      assert.equal(listedAttachmentResponse.status(),200,JSON.stringify(listedAttachmentBody));
      assert.ok(listedAttachmentBody.attachments.some(item=>item.id===attachmentId&&item.contentHash===attachmentHash));
      const attachmentRow=page.locator('.part-attachment-list:not(.is-deleted)>li').filter({hasText:attachmentName});
      const attachmentPreview=waitResponse(response=>new URL(response.url()).pathname==='/api/pdm/file-assets/'+attachmentId&&new URL(response.url()).searchParams.get('preview')==='1');
      await attachmentRow.getByRole('button',{name:'預覽',exact:true}).click();
      const attachmentPreviewResponse=await attachmentPreview,previewBytes=await attachmentPreviewResponse.body();
      assert.equal(attachmentPreviewResponse.status(),200);assert.equal(attachmentPreviewResponse.headers()['content-type'],'image/png');
      assert.match(attachmentPreviewResponse.headers()['cache-control'],/private.*no-store/u);assert.equal(createHash('sha256').update(previewBytes).digest('hex'),attachmentHash);
      await page.getByRole('region',{name:attachmentName+' 預覽',exact:true}).getByRole('img',{name:attachmentName,exact:true}).waitFor();
      const attachmentDownloadEvent=waitDownload();await attachmentRow.getByRole('link',{name:'下載 '+attachmentName,exact:true}).click();
      const attachmentDownload=await attachmentDownloadEvent,attachmentOutput=path.join(output,`${fixture.width}-part-attachment.png`);
      await attachmentDownload.saveAs(attachmentOutput);assert.equal(await attachmentDownload.failure(),null);
      assert.equal(createHash('sha256').update(fs.readFileSync(attachmentOutput)).digest('hex'),attachmentHash);
      await screenshot('Part-mounted-attachment-preview');progress('normal mounted Part attachment upload list reload preview and download',{
        partId:partId,partNumber,attachmentId,attachmentName,attachmentHash,size:attachmentBytes.length,
        upload:attachmentBody.attachment,listStatus:listedAttachmentResponse.status(),previewStatus:attachmentPreviewResponse.status(),
        previewCacheControl:attachmentPreviewResponse.headers()['cache-control'],previewMIME:attachmentPreviewResponse.headers()['content-type'],
        canonicalPreviewURL:attachmentPreviewResponse.url(),downloadName:attachmentDownload.suggestedFilename(),layer:'ACTUAL_DOM_AND_SIGNED_CANONICAL_ROUTES',actualCADOutput:'NOT_APPLICABLE_IMAGE_ATTACHMENT'});
    };
    try {
      await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
      await navigate('料號工作台');
      if(flowSelection==='lifecycle') {
        const snapshot=async()=>{
          const nonce=crypto.randomUUID(),requestPath=path.join(runtime,'grant-fixture-request.json'),resultPath=path.join(runtime,'grant-fixture-result.json');
          fs.rmSync(resultPath,{force:true});fs.writeFileSync(requestPath+'.tmp',JSON.stringify({action:'owned-lifecycle-snapshot',nonce}));fs.renameSync(requestPath+'.tmp',requestPath);
          const deadline=Date.now()+15000;while(Date.now()<deadline){if(fs.existsSync(resultPath)){const result=JSON.parse(fs.readFileSync(resultPath,'utf8'));
            if(result.nonce===nonce){assert.equal(result.status,'APPLIED');assert.equal(result.readOnly,true);
              assert.equal(result.isolation,'repeatable read');assert.equal(result.tableCount,163);assert.equal(Object.keys(result.rows).length,163);
              return Object.fromEntries(Object.entries(result.rows).map(([table,rows])=>[table,rows.map(value=>{
                assert.deepEqual(Object.keys(value),['row'],'OWNED_SNAPSHOT_RECORD_SHAPE');assert.ok(value.row&&typeof value.row==='object');return value.row;
              })]));}}
            await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('UI_OWNED_READBACK_TIMEOUT');
        };
        const initial=await snapshot(),drawingMasterId=initial.drawings.find(item=>item.id===fixture.drawingId).formal_drawing_number_id;
        const masterOf=rows=>rows.drawing_numbers.find(item=>item.id===drawingMasterId);
        const productionOf=rows=>rows.canonical_workbench_states.filter(item=>item.canonical_entity_id===fixture.drawingId&&item.data_layer==='drawing_production');
        const asActor=async actor=>context.addCookies([{name:'__session',value:sessions[actor],url:origin,httpOnly:true,sameSite:'Lax'}]);
        const partRow=()=>page.locator('tr[data-canonical-workbench-row="true"].is-work').filter({hasText:fixture.partNumber});
        await page.getByRole('textbox',{name:'搜尋',exact:true}).fill(fixture.partNumber);await partRow().getByRole('button',{name:fixture.partNumber,exact:true}).click();
        const matrixReady=waitResponse(response=>new URL(response.url()).pathname==='/api/pdm/parts/'+fixture.partId+'/matrix-workspace');
        await page.getByRole('button',{name:'繼續編輯',exact:true}).click();await page.waitForURL('**/parts/**/workspace?**');
        const matrixResponse=await matrixReady;assert.equal(matrixResponse.status(),200);await matrixResponse.json();
        const name=page.getByRole('textbox',{name:fixture.partNumber+' partName',exact:true}),ordinaryName='DEV122 ordinary UI '+fixture.width;
        await name.waitFor();await name.click();await page.locator('.part-number-matrix-cell.is-focused').filter({has:name}).waitFor();
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const saved=waitResponse(response=>new URL(response.url()).pathname==='/api/pdm/part-change-works/'+fixture.partWorkId&&response.request().method()==='PATCH');
        await name.fill(ordinaryName);await name.press('Tab');const savedResponse=await saved,savedBody=await savedResponse.json();assert.equal(savedResponse.status(),200,JSON.stringify(savedBody));
        assert.equal(savedBody.data.payload.partName,ordinaryName);assert.equal(await page.getByRole('checkbox',{name:fixture.partNumber+' 申請首次發行',exact:true}).isChecked(),false);
        const submittedPart=waitResponse(response=>new URL(response.url()).pathname==='/api/pdm/part-change-works/'+fixture.partWorkId+'/submit');
        await page.getByRole('button',{name:/^送出審核/u}).click();const partSubmission=await submittedPart,partSubmissionBody=await partSubmission.json();assert.equal(partSubmission.status(),200,JSON.stringify(partSubmissionBody));
        const anchorRequestId=partSubmissionBody.data.requestId;progress('ordinary Part nonrelease UI submission',{partId:fixture.partId,workId:fixture.partWorkId,anchorRequestId,savedBody});
        const readTarget=async(pending,entityId)=>{
          const response=await pending,body=await response.json(),pathname=new URL(response.url()).pathname,segments=pathname.split('/');
          progress('actual immutable UI target bytes',{status:response.status(),pathname,cacheControl:response.headers()['cache-control'],contentType:response.headers()['content-type'],body});
          assert.equal(response.status(),200,JSON.stringify(body));assert.equal(body.data.readonly,true);
          assert.equal(body.data.requestId,segments[4]);assert.equal(body.data.snapshot.targetKey,segments[6]+':'+entityId);
          assert.equal(body.data.snapshot.workspace.entityId,entityId);assert.equal(body.data.snapshot.workspace.kind,segments[6]);return body;
        };
        const reviewerEntry=async(requestId,entityType,entityId,search)=>{
          await asActor('reviewer');await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await navigate('料號工作台');
          await page.getByRole('textbox',{name:'搜尋',exact:true}).fill(fixture.partNumber);await partRow().getByRole('button',{name:fixture.partNumber,exact:true}).click();
          const anchorTarget=waitResponse(response=>new URL(response.url()).pathname===`/api/pdm/review-requests/${anchorRequestId}/targets/part/${fixture.partId}`);
          await page.getByRole('button',{name:'前往審核',exact:true}).click();await page.waitForURL(location=>location.pathname==='/approvals/'+anchorRequestId);await readTarget(anchorTarget,fixture.partId);
          if(requestId!==anchorRequestId){await page.getByRole('button',{name:'返回審核清單',exact:true}).click();await page.waitForURL(location=>location.pathname==='/approvals');
            await page.getByRole('textbox',{name:'搜尋圖號、料號、品名或送審者',exact:true}).fill(search);
            const row=page.locator('[data-approval-workbench-row="true"]').filter({hasText:search});await row.waitFor({state:'visible'});await row.focus();
            const target=waitResponse(response=>new URL(response.url()).pathname===`/api/pdm/review-requests/${requestId}/targets/${entityType}/${entityId}`);
            await page.keyboard.press('Enter');await page.waitForURL(location=>location.pathname==='/approvals/'+requestId);await readTarget(target,entityId);
          }
          await screenshot('immutable-'+entityType+'-'+requestId);
          const inputs=await page.locator('.canonical-review-package input,.canonical-review-package select,.canonical-review-package textarea').evaluateAll(elements=>elements.map(item=>({disabled:item.disabled,readOnly:item.readOnly??false})));
          assert.ok(inputs.every(item=>item.disabled||item.readOnly),'EDITABLE_REVIEW_SNAPSHOT');
        };
        const decide=async(requestId,decision)=>{
          const pending=waitResponse(response=>new URL(response.url()).pathname==='/api/pdm/review-requests/'+requestId+'/decisions');
          await page.getByRole('button',{name:decision==='approve'?'核准':'退回修改',exact:true}).click();const response=await pending,body=await response.json();
          assert.equal(response.status(),200,JSON.stringify(body));await page.waitForURL(location=>location.pathname==='/approvals');progress('actual UI '+decision,{requestId,status:response.status(),body});
        };
        const openDrawing=async(workId,advance=false,layer='drawing_rd')=>{
          await asActor('owner');await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
          await page.locator('.clean-workbench-list').getByRole('link',{name:'圖號工作台',exact:true}).click();await page.waitForURL(location=>location.pathname==='/numbering/drawings');
          await page.getByRole('textbox',{name:'搜尋',exact:true}).fill(fixture.drawingNumber);
          const rows=await snapshot(),production=productionOf(rows)[0];
          const state=rows.canonical_workbench_states.find(item=>item.canonical_entity_id===fixture.drawingId&&(workId?item.work_id===workId:item.data_layer===layer&&item.handling==='none'
            &&(layer!=='drawing_rd'||rows.drawing_rd_branches.find(branch=>branch.id===item.branch_id)?.base_production_revision_id===(production?.revision_id??null))));
          assert.ok(state,'OWN_DRAWING_STATE_MISSING');const row=page.locator(`tr[data-row-key="cw_${state.id}"]`);await row.waitFor({state:'visible'});
          await row.getByRole('button',{name:fixture.drawingNumber,exact:true}).click();await page.getByRole('button',{name:advance?'進版':'進行編輯',exact:true}).click();
          if(!advance)await page.waitForURL('**/numbering/drawings/**/workspace?**');return state;
        };
        const uploadPair=async(workId,label,requireFFF=false)=>{
          const inputs=[{name:label+'.SLDDRW',relative:'data/repository/candidate-revisions/company-jenfu/NCR-58d69728-cc3f-4d97-95fb-2957f62630d8/NCRF-e1e1a32a-322d-4504-bcdc-7d565fc39876-A0029-M01.SLDDRW',hash:'06fd8358ce29411ea49ae466e1404b0ecc2fc964bbc98534d2df897ab09453bd'},
            {name:label+'.SLDPRT',relative:'data/repository/candidate-revisions/company-jenfu/NCR-58d69728-cc3f-4d97-95fb-2957f62630d8/NCRF-a8ebd160-9779-43ae-be1b-17ca00fcd759-A0029.SLDPRT',hash:'d3f2349aa36baf24d3e7fc0044cd2004897e62137bbb279b5da329f6521dfc39'}];
          for(const input of inputs){const original=path.resolve('C:/VIBE CODING/AI_PDM',input.relative);assert.ok(original.startsWith(path.resolve('C:/VIBE CODING/AI_PDM')+path.sep));const bytes=fs.readFileSync(original);assert.equal(createHash('sha256').update(bytes).digest('hex'),input.hash);
            await page.locator('.dev079-workspace-file-upload input[type="file"]').setInputFiles({name:input.name,mimeType:'application/octet-stream',buffer:bytes});
            const uploaded=waitResponse(response=>new URL(response.url()).pathname==='/api/pdm/drawing-revision-works/'+workId+'/files'&&response.request().method()==='POST');
            await page.getByRole('button',{name:'上傳所選檔案',exact:true}).focus();await page.keyboard.press('Enter');const response=await uploaded,body=await response.json();assert.equal(response.status(),200,JSON.stringify(body));
            previewContexts.set(body.data.file.sourceFileAssetId,[workId,fixture.drawingId]);assert.equal(createHash('sha256').update(fs.readFileSync(original)).digest('hex'),input.hash);
            progress('normal paired Drawing source upload',{workId,name:input.name,size:bytes.length,sourceHash:input.hash,status:response.status(),body,actualCADExtraction:'NOT_RUN_UI_UPLOAD_LAYER'});
          }
          await page.getByText('本版次 2D 與 3D 主檔已齊備。',{exact:true}).waitFor();
          const axes=[];
          for(const axis of ['formState','fitState','functionState']){const select=page.locator(`select[data-fff-axis="${axis}"]`);
            if(requireFFF)await select.waitFor({state:'visible'});
            if(await select.count()){await select.selectOption('no_impact');const value=await select.inputValue();assert.equal(value,'no_impact');axes.push({axis,value});}}
          if(requireFFF)assert.equal(axes.length,3);progress('completed mounted paired files and FFF selection',{workId,requireFFF,axes});
        };
        const submitDrawingUi=async workId=>{
          const pending=waitResponse(response=>new URL(response.url()).pathname==='/api/pdm/drawing-revision-works/'+workId+'/submit');
          const submit=page.getByRole('button',{name:'送出審核',exact:true});await submit.waitFor();assert.equal(await submit.isEnabled(),true);await submit.focus();await page.keyboard.press('Enter');
          const response=await pending,body=await response.json();assert.equal(response.status(),200,JSON.stringify(body));await page.waitForURL(location=>location.pathname==='/numbering/drawings');return body.data.requestId;
        };
        await openDrawing(fixture.drawingWorkId);await uploadPair(fixture.drawingWorkId,'minor-initial-'+fixture.width);
        let minorRequest=await submitDrawingUi(fixture.drawingWorkId),firstMinorRequest=minorRequest;await reviewerEntry(minorRequest,'drawing',fixture.drawingId,fixture.drawingNumber);await decide(minorRequest,'return');
        await openDrawing(fixture.drawingWorkId);minorRequest=await submitDrawingUi(fixture.drawingWorkId);assert.notEqual(minorRequest,firstMinorRequest);await reviewerEntry(minorRequest,'drawing',fixture.drawingId,fixture.drawingNumber);await decide(minorRequest,'approve');
        const afterMinor=await snapshot();assert.deepEqual(masterOf(afterMinor),masterOf(initial));assert.deepEqual(productionOf(afterMinor),productionOf(initial));
        progress('minor return fresh package approve nonrelease native readback',{masterBefore:masterOf(initial),masterAfter:masterOf(afterMinor),production:productionOf(afterMinor)});
        await openDrawing(null,true);const dialog=page.getByRole('dialog',{name:'建立進版工作',exact:true});await dialog.waitFor();await dialog.locator('input[name="revision-target"][value="production"]').check();
        const started=waitResponse(response=>new URL(response.url()).pathname==='/api/pdm/drawings/'+fixture.drawingId+'/revision-works'&&response.request().method()==='POST');
        await dialog.getByRole('button',{name:'建立進版工作',exact:true}).click();const startResponse=await started,startBody=await startResponse.json();assert.equal(startResponse.status(),200,JSON.stringify(startBody));
        const majorWorkId=startBody.data.workId;await page.waitForURL('**/numbering/drawings/**/workspace?**');await uploadPair(majorWorkId,'major-'+fixture.width,true);
        let majorRequest=await submitDrawingUi(majorWorkId),firstMajorRequest=majorRequest;await reviewerEntry(majorRequest,'drawing',fixture.drawingId,fixture.drawingNumber);await decide(majorRequest,'return');
        assert.deepEqual(masterOf(await snapshot()),masterOf(initial));
        await openDrawing(majorWorkId);majorRequest=await submitDrawingUi(majorWorkId);assert.notEqual(majorRequest,firstMajorRequest);await reviewerEntry(majorRequest,'drawing',fixture.drawingId,fixture.drawingNumber);await decide(majorRequest,'approve');
        const afterMajor=await snapshot();assert.equal(masterOf(afterMajor).record_status,'Released');assert.equal(productionOf(afterMajor).length,1);assert.ok(productionOf(afterMajor)[0].revision_id);
        progress('major return fresh package approve exact Released production pointer',{master:masterOf(afterMajor),production:productionOf(afterMajor),majorWorkId,majorRequest});
        const releasedRounds=[];
        for(const variant of [{kind:'rd',layer:'drawing_production',name:'Released-minor'},{kind:'production',layer:'drawing_rd',name:'Released-subsequent-major'}]){
          const beforeRound=await snapshot();await openDrawing(null,true,variant.layer);
          const dialog=page.getByRole('dialog',{name:'建立進版工作',exact:true});await dialog.waitFor();await dialog.locator(`input[name="revision-target"][value="${variant.kind}"]`).check();
          const started=waitResponse(response=>new URL(response.url()).pathname==='/api/pdm/drawings/'+fixture.drawingId+'/revision-works'&&response.request().method()==='POST');
          await dialog.getByRole('button',{name:'建立進版工作',exact:true}).click();const response=await started,body=await response.json();assert.equal(response.status(),200,JSON.stringify(body));const workId=body.data.workId;
          const afterCreation=await snapshot(),productionBefore=productionOf(beforeRound),productionAfterCreation=productionOf(afterCreation);
          assert.deepEqual(masterOf(afterCreation),masterOf(beforeRound));assert.equal(productionAfterCreation.length,productionBefore.length);
          if(variant.kind==='rd'){
            assert.equal(productionBefore.length,1);assert.equal(productionAfterCreation[0].row_version,Number(productionBefore[0].row_version)+1);
            assert.equal(typeof productionAfterCreation[0].updated_at,'string');
            assert.deepEqual(productionAfterCreation[0],{...productionBefore[0],row_version:Number(productionBefore[0].row_version)+1,updated_at:productionAfterCreation[0].updated_at});
          }else assert.deepEqual(productionAfterCreation,productionBefore);
          progress('normal production source branch claim native row-version readback',{variant:variant.name,workId,masterBefore:masterOf(beforeRound),masterAfter:masterOf(afterCreation),productionBefore,productionAfterCreation});
          await page.waitForURL('**/numbering/drawings/**/workspace?**');await uploadPair(workId,variant.name+'-'+fixture.width,variant.kind==='production');
          const returnedId=await submitDrawingUi(workId);await reviewerEntry(returnedId,'drawing',fixture.drawingId,fixture.drawingNumber);await decide(returnedId,'return');
          const returnedRows=await snapshot();assert.deepEqual(masterOf(returnedRows),masterOf(beforeRound));assert.deepEqual(productionOf(returnedRows),productionAfterCreation);
          await openDrawing(workId);const freshId=await submitDrawingUi(workId);assert.notEqual(freshId,returnedId);
          await reviewerEntry(freshId,'drawing',fixture.drawingId,fixture.drawingNumber);await decide(freshId,'approve');const afterRound=await snapshot();
          assert.equal(masterOf(afterRound).record_status,'Released');assert.equal(productionOf(afterRound).length,1);
          if(variant.kind==='rd'){assert.deepEqual(masterOf(afterRound),masterOf(beforeRound));assert.deepEqual(productionOf(afterRound),productionAfterCreation);}
          else assert.notEqual(productionOf(afterRound)[0].revision_id,productionOf(beforeRound)[0].revision_id);
          const result={variant:variant.name,workId,returnedId,freshId,masterBefore:masterOf(beforeRound),masterAfter:masterOf(afterRound),productionBeforeCreation:productionBefore,productionBeforeReview:productionAfterCreation,productionAfter:productionOf(afterRound)};
          releasedRounds.push(result);progress('normal paired '+variant.name+' return fresh approval and native readback',result);
        }
        await reviewerEntry(anchorRequestId,'part',fixture.partId,fixture.partNumber);await decide(anchorRequestId,'approve');const finalRows=await snapshot();
        const finalPart=finalRows.part_numbers.find(item=>item.id===fixture.partId);assert.equal(finalPart.record_status,'Draft');assert.equal(finalPart.part_name,ordinaryName);
        await screenshot('ordinary-Part-and-paired-Drawing-completed');receipt.cases.push({viewport:{width:fixture.width,height:fixture.height},status:'PASS',flow:'lifecycle',
          ordinaryPart:{partId:fixture.partId,anchorRequestId,finalPart},minor:{requestId:minorRequest,master:masterOf(afterMinor),production:productionOf(afterMinor)},
          major:{workId:majorWorkId,requestId:majorRequest,master:masterOf(afterMajor),production:productionOf(afterMajor)},releasedRounds,normalNavigation:true,signedPrincipal:true,keyboard:true,
          overflowMetrics,navigationRoutes,requests});save();continue;
      }
      if(flowSelection==='attachments') {
        await page.getByRole('textbox',{name:'搜尋',exact:true}).fill(fixture.partNumber);
        const row=page.locator('tr[data-canonical-workbench-row="true"].is-work').filter({hasText:fixture.partNumber});
        await row.getByRole('button',{name:fixture.partNumber,exact:true}).click();
        await page.getByRole('button',{name:'管理附件',exact:true}).click();
        await exercisePartAttachments(fixture.partNumber,fixture.partId);
        receipt.cases.push({viewport:{width:fixture.width,height:fixture.height},status:'PASS',flow:'attachments',
          fixture:{partId:fixture.partId,partNumber:fixture.partNumber,initialLifecycle:'Draft',producer:'NORMAL_SIGNED_API_PRECONDITION'},
          normalNavigation:true,signedPrincipal:true,keyboardUpload:true,attachmentDOM:true,overflowMetrics,navigationRoutes,requests});save();continue;
      }
      let partNumber=fixture.partNumber,normalCreation=null,matrixRoundTrip=null;
      {
        await page.locator('[data-canonical-numbering-create="true"]').click();
        await page.waitForURL('**/numbering/create?**');
        await page.getByRole('combobox',{name:'料件類型',exact:true}).waitFor();
        fs.writeFileSync(path.join(output,`${fixture.width}-create-dom.html`),await page.content());
        fs.writeFileSync(path.join(output,`${fixture.width}-create-accessibility.yml`),await page.locator('body').ariaSnapshot());
        await screenshot('create-preflight');
        if(preflight)await navigate('料號工作台');
        else {
          await page.getByRole('combobox',{name:'料件類型',exact:true}).selectOption('purchased');
          const name=`DEV122_UI_${fixture.width}_${path.basename(runtime)}`;
          await page.getByRole('textbox',{name:'主要名詞',exact:true}).fill(name);
          await page.getByRole('button',{name:'套用建議品名',exact:true}).click();
          assert.equal(await page.getByRole('textbox',{name:'確定品名',exact:true}).inputValue(),name);
          const created=waitResponse(response=>new URL(response.url()).pathname==='/api/numbering/records'&&response.request().method()==='POST');
          await page.getByRole('button',{name:'建立編號',exact:true}).click();
          const response=await created,body=await response.json();assert.equal(response.status(),201,JSON.stringify(body));
          partNumber=body.partNumber.partNumber;
          normalCreation={status:response.status(),partId:body.partNumber.id,partNumber,rootId:body.root.id};
          progress('normal Draft creation',{...normalCreation,responseData:body});
          await page.getByRole('heading',{name:'編號已建立',exact:true}).waitFor();
          await screenshot('normal-created');await page.getByRole('link',{name:'查看建立結果',exact:true}).click();
        }
      }
      await page.getByRole('textbox',{name:'搜尋',exact:true}).fill(partNumber);
      const partRow=page.locator(`tr[data-canonical-workbench-row="true"].is-${preflight?'work':'formal'}`).filter({hasText:partNumber});
      await partRow.getByRole('button',{name:partNumber,exact:true}).click();
      const initialMatrixPath='/api/pdm/parts/'+(normalCreation?.partId??fixture.partId)+'/matrix-workspace';
      const initialMatrix=waitResponse(response=>new URL(response.url()).pathname===initialMatrixPath&&response.request().method()==='GET');
      await page.getByRole('button',{name:preflight?'繼續編輯':'編輯料號',exact:true}).click();
      await page.waitForURL('**/parts/**/workspace?**');
      const initialMatrixResponse=await initialMatrix;await initialMatrixResponse.finished();
      assert.equal(initialMatrixResponse.status(),200,await initialMatrixResponse.text());
      const initialMatrixBody=await initialMatrixResponse.json();
      if(preflight) {
        fs.writeFileSync(path.join(output,`${fixture.width}-matrix-dom.html`),await page.content());
        fs.writeFileSync(path.join(output,`${fixture.width}-matrix-accessibility.yml`),await page.locator('body').ariaSnapshot());
        await screenshot('matrix-preflight');
        receipt.cases.push({viewport:{width:fixture.width,height:fixture.height},status:'DIAGNOSTIC_ONLY',normalNavigation:true,
          createDOM:true,matrixDOM:true,requests,acceptanceComplete:false});save();continue;
      }
      const nameInput=page.getByRole('textbox',{name:partNumber+' partName',exact:true}),originalName=await nameInput.inputValue();
      await nameInput.click();await page.locator('.part-number-matrix-cell.is-focused').filter({has:nameInput}).waitFor({state:'visible'});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const workPatch=response=>response.request().method()==='PATCH'&&new URL(response.url()).pathname.startsWith('/api/pdm/part-change-works/');
      const changed=waitResponse(workPatch);await nameInput.fill(originalName+' B');
      progress('matrix normal input after completed native GET and observed React focus',{initialMatrixStatus:initialMatrixResponse.status(),
        initialMatrixPath,initialMatrixData:initialMatrixBody.data,originalName,immediateInput:await nameInput.inputValue(),focusedCells:await page.locator('.part-number-matrix-cell.is-focused').count()});
      assert.equal(await nameInput.inputValue(),originalName+' B','MATRIX_INPUT_CHANGED_BEFORE_IDLE_SAVE');
      const changedResponse=await changed;assert.equal(changedResponse.status(),200,await changedResponse.text());
      const changedBody=await changedResponse.json();assert.equal(changedBody.data.payload.partName,originalName+' B');
      const restored=waitResponse(workPatch);await nameInput.fill(originalName);await nameInput.press('Tab');
      const restoredResponse=await restored;assert.equal(restoredResponse.status(),200,await restoredResponse.text());
      const restoredBody=await restoredResponse.json();assert.equal(restoredBody.data.payload.partName,originalName);
      await page.reload({waitUntil:'domcontentloaded'});await nameInput.waitFor();assert.equal(await nameInput.inputValue(),originalName);
      // A real missing signed session makes the save fail; no response is mocked.
      expectedSaveFailure=new URL(restoredResponse.url()).pathname;
      await context.clearCookies();const rejected=waitResponse(workPatch);await nameInput.fill(originalName+' rejected');
      const rejectedResponse=await rejected;assert.equal(rejectedResponse.status(),401);await Promise.all(apiChecks);
      assert.equal(expectedSaveFailureReached,1);await page.getByRole('alert').filter({hasText:/\S/u}).first().waitFor();
      await context.addCookies([{name:'__session',value:sessions.owner,url:origin,httpOnly:true,sameSite:'Lax'}]);
      await nameInput.press('Escape');assert.equal(await nameInput.inputValue(),originalName);
      await page.reload({waitUntil:'domcontentloaded'});await nameInput.waitFor();assert.equal(await nameInput.inputValue(),originalName);
      matrixRoundTrip={idleSavedB:true,blurRestoredA:true,reloadA:true,actualMissingSessionSave401:true,failureRestoresLastSavedA:true,
        workId:restoredBody.data.workId,workVersion:restoredBody.data.rowVersion,savedB:changedBody.data,savedA:restoredBody.data};
      progress('matrix saved B restored A and actual failed-save recovery',matrixRoundTrip);
      expectedSaveFailure=null;await screenshot('matrix-round-trip');
      const release=page.getByRole('checkbox',{name:partNumber+' 申請首次發行',exact:true});
      const submit=page.getByRole('button',{name:/^送出審核/u});
      assert.equal(await release.isChecked(),false);assert.equal(await submit.isDisabled(),true);
      expectedSaveFailure=new URL(restoredResponse.url()).pathname;
      await context.clearCookies();const rejectedIntent=waitResponse(workPatch);
      await release.focus();await page.keyboard.press('Space');
      const rejectedIntentResponse=await rejectedIntent;assert.equal(rejectedIntentResponse.status(),401,await rejectedIntentResponse.text());await Promise.all(apiChecks);
      assert.equal(expectedSaveFailureReached,2);assert.equal(await release.isChecked(),false);assert.equal(await submit.isDisabled(),true);
      progress('first-release intent failure stays unchecked and blocks submit',{status:rejectedIntentResponse.status(),body:await rejectedIntentResponse.json(),checked:await release.isChecked(),submitDisabled:await submit.isDisabled()});
      await context.addCookies([{name:'__session',value:sessions.owner,url:origin,httpOnly:true,sameSite:'Lax'}]);
      await page.reload({waitUntil:'domcontentloaded'});await release.waitFor();assert.equal(await release.isChecked(),false);expectedSaveFailure=null;
      const savedIntent=waitResponse(workPatch);await release.focus();await page.keyboard.press('Space');
      const savedIntentResponse=await savedIntent,savedIntentBody=await savedIntentResponse.json();assert.equal(savedIntentResponse.status(),200,JSON.stringify(savedIntentBody));
      assert.equal(savedIntentBody.data.lifecycleIntent,'first_release');
      await page.reload({waitUntil:'domcontentloaded'});await release.waitFor();assert.equal(await release.isChecked(),true);
      progress('first-release intent persists after normal save and reload',{status:savedIntentResponse.status(),saved:savedIntentBody.data,checked:await release.isChecked()});
      await submit.waitFor({state:'visible'});await screenshot('owner-first-release');
      const submitted=waitResponse(response=>response.url().includes('/part-change-works/')&&response.url().endsWith('/submit'));
      await submit.click();const submitResponse=await submitted;assert.equal(submitResponse.status(),200);
      let requestId=(await submitResponse.json()).data.requestId;
      const initialRequestId=requestId;
      const partTargetResponse=()=>waitResponse(response=>new URL(response.url()).pathname===
        `/api/pdm/review-requests/${requestId}/targets/part/${normalCreation.partId}`&&response.request().method()==='GET');
      const readPartTarget=async pending=>{const response=await pending;await response.finished();const rawText=await response.text();
        let body=null;try{body=JSON.parse(rawText);}catch{}
        progress('completed actual immutable Part target read',{requestId,status:response.status(),pathname:new URL(response.url()).pathname,
          cacheControl:response.headers()['cache-control']??null,contentType:response.headers()['content-type']??null,
          data:body?.data??null,correlationId:body?.meta?.correlationId??null,error:body?.error??null,rawNonJSON:body?null:rawText});
        assert.equal(response.status(),200,rawText);assert.equal(body?.data?.readonly,true);await healthy();};
      await context.addCookies([{name:'__session',value:sessions.reviewer,url:origin,httpOnly:true,sameSite:'Lax'}]);
      await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await navigate('料號工作台');
      await page.getByRole('textbox',{name:'搜尋',exact:true}).fill(partNumber);
      const submittedPart=page.locator('tr[data-canonical-workbench-row="true"].is-work').filter({hasText:partNumber});
      await submittedPart.getByRole('button',{name:partNumber,exact:true}).click();
      const firstTarget=partTargetResponse();await page.getByRole('button',{name:'前往審核',exact:true}).click();
      await page.waitForURL(location=>location.pathname==='/approvals/'+requestId);
      await readPartTarget(firstTarget);
      progress('normal Part workbench reviewer entry to immutable package',{requestId});
      await page.getByRole('button',{name:'返回審核清單',exact:true}).click();
      await page.waitForURL(location=>location.pathname==='/approvals');
      await page.getByRole('textbox',{name:'搜尋圖號、料號、品名或送審者',exact:true}).fill(partNumber);
      const reviewRow=page.locator('[data-approval-workbench-row="true"]').filter({hasText:partNumber});
      await reviewRow.waitFor({state:'visible'});await reviewRow.focus();const listTarget=partTargetResponse();await page.keyboard.press('Enter');
      await page.waitForURL(location=>location.pathname==='/approvals/'+requestId);
      await readPartTarget(listTarget);
      progress('normal reviewer list to same immutable package',{requestId});
      await page.getByText('首次發行核准',{exact:true}).waitFor();await screenshot('immutable-review');
      const readonlyInputs=await page.locator('.canonical-review-package input,.canonical-review-package select,.canonical-review-package textarea').evaluateAll(elements=>elements.map(element=>({disabled:element.disabled,readOnly:element.readOnly??false})));
      assert.ok(readonlyInputs.length>0&&readonlyInputs.every(item=>item.disabled||item.readOnly),'IMMUTABLE_REVIEW_INPUT_EDITABLE');
      const oldSnapshotText=await page.locator('.canonical-review-package').innerText();
      const returned=waitResponse(response=>response.url().endsWith('/review-requests/'+requestId+'/decisions'));
      await page.getByRole('button',{name:'退回修改',exact:true}).click();const returnedResponse=await returned;
      assert.equal(returnedResponse.status(),200,await returnedResponse.text());await healthy();
      progress('reviewer returns the original immutable package',{requestId,readonlyInputs,oldSnapshotText,status:returnedResponse.status(),body:await returnedResponse.json()});
      await context.addCookies([{name:'__session',value:sessions.owner,url:origin,httpOnly:true,sameSite:'Lax'}]);
      await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await navigate('料號工作台');await page.getByRole('textbox',{name:'搜尋',exact:true}).fill(partNumber);
      const correctionRow=page.locator('tr[data-canonical-workbench-row="true"].is-work').filter({hasText:partNumber});
      await correctionRow.getByRole('button',{name:partNumber,exact:true}).click();await page.getByRole('button',{name:'繼續編輯',exact:true}).click();
      await page.waitForURL('**/parts/**/workspace?**');await nameInput.waitFor();assert.equal(await release.isChecked(),true);
      await nameInput.click();await page.locator('.part-number-matrix-cell.is-focused').filter({has:nameInput}).waitFor();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const corrected=waitResponse(workPatch);await nameInput.fill(originalName+' correction');await nameInput.press('Tab');
      const correctedResponse=await corrected,correctedBody=await correctedResponse.json();assert.equal(correctedResponse.status(),200,JSON.stringify(correctedBody));
      assert.equal(correctedBody.data.workId,restoredBody.data.workId);assert.equal(correctedBody.data.payload.partName,originalName+' correction');
      const resubmitted=waitResponse(response=>response.url().includes('/part-change-works/')&&response.url().endsWith('/submit'));
      await submit.click();const resubmittedResponse=await resubmitted,resubmittedBody=await resubmittedResponse.json();assert.equal(resubmittedResponse.status(),200,JSON.stringify(resubmittedBody));
      requestId=resubmittedBody.data.requestId;assert.notEqual(requestId,initialRequestId);
      progress('original owner corrects the returned work and submits a fresh package',{initialRequestId,requestId,workId:correctedBody.data.workId,saved:correctedBody.data,submitted:resubmittedBody.data});
      await context.addCookies([{name:'__session',value:sessions.reviewer,url:origin,httpOnly:true,sameSite:'Lax'}]);
      await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await navigate('料號工作台');await page.getByRole('textbox',{name:'搜尋',exact:true}).fill(partNumber);
      await page.locator('tr[data-canonical-workbench-row="true"].is-work').filter({hasText:partNumber}).getByRole('button',{name:partNumber,exact:true}).click();
      const freshTarget=partTargetResponse();await page.getByRole('button',{name:'前往審核',exact:true}).click();await page.waitForURL(location=>location.pathname==='/approvals/'+requestId);
      await readPartTarget(freshTarget);
      await page.getByText('首次發行核准',{exact:true}).waitFor();
      assert.ok((await page.locator('.canonical-review-package').innerText()).includes(partNumber));
      const correctedSnapshotValue=await page.locator('.canonical-review-package input').evaluateAll(elements=>elements.map(element=>element.value));
      assert.ok(correctedSnapshotValue.includes(originalName+' correction'),'FRESH_PACKAGE_CORRECTION_MISSING');
      await screenshot('returned-fresh-review');
      const approved=waitResponse(response=>response.url().endsWith('/review-requests/'+requestId+'/decisions'));
      await page.getByRole('button',{name:'核准',exact:true}).click();const approvedResponse=await approved;assert.equal(approvedResponse.status(),200,await approvedResponse.text());
      await healthy();
      await context.addCookies([{name:'__session',value:sessions.owner,url:origin,httpOnly:true,sameSite:'Lax'}]);
      await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await navigate('料號工作台');await page.getByRole('textbox',{name:'搜尋',exact:true}).fill(partNumber);
      await page.locator('tr[data-canonical-workbench-row="true"].is-formal').filter({hasText:partNumber}).getByRole('button',{name:partNumber,exact:true}).click();
      await page.getByRole('button',{name:'編輯料號',exact:true}).click();await page.waitForURL('**/parts/**/workspace?**');await nameInput.waitFor();
      assert.equal(await nameInput.inputValue(),originalName+' correction');assert.equal(await release.count(),0);
      await page.getByText('已發布',{exact:true}).waitFor();await screenshot('Released-first-release-control-hidden');
      progress('Released normal matrix hides first-release intent',{initialRequestId,requestId,partId:normalCreation.partId,partNumber,releaseControls:await release.count(),formalName:await nameInput.inputValue()});
      await page.getByRole('button',{name:'開啟 '+partNumber+' 附件',exact:true}).click();
      await exercisePartAttachments(partNumber,normalCreation.partId);
      await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
      const homeDrawings=page.locator('.clean-workbench-list').getByRole('link',{name:'圖號工作台',exact:true});
      assert.equal(await homeDrawings.getAttribute('href'),'/numbering/drawings');await homeDrawings.click();
      await page.waitForURL(location=>location.pathname==='/numbering/drawings');
      const drawingList=waitResponse(response=>new URL(response.url()).pathname==='/api/numbering/drawings/workbench'
        &&new URL(response.url()).searchParams.get('query')===fixture.drawingNumber);
      await page.getByRole('textbox',{name:'搜尋',exact:true}).fill(fixture.drawingNumber);
      const drawingListResponse=await drawingList,drawingListBody=await drawingListResponse.json();
      progress('lawful multi-role owner Drawing list',{status:drawingListResponse.status(),body:drawingListBody});
      assert.equal(drawingListResponse.status(),200,JSON.stringify(drawingListBody));await healthy();
      assert.ok(drawingListBody.data.previewByRowKey&&Object.keys(drawingListBody.data.previewByRowKey).length>0,'MOUNTED_GALLERY_PROJECTION_MISSING');
      const drawingRow=page.locator('tr[data-canonical-workbench-row="true"].is-rd').filter({hasText:fixture.drawingNumber});
      await drawingRow.waitFor({state:'visible'});assert.ok(await drawingRow.count()>0,'OWN_DRAWING_ROW_MISSING');
      await drawingRow.getByRole('button',{name:fixture.drawingNumber,exact:true}).click();
      await page.getByRole('button',{name:'進行編輯',exact:true}).click();
      await page.waitForURL('**/numbering/drawings/**/workspace?**');
      await page.getByText('預覽無法顯示，可下載原檔。',{exact:true}).first().waitFor();
      const downloads=page.getByRole('link',{name:/下載/u});assert.ok(await downloads.count()>0,'ORIGINAL_DOWNLOAD_MISSING');
      const previewRequestCount=()=>requests.filter(item=>item.url.startsWith('/api/pdm/file-assets/')).length;
      const count=previewRequestCount();await page.waitForTimeout(2100);assert.equal(previewRequestCount(),count,'TERMINAL_POLL_FIRST_PERIOD');
      await page.waitForTimeout(2100);assert.equal(previewRequestCount(),count,'TERMINAL_POLL_SECOND_PERIOD');
      const downloadEvent=waitDownload();await downloads.first().click();const download=await downloadEvent;
      await download.saveAs(path.join(output,`${fixture.width}-original-${path.basename(download.suggestedFilename())}`));
      assert.equal(await download.failure(),null);await screenshot('terminal-download');
      progress('terminal preview quiet for two periods and original download',{workId:fixture.drawingWorkId,
        previewRequestCount:count,periodsMs:[2100,2100],downloadName:download.suggestedFilename(),downloadFailure:await download.failure()});
      await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
      await page.locator('.clean-workbench-list').getByRole('link',{name:'圖號工作台',exact:true}).click();
      await page.waitForURL(location=>location.pathname==='/numbering/drawings');await page.getByRole('textbox',{name:'搜尋',exact:true}).fill(fixture.drawingNumber);
      const gallery=page.getByRole('radio',{name:'預覽圖',exact:true});await gallery.focus();await page.keyboard.press('Enter');
      await page.getByRole('grid',{name:'工作台預覽圖',exact:true}).waitFor({state:'visible'});
      assert.equal(await page.locator('[data-preview-state="pending"]').count(),0,'TERMINAL_GALLERY_PENDING');
      await screenshot('terminal-gallery');
      receipt.cases.push({viewport:{width:fixture.width,height:fixture.height},status:'PASS',requestId,
        normalNavigation:true,normalCreation,matrixRoundTrip,signedPrincipal:true,keyboard:true,terminalTwoPeriods:true,download:true,gallery:true,overflowMetrics,navigationRoutes,
        reviewerEntry:['normal Part workbench submitted row','前往審核','返回審核清單','normal approvals list search/Enter'],drawingEntry:'actual homepage Link',frameworkAnnouncements,observedPageTitles,requests});save();
    } catch(error) {
      fs.writeFileSync(path.join(output,`${fixture.width}-first-failure-dom.html`),await page.content());
      fs.writeFileSync(path.join(output,`${fixture.width}-first-failure-accessibility.yml`),await page.locator('body').ariaSnapshot());
      await page.screenshot({path:path.join(output,`${fixture.width}-first-failure.png`),fullPage:true}).catch(()=>{});
      receipt.firstFailureRequests=requests;receipt.firstFailureNavigationRoutes=navigationRoutes;throw error;
    } finally {await context.close();}
  }
  receipt.status=preflight?'DIAGNOSTIC_ONLY':'PARTIAL_NOT_ACCEPTED';
  receipt.coverage={partial:preflight?[]:flowSelection==='lifecycle'?['P-01','G-01','G-02','G-03A','UI-01']:flowSelection==='attachments'?['F-01A','UI-01']:['R-01B','P-01','P-02A','UI-01','F-01C'],notRun:[...(flowSelection!=='full'?['prior creation/matrix/first-release/terminal-gallery/attachments require independent source applicability review']:[]),...(preflight?['D01 normal creation through /numbering/create','D02 edit B then restore A idle/blur/reload']:[]),
    'actual CAD output','remaining QA plan groups'],acceptanceComplete:false};
} catch(error) {receipt.status='FAIL';receipt.firstFailure={message:error.message,stack:error.stack};}
finally {
  try{await browser?.close();await browserServer?.close();
    receipt.browserCleanup={...(browserIdentity?browserExitProof(browserIdentity):{processDead:browserServer?false:true}),
      portReleased:receipt.browserDeclaration?await released(receipt.browserDeclaration.port):true};
    if(browserRegistered&&receipt.browserCleanup.processDead&&receipt.browserCleanup.portReleased)receipt.browserCleanup.governorRelease=governor('release');
    receipt.cleanup=receipt.browserCleanup.processDead&&receipt.browserCleanup.portReleased;
  }catch(error){receipt.cleanup=false;receipt.cleanupFailure={message:error.message};}
  if(!receipt.cleanup)receipt.status='FAIL';save();
}
console.log(JSON.stringify({status:receipt.status,evidence:path.join(output,'receipt.json'),executedCases:receipt.cases.length,cleanup:receipt.cleanup}));
process.exitCode=['PARTIAL_NOT_ACCEPTED','DIAGNOSTIC_ONLY'].includes(receipt.status)&&receipt.cleanup?0:1;
