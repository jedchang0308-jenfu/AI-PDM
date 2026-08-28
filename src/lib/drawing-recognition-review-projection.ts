import { resolveRecognitionPartOwner, type RecognitionPartOwnerTarget } from "./drawing-recognition-part-owner.ts";

export const DRAWING_RECOGNITION_REVIEW_PROJECTION_SCHEMA = "pdm-recognition-review-projection-v1" as const;

export type RecognitionOwnerResolution = "not_required" | "resolved" | "unresolved" | "ambiguous" | "invalid";
export type RecognitionOwnerBlockingReason = "part_owner_required" | "part_owner_ambiguous" | "part_owner_invalid" | null;

export type RecognitionReviewObservation = {
  id: string;
  candidateId: string;
  sourceId: string;
  sourceFileName: string | null;
  sourceRole: string | null;
  rawText: string;
  rawValue: string | null;
  normalizedValue: string | null;
  locationKind: string;
  pageNumber: number | null;
  sheetName: string | null;
  configurationName: string | null;
  geometry: Record<string, unknown> | null;
  confidenceBand: string;
  extractorCode: string;
  extractorVersion: string;
  capturedAt: string;
};

export type RecognitionReviewCandidateDecision = {
  id: string;
  category: string;
  fieldKey: string | null;
  fieldLabel: string;
  proposedValue: string | null;
  normalizedValue: string | null;
  proposedOwnerType: string | null;
  proposedOwnerId: string | null;
  applicabilityScope: string;
  confidenceBand: string;
  reviewState: string;
  currentFormalValue: string | null;
  rowVersion: number;
  observations: RecognitionReviewObservation[];
};

export type RecognitionReviewScope = {
  id: string;
  category: string;
  fieldKey: string | null;
  fieldLabel: string;
  primaryCandidateId: string;
  memberCandidateIds: string[];
  distinctValues: string[];
  conflictState: "none" | "conflict";
  reviewState: string;
  proposedValue: string | null;
  currentFormalValue: string | null;
  observations: RecognitionReviewObservation[];
};

export type RecognitionReviewField = RecognitionReviewScope & {
  scopes: RecognitionReviewScope[];
  ownerResolution: RecognitionOwnerResolution;
  effectiveOwnerId: string | null;
  blockingReason: RecognitionOwnerBlockingReason;
};

export type DrawingRecognitionReviewProjectionBody = {
  schemaVersion: typeof DRAWING_RECOGNITION_REVIEW_PROJECTION_SCHEMA;
  session: {
    id: string;
    sourceContextType: string;
    sourceContextId: string;
    drawingId: string | null;
    drawingRevisionId: string | null;
    sourceSetFingerprint: string;
    status: string;
    rowVersion: number;
    warningCount: number;
    conflictCount: number;
    unclassifiedCount: number;
    errorCode: string | null;
    errorSummary: string | null;
    createdAt: string;
    updatedAt: string;
    formalizedAt: string | null;
  };
  sources: Array<{
    id: string;
    fileAssetId: string;
    contentHash: string;
    storageGeneration: string | null;
    fileName: string;
    fileExt: string;
    mimeType: string;
    fileSize: number;
    sourceRole: string;
    sortOrder: number;
    adapterPlan: string[];
  }>;
  candidateDecisions: RecognitionReviewCandidateDecision[];
  fields: RecognitionReviewField[];
};

export type DrawingRecognitionReviewProjection = DrawingRecognitionReviewProjectionBody & { projectionHash: string };

type ReviewGroupInput = Omit<RecognitionReviewScope, "observations"> & {
  observations: RecognitionReviewObservation[];
};

