export const OWNER_PRIVATE_OBJECT_MEDIA_TIMEOUT_MS = 120_000
export const OWNER_PRIVATE_OBJECT_MEDIA_ATTEMPT_TIMEOUT_MS = 60_000

const OWNER_PRIVATE_OBJECT_MEDIA_MIN_BYTES_PER_SECOND = 384 * 1024
const OWNER_PRIVATE_OBJECT_MEDIA_ATTEMPT_OVERHEAD_MS = 30_000
const OWNER_PRIVATE_OBJECT_MEDIA_ATTEMPT_MAX_MS = 599_000
const OWNER_PRIVATE_OBJECT_MEDIA_TIMEOUT_MAX_MS = 1_200_000
const OWNER_PRIVATE_OBJECT_MEDIA_RETRY_ALLOWANCE_MS = 1_000

/**
 * Bound private GCS media reads from the provider-declared immutable size.
 * Metadata, generation, CRC32C and SHA validation remain the integrity gate;
 * this window only prevents a known large valid object from being rejected by
 * the small-object timeout.
 */
export function ownerPrivateObjectMediaWindow(size) {
  if (!Number.isSafeInteger(size) || size <= 0) {
    return {
      timeoutMs: OWNER_PRIVATE_OBJECT_MEDIA_TIMEOUT_MS,
      attemptTimeoutMs: OWNER_PRIVATE_OBJECT_MEDIA_ATTEMPT_TIMEOUT_MS,
    }
  }
  // Production source reads have sustained roughly 500 KiB/s. Budget at
  // 384 KiB/s plus startup margin while retaining finite per-attempt bounds.
  const transferMs = Math.ceil((size / OWNER_PRIVATE_OBJECT_MEDIA_MIN_BYTES_PER_SECOND) * 1_000)
  const attemptTimeoutMs = Math.min(
    OWNER_PRIVATE_OBJECT_MEDIA_ATTEMPT_MAX_MS,
    Math.max(OWNER_PRIVATE_OBJECT_MEDIA_ATTEMPT_TIMEOUT_MS, transferMs + OWNER_PRIVATE_OBJECT_MEDIA_ATTEMPT_OVERHEAD_MS),
  )
  return {
    timeoutMs: Math.min(
      OWNER_PRIVATE_OBJECT_MEDIA_TIMEOUT_MAX_MS,
      Math.max(OWNER_PRIVATE_OBJECT_MEDIA_TIMEOUT_MS, attemptTimeoutMs * 2 + OWNER_PRIVATE_OBJECT_MEDIA_RETRY_ALLOWANCE_MS),
    ),
    attemptTimeoutMs,
  }
}
