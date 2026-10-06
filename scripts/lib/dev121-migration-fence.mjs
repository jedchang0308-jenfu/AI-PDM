import { assertAiPdmQuiescentV2Service } from './dev121-ai-pdm-quiescence.mjs'
import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'

export const PRINCIPAL_ONLY_MIGRATION_PATH =
  'db/postgres/073_dev121_drawing_recognition_initiator_principal.sql'
export const PRINCIPAL_ONLY_MIGRATION_ORDERS = Object.freeze({
  [PRINCIPAL_ONLY_MIGRATION_PATH]: 24,
  'db/postgres/074_dev121_principal_human_assurance_aal1.sql': 25,
  'db/postgres/080_dev121_principal_role_catalog_v6.sql': 30,
})
const V2_SERVICE_URL =
  'https://run.googleapis.com/v2/projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod'
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u

function fail() { throw new Error('DEV121_MIGRATION_073_FENCE_INVALID') }

export function requiresPrincipalOnlyMigrationFence(entry) {
  return Object.hasOwn(PRINCIPAL_ONLY_MIGRATION_ORDERS, entry?.path ?? '')
}

/** Read the owner writer census on the same connection immediately before SQL. */
export async function assertPrincipalOnlyMigrationWritersAbsent(database) {
  if (!database || typeof database.query !== 'function') fail()
  let result
  try {
    result = await database.query(`
      SELECT count(*)::integer AS "ownerSessions"
      FROM pg_catalog.pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid() AND (
        usename IN ($1,$2)
        OR pg_catalog.pg_has_role(usename,'jenfu_ai_pdm_runtime','MEMBER')
        OR pg_catalog.pg_has_role(usename,'jenfu_ai_pdm_migrator','MEMBER')
      )
    `, ['aipdm-prod-runtime@jenfu-platform-prod.iam',
      'aipdm-prod-migrator@jenfu-platform-prod.iam'])
  } catch { fail() }
  const value = result?.rows?.[0]?.ownerSessions
  if (result?.rows?.length !== 1 ||
    !((typeof value === 'number' && Number.isSafeInteger(value)) ||
      (typeof value === 'string' && /^[0-9]+$/u.test(value))) ||
    Number(value) !== 0) fail()
  return Object.freeze({ ownerWriterSessions: 0 })
}

export function assertPrincipalOnlyMigrationFence({ proof, bytes, expectedSha256,
  sourceRevision, service, observedAt }) {
  const keys = ['schemaVersion', 'sourceRevision', 'projectId', 'region',
    'service', 'serviceUid', 'oldRevision', 'beforeGeneration',
    'quiescentGeneration', 'serviceUpdateTime', 'requestTimeoutSeconds', 'status']
  if (!Buffer.isBuffer(bytes) || !H64.test(expectedSha256 ?? '') ||
    sha256(bytes) !== expectedSha256 || !H40.test(sourceRevision ?? '') ||
    !proof || Array.isArray(proof) || typeof proof !== 'object' ||
    canonicalize(Object.keys(proof).sort()) !== canonicalize(keys.sort()) ||
    proof.schemaVersion !== 'ai-pdm.principal-only-migration-fence.v1' ||
    proof.sourceRevision !== sourceRevision ||
    proof.projectId !== 'jenfu-platform-prod' || proof.region !== 'asia-east1' ||
    proof.service !== 'ai-pdm-prod' || proof.status !== 'QUIESCED' ||
    proof.serviceUpdateTime !== service?.updateTime) fail()
  try {
    return assertAiPdmQuiescentV2Service({ service,
      expectedUid: proof.serviceUid, oldRevision: proof.oldRevision,
      beforeGeneration: proof.beforeGeneration,
      expectedQuiescentGeneration: proof.quiescentGeneration,
      requestTimeoutSeconds: proof.requestTimeoutSeconds, observedAt })
  } catch { fail() }
}

export async function readPrincipalOnlyServiceV2(token, fetchImpl = fetch) {
  if (typeof token !== 'string' || token.length < 20) fail()
  const response = await fetchImpl(V2_SERVICE_URL, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) fail()
  return response.json()
}
