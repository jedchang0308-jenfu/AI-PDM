import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {build} from 'vite';
import {chromium} from 'playwright';

// Real application components and CSS, with explicit API projection fixtures.
// This verifies presentation and interactions; it is not server/authorization evidence.
const root=process.cwd(),base=path.join(root,'.tmp');
await fs.mkdir(base,{recursive:true});
const temporary=await fs.mkdtemp(path.join(base,'dev130-browser-'));
const output=path.join(root,'output/playwright/dev130');
await fs.mkdir(output,{recursive:true});
let browser,server;
const calls=[],errors=[],results=[];
const files=[['native','A.SLDDRW','drawing_2d'],['model','A.SLDPRT','cad_3d']].map(([id,name,role])=>({id,source_file_asset_id:id,display_name:name,file_name:name,file_ext:name.split('.').at(-1).toLowerCase(),role,is_primary:1,current_revision_upload:1}));
function fixture(kind,ready=false){
  const rows=[...files,...(ready?[['pdf','A.pdf','pdf'],['dwg','A.dwg','dwg_dxf']].map(([id,name,role])=>({id,source_file_asset_id:id,display_name:name,file_name:name,file_ext:name.split('.').at(-1),role,is_primary:0,current_revision_upload:1})):[])];
  return {entityType:'drawing',entityId:'drawing',workId:'work',revisionId:'revision',revision:kind==='formal'?'1':'0.2',targetKind:kind,rowVersion:1,payload:{},readonly:false,files:rows,
    identity:{code:'A0001-M01',name:'測試品名與長名稱顯示'},interaction:{mode:'owner_edit',basisState:'current',canMutateContent:true,canSubmit:true,canCancel:true,canApprove:false,canReturn:false,reasonCode:null},
    fileReadiness:{targetKind:kind,ready:kind==='research'||ready,slots:Object.fromEntries(['drawing_2d','cad_3d','pdf','dwg'].map(key=>[key,{present:ready||['drawing_2d','cad_3d'].includes(key),count:ready||['drawing_2d','cad_3d'].includes(key)?1:0}])),blockers:[],warnings:[]}};
}
try{
  const navigation=path.join(temporary,'navigation.ts');
  await fs.writeFile(navigation,'export const useRouter=()=>({push:()=>{},replace:()=>{},refresh:()=>{}});export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);');
  const entry=path.join(temporary,'entry.tsx');
  await fs.writeFile(entry,`import React from 'react';import{createRoot}from'react-dom/client';import{CanonicalDrawingChangeWorkspace}from'@/components/canonical-drawing-change-workspace';import'@/app/styles/tokens.css';import'@/app/globals.css';fetch('/fixture'+location.search).then(r=>r.json()).then(data=>createRoot(document.getElementById('app')).render(<CanonicalDrawingChangeWorkspace workId="work" drawingId="drawing" initialData={data}/>));`);
  const bundle=path.join(temporary,'bundle');
  await build({configFile:false,root,logLevel:'error',define:{'process.env.NODE_ENV':JSON.stringify('development')},oxc:{jsx:{runtime:'automatic'}},resolve:{alias:{'@':path.join(root,'src'),'next/navigation':navigation}},build:{outDir:bundle,emptyOutDir:false,lib:{entry,name:'Dev130Workspace',formats:['iife'],fileName:()=> 'workspace.js'}}});
  const names=await fs.readdir(bundle),styles=names.filter(name=>name.endsWith('.css'));
  server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');calls.push({method:req.method,path:url.pathname});
    const json=value=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(value));};
    try{
      if(url.pathname==='/')return res.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles.map(name=>`<link rel="stylesheet" href="/${name}">`).join('')}<div id="app"></div><script>window.process={env:{NODE_ENV:'development'},browser:true,nextTick:queueMicrotask}</script><script src="/workspace.js"></script></html>`);
      if(url.pathname==='/fixture')return json(fixture(url.searchParams.get('kind')??'research',url.searchParams.has('ready')));
      if(names.includes(url.pathname.slice(1))){res.writeHead(200,{'content-type':url.pathname.endsWith('.css')?'text/css':'application/javascript'});return res.end(await fs.readFile(path.join(bundle,url.pathname.slice(1))));}
      if(url.pathname.endsWith('/assembly-packages'))return json({data:null});
      const session={id:'session',status:'review_ready',sourceContextType:'drawing_revision',sourceContextId:'revision',sourceAssetIds:['native','model'],rowVersion:1,warningCount:0,conflictCount:0,errorSummary:null,sources:files.map(f=>({id:f.id,fileName:f.file_name,sourceRole:f.role})),candidates:[],pdfOcrSources:[],adapterHealth:{nativeMetadata:{state:'ready',affectedSources:[]}}};
      if(url.pathname.endsWith('/recognition-session')||url.pathname==='/api/numbering/recognition-sessions/session')return json({session});
      if(url.pathname.startsWith('/api/pdm/file-assets/')){
        if(url.pathname.includes('/pdf')){res.writeHead(500);return res.end('PDF fixture read failure');}
        res.writeHead(200,{'content-type':'image/png'});return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));
      }
      return json({data:null});
    }catch(error){errors.push(error.message);res.writeHead(500);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  console.log(JSON.stringify({project:root,purpose:'DEV-130 actual workspace presentation with fixture API projections',port:server.address().port,ownerPid:process.pid,cleanup:'close own Edge, listener, temporary bundle'}));
  browser=await chromium.launch({headless:true,executablePath:path.join(process.env['ProgramFiles(x86)']??'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')});
  for(const width of [1440,390])for(const scenario of ['research','formal','formal-ready']){
    const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${origin}/?kind=${scenario.startsWith('formal')?'formal':'research'}${scenario==='formal-ready'?'&ready=1':''}&view=two-d`);
    await page.getByRole('heading',{name:'A0001-M01',exact:true}).waitFor();
    await page.getByRole('button',{name:/加入其他檔案/}).waitFor();
    if(scenario==='research'){
      await page.getByText('目前顯示簡易預覽。若要查看尺寸、圖框或完整圖面，請上傳 PDF。',{exact:true}).waitFor();
      await page.getByText('已完成原生檔屬性辨識',{exact:true}).waitFor();
      assert.equal(await page.getByLabel('正式版必要檔案狀態').count(),0);
      assert.equal(await page.getByRole('button',{name:'上傳 PDF',exact:true}).count(),1);
      await page.locator('[data-preview-rendered-mode="image"]').first().waitFor();
      const notice=await page.locator('.dev130-simple-preview').boundingBox();
      const frame=await page.locator('.drawing-preview-frame').boundingBox();
      assert.ok(notice&&frame&&notice.y>=frame.y&&notice.y+notice.height<=frame.y+frame.height+1,'simple preview notice must remain inside its visible preview frame');
    }else{
      const readiness=page.getByLabel('正式版必要檔案狀態');await readiness.waitFor();
      if(scenario==='formal-ready'){
        await readiness.getByText('正式版必要檔案已齊備').waitFor();
        await page.getByText('PDF 無法讀取，已改用本版簡易預覽。若要查看尺寸、圖框或完整圖面，請重新上傳 PDF。',{exact:true}).waitFor();
        await page.locator('[data-preview-rendered-mode="image"]').first().waitFor();
      }
      else{
        assert.equal(await readiness.locator('.dev130-formal-readiness-slots > span').count(),4);
        assert.equal(await readiness.locator('.is-missing').count(),2);
        await readiness.getByText('DWG',{exact:true}).scrollIntoViewIfNeeded();
        assert.equal(await readiness.getByText('DWG',{exact:true}).isVisible(),true);
        assert.equal(await page.getByRole('button',{name:'送出正式版',exact:true}).isDisabled(),true);
      }
    }
    const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
    assert.ok(dimensions.scroll<=dimensions.viewport+1,JSON.stringify({scenario,width,...dimensions}));
    await page.screenshot({path:path.join(output,`${scenario}-${width}.png`),fullPage:true});
    results.push({scenario,width,passed:true});await page.close();
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify({scope:'UI fixture projection only; server and authorization require separate evidence',results,calls,errors},null,2));
  console.log(JSON.stringify({passed:results.length,output}));
}finally{
  await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));
  if(path.dirname(temporary)!==base||!path.basename(temporary).startsWith('dev130-browser-'))throw new Error('CLEANUP_SCOPE_INVALID');
  await fs.rm(temporary,{recursive:true,force:true});
}
