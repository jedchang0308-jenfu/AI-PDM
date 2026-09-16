#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { assertDev117V3Profile } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { canonicalize, createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import {
  assertAuthorityRecoveryCapsule,
  assertAuthorityRecoveryGitHubContext,
  assertAuthorityRecoveryRevision,
  assertRecoveryReceipt,
  assertWorkbenchRecoveryPayload,
  authorityRecoveryCandidateOrigin,
  buildAuthorityRecoveryCandidateTemplate,
  buildRecoveryReceipt,
  receiptRef,
  recoveryPaths,
  sha256,
} from './lib/dev117-ai-pdm-authority-recovery.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stages = new Set(['candidate', 'verify', 'activate', 'canonical', 'finalize', 'rollback'])

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

function parseArgs(argv) {
  const value = {}
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const argument = argv[index + 1]
    if (!['--stage', '--capsule-ref', '--capsule-sha256'].includes(name) || !argument) fail('AUTHORITY_RECOVERY_ARGUMENTS_INVALID')
    value[name.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = argument
  }
  if (Object.keys(value).length !== 3 || !stages.has(value.stage)
    || !/^gs:\/\/jenfu-platform-prod-aipdm-release\/receipts\/[A-Za-z0-9._/-]+\.json$/u.test(value.capsuleRef ?? '')
    || !/^[a-f0-9]{64}$/u.test(value.capsuleSha256 ?? '')) fail('AUTHORITY_RECOVERY_ARGUMENTS_INVALID')
  return value
}

async function loadProfile() {
  const names = [
    'config/release/dev117-ai-pdm-independent-production-v3.json',
    'config/release/dev117-ai-pdm-independent-production.json',
    'config/platform/dev-010-n1c-ai-pdm.json',
  ]
  const [profile, v1, n1c] = await Promise.all(names.map((name) => fs.readFile(path.join(root, name), 'utf8').then(JSON.parse)))
  assertDev117V3Profile(profile, v1, n1c)
  return profile
}

async function optionalReceipt(transport, uri, stage, context) {
  try {
    const result = await transport.readBytes(uri, { prefixes: ['receipts'] })
    let value
    try { value = JSON.parse(result.bytes.toString('utf8')) } catch { fail('AUTHORITY_RECOVERY_RECEIPT_JSON_INVALID') }
    assertRecoveryReceipt(value, { stage, ...context })
    return { ...result, value, ref: receiptRef(uri, result.bytes) }
  } catch (error) {
    if (error?.code === 'MISSING') return null
    throw error
  }
}

async function requiredReceipt(transport, uri, stage, context) {
  const value = await optionalReceipt(transport, uri, stage, context)
  if (!value) fail('AUTHORITY_RECOVERY_REQUIRED_RECEIPT_MISSING', stage)
  return value
}

