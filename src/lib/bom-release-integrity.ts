import { canonicalSha256, SharedBomError } from "@/lib/bom-shared-structure";
import type { BomReleaseSnapshotDetail } from "@/lib/types";
import { quantityFromScaled6 } from "@/lib/bom-unit-of-measure";

function parseJson(value: unknown, code: string) {
  if (!value) throw new SharedBomError(code, 409);
  // PostgreSQL JSONB columns are materialized by `pg` as objects, while
  // SQLite stores the same evidence as TEXT.  Accept both representations so
  // provider parity does not turn a valid immutable snapshot into a false
  // `BOM_REVIEW_SNAPSHOT_INVALID` read failure.
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new SharedBomError(code, 409);
  }
}

function invalidIntegrity(phase: string, details: Record<string, unknown> = {}): never {
  throw new SharedBomError("BOM_RELEASE_SNAPSHOT_INVALID", 409, { phase, ...details });
}

export function assertSharedReleaseSnapshotIntegrity(
  snapshot: BomReleaseSnapshotDetail,
  reviewSnapshotHash: string | null,
  reviewSnapshotJson?: unknown
) {
  const snapshotSchemaVersion = Number(snapshot.snapshot_schema_version ?? 1);
  if (snapshotSchemaVersion < 2) return;
  if (!snapshot.definition_id || !snapshot.snapshot_hash || !reviewSnapshotHash
    || !snapshot.applicable_parents?.length || !snapshot.resolved_lines) {
    invalidIntegrity("required_evidence");
  }
  const parentSnapshot = parseJson(snapshot.parent_snapshot_json, "BOM_RELEASE_SNAPSHOT_INVALID");
  const mappingSnapshot = parseJson(snapshot.mapping_snapshot_json, "BOM_RELEASE_SNAPSHOT_INVALID");
  const resolvedProjection = parseJson(snapshot.resolved_projection_json, "BOM_RELEASE_SNAPSHOT_INVALID");
  if (!Array.isArray(parentSnapshot) || !Array.isArray(mappingSnapshot) || !Array.isArray(resolvedProjection)) {
    invalidIntegrity("json_shape");
  }
  const relationalParents = [...snapshot.applicable_parents]
    .sort((left, right) => left.selection_order - right.selection_order || left.part_number_id.localeCompare(right.part_number_id, "en"))
    .map((parent) => ({
      partNumberId: parent.part_number_id,
      partNumber: parent.part_number,
      name: parent.part_name,
      selectionOrder: parent.selection_order
    }));
  if (canonicalSha256(parentSnapshot).hash !== canonicalSha256(relationalParents).hash) {
    invalidIntegrity("parent_projection", { frozen: parentSnapshot, relational: relationalParents });
  }
  const logicalOrder = new Map(snapshot.lines.map((line, index) => [line.logical_line_id, index]));
  const actualProjectionHashes = relationalParents.map((parent) => {
    const lines = snapshot.resolved_lines!
      .filter((line) => line.parent_part_number_id === parent.partNumberId)
      .sort((left, right) => (logicalOrder.get(left.logical_line_id) ?? Number.MAX_SAFE_INTEGER)
        - (logicalOrder.get(right.logical_line_id) ?? Number.MAX_SAFE_INTEGER))
      .map((line) => ({
        logicalLineId: line.logical_line_id,
        parentLogicalLineId: line.parent_logical_line_id,
        nodeType: line.node_type,
        childPartNumberId: line.child_part_number_id,
        childPartNumber: line.child_part_number,
        childPartName: line.child_part_name,
        groupName: line.group_name,
        // The v3 authority is scale-6.  SQLite and PostgreSQL adapters may
        // materialize the compatibility `quantity` column differently, so
        // reconstruct it from the exact integer before hashing.
        quantity: snapshotSchemaVersion >= 3
          ? quantityFromScaled6(line.quantity_scaled_6) ?? line.quantity
          : line.quantity,
        ...(snapshotSchemaVersion >= 3 ? { quantityUomCode: line.quantity_uom_code ?? null, quantityScaled6: line.quantity_scaled_6 ?? null } : {}),
        sequenceNo: line.sequence_no,
        level: line.level
      }));
    if (lines.length !== snapshot.lines.length) {
      invalidIntegrity("resolved_line_count", {
        parentPartNumberId: parent.partNumberId,
        expected: snapshot.lines.length,
        actual: lines.length
      });
    }
    return { parentPartNumberId: parent.partNumberId, hash: canonicalSha256(lines).hash, lineCount: lines.length };
  });
  if (canonicalSha256(resolvedProjection).hash !== canonicalSha256(actualProjectionHashes).hash) {
    invalidIntegrity("resolved_projection_hash", { frozen: resolvedProjection, relational: actualProjectionHashes });
  }
  let reviewMaterial: Record<string, unknown> = {};
  if (reviewSnapshotJson) {
    const parsedReview = parseJson(reviewSnapshotJson, "BOM_REVIEW_SNAPSHOT_INVALID");
    if (!parsedReview || typeof parsedReview !== "object" || Array.isArray(parsedReview)) invalidIntegrity("review_snapshot_shape");
    const review = parsedReview as Record<string, unknown>;
    if (review.bomPurpose !== undefined && review.bomPurpose !== snapshot.bom_purpose) {
      invalidIntegrity("purpose_mismatch", { snapshotPurpose: snapshot.bom_purpose, reviewPurpose: review.bomPurpose });
    }
    if (snapshot.bom_purpose === "sales_kit" && review.fulfillmentPolicy !== "explode_components") {
      invalidIntegrity("sales_kit_policy_missing");
    }
    if (review.bomPurpose !== undefined) {
      reviewMaterial = { bomPurpose: snapshot.bom_purpose };
      if (snapshot.bom_purpose === "sales_kit") reviewMaterial.fulfillmentPolicy = "explode_components";
    }
  } else if (snapshot.bom_purpose === "sales_kit") {
    invalidIntegrity("sales_kit_review_snapshot_missing");
  }
  const snapshotEvidence = canonicalSha256({
    schemaVersion: snapshotSchemaVersion,
    definitionId: snapshot.definition_id,
    bomRevision: snapshot.bom_revision,
    reviewSnapshotHash,
    parentSnapshotHash: canonicalSha256(parentSnapshot).hash,
    lineSnapshotHash: canonicalSha256(snapshot.lines).hash,
    mappingSnapshotHash: canonicalSha256(mappingSnapshot).hash,
    resolvedProjectionHash: canonicalSha256(resolvedProjection).hash,
    ...reviewMaterial
  });
  if (snapshotEvidence.hash !== snapshot.snapshot_hash) {
    invalidIntegrity("snapshot_hash", { expected: snapshot.snapshot_hash, actual: snapshotEvidence.hash });
  }
}
