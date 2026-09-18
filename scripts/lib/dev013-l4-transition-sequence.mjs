import { createHash } from 'node:crypto'

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const APP_IDS = ['platform', 'orgmaster', 'ai-pdm']
const ROOT_BUCKET = 'jenfu-platform-prod-platform-release'
const AUTHORIZATION_ID = /^DEV013-L4-AUTH-[A-Z0-9-]{8,48}$/u
const ROOT_ACTIONS = ['owner-native release', 'Platform migration 005', 'runtime config', 'candidate', 'traffic', 'L4 browser', 'global logout', 'rollback', 'observation']
const OWNER_BUCKETS = {
  platform: ROOT_BUCKET,
  orgmaster: 'jenfu-platform-prod-orgmaster-release',
  'ai-pdm': 'jenfu-platform-prod-aipdm-release',
}

function fail(code) { throw Object.assign(new Error(code), { code }) }
function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
function sha256(value) { return createHash('sha256').update(Buffer.isBuffer(value) ? value : String(value)).digest('hex') }
function same(left, right) { return canonicalize(left) === canonicalize(right) }

const env = (aiPdm, orgmaster) => ({ PORTAL_SSO_AI_PDM_PHASE: aiPdm, PORTAL_SSO_ORGMASTER_PHASE: orgmaster })

