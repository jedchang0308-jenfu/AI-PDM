import { canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { usesDev127Consumer, requireDev127DeployedConsumer, establishDev127ActivationFence } from './dev127-role-policy-release-gate.mjs'
import { DEV127_OPERATION, DEV127_RECEIPT, DEV127_SOURCE_POLICY_SHA256, DEV127_JOB, dev127CommandId, assertDev127Plan } from './dev127-role-policy-upgrade.mjs'
const fail = code => { throw Object.assign(new Error(code), { code }) }
const ref = row => ({uri:row.ref.uri,sha256:row.ref.sha256})

/** Post-finalize owner operation. Reuses the exact migration Job transport and
 * its submission/readback guard. No SQL, actor, target or environment input. */
export async function executeDev127CatalogBridge({transport,profile,intentRef,deployment,paths,readSource}) {
  if(!usesDev127Consumer(profile))return null
  const ready=await requireDev127DeployedConsumer({transport,profile,intentRef,readSource,expectedSourceRevision:deployment.value.sourceRevision})
  const fence=await establishDev127ActivationFence({transport,profile,deployment:ready})
  const root=`gs://${profile.artifact.releaseBucket}/${paths.root}/dev127-catalog-upgrade`
  const optional=async uri=>{
    try{const row=await transport.readBytes(uri,{prefixes:['receipts']});return{...row,value:JSON.parse(row.bytes.toString('utf8'))}}
    catch(error){if(error?.code==='MISSING')return null;throw error}
  }
  let basis=await optional(root+'/basis.json')
  if(!basis){
    const job=await transport.request(`https://run.googleapis.com/v2/${DEV127_JOB}`)
    const control=await transport.readBytes(`gs://${profile.artifact.releaseBucket}/control/active.json`,{prefixes:['control']})
    const sealed=row=>({ref:ref(row),value:row.value??JSON.parse(row.bytes.toString('utf8'))})
    const value={schemaVersion:'ai-pdm.role-policy-finalized-basis.v1',releaseCapsuleRef:intentRef,deploymentCapsuleRef:ref(deployment),
      job,control:sealed(control),terminal:sealed(ready.terminal),compatible:sealed(ready.compatible),fence:sealed(fence)}
    basis=await transport.putJson(root+'/basis.json',value,{bucket:profile.artifact.releaseBucket,prefix:'receipts',ifGenerationMatch:'0'})
  }
  const base={schemaVersion:DEV127_OPERATION,ownerApplicationId:'ai-pdm',sourceRevision:ready.intent.sourceRevision,
    migrationRunnerSourceRevision:deployment.value.migrationRunnerSourceRevision,migrationRunnerDigest:deployment.value.migrationRunnerDigest,
    releaseCapsuleRef:intentRef,deploymentCapsuleRef:ref(deployment),basisRef:ref(basis),commandId:dev127CommandId(intentRef),sourcePolicySha256:DEV127_SOURCE_POLICY_SHA256}
  const run=async(phase,planReceiptRef=null)=>{
    const outputRef=root+`/${phase}.json`
    const operation={...base,phase,planReceiptRef,outputRef}
    let result=await optional(outputRef)
    if(!result){
      const digest=sha256(canonicalize(operation))
      const input=await transport.putJson(`gs://${profile.artifact.releaseBucket}/source/migration-bundles/dev127/${digest}.json`,operation,
        {bucket:profile.artifact.releaseBucket,prefix:'source',ifGenerationMatch:'0'})
      const jobDeployment={...deployment.value,migrationBundleRef:ref(input)}
      try{await transport.runMigrationJob({profile,deployment:jobDeployment,outputUri:outputRef,deadlineAt:ready.intent.deadlineAt})}
      catch(error){
        // runMigrationJob already lists/reads the exact provider execution before
        // returning failure/unknown. Never resubmit an uncertain commit writer.
        result=await optional(outputRef)
        if(!result)throw error
      }
    }
    result??=await optional(outputRef)
    if(!result || result.value.schemaVersion!==DEV127_RECEIPT || result.value.commandId!==base.commandId ||
        result.value.phase!==phase || result.value.sourceRevision!==base.sourceRevision ||
        canonicalize(result.value.releaseCapsuleRef)!==canonicalize(intentRef))fail('DEV127_JOB_RECEIPT_INVALID')
    return{operation,result}
  }
  const planned=await run('plan')
  assertDev127Plan(planned.result.value,planned.operation)
  let committed
  try{committed=await run('commit',ref(planned.result))}
  catch(error){
    // A separate read-only Job performs PG command receipt readback. An active
    // unknown provider execution blocks it through the same existing transport.
    let status
    try{status=await run('status',ref(planned.result))}catch(readbackError){
      error.readbackCode=readbackError.code??readbackError.message;throw error
    }
    if(status.result.value.state!=='SUCCEEDED')throw error
    committed=status
  }
  if(!['SUCCEEDED','ALREADY_CURRENT'].includes(committed.result.value.state))fail('DEV127_CATALOG_UPGRADE_INCOMPLETE')
  return committed.result
}
