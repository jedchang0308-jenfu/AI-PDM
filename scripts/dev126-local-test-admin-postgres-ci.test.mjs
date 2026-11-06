import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { localAdminCiTarget } from './dev126-local-test-admin-postgres-ci.mjs'

const env={GITHUB_ACTIONS:'true',CI:'true',GITHUB_REPOSITORY:'jedchang0308-jenfu/AI-PDM',
  GITHUB_JOB:'dev012-postgres-cutover',RUNNER_OS:'Linux',GITHUB_RUN_ID:'12345',GITHUB_RUN_ATTEMPT:'2'}
test('CI component has one closed test target and run-bound postmaster marker',()=>{
  const target=localAdminCiTarget({...env,PDM_POSTGRES_URL:'postgresql://production.invalid/primary',
    LOCAL_TEST_ADMIN_TEST_DATABASE_URL:'postgresql://production.invalid/primary'})
  assert.equal(target.ownerUrl,'postgresql://postgres:aipdm-local-admin-ci-only@127.0.0.1:55478/postgres')
  assert.equal(target.clusterName,'aipdm-local-admin-ci-12345-2')
})
test('CI owner refuses other execution contexts before importing database tooling',()=>{
  for(const key of Object.keys(env))assert.throws(()=>localAdminCiTarget({...env,[key]:''}))
  for(const patch of [{GITHUB_JOB:'qc-full'},{GITHUB_REPOSITORY:'other/repository'},
    {GITHUB_RUN_ID:'1; arbitrary'},{GITHUB_RUN_ATTEMPT:'0'},{RUNNER_OS:'Windows'}]) {
    assert.throws(()=>localAdminCiTarget({...env,...patch}))
  }
})
test('CI owns only its host-loopback container and bounds component execution',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8')
  const driver=readFileSync(new URL('./dev126-local-test-admin-postgres-ci.mjs',import.meta.url),'utf8')
  assert.match(workflow,/--network host/u)
  assert.match(workflow,/-c listen_addresses=127\.0\.0\.1 -c port=55478/u)
  assert.match(workflow,/trap cleanup EXIT/u)
  assert.match(workflow,/docker rm --force "\$container"/u)
  assert.match(workflow,/index \.Config\.Labels "ai-pdm\.local-admin-ci"/u)
  assert.match(driver,/current_setting\('cluster_name'\)/u)
  assert.match(driver,/child\.kill\('SIGTERM'\)/u)
  assert.match(driver,/DROP DATABASE "\$\{database\}" WITH \(FORCE\)/u)
})