async function writeReceipt(transport, uri, value, profile) {
  const existing = await optionalReceipt(transport, uri, value.stage, { capsule: value.__capsule, capsuleSha256: value.capsuleSha256 })
  if (existing) return existing
  const { __capsule: _capsule, ...receipt } = value
  const result = await transport.putJson(uri, receipt, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
  return { ...result, value: receipt }
}

function applicationContainer(profile, value) {
  const container = value?.containers?.find((row) => row.name === profile.runtime.containerName)
  if (!container) fail('AUTHORITY_RECOVERY_APP_CONTAINER_MISSING')
  return container
}

function trafficSnapshot(service) {
  return (service?.traffic ?? []).map((row) => ({
    type: row.type ?? null,
    revision: row.revision ?? null,
    percent: Number(row.percent ?? 0),
    tag: row.tag ?? null,
  }))
}

function assertInactiveCandidate(transport, service, candidateFacts, capsule) {
  transport.assertServiceSettled(service, 'AUTHORITY_RECOVERY_SERVICE_UNSETTLED')
  if (transport.effectiveRevision(service) !== capsule.baseline.previousRevision) fail('AUTHORITY_RECOVERY_TRAFFIC_CHANGED')
  const configured = (service.traffic ?? []).filter((row) => row.tag === candidateFacts.candidateTag)
  const observed = (service.trafficStatuses ?? []).filter((row) => row.tag === candidateFacts.candidateTag)
  const matches = (row) => row.revision === candidateFacts.candidateRevision && Number(row.percent ?? 0) === 0
  if (configured.length !== 1 || observed.length !== 1 || !configured.every(matches) || !observed.every(matches)
    || observed[0].uri !== candidateFacts.candidateOrigin) fail('AUTHORITY_RECOVERY_CANDIDATE_NOT_INACTIVE')
  return true
}

function assertCandidateFacts(value, capsule, paths) {
  const facts = value?.facts
  if (value?.previousReceiptRef !== null
    || !facts || facts.candidateRevision !== paths.candidateRevision || facts.candidateTag !== paths.candidateTag
    || facts.artifactDigest !== capsule.baseline.artifactDigest
    || facts.runtimeCommit !== capsule.baseline.runtimeCommit
    || facts.previousRevision !== capsule.baseline.previousRevision
    || facts.candidateOrigin !== `https://${paths.candidateTag}---${new URL(capsule.target.providerOrigin).hostname}`
    || facts.candidatePercent !== 0 || facts.generalTrafficChanged !== false || facts.databaseMutationPerformed !== false) fail('AUTHORITY_RECOVERY_CANDIDATE_RECEIPT_INVALID')
  return facts
}

function assertPreviousReceipt(value, expected, code = 'AUTHORITY_RECOVERY_RECEIPT_CHAIN_INVALID') {
  if (!value?.previousReceiptRef || value.previousReceiptRef.uri !== expected?.uri || value.previousReceiptRef.sha256 !== expected?.sha256) fail(code)
  return true
}

async function assertEvidence(transport, capsule, profile) {
  const [cutover, terminal] = await Promise.all([
    transport.readJson(capsule.evidence.cutoverImportRef, profile.artifact.releaseBucket, ['receipts']),
    transport.readJson(capsule.evidence.releaseTerminalRef, profile.artifact.releaseBucket, ['receipts']),
  ])
  const tables = new Map((cutover.value?.tableReceipts ?? []).map((row) => [row.name, Number(row.rowCount)]))
  if (cutover.value?.schemaVersion !== 'jenfu.dev012.ai-pdm-data-import-receipt.v1'
    || cutover.value.status !== 'PASS' || cutover.value.releaseId !== 'DEV012-REL-20260915-R78'
    || cutover.value.sourceRevision !== capsule.baseline.runtimeCommit
    || Number(cutover.value.tableCount) !== 151 || Number(cutover.value.expectedRowCount) !== 3569
    || tables.get('drawing_numbers') !== capsule.authority.drawingRows
    || tables.get('part_numbers') !== capsule.authority.partRows
    || tables.get('canonical_workbench_states') !== capsule.authority.aggregateRows
    || tables.get('pdm_workbench_aggregates') !== capsule.authority.aggregateRows
    || tables.get('pdm_workbench_state_authority_control') !== 1) fail('AUTHORITY_RECOVERY_CUTOVER_EVIDENCE_INVALID')
  if (terminal.value?.schemaVersion !== 'jenfu.dev012.stage-receipt.v1'
    || terminal.value.status !== 'PASS' || terminal.value.stage !== 'terminal'
    || terminal.value.releaseId !== 'DEV012-REL-20260915-R78'
    || terminal.value.sourceRevision !== capsule.baseline.runtimeCommit
    || terminal.value.facts?.result !== 'RELEASED'
    || terminal.value.facts?.candidateRevision !== capsule.baseline.previousRevision
    || terminal.value.facts?.artifactDigest !== capsule.baseline.artifactDigest
    || Number(terminal.value.facts?.remainingHumanAction) !== 0) fail('AUTHORITY_RECOVERY_RELEASE_EVIDENCE_INVALID')
  return { tableCount: 151, rowCount: 3569, drawingRows: tables.get('drawing_numbers'), partRows: tables.get('part_numbers'), aggregateRows: tables.get('canonical_workbench_states') }
}

async function requestJson(url, options, code) {
  let response
  try { response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), ...options }) } catch (error) { fail(code, error?.name ?? 'network') }
  if (response.headers.get('location')) fail(code, 'redirect')
  let body = null
  if ((response.headers.get('content-type') ?? '').includes('application/json')) {
    try { body = await response.json() } catch { fail(code, 'json') }
  }
  return { response, body }
}

