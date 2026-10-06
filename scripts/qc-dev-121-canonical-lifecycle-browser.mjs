#!/usr/bin/env node
// Render actual product components against task-owned HTTP fixtures. Native PG
// evidence is separate; this runner never claims identity/DB or Production L4.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { createServer } from "vite";
import { chromium } from "playwright";
const root = process.cwd();
const isolation = path.resolve(process.env.DEV121_LIFECYCLE_TEMP_ROOT || "");
assert.ok(isolation.includes("ai-dev-resource-governor") && path.basename(isolation) === "r75-lifecycle", "TASK_OWNED_ISOLATION_REQUIRED");
const temp = fs.mkdtempSync(path.join(isolation, "browser-"));
const output = path.join(root, "output/playwright/dev121-canonical-lifecycle", new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-"));
fs.mkdirSync(output, { recursive: true });
const payload = {partName:"Fixture draft Part",itemKind:"purchased",customSpecification:null,isUniversal:false,materialCode:null,materialLabel:null,colorCode:null,colorLabel:null,surfaceTreatment:null,variantNote:null};
const lifecycle = {intent:"first_release",masterId:"part-one",masterStatus:"Draft",masterHash:"a".repeat(64),formalRowVersion:1};
const target = {targetKey:"part:part-one",axisId:"part-one",scope:"submitted",markers:{submitted:true,change:{kind:"lifecycle",paths:["lifecycle.intent"]},risk:null},evidenceHash:"b".repeat(64),workspace:{kind:"part",entityId:"part-one",revisionId:null,identity:{code:"QC-P01",name:payload.partName,revision:null,purposeCode:null,purposeDescription:null},payload,baselinePayload:payload,files:[],attachments:[],recognition:null}};
const shell = {schemaVersion:"pdm-review-package-v2",requestId:"review-one",requestKind:"part_change",entityType:"part",entityId:"part-one",rowVersion:1,packageHash:"c".repeat(64),submittedAt:"2026-10-03T00:00:00Z",lifecycle,primaryTargetKey:target.targetKey,root:{id:"root-one",code:"QC"},matrix:{rootId:"root-one",rootCode:"QC",evidenceHash:"d".repeat(64),drawings:[],parts:[{axisId:"part-one",targetKey:target.targetKey,code:"QC-P01",revision:null}],cells:[]},targets:[{...target,workspace:undefined,targetId:"part-one",entityType:"part",number:"QC-P01",identity:target.workspace.identity,revision:null,fileCount:0,attachmentCount:0}],actions:[{key:"approve",label:"核准"},{key:"return_for_correction",label:"退回修改"}]};
fs.writeFileSync(path.join(temp,"index.html"),'<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>');
fs.writeFileSync(path.join(temp,"navigation.ts"),`const router={push:(url:string)=>{window.__navigation=url;},replace:(url:string)=>{history.replaceState({},'',url);},refresh:()=>{}};const query=new URLSearchParams(location.search);export const useRouter=()=>router;export const usePathname=()=>location.pathname;export const useSearchParams=()=>query;`);
fs.writeFileSync(path.join(temp,"link.tsx"),`import React from 'react';export default function Link({href,children,...props}:any){return <a href={typeof href==='string'?href:'#'} {...props}>{children}</a>;}`);
fs.writeFileSync(path.join(temp,"image.tsx"),`import React from 'react';export default function Image(props:any){return <img {...props}/>;}`);
fs.writeFileSync(path.join(temp,"main.tsx"),`import React from 'react';import{createRoot}from'react-dom/client';import{PartNumberMatrixWorkspace}from'@/components/part-number-matrix-workspace';import{CanonicalReviewPackageWorkspace}from'@/components/canonical-review-package-workspace';import'@/app/globals.css';const mode=new URL(location.href).searchParams.get('view');createRoot(document.getElementById('root')!).render(mode==='review'?<CanonicalReviewPackageWorkspace requestId="review-one" initialShell={${JSON.stringify(shell)}} initialContractToken="fixture-contract"/>:<PartNumberMatrixWorkspace partId="part-one" workId="work-one"/>);`);
let server, browser, port, firstFailure;
const checks = [], errors = [], commands = [];
const cleanup={browserClosed:false,serverClosed:false,portReleased:false,tempRemoved:false};
function mark(id,details){checks.push({id,status:"PASS",...details});}
try {
  server=await createServer({root:temp,configFile:false,cacheDir:path.join(temp,"cache"),resolve:{alias:{"@":path.join(root,"src"),"next/navigation":path.join(temp,"navigation.ts"),"next/link":path.join(temp,"link.tsx"),"next/image":path.join(temp,"image.tsx"),"react":path.join(root,"node_modules/react"),"react-dom":path.join(root,"node_modules/react-dom"),"lucide-react":path.join(root,"node_modules/lucide-react")},dedupe:["react","react-dom"]},oxc:{jsx:{runtime:"automatic"}},server:{host:"127.0.0.1",port:0,fs:{allow:[root,temp]},watch:{ignored:["**/output/**","**/.git/**"]}}});
  await server.listen();port=server.httpServer.address().port;
  process.stdout.write(JSON.stringify({runtimeDeclaration:{project:root,purpose:"DEV121 actual component rendering; fixture HTTP only; no DB",port,owningProcessTree:`node:${process.pid} -> Vite and task-owned Chromium`,cleanupCondition:"close own Chromium+Vite; confirm listener gone; remove exact browser-* temp",PDM_DATA_DIR:process.env.PDM_DATA_DIR,PDM_REPOSITORY_DIR:process.env.PDM_REPOSITORY_DIR,mutationScope:temp}})+"\n");
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  let intent="edit",rowVersion=1,submitted=false,rejectSave=false;
  const column=()=>({partId:"part-one",partNumber:"QC-P01",sequenceNo:1,formalRowVersion:1,recordStatus:"Draft",lifecycleIntent:intent,canRequestRelease:!submitted,handling:submitted?"reviewer":"owner",canEdit:!submitted,canSubmit:!submitted&&intent==="first_release",disabledReason:null,workId:"work-one",workRowVersion:rowVersion,workOwner:{id:"profile-owner"},valueSource:"work",payload,formalPayload:payload,attachmentCount:0,confirmedAttributes:[]});
  await context.route("**/api/**",async route=>{
    const req=route.request(),url=new URL(req.url()),body=req.postDataJSON();
    const json=(value,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(value)});
    if(url.pathname.includes("matrix-workspace"))return json({data:{root:{id:"root-one",code:"QC"},sourcePartId:"part-one",sourceRowKey:"part:part-one:work",columns:[column(),{...column(),partId:"part-two",partNumber:"QC-P02",recordStatus:"Released",lifecycleIntent:"edit",canRequestRelease:false,canEdit:false,canSubmit:false,workId:null,handling:"none"}]},meta:{actorId:"profile-owner",companyId:"fixture-company",contractToken:"fixture-contract",correlationId:"fixture"}});
    if(url.pathname==="/api/pdm/part-change-works/work-one"&&req.method()==="PATCH"){
      commands.push({method:req.method(),url:url.pathname,body,ifMatch:req.headers()["if-match"]});
      assert.deepEqual(Object.fromEntries(Object.entries(body).filter(([key])=>key!=="lifecycleIntent")),payload);
      if(rejectSave)return json({error:{code:"WORKBENCH_SNAPSHOT_DRIFT",message:"正式資料已變更，請重新載入"}},409);
      intent=body.lifecycleIntent;rowVersion++;return json({data:{workId:"work-one",rowVersion,payload,lifecycleIntent:intent}});
    }
    if(url.pathname.endsWith("/submit")){commands.push({method:req.method(),url:url.pathname,body});submitted=true;return json({data:{requestId:"review-one",rowVersion:rowVersion+1}});}
    if(url.pathname.includes("/targets/"))return json({data:{snapshot:target,drift:{status:"unchanged",changed:false,changedSections:[],currentEvidenceHash:target.evidenceHash}},meta:{contractToken:"fixture-contract"}});
    if(url.pathname.endsWith("/decisions")){commands.push({method:req.method(),url:url.pathname,body});return json({data:{acknowledged:true}});}
    return json({data:[],meta:{contractToken:"fixture-contract"}});
  });
  const page=await context.newPage();page.on("pageerror",error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/`);await page.getByRole("checkbox",{name:"QC-P01 申請首次發行"}).waitFor();
  fs.writeFileSync(path.join(output,"matrix-before.txt"),await page.locator("body").innerText());
  assert.equal(await page.getByRole("button",{name:/送出審核/}).isDisabled(),true);
  assert.equal(await page.getByRole("checkbox",{name:"QC-P02 申請首次發行"}).count(),0);
  await page.screenshot({path:path.join(output,"matrix-draft.png"),fullPage:true});mark("UI01",{releaseOnlyInitiallyDisabled:true,releasedReadOnly:true});
  const checkbox=page.getByRole("checkbox",{name:"QC-P01 申請首次發行"});await checkbox.focus();await page.keyboard.press("Space");
  await page.getByRole("button",{name:"送出審核（1）"}).waitFor();
  assert.equal(await checkbox.isChecked(),true);await page.screenshot({path:path.join(output,"matrix-release-only.png"),fullPage:true});
  await page.getByRole("button",{name:"送出審核（1）"}).click();
  await page.getByText("已送出 1 個料號審核。").waitFor();mark("UI02",{keyboardToggle:true,unchangedAttributes:true,patchAndSubmitObserved:true});
  submitted=false;intent="edit";rowVersion=1;rejectSave=true;
  await page.goto(`http://127.0.0.1:${port}/`);await page.getByRole("checkbox",{name:"QC-P01 申請首次發行"}).waitFor();
  await page.getByRole("checkbox",{name:"QC-P01 申請首次發行"}).check();await page.getByText("正式資料已變更，請重新載入").first().waitFor();
  assert.equal(await page.getByRole("button",{name:/送出審核/}).isDisabled(),true);
  assert.equal(await page.getByRole("checkbox",{name:"QC-P01 申請首次發行"}).isChecked(),false);await page.screenshot({path:path.join(output,"matrix-conflict.png"),fullPage:true});mark("UI03",{failedSaveCannotSubmit:true,intentNotLocallyCommitted:true});
  await page.goto(`http://127.0.0.1:${port}/?view=review`);await page.getByText("首次發行核准",{exact:true}).waitFor();
  fs.writeFileSync(path.join(output,"review-before.txt"),await page.locator("body").innerText());
  assert.equal(await page.locator('input:not([disabled]),textarea:not([disabled]),select:not([disabled])').count(),0);
  await page.screenshot({path:path.join(output,"review-frozen-first-release.png"),fullPage:true});await page.getByRole("button",{name:"核准",exact:true}).click();mark("UI04",{frozenIntentVisible:true,snapshotFieldsReadonly:true,decisionObserved:true});
  await page.setViewportSize({width:390,height:844});await page.reload();await page.getByText("首次發行核准",{exact:true}).waitFor();
  await page.screenshot({path:path.join(output,"review-narrow.png"),fullPage:true});mark("UI05",{viewport:{width:390,height:844},narrowRendered:true});
  assert.deepEqual(errors,[]);
} catch(error){firstFailure={message:error instanceof Error?error.message:String(error),stack:error instanceof Error?error.stack:null};}
finally {
  if(browser){await browser.close();cleanup.browserClosed=true;}else cleanup.browserClosed=true;
  if(server){await server.close();cleanup.serverClosed=true;}else cleanup.serverClosed=true;
  cleanup.portReleased=!port||await new Promise(resolve=>{const socket=net.connect({host:"127.0.0.1",port});socket.once("connect",()=>{socket.destroy();resolve(false);});socket.once("error",()=>resolve(true));});
  assert.equal(path.dirname(path.resolve(temp)),isolation);assert.ok(path.basename(temp).startsWith("browser-"));fs.rmSync(temp,{recursive:true,force:true});cleanup.tempRemoved=!fs.existsSync(temp);
}
const status=!firstFailure&&checks.length===5&&Object.values(cleanup).every(Boolean)?"PASS":"FAIL";
const result={status,evidenceScope:"ACTUAL_PRODUCT_COMPONENTS_FIXTURE_HTTP",releaseAuthority:false,productionWrites:false,checks,commands,errors,firstFailure,cleanup,port,source:Object.fromEntries(["src/components/part-number-matrix-workspace.tsx","src/components/canonical-review-package-workspace.tsx", "scripts/qc-dev-121-canonical-lifecycle-browser.mjs"].map(file=>[file,crypto.createHash("sha256").update(fs.readFileSync(path.join(root,file))).digest("hex")]))};
fs.writeFileSync(path.join(output,"manifest.json"),JSON.stringify(result,null,2)+"\n");process.stdout.write(JSON.stringify({status,evidence:path.join(output,"manifest.json"),checks:checks.length,cleanup,firstFailure})+"\n");process.exitCode=status==="PASS"?0:1;
