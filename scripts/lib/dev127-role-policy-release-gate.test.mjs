import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { recordDev127CompatibleArtifact, requireDev127DeployedConsumer,
  establishDev127ActivationFence, requireDev127CompatibleRollback, dev127ConsumerInstallPlan } from './dev127-role-policy-release-gate.mjs'
import { canonicalize, sha256, releasePaths, stageReceipt, createOwnerTransport } from './dev012-owner-release-runtime.mjs'
import { crc32cBase64 } from './dev012-production-migration-runner.mjs'
import { executeDev127CatalogBridge } from './dev127-catalog-release-bridge.mjs'
import { assertDev127JobBasis } from './dev127-catalog-job.mjs'
import { DEV127_JOB,DEV127_SERVICE,DEV127_MIGRATOR,DEV127_RECEIPT,dev127UpgradeRequestHash,assertDev127Operation } from './dev127-role-policy-upgrade.mjs'

function fixture() {
  const profile = JSON.parse(readFileSync('config/release/dev117-ai-pdm-independent-production-v3.json'))
  const sourceRevision = 'a'.repeat(40), artifactDigest = profile.artifact.uri + '@sha256:' + 'b'.repeat(64)
  const prefix = `gs://${profile.artifact.releaseBucket}/receipts/`
  const ref = name => ({uri:prefix+name+'.json',sha256:'c'.repeat(64)})
  const intent = { schemaVersion:profile.schemas.releaseIntent, ownerApplicationId:'ai-pdm',releaseId:'DEV127-GATE-TEST',sourceRevision,
    sourceSha256:'d'.repeat(64),sourceLockRef:ref('source'),authorizationPolicyRef:ref('authorization'),readinessReceiptRef:ref('ready'),
    foundationReceiptRef:ref('foundation'),infraReceiptRef:ref('infra'),runtimeConfigRef:ref('runtime'),migrationManifestSha256:'e'.repeat(64),
    previousRevision:'ai-pdm-prod-old',deadlineAt:'2999-01-01T00:00:00.000Z' }
  const objects = new Map(), mutations = []
  function store(uri,value) {const bytes=Buffer.from(canonicalize(value)+'\n');const result={value,bytes,ref:{uri,sha256:sha256(bytes)},metadata:{generation:'1'}};objects.set(uri,result);return result}
  const intentRow=store(prefix+'release-intent.json',intent), paths=releasePaths(profile,intent,intentRow.ref.sha256)
  const candidate={candidateRevision:'ai-pdm-prod-new',artifactDigest}
  const canonical=store(paths.canonical,stageReceipt({profile,intent,stage:'canonical',facts:{...candidate,origin:profile.target.canonicalOrigin,
    smoke:{status:'PASS',tokenSource:'GITHUB_PRODUCTION_SECRET',observations:[{id:'target-session',status:200},{id:'authenticated-probe',status:200},
      {id:'unauthenticated-probe',status:401},{id:'session-revoked',status:401}]}},observedAt:'2026-11-05T00:00:00Z'}))
  const finalized=store(paths.finalize,stageReceipt({profile,intent,stage:'finalize',facts:{result:'RELEASED',...candidate},observedAt:'2026-11-05T00:00:01Z'}))
  store(paths.terminal,stageReceipt({profile,intent,stage:'terminal',facts:{result:'RELEASED',remainingHumanAction:0,...candidate},observedAt:'2026-11-05T00:00:02Z'}))
  const control={schemaVersion:'jenfu.dev012.owner-control-head.v1',ownerApplicationId:'ai-pdm',service:profile.target.serviceName,
    sourceLockSha256:intent.sourceLockRef.sha256,state:'FINALIZED',result:'RELEASED',sourceRevision,releaseId:intent.releaseId,candidateRevision:candidate.candidateRevision}
  store(paths.control,{...control,controlSha256:sha256(canonicalize(control))})
  let active=candidate.candidateRevision
  const transport={
    async readBytes(uri){const row=objects.get(uri);if(!row)throw Object.assign(Error('missing'),{code:'MISSING'});return row},
    async readJson(input){const row=await this.readBytes(input.uri);assert.equal(row.ref.sha256,input.sha256);return row},
    async putJson(uri,value){mutations.push(uri);return store(uri,value)},
    async getService(){return{traffic:[{revision:active,percent:100}]}},
    assertServiceSettled(){}, effectiveRevision(service){return service.traffic[0].revision},
    async getRevision(_profile,revision){return{containers:[{name:profile.runtime.containerName,image:revision==='ai-pdm-prod-old'?profile.artifact.uri+'@sha256:'+'f'.repeat(64):artifactDigest}]}},
  }
  const readSource=path=>readFileSync(path)
  const record=()=>recordDev127CompatibleArtifact({transport,profile,intent,candidate,canonical,finalized,readSource})
  const deployed=()=>requireDev127DeployedConsumer({transport,profile,intentRef:intentRow.ref,readSource,expectedSourceRevision:sourceRevision})
  return{profile,intent,intentRef:intentRow.ref,store,transport,objects,paths,candidate,canonical,record,deployed,mutations,setActive:value=>{active=value}}
}