function canonicalDisplayFieldKey(fieldKey: string | null) {
  if (fieldKey === "surface_treatment") return "surface_finish";
  if (fieldKey === "drawn_by") return "drawn_by_name";
  if (fieldKey && /^sw_custom_(?:2d圖號_用途|圖號)_[\p{L}\p{N}]+$/u.test(fieldKey)) return "drawing_number";
  if (fieldKey && /^sw_custom_swformatsize_[\p{L}\p{N}]+$/u.test(fieldKey)) return "paper_size";
  return fieldKey;
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function fieldKey(group: Pick<ReviewGroupInput, "category" | "fieldKey" | "fieldLabel">) {
  const canonical = canonicalDisplayFieldKey(group.fieldKey);
  return canonical ? `field:${canonical}` : `${group.category}:label:${group.fieldLabel}`;
}

function ownerProjection(
  candidateIds: string[],
  candidates: RecognitionReviewCandidateDecision[],
  partOwnerTargets?: RecognitionPartOwnerTarget[]
) {
  const members = candidateIds.map((id) => candidates.find((candidate) => candidate.id === id)).filter((candidate): candidate is RecognitionReviewCandidateDecision => Boolean(candidate));
  const ownedPartMembers = members.filter((candidate) => candidate.proposedOwnerType === "part_number" && Boolean(candidate.proposedValue?.trim()));
  if (ownedPartMembers.length === 0) return { ownerResolution: "not_required" as const, effectiveOwnerId: null, blockingReason: null };
  const ownerIds = unique(ownedPartMembers.map((candidate) => candidate.proposedOwnerId));
  const ownerless = ownedPartMembers.some((candidate) => !candidate.proposedOwnerId);
  if (ownerless || ownerIds.length === 0) return { ownerResolution: "unresolved" as const, effectiveOwnerId: null, blockingReason: "part_owner_required" as const };
  if (partOwnerTargets) {
    const resolutions = ownerIds.map((ownerId) => resolveRecognitionPartOwner({ targets: partOwnerTargets, suppliedOwnerId: ownerId }));
    if (resolutions.some((resolution) => resolution.kind === "unresolved")) {
      return { ownerResolution: "invalid" as const, effectiveOwnerId: null, blockingReason: "part_owner_invalid" as const };
    }
    const resolvedOwnerIds = unique(resolutions.map((resolution) => resolution.kind === "resolved" ? resolution.ownerId : null));
    if (resolutions.some((resolution) => resolution.kind === "ambiguous") || resolvedOwnerIds.length > 1) {
      return { ownerResolution: "ambiguous" as const, effectiveOwnerId: null, blockingReason: "part_owner_ambiguous" as const };
    }
    return { ownerResolution: "resolved" as const, effectiveOwnerId: resolvedOwnerIds[0], blockingReason: null };
  }
  if (ownerIds.length > 1) return { ownerResolution: "ambiguous" as const, effectiveOwnerId: null, blockingReason: "part_owner_ambiguous" as const };
  return { ownerResolution: "resolved" as const, effectiveOwnerId: ownerIds[0], blockingReason: null };
}

/**
 * One domain projector is used by the owner API and by the immutable review-package builder.
 * UI surfaces render these fields and never infer owner validity from raw candidate members.
 */
export function projectDrawingRecognitionReviewFields(
  groups: ReviewGroupInput[],
  candidates: RecognitionReviewCandidateDecision[],
  options: { partOwnerTargets?: RecognitionPartOwnerTarget[] } = {}
): RecognitionReviewField[] {
  const buckets = new Map<string, ReviewGroupInput[]>();
  for (const group of groups) buckets.set(fieldKey(group), [...(buckets.get(fieldKey(group)) ?? []), { ...group, fieldKey: canonicalDisplayFieldKey(group.fieldKey) }]);
  return [...buckets.values()].map((scopes) => {
    const memberCandidateIds = [...new Set(scopes.flatMap((scope) => scope.memberCandidateIds))].sort();
    const distinctValues = unique(scopes.flatMap((scope) => scope.distinctValues.length ? scope.distinctValues : [scope.proposedValue])).sort();
    const observations = [...new Map(scopes.flatMap((scope) => scope.observations).map((observation) => [observation.id, observation])).values()];
    const preferredValue = distinctValues.length === 1 ? distinctValues[0] : null;
    const primary = (preferredValue ? scopes.find((scope) => unique([...scope.distinctValues, scope.proposedValue]).includes(preferredValue)) : null) ?? scopes[0];
    const currentFormalValue = unique(scopes.map((scope) => scope.currentFormalValue)).join(" ／ ") || null;
    const conflict = distinctValues.length > 1 || scopes.some((scope) => scope.conflictState === "conflict" || scope.reviewState === "conflict");
    const blocked = scopes.some((scope) => scope.reviewState === "blocked");
    return {
      ...primary,
      primaryCandidateId: primary.primaryCandidateId,
      memberCandidateIds,
      distinctValues,
      conflictState: conflict ? "conflict" as const : "none" as const,
      reviewState: conflict ? "conflict" : blocked ? "blocked" : primary.reviewState,
      proposedValue: preferredValue ?? primary.proposedValue,
      currentFormalValue,
      observations,
      scopes,
      ...ownerProjection(memberCandidateIds, candidates, options.partOwnerTargets)
    };
  }).sort((left, right) => `${left.category}:${left.fieldKey ?? ""}:${left.id}`.localeCompare(`${right.category}:${right.fieldKey ?? ""}:${right.id}`));
}
