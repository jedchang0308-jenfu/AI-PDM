import { buildInfraReuseReceipt } from './dev012-owner-prerequisite-producer.mjs'
import { assertPreparePrerequisites } from './dev012-owner-stage-executor.mjs'
import { canonicalize, sha256 } from './dev012-owner-release-runtime.mjs'
import { assertAppliedMigrationContinuation } from './dev122-applied-migration-continuation.mjs'
import { normalizeReleaseEvidence } from './dev117-release-control-policy.mjs'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const RELEASE_ID = /^[A-Z0-9][A-Z0-9-]{5,63}$/u
const INFRA_SCHEMAS = new Set(['jenfu.dev012.app-infra-receipt.v1', 'jenfu.dev012.app-infra-reuse-receipt.v2'])
const EVIDENCE_SCOPES = new Set(['PRODUCTION_BOUND', 'PRODUCTION_PROVIDER', 'PRODUCTION_PROVIDER_REUSE'])

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

function date(value, code) {
  const parsed = Date.parse(value ?? '')
  if (!Number.isFinite(parsed)) fail(code)
  return parsed
}

function assertReceiptScope(value, name, { statuses = [] } = {}) {
  if (!value || typeof value !== 'object' || !EVIDENCE_SCOPES.has(value.evidenceScope)
    || value.releaseAuthority !== true || (statuses.length > 0 && !statuses.includes(value.status))) {
    fail('CHAIN_RECEIPT_INVALID', name)
  }
  return value
}

function assertRef(value, profile, name) {
  if (!value || Object.keys(value).sort().join(',') !== 'sha256,uri' || !H64.test(value.sha256 ?? '')
    || !value.uri?.startsWith(`gs://${profile.artifact.releaseBucket}/receipts/`) || value.uri.includes('..')) {
    fail('CHAIN_REF_INVALID', name)
  }
  return value
}

function normalizeWorker(worker, { sourceRevision, deadlineAt }) {
  if (!worker) return null
  const descriptorRevision = worker.descriptorRevision
  const readerRevision = worker.readerRevision
  const historical = descriptorRevision !== sourceRevision
  if (!H40.test(descriptorRevision ?? '') || !H40.test(readerRevision ?? '')
    || readerRevision !== descriptorRevision || worker.readerCanReadRevision !== descriptorRevision
    || !Number.isInteger(worker.descriptorDepth) || worker.descriptorDepth < 1
    || worker.readerMode !== (historical ? 'historical' : 'current')
    || worker.deadlineAt !== deadlineAt) fail('CHAIN_WORKER_SOURCE_JOIN_INVALID')
  // The reader capability, not a mutable isHistorical label, decides the
  // validation mode.  A reader may read an admitted historical revision while
  // retaining current-reader metadata; silently falling back is forbidden.
  const iam = worker.secretVersionIamContinuation
  if (!iam || iam.sourceRevision !== descriptorRevision || iam.status !== 'APPLIED'
    || iam.evidenceScope !== 'PRODUCTION_PROVIDER' || iam.payloadAccess !== 'NOT_GRANTED'
    || canonicalize(iam.permissions ?? []) !== canonicalize(['secretmanager.versions.get'])
    || !Array.isArray(iam.resources) || iam.resources.length === 0
    || new Set(iam.resources).size !== iam.resources.length || iam.resourceScope !== 'EXACT_SECRET_VERSION'
    || !iam.ref || !H64.test(iam.ref.sha256 ?? '') || typeof iam.ref.uri !== 'string') {
    fail('CHAIN_IAM_CONTINUATION_INVALID')
  }
  return {
    descriptorRevision,
    readerRevision,
    validationMode: historical ? 'historical' : 'current',
    descriptorDepth: worker.descriptorDepth,
    secretVersionIamContinuationRef: iam.ref,
    secretVersionIamSourceRevision: iam.sourceRevision,
  }
}

