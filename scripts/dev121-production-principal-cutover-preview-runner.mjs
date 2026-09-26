#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { TARGET, databaseOptions } from './dev117-production-migration-runner.mjs'
import {
  assertRunnerTarget, canonicalize, metadataAccessToken, parseGsUri,
  publishGcsJson, readGcsObject, sha256,
} from './lib/dev012-production-migration-runner.mjs'
import {
  assertInventoryDatabaseTarget, inventoryDatabaseAdapter, parseInventoryArgs,
} from './lib/dev121-principal-inventory-runner.mjs'
import {
  assertCutoverPreviewOperation, assertProfileClaimConfirmation,
  summarizeCutoverPreview,
} from './lib/dev121-principal-cutover-preview-runner.mjs'
import { readOwnerReleaseProof } from './lib/dev121-owner-release-proof.mjs'

// The existing migrator grant can read migration-bundles, not production-data.
const OPERATION_PREFIX = 'source/migration-bundles/dev121/principal-cutover-preview'
const CONFIRMATION_PREFIX = `${OPERATION_PREFIX}/confirmations`
const RECEIPT_PREFIX = 'receipts/releases/DEV121-PRINCIPAL-CUTOVER-PREVIEW'
export const OPERATOR_TARGET = Object.freeze({ ...TARGET,
  job: 'ai-pdm-prod-dev121-principal-cutover-preview' })
const RECEIPT_KEYS_V1 = ['schemaVersion', 'operationId', 'sourceRevision',
  'operationRef', 'operationSha256', 'operationGeneration', 'target', 'status', 'outcome']
const RECEIPT_KEYS_V2 = [...RECEIPT_KEYS_V1, 'confirmationObjects']
const RECEIPT_KEYS_V3 = [...RECEIPT_KEYS_V2, 'ownerReleaseProofs']

function receiptVersion(operation) {
  return operation.schemaVersion.endsWith('.v3') ? 'v3' :
    operation.schemaVersion.endsWith('.v2') ? 'v2' : 'v1'
}

function confirmationRef(hash) {
  return `gs://${TARGET.releaseBucket}/${CONFIRMATION_PREFIX}/${hash}.json`
}

function expectedConfirmationHashes(operation) {
  return operation.sourceSets.flat()
    .filter((source) => source.claimKind === 'profile_transfer')
    .map((source) => source.confirmationReceiptHash).sort()
}

function validConfirmationObjects(value, operation) {
  const expected = expectedConfirmationHashes(operation)
  return Array.isArray(value) && value.length === expected.length &&
    value.every((row, index) => row &&
      canonicalize(Object.keys(row).sort()) ===
        canonicalize(['ref', 'sha256', 'generation', 'crc32c'].sort()) &&
      row.sha256 === expected[index] && row.ref === confirmationRef(expected[index]) &&
      /^[1-9][0-9]*$/u.test(String(row.generation ?? '')) &&
      typeof row.crc32c === 'string' &&
      Buffer.from(row.crc32c, 'base64').length === 4 &&
      Buffer.from(row.crc32c, 'base64').toString('base64') === row.crc32c)
}

/** Shared Job logs are not the restricted receipt store. */
export function publicCutoverPreviewLog(value) {
  return {
    schemaVersion: value.schemaVersion,
    operationId: value.operationId,
    sourceRevision: value.sourceRevision,
    status: value.status,
    outputRef: value.outputRef,
    outputGeneration: value.outputGeneration,
    outputSha256: value.outputSha256,
    reused: value.reused,
    cohortCount: value.outcome.cohort.length,
    workspaceStatus: value.outcome.workspaceShadow.status,
    gapCount: value.outcome.workspaceShadow.gapCount,
    mismatchCount: value.outcome.workspaceShadow.mismatchCount,
    applyAllowed: false,
  }
}

