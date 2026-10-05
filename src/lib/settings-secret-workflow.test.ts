import { describe,it,expect } from "vitest";
import { deriveSettingsSecretWorkflow } from "@/lib/settings-secret-workflow";
import type { SettingsSecretReference,SettingsSecretProbeJob,SettingsSecretActivationIntent,WorkerCapabilityHeartbeat } from "@/lib/repositories/settings-secret-async-repository";
const now=Date.parse("2026-10-05T01:00:00.000Z");
const reference={id:"ref",kind:"solidworks_document_manager",version:2,fingerprint:"fingerprint",lifecycleStatus:"active"} as SettingsSecretReference;
const heartbeat={workerId:"worker",capabilityCode:reference.kind,status:"ready",appliedSecretKind:reference.kind,
  appliedSecretVersion:2,appliedSecretFingerprint:reference.fingerprint,lastSeenAt:new Date(now).toISOString()} as WorkerCapabilityHeartbeat;
const input={reference,active:reference,intent:null,job:null,heartbeat,now};
describe("durable settings workflow projection",()=>{
  it("requires exact active Document Manager ACK",()=>expect(deriveSettingsSecretWorkflow(input)).toMatchObject({state:"ready",exactAck:true}));
  it.each([
    {capabilityCode:"solidworks_2d_preview_png"},{appliedSecretVersion:1},{appliedSecretFingerprint:"draft"},
    {status:"blocked"},{status:"degraded"},{lastSeenAt:new Date(now-30001).toISOString()},
    {lastSeenAt:new Date(now+1).toISOString()}
  ])("rejects wrong/stale/forecast ACK %o",override=>expect(deriveSettingsSecretWorkflow({...input,heartbeat:{...heartbeat,...override} as WorkerCapabilityHeartbeat})).toMatchObject({state:"awaiting_worker_ack",exactAck:false}));
  it("keeps service presence distinct from missing active credential",()=>expect(deriveSettingsSecretWorkflow({...input,active:null,reference:{...reference,lifecycleStatus:"draft"},heartbeat:{...heartbeat,status:"degraded"}})).toMatchObject({nativeWorkerOnline:true,exactAck:false,state:"waiting_worker"}));
  it("allows explicit new consent after a pending intent's job expired",()=>expect(deriveSettingsSecretWorkflow({...input,active:null,reference:{...reference,lifecycleStatus:"draft"},intent:{id:"intent",state:"pending"} as SettingsSecretActivationIntent,job:{id:"job",status:"expired"} as SettingsSecretProbeJob})).toMatchObject({state:"blocked",canResume:true,consentRequired:true}));
  it("does not offer to resume superseded consent",()=>expect(deriveSettingsSecretWorkflow({...input,intent:{id:"intent",state:"superseded"} as SettingsSecretActivationIntent})).toMatchObject({state:"superseded",canResume:false}));
  it("uses exact running lease, not an animation completion, as test activity",()=>expect(deriveSettingsSecretWorkflow({...input,active:null,reference:{...reference,lifecycleStatus:"draft"},job:{id:"job",status:"running",updatedAt:new Date(now-60001).toISOString()} as SettingsSecretProbeJob})).toMatchObject({leaseFresh:false,state:"waiting_worker"}));
});