test('DEV-127 activation requires a real finalized dual-reader artifact at full traffic and retains its recovery fence',async()=>{
  const f=fixture()
  await assert.rejects(f.deployed(),/missing/)
  await f.record()
  const deployment=await f.deployed()
  await establishDev127ActivationFence({transport:f.transport,profile:f.profile,deployment})
  await assert.rejects(requireDev127CompatibleRollback({transport:f.transport,profile:f.profile,revision:'ai-pdm-prod-old'}),{code:'DEV127_ROLLBACK_REQUIRES_V2_CONSUMER'})
  await assert.doesNotReject(requireDev127CompatibleRollback({transport:f.transport,profile:f.profile,revision:f.candidate.candidateRevision}))
  const count=f.mutations.length
  await f.record();await establishDev127ActivationFence({transport:f.transport,profile:f.profile,deployment})
  assert.equal(f.mutations.length,count,'exact replay does not rewrite immutable compatibility evidence')
})
test('DEV-127 old rollback stays available in the explicit pre-activation policy-write pause window',async()=>{
  const f=fixture()
  await assert.doesNotReject(requireDev127CompatibleRollback({transport:f.transport,profile:f.profile,revision:'ai-pdm-prod-old'}))
  assert.deepEqual(f.mutations,[])
})
test('DEV-127 rejects source-only, active old traffic, unfinished release and unknown control',async()=>{
  const f=fixture();await f.record();f.setActive('ai-pdm-prod-old')
  await assert.rejects(f.deployed(),{code:'DEV127_FINALIZED_CONSUMER_REQUIRED'})
  f.setActive(f.candidate.candidateRevision)
  f.objects.delete(f.paths.terminal)
  await assert.rejects(f.deployed(),/missing/)
  const unknown=fixture();unknown.transport.readBytes=async()=>{throw Object.assign(Error('denied'),{code:'DENIED'})}
  await assert.rejects(requireDev127CompatibleRollback({transport:unknown.transport,profile:unknown.profile,revision:'ai-pdm-prod-old'}),{code:'DENIED'})
})
test('DEV-127 existing source without a v2 reader cannot mint a compatible rollback artifact',async()=>{
  const f=fixture()
  await assert.rejects(recordDev127CompatibleArtifact({transport:f.transport,profile:f.profile,intent:f.intent,candidate:f.candidate,
    canonical:{},finalized:{},readSource:()=>Buffer.from('{}')}),{code:'DEV127_DUAL_READER_SOURCE_REQUIRED'})
  assert.deepEqual(f.mutations,[])
})
test('DEV-127 prepare exposes the bounded policy-write pause and refuses an old consumer source',()=>{
  const f=fixture()
  const plan=dev127ConsumerInstallPlan({profile:f.profile,sourceRevision:f.intent.sourceRevision,readSource:path=>readFileSync(path)})
  assert.equal(plan.legacyWriterReplayAllowed,false)
  assert.equal(plan.policyWritePauseFrom,'096_MIGRATION_COMMIT')
  assert.equal(plan.catalogUpgradeRequiresFinalizedConsumer,true)
  assert.throws(()=>dev127ConsumerInstallPlan({profile:f.profile,sourceRevision:f.intent.sourceRevision,readSource:()=>Buffer.from('{}')}),{code:'DEV127_DUAL_READER_SOURCE_REQUIRED'})
})
test('DEV-127 a governance v1 writer or readiness-only smoke cannot authorize catalog activation',async()=>{
  const f=fixture()
  f.canonical.value=stageReceipt({profile:f.profile,intent:f.intent,stage:'canonical',facts:{...f.canonical.value.facts,
    smoke:{status:'PASS',observations:[{id:'legacy-v1-policy-write',status:200}]}},observedAt:'2026-11-05T00:00:00Z'})
  await assert.rejects(f.record(),{code:'DEV127_ORDINARY_ENTRY_PROOF_REQUIRED'})
  assert.deepEqual(f.mutations,[])
})

