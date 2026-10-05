// The real worker's probe orchestration. Injected transports are explicit test seams.
export async function processSettingsSecretProbe({job, workerId, readCredential, runProbe, request,
  readActiveCredential, sendCapabilityHeartbeat, startHeartbeat, delay, maxCompletionAttempts=3}) {
  if (!Number.isSafeInteger(job.leaseAttempt) || job.leaseAttempt < 1) throw new Error('INVALID_LEASE_ATTEMPT');
  const fence={workerId,leaseAttempt:job.leaseAttempt};
  const pulse=async () => {
    await request(`/api/settings-secret-probe-jobs/${encodeURIComponent(job.id)}/heartbeat`,fence);
    // Presence is truthful, and never an ACK of the tested draft.
    await sendCapabilityHeartbeat({credential:null,status:'degraded',issueCode:'credential_probe_running'});
  };
  let leaseLost=false;
  const stopHeartbeat=startHeartbeat(async()=>{
    try { await pulse(); } catch(error) { if (error?.status===409 || error?.status===403 || error?.status===401) leaseLost=true; }
  });
  let completion;
  try {
    await pulse();
    try {
      const credential=await readCredential(job,fence);
      if (credential.secretReferenceId!==job.secretReferenceId || credential.probeJobId!==job.id ||
        credential.leaseAttempt!==job.leaseAttempt || credential.version!==job.version || credential.fingerprint!==job.fingerprint || !credential.value) {
        const error=new Error('SECRET_PROBE_CREDENTIAL_BINDING_MISMATCH');error.status=409;throw error;
      }
      const result=await runProbe(job,credential);
      const passed=result.status==='succeeded' || result.status==='success';
      completion={...fence,status:passed?'passed':'failed',resultCode:passed?null:'native_metadata_credential_probe_failed',
        readerVersion:/^[A-Za-z0-9._:-]{1,120}$/u.test(String(result.adapterVersion ?? '')) ? result.adapterVersion : 'solidworks-document-manager-reader.v1'};
    } catch(error) {
      if (error?.status===409 || error?.status===401 || error?.status===403) throw error;
      completion={...fence,status:'blocked',resultCode:'native_metadata_credential_unavailable',readerVersion:'solidworks-document-manager-reader.v1'};
    }
    let confirmed=false;
    for (let attempt=0;attempt<maxCompletionAttempts;attempt++) {
      if (leaseLost) throw new Error('SECRET_PROBE_LEASE_LOST');
      try { await request(`/api/settings-secret-probe-jobs/${encodeURIComponent(job.id)}/complete`,completion);confirmed=true;break; }
      catch(error) {
        if (error?.status && error.status<500 || attempt+1===maxCompletionAttempts) throw error;
        // Unknown write outcome: replay exactly this result; never change it to blocked.
        await delay(1000);
      }
    }
    if (!confirmed) throw new Error('SECRET_PROBE_COMPLETION_UNCONFIRMED');
  } finally { stopHeartbeat(); }
  // A completed draft probe is not active readiness. Reacquire the active broker first.
  const active=await readActiveCredential().catch(()=>null);
  await sendCapabilityHeartbeat({credential:active});
  return completion;
}
