import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

// Disposable native-PG control-flow fixture. This never reads a credential payload
// and its synthetic PASS is not evidence of a native Document Manager/CAD probe.
export async function serveSettingsAutomationFixture({admin,runtimeRoot,evidenceRoot,origin,workerId,token}) {
  assert.equal(fs.readFileSync(path.join(runtimeRoot,'owner-marker'),'utf8'),'AIPDM_DEV122_LOCAL_V1');
  assert.equal(new URL(origin).hostname,'127.0.0.1');
  const requestPath=path.join(runtimeRoot,'secret-workflow-request.json'),resultPath=path.join(runtimeRoot,'secret-workflow-result.json');
  const fixtures=JSON.parse(fs.readFileSync(path.join(runtimeRoot,'browser-fixtures.json'),'utf8'));
  const readbackFile=path.join(evidenceRoot,'settings-automation-control-flow.json');
  const receipt={layer:'ACTUAL_LOCAL_API_NATIVE_PG_CONTROL_FLOW_SYNTHETIC_NATIVE_RESULT',nativeCad:'NOT_RUN',providerPayload:'NOT_READ',workerId,cases:[],cleanup:false};
  const save=()=>fs.writeFileSync(readbackFile,JSON.stringify(receipt,null,2)+'\n');save();
  let busy=null,closed=false,failure=null,currentJob=null,completion=null,heartbeatBody=null,heartbeatBusy=null,originalGrant=null;
  const fixtureFor=width=>{const row=fixtures.find(item=>item.width===width);assert.ok(row);return row;};
  async function api(route,body,expected=200) {
    const response=await fetch(origin+route,{method:'POST',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+token,'x-pdm-worker-id':workerId,'content-type':'application/json'},body:JSON.stringify(body)});
    const value=await response.json().catch(()=>null);
    assert.equal(response.status,expected,JSON.stringify({route,status:response.status,value}));
    return {route,status:response.status,value};
  }
  async function snapshot(referenceId) {
    const refs=(await admin.query('SELECT id,version,lifecycle_status,fingerprint FROM ai_pdm_core.secret_references ORDER BY version')).rows;
    const jobs=(await admin.query('SELECT id,secret_reference_id,status,attempt_count,company_id,initiator_principal_id,initiator_profile_version,purpose,completion_digest,completion_test_run_id FROM ai_pdm_core.settings_secret_probe_jobs ORDER BY id')).rows;
    const intents=(await admin.query('SELECT * FROM ai_pdm_core.settings_secret_activation_intents ORDER BY requested_at,id')).rows;
    const tests=(await admin.query('SELECT id,secret_reference_id,result_status,summary,metadata_json FROM ai_pdm_core.setting_test_runs ORDER BY id')).rows;
    const events=(await admin.query('SELECT * FROM ai_pdm_core.setting_activation_events ORDER BY event_at,id')).rows;
    const audits=(await admin.query('SELECT * FROM ai_pdm_core.audit_logs ORDER BY id')).rows;
    const outbox=(await admin.query('SELECT * FROM ai_pdm_core.platform_outbox_events ORDER BY id')).rows;
    return {referenceId,refs,jobs,intents,tests,events,audits,outbox};
  }
  async function seed(referenceId,jobId,version) {
    const before=await snapshot(referenceId);
    if(before.refs.some(row=>row.id===referenceId)) return before;
    assert.equal(before.refs.length,version-1);
    const metadata=JSON.stringify({companyId:'company-jenfu',securityActor:{kind:'human',principalId:'dev122-principal-reviewer',profileVersion:1}});
    const fingerprint=crypto.createHash('sha256').update('non-secret-control-reference-'+version).digest('hex');
    const mutations=[{sql:`INSERT INTO ai_pdm_core.secret_references(id,kind,provider,display_name,vault_provider,vault_secret_id,masked_hint,fingerprint,lifecycle_status,version,created_by,metadata_json)
      VALUES($1,'solidworks_document_manager','solidworks','Control flow fixture','google_secret_manager',$2,'non-secret fixture',$3,'draft',$4,'dev122-profile-reviewer',$5)`,binds:[referenceId,'projects/dev122-fixture-project/secrets/non-secret-reference/versions/'+version,fingerprint,version,metadata]},
      {sql:`INSERT INTO ai_pdm_core.settings_secret_probe_jobs(id,secret_reference_id,kind,status,created_by,company_id,initiator_principal_id,initiator_profile_version,purpose)
      VALUES($1,$2,'solidworks_document_manager','pending','dev122-profile-reviewer','company-jenfu','dev122-principal-reviewer',1,'settings_secret_probe')`,binds:[jobId,referenceId]}];
    await admin.query('BEGIN');
    try { for(const mutation of mutations) await admin.query(mutation.sql,mutation.binds);await admin.query('COMMIT'); }
    catch(error){await admin.query('ROLLBACK');throw error;}
    fs.appendFileSync(path.join(evidenceRoot,'fixture-mutations.jsonl'),JSON.stringify({project:'AIPDM',purpose:'non-secret settings control prerequisite; no key/native outcome',producerBoundary:'FIXTURE',mutations})+'\n');
    return snapshot(referenceId);
  }
  async function readStatus() {
    const session=JSON.parse(fs.readFileSync(path.join(runtimeRoot,'signed-sessions.json'),'utf8')).owner;
    const response=await fetch(origin+'/api/settings/secrets',{signal:AbortSignal.timeout(15000),headers:{cookie:'__session='+session}});
    assert.equal(response.status,200);return (await response.json()).secrets.find(row=>row.kind==='solidworks_document_manager');
  }
  async function grant(action) {
    const select=`SELECT assignment_id,valid_until FROM ai_pdm_contract.dev122_fixture_principal_effective_grants_rows_v4
      WHERE assignment_id='dev122-assignment-owner' AND principal_id='dev122-principal-owner' AND scope_key='company-jenfu'`;
    const before=(await admin.query(select)).rows;assert.equal(before.length,1);
    if(action==='withdraw') {assert.equal(originalGrant,null);originalGrant={validUntil:before[0].valid_until};}
    const replacement=action==='withdraw'?'2026-01-01T00:00:00.000Z':originalGrant.validUntil;
    const result=await admin.query(`UPDATE ai_pdm_contract.dev122_fixture_principal_effective_grants_rows_v4 SET valid_until=$1
      WHERE assignment_id='dev122-assignment-owner' AND principal_id='dev122-principal-owner' AND scope_key='company-jenfu' AND valid_until IS NOT DISTINCT FROM $2`,[replacement,before[0].valid_until]);
    assert.equal(result.rowCount,1);
    const after=(await admin.query(select)).rows;
    fs.appendFileSync(path.join(evidenceRoot,'fixture-mutations.jsonl'),JSON.stringify({project:'AIPDM',purpose:'exact fixture owner grant '+action,producerBoundary:'FIXTURE',before,after,rowCount:1})+'\n');
    if(action==='restore') {assert.equal(after[0].valid_until,originalGrant.validUntil);originalGrant=null;}
    return {before,after};
  }
  async function operation(request) {
    const fixture=fixtureFor(request.width);
    const currentRef=fixture.referenceId;
    if(request.action==='prepare') return seed(fixture.referenceId,fixture.jobId,fixture.version);
    if(request.action==='snapshot') return snapshot(currentRef);
    if(request.action==='online') {
      heartbeatBody={workerId,capability:'solidworks_document_manager',status:'degraded',issueCode:'fixture_control_flow_ready'};
      return api('/api/recognition-workers/heartbeat',heartbeatBody);
    }
    if(request.action==='claim') {
      const result=await api('/api/settings-secret-probe-jobs/claim',{workerId,protocolVersion:2});
      assert.equal(result.value.id,fixture.jobId);assert.equal(result.value.secretReferenceId,currentRef);
      assert.equal(result.value.initiatorPrincipalId,'dev122-principal-reviewer');assert.equal(result.value.leaseAttempt,1);
      currentJob=result.value;completion={workerId,leaseAttempt:currentJob.leaseAttempt,status:'passed',resultCode:null,readerVersion:'fixture-control-reader.v2'};
      heartbeatBody={workerId,capability:'solidworks_document_manager',status:'degraded',issueCode:'credential_probe_running'};
      await api('/api/recognition-workers/heartbeat',heartbeatBody);return result;
    }
    if(request.action==='stale_attempt') {
      assert.equal(currentJob?.id,fixture.jobId);
      return api('/api/settings-secret-probe-jobs/'+fixture.jobId+'/complete',{...completion,leaseAttempt:2},409);
    }
    if(request.action==='complete' || request.action==='replay') {
      assert.equal(currentJob?.id,fixture.jobId);
      const before=await snapshot(currentRef);
      const result=await api('/api/settings-secret-probe-jobs/'+fixture.jobId+'/complete',completion);
      const after=await snapshot(currentRef);
      if(request.action==='replay') assert.deepEqual(after,before);
      else {
        const intent=after.intents.find(row=>row.probe_job_id===fixture.jobId);
        assert.equal(intent.consent_principal_id,'dev122-principal-owner');assert.equal(intent.state,'activated');
        assert.equal(after.refs.find(row=>row.id===currentRef).lifecycle_status,'active');
      }
      return {result,before,after,status:await readStatus()};
    }
    if(request.action==='wrong_ack' || request.action==='ack') {
      const row=(await admin.query('SELECT id,version,fingerprint FROM ai_pdm_core.secret_references WHERE id=$1 AND lifecycle_status=$2',[currentRef,'active'])).rows[0];assert.ok(row);
      heartbeatBody={workerId,capability:'solidworks_document_manager',status:'ready',appliedSecretKind:'solidworks_document_manager',appliedSecretVersion:row.version,
        appliedSecretFingerprint:request.action==='wrong_ack'?'synthetic-wrong-fingerprint':row.fingerprint,readerVersion:'fixture-control-reader.v2',lastAppliedAt:new Date().toISOString()};
      const result=await api('/api/recognition-workers/heartbeat',heartbeatBody);return {result,status:await readStatus()};
    }
    if(request.action==='offline') {
      heartbeatBody=null;await heartbeatBusy;
      await admin.query("UPDATE ai_pdm_core.worker_capability_heartbeats SET last_seen_at=CURRENT_TIMESTAMP-interval '31 seconds' WHERE worker_id=$1 AND capability_code='solidworks_document_manager'",[workerId]);
      return {status:await readStatus()};
    }
    if(request.action==='immutable') {
      const before=await snapshot(currentRef);const intent=before.intents.find(row=>row.probe_job_id===fixture.jobId);assert.ok(intent);
      await admin.query('BEGIN');let code;
      try { await admin.query('UPDATE ai_pdm_core.settings_secret_activation_intents SET consent_principal_id=$1 WHERE id=$2',['dev122-principal-other',intent.id]);throw new Error('CONSENT_MUTATION_ACCEPTED'); }
      catch(error){code=error.code;assert.equal(code,'23514');}
      finally {await admin.query('ROLLBACK');}
      const after=await snapshot(currentRef);assert.deepEqual(after,before);return {code,unchanged:true};
    }
    if(request.action==='negative_prepare') {
      assert.equal(request.width,390);
      return seed('dev122-secret-control-negative','dev122-probe-control-negative',3);
    }
    if(request.action==='negative_complete') {
      assert.equal(request.width,390);heartbeatBody=null;
      const claim=await api('/api/settings-secret-probe-jobs/claim',{workerId,protocolVersion:2});assert.equal(claim.value.id,'dev122-probe-control-negative');
      const before=await snapshot('dev122-secret-control-negative');
      await grant('withdraw');
      let result;
      try {result=await api('/api/settings-secret-probe-jobs/dev122-probe-control-negative/complete',{workerId,leaseAttempt:claim.value.leaseAttempt,status:'passed',resultCode:null,readerVersion:'fixture-control-reader.v2'});}
      finally {await grant('restore');}
      const after=await snapshot('dev122-secret-control-negative');
      assert.equal(after.intents.find(row=>row.probe_job_id==='dev122-probe-control-negative').state,'blocked');
      assert.equal(after.intents.find(row=>row.probe_job_id==='dev122-probe-control-negative').safe_result_code,'consent_authority_revoked');
      assert.deepEqual(after.refs.filter(row=>row.lifecycle_status==='active'),before.refs.filter(row=>row.lifecycle_status==='active'));
      return {result,before,after,status:await readStatus()};
    }
    throw new Error('DEV122_SECRET_CONTROL_ACTION_REJECTED');
  }
  const actions=['prepare','snapshot','online','claim','stale_attempt','complete','replay','wrong_ack','ack','offline','immutable','negative_prepare','negative_complete'];
  const timer=setInterval(()=>{
    if(closed||busy||!fs.existsSync(requestPath)) return;
    busy=(async()=>{
      let request;
      try {
        request=JSON.parse(fs.readFileSync(requestPath,'utf8'));
        assert.deepEqual(Object.keys(request).sort(),['action','nonce','width']);assert.ok(actions.includes(request.action));
        assert.match(request.nonce,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u);
        fs.unlinkSync(requestPath);
        const result=await operation(request);receipt.cases.push({nonce:request.nonce,action:request.action,width:request.width,result});save();
        fs.writeFileSync(resultPath+'.tmp',JSON.stringify({nonce:request.nonce,action:request.action,status:'APPLIED',result}));fs.renameSync(resultPath+'.tmp',resultPath);
      } catch(error) {failure??=error;receipt.failure={message:error.message,code:error.code??null};save();
        fs.writeFileSync(resultPath,JSON.stringify({nonce:request?.nonce,action:request?.action,status:'FAIL',message:error.message}));}
    })().finally(()=>{busy=null;});
  },50);
  const heartbeatTimer=setInterval(()=>{
    if(closed||busy||heartbeatBusy||!heartbeatBody) return;
    heartbeatBusy=api('/api/recognition-workers/heartbeat',heartbeatBody).catch(error=>{
      // Restart may temporarily stop the loopback server; the next heartbeat uses the same bound identity.
      receipt.heartbeatReconnects??=[];receipt.heartbeatReconnects.push({at:new Date().toISOString(),message:error.message});save();
    }).finally(()=>{heartbeatBusy=null;});
  },5000);
  return {async close(){closed=true;clearInterval(timer);clearInterval(heartbeatTimer);await busy;await heartbeatBusy;if(originalGrant)await grant('restore');receipt.cleanup=true;save();if(failure)throw failure;}};
}
