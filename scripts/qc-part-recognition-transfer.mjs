import assert from "node:assert/strict";
import {
  hasActivePartWorkRecognitionConflict,
  isRecognitionCandidateFormalizationPending,
  mergeRecognitionChangesIntoPartWork,
  projectPartRecognitionTransferSummary
} from "../src/lib/part-recognition-transfer.ts";

assert.equal(isRecognitionCandidateFormalizationPending({ category: "identity_relation", reviewState: "proposed" }), false);
assert.equal(isRecognitionCandidateFormalizationPending({ category: "unclassified", reviewState: "conflict" }), false);
assert.equal(isRecognitionCandidateFormalizationPending({ category: "part_attribute", reviewState: "proposed" }), true);
assert.equal(isRecognitionCandidateFormalizationPending({ category: "part_attribute", reviewState: "corrected" }), false);

const materialChange = { fieldKey: "material", beforeValue: null, afterValue: "SUS304", changeKind: "create" };
assert.equal(hasActivePartWorkRecognitionConflict({ partName: "軸承座" }, materialChange), false, "legacy sparse work inherits formal fields");
assert.equal(hasActivePartWorkRecognitionConflict({ materialLabel: null }, materialChange), false, "unchanged work field may be rebased");
assert.equal(hasActivePartWorkRecognitionConflict({ materialLabel: "S45C" }, materialChange), true, "manual edit of same field blocks formalization");

assert.deepEqual(
  mergeRecognitionChangesIntoPartWork({
    formalPayload: { partName: "軸承座", materialLabel: "SUS304", colorLabel: null },
    proposedPayload: { partName: "軸承座_BS", materialLabel: null },
    changes: [materialChange, { fieldKey: "heat_treatment", beforeValue: null, afterValue: "無", changeKind: "create" }]
  }),
  { partName: "軸承座_BS", materialLabel: "SUS304", colorLabel: null },
  "rebase preserves unrelated draft edits and injects only fixed recognized fields"
);

assert.deepEqual(
  projectPartRecognitionTransferSummary({
    id: "session-1",
    status: "review_ready",
    sources: [{}, {}],
    candidates: [
      { category: "identity_relation", fieldKey: "part_number", fieldLabel: "料號", proposedValue: "A0044-P01", proposedOwnerType: "part_number", proposedOwnerId: "part-1", reviewState: "proposed" },
      { category: "part_attribute", fieldKey: "material", fieldLabel: "材質", proposedValue: "SUS304", proposedOwnerType: "part_number", proposedOwnerId: "part-1", reviewState: "corrected" },
      { category: "part_attribute", fieldKey: "heat_treatment", fieldLabel: "熱處理", proposedValue: "無", proposedOwnerType: "part_number", proposedOwnerId: "part-1", reviewState: "corrected" },
      { category: "part_attribute", fieldKey: "color", fieldLabel: "顏色", proposedValue: null, proposedOwnerType: "part_number", proposedOwnerId: "part-1", reviewState: "proposed" },
      { category: "part_attribute", fieldKey: "material", fieldLabel: "材質", proposedValue: "S45C", proposedOwnerType: "part_number", proposedOwnerId: "part-2", reviewState: "corrected" }
    ]
  }, "part-1"),
  {
    id: "session-1", status: "review_ready", formalizedAt: null, sourceCount: 2,
    acceptedFieldCount: 2, fieldLabels: ["材質", "熱處理"], pendingCount: 1
  }
);

console.log("qc-part-recognition-transfer: PASS");