async function bridgeFixture({unknown=false,status='SUCCEEDED'}={}) {
  const f=fixture();await f.record()
  const deployment=f.store(f.paths.deployment,{sourceRevision:f.intent.sourceRevision,releaseIntentRef:f.intentRef,
    migrationBundleRef:{uri:`gs://${f.profile.artifact.releaseBucket}/source/migration-bundles/original.json`,sha256:'f'.repeat(64)},
    artifactDigest:f.candidate.artifactDigest,migrationRunnerSourceRevision:f.intent.sourceRevision,
    migrationRunnerDigest:f.profile.artifact.migrationRunnerUri+'@sha256:'+'e'.repeat(64)})
  const job={name:DEV127_JOB,template:{template:{serviceAccount:DEV127_MIGRATOR,containers:[{name:'migration',image:deployment.value.migrationRunnerDigest}]}}}
  const phases=[]
  f.transport.request=async()=>job
  f.transport.runMigrationJob=async({deployment:input,outputUri,...options})=>{
    assert.equal(options.profile,f.profile);assert.equal(Object.hasOwn(options,'principalOnlyFenceRef'),false)
    const operation=f.objects.get(input.migrationBundleRef.uri).value
    assert.deepEqual(Object.keys(input).sort(),Object.keys(deployment.value).sort(),'no new actor, SQL or environment inputs')
    phases.push(operation.phase)
    if(operation.phase==='commit'&&unknown)throw Object.assign(Error('provider execution completed but output unknown'),{code:'MIGRATION_EXECUTION_FAILED'})
    let result={state:operation.phase==='status'?status:'SUCCEEDED'}
    if(operation.phase==='plan'){
      const candidate=JSON.parse(readFileSync('config/access-control/dev127-consumer-postgres-fixture.v1.json')).upgraded
      result={state:'PLANNED',candidate,candidateSha256:sha256(canonicalize(candidate)),expectedActive:{catalogVersion:'prior',catalogSha256:'a'.repeat(64)}}
      result.requestHash=dev127UpgradeRequestHash(result)
    }
    f.store(outputUri,{schemaVersion:DEV127_RECEIPT,phase:operation.phase,commandId:operation.commandId,
      sourceRevision:operation.sourceRevision,releaseCapsuleRef:operation.releaseCapsuleRef,sourcePolicySha256:operation.sourcePolicySha256,...result})
  }
  return{...f,deployment,job,phases,run:()=>executeDev127CatalogBridge({transport:f.transport,profile:f.profile,intentRef:f.intentRef,deployment,paths:f.paths,readSource:path=>readFileSync(path)})}
}

test('DEV-127 finalize bridge uses one capsule and the fixed Job, sealed plan then commit, and immutable replay',async()=>{
  const f=await bridgeFixture();const result=await f.run()
  assert.equal(result.value.state,'SUCCEEDED');assert.deepEqual(f.phases,['plan','commit'])
  await f.run();assert.deepEqual(f.phases,['plan','commit'],'receipt replay does not run a second Job')
  assert(f.mutations.some(uri=>uri.endsWith('/role-policy-v2-activation.json')))
})