async function runRecoverySmoke({ origin, capsule, environment }) {
  const apiKey = environment.DEV012_AIPDM_FIREBASE_API_KEY
  const refreshToken = environment.DEV012_AIPDM_FIREBASE_REFRESH_TOKEN
  if (typeof apiKey !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/u.test(apiKey)
    || typeof refreshToken !== 'string' || refreshToken.length < 20 || refreshToken.length > 4096) fail('AUTHORITY_RECOVERY_SMOKE_CREDENTIAL_MISSING')
  const base = new URL(origin)
  if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash) fail('AUTHORITY_RECOVERY_SMOKE_ORIGIN_INVALID')
  const tokenResult = await requestJson(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
  }, 'AUTHORITY_RECOVERY_TOKEN_REFRESH_FAILED')
  const idToken = tokenResult.body?.id_token
  if (tokenResult.response.status !== 200 || typeof idToken !== 'string' || idToken.length < 100) fail('AUTHORITY_RECOVERY_TOKEN_REFRESH_FAILED', String(tokenResult.response.status))
  const call = (pathname, options = {}) => requestJson(new URL(pathname, base).href, options, `AUTHORITY_RECOVERY_SMOKE_FAILED:${pathname}`)
  const authMode = await call('/api/auth/mode')
  if (authMode.response.status !== 200) fail('AUTHORITY_RECOVERY_AUTH_MODE_FAILED')
  const session = await call('/api/auth/firebase/session', {
    method: 'POST', headers: { origin: capsule.target.canonicalOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ idToken }),
  })
  const setCookie = session.response.headers.get('set-cookie')
  if (session.response.status !== 200 || !setCookie) fail('AUTHORITY_RECOVERY_SESSION_FAILED')
  const cookie = setCookie.split(';', 1)[0]
  const me = await call('/api/auth/me', { headers: { cookie } })
  if (me.response.status !== 200) fail('AUTHORITY_RECOVERY_SESSION_RELOAD_FAILED')
  const health = await call('/api/health/ready', { headers: { cookie } })
  if (health.response.status !== 200) fail('AUTHORITY_RECOVERY_HEALTH_FAILED')
  const drawing = await call('/api/numbering/drawings/workbench', { headers: { cookie } })
  const part = await call('/api/parts/workbench', { headers: { cookie } })
  if (drawing.response.status !== 200 || part.response.status !== 200) fail('AUTHORITY_RECOVERY_WORKBENCH_FAILED', `${drawing.response.status}/${part.response.status}`)
  const drawingObservation = assertWorkbenchRecoveryPayload(drawing.body, { id: 'drawing-workbench', rows: capsule.authority.drawingRows, ...capsule.authority })
  const partObservation = assertWorkbenchRecoveryPayload(part.body, { id: 'part-workbench', rows: capsule.authority.partRows, ...capsule.authority })
  if (drawingObservation.companyId !== partObservation.companyId || drawingObservation.actorId !== partObservation.actorId) fail('AUTHORITY_RECOVERY_WORKBENCH_ACTOR_MISMATCH')
  const permissions = await call('/api/numbering/permissions')
  if (permissions.response.status !== 401) fail('AUTHORITY_RECOVERY_UNAUTHENTICATED_FAILED')
  const logout = await call('/api/auth/logout', { method: 'POST', headers: { origin: capsule.target.canonicalOrigin, cookie, 'content-type': 'application/json' }, body: '{}' })
  if (logout.response.status !== 200) fail('AUTHORITY_RECOVERY_LOGOUT_FAILED')
  const revoked = await call('/api/auth/me', { headers: { cookie } })
  if (revoked.response.status !== 401) fail('AUTHORITY_RECOVERY_REVOCATION_FAILED')
  return {
    origin: base.origin,
    observations: [
      { id: 'auth-mode', status: 200 }, { id: 'session-create', status: 200 }, { id: 'session-reload', status: 200 },
      { id: 'database-readiness', status: 200 }, drawingObservation, partObservation,
      { id: 'permissions-unauthenticated', status: 401 }, { id: 'session-revoked', status: 401 },
    ],
    authorityReadMode: 'SIGNED_WORKBENCH_CONTRACT_PAYLOAD',
    databaseMutationPerformed: false,
    status: 'PASS',
  }
}

