#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOwnerTransport, sha256 } from './lib/dev012-owner-release-runtime.mjs'
import { WORKER_RECEIPT_PREFIX } from './lib/dev122-openswx-owner-release.mjs'
import { assertWorkerReuseInput, createWorkerGitReader, executeWorkerArtifactReuse, parseWorkerArtifactReuseArgs } from './lib/dev122-openswx-worker-artifact-reuse.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
async function main() {
  const { inputRef } = parseWorkerArtifactReuseArgs(process.argv.slice(2))
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE) throw Object.assign(Error('OPENSWX_ADC_FORBIDDEN'), { code: 'OPENSWX_ADC_FORBIDDEN' })
  const transport = createOwnerTransport({ token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN ?? '' })
  const row = await transport.readJson(inputRef, 'jenfu-platform-prod-aipdm-release', [WORKER_RECEIPT_PREFIX])
  if (sha256(row.bytes) !== inputRef.sha256) throw Object.assign(Error('OPENSWX_REUSE_REF_HASH_INVALID'), { code: 'OPENSWX_REUSE_REF_HASH_INVALID' })
  const input = assertWorkerReuseInput(row.value)
  const lock = (await transport.readJson(input.sourceLockRef, 'jenfu-platform-prod-aipdm-release', ['receipts'])).value
  const readSource = createWorkerGitReader(root, lock.sourceRevision ?? lock.headRevision ?? lock.head)
  const result = await executeWorkerArtifactReuse({ transport, inputRef, readSource })
  process.stdout.write(`${JSON.stringify({ ref: result.ref, status: result.value.status, evidenceScope: result.value.evidenceScope, image: result.value.image })}\n`)
}
main().catch(error => { process.stderr.write(`${error.code ?? 'OPENSWX_REUSE_FAILED'}\n`); process.exitCode = 1 })
