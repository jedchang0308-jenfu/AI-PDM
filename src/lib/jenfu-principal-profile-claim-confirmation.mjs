import { createHash } from 'node:crypto'

const FIELDS = ['schemaVersion', 'pdmUserId', 'companyId', 'principalId',
  'employeeId', 'identityIssuer', 'identitySubject', 'legacyIdentityIssuer',
  'legacyIdentitySubject', 'expectedLegacyRole', 'confirmedBy', 'confirmedAt',
  'humanSourceRef']
const CLAIM_FIELDS = FIELDS.slice(1, 10)
const H64 = /^[a-f0-9]{64}$/u

function invalid() { throw new Error('PRINCIPAL_TRANSFER_CONFIRMATION_INVALID') }
function exactText(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value)
}
function exactTime(value) {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

/** Validates exact bytes and fields; humanSourceRef still needs external provenance. */
export function validateProfileClaimConfirmationBytes(bytes, source, expectedSha256) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 16384 ||
      !source || source.claimKind !== 'profile_transfer' ||
      !H64.test(expectedSha256 ?? '') ||
      createHash('sha256').update(bytes).digest('hex') !== expectedSha256 ||
      source.confirmationReceiptHash !== expectedSha256) invalid()
  let value
  try { value = JSON.parse(bytes.toString('utf8')) }
  catch { invalid() }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...FIELDS].sort()) ||
      value.schemaVersion !== 'ai-pdm.profile-claim-confirmation.v1' ||
      CLAIM_FIELDS.some((field) => value[field] !== source[field]) ||
      !exactText(value.confirmedBy) || !exactTime(value.confirmedAt) ||
      !exactText(value.humanSourceRef)) invalid()
  return value
}
