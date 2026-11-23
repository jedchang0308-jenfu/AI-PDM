import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const origin='http://localhost:1020';
const detailPath='/numbering/drawings?detail=cw_d431bb9e-35d0-4232-a278-6fe1f46cef89';
const out=path.resolve('output/qa/a0007-preview-recovery',new Date().toISOString().replace(/[:.]/gu,'-'));
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  console.log('stage: local login');
  for(let attempt=0;attempt<2;attempt++) {
    await page.goto(origin+'/login',{timeout:120000});
    await page.getByRole('button',{name:'使用鉦富平台本機測試身分',exact:true}).click({timeout:90000});
    await page.getByRole('button',{name:'使用測試用超級管理員',exact:true}).click({timeout:90000});
    await page.waitForURL(url=>url.origin===origin,{timeout:120000});
    if(new URL(page.url()).pathname!='/login')break;
    if(attempt===1)throw new Error('LOCAL_LOGIN_FAILED');
  }
  await page.goto(origin+detailPath,{timeout:120000});
  console.log('stage: A0007 readback');
  const response=await page.request.get(origin+'/api/numbering/drawings/workbench/cw_d431bb9e-35d0-4232-a278-6fe1f46cef89?sections=primary',{timeout:120000});
  const body=await response.json();
  const presentation=body.data?.presentation;
  if(!presentation)throw new Error('DETAIL_PROJECTION_MISSING:'+response.status());
  const slots=presentation.previews;
  const result={slots,reads:[]};
  for(const slot of slots) {
    if(!slot.mediaHref)continue;
    const media=await page.request.get(origin+slot.mediaHref,{timeout:120000});
    const bytes=await media.body();
    result.reads.push({kind:slot.kind,status:media.status(),mime:media.headers()['content-type'],bytes:bytes.length,signature:bytes.subarray(0,5).toString('ascii')});
  }
  await page.screenshot({path:path.join(out,'before-worker.png')});
  await fs.writeFile(path.join(out,'readback.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
  if(process.argv.includes('--verify-ready')) {
    if(slots.some(slot=>slot.state!=='ready')||result.reads.length!==2||result.reads.some(read=>read.status!==200))throw new Error('A0007_PREVIEW_READ_FAILED');
    await page.locator('[data-preview-media="image"]').waitFor({timeout:120000});
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('img[data-preview-media="image"]')).some(image=>image.complete&&image.naturalWidth>0),null,{timeout:120000});
    await page.locator('[data-pdf-render-state="ready"] canvas').waitFor({timeout:120000});
    await page.screenshot({path:path.join(out,'verified-ready.png')});
    await fs.writeFile(path.join(out,'ui-result.json'),JSON.stringify({threeDImageLoaded:true,twoDPdfCanvasRendered:true,viewport:{width:1440,height:900}}));
    console.log('PASS: A0007 protected 3D image and 2D PDF rendered');
  }
  if(process.argv.includes('--native')) {
    const { configureAndVerifyLocalWorker }=await import('./lib/a0007-local-preview-worker.mjs');
    await configureAndVerifyLocalWorker({page,origin,out});
  }
} finally {await browser.close();}