async function executeStage({ stage, capsuleRef, capsuleSha256, profile, transport, environment }) {
  const capsuleRead = await transport.readJson({ uri: capsuleRef, sha256: capsuleSha256 }, profile.artifact.releaseBucket, ['receipts'])
  const capsule = assertAuthorityRecoveryCapsule(capsuleRead.value, profile)
  assertAuthorityRecoveryGitHubContext(capsule, environment)
  const paths = recoveryPaths(profile, capsuleSha256)
  const context = { capsule, capsuleSha256 }

  if (stage === 'candidate') {
    const existing = await optionalReceipt(transport, paths.candidate, 'candidate', context)
    if (existing) {
      const facts = assertCandidateFacts(existing.value, capsule, paths)
      const service = await transport.getService(profile)
      assertInactiveCandidate(transport, service, facts, capsule)
      const revision = await transport.getRevision(profile, facts.candidateRevision)
      transport.assertRevisionReady(profile, revision, capsule.baseline.artifactDigest)
      assertAuthorityRecoveryRevision({ revision, profile, capsule, candidateRevision: facts.candidateRevision, candidateOrigin: facts.candidateOrigin })
      return existing
    }
    const evidence = await assertEvidence(transport, capsule, profile)
    const before = await transport.getService(profile)
    transport.assertServiceSettled(before, 'AUTHORITY_RECOVERY_BASELINE_UNSETTLED')
    if (transport.effectiveRevision(before) !== capsule.baseline.previousRevision
      || (before.traffic ?? []).some((row) => row.tag || row.latestRevision === true)) fail('AUTHORITY_RECOVERY_BASELINE_MISMATCH')
    const previousRevision = await transport.getRevision(profile, capsule.baseline.previousRevision)
    transport.assertRevisionReady(profile, previousRevision, capsule.baseline.artifactDigest)
    const beforeApp = applicationContainer(profile, before.template)
    if (beforeApp.image !== capsule.baseline.artifactDigest) fail('AUTHORITY_RECOVERY_ARTIFACT_MISMATCH')
    const candidateOrigin = authorityRecoveryCandidateOrigin(before, capsule, paths.candidateTag)
    const template = buildAuthorityRecoveryCandidateTemplate({ beforeTemplate: before.template, profile, capsule, candidateRevision: paths.candidateRevision, candidateOrigin })
    let tagged
    try {
      await transport.patchService(profile, { name: before.name, etag: before.etag, template }, 'template', capsule.deadlineAt)
      const created = await transport.getService(profile)
      transport.assertServiceSettled(created, 'AUTHORITY_RECOVERY_CANDIDATE_CREATE_FAILED')
      const traffic = [...before.traffic, { type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: paths.candidateRevision, percent: 0, tag: paths.candidateTag }]
      await transport.patchService(profile, { name: created.name, etag: created.etag, traffic }, 'traffic', capsule.deadlineAt)
      tagged = await transport.getService(profile)
      assertInactiveCandidate(transport, tagged, { candidateRevision: paths.candidateRevision, candidateTag: paths.candidateTag, candidateOrigin }, capsule)
      const revision = await transport.getRevision(profile, paths.candidateRevision)
      transport.assertRevisionReady(profile, revision, capsule.baseline.artifactDigest)
      assertAuthorityRecoveryRevision({ revision, profile, capsule, candidateRevision: paths.candidateRevision, candidateOrigin })
      const facts = {
        candidateRevision: paths.candidateRevision, candidateTag: paths.candidateTag, candidateOrigin,
        previousRevision: capsule.baseline.previousRevision, artifactDigest: capsule.baseline.artifactDigest,
        runtimeCommit: capsule.baseline.runtimeCommit, candidatePercent: 0, generalTrafficChanged: canonicalize(trafficSnapshot(before)) !== canonicalize(trafficSnapshot(tagged).filter((row) => !row.tag)),
        databaseMutationPerformed: false, backupId: capsule.backup.backupId, evidence,
        beforeTemplateSha256: sha256(canonicalize(before.template)), candidateTemplateSha256: sha256(canonicalize(tagged.template)),
      }
      if (facts.generalTrafficChanged) fail('AUTHORITY_RECOVERY_TRAFFIC_CHANGED')
      const receipt = buildRecoveryReceipt({ stage: 'candidate', capsule, capsuleSha256, facts, observedAt: transport.now() })
      return await writeReceipt(transport, paths.candidate, { ...receipt, __capsule: capsule }, profile)
    } catch (error) {
      try {
        const recovered = await optionalReceipt(transport, paths.candidate, 'candidate', context)
        if (recovered) {
          const facts = assertCandidateFacts(recovered.value, capsule, paths)
          const current = await transport.getService(profile)
          assertInactiveCandidate(transport, current, facts, capsule)
          return recovered
        }
      } catch {}
      let cleanupConfirmed = false
      try {
        const current = await transport.getService(profile)
        if (transport.effectiveRevision(current) === capsule.baseline.previousRevision) {
          try {
            await transport.removeCandidateTag({ profile, tag: paths.candidateTag, candidateRevision: paths.candidateRevision, expectedActiveRevision: capsule.baseline.previousRevision, deadlineAt: capsule.deadlineAt })
          } catch {}
          const cleaned = await transport.getService(profile)
          cleanupConfirmed = transport.effectiveRevision(cleaned) === capsule.baseline.previousRevision
            && !(cleaned.traffic ?? []).some((row) => row.tag === paths.candidateTag)
        }
      } catch {}
      if (cleanupConfirmed) throw error
      fail('AUTHORITY_RECOVERY_CANDIDATE_CLEANUP_UNCONFIRMED', error?.code ?? error?.message ?? 'failed')
    }
  }

  const candidate = await requiredReceipt(transport, paths.candidate, 'candidate', context)
  const candidateFacts = assertCandidateFacts(candidate.value, capsule, paths)

  if (stage === 'verify') {
    const existing = await optionalReceipt(transport, paths.verify, 'verify', context)
    if (existing) {
      assertPreviousReceipt(existing.value, candidate.ref)
      return existing
    }
    const service = await transport.getService(profile)
    assertInactiveCandidate(transport, service, candidateFacts, capsule)
    const revision = await transport.getRevision(profile, candidateFacts.candidateRevision)
    transport.assertRevisionReady(profile, revision, candidateFacts.artifactDigest)
    assertAuthorityRecoveryRevision({ revision, profile, capsule, candidateRevision: candidateFacts.candidateRevision, candidateOrigin: candidateFacts.candidateOrigin })
    const smoke = await runRecoverySmoke({ origin: candidateFacts.candidateOrigin, capsule, environment })
    const receipt = buildRecoveryReceipt({ stage: 'verify', capsule, capsuleSha256, previousReceiptRef: candidate.ref, facts: { ...candidateFacts, smoke, activeRevision: capsule.baseline.previousRevision, activationState: 'PROMOTION_PENDING', databaseMutationPerformed: false }, observedAt: transport.now() })
    return writeReceipt(transport, paths.verify, { ...receipt, __capsule: capsule }, profile)
  }

  if (stage === 'activate') {
    const existing = await optionalReceipt(transport, paths.activate, 'activate', context)
    if (existing) {
      const verify = await requiredReceipt(transport, paths.verify, 'verify', context)
      assertPreviousReceipt(existing.value, verify.ref)
      const service = await transport.getService(profile)
      if (transport.effectiveRevision(service) !== candidateFacts.candidateRevision) fail('AUTHORITY_RECOVERY_ACTIVATION_READBACK_MISMATCH')
      return existing
    }
    const verify = await requiredReceipt(transport, paths.verify, 'verify', context)
    assertPreviousReceipt(verify.value, candidate.ref)
    if (verify.value.facts?.activationState !== 'PROMOTION_PENDING' || verify.value.facts?.smoke?.status !== 'PASS') fail('AUTHORITY_RECOVERY_VERIFY_RECEIPT_INVALID')
    const before = await transport.getService(profile)
    assertInactiveCandidate(transport, before, candidateFacts, capsule)
    const after = await transport.setTraffic({ profile, revision: candidateFacts.candidateRevision, candidateTag: candidateFacts.candidateTag, deadlineAt: capsule.deadlineAt })
    const receipt = buildRecoveryReceipt({ stage: 'activate', capsule, capsuleSha256, previousReceiptRef: verify.ref, facts: { candidateRevision: candidateFacts.candidateRevision, previousRevision: candidateFacts.previousRevision, artifactDigest: candidateFacts.artifactDigest, beforeTraffic: trafficSnapshot(before), afterTraffic: trafficSnapshot(after), updateMask: 'traffic', activeRevision: transport.effectiveRevision(after) }, observedAt: transport.now() })
    return writeReceipt(transport, paths.activate, { ...receipt, __capsule: capsule }, profile)
  }

  if (stage === 'canonical') {
    const existing = await optionalReceipt(transport, paths.canonical, 'canonical', context)
    if (existing) {
      const activate = await requiredReceipt(transport, paths.activate, 'activate', context)
      assertPreviousReceipt(existing.value, activate.ref)
      const service = await transport.getService(profile)
      if (transport.effectiveRevision(service) !== candidateFacts.candidateRevision) fail('AUTHORITY_RECOVERY_CANONICAL_REVISION_MISMATCH')
      return existing
    }
    const activate = await requiredReceipt(transport, paths.activate, 'activate', context)
    const verify = await requiredReceipt(transport, paths.verify, 'verify', context)
    assertPreviousReceipt(activate.value, verify.ref)
    const service = await transport.getService(profile)
    transport.assertServiceSettled(service, 'AUTHORITY_RECOVERY_CANONICAL_SERVICE_UNSETTLED')
    if (transport.effectiveRevision(service) !== candidateFacts.candidateRevision) fail('AUTHORITY_RECOVERY_CANONICAL_REVISION_MISMATCH')
    const smoke = await runRecoverySmoke({ origin: capsule.target.canonicalOrigin, capsule, environment })
    const receipt = buildRecoveryReceipt({ stage: 'canonical', capsule, capsuleSha256, previousReceiptRef: activate.ref, facts: { candidateRevision: candidateFacts.candidateRevision, artifactDigest: candidateFacts.artifactDigest, origin: capsule.target.canonicalOrigin, smoke }, observedAt: transport.now() })
    return writeReceipt(transport, paths.canonical, { ...receipt, __capsule: capsule }, profile)
  }

  if (stage === 'finalize') {
    const existing = await optionalReceipt(transport, paths.finalize, 'finalize', context)
    if (existing) {
      const canonical = await requiredReceipt(transport, paths.canonical, 'canonical', context)
      assertPreviousReceipt(existing.value, canonical.ref)
      const service = await transport.getService(profile)
      if (transport.effectiveRevision(service) !== candidateFacts.candidateRevision
        || (service.traffic ?? []).some((row) => row.tag === candidateFacts.candidateTag)) fail('AUTHORITY_RECOVERY_FINALIZE_READBACK_MISMATCH')
      return existing
    }
    const canonical = await requiredReceipt(transport, paths.canonical, 'canonical', context)
    const activate = await requiredReceipt(transport, paths.activate, 'activate', context)
    assertPreviousReceipt(canonical.value, activate.ref)
    await transport.removeCandidateTag({ profile, tag: candidateFacts.candidateTag, candidateRevision: candidateFacts.candidateRevision, expectedActiveRevision: candidateFacts.candidateRevision, deadlineAt: capsule.deadlineAt })
    const receipt = buildRecoveryReceipt({ stage: 'finalize', capsule, capsuleSha256, previousReceiptRef: canonical.ref, facts: { result: 'RECOVERED', activeRevision: candidateFacts.candidateRevision, artifactDigest: candidateFacts.artifactDigest, runtimeCommit: candidateFacts.runtimeCommit, databaseMutationPerformed: false, temporaryCandidateTags: 0 }, observedAt: transport.now() })
    const result = await writeReceipt(transport, paths.finalize, { ...receipt, __capsule: capsule }, profile)
    const terminal = buildRecoveryReceipt({ stage: 'terminal', capsule, capsuleSha256, previousReceiptRef: result.ref, facts: { result: 'RECOVERED', activeRevision: candidateFacts.candidateRevision, artifactDigest: candidateFacts.artifactDigest, runtimeCommit: candidateFacts.runtimeCommit, databaseDisposition: 'VERIFIED_UNCHANGED', remainingHumanAction: 0 }, observedAt: transport.now() })
    await writeReceipt(transport, paths.terminal, { ...terminal, __capsule: capsule }, profile)
    return result
  }

  const existing = await optionalReceipt(transport, paths.rollback, 'rollback', context)
  if (existing) {
    assertPreviousReceipt(existing.value, candidate.ref)
    const service = await transport.getService(profile)
    if (transport.effectiveRevision(service) !== candidateFacts.previousRevision
      || (service.traffic ?? []).some((row) => row.tag === candidateFacts.candidateTag)) fail('AUTHORITY_RECOVERY_ROLLBACK_FAILED')
    return existing
  }
  const before = await transport.getService(profile)
  transport.assertServiceSettled(before, 'AUTHORITY_RECOVERY_ROLLBACK_SERVICE_UNSETTLED')
  const active = transport.effectiveRevision(before)
  if (![candidateFacts.candidateRevision, candidateFacts.previousRevision].includes(active)) fail('AUTHORITY_RECOVERY_ROLLBACK_OWNER_MISMATCH')
  if (active === candidateFacts.candidateRevision) await transport.setTraffic({ profile, revision: candidateFacts.previousRevision, deadlineAt: capsule.deadlineAt })
  await transport.removeCandidateTag({ profile, tag: candidateFacts.candidateTag, candidateRevision: candidateFacts.candidateRevision, expectedActiveRevision: candidateFacts.previousRevision, deadlineAt: capsule.deadlineAt })
  const after = await transport.getService(profile)
  if (transport.effectiveRevision(after) !== candidateFacts.previousRevision) fail('AUTHORITY_RECOVERY_ROLLBACK_FAILED')
  const receipt = buildRecoveryReceipt({ stage: 'rollback', capsule, capsuleSha256, previousReceiptRef: candidate.ref, facts: { result: 'ROLLED_BACK', candidateRevision: candidateFacts.candidateRevision, restoredRevision: candidateFacts.previousRevision, beforeTraffic: trafficSnapshot(before), afterTraffic: trafficSnapshot(after), databaseDisposition: 'VERIFIED_UNCHANGED' }, observedAt: transport.now() })
  const result = await writeReceipt(transport, paths.rollback, { ...receipt, __capsule: capsule }, profile)
  const terminal = buildRecoveryReceipt({ stage: 'terminal', capsule, capsuleSha256, previousReceiptRef: result.ref, facts: { result: 'ROLLED_BACK', activeRevision: candidateFacts.previousRevision, failedCandidateRevision: candidateFacts.candidateRevision, databaseDisposition: 'VERIFIED_UNCHANGED', remainingHumanAction: 1 }, observedAt: transport.now() })
  await writeReceipt(transport, paths.terminal, { ...terminal, __capsule: capsule }, profile)
  return result
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const profile = await loadProfile()
  const transport = createOwnerTransport({ token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN ?? '' })
  const result = await executeStage({ ...args, profile, transport, environment: process.env })
  process.stdout.write(`${JSON.stringify({ stage: args.stage, ref: result.ref, generation: String(result.metadata?.generation ?? ''), status: 'PASS' })}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error?.code ?? error?.message ?? String(error)}\n`)
  process.exitCode = 1
})