function normalizeMigration({ profile, intent, migration, continuation }) {
  if (!migration || migration.schemaVersion !== 'jenfu.dev012.migration-receipt.v1'
    || migration.ownerApplicationId !== profile.application.id || migration.sourceRevision !== intent.sourceRevision
    || migration.manifestSha256 !== intent.migrationManifestSha256 || migration.status !== 'PASS'
    || migration.boundaryStatus !== 'PASS' || !migration.ledgerReadback
    || migration.ledgerReadback.ledger !== profile.migrations.ledger
    || migration.ledgerReadback.ledgerCount !== profile.migrations.entries.length
    || migration.ledgerReadback.migration085 !== 'APPLIED'
    || migration.ledgerReadback.readbackSha256 !== sha256(canonicalize({
      ledger: migration.ledgerReadback.ledger,
      ledgerCount: migration.ledgerReadback.ledgerCount,
      migration085: migration.ledgerReadback.migration085,
      sourceRevision: migration.ledgerReadback.sourceRevision,
    }))) fail('CHAIN_MIGRATION_READBACK_INVALID')
  if (continuation) {
    if (migration.ledgerReadback.sourceRevision !== continuation.sourceRevision) fail('CHAIN_MIGRATION_SOURCE_JOIN_INVALID')
  } else if (migration.ledgerReadback.sourceRevision !== intent.sourceRevision) fail('CHAIN_MIGRATION_SOURCE_JOIN_INVALID')
  return {
    schemaVersion: migration.schemaVersion,
    sourceRevision: migration.sourceRevision,
    manifestSha256: migration.manifestSha256,
    ledger: migration.ledgerReadback.ledger,
    ledgerCount: migration.ledgerReadback.ledgerCount,
    migration085: migration.ledgerReadback.migration085,
    disposition: continuation ? 'APPLIED_CONTINUATION_READBACK_ONLY' : 'FORWARD_MIGRATION_READBACK',
  }
}

function normalizeBuild({ profile, intent, build }) {
  if (!build || build.schemaVersion !== 'jenfu.dev012.build-provenance-receipt.v1'
    || build.ownerApplicationId !== profile.application.id || build.sourceRevision !== intent.sourceRevision
    || build.status !== 'PASS' || build.deadlineAt !== intent.deadlineAt
    || !build.artifactDigest?.startsWith(`${profile.artifact.uri}@sha256:`)
    || !H64.test(build.artifactDigest.split('@sha256:')[1] ?? '')
    || !build.sourceObject || !H64.test(build.sourceObject.sha256 ?? '')) fail('CHAIN_BUILD_INPUT_INVALID')
  return {
    sourceRevision: build.sourceRevision,
    artifactDigest: build.artifactDigest,
    sourceObject: { sha256: build.sourceObject.sha256 },
    deadlineAt: build.deadlineAt,
  }
}

function normalizeCandidate({ profile, intent, build, candidate }) {
  const host = new URL(profile.target.canonicalOrigin).host
  if (!candidate || candidate.schemaVersion !== 'jenfu.dev117.candidate-decision.v1'
    || candidate.status !== 'READY_FOR_CANDIDATE' || candidate.sourceRevision !== intent.sourceRevision
    || candidate.previousRevision !== intent.previousRevision || candidate.artifactDigest !== build.artifactDigest
    || candidate.deadlineAt !== intent.deadlineAt || candidate.trafficPercent !== 0
    || !/^candidate-[a-f0-9]{12,64}$/u.test(candidate.tag ?? '')
    || candidate.tagUri !== `https://${candidate.tag}---${host}` || candidate.tagUri.includes('*')
    || candidate.providerWriteCount !== 0) fail('CHAIN_CANDIDATE_DECISION_INVALID')
  return { candidateRevision: candidate.candidateRevision, tag: candidate.tag, tagUri: candidate.tagUri, artifactDigest: candidate.artifactDigest }
}

function normalizeActivation({ intent, candidate, activation }) {
  const rows = activation?.trafficPlan
  if (!activation || activation.schemaVersion !== 'jenfu.dev117.activation-decision.v1'
    || activation.status !== 'READY_FOR_ACTIVATE' || activation.sourceRevision !== intent.sourceRevision
    || activation.candidateRevision !== candidate.candidateRevision || activation.providerWriteCount !== 0
    || !Array.isArray(rows) || rows.length !== 2
    || rows.some(row => !row || !['revision', 'percent'].every(key => Object.hasOwn(row, key)))
    || rows.find(row => row.revision === candidate.candidateRevision)?.percent !== 100
    || rows.find(row => row.revision === intent.previousRevision)?.percent !== 0
    || rows.some(row => row.tag != null)) fail('CHAIN_ACTIVATION_DECISION_INVALID')
  return { candidateRevision: activation.candidateRevision, trafficPlan: structuredClone(rows) }
}

/**
 * Read-only owner-chain boundary. It consumes producer-shaped receipts once,
 * produces one normalized model, and never invokes a provider writer.
 */
