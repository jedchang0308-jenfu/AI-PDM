import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { nativeCodeFingerprint } from './lib/dev015-gcc-applicability.mjs'
import { GCC_ALIGNED_NEW_CVE, gccAlignedNewOccurrenceMatches, alignedNewLoaderClosureFingerprint, readAlignedNewApplicabilityPolicy, assertAlignedNewApplicabilityAssessment } from './lib/dev015-gcc-aligned-new-applicability.mjs'
const lib = '/usr/lib/x86_64-linux-gnu/libstdc++.so.6.0.33'
const libHash = '972bb2a18b71140dab0240f8a1f68ab3fb1d56bcd4c4f824a91b70888faf5a00'
const config = { user:'65532:65532', workingDirectory:'/app', entrypoint:['/nodejs/bin/node'], command:['server.js'], environmentNames:['NODE_ENV','PATH'], environmentValuesRedacted:true, nonemptyLoaderControlsAbsent:true, volumePaths:[] }
const paths = [lib, '/app/node_modules/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.4.node', '/app/node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.6', '/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node']
const loader = { platform:'linux', arch:'x64', uid:65532, gid:65532, node:'24.21.0', vdsoMapCount:1,
  controls:['/etc/ld.so.preload','/etc/ld.so.conf','/etc/ld.so.cache'].map(path=>({path,exists:false,bytes:0,sha256:null})),
  aliases:['/lib/x86_64-linux-gnu/libstdc++.so.6','/usr/lib/x86_64-linux-gnu/libstdc++.so.6'].map(path=>({path,target:'libstdc++.so.6.0.33'})),
  rows:[{path:'linux-vdso.so.1',kind:'kernel-vdso',fileBacked:false,sha256:null},...paths.map((path,index)=>({path,physicalPath:path,fileBacked:true,bytes:100+index,sha256:index===0?libHash:'b'.repeat(64)}))], sqliteProbe:'IN_MEMORY_SELECT_1', generatedPngSha256:'c'.repeat(64) }
const inventory = { complete:true, platform:'linux', arch:'x64', node:'24.21.0', uid:65532, gid:65532, elf:[...loader.rows.filter(row=>row.fileBacked).map(row=>({path:row.physicalPath,bytes:row.bytes,sha256:row.sha256,pbdsMarkers:[]})),{path:'/nodejs/bin/node',bytes:1000,sha256:'d'.repeat(64),pbdsMarkers:[]}],wasm:[],headers:[],symlinks:[] }
const pins = {ownerApplicationId:'ai-pdm',repository:'jedchang0308-jenfu/AI-PDM',projectId:'jenfu-platform-prod',region:'asia-east1',artifactUri:'asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm',releaseBucket:'jenfu-platform-prod-aipdm-release'}
const policy = {...pins,cve:GCC_ALIGNED_NEW_CVE,nativeCodeFingerprint:nativeCodeFingerprint(inventory),loaderClosureFingerprint:alignedNewLoaderClosureFingerprint(config,loader),investigatedSourceRevision:'e'.repeat(40),investigatedArtifactDigest:pins.artifactUri+'@sha256:'+'f'.repeat(64)}
const evidenceRow = n=>({buildId:`00000000-0000-0000-0000-00000000000${n}`,status:'SUCCESS',logSha256:'a'.repeat(64),readbackSha256:'b'.repeat(64)})
// Synthetic evidence validates acceptance/rejection semantics, not provider provenance.
const assessment = {schemaVersion:'jenfu.dev015.gcc-aligned-new-applicability-assessment.v1',...pins,cve:GCC_ALIGNED_NEW_CVE,state:'NOT_AFFECTED',justification:'VULNERABLE_CODE_NOT_PRESENT',sourceRevision:policy.investigatedSourceRevision,artifactDigest:policy.investigatedArtifactDigest,nativeCodeFingerprint:policy.nativeCodeFingerprint,loaderClosureFingerprint:policy.loaderClosureFingerprint,loaderClosureComplete:true,baselineEvidence:{R65A:evidenceRow(1),R66b:{...evidenceRow(2),status:'FAILURE_PARTIAL',providerStatus:'FAILURE',failure:'vdso treated as file'},R66c:evidenceRow(3)},rationale:'Synthetic contract fixture',evidence:{definedAlignedImplementations:[{path:lib,sha256:libHash}],dynamicAlignedCallers:[{path:'/nodejs/bin/node'}],imageConfig:config,loader,fullElfCount:570,operatorNewProbe:{throwingRejections:9,nothrowRejections:9,validAllocations:3,result:'PASS'},alignedOperatorNewDisassembly:{symbol:'_ZnwmSt11align_val_t',ownerPath:lib,ownerSha256:libHash,posixMemalignCall:true}},limits:['Synthetic fixture, not release evidence'],upstreamSources:['https://github.com/gcc-mirror/gcc/commit/59d235ffa5a69231eb42e5290d52dc8c90d28b7a']}
const verify = (a=assessment,i=inventory,c=config,l=loader)=>assertAlignedNewApplicabilityAssessment(policy,a,i,c,l)

test('actual loader aliases and row order preserve the same hashed physical closure',()=>{
  verify()
  const changed=structuredClone(loader)
  changed.rows[3].path='/app/node_modules/@img/sharp-linux-x64/lib/../../sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.6'
  changed.rows.reverse();changed.controls.reverse();changed.aliases.reverse()
  assert.equal(alignedNewLoaderClosureFingerprint({...config,environmentNames:[...config.environmentNames].reverse()},changed),policy.loaderClosureFingerprint)
  verify(assessment,inventory,config,changed)
})

