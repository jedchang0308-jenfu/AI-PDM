export const recognitionLeaseProtocolVersion = 1;
export const recognitionLeaseHeader = "x-pdm-recognition-lease";

export type RecognitionLeaseBasis = {
  companyId: string;
  sourceSetFingerprint: string;
  attemptCount: number;
  lockedAt: string;
};

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)));
}

export function parseRecognitionLeaseBasis(value: unknown): RecognitionLeaseBasis | null {
  if (!exactObject(value, ["companyId", "sourceSetFingerprint", "attemptCount", "lockedAt"])) return null;
  if (typeof value.companyId !== "string" || !value.companyId.trim() || value.companyId !== value.companyId.trim() ||
      typeof value.sourceSetFingerprint !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/u.test(value.sourceSetFingerprint) ||
      !Number.isSafeInteger(value.attemptCount) || Number(value.attemptCount) < 1 || Number(value.attemptCount) > 5 ||
      typeof value.lockedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.lockedAt) ||
      new Date(value.lockedAt).toISOString() !== value.lockedAt) return null;
  return { companyId: value.companyId, sourceSetFingerprint: value.sourceSetFingerprint,
    attemptCount: Number(value.attemptCount), lockedAt: value.lockedAt };
}

export function parseRecognitionLeaseEnvelope(value: unknown): RecognitionLeaseBasis | null {
  if (!exactObject(value, ["leaseProtocolVersion", "leaseBasis"]) ||
      value.leaseProtocolVersion !== recognitionLeaseProtocolVersion) return null;
  return parseRecognitionLeaseBasis(value.leaseBasis);
}

export function decodeRecognitionLeaseHeader(value: string | null): RecognitionLeaseBasis | null {
  if (!value || value.length > 2048 || !/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length > 1536 || bytes.toString("base64url") !== value) return null;
    return parseRecognitionLeaseEnvelope(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  } catch { return null; }
}
