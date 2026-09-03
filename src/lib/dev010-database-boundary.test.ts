import { describe, expect, it } from 'vitest'

import { resolveCloudSqlRuntimeConfig } from '@/lib/cloud-sql-contract'

describe('DEV-010 N2 AI-PDM database boundary', () => {
  it('uses the fixed eight-connection pool and neutral search path when enabled', () => {
    const config = resolveCloudSqlRuntimeConfig({
      ...process.env,
      PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-dev010:asia-east1:ai-pdm',
      PDM_CLOUD_SQL_USER: 'fixture-runtime',
      DEV010_N2_DATABASE_BOUNDARY: 'required',
      DEV010_N2_RUN_ID: 'fixture-run',
    })
    expect(config.maxConnections).toBe(8)
    expect(config.searchPath).toBe('ai_pdm_core,pg_catalog')
    expect(config.applicationName).toBe('dev010-n2-ai-pdm-fixture-run')
    expect(config.queryTimeoutMillis).toBeGreaterThan(config.statementTimeoutMillis)
  })

  it('rejects static database credentials in the neutral lane', () => {
    expect(() => resolveCloudSqlRuntimeConfig({ ...process.env, PDM_POSTGRES_URL: 'postgres://forbidden' })).toThrow('CLOUD_SQL_STATIC_DATABASE_SECRET_FORBIDDEN')
  })
})