test('native code, loader bytes, controls and extra loaded modules cannot borrow baseline verdict',()=>{
  const changedInventory=structuredClone(inventory);changedInventory.elf[0].sha256='e'.repeat(64)
  assert.throws(()=>verify(assessment,changedInventory))
  for(const mutate of [l=>l.rows[2].sha256='e'.repeat(64),l=>l.rows[2].bytes++,l=>l.rows.push({path:'/app/extra.node',physicalPath:'/app/extra.node',fileBacked:true,bytes:1,sha256:'e'.repeat(64)}),l=>l.rows.splice(2,1),l=>l.controls.push({path:'/etc/ld.so.conf.d/extra.conf',exists:true,bytes:10,sha256:'e'.repeat(64)}),l=>l.node='24.22.0']){
    const changed=structuredClone(loader);mutate(changed);assert.throws(()=>verify(assessment,inventory,config,changed))
  }
})

test('only exact vDSO pseudo mapping is allowed and real paths remain canonical',()=>{
  for(const mutate of [l=>l.vdsoMapCount=0,l=>l.rows[0].sha256='a'.repeat(64),l=>l.rows[0].fileBacked=true,l=>l.rows.push({...l.rows[0]}),l=>l.rows[2].physicalPath='/app/../other.node',l=>l.rows[2].physicalPath='/app/linuxmusl.node',l=>l.rows[2].path='relative.node',l=>l.aliases.pop(),l=>l.aliases[0].target='unreviewed.so',l=>l.uid=0]){
    const changed=structuredClone(loader);mutate(changed);assert.throws(()=>alignedNewLoaderClosureFingerprint(config,changed))
  }
})

test('image entrypoint, args, volumes and injected loader environment fail closed',()=>{
  for(const mutate of [c=>c.user='0:0',c=>c.command=['other.js'],c=>c.entrypoint=['/other/node'],c=>c.volumePaths=['/app'],c=>c.nonemptyLoaderControlsAbsent=false,c=>c.environmentNames.push('LD_PRELOAD'),c=>c.environmentNames.push('NODE_OPTIONS')]){
    const changed=structuredClone(config);mutate(changed);assert.throws(()=>verify(assessment,inventory,changed))
  }
})

test('wrong owner, source, artifact, CVE, partial and fabricated success evidence is rejected',()=>{
  for(const mutate of [a=>a.ownerApplicationId='orgmaster',a=>a.repository='other',a=>a.sourceRevision='a'.repeat(40),a=>a.artifactDigest='other',a=>a.cve='CVE-2026-102010',a=>a.state='AFFECTED',a=>a.loaderClosureComplete=false,a=>a.baselineEvidence.R66b.status='SUCCESS',a=>a.baselineEvidence.R66b.providerStatus='SUCCESS',a=>a.baselineEvidence.R66c.buildId=a.baselineEvidence.R65A.buildId,a=>a.evidence.operatorNewProbe.validAllocations=0,a=>a.evidence.alignedOperatorNewDisassembly.posixMemalignCall=false,a=>a.evidence.loader.rows[2].sha256='f'.repeat(64),a=>a.evidence.fullElfCount=0,a=>a.extra=true]){
    const changed=structuredClone(assessment);mutate(changed);assert.throws(()=>verify(changed))
  }
})

test('the source-controlled policy binds the owner, repository, artifact and own bucket',()=>{
  const p=JSON.parse(fs.readFileSync(new URL('../config/release/dev015-gcc-aligned-new-applicability.json',import.meta.url),'utf8'))
  const profile={application:{id:p.ownerApplicationId,repository:p.repository},target:{projectId:p.projectId,region:p.region},artifact:{uri:p.artifactUri,releaseBucket:p.releaseBucket}}
  assert.equal(readAlignedNewApplicabilityPolicy(profile).loaderClosureFingerprint,p.loaderClosureFingerprint)
  for(const [section,key] of [['application','id'],['application','repository'],['target','projectId'],['target','region'],['artifact','uri'],['artifact','releaseBucket']]){
    const changed=structuredClone(profile);changed[section][key]='other';assert.throws(()=>readAlignedNewApplicabilityPolicy(changed))
  }
})

test('only assessed Debian GCC HIGH qualifies, unrelated and CRITICAL findings still block',()=>{
  const row={kind:'VULNERABILITY',noteName:'projects/goog-vulnz/notes/'+GCC_ALIGNED_NEW_CVE,vulnerability:{shortDescription:GCC_ALIGNED_NEW_CVE,effectiveSeverity:'HIGH',packageIssue:[{affectedPackage:'gcc-14',packageType:'OS',affectedCpeUri:'cpe:/o:debian:debian_linux:13',affectedVersion:{fullName:'14.2.0-19'}}]}}
  assert.equal(gccAlignedNewOccurrenceMatches(row),true)
  for(const mutate of [r=>r.noteName='other',r=>r.vulnerability.shortDescription='CVE-2026-102010',r=>r.vulnerability.effectiveSeverity='CRITICAL',r=>r.vulnerability.packageIssue=[],r=>r.vulnerability.packageIssue[0].affectedPackage='gcc-15',r=>r.vulnerability.packageIssue[0].affectedVersion.fullName='14.2.0-20',r=>r.vulnerability.packageIssue[0].affectedCpeUri='cpe:/o:debian:debian_linux:12']){
    const changed=structuredClone(row);mutate(changed);assert.equal(gccAlignedNewOccurrenceMatches(changed),false)
  }
})