import assert from "node:assert/strict";
import {createServer} from "node:http";
import {Readable} from "node:stream";
import {pipeline} from "node:stream/promises";
import fs from "node:fs/promises";
import path from "node:path";
import {chromium} from "playwright";
import {build} from "vite";

/** Render the existing canonical workspace, rather than reproducing its submit
 * action. Only Next navigation is adapted; all selected API requests dispatch
 * the application's real route handlers over this task-owned loopback server. */
export async function verifyAssemblySubmitBrowser({dispatch,workId,exercise,outputDirectory}) {
  assert.match(workId,/^[a-zA-Z0-9-]+$/u);
  const root=process.cwd(),temporaryBase=path.join(root,".tmp");await fs.mkdir(temporaryBase,{recursive:true});
  const temporary=await fs.mkdtemp(path.join(temporaryBase,"dev129-submit-browser-"));
  let browser,server;const calls=[],errors=[];
  try {
    const navigation=path.join(temporary,"navigation.ts");
    await fs.writeFile(navigation,'const router={push:(url:string)=>{(window as any).__navigation=url;},replace:(url:string)=>{history.replaceState({},"",url);},refresh:()=>{location.reload();}};export const useRouter=()=>router;export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);');
    const entry=path.join(temporary,"entry.tsx");
    await fs.writeFile(entry,`import React from "react";import{createRoot}from"react-dom/client";import{CanonicalDrawingChangeWorkspace}from"@/components/canonical-drawing-change-workspace";createRoot(document.getElementById("app")).render(<CanonicalDrawingChangeWorkspace workId="${workId}" returnTo="/done"/>);`);
    const bundle=path.join(temporary,"bundle");
    await build({configFile:false,root,logLevel:"error",define:{"process.env.NODE_ENV":JSON.stringify("development")},oxc:{jsx:{runtime:"automatic"}},
      resolve:{alias:{"@":path.join(root,"src"),"next/navigation":navigation}},
      build:{outDir:bundle,emptyOutDir:false,lib:{entry,name:"Dev129CanonicalSubmit",formats:["iife"],fileName:()=>"workspace.js"}}});
    const names=await fs.readdir(bundle),styles=names.filter(name=>name.endsWith(".css"));
    server=createServer(async(req,res)=>{
      try {
        const url=new URL(req.url,"http://127.0.0.1:"+server.address().port);
        if(url.pathname==="/") {res.writeHead(200,{"content-type":"text/html; charset=utf-8"});return res.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8">${styles.map(name=>`<link rel="stylesheet" href="/${name}">`).join("")}<div id="app"></div><script src="/workspace.js"></script></html>`);}
        const name=url.pathname.slice(1);
        if(names.includes(name)) {res.writeHead(200,{"content-type":name.endsWith(".css")?"text/css":"application/javascript"});return res.end(await fs.readFile(path.join(bundle,name)));}
        const method=req.method,init={method,headers:{...req.headers,"x-fixture-principal":req.headers["x-fixture-principal"]??"fixture"}};
        if(method!=="GET"&&method!=="HEAD"){init.body=Readable.toWeb(req);init.duplex="half";}
        const response=await dispatch(new Request(url,init));calls.push({method,path:url.pathname,status:response.status});
        res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body)await pipeline(Readable.fromWeb(response.body),res);else res.end();
      }catch(error){errors.push(error.message);if(!res.headersSent)res.writeHead(500);res.end();}
    });
    await new Promise((resolve,reject)=>server.once("error",reject).listen(0,"127.0.0.1",resolve));
    const edge=process.platform==="win32"?path.join(process.env["ProgramFiles(x86)"]??"C:/Program Files (x86)","Microsoft/Edge/Application/msedge.exe"):null;
    browser=await chromium.launch({headless:true,...(edge?{executablePath:edge}:{})});
    const page=await browser.newPage();page.on("pageerror",error=>errors.push(error.message));
    const origin="http://127.0.0.1:"+server.address().port;
    console.log(JSON.stringify({purpose:"DEV-129 actual canonical workspace and submit transaction",port:server.address().port,ownerPid:process.pid,cleanup:"close own Edge/browser, listener and temporary bundle"}));
    await page.goto(origin);
    const receipt=await exercise({page,origin,calls});
    if(outputDirectory){await fs.mkdir(outputDirectory,{recursive:true});await fs.writeFile(path.join(outputDirectory,"submit-browser-requests.json"),JSON.stringify(calls,null,2)+"\n",{flag:"wx"});}
    assert.deepEqual(errors,[]);
    return {...receipt,browser:await browser.version(),scope:"actual canonical workspace/submit route/strict v2 package; fixture admission and reviewer provider"};
  }finally{
    await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));
    if(path.dirname(temporary)!==temporaryBase || !path.basename(temporary).startsWith("dev129-submit-browser-"))throw new Error("SUBMIT_BROWSER_CLEANUP_SCOPE_INVALID");
    await fs.rm(temporary,{recursive:true,force:true});
  }
}
