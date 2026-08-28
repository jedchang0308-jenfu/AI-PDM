import crypto from "node:crypto";

function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalJsonValue(nested)])
    );
  }
  return value;
}

export function sha256Canonical(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalJsonValue(value))).digest("hex");
}

export function candidateFingerprint(rows) {
  return sha256Canonical(rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    companyId: row.company_id,
    category: row.category,
    fieldKey: row.field_key,
    proposedValue: row.proposed_value,
    normalizedValue: row.normalized_value,
    proposedOwnerType: row.proposed_owner_type,
    proposedOwnerId: row.proposed_owner_id,
    applicabilityScope: row.applicability_scope,
    variantStatus: row.variant_status,
    reviewState: row.review_state,
    currentFormalValue: row.current_formal_value,
    currentFormalFingerprint: row.current_formal_fingerprint,
    groupKey: row.group_key,
    rowVersion: Number(row.row_version)
  })).sort((left, right) => left.id.localeCompare(right.id)));
}

export function reviewRequestFingerprint(rows) {
  return sha256Canonical(rows.map((row) => ({
    id: row.id,
    snapshotHash: row.snapshot_hash,
    snapshotPayload: row.snapshot_payload
  })).sort((left, right) => left.id.localeCompare(right.id)));
}