const FORWARD_STEPS = [
  { stepId: 'G1_PLATFORM_GUARD', ownerApplicationId: 'platform', action: 'guard', changes: [
    { field: 'PORTAL_SSO_AI_PDM_PHASE', from: null, to: 'off' },
    { field: 'PORTAL_SSO_ORGMASTER_PHASE', from: null, to: 'off' },
  ], before: env(null, null), after: env('off', 'off') },
  { stepId: 'G2_ORGMASTER_GUARD', ownerApplicationId: 'orgmaster', action: 'guard', field: 'ORGMASTER_JENFU_SSO_HANDOFF_MODE', from: null, to: 'off', before: { ORGMASTER_JENFU_SSO_HANDOFF_MODE: null }, after: { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'off' } },
  { stepId: 'G3_AI_PDM_GUARD', ownerApplicationId: 'ai-pdm', action: 'guard', field: 'PDM_JENFU_SSO_HANDOFF_MODE', from: null, to: 'off', before: { PDM_JENFU_SSO_HANDOFF_MODE: null }, after: { PDM_JENFU_SSO_HANDOFF_MODE: 'off' } },
  { stepId: 'A1_ORGMASTER_SOURCE_ACCEPT', ownerApplicationId: 'platform', action: 'advance', field: 'PORTAL_SSO_ORGMASTER_PHASE', from: 'off', to: 'accept', before: env('off', 'off'), after: env('off', 'accept') },
  { stepId: 'A2_ORGMASTER_TARGET_ON', ownerApplicationId: 'orgmaster', action: 'activate', field: 'ORGMASTER_JENFU_SSO_HANDOFF_MODE', from: 'off', to: 'on', before: { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'off' }, after: { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on' } },
  { stepId: 'A3_ORGMASTER_SOURCE_LAUNCH', ownerApplicationId: 'platform', action: 'advance', field: 'PORTAL_SSO_ORGMASTER_PHASE', from: 'accept', to: 'launch', before: env('off', 'accept'), after: env('off', 'launch') },
  { stepId: 'A4_AI_PDM_SOURCE_ACCEPT', ownerApplicationId: 'platform', action: 'advance', field: 'PORTAL_SSO_AI_PDM_PHASE', from: 'off', to: 'accept', before: env('off', 'launch'), after: env('accept', 'launch') },
  { stepId: 'A5_AI_PDM_TARGET_ON', ownerApplicationId: 'ai-pdm', action: 'activate', field: 'PDM_JENFU_SSO_HANDOFF_MODE', from: 'off', to: 'on', before: { PDM_JENFU_SSO_HANDOFF_MODE: 'off' }, after: { PDM_JENFU_SSO_HANDOFF_MODE: 'on' } },
  { stepId: 'A6_AI_PDM_SOURCE_LAUNCH', ownerApplicationId: 'platform', action: 'advance', field: 'PORTAL_SSO_AI_PDM_PHASE', from: 'accept', to: 'launch', before: env('accept', 'launch'), after: env('launch', 'launch') },
].map((step, index) => ({ schemaVersion: 'jenfu.dev013.l4-sequence-step.v1', sequenceId: 'DEV013-L4-FORWARD-V1', flow: 'forward', order: index + 1, ...step }))

const ROLLBACK_STEPS = [
  { stepId: 'RB1_AI_PDM_SOURCE_ACCEPT', ownerApplicationId: 'platform', action: 'rollback', field: 'PORTAL_SSO_AI_PDM_PHASE', from: 'launch', to: 'accept', before: env('launch', 'launch'), after: env('accept', 'launch'), predecessors: ['A6_AI_PDM_SOURCE_LAUNCH'] },
  { stepId: 'RB2_AI_PDM_TARGET_OFF', ownerApplicationId: 'ai-pdm', action: 'rollback', field: 'PDM_JENFU_SSO_HANDOFF_MODE', from: 'on', to: 'off', before: { PDM_JENFU_SSO_HANDOFF_MODE: 'on' }, after: { PDM_JENFU_SSO_HANDOFF_MODE: 'off' }, predecessors: ['RB1_AI_PDM_SOURCE_ACCEPT', 'A5_AI_PDM_TARGET_ON'] },
  { stepId: 'RB3_AI_PDM_SOURCE_OFF', ownerApplicationId: 'platform', action: 'rollback', field: 'PORTAL_SSO_AI_PDM_PHASE', from: 'accept', to: 'off', before: env('accept', 'launch'), after: env('off', 'launch'), predecessors: ['RB2_AI_PDM_TARGET_OFF', 'A4_AI_PDM_SOURCE_ACCEPT'] },
  { stepId: 'RB4_ORGMASTER_SOURCE_ACCEPT', ownerApplicationId: 'platform', action: 'rollback', field: 'PORTAL_SSO_ORGMASTER_PHASE', from: 'launch', to: 'accept', before: env('off', 'launch'), after: env('off', 'accept'), predecessors: ['RB3_AI_PDM_SOURCE_OFF', 'A3_ORGMASTER_SOURCE_LAUNCH'] },
  { stepId: 'RB5_ORGMASTER_TARGET_OFF', ownerApplicationId: 'orgmaster', action: 'rollback', field: 'ORGMASTER_JENFU_SSO_HANDOFF_MODE', from: 'on', to: 'off', before: { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'on' }, after: { ORGMASTER_JENFU_SSO_HANDOFF_MODE: 'off' }, predecessors: ['RB4_ORGMASTER_SOURCE_ACCEPT', 'A2_ORGMASTER_TARGET_ON'] },
  { stepId: 'RB6_ORGMASTER_SOURCE_OFF', ownerApplicationId: 'platform', action: 'rollback', field: 'PORTAL_SSO_ORGMASTER_PHASE', from: 'accept', to: 'off', before: env('off', 'accept'), after: env('off', 'off'), predecessors: ['RB5_ORGMASTER_TARGET_OFF', 'A1_ORGMASTER_SOURCE_ACCEPT'] },
].map((step, index) => ({ schemaVersion: 'jenfu.dev013.l4-sequence-step.v1', sequenceId: 'DEV013-L4-ROLLBACK-V1', flow: 'rollback', order: index + 1, ...step }))

const allSteps = [...FORWARD_STEPS, ...ROLLBACK_STEPS]
const publicStep = ({ predecessors, ...step }) => step

function transitionMatches(step, transition) {
  if (transition?.action !== step.action) return false
  if (step.changes) return same(transition.changes, step.changes) && transition.field === undefined && transition.from === undefined && transition.to === undefined
  return transition.field === step.field && transition.from === step.from && transition.to === step.to && transition.changes === undefined
}

export function dev013L4SequenceStep(ownerApplicationId, transition, previousControlledEnvironment, controlledEnvironment) {
  const step = allSteps.find((candidate) => candidate.ownerApplicationId === ownerApplicationId
    && transitionMatches(candidate, transition)
    && same(candidate.before, previousControlledEnvironment)
    && same(candidate.after, controlledEnvironment))
  if (!step) fail('DEV013_SEQUENCE_STEP_INVALID')
  return publicStep(step)
}

function refValid(ref, bucket) {
  return ref && same(Object.keys(ref).sort(), ['sha256', 'uri']) && H64.test(ref.sha256 ?? '')
    && new RegExp(`^gs://${bucket}/receipts/.+\\.json$`, 'u').test(ref.uri ?? '') && !ref.uri.includes('..')
}

function predecessorRefValidForStep(ref, step) {
  const forwardIndex = FORWARD_STEPS.findIndex((candidate) => candidate.stepId === step?.stepId)
  if (forwardIndex === 0) return refValid(ref, ROOT_BUCKET)
  const predecessorIds = forwardIndex > 0
    ? [FORWARD_STEPS[forwardIndex - 1].stepId]
    : (ROLLBACK_STEPS.find((candidate) => candidate.stepId === step?.stepId)?.predecessors ?? [])
  return predecessorIds.some((stepId) => {
    const predecessor = allSteps.find((candidate) => candidate.stepId === stepId)
    return predecessor && refValid(ref, OWNER_BUCKETS[predecessor.ownerApplicationId])
  })
}

function sealed(value) {
  const { receiptSha256, ...core } = value ?? {}
  return H64.test(receiptSha256 ?? '') && receiptSha256 === sha256(canonicalize(core))
}

function sourceSetValid(value) {
  return same(Object.keys(value ?? {}).sort(), APP_IDS.slice().sort()) && Object.values(value).every((revision) => H40.test(revision))
}

function rootValid(value, ref, profile, observedAt, expectedSourceRevision) {
  const authorizedAt = Date.parse(value?.authorizedAt)
  const expiresAt = Date.parse(value?.expiresAt)
  return refValid(ref, ROOT_BUCKET)
    && value?.schemaVersion === 'jenfu.dev013.l4-execution-authorization.v1'
    && value.devId === 'DEV-013' && value.slice === '013-R1'
    && AUTHORIZATION_ID.test(value.authorizationId ?? '')
    && value.authorizationBasis === 'HUMAN_EXACT_PRODUCTION_SCOPE'
    && H64.test(value.authorizationStatementSha256 ?? '') && H64.test(value.manifestSha256 ?? '')
    && value.projectId === 'jenfu-platform-prod' && value.projectId === profile.target.projectId
    && value.projectNumber === '9536592944' && value.region === 'asia-east1' && value.region === profile.target.region
    && value.cloudSqlInstance === 'jenfu-platform-prod-pg' && value.database === 'jenfu_prod'
    && same(value.authorizedActions, ROOT_ACTIONS)
    && value.status === 'PASS' && value.releaseAuthority === true && value.remainingHumanAction === 0
    && value.evidenceScope === 'PRODUCTION_BOUND'
    && Number.isFinite(authorizedAt) && Number.isFinite(expiresAt) && authorizedAt <= Date.parse(observedAt) && expiresAt > Date.parse(observedAt)
    && expiresAt > authorizedAt && expiresAt - authorizedAt <= 8 * 60 * 60 * 1000
    && sourceSetValid(value.sourceRevisionByApplication)
    && value.sourceRevisionByApplication[profile.application.id] === expectedSourceRevision
    && sealed(value)
}

function terminalValid(value, ref, expectedStep, expectedSourceRevision, observedAt) {
  const fact = value?.facts?.dev013Transition
  const rootAuthorizedAt = Date.parse(fact?.sequenceRoot?.authorizedAt)
  const rootExpiresAt = Date.parse(fact?.sequenceRoot?.expiresAt)
  return refValid(ref, OWNER_BUCKETS[expectedStep.ownerApplicationId])
    && value?.schemaVersion === 'jenfu.dev012.stage-receipt.v1' && value.stage === 'terminal'
    && value.ownerApplicationId === expectedStep.ownerApplicationId
    && value.status === 'PASS' && value.facts?.result === 'RELEASED' && value.facts?.remainingHumanAction === 0
    && H40.test(value.sourceRevision ?? '') && sealed(value)
    && fact?.schemaVersion === 'jenfu.dev013.l4-terminal-transition.v1'
    && same(fact.sequenceStep, expectedStep)
    && predecessorRefValidForStep(fact.predecessorReceiptRef, expectedStep)
    && refValid(fact.sequenceRoot?.receiptRef, ROOT_BUCKET)
    && AUTHORIZATION_ID.test(fact.sequenceRoot.authorizationId ?? '')
    && H64.test(fact.sequenceRoot.authorizationStatementSha256 ?? '') && H64.test(fact.sequenceRoot.manifestSha256 ?? '')
    && Number.isFinite(rootAuthorizedAt) && Number.isFinite(rootExpiresAt) && rootAuthorizedAt <= Date.parse(observedAt) && rootExpiresAt > Date.parse(observedAt)
    && rootExpiresAt > rootAuthorizedAt && rootExpiresAt - rootAuthorizedAt <= 8 * 60 * 60 * 1000
    && sourceSetValid(fact.sequenceRoot.sourceRevisionByApplication)
    && fact.sequenceRoot.sourceRevisionByApplication[profileApplicationForStep(expectedStep)] === value.sourceRevision
    && fact.sequenceRoot.sourceRevisionByApplication[expectedSourceRevision.applicationId] === expectedSourceRevision.revision
}

function profileApplicationForStep(step) { return step.ownerApplicationId }

export function assertDev013L4Predecessor({ value, ref, profile, observedAt, expectedSourceRevision, currentStep }) {
  if (!currentStep || !H40.test(expectedSourceRevision ?? '')) fail('DEV013_PREDECESSOR_RECEIPT_INVALID')
  const forwardIndex = FORWARD_STEPS.findIndex((step) => step.stepId === currentStep.stepId)
  if (forwardIndex === 0) {
    if (!rootValid(value, ref, profile, observedAt, expectedSourceRevision)) fail('DEV013_PREDECESSOR_RECEIPT_INVALID')
    return {
      schemaVersion: value.schemaVersion,
      status: value.status,
      sequenceRoot: {
        schemaVersion: 'jenfu.dev013.l4-sequence-root.v1',
        authorizationId: value.authorizationId,
        authorizationStatementSha256: value.authorizationStatementSha256,
        manifestSha256: value.manifestSha256,
        authorizedAt: value.authorizedAt,
        expiresAt: value.expiresAt,
        receiptRef: ref,
        sourceRevisionByApplication: value.sourceRevisionByApplication,
      },
      predecessorStep: null,
    }
  }
  const allowedIds = forwardIndex > 0
    ? [FORWARD_STEPS[forwardIndex - 1].stepId]
    : (ROLLBACK_STEPS.find((step) => step.stepId === currentStep.stepId)?.predecessors ?? [])
  const expectedStep = allSteps.find((step) => allowedIds.includes(step.stepId) && same(value?.facts?.dev013Transition?.sequenceStep, publicStep(step)))
  if (!expectedStep || !terminalValid(value, ref, publicStep(expectedStep), { applicationId: profile.application.id, revision: expectedSourceRevision }, observedAt)) fail('DEV013_PREDECESSOR_RECEIPT_INVALID')
  return {
    schemaVersion: value.schemaVersion,
    ownerApplicationId: value.ownerApplicationId,
    releaseId: value.releaseId,
    sourceRevision: value.sourceRevision,
    status: value.status,
    sequenceRoot: value.facts.dev013Transition.sequenceRoot,
    predecessorStep: value.facts.dev013Transition.sequenceStep,
  }
}

export function dev013TerminalTransitionFact(readiness, intent) {
  if (readiness?.schemaVersion !== 'jenfu.dev013.l4-owner-transition-readiness.v1') return null
  if (readiness.ownerApplicationId !== intent.ownerApplicationId || readiness.releaseId !== intent.releaseId || readiness.sourceRevision !== intent.sourceRevision
    || readiness.devId !== 'DEV-013' || readiness.slice !== '013-R1'
    || readiness.sequenceStep?.ownerApplicationId !== intent.ownerApplicationId
    || readiness.sequenceRoot?.schemaVersion !== 'jenfu.dev013.l4-sequence-root.v1'
    || !refValid(readiness.sequenceRoot.receiptRef, ROOT_BUCKET)
    || !AUTHORIZATION_ID.test(readiness.sequenceRoot.authorizationId ?? '')
    || !H64.test(readiness.sequenceRoot.authorizationStatementSha256 ?? '') || !H64.test(readiness.sequenceRoot.manifestSha256 ?? '')
    || !Number.isFinite(Date.parse(readiness.sequenceRoot.authorizedAt)) || !Number.isFinite(Date.parse(readiness.sequenceRoot.expiresAt))
    || Date.parse(readiness.sequenceRoot.authorizedAt) > Date.parse(readiness.observedAt)
    || Date.parse(readiness.sequenceRoot.expiresAt) <= Date.parse(readiness.observedAt)
    || Date.parse(readiness.expiresAt) > Date.parse(readiness.sequenceRoot.expiresAt)
    || !sourceSetValid(readiness.sequenceRoot.sourceRevisionByApplication)
    || readiness.sequenceRoot.sourceRevisionByApplication[intent.ownerApplicationId] !== intent.sourceRevision) fail('DEV013_TERMINAL_TRANSITION_INVALID')
  if (!predecessorRefValidForStep(readiness.transition?.predecessorReceiptRef, readiness.sequenceStep)) fail('DEV013_TERMINAL_TRANSITION_INVALID')
  return {
    schemaVersion: 'jenfu.dev013.l4-terminal-transition.v1',
    sequenceRoot: readiness.sequenceRoot,
    sequenceStep: readiness.sequenceStep,
    predecessorReceiptRef: readiness.transition.predecessorReceiptRef,
  }
}

export const DEV013_L4_FORWARD_STEPS = FORWARD_STEPS.map(publicStep)
