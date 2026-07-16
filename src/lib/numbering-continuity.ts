import crypto from "node:crypto";

export type NumberKind = "root" | "drawing" | "part";
export type NumberingLedgerEventType = "official_number_issued" | "recovery_reserved";

export interface NumberingLedgerSigner {
  readonly keyId: string;
  sign(payloadHash: string): string;
  verify(payloadHash: string, signature: string): boolean;
}

export interface SignedNumberingLedgerEntry {
  entryId: string;
  sequence: number;
  companyId: string;
  numberKind: NumberKind;
  numberValue: string;
  eventType: NumberingLedgerEventType;
  occurredAt: string;
  previousEntryHash: string | null;
  payloadHash: string;
  signingKeyId: string;
  signature: string;
  entryHash: string;
}

export interface RecoveryReservationFixture {
  companyId: string;
  numberKind: NumberKind;
  numberValue: string;
  ledgerEntryHash: string;
  sourceArchiveRef: string;
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function ledgerPayload(input: Omit<SignedNumberingLedgerEntry, "payloadHash" | "signingKeyId" | "signature" | "entryHash">) {
  return JSON.stringify([
    input.entryId,
    input.sequence,
    input.companyId,
    input.numberKind,
    input.numberValue,
    input.eventType,
    input.occurredAt,
    input.previousEntryHash
  ]);
}

export class HmacFixtureNumberingLedgerSigner implements NumberingLedgerSigner {
  constructor(readonly keyId: string, private readonly secret: string) {
    if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("LEDGER_FIXTURE_KEY_TOO_SHORT");
  }

  sign(payloadHash: string) {
    return crypto.createHmac("sha256", this.secret).update(payloadHash).digest("base64url");
  }

  verify(payloadHash: string, signature: string) {
    const expected = Buffer.from(this.sign(payloadHash));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }
}

export function appendSignedNumberingLedgerEntry(
  entries: SignedNumberingLedgerEntry[],
  input: Omit<SignedNumberingLedgerEntry, "sequence" | "previousEntryHash" | "payloadHash" | "signingKeyId" | "signature" | "entryHash">,
  signer: NumberingLedgerSigner
) {
  const previous = entries.at(-1);
  const unsigned = {
    ...input,
    sequence: (previous?.sequence ?? 0) + 1,
    previousEntryHash: previous?.entryHash ?? null
  };
  const payloadHash = sha256(ledgerPayload(unsigned));
  const signature = signer.sign(payloadHash);
  const entry: SignedNumberingLedgerEntry = {
    ...unsigned,
    payloadHash,
    signingKeyId: signer.keyId,
    signature,
    entryHash: sha256(`${payloadHash}:${signer.keyId}:${signature}`)
  };
  entries.push(entry);
  return entry;
}

export function verifySignedNumberingLedger(entries: SignedNumberingLedgerEntry[], signers: Map<string, NumberingLedgerSigner>) {
  const errors: string[] = [];
  let previousHash: string | null = null;
  for (const [index, entry] of entries.entries()) {
    const expectedSequence = index + 1;
    if (entry.sequence !== expectedSequence) errors.push(`LEDGER_SEQUENCE_INVALID:${entry.entryId}`);
    if (entry.previousEntryHash !== previousHash) errors.push(`LEDGER_CHAIN_INVALID:${entry.entryId}`);
    const unsigned = {
      entryId: entry.entryId,
      sequence: entry.sequence,
      companyId: entry.companyId,
      numberKind: entry.numberKind,
      numberValue: entry.numberValue,
      eventType: entry.eventType,
      occurredAt: entry.occurredAt,
      previousEntryHash: entry.previousEntryHash
    };
    const expectedPayloadHash = sha256(ledgerPayload(unsigned));
    if (entry.payloadHash !== expectedPayloadHash) errors.push(`LEDGER_PAYLOAD_HASH_INVALID:${entry.entryId}`);
    const signer = signers.get(entry.signingKeyId);
    if (!signer || !signer.verify(entry.payloadHash, entry.signature)) errors.push(`LEDGER_SIGNATURE_INVALID:${entry.entryId}`);
    if (entry.entryHash !== sha256(`${entry.payloadHash}:${entry.signingKeyId}:${entry.signature}`)) errors.push(`LEDGER_ENTRY_HASH_INVALID:${entry.entryId}`);
    previousHash = entry.entryHash;
  }
  return { valid: errors.length === 0, errors, headHash: previousHash };
}

function numberKey(input: { companyId: string; numberKind: NumberKind; numberValue: string }) {
  return `${input.companyId}:${input.numberKind}:${input.numberValue}`;
}

export function reconcileRestoredNumberingState(input: {
  ledger: SignedNumberingLedgerEntry[];
  signers: Map<string, NumberingLedgerSigner>;
  restoredOfficialNumbers: Array<{ companyId: string; numberKind: NumberKind; numberValue: string }>;
  recoveryReservations: RecoveryReservationFixture[];
}) {
  const ledgerVerification = verifySignedNumberingLedger(input.ledger, input.signers);
  const ledgerByKey = new Map(input.ledger.map((entry) => [numberKey(entry), entry]));
  const officialKeys = new Set(input.restoredOfficialNumbers.map(numberKey));
  const reservationKeys = new Set(input.recoveryReservations.map(numberKey));
  const errors = [...ledgerVerification.errors];
  for (const [key, entry] of ledgerByKey) {
    if (!officialKeys.has(key) && !reservationKeys.has(key)) errors.push(`NUMBERING_RESTORE_MISSING:${key}`);
    const reservation = input.recoveryReservations.find((candidate) => numberKey(candidate) === key);
    if (reservation && reservation.ledgerEntryHash !== entry.entryHash) errors.push(`NUMBERING_RESERVATION_LEDGER_MISMATCH:${key}`);
  }
  for (const key of officialKeys) {
    if (reservationKeys.has(key)) errors.push(`NUMBERING_OFFICIAL_AND_RESERVED_DUPLICATE:${key}`);
    if (!ledgerByKey.has(key)) errors.push(`NUMBERING_OFFICIAL_NOT_IN_LEDGER:${key}`);
  }
  for (const key of reservationKeys) {
    if (!ledgerByKey.has(key)) errors.push(`NUMBERING_RESERVATION_NOT_IN_LEDGER:${key}`);
  }
  return { valid: errors.length === 0, errors, ledgerHeadHash: ledgerVerification.headHash };
}
