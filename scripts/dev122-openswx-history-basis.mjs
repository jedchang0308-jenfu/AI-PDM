#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { parseWorkerArtifactReuseArgs, createWorkerGitReader, assertOpenSwxHistoryBasisInput, executeOpenSwxHistoryBasis } from './lib/dev122-openswx-worker-artifact-reuse.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
async function main() {
  const { inputRef } = parseWorkerArtifactReuseArgs(process.argv.slice(2))
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE) throw Object.assign(Error('OPENSWX_ADC_FORBIDDEN'), { code: 'OPENSWX_ADC_FORBIDDEN' })
  const transport = createOwnerTransport({ token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN ?? '' })
  const input = assertOpenSwxHistoryBasisInput((await transport.readJson(inputRef, 'jenfu-platform-prod-aipdm-release', ['receipts/dev-122/openswx-worker'])).value)
  const lock = (await transport.readJson(input.sourceLockRef, 'jenfu-platform-prod-aipdm-release', ['receipts'])).value
  const result = await executeOpenSwxHistoryBasis({ transport, inputRef, readSource: createWorkerGitReader(root, lock.sourceRevision) })
  process.stdout.write(`${JSON.stringify({ ref: result.ref, purpose: result.value.purpose })}\n`)
}
main().catch(error => { process.stderr.write(`${error.code ?? 'OPENSWX_HISTORY_BASIS_FAILED'}\n`); process.exitCode = 1 })
