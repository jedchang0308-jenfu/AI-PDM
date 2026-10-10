#!/usr/bin/env node
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { createGitSourceIdentity, readGitBlob } from './lib/dev012-owner-stage-executor.mjs'
import { assertOpenSwxWorkerRef } from './lib/dev122-openswx-owner-release.mjs'
import { verifyNormalActor } from './lib/dev122-openswx-bootstrap.mjs'
import { executeSecretVersionIamContinuation } from './lib/dev122-openswx-secret-version-iam.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
async function main() {
  const argv = process.argv.slice(2)
  if (argv.length !== 4 || new Set([argv[0], argv[2]]).size !== 2 || !['--input-ref', '--input-sha256'].every(key => [argv[0], argv[2]].includes(key))) throw Error('OPENSWX_SECRET_VERSION_IAM_ARGS_INVALID')
  const options = Object.fromEntries([[argv[0], argv[1]], [argv[2], argv[3]]])
  const inputRef = { uri: options['--input-ref'], sha256: options['--input-sha256'] }
  assertOpenSwxWorkerRef(inputRef)
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN ?? ''
  const profile = JSON.parse(await fs.readFile(path.join(root, 'config/release/dev122-openswx-worker.json'), 'utf8'))
  const result = await executeSecretVersionIamContinuation({ inputRef, root, oauthToken: token, transport: createOwnerTransport({ token }),
    verifyActor: transport => verifyNormalActor(transport, profile),
    readSource(repositoryPath, sourceRevision) { createGitSourceIdentity(root, sourceRevision); return readGitBlob(root, repositoryPath, sourceRevision) },
  })
  process.stdout.write(JSON.stringify({ ref: result.ref, status: result.value.status }) + '\n')
}
main().catch(error => { process.stderr.write((error.code ?? 'OPENSWX_SECRET_VERSION_IAM_FAILED') + '\n'); process.exitCode = 1 })
