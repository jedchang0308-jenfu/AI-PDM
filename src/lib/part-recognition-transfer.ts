export type RecognitionTransferCandidate = {
  category: string;
  fieldKey: string | null;
  fieldLabel: string;
  proposedValue?: string | null;
  proposedOwnerType?: string | null;
  proposedOwnerId?: string | null;
  reviewState: string;
};

export type PartRecognitionChange = {
  fieldKey: string;
  beforeValue: string | null;
  afterValue: string | null;
  changeKind: string;
};

const FIXED_PART_FIELDS = new Map<string, string>([
  ["material", "materialLabel"],
  ["color", "colorLabel"],
  ["surface_finish", "surfaceTreatment"],
  ["surface_treatment", "surfaceTreatment"],
  ["variant_note", "variantNote"]
]);

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim() || null : value == null ? null : String(value);
}

export function isRecognitionCandidateFormalizationPending(candidate: Pick<RecognitionTransferCandidate, "category" | "reviewState">) {
  if (candidate.category === "identity_relation" || candidate.category === "unclassified") return false;
  return ["proposed", "conflict", "blocked"].includes(candidate.reviewState);
}

export function partPayloadKeyForRecognitionField(fieldKey: string) {
  return FIXED_PART_FIELDS.get(fieldKey) ?? null;
}

export function fixedPartPayloadValue(change: PartRecognitionChange) {
  return change.changeKind === "not_applicable" ? "無" : change.afterValue;
}

export function hasActivePartWorkRecognitionConflict(proposedPayload: Record<string, unknown>, change: PartRecognitionChange) {
  const key = partPayloadKeyForRecognitionField(change.fieldKey);
  if (!key || !(key in proposedPayload)) return false;
  return normalized(proposedPayload[key]) !== normalized(change.beforeValue);
}

export function mergeRecognitionChangesIntoPartWork(input: {
  formalPayload: Record<string, unknown>;
  proposedPayload: Record<string, unknown>;
  changes: PartRecognitionChange[];
}) {
  const merged = { ...input.formalPayload, ...input.proposedPayload };
  for (const change of input.changes) {
    const key = partPayloadKeyForRecognitionField(change.fieldKey);
    if (key) merged[key] = fixedPartPayloadValue(change);
  }
  return merged;
}

export function projectPartRecognitionTransferSummary(input: {
  id: string;
  status: string;
  formalizedAt?: string | null;
  sources?: unknown[];
  candidates?: RecognitionTransferCandidate[];
}, partId: string) {
  const candidates = (input.candidates ?? []).filter((candidate) =>
    candidate.category === "part_attribute"
    && candidate.proposedOwnerType === "part_number"
    && candidate.proposedOwnerId === partId
  );
  const acceptedByField = new Map<string, RecognitionTransferCandidate>();
  for (const candidate of candidates) {
    if (!candidate.fieldKey || !["accepted", "corrected", "mapped"].includes(candidate.reviewState)) continue;
    if (candidate.proposedValue == null) continue;
    acceptedByField.set(candidate.fieldKey, candidate);
  }
  return {
    id: input.id,
    status: input.status,
    formalizedAt: input.formalizedAt ?? null,
    sourceCount: input.sources?.length ?? 0,
    acceptedFieldCount: acceptedByField.size,
    fieldLabels: [...acceptedByField.values()].map((candidate) => candidate.fieldLabel),
    pendingCount: candidates.filter(isRecognitionCandidateFormalizationPending).length
  };
}