test('DEV-127 real publication transport crosses deployer/source IAM boundary without leaking builder to receipts or repeating unknown writes',async t=>{
  for(const mode of ['success','missing-builder','unknown-source-create'])await t.test(mode,async()=>{
    const f=await bridgeFixture(),calls=[]
    const primary='MODELED-PRIMARY-DEPLOYER-TOKEN',builder='MODELED-SECONDARY-BUILDER-TOKEN'
    const response=(value,status=200)=>new Response(JSON.stringify(value),{status})
    const transport=createOwnerTransport({token:primary,builderReadbackToken:mode==='missing-builder'?null:builder,
      fetchImpl:async(url,options={})=>{
        const target=new URL(url),upload=target.pathname.startsWith('/upload/storage/v1/')
        const object=upload?target.searchParams.get('name'):decodeURIComponent(target.pathname.split('/o/')[1])
        const uri=`gs://${f.profile.artifact.releaseBucket}/${object}`
        const actor=options.headers.authorization===`Bearer ${primary}`?'deployer':options.headers.authorization===`Bearer ${builder}`?'builder':'unknown'
        calls.push({actor,object,method:options.method??'GET'})
        if(upload){
          const source=object.startsWith('source/')
          if(actor!==(source?'builder':'deployer'))return response({},403)
          assert.equal(target.searchParams.get('ifGenerationMatch'),'0')
          if(f.objects.has(uri))return response({},412)
          const row=f.store(uri,JSON.parse(Buffer.from(options.body).toString('utf8')))
          if(source&&mode==='unknown-source-create')throw Error('modeled lost response')
          return response({generation:row.metadata.generation})
        }
        assert.equal(actor,'deployer')
        const row=f.objects.get(uri)
        if(!row)return response({},404)
        return target.searchParams.get('alt')==='media'?new Response(row.bytes)
          :response({generation:row.metadata.generation,size:String(row.bytes.length),crc32c:crc32cBase64(row.bytes)})
      }})
    f.transport.putJson=transport.putJson
    if(mode==='success'){
      assert.equal((await f.run()).value.state,'SUCCEEDED')
      assert.deepEqual(f.phases,['plan','commit'])
      assert.equal(calls.filter(call=>call.actor==='builder').length,2)
      assert(calls.filter(call=>call.actor==='builder').every(call=>call.method==='POST'&&call.object.startsWith('source/migration-bundles/dev127/')))
      await f.run()
      assert.deepEqual(f.phases,['plan','commit'])
      assert.equal(calls.filter(call=>call.actor==='builder').length,2,'cached phase receipts cause no new source submission')
    }else{
      await assert.rejects(f.run(),{code:mode==='missing-builder'?'DEV127_SOURCE_WRITER_TOKEN_REQUIRED':'OUTCOME_UNKNOWN'})
      assert.deepEqual(f.phases,[],'source admission/unknown blocks all dependent Job submissions')
      assert.equal(calls.filter(call=>call.actor==='builder').length,mode==='missing-builder'?0:1)
    }
  })
})

test('DEV-127 unknown owner commit performs provider-guarded read-only status and never resubmits a writer',async()=>{
  const f=await bridgeFixture({unknown:true});assert.equal((await f.run()).value.state,'SUCCEEDED')
  assert.deepEqual(f.phases,['plan','commit','status'])
  const absent=await bridgeFixture({unknown:true,status:'NOT_COMMITTED'})
  await assert.rejects(absent.run(),{code:'MIGRATION_EXECUTION_FAILED'})
  assert.deepEqual(absent.phases,['plan','commit','status'])
  await assert.rejects(requireDev127CompatibleRollback({transport:absent.transport,profile:absent.profile,revision:'ai-pdm-prod-old'}),{code:'DEV127_ROLLBACK_REQUIRES_V2_CONSUMER'})
})

