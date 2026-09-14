#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { GoogleAuth } from 'google-auth-library'
import { assertDataCutoverConfig, DataCutoverError } from './lib/dev012-production-data-cutover.mjs'
import { createProviderTransport, executeProviderRun, executeProviderStage } from './lib/dev012-production-data-cutover-provider.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(root, 'config/release/dev012-ai-pdm-production-data-cutover.json')

function fail(code) { throw new DataCutoverError(code) }

export function parseProviderArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1]
    if (!['--stage', '--release-id', '--source-revision', '--input'].includes(key) || !value || result[key]) fail('DATA_CUTOVER_PROVIDER_ARGUMENT_INVALID')
    result[key] = value
  }
  if (!['run', 'prepare', 'fence', 'export', 'import', 'teardown', 'handoff', 'post-live-cleanup', 'restore'].includes(result['--stage']) || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(result['--release-id'] ?? '') || !/^[a-f0-9]{40}$/u.test(result['--source-revision'] ?? '') || typeof result['--input'] !== 'string' || path.isAbsolute(result['--input'])) fail('DATA_CUTOVER_PROVIDER_ARGUMENT_INVALID')
  return { stage: result['--stage'], releaseId: result['--release-id'], sourceRevision: result['--source-revision'], input: result['--input'] }
}

export async function resolveProviderInputPath(rootPath, inputPath) {
  const normalized = inputPath.replace(/\\/gu, '/').replace(/^\.\//u, '')
  if (!normalized.startsWith('output/dev-012/inputs/') || normalized.includes('/../') || normalized.endsWith('/..')) fail('DATA_CUTOVER_PROVIDER_INPUT_PATH_INVALID')
  const inputRoot = path.resolve(rootPath, 'output/dev-012/inputs')
  const candidate = path.resolve(rootPath, ...normalized.split('/'))
  if (!candidate.startsWith(`${inputRoot}${path.sep}`)) fail('DATA_CUTOVER_PROVIDER_INPUT_PATH_INVALID')
  let realRoot
  let metadata
  try { [realRoot, metadata] = await Promise.all([fs.realpath(inputRoot), fs.lstat(candidate)]) } catch { fail('DATA_CUTOVER_PROVIDER_INPUT_PATH_INVALID') }
  if (!metadata.isFile() || metadata.isSymbolicLink()) fail('DATA_CUTOVER_PROVIDER_INPUT_PATH_INVALID')
  let realCandidate
  try { realCandidate = await fs.realpath(candidate) } catch { fail('DATA_CUTOVER_PROVIDER_INPUT_PATH_INVALID') }
  if (!realCandidate.startsWith(`${realRoot}${path.sep}`)) fail('DATA_CUTOVER_PROVIDER_INPUT_PATH_INVALID')
  return realCandidate
}

async function resolveAccessToken(environment) {
  if (typeof environment.GOOGLE_OAUTH_ACCESS_TOKEN === 'string' && environment.GOOGLE_OAUTH_ACCESS_TOKEN.length >= 20) return environment.GOOGLE_OAUTH_ACCESS_TOKEN
  const auth = new GoogleAuth({ scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
  ] })
  const client = await auth.getClient()
  const value = await client.getAccessToken()
  const token = typeof value === 'string' ? value : value?.token
  if (typeof token !== 'string' || token.length < 20) fail('DATA_CUTOVER_PROVIDER_TOKEN_REQUIRED')
  return token
}

export async function main({ argv = process.argv.slice(2), environment = process.env } = {}) {
  const args = parseProviderArgs(argv)
  const inputPath = await resolveProviderInputPath(root, args.input)
  const [config, input, token] = await Promise.all([fs.readFile(configPath, 'utf8').then(JSON.parse).then(assertDataCutoverConfig), fs.readFile(inputPath, 'utf8').then(JSON.parse), resolveAccessToken(environment)])
  const transport = createProviderTransport({ token })
  const result = args.stage === 'run'
    ? await executeProviderRun({ ...args, config, input, transport })
    : await executeProviderStage({ ...args, config, input, transport })
  process.stdout.write(`${JSON.stringify({ stage: args.stage, releaseId: args.releaseId, sourceRevision: args.sourceRevision, ref: result.ref, status: 'PASS' })}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 })
