import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function localAdminCiTarget(env) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'GitHub Actions required')
  assert.equal(env.CI, 'true', 'CI required')
  assert.equal(env.GITHUB_REPOSITORY, 'jedchang0308-jenfu/AI-PDM', 'exact repository required')
  assert.equal(env.GITHUB_JOB, 'dev012-postgres-cutover', 'isolated PostgreSQL CI job required')
  assert.equal(env.RUNNER_OS, 'Linux', 'Linux CI runner required')
  assert.match(env.GITHUB_RUN_ID ?? '', /^[1-9][0-9]{0,19}$/u)
  assert.match(env.GITHUB_RUN_ATTEMPT ?? '', /^[1-9][0-9]{0,5}$/u)
  return Object.freeze({
    // Deliberately a test-only credential and fixed separate port. No URL env
    // or primary-data configuration can redirect this CI owner connection.
    ownerUrl: 'postgresql://postgres:aipdm-local-admin-ci-only@127.0.0.1:55478/postgres',
    clusterName: `aipdm-local-admin-ci-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`
  })
}

export async function runLocalAdminCi(env = process.env) {
  const target = localAdminCiTarget(env)
  const { default:pg } = await import('pg')
  const admin = new pg.Client({ connectionString:target.ownerUrl, connectionTimeoutMillis:5000,
    statement_timeout:10000, application_name:'ai-pdm-local-admin-ci-owner' })
  const nonce=randomBytes(12).toString('hex'), database='jenfu_local_policy_'+nonce
  let created=false, failure
  try {
    await admin.connect()
    const state=(await admin.query(`SELECT current_database() AS database,current_user AS actor,
      host(inet_server_addr()) AS server,inet_server_port() AS port,
      current_setting('cluster_name') AS marker,
      extract(epoch FROM clock_timestamp()-pg_postmaster_start_time()) AS age_seconds`)).rows[0]
    assert.equal(state.database,'postgres')
    assert.equal(state.actor,'postgres')
    assert.equal(state.server,'127.0.0.1')
    assert.equal(state.port,55478)
    assert.equal(state.marker,target.clusterName,'task-owned postmaster marker required')
    assert.ok(Number(state.age_seconds)>=0 && Number(state.age_seconds)<600,'fresh CI postmaster required')
    await admin.query(`CREATE DATABASE "${database}"`)
    created=true
    await admin.query(`COMMENT ON DATABASE "${database}" IS 'ai-pdm.local-test-admin-component.v1:${nonce}'`)
    const componentUrl=new URL(target.ownerUrl); componentUrl.pathname='/'+database
    const cwd=fileURLToPath(new URL('../',import.meta.url))
    await new Promise((done,reject)=>{
      const child=spawn(process.execPath,['--experimental-transform-types','--experimental-loader',
        './scripts/qc-ts-path-loader.mjs','scripts/dev126-local-test-admin-postgres.mjs'], {
        cwd,stdio:'inherit',windowsHide:true,env:{...env,LOCAL_TEST_ADMIN_TEST_NONCE:nonce,
          LOCAL_TEST_ADMIN_TEST_DATABASE_URL:componentUrl.href}
      })
      let killTimer
      const timer=setTimeout(()=>{
        child.kill('SIGTERM')
        killTimer=setTimeout(()=>child.kill('SIGKILL'),5000)
      },120000)
      child.once('error',error=>{clearTimeout(timer);clearTimeout(killTimer);reject(error)})
      child.once('exit',(code,signal)=>{
        clearTimeout(timer);clearTimeout(killTimer)
        if(code===0)done();else reject(new Error(`LOCAL_ADMIN_COMPONENT_FAILED:exit=${code}:signal=${signal}`))
      })
    })
  } catch(error) { failure=error } finally {
    try {
      if(created) {
        // Revalidate our postmaster before the exact nonce DB cleanup; never
        // drop a caller-supplied name or terminate unrelated database sessions.
        const marker=(await admin.query("SELECT current_setting('cluster_name') AS marker")).rows[0].marker
        assert.equal(marker,target.clusterName)
        await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`)
        console.log(JSON.stringify({localAdminComponentDatabase:database,cleanup:'DROPPED_EXACT_TASK_OWNED_DATABASE'}))
      }
    } catch(error) {
      failure=failure ? new AggregateError([failure,error],'LOCAL_ADMIN_COMPONENT_AND_CLEANUP_FAILED') : error
    } finally {
      try { await admin.end() } catch(error) {
        failure=failure ? new AggregateError([failure,error],'LOCAL_ADMIN_COMPONENT_AND_CONNECTION_CLOSE_FAILED') : error
      }
    }
  }
  if(failure)throw failure
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  runLocalAdminCi().catch(error=>{console.error(error);process.exitCode=1})
}
