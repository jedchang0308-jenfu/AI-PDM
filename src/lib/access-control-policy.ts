/** Existing local policy: these sensitive actions never inherit the admin default. */
export const EXPLICIT_ONLY_PERMISSION_CODES = new Set([
  "numbering.candidate.review.submit",
  "numbering.candidate.review.withdraw",
  "numbering.candidate.review.decide",
  "numbering.publish",
  "transfer.package.review.submit",
  "transfer.package.review.withdraw",
  "transfer.package.review.decide",
  "transfer.package.publish"
]);
