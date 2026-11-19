export const PDM_FILE_READ_CONTEXTS = [
  "candidate_revision",
  "drawing_revision",
  "drawing_revision_work",
  "drawing_revision_package",
  "review_package",
  "drawing_attachment",
  "part_attachment",
  "approval_evidence"
] as const;

export type PdmFileReadContext = (typeof PDM_FILE_READ_CONTEXTS)[number];

export type PdmFileReadHrefInput = {
  fileAssetId: string;
  context: PdmFileReadContext;
  contextId: string;
  bindingId: string;
  reviewRequestId?: string | null;
};

export function isPdmFileReadContext(value: string | null): value is PdmFileReadContext {
  return PDM_FILE_READ_CONTEXTS.includes(value as PdmFileReadContext);
}

/**
 * File identity is the only path identity. Candidate/released/history/review
 * are authorization contexts and never become parallel binary authorities.
 */
export function pdmFileReadHref(input: PdmFileReadHrefInput) {
  const params = new URLSearchParams({
    context: input.context,
    contextId: input.contextId,
    bindingId: input.bindingId
  });
  // A row may be under review while still read through the drawing workbench.
  // Only a review-package link uses assignment/snapshot authorization; mixing
  // its request ID into a revision link is rejected by the file-read route.
  if (input.context === "review_package" && input.reviewRequestId) params.set("reviewRequestId", input.reviewRequestId);
  return `/api/pdm/file-assets/${encodeURIComponent(input.fileAssetId)}?${params}`;
}
