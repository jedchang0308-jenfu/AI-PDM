#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { TARGET, databaseOptions } from './dev117-production-migration-runner.mjs'
import {
  assertRunnerTarget, metadataAccessToken, parseGsUri, publishGcsJson,
  readGcsObject,
} from './lib/dev012-production-migration-runner.mjs'
import {
  assertInventoryDatabaseTarget, assertInventoryOperation,
  inventoryDatabaseAdapter, parseInventoryArgs,
} from './lib/dev121-principal-inventory-runner.mjs'

const OPERATION_PREFIX = 'source/production-data/dev121/principal-inventory'
const RECEIPT_PREFIX = 'receipts/releases/DEV121-PRINCIPAL-INVENTORY'

export async function runMain({ argv = process.argv.slice(2), environment = process.env,
  fetchImpl = fetch, Client = pg.Client,
  loadInventory = () => import('../src/lib/jenfu-principal-inventory-registration.ts'),
  loadCoverage = () => import('../src/lib/jenfu-principal-inventory-coverage.ts'),
} = {}) {
  const args = parseInventoryArgs(argv)
  assertRunnerTarget(environment, TARGET)
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
  catch { throw new Error('DEV121_OPERATION_JSON_INVALID') }
  const operation = assertInventoryOperation(raw, {
    bytes: object.bytes, operationSha256: args.operationSha256,
    sourceRevision: args.sourceRevision,
  })
  const database = new Client({ ...databaseOptions(environment, token),
    application_name: 'dev121-ai-pdm-principal-inventory' })
  await database.connect()
  try {
    const target = await assertInventoryDatabaseTarget(database, TARGET.login)
    const adapter = inventoryDatabaseAdapter(database)
    let outcome
    if (operation.mode === 'coverage') {
      outcome = await (await loadCoverage()).previewPrincipalInventoryCoverage(adapter)
    } else {
      const service = await loadInventory()
      outcome = operation.mode === 'preview'
        ? await service.previewPrincipalInventory(adapter, operation.firebaseProjectId, operation.sources)
        : await service.registerPrincipalInventory(adapter, operation.firebaseProjectId, {
          sources: operation.sources,
          expectedSourceHash: operation.expectedSourceHash,
          expectedRowVersion: operation.expectedRowVersion,
        })
    }
    // A retry after DB commit but before GCS publication must produce identical bytes.
    const publishedOutcome = { ...outcome }
    delete publishedOutcome.replayed
    const receipt = {
      schemaVersion: 'ai-pdm.principal-inventory-receipt.v1',
      operationId: operation.operationId,
      mode: operation.mode,
      sourceRevision: args.sourceRevision,
      operationRef: args.operationRef,
      operationSha256: args.operationSha256,
      operationGeneration: object.generation,
      target,
      outcome: publishedOutcome,
    }
    const published = await publishGcsJson({ uri: args.outputRef,
      expectedBucket: TARGET.releaseBucket, expectedPrefix: RECEIPT_PREFIX,
      value: receipt, token, fetchImpl })
    return { ...receipt, outputRef: args.outputRef,
      outputGeneration: published.generation, outputSha256: published.sha256 }
  } finally {
    await database.end()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then((value) => process.stdout.write(`${JSON.stringify(value)}\n`))
    .catch((error) => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1 })
}
