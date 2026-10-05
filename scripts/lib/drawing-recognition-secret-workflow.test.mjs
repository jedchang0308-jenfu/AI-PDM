import test from 'node:test';
import assert from 'node:assert/strict';
import {processSettingsSecretProbe} from './drawing-recognition-secret-workflow.mjs';
const job={id:'job',leaseAttempt:1,secretReferenceId:'reference',version:2,fingerprint:'draft-fingerprint'};
function fixture(overrides={}) {
  const events=[],writes=[],heartbeats=[];
  const input={job,workerId:'worker',delay:async()=>{},
    startHeartbeat:()=>()=>events.push('heartbeat-stopped'),
    readCredential:async()=>({...job,probeJobId:job.id,value:'synthetic-canary'}),
    runProbe:async()=>{events.push('real-probe-callback');return {status:'success',adapterVersion:'reader.v1'};},
    request:async(path,body)=>{writes.push({path,body:structuredClone(body)});events.push(path.endsWith('/complete')?'completion-confirmed':'pulse');},
    readActiveCredential:async()=>{events.push('active-broker');return {value:'synthetic-active',version:2,fingerprint:'active-fingerprint'};},
    sendCapabilityHeartbeat:async body=>heartbeats.push(body),...overrides};
  return {input,events,writes,heartbeats};
}
test('unknown completion outcome replays exactly one native result and keeps heartbeat through confirmation',async()=>{
  const f=fixture();let calls=0;
  f.input.request=async(path,body)=>{f.writes.push({path,body:structuredClone(body)});if(path.endsWith('/complete')){calls++;if(calls===1)throw new Error('connection lost after write');f.events.push('completion-confirmed');}};
  await processSettingsSecretProbe(f.input);
  const completions=f.writes.filter(row=>row.path.endsWith('/complete'));assert.equal(completions.length,2);assert.deepEqual(completions[0],completions[1]);assert.equal(completions[0].body.status,'passed');
  assert.equal(f.events.filter(value=>value==='real-probe-callback').length,1);
  assert.ok(f.events.indexOf('completion-confirmed')<f.events.indexOf('heartbeat-stopped'));assert.ok(f.events.indexOf('heartbeat-stopped')<f.events.indexOf('active-broker'));
  assert.equal(f.heartbeats[0].credential,null);assert.equal(f.heartbeats[0].status,'degraded');assert.equal(f.heartbeats.at(-1).credential.fingerprint,'active-fingerprint');
  assert.ok(!JSON.stringify(f.writes).includes('synthetic-canary'));
});
test('lease takeover refuses completion and never sends a different blocked result',async()=>{
  const f=fixture();f.input.request=async(path,body)=>{f.writes.push({path,body});if(path.endsWith('/complete')){const e=new Error('takeover');e.status=409;throw e;}};
  await assert.rejects(processSettingsSecretProbe(f.input));assert.equal(f.writes.filter(row=>row.path.endsWith('/complete')).length,1);assert.equal(f.writes.at(-1).body.status,'passed');assert.ok(!f.events.includes('active-broker'));assert.equal(f.events.at(-1),'heartbeat-stopped');
});
test('wrong credential reference is rejected before native execution',async()=>{
  const f=fixture({readCredential:async()=>({...job,probeJobId:'other',value:'synthetic'})});await assert.rejects(processSettingsSecretProbe(f.input));assert.ok(!f.events.includes('real-probe-callback'));assert.equal(f.writes.filter(row=>row.path.endsWith('/complete')).length,0);
});
test('native failure retains active broker availability without ACKing the failed draft',async()=>{
  const f=fixture({runProbe:async()=>({status:'failed',adapterVersion:'reader.v1'})});await processSettingsSecretProbe(f.input);assert.equal(f.writes.at(-1).body.status,'failed');assert.equal(f.heartbeats.at(-1).credential.fingerprint,'active-fingerprint');
});
test('bounded unconfirmed outcome stops heartbeat and preserves the same result',async()=>{
  const f=fixture();f.input.request=async(path,body)=>{f.writes.push({path,body:structuredClone(body)});if(path.endsWith('/complete'))throw new Error('transport unknown');};await assert.rejects(processSettingsSecretProbe(f.input));const rows=f.writes.filter(row=>row.path.endsWith('/complete'));assert.equal(rows.length,3);assert.ok(rows.every(row=>row.body.status==='passed'));assert.equal(f.events.at(-1),'heartbeat-stopped');assert.ok(!f.events.includes('active-broker'));
});
