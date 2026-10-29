import pg from 'pg'
import { isLoopbackHost, LocalSandboxError, readLocalSandboxConfig } from '../../contracts/local-principal-sandbox/v1/protocol.mjs'

const fail = () => { throw new LocalSandboxError('dev126_reset_runtime_target_invalid', 503) }

/** Read the target through the actual least-privileged application login.
 * This port never uses the owner snapshot connection or emits its credentials.
 */
export function createDev126LocalResetRuntimeTargetReader({ environment, Pool = pg.Pool }) {
  const config = readLocalSandboxConfig(environment, 'ai-pdm')
  if (typeof Pool !== 'function') fail()
  const endpoint = new URL(config.databaseUrl)
  return Object.freeze({
    async readCurrentTarget({ target, expectedDatabase }) {
      if (!target || !expectedDatabase || config.sandboxId !== target.sandboxId ||
        config.databaseName !== target.databaseName || config.runtimeRole !== expectedDatabase.runtimeRole ||
        config.databaseName !== expectedDatabase.databaseName) fail()
      const pool = new Pool({ connectionString: config.databaseUrl, ssl: false, max: 1,
        connectionTimeoutMillis: 5000, statement_timeout: 5000,
        application_name: 'dev126-reset-runtime-target-readback' })
      let client
      try {
        client = await pool.connect()
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
        const identity = await client.query(`SELECT current_database() AS database_name,current_user AS current_user,
          session_user AS session_user,host(inet_server_addr()) AS server_address,inet_server_port() AS server_port,
          role.rolsuper,role.rolcreatedb,role.rolcreaterole,role.rolbypassrls,
          pg_has_role(current_user,namespace.nspowner,'MEMBER') AS owns_schema
          FROM pg_catalog.pg_roles role JOIN pg_catalog.pg_namespace namespace ON namespace.nspname='ai_pdm_core'
          WHERE role.rolname=current_user`)
        const row = identity.rows?.[0]
        if (identity.rows?.length !== 1 || row.database_name !== config.databaseName ||
          row.current_user !== config.runtimeRole || row.session_user !== config.runtimeRole ||
          !isLoopbackHost(row.server_address) || Number(row.server_port) !== Number(endpoint.port || 5432) ||
          [row.rolsuper,row.rolcreatedb,row.rolcreaterole,row.rolbypassrls,row.owns_schema].some(value => value !== false)) fail()
        const metadata = await client.query(`SELECT application_id,sandbox_id,database_name,sandbox_root,
          data_directory,repository_directory,generation::text AS generation,fixture_version,btrim(fixture_hash) AS fixture_hash,
          native_session_contract_version,target_fingerprint,status
          FROM ai_pdm_core.local_sandbox_target_metadata WHERE application_id='ai-pdm' AND sandbox_id=$1`, [config.sandboxId])
        if (metadata.rows?.length !== 1) fail()
        const value = metadata.rows[0]
        await client.query('COMMIT')
        return Object.freeze({
          connection: Object.freeze({ databaseName: row.database_name,currentUser: row.current_user,
            sessionUser: row.session_user,serverAddress: row.server_address,serverPort: Number(row.server_port) }),
          targetMetadata: Object.freeze({ applicationId: value.application_id,sandboxId: value.sandbox_id,
            databaseName: value.database_name,sandboxRoot: value.sandbox_root,dataDirectory: value.data_directory,
            repositoryDirectory: value.repository_directory,generation: value.generation,fixtureVersion: value.fixture_version,
            fixtureHash: value.fixture_hash,nativeSessionContractVersion: value.native_session_contract_version,
            targetFingerprint: value.target_fingerprint,status: value.status }),
        })
      } catch (error) {
        await client?.query('ROLLBACK').catch(() => {})
        if (error instanceof LocalSandboxError) throw error
        fail()
      } finally { client?.release(); await pool.end() }
    },
  })
}
