#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { createGitArchive } from './lib/dev012-owner-stage-executor.mjs'
import { verifyOfficialMergedSource } from './lib/dev012-official-source-review.mjs'
import { assertRecoveryProofReadback } from './lib/dev121-principal-only-release.mjs'
import { assertRecoveryBaseline, recoveryBuildRequest, assertRecoveryBuildReadback,
  recoveryRevisionRequest, assertRecoveryRevisionReadback, recoveryProof } from './lib/dev121-principal-recovery-operator.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bucket = 'jenfu-platform-prod-aipdm-release'
const repository = 'jedchang0308-jenfu/AI-PDM'
const imageRepository = 'projects/jenfu-platform-prod/locations/asia-east1/repositories/aipdm-release'

async function artifactImageReadback(transport, imageDigest) {
  let pageToken = ''
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ pageSize: '100' })
    if (pageToken) query.set('pageToken', pageToken)
    const value = await transport.request(`https://artifactregistry.googleapis.com/v1/${imageRepository}/dockerImages?${query}`)
    if (value.dockerImages?.some((row) => row.uri === imageDigest)) return
    pageToken = value.nextPageToken ?? ''
    if (!pageToken) break
  }
  throw new Error('DEV121_RECOVERY_ARTIFACT_READBACK_MISSING')
}

async function optionalReceipt(transport, uri) {
  try {
    const result = await transport.readBytes(uri, { prefixes: ['receipts'] })
    return { ...result, value: JSON.parse(result.bytes.toString('utf8')) }
  } catch (error) {
    if (error?.code === 'MISSING') return null
    throw error
  }
}

export async function executeRecoveryOperation({ profile, sourceRevision, archive, sourceProof, transport }) {
  if (!Buffer.isBuffer(archive) || archive.length === 0 ||
    sourceProof?.schemaVersion !== 'jenfu.dev012.official-merged-source.v1' ||
    sourceProof?.repository !== repository || sourceProof.branch !== 'main' ||
    sourceProof.sourceRevision !== sourceRevision || sourceProof.branchProtected !== true ||
    !/^[a-f0-9]{40}$/u.test(sourceProof.sourceTree ?? '') ||
    sourceProof.reviewMode !== 'SOLO_MAINTAINER_NO_HUMAN_APPROVAL_REQUIRED' ||
    !Number.isInteger(sourceProof.pullRequestNumber) || sourceProof.pullRequestNumber < 1 ||
    !['DEV-012 Isolated PostgreSQL Cutover', 'Production Slice QC'].every((name) =>
      sourceProof.requiredChecks?.includes(name)) ||
    sourceProof.rulesetId !== 24077878 ||
    sourceProof.status !== 'OFFICIAL_MERGED_PR_VERIFIED') {
    throw new Error('DEV121_RECOVERY_OPERATOR_SOURCE_INVALID')
  }
  const receiptUri = `gs://${bucket}/receipts/releases/DEV121-PRINCIPAL-ONLY-RECOVERY/${sourceRevision}.json`
  const existing = await optionalReceipt(transport, receiptUri)
  if (existing) {
    const proof = existing.value
    const service = await transport.getService(profile)
    const revision = await transport.getRevision(profile, proof.recoveryRevision)
    assertRecoveryProofReadback({ sourceRevision, oldRevision: proof.oldRevision,
      binding: { revision: proof.recoveryRevision,
        imageDigest: proof.imageDigest, serviceUid: proof.serviceUid,
        receiptRef: existing.ref },
      profile, proof, service, revision })
    return { status: 'REUSED_PASS', ref: existing.ref,
      generation: String(existing.metadata.generation) }
  }
  const before = await transport.getService(profile)
  const oldRevision = transport.effectiveRevision(before)
  assertRecoveryBaseline({ profile, service: before, oldRevision, sourceRevision })
  const plannedRevision = `ai-pdm-prod-recovery-${sourceRevision.slice(0, 12)}`
  if ([plannedRevision, `${before.name}/revisions/${plannedRevision}`].includes(before.latestCreatedRevision)) {
    throw new Error('DEV121_RECOVERY_PARTIAL_REVISION_REQUIRES_READBACK')
  }
  const sourceUri = `gs://${bucket}/source/releases/DEV121-RECOVERY/${sourceRevision}/source.tar.gz`
  const sourceObject = await transport.putBytes(sourceUri, gzipSync(archive, { level: 9 }),
    { bucket, prefix: 'source', contentType: 'application/gzip' })
  const buildRequest = recoveryBuildRequest({ profile, sourceRevision, sourceObject })
  const deadlineAt = new Date(Date.now() + 40 * 60_000).toISOString()
  const operation = await transport.request('https://cloudbuild.googleapis.com/v1/projects/jenfu-platform-prod/locations/asia-east1/builds',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildRequest) })
  const build = await transport.waitBuild(operation, deadlineAt, 'jenfu-platform-prod', 'asia-east1')
  const imageDigest = assertRecoveryBuildReadback({ request: buildRequest, build, sourceRevision })
  await artifactImageReadback(transport, imageDigest)
  await transport.waitArtifactEvidence({ profile, artifactDigest: imageDigest, deadlineAt })
  const settled = await transport.getService(profile)
  if (settled.uid !== before.uid || transport.effectiveRevision(settled) !== oldRevision ||
    settled.generation !== before.generation) throw new Error('DEV121_RECOVERY_SERVICE_DRIFT')
  const revisionRequest = recoveryRevisionRequest({ profile, service: settled,
    oldRevision, sourceRevision, imageDigest })
  await transport.patchService(profile, revisionRequest, 'template', deadlineAt)
  const after = await transport.getService(profile)
  const revision = await transport.getRevision(profile, revisionRequest.template.revision)
  const recoveryRevision = assertRecoveryRevisionReadback({ before: settled,
    after, revision, request: revisionRequest, imageDigest, oldRevision })
  const proof = recoveryProof({ sourceRevision, serviceUid: after.uid, oldRevision,
    recoveryRevision, imageDigest })
  const receipt = await transport.putJson(receiptUri, proof, { bucket, prefix: 'receipts' })
  assertRecoveryProofReadback({ sourceRevision, oldRevision,
    binding: { revision: recoveryRevision, imageDigest, serviceUid: after.uid,
      receiptRef: receipt.ref },
    profile, proof, service: after, revision })
  return { status: 'PASS', ref: receipt.ref,
    generation: String(receipt.metadata.generation), recoveryRevision,
    imageDigest, sourceRevision }
}

async function main(environment = process.env) {
  if (process.argv.length !== 2 ||
    !environment.GOOGLE_OAUTH_ACCESS_TOKEN || !environment.GITHUB_TOKEN) {
    throw new Error('DEV121_RECOVERY_OPERATOR_INPUT_INVALID')
  }
  const profile = JSON.parse(await fs.readFile(path.join(root,
    'config/release/dev117-ai-pdm-independent-production-v3.json'), 'utf8'))
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
  const sourceRevision = git(['rev-parse', 'HEAD'])
  const sourceTree = git(['rev-parse', 'HEAD^{tree}'])
  const archive = createGitArchive(root, sourceRevision)
  const sourceProof = await verifyOfficialMergedSource({ repository, branch: 'main',
    revision: sourceRevision, sourceTree, token: environment.GITHUB_TOKEN, rulesetId: 24077878 })
  const transport = createOwnerTransport({ token: environment.GOOGLE_OAUTH_ACCESS_TOKEN })
  const result = await executeRecoveryOperation({ profile, sourceRevision,
    archive, sourceProof, transport })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 })
}
