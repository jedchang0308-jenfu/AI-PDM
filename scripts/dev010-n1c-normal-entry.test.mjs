import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { resolveCloudSqlRuntimeConfig } from '../src/lib/cloud-sql-contract.ts'
import { readProductionSmokeRuntimeIsolation } from '../src/lib/production-smoke-runtime.ts'
import { assertNormalEntryContract, assertOperationId } from './dev010-n1c-normal-entry.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const exact = {
  DEV010_N1C_TARGET_GUARD: 'required',
  DEV010_N1C_RUN_ID: 'LOCAL-UNIT',
  PDM_DEPLOYMENT_ENV: 'staging',
  GOOGLE_CLOUD_PROJECT: 'jenfu-platform-nonprod',
  GOOGLE_CLOUD_REGION: 'asia-east1',
  PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-nonprod:asia-east1:jenfu-platform-nonprod-pg',
  PDM_CLOUD_SQL_DATABASE: 'jenfu_stg',
  PDM_CLOUD_SQL_USER: 'dev010-stg-aipdm-runtime@jenfu-platform-nonprod.iam',
  PDM_CLOUD_SQL_POOL_MAX: '2',
  PDM_DATABASE_ENVIRONMENT_MARKER: 'JENFU_ENVIRONMENT=staging;DEV=DEV-010;SLICE=N1C',
  PDM_SMOKE_GCS_WRITER: 'disabled',
  PDM_SMOKE_OUTBOX_CONSUMER: 'disabled',
  PDM_SMOKE_EXTERNAL_NOTIFICATION: 'disabled',
}

test('N1C-RUNTIME-01 exact runtime config creates a two-connection guarded pool contract', () => {
  const config = resolveCloudSqlRuntimeConfig(exact)
  assert.equal(config.maxConnections, 2)
  assert.equal(config.database, 'jenfu_stg')
  assert.equal(config.searchPath, 'ai_pdm_core,pg_catalog')
  assert.equal(config.startupTarget?.environmentMarker, exact.PDM_DATABASE_ENVIRONMENT_MARKER)
  assert.match(config.applicationName ?? '', /^dev010-n1c-ai-pdm-/u)
})

test('N1C-RUNTIME-02 wrong database, login, marker, project, or pool fails closed', () => {
  for (const changed of [
    { PDM_CLOUD_SQL_DATABASE: 'jenfu_dev' },
    { PDM_CLOUD_SQL_USER: 'dev010-aipdm-runtime@jenfu-platform-nonprod.iam' },
    { PDM_DATABASE_ENVIRONMENT_MARKER: 'production' },
    { GOOGLE_CLOUD_PROJECT: 'jenfu-ai-pdm-prod' },
  ]) assert.throws(() => resolveCloudSqlRuntimeConfig({ ...exact, ...changed }), /DEV010_N1C_AI_PDM_WRONG_TARGET/u)
  assert.throws(() => resolveCloudSqlRuntimeConfig({ ...exact, PDM_CLOUD_SQL_POOL_MAX: '3' }), /DEV010_N1C_AI_PDM_POOL_BOUNDARY_INVALID/u)
})

test('N1C-RUNTIME-03 staging smoke tenant is environment-specific and production policy remains unchanged', () => {
  const staging = readProductionSmokeRuntimeIsolation(exact)
  assert.equal(staging.company.id, 'company-staging-smoke')
  assert.equal(staging.company.code, 'STAGING-SMOKE')
  assert.equal(staging.isolated, true)
  const production = readProductionSmokeRuntimeIsolation({ PDM_SMOKE_GCS_WRITER: 'disabled', PDM_SMOKE_OUTBOX_CONSUMER: 'disabled', PDM_SMOKE_EXTERNAL_NOTIFICATION: 'disabled' })
  assert.equal(production.company.id, 'company-smoke')
  assert.equal(production.company.code, 'SMOKE')
})

test('N1C-RUNTIME-04 readiness source checks database, user, PG17, schema, and database marker', () => {
  const provider = fs.readFileSync(path.join(root, 'src', 'lib', 'db-async-provider.ts'), 'utf8')
  const route = fs.readFileSync(path.join(root, 'src', 'app', 'api', 'health', 'ready', 'route.ts'), 'utf8')
  for (const pattern of [/current_database\(\)/u, /current_user/u, /server_version_num/u, /to_regnamespace/u, /shobj_description/u, /DEV010_N1C_AI_PDM_DATABASE_READBACK_MISMATCH/u]) assert.match(provider, pattern)
  assert.match(route, /verifyAsyncDatabaseReadiness/u)
  assert.match(route, /status: 503/u)
  assert.match(route, /private, no-store/u)
})

test('N1C-RUNTIME-05 Hosting normal-entry and operation identifiers are exact', () => {
  assert.equal(assertNormalEntryContract().status, 'PASS')
  assert.equal(assertOperationId('DEV010-N1C-20260906A'), 'DEV010-N1C-20260906A')
  assert.throws(() => assertOperationId('A0059'), /DEV010_N1C_OPERATION_ID_INVALID/u)
})
