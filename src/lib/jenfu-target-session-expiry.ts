export const JENFU_TARGET_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export function resolveJenfuTargetSessionExpiry(nowSeconds: number, sourceSessionExpiresAt: string) {
  const sourceExpirySeconds = Math.floor(Date.parse(sourceSessionExpiresAt) / 1000);
  const maxExpiry = Math.min(nowSeconds + JENFU_TARGET_SESSION_MAX_AGE_SECONDS, sourceExpirySeconds);
  if (!Number.isSafeInteger(nowSeconds) || !Number.isSafeInteger(sourceExpirySeconds) ||
    !Number.isSafeInteger(maxExpiry) || maxExpiry <= nowSeconds) throw new Error("HANDOFF_EXPIRED");
  return maxExpiry;
}
