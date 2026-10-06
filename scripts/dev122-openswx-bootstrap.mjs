#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { readGitBlob, createGitSourceIdentity } from './lib/dev012-owner-stage-executor.mjs'
import { executeOpenSwxBootstrap, parseOpenSwxBootstrapArgs } from './lib/dev122-openswx-bootstrap.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
async function main() {
  const args = parseOpenSwxBootstrapArgs(process.argv.slice(2)), oauthToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN ?? ''
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE) throw Object.assign(Error('OPENSWX_ADC_FORBIDDEN'), { code: 'OPENSWX_ADC_FORBIDDEN' })
  const appProfile = JSON.parse(await fs.readFile(path.join(root, 'config/release/dev117-ai-pdm-independent-production-v3.json'), 'utf8'))
  const transport = createOwnerTransport({ token: oauthToken })
  const result = await executeOpenSwxBootstrap({ ...args, root, oauthToken, appProfile, transport,
    readSource(repositoryPath, sourceRevision) { createGitSourceIdentity(root, sourceRevision); return readGitBlob(root, repositoryPath, sourceRevision) },
  })
  process.stdout.write(`${JSON.stringify({ stage: args.stage, ref: result.ref, status: result.value?.facts?.workerStatus ?? result.value?.status })}\n`)
}
main().catch(error => { process.stderr.write(`${error.code ?? 'OPENSWX_OWNER_FAILED'}\n`); process.exitCode = 1 })
