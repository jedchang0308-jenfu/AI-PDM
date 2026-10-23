/** Generation data is a fence, never authority. The workload actor and source
 * company are independently resolved by the server on every action. */
export const previewLeaseProtocolVersion = 2;
export const previewLeaseHeader = "x-pdm-preview-lease";
export const previewLeaseVersionHeader = "x-pdm-preview-lease-protocol-version";
const maxEnvelopeBytes = 1536;
const maxHeaderLength = 2048;

export type PreviewLeaseBasis = {
  companyId: string;
  sourceFileAssetId: string;
  sourceContentHash: string;
  attemptCount: number;
  lockedAt: string;
};

function hasExactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
}

export function parsePreviewLeaseBasis(value: unknown): PreviewLeaseBasis | null {
  if (!hasExactKeys(value, ["companyId", "sourceFileAssetId", "sourceContentHash", "attemptCount", "lockedAt"])) return null;
  for (const key of ["companyId", "sourceFileAssetId"]) {
    const id = value[key];
    if (typeof id !== "string" || !id || id !== id.trim() || Buffer.byteLength(id, "utf8") > 256
      || /[\u0000-\u001f\u007f]/u.test(id)) return null;
  }
  if (typeof value.sourceContentHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.sourceContentHash)
    || !Number.isSafeInteger(value.attemptCount) || Number(value.attemptCount) < 1 || Number(value.attemptCount) > 3
    || typeof value.lockedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.lockedAt)
    || !Number.isFinite(Date.parse(value.lockedAt)) || new Date(value.lockedAt).toISOString() !== value.lockedAt) return null;
  const basis = value as PreviewLeaseBasis;
  if (Buffer.byteLength(JSON.stringify({ leaseProtocolVersion: previewLeaseProtocolVersion, leaseBasis: basis }), "utf8") > maxEnvelopeBytes) return null;
  return { companyId: basis.companyId, sourceFileAssetId: basis.sourceFileAssetId,
    sourceContentHash: basis.sourceContentHash, attemptCount: basis.attemptCount, lockedAt: basis.lockedAt };
}

export function parsePreviewLeaseEnvelope(value: unknown): PreviewLeaseBasis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const envelope = value as Record<string, unknown>;
  return envelope.leaseProtocolVersion === previewLeaseProtocolVersion ? parsePreviewLeaseBasis(envelope.leaseBasis) : null;
}

export function decodePreviewLeaseHeader(value: string | null): PreviewLeaseBasis | null {
  if (!value || value.length > maxHeaderLength || !/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length > maxEnvelopeBytes || bytes.toString("base64url") !== value) return null;
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!hasExactKeys(parsed, ["leaseProtocolVersion", "leaseBasis"])) return null;
    return parsePreviewLeaseEnvelope(parsed);
  } catch { return null; }
}
