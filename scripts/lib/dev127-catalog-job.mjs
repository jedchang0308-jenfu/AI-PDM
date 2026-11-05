import { canonicalize, sha256, readGcsObject, publishGcsJson } from './dev012-production-migration-runner.mjs'
import { DEV127_OPERATION, DEV127_RECEIPT, DEV127_BUCKET, DEV127_JOB, DEV127_SERVICE, DEV127_MIGRATOR,
  assertDev127Operation, executeDev127CatalogSql, readDev127CommandReceipt } from './dev127-role-policy-upgrade.mjs'
const fail = code => { throw Object.assign(new Error(code), { code }) }
const same = (a,b) => canonicalize(a) === canonicalize(b)
export async function assertDev127InstalledMigration(database) {
  await database.query('BEGIN READ ONLY')
  try {
    await database.query('SET LOCAL ROLE jenfu_ai_pdm_migrator')
    const {rows}=await database.query("SELECT version,name,btrim(checksum_sha256) AS checksum FROM ai_pdm_core.schema_migrations WHERE version='ai-pdm-096'")
    if(rows.length!==1 || rows[0].name!=='dev127_platform_super_admin_consumer' ||
      rows[0].checksum!=='36d53700ba87ea6aa278ff227aef33f1f203942b491f0d01e4af5de8b6087ffa')fail('DEV127_INSTALLED_MIGRATION_REQUIRED')
    await database.query('COMMIT')
  }catch(error){await database.query('ROLLBACK').catch(()=>{});throw error}
}

/** No local ADC, GitHub flags or caller-supplied SQL. The existing immutable
 * operation is read by the fixed Job image through its metadata identity. */
export function assertDev127JobBasis({operation,basis,intent,deployment,environment,identity,service,revision}) {
  if (identity!==DEV127_MIGRATOR || environment.CLOUD_RUN_JOB!=='ai-pdm-prod-migration-runner' ||
      !/^ai-pdm-prod-migration-runner-[a-z0-9-]+$/u.test(environment.CLOUD_RUN_EXECUTION??'') ||
      environment.CLOUD_RUN_TASK_INDEX!=='0' || environment.CLOUD_RUN_TASK_ATTEMPT!=='0' ||
      environment.PDM_SOURCE_REVISION!==operation.migrationRunnerSourceRevision ||
      basis?.schemaVersion!=='ai-pdm.role-policy-finalized-basis.v1' || basis.job?.name!==DEV127_JOB ||
      !same(basis.releaseCapsuleRef,operation.releaseCapsuleRef) || !same(basis.deploymentCapsuleRef,operation.deploymentCapsuleRef) ||
      intent.sourceRevision!==operation.sourceRevision || intent.ownerApplicationId!=='ai-pdm' ||
      deployment.sourceRevision!==operation.sourceRevision || !same(deployment.releaseIntentRef,operation.releaseCapsuleRef) ||
      deployment.migrationRunnerDigest!==operation.migrationRunnerDigest ||
      deployment.migrationRunnerSourceRevision!==operation.migrationRunnerSourceRevision ||
      basis.job.template?.template?.serviceAccount!==DEV127_MIGRATOR ||
      basis.job.template?.template?.containers?.find(row=>row.name==='migration')?.image!==operation.migrationRunnerDigest) fail('DEV127_JOB_IDENTITY_INVALID')
  const control=basis.control?.value,terminal=basis.terminal?.value,compatible=basis.compatible?.value,fence=basis.fence?.value
  const {controlSha256,...controlCore}=control??{}
  if(controlSha256!==sha256(canonicalize(controlCore)) || control.state!=='FINALIZED' || control.result!=='RELEASED' ||
      control.sourceRevision!==operation.sourceRevision || control.releaseId!==intent.releaseId ||
      control.sourceLockSha256!==intent.sourceLockRef?.sha256 || terminal?.stage!=='terminal' ||
      terminal.facts?.result!=='RELEASED' || terminal.facts?.remainingHumanAction!==0 ||
      terminal.sourceRevision!==operation.sourceRevision || terminal.releaseId!==intent.releaseId ||
      compatible?.schemaVersion!=='ai-pdm.role-policy-runtime-compatibility.v1' ||
      !/^[a-f0-9]{40}$/u.test(compatible.sourceRevision??'') || compatible.ordinaryEntryVerified!==true ||
      !same(compatible.supportedFormats,['dynamic-policy-v1','dynamic-policy-v2']) || compatible.writerFormat!=='dynamic-policy-v2' ||
      compatible.artifactDigest!==deployment.artifactDigest || compatible.candidateRevision!==control.candidateRevision ||
      fence?.minimumPublicationFormat!=='dynamic-policy-v2') fail('DEV127_FINALIZED_BASIS_INVALID')
  for(const row of [basis.control,basis.terminal,basis.compatible,basis.fence]) {
    if(!row.ref?.uri?.startsWith(`gs://${DEV127_BUCKET}/`) || row.ref.sha256!==sha256(Buffer.from(canonicalize(row.value)+'\n'))) fail('DEV127_FINALIZED_BASIS_INVALID')
  }
  if(service?.name!==DEV127_SERVICE || service.reconciling===true ||
      String(service.observedGeneration)!==String(service.generation) ||
      service.terminalCondition?.state!=='CONDITION_SUCCEEDED' ||
      !Array.isArray(service.trafficStatuses) || service.trafficStatuses.length!==1 ||
      service.trafficStatuses[0].revision!==control.candidateRevision || service.trafficStatuses[0].percent!==100 || service.trafficStatuses[0].tag ||
      service.traffic?.some(row=>row.tag) || revision?.name!==`${DEV127_SERVICE}/revisions/${control.candidateRevision}` ||
      revision.containers?.find(row=>row.name==='ai-pdm')?.image!==deployment.artifactDigest) fail('DEV127_DEPLOYED_ARTIFACT_CHANGED')
}