export function normalizeOwnerChain({ profile, intent, values, infraInput = null, migration, build, candidate, activation, worker = null, appliedMigrationContinuation = null, isAncestor = null, now }) {
  if (!profile || !intent || !RELEASE_ID.test(intent.releaseId ?? '') || intent.ownerApplicationId !== profile.application.id
    || !H40.test(intent.sourceRevision ?? '') || !H64.test(intent.sourceSha256 ?? '')
    || !Number.isFinite(Date.parse(intent.deadlineAt))) fail('CHAIN_INPUT_INVALID')
  const observedAt = now ?? new Date().toISOString()
  const nowMs = date(observedAt, 'CHAIN_CLOCK_INVALID')
  const deadlineMs = date(intent.deadlineAt, 'CHAIN_DEADLINE_INVALID')
  if (deadlineMs <= nowMs) fail('CHAIN_DEADLINE_EXPIRED')
  let infra = values?.infra
  if (infraInput) {
    if (!INFRA_SCHEMAS.has(infraInput.existingInfra?.schemaVersion)) fail('CHAIN_INFRA_RECEIPT_SCHEMA_UNSUPPORTED')
    infra = buildInfraReuseReceipt({ profile, releaseId: intent.releaseId, sourceLock: values.sourceLock,
      foundation: values.foundation, existingInfra: infraInput.existingInfra, existingInfraRef: infraInput.existingInfraRef,
      providerJob: infraInput.providerJob, observedAt })
  }
  const normalizedValues = { ...values, infra }
  const source = normalizedValues.sourceLock
  if (source?.sourceRevision !== intent.sourceRevision || source.sourceSha256 !== intent.sourceSha256
    || !H64.test(source.sourceSha256 ?? '') || source.migrationManifestSha256 !== intent.migrationManifestSha256) fail('CHAIN_SOURCE_HASH_MISMATCH')
  assertReceiptScope(source, 'sourceLock', { statuses: ['SOURCE_FROZEN', 'PASS'] })
  for (const name of ['authorization', 'readiness']) {
    const value = normalizedValues[name]
    assertReceiptScope(value, name, { statuses: ['PASS', 'READY'] })
    if (value.environment !== 'production' || value.remainingHumanAction !== 0 || date(value.expiresAt, 'CHAIN_DEADLINE_INVALID') > deadlineMs
      || date(value.expiresAt, 'CHAIN_DEADLINE_INVALID') <= nowMs) fail('CHAIN_DEADLINE_INVALID', name)
  }
  for (const name of ['foundation', 'infra', 'runtimeConfig']) assertReceiptScope(normalizedValues[name], name, { statuses: ['PASS', 'APPLIED', 'VERIFIED'] })
  if (!infra || !INFRA_SCHEMAS.has(infra.schemaVersion)) fail('CHAIN_INFRA_RECEIPT_SCHEMA_UNSUPPORTED')
  const applied = appliedMigrationContinuation
    ? assertAppliedMigrationContinuation(appliedMigrationContinuation, profile.artifact.releaseBucket)
    : null
  if (applied && (!isAncestor || !isAncestor(applied.sourceRevision, intent.sourceRevision))) fail('CHAIN_MIGRATION_SOURCE_JOIN_INVALID')
  const prepared = assertPreparePrerequisites({ intent, profile, values: normalizedValues })
  const releaseEvidence = normalizeReleaseEvidence({
    intent,
    source: { ...source, migrationRunnerRevision: prepared.migrationRunnerSourceRevision },
    receipts: normalizedValues,
    migration,
    executionMode: 'full_release',
    now: observedAt,
  })
  const workerModel = normalizeWorker(worker, { sourceRevision: intent.sourceRevision, deadlineAt: intent.deadlineAt })
  const migrationModel = normalizeMigration({ profile, intent, migration, continuation: applied })
  const buildModel = normalizeBuild({ profile, intent, build })
  const candidateModel = normalizeCandidate({ profile, intent, build: buildModel, candidate })
  const activationModel = normalizeActivation({ intent, candidate: candidateModel, activation })
  return structuredClone({
    schemaVersion: 'jenfu.dev117.owner-chain-preflight.v1',
    status: 'READY_FOR_CANDIDATE',
    releaseEvidence,
    releaseId: intent.releaseId,
    source: {
      applicationRevision: intent.sourceRevision,
      sourceSha256: intent.sourceSha256,
      migrationManifestSha256: intent.migrationManifestSha256,
      migrationRunnerRevision: prepared.migrationRunnerSourceRevision,
    },
    deadlineAt: intent.deadlineAt,
    worker: workerModel,
    migration: migrationModel,
    build: buildModel,
    candidate: candidateModel,
    activation: activationModel,
    appliedMigrationContinuation: applied,
    decisions: { prepare: 'PASS', build: 'PASS', migrate: 'PASS', candidate: 'READY_FOR_CANDIDATE', activate: 'READY_FOR_ACTIVATE' },
    providerWrites: 0,
  })
}
