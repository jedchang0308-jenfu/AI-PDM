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
export async function verifyAssemblyPackageBrowser(dispatch, archivePath, {workId="work",fileName="UJoint-browser.zip",receivedArchivePath=null,afterUpload=null}={}) {
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
    await fs.writeFile(entry,`import React from "react"; import { createRoot } from "react-dom/client";
      import { DrawingAssemblyPackagePanel } from "@/components/drawing-assembly-package-panel";
      createRoot(document.getElementById("app")).render(<DrawingAssemblyPackagePanel base="${base}" editable/>);`);
    const output = path.join(dir,"bundle");
    await build({configFile:false,root,logLevel:"error",define:{"process.env.NODE_ENV":JSON.stringify("development")},
      oxc:{jsx:{runtime:"automatic"}}, resolve:{alias:{"@":path.join(root,"src")}},
      build:{outDir:output,emptyOutDir:false,lib:{entry,name:"Dev129Panel",formats:["iife"],fileName:()=>"panel.js"}}});
    const code = await fs.readFile(path.join(output,"panel.js"));
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
          return res.end('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><div id="app"></div><script src="/panel.js"></script></html>');
        }
        if(url.pathname==="/panel.js") {res.writeHead(200,{"content-type":"application/javascript"});return res.end(code);}
        if(!url.pathname.startsWith(base)) {res.writeHead(404); return res.end();}
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
    // A previous fixture upload may already be active when this optional case runs.
    const upload=page.getByRole("button",{name:/^(上傳組立包|補正組立包)$/});
    try {
      const [picker]=await Promise.all([page.waitForEvent("filechooser",{timeout:12000}),upload.click({timeout:12000})]);
      await picker.setFiles({name:fileName,mimeType:"application/zip",buffer:bytes});
    } catch(error) {
      throw new Error(JSON.stringify({message:error.message,pageErrors,calls,pageText:(await page.locator("body").innerText()).slice(0,800)}));
    }
    await page.getByRole("status").filter({hasText:`${fileName} · 等待 Windows 解析`}).waitFor();
    const downloading=page.waitForEvent("download");
    await page.getByRole("link",{name:"下載組立包"}).click();
    const download=await downloading;
    assert.equal(download.suggestedFilename(),fileName);
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
      uploadSelections:1,downloadClicks:1,scope:"real file panel and work routes, isolated PostgreSQL, fixture Principal",background};
  } finally {
    await browser?.close();
    if(server?.listening) await new Promise(resolve=>server.close(resolve));
    if (path.dirname(dir)===tempBase && path.basename(dir).startsWith("dev129-browser-")) await fs.rm(dir,{recursive:true,force:true});
  }
}