export async function runDev127CatalogJob({value,object,args,environment,token,fetchImpl,Client,databaseOptions}) {
  const operation=assertDev127Operation(value,{bytes:object.bytes,sha256:args.bundleSha256,sourceRevision:args.sourceRevision,
    runnerSourceRevision:environment.PDM_SOURCE_REVISION,outputRef:args.outputRef})
  if(operation.schemaVersion!==DEV127_OPERATION)fail('DEV127_OPERATION_BINDING_INVALID')
  const read=async ref=>{
    const row=await readGcsObject({uri:ref.uri,expectedBucket:DEV127_BUCKET,expectedPrefix:'receipts',token,fetchImpl})
    if(sha256(row.bytes)!==ref.sha256)fail('DEV127_IMMUTABLE_REF_MISMATCH')
    return JSON.parse(row.bytes.toString('utf8'))
  }
  const get=async url=>{
    const response=await fetchImpl(url,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)})
    if(!response.ok)fail('DEV127_PROVIDER_READBACK_FAILED')
    return response.json()
  }
  const metadata=await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',
    {headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(10000)})
  if(!metadata.ok)fail('DEV127_JOB_IDENTITY_INVALID')
  const identity=(await metadata.text()).trim()
  const [basis,intent,deployment]=await Promise.all([read(operation.basisRef),read(operation.releaseCapsuleRef),read(operation.deploymentCapsuleRef)])
  const service=await get(`https://run.googleapis.com/v2/${DEV127_SERVICE}`)
  const revision=await get(`https://run.googleapis.com/v2/${DEV127_SERVICE}/revisions/${basis.control?.value?.candidateRevision}`)
  assertDev127JobBasis({operation,basis,intent,deployment,environment,identity,service,revision})
  const plan=operation.planReceiptRef?await read(operation.planReceiptRef):null
  const database=new Client(databaseOptions(environment,token))
  await database.connect()
  try {
    await assertDev127InstalledMigration(database)
    // A reconnect readback is mandatory after an uncertain COMMIT. It cannot
    // execute a second writer or turn missing evidence into success.
    const result=await executeDev127CatalogSql({database,operation,plan,readAfterUnknown:async (bound,id)=>{
      const fresh=new Client(databaseOptions(environment,token));await fresh.connect()
      try{return await readDev127CommandReceipt(fresh,bound,id)}finally{await fresh.end()}
    }})
    const receipt={schemaVersion:DEV127_RECEIPT,phase:operation.phase,commandId:operation.commandId,
      sourceRevision:operation.sourceRevision,releaseCapsuleRef:operation.releaseCapsuleRef,
      sourcePolicySha256:operation.sourcePolicySha256,...result}
    const publication=await publishGcsJson({uri:args.outputRef,expectedBucket:DEV127_BUCKET,expectedPrefix:'receipts',value:receipt,token,fetchImpl})
    return{...receipt,outputRef:args.outputRef,outputSha256:publication.sha256,outputGeneration:publication.generation}
  }finally{await database.end()}
}
