export function isPrincipalTransferReviewRequestId(value: string) {
  return /^APR-TRF-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
}
