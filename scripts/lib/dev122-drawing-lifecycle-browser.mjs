import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const drawingLifecycleVariants=['Draft-minor','Released-minor','Draft-major','Released-major'];
export const drawingDecisionDeniedMessage='目前帳號沒有此審核的決策權限。請公司管理員確認有效的工作區指派與 approval.request.decide 權限；權限更新後重新整理本頁。';

/** Normal mounted UI on task-owned PG. No API substitutes for lifecycle clicks. */
export async function runDrawingLifecycleUI({fixture,page,context,sessions,origin,runtime,output,
  navigate,waitResponse,healthy,screenshot,progress,control,evidence,save}) {
  const prefix=fixture.variant+'-'+fixture.width,hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  let actor='owner',workId=fixture.drawingWorkId,expired=false;
  evidence.responses=[];evidence.snapshots=[];evidence.actors=[];evidence.decisions=[];
  const capture=async(label,pending,status=200)=>{
    const response=await pending;await response.finished();const raw=await response.text(),body=JSON.parse(raw);
    const safe=raw.replace(/("(?:contractToken|candidateToken)"\s*:\s*)"[^"\\]*(?:\\.[^"\\]*)*"/gu,'$1"[REDACTED]"');
    const file=path.join(output,prefix+'-'+label+'-response.json');fs.writeFileSync(file,safe);
    evidence.responses.push({label,actor,method:response.request().method(),pathname:new URL(response.url()).pathname,
      status:response.status(),cacheControl:response.headers()['cache-control']??null,contentType:response.headers()['content-type']??null,
      originalSha256:hash(raw),redactedSha256:hash(safe),file});save();assert.equal(response.status(),status,safe);return body;
  };
  const channel=async action=>{
    const nonce=randomUUID(),request=path.join(runtime,'grant-fixture-request.json'),result=path.join(runtime,'grant-fixture-result.json');
    fs.rmSync(result,{force:true});fs.writeFileSync(request+'.tmp',JSON.stringify({action,nonce}));fs.renameSync(request+'.tmp',request);
    const deadline=Date.now()+20000;while(Date.now()<deadline) {
      if(fs.existsSync(result)) {const value=JSON.parse(fs.readFileSync(result,'utf8'));if(value.nonce===nonce){assert.equal(value.status,'APPLIED',JSON.stringify(value));return value;}}
      await new Promise(resolve=>setTimeout(resolve,50));
    }throw new Error('G_LIFECYCLE_FIXTURE_CHANNEL_TIMEOUT:'+action);
  };
  const snapshot=async label=>{
    const result=await channel('owned-lifecycle-snapshot');assert.equal(result.readOnly,true);assert.equal(result.isolation,'repeatable read');assert.equal(result.tableCount,165);
    const rows=Object.fromEntries(Object.entries(result.rows).map(([table,items])=>[table,items.map(item=>{assert.deepEqual(Object.keys(item),['row']);return item.row;})]));
    const bytes=JSON.stringify(rows),file=path.join(output,prefix+'-'+label+'-owned.json');fs.writeFileSync(file,bytes);
    evidence.snapshots.push({label,file,sha256:hash(bytes),tableCount:165,readOnly:true});save();return rows;
  };
  const asActor=async name=>{
    assert.ok(sessions[name]);await context.addCookies([{name:'__session',value:sessions[name],url:origin,httpOnly:true,sameSite:'Lax'}]);
    actor=name;const matches=(await context.cookies(origin)).filter(item=>item.name==='__session');
    assert.equal(matches.length,1);assert.equal(matches[0].value,sessions[name]);evidence.actors.push({actor:name,matchesSignedFixture:true});save();
  };
  const dom=async label=>{
    fs.writeFileSync(path.join(output,prefix+'-'+label+'-dom.html'),await page.content());
    fs.writeFileSync(path.join(output,prefix+'-'+label+'-accessibility.yml'),await page.locator('body').ariaSnapshot());
    await screenshot(fixture.variant+'-'+label);
  };
  const master=rows=>rows.drawing_numbers.find(item=>item.id===fixture.drawingMasterId);
  const pointer=rows=>rows.canonical_workbench_states.filter(item=>item.canonical_entity_id===fixture.drawingId&&item.data_layer==='drawing_production');
  const mapping=rows=>rows.drawings.find(item=>item.id===fixture.drawingId);
  const unrelated=rows=>({parts:rows.part_numbers,masters:rows.drawing_numbers.filter(item=>item.id!==fixture.drawingMasterId)});
  const assertMapping=rows=>{assert.ok(master(rows));assert.equal(mapping(rows).formal_drawing_number_id,fixture.drawingMasterId);};
  const enterDrawing=async(label,advance=false)=>{
    await asActor('owner');await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
    await page.locator('.clean-workbench-list').getByRole('link',{name:'圖號工作台',exact:true}).click();await page.waitForURL(location=>location.pathname==='/numbering/drawings');
    const list=waitResponse(response=>new URL(response.url()).pathname==='/api/numbering/drawings/workbench'&&new URL(response.url()).searchParams.get('query')===fixture.drawingNumber);
    await page.getByRole('textbox',{name:'搜尋',exact:true}).fill(fixture.drawingNumber);await capture(label+'-list',list);
    const rows=await snapshot(label+'-entry');assertMapping(rows);
    const source=rows.canonical_workbench_states.find(item=>item.canonical_entity_id===fixture.drawingId&&(advance
      ?item.data_layer===fixture.sourceLayer&&item.handling==='none'&&item.work_id===null:item.work_id===workId));assert.ok(source,'G_SOURCE_ROW_MISSING');
    const row=page.locator(`tr[data-row-key="cw_${source.id}"]`);await row.getByRole('button',{name:fixture.drawingNumber,exact:true}).click();
    if(advance) {
      const targets=waitResponse(response=>new URL(response.url()).pathname===`/api/pdm/drawings/${fixture.drawingId}/revision-targets`);
      await page.getByRole('button',{name:'進版',exact:true}).click();const candidates=await capture(label+'-targets',targets);
      assert.ok(candidates.data.candidates.some(item=>item.kind===fixture.nextKind&&item.enabled));
      const dialog=page.getByRole('dialog',{name:'建立進版工作',exact:true});await dialog.waitFor();
      await dialog.locator(`input[name="revision-target"][value="${fixture.nextKind}"]`).check();
      const started=waitResponse(response=>new URL(response.url()).pathname===`/api/pdm/drawings/${fixture.drawingId}/revision-works`&&response.request().method()==='POST');
      await dialog.getByRole('button',{name:'建立進版工作',exact:true}).click();workId=(await capture(label+'-started',started)).data.workId;assert.ok(workId);
    }else await page.getByRole('button',{name:'進行編輯',exact:true}).click();
    await page.waitForURL(location=>/\/numbering\/drawings\/.+\/workspace$/u.test(location.pathname));
    await page.locator('.dev079-workspace-file-upload input[type="file"]').waitFor({state:'attached'});return rows;
  };
  const uploadPair=async()=>{
    const sources=[{extension:'SLDDRW',relative:'NCRF-e1e1a32a-322d-4504-bcdc-7d565fc39876-A0029-M01.SLDDRW',sha256:'06fd8358ce29411ea49ae466e1404b0ecc2fc964bbc98534d2df897ab09453bd'},
      {extension:'SLDPRT',relative:'NCRF-a8ebd160-9779-43ae-be1b-17ca00fcd759-A0029.SLDPRT',sha256:'d3f2349aa36baf24d3e7fc0044cd2004897e62137bbb279b5da329f6521dfc39'}];
    for(const input of sources) {
      const file=path.join('C:/VIBE CODING/AI_PDM/data/repository/candidate-revisions/company-jenfu/NCR-58d69728-cc3f-4d97-95fb-2957f62630d8',input.relative);
      const bytes=fs.readFileSync(file);assert.equal(hash(bytes),input.sha256);
      await page.locator('.dev079-workspace-file-upload input[type="file"]').setInputFiles({name:prefix+'.'+input.extension,mimeType:'application/octet-stream',buffer:bytes});
      const pending=waitResponse(response=>new URL(response.url()).pathname===`/api/pdm/drawing-revision-works/${workId}/files`&&response.request().method()==='POST');
      await page.getByRole('button',{name:'上傳所選檔案',exact:true}).click();await capture('upload-'+input.extension,pending);assert.equal(hash(fs.readFileSync(file)),input.sha256);
    }
    await page.getByText('本版次 2D 與 3D 主檔已齊備。',{exact:true}).waitFor();
    const axes=[];for(const axis of ['formState','fitState','functionState']) {
      const select=page.locator(`select[data-fff-axis="${axis}"]`);
      if(fixture.nextKind==='production')await select.waitFor({state:'visible'});
      if(await select.count()) {
        if(await select.inputValue()!=='no_impact') {
          const pending=waitResponse(response=>new URL(response.url()).pathname===`/api/pdm/drawing-revision-works/${workId}`&&response.request().method()==='PATCH');
          await select.selectOption('no_impact');await capture('fff-'+axis,pending);
        }
        axes.push({axis,value:await select.inputValue()});
      }
    }
    if(fixture.nextKind==='production')assert.equal(axes.length,3);evidence.uploads=sources.map(({extension,sha256})=>({extension,sha256,extractor:'NOT_ASSERTED'}));evidence.fff=axes;save();
  };
  const submit=async label=>{
    const pending=waitResponse(response=>new URL(response.url()).pathname===`/api/pdm/drawing-revision-works/${workId}/submit`&&response.request().method()==='POST');
    const button=page.getByRole('button',{name:'送出審核',exact:true});await button.waitFor();assert.equal(await button.isEnabled(),true);await button.click();
    const body=await capture(label,pending);await page.waitForURL(location=>location.pathname==='/numbering/drawings');assert.ok(body.data.requestId);return body.data.requestId;
  };
  const review=async(requestId,label)=>{
    await asActor('reviewer');await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await navigate(/^審核工作台(?:，.*)?$/u);
    await page.waitForURL(location=>location.pathname==='/approvals');await page.getByRole('textbox',{name:'搜尋圖號、料號、品名或送審者',exact:true}).fill(fixture.drawingNumber);
    const row=page.locator('[data-approval-workbench-row="true"]').filter({hasText:fixture.drawingNumber});await row.waitFor({state:'visible'});await row.focus();
    const target=waitResponse(response=>new URL(response.url()).pathname===`/api/pdm/review-requests/${requestId}/targets/drawing/${fixture.drawingId}`);
    await page.keyboard.press('Enter');await page.waitForURL(location=>location.pathname==='/approvals/'+requestId);const body=await capture(label+'-target',target);
    assert.equal(body.data.readonly,true);assert.equal(body.data.requestId,requestId);assert.equal(body.data.snapshot.targetKey,'drawing:'+fixture.drawingId);
    const controls=await page.locator('.canonical-review-package input,.canonical-review-package select,.canonical-review-package textarea').evaluateAll(items=>items.map(item=>({disabled:item.disabled,readOnly:item.readOnly??false})));
    assert.ok(controls.length&&controls.every(item=>item.disabled||item.readOnly),'G_EDITABLE_REVIEW_TARGET');
    const rows=await snapshot(label+'-target');const request=rows.pdm_work_review_requests.find(item=>item.id===requestId);assert.ok(request);assert.equal(request.reviewer_user_id,'dev122-profile-reviewer');
    const envelope=typeof request.snapshot_payload==='string'?JSON.parse(request.snapshot_payload):request.snapshot_payload;
    const frozen=envelope.targets.find(item=>item.targetKey==='drawing:'+fixture.drawingId);assert.equal(body.data.targetHash,frozen.evidenceHash);assert.deepEqual(body.data.snapshot,frozen);
    evidence.reviewPackages??=[];evidence.reviewPackages.push({requestId,reviewer:request.reviewer_user_id,hash:request.snapshot_hash,targetHash:body.data.targetHash,
      targetRevisionId:body.data.snapshot.workspace.revisionId,kind:envelope.decisionBasis.kind,lifecycle:envelope.decisionBasis.lifecycle});save();await dom(label);
  };
  const decide=async(requestId,decision,status=200,label=decision)=>{
    const pending=waitResponse(response=>new URL(response.url()).pathname===`/api/pdm/review-requests/${requestId}/decisions`&&response.request().method()==='POST');
    await page.getByRole('button',{name:decision==='approve'?'核准':'退回修改',exact:true}).click();const body=await capture(label,pending,status);
    evidence.decisions.push({actor,requestId,decision,status});save();if(status===200)await page.waitForURL(location=>location.pathname==='/approvals');return body;
  };
  const readiness=async(label,expected)=>{
    await asActor('owner');await page.goto(origin+'/',{waitUntil:'domcontentloaded'});await navigate(/^技術移轉(?:，.*)?$/u);await page.waitForURL(location=>location.pathname==='/technical-transfer');
    const card=page.locator('article.technical-transfer-row').filter({hasText:fixture.packageTitle});await card.waitFor({state:'visible'});
    const before=await snapshot(label+'-before-readiness');
    const pending=waitResponse(response=>new URL(response.url()).pathname===`/api/transfer-packages/${fixture.packageId}/readiness-summary`);
    await card.getByRole('link',{name:'開啟案件',exact:true}).click();const body=await capture(label+'-readiness',pending);assert.equal(body.readiness.ready,expected,JSON.stringify(body));
    const button=page.getByRole('button',{name:'送交整包審核',exact:true});await button.waitFor();assert.equal(await button.isDisabled(),!expected);
    if(!expected)assert.ok(body.readiness.blockers.some(item=>item.code==='transfer_official_item_invalid'));
    await dom(label+'-readiness');assert.deepEqual(await snapshot(label+'-after-readiness'),before,'G_READINESS_READ_MUTATED_ROWS');
    evidence.readiness??=[];evidence.readiness.push({label,ready:expected,buttonDisabled:!expected,all165TablesUnchanged:true});save();
  };
  const ownerReload=async rows=>{
    await asActor('owner');await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
    await page.locator('.clean-workbench-list').getByRole('link',{name:'圖號工作台',exact:true}).click();await page.waitForURL(location=>location.pathname==='/numbering/drawings');
    const listed=waitResponse(response=>new URL(response.url()).pathname==='/api/numbering/drawings/workbench'&&new URL(response.url()).searchParams.get('query')===fixture.drawingNumber);
    await page.getByRole('textbox',{name:'搜尋',exact:true}).fill(fixture.drawingNumber);await capture('owner-final-list',listed);
    const state=pointer(rows)[0]??rows.canonical_workbench_states.find(item=>item.canonical_entity_id===fixture.drawingId&&item.data_layer==='drawing_rd'&&item.handling==='none'&&item.work_id===null);assert.ok(state);
    const rowKey='cw_'+state.id,detailPath='/api/numbering/drawings/workbench/'+encodeURIComponent(rowKey);
    const initialDetail=waitResponse(response=>new URL(response.url()).pathname===detailPath);
    await page.locator(`tr[data-row-key="${rowKey}"]`).getByRole('button',{name:fixture.drawingNumber,exact:true}).click();
    const initialBody=await capture('owner-final-detail',initialDetail);assert.equal(initialBody.data.row.entityId,fixture.drawingId);assert.equal(initialBody.data.row.code,fixture.drawingNumber);
    await page.locator('.canonical-drawer-body').waitFor();const before=await snapshot('before-owner-drawing-reload');
    const pending=waitResponse(response=>new URL(response.url()).pathname===detailPath);await page.reload({waitUntil:'domcontentloaded'});
    const body=await capture('owner-drawing-reload',pending);assert.equal(body.data.row.rowKey,rowKey);assert.equal(body.data.row.entityId,fixture.drawingId);assert.equal(body.data.row.code,fixture.drawingNumber);
    await page.locator('.canonical-drawer-body').waitFor();assert.equal(await page.getByText('正在載入明細…',{exact:true}).count(),0);await dom('owner-drawing-reload');
    const after=await snapshot('after-owner-drawing-reload');assert.deepEqual(unrelated(after),unrelated(before));assert.deepEqual(master(after),master(before));assert.deepEqual(pointer(after),pointer(before));assert.deepEqual(mapping(after),mapping(before));
    evidence.ownerReload={rowKey,code:body.data.row.code,revision:body.data.row.revision,layer:body.data.row.layer,revisionId:state.revision_id,lifecycleRowsUnchanged:true};save();
  };
  try {
    const initial=await snapshot('initial');assertMapping(initial);evidence.initial={master:master(initial),pointer:pointer(initial),mapping:mapping(initial)};
    await readiness('before',fixture.variant.startsWith('Released'));
    await enterDrawing('owner',!workId);const created=await snapshot('created');assertMapping(created);assert.deepEqual(master(created),master(initial));assert.deepEqual(unrelated(created),unrelated(initial));
    if(fixture.variant==='Released-minor') {
      const before=pointer(initial),after=pointer(created);assert.equal(before.length,1);assert.equal(after.length,1);
      assert.deepEqual(after[0],{...before[0],row_version:Number(before[0].row_version)+1,updated_at:after[0].updated_at});
    }else assert.deepEqual(pointer(created),pointer(initial));
    await uploadPair();await page.reload({waitUntil:'domcontentloaded'});await page.getByText('本版次 2D 與 3D 主檔已齊備。',{exact:true}).waitFor();await dom('owner-saved-reload');
    let requestId=await submit('submitted');await review(requestId,'initial-review');
    if(fixture.variant.endsWith('minor')) {
      const oldId=requestId;await decide(oldId,'return');const returned=await snapshot('returned');assert.deepEqual(master(returned),master(initial));assert.deepEqual(pointer(returned),pointer(created));
      assert.deepEqual(unrelated(returned),unrelated(initial));assert.equal(returned.drawing_revision_works.find(item=>item.id===workId).owner_user_id,'dev122-profile-owner');
      await enterDrawing('returned-owner');requestId=await submit('fresh-submit');assert.notEqual(requestId,oldId);await review(requestId,'fresh-review');
      evidence.returned={oldId,freshId:requestId,masterAndPointerUnchanged:true,originalOwner:true};save();
    }else {
      const decisionPath=`/api/pdm/review-requests/${requestId}/decisions`;
      for(const deniedMode of ['denied-actor','expired-assignment']) {
        if(deniedMode==='denied-actor')await asActor('denied');else {await asActor('reviewer');expired=true;evidence.expiredAssignment=await channel('expire');save();}
        const before=await snapshot(deniedMode+'-before');control.deniedPaths.add(decisionPath);control.allowedAlerts.add(drawingDecisionDeniedMessage);
        const body=await decide(requestId,'approve',403,deniedMode);assert.equal(body.error,'permission_not_granted');await page.getByRole('alert').filter({hasText:drawingDecisionDeniedMessage}).waitFor();
        assert.equal(new URL(page.url()).pathname,'/approvals/'+requestId);assert.deepEqual(await snapshot(deniedMode+'-after'),before,'G_DENIED_DECISION_MUTATED_ROWS');await dom(deniedMode);
        control.deniedPaths.delete(decisionPath);
        if(expired){evidence.assignmentRestored=await channel('restore');expired=false;save();}await asActor('reviewer');
      }
    }
    await decide(requestId,'approve',200,'approved');control.allowedAlerts.clear();const after=await snapshot('approved');assertMapping(after);assert.deepEqual(unrelated(after),unrelated(initial));
    if(fixture.variant.endsWith('minor')) {assert.deepEqual(master(after),master(initial));assert.deepEqual(pointer(after),pointer(created));}
    else {assert.equal(master(after).record_status,'Released');assert.equal(pointer(after).length,1);const production=pointer(after)[0];assert.ok(production.revision_id);assert.equal(production.work_id,null);
      assert.equal(after.drawing_revisions.find(item=>item.id===production.revision_id).lifecycle_state,'released');assert.notEqual(production.revision_id,pointer(initial)[0]?.revision_id);
      assert.equal(production.revision_id,evidence.reviewPackages.at(-1).targetRevisionId,'G_PRODUCTION_POINTER_NOT_APPROVED_UI_TARGET');}
    assert.equal(after.pdm_work_review_terminal_receipts.filter(item=>item.request_id===requestId).length,1);
    evidence.final={requestId,workId,master:master(after),pointer:pointer(after),mapping:mapping(after),unrelatedPartAndMastersUnchanged:true};save();
    await ownerReload(after);const expectedReadiness=fixture.variant!=='Draft-minor';await readiness('after',expectedReadiness);
    const beforeReload=await snapshot('before-final-reload');
    const reloaded=waitResponse(response=>new URL(response.url()).pathname===`/api/transfer-packages/${fixture.packageId}/readiness-summary`);
    await page.reload({waitUntil:'domcontentloaded'});assert.equal((await capture('final-reload-readiness',reloaded)).readiness.ready,expectedReadiness);
    const submitReview=page.getByRole('button',{name:'送交整包審核',exact:true});await submitReview.waitFor();assert.equal(await submitReview.isDisabled(),!expectedReadiness);
    await dom('final-reload');assert.deepEqual(await snapshot('after-final-reload'),beforeReload,'G_RELOAD_CHANGED_ROWS');await healthy();
    evidence.status='PASS';progress('G lifecycle mode complete',{variant:fixture.variant,width:fixture.width,requestId,masterStatus:master(after).record_status});save();return evidence;
  } finally {
    if(expired){try{evidence.assignmentFinalRecovery=await channel('restore');expired=false;save();}catch(error){control.recoveryFailed=true;throw error;}}
    control.deniedPaths.clear();control.allowedAlerts.clear();
  }
}
