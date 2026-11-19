import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { build } from "vite";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");

// The test caller dispatches the real work routes in its isolated PostgreSQL fixture.
// Only this loopback origin and this one file panel are exposed to the browser.
export async function verifyAssemblyPackageBrowser(dispatch, archivePath, {workId="work",fileName="UJoint-browser.zip",receivedArchivePath=null,afterUpload=null,
  inputDirectory=null,inputFiles=null,canonical=false}={}) {
  const root = process.cwd();
  const tempBase = path.join(root, ".tmp");
  await fs.mkdir(tempBase, {recursive:true});
  const dir = await fs.mkdtemp(path.join(tempBase,"dev129-browser-"));
  assert.match(workId,/^[a-zA-Z0-9-]+$/u);
  const base = `/api/pdm/drawing-revision-works/${workId}/assembly-packages`;
  const calls = [];
  let browser, server;
  try {
    const bytes = await fs.readFile(archivePath);
    const entry = path.join(dir,"entry.tsx");
    const unified=Boolean(inputDirectory || inputFiles || canonical);
    const navigation=path.join(dir,"navigation.ts");
    await fs.writeFile(navigation,'const router={push:(href:string)=>{(window as any).__navigation=href}};export const useRouter=()=>router;export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);');
    if(canonical) await fs.writeFile(entry,`import React from "react";import{createRoot}from"react-dom/client";import{CanonicalDrawingChangeWorkspace}from"@/components/canonical-drawing-change-workspace";import "@/app/styles/tokens.css";import "@/app/globals.css";createRoot(document.getElementById("app")).render(<CanonicalDrawingChangeWorkspace workId="${workId}"/>);`);
    else
    await fs.writeFile(entry,`import React from "react"; import { createRoot } from "react-dom/client";
      import { DrawingAssemblyPackagePanel } from "@/components/drawing-assembly-package-panel";
      ${unified ? 'import {DrawingWorkspaceUpload} from "@/components/drawing-workspace-upload"; import "@/app/styles/tokens.css"; import "@/app/globals.css";' : ''}
      createRoot(document.getElementById("app")).render(<DrawingAssemblyPackagePanel base="${base}" editable
      ${unified ? `uploadControl={context=><DrawingWorkspaceUpload base="${base}" code=${JSON.stringify(fileName.replace(/\.zip$/iu,""))} compact={false} disabled={!context.ready}
        activePackageId={context.activePackageId} downloadHref={context.downloadHref} archiveName={context.archiveName}
        onBegin={async()=>{}} onComplete={async()=>{}} onPendingChange={()=>{}} onPackageBusy={context.setBusy}
        onUploadFile={async()=>{throw new Error("This native fixture must not assign child drawings as the assembly master")}}/>}` : ''}/>);`);
    const output = path.join(dir,"bundle");
    await build({configFile:false,root,logLevel:"error",define:{"process.env.NODE_ENV":JSON.stringify("development")},
      oxc:{jsx:{runtime:"automatic"}}, resolve:{alias:{"@":path.join(root,"src"),"next/navigation":navigation}},
      build:{outDir:output,emptyOutDir:false,lib:{entry,name:"Dev129Panel",formats:["iife"],fileName:()=>"panel.js"}}});
    const code = await fs.readFile(path.join(output,"panel.js"));
    const css=(await fs.readdir(output)).filter(name=>name.endsWith(".css"));
    const edge = process.platform==="win32" ? path.join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)","Microsoft/Edge/Application/msedge.exe") : null;
    browser = await chromium.launch({headless:true,...(edge?{executablePath:edge}:{})});
    const page = await browser.newPage({acceptDownloads:true});
    const pageErrors=[];
    page.on("pageerror",error=>pageErrors.push(error.message));
    server=createServer(async(req,res)=>{
      try {
        const url=new URL(req.url,"http://127.0.0.1:"+server.address().port);
        if(url.pathname==="/") {
          res.writeHead(200,{"content-type":"text/html; charset=utf-8"});
          return res.end('<!doctype html><html lang="zh-Hant"><meta charset="utf-8">'+css.map(name=>`<link rel="stylesheet" href="/${name}">`).join("")+'<div id="app"></div><script>window.process={env:{NODE_ENV:"development"},browser:true,nextTick:queueMicrotask}</script><script src="/panel.js"></script></html>');
        }
        if(url.pathname==="/panel.js") {res.writeHead(200,{"content-type":"application/javascript"});return res.end(code);}
        if(css.includes(url.pathname.slice(1))){res.writeHead(200,{"content-type":"text/css"});return res.end(await fs.readFile(path.join(output,url.pathname.slice(1))));}
        if(!url.pathname.startsWith(canonical?base.replace(/\/assembly-packages$/u,""):base)) {res.writeHead(404,{"content-type":"application/json"}); return res.end('{}');}
        const method=req.method;
        calls.push([method,url.pathname]);
        const init={method,headers:{...req.headers,"x-fixture-principal":"fixture"}};
        if(method!=="GET" && method!=="HEAD") {init.body=Readable.toWeb(req);init.duplex="half";}
        const response=await dispatch(new Request(url,init));
        res.writeHead(response.status,Object.fromEntries(response.headers));
        if(response.body) await pipeline(Readable.fromWeb(response.body),res); else res.end();
      } catch(error) {
        if(!res.headersSent) res.writeHead(500);
        res.end();
        pageErrors.push(error.message);
      }
    });
    await new Promise((resolve,reject)=>server.once("error",reject).listen(0,"127.0.0.1",resolve));
    console.log(JSON.stringify({purpose:"DEV-129 Edge file panel with isolated work routes",port:server.address().port,ownerPid:process.pid,cleanup:"close server and browser at fixture exit"}));
    await page.goto("http://127.0.0.1:"+server.address().port);
    let expectedFileName=fileName;
    if(canonical && (inputFiles || inputDirectory)) {
      const snapshot=await dispatch(new Request("http://localhost"+base.replace(/\/assembly-packages$/u,""),{headers:{"x-fixture-principal":"fixture"}}));
      assert.equal(snapshot.status,200);const current=await snapshot.json();
      expectedFileName=current.data.identity.code+".zip";
    }
    // A previous fixture upload may already be active when this optional case runs.
    const upload=unified?page.getByRole("button",{name:/^(拖入檔案或資料夾|加入檔案)/u}):page.getByRole("button",{name:/^(上傳組立包|補正組立包)$/});
    try {
      if(inputDirectory){
        await page.getByRole("button",{name:"其他選檔方式"}).click();
        const [picker]=await Promise.all([page.waitForEvent("filechooser",{timeout:12000}),page.getByRole("button",{name:"選擇資料夾",exact:true}).click()]);
        await picker.setFiles(inputDirectory);
      }else{
        const [picker]=await Promise.all([page.waitForEvent("filechooser",{timeout:12000}),upload.click({timeout:12000})]);
        await picker.setFiles(inputFiles??{name:fileName,mimeType:"application/zip",buffer:bytes});
      }
    } catch(error) {
      throw new Error(JSON.stringify({message:error.message,pageErrors,calls,pageText:(await page.locator("body").innerText()).slice(0,800)}));
    }
    try {await page.getByRole("status").filter({hasText:`${expectedFileName} · 等待 Windows 解析`}).waitFor();}
    catch(error){throw new Error(JSON.stringify({message:error.message,pageErrors,calls,pageText:(await page.locator("body").innerText()).slice(-1600)}));}
    const downloading=page.waitForEvent("download");
    await page.getByRole("link",{name:"下載組立包"}).click();
    const download=await downloading;
    assert.equal(download.suggestedFilename(),expectedFileName);
    const downloaded=await fs.readFile(await download.path());
    assert.equal(digest(bytes),digest(downloaded));
    if(receivedArchivePath) {
      await fs.mkdir(path.dirname(receivedArchivePath),{recursive:true});
      try {await fs.writeFile(receivedArchivePath,downloaded,{flag:"wx"});}
      catch(error){if(error.code!=="EEXIST")throw error;assert.equal(digest(await fs.readFile(receivedArchivePath)),digest(downloaded),"received archive path already contains another source");}
    }
    assert.equal(calls.filter(([method,pathname])=>method==="POST" && pathname===base).length,1);
    assert.equal(calls.filter(([method,pathname])=>method==="GET" && pathname.endsWith("/download")).length,1);
    const background=afterUpload?await afterUpload({page,base}):null;
    assert.deepEqual(pageErrors,[]);
    return {uploadedBytes:bytes.length,downloadSha256:digest(downloaded),browser:await browser.version(),
      inputMode:inputDirectory?"directory":inputFiles?"multiple-files":"zip",uploadSelections:1,downloadClicks:1,scope:canonical?"actual canonical workspace and work routes, isolated PostgreSQL, fixture Principal":"real file panel and work routes, isolated PostgreSQL, fixture Principal",background};
  } finally {
    await browser?.close();
    if(server?.listening) await new Promise(resolve=>server.close(resolve));
    if (path.dirname(dir)===tempBase && path.basename(dir).startsWith("dev129-browser-")) await fs.rm(dir,{recursive:true,force:true});
  }
}
