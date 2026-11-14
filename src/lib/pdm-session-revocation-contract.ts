import { createHash } from 'node:crypto'

export const pdmRevocationVersion = 'jenfu.pdm-session-revocation.v1'
export const pdmRevocationReceiptVersion = 'ai-pdm.session-revocation-receipt.v1'
export const pdmRevocationPath = '/api/internal/pdm-session-revocation/v1'
export const pdmRevocationBodyLimit = 1024 * 1024
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u
const opaque = /^[A-Za-z0-9._:@/-]{1,255}$/u
const timestamp = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u
const hex = /^[0-9a-f]{64}$/u

export class PdmRevocationError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}

type CommandBase = {
  contractVersion: typeof pdmRevocationVersion
  targetApp: 'ai-pdm'
  eventId: string
  operationId: string
  principalIds: readonly string[]
}

export type PdmRevocationPayload = CommandBase & (
  | { sourceApp: 'orgmaster'; phase: 'prepare' | 'published' | 'cancelled'; baselineVersion: string;
      publicationVersion: string; sourceEpoch: null; revokedBefore: null }
  | { sourceApp: 'platform'; phase: 'global_logout'; baselineVersion: null;
      publicationVersion: null; sourceEpoch: number; revokedBefore: string }
  | { sourceApp: 'platform'; phase: 'global_prepare' | 'global_cancelled'; baselineVersion: null;
      publicationVersion: null; sourceEpoch: number; revokedBefore: null }
)
export type PdmRevocationCommand = PdmRevocationPayload & { digest: string }
export type PdmRevocationReceipt = {
  contractVersion: typeof pdmRevocationReceiptVersion
  eventId: string
  operationId: string
  phase: PdmRevocationCommand['phase']
  digest: string
  receiptId: string
  appliedAt: string
}

function isObject(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field)))
}
const matches = (value: unknown, pattern: RegExp): value is string => typeof value === 'string' && pattern.test(value)
const isTimestamp = (value: unknown) => matches(value, timestamp) && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value
const isPublicationVersion = (value: unknown): value is string => matches(value, /^(0|[1-9]\d{0,18})$/u)
  && BigInt(value) <= 9223372036854775807n

export function digestPdmRevocation(c: PdmRevocationPayload) {
  return createHash('sha256').update(JSON.stringify([c.contractVersion, c.sourceApp, c.targetApp, c.eventId,
    c.operationId, c.phase, c.baselineVersion, c.publicationVersion, c.principalIds, c.sourceEpoch, c.revokedBefore]), 'utf8').digest('hex')
}

const commandFields = ['contractVersion', 'sourceApp', 'targetApp', 'eventId', 'operationId', 'phase',
  'baselineVersion', 'publicationVersion', 'principalIds', 'sourceEpoch', 'revokedBefore', 'digest']

export function parsePdmRevocationCommand(value: unknown): PdmRevocationCommand {
  const invalid = () => new PdmRevocationError(400, 'pdm_revocation_command_invalid')
  if (!isObject(value, commandFields) || value.contractVersion !== pdmRevocationVersion
      || value.targetApp !== 'ai-pdm' || !matches(value.eventId, uuid) || !matches(value.operationId, uuid)
      || !matches(value.digest, hex) || !Array.isArray(value.principalIds)
      || value.principalIds.length === 0 || value.principalIds.length > 4096
      || !value.principalIds.every((id, index, ids) => matches(id, opaque) && (index === 0 || ids[index - 1] < id))) {
    throw invalid()
  }
  if (value.sourceApp === 'orgmaster') {
    if ((value.phase !== 'prepare' && value.phase !== 'published' && value.phase !== 'cancelled')
      || !isPublicationVersion(value.baselineVersion) || !isPublicationVersion(value.publicationVersion)
      || BigInt(value.publicationVersion) !== BigInt(value.baselineVersion) + 1n
      || value.sourceEpoch !== null || value.revokedBefore !== null) throw invalid()
  } else if (value.sourceApp === 'platform') {
    if (value.principalIds.length !== 1
      || value.baselineVersion !== null || value.publicationVersion !== null || typeof value.sourceEpoch !== 'number'
      || !Number.isSafeInteger(value.sourceEpoch) || value.sourceEpoch < 0) throw invalid()
    if (value.phase === 'global_logout') {
      if (!isTimestamp(value.revokedBefore)) throw invalid()
    } else if ((value.phase !== 'global_prepare' && value.phase !== 'global_cancelled') || value.revokedBefore !== null) throw invalid()
  } else throw invalid()
  const command = value as PdmRevocationCommand
  if (command.digest !== digestPdmRevocation(command)) throw invalid()
  return command
}

export function parsePdmRevocationReceipt(value: unknown, command: PdmRevocationCommand): PdmRevocationReceipt {
  if (!isObject(value, ['contractVersion', 'eventId', 'operationId', 'phase', 'digest', 'receiptId', 'appliedAt'])
      || value.contractVersion !== pdmRevocationReceiptVersion || value.eventId !== command.eventId
      || value.operationId !== command.operationId || value.phase !== command.phase || value.digest !== command.digest
      || !matches(value.receiptId, uuid) || !isTimestamp(value.appliedAt)) {
    throw new PdmRevocationError(503, 'pdm_revocation_receipt_invalid')
  }
  return value as PdmRevocationReceipt
}

export async function readPdmRevocationJson(message: Request | Response, maxBytes: number, upstream = false): Promise<unknown> {
  function error(status: number, code: string) {
    return upstream ? new PdmRevocationError(503, 'pdm_revocation_receipt_invalid') : new PdmRevocationError(status, code)
  }
  if (message.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    throw error(415, 'pdm_revocation_json_required')
  }
  const declared = message.headers.get('content-length')
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maxBytes)) {
    throw error(413, 'pdm_revocation_body_too_large')
  }
  const reader = message.body?.getReader()
  if (!reader) throw error(400, 'pdm_revocation_json_invalid')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        void reader.cancel().catch(() => undefined)
        throw error(413, 'pdm_revocation_body_too_large')
      }
      chunks.push(value)
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
  } catch (cause) {
    if (cause instanceof PdmRevocationError) throw cause
    throw error(400, 'pdm_revocation_json_invalid')
  } finally { reader.releaseLock() }
}