test('DEV-127 native Job basis requires metadata identity, exact image/source, finalized evidence and fresh full traffic',async()=>{
  const f=await bridgeFixture();await f.run()
  const operation=[...f.objects.values()].find(row=>row.value.phase==='plan'&&row.value.basisRef).value
  const basis=f.objects.get(operation.basisRef.uri).value
  const good={operation,basis,intent:f.intent,deployment:f.deployment.value,identity:DEV127_MIGRATOR,
    environment:{CLOUD_RUN_JOB:'ai-pdm-prod-migration-runner',CLOUD_RUN_EXECUTION:'ai-pdm-prod-migration-runner-test123',CLOUD_RUN_TASK_INDEX:'0',CLOUD_RUN_TASK_ATTEMPT:'0',PDM_SOURCE_REVISION:f.intent.sourceRevision},
    service:{name:DEV127_SERVICE,generation:'7',observedGeneration:'7',terminalCondition:{state:'CONDITION_SUCCEEDED'},trafficStatuses:[{revision:f.candidate.candidateRevision,percent:100}]},
    revision:{name:DEV127_SERVICE+'/revisions/'+f.candidate.candidateRevision,containers:[{name:'ai-pdm',image:f.candidate.artifactDigest}]}}
  assert.doesNotThrow(()=>assertDev127JobBasis(good))
  const reused=structuredClone(basis)
  reused.compatible.value.sourceRevision='f'.repeat(40)
  reused.compatible.ref.sha256=sha256(Buffer.from(canonicalize(reused.compatible.value)+'\n'))
  assert.doesNotThrow(()=>assertDev127JobBasis({...good,basis:reused}),'verified immutable artifact reuse retains its original source provenance')
  for(const change of [
    {identity:'user@example.com'},
    {environment:{...good.environment,CLOUD_RUN_EXECUTION:undefined,GITHUB_ACTIONS:'true'}},
    {environment:{...good.environment,PDM_SOURCE_REVISION:'f'.repeat(40)}},
    {deployment:{...good.deployment,migrationRunnerDigest:'wrong-image'}},
    {service:{...good.service,trafficStatuses:[{revision:f.candidate.candidateRevision,percent:99}]}},
    {service:{...good.service,reconciling:true}},
    {basis:{...basis,control:{...basis.control,value:{...basis.control.value,state:'ACTIVE'}}}},
  ])assert.throws(()=>assertDev127JobBasis({...good,...change}))
})

test('DEV-127 immutable operation rejects arbitrary actors, SQL, phases, command IDs, source and cross-owner refs',async()=>{
  const f=await bridgeFixture();await f.run()
  const operation=[...f.objects.values()].find(row=>row.value.phase==='plan'&&row.value.basisRef).value
  const verify=value=>{
    const bytes=Buffer.from(canonicalize(value)+'\n')
    return assertDev127Operation(value,{bytes,sha256:sha256(bytes),sourceRevision:f.intent.sourceRevision,
      runnerSourceRevision:f.intent.sourceRevision,outputRef:operation.outputRef})
  }
  assert.equal(verify(operation),operation)
  for(const patch of [{actorPrincipalId:'human:pretend'},{sql:'SELECT 1'},{phase:'apply-sql'},
    {commandId:'10000000-0000-4000-8000-000000000127'},
    {sourceRevision:'f'.repeat(40)},{sourcePolicySha256:'f'.repeat(64)},
    {basisRef:{uri:'gs://another-owner/receipts/basis.json',sha256:'f'.repeat(64)}},
    {planReceiptRef:{uri:operation.basisRef.uri,sha256:operation.basisRef.sha256}}]) {
    assert.throws(()=>verify({...operation,...patch}),{code:'DEV127_OPERATION_BINDING_INVALID'})
  }
})

test('DEV-127 closed bridge denies old live traffic before planning or submitting a Job',async()=>{
  const f=await bridgeFixture();f.setActive('ai-pdm-prod-old')
  await assert.rejects(f.run(),{code:'DEV127_FINALIZED_CONSUMER_REQUIRED'})
  assert.deepEqual(f.phases,[])
})