async function readExistingReceipt({ uri, token, fetchImpl }) {
  const ref = parseGsUri(uri, TARGET.releaseBucket, RECEIPT_PREFIX)
  const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(ref.bucket)}/o/${encodeURIComponent(ref.object)}`
  const response = await fetchImpl(metadataUrl, {
    headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`DEV121_CUTOVER_PREVIEW_RECEIPT_READ_FAILED:${response.status}`)
  return readGcsObject({ uri, expectedBucket: TARGET.releaseBucket,
    expectedPrefix: RECEIPT_PREFIX, token, fetchImpl })
}

function verifiedExistingReceipt(existing, operation, args, generation,
  confirmationObjects, ownerReleaseProofs) {
  let value
  try { value = JSON.parse(existing.bytes.toString('utf8')) }
  catch { throw new Error('DEV121_CUTOVER_PREVIEW_RECEIPT_CONFLICT') }
  const target = { database: 'jenfu_prod', login: TARGET.login, major: 17 }
  const version = receiptVersion(operation)
  const transfer = version !== 'v1'
  const keys = version === 'v3' ? RECEIPT_KEYS_V3 :
    transfer ? RECEIPT_KEYS_V2 : RECEIPT_KEYS_V1
  if (!value || canonicalize(Object.keys(value).sort()) !==
      canonicalize(keys.slice().sort()) ||
      value.schemaVersion !== `ai-pdm.principal-cutover-preview-receipt.${version}` ||
      value.operationId !== operation.operationId ||
      value.sourceRevision !== args.sourceRevision ||
      value.operationRef !== args.operationRef ||
      value.operationSha256 !== args.operationSha256 ||
      value.operationGeneration !== generation ||
      canonicalize(value.target) !== canonicalize(target) ||
      value.status !== 'READ_ONLY_PREVIEW' ||
      value.outcome?.sourceBindingsAttested !== false ||
      value.outcome?.applyAllowed !== false ||
      (transfer && (!validConfirmationObjects(value.confirmationObjects, operation) ||
        canonicalize(value.confirmationObjects) !== canonicalize(confirmationObjects))) ||
      (version === 'v3' && canonicalize(value.ownerReleaseProofs) !==
        canonicalize(ownerReleaseProofs))) {
    throw new Error('DEV121_CUTOVER_PREVIEW_RECEIPT_CONFLICT')
  }
  const outcome = summarizeCutoverPreview({ ...value.outcome,
    graphCheck: { graphHash: value.outcome.graphHash },
    plan: { planHash: value.outcome.planHash } })
  if (canonicalize(outcome) !== canonicalize(value.outcome)) {
    throw new Error('DEV121_CUTOVER_PREVIEW_RECEIPT_CONFLICT')
  }
  return { ...value, outputRef: args.outputRef,
    outputGeneration: existing.generation, outputSha256: sha256(existing.bytes), reused: true }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env,
  fetchImpl = fetch, Client = pg.Client,
  loadPreview = () => import('../src/lib/jenfu-principal-acl-migration-preview.ts'),
  readOwnerProof = readOwnerReleaseProof,
} = {}) {
  const args = parseInventoryArgs(argv)
  assertRunnerTarget(environment, OPERATOR_TARGET)
  if (environment.PDM_SOURCE_REVISION !== args.sourceRevision) {
    throw new Error('DEV121_IMAGE_SOURCE_REVISION_MISMATCH')
  }
  parseGsUri(args.operationRef, TARGET.releaseBucket, OPERATION_PREFIX)
  parseGsUri(args.outputRef, TARGET.releaseBucket, RECEIPT_PREFIX)
  const token = await metadataAccessToken(fetchImpl)
  const object = await readGcsObject({ uri: args.operationRef,
    expectedBucket: TARGET.releaseBucket, expectedPrefix: OPERATION_PREFIX,
    token, fetchImpl })
  let raw
  try { raw = JSON.parse(object.bytes.toString('utf8')) }
  catch { throw new Error('DEV121_CUTOVER_PREVIEW_JSON_INVALID') }
  const operation = assertCutoverPreviewOperation(raw, {
    bytes: object.bytes, operationSha256: args.operationSha256,
    sourceRevision: args.sourceRevision,
  })
  const confirmationObjects = []
  for (const source of operation.sourceSets.flat()) {
    if (source.claimKind !== 'profile_transfer') continue
    const ref = confirmationRef(source.confirmationReceiptHash)
    const confirmation = await readGcsObject({ uri: ref,
      expectedBucket: TARGET.releaseBucket, expectedPrefix: CONFIRMATION_PREFIX,
      token, fetchImpl })
    let confirmationValue
    try { confirmationValue = JSON.parse(confirmation.bytes.toString('utf8')) }
    catch { throw new Error('DEV121_CUTOVER_PREVIEW_CONFIRMATION_JSON_INVALID') }
    assertProfileClaimConfirmation(confirmationValue, source, {
      bytes: confirmation.bytes, expectedSha256: source.confirmationReceiptHash,
    })
    confirmationObjects.push({ ref, sha256: source.confirmationReceiptHash,
      generation: confirmation.generation, crc32c: confirmation.crc32c })
  }
  confirmationObjects.sort((left, right) => left.sha256 < right.sha256 ? -1 :
    left.sha256 > right.sha256 ? 1 : 0)
  if (receiptVersion(operation) !== 'v1' &&
      !validConfirmationObjects(confirmationObjects, operation)) {
    throw new Error('DEV121_CUTOVER_PREVIEW_CONFIRMATION_READBACK_INVALID')
  }
  let ownerReleaseProofs = null
  if (receiptVersion(operation) === 'v3') {
    ownerReleaseProofs = {}
    for (const [key, owner] of [['platform', 'platform'],
      ['orgmaster', 'orgmaster'], ['aiPdm', 'ai-pdm']]) {
      ownerReleaseProofs[key] = await readOwnerProof({ owner,
        sourceRevision: operation.sourceRevisions[key],
        refs: operation.ownerReleaseRefs[key], token, fetchImpl })
      if (ownerReleaseProofs[key]?.owner !== owner ||
          ownerReleaseProofs[key]?.sourceRevision !== operation.sourceRevisions[key]) {
        throw new Error('DEV121_CUTOVER_PREVIEW_OWNER_PROOF_INVALID')
      }
    }
  }
  const existing = await readExistingReceipt({ uri: args.outputRef, token, fetchImpl })
  if (existing) return verifiedExistingReceipt(existing, operation, args,
    object.generation, confirmationObjects, ownerReleaseProofs)
  const database = new Client({ ...databaseOptions(environment, token),
    application_name: 'dev121-ai-pdm-principal-cutover-preview' })
  await database.connect()
  try {
    const target = await assertInventoryDatabaseTarget(database, TARGET.login)
    const adapter = inventoryDatabaseAdapter(database)
    const service = await loadPreview()
    const outcome = await adapter.transaction(async (snapshot) => {
      await snapshot.execute('SET LOCAL ROLE jenfu_ai_pdm_migrator')
      await snapshot.execute("SET LOCAL TIME ZONE 'UTC'")
      await snapshot.execute("SET LOCAL statement_timeout = '5s'")
      const times = await snapshot.query('SELECT transaction_timestamp()::text AS cutover_at')
      if (times.length !== 1 || !Number.isFinite(Date.parse(times[0].cutover_at))) {
        throw new Error('DEV121_CUTOVER_PREVIEW_TIME_INVALID')
      }
      const envelope = await service.previewPrincipalCutoverSourceEnvelopeInSnapshot(snapshot, {
        firebaseProjectId: operation.firebaseProjectId,
        sourceSets: operation.sourceSets,
        cutoverAt: new Date(times[0].cutover_at).toISOString(),
        operationId: operation.operationId,
        sourceRevisions: operation.sourceRevisions,
        contractManifestHashes: operation.contractManifestHashes,
      })
      return summarizeCutoverPreview(envelope)
    }, { isolationLevel: 'repeatable_read', readOnly: true })
    const receipt = {
      schemaVersion: `ai-pdm.principal-cutover-preview-receipt.${receiptVersion(operation)}`,
      operationId: operation.operationId,
      sourceRevision: args.sourceRevision,
      operationRef: args.operationRef,
      operationSha256: args.operationSha256,
      operationGeneration: object.generation,
      target,
      status: 'READ_ONLY_PREVIEW',
      outcome,
      ...(receiptVersion(operation) !== 'v1'
        ? { confirmationObjects } : {}),
      ...(ownerReleaseProofs ? { ownerReleaseProofs } : {}),
    }
    let published
    try {
      published = await publishGcsJson({ uri: args.outputRef,
        expectedBucket: TARGET.releaseBucket, expectedPrefix: RECEIPT_PREFIX,
        value: receipt, token, fetchImpl })
    } catch (error) {
      if (error?.code !== 'MIGRATION_GCS_IMMUTABILITY_CONFLICT') throw error
      const concurrent = await readExistingReceipt({ uri: args.outputRef, token, fetchImpl })
      if (!concurrent) throw error
      return verifiedExistingReceipt(concurrent, operation, args,
        object.generation, confirmationObjects, ownerReleaseProofs)
    }
    return { ...receipt, outputRef: args.outputRef,
      outputGeneration: published.generation, outputSha256: published.sha256,
      reused: published.reused }
  } finally {
    await database.end()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then((value) => process.stdout.write(`${JSON.stringify(publicCutoverPreviewLog(value))}\n`))
    .catch((error) => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1 })
}
