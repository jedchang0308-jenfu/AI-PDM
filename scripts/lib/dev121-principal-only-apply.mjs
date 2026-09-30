import {
  canonicalize, readGcsObject, sha256,
} from './dev012-production-migration-runner.mjs'
import {
  assertInventoryOperation, inPrincipalCutoverWriteTransaction,
} from './dev121-principal-inventory-runner.mjs'
import { assertPrincipalOnlySourceReceipt } from './dev121-principal-only-source-receipt.mjs'
import {
  assertPrincipalOnlyMigrationFence, assertPrincipalOnlyMigrationWritersAbsent,
  readPrincipalOnlyServiceV2,
} from './dev121-migration-fence.mjs'
import { assertPrincipalOnlyRecoveryBinding, assertRecoveryProofReadback } from './dev121-principal-only-release.mjs'

const BUCKET = 'jenfu-platform-prod-aipdm-release'
const SOURCE_PREFIX = 'source/migration-bundles/dev121/principal-inventory'
const RECEIPT_PREFIX = 'receipts/releases/DEV121-PRINCIPAL-INVENTORY'
const FENCE_PREFIX = 'receipts/releases/DEV121-PRINCIPAL-ONLY-MIGRATION-FENCE'
const RECOVERY_PREFIX = 'receipts/releases/DEV121-PRINCIPAL-ONLY-RECOVERY'
// The existing recovery validator needs only these exact owner profile fields.
const PROFILE = Object.freeze({
  target: { projectId: 'jenfu-platform-prod', region: 'asia-east1', serviceName: 'ai-pdm-prod' },
  artifact: { releaseBucket: BUCKET }, runtime: { containerName: 'ai-pdm' },
})
const SOURCE_KEYS = ['pdmUserId', 'companyId', 'principalId', 'employeeId',
  'sourceKind', 'identityIssuer', 'identitySubject', 'mappingVersion', 'publishedAt']
function fail() { throw new Error('DEV121_PRINCIPAL_APPLY_PROOF_INVALID') }
async function readJson(ref, prefix, token, fetchImpl) {
  const object = await readGcsObject({ uri: ref.uri, expectedBucket: BUCKET,
    expectedPrefix: prefix, token, fetchImpl })
  if (sha256(object.bytes) !== ref.sha256 ||
      ref.generation !== undefined && ref.generation !== object.generation) fail()
  try { return { ...object, value: JSON.parse(object.bytes.toString('utf8')) } }
  catch { fail() }
}

/** The existing owner Job is the only production caller of the one-shot transaction. */
export async function applyPrincipalOnlyInventoryOperation({ operation, inputHash,
  database, token, fetchImpl = fetch, loadPrincipalOnlyApply }) {
  const sourceObject = await readJson(operation.sourceReceiptRef, RECEIPT_PREFIX, token, fetchImpl)
  const sourceReceipt = sourceObject.value
  const sourceOperation = await readJson({ uri: sourceReceipt.operationRef,
    sha256: sourceReceipt.operationSha256, generation: sourceReceipt.operationGeneration },
  SOURCE_PREFIX, token, fetchImpl)
  const checkedOperation = assertInventoryOperation(sourceOperation.value, {
    bytes: sourceOperation.bytes, operationSha256: sourceReceipt.operationSha256,
    sourceRevision: operation.sourceRevision,
  })
  const checked = assertPrincipalOnlySourceReceipt(sourceReceipt, {
    bytes: sourceObject.bytes, receiptSha256: operation.sourceReceiptRef.sha256,
    receiptGeneration: sourceObject.generation, sourceRevision: operation.sourceRevision,
    operationRef: sourceReceipt.operationRef,
    operationSha256: sourceReceipt.operationSha256,
    operationGeneration: sourceOperation.generation,
  })
  const verifiedSource = Object.fromEntries(SOURCE_KEYS.map((key) => [key, checked.source.verified[key]]))
  if (checkedOperation.mode !== 'principal_only_source' ||
      checkedOperation.operationId !== sourceReceipt.operationId ||
      canonicalize(checkedOperation.sources) !== canonicalize([verifiedSource])) fail()
  const fence = await readJson(operation.principalOnlyFenceRef, FENCE_PREFIX, token, fetchImpl)
  const recovery = await readJson(operation.principalOnlyRecovery.receiptRef, RECOVERY_PREFIX,
    token, fetchImpl)
  assertPrincipalOnlyRecoveryBinding({
    principalOnlyFenceRef: operation.principalOnlyFenceRef,
    principalOnlyRecovery: operation.principalOnlyRecovery,
    previousRevision: fence.value.oldRevision,
  }, BUCKET)
  const apply = await loadPrincipalOnlyApply()
  return inPrincipalCutoverWriteTransaction(database, (client) =>
    apply.applyPrincipalOnlyCohortInOwnerTransaction(client, {
      operationId: operation.operationId, inputHash,
      cohortHash: checked.source.cohortHash, sourceHash: checked.source.sourceHash,
      firebaseProjectId: operation.firebaseProjectId,
      verified: checked.source.verified, activeProfiles: checked.source.activeProfiles,
    }, { beforeApply: async () => {
      // This callback runs only for a fresh operation, after cohort/table locks.
      // A committed replay cannot write and needs no new maintenance window.
      const service = await readPrincipalOnlyServiceV2(token, fetchImpl)
      assertPrincipalOnlyMigrationFence({ proof: fence.value, bytes: fence.bytes,
        expectedSha256: operation.principalOnlyFenceRef.sha256,
        sourceRevision: operation.sourceRevision, service, observedAt: new Date().toISOString() })
      const revisionResponse = await fetchImpl(`https://run.googleapis.com/v2/${service.name}/revisions/${operation.principalOnlyRecovery.revision}`, {
        headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000),
      })
      if (!revisionResponse.ok) fail()
      const revision = await revisionResponse.json()
      assertRecoveryProofReadback({ sourceRevision: operation.sourceRevision,
        oldRevision: fence.value.oldRevision, binding: operation.principalOnlyRecovery,
        profile: PROFILE, proof: recovery.value, service, revision })
      await assertPrincipalOnlyMigrationWritersAbsent(database)
    } }))
}
